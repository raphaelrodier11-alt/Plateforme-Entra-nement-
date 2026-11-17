import { describe, expect, it } from 'vitest';
import { extrait, rechercher, type CorpusRecherche } from '../shared/recherche';

const corpus: CorpusRecherche = {
  matieres: [{ id: 'm1', nom: 'Rein', ordre: 1 }],
  chapitres: [{ id: 'c1', matiereId: 'm1', titre: 'Physiologie rénale', ordre: 1, resume: 'Filtration glomérulaire', fichierIds: [], version: 1 }],
  fiches: [{ id: 'c1', chapitreId: 'c1', matiereId: 'm1', titre: 'Physiologie rénale', version: 1, genereLe: 0, sections: [{ id: 's', titre: 'Débit', blocs: [{ type: 'texte', contenu: 'Le débit de filtration glomérulaire dépend de la pression.' }] }] }],
  questions: [{ id: 'q1', matiereId: 'm1', chapitreId: 'c1', type: 'simple', enonce: 'Quelle pression règle la filtration ?', explication: 'La pression hydrostatique.', difficulte: 1, source: 'genere', version: 1 }],
  flashcards: [{ id: 'f1', matiereId: 'm1', chapitreId: 'c1', recto: 'Définir la filtration', verso: 'Passage du plasma dans la capsule' }],
  documents: [{ id: 'd1', titre: 'Résumé du néphron', type: 'resume', contenu: 'Le néphron filtre le sang.', creeLe: 0, origine: 'instantane' }],
};

describe('recherche globale', () => {
  it('trouve dans tous les types, sans tenir compte des accents ni de la casse', () => {
    const r = rechercher('FILTRATION glomerulaire', corpus);
    const types = new Set(r.map((x) => x.type));
    expect(types).toContain('chapitre');
    expect(types).toContain('fiche');
    expect(types).toContain('question');
  });
  it('classe le titre devant le corps', () => {
    const r = rechercher('néphron', corpus);
    expect(r[0]).toMatchObject({ type: 'document', id: 'd1' });
  });
  it('ne renvoie rien pour une requête vide ou sans correspondance', () => {
    expect(rechercher('', corpus)).toEqual([]);
    expect(rechercher('xylophone', corpus)).toEqual([]);
  });
  it('extrait un passage autour du mot trouvé', () => {
    const e = extrait('x '.repeat(100) + 'filtration glomérulaire ' + 'y '.repeat(100), ['filtration']);
    expect(e).toContain('filtration');
    expect(e.length).toBeLessThan(160);
  });
});
