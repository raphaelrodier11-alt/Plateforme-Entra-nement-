/**
 * Envoi de fichiers vers le serveur, en morceaux.
 *
 * Chaque morceau est converti en base64 ici, dans le navigateur : le
 * serveur le range tel quel. Un envoi interrompu se reprend en renvoyant le
 * fichier (les morceaux déjà reçus sont simplement remplacés).
 */
import {
  TAILLE_MAX_FICHIER,
  TAILLE_MORCEAU,
  mimeDepuisNom,
} from '../../shared/depot';
import type { Depot, RoleDepot } from '../../shared/types';
import { ErreurApi, api } from './api';

export type MotifRefus = 'format' | 'taille';

export function verifierFichier(fichier: File): MotifRefus | undefined {
  if (!mimeDepuisNom(fichier.name, fichier.type)) return 'format';
  if (fichier.size > TAILLE_MAX_FICHIER) return 'taille';
  if (fichier.size === 0) return 'format';
  return undefined;
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
  fichier: File,
  role: RoleDepot,
  progression: (part: number) => void,
): Promise<Depot> {
  const morceaux = Math.ceil(fichier.size / TAILLE_MORCEAU);
  const { id, v } = (await (
    await avecEssais(() =>
      api('/depot/commencer', {
        method: 'POST',
        body: JSON.stringify({ nom: fichier.name, role, taille: fichier.size }),
      }),
    )
  ).json()) as { id: string; v: number };

  for (let n = 0; n < morceaux; n++) {
    const octets = new Uint8Array(
      await fichier.slice(n * TAILLE_MORCEAU, (n + 1) * TAILLE_MORCEAU).arrayBuffer(),
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
      body: JSON.stringify({
        nom: fichier.name,
        role,
        mimeType: fichier.type,
        taille: fichier.size,
        morceaux,
      }),
    }),
  );
  progression(1);
  return (await reponse.json()) as Depot;
}

export async function retirerFichier(id: string): Promise<void> {
  await api(`/depot/${id}`, { method: 'DELETE' });
}
