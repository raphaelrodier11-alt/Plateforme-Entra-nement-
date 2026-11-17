import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Actualisation,
  Chapitre,
  Estimation,
  Fichier,
  NotificationApp,
  Question,
  Tache,
} from '../../shared/types';
import { executer } from '../../pipeline/orchestrateur';
import { IaTest, StockageMemoire, lireTest } from './aide';

const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const page = (n: number) => `Insuffisance cardiaque, page ${n}. ${'Contenu du cours assez long pour être lu comme du texte. '.repeat(5)}`;
const ANCIEN = [page(1), `${page(2)} Trois classes réduisent la mortalité.`].join('\f');
const ACTUEL = [page(1), `${page(2)} Quatre classes réduisent la mortalité, dont les inhibiteurs de SGLT2.`].join('\f');

let stockage: StockageMemoire;
let maintenant: number;

const passer = () =>
  executer({
    stockage,
    creerDrive: () => {
      throw new Error('Le drive ne doit pas être utilisé');
    },
    creerIa: async (o) => new IaTest(o.plafondUsd),
    lire: lireTest,
    mode: 'auto',
    budgetMinutes: 10,
    maintenant,
  });

/** Passages successifs, comme les passages horaires, jusqu'à ce que tout soit traité. */
async function toutTraiter(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    maintenant += 3_600_000;
    const issue = await passer();
    if (issue === 'termine' || issue === 'rien_a_faire') return;
  }
}

const cours = (contenu = ACTUEL, modifieLe = '2026-11-16T07:00:00.000Z') =>
  stockage.deposer({ id: 'depot-cours-0001', nom: 'Insuffisance cardiaque.pdf', chemin: 'Cardiologie/Insuffisance cardiaque.pdf', role: 'cours', contenu, modifieLe });
const ancien = (contenu = ANCIEN, modifieLe = '2026-11-16T07:05:00.000Z') =>
  stockage.deposer({ id: 'depot-ancien-001', nom: 'Insuffisance cardiaque.pdf', chemin: 'Lot de survie/Cardiologie/Insuffisance cardiaque.pdf', role: 'anciens', contenu, modifieLe });
const approuver = () =>
  stockage.ecrire('taches', [{ id: 't', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache]);
const actualisations = () => stockage.liste<Actualisation>('actualisations');
const chapitres = () => stockage.liste<Chapitre>('chapitres');

beforeEach(async () => {
  stockage = new StockageMemoire();
  stockage.jeton = undefined;
  maintenant = T0;
  await stockage.ecrire('reglages', [{ id: 'principal' }]);
});

describe('comparaison des anciennes versions', () => {
  it('compte la comparaison dans l\'estimation', async () => {
    await cours();
    await ancien();
    await passer();
    const [estimation] = stockage.liste<Estimation>('estimations');
    expect(estimation!.lignes.map((l) => l.etape)).toContain('Comparaison des anciennes versions');
    expect(estimation!.hypotheses.join(' ')).toContain("anciennes versions");
  });

  it('compare le cours actuel à l\'ancienne version et montre ce qui a changé', async () => {
    await cours();
    await ancien();
    await passer();
    await approuver();
    await toutTraiter();

    // L'ancienne version ne crée ni chapitre, ni question, ni fiche.
    expect(chapitres().map((c) => c.titre)).toEqual(['Insuffisance cardiaque']);
    const [chapitre] = chapitres();
    expect(chapitre).toMatchObject({ aComparer: false, version: 1 });
    expect(stockage.liste<Question>('questions').every((q) => q.chapitreId === chapitre!.id)).toBe(true);
    expect(stockage.un<Fichier>('fichiers', 'depot:depot-ancien-001')).toMatchObject({
      role: 'ancien',
      etat: 'a_jour',
      chapitreId: chapitre!.id,
    });

    const [actu] = actualisations();
    expect(actu).toMatchObject({
      id: `act-${chapitre!.id}-ancien`,
      chapitreId: chapitre!.id,
      origine: 'ancien',
      fichiers: ['Insuffisance cardiaque.pdf'],
    });
    expect(actu!.changements[0]).toMatchObject({ type: 'ajout', importance: 'majeure' });
    expect(actu!.changements[0]!.apres).toContain('SGLT2');
    const notification = stockage.liste<NotificationApp>('notifications').find((n) => n.type === 'actualisation');
    expect(notification).toMatchObject({ chapitreId: chapitre!.id });
    expect(notification!.message).toContain('1 majeur');
  });

  it('une version identique ne produit aucun changement ni notification', async () => {
    await cours();
    await ancien(ACTUEL);
    await passer();
    await approuver();
    await toutTraiter();
    const [actu] = actualisations();
    expect(actu!.changements).toEqual([]);
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'actualisation')).toBe(false);
  });

  it('refait la comparaison dès que l\'ancienne version est renvoyée', async () => {
    await cours();
    await ancien();
    await passer();
    await approuver();
    await toutTraiter();
    const avant = actualisations()[0]!.signature;

    await ancien(ACTUEL, '2026-11-17T08:00:00.000Z');
    await toutTraiter();
    const [actu] = actualisations();
    expect(actu!.signature).not.toBe(avant);
    expect(actu!.changements).toEqual([]);
  });

  it('ne refait pas une comparaison déjà à jour', async () => {
    await cours();
    await ancien();
    await passer();
    await approuver();
    await toutTraiter();
    const [actu] = actualisations();
    maintenant += 3_600_000;
    expect(await passer()).toBe('rien_a_faire');
    expect(actualisations()[0]).toEqual(actu);
  });

  it('une ancienne version sans cours correspondant est gardée sans créer de chapitre', async () => {
    await cours();
    await stockage.deposer({ id: 'depot-ancien-002', nom: 'Chapitre supprimé.pdf', chemin: 'Lot de survie/Cardiologie/Chapitre supprimé.pdf', role: 'anciens', contenu: ANCIEN.replaceAll('Insuffisance cardiaque', 'Chapitre supprimé'), modifieLe: '2026-11-16T07:10:00.000Z' });
    await passer();
    await approuver();
    await toutTraiter();
    expect(chapitres().map((c) => c.titre)).toEqual(['Insuffisance cardiaque']);
    expect(actualisations()).toHaveLength(0);
    expect(stockage.un<Fichier>('fichiers', 'depot:depot-ancien-002')).toMatchObject({ etat: 'a_jour', role: 'ancien' });
  });

  it('retirer l\'ancienne version fait disparaître la comparaison', async () => {
    await cours();
    await ancien();
    await passer();
    await approuver();
    await toutTraiter();
    expect(actualisations()).toHaveLength(1);

    await stockage.supprimer('depots', ['depot-ancien-001']);
    // Le chapitre est à comparer à nouveau (par exemple après un renvoi du cours).
    await cours(`${ACTUEL} Précision ajoutée.`, '2026-11-18T07:00:00.000Z');
    await toutTraiter();
    expect(actualisations().some((a) => a.origine === 'ancien')).toBe(false);
  });
});

describe('comparaison avec la version précédente d\'un fichier', () => {
  it('chaque renvoi d\'un cours est comparé à la version qu\'il remplace', async () => {
    await cours(ANCIEN);
    await passer();
    await approuver();
    await toutTraiter();
    expect(actualisations()).toHaveLength(0);
    const [chapitre] = chapitres();

    await cours(ACTUEL, '2026-11-20T09:00:00.000Z');
    await toutTraiter();
    const [actu] = actualisations();
    expect(actu).toMatchObject({ id: `act-${chapitre!.id}-precedente`, origine: 'precedente', chapitreId: chapitre!.id });
    expect(actu!.changements[0]!.apres).toContain('SGLT2');
    expect(chapitres()[0]).toMatchObject({ version: 2, aComparer: false });
    expect(stockage.liste('textes').map((t) => (t as { id: string }).id)).toContain('prec:depot:depot-cours-0001');

    // Un deuxième renvoi est comparé à la version précédente, plus à la première.
    await cours(`${ACTUEL} Nouvelle précision sur les doses.`, '2026-11-25T09:00:00.000Z');
    await toutTraiter();
    const apres = actualisations()[0]!;
    expect(apres.signature).not.toBe(actu!.signature);
    expect(apres.changements[0]!.apres).toContain('Nouvelle précision');
    expect(chapitres()[0]!.version).toBe(3);
  });

  it('garde les deux comparaisons côte à côte quand il y a une ancienne série et un renvoi', async () => {
    await cours(ANCIEN);
    await ancien();
    await passer();
    await approuver();
    await toutTraiter();
    await cours(ACTUEL, '2026-11-20T09:00:00.000Z');
    await toutTraiter();
    expect(actualisations().map((a) => a.origine).sort()).toEqual(['ancien', 'precedente']);
  });
});
