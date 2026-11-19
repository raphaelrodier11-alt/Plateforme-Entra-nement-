import { afterEach, describe, expect, it } from 'vitest';
import { definirArret, enArret, valeur } from '../src/lib/ecg';

afterEach(() => definirArret(false));

describe('ECG à l’arrêt', () => {
  it('fibrille puis devient une ligne plate', () => {
    definirArret(true);
    expect(enArret()).toBe(true);
    const debut = Date.now();
    const bruit = Array.from({ length: 50 }, (_, i) => Math.abs(valeur(debut + 500 + i * 20)));
    expect(Math.max(...bruit)).toBeGreaterThan(0.05);
    const plat = Array.from({ length: 50 }, (_, i) => Math.abs(valeur(debut + 8000 + i * 20)));
    expect(Math.max(...plat)).toBeLessThan(0.01);
  });
  it('revient au tracé normal quand on repart', () => {
    definirArret(true);
    definirArret(false);
    expect(enArret()).toBe(false);
  });
});
