import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assemblerContexte,
  chercherExtraits,
  demandeUneScene3D,
  estDemandeLongue,
  motsCles,
  nombreDemande,
  texteFiche,
} from '../shared/assistant';
import type { Chapitre, Fiche } from '../shared/types';
import type { Env } from '../worker/env';
import app from '../worker/index';
import { creerD1 } from './aide/d1';

const chapitre = (id: string, matiereId: string, titre: string, resume = ''): Chapitre => ({
  id,
  matiereId,
  titre,
  ordre: 1,
  resume,
  fichierIds: [],
  version: 1,
});

const fiche = (id: string, matiereId: string, contenu: string): Fiche => ({
  id,
  chapitreId: id,
  matiereId,
  titre: id,
  version: 1,
  genereLe: 0,
  sections: [{ id: 's', titre: 'Section', blocs: [{ type: 'texte', contenu }] }],
});

describe('recherche dans les cours', () => {
  const chapitres = [
    chapitre('c1', 'm1', 'Physiologie rénale', 'Filtration glomérulaire et diurèse'),
    chapitre('c2', 'm1', 'Insuffisance cardiaque'),
    chapitre('c3', 'm2', 'Pharmacologie des diurétiques'),
  ];
  const fiches = [
    fiche('c1', 'm1', 'Le débit de filtration glomérulaire est régulé par les artérioles.'),
    fiche('c2', 'm1', 'Le diurétique de l’anse est utilisé en cas de surcharge.'),
  ];

  it('retire les mots vides et les accents', () => {
    expect(motsCles("Explique-moi la filtration glomérulaire, s'il te plaît")).toContain('filtration');
    expect(motsCles('Le débit')).toContain('debit');
    expect(motsCles('Les des une')).toEqual([]);
  });

  it('classe le chapitre le plus proche en premier', () => {
    const r = chercherExtraits({ question: 'Comment est régulée la filtration glomérulaire ?', chapitres, fiches });
    expect(r[0].chapitreId).toBe('c1');
  });

  it('respecte la matière du bot', () => {
    const r = chercherExtraits({ question: 'diurétiques', matiereId: 'm1', chapitres, fiches });
    expect(r.every((e) => e.chapitreId !== 'c3')).toBe(true);
  });

  it("ne renvoie rien quand la question n'a aucun rapport", () => {
    expect(chercherExtraits({ question: 'xylophone quantique', chapitres, fiches })).toEqual([]);
  });

  it('comprend une question de suivi grâce au contexte précédent', () => {
    const r = chercherExtraits({ question: 'Et pour la régulation ?', contexteAvant: 'filtration glomérulaire', chapitres, fiches });
    expect(r[0]?.chapitreId).toBe('c1');
  });

  it("met à plat les arbres et limite la taille du contexte", () => {
    const f: Fiche = {
      ...fiche('c1', 'm1', ''),
      sections: [
        {
          id: 's',
          titre: 'Arbre',
          blocs: [{ type: 'arbre', racine: { label: 'Racine', branches: [{ condition: 'oui', noeud: { label: 'Feuille' } }] } }],
        },
      ],
    };
    const t = texteFiche(f);
    expect(t).toContain('Racine');
    expect(t).toContain('Feuille');
    const long = [{ chapitreId: 'a', titre: 'a', texte: 'x'.repeat(50_000), score: 1 }];
    expect(assemblerContexte(long, 1000).length).toBeLessThan(1100);
  });
});

describe('demandes de documents', () => {
  it('lit le nombre de questions demandées', () => {
    expect(nombreDemande('Fais-moi 30 QCM sur le rein')).toBe(30);
    expect(nombreDemande('une fiche')).toBeUndefined();
  });
  it('envoie les grosses demandes en arrière-plan', () => {
    expect(estDemandeLongue('qcm', 'le rein', '30 questions')).toBe(true);
    expect(estDemandeLongue('qcm', 'le rein', '10 questions')).toBe(false);
    expect(estDemandeLongue('fiche', 'rein')).toBe(false);
    expect(estDemandeLongue('fiche', 'rein', 'fiche complète')).toBe(true);
  });
});

describe('demande d\'animation 3D', () => {
  it('reconnaît les demandes de 3D', () => {
    expect(demandeUneScene3D('Montre-moi le cycle cardiaque en 3D')).toBe(true);
    expect(demandeUneScene3D('Fais une animation 3D du néphron')).toBe(true);
    expect(demandeUneScene3D('une animation de la filtration')).toBe(true);
    expect(demandeUneScene3D('Explique-moi la filtration glomérulaire')).toBe(false);
    expect(demandeUneScene3D('Quels sont les signes de 3D ?')).toBe(true);
  });
});

describe('relais Gemini', () => {
  const CLE = 'cle-de-l-appareil-0123456789abcdefghijklmnopqrstuvwxyz';
  let env: Env;
  const appel = (corps: unknown, cle: string | null = CLE) =>
    app.request(
      '/api/assistant',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cle ? { Authorization: `Bearer ${cle}` } : {}) },
        body: JSON.stringify(corps),
      },
      env,
    );

  beforeEach(async () => {
    env = { DB: creerD1(), ASSETS: {} as Fetcher, GEMINI_CHAT_KEY: 'cle-gemini-secrete' };
    await app.request('/api/configurer', { method: 'POST', body: JSON.stringify({ cle: CLE }), headers: { 'Content-Type': 'application/json' } }, env);
  });
  afterEach(() => vi.unstubAllGlobals());

  const gemini = (statut = 200) =>
    vi.fn(async (url: string) =>
      String(url).includes('/models?')
        ? Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] })
        : statut === 200
          ? Response.json({ candidates: [{ content: { parts: [{ text: 'Réponse du Dr' }] } }] })
          : new Response('{}', { status: statut }),
    );

  it('exige la clé de l’appareil', async () => {
    expect((await appel({ messages: [] }, null)).status).toBe(401);
  });

  it('répond en joignant les extraits de cours et la clé dédiée', async () => {
    const f = gemini();
    vi.stubGlobal('fetch', f);
    const r = await appel({ messages: [{ role: 'user', texte: 'Qu’est-ce que la diurèse ?' }], contexte: 'Cours sur la diurèse', matiere: 'Physiologie' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { texte: string }).texte).toBe('Réponse du Dr');
    const appelGen = f.mock.calls.find(([u]) => String(u).includes(':generateContent'))!;
    const init = appelGen[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('cle-gemini-secrete');
    const corps = JSON.parse(init.body as string);
    expect(corps.contents[0].parts[0].text).toContain('<cours>\nCours sur la diurèse');
    expect(corps.systemInstruction.parts[0].text).toContain('Physiologie');
  });

  it('demande du JSON et la consigne 3D pour une scène', async () => {
    const f = gemini();
    vi.stubGlobal('fetch', f);
    const r = await appel({ mode: 'scene3d', messages: [{ role: 'user', texte: 'Crée une animation 3D du cœur' }] });
    expect(r.status).toBe(200);
    const init = f.mock.calls.find(([u]) => String(u).includes(':generateContent'))![1] as RequestInit;
    const corps = JSON.parse(init.body as string);
    expect(corps.generationConfig.responseMimeType).toBe('application/json');
    expect(corps.systemInstruction.parts[0].text).toContain('animation 3D');
  });

  it('refuse une demande invalide ou trop longue', async () => {
    vi.stubGlobal('fetch', gemini());
    expect((await appel({ messages: [{ role: 'assistant', texte: 'x' }] })).status).toBe(400);
    expect((await appel({ messages: [{ role: 'user', texte: 'x'.repeat(5000) }] })).status).toBe(400);
  });

  it('signale un quota atteint et une clé absente', async () => {
    vi.stubGlobal('fetch', gemini(429));
    expect((await appel({ messages: [{ role: 'user', texte: 'Bonjour' }] })).status).toBe(429);
    env.GEMINI_CHAT_KEY = undefined;
    expect((await appel({ messages: [{ role: 'user', texte: 'Bonjour' }] })).status).toBe(503);
  });
});
