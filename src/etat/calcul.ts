/**
 * Calcul de tout ce qui se déduit des données : états des questions,
 * avancement, planning, points, prédictions, recommandations.
 *
 * Rien de ceci n'est stocké : c'est recalculé dès qu'une donnée change, ce
 * qui garantit des écrans cohérents entre eux et entre les appareils.
 */
import { calculerProfil, type Profil } from '../../shared/gamification';
import { estIncontournable, etatsQuestions, type EtatQuestion } from '../../shared/marqueurs';
import { calculerPlanning, type Planning } from '../../shared/planning';
import { predireNote, type PredictionNote } from '../../shared/prediction';
import {
  statsChapitres,
  statsMatieres,
  type StatsChapitre,
  type StatsMatiere,
} from '../../shared/progression';
import { recommander, type Recommandation } from '../../shared/recommandations';
import { etatsRepetition, type EtatRepetition } from '../../shared/repetition';
import {
  REGLAGES_DEFAUT,
  type Actualisation,
  type Anomalie,
  type CasClinique,
  type Chapitre,
  type Decision,
  type Depot,
  type Disponibilite,
  type Estimation,
  type Entrainement,
  type EtatPipeline,
  type Evenement,
  type Examen,
  type Fiche,
  type Fichier,
  type Flashcard,
  type Matiere,
  type NotificationApp,
  type Partiel,
  type PassageIllisible,
  type Question,
  type Reglages,
  type RevueFlash,
  type Session,
  type Tache,
  type Tentative,
} from '../../shared/types';

export interface Brut {
  matieres: Matiere[];
  chapitres: Chapitre[];
  questions: Question[];
  /** Questions des entraînements sur mesure (fusionnées avec `questions` dans les calculs). */
  questionsPerso: Question[];
  entrainements: Entrainement[];
  cas: CasClinique[];
  fiches: Fiche[];
  flashcards: Flashcard[];
  partiels: Partiel[];
  fichiers: Fichier[];
  depots: Depot[];
  actualisations: Actualisation[];
  anomalies: Anomalie[];
  illisibles: PassageIllisible[];
  notifications: NotificationApp[];
  estimations: Estimation[];
  etat: EtatPipeline[];
  tentatives: Tentative[];
  sessions: Session[];
  disponibilites: Disponibilite[];
  examens: Examen[];
  evenements: Evenement[];
  reglages: Reglages[];
  decisions: Decision[];
  taches: Tache[];
  revues: RevueFlash[];
}

export interface Donnees extends Omit<Brut, 'reglages' | 'etat'> {
  maintenant: number;
  reglages: Reglages;
  etatPipeline?: EtatPipeline;
  estVide: boolean;
  aDesDonneesDemo: boolean;

  matiereParId: Map<string, Matiere>;
  chapitreParId: Map<string, Chapitre>;
  questionParId: Map<string, Question>;
  casParId: Map<string, CasClinique>;
  partielParId: Map<string, Partiel>;
  ficheParChapitre: Map<string, Fiche>;
  questionsParChapitre: Map<string, Question[]>;
  chapitresParMatiere: Map<string, Chapitre[]>;
  /** Comparaisons avec les versions plus anciennes, par chapitre (celles qui montrent des changements d'abord). */
  actualisationsParChapitre: Map<string, Actualisation[]>;

  etats: Map<string, EtatQuestion>;
  repetitions: Map<string, EtatRepetition>;
  stats: Map<string, StatsChapitre>;
  statsMatiere: Map<string, StatsMatiere>;

  /** Questions actuellement dans la liste d'erreurs. */
  erreurs: Question[];
  /** Erreurs arrivées à échéance de répétition espacée. */
  erreursDues: Question[];
  /** Questions piégeuses réussies, qui restent signalées. */
  aRevoir: Question[];

  profil: Profil;
  planning: Planning;
  recommandations: Recommandation[];
  predictions: Map<string, PredictionNote>;

  /** Nombre d'éléments qui attendent une validation. */
  nbAValider: number;
  nbNotificationsNonLues: number;
}

function indexer<T extends { id: string }>(elements: T[]): Map<string, T> {
  return new Map(elements.map((e) => [e.id, e]));
}

function grouper<T>(elements: T[], cle: (e: T) => string): Map<string, T[]> {
  const groupes = new Map<string, T[]>();
  for (const e of elements) {
    const k = cle(e);
    const liste = groupes.get(k);
    if (liste) liste.push(e);
    else groupes.set(k, [e]);
  }
  return groupes;
}

export function calculer(brutInitial: Brut, maintenant: number): Donnees {
  // Les questions des entraînements sur mesure rejoignent les autres, marquées « perso » (hors avancement).
  const brut: Brut = { ...brutInitial, questions: [...brutInitial.questions, ...(brutInitial.questionsPerso ?? [])] };
  const matieres = [...brut.matieres].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom));
  const chapitres = [...brut.chapitres].sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre));
  const reglages: Reglages = { ...REGLAGES_DEFAUT, ...brut.reglages.find((r) => r.id === 'principal') };

  const questionParId = indexer(brut.questions);
  // Les tentatives sur des questions disparues sont ignorées dans les calculs.
  const tentatives = brut.tentatives.filter((t) => questionParId.has(t.questionId));

  const etats = etatsQuestions(tentatives);
  const repetitions = etatsRepetition(tentatives);
  const stats = statsChapitres(chapitres, brut.questions, etats, repetitions, maintenant);
  const listeStats = [...stats.values()];

  const erreurs: Question[] = [];
  const erreursDues: Question[] = [];
  const aRevoir: Question[] = [];
  let incontournablesReussies = 0;
  let incontournablesARevoir = 0;
  for (const q of brut.questions) {
    const etat = etats.get(q.id);
    if (estIncontournable(q)) {
      if (etat && !etat.dansListeErreurs) incontournablesReussies += 1;
      else incontournablesARevoir += 1;
    }
    if (!etat) continue;
    if (etat.dansListeErreurs) erreurs.push(q);
    if (etat.aRevoir) aRevoir.push(q);
    const rep = repetitions.get(q.id);
    if (rep && rep.echeance <= maintenant && (etat.dansListeErreurs || etat.aRevoir)) {
      erreursDues.push(q);
    }
  }

  const difficultes = new Map(brut.questions.map((q) => [q.id, q.difficulte]));
  const profil = calculerProfil(
    { tentatives, sessions: brut.sessions, etats, stats: listeStats, incontournablesReussies },
    difficultes,
    maintenant,
  );

  const planning = calculerPlanning({
    maintenant,
    disponibilites: brut.disponibilites,
    heuresCreneaux: reglages.heuresCreneaux,
    evenements: brut.evenements,
    examens: brut.examens,
    chapitres: listeStats
      .filter((s) => s.nbQuestions > 0 || brut.fiches.some((f) => f.chapitreId === s.chapitreId))
      .map((s) => ({
        id: s.chapitreId,
        matiereId: s.matiereId,
        avancement: s.avancement,
        couverture: s.couverture,
        poidsExamen: s.poidsExamen,
      })),
    echeancesErreurs: [...erreurs, ...aRevoir]
      .map((q) => repetitions.get(q.id)?.echeance)
      .filter((e): e is number => e !== undefined),
  });

  const predictions = new Map<string, PredictionNote>();
  for (const m of matieres) {
    const blancs = brut.sessions
      .filter((s) => s.termine && s.type === 'examen_blanc' && s.matiereId === m.id)
      .sort((a, b) => a.debut - b.debut)
      .map((s) => (s.questionIds.length ? (s.points ?? 0) / s.questionIds.length : 0));
    const prediction = predireNote(
      m.id,
      listeStats.filter((s) => s.matiereId === m.id && s.nbQuestions > 0),
      blancs,
    );
    if (prediction) predictions.set(m.id, prediction);
  }

  const recommandations = recommander({
    maintenant,
    stats: listeStats,
    titresChapitres: new Map(chapitres.map((c) => [c.id, c.titre])),
    nomsMatieres: new Map(matieres.map((m) => [m.id, m.nom])),
    examens: brut.examens,
    tentatives,
    sessions: brut.sessions,
    erreursDues: erreursDues.length,
    incontournablesARevoir,
    aDesDisponibilites: brut.disponibilites.some((d) =>
      Object.values(d.creneaux).some((m) => (m ?? 0) > 0),
    ),
  });

  const estimation = brut.estimations.find((e) => e.statut === 'a_valider');
  const nbAValider =
    brut.fichiers.filter((f) => f.etat === 'modifie').length +
    brut.anomalies.filter((a) => a.statut === 'en_attente').length +
    (estimation ? 1 : 0);

  return {
    ...brut,
    matieres,
    chapitres,
    tentatives,
    maintenant,
    reglages,
    etatPipeline: brut.etat.find((e) => e.id === 'pipeline'),
    estVide: matieres.length === 0,
    aDesDonneesDemo: matieres.some((m) => m.demo),

    matiereParId: indexer(matieres),
    chapitreParId: indexer(chapitres),
    questionParId,
    casParId: indexer(brut.cas),
    partielParId: indexer(brut.partiels),
    ficheParChapitre: new Map(brut.fiches.map((f) => [f.chapitreId, f])),
    questionsParChapitre: grouper(brut.questions, (q) => q.chapitreId),
    chapitresParMatiere: grouper(chapitres, (c) => c.matiereId),
    actualisationsParChapitre: grouper(
      [...brut.actualisations].sort((a, b) => b.changements.length - a.changements.length),
      (a) => a.chapitreId,
    ),

    etats,
    repetitions,
    stats,
    statsMatiere: statsMatieres(listeStats),
    erreurs,
    erreursDues,
    aRevoir,
    profil,
    planning,
    recommandations,
    predictions,
    nbAValider,
    nbNotificationsNonLues: brut.notifications.filter((n) => !n.lu).length,
  };
}
