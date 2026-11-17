import { beforeEach, describe, expect, it } from 'vitest';
import type { Estimation, EtatPipeline, Fichier, Tache } from '../../shared/types';
import { executer, type OptionsIa } from '../../pipeline/orchestrateur';
import { IaTest, StockageMemoire, lireTest } from './aide';

const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const page = (n: number) => `Insuffisance cardiaque, page ${n}. ${'Contenu du cours assez long pour être lu comme du texte. '.repeat(5)}`;
const COURS = [page(1), page(2)].join('\f');

let stockage: StockageMemoire;
let maintenant: number;
let options: OptionsIa[];
let quotaApres = Infinity;

const passer = () =>
  executer({
    stockage,
    creerDrive: () => {
      throw new Error('Le drive ne doit pas être utilisé');
    },
    creerIa: async (o) => {
      options.push(o);
      return new IaTest(o.plafondUsd, 1000, quotaApres, o.gratuit);
    },
    lire: lireTest,
    mode: 'auto',
    budgetMinutes: 10,
    maintenant,
  });

const deposer = () =>
  stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', chemin: 'Cardiologie/Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
const approuver = () =>
  stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);

beforeEach(async () => {
  stockage = new StockageMemoire();
  stockage.jeton = undefined;
  maintenant = T0;
  options = [];
  quotaApres = Infinity;
  await stockage.ecrire('reglages', [{ id: 'principal' }]);
});

describe('mode gratuit', () => {
  it('est actif par défaut : l\'estimation est à 0 € et dit pourquoi', async () => {
    await deposer();
    await passer();
    const [estimation] = stockage.liste<Estimation>('estimations');
    expect(estimation).toMatchObject({ gratuit: true, totalUsd: 0, mensuelUsd: 0, tarifs: [] });
    expect(estimation!.equivalentUsd).toBeGreaterThan(0);
    expect(estimation!.lignes.every((l) => l.coutUsd === 0)).toBe(true);
    expect(estimation!.lignes.length).toBeGreaterThan(0);
    expect(estimation!.hypotheses.join(' ')).toContain('Mode gratuit');
    expect(estimation!.hypotheses.join(' ')).toContain('requêtes');
  });

  it('demande à l\'IA de ne faire aucune dépense', async () => {
    await deposer();
    await passer();
    await approuver();
    maintenant += 3_600_000;
    await passer();
    expect(options[0]).toMatchObject({ gratuit: true });
  });

  it('peut être désactivé dans les réglages : l\'estimation redevient payante', async () => {
    await stockage.ecrire('reglages', [{ id: 'principal', modeGratuit: false }]);
    await deposer();
    await passer();
    const [estimation] = stockage.liste<Estimation>('estimations');
    expect(estimation!.gratuit).toBeUndefined();
    expect(estimation!.totalUsd).toBeGreaterThan(0);
    await approuver();
    maintenant += 3_600_000;
    await passer();
    expect(options[0]).toMatchObject({ gratuit: false });
  });

  it('s\'arrête proprement quand la limite gratuite est atteinte, puis reprend', async () => {
    await deposer();
    await passer();
    await approuver();

    quotaApres = 3;
    maintenant += 3_600_000;
    expect(await passer()).toBe('quota');
    const etat = stockage.un<EtatPipeline>('etat', 'pipeline')!;
    expect(etat.statut).toBe('en_cours');
    expect(etat.message).toContain('Limite gratuite');
    expect(etat.message).toContain('Rien n’est dépensé');
    expect(etat.depense?.usd ?? 0).toBe(0);

    // Le lendemain, la limite est levée : le travail reprend là où il s'était arrêté.
    quotaApres = Infinity;
    for (let i = 0; i < 4; i++) {
      maintenant += 3_600_000;
      const issue = await passer();
      if (issue === 'termine') break;
    }
    expect(stockage.liste<Fichier>('fichiers').every((f) => f.etat === 'a_jour')).toBe(true);
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')!.statut).toBe('ok');
  });
});
