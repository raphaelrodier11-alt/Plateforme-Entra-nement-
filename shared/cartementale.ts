/**
 * Carte mentale d'un chapitre, tirée de sa fiche (sans IA, donc sans quota) :
 * chapitre → sections → points clés.
 */
import type { BlocFiche, Fiche, NoeudArbre } from './types';

export interface NoeudCarte {
  id: string;
  label: string;
  enfants: NoeudCarte[];
}

const MAX_PAR_SECTION = 7;
const LONGUEUR = 64;

function court(texte: string): string {
  const net = texte.replace(/\s+/g, ' ').trim().replace(/^[-•]\s*/, '');
  const premiere = net.split(/(?<=[.!?])\s/)[0] ?? net;
  return premiere.length > LONGUEUR ? `${premiere.slice(0, LONGUEUR - 1)}…` : premiere;
}

function pointsDuBloc(bloc: BlocFiche): string[] {
  switch (bloc.type) {
    case 'texte':
      return [court(bloc.contenu)];
    case 'liste':
    case 'cles':
    case 'pieges':
      return bloc.elements.map(court);
    case 'etapes':
      return bloc.etapes.map((e) => court(e.titre));
    case 'schema':
      return bloc.noeuds.map((n) => court(n.label));
    case 'mnemo':
      return [`Mnémo : ${court(bloc.phrase)}`];
    case 'arbre': {
      const racine = (n: NoeudArbre): string => n.label;
      return [court(racine(bloc.racine)), ...(bloc.racine.branches ?? []).map((b) => court(b.noeud.label))];
    }
    case 'scene3d':
      return [`3D : ${court(bloc.scene.titre)}`];
  }
}

export function carteMentale(fiche: Fiche): NoeudCarte {
  return {
    id: fiche.id,
    label: fiche.titre,
    enfants: fiche.sections.map((s) => {
      const points = s.blocs.flatMap(pointsDuBloc).filter(Boolean);
      const gardes = points.slice(0, MAX_PAR_SECTION);
      const reste = points.length - gardes.length;
      return {
        id: s.id,
        label: s.titre,
        enfants: [
          ...gardes.map((label, i) => ({ id: `${s.id}:${i}`, label, enfants: [] })),
          ...(reste > 0 ? [{ id: `${s.id}:plus`, label: `+ ${reste} autre${reste > 1 ? 's' : ''}`, enfants: [] }] : []),
        ],
      };
    }),
  };
}
