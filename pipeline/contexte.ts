/**
 * Contexte partagé par les étapes du pipeline et petits outils communs.
 */
import type { NotificationApp, TexteFichier } from '../shared/types';
import type { Drive } from './drive';
import type { Lecture } from './extraction';
import type { Ia } from './ia';
import { assemblerTexte, type Memoire } from './stockage';

export interface Contexte {
  memoire: Memoire;
  drive: Drive;
  /** Présente seulement quand la génération est approuvée et la clé disponible. */
  ia?: Ia;
  maintenant: number;
  /** Lecture locale d'un fichier téléchargé (remplaçable dans les tests). */
  lire: (octets: Uint8Array, mimeType: string) => Promise<Lecture | undefined>;
  /** Instant au-delà duquel on s'arrête proprement ; le travail reprend au passage suivant. */
  echeance: number;
}

/** Nombre maximal d'échecs avant de laisser un fichier de côté. */
export const ECHECS_MAX = 3;

export function tempsEcoule(c: Contexte): boolean {
  return Date.now() > c.echeance;
}

export function iaRequise(c: Contexte): Ia {
  if (!c.ia) throw new Error("L'IA n'est pas disponible pour cette étape");
  return c.ia;
}

/** Texte complet d'un fichier, s'il a déjà été lu. */
export function texteDe(c: Contexte, fichierId: string): TexteFichier | undefined {
  return assemblerTexte(c.memoire.liste<TexteFichier>('textes'), fichierId);
}

/** Texte d'un fichier avec des marqueurs de page, pour que l'IA puisse citer ses sources. */
export function avecPages(texte: TexteFichier): string {
  return texte.pages
    .filter((p) => p.texte)
    .map((p) => `--- Page ${p.n} ---\n${p.texte}`)
    .join('\n\n');
}

/** Crée une notification, sans doublon (l'identifiant décrit l'événement). */
export async function notifier(c: Contexte, notification: Omit<NotificationApp, 'date'>): Promise<void> {
  if (c.memoire.lire('notifications', notification.id)) return;
  await c.memoire.ecrire<NotificationApp>('notifications', { ...notification, date: c.maintenant });
}

/** Découpe une liste en lots de taille fixe. */
export function enLots<T>(elements: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

/**
 * Erreur qui arrête le passage en cours sans le rendre « en erreur » : le
 * plafond de dépense ou la limite du palier gratuit est atteint, le travail
 * reprendra au passage suivant.
 */
export function estArret(erreur: unknown): boolean {
  const nom = (erreur as Error | undefined)?.name;
  return nom === 'PlafondAtteint' || nom === 'QuotaAtteint';
}

/** Chapitres traités en même temps : ils sont indépendants, et chaque modèle gratuit a sa propre cadence. */
export const CHAPITRES_EN_PARALLELE = 3;

/**
 * Exécute `f` sur chaque élément, `n` à la fois. À la première erreur, on cesse d'en
 * lancer de nouveaux, on laisse finir ceux en cours, puis on relance l'erreur.
 */
export async function enParallele<T>(elements: T[], n: number, f: (element: T) => Promise<void>): Promise<void> {
  let suivant = 0;
  let erreur: unknown;
  let echec = false;
  const travailleur = async (): Promise<void> => {
    while (suivant < elements.length && !echec) {
      const element = elements[suivant++]!;
      try {
        await f(element);
      } catch (e) {
        if (!echec) {
          echec = true;
          erreur = e;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, travailleur));
  if (echec) throw erreur;
}
