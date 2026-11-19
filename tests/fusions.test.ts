import { describe, expect, it } from 'vitest';
import { appliquerFusions, canonique, nomsVoisins, suggererFusions } from '../shared/fusions';
import type { Chapitre, Matiere } from '../shared/types';

const m = (id: string, nom: string, semestre?: number) => ({ id, nom, ordre: 1, ...(semestre ? { semestre } : {}) }) as Matiere;
const c = (matiereId: string, titre: string) => ({ matiereId, titre }) as Chapitre;

describe('noms voisins', () => {
  it('infectio ≈ infectiologie, mais pas bio / biochimie', () => {
    expect(nomsVoisins('INFECTIO', 'Infectiologie')).toBe(true);
    expect(nomsVoisins('Bio', 'Biochimie')).toBe(false);
    expect(nomsVoisins('Cardiologie', 'Néphrologie')).toBe(false);
  });
});

describe('suggestions de fusion', () => {
  const matieres = [m('m-infectio', 'Infectio', 5), m('m-infectiologie', 'Infectiologie'), m('m-cardio', 'Cardiologie')];
  const chapitres = [
    c('m-infectio', 'Infections urinaires'), c('m-infectio', 'Pneumopathies communautaires'),
    c('m-infectiologie', 'Infections urinaires'), c('m-infectiologie', 'Endocardites infectieuses'),
    c('m-cardio', 'Insuffisance cardiaque'),
  ];
  it('propose de garder le nom le plus complet', () => {
    const s = suggererFusions(matieres, chapitres);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ de: 'm-infectio', vers: 'm-infectiologie' });
    expect(s[0]!.communs).toContain('Infections urinaires');
  });
  it('détecte aussi par le contenu quand les noms diffèrent', () => {
    const t = (id: string) => ['Diabète insulinodépendant traitement', 'Diabète complications dégénératives', 'Insuline pompes schémas', 'Hypoglycémie conduite urgence'].map((x) => c(id, x));
    const s = suggererFusions([m('a', 'Endocrino'), m('b', 'Métabolisme')], [...t('a'), ...t('b')]);
    expect(s[0]).toMatchObject({ raison: 'contenu' });
  });
  it('ne repropose pas une fusion déjà faite ou ignorée', () => {
    expect(suggererFusions(matieres, chapitres, [{ de: 'm-infectio', vers: 'm-infectiologie' }])).toHaveLength(0);
    expect(suggererFusions(matieres, chapitres, [], ['m-infectio|m-infectiologie'])).toHaveLength(0);
  });
});

describe('application des fusions', () => {
  const brut = {
    matieres: [m('m-infectio', 'Infectio', 5), m('m-infectiologie', 'Infectiologie')],
    chapitres: [c('m-infectio', 'A'), c('m-infectiologie', 'B')],
    questions: [{ id: 'q', matiereId: 'm-infectio' }],
    examens: [{ id: 'x', matiereIds: ['m-infectio', 'm-infectiologie'], matiereId: 'm-infectio' }],
    reglages: [{ id: 'principal', objectifsRevisions: { 'm-infectio': 3, 'm-infectiologie': 2 } }],
  };
  const fusions = [{ de: 'm-infectio', vers: 'm-infectiologie' }];
  it('regroupe tout sous la matière gardée', () => {
    const r = appliquerFusions(brut, fusions);
    expect(r.matieres).toHaveLength(1);
    expect(r.matieres[0]).toMatchObject({ id: 'm-infectiologie', semestre: 5 });
    expect(r.chapitres.every((x) => x.matiereId === 'm-infectiologie')).toBe(true);
    expect(r.questions[0]!.matiereId).toBe('m-infectiologie');
    expect(r.examens[0]!.matiereIds).toEqual(['m-infectiologie']);
    expect(r.reglages[0]!.objectifsRevisions).toEqual({ 'm-infectiologie': 3 });
  });
  it('ne touche à rien sans fusion, et résiste aux cycles', () => {
    expect(appliquerFusions(brut, [])).toBe(brut);
    expect(canonique([{ de: 'a', vers: 'b' }, { de: 'b', vers: 'a' }])('a')).toMatch(/^[ab]$/);
  });
});
