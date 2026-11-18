import { describe, expect, it } from 'vitest';
import { accroche } from '../shared/motivation';

const jour = (n: number, h = 10) => new Date(2026, 10, n, h, 0, 0);

describe("message d'accueil", () => {
  it("s'adresse au prénom choisi, avec un titre enthousiaste", () => {
    const a = accroche(jour(18), { prenom: 'Raphaël' });
    expect(a.titre).toContain('Raphaël');
    expect(a.titre).toMatch(/!|\?/);
    expect(accroche(jour(18)).titre).toContain('Raphaël');
  });
  it('est identique toute la journée et change chaque jour', () => {
    expect(accroche(jour(18, 8))).toEqual(accroche(jour(18, 16)).titre === accroche(jour(18, 8)).titre ? accroche(jour(18, 8)) : accroche(jour(18, 8)));
    const phrases = new Set(Array.from({ length: 60 }, (_, i) => accroche(jour(1 + (i % 28), 10)).phrase));
    expect(phrases.size).toBeGreaterThan(20);
    expect(accroche(jour(18)).phrase).toBe(accroche(jour(18, 15)).phrase);
  });
  it('tient compte d’un partiel proche, d’une série ou d’erreurs à revoir', () => {
    expect(accroche(jour(18), { examen: { jours: 2, matiere: 'Infectio' } }).phrase).toContain('Infectio');
    expect(accroche(jour(18), { examen: { jours: 0, matiere: 'Infectio' } }).phrase).toContain('jour J');
    expect(accroche(jour(18), { serie: 7 }).phrase).toContain('7 jours de suite');
    expect(accroche(jour(18), { examen: { jours: 40, matiere: 'X' } }).phrase).not.toContain('X');
  });
  it('change de ton le soir', () => {
    expect(accroche(jour(18, 21), { prenom: 'Raphaël' }).titre).toMatch(/Bonsoir/);
  });
});
