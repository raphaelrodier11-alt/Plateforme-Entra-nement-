/**
 * Barème de Dr Rodier.
 *
 * Règle : 0 erreur = 1 point, 1 erreur = 0,5 point, 2 erreurs ou plus = 0 point.
 *
 * Une « erreur » est une discordance entre la réponse donnée et la réponse
 * attendue sur un élément de la question :
 *  - choix multiple : une proposition cochée à tort ou oubliée ;
 *  - vrai/faux : une affirmation mal jugée ou laissée sans réponse ;
 *  - texte à trous : un trou mal rempli ou vide.
 *
 * Quand la question ne comporte qu'un seul élément à évaluer (choix simple,
 * une seule affirmation, un seul trou), une réponse fausse vaut 0 point :
 * elle compte pour 2 erreurs, sinon on obtiendrait 0,5 point en se trompant
 * entièrement.
 */
import type { Question, ReponseDonnee, Tentative } from './types';

/** Nombre d'erreurs attribué à une réponse entièrement fausse sur un seul élément. */
export const ERREURS_TOUT_OU_RIEN = 2;

export function pointsPourErreurs(nbErreurs: number): number {
  if (nbErreurs <= 0) return 1;
  if (nbErreurs === 1) return 0.5;
  return 0;
}

/** Normalise un texte libre : minuscules, sans accents, espaces réduits. */
export function normaliserReponse(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9+\-.,/% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distance d'édition (Levenshtein) entre deux chaînes courtes. */
export function distanceEdition(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const courante = [i];
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(
        precedente[j]! + 1,
        courante[j - 1]! + 1,
        precedente[j - 1]! + cout,
      );
    }
    precedente = courante;
  }
  return precedente[b.length]!;
}

/**
 * Un trou est juste si le texte saisi correspond à une réponse acceptée.
 * Une faute de frappe d'un caractère est tolérée sur les mots de 6 lettres
 * ou plus, jamais sur les valeurs chiffrées.
 */
export function trouCorrect(saisie: string | undefined, acceptees: string[]): boolean {
  const s = normaliserReponse(saisie ?? '');
  if (!s) return false;
  return acceptees.some((reponse) => {
    const attendu = normaliserReponse(reponse);
    if (s === attendu) return true;
    const chiffre = /\d/.test(attendu);
    return !chiffre && attendu.length >= 6 && distanceEdition(s, attendu) <= 1;
  });
}

export interface DetailCorrection {
  /** Identifiant de la proposition ou du trou. */
  id: string;
  juste: boolean;
}

export interface Correction {
  nbErreurs: number;
  points: number;
  details: DetailCorrection[];
}

/** Corrige une réponse : nombre d'erreurs, points et détail par élément. */
export function corriger(question: Question, reponse: ReponseDonnee): Correction {
  const details: DetailCorrection[] = [];

  if (question.type === 'trous') {
    for (const trou of question.trous ?? []) {
      details.push({
        id: trou.id,
        juste: trouCorrect(reponse.textes?.[trou.id], trou.reponses),
      });
    }
  } else if (question.type === 'vrai_faux') {
    for (const p of question.propositions ?? []) {
      const jugement = reponse.jugements?.[p.id];
      details.push({ id: p.id, juste: jugement === p.correcte });
    }
  } else {
    const cochees = new Set(reponse.cochees ?? []);
    for (const p of question.propositions ?? []) {
      details.push({ id: p.id, juste: cochees.has(p.id) === p.correcte });
    }
  }

  const discordances = details.filter((d) => !d.juste).length;
  let nbErreurs = discordances;

  // Un seul élément évaluable : tout ou rien.
  const unSeulElement = question.type === 'simple' || details.length <= 1;
  if (unSeulElement && discordances > 0) nbErreurs = ERREURS_TOUT_OU_RIEN;

  return { nbErreurs, points: pointsPourErreurs(nbErreurs), details };
}

export function compterErreurs(question: Question, reponse: ReponseDonnee): number {
  return corriger(question, reponse).nbErreurs;
}

export interface Score {
  points: number;
  /** Nombre de questions prises en compte (1 point possible par question). */
  total: number;
  /** Taux de réussite entre 0 et 1 (0 s'il n'y a aucune question). */
  taux: number;
  noteSur20: number;
}

export function scoreDepuisPoints(points: number, total: number): Score {
  const taux = total > 0 ? points / total : 0;
  return { points, total, taux, noteSur20: Math.round(taux * 200) / 10 };
}

/** Score d'un QCM ou d'un examen : somme des points des tentatives fournies. */
export function scoreTentatives(tentatives: Pick<Tentative, 'points'>[]): Score {
  const points = tentatives.reduce((somme, t) => somme + t.points, 0);
  return scoreDepuisPoints(points, tentatives.length);
}

/**
 * Score d'un QCM en tenant compte des questions laissées sans réponse,
 * qui valent 0 point.
 */
export function scoreSession(
  questionIds: string[],
  tentatives: Pick<Tentative, 'points' | 'questionId'>[],
): Score {
  const parQuestion = new Map(tentatives.map((t) => [t.questionId, t.points]));
  const points = questionIds.reduce((s, id) => s + (parQuestion.get(id) ?? 0), 0);
  return scoreDepuisPoints(points, questionIds.length);
}

/** Dernière tentative de chaque question (état actuel des connaissances). */
export function dernieresTentatives<T extends Pick<Tentative, 'questionId' | 'date'>>(
  tentatives: T[],
): Map<string, T> {
  const dernieres = new Map<string, T>();
  for (const t of tentatives) {
    const connue = dernieres.get(t.questionId);
    if (!connue || t.date >= connue.date) dernieres.set(t.questionId, t);
  }
  return dernieres;
}

/**
 * Score par regroupement (chapitre, matière…) : pour chaque question, seule
 * la dernière tentative compte.
 */
export function scoresParGroupe<T extends Pick<Tentative, 'questionId' | 'date' | 'points'>>(
  tentatives: T[],
  groupeDe: (t: T) => string,
): Map<string, Score> {
  const cumuls = new Map<string, { points: number; total: number }>();
  for (const t of dernieresTentatives(tentatives).values()) {
    const cle = groupeDe(t);
    const c = cumuls.get(cle) ?? { points: 0, total: 0 };
    c.points += t.points;
    c.total += 1;
    cumuls.set(cle, c);
  }
  const scores = new Map<string, Score>();
  for (const [cle, c] of cumuls) scores.set(cle, scoreDepuisPoints(c.points, c.total));
  return scores;
}

/** Score global : dernière tentative de chaque question, tous chapitres confondus. */
export function scoreGlobal(tentatives: Pick<Tentative, 'questionId' | 'date' | 'points'>[]): Score {
  return scoreTentatives([...dernieresTentatives(tentatives).values()]);
}
