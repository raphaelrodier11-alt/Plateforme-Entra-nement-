/**
 * Gamification : points, niveaux, séries de jours et badges.
 *
 * Tout est recalculé à partir du journal des tentatives et des sessions ;
 * rien n'est stocké, donc tous les appareils affichent les mêmes valeurs.
 */
import { ajouterJours, cleJour } from './dates';
import type { EtatQuestion } from './marqueurs';
import type { StatsChapitre } from './progression';
import type { Session, Tentative } from './types';

const COEF_DIFFICULTE: Record<number, number> = { 1: 1, 2: 1.2, 3: 1.5 };

export const POINTS = {
  participation: 2,
  bonneReponse: 10,
  sessionTerminee: 15,
  examenTermine: 60,
  examenReussi: 40,
  /** Bonus par jour actif, multiplié par le rang dans la série (plafonné à 7). */
  jourDeSerie: 5,
};

export const NIVEAUX = [
  'Carabin',
  'Externe',
  'Interne',
  'Assistant',
  'Chef de clinique',
  'Praticien hospitalier',
  'Professeur',
  'Doyen',
];

/** Points nécessaires pour atteindre le niveau n (n = 0 au départ). */
export function seuilNiveau(n: number): number {
  return (150 * n * (n + 1)) / 2;
}

export function niveauPour(points: number): number {
  let n = 0;
  while (points >= seuilNiveau(n + 1)) n += 1;
  return n;
}

export function titreNiveau(niveau: number): string {
  return NIVEAUX[Math.min(niveau, NIVEAUX.length - 1)]!;
}

export interface Series {
  /** Série en cours (jours consécutifs, aujourd'hui ou hier inclus). */
  courante: number;
  meilleure: number;
  joursActifs: string[];
}

export function calculerSeries(joursActifs: Iterable<string>, maintenant: number): Series {
  const jours = [...new Set(joursActifs)].sort();
  const ensemble = new Set(jours);
  let meilleure = 0;
  let longueur = 0;
  let precedent: string | undefined;
  for (const jour of jours) {
    longueur = precedent && ajouterJours(precedent, 1) === jour ? longueur + 1 : 1;
    meilleure = Math.max(meilleure, longueur);
    precedent = jour;
  }

  const aujourdHui = cleJour(maintenant);
  // La série tient encore si la dernière révision date d'hier.
  let jour = ensemble.has(aujourdHui) ? aujourdHui : ajouterJours(aujourdHui, -1);
  let courante = 0;
  while (ensemble.has(jour)) {
    courante += 1;
    jour = ajouterJours(jour, -1);
  }
  return { courante, meilleure, joursActifs: jours };
}

export interface ContexteBadges {
  tentatives: Tentative[];
  sessions: Session[];
  etats: Map<string, EtatQuestion>;
  stats: StatsChapitre[];
  series: Series;
  /** Questions incontournables réussies à leur dernière tentative. */
  incontournablesReussies: number;
}

export interface DefinitionBadge {
  id: string;
  nom: string;
  description: string;
  /** Nom d'icône (voir le composant d'icônes de l'application). */
  icone: string;
  cible: number;
  valeur: (c: ContexteBadges) => number;
}

function maxParJour(tentatives: Tentative[]): number {
  const parJour = new Map<string, number>();
  for (const t of tentatives) {
    const jour = cleJour(t.date);
    parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
  }
  return Math.max(0, ...parJour.values());
}

function tauxSession(s: Session): number {
  return s.questionIds.length ? (s.points ?? 0) / s.questionIds.length : 0;
}

const estExamen = (s: Session) => s.type === 'examen_blanc' || s.type === 'examen_general';

export const BADGES: DefinitionBadge[] = [
  {
    id: 'premier_pas',
    nom: 'Premier pas',
    description: 'Répondre à une première question',
    icone: 'footprints',
    cible: 1,
    valeur: (c) => c.tentatives.length,
  },
  {
    id: 'cent',
    nom: 'Centurion',
    description: 'Répondre à 100 questions',
    icone: 'target',
    cible: 100,
    valeur: (c) => c.tentatives.length,
  },
  {
    id: 'mille',
    nom: 'Mille et une réponses',
    description: 'Répondre à 1 000 questions',
    icone: 'mountain',
    cible: 1000,
    valeur: (c) => c.tentatives.length,
  },
  {
    id: 'serie_3',
    nom: 'Lancé',
    description: 'Réviser 3 jours de suite',
    icone: 'flame',
    cible: 3,
    valeur: (c) => c.series.meilleure,
  },
  {
    id: 'serie_7',
    nom: 'Semaine parfaite',
    description: 'Réviser 7 jours de suite',
    icone: 'flame',
    cible: 7,
    valeur: (c) => c.series.meilleure,
  },
  {
    id: 'serie_30',
    nom: 'Métronome',
    description: 'Réviser 30 jours de suite',
    icone: 'flame',
    cible: 30,
    valeur: (c) => c.series.meilleure,
  },
  {
    id: 'sans_faute',
    nom: 'Sans faute',
    description: 'Terminer un QCM de 10 questions ou plus à 100 %',
    icone: 'sparkles',
    cible: 1,
    valeur: (c) =>
      c.sessions.filter((s) => s.termine && s.questionIds.length >= 10 && tauxSession(s) === 1)
        .length,
  },
  {
    id: 'chapitre_acquis',
    nom: 'Chapitre bouclé',
    description: 'Faire passer un chapitre au statut « acquis »',
    icone: 'book-check',
    cible: 1,
    valeur: (c) => c.stats.filter((s) => s.statut === 'acquis').length,
  },
  {
    id: 'cinq_chapitres',
    nom: 'Tête bien pleine',
    description: 'Avoir 5 chapitres acquis',
    icone: 'library',
    cible: 5,
    valeur: (c) => c.stats.filter((s) => s.statut === 'acquis').length,
  },
  {
    id: 'pieges',
    nom: 'Démineur',
    description: 'Réussir 10 questions piégeuses',
    icone: 'shield-check',
    cible: 10,
    valeur: (c) => [...c.etats.values()].filter((e) => e.aRevoir).length,
  },
  {
    id: 'incontournables',
    nom: 'Valeurs sûres',
    description: 'Réussir 20 questions incontournables',
    icone: 'star',
    cible: 20,
    valeur: (c) => c.incontournablesReussies,
  },
  {
    id: 'examen_blanc',
    nom: 'Baptême du feu',
    description: 'Terminer un examen blanc',
    icone: 'timer',
    cible: 1,
    valeur: (c) => c.sessions.filter((s) => s.termine && estExamen(s)).length,
  },
  {
    id: 'mention',
    nom: 'Mention',
    description: 'Obtenir 15/20 ou plus à un examen blanc',
    icone: 'award',
    cible: 1,
    valeur: (c) =>
      c.sessions.filter((s) => s.termine && estExamen(s) && tauxSession(s) >= 0.75).length,
  },
  {
    id: 'marathon',
    nom: 'Marathon',
    description: 'Répondre à 100 questions dans la même journée',
    icone: 'zap',
    cible: 100,
    valeur: (c) => maxParJour(c.tentatives),
  },
];

export interface BadgeCalcule {
  definition: DefinitionBadge;
  valeur: number;
  obtenu: boolean;
  /** Progression vers le badge, entre 0 et 1. */
  progression: number;
}

export interface Profil {
  points: number;
  niveau: number;
  titre: string;
  /** Points acquis dans le niveau courant et points nécessaires pour le suivant. */
  pointsDansNiveau: number;
  pointsDuNiveau: number;
  series: Series;
  badges: BadgeCalcule[];
}

export function calculerPoints(
  tentatives: Tentative[],
  sessions: Session[],
  difficultes: Map<string, number>,
  series: Series,
): number {
  let points = 0;
  for (const t of tentatives) {
    const coef = COEF_DIFFICULTE[difficultes.get(t.questionId) ?? 1] ?? 1;
    points += POINTS.participation + POINTS.bonneReponse * t.points * coef;
  }
  for (const s of sessions) {
    if (!s.termine) continue;
    if (estExamen(s)) {
      points += POINTS.examenTermine;
      if (tauxSession(s) >= 0.75) points += POINTS.examenReussi;
    } else {
      points += POINTS.sessionTerminee;
    }
  }
  // Bonus de régularité : chaque jour actif rapporte davantage au fil de la série.
  let rang = 0;
  let precedent: string | undefined;
  for (const jour of series.joursActifs) {
    rang = precedent && ajouterJours(precedent, 1) === jour ? rang + 1 : 1;
    points += POINTS.jourDeSerie * Math.min(rang, 7);
    precedent = jour;
  }
  return Math.round(points);
}

export function calculerProfil(
  contexte: Omit<ContexteBadges, 'series'>,
  difficultes: Map<string, number>,
  maintenant: number,
): Profil {
  const series = calculerSeries(
    contexte.tentatives.map((t) => cleJour(t.date)),
    maintenant,
  );
  const points = calculerPoints(contexte.tentatives, contexte.sessions, difficultes, series);
  const niveau = niveauPour(points);
  const complet: ContexteBadges = { ...contexte, series };
  const badges = BADGES.map((definition) => {
    const valeur = definition.valeur(complet);
    return {
      definition,
      valeur,
      obtenu: valeur >= definition.cible,
      progression: Math.min(1, valeur / definition.cible),
    };
  });
  return {
    points,
    niveau,
    titre: titreNiveau(niveau),
    pointsDansNiveau: points - seuilNiveau(niveau),
    pointsDuNiveau: seuilNiveau(niveau + 1) - seuilNiveau(niveau),
    series,
    badges,
  };
}
