/**
 * Dépôt de fichiers : l'app envoie un fichier en morceaux, le serveur les
 * garde dans la base jusqu'à ce que le pipeline les lise.
 *
 * Les morceaux sont du texte en base64 produit par le navigateur : le serveur
 * ne fait aucun calcul dessus (la limite de temps de calcul de l'offre
 * gratuite est très courte) et les range tels quels.
 *
 * Un nouvel envoi d'un fichier du même nom remplace l'ancien : chaque envoi a
 * un numéro de version, et l'ancienne version n'est effacée qu'une fois la
 * nouvelle complète, donc le pipeline ne tombe jamais sur un fichier à moitié
 * remplacé.
 */
import { Hono } from 'hono';
import { MORCEAUX_MAX, TAILLE_MAX_CHEMIN, TAILLE_MAX_FICHIER, mimeDepuisNom } from '../shared/depot';
import type { Depot, RoleDepot } from '../shared/types';
import { instructionEcriture, lireDoc } from './docs';
import type { Env, Role } from './env';

type Contexte = { Bindings: Env; Variables: { role: Role } };

/** Longueur maximale d'un morceau en base64 (600 000 octets → 800 000 caractères). */
const LONGUEUR_MAX = 1_000_000;
const FORMAT_ID = /^[A-Za-z0-9-]{8,64}$/;

function roleValide(v: unknown): v is RoleDepot {
  return v === 'cours' || v === 'annales' || v === 'anciens';
}

/** Chemin envoyé par l'app, ou à défaut le simple nom du fichier. */
function cheminDe(corps: Record<string, unknown>, nom: string): string {
  const chemin = typeof corps.chemin === 'string' ? corps.chemin.trim() : '';
  return (chemin || nom).slice(0, TAILLE_MAX_CHEMIN);
}

function entierPositif(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export const depot = new Hono<Contexte>();

/** Annonce un envoi : renvoie l'identifiant du fichier et le numéro de cette version. */
depot.post('/commencer', async (c) => {
  const corps = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const nom = typeof corps.nom === 'string' ? corps.nom.trim().slice(0, 200) : '';
  const taille = Number(corps.taille);
  if (!nom || !roleValide(corps.role) || !Number.isFinite(taille) || taille <= 0) {
    return c.json({ erreur: 'envoi_invalide' }, 400);
  }
  if (taille > TAILLE_MAX_FICHIER) return c.json({ erreur: 'fichier_trop_gros' }, 413);
  if (!mimeDepuisNom(nom)) return c.json({ erreur: 'format_non_pris_en_charge' }, 415);

  // Même chemin et même rôle : c'est une nouvelle version du même fichier.
  const existant = await c.env.DB
    .prepare(
      `SELECT id FROM docs
       WHERE collection = 'depots' AND deleted = 0
         AND COALESCE(json_extract(data, '$.chemin'), json_extract(data, '$.nom')) = ?1
         AND json_extract(data, '$.role') = ?2`,
    )
    .bind(cheminDe(corps, nom), corps.role)
    .first<{ id: string }>();
  return c.json({ id: existant?.id ?? crypto.randomUUID(), v: Date.now() });
});

/** Range un morceau (texte base64). */
depot.put('/:id/:v/:n', async (c) => {
  const { id } = c.req.param();
  const v = entierPositif(c.req.param('v'));
  const n = entierPositif(c.req.param('n'));
  if (!FORMAT_ID.test(id) || v === undefined || n === undefined || n >= MORCEAUX_MAX) {
    return c.json({ erreur: 'morceau_invalide' }, 400);
  }
  const texte = await c.req.text();
  if (!texte || texte.length > LONGUEUR_MAX) return c.json({ erreur: 'morceau_invalide' }, 413);
  await c.env.DB
    .prepare('INSERT OR REPLACE INTO depot_morceaux (id, v, n, data) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, v, n, texte)
    .run();
  return c.json({ ok: true });
});

/** Valide l'envoi : tous les morceaux sont là, la fiche du fichier est publiée. */
depot.post('/:id/:v/terminer', async (c) => {
  const { id } = c.req.param();
  const v = entierPositif(c.req.param('v'));
  const corps = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const nom = typeof corps.nom === 'string' ? corps.nom.trim().slice(0, 200) : '';
  const morceaux = Number(corps.morceaux);
  const taille = Number(corps.taille);
  if (
    !FORMAT_ID.test(id) || v === undefined || !nom || !roleValide(corps.role) ||
    !Number.isInteger(morceaux) || morceaux < 1 || morceaux > MORCEAUX_MAX ||
    !Number.isFinite(taille) || taille <= 0 || taille > TAILLE_MAX_FICHIER
  ) {
    return c.json({ erreur: 'envoi_invalide' }, 400);
  }
  const mimeType = mimeDepuisNom(nom, typeof corps.mimeType === 'string' ? corps.mimeType : undefined);
  if (!mimeType) return c.json({ erreur: 'format_non_pris_en_charge' }, 415);

  const present = await c.env.DB
    .prepare('SELECT COUNT(*) AS n FROM depot_morceaux WHERE id = ?1 AND v = ?2 AND n < ?3')
    .bind(id, v, morceaux)
    .first<{ n: number }>();
  if (present?.n !== morceaux) return c.json({ erreur: 'morceaux_manquants' }, 409);

  const ancien = await lireDoc<Depot>(c.env.DB, 'depots', id);
  const fiche: Depot = {
    id,
    nom,
    chemin: cheminDe(corps, nom),
    role: corps.role,
    mimeType,
    taille,
    morceaux,
    v,
    ajouteLe: ancien?.ajouteLe ?? Date.now(),
    modifieLe: new Date(v).toISOString(),
  };
  await c.env.DB.batch([
    instructionEcriture(c.env.DB, { collection: 'depots', id, data: fiche, majLe: Date.now() }),
    c.env.DB.prepare('DELETE FROM depot_morceaux WHERE id = ?1 AND v != ?2').bind(id, v),
  ]);
  return c.json(fiche);
});

/** Retire un fichier : son contenu est effacé, le contenu déjà généré est conservé. */
depot.delete('/:id', async (c) => {
  const { id } = c.req.param();
  if (!FORMAT_ID.test(id)) return c.json({ erreur: 'envoi_invalide' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM depot_morceaux WHERE id = ?1').bind(id),
    instructionEcriture(c.env.DB, { collection: 'depots', id, majLe: Date.now(), supprime: true }),
  ]);
  return c.json({ ok: true });
});

/** Réservé au pipeline : un morceau de la version actuelle du fichier. */
export const depotAdmin = new Hono<Contexte>();

depotAdmin.get('/:id/:n', async (c) => {
  const { id } = c.req.param();
  const n = entierPositif(c.req.param('n'));
  if (!FORMAT_ID.test(id) || n === undefined) return c.json({ erreur: 'morceau_invalide' }, 400);
  const fiche = await lireDoc<Depot>(c.env.DB, 'depots', id);
  if (!fiche) return c.json({ erreur: 'introuvable' }, 404);
  const ligne = await c.env.DB
    .prepare('SELECT data FROM depot_morceaux WHERE id = ?1 AND v = ?2 AND n = ?3')
    .bind(id, fiche.v, n)
    .first<{ data: string }>();
  if (!ligne) return c.json({ erreur: 'introuvable' }, 404);
  return c.body(ligne.data, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});
