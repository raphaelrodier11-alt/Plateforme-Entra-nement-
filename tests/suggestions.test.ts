import { describe, expect, it } from 'vitest';
import type { StatsChapitre } from '../shared/progression';
import { suggerer, type EntreeSuggestions } from '../shared/suggestions';
import type { Chapitre, Fiche } from '../shared/types';

const chap = (id: string, plus: Partial<Chapitre> = {}): Chapitre => ({ id, matiereId: 'm1', titre: `Chapitre ${id}`, ordre: 1, fichierIds: [], version: 1, ...plus });
const fiche = (id: string): Fiche => ({ id, chapitreId: id, matiereId: 'm1', titre: id, sections: [], version: 1, genereLe: 0 });
const stats = (id: string, plus: Partial<StatsChapitre> = {}): StatsChapitre => ({
  chapitreId: id, matiereId: 'm1', nbQuestions: 10, nbTentees: 5, couverture: 0.5, maitrise: 0.5, avancement: 0.5, statut: 'en_cours',
  nbErreurs: 0, nbPiegeuses: 0, nbARevoir: 0, erreursDues: 0, nbOccurrencesAnnales: 0, nbIncontournables: 0, poidsExamen: 0, ...plus,
});

const base = (plus: Partial<EntreeSuggestions> = {}): EntreeSuggestions => ({
  matieres: [{ id: 'm1', nom: 'Infectio', ordre: 1 }],
  chapitres: [], fiches: [], flashcards: [], stats: new Map(), actualisations: new Map(), examens: [], documents: [], demandes: [],
  aujourdHui: '2026-11-17', ...plus,
});

describe('suggestions de documents', () => {
  it('propose des QCM ciblés quand un chapitre cumule les erreurs', () => {
    const r = suggerer(base({ chapitres: [chap('c1')], stats: new Map([['c1', stats('c1', { nbErreurs: 4 })]]) }));
    expect(r[0]).toMatchObject({ type: 'qcm', chapitreId: 'c1' });
  });

  it('propose une synthèse quand un partiel approche, en priorité', () => {
    const r = suggerer(base({
      chapitres: [chap('c1')],
      stats: new Map([['c1', stats('c1', { nbErreurs: 4 })]]),
      examens: [{ id: 'e', matiereId: 'm1', titre: 'Partiel', date: '2026-11-24', source: 'manuel' }],
    }));
    expect(r[0]).toMatchObject({ type: 'resume' });
    expect(r[0]!.chapitreId).toBeUndefined();
    expect(r[0]!.raison).toContain('7 jours');
  });

  it('ignore un partiel lointain ou passé', () => {
    const lointain = suggerer(base({ examens: [{ id: 'e', matiereId: 'm1', titre: 'P', date: '2027-02-01', source: 'manuel' }] }));
    const passe = suggerer(base({ examens: [{ id: 'e', matiereId: 'm1', titre: 'P', date: '2026-11-01', source: 'manuel' }] }));
    expect(lointain).toEqual([]);
    expect(passe).toEqual([]);
  });

  it('ne repropose pas un document déjà créé ou déjà demandé', () => {
    const entree = base({ chapitres: [chap('c1')], stats: new Map([['c1', stats('c1', { nbErreurs: 4 })]]) });
    expect(suggerer(entree)).toHaveLength(1);
    const avecDoc = { ...entree, documents: [{ id: 'd', titre: 'x', type: 'qcm' as const, chapitreId: 'c1', contenu: 'x', creeLe: 0, origine: 'instantane' as const }] };
    expect(suggerer(avecDoc)).toEqual([]);
    const avecDemande = { ...entree, demandes: [{ id: 'q', type: 'qcm' as const, chapitreId: 'c1', sujet: 's', statut: 'en_attente' as const, creeLe: 0, majLe: 0 }] };
    expect(suggerer(avecDemande)).toEqual([]);
  });

  it('suggère des flashcards pour un nouveau chapitre qui en manque', () => {
    const r = suggerer(base({ chapitres: [chap('c1', { nouveau: true })], fiches: [fiche('c1')] }));
    expect(r.map((s) => s.type)).toContain('flashcards');
  });

  it('suggère « ce qui a changé » après une actualisation majeure', () => {
    const act = { id: 'a', chapitreId: 'c1', matiereId: 'm1', origine: 'ancien' as const, signature: 's', resume: 'Nouveau schéma', comparesLe: 0, fichiers: [], changements: [{ type: 'ajout' as const, importance: 'majeure' as const, sujet: 'x', avant: null, apres: 'y' }] };
    const r = suggerer(base({ chapitres: [chap('c1')], actualisations: new Map([['c1', [act as never]]]) }));
    expect(r[0]).toMatchObject({ type: 'resume', chapitreId: 'c1' });
    expect(r[0]!.consignes).toContain('Nouveau schéma');
  });
});
