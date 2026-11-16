/**
 * API de Dr Rodier (Cloudflare Worker).
 *
 * Le Worker sert les fichiers de l'application et expose sous /api :
 *  - la synchronisation des documents (tirer / pousser) ;
 *  - la création du lien secret à la première ouverture ;
 *  - la connexion à Google Drive et le relais du calendrier .ics ;
 *  - les points d'entrée réservés au pipeline (/api/admin).
 */
import { Hono } from 'hono';
import { estCollection, type DocSync } from '../shared/collections';
import { urlIcsEnHttps } from '../shared/ics';
import type { Decision, Reglages } from '../shared/types';
import {
  accesConfigure,
  cleDeLaRequete,
  configurerAcces,
  reinitialiserAcces,
  roleDeLaCle,
} from './acces';
import { appliquerDecision } from './decisions';
import { LIMITE_POUSSEE, LIMITE_TIRAGE, lireDoc, pousser, tirer } from './docs';
import {
  deconnecterDrive,
  driveConfigurable,
  driveConnecte,
  jetonAcces,
  terminerAutorisation,
  urlAutorisation,
  urlRetour,
} from './drive';
import type { Env, Role } from './env';
import { assurerSchema } from './schema';

type Contexte = { Bindings: Env; Variables: { role: Role } };

const app = new Hono<Contexte>();
const TAILLE_ICS_MAX = 8_000_000;

app.use('/api/*', async (c, suite) => {
  await assurerSchema(c.env.DB);
  c.header('Cache-Control', 'no-store');
  await suite();
});

// --- Points d'entrée publics -----------------------------------------------

app.get('/api/etat', async (c) =>
  c.json({ configure: await accesConfigure(c.env), version: 1 }),
);

/** Première ouverture : l'appareil enregistre la clé qu'il vient de créer. */
app.post('/api/configurer', async (c) => {
  const corps = (await c.req.json().catch(() => ({}))) as { cle?: unknown };
  const cle = typeof corps.cle === 'string' ? corps.cle : '';
  if (cle.length < 32 || cle.length > 200) return c.json({ erreur: 'cle_invalide' }, 400);
  const ok = await configurerAcces(c.env, cle);
  return ok ? c.json({ ok: true }) : c.json({ erreur: 'deja_configure' }, 409);
});

/** Retour de Google après autorisation ; protégé par le paramètre `state`. */
app.get('/api/drive/retour', async (c) => {
  const origine = new URL(c.req.url).origin;
  const code = c.req.query('code');
  const etat = c.req.query('state');
  const ok =
    !!code && !!etat && driveConfigurable(c.env)
      ? await terminerAutorisation(c.env, origine, code, etat)
      : false;
  return c.redirect(`/reglages?drive=${ok ? 'ok' : 'erreur'}`);
});

// --- Authentification ------------------------------------------------------

app.use('/api/*', async (c, suite) => {
  const role = await roleDeLaCle(c.env, cleDeLaRequete(c.req.raw));
  if (!role) return c.json({ erreur: 'non_autorise' }, 401);
  c.set('role', role);
  await suite();
});

app.use('/api/admin/*', async (c, suite) => {
  if (c.get('role') !== 'pipeline') return c.json({ erreur: 'interdit' }, 403);
  await suite();
});

// --- Synchronisation -------------------------------------------------------

app.get('/api/sync/tirer', async (c) => {
  const depuis = Number(c.req.query('depuis') ?? 0) || 0;
  const limite = Number(c.req.query('limite') ?? LIMITE_TIRAGE) || LIMITE_TIRAGE;
  const corps = await tirer(c.env.DB, 'app', depuis, limite);
  return c.body(corps, 200, { 'Content-Type': 'application/json' });
});

app.post('/api/sync/pousser', async (c) => {
  const corps = (await c.req.json().catch(() => ({}))) as { docs?: unknown };
  const docs = Array.isArray(corps.docs) ? (corps.docs as DocSync[]) : [];
  if (docs.length > LIMITE_POUSSEE) return c.json({ erreur: 'trop_de_documents' }, 413);
  const retenus = await pousser(c.env.DB, c.get('role'), docs);
  for (const doc of retenus) {
    if (doc.collection === 'decisions' && !doc.supprime && doc.data) {
      await appliquerDecision(c.env.DB, doc.data as Decision);
    }
  }
  return c.json({ acceptes: retenus.length });
});

// --- Calendrier ------------------------------------------------------------

/**
 * Relais du calendrier public iCloud : le navigateur ne peut pas le lire
 * directement (pas d'en-têtes CORS). Seule l'adresse enregistrée dans les
 * réglages peut être relayée.
 */
app.get('/api/calendrier/ics', async (c) => {
  const reglages = await lireDoc<Reglages>(c.env.DB, 'reglages', 'principal');
  if (!reglages?.icsUrl) return c.json({ erreur: 'calendrier_non_configure' }, 404);
  let url: URL;
  try {
    url = new URL(urlIcsEnHttps(reglages.icsUrl));
  } catch {
    return c.json({ erreur: 'lien_invalide' }, 400);
  }
  if (url.protocol !== 'https:') return c.json({ erreur: 'lien_invalide' }, 400);

  const reponse = await fetch(url.toString(), { headers: { Accept: 'text/calendar' } });
  if (!reponse.ok) return c.json({ erreur: 'calendrier_inaccessible', statut: reponse.status }, 502);
  const texte = await reponse.text();
  if (texte.length > TAILLE_ICS_MAX) return c.json({ erreur: 'calendrier_trop_volumineux' }, 502);
  return c.body(texte, 200, { 'Content-Type': 'text/calendar; charset=utf-8' });
});

// --- Google Drive ----------------------------------------------------------

app.get('/api/drive/statut', async (c) => {
  const origine = new URL(c.req.url).origin;
  return c.json({
    configurable: driveConfigurable(c.env),
    connecte: await driveConnecte(c.env),
    urlRetour: urlRetour(origine),
  });
});

app.post('/api/drive/connexion', async (c) => {
  if (!driveConfigurable(c.env)) return c.json({ erreur: 'google_non_configure' }, 400);
  const origine = new URL(c.req.url).origin;
  return c.json({ url: await urlAutorisation(c.env, origine) });
});

app.post('/api/drive/deconnexion', async (c) => {
  await deconnecterDrive(c.env);
  return c.json({ ok: true });
});

// --- Pipeline --------------------------------------------------------------

/**
 * Lance le pipeline sans attendre son prochain passage. Facultatif : sans
 * jeton GitHub, le pipeline traitera la demande à son passage horaire.
 */
app.post('/api/pipeline/lancer', async (c) => {
  const { GITHUB_DISPATCH_TOKEN: jeton, GITHUB_REPO: depot } = c.env;
  if (!jeton || !depot) return c.json({ declenche: false });
  const reponse = await fetch(
    `https://api.github.com/repos/${depot}/actions/workflows/pipeline.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dr-rodier',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: c.env.GITHUB_BRANCHE || 'main' }),
    },
  );
  return c.json({ declenche: reponse.ok });
});

app.get('/api/admin/docs', async (c) => {
  const depuis = Number(c.req.query('depuis') ?? 0) || 0;
  const limite = Number(c.req.query('limite') ?? LIMITE_TIRAGE) || LIMITE_TIRAGE;
  const collection = c.req.query('collection');
  if (collection && !estCollection(collection)) return c.json({ erreur: 'collection_inconnue' }, 400);
  const corps = await tirer(
    c.env.DB,
    'pipeline',
    depuis,
    limite,
    collection && estCollection(collection) ? collection : undefined,
  );
  return c.body(corps, 200, { 'Content-Type': 'application/json' });
});

app.post('/api/admin/docs', async (c) => {
  const corps = (await c.req.json().catch(() => ({}))) as { docs?: unknown };
  const docs = Array.isArray(corps.docs) ? (corps.docs as DocSync[]) : [];
  if (docs.length > LIMITE_POUSSEE) return c.json({ erreur: 'trop_de_documents' }, 413);
  const retenus = await pousser(c.env.DB, 'pipeline', docs);
  return c.json({ acceptes: retenus.length });
});

app.post('/api/admin/drive/jeton', async (c) => {
  const jeton = await jetonAcces(c.env);
  return jeton ? c.json(jeton) : c.json({ erreur: 'drive_non_connecte' }, 404);
});

/** Lien secret perdu : l'app repasse en « première ouverture ». */
app.post('/api/admin/reinitialiser-acces', async (c) => {
  await reinitialiserAcces(c.env);
  return c.json({ ok: true });
});

app.all('/api/*', (c) => c.json({ erreur: 'introuvable' }, 404));

app.onError((erreur, c) => {
  console.error('Erreur API', erreur.message);
  return c.json({ erreur: 'erreur_interne' }, 500);
});

export default app;
