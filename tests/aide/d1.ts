/**
 * Faux D1 pour les tests : la même interface que Cloudflare D1, adossée à
 * SQLite en mémoire (module `node:sqlite`).
 */
import { DatabaseSync } from 'node:sqlite';

type Valeur = string | number | null;

class Instruction {
  private valeurs: Valeur[] = [];

  constructor(
    private readonly base: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...valeurs: Valeur[]): Instruction {
    const copie = new Instruction(this.base, this.sql);
    copie.valeurs = valeurs;
    return copie;
  }

  async first<T>(): Promise<T | null> {
    return (this.base.prepare(this.sql).get(...this.valeurs) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.base.prepare(this.sql).all(...this.valeurs) as T[] };
  }

  async run(): Promise<{ success: true }> {
    this.base.prepare(this.sql).run(...this.valeurs);
    return { success: true };
  }
}

export function creerD1(): D1Database {
  const base = new DatabaseSync(':memory:');
  const d1 = {
    prepare: (sql: string) => new Instruction(base, sql),
    batch: async (instructions: Instruction[]) => {
      base.exec('BEGIN');
      try {
        for (const instruction of instructions) await instruction.run();
        base.exec('COMMIT');
      } catch (erreur) {
        base.exec('ROLLBACK');
        throw erreur;
      }
      return [];
    },
  };
  return d1 as unknown as D1Database;
}
