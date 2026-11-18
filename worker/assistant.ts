/**
 * Relais vers Gemini pour l'assistant (discussion et documents courts).
 *
 * L'app prépare les extraits de cours sur l'appareil ; le serveur ne fait que
 * relayer la demande avec la clé dédiée à l'assistant (GEMINI_CHAT_KEY, un
 * projet Google gratuit distinct de celui de l'import : le bot ne ralentit
 * jamais l'import, et inversement).
 */
import { Hono } from 'hono';
import { LIMITES_ASSISTANT, systemeDiscussion, systemeDocument, systemeExplicationErreur, systemeInterro, systemeScene3D } from '../shared/assistant';
import { choisirModele } from '../shared/modeles';
import type { TypeDocument } from '../shared/types';
import type { Env, Role } from './env';

type Contexte = { Bindings: Env; Variables: { role: Role } };

export const assistant = new Hono<Contexte>();

const API = 'https://generativelanguage.googleapis.com/v1beta';
const TYPES: TypeDocument[] = ['fiche', 'resume', 'qcm', 'flashcards', 'libre', 'scene3d'];

let modeleEnCache: { nom: string; jusqua: number } | undefined;

async function modele(cle: string): Promise<string> {
  if (modeleEnCache && modeleEnCache.jusqua > Date.now()) return modeleEnCache.nom;
  const reponse = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': cle } });
  if (!reponse.ok) throw Object.assign(new Error('liste des modèles'), { statut: reponse.status });
  const { models = [] } = (await reponse.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const noms = models.filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name);
  const nom = choisirModele(noms, 'flash');
  if (!nom) throw new Error('aucun modèle disponible');
  modeleEnCache = { nom, jusqua: Date.now() + 6 * 3_600_000 };
  return nom;
}

interface MessageEntrant {
  role: 'user' | 'assistant';
  texte: string;
}

function messagesValides(valeur: unknown): MessageEntrant[] | undefined {
  if (!Array.isArray(valeur) || valeur.length === 0 || valeur.length > LIMITES_ASSISTANT.messages) return undefined;
  const messages: MessageEntrant[] = [];
  for (const m of valeur as Record<string, unknown>[]) {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m.texte !== 'string') return undefined;
    if (m.texte.length === 0 || m.texte.length > LIMITES_ASSISTANT.message) return undefined;
    messages.push({ role: m.role, texte: m.texte });
  }
  return messages[messages.length - 1].role === 'user' ? messages : undefined;
}

assistant.get('/etat', (c) => c.json({ disponible: !!c.env.GEMINI_CHAT_KEY }));

assistant.post('/', async (c) => {
  const cle = c.env.GEMINI_CHAT_KEY;
  if (!cle) return c.json({ erreur: 'non_configure' }, 503);

  const corps = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const messages = messagesValides(corps.messages);
  const contexte = typeof corps.contexte === 'string' ? corps.contexte : '';
  const matiere = typeof corps.matiere === 'string' ? corps.matiere.slice(0, 120) : undefined;
  const mode = corps.mode === 'document' ? 'document' : corps.mode === 'scene3d' ? 'scene3d' : corps.mode === 'interro' ? 'interro' : corps.mode === 'explication' ? 'explication' : 'discussion';
  const nbQuestions = Math.min(20, Math.max(3, Number(corps.nbQuestions) || 5));
  const type = TYPES.includes(corps.type as TypeDocument) ? (corps.type as TypeDocument) : 'libre';
  if (!messages || contexte.length > LIMITES_ASSISTANT.contexte + 2_000) return c.json({ erreur: 'demande_invalide' }, 400);

  // Les extraits de cours sont joints au dernier message de l'étudiant.
  const dernier = messages.length - 1;
  const contenus = messages.map((m, i) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [
      {
        text:
          i === dernier && contexte
            ? `<cours>\n${contexte}\n</cours>\n\n${m.texte}`
            : i === dernier
              ? `(Aucun extrait de cours ne correspond à cette demande.)\n\n${m.texte}`
              : m.texte,
      },
    ],
  }));

  try {
    const nom = await modele(cle);
    const reponse = await fetch(`${API}/models/${nom}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                mode === 'scene3d' ? systemeScene3D(matiere) : mode === 'interro' ? systemeInterro(matiere, nbQuestions) : mode === 'explication' ? systemeExplicationErreur(matiere) : mode === 'document' ? systemeDocument(type, matiere) : systemeDiscussion(matiere),
            },
          ],
        },
        contents: contenus,
        generationConfig: {
          temperature: mode === 'discussion' ? 0.5 : 0.3,
          maxOutputTokens: mode === 'document' ? 12_000 : mode === 'scene3d' ? 8_000 : mode === 'explication' ? 5_000 : 3_000,
          ...(mode === 'scene3d' ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (reponse.status === 429) return c.json({ erreur: 'quota' }, 429);
    if (reponse.status === 400 || reponse.status === 403) return c.json({ erreur: 'cle_refusee' }, 502);
    if (!reponse.ok) return c.json({ erreur: 'indisponible' }, 502);
    const donnees = (await reponse.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const texte = (donnees.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    if (!texte) return c.json({ erreur: 'reponse_vide' }, 502);
    return c.json({ texte, modele: nom });
  } catch (erreur) {
    const statut = (erreur as { statut?: number }).statut;
    if (statut === 429) return c.json({ erreur: 'quota' }, 429);
    if (statut === 400 || statut === 403) return c.json({ erreur: 'cle_refusee' }, 502);
    return c.json({ erreur: 'indisponible' }, 502);
  }
});
