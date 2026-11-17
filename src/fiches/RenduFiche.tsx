/**
 * Rendu visuel d'une fiche de révision : texte structuré, listes courtes,
 * points clés, pièges, arbres de décision, schémas interactifs, séquences
 * pas à pas, moyens mnémotechniques et scènes 3D. Aucun tableau.
 */
import {
  ArrowRight,
  Box,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  KeyRound,
  Lightbulb,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BlocFiche, Fiche, NoeudArbre } from '../../shared/types';
import { Bouton, cx } from '../composants/ui';
import { FournisseurAnnotations, Surlignable } from './Annotations';

// three.js est volumineux : la scène 3D n'est chargée qu'à l'ouverture.
const Scene3DVue = lazy(() => import('./Scene3D'));

function Encadre({
  icone,
  titre,
  ton = 'neutre',
  children,
}: {
  icone: ReactNode;
  titre: string;
  ton?: 'neutre' | 'accent' | 'alerte';
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border p-4',
        ton === 'accent' && 'border-accent/40 bg-accent-fond',
        ton === 'alerte' && 'border-alerte/40 bg-alerte/10',
        ton === 'neutre' && 'border-bord bg-surface-2',
      )}
    >
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-texte-2 uppercase">
        {icone}
        {titre}
      </h4>
      {children}
    </div>
  );
}

function Liste({ elements, cle }: { elements: string[]; cle: string }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {elements.map((e, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <Surlignable cle={`${cle}:${i}`}>{e}</Surlignable>
        </li>
      ))}
    </ul>
  );
}

/** Arbre de décision : on avance en choisissant une branche à chaque nœud. */
function Arbre({ racine }: { racine: NoeudArbre }) {
  const [chemin, setChemin] = useState<number[]>([]);

  const etapes: { noeud: NoeudArbre; choix?: string }[] = [{ noeud: racine }];
  let courant = racine;
  for (const indice of chemin) {
    const branche = courant.branches?.[indice];
    if (!branche) break;
    etapes[etapes.length - 1]!.choix = branche.condition;
    courant = branche.noeud;
    etapes.push({ noeud: courant });
  }

  return (
    <div>
      <ol className="space-y-2">
        {etapes.map((etape, niveau) => {
          const dernier = niveau === etapes.length - 1;
          const feuille = !etape.noeud.branches?.length;
          return (
            <li key={niveau} className="apparait">
              <div
                className={cx(
                  'rounded-xl border p-3 text-sm',
                  dernier && feuille ? 'border-bon/60 bg-bon/10' : 'border-bord bg-surface',
                )}
              >
                <p className="font-medium">{etape.noeud.label}</p>
                {etape.noeud.detail && <p className="mt-1 text-texte-2">{etape.noeud.detail}</p>}
                {dernier && !feuille && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {etape.noeud.branches!.map((b, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setChemin([...chemin.slice(0, niveau), i])}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent/60 bg-accent-fond px-3 text-sm hover:bg-accent/30"
                      >
                        {b.condition}
                        <ArrowRight size={14} aria-hidden />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {etape.choix && (
                <button
                  type="button"
                  onClick={() => setChemin(chemin.slice(0, niveau))}
                  className="my-1 ml-4 flex items-center gap-2 border-l-2 border-accent py-1.5 pl-3 text-xs text-texte-2 hover:text-texte"
                  title="Revenir à ce choix"
                >
                  <GitBranch size={13} aria-hidden />
                  {etape.choix}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {chemin.length > 0 && (
        <button
          type="button"
          onClick={() => setChemin([])}
          className="mt-2 text-xs text-accent-clair hover:underline"
        >
          Recommencer l'arbre
        </button>
      )}
    </div>
  );
}

type BlocSchema = Extract<BlocFiche, { type: 'schema' }>;

/**
 * Schéma interactif : les nœuds sont rangés par niveaux (un nœud se place
 * sous ceux qui pointent vers lui) et reliés par des flèches. Toucher un
 * nœud affiche son détail.
 */
function Schema({ bloc }: { bloc: BlocSchema }) {
  const [actif, setActif] = useState<string>();
  const conteneur = useRef<HTMLDivElement>(null);
  const [largeurDispo, setLargeurDispo] = useState(0);

  useEffect(() => {
    const element = conteneur.current;
    if (!element) return;
    const observateur = new ResizeObserver(([entree]) => {
      if (entree) setLargeurDispo(Math.floor(entree.contentRect.width));
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  const disposition = useMemo(() => {
    const niveau = new Map(bloc.noeuds.map((n) => [n.id, 0]));
    // Plus long chemin depuis une racine ; borné pour résister aux cycles.
    for (let tour = 0; tour < bloc.noeuds.length; tour++) {
      let change = false;
      for (const lien of bloc.liens) {
        const de = niveau.get(lien.de);
        const vers = niveau.get(lien.vers);
        if (de === undefined || vers === undefined) continue;
        if (vers < de + 1 && de + 1 < bloc.noeuds.length) {
          niveau.set(lien.vers, de + 1);
          change = true;
        }
      }
      if (!change) break;
    }
    const rangs: string[][] = [];
    for (const n of bloc.noeuds) {
      const r = niveau.get(n.id) ?? 0;
      (rangs[r] ??= []).push(n.id);
    }

    const L = 150;
    const H = 52;
    const ecartX = 16;
    const ecartY = 46;
    // Un rang trop large pour l'écran est réparti sur plusieurs lignes.
    const parLigne = Math.max(1, Math.floor(((largeurDispo || 640) + ecartX) / (L + ecartX)));
    const lignes: string[][] = [];
    for (const rang of rangs) {
      for (let i = 0; i < (rang?.length ?? 0); i += parLigne) lignes.push(rang!.slice(i, i + parLigne));
    }
    const largeurMax = Math.max(1, ...lignes.map((l) => l.length));
    const largeur = largeurMax * (L + ecartX) - ecartX;
    const positions = new Map<string, { x: number; y: number }>();
    lignes.forEach((ligne, r) => {
      const depart = (largeur - (ligne.length * (L + ecartX) - ecartX)) / 2;
      ligne.forEach((id, i) => positions.set(id, { x: depart + i * (L + ecartX), y: r * (H + ecartY) }));
    });
    return { positions, largeur, hauteur: lignes.length * (H + ecartY) - ecartY, L, H };
  }, [bloc, largeurDispo]);

  const { positions, largeur, hauteur, L, H } = disposition;
  const noeudActif = bloc.noeuds.find((n) => n.id === actif);
  const idFleche = `fleche-${bloc.noeuds[0]?.id ?? 'x'}`;

  return (
    <div>
      <div ref={conteneur} className="flex justify-center overflow-x-auto pb-2">
        <svg
          width={largeur + 4}
          height={hauteur + 4}
          viewBox={`-2 -2 ${largeur + 4} ${hauteur + 4}`}
          role="group"
          aria-label={bloc.titre ?? 'Schéma'}
        >
          <defs>
            <marker id={idFleche} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-muet)" />
            </marker>
          </defs>
          {bloc.liens.map((lien, i) => {
            const a = positions.get(lien.de);
            const b = positions.get(lien.vers);
            if (!a || !b) return null;
            const x1 = a.x + L / 2;
            const y1 = a.y + H;
            const x2 = b.x + L / 2;
            const y2 = b.y;
            const milieu = (y1 + y2) / 2;
            return (
              <g key={i}>
                <path
                  d={`M${x1},${y1} C${x1},${milieu} ${x2},${milieu} ${x2},${y2 - 2}`}
                  fill="none"
                  stroke="var(--color-muet)"
                  strokeWidth="1.5"
                  markerEnd={`url(#${idFleche})`}
                />
                {lien.label && (
                  <text
                    x={(x1 + x2) / 2 + 6}
                    y={milieu + 4}
                    fontSize="11"
                    fill="var(--color-texte-2)"
                    stroke="var(--color-surface)"
                    strokeWidth="4"
                    paintOrder="stroke"
                  >
                    {lien.label}
                  </text>
                )}
              </g>
            );
          })}
          {bloc.noeuds.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const selectionne = actif === n.id;
            return (
              <foreignObject key={n.id} x={p.x} y={p.y} width={L} height={H}>
                <button
                  type="button"
                  aria-pressed={selectionne}
                  onClick={() => setActif(selectionne ? undefined : n.id)}
                  className={cx(
                    'flex size-full items-center justify-center rounded-lg border px-2 text-center text-xs leading-tight font-medium',
                    selectionne
                      ? 'border-accent bg-accent-fond text-texte'
                      : 'border-axe bg-surface-3 text-texte hover:border-accent/70',
                  )}
                >
                  {n.label}
                </button>
              </foreignObject>
            );
          })}
        </svg>
      </div>
      <p className="mt-1 min-h-10 rounded-lg bg-surface p-2.5 text-sm text-texte-2" role="status">
        {noeudActif ? (
          <>
            <strong className="font-semibold text-texte">{noeudActif.label}</strong>
            {noeudActif.detail ? ` — ${noeudActif.detail}` : ''}
          </>
        ) : (
          'Touche un élément du schéma pour afficher son détail.'
        )}
      </p>
    </div>
  );
}

/** Séquence pas à pas : une étape à la fois, avec repères de progression. */
function Etapes({ etapes }: { etapes: { titre: string; detail: string }[] }) {
  const [i, setI] = useState(0);
  const etape = etapes[i]!;
  return (
    <div>
      <ol className="mb-3 flex gap-1" aria-label="Étapes">
        {etapes.map((e, k) => (
          <li key={k} className="flex-1">
            <button
              type="button"
              onClick={() => setI(k)}
              aria-current={k === i ? 'step' : undefined}
              aria-label={`Étape ${k + 1} : ${e.titre}`}
              className={cx('h-1.5 w-full rounded-full', k <= i ? 'bg-accent' : 'bg-accent/20')}
            />
          </li>
        ))}
      </ol>
      <div className="apparait min-h-24 rounded-xl bg-surface p-4" key={i}>
        <p className="chiffres text-xs text-muet">
          Étape {i + 1} / {etapes.length}
        </p>
        <p className="mt-1 text-sm font-semibold">{etape.titre}</p>
        <p className="mt-1 text-sm text-texte-2">{etape.detail}</p>
      </div>
      <div className="mt-3 flex justify-between">
        <Bouton icone={ChevronLeft} disabled={i === 0} onClick={() => setI(i - 1)}>
          Précédent
        </Bouton>
        <Bouton variante="primaire" disabled={i === etapes.length - 1} onClick={() => setI(i + 1)}>
          Suivant
          <ChevronRight size={18} aria-hidden />
        </Bouton>
      </div>
    </div>
  );
}

function Bloc({ bloc, cle }: { bloc: BlocFiche; cle: string }) {
  switch (bloc.type) {
    case 'texte':
      return (
        <p className="text-sm leading-relaxed whitespace-pre-line text-texte-2">
          <Surlignable cle={cle}>{bloc.contenu}</Surlignable>
        </p>
      );
    case 'liste':
      return (
        <div>
          {bloc.titre && <h4 className="mb-2 text-sm font-semibold">{bloc.titre}</h4>}
          <Liste elements={bloc.elements} cle={cle} />
        </div>
      );
    case 'cles':
      return (
        <Encadre icone={<KeyRound size={14} className="text-accent-clair" aria-hidden />} titre="À retenir" ton="accent">
          <Liste elements={bloc.elements} cle={cle} />
        </Encadre>
      );
    case 'pieges':
      return (
        <Encadre icone={<TriangleAlert size={14} className="text-alerte" aria-hidden />} titre="Pièges classiques" ton="alerte">
          <Liste elements={bloc.elements} cle={cle} />
        </Encadre>
      );
    case 'arbre':
      return (
        <Encadre icone={<GitBranch size={14} aria-hidden />} titre={bloc.titre ?? 'Arbre de décision'}>
          <Arbre racine={bloc.racine} />
        </Encadre>
      );
    case 'schema':
      return (
        <Encadre icone={<Workflow size={14} aria-hidden />} titre={bloc.titre ?? 'Schéma'}>
          <Schema bloc={bloc} />
        </Encadre>
      );
    case 'etapes':
      return (
        <Encadre icone={<Workflow size={14} aria-hidden />} titre={bloc.titre ?? 'Pas à pas'}>
          <Etapes etapes={bloc.etapes} />
        </Encadre>
      );
    case 'mnemo':
      return (
        <Encadre icone={<Lightbulb size={14} className="text-accent-clair" aria-hidden />} titre="Moyen mnémotechnique">
          <p className="text-lg font-semibold tracking-wide">{bloc.phrase}</p>
          <ul className="mt-2 space-y-1 text-sm text-texte-2">
            {bloc.signification.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Encadre>
      );
    case 'scene3d':
      return (
        <Encadre icone={<Box size={14} aria-hidden />} titre={`Modèle 3D · ${bloc.scene.titre}`}>
          <Suspense fallback={<p className="text-sm text-muet">Chargement du modèle 3D…</p>}>
            <Scene3DVue scene={bloc.scene} />
          </Suspense>
        </Encadre>
      );
  }
}

export function RenduFiche({ fiche, filtre }: { fiche: Fiche; filtre?: (bloc: BlocFiche) => boolean }) {
  const sections = fiche.sections
    .map((s) => ({ ...s, blocs: filtre ? s.blocs.filter(filtre) : s.blocs }))
    .filter((s) => s.blocs.length > 0);
  return (
    <FournisseurAnnotations chapitreId={fiche.chapitreId}>
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="carte scroll-mt-4 p-4 sm:p-5">
          <h3 className="mb-3 text-base font-semibold">{section.titre}</h3>
          <div className="space-y-4">
            {section.blocs.map((bloc, i) => (
              <Bloc key={i} bloc={bloc} cle={`${section.id}:${i}`} />
            ))}
          </div>
        </section>
      ))}
    </div>
    </FournisseurAnnotations>
  );
}
