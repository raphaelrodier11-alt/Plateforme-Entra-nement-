/**
 * Es-tu en avance ou en retard ? Deux mesures : l'assiduité (les séances
 * prévues dans tes disponibilités ont-elles été faites ?) et la progression
 * réelle (ta maîtrise de la matière du prochain partiel, comparée à ce qu'on
 * attend à cette distance de l'examen). Le résultat règle la vitesse de l'ECG.
 */
export interface EntreeRetard {
  /** Minutes prévues dans les disponibilités des 14 derniers jours (hors aujourd'hui). */
  minutesPrevues: number;
  /** Minutes réellement travaillées sur la même période. */
  minutesFaites: number;
  /** Maîtrise moyenne (0 à 1) de la matière du prochain partiel, si connue. */
  maitrise?: number;
  /** Jours avant le prochain partiel, si connu. */
  joursRestants?: number;
}

export interface SituationRetard {
  /** -1 (très en avance) à +1 (très en retard). */
  score: number;
  /** Battements par minute de l'ECG. */
  bpm: number;
  libelle: string;
}

export const BPM_CALME = 55;
export const BPM_RETARD_MAX = 130;
const HORIZON_JOURS = 60;

/** Maîtrise attendue : de 0,2 à 60 jours de l'examen jusqu'à 0,85 le jour J. */
export function maitriseAttendue(joursRestants: number): number {
  const avance = 1 - Math.min(HORIZON_JOURS, Math.max(0, joursRestants)) / HORIZON_JOURS;
  return 0.2 + 0.65 * avance;
}

const borne = (x: number) => Math.max(-1, Math.min(1, x));

export function situationRetard(e: EntreeRetard): SituationRetard {
  const mesures: number[] = [];
  if (e.minutesPrevues >= 30) {
    // 100 % fait → -0,6 (en avance) ; 0 % → +1 (en retard).
    const part = Math.min(1.3, e.minutesFaites / e.minutesPrevues);
    mesures.push(borne(1 - part * 1.6));
  }
  if (e.maitrise !== undefined && e.joursRestants !== undefined) {
    mesures.push(borne((maitriseAttendue(e.joursRestants) - e.maitrise) / 0.35));
  }
  const score = mesures.length === 0 ? 0 : mesures.reduce((a, b) => a + b, 0) / mesures.length;
  const bpm = Math.round(BPM_CALME + ((score + 1) / 2) * (BPM_RETARD_MAX - BPM_CALME));
  const libelle =
    mesures.length === 0
      ? 'Rythme neutre : pas encore assez de données.'
      : score > 0.5
        ? 'Tu es en retard : l’ECG accélère. Une séance de rattrapage aujourd’hui ?'
        : score > 0.15
          ? 'Tu es un peu en retard sur ton programme.'
          : score < -0.3
            ? 'Tu es en avance : le rythme est calme.'
            : 'Tu es dans les temps.';
  return { score, bpm, libelle };
}
