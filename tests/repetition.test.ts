import { describe, expect, it } from 'vitest';
import { JOUR_MS } from '../shared/dates';
import { estDue, etatRepetition, etatsRepetition } from '../shared/repetition';

const J0 = new Date(2026, 10, 16, 10, 0).getTime();
const t = (jour: number, points: number) => ({
  date: J0 + jour * JOUR_MS,
  points,
  nbErreurs: points === 1 ? 0 : points === 0.5 ? 1 : 2,
});

describe('répétition espacée des erreurs', () => {
  it('une question toujours réussie n\'est pas suivie', () => {
    expect(etatRepetition([t(0, 1), t(5, 1)])).toBeUndefined();
  });

  it('la première erreur programme une révision le lendemain', () => {
    const etat = etatRepetition([t(0, 0)])!;
    expect(etat.intervalle).toBe(1);
    expect(etat.echeance).toBe(J0 + JOUR_MS);
    expect(estDue(etat, J0)).toBe(false);
    expect(estDue(etat, J0 + JOUR_MS)).toBe(true);
  });

  it('les réussites successives espacent les révisions : 1, 3, 7 jours puis davantage', () => {
    const intervalles = [1, 2, 3, 4].map(
      (n) => etatRepetition([t(0, 0), ...Array.from({ length: n }, (_, i) => t(i + 1, 1))])!.intervalle,
    );
    expect(intervalles.slice(0, 3)).toEqual([1, 3, 7]);
    expect(intervalles[3]).toBeGreaterThan(7);
  });

  it('une nouvelle erreur ramène l\'intervalle à 1 jour', () => {
    const etat = etatRepetition([t(0, 0), t(1, 1), t(4, 1), t(11, 0)])!;
    expect(etat).toMatchObject({ intervalle: 1, serie: 0 });
    expect(etat.echeance).toBe(J0 + 12 * JOUR_MS);
  });

  it('une réussite partielle réduit l\'intervalle de moitié', () => {
    // Après deux réussites l'intervalle vaut 3 jours ; il retombe à 2.
    const etat = etatRepetition([t(0, 0), t(1, 1), t(4, 1), t(11, 0.5)])!;
    expect(etat.intervalle).toBe(2);
    expect(etat.serie).toBe(0);
  });

  it('le calcul ne dépend pas de l\'ordre des tentatives', () => {
    const liste = [t(0, 0), t(1, 1), t(4, 0.5)];
    expect(etatRepetition([...liste].reverse())).toEqual(etatRepetition(liste));
  });

  it('regroupe par question et ignore les questions sans erreur', () => {
    const etats = etatsRepetition([
      { ...t(0, 0), questionId: 'a' },
      { ...t(0, 1), questionId: 'b' },
    ]);
    expect([...etats.keys()]).toEqual(['a']);
  });
});
