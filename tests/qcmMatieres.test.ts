import { describe, expect, it } from 'vitest';
import { choisirQuestions, questionsCorrespondantes } from '../src/lib/sessions';
import type { Donnees } from '../src/etat/calcul';
import type { Question } from '../shared/types';

const q = (id: string, matiereId: string): Question =>
  ({ id, matiereId, chapitreId: `${matiereId}-c`, type: 'simple', difficulte: 2, source: 'genere', enonce: id, propositions: [] }) as unknown as Question;

const questions = [
  ...Array.from({ length: 30 }, (_, i) => q(`a${i}`, 'cardio')),
  ...Array.from({ length: 4 }, (_, i) => q(`b${i}`, 'nephro')),
  ...Array.from({ length: 4 }, (_, i) => q(`c${i}`, 'pneumo')),
];
const d = { questions, etats: new Map(), erreursDues: [] } as unknown as Donnees;

describe('QCM par sujets', () => {
  it('filtre sur plusieurs matières', () => {
    const r = questionsCorrespondantes(d, { matiereIds: ['nephro', 'pneumo'], nombre: 10 });
    expect(r).toHaveLength(8);
    expect(r.every((x) => x.matiereId !== 'cardio')).toBe(true);
  });
  it('sans équilibre, la grosse matière domine', () => {
    const r = choisirQuestions(d, { nombre: 12 }, 1);
    expect(r.filter((x) => x.matiereId === 'cardio').length).toBeGreaterThan(6);
  });
  it('le mélange équilibré représente chaque matière à parts égales', () => {
    const r = choisirQuestions(d, { nombre: 12, equilibre: true }, 1);
    const part = (m: string) => r.filter((x) => x.matiereId === m).length;
    expect([part('cardio'), part('nephro'), part('pneumo')]).toEqual([4, 4, 4]);
  });
});
