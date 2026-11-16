/**
 * Prédiction de note par matière.
 *
 * Pour chaque chapitre, on estime le taux de réussite à une question tirée
 * au hasard : les questions déjà travaillées comptent à leur niveau réel,
 * les autres à un niveau prudent. Les chapitres sont pondérés par leur poids
 * dans les partiels. Les examens blancs récents, preuve directe, corrigent
 * l'estimation.
 */
import type { StatsChapitre } from './progression';

/** Taux attendu sur un chapitre jamais travaillé (barème par erreurs). */
export const TAUX_SANS_REVISION = 0.2;

export type Fiabilite = 'faible' | 'moyenne' | 'bonne';

export interface PredictionNote {
  matiereId: string;
  /** Note estimée sur 20. */
  note: number;
  min: number;
  max: number;
  fiabilite: Fiabilite;
  /** Part du programme (pondérée par les partiels) déjà travaillée. */
  couverture: number;
}

export function tauxEstimeChapitre(s: Pick<StatsChapitre, 'couverture' | 'maitrise' | 'nbTentees'>): number {
  if (s.nbTentees === 0) return TAUX_SANS_REVISION;
  // Ce qui est su se transfère en partie aux questions pas encore vues.
  const inconnu = TAUX_SANS_REVISION + Math.max(0, s.maitrise - TAUX_SANS_REVISION) * 0.5;
  return s.couverture * s.maitrise + (1 - s.couverture) * inconnu;
}

export function predireNote(
  matiereId: string,
  chapitres: StatsChapitre[],
  /** Taux de réussite (0 à 1) des examens blancs de la matière, du plus ancien au plus récent. */
  examensBlancs: number[] = [],
): PredictionNote | undefined {
  if (chapitres.length === 0) return undefined;

  const poidsTotal = chapitres.reduce((s, c) => s + c.poidsExamen, 0) || 1;
  let taux = 0;
  let couverture = 0;
  let tentees = 0;
  for (const c of chapitres) {
    const poids = c.poidsExamen / poidsTotal;
    taux += poids * tauxEstimeChapitre(c);
    couverture += poids * c.couverture;
    tentees += c.nbTentees;
  }

  const recents = examensBlancs.slice(-3);
  if (recents.length > 0) {
    const moyenne = recents.reduce((s, t) => s + t, 0) / recents.length;
    const confiance = Math.min(0.5, 0.2 * recents.length);
    taux = (1 - confiance) * taux + confiance * moyenne;
  }

  const erreurType = Math.sqrt((taux * (1 - taux)) / Math.max(tentees, 1));
  const marge = Math.min(6, Math.max(1, 20 * 1.5 * erreurType + (1 - couverture) * 3));
  const note = Math.round(taux * 200) / 10;

  let fiabilite: Fiabilite = 'faible';
  if (couverture >= 0.6 && tentees >= 60) fiabilite = 'bonne';
  else if (couverture >= 0.3 && tentees >= 20) fiabilite = 'moyenne';

  return {
    matiereId,
    note,
    min: Math.max(0, Math.round((note - marge) * 10) / 10),
    max: Math.min(20, Math.round((note + marge) * 10) / 10),
    fiabilite,
    couverture,
  };
}
