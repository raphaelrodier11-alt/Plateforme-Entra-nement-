/**
 * Le cœur du compte à rebours : plus le partiel approche, plus il grossit,
 * bat vite et fort, et plus le sang circule. Fonction pure, testée.
 */
export interface EtatCoeur {
  /** 0 (partiel lointain) à 1 (jour J). */
  urgence: number;
  /** Battements par minute. */
  bpm: number;
  /** Taille du cœur au repos (1 = taille de départ). */
  echelle: number;
  /** Amplitude de chaque battement (part de la taille). */
  amplitude: number;
  /** Vitesse du sang dans les vaisseaux (1 = calme). */
  vitesseSang: number;
  /** Éclat de la lueur rouge, de 0 à 1. */
  eclat: number;
}

/** À partir de combien de jours le cœur commence à s'agiter. */
export const HORIZON_COEUR_JOURS = 45;

export function etatCoeur(joursRestants: number | undefined): EtatCoeur {
  // Sans partiel connu, le cœur est calme (urgence très faible, mais il bat).
  const urgence =
    joursRestants === undefined
      ? 0.04
      : Math.min(1, Math.max(0, 1 - Math.max(0, joursRestants) / HORIZON_COEUR_JOURS)) ** 1.35;
  return {
    urgence,
    bpm: Math.round(58 + 64 * urgence),
    echelle: 0.78 + 0.5 * urgence,
    amplitude: 0.035 + 0.13 * urgence,
    vitesseSang: 0.45 + 2.1 * urgence,
    eclat: 0.2 + 0.8 * urgence,
  };
}

/**
 * Forme d'un battement « lub-dub » sur un cycle (0 à 1) : deux bosses, la contraction
 * puis la fermeture des valves. Renvoie une valeur de 0 à 1.
 */
export function battement(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const bosse = (c: number, l: number) => Math.exp(-(((p - c) / l) ** 2));
  return Math.min(1, bosse(0.1, 0.055) + 0.55 * bosse(0.33, 0.07));
}

export function libelleUrgence(joursRestants: number | undefined): string {
  if (joursRestants === undefined) return 'Ajoute la date de ton prochain partiel.';
  if (joursRestants <= 0) return 'Jour J : respire, tu es prêt.';
  if (joursRestants <= 3) return 'Le cœur s’emballe : dernière ligne droite !';
  if (joursRestants <= 10) return 'Ça accélère : chaque séance compte.';
  if (joursRestants <= 25) return 'Le rythme monte doucement.';
  return 'Tout est calme : tu as le temps de bien faire.';
}
