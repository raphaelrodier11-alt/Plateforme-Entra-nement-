/** « Expliquer toutes mes erreurs » : le Dr Rodier rédige, une à une, l'explication détaillée de chaque question. */
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ExplicationDetaillee, Question } from '../../shared/types';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { expliquerToutes } from '../lib/assistant';
import { Bouton, Jauge } from './ui';

export function ExpliquerToutes({ questions }: { questions: Question[] }) {
  const d = useDonnees();
  const gardees = useLiveQuery(() => base.collection<ExplicationDetaillee>('explications').toCollection().primaryKeys(), []);
  const [etat, setEtat] = useState<{ faites: number; total: number } | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const stop = useRef(false);

  const restantes = questions.filter((q) => !(gardees ?? []).includes(q.id));
  if (restantes.length === 0 && !etat) return null;

  const lancer = async () => {
    stop.current = false;
    setMessage(undefined);
    const cible = restantes;
    setEtat({ faites: 0, total: cible.length });
    const r = await expliquerToutes(d, cible, (faites, total) => setEtat({ faites, total }), () => stop.current);
    setEtat(undefined);
    setMessage(
      r.erreur
        ? `${r.faites} explication${r.faites > 1 ? 's' : ''} rédigée${r.faites > 1 ? 's' : ''}. ${r.erreur} Reprends plus tard : ce qui est fait est gardé.`
        : `${r.faites} explication${r.faites > 1 ? 's' : ''} rédigée${r.faites > 1 ? 's' : ''} et gardée${r.faites > 1 ? 's' : ''}.`,
    );
  };

  return (
    <div className="mb-3 rounded-2xl bg-surface-2 p-3">
      {etat ? (
        <div role="status">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Le Dr Rodier rédige… {etat.faites} / {etat.total}</span>
            <Bouton variante="discret" icone={Square} className="min-h-8 px-2 text-xs" onClick={() => (stop.current = true)}>
              Arrêter
            </Bouton>
          </div>
          <Jauge valeur={etat.total ? etat.faites / etat.total : 0} libelle="Explications rédigées" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {restantes.length > 0 && (
            <Bouton variante="primaire" icone={BookOpenCheck} onClick={() => void lancer()}>
              Expliquer toutes mes erreurs ({restantes.length})
            </Bouton>
          )}
          <p className="min-w-0 flex-1 text-xs text-texte-2">
            {message ?? "Une explication détaillée et justifiée par question, gardée pour la relire. Elle consomme un peu du quota gratuit du bot."}
          </p>
        </div>
      )}
    </div>
  );
}
