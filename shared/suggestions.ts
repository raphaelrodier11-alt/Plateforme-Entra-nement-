/**
 * Suggestions de documents d'aide.
 *
 * Calculées dans l'appli à partir de ce qu'elle sait déjà (erreurs, mises à
 * jour des cours, partiels proches…) : aucune requête d'IA, donc aucun coût
 * ni quota. L'IA n'intervient qu'au moment où tu acceptes de créer le document.
 */
import { joursEntre } from './dates';
import type { StatsChapitre } from './progression';
import type {
  Actualisation,
  Chapitre,
  DemandeDocument,
  DocumentBiblio,
  Examen,
  Fiche,
  Flashcard,
  Matiere,
  TypeDocument,
} from './types';

export interface Suggestion {
  id: string;
  titre: string;
  raison: string;
  type: TypeDocument;
  matiereId: string;
  chapitreId?: string;
  sujet: string;
  consignes?: string;
  priorite: number;
}

export interface EntreeSuggestions {
  matieres: Matiere[];
  chapitres: Chapitre[];
  fiches: Fiche[];
  flashcards: Flashcard[];
  stats: Map<string, StatsChapitre>;
  actualisations: Map<string, Actualisation[]>;
  examens: Examen[];
  documents: DocumentBiblio[];
  demandes: DemandeDocument[];
  /** Jour courant, AAAA-MM-JJ. */
  aujourdHui: string;
}

const JOURS_EXAMEN = 21;

export function suggerer(e: EntreeSuggestions): Suggestion[] {
  const dejaFait = new Set<string>();
  for (const d of e.documents) dejaFait.add(`${d.type}|${d.chapitreId ?? d.matiereId ?? ''}`);
  for (const d of e.demandes) {
    if (d.statut !== 'erreur') dejaFait.add(`${d.type}|${d.chapitreId ?? d.matiereId ?? ''}`);
  }
  const cle = (type: TypeDocument, cible: string) => `${type}|${cible}`;

  const matiere = new Map(e.matieres.map((m) => [m.id, m]));
  const fichesParChapitre = new Set(e.fiches.map((f) => f.chapitreId));
  const cartesParChapitre = new Set(e.flashcards.map((f) => f.chapitreId));
  const suggestions: Suggestion[] = [];
  const ajouter = (s: Omit<Suggestion, 'id'>, cible: string, variante: string) => {
    if (dejaFait.has(cle(s.type, cible))) return;
    suggestions.push({ ...s, id: `${s.type}:${cible}:${variante}` });
  };

  // Partiel proche : une synthèse de la matière (seulement pour le plus proche de chaque matière).
  const dejaExamen = new Set<string>();
  for (const ex of [...e.examens].sort((a, b) => a.date.localeCompare(b.date))) {
    const jours = joursEntre(e.aujourdHui, ex.date);
    const m = ex.matiereId ? matiere.get(ex.matiereId) : undefined;
    if (!m || jours < 0 || jours > JOURS_EXAMEN || dejaExamen.has(m.id)) continue;
    dejaExamen.add(m.id);
    ajouter(
      {
        titre: `Synthèse de ${m.nom} avant le partiel`,
        raison: jours === 0 ? 'Le partiel est aujourd’hui.' : `Partiel dans ${jours} jour${jours > 1 ? 's' : ''}.`,
        type: 'resume',
        matiereId: m.id,
        sujet: `Synthèse de révision de ${m.nom} pour le partiel`,
        consignes: 'Les notions essentielles de toute la matière, hiérarchisées, avec les pièges classiques.',
        priorite: 95 - jours,
      },
      m.id,
      'examen',
    );
  }

  for (const c of e.chapitres) {
    const s = e.stats.get(c.id);
    const m = matiere.get(c.matiereId);
    if (!m) continue;

    // Cours modifié : qu'est-ce qui a changé ?
    const majeure = (e.actualisations.get(c.id) ?? []).find((a) => a.changements.some((x) => x.importance === 'majeure'));
    if (majeure) {
      ajouter(
        {
          titre: `Ce qui a changé dans « ${c.titre} »`,
          raison: 'Le cours a été actualisé.',
          type: 'resume',
          matiereId: m.id,
          chapitreId: c.id,
          sujet: `Ce qui a changé dans ${c.titre}`,
          consignes: `Résume uniquement les changements par rapport à l'ancienne version. ${majeure.resume}`,
          priorite: 80,
        },
        c.id,
        'actualise',
      );
    }

    // Beaucoup d'erreurs : des QCM ciblés.
    if (s && (s.nbErreurs >= 3 || (s.statut === 'a_revoir' && s.nbErreurs >= 2))) {
      ajouter(
        {
          titre: `10 QCM sur mes points faibles : « ${c.titre} »`,
          raison: `${s.nbErreurs} erreurs sur ce chapitre.`,
          type: 'qcm',
          matiereId: m.id,
          chapitreId: c.id,
          sujet: `Mes points faibles en ${c.titre}`,
          consignes: '10 QCM ciblés sur les pièges et les notions les plus souvent ratées',
          priorite: 70 + Math.min(s.nbErreurs, 15),
        },
        c.id,
        'erreurs',
      );
    }

    // Chapitre nouveau, sans flashcards.
    if (c.nouveau && fichesParChapitre.has(c.id) && !cartesParChapitre.has(c.id)) {
      ajouter(
        {
          titre: `Flashcards pour « ${c.titre} »`,
          raison: 'Nouveau chapitre.',
          type: 'flashcards',
          matiereId: m.id,
          chapitreId: c.id,
          sujet: `Flashcards sur ${c.titre}`,
          consignes: '12 flashcards',
          priorite: 60,
        },
        c.id,
        'nouveau',
      );
    }

    // Chapitre important aux partiels : un résumé d'une page.
    if (s && fichesParChapitre.has(c.id) && s.poidsExamen >= 0.12) {
      ajouter(
        {
          titre: `Résumé d’une page : « ${c.titre} »`,
          raison: 'Ce chapitre pèse lourd aux partiels.',
          type: 'resume',
          matiereId: m.id,
          chapitreId: c.id,
          sujet: `Résumé d'une page de ${c.titre}`,
          consignes: 'Une page maximum, les points qui tombent le plus aux partiels',
          priorite: 40 + Math.round(s.poidsExamen * 50),
        },
        c.id,
        'poids',
      );
    }
  }

  return suggestions.sort((a, b) => b.priorite - a.priorite);
}
