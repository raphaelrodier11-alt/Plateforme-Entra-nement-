/**
 * Tarifs et calcul des coûts d'IA.
 *
 * Les tarifs par défaut sont des ordres de grandeur prudents (fourchette
 * haute relevée en novembre 2026) : ils sont signalés « à vérifier » dans
 * l'estimation et peuvent être remplacés dans les réglages de l'app. La page
 * officielle fait foi : https://ai.google.dev/gemini-api/docs/pricing
 */
import type { TarifModele } from '../shared/types';

export type Niveau = 'masse' | 'expert';
export type Famille = 'flash-lite' | 'flash' | 'pro';

/** Dollars par million de tokens. */
export const TARIFS_DEFAUT: Record<Famille, { entree: number; sortie: number }> = {
  'flash-lite': { entree: 0.3, sortie: 2.5 },
  flash: { entree: 1.5, sortie: 9 },
  pro: { entree: 4, sortie: 20 },
};

export const TAUX_EUR_PAR_USD = 0.92;

export function familleDe(modele: string): Famille {
  if (/flash-lite/.test(modele)) return 'flash-lite';
  if (/flash/.test(modele)) return 'flash';
  return 'pro';
}

/** Tarif appliqué à un modèle : celui des réglages s'il existe, sinon le défaut. */
export function tarifPour(modele: string, niveau: Niveau, imposes: TarifModele[] = []): TarifModele {
  const impose = imposes.find((t) => t.modele === niveau || t.modele === modele);
  if (impose) return { ...impose, modele, aVerifier: false };
  const defaut = TARIFS_DEFAUT[familleDe(modele)];
  return { modele, entreeUsdParM: defaut.entree, sortieUsdParM: defaut.sortie, aVerifier: true };
}

export function cout(tarif: TarifModele, tokensEntree: number, tokensSortie: number): number {
  return (tokensEntree * tarif.entreeUsdParM + tokensSortie * tarif.sortieUsdParM) / 1_000_000;
}

/** Estimation grossière du nombre de tokens d'un texte français. */
export function tokensDuTexte(texte: string): number {
  return Math.ceil(texte.length / 3.4);
}

export interface Usage {
  etape: string;
  modele: string;
  appels: number;
  tokensEntree: number;
  tokensSortie: number;
  coutUsd: number;
}

/** Cumul de la consommation par étape, pour le suivi et le plafond de dépense. */
export class Compteur {
  private readonly lignes = new Map<string, Usage>();

  ajouter(etape: string, tarif: TarifModele, entree: number, sortie: number): number {
    const cle = `${etape}|${tarif.modele}`;
    const ligne =
      this.lignes.get(cle) ??
      { etape, modele: tarif.modele, appels: 0, tokensEntree: 0, tokensSortie: 0, coutUsd: 0 };
    const prix = cout(tarif, entree, sortie);
    ligne.appels += 1;
    ligne.tokensEntree += entree;
    ligne.tokensSortie += sortie;
    ligne.coutUsd += prix;
    this.lignes.set(cle, ligne);
    return prix;
  }

  get total(): number {
    return [...this.lignes.values()].reduce((s, l) => s + l.coutUsd, 0);
  }

  get detail(): Usage[] {
    return [...this.lignes.values()];
  }
}
