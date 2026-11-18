/**
 * Fournit à toute l'application les données locales et leurs dérivés.
 * La lecture est « vivante » : tout changement dans IndexedDB (réponse à une
 * question, synchronisation) relance le calcul et met les écrans à jour.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { base } from '../db/base';
import { calculer, type Brut, type Donnees } from './calcul';

const Contexte = createContext<Donnees | undefined>(undefined);

const TABLES: (keyof Brut)[] = [
  'matieres', 'chapitres', 'questions', 'cas', 'fiches', 'flashcards', 'partiels',
  'fichiers', 'depots', 'actualisations', 'anomalies', 'illisibles', 'notifications', 'estimations', 'etat',
  'tentatives', 'sessions', 'disponibilites', 'examens', 'evenements', 'reglages',
  'decisions', 'taches', 'revues', 'questionsPerso', 'entrainements', 'evaluations',
];

async function toutLire(): Promise<Brut> {
  const listes = await Promise.all(TABLES.map((t) => base.table(t).toArray()));
  return Object.fromEntries(TABLES.map((t, i) => [t, listes[i]])) as unknown as Brut;
}

/** Heure courante, rafraîchie chaque minute (échéances, planning). */
function useHorloge(periodeMs: number): number {
  const [instant, setInstant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setInstant(Date.now()), periodeMs);
    return () => clearInterval(id);
  }, [periodeMs]);
  return instant;
}

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const brut = useLiveQuery(toutLire, []);
  const maintenant = useHorloge(60_000);
  const donnees = useMemo(() => (brut ? calculer(brut, maintenant) : undefined), [brut, maintenant]);

  if (!donnees) {
    return (
      <div className="grid min-h-dvh place-items-center text-muet" role="status">
        Chargement…
      </div>
    );
  }
  return <Contexte.Provider value={donnees}>{children}</Contexte.Provider>;
}

export function useDonnees(): Donnees {
  const donnees = useContext(Contexte);
  if (!donnees) throw new Error('useDonnees doit être utilisé sous FournisseurDonnees');
  return donnees;
}
