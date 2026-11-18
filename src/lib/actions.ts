/**
 * Actions lancées depuis plusieurs écrans : démarrer un QCM de chapitre,
 * une révision d'erreurs, un examen, ou exécuter une tâche du planning.
 */
import {
  composerExamenBlanc,
  composerExamenGeneral,
  generateurAleatoire,
} from '../../shared/examens';
import type { TachePlanifiee } from '../../shared/planning';
import type { Question } from '../../shared/types';
import type { Donnees } from '../etat/calcul';
import { choisirQuestions, demarrerSession } from './sessions';

export const NB_QUESTIONS_DEFAUT = 10;

/** Démarre un QCM sur un chapitre ; renvoie l'adresse de la session. */
export async function lancerQcmChapitre(
  d: Donnees,
  chapitreId: string,
  nombre = NB_QUESTIONS_DEFAUT,
): Promise<string | undefined> {
  const chapitre = d.chapitreParId.get(chapitreId);
  if (!chapitre) return undefined;
  const questions = choisirQuestions(d, { chapitreIds: [chapitreId], nombre });
  if (questions.length === 0) return undefined;
  const id = await demarrerSession({
    type: 'qcm',
    titre: chapitre.titre,
    questions,
    matiereId: chapitre.matiereId,
    chapitreIds: [chapitreId],
  });
  return `/session/${id}`;
}

/** Démarre une révision d'erreurs (par défaut : celles arrivées à échéance). */
export async function lancerRevisionErreurs(
  d: Donnees,
  questions: Question[] = d.erreursDues,
  titre = 'Erreurs du jour',
): Promise<string | undefined> {
  if (questions.length === 0) return undefined;
  const id = await demarrerSession({
    type: 'revision_erreurs',
    titre,
    questions: questions.slice(0, 40),
  });
  return `/session/${id}`;
}

function poidsChapitres(d: Donnees): Map<string, number> {
  return new Map([...d.stats.values()].map((s) => [s.chapitreId, s.poidsExamen]));
}

export async function lancerExamenBlanc(d: Donnees, matiereId: string): Promise<string | undefined> {
  const matiere = d.matiereParId.get(matiereId);
  if (!matiere) return undefined;
  const examen = composerExamenBlanc({
    matiereId,
    questions: d.questions,
    etats: d.etats,
    poids: poidsChapitres(d),
    format: matiere.formatPartiel,
    alea: generateurAleatoire(Date.now()),
  });
  const questions = examen.questionIds
    .map((id) => d.questionParId.get(id))
    .filter((q): q is Question => !!q);
  if (questions.length === 0) return undefined;
  const id = await demarrerSession({
    type: 'examen_blanc',
    titre: `Examen blanc — ${matiere.nom}`,
    questions,
    matiereId,
    dureeLimiteMs: examen.dureeMin * 60_000,
  });
  return `/session/${id}`;
}

export async function lancerExamenGeneral(d: Donnees, matiereId: string): Promise<string | undefined> {
  const matiere = d.matiereParId.get(matiereId);
  if (!matiere) return undefined;
  const examen = composerExamenGeneral({
    matiereId,
    questions: d.questions,
    etats: d.etats,
    poids: poidsChapitres(d),
    format: matiere.formatPartiel,
    alea: generateurAleatoire(Date.now()),
  });
  const questions = examen.questionIds
    .map((id) => d.questionParId.get(id))
    .filter((q): q is Question => !!q);
  if (questions.length === 0) return undefined;
  const id = await demarrerSession({
    type: 'examen_general',
    titre: `Entraînement général — ${matiere.nom}`,
    questions,
    matiereId,
    dureeLimiteMs: examen.dureeMin * 60_000,
  });
  return `/session/${id}`;
}

/** Adresse à ouvrir pour réaliser une tâche du planning. */
export async function lancerTache(d: Donnees, tache: TachePlanifiee): Promise<string> {
  switch (tache.type) {
    case 'erreurs':
      return (await lancerRevisionErreurs(d)) ?? '/erreurs';
    case 'examen_blanc':
      return `/examens${tache.matiereId ? `?matiere=${tache.matiereId}` : ''}`;
    case 'qcm':
      return (
        (tache.chapitreId &&
          (await lancerQcmChapitre(d, tache.chapitreId, Math.max(5, Math.round(tache.dureeMin / 2))))) ||
        `/chapitre/${tache.chapitreId}`
      );
    case 'decouverte':
    case 'revision_generale':
    case 'relecture_fiche':
      return `/chapitre/${tache.chapitreId}`;
    case 'carnet':
      return '/a-revoir';
    case 'interro_orale':
      return '/assistant?vue=interro';
    case 'flashcards':
      return tache.chapitreId ? `/chapitre/${tache.chapitreId}/flashcards` : '/cours';
    case 'annales': {
      const questions = choisirQuestions(d, { matiereId: tache.matiereId, source: 'annale', nombre: Math.max(8, Math.round(tache.dureeMin / 1.5)) });
      if (questions.length === 0) return `/chapitre/${tache.chapitreId}`;
      const id = await demarrerSession({ type: 'qcm', titre: 'Annales', questions, matiereId: tache.matiereId });
      return `/session/${id}`;
    }
  }
}

export const LIBELLE_TACHE: Record<TachePlanifiee['type'], string> = {
  decouverte: 'Découverte : fiche puis premiers QCM',
  qcm: 'QCM ciblés',
  erreurs: 'Révision des erreurs',
  examen_blanc: 'Examen blanc',
  revision_generale: 'Révision générale : fiche et erreurs',
  relecture_fiche: 'Relire la fiche du chapitre',
  carnet: 'Carnet « À revoir » : relire et se tester',
  annales: 'Refaire des annales',
  interro_orale: 'Interro orale avec le Dr Rodier',
  flashcards: 'Flashcards du chapitre',
};
