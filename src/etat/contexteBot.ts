/**
 * Ce que l'étudiant a sous les yeux, partagé avec le bot flottant : une correction
 * publie sa question et sa réponse, une page de chapitre publie son titre, etc.
 */
import { useEffect, useSyncExternalStore } from 'react';

export interface ContexteBot {
  /** Identifiant stable : un nouveau contexte relance l'attache du bot. */
  id: string;
  /** Libellé court affiché dans le bot (« Question — Insuffisance cardiaque »). */
  titre: string;
  /** Texte transmis à l'IA avec chaque question. */
  texte: string;
  matiereId?: string;
}

let courant: ContexteBot | undefined;
const abonnes = new Set<() => void>();

export function definirContexteBot(c: ContexteBot | undefined): void {
  if (courant?.id === c?.id && courant?.texte === c?.texte) return;
  courant = c;
  for (const a of abonnes) a();
}

export function useContexteBot(): ContexteBot | undefined {
  return useSyncExternalStore(
    (rappel) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    () => courant,
  );
}

/** À appeler depuis une page : publie le contexte tant qu'elle est affichée. */
export function usePublierContexteBot(c: ContexteBot | undefined): void {
  const cle = c ? `${c.id}|${c.texte}` : '';
  useEffect(() => {
    definirContexteBot(c);
    return () => definirContexteBot(undefined);
    // La clé résume le contenu : le contexte est republié seulement quand il change.
  }, [cle]);
}
