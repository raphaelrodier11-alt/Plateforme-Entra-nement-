/**
 * Assistant « Dr Rodier » côté application : choix des extraits de cours,
 * appel au serveur, enregistrement des conversations et des documents.
 */
import {
  LIBELLE_TYPE_DOCUMENT,
  LIMITES_ASSISTANT,
  assemblerContexte,
  chercherExtraits,
  estDemandeLongue,
  nouvelleDemande,
  titreConversation,
} from '../../shared/assistant';
import type {
  Conversation,
  DemandeDocument,
  DocumentBiblio,
  MessageChat,
  TypeDocument,
} from '../../shared/types';
import { enregistrer, supprimer } from '../db/sync';
import type { Donnees } from '../etat/calcul';
import { ErreurApi, api } from './api';

export class ErreurAssistant extends Error {
  constructor(
    readonly code: 'quota' | 'non_configure' | 'cle_refusee' | 'hors_ligne' | 'indisponible',
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES_ERREUR: Record<ErreurAssistant['code'], string> = {
  quota:
    "Le Dr Rodier a atteint la limite gratuite de questions pour le moment. Réessaie dans quelques minutes (la limite revient chaque jour).",
  non_configure:
    "L'assistant n'est pas encore activé : il manque sa clé Gemini (secret GEMINI_CHAT_KEY sur GitHub).",
  cle_refusee: "Google refuse la clé de l'assistant : vérifie qu'elle est valide et qu'elle vient d'AI Studio.",
  hors_ligne: 'Pas de connexion : le Dr Rodier a besoin d’internet pour répondre.',
  indisponible: 'Le Dr Rodier est momentanément indisponible. Réessaie dans un instant.',
};

export async function assistantDisponible(): Promise<boolean> {
  try {
    const r = await api('/assistant/etat');
    return ((await r.json()) as { disponible: boolean }).disponible;
  } catch {
    return false;
  }
}

async function appeler(corps: Record<string, unknown>): Promise<string> {
  try {
    const r = await api('/assistant', { method: 'POST', body: JSON.stringify(corps) });
    return ((await r.json()) as { texte: string }).texte;
  } catch (erreur) {
    if (erreur instanceof ErreurApi) {
      if (erreur.statut === 429) throw new ErreurAssistant('quota', MESSAGES_ERREUR.quota);
      if (erreur.statut === 503) throw new ErreurAssistant('non_configure', MESSAGES_ERREUR.non_configure);
      if (erreur.statut === 502) throw new ErreurAssistant('indisponible', MESSAGES_ERREUR.indisponible);
      throw new ErreurAssistant('indisponible', MESSAGES_ERREUR.indisponible);
    }
    throw new ErreurAssistant('hors_ligne', MESSAGES_ERREUR.hors_ligne);
  }
}

function nouvelId(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID()}`;
}

export function nouvelleConversation(matiereId?: string): Conversation {
  const maintenant = Date.now();
  return { id: nouvelId('conv'), matiereId, titre: 'Nouvelle conversation', messages: [], creeLe: maintenant, majLe: maintenant };
}

/** Pose une question : le Dr Rodier répond et la conversation est enregistrée. */
export async function poserQuestion(d: Donnees, conversation: Conversation, question: string): Promise<Conversation> {
  const texte = question.trim().slice(0, LIMITES_ASSISTANT.message);
  const matiere = conversation.matiereId ? d.matiereParId.get(conversation.matiereId) : undefined;
  const avant = conversation.messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.texte).join(' ');
  const extraits = chercherExtraits({
    question: texte,
    contexteAvant: avant,
    matiereId: conversation.matiereId,
    chapitres: d.chapitres,
    fiches: d.fiches,
  });

  const maintenant = Date.now();
  const messageQuestion: MessageChat = { role: 'user', texte, instant: maintenant };
  const historique = [...conversation.messages, messageQuestion].slice(-LIMITES_ASSISTANT.messages);

  // La question est enregistrée tout de suite : elle ne se perd pas si la réponse échoue.
  const enCours: Conversation = {
    ...conversation,
    titre: conversation.messages.length === 0 ? titreConversation(texte) : conversation.titre,
    messages: [...conversation.messages, messageQuestion],
    majLe: maintenant,
  };
  await enregistrer('conversations', enCours);

  const reponse = await appeler({
    mode: 'discussion',
    matiere: matiere?.nom,
    contexte: assemblerContexte(extraits),
    messages: historique.map((m) => ({ role: m.role, texte: m.texte })),
  });

  const final: Conversation = {
    ...enCours,
    messages: [
      ...enCours.messages,
      {
        role: 'assistant',
        texte: reponse,
        instant: Date.now(),
        sources: extraits.map((e) => ({ chapitreId: e.chapitreId, titre: e.titre })),
      },
    ],
    majLe: Date.now(),
  };
  await enregistrer('conversations', final);
  return final;
}

export async function supprimerConversation(id: string): Promise<void> {
  await supprimer('conversations', id);
}

export interface ParametresDocument {
  type: TypeDocument;
  sujet: string;
  consignes?: string;
  matiereId?: string;
  chapitreId?: string;
}

/**
 * Crée un document. Court : tout de suite, dans l'app. Long : la demande est
 * mise en file et traitée en arrière-plan par le pipeline.
 */
export async function demanderDocument(
  d: Donnees,
  p: ParametresDocument,
): Promise<{ document?: DocumentBiblio; demande?: DemandeDocument }> {
  const matiere = p.matiereId ? d.matiereParId.get(p.matiereId) : undefined;
  const extraits = chercherExtraits({
    question: `${p.sujet} ${p.consignes ?? ''}`,
    matiereId: p.matiereId,
    chapitres: p.chapitreId ? d.chapitres.filter((c) => c.id === p.chapitreId) : d.chapitres,
    fiches: d.fiches,
  });
  const contexte = assemblerContexte(extraits);
  const maintenant = Date.now();

  if (estDemandeLongue(p.type, p.sujet, p.consignes)) {
    const demande = nouvelleDemande(
      { type: p.type, sujet: p.sujet, consignes: p.consignes, matiereId: p.matiereId, chapitreId: p.chapitreId, contexte },
      maintenant,
      nouvelId('dem'),
    );
    await enregistrer('demandes', demande);
    return { demande };
  }

  const consigne = `${LIBELLE_TYPE_DOCUMENT[p.type]} sur : ${p.sujet}${p.consignes ? `\nConsignes : ${p.consignes}` : ''}`;
  const texte = await appeler({
    mode: 'document',
    type: p.type,
    matiere: matiere?.nom,
    contexte,
    messages: [{ role: 'user', texte: consigne }],
  });
  const document: DocumentBiblio = {
    id: nouvelId('doc'),
    titre: p.sujet.length > 70 ? `${p.sujet.slice(0, 69)}…` : p.sujet,
    type: p.type,
    matiereId: p.matiereId,
    chapitreId: p.chapitreId,
    contenu: texte,
    creeLe: Date.now(),
    origine: 'instantane',
  };
  await enregistrer('documents', document);
  return { document };
}

export async function supprimerDocument(id: string): Promise<void> {
  await supprimer('documents', id);
}
