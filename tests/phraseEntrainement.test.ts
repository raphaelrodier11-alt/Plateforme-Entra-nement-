import { describe, expect, it } from 'vitest';
import { comprendrePhrase } from '../shared/phraseEntrainement';
import type { Chapitre, Matiere } from '../shared/types';

const matieres = [
  { id: 'gen', nom: 'Génétique médicale', ordre: 1 },
  { id: 'cardio', nom: 'Cardiologie', ordre: 2 },
] as Matiere[];
const chapitres = [1, 2, 3, 4].map((n) => ({ id: `g${n}`, matiereId: 'gen', titre: `Chapitre ${n} — sujet`, ordre: n, fichierIds: [] })) as Chapitre[];

describe('phrase → règles', () => {
  it('comprend l’exemple complet', () => {
    const r = comprendrePhrase('20 questions de génétique, niveau difficile, 25 minutes, uniquement le chapitre 3', matieres, chapitres);
    expect(r.regles.matiereId).toBe('gen');
    expect(r.regles.nombre).toBe(20);
    expect(r.regles.difficulte).toBe('difficile');
    expect(r.regles.chronoMin).toBe(25);
    expect(r.regles.chapitreIds).toEqual(['g3']);
  });
  it('types, pièges et plusieurs chapitres', () => {
    const r = comprendrePhrase('50 vrai ou faux pièges en cardiologie', matieres, chapitres);
    expect(r.regles.types).toEqual(['vrai_faux']);
    expect(r.regles.pieges).toBe(true);
    expect(r.regles.nombre).toBe(50);
    const g = comprendrePhrase('génétique chapitres 1 et 2, 1h', matieres, chapitres);
    expect(g.regles.chapitreIds).toEqual(['g1', 'g2']);
    expect(g.regles.chronoMin).toBe(60);
  });
  it('signale un chapitre inconnu', () => {
    const r = comprendrePhrase('génétique chapitre 9', matieres, chapitres);
    expect(r.avertissements.join(' ')).toMatch(/Chapitre 9/);
  });
});
