/**
 * Compte à rebours en forme de cœur : il grossit, bat plus vite et plus fort,
 * et le sang circule plus vite à mesure que le partiel approche. On saisit ici
 * les dates d'examen ; les autres partiels sont listés sous le cœur, et on
 * touche l'un d'eux pour que le cœur le suive.
 */
import { libelleExamen } from '../../shared/examens';
import { CalendarPlus, HeartPulse, Trash2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { cleJour, jourLisible, joursEntre } from '../../shared/dates';
import { etatCoeur, libelleUrgence } from '../../shared/coeur';
import type { Examen } from '../../shared/types';
import { enregistrer, supprimer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Carte, Puce, STYLE_CHAMP, cx } from './ui';

const Coeur3D = lazy(() => import('./Coeur3D').then((m) => ({ default: m.Coeur3D })));

export function CoeurPartiel() {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const [choisi, setChoisi] = useState<string | undefined>();
  const [ajout, setAjout] = useState(false);
  const [matiereId, setMatiereId] = useState('');
  const [date, setDate] = useState('');
  const [titre, setTitre] = useState('');

  const avenir = useMemo(
    () =>
      [...d.examens]
        .map((x) => ({ x, jours: joursEntre(aujourdHui, x.date) }))
        .filter(({ jours }) => jours >= 0)
        .sort((a, b) => a.jours - b.jours),
    [d.examens, aujourdHui],
  );
  const suivi = avenir.find(({ x }) => x.id === choisi) ?? avenir[0];
  const etat = useMemo(() => etatCoeur(suivi?.jours), [suivi?.jours]);
  const matiere = suivi ? d.matiereParId.get(suivi.x.matiereId) : undefined;
  const urgent = etat.urgence > 0.6;

  const ajouter = async () => {
    const m = d.matiereParId.get(matiereId);
    const examen: Examen = {
      id: `exam-${crypto.randomUUID()}`,
      matiereId,
      titre: titre.trim() || 'Partiel',
      date,
      source: 'manuel',
    };
    await enregistrer('examens', examen);
    setChoisi(examen.id);
    setAjout(false);
    setDate('');
    setTitre('');
  };

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
        style={{ background: 'radial-gradient(circle at 50% 45%, rgba(190,40,60,0.20), transparent 65%)' }}
      >
        <Suspense fallback={<div className="h-72" />}>
          <Coeur3D etat={etat} className="h-72 w-full sm:h-80" />
        </Suspense>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <p className={cx('chiffres text-5xl leading-none font-semibold tracking-tight sm:text-6xl', urgent && 'text-critique')}>
              {suivi ? (suivi.jours === 0 ? 'J' : `J-${suivi.jours}`) : '—'}
            </p>
            {suivi && (
              <p className="mt-1 truncate text-sm font-medium">
                {libelleExamen(suivi.x.titre, matiere?.nom)}
                <span className="text-texte-2"> · {jourLisible(suivi.x.date)}</span>
              </p>
            )}
          </div>
          <p className="chiffres flex shrink-0 items-center gap-1.5 rounded-full bg-fond/70 px-2.5 py-1 text-xs backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-critique" aria-hidden /> {etat.bpm} bpm
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-texte-2" role="status">{libelleUrgence(suivi?.jours)}</p>

      {avenir.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Partiel suivi par le cœur">
          {avenir.map(({ x, jours }) => (
            <span key={x.id} className="group inline-flex items-center">
              <Puce actif={suivi?.x.id === x.id} onClick={() => setChoisi(x.id)}>
                {libelleExamen(x.titre, d.matiereParId.get(x.matiereId)?.nom)} · J-{jours}
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
        <div className="apparait mt-4 space-y-3 rounded-2xl bg-surface-2 p-3.5">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muet">Matière</span>
            <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} className={STYLE_CHAMP}>
              <option value="">Choisis une matière</option>
              {d.matieres.map((m) => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muet">Jour de l'examen</span>
            <input type="date" value={date} min={aujourdHui} onChange={(e) => setDate(e.target.value)} className={STYLE_CHAMP} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muet">Nom du partiel</span>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={60} placeholder="Partiel final, CC, rattrapage…" className={STYLE_CHAMP} />
          </label>
          <Bouton variante="primaire" icone={CalendarPlus} disabled={!date || !matiereId} onClick={() => void ajouter()}>
            Enregistrer ce partiel
          </Bouton>
        </div>
      )}
    </Carte>
  );
}
