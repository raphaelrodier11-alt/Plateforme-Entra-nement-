import { describe, expect, it } from 'vitest';
import { etatCoeurApaise, etatCoeurArret } from '../shared/coeur';
import { dernierFini, matieresExamen, phaseExamen, plageHoraire } from '../shared/examens';

const a = (jour: number, h = 12, mn = 0) => new Date(2026, 10, jour, h, mn).getTime();

describe('phases d’un partiel', () => {
  it('avant, jour J, fini — avec horaires', () => {
    const x = { date: '2026-11-18', heure: '09:00', heureFin: '11:00' };
    expect(phaseExamen(x, a(17))).toBe('avant');
    expect(phaseExamen(x, a(18, 0, 30))).toBe('jour_j');
    expect(phaseExamen(x, a(18, 10))).toBe('jour_j');
    expect(phaseExamen(x, a(18, 11, 0))).toBe('fini');
    expect(phaseExamen(x, a(19))).toBe('fini');
  });
  it('sans horaire : jour J toute la journée, fini le lendemain', () => {
    const x = { date: '2026-11-18' };
    expect(phaseExamen(x, a(18, 23))).toBe('jour_j');
    expect(phaseExamen(x, a(19, 0, 5))).toBe('fini');
  });
  it('heure de début seule : 2 h par défaut', () => {
    expect(plageHoraire({ heure: '14:00' })).toEqual([840, 960]);
    expect(plageHoraire({ heure: 'x' })).toBeUndefined();
  });
  it('fête seulement les deux jours qui suivent', () => {
    const x = [{ date: '2026-11-18' }];
    expect(dernierFini(x, a(19))).toBeDefined();
    expect(dernierFini(x, a(22))).toBeUndefined();
  });
  it('matières : une, plusieurs ou aucune', () => {
    expect(matieresExamen({ matiereId: 'a' })).toEqual(['a']);
    expect(matieresExamen({ matiereId: 'a', matiereIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(matieresExamen({})).toEqual([]);
  });
});

describe('états du cœur', () => {
  it('arrêt : plus de battement ni de sang', () => {
    expect(etatCoeurArret()).toMatchObject({ arret: true, bpm: 0, amplitude: 0, vitesseSang: 0 });
  });
  it('apaisé : rythme lent', () => {
    expect(etatCoeurApaise()).toMatchObject({ apaise: true, bpm: 58 });
  });
});
