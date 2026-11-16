/**
 * Avancement et statut des chapitres.
 *
 * Pour chaque question, seule la dernière tentative compte :
 *  - couverture = questions tentées / questions du chapitre ;
 *  - maîtrise   = moyenne des points des questions tentées ;
 *  - avancement = somme des points / questions du chapitre
 *                 (autrement dit couverture × maîtrise).
 */
import type { EtatQuestion } from './marqueurs';
import { estIncontournable } from './marqueurs';
import type { EtatRepetition } from './repetition';
import type { Chapitre, Question } from './types';

export type StatutChapitre = 'a_commencer' | 'en_cours' | 'acquis' | 'a_revoir';

export const LIBELLE_STATUT: Record<StatutChapitre, string> = {
  a_commencer: 'À commencer',
  en_cours: 'En cours',
  acquis: 'Acquis',
  a_revoir: 'À revoir',
};

/** Seuils du statut, regroupés pour être ajustés facilement. */
export const SEUILS = {
  /** Avancement minimal pour « acquis ». */
  avancementAcquis: 0.7,
  /** Maîtrise minimale pour « acquis ». */
  maitriseAcquis: 0.8,
  /** Maîtrise sous laquelle un chapitre travaillé passe « à revoir ». */
  maitriseARevoir: 0.5,
  /** Nombre de questions tentées avant de juger la maîtrise. */
  tenteesMin: 5,
  /** Part de questions en erreur qui fait passer « à revoir ». */
  partErreursARevoir: 0.3,
};

export interface StatsChapitre {
  chapitreId: string;
  matiereId: string;
  /** Questions d'entraînement (hors réserve d'examen blanc). */
  nbQuestions: number;
  nbTentees: number;
  couverture: number;
  maitrise: number;
  avancement: number;
  statut: StatutChapitre;
  /** Questions actuellement dans la liste d'erreurs. */
  nbErreurs: number;
  nbPiegeuses: number;
  nbARevoir: number;
  /** Erreurs arrivées à échéance de répétition espacée. */
  erreursDues: number;
  /** Nombre de fois où des questions du chapitre sont tombées aux partiels. */
  nbOccurrencesAnnales: number;
  nbIncontournables: number;
  /** Part du chapitre dans les partiels de sa matière (somme = 1 par matière). */
  poidsExamen: number;
  derniereActivite?: number;
}

export function statutChapitre(s: {
  nbTentees: number;
  maitrise: number;
  avancement: number;
  nbErreurs: number;
}): StatutChapitre {
  if (s.nbTentees === 0) return 'a_commencer';
  if (s.avancement >= SEUILS.avancementAcquis && s.maitrise >= SEUILS.maitriseAcquis) {
    return 'acquis';
  }
  if (s.nbTentees >= SEUILS.tenteesMin) {
    if (s.maitrise < SEUILS.maitriseARevoir) return 'a_revoir';
    if (s.nbErreurs / s.nbTentees >= SEUILS.partErreursARevoir) return 'a_revoir';
  }
  return 'en_cours';
}

export function statsChapitres(
  chapitres: Pick<Chapitre, 'id' | 'matiereId'>[],
  questions: Pick<Question, 'id' | 'chapitreId' | 'occurrences' | 'reserveExamen'>[],
  etats: Map<string, EtatQuestion>,
  repetitions: Map<string, EtatRepetition>,
  maintenant: number,
): Map<string, StatsChapitre> {
  const stats = new Map<string, StatsChapitre>();
  for (const c of chapitres) {
    stats.set(c.id, {
      chapitreId: c.id,
      matiereId: c.matiereId,
      nbQuestions: 0,
      nbTentees: 0,
      couverture: 0,
      maitrise: 0,
      avancement: 0,
      statut: 'a_commencer',
      nbErreurs: 0,
      nbPiegeuses: 0,
      nbARevoir: 0,
      erreursDues: 0,
      nbOccurrencesAnnales: 0,
      nbIncontournables: 0,
      poidsExamen: 0,
    });
  }

  const points = new Map<string, number>();
  for (const q of questions) {
    const s = stats.get(q.chapitreId);
    if (!s) continue;
    s.nbOccurrencesAnnales += q.occurrences?.length ?? 0;
    if (estIncontournable(q)) s.nbIncontournables += 1;

    const etat = etats.get(q.id);
    // Une question de réserve n'entre dans l'avancement qu'une fois vue.
    if (q.reserveExamen && !etat) continue;
    s.nbQuestions += 1;
    if (!etat) continue;

    s.nbTentees += 1;
    points.set(q.chapitreId, (points.get(q.chapitreId) ?? 0) + etat.derniersPoints);
    if (etat.dansListeErreurs) s.nbErreurs += 1;
    if (etat.piegeuse) s.nbPiegeuses += 1;
    if (etat.aRevoir) s.nbARevoir += 1;
    const rep = repetitions.get(q.id);
    if (rep && rep.echeance <= maintenant && (etat.dansListeErreurs || etat.aRevoir)) {
      s.erreursDues += 1;
    }
    s.derniereActivite = Math.max(s.derniereActivite ?? 0, etat.derniereDate);
  }

  // Poids aux examens : part lissée des occurrences d'annales dans la matière.
  const totalParMatiere = new Map<string, number>();
  for (const s of stats.values()) {
    totalParMatiere.set(
      s.matiereId,
      (totalParMatiere.get(s.matiereId) ?? 0) + s.nbOccurrencesAnnales + 1,
    );
  }

  for (const s of stats.values()) {
    const p = points.get(s.chapitreId) ?? 0;
    s.couverture = s.nbQuestions ? s.nbTentees / s.nbQuestions : 0;
    s.maitrise = s.nbTentees ? p / s.nbTentees : 0;
    s.avancement = s.nbQuestions ? p / s.nbQuestions : 0;
    s.statut = statutChapitre(s);
    s.poidsExamen = (s.nbOccurrencesAnnales + 1) / (totalParMatiere.get(s.matiereId) ?? 1);
  }
  return stats;
}

export interface StatsMatiere {
  matiereId: string;
  nbChapitres: number;
  nbAcquis: number;
  avancement: number;
  maitrise: number;
  nbErreurs: number;
}

/** Agrège les chapitres d'une matière (avancement pondéré par la taille). */
export function statsMatieres(stats: Iterable<StatsChapitre>): Map<string, StatsMatiere> {
  const cumuls = new Map<
    string,
    StatsMatiere & { questions: number; tentees: number; points: number; pointsTentees: number }
  >();
  for (const s of stats) {
    const m =
      cumuls.get(s.matiereId) ??
      {
        matiereId: s.matiereId,
        nbChapitres: 0,
        nbAcquis: 0,
        avancement: 0,
        maitrise: 0,
        nbErreurs: 0,
        questions: 0,
        tentees: 0,
        points: 0,
        pointsTentees: 0,
      };
    m.nbChapitres += 1;
    if (s.statut === 'acquis') m.nbAcquis += 1;
    m.nbErreurs += s.nbErreurs;
    m.questions += s.nbQuestions;
    m.tentees += s.nbTentees;
    m.points += s.avancement * s.nbQuestions;
    m.pointsTentees += s.maitrise * s.nbTentees;
    cumuls.set(s.matiereId, m);
  }
  const resultat = new Map<string, StatsMatiere>();
  for (const [id, m] of cumuls) {
    resultat.set(id, {
      matiereId: id,
      nbChapitres: m.nbChapitres,
      nbAcquis: m.nbAcquis,
      nbErreurs: m.nbErreurs,
      avancement: m.questions ? m.points / m.questions : 0,
      maitrise: m.tentees ? m.pointsTentees / m.tentees : 0,
    });
  }
  return resultat;
}
