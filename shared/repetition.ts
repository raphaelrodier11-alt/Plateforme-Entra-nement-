/**
 * Répétition espacée des erreurs.
 *
 * Une question entre dans le cycle à sa première réponse comportant une
 * erreur. Chaque nouvelle tentative déplace son échéance :
 *  - réussie (1 point) : l'intervalle s'allonge (1 j, 3 j, 7 j, puis × facilité) ;
 *  - à moitié réussie (0,5) : l'intervalle est réduit de moitié ;
 *  - ratée (0) : retour à 1 jour.
 *
 * L'état est recalculé à partir du journal des tentatives : deux appareils
 * qui possèdent les mêmes tentatives obtiennent le même calendrier.
 */
import { JOUR_MS } from './dates';
import type { Tentative } from './types';

export interface EtatRepetition {
  /** Intervalle courant, en jours. */
  intervalle: number;
  /** Nombre de réussites consécutives depuis la dernière erreur. */
  serie: number;
  facilite: number;
  /** Instant (ms) à partir duquel la question est à revoir. */
  echeance: number;
}

export const FACILITE_INITIALE = 2.5;
export const FACILITE_MIN = 1.3;
const PALIERS = [1, 3, 7];

type TentativeMin = Pick<Tentative, 'date' | 'points' | 'nbErreurs'>;

/** Applique une tentative à l'état de répétition. */
export function appliquerTentative(
  etat: EtatRepetition | undefined,
  tentative: TentativeMin,
): EtatRepetition | undefined {
  if (!etat) {
    // Tant qu'aucune erreur n'a été commise, la question n'est pas suivie.
    if (tentative.nbErreurs === 0) return undefined;
    return {
      intervalle: 1,
      serie: 0,
      facilite: FACILITE_INITIALE,
      echeance: tentative.date + JOUR_MS,
    };
  }

  let { intervalle, serie, facilite } = etat;
  if (tentative.points >= 1) {
    serie += 1;
    intervalle =
      serie <= PALIERS.length
        ? PALIERS[serie - 1]!
        : Math.round(intervalle * facilite);
    facilite = Math.min(3, facilite + 0.05);
  } else if (tentative.points > 0) {
    serie = 0;
    intervalle = Math.max(1, Math.round(intervalle / 2));
    facilite = Math.max(FACILITE_MIN, facilite - 0.15);
  } else {
    serie = 0;
    intervalle = 1;
    facilite = Math.max(FACILITE_MIN, facilite - 0.2);
  }
  return { intervalle, serie, facilite, echeance: tentative.date + intervalle * JOUR_MS };
}

/** État de répétition d'une question à partir de toutes ses tentatives. */
export function etatRepetition(tentatives: TentativeMin[]): EtatRepetition | undefined {
  const triees = [...tentatives].sort((a, b) => a.date - b.date);
  let etat: EtatRepetition | undefined;
  for (const t of triees) etat = appliquerTentative(etat, t);
  return etat;
}

export function estDue(etat: EtatRepetition | undefined, maintenant: number): boolean {
  return !!etat && etat.echeance <= maintenant;
}

/** États de répétition par question, pour toutes les questions suivies. */
export function etatsRepetition(
  tentatives: (TentativeMin & Pick<Tentative, 'questionId'>)[],
): Map<string, EtatRepetition> {
  const parQuestion = new Map<string, TentativeMin[]>();
  for (const t of tentatives) {
    const liste = parQuestion.get(t.questionId);
    if (liste) liste.push(t);
    else parQuestion.set(t.questionId, [t]);
  }
  const etats = new Map<string, EtatRepetition>();
  for (const [id, liste] of parQuestion) {
    const etat = etatRepetition(liste);
    if (etat) etats.set(id, etat);
  }
  return etats;
}
