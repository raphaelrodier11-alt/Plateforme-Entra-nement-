import { beforeEach, describe, expect, it } from 'vitest';
import { matiereDepuisChemin, nomMatiereLisible } from '../../shared/matieres';
import type { Chapitre, Fichier, Matiere, Tache } from '../../shared/types';
import { executer } from '../../pipeline/orchestrateur';
import { IaTest, StockageMemoire, lireTest } from './aide';

describe('matière d’après le dossier du Drive', () => {
  it('saute le dossier de semestre et prend la matière', () => {
    expect(matiereDepuisChemin('SEMESTRE 1/INFECTIO/Cours 1.pdf')).toEqual({ nom: 'Infectio', semestre: 1 });
    expect(matiereDepuisChemin('SEMESTRE 2/BMCT/Sous-dossier/Cours.pdf')).toEqual({ nom: 'BMCT', semestre: 2 });
    expect(matiereDepuisChemin('ANGLAIS/Partiel 2023.pdf')).toEqual({ nom: 'Anglais' });
  });
  it('pour un dossier envoyé depuis l’appli, ne se fie qu’à « SEMESTRE n / MATIÈRE »', () => {
    expect(matiereDepuisChemin('Lot de survie/Cardiologie/Cours.pdf', true)).toBeUndefined();
    expect(matiereDepuisChemin('Lot de survie/SEMESTRE 1/INFECTIO/Cours.pdf', true)).toEqual({ nom: 'Infectio', semestre: 1 });
    expect(matiereDepuisChemin('Mon dossier/SEMESTRE 2/GÉNÉTIQUE/x.pdf')).toEqual({ nom: 'Génétique', semestre: 2 });
  });
  it('laisse l’IA décider quand il n’y a pas de dossier de matière', () => {
    expect(matiereDepuisChemin('Cours seul.pdf')).toBeUndefined();
    expect(matiereDepuisChemin('SEMESTRE 1/Cours seul.pdf')).toBeUndefined();
    expect(matiereDepuisChemin('ACC D1 A CORRIGER/x.pdf')).toBeUndefined();
    expect(matiereDepuisChemin(undefined)).toBeUndefined();
  });
  it('met les noms en forme', () => {
    expect(nomMatiereLisible('THERAPEUTIQUE')).toBe('Therapeutique');
    expect(nomMatiereLisible('LCA')).toBe('LCA');
    expect(nomMatiereLisible('Appareil cardiovasculaire')).toBe('Appareil cardiovasculaire');
    expect(nomMatiereLisible('HEMATO ')).toBe('Hemato');
  });
});

const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const PAGE = (n: number) => `Cours page ${n}. ${'Contenu du cours assez long pour être lu comme du texte. '.repeat(5)}`;
let stockage: StockageMemoire;
let maintenant: number;

const passer = () =>
  executer({
    stockage,
    creerDrive: () => {
      throw new Error('pas de drive');
    },
    creerIa: async (o) => new IaTest(o.plafondUsd),
    lire: lireTest,
    mode: 'auto',
    budgetMinutes: 10,
    maintenant,
  });

beforeEach(async () => {
  stockage = new StockageMemoire();
  stockage.jeton = undefined;
  maintenant = T0;
  await stockage.ecrire('reglages', [{ id: 'principal' }]);
});

describe('rangement par matière pendant l’import', () => {
  it('range chaque fichier dans la matière de son dossier, sans matière parasite', async () => {
    const f = (id: string, chemin: string) => ({ id, nom: chemin.split('/').at(-1)!, chemin, role: 'cours' as const, contenu: [PAGE(1), PAGE(2)].join('\f'), modifieLe: '2026-11-16T07:00:00.000Z' });
    await stockage.deposer(f('depot-cours-0001', 'SEMESTRE 1/INFECTIO/Hépatites.pdf'));
    await stockage.deposer(f('depot-cours-0002', 'SEMESTRE 1/DERMATO/Eczéma.pdf'));
    await stockage.deposer(f('depot-cours-0003', 'SEMESTRE 2/GÉNÉTIQUE/Hérédité.pdf'));
    await passer();
    await stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
    maintenant += 3_600_000;
    await passer();

    const matieres = stockage.liste<Matiere>('matieres');
    expect(matieres.map((m) => m.nom).sort()).toEqual(['Dermato', 'Génétique', 'Infectio']);
    expect(matieres.find((m) => m.nom === 'Génétique')?.semestre).toBe(2);

    const idDe = (nom: string) => matieres.find((m) => m.nom === nom)!.id;
    const chapitres = stockage.liste<Chapitre>('chapitres');
    expect(chapitres.find((c) => c.titre.includes('Hépatites'))?.matiereId).toBe(idDe('Infectio'));
    expect(chapitres.find((c) => c.titre.includes('Eczéma'))?.matiereId).toBe(idDe('Dermato'));
    const fichiers = stockage.liste<Fichier>('fichiers');
    expect(fichiers.find((x) => x.chemin.includes('Hérédité'))?.matiereId).toBe(idDe('Génétique'));
  });
});
