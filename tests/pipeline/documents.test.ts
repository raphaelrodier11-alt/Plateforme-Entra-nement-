import { describe, expect, it } from 'vitest';
import type { DemandeDocument, DocumentBiblio } from '../../shared/types';
import { lireReponse, sansTableaux, traiterDemandes, demandesATraiter } from '../../pipeline/documents';
import type { DemandeIa, Ia } from '../../pipeline/ia';
import { Memoire } from '../../pipeline/stockage';
import { Compteur, tarifPour } from '../../pipeline/tarifs';
import { executer } from '../../pipeline/orchestrateur';
import { StockageMemoire, lireTest } from './aide';

const T0 = new Date('2026-11-17T10:00:00Z').getTime();

const demande = (id: string, plus: Partial<DemandeDocument> = {}): DemandeDocument => ({
  id,
  type: 'qcm',
  sujet: 'le rein',
  statut: 'en_attente',
  creeLe: T0,
  majLe: T0,
  ...plus,
});

function ia(reponse: (d: DemandeIa) => unknown): Ia & { appels: DemandeIa[] } {
  const appels: DemandeIa[] = [];
  return {
    appels,
    modeles: { masse: 'm', expert: 'e' },
    tarifs: { masse: tarifPour('m', 'masse'), expert: tarifPour('e', 'expert') },
    compteur: new Compteur(),
    async json(d) {
      appels.push(d);
      return reponse(d);
    },
  };
}

async function monter(...demandes: DemandeDocument[]) {
  const stockage = new StockageMemoire();
  await stockage.ecrire('demandes', demandes);
  const memoire = new Memoire(stockage);
  await memoire.charger('demandes', 'documents', 'matieres');
  return { stockage, memoire };
}

const CONTENU = '# Titre\n\n- Point un\n- Point deux\n\nUn paragraphe suffisamment long pour être accepté.';

describe('documents demandés', () => {
  it('rédige la demande, range le document et clôt la demande', async () => {
    const { memoire } = await monter(demande('d1', { contexte: 'Cours sur le rein', consignes: '30 QCM' }));
    const faux = ia(() => ({ titre: '30 QCM sur le rein', contenu: CONTENU }));
    expect(await traiterDemandes(memoire, faux, T0)).toBe(1);
    expect(faux.appels[0]!.consigne).toContain('<cours>\nCours sur le rein');
    const doc = memoire.lire<DocumentBiblio>('documents', 'doc-d1')!;
    expect(doc.origine).toBe('file');
    expect(doc.titre).toBe('30 QCM sur le rein');
    const fin = memoire.lire<DemandeDocument>('demandes', 'd1')!;
    expect(fin.statut).toBe('terminee');
    expect(fin.documentId).toBe('doc-d1');
  });

  it('remet la demande en file quand la limite gratuite est atteinte', async () => {
    const { memoire } = await monter(demande('d1'));
    const limite = ia(() => {
      throw Object.assign(new Error('quota'), { name: 'QuotaAtteint' });
    });
    await expect(traiterDemandes(memoire, limite, T0)).rejects.toThrow('quota');
    expect(memoire.lire<DemandeDocument>('demandes', 'd1')!.statut).toBe('en_attente');
  });

  it("marque l'échec d'une réponse inutilisable sans bloquer les suivantes", async () => {
    const { memoire } = await monter(demande('d1'), demande('d2', { creeLe: T0 + 1 }));
    let n = 0;
    const faux = ia(() => (n++ === 0 ? { titre: 'x' } : { titre: 'Bon', contenu: CONTENU }));
    expect(await traiterDemandes(memoire, faux, T0)).toBe(1);
    expect(memoire.lire<DemandeDocument>('demandes', 'd1')!.statut).toBe('erreur');
    expect(memoire.lire<DemandeDocument>('demandes', 'd2')!.statut).toBe('terminee');
  });

  it('reprend une demande restée « en cours » depuis longtemps, pas une récente', async () => {
    const { memoire } = await monter(
      demande('vieille', { statut: 'en_cours', majLe: T0 - 3 * 3_600_000 }),
      demande('recente', { statut: 'en_cours', majLe: T0 - 10 * 60_000 }),
      demande('finie', { statut: 'terminee' }),
    );
    expect(demandesATraiter(memoire, T0).map((d) => d.id)).toEqual(['vieille']);
  });

  it('transforme les tableaux en listes et rejette un contenu vide', () => {
    const t = sansTableaux('| Nom | Rôle |\n|---|---|\n| Rein | Filtre |');
    expect(t).not.toContain('|');
    expect(t).toContain('- Rein — Filtre');
    expect(lireReponse({ titre: 'a', contenu: 'court' })).toBeUndefined();
    expect(lireReponse(null)).toBeUndefined();
  });
});

describe('dans un passage du pipeline', () => {
  it("rédige les documents demandés même sans aucune source de cours", async () => {
    const stockage = new StockageMemoire();
    stockage.jeton = undefined;
    await stockage.ecrire('demandes', [demande('d1')]);
    const faux = ia(() => ({ titre: 'Série', contenu: CONTENU }));
    const issue = await executer({
      stockage,
      creerDrive: () => {
        throw new Error('pas de drive');
      },
      creerIa: async () => faux,
      lire: lireTest,
      mode: 'auto',
      budgetMinutes: 5,
      maintenant: T0,
    });
    expect(issue).toBe('non_configure');
    expect(faux.appels).toHaveLength(1);
    expect(stockage.table('documents').has('doc-d1')).toBe(true);
  });
});
