/** Question du jour : la même toute la journée, choisie parmi tes erreurs à revoir en priorité. */
import type { Question } from './types';

function hash(texte: string): number {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function questionDuJour(questions: Question[], erreursDues: Question[], jour: string): Question | undefined {
  const pool = (erreursDues.length > 0 ? erreursDues : questions).filter((q) => !q.reserveExamen && !q.perso);
  if (pool.length === 0) return undefined;
  // Tri stable par identifiant : le choix ne dépend pas de l'ordre de lecture de la base.
  const tries = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return tries[hash(jour) % tries.length];
}
