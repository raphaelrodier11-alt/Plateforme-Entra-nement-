/**
 * Ressenti et avancement saisis à la main, fusionnés avec ce que tu fais dans
 * l'appli : ce que tu as déclaré sert de point de départ ; plus tu t'entraînes
 * sur un chapitre, plus ce sont tes résultats réels qui comptent.
 */
import type { Evaluation } from './types';

export const LIBELLE_DIFFICULTE = ['', 'Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'] as const;
export const LIBELLE_CONFIANCE = ['', 'Aucune', 'Faible', 'Moyenne', 'Bonne', 'Totale'] as const;

/** Poids du point de départ déclaré, en nombre de questions « équivalentes ». */
const POIDS_DECLARE = 4;

const borne = (n: number | undefined): number | undefined =>
  n === undefined || !Number.isFinite(n) ? undefined : Math.min(5, Math.max(1, Math.round(n)));

/**
 * Maîtrise effective d'un chapitre, de 0 à 1.
 * @param maitriseReelle maîtrise calculée par l'appli (0 à 1)
 * @param nbTentees nombre de questions déjà travaillées sur ce chapitre
 */
export function maitriseEffective(ev: Evaluation | undefined, maitriseReelle: number, nbTentees: number): number {
  const confiance = borne(ev?.confiance);
  // Sans confiance déclarée, un chapitre « déjà vu » part d'un niveau moyen ; sinon, rien n'est supposé.
  const declaree = confiance !== undefined ? (confiance - 1) / 4 : ev?.dejaVu ? 0.5 : undefined;
  if (declaree === undefined) return maitriseReelle;
  return (declaree * POIDS_DECLARE + maitriseReelle * nbTentees) / (POIDS_DECLARE + nbTentees);
}

export function difficulteRessentie(ev: Evaluation | undefined): number {
  return borne(ev?.difficulte) ?? 3;
}

/**
 * Besoin de révision d'un chapitre, de 0 (acquis, facile) à 1 (faible, difficile) :
 * la faiblesse compte pour l'essentiel, la difficulté ressentie pondère.
 */
export function besoinRevision(maitrise: number, difficulte: number): number {
  const faiblesse = 1 - Math.min(1, Math.max(0, maitrise));
  return Math.min(1, faiblesse * (0.7 + 0.075 * difficulte));
}

export type NiveauRevision = 'faible' | 'moyen' | 'fort';

/** Point faible, moyen ou fort : sert à répartir le temps (≈ 60 % / 25 % / 15 %). */
export function niveauRevision(besoin: number): NiveauRevision {
  return besoin >= 0.5 ? 'faible' : besoin >= 0.28 ? 'moyen' : 'fort';
}

export const PART_TEMPS: Record<NiveauRevision, number> = { faible: 0.6, moyen: 0.25, fort: 0.15 };
