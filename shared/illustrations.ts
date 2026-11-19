/**
 * Illustrations : nettoyage des schémas SVG dessinés par l'IA (rien d'exécutable,
 * aucune ressource externe), et règles de choix des images libres de droits.
 */

const BALISES = new Set([
  'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'marker', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc',
]);
const TAILLE_SVG_MAX = 24_000;

/** Valeur d'attribut sûre : pas d'adresse externe, pas de script. */
function valeurSure(valeur: string): boolean {
  const v = valeur.toLowerCase();
  if (/javascript:|data:|expression\(|@import/.test(v)) return false;
  // Seules les références internes (#id) sont admises dans url(…).
  for (const m of v.matchAll(/url\(\s*['"]?([^)'"]*)/g)) if (!m[1]!.startsWith('#')) return false;
  return true;
}

/**
 * Renvoie un SVG nettoyé, ou `undefined` s'il n'est pas utilisable.
 * Liste blanche de balises et d'attributs ; tout le reste est supprimé.
 */
export function assainirSvg(entree: string): string | undefined {
  const brut = entree.trim();
  if (!/^<svg[\s>]/i.test(brut) || brut.length > TAILLE_SVG_MAX) return undefined;
  const sansCommentaires = brut.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  let sortie = '';
  let dernier = 0;
  let profondeur = 0;
  const marqueur = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*)>/g;
  for (const m of sansCommentaires.matchAll(marqueur)) {
    const debut = m.index ?? 0;
    // Le texte entre deux balises est conservé (échappé), sauf à l'intérieur d'une balise interdite.
    sortie += echapper(sansCommentaires.slice(dernier, debut));
    dernier = debut + m[0].length;
    const fermante = m[1] === '/';
    const nom = m[2]!.toLowerCase();
    if (!BALISES.has(nom)) continue;
    if (fermante) {
      sortie += `</${nom === 'lineargradient' ? 'linearGradient' : nom === 'radialgradient' ? 'radialGradient' : nom}>`;
      profondeur--;
      continue;
    }
    const autoFermee = /\/\s*$/.test(m[3]!);
    const attributs: string[] = [];
    for (const a of m[3]!.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const cle = a[1]!;
      const valeur = a[3] ?? a[4] ?? '';
      if (/^on/i.test(cle) || /^(xlink:)?href$/i.test(cle) || /^style$/i.test(cle) && !valeurSure(valeur)) continue;
      if (!/^[a-zA-Z][\w:-]*$/.test(cle) || !valeurSure(valeur)) continue;
      attributs.push(`${cle}="${valeur.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
    }
    if (nom === 'svg' && !attributs.some((a) => a.startsWith('xmlns='))) attributs.push('xmlns="http://www.w3.org/2000/svg"');
    const nomSorti = nom === 'lineargradient' ? 'linearGradient' : nom === 'radialgradient' ? 'radialGradient' : nom;
    sortie += `<${nomSorti}${attributs.length ? ` ${attributs.join(' ')}` : ''}${autoFermee ? '/' : ''}>`;
    if (!autoFermee) profondeur++;
  }
  sortie += echapper(sansCommentaires.slice(dernier));
  if (profondeur !== 0 || !/<svg[\s>]/.test(sortie)) return undefined;
  return sortie;
}

function echapper(texte: string): string {
  return texte.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Licences libres acceptées pour les images venues d'internet. */
export function licenceLibre(licence: string | undefined): boolean {
  const l = (licence ?? '').toLowerCase();
  if (!l || /\bnc\b|non[- ]?commercial|\bnd\b|fair use|all rights/.test(l)) return false;
  return /public domain|domaine public|\bcc0\b|\bcc[- ]by(?:[- ]sa)?\b|\bpd\b|gfdl|\bfal\b/.test(l);
}

/** Retire les balises HTML d'un crédit (les métadonnées de Wikimedia en contiennent). */
export function texteSimple(html: string | undefined, max = 160): string | undefined {
  const t = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}
