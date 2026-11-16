import { describe, expect, it } from 'vitest';
import {
  compterErreurs,
  corriger,
  pointsPourErreurs,
  scoreGlobal,
  scoreSession,
  scoresParGroupe,
  scoreTentatives,
  trouCorrect,
} from '../shared/bareme';
import type { Question } from '../shared/types';

const base = {
  matiereId: 'm',
  chapitreId: 'c',
  explication: '',
  difficulte: 1 as const,
  source: 'genere' as const,
  version: 1,
};

/** QCM à 5 propositions dont A et C sont justes. */
const multiple: Question = {
  ...base,
  id: 'q-multiple',
  type: 'multiple',
  enonce: 'Parmi les propositions suivantes, lesquelles sont exactes ?',
  propositions: [
    { id: 'A', texte: 'a', correcte: true },
    { id: 'B', texte: 'b', correcte: false },
    { id: 'C', texte: 'c', correcte: true },
    { id: 'D', texte: 'd', correcte: false },
    { id: 'E', texte: 'e', correcte: false },
  ],
};

const simple: Question = {
  ...base,
  id: 'q-simple',
  type: 'simple',
  enonce: 'Quelle est la bonne réponse ?',
  propositions: [
    { id: 'A', texte: 'a', correcte: false },
    { id: 'B', texte: 'b', correcte: true },
    { id: 'C', texte: 'c', correcte: false },
  ],
};

const vraiFaux: Question = {
  ...base,
  id: 'q-vf',
  type: 'vrai_faux',
  enonce: 'Vrai ou faux ?',
  propositions: [
    { id: '1', texte: 'x', correcte: true },
    { id: '2', texte: 'y', correcte: false },
    { id: '3', texte: 'z', correcte: true },
  ],
};

const trous: Question = {
  ...base,
  id: 'q-trous',
  type: 'trous',
  enonce: 'Le nœud {{1}} est le pacemaker ; sa fréquence est de {{2}} bpm.',
  trous: [
    { id: '1', reponses: ['sinusal', 'sino-atrial'] },
    { id: '2', reponses: ['60 à 100', '60-100'] },
  ],
};

describe('barème : points selon le nombre d\'erreurs', () => {
  it('0 erreur = 1 point, 1 erreur = 0,5 point, 2 erreurs ou plus = 0 point', () => {
    expect(pointsPourErreurs(0)).toBe(1);
    expect(pointsPourErreurs(1)).toBe(0.5);
    expect(pointsPourErreurs(2)).toBe(0);
    expect(pointsPourErreurs(5)).toBe(0);
  });
});

describe('barème : choix multiples', () => {
  it('réponse exacte : 0 erreur, 1 point', () => {
    expect(corriger(multiple, { cochees: ['A', 'C'] })).toMatchObject({ nbErreurs: 0, points: 1 });
  });

  it('une proposition oubliée : 1 erreur, 0,5 point', () => {
    expect(corriger(multiple, { cochees: ['A'] })).toMatchObject({ nbErreurs: 1, points: 0.5 });
  });

  it('une proposition cochée à tort : 1 erreur, 0,5 point', () => {
    expect(corriger(multiple, { cochees: ['A', 'C', 'E'] })).toMatchObject({
      nbErreurs: 1,
      points: 0.5,
    });
  });

  it('un oubli et une proposition à tort : 2 erreurs, 0 point', () => {
    expect(corriger(multiple, { cochees: ['A', 'B'] })).toMatchObject({ nbErreurs: 2, points: 0 });
  });

  it('aucune case cochée : chaque bonne réponse manquante est une erreur', () => {
    expect(compterErreurs(multiple, {})).toBe(2);
  });

  it('le détail indique les propositions mal traitées', () => {
    const { details } = corriger(multiple, { cochees: ['A', 'B'] });
    expect(details.filter((d) => !d.juste).map((d) => d.id)).toEqual(['B', 'C']);
  });
});

describe('barème : choix simple (tout ou rien)', () => {
  it('bonne réponse : 1 point', () => {
    expect(corriger(simple, { cochees: ['B'] })).toMatchObject({ nbErreurs: 0, points: 1 });
  });

  it('mauvaise réponse : 0 point, jamais 0,5', () => {
    expect(corriger(simple, { cochees: ['A'] })).toMatchObject({ nbErreurs: 2, points: 0 });
  });

  it('sans réponse : 0 point', () => {
    expect(corriger(simple, {}).points).toBe(0);
  });
});

describe('barème : vrai/faux', () => {
  it('compte une erreur par affirmation mal jugée', () => {
    expect(compterErreurs(vraiFaux, { jugements: { 1: true, 2: false, 3: true } })).toBe(0);
    expect(compterErreurs(vraiFaux, { jugements: { 1: true, 2: true, 3: true } })).toBe(1);
    expect(compterErreurs(vraiFaux, { jugements: { 1: false, 2: true, 3: true } })).toBe(2);
  });

  it('une affirmation sans réponse est une erreur', () => {
    expect(compterErreurs(vraiFaux, { jugements: { 1: true, 2: false } })).toBe(1);
  });

  it('une seule affirmation : une erreur vaut 0 point', () => {
    const seule: Question = { ...vraiFaux, propositions: [vraiFaux.propositions![0]!] };
    expect(corriger(seule, { jugements: { 1: false } })).toMatchObject({ nbErreurs: 2, points: 0 });
    expect(corriger(seule, { jugements: { 1: true } }).points).toBe(1);
  });
});

describe('barème : texte à trous', () => {
  it('accepte les variantes, sans tenir compte de la casse ni des accents', () => {
    expect(corriger(trous, { textes: { 1: 'Sinusal', 2: '60 à 100' } }).points).toBe(1);
    expect(corriger(trous, { textes: { 1: 'SINO-ATRIAL', 2: '60-100' } }).points).toBe(1);
  });

  it('un trou faux : 0,5 point ; deux trous faux : 0 point', () => {
    expect(corriger(trous, { textes: { 1: 'sinusal', 2: '40' } }).points).toBe(0.5);
    expect(corriger(trous, { textes: { 1: 'atrial', 2: '' } }).points).toBe(0);
  });

  it('tolère une faute de frappe sur un mot long, pas sur une valeur chiffrée', () => {
    expect(trouCorrect('sinuzal', ['sinusal'])).toBe(true);
    expect(trouCorrect('60 à 101', ['60 à 100'])).toBe(false);
    expect(trouCorrect('rein', ['foie'])).toBe(false);
  });
});

describe('scores par QCM, par chapitre et global', () => {
  const t = (questionId: string, date: number, points: number, chapitreId = 'c1') => ({
    questionId,
    date,
    points,
    chapitreId,
  });

  it('score d\'un QCM : somme des points sur le nombre de questions', () => {
    const score = scoreTentatives([{ points: 1 }, { points: 0.5 }, { points: 0 }, { points: 1 }]);
    expect(score).toMatchObject({ points: 2.5, total: 4, taux: 0.625, noteSur20: 12.5 });
  });

  it('une question sans réponse vaut 0 point dans le score de la session', () => {
    const score = scoreSession(['a', 'b', 'c'], [t('a', 1, 1), t('b', 1, 0.5)]);
    expect(score).toMatchObject({ points: 1.5, total: 3, noteSur20: 10 });
  });

  it('par chapitre : seule la dernière tentative de chaque question compte', () => {
    const tentatives = [
      t('a', 1, 0, 'c1'),
      t('a', 2, 1, 'c1'),
      t('b', 1, 0.5, 'c1'),
      t('c', 1, 0, 'c2'),
    ];
    const scores = scoresParGroupe(tentatives, (x) => x.chapitreId);
    expect(scores.get('c1')).toMatchObject({ points: 1.5, total: 2, taux: 0.75 });
    expect(scores.get('c2')).toMatchObject({ points: 0, total: 1, taux: 0 });
  });

  it('global : toutes les questions, dernière tentative', () => {
    const score = scoreGlobal([t('a', 1, 0), t('a', 2, 1), t('b', 1, 0.5), t('c', 1, 0)]);
    expect(score).toMatchObject({ points: 1.5, total: 3, taux: 0.5, noteSur20: 10 });
  });

  it('aucune tentative : score nul sans division par zéro', () => {
    expect(scoreTentatives([])).toMatchObject({ points: 0, total: 0, taux: 0, noteSur20: 0 });
  });
});
