/**
 * Compte à rebours en forme de cœur : il grossit, bat plus vite et plus fort,
 * et le sang circule plus vite à mesure que le partiel approche. On saisit ici
 * les dates d'examen ; les autres partiels sont listés sous le cœur, et on
 * touche l'un d'eux pour que le cœur le suive.
 */
import { FormulaireExamen } from './FormulaireExamen';
import { libelleExamen } from '../../shared/examens';
import { CalendarPlus, HeartPulse, Trash2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { cleJour, jourLisible, joursEntre } from '../../shared/dates';
import { etatCoeur, etatCoeurApaise, etatCoeurArret, libelleUrgence } from '../../shared/coeur';
import { phaseExamen } from '../../shared/examens';
import { useSituationPartiel } from '../etat/partiel';
import { nomMatieresExamen } from '../lib/examens';
import { supprimer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Carte, Puce, cx } from './ui';

const Coeur3D = lazy(() => import('./Coeur3D').then((m) => ({ default: m.Coeur3D })));

export function CoeurPartiel() {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const [choisi, setChoisi] = useState<string | undefined>();
  const [ajout, setAjout] = useState(false);

  const avenir = useMemo(
    () =>
      [...d.examens]
        .map((x) => ({ x, jours: joursEntre(aujourdHui, x.date) }))
        .filter(({ x, jours }) => jours >= 0 && phaseExamen(x, d.maintenant) !== 'fini')
        .sort((a, b) => a.jours - b.jours),
    [d.examens, aujourdHui, d.maintenant],
  );
  const suivi = avenir.find(({ x }) => x.id === choisi) ?? avenir[0];
  const { fini } = useSituationPartiel();
  const arret = !!suivi && phaseExamen(suivi.x, d.maintenant) === 'jour_j';
  const apaise = !suivi && !!fini;
  const etat = useMemo(
    () => (arret ? etatCoeurArret() : apaise ? etatCoeurApaise() : etatCoeur(suivi?.jours)),
    [arret, apaise, suivi?.jours],
  );
  const urgent = etat.urgence > 0.6 && !arret;

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <HeartPulse size={16} className="text-critique" aria-hidden /> Compte à rebours
        </span>
      }
      action={
        <Bouton variante="discret" icone={CalendarPlus} className="min-h-9 px-3" onClick={() => setAjout((v) => !v)} aria-expanded={ajout}>
          Ajouter un partiel
        </Bouton>
      }
    >
      <div
        className="relative isolate -mx-1 overflow-hidden rounded-3xl"
        style={{
          background: arret
            ? 'radial-gradient(circle at 50% 45%, rgba(110,120,160,0.22), transparent 65%)'
            : apaise
              ? 'radial-gradient(circle at 50% 45%, rgba(52,224,161,0.20), transparent 65%)'
              : 'radial-gradient(circle at 50% 45%, rgba(190,40,60,0.20), transparent 65%)',
        }}
      >
        <Suspense fallback={<div className="h-72" />}>
          <Coeur3D etat={etat} className="h-72 w-full sm:h-80" />
        </Suspense>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <p className={cx('chiffres text-5xl leading-none font-semibold tracking-tight sm:text-6xl', urgent && 'text-critique')}>
              {suivi ? (suivi.jours === 0 ? 'J' : `J-${suivi.jours}`) : apaise ? 'Bravo !' : '—'}
            </p>
            {suivi && (
              <p className="mt-1 truncate text-sm font-medium">
                {libelleExamen(suivi.x.titre, nomMatieresExamen(d, suivi.x))}
                <span className="text-texte-2"> · {jourLisible(suivi.x.date)}</span>
              </p>
            )}
          </div>
          <p className="chiffres flex shrink-0 items-center gap-1.5 rounded-full bg-fond/70 px-2.5 py-1 text-xs backdrop-blur">
            <span className={cx('size-2 rounded-full', arret ? 'bg-muet' : 'animate-pulse bg-critique')} aria-hidden /> {arret ? 'arrêt' : `${etat.bpm} bpm`}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-texte-2" role="status">
        {arret ? 'Arrêt cardiaque : c’est le jour J. Respire, tu as tout donné.' : apaise ? 'Partiel terminé : le cœur retrouve son rythme. Bravo, tu l’as fait !' : libelleUrgence(suivi?.jours)}
      </p>

      {avenir.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Partiel suivi par le cœur">
          {avenir.map(({ x, jours }) => (
            <span key={x.id} className="group inline-flex items-center">
              <Puce actif={suivi?.x.id === x.id} onClick={() => setChoisi(x.id)}>
                {libelleExamen(x.titre, nomMatieresExamen(d, x))} · J-{jours}
              </Puce>
              {x.source === 'manuel' && (
                <button
                  type="button"
                  aria-label={`Supprimer le partiel ${x.titre}`}
                  onClick={() => void supprimer('examens', x.id)}
                  className="ml-0.5 grid size-8 place-items-center rounded-full text-muet hover:text-critique"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {ajout && (
        <div className="apparait mt-4 rounded-2xl bg-surface-2 p-3.5">
          <FormulaireExamen onFini={(examen) => { setChoisi(examen.id); setAjout(false); }} />
        </div>
      )}
    </Carte>
  );
}
