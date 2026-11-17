/**
 * Collections de documents et droits d'écriture.
 *
 * - `contenu` : produit par le pipeline d'import, en lecture seule pour l'app ;
 * - `utilisateur` : écrit par l'app (progression, planning, décisions) ;
 * - `interne` : réservé au pipeline, jamais envoyé aux appareils.
 */
export type Portee = 'contenu' | 'utilisateur' | 'interne';

export const COLLECTIONS = {
  matieres: 'contenu',
  chapitres: 'contenu',
  fichiers: 'contenu',
  depots: 'contenu',
  actualisations: 'contenu',
  partiels: 'contenu',
  questions: 'contenu',
  cas: 'contenu',
  fiches: 'contenu',
  flashcards: 'contenu',
  anomalies: 'contenu',
  illisibles: 'contenu',
  estimations: 'contenu',
  etat: 'contenu',
  // Les notifications sont créées par le pipeline ; l'app y écrit « lu ».
  notifications: 'utilisateur',
  tentatives: 'utilisateur',
  sessions: 'utilisateur',
  disponibilites: 'utilisateur',
  examens: 'utilisateur',
  evenements: 'utilisateur',
  reglages: 'utilisateur',
  decisions: 'utilisateur',
  taches: 'utilisateur',
  revues: 'utilisateur',
  // Assistant : conversations, documents demandés et leur file d'attente.
  conversations: 'utilisateur',
  documents: 'utilisateur',
  demandes: 'utilisateur',
  // Textes extraits des fichiers : volumineux, utiles au seul pipeline.
  textes: 'interne',
} as const satisfies Record<string, Portee>;

export type Collection = keyof typeof COLLECTIONS;

export const NOMS_COLLECTIONS = Object.keys(COLLECTIONS) as Collection[];

export function estCollection(nom: string): nom is Collection {
  return Object.prototype.hasOwnProperty.call(COLLECTIONS, nom);
}

/** Collections envoyées aux appareils lors de la synchronisation. */
export const COLLECTIONS_CLIENT = NOMS_COLLECTIONS.filter(
  (c) => COLLECTIONS[c] !== 'interne',
);

/** Collections que l'app a le droit d'écrire. */
export function inscriptibleParApp(c: Collection): boolean {
  return COLLECTIONS[c] === 'utilisateur';
}

/** Document tel qu'il circule entre le serveur, l'app et le pipeline. */
export interface DocSync {
  collection: Collection;
  id: string;
  /** Contenu du document ; absent si le document est supprimé. */
  data?: unknown;
  /** Horodatage de la dernière modification (ms), sert d'arbitre en cas de conflit. */
  majLe: number;
  supprime?: boolean;
  /** Numéro de révision attribué par le serveur (curseur de synchronisation). */
  rev?: number;
}
