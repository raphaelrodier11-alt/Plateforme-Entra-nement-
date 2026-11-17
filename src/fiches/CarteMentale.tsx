/** Carte mentale interactive d'un chapitre : touche une branche pour la replier ou la déplier. */
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { carteMentale, type NoeudCarte } from '../../shared/cartementale';
import type { Fiche } from '../../shared/types';
import { couleurMatiere } from '../lib/couleurs';

const LARGEUR = [200, 190, 280];
const HAUTEUR = 30;
const ECART_X = 36;
const ECART_Y = 10;

interface Place {
  noeud: NoeudCarte;
  niveau: number;
  x: number;
  y: number;
  parent?: Place;
  section: number;
}

export function CarteMentale({ fiche }: { fiche: Fiche }) {
  const arbre = useMemo(() => carteMentale(fiche), [fiche]);
  const [repliees, setRepliees] = useState<Set<string>>(new Set());
  const c = couleurMatiere(fiche.matiereId);

  const { places, largeur, hauteur } = useMemo(() => {
    const places: Place[] = [];
    let y = 0;
    const poser = (n: NoeudCarte, niveau: number, parent: Place | undefined, section: number): { place: Place; haut: number; bas: number } => {
      const visibles = repliees.has(n.id) ? [] : n.enfants;
      const x = LARGEUR.slice(0, niveau).reduce((a, w) => a + w + ECART_X, 0);
      if (visibles.length === 0) {
        const place: Place = { noeud: n, niveau, x, y, parent, section };
        y += HAUTEUR + ECART_Y;
        places.push(place);
        return { place, haut: place.y, bas: place.y };
      }
      const place: Place = { noeud: n, niveau, x, y: 0, parent, section };
      places.push(place);
      const enfants = visibles.map((e, i) => poser(e, niveau + 1, place, niveau === 0 ? i : section));
      place.y = (enfants[0]!.place.y + enfants[enfants.length - 1]!.place.y) / 2;
      return { place, haut: enfants[0]!.haut, bas: enfants[enfants.length - 1]!.bas };
    };
    poser(arbre, 0, undefined, 0);
    return { places, largeur: LARGEUR.reduce((a, w) => a + w + ECART_X, 0), hauteur: Math.max(y, HAUTEUR) };
  }, [arbre, repliees]);

  const basculer = (id: string) =>
    setRepliees((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const teinte = (section: number) => `oklch(0.72 0.14 ${(215 + section * 47) % 360})`;

  return (
    <div className="carte overflow-x-auto p-3">
      <p className="mb-2 text-xs text-muet">Touche une section pour la replier ou la déplier.</p>
      <svg width={largeur} height={hauteur + 8} viewBox={`0 -4 ${largeur} ${hauteur + 8}`} role="img" aria-label={`Carte mentale : ${fiche.titre}`} className="min-w-full">
        {places.filter((p) => p.parent).map((p) => {
          const a = p.parent!;
          const x1 = a.x + LARGEUR[a.niveau]!;
          const y1 = a.y + HAUTEUR / 2;
          const x2 = p.x;
          const y2 = p.y + HAUTEUR / 2;
          const m = (x1 + x2) / 2;
          return <path key={p.noeud.id} d={`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`} fill="none" stroke={p.niveau === 1 ? c.accent : teinte(p.section)} strokeOpacity={0.55} strokeWidth={p.niveau === 1 ? 2 : 1.5} />;
        })}
        {places.map((p) => {
          const couleur = p.niveau === 0 ? c.accent : teinte(p.section);
          const pliable = p.niveau === 1 && p.noeud.enfants.length > 0;
          const replie = repliees.has(p.noeud.id);
          return (
            <g key={p.noeud.id} transform={`translate(${p.x},${p.y})`} onClick={pliable ? () => basculer(p.noeud.id) : undefined} style={pliable ? { cursor: 'pointer' } : undefined}>
              <rect width={LARGEUR[p.niveau]} height={HAUTEUR} rx={10} fill={p.niveau === 0 ? couleur : 'var(--color-surface-2)'} stroke={couleur} strokeWidth={p.niveau === 2 ? 1 : 1.6} />
              <text x={10} y={HAUTEUR / 2 + 4} fontSize={p.niveau === 2 ? 11 : 12.5} fontWeight={p.niveau < 2 ? 600 : 400} fill={p.niveau === 0 ? '#0b0d10' : 'var(--color-texte)'}>
                {p.noeud.label.length > (p.niveau === 2 ? 44 : 26) ? `${p.noeud.label.slice(0, p.niveau === 2 ? 43 : 25)}…` : p.noeud.label}
              </text>
              {pliable && (
                <g transform={`translate(${LARGEUR[1]! - 22},${HAUTEUR / 2 - 7})`} aria-hidden>
                  {replie ? <Plus size={14} color={couleur} /> : <Minus size={14} color={couleur} />}
                </g>
              )}
              <title>{p.noeud.label}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
