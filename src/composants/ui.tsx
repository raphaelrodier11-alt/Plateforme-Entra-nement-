/**
 * Petits composants d'interface partagés par toutes les pages.
 */
import { CircleCheck, CircleDashed, CircleDot, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { LIBELLE_STATUT, type StatutChapitre } from '../../shared/progression';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** « 62 % » */
export function pourcent(valeur: number): string {
  return `${Math.round(valeur * 100)} %`;
}

/** Nombre au format français (espace des milliers, virgule décimale). */
export function nombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function Carte({
  children,
  className,
  titre,
  action,
}: {
  children: ReactNode;
  className?: string;
  titre?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={cx('carte p-4 sm:p-5', className)}>
      {(titre || action) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-texte-2">{titre}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Variante = 'primaire' | 'secondaire' | 'discret' | 'danger';

const STYLE_BOUTON: Record<Variante, string> = {
  primaire: 'bg-accent text-white hover:bg-[#4a93ea] active:bg-[#2a78d6]',
  secondaire: 'bg-surface-2 text-texte border border-bord hover:bg-surface-3',
  discret: 'text-texte-2 hover:bg-surface-2 hover:text-texte',
  danger: 'bg-surface-2 text-texte border border-critique/60 hover:bg-critique/20',
};

const BASE_BOUTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export function Bouton({
  variante = 'secondaire',
  icone: Icone,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icone?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(BASE_BOUTON, STYLE_BOUTON[variante], className)}
    >
      {Icone && <Icone size={18} aria-hidden />}
      {children}
    </button>
  );
}

export function LienBouton({
  variante = 'secondaire',
  icone: Icone,
  className,
  children,
  ...props
}: LinkProps & { variante?: Variante; icone?: LucideIcon }) {
  return (
    <Link {...props} className={cx(BASE_BOUTON, STYLE_BOUTON[variante], className)}>
      {Icone && <Icone size={18} aria-hidden />}
      {children}
    </Link>
  );
}

type Ton = 'neutre' | 'accent' | 'bon' | 'alerte' | 'critique';

const STYLE_PASTILLE: Record<Ton, string> = {
  neutre: 'bg-surface-3 text-texte-2',
  accent: 'bg-accent-fond text-accent-clair',
  bon: 'bg-bon/15 text-texte',
  alerte: 'bg-alerte/15 text-texte',
  critique: 'bg-critique/20 text-texte',
};

const COULEUR_ICONE: Record<Ton, string> = {
  neutre: 'text-muet',
  accent: 'text-accent-clair',
  bon: 'text-bon',
  alerte: 'text-alerte',
  critique: 'text-critique',
};

/** Étiquette courte. La couleur est toujours doublée d'une icône ou d'un texte. */
export function Pastille({
  ton = 'neutre',
  icone: Icone,
  children,
}: {
  ton?: Ton;
  icone?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLE_PASTILLE[ton],
      )}
    >
      {Icone && <Icone size={13} className={COULEUR_ICONE[ton]} aria-hidden />}
      {children}
    </span>
  );
}

const STATUT: Record<StatutChapitre, { ton: Ton; icone: LucideIcon }> = {
  a_commencer: { ton: 'neutre', icone: CircleDashed },
  en_cours: { ton: 'accent', icone: CircleDot },
  acquis: { ton: 'bon', icone: CircleCheck },
  a_revoir: { ton: 'alerte', icone: TriangleAlert },
};

export function PastilleStatut({ statut }: { statut: StatutChapitre }) {
  const { ton, icone } = STATUT[statut];
  return (
    <Pastille ton={ton} icone={icone}>
      {LIBELLE_STATUT[statut]}
    </Pastille>
  );
}

/**
 * Jauge : le remplissage et la piste appartiennent à la même teinte, pour
 * que l'état se lise sur toute la barre.
 */
export function Jauge({
  valeur,
  libelle,
  epaisse,
}: {
  valeur: number;
  libelle: string;
  epaisse?: boolean;
}) {
  const borne = Math.min(1, Math.max(0, valeur));
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(borne * 100)}
      className={cx('w-full overflow-hidden rounded-full bg-accent/20', epaisse ? 'h-2' : 'h-1.5')}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${borne * 100}%` }}
      />
    </div>
  );
}

export function TitrePage({
  titre,
  sousTitre,
  action,
}: {
  titre: string;
  sousTitre?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-texte-2">{sousTitre}</p>}
      </div>
      {action}
    </header>
  );
}

export function EtatVide({
  icone: Icone,
  titre,
  children,
}: {
  icone: LucideIcon;
  titre: string;
  children?: ReactNode;
}) {
  return (
    <div className="carte flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent-fond text-accent-clair">
        <Icone size={24} aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{titre}</h2>
      {children && <div className="max-w-md text-sm text-texte-2">{children}</div>}
    </div>
  );
}

/** Sélecteur à choix exclusifs, présenté comme une rangée d'onglets. */
export function Onglets<T extends string>({
  valeur,
  onChange,
  options,
  libelle,
}: {
  valeur: T;
  onChange: (valeur: T) => void;
  options: { valeur: T; libelle: string; compte?: number }[];
  libelle: string;
}) {
  return (
    <div role="tablist" aria-label={libelle} className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          role="tab"
          aria-selected={o.valeur === valeur}
          onClick={() => onChange(o.valeur)}
          className={cx(
            'min-h-10 flex-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
            o.valeur === valeur ? 'bg-surface-3 text-texte' : 'text-texte-2 hover:text-texte',
          )}
        >
          {o.libelle}
          {o.compte !== undefined && o.compte > 0 && (
            <span className="chiffres ml-1.5 text-muet">{o.compte}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Bouton à bascule (filtre, option). */
export function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cx(
        'min-h-9 rounded-full border px-3 text-sm transition-colors',
        actif
          ? 'border-accent bg-accent-fond text-texte'
          : 'border-bord bg-surface text-texte-2 hover:text-texte',
      )}
    >
      {children}
    </button>
  );
}

export const STYLE_CHAMP =
  'min-h-11 w-full rounded-xl border border-bord bg-surface-2 px-3 text-sm text-texte placeholder:text-muet';
