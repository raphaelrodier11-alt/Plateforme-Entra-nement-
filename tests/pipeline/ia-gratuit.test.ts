import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appels: string[] = [];
let reponse: (modele?: string) => unknown = () => ({ text: '{"ok":true}', usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 } });

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      list: async () =>
        (async function* () {
          yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.8-flash-lite', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.5-flash', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.5-pro', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] };
        })(),
      generateContent: async ({ model }: { model: string }) => {
        appels.push(model);
        return reponse(model);
      },
    };
    files = {};
  },
}));

const { iaGemini, QuotaAtteint, analyser429 } = await import('../../pipeline/ia');

const demande = (niveau: 'masse' | 'expert') => ({ niveau, etape: 'Test', systeme: 's', consigne: 'c' });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  appels.length = 0;
  reponse = () => ({ text: '{"ok":true}', usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 } });
});
afterEach(() => vi.useRealTimers());

describe('couche Gemini en mode gratuit', () => {
  it('n\'utilise qu\'un seul modèle, jamais le modèle payant, et compte zéro dépense', async () => {
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    expect(ia.modeles).toEqual({ masse: 'gemini-3.8-flash', expert: 'gemini-3.8-flash' });
    await ia.json(demande('masse'));
    const suite = ia.json(demande('expert'));
    await vi.advanceTimersByTimeAsync(9_000);
    await suite;
    expect(appels).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash']);
    // Deux millions de tokens consommés, aucun coût.
    expect(ia.compteur.total).toBe(0);
    expect(ia.compteur.detail[0]!.tokensEntree).toBe(2_000_000);
  });

  it('ignore un modèle expert imposé dans les réglages', async () => {
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true, modeleExpert: 'gemini-3.5-pro' });
    expect(ia.modeles.expert).toBe('gemini-3.8-flash');
  });

  it('espace les requêtes pour respecter la limite par minute', async () => {
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    await ia.json(demande('masse'));
    let terminee = false;
    const suite = ia.json(demande('masse')).then(() => (terminee = true));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(terminee).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await suite;
    expect(terminee).toBe(true);
  });

  const e429 = (message: string) => Object.assign(new Error(message), { status: 429 });
  const MESSAGE_MINUTE = JSON.stringify({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '20s' }] } });
  const MESSAGE_JOUR = JSON.stringify({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '3000s' }] } });

  it('analyse une limite par minute ou par jour', () => {
    expect(analyser429(e429(MESSAGE_MINUTE))).toMatchObject({ quotidien: false, delaiMs: 21_500, quota: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' });
    expect(analyser429(e429(MESSAGE_JOUR)).quotidien).toBe(true);
    expect(analyser429(e429('quota'))).toEqual({ quotidien: false, quota: undefined });
  });

  it('bascule sur un autre modèle gratuit quand la limite du jour est atteinte', async () => {
    reponse = (modele) => {
      if (modele === 'gemini-3.8-flash') throw e429(MESSAGE_JOUR);
      return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
    };
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    const suite = ia.json(demande('masse'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await suite).toEqual({ ok: true });
    expect(appels).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash-lite']);
    expect(ia.requetes).toBe(2);
    // Les requêtes suivantes restent sur le modèle qui fonctionne.
    const suivante = ia.json(demande('masse'));
    await vi.advanceTimersByTimeAsync(10_000);
    await suivante;
    expect(appels.at(-1)).toBe('gemini-3.8-flash-lite');
  });

  it("s'arrête quand tous les modèles gratuits ont atteint leur limite du jour", async () => {
    reponse = () => {
      throw e429(MESSAGE_JOUR);
    };
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    const echec = ia.json(demande('masse')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const erreur = await echec;
    expect(erreur).toBeInstanceOf(QuotaAtteint);
    expect((erreur as { quotidien: boolean }).quotidien).toBe(true);
    expect(appels).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.5-flash']);
  });

  it('attend le délai indiqué sur une limite par minute, puis réussit', async () => {
    let n = 0;
    reponse = () => {
      if (n++ === 0) throw e429(MESSAGE_MINUTE);
      return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } };
    };
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    const suite = ia.json(demande('masse'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await suite).toEqual({ ok: true });
    expect(appels).toHaveLength(2);
  });

  it("n'insiste pas quand la limite persiste sans indication", async () => {
    reponse = () => {
      throw e429('quota');
    };
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    const echec = ia.json(demande('masse')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(await echec).toBeInstanceOf(QuotaAtteint);
    // Une requête, puis deux nouvelles tentatives au plus.
    expect(appels.length).toBeLessThanOrEqual(3);
  });
});

describe('couche Gemini en mode payant (pour comparaison)', () => {
  it('utilise le modèle puissant pour l\'expert et compte la dépense', async () => {
    const ia = await iaGemini({ cle: 'k', plafondUsd: 1000 });
    expect(ia.modeles).toEqual({ masse: 'gemini-3.8-flash', expert: 'gemini-3.5-pro' });
    await ia.json(demande('expert'));
    expect(appels).toEqual(['gemini-3.5-pro']);
    expect(ia.compteur.total).toBeGreaterThan(0);
  });
});
