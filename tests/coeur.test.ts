import { describe, expect, it } from 'vitest';
import { HORIZON_COEUR_JOURS, battement, etatCoeur, libelleUrgence } from '../shared/coeur';

describe('cœur du compte à rebours', () => {
  it('est calme sans partiel et au loin', () => {
    expect(etatCoeur(undefined).bpm).toBeLessThanOrEqual(62);
    expect(etatCoeur(HORIZON_COEUR_JOURS + 30).urgence).toBe(0);
    expect(etatCoeur(HORIZON_COEUR_JOURS + 30).bpm).toBe(58);
  });
  it('grossit, accélère et bat plus fort à mesure que le partiel approche', () => {
    const jours = [40, 25, 10, 3, 0];
    const etats = jours.map((j) => etatCoeur(j));
    for (let i = 1; i < etats.length; i++) {
      expect(etats[i]!.bpm).toBeGreaterThan(etats[i - 1]!.bpm);
      expect(etats[i]!.echelle).toBeGreaterThan(etats[i - 1]!.echelle);
      expect(etats[i]!.amplitude).toBeGreaterThan(etats[i - 1]!.amplitude);
      expect(etats[i]!.vitesseSang).toBeGreaterThan(etats[i - 1]!.vitesseSang);
    }
    expect(etatCoeur(0).bpm).toBe(122);
    expect(etatCoeur(-2).urgence).toBe(1);
  });
  it('un battement a deux bosses (lub-dub) puis retombe', () => {
    expect(battement(0.1)).toBeGreaterThan(0.9);
    expect(battement(0.33)).toBeGreaterThan(0.4);
    expect(battement(0.6)).toBeLessThan(0.05);
    expect(battement(1.1)).toBeCloseTo(battement(0.1), 5);
  });
  it('décrit l’état en français', () => {
    expect(libelleUrgence(undefined)).toContain('Ajoute');
    expect(libelleUrgence(0)).toContain('Jour J');
    expect(libelleUrgence(2)).toContain('s’emballe');
  });
});
