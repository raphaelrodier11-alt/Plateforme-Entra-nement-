/**
 * Détection des questions récurrentes dans les annales.
 *
 * Deux questions extraites de partiels différents sont considérées comme la
 * même question quand leurs textes (énoncé + propositions) sont très proches.
 * Les questions regroupées sont fusionnées en une seule, qui porte la liste
 * de ses occurrences ; c'est cette liste qui détermine les incontournables.
 */
import type { OccurrenceAnnale } from './types';

const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'l', 'et', 'ou', 'a',
  'au', 'aux', 'en', 'est', 'sont', 'qui', 'que', 'quelle', 'quelles', 'quel',
  'quels', 'parmi', 'suivantes', 'suivants', 'proposition', 'propositions',
  'concernant', 'dans', 'par', 'pour', 'sur', 'se', 'ce', 'cette', 'ces',
  'exacte', 'exactes', 'vraie', 'vraies', 'juste', 'justes', 'reponse',
  'reponses', 'cochez', 'indiquez',
]);

/** Mots significatifs d'un texte, sans accents ni ponctuation. */
export function motsSignificatifs(texte: string): string[] {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((mot) => mot.length > 1 && !MOTS_VIDES.has(mot));
}

/** Similarité de Jaccard entre les ensembles de mots significatifs (0 à 1). */
export function similarite(a: string, b: string): number {
  const ma = new Set(motsSignificatifs(a));
  const mb = new Set(motsSignificatifs(b));
  if (ma.size === 0 || mb.size === 0) return 0;
  let communs = 0;
  for (const mot of ma) if (mb.has(mot)) communs += 1;
  return communs / (ma.size + mb.size - communs);
}

export interface QuestionExtraite {
  id: string;
  /** Texte de comparaison : énoncé suivi des propositions. */
  texte: string;
  occurrence: OccurrenceAnnale;
}

export interface GroupeRecurrent {
  /** Question retenue comme représentante (la plus récente fournie en dernier). */
  ids: string[];
  occurrences: OccurrenceAnnale[];
}

export const SEUIL_SIMILARITE = 0.72;

/**
 * Regroupe les questions similaires (liaison simple : une question rejoint
 * un groupe si elle ressemble assez à l'un de ses membres).
 */
export function grouperRecurrentes(
  questions: QuestionExtraite[],
  seuil: number = SEUIL_SIMILARITE,
): GroupeRecurrent[] {
  const parent = questions.map((_, i) => i);
  const racine = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (racine(i) === racine(j)) continue;
      if (similarite(questions[i]!.texte, questions[j]!.texte) >= seuil) {
        parent[racine(j)] = racine(i);
      }
    }
  }

  const groupes = new Map<number, GroupeRecurrent>();
  questions.forEach((q, i) => {
    const r = racine(i);
    const g = groupes.get(r) ?? { ids: [], occurrences: [] };
    g.ids.push(q.id);
    const dejaLa = g.occurrences.some(
      (o) => o.partielId === q.occurrence.partielId && o.numero === q.occurrence.numero,
    );
    if (!dejaLa) g.occurrences.push(q.occurrence);
    groupes.set(r, g);
  });
  return [...groupes.values()];
}
