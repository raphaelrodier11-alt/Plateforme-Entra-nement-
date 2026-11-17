/**
 * Magasin de documents : lecture par révision et écriture « dernier écrit
 * gagne » (l'horodatage de modification départage deux appareils).
 */
import {
  COLLECTIONS_CLIENT,
  NOMS_COLLECTIONS,
  estCollection,
  inscriptibleParApp,
  type Collection,
  type DocSync,
} from '../shared/collections';
import type { Role } from './env';

export const LIMITE_TIRAGE = 400;
/** Taille maximale d'une réponse de synchronisation, en caractères. */
export const BUDGET_REPONSE = 8_000_000;
export const LIMITE_POUSSEE = 200;

interface Ligne {
  collection: string;
  id: string;
  data: string;
  updated_at: number;
  deleted: number;
  rev: number;
}

/**
 * Documents modifiés depuis la révision `depuis`, sérialisés en JSON.
 * Le texte JSON stocké est recopié tel quel pour ménager le temps de calcul.
 */
export async function tirer(
  db: D1Database,
  role: Role,
  depuis: number,
  limite: number,
  collection?: Collection,
): Promise<string> {
  const collections = collection
    ? [collection]
    : role === 'pipeline'
      ? NOMS_COLLECTIONS
      : COLLECTIONS_CLIENT;
  const autorisees = role === 'pipeline' ? collections : collections.filter((c) => COLLECTIONS_CLIENT.includes(c));
  const marqueurs = autorisees.map((_, i) => `?${i + 3}`).join(', ');
  const max = Math.min(Math.max(limite, 1), LIMITE_TIRAGE);

  // Une réponse ne dépasse pas ~8 Mo : les textes de cours sont volumineux et
  // le serveur n'a que 128 Mo de mémoire. Le premier document est toujours
  // renvoyé, même s'il est seul au-dessus du budget.
  const indiceBudget = autorisees.length + 3;
  const { results } = await db
    .prepare(
      `SELECT collection, id, data, updated_at, deleted, rev FROM (
         SELECT collection, id, data, updated_at, deleted, rev,
                SUM(LENGTH(data)) OVER (ORDER BY rev) AS cumul
         FROM docs
         WHERE rev > ?1 AND collection IN (${marqueurs})
         ORDER BY rev LIMIT ?2
       )
       WHERE cumul - LENGTH(data) < ?${indiceBudget}
       ORDER BY rev`,
    )
    .bind(depuis, max + 1, ...autorisees, BUDGET_REPONSE)
    .all<Ligne>();

  let encore = results.length > max;
  const lignes = encore ? results.slice(0, max) : results;
  if (!encore && lignes.length > 0) {
    // Le budget a pu couper la liste : y a-t-il des documents après le dernier renvoyé ?
    const octets = lignes.reduce((somme, l) => somme + l.data.length, 0);
    if (octets >= BUDGET_REPONSE) {
      const suite = await db
        .prepare(`SELECT 1 AS reste FROM docs WHERE rev > ?1 AND collection IN (${marqueurs.replace(/\?(\d+)/g, (_, n) => `?${Number(n) - 1}`)}) LIMIT 1`)
        .bind(lignes[lignes.length - 1]!.rev, ...autorisees)
        .first();
      encore = !!suite;
    }
  }
  const docs = lignes.map((l) =>
    l.deleted
      ? `{"collection":${JSON.stringify(l.collection)},"id":${JSON.stringify(l.id)},"majLe":${l.updated_at},"rev":${l.rev},"supprime":true}`
      : `{"collection":${JSON.stringify(l.collection)},"id":${JSON.stringify(l.id)},"majLe":${l.updated_at},"rev":${l.rev},"data":${l.data}}`,
  );
  const rev = lignes.length ? lignes[lignes.length - 1]!.rev : depuis;
  return `{"docs":[${docs.join(',')}],"rev":${rev},"encore":${encore}}`;
}

const SQL_ECRITURE = `
  INSERT INTO docs (collection, id, data, updated_at, deleted, rev)
  VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(rev), 0) + 1 FROM docs))
  ON CONFLICT(collection, id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at,
    deleted = excluded.deleted,
    rev = excluded.rev
  WHERE excluded.updated_at >= docs.updated_at`;

export function instructionEcriture(db: D1Database, doc: DocSync): D1PreparedStatement {
  return db
    .prepare(SQL_ECRITURE)
    .bind(
      doc.collection,
      doc.id,
      doc.supprime ? 'null' : JSON.stringify(doc.data ?? null),
      doc.majLe,
      doc.supprime ? 1 : 0,
    );
}

export function docValide(doc: unknown): doc is DocSync {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  return (
    typeof d.collection === 'string' &&
    estCollection(d.collection) &&
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    d.id.length <= 300 &&
    typeof d.majLe === 'number' &&
    Number.isFinite(d.majLe)
  );
}

/** Écrit les documents autorisés pour le rôle ; renvoie ceux qui ont été retenus. */
export async function pousser(db: D1Database, role: Role, docs: DocSync[]): Promise<DocSync[]> {
  const retenus = docs.filter(
    (d) => docValide(d) && (role === 'pipeline' || inscriptibleParApp(d.collection)),
  );
  if (retenus.length === 0) return [];
  await db.batch(retenus.map((d) => instructionEcriture(db, d)));
  return retenus;
}

export async function lireDoc<T>(
  db: D1Database,
  collection: Collection,
  id: string,
): Promise<T | undefined> {
  const ligne = await db
    .prepare('SELECT data, deleted FROM docs WHERE collection = ?1 AND id = ?2')
    .bind(collection, id)
    .first<{ data: string; deleted: number }>();
  if (!ligne || ligne.deleted) return undefined;
  return JSON.parse(ligne.data) as T;
}
