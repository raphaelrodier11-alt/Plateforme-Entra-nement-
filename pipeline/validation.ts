/**
 * Validation des réponses de l'IA.
 *
 * Rien de ce que renvoie le modèle n'est enregistré tel quel : chaque
 * réponse est relue, nettoyée et, si elle ne respecte pas les règles (une
 * seule bonne réponse pour un choix simple, explication obligatoire, source
 * obligatoire pour une correction…), écartée.
 */
import type {
  Anomalie,
  BlocFiche,
  NoeudArbre,
  Objet3D,
  Patch,
  Proposition,
  Question,
  Scene3D,
  SectionFiche,
  TypeAnomalie,
  TypeQuestion,
} from '../shared/types';

type Objet = Record<string, unknown>;

function objet(v: unknown): Objet | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Objet) : undefined;
}

function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Texte nettoyé, borné en longueur ; chaîne vide si la valeur n'est pas un texte. */
export function texte(v: unknown, max = 6000): string {
  if (typeof v === 'number') return String(v);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function textes(v: unknown, maxElements = 12, max = 600): string[] {
  return liste(v)
    .map((e) => texte(e, max))
    .filter(Boolean)
    .slice(0, maxElements);
}

function entier(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;
}

/** Empreinte courte et stable d'un texte (FNV-1a), pour fabriquer des identifiants. */
export function empreinte(source: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Identifiant lisible dérivé d'un titre (« Insuffisance cardiaque » → « insuffisance-cardiaque »). */
export function slug(titre: string): string {
  return (
    titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sans-titre'
  );
}

const TYPES: TypeQuestion[] = ['simple', 'multiple', 'vrai_faux', 'trous'];

export interface QuestionBrute {
  type: TypeQuestion;
  enonce: string;
  propositions?: Proposition[];
  trous?: { id: string; reponses: string[] }[];
  explication: string;
  rappel?: string;
  section?: string;
  difficulte: 1 | 2 | 3;
  piege: boolean;
  casRef?: string;
}

function validerPropositions(v: unknown, vraiFaux: boolean): Proposition[] {
  return liste(v)
    .map(objet)
    .filter((p): p is Objet => !!p)
    .map((p, i) => ({
      id: vraiFaux ? String(i + 1) : String.fromCharCode(65 + i),
      texte: texte(p.texte, 800),
      correcte: p.correcte === true,
      ...(texte(p.explication, 600) ? { explication: texte(p.explication, 600) } : {}),
    }))
    .filter((p) => p.texte)
    .slice(0, 6)
    .map((p, i) => ({ ...p, id: vraiFaux ? String(i + 1) : String.fromCharCode(65 + i) }));
}

/** Vérifie une question ; renvoie `undefined` si elle est inutilisable. */
export function validerQuestion(v: unknown): QuestionBrute | undefined {
  const q = objet(v);
  if (!q) return undefined;
  const type = TYPES.find((t) => t === q.type);
  const enonce = texte(q.enonce, 3000);
  // Une explication est exigée pour chaque question, sans exception.
  const explication = texte(q.explication, 3000);
  if (!type || !enonce || !explication) return undefined;

  const difficulte = Math.min(3, Math.max(1, entier(q.difficulte) ?? 2)) as 1 | 2 | 3;
  const commun = {
    type,
    enonce,
    explication,
    difficulte,
    piege: q.piege === true,
    ...(texte(q.rappel, 1500) ? { rappel: texte(q.rappel, 1500) } : {}),
    ...(texte(q.section, 120) ? { section: texte(q.section, 120) } : {}),
    ...(texte(q.casRef, 40) ? { casRef: texte(q.casRef, 40) } : {}),
  };

  if (type === 'trous') {
    const trous = liste(q.trous)
      .map(objet)
      .map((t, i) => ({ id: String(i + 1), reponses: textes(t?.reponses, 6, 120) }))
      .filter((t) => t.reponses.length > 0);
    const marqueurs = [...enonce.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
    const attendus = trous.map((t) => t.id);
    if (trous.length === 0 || trous.length > 4) return undefined;
    if (marqueurs.length !== attendus.length || attendus.some((id) => !marqueurs.includes(id))) {
      return undefined;
    }
    return { ...commun, trous };
  }

  const propositions = validerPropositions(q.propositions, type === 'vrai_faux');
  const nbCorrectes = propositions.filter((p) => p.correcte).length;
  if (type === 'simple' && (propositions.length < 2 || nbCorrectes !== 1)) return undefined;
  if (type === 'multiple' && (propositions.length < 3 || nbCorrectes < 1)) return undefined;
  if (type === 'vrai_faux' && propositions.length < 1) return undefined;
  return { ...commun, propositions };
}

export interface CasBrut {
  ref: string;
  titre: string;
  vignette: string;
}

export function validerLotQuestions(v: unknown): { questions: QuestionBrute[]; cas: CasBrut[] } {
  const racine = objet(v) ?? {};
  const cas = liste(racine.cas)
    .map(objet)
    .map((c) => ({ ref: texte(c?.ref, 40), titre: texte(c?.titre, 160), vignette: texte(c?.vignette, 3000) }))
    .filter((c) => c.ref && c.vignette);
  const refs = new Set(cas.map((c) => c.ref));
  const questions = liste(racine.questions)
    .map(validerQuestion)
    .filter((q): q is QuestionBrute => !!q)
    // Une question qui cite un cas absent redevient une question isolée.
    .map((q) => (q.casRef && !refs.has(q.casRef) ? { ...q, casRef: undefined } : q));
  return { questions, cas };
}

/** Texte de comparaison d'une question : énoncé suivi de ses propositions. */
export function signature(q: Pick<Question, 'enonce' | 'propositions'>): string {
  return [q.enonce, ...(q.propositions ?? []).map((p) => p.texte)].join(' ');
}

// --- Annales -----------------------------------------------------------------

export interface QuestionAnnale {
  numero?: string;
  page?: number;
  type: TypeQuestion;
  enonce: string;
  propositions?: Proposition[];
  trous?: { id: string; reponses: string[] }[];
  /** Vrai si le corrigé officiel figurait dans le document. */
  corrigeOfficiel: boolean;
  cas?: string;
}

export interface AnnaleBrute {
  libelle: string;
  date?: string;
  questions: QuestionAnnale[];
  illisibles: { page?: number; contexte: string }[];
}

export function validerAnnale(v: unknown): AnnaleBrute {
  const racine = objet(v) ?? {};
  const partiel = objet(racine.partiel) ?? {};
  const questions: QuestionAnnale[] = [];

  for (const brut of liste(racine.questions).map(objet)) {
    if (!brut) continue;
    const type = TYPES.find((t) => t === brut.type) ?? 'multiple';
    const enonce = texte(brut.enonce, 3000);
    if (!enonce) continue;
    const commun = {
      type,
      enonce,
      ...(texte(brut.numero, 12) ? { numero: texte(brut.numero, 12) } : {}),
      ...(entier(brut.page) ? { page: entier(brut.page) } : {}),
      ...(texte(brut.cas, 3000) ? { cas: texte(brut.cas, 3000) } : {}),
    };

    if (type === 'trous') {
      const trous = liste(brut.trous)
        .map(objet)
        .map((t, i) => ({ id: String(i + 1), reponses: textes(t?.reponses, 6, 120) }));
      const complet = trous.length > 0 && trous.every((t) => t.reponses.length > 0);
      questions.push({ ...commun, trous, corrigeOfficiel: complet });
      continue;
    }

    const lettres = new Set(textes(brut.reponsesCorrectes, 8, 4).map((l) => l.toUpperCase()));
    const corrigeOfficiel = Array.isArray(brut.reponsesCorrectes) && lettres.size > 0;
    const vraiFaux = type === 'vrai_faux';
    const propositions = liste(brut.propositions)
      .map(objet)
      .filter((p): p is Objet => !!p && !!texte(p.texte, 800))
      .slice(0, 8)
      .map((p, i) => {
        const lettre = String.fromCharCode(65 + i);
        return {
          id: vraiFaux ? String(i + 1) : lettre,
          texte: texte(p.texte, 800),
          correcte: corrigeOfficiel && (lettres.has(lettre) || lettres.has(String(i + 1))),
        };
      });
    if (propositions.length < (vraiFaux ? 1 : 2)) continue;
    questions.push({ ...commun, propositions, corrigeOfficiel });
  }

  return {
    libelle: texte(partiel.libelle, 120),
    ...(texte(partiel.date, 20) ? { date: texte(partiel.date, 20) } : {}),
    questions,
    illisibles: liste(racine.illisibles)
      .map(objet)
      .map((p) => ({ page: entier(p?.page), contexte: texte(p?.contexte, 400) }))
      .filter((p) => p.contexte),
  };
}

// --- Fiches ------------------------------------------------------------------

const PROFONDEUR_ARBRE_MAX = 6;

function validerNoeud(v: unknown, profondeur = 0): NoeudArbre | undefined {
  const n = objet(v);
  const label = texte(n?.label, 300);
  if (!n || !label) return undefined;
  const branches =
    profondeur >= PROFONDEUR_ARBRE_MAX
      ? []
      : liste(n.branches)
          .map(objet)
          .map((b) => ({ condition: texte(b?.condition, 200), noeud: validerNoeud(b?.noeud, profondeur + 1) }))
          .filter((b): b is { condition: string; noeud: NoeudArbre } => !!b.condition && !!b.noeud)
          .slice(0, 5);
  return {
    label,
    ...(texte(n.detail, 500) ? { detail: texte(n.detail, 500) } : {}),
    ...(branches.length ? { branches } : {}),
  };
}

const FORMES: Objet3D['forme'][] = ['sphere', 'boite', 'cylindre', 'tore', 'tube', 'cone'];

function nombres(v: unknown, taille: number): number[] | undefined {
  const valeurs = liste(v).map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : NaN));
  if (valeurs.length < taille || valeurs.slice(0, taille).some(Number.isNaN)) return undefined;
  // La scène tient dans un cube de quelques unités : on borne les valeurs.
  return valeurs.slice(0, taille).map((n) => Math.max(-8, Math.min(8, n)));
}

export function validerScene(v: unknown): Scene3D | undefined {
  const s = objet(v);
  if (!s) return undefined;
  const objets: Objet3D[] = [];
  for (const brut of liste(s.objets).map(objet).slice(0, 24)) {
    const forme = FORMES.find((f) => f === brut?.forme);
    const id = texte(brut?.id, 40);
    const couleur = texte(brut?.couleur, 9);
    if (!brut || !forme || !id || !/^#[0-9a-fA-F]{6}$/.test(couleur)) continue;
    if (objets.some((o) => o.id === id)) continue;
    const position = nombres(brut.position, 3) as [number, number, number] | undefined;
    const chemin = liste(brut.chemin)
      .map((p) => nombres(p, 3) as [number, number, number] | undefined)
      .filter((p): p is [number, number, number] => !!p)
      .slice(0, 16);
    if (forme === 'tube' ? chemin.length < 2 : !position) continue;
    const taille = liste(brut.taille)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
      .map((n) => Math.min(6, n))
      .slice(0, 3);
    const opacite = typeof brut.opacite === 'number' ? Math.max(0.15, Math.min(1, brut.opacite)) : undefined;
    objets.push({
      id,
      forme,
      couleur,
      ...(position ? { position } : {}),
      ...(forme === 'tube' ? { chemin } : {}),
      ...(taille.length ? { taille } : {}),
      ...(opacite !== undefined ? { opacite } : {}),
      ...(texte(brut.label, 60) ? { label: texte(brut.label, 60) } : {}),
      ...(texte(brut.detail, 300) ? { detail: texte(brut.detail, 300) } : {}),
    });
  }
  const ids = new Set(objets.map((o) => o.id));
  const tubes = new Set(objets.filter((o) => o.forme === 'tube').map((o) => o.id));
  const etapes = liste(s.etapes)
    .map(objet)
    .map((e) => {
      const camera = nombres(e?.camera, 3) as [number, number, number] | undefined;
      const focus = textes(e?.focus, 24, 40).filter((id) => ids.has(id));
      const masques = textes(e?.masques, 24, 40).filter((id) => ids.has(id));
      const flux = liste(e?.flux)
        .map(objet)
        .map((f) => ({ tube: texte(f?.tube, 40), couleur: texte(f?.couleur, 9) }))
        .filter((f) => tubes.has(f.tube))
        .map((f) => (/^#[0-9a-fA-F]{6}$/.test(f.couleur) ? f : { tube: f.tube }));
      return {
        titre: texte(e?.titre, 120),
        texte: texte(e?.texte, 500),
        ...(focus.length ? { focus } : {}),
        ...(masques.length ? { masques } : {}),
        ...(flux.length ? { flux } : {}),
        ...(camera ? { camera } : {}),
      };
    })
    .filter((e) => e.titre && e.texte)
    .slice(0, 10);
  const titre = texte(s.titre, 120);
  if (!titre || objets.length < 2 || etapes.length < 2) return undefined;
  return {
    titre,
    ...(texte(s.description, 300) ? { description: texte(s.description, 300) } : {}),
    objets,
    etapes,
  };
}

export function validerBloc(v: unknown): BlocFiche | undefined {
  const b = objet(v);
  if (!b) return undefined;
  const titre = texte(b.titre, 160);
  const avecTitre = titre ? { titre } : {};
  switch (b.type) {
    case 'texte': {
      const contenu = texte(b.contenu, 1200);
      return contenu ? { type: 'texte', contenu } : undefined;
    }
    case 'liste': {
      const elements = textes(b.elements, 8, 300);
      return elements.length ? { type: 'liste', ...avecTitre, elements } : undefined;
    }
    case 'cles':
    case 'pieges': {
      const elements = textes(b.elements, 6, 300);
      return elements.length ? { type: b.type, elements } : undefined;
    }
    case 'arbre': {
      const racine = validerNoeud(b.racine);
      return racine?.branches?.length ? { type: 'arbre', ...avecTitre, racine } : undefined;
    }
    case 'schema': {
      const noeuds = liste(b.noeuds)
        .map(objet)
        .map((n) => ({
          id: texte(n?.id, 40),
          label: texte(n?.label, 60),
          ...(texte(n?.detail, 400) ? { detail: texte(n?.detail, 400) } : {}),
        }))
        .filter((n) => n.id && n.label)
        .slice(0, 12);
      const ids = new Set(noeuds.map((n) => n.id));
      const liens = liste(b.liens)
        .map(objet)
        .map((l) => ({
          de: texte(l?.de, 40),
          vers: texte(l?.vers, 40),
          ...(texte(l?.label, 40) ? { label: texte(l?.label, 40) } : {}),
        }))
        .filter((l) => ids.has(l.de) && ids.has(l.vers) && l.de !== l.vers);
      return noeuds.length >= 2 && liens.length >= 1 ? { type: 'schema', ...avecTitre, noeuds, liens } : undefined;
    }
    case 'etapes': {
      const etapes = liste(b.etapes)
        .map(objet)
        .map((e) => ({ titre: texte(e?.titre, 120), detail: texte(e?.detail, 500) }))
        .filter((e) => e.titre && e.detail)
        .slice(0, 10);
      return etapes.length >= 2 ? { type: 'etapes', ...avecTitre, etapes } : undefined;
    }
    case 'mnemo': {
      const phrase = texte(b.phrase, 200);
      const signification = textes(b.signification, 12, 200);
      return phrase && signification.length ? { type: 'mnemo', phrase, signification } : undefined;
    }
    case 'scene3d': {
      const scene = validerScene(b.scene);
      return scene ? { type: 'scene3d', scene } : undefined;
    }
    default:
      // Type inconnu (dont les tableaux, volontairement non prévus) : écarté.
      return undefined;
  }
}

export function validerFiche(
  v: unknown,
  chapitreId: string,
): { resume?: string; sections: SectionFiche[] } {
  const racine = objet(v) ?? {};
  const sections = liste(racine.sections)
    .map(objet)
    .map((s, i) => ({
      id: `${chapitreId}-s${i + 1}`,
      titre: texte(s?.titre, 160),
      blocs: liste(s?.blocs)
        .map(validerBloc)
        .filter((b): b is BlocFiche => !!b),
    }))
    .filter((s) => s.titre && s.blocs.length > 0)
    .slice(0, 14);
  return { ...(texte(racine.resume, 300) ? { resume: texte(racine.resume, 300) } : {}), sections };
}

export function validerFlashcards(v: unknown): { recto: string; verso: string }[] {
  return liste(objet(v)?.flashcards)
    .map(objet)
    .map((f) => ({ recto: texte(f?.recto, 300), verso: texte(f?.verso, 500) }))
    .filter((f) => f.recto && f.verso)
    .slice(0, 40);
}

// --- Lecture des scans --------------------------------------------------------

export interface PageLue {
  page: number;
  texte: string;
  illisibles: string[];
}

export const MARQUEUR_ILLISIBLE = '[ILLISIBLE]';

export function validerLecture(v: unknown): PageLue[] {
  return liste(objet(v)?.pages)
    .map(objet)
    .map((p) => ({
      page: entier(p?.page) ?? 0,
      texte: texte(p?.texte, 20_000),
      illisibles: textes(p?.illisibles, 20, 400),
    }))
    .filter((p) => p.page > 0);
}

// --- Détection d'erreurs ------------------------------------------------------

const TYPES_ANOMALIE: TypeAnomalie[] = ['reponse_fausse', 'contradiction', 'faute', 'incoherence', 'mal_classee'];

export interface ContexteAnomalies {
  chapitreId: string;
  /** Questions du chapitre, par référence courte utilisée dans la consigne. */
  questions: Map<string, Question>;
  /** Chapitres de la matière : identifiant → matière. */
  chapitres: Map<string, { matiereId: string }>;
  /** Fichier de cours principal du chapitre. */
  fichierCours?: { id: string; nom: string };
  nomsFichiers: Map<string, string>;
  maintenant: number;
}

/**
 * Transforme les anomalies proposées par l'IA en corrections soumises à
 * validation. Une anomalie sans correction exacte, sans explication ou sans
 * source est écartée.
 */
export function validerAnomalies(v: unknown, c: ContexteAnomalies): Anomalie[] {
  const anomalies: Anomalie[] = [];
  for (const a of liste(objet(v)?.anomalies).map(objet)) {
    if (!a) continue;
    const type = TYPES_ANOMALIE.find((t) => t === a.type);
    const description = texte(a.description, 600);
    const correction = texte(a.correction, 800);
    const explication = texte(a.explication, 800);
    const source = texte(a.source, 400);
    if (!type || !description || !correction || !explication || !source) continue;

    const question = c.questions.get(texte(a.question, 40));
    let patch: Patch | undefined;
    const fichierQuestion = question?.occurrences?.[0]?.fichierId;

    if (type === 'mal_classee') {
      const cible = texte(a.chapitreCorrect, 120);
      const chapitre = c.chapitres.get(cible);
      if (!question || !chapitre || cible === question.chapitreId) continue;
      patch = { op: 'deplacer', questionId: question.id, chapitreId: cible, matiereId: chapitre.matiereId };
    } else if (question && (type === 'reponse_fausse' || type === 'contradiction')) {
      const lettres = new Set(textes(a.bonnesReponses, 8, 4).map((l) => l.toUpperCase()));
      const correctes = (question.propositions ?? []).filter((p) => lettres.has(p.id.toUpperCase())).map((p) => p.id);
      const actuelles = (question.propositions ?? []).filter((p) => p.correcte).map((p) => p.id);
      // Pas de changement réel proposé : rien à valider.
      if (correctes.length === 0 || correctes.join() === actuelles.join()) continue;
      patch = { op: 'reponses', questionId: question.id, correctes };
    } else if (question && texte(a.texteCorrige, 3000)) {
      patch = { op: 'texte', questionId: question.id, champ: 'enonce', apres: texte(a.texteCorrige, 3000) };
    } else if (!question) {
      const page = entier(a.page);
      patch = {
        op: 'erratum',
        chapitreId: c.chapitreId,
        note: `${page ? `Page ${page} : ` : ''}${correction}`,
      };
    }

    const fichierId = question ? fichierQuestion : c.fichierCours?.id;
    anomalies.push({
      id: `an-${empreinte(`${c.chapitreId}|${question?.id ?? ''}|${type}|${correction}`)}`,
      type,
      cible: {
        chapitreId: question?.chapitreId ?? c.chapitreId,
        ...(question ? { questionId: question.id } : {}),
        ...(fichierId ? { fichierId, fichierNom: c.nomsFichiers.get(fichierId) } : {}),
        ...(entier(a.page) ? { page: entier(a.page) } : question?.occurrences?.[0]?.page ? { page: question.occurrences[0].page } : {}),
        ...(entier(a.ligne) ? { ligne: entier(a.ligne) } : {}),
        ...(texte(a.extrait, 500) ? { extrait: texte(a.extrait, 500) } : {}),
      },
      description,
      correction,
      explication,
      source,
      ...(patch ? { patch } : {}),
      statut: 'en_attente',
      creeLe: c.maintenant,
    });
  }
  return anomalies;
}
