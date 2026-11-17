import { describe, expect, it } from 'vitest';
import { carteMentale } from '../shared/cartementale';
import { questionDuJour } from '../shared/questiondujour';
import { noteInterro } from '../shared/assistant';
import type { Fiche, Question } from '../shared/types';

const fiche: Fiche = {
  id: 'c1', chapitreId: 'c1', matiereId: 'm1', titre: 'Insuffisance cardiaque', version: 1, genereLe: 0,
  sections: [
    { id: 's1', titre: 'Définition', blocs: [{ type: 'texte', contenu: 'Syndrome clinique. Il associe des signes variés.' }, { type: 'cles', elements: ['Débit insuffisant', 'Pression élevée'] }] },
    { id: 's2', titre: 'Signes', blocs: [{ type: 'liste', elements: Array.from({ length: 10 }, (_, i) => `Signe ${i}`) }] },
  ],
};

const q = (id: string, plus: Partial<Question> = {}): Question => ({ id, matiereId: 'm1', chapitreId: 'c1', type: 'simple', enonce: id, explication: 'x', difficulte: 1, source: 'genere', version: 1, ...plus });

describe('carte mentale', () => {
  it('tire sections et points clés de la fiche', () => {
    const c = carteMentale(fiche);
    expect(c.label).toBe('Insuffisance cardiaque');
    expect(c.enfants.map((s) => s.label)).toEqual(['Définition', 'Signes']);
    expect(c.enfants[0]!.enfants[0]!.label).toBe('Syndrome clinique.');
  });
  it('limite les points par section et indique le reste', () => {
    const signes = carteMentale(fiche).enfants[1]!;
    expect(signes.enfants).toHaveLength(8);
    expect(signes.enfants.at(-1)!.label).toBe('+ 3 autres');
  });
});

describe('question du jour', () => {
  const toutes = ['a', 'b', 'c', 'd', 'e'].map((id) => q(id));
  it('est la même toute la journée, quel que soit l’ordre des questions', () => {
    const un = questionDuJour(toutes, [], '2026-11-17');
    const deux = questionDuJour([...toutes].reverse(), [], '2026-11-17');
    expect(un?.id).toBe(deux?.id);
  });
  it('change selon les jours', () => {
    const ids = new Set(Array.from({ length: 12 }, (_, i) => questionDuJour(toutes, [], `2026-11-${10 + i}`)?.id));
    expect(ids.size).toBeGreaterThan(1);
  });
  it('prend d’abord une erreur à revoir, jamais une question de réserve', () => {
    expect(questionDuJour(toutes, [q('err')], '2026-11-17')?.id).toBe('err');
    expect(questionDuJour([q('r', { reserveExamen: true })], [], '2026-11-17')).toBeUndefined();
  });
});

describe('note d’interro', () => {
  it('lit « Note : x/10 » sous plusieurs formes', () => {
    expect(noteInterro('Correction.\n\n**Note : 7/10**')).toBe(7);
    expect(noteInterro('Note : 6,5 / 10')).toBe(6.5);
    expect(noteInterro('pas de note ici')).toBeUndefined();
    expect(noteInterro('Note : 12/10')).toBeUndefined();
  });
});
