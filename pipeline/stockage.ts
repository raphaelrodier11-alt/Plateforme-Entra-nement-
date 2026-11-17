/**
 * Accès du pipeline aux données de l'app, par l'API du Worker.
 *
 * `Memoire` garde en mémoire les collections déjà lues et répercute chaque
 * écriture sur le serveur : les étapes travaillent sur un état cohérent sans
 * relire la base à chaque fois.
 */
import type { Collection, DocSync } from '../shared/collections';
import type { PageTexte, TexteFichier } from '../shared/types';

export interface Stockage {
  lire<T extends { id: string }>(collection: Collection): Promise<T[]>;
  ecrire(collection: Collection, docs: { id: string }[]): Promise<void>;
  supprimer(collection: Collection, ids: string[]): Promise<void>;
  /** Jeton d'accès Google Drive de courte durée, si le drive est connecté. */
  jetonDrive(): Promise<string | undefined>;
  /** Un morceau (texte base64) d'un fichier envoyé depuis l'application. */
  morceauDepot(id: string, n: number): Promise<string | undefined>;
}

const LOT = 50;
/** Taille maximale d'un document de texte (la base limite la taille d'une ligne). */
const TAILLE_MAX_TEXTE = 700_000;

export function stockageApi(appUrl: string, cle: string): Stockage {
  const base = appUrl.replace(/\/+$/, '');
  const entetes = { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };

  const appeler = async (chemin: string, init?: RequestInit): Promise<Response> => {
    for (let essai = 0; ; essai++) {
      const reponse = await fetch(`${base}${chemin}`, { ...init, headers: entetes });
      if (reponse.ok || reponse.status === 404) return reponse;
      if (essai >= 3 || (reponse.status < 500 && reponse.status !== 429)) {
        throw Object.assign(new Error(`API ${chemin} : ${reponse.status}`), { status: reponse.status });
      }
      await new Promise((r) => setTimeout(r, 1500 * 2 ** essai));
    }
  };

  const pousser = async (docs: DocSync[]): Promise<void> => {
    for (let i = 0; i < docs.length; i += LOT) {
      await appeler('/api/admin/docs', {
        method: 'POST',
        body: JSON.stringify({ docs: docs.slice(i, i + LOT) }),
      });
    }
  };

  return {
    async lire<T extends { id: string }>(collection: Collection): Promise<T[]> {
      const docs: T[] = [];
      let depuis = 0;
      for (;;) {
        const reponse = await appeler(`/api/admin/docs?collection=${collection}&depuis=${depuis}`);
        const page = (await reponse.json()) as { docs: DocSync[]; rev: number; encore: boolean };
        for (const d of page.docs) if (!d.supprime) docs.push(d.data as T);
        depuis = page.rev;
        if (!page.encore) return docs;
      }
    },
    ecrire: (collection, docs) =>
      pousser(docs.map((data) => ({ collection, id: data.id, data, majLe: Date.now() }))),
    supprimer: (collection, ids) =>
      pousser(ids.map((id) => ({ collection, id, majLe: Date.now(), supprime: true }))),
    async morceauDepot(id, n) {
      const reponse = await appeler(`/api/admin/depot/${id}/${n}`);
      return reponse.ok ? await reponse.text() : undefined;
    },
    async jetonDrive() {
      const reponse = await appeler('/api/admin/drive/jeton', { method: 'POST' });
      if (!reponse.ok) return undefined;
      return ((await reponse.json()) as { access_token: string }).access_token;
    },
  };
}

export class Memoire {
  private readonly collections = new Map<Collection, Map<string, { id: string }>>();

  constructor(readonly stockage: Stockage) {}

  /** Charge (une seule fois) les collections demandées. */
  async charger(...noms: Collection[]): Promise<void> {
    for (const nom of noms) {
      if (this.collections.has(nom)) continue;
      const docs = await this.stockage.lire(nom);
      this.collections.set(nom, new Map(docs.map((d) => [d.id, d])));
    }
  }

  private table(nom: Collection): Map<string, { id: string }> {
    const table = this.collections.get(nom);
    if (!table) throw new Error(`Collection non chargée : ${nom}`);
    return table;
  }

  liste<T extends { id: string }>(nom: Collection): T[] {
    return [...this.table(nom).values()] as T[];
  }

  lire<T extends { id: string }>(nom: Collection, id: string): T | undefined {
    return this.table(nom).get(id) as T | undefined;
  }

  async ecrire<T extends { id: string }>(nom: Collection, ...docs: T[]): Promise<void> {
    if (docs.length === 0) return;
    await this.stockage.ecrire(nom, docs);
    const table = this.table(nom);
    for (const d of docs) table.set(d.id, d);
  }

  async supprimer(nom: Collection, ...ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.stockage.supprimer(nom, ids);
    const table = this.table(nom);
    for (const id of ids) table.delete(id);
  }
}

/** Découpe le texte d'un fichier en documents assez petits pour la base. */
export function decouperTexte(
  fichierId: string,
  version: string,
  pages: PageTexte[],
  pagesAOcr: number[],
): TexteFichier[] {
  const morceaux: PageTexte[][] = [[]];
  let taille = 0;
  for (const page of pages) {
    if (taille + page.texte.length > TAILLE_MAX_TEXTE && morceaux.at(-1)!.length > 0) {
      morceaux.push([]);
      taille = 0;
    }
    // Une page isolée démesurée est tronquée plutôt que de bloquer l'import.
    morceaux.at(-1)!.push({ ...page, texte: page.texte.slice(0, TAILLE_MAX_TEXTE) });
    taille += page.texte.length;
  }
  return morceaux.map((liste, i) => ({
    id: i === 0 ? fichierId : `${fichierId}#${i}`,
    fichierId,
    version,
    pages: liste,
    pagesAOcr: i === 0 ? pagesAOcr : [],
  }));
}

/** Reconstitue le texte complet d'un fichier à partir de ses documents. */
export function assemblerTexte(
  morceaux: TexteFichier[],
  fichierId: string,
): TexteFichier | undefined {
  const siens = morceaux
    .filter((m) => m.fichierId === fichierId)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const premier = siens[0];
  if (!premier) return undefined;
  return { ...premier, id: fichierId, pages: siens.flatMap((m) => m.pages) };
}
