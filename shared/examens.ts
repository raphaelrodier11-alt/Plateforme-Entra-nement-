/**
 * Composition des examens.
 *
 * - Examen blanc type partiel : uniquement des questions générées (jamais
 *   celles des annales), en priorité celles qui n'ont encore jamais été vues,
 *   réparties selon le poids de chaque chapitre dans les partiels.
 * - Examen d'entraînement général : toutes les sources, tous les chapitres
 *   de la matière représentés.
 */
import type { EtatQuestion } from './marqueurs';
import type { FormatPartiel, Question } from './types';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function generateurAleatoire(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function melanger<T>(elements: T[], alea: () => number): T[] {
  const copie = [...elements];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
  }
  return copie;
}

export const MINUTES_PAR_QUESTION_DEFAUT = 1.5;
export const NB_QUESTIONS_DEFAUT = 30;

export interface ExamenCompose {
  questionIds: string[];
  dureeMin: number;
  /** Nombre de questions jamais vues auparavant. */
  nbInedites: number;
}

export interface OptionsExamen {
  matiereId: string;
  questions: Question[];
  etats: Map<string, EtatQuestion>;
  /** Poids de chaque chapitre dans les partiels. */
  poids: Map<string, number>;
  format?: FormatPartiel;
  nbQuestions?: number;
  alea: () => number;
}

/** Une unité est une question isolée ou toutes les questions d'un cas clinique. */
interface Unite {
  chapitreId: string;
  questions: Question[];
}

function enUnites(questions: Question[]): Unite[] {
  const cas = new Map<string, Unite>();
  const unites: Unite[] = [];
  for (const q of questions) {
    if (!q.casId) {
      unites.push({ chapitreId: q.chapitreId, questions: [q] });
      continue;
    }
    let unite = cas.get(q.casId);
    if (!unite) {
      unite = { chapitreId: q.chapitreId, questions: [] };
      cas.set(q.casId, unite);
      unites.push(unite);
    }
    unite.questions.push(q);
  }
  for (const u of cas.values()) {
    u.questions.sort((a, b) => (a.ordreCas ?? 0) - (b.ordreCas ?? 0));
  }
  return unites;
}

function minutesParQuestion(format?: FormatPartiel): number {
  const m = format?.minutesParQuestion ?? MINUTES_PAR_QUESTION_DEFAUT;
  return Math.min(2, Math.max(1, m));
}

/**
 * Tire des unités chapitre par chapitre, à tour de rôle pondéré, jusqu'à
 * atteindre le nombre de questions voulu.
 */
function tirer(
  unitesParChapitre: Map<string, Unite[]>,
  poids: Map<string, number>,
  cible: number,
): Question[] {
  const choisies: Question[] = [];
  const credit = new Map<string, number>();
  const chapitres = [...unitesParChapitre.keys()].sort();
  const totalPoids = chapitres.reduce((s, c) => s + (poids.get(c) ?? 0), 0);

  while (choisies.length < cible) {
    const restants = chapitres.filter((c) => (unitesParChapitre.get(c) ?? []).length > 0);
    if (restants.length === 0) break;
    // Chaque tour crédite les chapitres selon leur poids ; le plus crédité est servi.
    for (const c of restants) {
      const part = totalPoids > 0 ? (poids.get(c) ?? 0) / totalPoids : 1 / chapitres.length;
      credit.set(c, (credit.get(c) ?? 0) + Math.max(part, 0.01));
    }
    const elu = restants.reduce((a, b) => ((credit.get(b) ?? 0) > (credit.get(a) ?? 0) ? b : a));
    const unite = unitesParChapitre.get(elu)!.shift()!;
    credit.set(elu, (credit.get(elu) ?? 0) - 1);
    choisies.push(...unite.questions);
  }
  return choisies;
}

function parChapitre(unites: Unite[]): Map<string, Unite[]> {
  const carte = new Map<string, Unite[]>();
  for (const u of unites) carte.set(u.chapitreId, [...(carte.get(u.chapitreId) ?? []), u]);
  return carte;
}

export function composerExamenBlanc(o: OptionsExamen): ExamenCompose {
  const generees = o.questions.filter(
    (q) => q.matiereId === o.matiereId && q.source === 'genere' && !q.perso,
  );
  // Ordre de préférence : jamais vues (réserve d'abord), puis les moins vues.
  const rang = (u: Unite): number => {
    const vues = u.questions.reduce((s, q) => s + (o.etats.get(q.id)?.nbTentatives ?? 0), 0);
    if (vues > 0) return 2 + vues;
    return u.questions.some((q) => q.reserveExamen) ? 0 : 1;
  };
  const unites = melanger(enUnites(generees), o.alea).sort((a, b) => rang(a) - rang(b));

  const cible = Math.min(
    generees.length,
    o.nbQuestions ?? o.format?.nbQuestions ?? NB_QUESTIONS_DEFAUT,
  );
  const choisies = tirer(parChapitre(unites), o.poids, cible);
  return {
    questionIds: choisies.map((q) => q.id),
    dureeMin: Math.ceil(choisies.length * minutesParQuestion(o.format)),
    nbInedites: choisies.filter((q) => !o.etats.has(q.id)).length,
  };
}

export function composerExamenGeneral(o: OptionsExamen): ExamenCompose {
  const pool = o.questions.filter((q) => q.matiereId === o.matiereId && !q.reserveExamen && !q.perso);
  // Jamais vues d'abord, puis les erreurs en cours, puis le reste.
  const rang = (u: Unite): number => {
    const etats = u.questions.map((q) => o.etats.get(q.id));
    if (etats.every((e) => !e)) return 0;
    if (etats.some((e) => e?.dansListeErreurs)) return 1;
    return 2;
  };
  const unites = melanger(enUnites(pool), o.alea).sort((a, b) => rang(a) - rang(b));
  const carte = parChapitre(unites);

  // Poids uniformes : l'objectif est de couvrir tout le programme.
  const uniformes = new Map([...carte.keys()].map((c) => [c, 1]));
  const cible = Math.min(pool.length, o.nbQuestions ?? Math.max(NB_QUESTIONS_DEFAUT, carte.size * 2));
  const choisies = tirer(carte, uniformes, cible);
  return {
    questionIds: choisies.map((q) => q.id),
    dureeMin: Math.ceil(choisies.length * minutesParQuestion(o.format)),
    nbInedites: choisies.filter((q) => !o.etats.has(q.id)).length,
  };
}

/** Libellé d'un partiel : son nom (« Partiel final », « CC »…) suivi de la matière si le nom ne la cite pas. */
export function libelleExamen(titre: string | undefined, nomMatiere: string | undefined): string {
  const nom = (titre ?? '').trim();
  if (!nom) return nomMatiere ?? 'Partiel';
  if (!nomMatiere || nom.toLowerCase().includes(nomMatiere.toLowerCase())) return nom;
  return `${nom} · ${nomMatiere}`;
}
