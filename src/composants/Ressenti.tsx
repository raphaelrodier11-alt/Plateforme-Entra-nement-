/** Ton ressenti sur un chapitre : difficulté du cours et confiance, sur 5 niveaux, plus la date d'étude. */
import { Gauge, Smile } from 'lucide-react';
import { LIBELLE_CONFIANCE, LIBELLE_DIFFICULTE } from '../../shared/evaluations';
import type { Chapitre, Evaluation } from '../../shared/types';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { cleJour } from '../../shared/dates';
import { Carte, cx } from './ui';

export function Echelle({ libelle, valeur, onChange, etiquettes, compact = false }: { libelle: string; valeur: number | undefined; onChange: (n: number) => void; etiquettes: readonly string[]; compact?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-texte-2">{libelle}</span>
        <span className="text-xs text-muet">{valeur ? etiquettes[valeur] : 'Non renseigné'}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={libelle}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valeur === n}
            aria-label={`${libelle} : ${etiquettes[n]}`}
            onClick={() => onChange(n)}
            className={cx(
              'rounded-xl border text-sm font-medium transition-colors',
              compact ? 'min-h-9' : 'min-h-11',
              valeur === n ? 'border-accent bg-accent-fond text-texte' : 'border-bord bg-surface-2 text-texte-2 hover:text-texte',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Enregistre un changement : la valeur saisie est un point de départ, tes résultats réels la corrigent ensuite. */
export function useEvaluation(chapitreId: string): [Evaluation | undefined, (changement: Partial<Evaluation>) => Promise<void>] {
  const d = useDonnees();
  const ev = d.evaluationParChapitre.get(chapitreId);
  const modifier = (changement: Partial<Evaluation>) =>
    enregistrer<Evaluation>('evaluations', { ...(ev ?? { id: chapitreId }), ...changement, id: chapitreId, majLe: Date.now() });
  return [ev, modifier];
}

export function RessentiChapitre({ chapitre, titre = true }: { chapitre: Chapitre; titre?: boolean }) {
  const d = useDonnees();
  const [ev, modifier] = useEvaluation(chapitre.id);
  const maitrise = d.maitriseParChapitre.get(chapitre.id) ?? 0;
  const contenu = (
    <div className="space-y-4">
      <Echelle libelle="Difficulté du cours" valeur={ev?.difficulte} onChange={(n) => void modifier({ difficulte: n })} etiquettes={LIBELLE_DIFFICULTE} />
      <Echelle libelle="Ma confiance pour le partiel" valeur={ev?.confiance} onChange={(n) => void modifier({ confiance: n })} etiquettes={LIBELLE_CONFIANCE} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muet">Dernière étude</span>
          <input type="date" value={ev?.etudieLe ?? ''} max={cleJour(d.maintenant)} onChange={(e) => void modifier({ etudieLe: e.target.value || undefined })} className="min-h-10 rounded-xl border border-bord bg-surface-2 px-2 text-sm" />
        </label>
        <button type="button" onClick={() => void modifier({ etudieLe: cleJour(d.maintenant) })} className="text-xs text-accent-clair underline">Aujourd'hui</button>
      </div>
      <p className="text-xs text-muet">
        Maîtrise estimée : {Math.round(maitrise * 100)} %. Ce que tu indiques sert de point de départ : plus tu t'entraînes, plus ce sont tes résultats réels qui comptent.
      </p>
    </div>
  );
  if (!titre) return contenu;
  return (
    <Carte className="mt-4" titre={<span className="flex items-center gap-2"><Smile size={16} aria-hidden /> Mon ressenti sur ce chapitre</span>}>
      {contenu}
    </Carte>
  );
}

export { Gauge };
