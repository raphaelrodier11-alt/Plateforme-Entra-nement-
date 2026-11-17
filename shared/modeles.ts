/**
 * Choix des modèles Gemini dans la liste publiée par l'API : les versions
 * stables les plus récentes (les préversions ne servent qu'à défaut).
 * Partagé entre le pipeline et le serveur (assistant).
 */
type Famille = 'flash' | 'pro' | 'flash-lite';

const MOTIF: Record<Famille, RegExp> = {
  flash: /^gemini-(\d+(?:\.\d+)?)-flash(-preview)?(?:-[\d-]+)?$/,
  'flash-lite': /^gemini-(\d+(?:\.\d+)?)-flash-lite(-preview)?(?:-[\d-]+)?$/,
  pro: /^gemini-(\d+(?:\.\d+)?)-pro(-preview)?(?:-[\d-]+)?$/,
};

/** Tous les modèles d'une famille, du préféré au moins bon (stable, récent, alias court). */
export function modelesDeLaFamille(noms: string[], famille: Famille): string[] {
  return noms
    .map((nom) => nom.replace(/^models\//, ''))
    .map((nom) => ({ nom, m: MOTIF[famille].exec(nom) }))
    .filter((c): c is { nom: string; m: RegExpExecArray } => !!c.m)
    .map((c) => ({ nom: c.nom, version: Number(c.m[1]), stable: !c.m[2], date: /-\d{2}-\d{2,4}$/.test(c.nom) }))
    .sort(
      (a, b) =>
        Number(b.stable) - Number(a.stable) ||
        b.version - a.version ||
        Number(a.date) - Number(b.date) ||
        a.nom.length - b.nom.length,
    )
    .map((c) => c.nom);
}

export function choisirModele(noms: string[], famille: 'flash' | 'pro'): string | undefined {
  return modelesDeLaFamille(noms, famille)[0];
}

/**
 * Modèles gratuits à essayer dans l'ordre : chacun a son propre quota par jour,
 * donc quand l'un est épuisé on passe au suivant.
 */
export function modelesGratuits(noms: string[]): string[] {
  const flash = modelesDeLaFamille(noms, 'flash');
  const lite = modelesDeLaFamille(noms, 'flash-lite');
  // Le meilleur Flash, puis le meilleur « lite », puis le Flash précédent.
  return [...new Set([flash[0], lite[0], flash[1], lite[1]].filter((n): n is string => !!n))];
}
