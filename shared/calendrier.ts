/**
 * Calendrier : reconnaissance des examens par mot-clé dans le titre des
 * événements. La synchronisation est à sens unique (calendrier → Dr Rodier)
 * et chaque examen détecté doit être validé avant d'être ajouté.
 */
import { cleJour } from './dates';
import type { Evenement, Examen, Matiere, Reglages } from './types';

function simplifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Vrai si le titre contient l'un des mots-clés (sans casse ni accents). */
export function titreEvoqueExamen(titre: string, motsCles: string[]): boolean {
  const t = simplifier(titre);
  return motsCles.some((mot) => {
    const m = simplifier(mot).trim();
    return m.length > 0 && t.includes(m);
  });
}

/** Devine la matière d'un examen à partir des mots de son titre. */
export function devinerMatiere(
  titre: string,
  matieres: Pick<Matiere, 'id' | 'nom'>[],
): string | undefined {
  const t = simplifier(titre);
  let meilleure: { id: string; score: number } | undefined;
  for (const m of matieres) {
    const mots = simplifier(m.nom)
      .split(/[^a-z0-9]+/)
      .filter((mot) => mot.length >= 4);
    // On compare sur le radical pour rapprocher « cardio » et « cardiologie ».
    const score = mots.filter((mot) => t.includes(mot.slice(0, 6))).length;
    if (score > 0 && (!meilleure || score > meilleure.score)) meilleure = { id: m.id, score };
  }
  return meilleure?.id;
}

/**
 * Événements à venir qui ressemblent à un examen et n'ont été ni ajoutés ni
 * écartés par l'utilisateur.
 */
export function examensAValider(
  evenements: Evenement[],
  examens: Pick<Examen, 'evenementId'>[],
  reglages: Pick<Reglages, 'motsClesExamen' | 'evenementsIgnores'>,
  maintenant: number,
): Evenement[] {
  const dejaTraites = new Set<string>([
    ...examens.map((x) => x.evenementId).filter((id): id is string => !!id),
    ...reglages.evenementsIgnores,
  ]);
  return evenements.filter(
    (ev) =>
      ev.fin >= maintenant &&
      !dejaTraites.has(ev.id) &&
      titreEvoqueExamen(ev.titre, reglages.motsClesExamen),
  );
}

/** Jour (AAAA-MM-JJ) d'un événement, en heure locale. */
export function jourEvenement(ev: Pick<Evenement, 'debut'>): string {
  return cleJour(ev.debut);
}
