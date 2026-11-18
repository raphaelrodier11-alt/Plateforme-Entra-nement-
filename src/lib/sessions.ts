/**
 * Création et déroulement des sessions (QCM, examens, révision d'erreurs).
 */
import type { Correction } from '../../shared/bareme';
import { generateurAleatoire, melanger } from '../../shared/examens';
import { estIncontournable } from '../../shared/marqueurs';
import type {
  ContexteTentative,
  Question,
  ReponseDonnee,
  Session,
  Tentative,
  TypeErreur,
  TypeQuestion,
} from '../../shared/types';
import { enregistrer } from '../db/sync';
import type { Donnees } from '../etat/calcul';

export function nouvelId(): string {
  return crypto.randomUUID();
}

export type TypeFiltre = TypeQuestion | 'cas';

export const LIBELLE_TYPE: Record<TypeFiltre, string> = {
  simple: 'Choix simple',
  multiple: 'Choix multiples',
  vrai_faux: 'Vrai / faux',
  trous: 'Texte à trous',
  cas: 'Cas cliniques',
};

export interface FiltreQcm {
  matiereId?: string;
  chapitreIds?: string[];
  nombre: number;
  types?: TypeFiltre[];
  difficultes?: number[];
  source?: 'toutes' | 'annale' | 'genere';
  incontournables?: boolean;
}

/** Catégorie d'une question pour le filtre par type. */
export function categorie(q: Question): TypeFiltre {
  return q.casId ? 'cas' : q.type;
}

export function questionsCorrespondantes(d: Donnees, f: FiltreQcm): Question[] {
  return d.questions.filter((q) => {
    if (f.matiereId && q.matiereId !== f.matiereId) return false;
    if (f.chapitreIds?.length && !f.chapitreIds.includes(q.chapitreId)) return false;
    if (f.types?.length && !f.types.includes(categorie(q))) return false;
    if (f.difficultes?.length && !f.difficultes.includes(q.difficulte)) return false;
    if (f.source && f.source !== 'toutes' && q.source !== f.source) return false;
    if (f.incontournables && !estIncontournable(q)) return false;
    // Les questions réservées aux examens blancs restent inédites.
    if ((q.reserveExamen || q.perso) && !d.etats.has(q.id)) return false;
    return true;
  });
}

/**
 * Choisit les questions d'un QCM : d'abord les erreurs à revoir, puis les
 * questions jamais vues, puis les autres erreurs, enfin le reste. Les
 * questions d'un même cas clinique restent groupées et ordonnées.
 */
export function choisirQuestions(d: Donnees, f: FiltreQcm, graine = Date.now()): Question[] {
  const dues = new Set(d.erreursDues.map((q) => q.id));
  const rang = (q: Question): number => {
    const etat = d.etats.get(q.id);
    if (dues.has(q.id)) return 0;
    if (!etat) return 1;
    if (etat.dansListeErreurs) return 2;
    return 3;
  };

  const groupes = new Map<string, Question[]>();
  for (const q of questionsCorrespondantes(d, f)) {
    const cle = q.casId ?? q.id;
    groupes.set(cle, [...(groupes.get(cle) ?? []), q]);
  }
  const unites = melanger([...groupes.values()], generateurAleatoire(graine)).sort(
    (a, b) => Math.min(...a.map(rang)) - Math.min(...b.map(rang)),
  );

  const choisies: Question[] = [];
  for (const unite of unites) {
    if (choisies.length >= f.nombre) break;
    choisies.push(...unite.sort((a, b) => (a.ordreCas ?? 0) - (b.ordreCas ?? 0)));
  }
  return choisies;
}

export async function demarrerSession(params: {
  type: ContexteTentative;
  titre: string;
  questions: Question[];
  matiereId?: string;
  chapitreIds?: string[];
  dureeLimiteMs?: number;
  notionId?: string;
}): Promise<string> {
  const session: Session = {
    id: nouvelId(),
    type: params.type,
    titre: params.titre,
    debut: Date.now(),
    matiereId: params.matiereId,
    chapitreIds: params.chapitreIds,
    questionIds: params.questions.map((q) => q.id),
    dureeLimiteMs: params.dureeLimiteMs,
    ...(params.notionId ? { notionId: params.notionId } : {}),
    termine: false,
  };
  await enregistrer('sessions', session);
  return session.id;
}

export function creerTentative(
  session: Session,
  question: Question,
  reponse: ReponseDonnee,
  correction: Correction,
  options: { dureeMs?: number; typeErreur?: TypeErreur; date?: number } = {},
): Tentative {
  return {
    id: nouvelId(),
    questionId: question.id,
    chapitreId: question.chapitreId,
    matiereId: question.matiereId,
    date: options.date ?? Date.now(),
    reponse,
    nbErreurs: correction.nbErreurs,
    points: correction.points,
    typeErreur: correction.nbErreurs > 0 ? options.typeErreur : undefined,
    sessionId: session.id,
    contexte: session.type,
    dureeMs: options.dureeMs,
  };
}

export async function terminerSession(session: Session, points: number): Promise<void> {
  await enregistrer('sessions', { ...session, termine: true, fin: Date.now(), points });
}

export function reponseVide(r: ReponseDonnee): boolean {
  return (
    !r.cochees?.length &&
    !Object.keys(r.jugements ?? {}).length &&
    !Object.values(r.textes ?? {}).some((t) => t.trim())
  );
}

export const LIBELLE_SESSION: Record<ContexteTentative, string> = {
  qcm: 'QCM',
  examen_blanc: 'Examen blanc',
  examen_general: 'Entraînement général',
  revision_erreurs: 'Révision des erreurs',
};

export function estExamen(session: Pick<Session, 'type'>): boolean {
  return session.type === 'examen_blanc' || session.type === 'examen_general';
}
