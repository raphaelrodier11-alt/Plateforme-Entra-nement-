/**
 * Copie locale des données (IndexedDB, via Dexie).
 *
 * Chaque collection synchronisée a sa table. Deux tables techniques
 * s'ajoutent : `file` (modifications locales à envoyer au serveur) et
 * `meta` (curseur de synchronisation).
 */
import Dexie, { type Table } from 'dexie';
import { COLLECTIONS_CLIENT, type Collection } from '../../shared/collections';

export interface EnAttente {
  /** `collection/id` : une seule entrée par document, la dernière gagne. */
  cle: string;
  collection: Collection;
  id: string;
  majLe: number;
  supprime?: boolean;
}

export interface Meta {
  cle: string;
  valeur: unknown;
}

/** Index secondaires utiles aux requêtes de l'app. */
const INDEX: Partial<Record<Collection, string>> = {
  chapitres: 'id, matiereId',
  questions: 'id, chapitreId, matiereId',
  tentatives: 'id, questionId, date, sessionId',
  flashcards: 'id, chapitreId',
  actualisations: 'id, chapitreId',
};

export class BaseLocale extends Dexie {
  file!: Table<EnAttente, string>;
  meta!: Table<Meta, string>;

  constructor(nom = 'dr-rodier') {
    super(nom);
    const schema = (exclues: Collection[]): Record<string, string> => {
      const tables: Record<string, string> = { file: 'cle', meta: 'cle' };
      for (const collection of COLLECTIONS_CLIENT) {
        if (!exclues.includes(collection)) tables[collection] = INDEX[collection] ?? 'id';
      }
      return tables;
    };
    // Chaque ajout de table demande une nouvelle version : les appareils déjà
    // installés migrent sans perdre leurs données.
    this.version(1).stores(schema(['depots', 'actualisations']));
    this.version(2).stores(schema(['actualisations']));
    this.version(3).stores(schema([]));
  }

  collection<T extends { id: string }>(nom: Collection): Table<T, string> {
    return this.table<T, string>(nom);
  }
}

export const base = new BaseLocale();

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await base.meta.get(cle))?.valeur as T | undefined;
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await base.meta.put({ cle, valeur });
}
