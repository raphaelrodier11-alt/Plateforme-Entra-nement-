/**
 * Schéma de la base D1.
 *
 * Tous les enregistrements sont des documents JSON rangés par collection.
 * `rev` est un compteur global croissant : un appareil demande « tout ce qui
 * a changé depuis la révision N ». `meta` contient la configuration privée
 * du serveur (empreinte de la clé d'accès, jeton Google chiffré).
 */
const INSTRUCTIONS = [
  `CREATE TABLE IF NOT EXISTS docs (
     collection TEXT NOT NULL,
     id TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     rev INTEGER NOT NULL,
     PRIMARY KEY (collection, id)
   )`,
  `CREATE INDEX IF NOT EXISTS docs_rev ON docs (rev)`,
  `CREATE TABLE IF NOT EXISTS depot_morceaux (
     id TEXT NOT NULL,
     v INTEGER NOT NULL,
     n INTEGER NOT NULL,
     data TEXT NOT NULL,
     PRIMARY KEY (id, v, n)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     cle TEXT PRIMARY KEY,
     valeur TEXT NOT NULL
   )`,
];

const prets = new WeakMap<D1Database, Promise<unknown>>();

/** Crée les tables si besoin (une seule fois par base et par instance du Worker). */
export function assurerSchema(db: D1Database): Promise<unknown> {
  let pret = prets.get(db);
  if (!pret) {
    pret = db.batch(INSTRUCTIONS.map((sql) => db.prepare(sql))).catch((erreur) => {
      prets.delete(db);
      throw erreur;
    });
    prets.set(db, pret);
  }
  return pret;
}

export async function lireMeta(db: D1Database, cle: string): Promise<string | undefined> {
  const ligne = await db
    .prepare('SELECT valeur FROM meta WHERE cle = ?1')
    .bind(cle)
    .first<{ valeur: string }>();
  return ligne?.valeur;
}

export async function ecrireMeta(db: D1Database, cle: string, valeur: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO meta (cle, valeur) VALUES (?1, ?2) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur',
    )
    .bind(cle, valeur)
    .run();
}

export async function supprimerMeta(db: D1Database, cle: string): Promise<void> {
  await db.prepare('DELETE FROM meta WHERE cle = ?1').bind(cle).run();
}
