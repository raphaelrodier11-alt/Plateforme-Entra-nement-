/**
 * Affichage d'une question et saisie de la réponse, pour les quatre types :
 * choix simple, choix multiples, vrai/faux et texte à trous. Une fois la
 * correction fournie, la saisie est verrouillée et chaque élément indique
 * s'il était juste (icône + libellé, jamais la couleur seule).
 */
import { Check, CircleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Correction } from '../../shared/bareme';
import type { CasClinique, Proposition, Question, ReponseDonnee } from '../../shared/types';
import { cx } from './ui';

interface Props {
  question: Question;
  cas?: CasClinique;
  reponse: ReponseDonnee;
  onChange?: (reponse: ReponseDonnee) => void;
  correction?: Correction;
  /** Mode lecture : affiche la solution sans réponse de l'utilisateur. */
  solution?: boolean;
}

const CONSIGNE: Record<Question['type'], string> = {
  simple: 'Une seule réponse',
  multiple: 'Une ou plusieurs réponses',
  vrai_faux: 'Vrai ou faux pour chaque affirmation',
  trous: 'Complète le texte',
};

function Verdict({ ton, children }: { ton: 'bon' | 'faux' | 'oubli'; children: ReactNode }) {
  const Icone = ton === 'bon' ? Check : ton === 'faux' ? X : CircleAlert;
  const couleur = ton === 'bon' ? 'text-bon' : ton === 'faux' ? 'text-critique' : 'text-alerte';
  return (
    <span className="mt-1 flex items-center gap-1 text-xs text-texte-2">
      <Icone size={14} className={couleur} aria-hidden />
      {children}
    </span>
  );
}

function Choix({ question, reponse, onChange, correction, solution }: Props) {
  const cochees = new Set(reponse.cochees ?? []);
  const simple = question.type === 'simple';
  const fige = !!correction || !!solution;

  const basculer = (id: string) => {
    if (fige || !onChange) return;
    if (simple) {
      onChange({ cochees: [id] });
      return;
    }
    const suivantes = new Set(cochees);
    if (suivantes.has(id)) suivantes.delete(id);
    else suivantes.add(id);
    onChange({ cochees: [...suivantes] });
  };

  const verdict = (p: Proposition): ReactNode => {
    if (!fige) return null;
    if (solution) return p.correcte ? <Verdict ton="bon">Bonne réponse</Verdict> : null;
    const cochee = cochees.has(p.id);
    if (p.correcte && cochee) return <Verdict ton="bon">Bonne réponse, bien cochée</Verdict>;
    if (p.correcte) return <Verdict ton="oubli">Bonne réponse, à cocher</Verdict>;
    if (cochee) return <Verdict ton="faux">Cochée à tort</Verdict>;
    return null;
  };

  return (
    <ul role={simple ? 'radiogroup' : 'group'} className="space-y-2">
      {(question.propositions ?? []).map((p, i) => {
        const cochee = cochees.has(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              role={simple ? 'radio' : 'checkbox'}
              aria-checked={cochee}
              disabled={fige}
              onClick={() => basculer(p.id)}
              className={cx(
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                fige && p.correcte && 'border-bon/70 bg-bon/10',
                fige && !p.correcte && cochee && 'border-critique/70 bg-critique/10',
                fige && !p.correcte && !cochee && 'border-bord bg-surface',
                !fige && cochee && 'border-accent bg-accent-fond',
                !fige && !cochee && 'border-bord bg-surface hover:bg-surface-2',
              )}
            >
              <span
                className={cx(
                  'chiffres mt-0.5 grid size-6 shrink-0 place-items-center border text-xs font-semibold',
                  simple ? 'rounded-full' : 'rounded-md',
                  cochee ? 'border-accent bg-accent text-white' : 'border-axe text-texte-2',
                )}
                aria-hidden
              >
                {cochee ? <Check size={14} /> : String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1">
                {p.texte}
                {verdict(p)}
                {fige && p.explication && (
                  <span className="mt-1 block text-xs text-texte-2">{p.explication}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VraiFaux({ question, reponse, onChange, correction, solution }: Props) {
  const jugements = reponse.jugements ?? {};
  const fige = !!correction || !!solution;
  return (
    <ul className="space-y-2">
      {(question.propositions ?? []).map((p) => {
        const jugement = jugements[p.id];
        const juste = jugement === p.correcte;
        return (
          <li
            key={p.id}
            className={cx(
              'rounded-xl border p-3 text-sm',
              fige && !solution
                ? juste
                  ? 'border-bon/70 bg-bon/10'
                  : 'border-critique/70 bg-critique/10'
                : 'border-bord bg-surface',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="min-w-0 flex-1 basis-56">{p.texte}</p>
              <div
                role="radiogroup"
                aria-label="Vrai ou faux"
                className={cx('flex gap-1.5', solution && 'hidden')}
              >
                {[true, false].map((valeur) => (
                  <button
                    key={String(valeur)}
                    type="button"
                    role="radio"
                    aria-checked={jugement === valeur}
                    disabled={fige}
                    onClick={() => onChange?.({ jugements: { ...jugements, [p.id]: valeur } })}
                    className={cx(
                      'min-h-10 min-w-16 rounded-lg border px-3 text-sm font-medium',
                      jugement === valeur
                        ? 'border-accent bg-accent text-white'
                        : 'border-axe text-texte-2 hover:bg-surface-2',
                    )}
                  >
                    {valeur ? 'Vrai' : 'Faux'}
                  </button>
                ))}
              </div>
            </div>
            {fige && (
              <>
                <Verdict
                  ton={
                    solution
                      ? p.correcte
                        ? 'bon'
                        : 'faux'
                      : juste
                        ? 'bon'
                        : jugement === undefined
                          ? 'oubli'
                          : 'faux'
                  }
                >
                  L'affirmation est {p.correcte ? 'vraie' : 'fausse'}
                  {!solution && jugement === undefined ? ' (sans réponse)' : ''}
                </Verdict>
                {p.explication && <p className="mt-1 text-xs text-texte-2">{p.explication}</p>}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Trous({ question, reponse, onChange, correction, solution }: Props) {
  const textes = reponse.textes ?? {};
  const fige = !!correction || !!solution;
  const justes = new Map(correction?.details.map((d) => [d.id, d.juste]));
  const morceaux = question.enonce.split(/(\{\{[^}]+\}\})/g);

  return (
    <div>
      <p className="text-base leading-9">
        {morceaux.map((morceau, i) => {
          const id = /^\{\{([^}]+)\}\}$/.exec(morceau)?.[1];
          if (!id) return <span key={i}>{morceau}</span>;
          const juste = justes.get(id);
          return (
            <input
              key={i}
              type="text"
              value={textes[id] ?? ''}
              disabled={fige}
              onChange={(e) => onChange?.({ textes: { ...textes, [id]: e.target.value } })}
              aria-label={`Trou ${id}`}
              autoCapitalize="none"
              autoComplete="off"
              className={cx(
                'mx-1 inline-block h-9 w-36 rounded-lg border bg-surface-2 px-2 text-sm',
                !fige && 'border-axe',
                fige && (solution || juste === undefined) && 'border-axe',
                fige && !solution && juste === true && 'border-bon/70',
                fige && !solution && juste === false && 'border-critique/70',
              )}
            />
          );
        })}
      </p>
      {fige && (
        <ul className="mt-3 space-y-1">
          {(question.trous ?? []).map((t) => (
            <li key={t.id}>
              <Verdict ton={solution || justes.get(t.id) ? 'bon' : 'faux'}>
                Trou {t.id} : {t.reponses[0]}
                {solution || justes.get(t.id) ? '' : ` (ta réponse : ${textes[t.id]?.trim() || 'vide'})`}
              </Verdict>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuestionVue(props: Props) {
  const { question, cas } = props;
  return (
    <div>
      {cas && (
        <aside className="mb-4 rounded-xl border border-bord bg-surface-2 p-4 text-sm">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muet uppercase">
            Cas clinique · {cas.titre}
          </h3>
          <p className="whitespace-pre-line text-texte-2">{cas.vignette}</p>
        </aside>
      )}
      <p className="mb-1 text-xs text-muet">{CONSIGNE[question.type]}</p>
      {question.type !== 'trous' && (
        <p className="mb-4 text-base leading-relaxed font-medium whitespace-pre-line">
          {question.enonce}
        </p>
      )}
      {question.type === 'trous' ? (
        <Trous {...props} />
      ) : question.type === 'vrai_faux' ? (
        <VraiFaux {...props} />
      ) : (
        <Choix {...props} />
      )}
    </div>
  );
}
