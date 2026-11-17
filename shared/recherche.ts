/**
 * Recherche globale : chapitres, fiches, questions, flashcards, documents de
 * la bibliothèque. Tout se fait sur l'appareil, sans réseau.
 */
import { motsCles, normaliser, texteFiche } from './assistant';
import type { Chapitre, DocumentBiblio, Fiche, Flashcard, Matiere, Question } from './types';

export type TypeResultat = 'chapitre' | 'fiche' | 'question' | 'flashcard' | 'document';

export interface Resultat {
  type: TypeResultat;
  id: string;
  titre: string;
  /** Extrait autour du mot trouvé. */
  extrait: string;
  matiereId?: string;
  chapitreId?: string;
  score: number;
}

export interface CorpusRecherche {
  matieres: Matiere[];
  chapitres: Chapitre[];
  fiches: Fiche[];
  questions: Question[];
  flashcards: Flashcard[];
  documents: DocumentBiblio[];
}

const MAX_PAR_TYPE = 8;

/** Court extrait du texte autour de la première occurrence d'un des mots. */
export function extrait(texte: string, mots: string[], largeur = 130): string {
  const net = texte.replace(/\s+/g, ' ').trim();
  const bas = normaliser(net);
  // `normaliser` peut raccourcir le texte (accents composés) : on repère par recherche approchée.
  const i = mots.map((m) => bas.indexOf(m)).filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? 0;
  const debut = Math.max(0, Math.min(i, net.length) - 40);
  const morceau = net.slice(debut, debut + largeur);
  return `${debut > 0 ? '…' : ''}${morceau}${debut + largeur < net.length ? '…' : ''}`;
}

function note(champs: { texte: string; poids: number }[], mots: string[]): number {
  let score = 0;
  for (const { texte, poids } of champs) {
    const bas = normaliser(texte);
    for (const m of mots) {
      if (bas.includes(m)) score += poids;
    }
  }
  return score;
}

export function rechercher(requete: string, c: CorpusRecherche): Resultat[] {
  const mots = motsCles(requete);
  if (mots.length === 0) return [];
  const resultats: Resultat[] = [];

  for (const ch of c.chapitres) {
    const score = note([{ texte: ch.titre, poids: 10 }, { texte: ch.resume ?? '', poids: 4 }], mots);
    if (score > 0) resultats.push({ type: 'chapitre', id: ch.id, titre: ch.titre, extrait: ch.resume ? extrait(ch.resume, mots) : '', matiereId: ch.matiereId, chapitreId: ch.id, score });
  }
  for (const f of c.fiches) {
    const texte = texteFiche(f);
    const score = note([{ texte, poids: 2 }], mots);
    if (score > 0) resultats.push({ type: 'fiche', id: f.id, titre: `Fiche · ${f.titre}`, extrait: extrait(texte, mots), matiereId: f.matiereId, chapitreId: f.chapitreId, score });
  }
  for (const q of c.questions) {
    const texte = `${q.enonce} ${(q.propositions ?? []).map((p) => p.texte).join(' ')}`;
    const score = note([{ texte: q.enonce, poids: 3 }, { texte: q.explication, poids: 1 }, { texte, poids: 1 }], mots);
    if (score > 0) resultats.push({ type: 'question', id: q.id, titre: q.enonce.slice(0, 90), extrait: extrait(q.explication || q.enonce, mots), matiereId: q.matiereId, chapitreId: q.chapitreId, score });
  }
  for (const fl of c.flashcards) {
    const score = note([{ texte: fl.recto, poids: 4 }, { texte: fl.verso, poids: 2 }], mots);
    if (score > 0) resultats.push({ type: 'flashcard', id: fl.id, titre: fl.recto.slice(0, 90), extrait: extrait(fl.verso, mots), matiereId: fl.matiereId, chapitreId: fl.chapitreId, score });
  }
  for (const d of c.documents) {
    const score = note([{ texte: d.titre, poids: 8 }, { texte: d.contenu, poids: 2 }], mots);
    if (score > 0) resultats.push({ type: 'document', id: d.id, titre: d.titre, extrait: extrait(d.contenu, mots), matiereId: d.matiereId, chapitreId: d.chapitreId, score });
  }

  // Les mots trouvés ensemble comptent plus : un résultat qui les contient tous passe devant.
  const parType = new Map<TypeResultat, Resultat[]>();
  for (const r of resultats.sort((a, b) => b.score - a.score)) {
    const liste = parType.get(r.type) ?? [];
    if (liste.length < MAX_PAR_TYPE) liste.push(r);
    parType.set(r.type, liste);
  }
  return [...parType.values()].flat();
}
