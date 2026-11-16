/**
 * Synchronisation entre la copie locale et le serveur.
 *
 * Tout fonctionne d'abord en local : une écriture va dans IndexedDB et dans
 * la file d'attente, puis part vers le serveur dès que la connexion le
 * permet. Dans l'autre sens, l'appareil demande les documents modifiés
 * depuis sa dernière révision connue.
 */
import {
  COLLECTIONS,
  inscriptibleParApp,
  type Collection,
  type DocSync,
} from '../../shared/collections';
import { ErreurApi, api, lireCle } from '../lib/api';
import { base, ecrireMeta, lireMeta } from './base';

const LOT_ENVOI = 100;
const META_REVISION = 'revision';

export type StatutSync = 'local' | 'hors_ligne' | 'en_cours' | 'a_jour' | 'erreur' | 'refuse';

export interface EtatSync {
  statut: StatutSync;
  enAttente: number;
  dernierSucces?: number;
}

let etat: EtatSync = { statut: 'local', enAttente: 0 };
const abonnes = new Set<() => void>();

function publier(partiel: Partial<EtatSync>): void {
  etat = { ...etat, ...partiel };
  for (const abonne of abonnes) abonne();
}

export function lireEtatSync(): EtatSync {
  return etat;
}

export function abonnerEtatSync(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

/** Vrai quand un serveur est disponible pour cette installation. */
let serveurActif = false;

export function activerServeur(actif: boolean): void {
  serveurActif = actif;
  publier({ statut: actif ? 'a_jour' : 'local' });
}

async function envoyer(): Promise<void> {
  for (;;) {
    const lot = await base.file.orderBy('cle').limit(LOT_ENVOI).toArray();
    if (lot.length === 0) return;

    const docs: DocSync[] = [];
    for (const entree of lot) {
      const data = entree.supprime
        ? undefined
        : await base.collection(entree.collection).get(entree.id);
      docs.push({
        collection: entree.collection,
        id: entree.id,
        majLe: entree.majLe,
        ...(data === undefined ? { supprime: true } : { data }),
      });
    }
    await api('/sync/pousser', { method: 'POST', body: JSON.stringify({ docs }) });

    // On ne retire de la file que ce qui n'a pas été modifié entre-temps.
    await base.transaction('rw', base.file, async () => {
      for (const entree of lot) {
        const actuelle = await base.file.get(entree.cle);
        if (actuelle && actuelle.majLe === entree.majLe) await base.file.delete(entree.cle);
      }
    });
  }
}

async function recevoir(): Promise<void> {
  let revision = (await lireMeta<number>(META_REVISION)) ?? 0;
  for (;;) {
    const reponse = await api(`/sync/tirer?depuis=${revision}`);
    const { docs, rev, encore } = (await reponse.json()) as {
      docs: DocSync[];
      rev: number;
      encore: boolean;
    };

    const tables = [...new Set(docs.map((d) => d.collection))].map((c) => base.collection(c));
    await base.transaction('rw', [...tables, base.file, base.meta], async () => {
      for (const doc of docs) {
        // Une modification locale pas encore envoyée garde la priorité.
        const local = await base.file.get(`${doc.collection}/${doc.id}`);
        if (local && local.majLe >= doc.majLe) continue;
        const table = base.collection(doc.collection);
        if (doc.supprime) await table.delete(doc.id);
        else await table.put(doc.data as { id: string });
      }
      await base.meta.put({ cle: META_REVISION, valeur: rev });
    });

    revision = rev;
    if (!encore) return;
  }
}

let enCours: Promise<void> | undefined;
let relance = false;

/** Envoie les modifications locales puis récupère celles du serveur. */
export function synchroniser(): Promise<void> {
  if (!serveurActif || !lireCle()) return Promise.resolve();
  if (enCours) {
    relance = true;
    return enCours;
  }
  enCours = (async () => {
    publier({ statut: 'en_cours' });
    try {
      await envoyer();
      await recevoir();
      publier({ statut: 'a_jour', dernierSucces: Date.now(), enAttente: await base.file.count() });
    } catch (erreur) {
      const refuse = erreur instanceof ErreurApi && erreur.statut === 401;
      const horsLigne = !(erreur instanceof ErreurApi);
      publier({
        statut: refuse ? 'refuse' : horsLigne ? 'hors_ligne' : 'erreur',
        enAttente: await base.file.count(),
      });
    } finally {
      enCours = undefined;
      if (relance) {
        relance = false;
        void synchroniser();
      }
    }
  })();
  return enCours;
}

let minuterie: ReturnType<typeof setTimeout> | undefined;

/** Regroupe les écritures rapprochées en une seule synchronisation. */
export function planifierSynchro(delaiMs = 1500): void {
  if (!serveurActif) return;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => void synchroniser(), delaiMs);
}

/** Synchronise au retour du réseau, au retour sur l'app et toutes les minutes. */
export function demarrerSynchro(): () => void {
  const lancer = () => void synchroniser();
  const auRetour = () => {
    if (document.visibilityState === 'visible') lancer();
  };
  window.addEventListener('online', lancer);
  document.addEventListener('visibilitychange', auRetour);
  const intervalle = setInterval(auRetour, 60_000);
  lancer();
  return () => {
    window.removeEventListener('online', lancer);
    document.removeEventListener('visibilitychange', auRetour);
    clearInterval(intervalle);
  };
}

/** Enregistre un document de l'utilisateur et le met en file d'envoi. */
export async function enregistrer<T extends { id: string }>(
  collection: Collection,
  doc: T,
): Promise<void> {
  await enregistrerPlusieurs(collection, [doc]);
}

export async function enregistrerPlusieurs<T extends { id: string }>(
  collection: Collection,
  docs: T[],
): Promise<void> {
  if (docs.length === 0) return;
  const majLe = Date.now();
  const table = base.collection<T>(collection);
  await base.transaction('rw', table, base.file, async () => {
    await table.bulkPut(docs);
    if (inscriptibleParApp(collection)) {
      await base.file.bulkPut(
        docs.map((d) => ({ cle: `${collection}/${d.id}`, collection, id: d.id, majLe })),
      );
    }
  });
  publier({ enAttente: await base.file.count() });
  planifierSynchro();
}

export async function supprimer(collection: Collection, id: string): Promise<void> {
  const table = base.collection(collection);
  await base.transaction('rw', table, base.file, async () => {
    await table.delete(id);
    if (inscriptibleParApp(collection)) {
      await base.file.put({
        cle: `${collection}/${id}`,
        collection,
        id,
        majLe: Date.now(),
        supprime: true,
      });
    }
  });
  planifierSynchro();
}

/**
 * Écrit dans la copie locale sans rien envoyer : effet immédiat d'une
 * décision (le serveur fera foi) ou données de démonstration.
 */
export async function ecrireLocal<T extends { id: string }>(
  collection: Collection,
  docs: T[],
): Promise<void> {
  await base.collection<T>(collection).bulkPut(docs);
}

/** Efface toute la copie locale (changement de clé, réinitialisation). */
export async function viderCopieLocale(): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    for (const table of base.tables) await table.clear();
  });
  await ecrireMeta(META_REVISION, 0);
}

export const COLLECTIONS_CONNUES = Object.keys(COLLECTIONS) as Collection[];
