import { beforeEach, describe, expect, it } from 'vitest';
import type { DocSync } from '../shared/collections';
import type { Anomalie, Chapitre, Fichier, Question } from '../shared/types';
import app from '../worker/index';
import type { Env } from '../worker/env';
import { creerD1 } from './aide/d1';

const CLE_APP = 'cle-de-l-appareil-0123456789abcdefghijklmnopqrstuvwxyz';
const CLE_PIPELINE = 'cle-du-pipeline-0123456789abcdefghijklmnopqrstuvwxyz';

let env: Env;

const appel = (chemin: string, init: RequestInit = {}, cle?: string) =>
  app.request(
    chemin,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(cle ? { Authorization: `Bearer ${cle}` } : {}),
      },
    },
    env,
  );

const pousser = (docs: DocSync[], cle = CLE_APP, chemin = '/api/sync/pousser') =>
  appel(chemin, { method: 'POST', body: JSON.stringify({ docs }) }, cle);

const tirer = async (depuis = 0, cle = CLE_APP, chemin = '/api/sync/tirer') => {
  const reponse = await appel(`${chemin}?depuis=${depuis}`, {}, cle);
  return (await reponse.json()) as { docs: DocSync[]; rev: number; encore: boolean };
};

beforeEach(async () => {
  env = { DB: creerD1(), ASSETS: {} as Fetcher, PIPELINE_KEY: CLE_PIPELINE };
  await appel('/api/configurer', { method: 'POST', body: JSON.stringify({ cle: CLE_APP }) });
});

describe('lien secret', () => {
  it('la première ouverture enregistre la clé, une seule fois', async () => {
    env = { DB: creerD1(), ASSETS: {} as Fetcher, PIPELINE_KEY: CLE_PIPELINE };
    expect(await (await appel('/api/etat')).json()).toMatchObject({ configure: false });

    const premiere = await appel('/api/configurer', {
      method: 'POST',
      body: JSON.stringify({ cle: CLE_APP }),
    });
    expect(premiere.status).toBe(200);
    expect(await (await appel('/api/etat')).json()).toMatchObject({ configure: true });

    const seconde = await appel('/api/configurer', {
      method: 'POST',
      body: JSON.stringify({ cle: 'une-autre-cle-0123456789abcdefghijklmnopqrstuvwxyz' }),
    });
    expect(seconde.status).toBe(409);
  });

  it('refuse une clé trop courte', async () => {
    env = { DB: creerD1(), ASSETS: {} as Fetcher };
    const reponse = await appel('/api/configurer', {
      method: 'POST',
      body: JSON.stringify({ cle: 'court' }),
    });
    expect(reponse.status).toBe(400);
  });

  it('sans la clé, l\'API ne montre rien', async () => {
    expect((await appel('/api/sync/tirer')).status).toBe(401);
    expect((await appel('/api/sync/tirer', {}, 'mauvaise-cle')).status).toBe(401);
    expect((await appel('/api/sync/tirer', {}, CLE_APP)).status).toBe(200);
  });

  it('les points d\'entrée du pipeline sont interdits à l\'app', async () => {
    expect((await appel('/api/admin/docs', {}, CLE_APP)).status).toBe(403);
    expect((await appel('/api/admin/docs', {}, CLE_PIPELINE)).status).toBe(200);
  });

  it('la réinitialisation rend l\'ancienne clé inutilisable', async () => {
    await appel('/api/admin/reinitialiser-acces', { method: 'POST' }, CLE_PIPELINE);
    expect((await appel('/api/sync/tirer', {}, CLE_APP)).status).toBe(401);
    expect(await (await appel('/api/etat')).json()).toMatchObject({ configure: false });
  });
});

describe('synchronisation', () => {
  const tentative = (id: string, majLe: number, points = 1): DocSync => ({
    collection: 'tentatives',
    id,
    data: { id, points },
    majLe,
  });

  it('renvoie les documents poussés, avec des révisions croissantes', async () => {
    await pousser([tentative('a', 10), tentative('b', 11)]);
    const { docs, rev, encore } = await tirer();
    expect(docs.map((d) => d.id)).toEqual(['a', 'b']);
    expect(docs[0]!.rev).toBeLessThan(docs[1]!.rev!);
    expect(rev).toBe(docs[1]!.rev);
    expect(encore).toBe(false);
  });

  it('ne renvoie que ce qui a changé depuis la dernière révision', async () => {
    await pousser([tentative('a', 10)]);
    const premier = await tirer();
    await pousser([tentative('b', 11)]);
    const second = await tirer(premier.rev);
    expect(second.docs.map((d) => d.id)).toEqual(['b']);
  });

  it('en cas de conflit, la modification la plus récente gagne', async () => {
    await pousser([tentative('a', 20, 1)]);
    await pousser([tentative('a', 10, 0)]); // écriture plus ancienne : ignorée
    let { docs } = await tirer();
    expect(docs[0]!.data).toMatchObject({ points: 1 });

    await pousser([tentative('a', 30, 0.5)]);
    ({ docs } = await tirer());
    expect(docs).toHaveLength(1);
    expect(docs[0]!.data).toMatchObject({ points: 0.5 });
  });

  it('propage les suppressions', async () => {
    await pousser([tentative('a', 10)]);
    await pousser([{ collection: 'tentatives', id: 'a', majLe: 20, supprime: true }]);
    const { docs } = await tirer();
    expect(docs).toEqual([expect.objectContaining({ id: 'a', supprime: true })]);
  });

  it('l\'app ne peut pas écrire le contenu pédagogique', async () => {
    const reponse = await pousser([
      { collection: 'questions', id: 'q', data: { id: 'q' }, majLe: 1 },
      tentative('a', 1),
    ]);
    expect(await reponse.json()).toEqual({ acceptes: 1 });
    expect((await tirer()).docs.map((d) => d.collection)).toEqual(['tentatives']);
  });

  it('le pipeline écrit le contenu ; les textes internes ne sont pas envoyés à l\'app', async () => {
    await pousser(
      [
        { collection: 'questions', id: 'q', data: { id: 'q' }, majLe: 1 },
        { collection: 'textes', id: 't', data: { id: 't', texte: 'cours' }, majLe: 1 },
      ],
      CLE_PIPELINE,
      '/api/admin/docs',
    );
    expect((await tirer()).docs.map((d) => d.collection)).toEqual(['questions']);
    const cote = await tirer(0, CLE_PIPELINE, '/api/admin/docs');
    expect(cote.docs.map((d) => d.collection).sort()).toEqual(['questions', 'textes']);
  });

  it('ignore les documents mal formés', async () => {
    const reponse = await pousser([
      { collection: 'inconnue', id: 'x', majLe: 1 } as unknown as DocSync,
      { collection: 'tentatives', id: '', majLe: 1 },
    ]);
    expect(await reponse.json()).toEqual({ acceptes: 0 });
  });
});

describe('validation des corrections', () => {
  const question: Question = {
    id: 'q1',
    matiereId: 'm',
    chapitreId: 'c1',
    type: 'multiple',
    enonce: 'Énoncé',
    propositions: [
      { id: 'A', texte: 'a', correcte: true },
      { id: 'B', texte: 'b', correcte: false },
    ],
    explication: '',
    difficulte: 1,
    source: 'annale',
    version: 1,
  };
  const anomalie: Anomalie = {
    id: 'an1',
    type: 'reponse_fausse',
    cible: { questionId: 'q1', fichierNom: 'Annale 2023.pdf', page: 2 },
    description: 'Le corrigé indique A alors que le cours donne B.',
    correction: 'Réponse B',
    explication: 'Voir cours.',
    source: 'Cours, page 12',
    patch: { op: 'reponses', questionId: 'q1', correctes: ['B'] },
    statut: 'en_attente',
    creeLe: 1,
  };

  const lire = async <T>(collection: string, id: string) =>
    (await tirer(0, CLE_PIPELINE, '/api/admin/docs')).docs.find(
      (d) => d.collection === collection && d.id === id,
    )?.data as T;

  beforeEach(async () => {
    await pousser(
      [
        { collection: 'questions', id: 'q1', data: question, majLe: 1 },
        { collection: 'anomalies', id: 'an1', data: anomalie, majLe: 1 },
      ],
      CLE_PIPELINE,
      '/api/admin/docs',
    );
  });

  const decider = (decision: 'validee' | 'refusee', cible: 'anomalie' | 'fichier', cibleId: string) =>
    pousser([
      {
        collection: 'decisions',
        id: `${cible}:${cibleId}`,
        data: { id: `${cible}:${cibleId}`, cible, cibleId, decision, date: 50 },
        majLe: Date.now(),
      },
    ]);

  it('une correction validée modifie la question et entre au journal', async () => {
    await decider('validee', 'anomalie', 'an1');
    const q = await lire<Question>('questions', 'q1');
    expect(q.propositions!.map((p) => p.correcte)).toEqual([false, true]);
    expect(q.version).toBe(2);
    expect(await lire<Anomalie>('anomalies', 'an1')).toMatchObject({ statut: 'validee', decideLe: 50 });
    expect(await lire('decisions', 'anomalie:an1')).toMatchObject({ decision: 'validee' });
  });

  it('une correction refusée ne change rien mais reste au journal', async () => {
    await decider('refusee', 'anomalie', 'an1');
    const q = await lire<Question>('questions', 'q1');
    expect(q.propositions!.map((p) => p.correcte)).toEqual([true, false]);
    expect(await lire<Anomalie>('anomalies', 'an1')).toMatchObject({ statut: 'refusee' });
  });

  it('une décision déjà prise n\'est pas rejouée', async () => {
    await decider('refusee', 'anomalie', 'an1');
    await decider('validee', 'anomalie', 'an1');
    const q = await lire<Question>('questions', 'q1');
    expect(q.propositions!.map((p) => p.correcte)).toEqual([true, false]);
  });

  it('valider un fichier modifié le remet dans la file du pipeline', async () => {
    const fichier: Fichier = {
      id: 'f1',
      nom: 'Cours.pdf',
      chemin: 'Cardio/Cours.pdf',
      mimeType: 'application/pdf',
      role: 'cours',
      etat: 'modifie',
      modifieLe: '2026-11-10T10:00:00Z',
      chapitreId: 'c1',
    };
    const chapitre: Chapitre = {
      id: 'c1',
      matiereId: 'm',
      titre: 'Chapitre',
      ordre: 1,
      fichierIds: ['f1'],
      majEnAttente: true,
      version: 1,
    };
    await pousser(
      [
        { collection: 'fichiers', id: 'f1', data: fichier, majLe: 1 },
        { collection: 'chapitres', id: 'c1', data: chapitre, majLe: 1 },
      ],
      CLE_PIPELINE,
      '/api/admin/docs',
    );

    await decider('validee', 'fichier', 'f1');
    expect(await lire<Fichier>('fichiers', 'f1')).toMatchObject({ etat: 'maj_validee' });
    expect(await lire<Chapitre>('chapitres', 'c1')).toMatchObject({ majEnAttente: true });
  });

  it('refuser un fichier modifié conserve le contenu et retire le badge', async () => {
    const fichier: Fichier = {
      id: 'f1',
      nom: 'Cours.pdf',
      chemin: 'Cardio/Cours.pdf',
      mimeType: 'application/pdf',
      role: 'cours',
      etat: 'modifie',
      modifieLe: '2026-11-10T10:00:00Z',
      chapitreId: 'c1',
    };
    await pousser(
      [
        { collection: 'fichiers', id: 'f1', data: fichier, majLe: 1 },
        {
          collection: 'chapitres',
          id: 'c1',
          data: { id: 'c1', matiereId: 'm', titre: 'C', ordre: 1, fichierIds: ['f1'], majEnAttente: true, version: 1 },
          majLe: 1,
        },
      ],
      CLE_PIPELINE,
      '/api/admin/docs',
    );

    await decider('refusee', 'fichier', 'f1');
    expect(await lire<Fichier>('fichiers', 'f1')).toMatchObject({
      etat: 'a_jour',
      versionIgnoree: '2026-11-10T10:00:00Z',
    });
    expect(await lire<Chapitre>('chapitres', 'c1')).toMatchObject({ majEnAttente: false });
  });
});

describe('dépôt de fichiers', () => {
  const morceau = (id: string, v: number, n: number, texte: string, cle = CLE_APP) =>
    appel(`/api/depot/${id}/${v}/${n}`, { method: 'PUT', body: texte, headers: { 'Content-Type': 'text/plain' } }, cle);
  const commencer = async (nom: string, role = 'cours', taille = 5000) =>
    (await (await appel('/api/depot/commencer', { method: 'POST', body: JSON.stringify({ nom, role, taille }) }, CLE_APP)).json()) as {
      id: string;
      v: number;
    };
  const terminer = (id: string, v: number, extra: Record<string, unknown> = {}) =>
    appel(
      `/api/depot/${id}/${v}/terminer`,
      { method: 'POST', body: JSON.stringify({ nom: 'Cours.pdf', role: 'cours', taille: 5000, morceaux: 2, ...extra }) },
      CLE_APP,
    );
  const lireMorceau = (id: string, n: number, cle = CLE_PIPELINE) => appel(`/api/admin/depot/${id}/${n}`, {}, cle);
  const fiches = async () => (await tirer()).docs.filter((d) => d.collection === 'depots' && !d.supprime);

  it('envoie un fichier en morceaux et le rend lisible par le pipeline seulement', async () => {
    const { id, v } = await commencer('Cours.pdf');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await morceau(id, v, 0, 'QUJD')).status).toBe(200);
    expect((await morceau(id, v, 1, 'REVG')).status).toBe(200);
    const fin = await terminer(id, v);
    expect(fin.status).toBe(200);
    expect(await fin.json()).toMatchObject({ id, nom: 'Cours.pdf', role: 'cours', mimeType: 'application/pdf', morceaux: 2, v });

    // La fiche arrive sur les appareils, jamais le contenu.
    const [fiche] = await fiches();
    expect(fiche!.data).toMatchObject({ id, nom: 'Cours.pdf' });
    expect(await (await lireMorceau(id, 0)).text()).toBe('QUJD');
    expect(await (await lireMorceau(id, 1)).text()).toBe('REVG');
    expect((await lireMorceau(id, 2)).status).toBe(404);
    expect((await lireMorceau(id, 0, CLE_APP)).status).toBe(403);
  });

  it('refuse un envoi incomplet', async () => {
    const { id, v } = await commencer('Cours.pdf');
    await morceau(id, v, 0, 'QUJD');
    expect((await terminer(id, v)).status).toBe(409);
    expect(await fiches()).toHaveLength(0);
  });

  it('refuse un format non pris en charge, un fichier trop gros et un rôle inconnu', async () => {
    const envoi = (corps: object) => appel('/api/depot/commencer', { method: 'POST', body: JSON.stringify(corps) }, CLE_APP);
    expect((await envoi({ nom: 'film.mp4', role: 'cours', taille: 10 })).status).toBe(415);
    expect((await envoi({ nom: 'gros.pdf', role: 'cours', taille: 60_000_000 })).status).toBe(413);
    expect((await envoi({ nom: 'a.pdf', role: 'autre', taille: 10 })).status).toBe(400);
    expect((await envoi({ nom: '', role: 'cours', taille: 10 })).status).toBe(400);
  });

  it('refuse un morceau démesuré ou une adresse invalide', async () => {
    const { id, v } = await commencer('Cours.pdf');
    expect((await morceau(id, v, 0, 'A'.repeat(1_000_001))).status).toBe(413);
    expect((await morceau(id, v, 0, '')).status).toBe(413);
    expect((await morceau('../x', v, 0, 'QUJD')).status).toBe(404);
    expect((await morceau(id, v, 9999, 'QUJD')).status).toBe(400);
  });

  it("sans la clé, rien n'est accepté", async () => {
    const reponse = await appel('/api/depot/commencer', { method: 'POST', body: JSON.stringify({ nom: 'a.pdf', role: 'cours', taille: 10 }) });
    expect(reponse.status).toBe(401);
  });

  it("un nouvel envoi du même fichier remplace l'ancien, sans jamais le laisser à moitié", async () => {
    const un = await commencer('Cours.pdf');
    await morceau(un.id, un.v, 0, 'AAAA');
    await morceau(un.id, un.v, 1, 'BBBB');
    await terminer(un.id, un.v);

    const deux = await commencer('Cours.pdf');
    expect(deux.id).toBe(un.id);
    expect(deux.v).toBeGreaterThanOrEqual(un.v);
    // Tant que le nouvel envoi n'est pas fini, l'ancien contenu reste lisible.
    await morceau(deux.id, deux.v + 1, 0, 'CCCC');
    expect(await (await lireMorceau(un.id, 0)).text()).toBe('AAAA');

    await morceau(deux.id, deux.v + 1, 1, 'DDDD');
    expect((await terminer(deux.id, deux.v + 1)).status).toBe(200);
    expect(await (await lireMorceau(un.id, 0)).text()).toBe('CCCC');
    expect(await (await lireMorceau(un.id, 1)).text()).toBe('DDDD');
    const liste = await fiches();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.data).toMatchObject({ v: deux.v + 1 });
  });

  it("un fichier du même nom mais d'un autre rôle est un autre fichier", async () => {
    const cours = await commencer('Cardio.pdf', 'cours');
    const annales = await commencer('Cardio.pdf', 'annales');
    expect(annales.id).not.toBe(cours.id);
  });

  it('retirer un fichier efface son contenu et prévient les appareils', async () => {
    const { id, v } = await commencer('Cours.pdf');
    await morceau(id, v, 0, 'QUJD');
    await morceau(id, v, 1, 'REVG');
    await terminer(id, v);
    expect((await appel(`/api/depot/${id}`, { method: 'DELETE' }, CLE_APP)).status).toBe(200);
    expect(await fiches()).toHaveLength(0);
    expect((await lireMorceau(id, 0)).status).toBe(404);
  });
});
