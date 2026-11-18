import { describe, expect, it } from 'vitest';
import { maitriseAttendue, situationRetard } from '../shared/retard';

describe('retard / avance', () => {
  it('sans donnée, rythme neutre', () => {
    const s = situationRetard({ minutesPrevues: 0, minutesFaites: 0 });
    expect(s.score).toBe(0);
  });
  it('rien fait et maîtrise faible : retard, ECG rapide', () => {
    const s = situationRetard({ minutesPrevues: 600, minutesFaites: 0, maitrise: 0.1, joursRestants: 5 });
    expect(s.score).toBeGreaterThan(0.8);
    expect(s.bpm).toBeGreaterThan(115);
  });
  it('tout fait et bonne maîtrise : en avance, ECG calme', () => {
    const s = situationRetard({ minutesPrevues: 600, minutesFaites: 650, maitrise: 0.9, joursRestants: 20 });
    expect(s.score).toBeLessThan(-0.3);
    expect(s.bpm).toBeLessThan(80);
  });
  it('la maîtrise attendue augmente à l’approche de l’examen', () => {
    expect(maitriseAttendue(0)).toBeGreaterThan(maitriseAttendue(30));
  });
});
