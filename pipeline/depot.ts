/**
 * Source « dépôt » : les fichiers envoyés depuis l'application.
 *
 * Elle se présente comme un drive (même interface), ce qui permet au reste
 * du pipeline de traiter de la même façon un fichier envoyé et un fichier
 * du Google Drive. Elle peut s'utiliser seule ou avec le drive.
 */
import type { Depot } from '../shared/types';
import type { Drive, FichierDrive } from './drive';
import type { Stockage } from './stockage';

/** « Dossiers » virtuels qui désignent les fichiers envoyés. */
export const DOSSIER_DEPOT = { cours: 'depot:cours', annales: 'depot:annales' } as const;

const PREFIXE = 'depot:';

export const idFichierDepot = (idDepot: string): string => `${PREFIXE}${idDepot}`;
export const estFichierDepot = (idFichier: string): boolean => idFichier.startsWith(PREFIXE);

export function driveDepot(
  depots: () => Depot[],
  stockage: Pick<Stockage, 'morceauDepot'>,
): Drive {
  return {
    async lister(dossierId) {
      const role = dossierId === DOSSIER_DEPOT.cours ? 'cours' : 'annales';
      return depots()
        .filter((d) => d.role === role)
        .map(
          (d): FichierDrive => ({
            id: idFichierDepot(d.id),
            nom: d.nom,
            chemin: d.nom,
            mimeType: d.mimeType,
            modifieLe: d.modifieLe,
            taille: d.taille,
            depot: true,
          }),
        );
    },
    async telecharger(fichier) {
      const id = fichier.id.slice(PREFIXE.length);
      const depot = depots().find((d) => d.id === id);
      if (!depot) throw new Error('Fichier envoyé introuvable');
      const morceaux: Buffer[] = [];
      for (let n = 0; n < depot.morceaux; n++) {
        const texte = await stockage.morceauDepot(id, n);
        if (texte === undefined) throw new Error('Morceau de fichier manquant');
        morceaux.push(Buffer.from(texte, 'base64'));
      }
      return { octets: new Uint8Array(Buffer.concat(morceaux)), mimeType: depot.mimeType };
    },
  };
}

/** Réunit le drive (s'il est connecté) et le dépôt en une seule source. */
export function driveComposite(principal: Drive | undefined, depot: Drive): Drive {
  return {
    lister: (dossierId) =>
      dossierId.startsWith(PREFIXE) || !principal ? depot.lister(dossierId) : principal.lister(dossierId),
    telecharger: (fichier) =>
      estFichierDepot(fichier.id) || !principal ? depot.telecharger(fichier) : principal.telecharger(fichier),
  };
}
