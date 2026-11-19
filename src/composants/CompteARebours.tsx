/** Compte à rebours avant chaque partiel, avec le plan du jour pour cette matière. */
import { libelleExamen } from '../../shared/examens';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cleJour, jourLisible, joursEntre } from '../../shared/dates';
import { useDonnees } from '../etat/donnees';
import { LIBELLE_TACHE } from '../lib/actions';
import { couleurMatiere } from '../lib/couleurs';
import { Carte, Jauge, pourcent } from './ui';

const HORIZON_JOURS = 60;

export function CompteARebours() {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const examens = [...d.examens]
    .map((x) => ({ x, jours: joursEntre(aujourdHui, x.date) }))
    .filter(({ jours }) => jours >= 0 && jours <= HORIZON_JOURS)
    .sort((a, b) => a.jours - b.jours)
    .slice(0, 3);
  if (examens.length === 0) return null;
  const seancesDuJour = d.planning.seances.filter((s) => s.date === aujourdHui);

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <CalendarClock size={16} className="text-accent-clair" aria-hidden /> Compte à rebours
        </span>
      }
      action={
        <Link to="/planning" className="text-xs text-accent-clair hover:underline">
          Planning
        </Link>
      }
    >
      <ul className="space-y-3">
        {examens.map(({ x, jours }) => {
          const matiere = d.matiereParId.get(x.matiereId ?? '');
          const c = couleurMatiere(x.matiereId ?? 'general');
          const avancement = d.statsMatiere.get(x.matiereId ?? '')?.avancement ?? 0;
          const urgent = jours <= 7;
          const taches = seancesDuJour
            .flatMap((s) => s.taches.map((t) => ({ t, s })))
            .filter(({ t }) => !t.matiereId || t.matiereId === x.matiereId);
          return (
            <li key={x.id} className="rounded-2xl bg-surface-2 p-3.5" style={{ borderLeft: `3px solid ${c.accent}` }}>
              <div className="flex items-center gap-4">
                <div
                  className={`grid size-16 shrink-0 place-items-center rounded-2xl text-center leading-none ${urgent ? 'pouls bg-critique/15' : 'bg-surface-3'}`}
                  aria-label={jours === 0 ? "Partiel aujourd'hui" : `Partiel dans ${jours} jours`}
                >
                  <span>
                    <span className="chiffres block text-2xl font-semibold">{jours === 0 ? 'J' : `J-${jours}`}</span>
                    <span className="mt-0.5 block text-[10px] text-muet">{jours === 0 ? 'jour J' : 'jours'}</span>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{libelleExamen(x.titre, matiere?.nom)}</p>
                  <p className="text-xs text-muet">{jourLisible(x.date)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1">
                      <Jauge valeur={avancement} libelle={`Préparation ${matiere?.nom ?? ''}`} />
                    </div>
                    <span className="chiffres text-xs text-texte-2">{pourcent(avancement)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-bord pt-2.5">
                <p className="mb-1 text-xs font-medium text-texte-2">Plan du jour</p>
                {taches.length === 0 ? (
                  <p className="text-xs text-muet">
                    Rien de prévu aujourd'hui pour cette matière.{' '}
                    <Link to={`/examens?matiere=${x.matiereId}`} className="text-accent-clair hover:underline">
                      Lancer un examen blanc
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {taches.slice(0, 3).map(({ t, s }, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <ChevronRight size={13} className="shrink-0 text-muet" aria-hidden />
                        <span className="chiffres text-muet">{String(Math.floor(s.debutMin / 60)).padStart(2, '0')} h</span>
                        <span className="min-w-0 flex-1 truncate">{LIBELLE_TACHE[t.type]}</span>
                        <span className="chiffres text-muet">{t.dureeMin} min</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Carte>
  );
}
