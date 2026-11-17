/**
 * Matière d'un fichier d'après son dossier dans le Drive.
 *
 * Les Drives de la promo sont rangés « SEMESTRE n / MATIÈRE / fichiers ».
 * Le nom du dossier fait foi : c'est fiable et ça ne coûte aucune requête
 * d'IA. Les fichiers sans dossier de matière sont laissés à l'IA.
 */
export interface MatiereDossier {
  nom: string;
  /** Numéro de semestre (1 ou 2…) quand le chemin en indique un. */
  semestre?: number;
}

const SEMESTRE = /^(?:semestre|sem\.?|s)\s*0?(\d{1,2})$/i;
/** Dossiers « vrac » qui ne sont pas des matières : l'IA décide pour leurs fichiers. */
const NON_MATIERE = /corriger|divers|vrac|archive|brouillon|nouveau dossier|a trier|à trier|^autres?$/i;

/** « INFECTIO » → « Infectio » ; les sigles courts (LCA, BMCT) restent en majuscules. */
export function nomMatiereLisible(brut: string): string {
  const net = brut.replace(/\s+/g, ' ').trim();
  if (!net) return net;
  if (net !== net.toUpperCase() || net.length <= 4) return net;
  return net.charAt(0) + net.slice(1).toLowerCase();
}

/**
 * @param exigerSemestre fichiers envoyés depuis l'appli : le chemin commence par le
 *   nom du dossier choisi (pas forcément une matière), on ne se fie alors qu'à
 *   un dossier « SEMESTRE n » suivi de la matière.
 */
export function matiereDepuisChemin(chemin: string | undefined, exigerSemestre = false): MatiereDossier | undefined {
  if (!chemin) return undefined;
  const segments = chemin.split('/').filter(Boolean);
  segments.pop(); // le nom du fichier
  const indice = segments.findIndex((s) => SEMESTRE.test(s.trim()));
  let semestre: number | undefined;
  let dossier: string | undefined;
  if (indice >= 0) {
    semestre = Number(SEMESTRE.exec(segments[indice]!.trim())![1]);
    dossier = segments[indice + 1]?.trim();
  } else if (!exigerSemestre) {
    dossier = segments[0]?.trim();
  }
  if (!dossier || SEMESTRE.test(dossier) || NON_MATIERE.test(dossier)) return undefined;
  return { nom: nomMatiereLisible(dossier), ...(semestre ? { semestre } : {}) };
}
