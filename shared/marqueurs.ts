/**
 * Questions incontournables, piégeuses et « à revoir ».
 *
 * - Incontournable : la question est tombée dans 2 partiels distincts ou plus.
 * - Piégeuse : le cumul des erreurs sur toutes les tentatives atteint 2.
 * - Liste d'erreurs : la question y entre à la première réponse comportant
 *   une erreur et en sort quand elle est réussie à 100 % (0 erreur).
 * - À revoir : une question piégeuse sortie de la liste d'erreurs reste
 *   signalée « à revoir ».
 */
import type { Question, Tentative, TypeErreur } from './types';

export const SEUIL_INCONTOURNABLE = 2;
export const SEUIL_PIEGEUSE = 2;

/** Nombre de partiels distincts dans lesquels la question est tombée. */
export function nbPartiels(question: Pick<Question, 'occurrences'>): number {
  return new Set((question.occurrences ?? []).map((o) => o.partielId)).size;
}

export function estIncontournable(question: Pick<Question, 'occurrences'>): boolean {
  return nbPartiels(question) >= SEUIL_INCONTOURNABLE;
}

export interface EtatQuestion {
  questionId: string;
  nbTentatives: number;
  /** Nombre de tentatives comportant au moins une erreur (fréquence d'erreur). */
  nbEchecs: number;
  /** Somme des erreurs de toutes les tentatives. */
  erreursCumulees: number;
  piegeuse: boolean;
  dansListeErreurs: boolean;
  aRevoir: boolean;
  /** Points de la dernière tentative (0, 0,5 ou 1). */
  derniersPoints: number;
  derniereDate: number;
  /** Date de la dernière tentative comportant une erreur. */
  derniereErreurLe?: number;
  /** Type de la dernière erreur, s'il a été renseigné. */
  dernierTypeErreur?: TypeErreur;
}

type TentativeMin = Pick<Tentative, 'questionId' | 'date' | 'nbErreurs' | 'points' | 'typeErreur'>;

/** État d'une question à partir de ses tentatives (dans un ordre quelconque). */
export function etatQuestion(questionId: string, tentatives: TentativeMin[]): EtatQuestion {
  const triees = [...tentatives].sort((a, b) => a.date - b.date);
  let erreursCumulees = 0;
  let nbEchecs = 0;
  let derniereErreurLe: number | undefined;
  let dernierTypeErreur: TypeErreur | undefined;

  for (const t of triees) {
    erreursCumulees += t.nbErreurs;
    if (t.nbErreurs > 0) {
      nbEchecs += 1;
      derniereErreurLe = t.date;
      dernierTypeErreur = t.typeErreur ?? dernierTypeErreur;
    }
  }

  const derniere = triees[triees.length - 1];
  const piegeuse = erreursCumulees >= SEUIL_PIEGEUSE;
  const dansListeErreurs = !!derniere && derniere.nbErreurs > 0;

  return {
    questionId,
    nbTentatives: triees.length,
    nbEchecs,
    erreursCumulees,
    piegeuse,
    dansListeErreurs,
    aRevoir: piegeuse && !dansListeErreurs,
    derniersPoints: derniere?.points ?? 0,
    derniereDate: derniere?.date ?? 0,
    derniereErreurLe,
    dernierTypeErreur,
  };
}

/** États de toutes les questions tentées, indexés par identifiant de question. */
export function etatsQuestions(tentatives: TentativeMin[]): Map<string, EtatQuestion> {
  const parQuestion = new Map<string, TentativeMin[]>();
  for (const t of tentatives) {
    const liste = parQuestion.get(t.questionId);
    if (liste) liste.push(t);
    else parQuestion.set(t.questionId, [t]);
  }
  const etats = new Map<string, EtatQuestion>();
  for (const [id, liste] of parQuestion) etats.set(id, etatQuestion(id, liste));
  return etats;
}

/**
 * Type d'erreur proposé par défaut après une réponse fausse ; l'utilisateur
 * peut toujours le corriger.
 *  - piège : la question est connue comme piégeuse (pour lui ou par nature) ;
 *  - inattention : il avait déjà réussi cette question, ou a répondu très vite ;
 *  - lacune : dans les autres cas.
 */
export function suggererTypeErreur(params: {
  question: Pick<Question, 'piege'>;
  /** État de la question avant la tentative en cours. */
  etatAvant?: Pick<EtatQuestion, 'piegeuse' | 'nbTentatives' | 'nbEchecs'>;
  dureeMs?: number;
}): TypeErreur {
  const { question, etatAvant, dureeMs } = params;
  if (question.piege || etatAvant?.piegeuse) return 'piege';
  const dejaReussie = !!etatAvant && etatAvant.nbTentatives > etatAvant.nbEchecs;
  if (dejaReussie) return 'inattention';
  if (dureeMs !== undefined && dureeMs < 8000) return 'inattention';
  return 'lacune';
}
