/**
 * Modèle de données de Dr Rodier.
 *
 * Tous les enregistrements sont des « documents » JSON identifiés par
 * (collection, id). Ils sont stockés tels quels dans la base serveur (D1)
 * et dans la copie locale (IndexedDB), ce qui permet une synchronisation
 * générique. Voir `shared/collections.ts` pour la liste des collections.
 */

// ---------------------------------------------------------------------------
// Contenu pédagogique (écrit par le pipeline d'import, lu par l'application)
// ---------------------------------------------------------------------------

export interface Matiere {
  id: string;
  nom: string;
  ordre: number;
  /** Format habituel des partiels de la matière, déduit des annales. */
  formatPartiel?: FormatPartiel;
  demo?: boolean;
}

export interface FormatPartiel {
  nbQuestions: number;
  /** Durée moyenne par question, en minutes (bornée entre 1 et 2 à l'usage). */
  minutesParQuestion: number;
}

export interface Chapitre {
  id: string;
  matiereId: string;
  titre: string;
  ordre: number;
  resume?: string;
  /** Fichiers du drive rattachés à ce chapitre. */
  fichierIds: string[];
  /** Un fichier source a changé : mise à jour en attente de validation. */
  majEnAttente?: boolean;
  /** Chapitre apparu récemment (badge « nouveau »). */
  nouveau?: boolean;
  /** Erratums validés sur les fichiers sources (jamais écrits dans le drive). */
  erratums?: string[];
  /** Marqueurs du pipeline : fiche et QCM à (re)générer, erreurs à rechercher. */
  aGenerer?: boolean;
  aVerifier?: boolean;
  /** Comparaison avec les versions plus anciennes à (re)faire. */
  aComparer?: boolean;
  /** Date de création, pour retirer le badge « nouveau » au bout de deux semaines. */
  creeLe?: number;
  version: number;
  demo?: boolean;
}

/**
 * `ancien` : version plus ancienne d'un cours, gardée uniquement pour être
 * comparée au cours actuel (elle ne produit ni fiche ni QCM).
 */
export type RoleFichier = 'cours' | 'annale' | 'corrige' | 'ancien' | 'autre';

/**
 * - `nouveau` : jamais traité ;
 * - `a_jour` : traité dans sa version actuelle ;
 * - `modifie` : modifié dans le drive, en attente de validation ;
 * - `maj_validee` : mise à jour validée, à traiter au prochain passage ;
 * - `supprime` : disparu du drive.
 */
export type EtatFichier = 'nouveau' | 'a_jour' | 'modifie' | 'maj_validee' | 'supprime';

export interface Fichier {
  /** Identifiant du fichier dans Google Drive. */
  id: string;
  nom: string;
  /** Chemin lisible depuis le dossier racine (dossiers séparés par « / »). */
  chemin: string;
  mimeType: string;
  role: RoleFichier;
  etat: EtatFichier;
  /** Date de modification dans le drive (ISO). */
  modifieLe: string;
  /** Version (date de modification) effectivement traitée par le pipeline. */
  versionTraitee?: string;
  /** Version que l'utilisateur a refusé d'intégrer. */
  versionIgnoree?: string;
  empreinte?: string;
  nbPages?: number;
  matiereId?: string;
  chapitreId?: string;
  partielId?: string;
  lien?: string;
  /** Nombre d'échecs de traitement ; au-delà de 3, le fichier est laissé de côté. */
  echecs?: number;
}

export interface Partiel {
  id: string;
  matiereId: string;
  libelle: string;
  /** Date ou année du partiel si elle a pu être déterminée (ISO ou « 2024 »). */
  date?: string;
  nbQuestions?: number;
  dureeMin?: number;
  demo?: boolean;
}

export type TypeQuestion = 'simple' | 'multiple' | 'vrai_faux' | 'trous';

export interface Proposition {
  id: string;
  texte: string;
  /** Choix simple/multiple : bonne réponse. Vrai/faux : l'affirmation est vraie. */
  correcte: boolean;
  explication?: string;
}

export interface Trou {
  id: string;
  /** Réponses acceptées (comparées sans casse ni accents). */
  reponses: string[];
}

export interface OccurrenceAnnale {
  partielId: string;
  fichierId?: string;
  numero?: string;
  page?: number;
}

export type OrigineCorrige = 'officiel' | 'propose_ia' | 'absent';

export interface Question {
  id: string;
  matiereId: string;
  chapitreId: string;
  type: TypeQuestion;
  /** Pour le type `trous`, l'énoncé contient des marqueurs {{id}}. */
  enonce: string;
  propositions?: Proposition[];
  trous?: Trou[];
  /** Explication affichée après chaque réponse (toujours présente). */
  explication: string;
  /** Rappel de cours associé, affiché avec les erreurs. */
  rappel?: string;
  /** Section de la fiche du chapitre à relire. */
  sectionFiche?: string;
  difficulte: 1 | 2 | 3;
  source: 'annale' | 'genere';
  /** Cas clinique auquel appartient la question. */
  casId?: string;
  ordreCas?: number;
  /** Question gardée en réserve pour les examens blancs (inédite). */
  reserveExamen?: boolean;
  /** Signalée par le générateur comme contenant un piège classique. */
  piege?: boolean;
  /** Annales : partiels où la question est tombée. */
  occurrences?: OccurrenceAnnale[];
  corrige?: OrigineCorrige;
  version: number;
  demo?: boolean;
}

export interface CasClinique {
  id: string;
  matiereId: string;
  chapitreId: string;
  titre: string;
  vignette: string;
  demo?: boolean;
}

export interface NoeudArbre {
  label: string;
  detail?: string;
  branches?: { condition: string; noeud: NoeudArbre }[];
}

export interface Objet3D {
  id: string;
  forme: 'sphere' | 'boite' | 'cylindre' | 'tore' | 'tube' | 'cone';
  /** Position du centre [x, y, z]. Pour `tube` : ignorée, voir `chemin`. */
  position?: [number, number, number];
  /**
   * Dimensions : [rayon] pour une sphère ou un tube, [rayon, hauteur] pour un
   * cylindre ou un cône, [rayon, épaisseur] pour un tore, [x, y, z] pour une boîte.
   */
  taille?: number[];
  rotation?: [number, number, number];
  /** Points de passage d'un tube. */
  chemin?: [number, number, number][];
  couleur: string;
  opacite?: number;
  label?: string;
  detail?: string;
}

export interface Etape3D {
  titre: string;
  texte: string;
  /** Objets mis en évidence pendant l'étape. */
  focus?: string[];
  /** Objets masqués pendant l'étape. */
  masques?: string[];
  /** Flux animé le long d'un tube (particules). */
  flux?: { tube: string; couleur?: string }[];
  camera?: [number, number, number];
}

export interface Scene3D {
  titre: string;
  description?: string;
  objets: Objet3D[];
  etapes: Etape3D[];
}

export type BlocFiche =
  | { type: 'texte'; contenu: string }
  | { type: 'liste'; titre?: string; elements: string[] }
  | { type: 'cles'; elements: string[] }
  | { type: 'pieges'; elements: string[] }
  | { type: 'arbre'; titre?: string; racine: NoeudArbre }
  | {
      type: 'schema';
      titre?: string;
      noeuds: { id: string; label: string; detail?: string }[];
      liens: { de: string; vers: string; label?: string }[];
    }
  | { type: 'etapes'; titre?: string; etapes: { titre: string; detail: string }[] }
  | { type: 'mnemo'; phrase: string; signification: string[] }
  | { type: 'scene3d'; scene: Scene3D };

export interface SectionFiche {
  id: string;
  titre: string;
  blocs: BlocFiche[];
}

export interface Fiche {
  /** Identique à l'identifiant du chapitre. */
  id: string;
  chapitreId: string;
  matiereId: string;
  titre: string;
  sections: SectionFiche[];
  version: number;
  genereLe: number;
  demo?: boolean;
}

export interface Flashcard {
  id: string;
  matiereId: string;
  chapitreId: string;
  recto: string;
  verso: string;
  demo?: boolean;
}

// ---------------------------------------------------------------------------
// Détection d'erreurs dans les sources, validations et journal
// ---------------------------------------------------------------------------

export type TypeAnomalie =
  | 'reponse_fausse'
  | 'contradiction'
  | 'faute'
  | 'incoherence'
  | 'mal_classee';

/** Modification applicable aux données de l'app (jamais aux fichiers du drive). */
export type Patch =
  | { op: 'reponses'; questionId: string; correctes: string[] }
  | { op: 'deplacer'; questionId: string; chapitreId: string; matiereId: string }
  | {
      op: 'texte';
      questionId: string;
      champ: 'enonce' | 'explication' | 'rappel';
      apres: string;
    }
  | { op: 'erratum'; chapitreId: string; note: string };

export interface Anomalie {
  id: string;
  type: TypeAnomalie;
  cible: {
    fichierId?: string;
    fichierNom?: string;
    chapitreId?: string;
    questionId?: string;
    page?: number;
    ligne?: number;
    /** Passage concerné, cité tel qu'il apparaît dans la source. */
    extrait?: string;
  };
  description: string;
  /** Correction exacte proposée. */
  correction: string;
  /** Explication courte. */
  explication: string;
  /** Source qui justifie la correction (cours, page, référence). */
  source: string;
  patch?: Patch;
  statut: 'en_attente' | 'validee' | 'refusee';
  creeLe: number;
  decideLe?: number;
  demo?: boolean;
}

/** Passage que la reconnaissance de texte n'a pas pu lire avec certitude. */
export interface PassageIllisible {
  id: string;
  fichierId: string;
  fichierNom: string;
  page?: number;
  contexte: string;
  creeLe: number;
}

export type TypeNotification =
  | 'fichier_modifie'
  | 'fichier_supprime'
  | 'nouveau_chapitre'
  | 'actualisation'
  | 'generation'
  | 'anomalies'
  | 'estimation'
  | 'illisible'
  | 'info';

export interface NotificationApp {
  id: string;
  type: TypeNotification;
  titre: string;
  message: string;
  chapitreId?: string;
  fichierId?: string;
  date: number;
  lu?: boolean;
}

/** Décision de l'utilisateur sur une anomalie ou sur un fichier modifié. */
export interface Decision {
  /** `anomalie:<id>` ou `fichier:<id>`. */
  id: string;
  cible: 'anomalie' | 'fichier';
  cibleId: string;
  decision: 'validee' | 'refusee';
  date: number;
  /** Résumé conservé pour le journal, même si la cible disparaît. */
  resume?: string;
}

export interface LigneEstimation {
  etape: string;
  modele: string;
  appels: number;
  tokensEntree: number;
  tokensSortie: number;
  coutUsd: number;
}

export interface Estimation {
  id: string;
  date: number;
  lignes: LigneEstimation[];
  /** Coût unique de la génération complète. */
  totalUsd: number;
  /** Coût mensuel estimé en régime de croisière. */
  mensuelUsd: number;
  tauxEurParUsd: number;
  hypotheses: string[];
  tarifs: TarifModele[];
  /** Palier gratuit : aucune dépense ; les montants sont alors à zéro. */
  gratuit?: boolean;
  /** Valeur de la génération au tarif payant (non facturée en mode gratuit). */
  equivalentUsd?: number;
  statut: 'a_valider' | 'approuvee' | 'perimee';
}

export interface TarifModele {
  modele: string;
  /** Dollars par million de tokens. */
  entreeUsdParM: number;
  sortieUsdParM: number;
  /** Les tarifs viennent d'un tableau interne et doivent être vérifiés. */
  aVerifier: boolean;
}

export type TypeTache =
  | 'generation_complete'
  | 'regenerer_chapitre'
  | 'plus_de_questions'
  | 'verifier_drive';

export interface Tache {
  id: string;
  type: TypeTache;
  statut: 'en_attente' | 'en_cours' | 'terminee' | 'erreur';
  chapitreId?: string;
  creeLe: number;
  majLe: number;
  message?: string;
}

export interface EtatPipeline {
  id: 'pipeline';
  dernierScan?: number;
  dernierPassage?: number;
  statut: 'jamais_lance' | 'en_cours' | 'ok' | 'erreur' | 'en_attente_validation';
  message?: string;
  nbFichiers?: number;
  nbChapitres?: number;
  nbQuestions?: number;
  driveConnecte?: boolean;
  /** Dépense d'IA cumulée sur le mois en cours (AAAA-MM), en dollars. */
  depense?: { mois: string; usd: number };
  modeles?: { masse: string; expert: string };
}

// ---------------------------------------------------------------------------
// Données de l'utilisateur (écrites par l'application, synchronisées)
// ---------------------------------------------------------------------------

export interface ReponseDonnee {
  /** Choix simple / multiple : identifiants cochés. */
  cochees?: string[];
  /** Vrai/faux : jugement porté sur chaque affirmation. */
  jugements?: Record<string, boolean>;
  /** Texte à trous : texte saisi pour chaque trou. */
  textes?: Record<string, string>;
}

export type TypeErreur = 'inattention' | 'lacune' | 'piege';

export type ContexteTentative =
  | 'qcm'
  | 'examen_blanc'
  | 'examen_general'
  | 'revision_erreurs';

export interface Tentative {
  id: string;
  questionId: string;
  chapitreId: string;
  matiereId: string;
  date: number;
  reponse: ReponseDonnee;
  nbErreurs: number;
  points: number;
  typeErreur?: TypeErreur;
  sessionId?: string;
  contexte: ContexteTentative;
  dureeMs?: number;
}

export interface Session {
  id: string;
  type: ContexteTentative;
  titre: string;
  debut: number;
  fin?: number;
  matiereId?: string;
  chapitreIds?: string[];
  questionIds: string[];
  /** Limite de temps pour les examens chronométrés. */
  dureeLimiteMs?: number;
  points?: number;
  termine: boolean;
}

export type Creneau = 'matin' | 'midi' | 'apres_midi' | 'soir';

export const CRENEAUX: Creneau[] = ['matin', 'midi', 'apres_midi', 'soir'];

/** Disponibilités d'un jour : durée de révision (minutes) par créneau coché. */
export interface Disponibilite {
  /** Jour au format AAAA-MM-JJ. */
  id: string;
  creneaux: Partial<Record<Creneau, number>>;
}

export interface Examen {
  id: string;
  matiereId: string;
  titre: string;
  /** Jour au format AAAA-MM-JJ. */
  date: string;
  source: 'manuel' | 'icloud';
  /** Événement du calendrier à l'origine de l'examen. */
  evenementId?: string;
}

export interface Evenement {
  id: string;
  titre: string;
  /** Début et fin en millisecondes (heure universelle). */
  debut: number;
  fin: number;
  journeeEntiere: boolean;
}

export interface Reglages {
  id: 'principal';
  /** Lien .ics public du calendrier iCloud. */
  icsUrl?: string;
  motsClesExamen: string[];
  /** Plage horaire de chaque créneau, en heures [début, fin]. */
  heuresCreneaux: Record<Creneau, [number, number]>;
  /** Durée de séance proposée par défaut quand on coche un créneau. */
  dureeDefautMin: number;
  /** Événements du calendrier que l'utilisateur ne veut pas traiter en examen. */
  evenementsIgnores: string[];
  dossierCours?: string;
  dossierAnnales?: string;
  /** Dossier des anciennes versions des cours (facultatif), comparées aux cours actuels. */
  dossierAnciens?: string;
  /**
   * Mode gratuit (par défaut) : seul le palier gratuit de Gemini est utilisé,
   * avec un seul modèle et un rythme limité. Rien ne peut être facturé.
   */
  modeGratuit?: boolean;
  modeleMasse?: string;
  modeleExpert?: string;
  /** Tarifs imposés, par rôle : `modele` vaut « masse » ou « expert ». */
  tarifs?: TarifModele[];
  /** Plafond de dépense d'IA par mois, en dollars (sinon calculé d'après l'estimation). */
  plafondMensuelUsd?: number;
  majLe?: number;
}

export const REGLAGES_DEFAUT: Reglages = {
  id: 'principal',
  motsClesExamen: ['examen', 'partiel', 'exam'],
  heuresCreneaux: {
    matin: [8, 12],
    midi: [12, 14],
    apres_midi: [14, 18],
    soir: [18, 22],
  },
  dureeDefautMin: 90,
  evenementsIgnores: [],
};

/** Révision d'une flashcard (auto-évaluation). */
export interface RevueFlash {
  /** Identifiant de la flashcard. */
  id: string;
  date: number;
  /** Nombre de réussites consécutives. */
  serie: number;
  echeance: number;
}

// ---------------------------------------------------------------------------
// Données internes au pipeline (jamais envoyées aux appareils)
// ---------------------------------------------------------------------------

export interface PageTexte {
  /** Numéro de page (ou de diapositive), à partir de 1. */
  n: number;
  texte: string;
  /** `couche` : texte présent dans le fichier ; `ocr` : lu par l'IA ; `vide` : rien d'exploitable. */
  source: 'couche' | 'ocr' | 'vide';
}

/** Texte extrait d'un fichier du drive, page par page. */
export interface TexteFichier {
  /** Identifiant du fichier, suivi de « #n » si le texte est découpé en plusieurs documents. */
  id: string;
  fichierId: string;
  /** Version du fichier (date de modification) à laquelle correspond ce texte. */
  version: string;
  pages: PageTexte[];
  /** Pages sans texte exploitable, à faire lire par l'IA (scans, images). */
  pagesAOcr: number[];
}

// ---------------------------------------------------------------------------
// Dépôt de fichiers (envoi direct depuis l'application, sans Google Drive)
// ---------------------------------------------------------------------------

export type RoleDepot = 'cours' | 'annales' | 'anciens';

/**
 * Fichier envoyé depuis l'app. Son contenu est conservé par le serveur, en
 * morceaux, jusqu'à ce que le pipeline l'ait lu ; ici ne figure que sa fiche.
 */
export interface Depot {
  id: string;
  nom: string;
  /** Chemin d'origine (dossiers compris), pour distinguer deux fichiers de même nom. */
  chemin?: string;
  role: RoleDepot;
  mimeType: string;
  taille: number;
  /** Nombre de morceaux du contenu. */
  morceaux: number;
  /** Version du contenu (instant d'envoi) : un nouvel envoi du même fichier la change. */
  v: number;
  ajouteLe: number;
  /** Date de la version actuelle, au format ISO (sert de « date de modification »). */
  modifieLe: string;
}

// ---------------------------------------------------------------------------
// Actualisations : ce qui a changé d'une version d'un cours à l'autre
// ---------------------------------------------------------------------------

export interface Changement {
  type: 'ajout' | 'retrait' | 'modification';
  /** Une valeur, un seuil, un traitement ou une définition qui change = majeure. */
  importance: 'majeure' | 'mineure';
  sujet: string;
  /** Ce que disait l'ancienne version. */
  avant?: string;
  /** Ce que dit la version actuelle. */
  apres?: string;
  page?: number;
}

/**
 * Comparaison d'un chapitre avec une version plus ancienne : soit un fichier
 * d'une ancienne série (« anciens »), soit la version précédente du même
 * fichier avant son remplacement.
 */
export interface Actualisation {
  id: string;
  chapitreId: string;
  matiereId: string;
  origine: 'ancien' | 'precedente';
  /** Empreinte des versions comparées : la comparaison est refaite quand elle change. */
  signature: string;
  resume: string;
  changements: Changement[];
  comparesLe: number;
  /** Noms des fichiers de l'ancienne version. */
  fichiers: string[];
  demo?: boolean;
}
