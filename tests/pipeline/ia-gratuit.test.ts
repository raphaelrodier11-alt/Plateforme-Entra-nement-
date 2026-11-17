import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appels: string[] = [];
let reponse: () => unknown = () => ({ text: '{"ok":true}', usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 } });

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      list: async () =>
        (async function* () {
          yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.5-pro', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] };
        })(),
      generateContent: async ({ model }: { model: string }) => {
        appels.push(model);
        return reponse();
      },
    };
    files = {};
  },
}));

const { iaGemini, QuotaAtteint } = await import('../../pipeline/ia');

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

  it('s\'arrête sur une limite de requêtes (429) au lieu d\'insister', async () => {
    reponse = () => {
      throw Object.assign(new Error('quota'), { status: 429 });
    };
    const ia = await iaGemini({ cle: 'k', plafondUsd: 100, gratuit: true });
    const echec = ia.json(demande('masse')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    const erreur = await echec;
    expect(erreur).toBeInstanceOf(QuotaAtteint);
    expect((erreur as Error).name).toBe('QuotaAtteint');
    // 4 essais au plus, espacés.
    expect(appels.length).toBeLessThanOrEqual(4);
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
