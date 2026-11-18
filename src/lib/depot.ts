/**
 * Envoi de fichiers vers le serveur, en morceaux, un par un ou en masse.
 *
 * Chaque morceau est converti en base64 ici, dans le navigateur : le serveur
 * le range tel quel. On peut envoyer des fichiers isolés, un dossier entier
 * ou un ZIP (déplié ici, entrée par entrée, sans tout charger en mémoire).
 * Un envoi interrompu se reprend en choisissant à nouveau les mêmes fichiers :
 * ceux qui sont déjà complets sont reconnus et sautés.
 */
import {
  TAILLE_MAX_FICHIER,
  TAILLE_MORCEAU,
  estFichierParasite,
  estZip,
  mimeDepuisNom,
  nettoyerChemin,
} from '../../shared/depot';
import type { Depot, RoleDepot } from '../../shared/types';
import { ErreurApi, api } from './api';

/** Un fichier prêt à être envoyé (son contenu n'est lu qu'au moment de l'envoi). */
export interface Candidat {
  cle: string;
  nom: string;
  chemin: string;
  taille: number;
  lire: () => Promise<Blob>;
}

export interface Preparation {
  candidats: Candidat[];
  /** Fichiers écartés, avec la raison. */
  refus: string[];
  /** Entrées de ZIP ou de dossiers ignorées sans bruit (fichiers cachés, formats sans intérêt). */
  ignores: number;
  /** À appeler quand tous les envois sont terminés (referme les ZIP ouverts). */
  fermer: () => Promise<void>;
}

const ENTREES_ZIP_MAX = 20_000;

function nomDuChemin(chemin: string): string {
  return chemin.split('/').at(-1) ?? chemin;
}

function formatPrisEnCharge(nom: string, declare?: string): boolean {
  return !!mimeDepuisNom(nom, declare);
}

/** Prépare les fichiers choisis : fichiers isolés, contenu d'un dossier, entrées de ZIP. */
export async function preparer(fichiers: File[]): Promise<Preparation> {
  const candidats: Candidat[] = [];
  const refus: string[] = [];
  let ignores = 0;
  const fermetures: (() => Promise<void>)[] = [];
  let compteur = 0;
  const cle = (chemin: string) => `${Date.now()}-${compteur++}-${chemin}`;

  for (const fichier of fichiers) {
    if (estZip(fichier.name)) {
      try {
        const { BlobReader, BlobWriter, ZipReader, configure } = await import('@zip.js/zip.js');
        configure({ useWebWorkers: false });
        const lecteur = new ZipReader(new BlobReader(fichier));
        fermetures.push(() => lecteur.close());
        const entrees = await lecteur.getEntries();
        if (entrees.length > ENTREES_ZIP_MAX) {
          refus.push(`${fichier.name} : ZIP trop volumineux (plus de ${ENTREES_ZIP_MAX} fichiers).`);
          continue;
        }
        for (const entree of entrees) {
          if (entree.directory) continue;
          const chemin = nettoyerChemin(entree.filename);
          if (!chemin || estFichierParasite(chemin) || !formatPrisEnCharge(nomDuChemin(chemin))) {
            ignores += 1;
            continue;
          }
          if (entree.encrypted) {
            refus.push(`${chemin} : fichier protégé par mot de passe.`);
            continue;
          }
          if (entree.uncompressedSize > TAILLE_MAX_FICHIER) {
            refus.push(`${chemin} : fichier trop gros (${TAILLE_MAX_FICHIER / 1_000_000} Mo au maximum).`);
            continue;
          }
          if (entree.uncompressedSize === 0) {
            ignores += 1;
            continue;
          }
          const type = mimeDepuisNom(nomDuChemin(chemin)) ?? 'application/octet-stream';
          candidats.push({
            cle: cle(chemin),
            nom: nomDuChemin(chemin).slice(0, 200),
            // Les dossiers du ZIP sont conservés : ils aident à classer les cours.
            chemin,
            taille: entree.uncompressedSize,
            lire: () => entree.getData!(new BlobWriter(type)),
          });
        }
      } catch {
        refus.push(`${fichier.name} : ZIP illisible ou endommagé.`);
      }
      continue;
    }

    // Fichier isolé, ou fichier d'un dossier (le chemin relatif est alors renseigné).
    const relatif = (fichier as File & { webkitRelativePath?: string }).webkitRelativePath;
    const chemin = nettoyerChemin(relatif || fichier.name);
    if (estFichierParasite(chemin)) {
      ignores += 1;
      continue;
    }
    if (!formatPrisEnCharge(fichier.name, fichier.type) || fichier.size === 0) {
      if (relatif) ignores += 1;
      else refus.push(`${fichier.name} : format non pris en charge (PDF, Word, PowerPoint, texte, image ou ZIP).`);
      continue;
    }
    if (fichier.size > TAILLE_MAX_FICHIER) {
      refus.push(`${fichier.name} : fichier trop gros (${TAILLE_MAX_FICHIER / 1_000_000} Mo au maximum).`);
      continue;
    }
    candidats.push({
      cle: cle(chemin),
      nom: fichier.name.slice(0, 200),
      chemin,
      taille: fichier.size,
      lire: async () => fichier,
    });
  }

  return {
    candidats,
    refus,
    ignores,
    fermer: async () => {
      for (const fermer of fermetures) await fermer().catch(() => undefined);
    },
  };
}

function enBase64(octets: Uint8Array): string {
  let binaire = '';
  const pas = 0x8000;
  for (let i = 0; i < octets.length; i += pas) {
    binaire += String.fromCharCode(...octets.subarray(i, i + pas));
  }
  return btoa(binaire);
}

async function avecEssais<T>(action: () => Promise<T>, essais = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await action();
    } catch (erreur) {
      // Une réponse du serveur qui refuse l'envoi ne s'arrange pas en réessayant.
      const definitif = erreur instanceof ErreurApi && erreur.statut >= 400 && erreur.statut < 500 && erreur.statut !== 429;
      if (definitif || i >= essais) throw erreur;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

/** Envoie un fichier ; `progression` reçoit la part envoyée, de 0 à 1. */
export async function envoyerFichier(
  contenu: Blob,
  nom: string,
  chemin: string,
  role: RoleDepot,
  progression: (part: number) => void,
  /** Complément d'un chapitre : le fichier lui est rattaché directement. */
  chapitreId?: string,
): Promise<Depot> {
  const morceaux = Math.ceil(contenu.size / TAILLE_MORCEAU);
  const { id, v } = (await (
    await avecEssais(() =>
      api('/depot/commencer', {
        method: 'POST',
        body: JSON.stringify({ nom, chemin, role, taille: contenu.size }),
      }),
    )
  ).json()) as { id: string; v: number };

  for (let n = 0; n < morceaux; n++) {
    const octets = new Uint8Array(
      await contenu.slice(n * TAILLE_MORCEAU, (n + 1) * TAILLE_MORCEAU).arrayBuffer(),
    );
    const texte = enBase64(octets);
    await avecEssais(() =>
      api(`/depot/${id}/${v}/${n}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: texte,
      }),
    );
    progression((n + 1) / (morceaux + 1));
  }

  const reponse = await avecEssais(() =>
    api(`/depot/${id}/${v}/terminer`, {
      method: 'POST',
      body: JSON.stringify({ nom, chemin, role, taille: contenu.size, morceaux, ...(chapitreId ? { chapitreId } : {}) }),
    }),
  );
  progression(1);
  return (await reponse.json()) as Depot;
}

export async function retirerFichier(id: string): Promise<void> {
  await api(`/depot/${id}`, { method: 'DELETE' });
}

export type StatutEnvoi = 'attente' | 'en_cours' | 'fait' | 'deja' | 'echec';

export interface EtatEnvoi {
  cle: string;
  nom: string;
  chemin: string;
  part: number;
  statut: StatutEnvoi;
}

/** Clé d'identité d'un fichier déjà envoyé : même rôle, même chemin. */
export const cleDepot = (role: RoleDepot, chemin: string): string => `${role}|${chemin}`;

/**
 * Envoie une liste de fichiers, plusieurs à la fois. Un fichier déjà présent
 * avec la même taille n'est pas renvoyé.
 */
export async function envoyerLot(
  candidats: Candidat[],
  role: RoleDepot,
  existants: Map<string, number>,
  surChangement: (cle: string, partiel: Partial<EtatEnvoi>) => void,
  simultanes = 3,
): Promise<void> {
  let suivant = 0;
  const travailleur = async () => {
    for (;;) {
      const candidat = candidats[suivant++];
      if (!candidat) return;
      if (existants.get(cleDepot(role, candidat.chemin)) === candidat.taille) {
        surChangement(candidat.cle, { statut: 'deja', part: 1 });
        continue;
      }
      surChangement(candidat.cle, { statut: 'en_cours', part: 0 });
      try {
        const contenu = await candidat.lire();
        await envoyerFichier(contenu, candidat.nom, candidat.chemin, role, (part) =>
          surChangement(candidat.cle, { part }),
        );
        surChangement(candidat.cle, { statut: 'fait', part: 1 });
      } catch {
        surChangement(candidat.cle, { statut: 'echec' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(simultanes, candidats.length) }, travailleur));
}
