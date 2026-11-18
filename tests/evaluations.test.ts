import { describe, expect, it } from 'vitest';
import { PART_TEMPS, besoinRevision, difficulteRessentie, maitriseEffective, niveauRevision } from '../shared/evaluations';

const ev = (o: object) => ({ id: 'c1', majLe: 0, ...o });

describe('ressenti et avancement', () => {
  it("part de ce que tu as déclaré, puis laisse la main à tes résultats réels", () => {
    const declare = ev({ confiance: 5 });
    expect(maitriseEffective(declare, 0, 0)).toBe(1);
    expect(maitriseEffective(declare, 0.2, 4)).toBeCloseTo(0.6, 5);
    expect(maitriseEffective(declare, 0.2, 100)).toBeLessThan(0.25);
  });
  it('sans déclaration, la maîtrise réelle fait foi ; « déjà vu » part du milieu', () => {
    expect(maitriseEffective(undefined, 0.3, 5)).toBe(0.3);
    expect(maitriseEffective(ev({ dejaVu: true }), 0, 0)).toBe(0.5);
  });
  it("une faible confiance pèse vers le bas, jusqu'à ce que les résultats la corrigent", () => {
    const peu = ev({ confiance: 1 });
    expect(maitriseEffective(peu, 0.9, 0)).toBe(0);
    expect(maitriseEffective(peu, 0.9, 40)).toBeGreaterThan(0.75);
  });
  it('la difficulté ressentie renforce le besoin de révision', () => {
    expect(besoinRevision(0.4, 5)).toBeGreaterThan(besoinRevision(0.4, 1));
    expect(besoinRevision(1, 5)).toBe(0);
    expect(difficulteRessentie(undefined)).toBe(3);
    expect(difficulteRessentie(ev({ difficulte: 9 }))).toBe(5);
  });
  it('classe points faibles, moyens et forts avec une répartition de 60/25/15 %', () => {
    expect(niveauRevision(0.8)).toBe('faible');
    expect(niveauRevision(0.35)).toBe('moyen');
    expect(niveauRevision(0.1)).toBe('fort');
    expect(PART_TEMPS.faible + PART_TEMPS.moyen + PART_TEMPS.fort).toBeCloseTo(1, 5);
  });
});
