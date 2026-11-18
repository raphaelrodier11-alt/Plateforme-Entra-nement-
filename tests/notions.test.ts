import { describe, expect, it } from 'vitest';
import { apresMiniTest, choisirMiniTest, cleNotion, notionDue, notionsDepuisErreurs, texteRappelNotion } from '../shared/notions';
import type { Chapitre, Fiche, Notion, Question } from '../shared/types';

const chapitre: Chapitre = { id: 'c1', matiereId: 'm1', titre: 'Insuffisance cardiaque', ordre: 1, fichierIds: [], version: 1 };
const fiche: Fiche = { id: 'c1', chapitreId: 'c1', matiereId: 'm1', titre: 'IC', version: 1, genereLe: 0, sections: [{ id: 's1', titre: 'Classification NYHA', blocs: [{ type: 'liste', elements: ['Stade I', 'Stade II'] }] }] };
const q = (id: string, plus: Partial<Question> = {}): Question => ({ id, matiereId: 'm1', chapitreId: 'c1', type: 'simple', enonce: id, explication: 'x', difficulte: 2, source: 'genere', version: 1, sectionFiche: 's1', rappel: `Rappel ${id}`, ...plus });
const ctx = () => ({ ch: new Map([['c1', chapitre]]), fi: new Map([['c1', fiche]]) });

describe('carnet À revoir', () => {
  it('crée une notion par section de fiche avec les rappels des erreurs', () => {
    const { ch, fi } = ctx();
    const n = notionsDepuisErreurs([q('a'), q('b')], ch, fi, new Map(), 1000);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ id: 'c1|s1', titre: 'Classification NYHA', statut: 'a_revoir', echecs: 2 });
    expect(n[0]!.rappels).toEqual(['Rappel a', 'Rappel b']);
    expect(cleNotion(q('z', { sectionFiche: undefined }))).toBe('c1|general');
  });
  it('relit la section de fiche et les rappels', () => {
    const { ch, fi } = ctx();
    const [n] = notionsDepuisErreurs([q('a')], ch, fi, new Map(), 1);
    const t = texteRappelNotion(n!, fiche);
    expect(t).toContain('Stade I');
    expect(t).toContain('Rappel a');
  });
  it('espace les relectures puis ancre la notion après trois réussites', () => {
    const { ch, fi } = ctx();
    let [n] = notionsDepuisErreurs([q('a')], ch, fi, new Map(), 1) as [Notion];
    n = apresMiniTest(n, true, '2026-11-18', 2);
    expect(n).toMatchObject({ statut: 'a_revoir', reussitesDeSuite: 1, prochaineRevue: '2026-11-20' });
    expect(notionDue(n, '2026-11-19')).toBe(false);
    expect(notionDue(n, '2026-11-20')).toBe(true);
    n = apresMiniTest(n, true, '2026-11-20', 3);
    expect(n.prochaineRevue).toBe('2026-11-26');
    n = apresMiniTest(n, true, '2026-11-26', 4);
    expect(n.statut).toBe('ancree');
  });
  it('un échec remet la notion à zéro', () => {
    const { ch, fi } = ctx();
    let [n] = notionsDepuisErreurs([q('a')], ch, fi, new Map(), 1) as [Notion];
    n = apresMiniTest(apresMiniTest(n, true, '2026-11-18', 2), false, '2026-11-20', 3);
    expect(n).toMatchObject({ reussitesDeSuite: 0, statut: 'a_revoir' });
  });
  it('une notion ancrée revient dans le carnet après une nouvelle erreur', () => {
    const { ch, fi } = ctx();
    const ancree: Notion = { ...(notionsDepuisErreurs([q('a')], ch, fi, new Map(), 1)[0] as Notion), statut: 'ancree', reussitesDeSuite: 3 };
    const [revenue] = notionsDepuisErreurs([q('b')], ch, fi, new Map([[ancree.id, ancree]]), 5) as [Notion];
    expect(revenue).toMatchObject({ statut: 'a_revoir', reussitesDeSuite: 0 });
  });
  it('choisit un mini-test de 3 questions, les questions ratées d’abord', () => {
    const { ch, fi } = ctx();
    const [n] = notionsDepuisErreurs([q('b')], ch, fi, new Map(), 1) as [Notion];
    const test = choisirMiniTest(n, [q('a'), q('b'), q('c'), q('d'), q('p', { perso: true })]);
    expect(test.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
