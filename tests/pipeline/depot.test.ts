import { beforeEach, describe, expect, it } from 'vitest';
import type { Chapitre, EtatPipeline, Fichier, Fiche, NotificationApp, Question, Tache } from '../../shared/types';
import { executer } from '../../pipeline/orchestrateur';
import { StockageMemoire, IaTest, lireTest } from './aide';

const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const PAGE = (n: number) => `Insuffisance cardiaque, page ${n}. ${'Contenu du cours assez long pour être lu comme du texte. '.repeat(5)}`;
const COURS = [PAGE(1), PAGE(2)].join('\f');
const ANNALE = `Partiel 2024 de cardiologie.\nQ1: Quels sont les signes d'insuffisance cardiaque gauche ? | A) Orthopnée | B) Turgescence jugulaire | C) Crépitants pulmonaires | REP: A,C`;

let stockage: StockageMemoire;
let maintenant: number;

const passer = () =>
  executer({
    stockage,
    // Aucun drive n'est connecté : seul le dépôt de fichiers est utilisé.
    creerDrive: () => {
      throw new Error("Le drive ne doit pas être utilisé");
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

describe('pipeline : fichiers envoyés depuis l\'app (sans Google Drive)', () => {
  it('ne fait rien tant qu\'aucun fichier n\'a été envoyé', async () => {
    expect(await passer()).toBe('non_configure');
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')?.message).toContain('Fichiers');
  });

  it('lit les fichiers envoyés et présente une estimation sans rien dépenser', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await stockage.deposer({ id: 'depot-annale-001', nom: 'Cardiologie partiel 2024.pdf', role: 'annales', contenu: ANNALE, modifieLe: '2026-11-16T07:01:00.000Z' });

    expect(await passer()).toBe('estimation');
    expect(stockage.liste<Fichier>('fichiers').map((f) => [f.id, f.role, f.etat]).sort()).toEqual([
      ['depot:depot-annale-001', 'annale', 'nouveau'],
      ['depot:depot-cours-0001', 'cours', 'nouveau'],
    ]);
    expect(stockage.liste('textes')).toHaveLength(2);
    expect(stockage.liste('estimations')).toHaveLength(1);
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')).toMatchObject({ statut: 'en_attente_validation', driveConnecte: false });
  });

  it('génère le chapitre après accord, puis ne refait rien', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await stockage.deposer({ id: 'depot-annale-001', nom: 'Cardiologie partiel 2024.pdf', role: 'annales', contenu: ANNALE, modifieLe: '2026-11-16T07:01:00.000Z' });
    await passer();
    await stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
    maintenant += 3_600_000;

    expect(await passer()).toBe('termine');
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre).toMatchObject({ version: 1, aGenerer: false });
    expect(stockage.un<Fiche>('fiches', chapitre.id)).toBeDefined();
    const questions = stockage.liste<Question>('questions');
    expect(questions.filter((q) => q.source === 'annale')).toHaveLength(1);
    expect(questions.filter((q) => q.source === 'genere').length).toBeGreaterThanOrEqual(20);
    expect(stockage.liste<Fichier>('fichiers').every((f) => f.etat === 'a_jour')).toBe(true);

    maintenant += 3_600_000;
    expect(await passer()).toBe('rien_a_faire');
  });

  it('un fichier renvoyé est repris sans demander de validation', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await passer();
    await stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
    maintenant += 3_600_000;
    await passer();

    // L'utilisateur renvoie une version plus longue du même fichier.
    maintenant += 3_600_000;
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: `${COURS}\f${PAGE(3)}`, modifieLe: '2026-11-16T12:00:00.000Z' });
    expect(await passer()).toBe('termine');

    expect(stockage.un<Fichier>('fichiers', 'depot:depot-cours-0001')).toMatchObject({ etat: 'a_jour', nbPages: 3, versionTraitee: '2026-11-16T12:00:00.000Z' });
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre.version).toBe(2);
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'fichier_modifie')).toBe(false);
  });

  it('un fichier retiré est signalé sans effacer le contenu déjà généré', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await stockage.deposer({ id: 'depot-cours-0002', nom: 'Autre cours.pdf', role: 'cours', contenu: COURS.replaceAll('Insuffisance cardiaque', 'Autre'), modifieLe: '2026-11-16T07:02:00.000Z' });
    await passer();
    await stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
    maintenant += 3_600_000;
    await passer();
    const avant = stockage.liste<Question>('questions').length;

    await stockage.supprimer('depots', ['depot-cours-0002']);
    maintenant += 3_600_000;
    const issue = await passer();
    expect(issue).not.toBe('erreur');
    expect(stockage.un<Fichier>('fichiers', 'depot:depot-cours-0002')!.etat).toBe('supprime');
    expect(stockage.liste<Question>('questions')).toHaveLength(avant);
  });

  it('retirer tous les fichiers envoyés n\'est pas une panne', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await passer();
    await stockage.supprimer('depots', ['depot-cours-0001']);
    maintenant += 3_600_000;
    expect(await passer()).not.toBe('erreur');
    expect(stockage.un<Fichier>('fichiers', 'depot:depot-cours-0001')!.etat).toBe('supprime');
  });

  it('un complément envoyé pour un chapitre y est rattaché sans classement, et le chapitre est régénéré', async () => {
    await stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', role: 'cours', contenu: COURS, modifieLe: '2026-11-16T07:00:00.000Z' });
    await passer();
    await stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
    maintenant += 3_600_000;
    await passer();
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre.version).toBe(1);

    await stockage.deposer({
      id: 'depot-compl-0001', nom: 'Complément NYHA.pdf', chemin: `Compléments/${chapitre.id}/Complément NYHA.pdf`, role: 'cours',
      contenu: `Complément NYHA, page 1. ${'Précisions sur la classification NYHA et ses stades. '.repeat(8)}`, modifieLe: '2026-11-17T09:00:00.000Z', chapitreId: chapitre.id,
    });
    maintenant += 3_600_000;
    expect(await passer()).toBe('termine');

    const apres = stockage.un<Chapitre>('chapitres', chapitre.id)!;
    expect(apres.fichierIds).toContain('depot:depot-compl-0001');
    expect(apres.version).toBe(2);
    const fichier = stockage.un<Fichier>('fichiers', 'depot:depot-compl-0001')!;
    expect(fichier).toMatchObject({ role: 'cours', chapitreId: chapitre.id, matiereId: chapitre.matiereId, etat: 'a_jour' });
    // Aucun nouveau chapitre n'a été créé pour le complément.
    expect(stockage.liste<Chapitre>('chapitres')).toHaveLength(1);
  });
});
