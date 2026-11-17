/**
 * Graphiques de Dr Rodier, dessinés en SVG.
 *
 * Règles suivies partout : marques fines, grille discrète, une seule échelle
 * par graphique, valeurs lisibles sans survol (libellés ou vue tableau),
 * texte jamais coloré comme la série, info-bulle au survol et au clavier.
 */
import { Table as IconeTableau } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../composants/ui';

const COULEUR = {
  serie: 'var(--color-accent)',
  grille: 'var(--color-grille)',
  axe: 'var(--color-axe)',
  muet: 'var(--color-muet)',
  surface: 'var(--color-surface)',
};

export interface DonneesTableau {
  colonnes: string[];
  lignes: (string | number)[][];
}

/** Carte de graphique avec titre et bascule vers la vue tableau. */
export function CarteGraphique({
  titre,
  sousTitre,
  tableau,
  children,
  className,
}: {
  titre: string;
  sousTitre?: string;
  tableau?: DonneesTableau;
  children: ReactNode;
  className?: string;
}) {
  const [enTableau, setEnTableau] = useState(false);
  return (
    <section className={cx('carte p-4 sm:p-5', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{titre}</h2>
          {sousTitre && <p className="mt-0.5 text-xs text-muet">{sousTitre}</p>}
        </div>
        {tableau && (
          <button
            type="button"
            aria-pressed={enTableau}
            onClick={() => setEnTableau((v) => !v)}
            className={cx(
              'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs',
              enTableau ? 'bg-surface-3 text-texte' : 'text-muet hover:text-texte',
            )}
          >
            <IconeTableau size={14} aria-hidden />
            Tableau
          </button>
        )}
      </header>
      {enTableau && tableau ? <VueTableau {...tableau} /> : children}
    </section>
  );
}

function VueTableau({ colonnes, lignes }: DonneesTableau) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="chiffres w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-muet">
          <tr>
            {colonnes.map((c) => (
              <th key={c} className="py-1.5 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i} className="border-t border-grille">
              {ligne.map((cellule, j) => (
                <td key={j} className="py-1.5 pr-3 text-texte-2">
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Largeur disponible d'un élément, suivie en continu. */
function useLargeur(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observateur = new ResizeObserver(([entree]) => {
      if (entree) setLargeur(Math.floor(entree.contentRect.width));
    });
    observateur.observe(element);
    setLargeur(Math.floor(element.getBoundingClientRect().width));
    return () => observateur.disconnect();
  }, []);
  return [ref, largeur];
}

function Bulle({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-bord bg-surface-3 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

export interface PointCourbe {
  /** Libellé de l'abscisse (date lisible). */
  libelle: string;
  /** Valeur, ou `null` s'il n'y a pas de donnée à cette date. */
  valeur: number | null;
}

/**
 * Courbe d'une seule série dans le temps, avec repère vertical et info-bulle.
 */
export function Courbe({
  points,
  max,
  format,
  hauteur = 180,
  nomSerie,
}: {
  points: PointCourbe[];
  max?: number;
  format: (v: number) => string;
  hauteur?: number;
  nomSerie: string;
}) {
  const [ref, largeur] = useLargeur();
  const [survol, setSurvol] = useState<number | undefined>();
  const idDegrade = useId();

  const marge = { haut: 10, droite: 12, bas: 22, gauche: 36 };
  const l = Math.max(0, largeur - marge.gauche - marge.droite);
  const h = hauteur - marge.haut - marge.bas;
  const valeurs = points.map((p) => p.valeur).filter((v): v is number => v !== null);
  const plafond = max ?? Math.max(1, ...valeurs);
  const x = (i: number) => marge.gauche + (points.length <= 1 ? l / 2 : (i / (points.length - 1)) * l);
  const y = (v: number) => marge.haut + h - (v / plafond) * h;

  const definis = points
    .map((p, i) => ({ i, v: p.valeur }))
    .filter((p): p is { i: number; v: number } => p.v !== null);
  const trace = definis.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ');
  const aire =
    definis.length > 1
      ? `${trace} L${x(definis.at(-1)!.i)},${marge.haut + h} L${x(definis[0]!.i)},${marge.haut + h} Z`
      : '';

  const graduations = [0, 0.5, 1].map((part) => plafond * part);
  const pas = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(l / 70))));
  const dernier = definis.at(-1);

  const auPointeur = (clientX: number, cible: SVGElement) => {
    if (points.length === 0) return;
    const boite = cible.getBoundingClientRect();
    const rel = clientX - boite.left - marge.gauche;
    const i = Math.round((rel / Math.max(1, l)) * (points.length - 1));
    setSurvol(Math.min(points.length - 1, Math.max(0, i)));
  };

  const pointSurvol = survol !== undefined ? points[survol] : undefined;

  return (
    <div ref={ref} className="relative">
      {largeur > 0 && (
        <svg
          width={largeur}
          height={hauteur}
          role="img"
          aria-label={`${nomSerie} : courbe sur ${points.length} points`}
          tabIndex={0}
          onPointerMove={(e) => auPointeur(e.clientX, e.currentTarget)}
          onPointerLeave={() => setSurvol(undefined)}
          onBlur={() => setSurvol(undefined)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const depart = survol ?? points.length - 1;
            const suivant = depart + (e.key === 'ArrowRight' ? 1 : -1);
            setSurvol(Math.min(points.length - 1, Math.max(0, suivant)));
          }}
          className="touch-pan-y outline-none"
        >
          <defs>
            <linearGradient id={idDegrade} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={COULEUR.serie} stopOpacity="0.18" />
              <stop offset="1" stopColor={COULEUR.serie} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {graduations.map((g) => (
            <g key={g}>
              <line
                x1={marge.gauche}
                x2={marge.gauche + l}
                y1={y(g)}
                y2={y(g)}
                stroke={g === 0 ? COULEUR.axe : COULEUR.grille}
              />
              <text x={marge.gauche - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill={COULEUR.muet}>
                {format(g)}
              </text>
            </g>
          ))}
          {points.map(
            (p, i) =>
              i % pas === 0 && (
                <text key={i} x={x(i)} y={hauteur - 6} textAnchor="middle" fontSize="11" fill={COULEUR.muet}>
                  {p.libelle}
                </text>
              ),
          )}
          {aire && <path d={aire} fill={`url(#${idDegrade})`} />}
          <path
            d={trace}
            fill="none"
            stroke={COULEUR.serie}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Dernier point : seule valeur étiquetée directement. */}
          {dernier && survol === undefined && (
            <g>
              <circle cx={x(dernier.i)} cy={y(dernier.v)} r="5" fill={COULEUR.serie} stroke={COULEUR.surface} strokeWidth="2" />
              <text
                x={x(dernier.i) - 8}
                y={Math.max(12, y(dernier.v) - 10)}
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                fill="var(--color-texte)"
              >
                {format(dernier.v)}
              </text>
            </g>
          )}
          {survol !== undefined && (
            <g>
              <line
                x1={x(survol)}
                x2={x(survol)}
                y1={marge.haut}
                y2={marge.haut + h}
                stroke={COULEUR.axe}
              />
              {pointSurvol?.valeur != null && (
                <circle
                  cx={x(survol)}
                  cy={y(pointSurvol.valeur)}
                  r="5"
                  fill={COULEUR.serie}
                  stroke={COULEUR.surface}
                  strokeWidth="2"
                />
              )}
            </g>
          )}
        </svg>
      )}
      {survol !== undefined && pointSurvol && (
        <Bulle x={x(survol)} y={pointSurvol.valeur != null ? y(pointSurvol.valeur) : marge.haut + h / 2}>
          <span className="font-semibold">
            {pointSurvol.valeur != null ? format(pointSurvol.valeur) : 'Aucune donnée'}
          </span>
          <span className="ml-2 text-texte-2">{pointSurvol.libelle}</span>
        </Bulle>
      )}
    </div>
  );
}

export interface LigneBarre {
  id: string;
  libelle: string;
  valeur: number;
  /** Texte affiché au bout de la barre. */
  texte: string;
  detail?: string;
}

/**
 * Barres horizontales sur une base commune, une seule teinte : comparer des
 * grandeurs entre éléments (matières, chapitres).
 */
export function BarresClassees({ lignes, max }: { lignes: LigneBarre[]; max?: number }) {
  const plafond = max ?? Math.max(1e-9, ...lignes.map((l) => l.valeur));
  return (
    <ul className="space-y-2.5">
      {lignes.map((l) => (
        <li key={l.id} title={l.detail}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-texte-2">{l.libelle}</span>
            <span className="chiffres shrink-0 font-medium">{l.texte}</span>
          </div>
          <div className="h-2.5 border-l border-axe">
            <div
              className="h-full rounded-r bg-accent"
              style={{ width: `${Math.max(0, Math.min(1, l.valeur / plafond)) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface JourChaleur {
  /** Jour au format AAAA-MM-JJ. */
  jour: string;
  libelle: string;
  valeur: number;
}

/** Nuances d'une seule teinte : plus l'activité est forte, plus la case est claire. */
const NUANCES = ['var(--color-surface-3)', '#0d366b', '#184f95', '#256abf', '#3987e5', '#86b6ef'];

export function niveauChaleur(valeur: number, max: number): number {
  if (valeur <= 0) return 0;
  return Math.min(5, 1 + Math.floor((valeur / Math.max(1, max)) * 4.999));
}

/**
 * Carte de chaleur des révisions : une colonne par semaine, une ligne par
 * jour de la semaine (lundi en haut).
 */
export function CarteChaleur({
  jours: tousLesJours,
  unite,
}: {
  /** Jours consécutifs, le premier étant un lundi. */
  jours: JourChaleur[];
  unite: string;
}) {
  const [ref, largeurDispo] = useLargeur();
  const [survol, setSurvol] = useState<number | undefined>();
  const cote = 13;
  const pas = cote + 3;
  const margeGauche = 22;
  // On montre autant de semaines que la largeur le permet, les plus récentes.
  const semainesTotal = Math.ceil(tousLesJours.length / 7);
  const semaines = Math.max(8, Math.min(semainesTotal, Math.floor((largeurDispo - margeGauche) / pas)));
  const jours = tousLesJours.slice((semainesTotal - semaines) * 7);
  const max = Math.max(1, ...jours.map((j) => j.valeur));
  const largeur = margeGauche + semaines * pas;
  const hauteur = 7 * pas + 16;
  const actif = survol !== undefined ? jours[survol] : undefined;

  return (
    <div>
      <div ref={ref} className="relative overflow-x-auto pb-1">
        <svg width={largeur} height={hauteur} role="img" aria-label="Carte de chaleur des révisions">
          {['L', 'M', 'V', 'D'].map((lettre, k) => (
            <text key={lettre} x={0} y={k * 2 * pas + cote - 2} fontSize="10" fill={COULEUR.muet}>
              {lettre}
            </text>
          ))}
          {jours.map((j, i) => {
            const colonne = Math.floor(i / 7);
            const ligne = i % 7;
            const premierDuMois = j.jour.endsWith('-01');
            return (
              <g key={j.jour}>
                <rect
                  x={margeGauche + colonne * pas}
                  y={ligne * pas}
                  width={cote}
                  height={cote}
                  rx="3"
                  fill={NUANCES[niveauChaleur(j.valeur, max)]}
                  stroke={survol === i ? 'var(--color-texte)' : 'none'}
                  strokeWidth="1.5"
                  tabIndex={0}
                  aria-label={`${j.libelle} : ${j.valeur} ${unite}`}
                  onPointerEnter={() => setSurvol(i)}
                  onPointerLeave={() => setSurvol(undefined)}
                  onFocus={() => setSurvol(i)}
                  onBlur={() => setSurvol(undefined)}
                  className="outline-none"
                />
                {premierDuMois && (
                  <text x={margeGauche + colonne * pas} y={7 * pas + 10} fontSize="10" fill={COULEUR.muet}>
                    {j.libelle.split(' ').slice(2).join(' ')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muet">
        <span className="chiffres min-h-4 text-texte-2">
          {actif ? (
            <>
              <strong className="font-semibold text-texte">
                {actif.valeur} {unite}
              </strong>{' '}
              · {actif.libelle}
            </>
          ) : (
            'Survole un jour pour voir le détail'
          )}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Moins
          {NUANCES.map((n) => (
            <span key={n} className="size-3 rounded-[3px]" style={{ background: n }} />
          ))}
          Plus
        </span>
      </div>
    </div>
  );
}

export interface PartSegment {
  id: string;
  libelle: string;
  valeur: number;
  couleur: string;
}

/**
 * Barre segmentée : un tout réparti en quelques parts (6 au plus), avec la
 * part imprimée dans chaque bloc quand elle tient et une légende nominative.
 */
export function BarreSegmentee({ parts, unite }: { parts: PartSegment[]; unite: string }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (total === 0) return <p className="text-sm text-muet">Aucune donnée pour le moment.</p>;
  const visibles = parts.filter((p) => p.valeur > 0);
  const description = visibles
    .map((p) => `${p.libelle} : ${p.valeur} ${unite}, ${Math.round((p.valeur / total) * 100)} %`)
    .join(' ; ');
  return (
    <div>
      <div className="flex h-7 gap-0.5" role="img" aria-label={description}>
        {visibles.map((p) => {
          const part = p.valeur / total;
          return (
            <div
              key={p.id}
              title={`${p.libelle} : ${p.valeur} ${unite} (${Math.round(part * 100)} %)`}
              className="flex min-w-1 items-center rounded px-2 text-xs font-semibold text-white"
              style={{ width: `${part * 100}%`, background: p.couleur }}
            >
              {part >= 0.12 && `${Math.round(part * 100)} %`}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-texte-2">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.couleur }} aria-hidden />
            {p.libelle}
            <span className="chiffres text-muet">{p.valeur}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tuile de chiffre clé : libellé, valeur, complément facultatif. */
export function Tuile({
  libelle,
  valeur,
  complement,
  icone,
}: {
  libelle: string;
  valeur: ReactNode;
  complement?: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <div className="carte p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muet">
        <span>{libelle}</span>
        {icone}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{valeur}</div>
      {complement && <div className="mt-1 text-xs text-texte-2">{complement}</div>}
    </div>
  );
}

/** Anneau de progression pour un taux unique (avancement global, niveau). */
export function Anneau({
  valeur,
  taille = 96,
  children,
  libelle,
}: {
  valeur: number;
  taille?: number;
  children?: ReactNode;
  libelle: string;
}) {
  const epaisseur = 8;
  const rayon = (taille - epaisseur) / 2;
  const tour = 2 * Math.PI * rayon;
  const borne = Math.min(1, Math.max(0, valeur));
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: taille, height: taille }}
      role="img"
      aria-label={`${libelle} : ${Math.round(borne * 100)} %`}
    >
      <svg width={taille} height={taille} className="-rotate-90">
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke="rgb(57 135 229 / 0.2)" strokeWidth={epaisseur} />
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke={COULEUR.serie}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={`${tour * borne} ${tour}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
