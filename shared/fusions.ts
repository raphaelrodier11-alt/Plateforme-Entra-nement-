/**
 * Fusion de matières en double (« Infectio » et « Infectiologie »).
 *
 * Une fusion dit « la matière `de` est en fait la matière `vers` » : partout,
 * les chapitres, questions, fiches, partiels et résultats de `de` passent
 * sous `vers`. Rien n'est effacé, la fusion se défait à tout moment.
 */
import type { Chapitre, Matiere } from './types';

export interface Fusion {
  de: string;
  vers: string;
  /** Nom de la matière absorbée, pour pouvoir la reconnaître et défaire la fusion. */
  nom?: string;
}

/** Renvoie l'identifiant final d'une matière (les fusions peuvent s'enchaîner). */
export function canonique(fusions: Fusion[] | undefined): (id: string) => string {
  const table = new Map((fusions ?? []).map((f) => [f.de, f.vers]));
  return (id) => {
    let courant = id;
    for (let i = 0; i < 10; i++) {
      const suivant = table.get(courant);
      if (!suivant || suivant === courant) return courant;
      courant = suivant;
    }
    return courant;
  };
}

const CLES_SIMPLES = [
  'chapitres', 'questions', 'cas', 'fiches', 'flashcards', 'partiels', 'fichiers', 'cours', 'documents',
  'conversations', 'demandes', 'tentatives', 'sessions', 'entrainements', 'depots',
] as const;

type Liste = Record<string, unknown>[];

/**
 * Applique les fusions à l'ensemble des données de l'appli : une copie, jamais de modification sur place.
 * Sans fusion, les données sont rendues telles quelles.
 */
export function appliquerFusions<B extends object>(brut: B, fusions: Fusion[] | undefined): B {
  if (!fusions || fusions.length === 0) return brut;
  const canon = canonique(fusions);
  const copie = { ...brut } as Record<string, unknown>;
  const remplacer = (liste: Liste): Liste =>
    liste.map((x) => (typeof x.matiereId === 'string' && canon(x.matiereId) !== x.matiereId ? { ...x, matiereId: canon(x.matiereId) } : x));

  for (const cle of CLES_SIMPLES) if (Array.isArray(copie[cle])) copie[cle] = remplacer(copie[cle] as Liste);

  if (Array.isArray(copie.examens)) {
    copie.examens = (copie.examens as Liste).map((x) => {
      const ids = Array.isArray(x.matiereIds) ? (x.matiereIds as string[]).map(canon) : undefined;
      return {
        ...x,
        ...(typeof x.matiereId === 'string' ? { matiereId: canon(x.matiereId) } : {}),
        ...(ids ? { matiereIds: [...new Set(ids)] } : {}),
      };
    });
  }
  if (Array.isArray(copie.entrainements)) {
    copie.entrainements = (copie.entrainements as Liste).map((e) => {
      const r = e.regles as { matiereId?: string } | undefined;
      return r?.matiereId ? { ...e, regles: { ...r, matiereId: canon(r.matiereId) } } : e;
    });
  }
  if (Array.isArray(copie.reglages)) {
    copie.reglages = (copie.reglages as Liste).map((r) => {
      const priorites = Array.isArray(r.priorites) ? (r.priorites as Liste).map((p) => ({ ...p, matiereId: canon(String(p.matiereId)) })) : undefined;
      const objectifs = r.objectifsRevisions as Record<string, number> | undefined;
      const fusionne: Record<string, number> = {};
      for (const [id, n] of Object.entries(objectifs ?? {})) fusionne[canon(id)] = Math.max(fusionne[canon(id)] ?? 1, n);
      return { ...r, ...(priorites ? { priorites } : {}), ...(objectifs ? { objectifsRevisions: fusionne } : {}) };
    });
  }
  // Les matières absorbées disparaissent ; la matière gardée reprend le semestre qui lui manquait.
  if (Array.isArray(copie.matieres)) {
    const matieres = copie.matieres as Matiere[];
    const absorbees = new Map(matieres.filter((m) => canon(m.id) !== m.id).map((m) => [canon(m.id), m]));
    copie.matieres = matieres
      .filter((m) => canon(m.id) === m.id)
      .map((m) => (!m.semestre && absorbees.get(m.id)?.semestre ? { ...m, semestre: absorbees.get(m.id)!.semestre } : m));
  }
  return copie as B;
}

// ---------------------------------------------------------------------------
// Détection des doublons
// ---------------------------------------------------------------------------

const normaliser = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MOTS_VIDES = new Set(['chapitre', 'cours', 'partie', 'introduction', 'generalites', 'de', 'des', 'les', 'une', 'pour', 'dans', 'avec', 'et']);
const motsDe = (t: string): Set<string> => new Set(normaliser(t).split(' ').filter((m) => m.length >= 4 && !MOTS_VIDES.has(m)));

export interface SuggestionFusion {
  de: string;
  vers: string;
  /** Pourquoi on pense que c'est la même matière. */
  raison: 'nom' | 'contenu' | 'nom_et_contenu';
  /** Part de vocabulaire commun entre les chapitres des deux matières (0 à 1). */
  similitude: number;
  /** Titres de chapitres qui se ressemblent dans les deux matières. */
  communs: string[];
}

/** Le plus court des deux noms commence l'autre (« infectio » / « infectiologie ») ; au moins 5 lettres. */
export function nomsVoisins(a: string, b: string): boolean {
  const [court, long] = normaliser(a).length <= normaliser(b).length ? [normaliser(a), normaliser(b)] : [normaliser(b), normaliser(a)];
  if (court.length < 5 || court === long) return court === long && court.length > 0;
  return long.startsWith(court);
}

export function suggererFusions(
  matieres: Matiere[],
  chapitres: Pick<Chapitre, 'matiereId' | 'titre'>[],
  fusions: Fusion[] = [],
  ignorees: string[] = [],
): SuggestionFusion[] {
  const canon = canonique(fusions);
  const actives = matieres.filter((m) => canon(m.id) === m.id);
  const mots = new Map(
    actives.map((m) => {
      const ensemble = new Set<string>();
      for (const c of chapitres) if (c.matiereId === m.id) for (const mot of motsDe(c.titre)) ensemble.add(mot);
      return [m.id, ensemble] as const;
    }),
  );
  const titres = (id: string) => chapitres.filter((c) => c.matiereId === id);
  const resultat: SuggestionFusion[] = [];
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i]!;
      const b = actives[j]!;
      if (ignorees.includes(`${a.id}|${b.id}`) || ignorees.includes(`${b.id}|${a.id}`)) continue;
      const ma = mots.get(a.id)!;
      const mb = mots.get(b.id)!;
      const inter = [...ma].filter((m) => mb.has(m)).length;
      const union = new Set([...ma, ...mb]).size;
      const similitude = union ? inter / union : 0;
      const nom = nomsVoisins(a.nom, b.nom);
      const contenu = similitude >= 0.35 && inter >= 4;
      if (!nom && !contenu) continue;
      // On garde la matière au nom le plus complet (puis celle qui a le plus de chapitres).
      const [garde, absorbee] =
        normaliser(a.nom).length !== normaliser(b.nom).length
          ? normaliser(a.nom).length > normaliser(b.nom).length ? [a, b] : [b, a]
          : titres(a.id).length >= titres(b.id).length ? [a, b] : [b, a];
      const motsGarde = mots.get(garde.id)!;
      const communs = titres(absorbee.id)
        .filter((c) => [...motsDe(c.titre)].some((m) => motsGarde.has(m)))
        .map((c) => c.titre)
        .slice(0, 4);
      resultat.push({
        de: absorbee.id,
        vers: garde.id,
        raison: nom && contenu ? 'nom_et_contenu' : nom ? 'nom' : 'contenu',
        similitude,
        communs,
      });
    }
  }
  return resultat.sort((x, y) => y.similitude - x.similitude);
}
