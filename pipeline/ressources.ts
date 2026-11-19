/** Fichiers d'un chapitre montrés à l'IA, et figures qu'on peut en extraire. */
import type { Fichier } from '../shared/types';
import type { Contexte } from './contexte';
import { extraireFigures, type FigureSource } from './illustrations';
import type { Piece } from './ia';

const TAILLE_PIECES_MAX = 30_000_000;
const FIGURES_MAX = 16;

export interface RessourcesChapitre {
  pieces: Piece[];
  figures: FigureSource[];
}

const court = (id: string): string => Buffer.from(id).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(-8);

export async function ressourcesDuChapitre(c: Contexte, fichiers: Fichier[], avecFigures = true): Promise<RessourcesChapitre> {
  const pieces: Piece[] = [];
  const figures: FigureSource[] = [];
  let taille = 0;
  for (const f of fichiers.slice(0, 4)) {
    try {
      const { octets, mimeType } = await c.drive.telecharger({ ...f });
      const piece = (await c.lire(octets, mimeType))?.piece;
      if (!piece || taille + piece.octets.byteLength > TAILLE_PIECES_MAX) continue;
      taille += piece.octets.byteLength;
      pieces.push(piece);
      if (avecFigures && piece.mimeType === 'application/pdf') {
        for (const fig of await extraireFigures(piece.octets, court(f.id))) figures.push({ ...fig, fichier: f.nom });
      }
    } catch {
      // Sans le fichier, on se contente du texte.
    }
  }
  const gardees = figures
    .sort((a, b) => b.media.largeur * b.media.hauteur - a.media.largeur * a.media.hauteur)
    .slice(0, FIGURES_MAX)
    .sort((a, b) => a.fichier.localeCompare(b.fichier) || a.page - b.page);
  return { pieces, figures: gardees };
}
