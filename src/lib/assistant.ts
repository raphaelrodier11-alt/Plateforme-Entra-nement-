/**
 * Assistant « Dr Rodier » côté application : choix des extraits de cours,
 * appel au serveur, enregistrement des conversations et des documents.
 */
import { validerScene } from '../../pipeline/validation';
import {
  DEPART_INTERRO,
  demandeUneScene3D,
  LIBELLE_TYPE_DOCUMENT,
  LIMITES_ASSISTANT,
  assemblerContexte,
  chercherExtraits,
  estDemandeLongue,
  nouvelleDemande,
  titreConversation,
} from '../../shared/assistant';
import type {
  ExplicationDetaillee,
  Scene3D,
  Question,
  ReponseDonnee,
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
export async function poserQuestion(
  d: Donnees,
  conversation: Conversation,
  question: string,
  options: { contexteExtra?: string; etiquette?: string } = {},
): Promise<Conversation> {
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
    ...(options.etiquette && !conversation.contexte ? { contexte: options.etiquette } : {}),
    majLe: maintenant,
  };
  await enregistrer('conversations', enCours);

  // « Montre-moi … en 3D » : le Dr Rodier compose une animation, rangée aussi dans la bibliothèque.
  if (demandeUneScene3D(texte)) {
    const { scene } = await creerDocumentScene(d, { sujet: texte, matiereId: conversation.matiereId });
    const finale: Conversation = {
      ...enCours,
      messages: [
        ...enCours.messages,
        {
          role: 'assistant',
          texte: `Voilà ton animation 3D : **${scene.titre}**. Fais-la tourner du doigt et avance étape par étape. Je l'ai aussi rangée dans ta bibliothèque.`,
          instant: Date.now(),
          scene,
          sources: extraits.map((e) => ({ chapitreId: e.chapitreId, titre: e.titre })),
        },
      ],
      majLe: Date.now(),
    };
    await enregistrer('conversations', finale);
    return finale;
  }

  const reponse = await appeler({
    mode: 'discussion',
    matiere: matiere?.nom,
    contexte: `${options.contexteExtra ? `=== CE QUE L'ÉTUDIANT A SOUS LES YEUX ===\n${options.contexteExtra.slice(0, 6000)}\n\n=== EXTRAITS DE SES COURS ===\n` : ''}${assemblerContexte(extraits)}`,
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
  if (p.type === 'scene3d') {
    const { document } = await creerDocumentScene(d, { sujet: `${p.sujet}${p.consignes ? ` (${p.consignes})` : ''}`, matiereId: p.matiereId, chapitreId: p.chapitreId });
    return { document };
  }
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

/** Texte décrivant une question et la réponse donnée, pour demander au bot d'expliquer l'erreur. */
export function demandeExplication(question: Question, reponse: ReponseDonnee): string {
  const lettre = (i: number) => String.fromCharCode(65 + i);
  const lignes: string[] = [`Explique-moi mon erreur à cette question${question.piege ? ' (un piège classique)' : ''} :`, '', question.enonce];
  if (question.propositions?.length) {
    lignes.push('');
    question.propositions.forEach((p, i) => lignes.push(`${lettre(i)}. ${p.texte}`));
    const cochees = (reponse.cochees ?? []).map((id) => question.propositions!.findIndex((p) => p.id === id)).filter((i) => i >= 0);
    const justes = question.propositions.map((p, i) => (p.correcte ? i : -1)).filter((i) => i >= 0);
    if (question.type === 'vrai_faux') {
      const jugements = reponse.jugements ?? {};
      lignes.push('', `Mes réponses (vrai/faux) : ${question.propositions.map((p, i) => `${lettre(i)} = ${jugements[p.id] === undefined ? 'pas répondu' : jugements[p.id] ? 'vrai' : 'faux'}`).join(', ')}`);
      lignes.push(`Réponses justes : ${question.propositions.map((p, i) => `${lettre(i)} = ${p.correcte ? 'vrai' : 'faux'}`).join(', ')}`);
    } else {
      lignes.push('', `J'ai coché : ${cochees.length ? cochees.map(lettre).join(', ') : 'rien'}`, `Les bonnes réponses : ${justes.map(lettre).join(', ')}`);
    }
  } else if (question.trous?.length) {
    lignes.push('', `Mes réponses : ${question.trous.map((t) => `${t.id} = ${reponse.textes?.[t.id] ?? '—'}`).join(' ; ')}`, `Attendu : ${question.trous.map((t) => `${t.id} = ${t.reponses[0] ?? ''}`).join(' ; ')}`);
  }
  if (question.explication) lignes.push('', `Explication fournie : ${question.explication}`);
  lignes.push('', 'Donne-moi une explication détaillée et justifiée : le raisonnement pour chaque proposition, pourquoi je me suis trompé, et comment ne plus tomber dans ce piège.');
  return lignes.join('\n');
}

function lireJson(texte: string): unknown {
  return JSON.parse(texte.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

/** Demande une animation 3D ; une scène invalide est redemandée une fois. */
export async function creerScene3D(
  d: Donnees,
  p: { sujet: string; matiereId?: string; chapitreId?: string },
): Promise<Scene3D> {
  const matiere = p.matiereId ? d.matiereParId.get(p.matiereId) : undefined;
  const extraits = chercherExtraits({
    question: p.sujet,
    matiereId: p.matiereId,
    chapitres: p.chapitreId ? d.chapitres.filter((c) => c.id === p.chapitreId) : d.chapitres,
    fiches: d.fiches,
  });
  const corps = {
    mode: 'scene3d',
    matiere: matiere?.nom,
    contexte: assemblerContexte(extraits),
    messages: [{ role: 'user', texte: `Crée une animation 3D de : ${p.sujet}` }],
  };
  for (let essai = 0; essai < 2; essai++) {
    const brut = await appeler(corps);
    try {
      const scene = validerScene(lireJson(brut));
      if (scene && scene.objets.length >= 2 && scene.etapes.length >= 1) return scene;
    } catch {
      // Réponse illisible : un second essai.
    }
  }
  throw new ErreurAssistant('indisponible', "Je n'ai pas réussi à composer cette animation. Reformule ou précise le sujet.");
}

/** Crée l'animation et la range dans la bibliothèque. */
export async function creerDocumentScene(
  d: Donnees,
  p: { sujet: string; matiereId?: string; chapitreId?: string },
): Promise<{ scene: Scene3D; document: DocumentBiblio }> {
  const scene = await creerScene3D(d, p);
  const document: DocumentBiblio = {
    id: nouvelId('doc'),
    titre: scene.titre || p.sujet.slice(0, 70),
    type: 'scene3d',
    matiereId: p.matiereId,
    chapitreId: p.chapitreId,
    contenu: scene.description ?? '',
    scene,
    creeLe: Date.now(),
    origine: 'instantane',
  };
  await enregistrer('documents', document);
  return { scene, document };
}

/** Nouvelle interrogation orale sur une matière (et un chapitre si précisé). */
export function nouvelleInterro(matiereId: string | undefined, chapitreId: string | undefined, nbQuestions: number): Conversation {
  return { ...nouvelleConversation(matiereId), titre: 'Interro orale', interro: { chapitreId, nbQuestions } };
}

/**
 * Un tour d'interrogation : sans texte, l'examinateur pose la première question ;
 * sinon il corrige la réponse, note, et enchaîne.
 */
export async function tourInterro(d: Donnees, conversation: Conversation, reponse?: string): Promise<Conversation> {
  const interro = conversation.interro;
  if (!interro) throw new Error('Conversation sans interrogation');
  const matiere = conversation.matiereId ? d.matiereParId.get(conversation.matiereId) : undefined;
  const maintenant = Date.now();
  const message: MessageChat = reponse
    ? { role: 'user', texte: reponse.trim().slice(0, LIMITES_ASSISTANT.message), instant: maintenant }
    : { role: 'user', texte: DEPART_INTERRO, instant: maintenant, masque: true };
  const apresQuestion: Conversation = { ...conversation, messages: [...conversation.messages, message], majLe: maintenant };
  await enregistrer('conversations', apresQuestion);

  // Les extraits du cours interrogé accompagnent chaque tour : l'examinateur reste fidèle au cours.
  const chapitres = interro.chapitreId ? d.chapitres.filter((c) => c.id === interro.chapitreId) : d.chapitres.filter((c) => !conversation.matiereId || c.matiereId === conversation.matiereId);
  const choisis = interro.chapitreId
    ? chapitres
    : [...chapitres].sort(() => 0.5 - Math.random()).slice(0, 3);
  const extraits = chercherExtraits({
    question: choisis.map((c) => c.titre).join(' '),
    matiereId: conversation.matiereId,
    chapitres: choisis,
    fiches: d.fiches,
  });

  const texte = await appeler({
    mode: 'interro',
    matiere: matiere?.nom,
    nbQuestions: interro.nbQuestions,
    contexte: assemblerContexte(extraits),
    messages: apresQuestion.messages.slice(-LIMITES_ASSISTANT.messages).map((m) => ({ role: m.role, texte: m.texte })),
  });
  const final: Conversation = {
    ...apresQuestion,
    messages: [...apresQuestion.messages, { role: 'assistant', texte, instant: Date.now(), sources: extraits.map((e) => ({ chapitreId: e.chapitreId, titre: e.titre })) }],
    majLe: Date.now(),
  };
  await enregistrer('conversations', final);
  return final;
}

/** Explication détaillée d'une question (cours et connaissances générales), enregistrée avec elle. */
export async function expliquerQuestion(d: Donnees, question: Question, reponse: ReponseDonnee = {}): Promise<string> {
  const matiere = d.matiereParId.get(question.matiereId);
  const chapitre = d.chapitreParId.get(question.chapitreId);
  const extraits = chercherExtraits({
    question: `${question.enonce} ${(question.propositions ?? []).map((p) => p.texte).join(' ')}`,
    matiereId: question.matiereId,
    chapitres: chapitre ? [chapitre, ...d.chapitres.filter((c) => c.matiereId === question.matiereId && c.id !== chapitre.id)] : d.chapitres,
    fiches: d.fiches,
  });
  const texte = await appeler({
    mode: 'explication',
    matiere: matiere?.nom,
    contexte: assemblerContexte(extraits),
    messages: [{ role: 'user', texte: demandeExplication(question, reponse) }],
  });
  await enregistrer<ExplicationDetaillee>('explications', { id: question.id, texte, majLe: Date.now() });
  return texte;
}

/**
 * Explique à la suite toutes les questions données (une requête chacune). S'arrête proprement
 * quand le quota est atteint ; ce qui est déjà expliqué est conservé.
 */
export async function expliquerToutes(
  d: Donnees,
  questions: Question[],
  progression: (faites: number, total: number) => void,
  annule: () => boolean,
): Promise<{ faites: number; erreur?: string }> {
  let faites = 0;
  for (const q of questions) {
    if (annule()) break;
    try {
      await expliquerQuestion(d, q);
      faites += 1;
      progression(faites, questions.length);
    } catch (e) {
      return { faites, erreur: e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue.' };
    }
  }
  return { faites };
}

/** Ce que l'étudiant a sous les yeux sur une correction : question, propositions, sa réponse, les bonnes réponses. */
export function descriptionQuestion(question: Question, reponse: ReponseDonnee | undefined): string {
  const lettre = (i: number) => String.fromCharCode(65 + i);
  const l: string[] = [`Question : ${question.enonce}`];
  if (question.propositions?.length) {
    question.propositions.forEach((p, i) => l.push(`${lettre(i)}. ${p.texte}${p.correcte ? '  (juste)' : ''}`));
    if (reponse) {
      const cochees = question.type === 'vrai_faux'
        ? question.propositions.map((p, i) => (reponse.jugements?.[p.id] === undefined ? '' : `${lettre(i)}=${reponse.jugements[p.id] ? 'vrai' : 'faux'}`)).filter(Boolean)
        : question.propositions.map((p, i) => ((reponse.cochees ?? []).includes(p.id) ? lettre(i) : '')).filter(Boolean);
      l.push(`Réponse de l'étudiant : ${cochees.join(', ') || 'aucune'}`);
    }
  } else if (question.trous?.length) {
    l.push(`Attendu : ${question.trous.map((t) => `${t.id} = ${t.reponses[0] ?? ''}`).join(' ; ')}`);
    if (reponse?.textes) l.push(`Réponse de l'étudiant : ${Object.entries(reponse.textes).map(([k, v]) => `${k} = ${v}`).join(' ; ')}`);
  }
  if (question.explication) l.push(`Explication du corrigé : ${question.explication}`);
  if (question.rappel) l.push(`Rappel de cours : ${question.rappel}`);
  return l.join('\n');
}
