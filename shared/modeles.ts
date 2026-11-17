/**
 * Choix d'un modèle Gemini dans la liste publiée par l'API : la version stable
 * la plus récente de la famille voulue (les préversions ne servent qu'à défaut).
 * Partagé entre le pipeline et le serveur (assistant).
 */
export function choisirModele(noms: string[], famille: 'flash' | 'pro'): string | undefined {
  const candidats = noms
    .map((nom) => nom.replace(/^models\//, ''))
    .map((nom) => ({ nom, m: /^gemini-(\d+(?:\.\d+)?)-(flash|pro)(-preview)?(?:-[\d-]+)?$/.exec(nom) }))
    .filter((c): c is { nom: string; m: RegExpExecArray } => !!c.m && c.m[2] === famille)
    .map((c) => ({ nom: c.nom, version: Number(c.m[1]), stable: !c.m[3], date: /-\d{2}-\d{2,4}$/.test(c.nom) }))
    // Stable avant préversion, version la plus haute, alias court avant alias daté.
    .sort(
      (a, b) =>
        Number(b.stable) - Number(a.stable) ||
        b.version - a.version ||
        Number(a.date) - Number(b.date) ||
        a.nom.length - b.nom.length,
    );
  return candidats[0]?.nom;
}
