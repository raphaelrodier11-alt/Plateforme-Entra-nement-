/**
 * Règles communes au dépôt de fichiers : formats acceptés, tailles.
 */

/** Taille d'un morceau envoyé au serveur, en octets (la base limite une ligne à 2 Mo). */
export const TAILLE_MORCEAU = 600_000;
export const TAILLE_MAX_FICHIER = 50_000_000;
export const MORCEAUX_MAX = Math.ceil(TAILLE_MAX_FICHIER / TAILLE_MORCEAU) + 1;

const TYPES_PAR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Valeur de l'attribut `accept` d'un champ de choix de fichiers. */
export const EXTENSIONS_ACCEPTEES = Object.keys(TYPES_PAR_EXTENSION)
  .map((e) => `.${e}`)
  .join(',');

/**
 * Type d'un fichier d'après son extension (les navigateurs mobiles ne
 * renseignent pas toujours le type), sinon d'après le type déclaré s'il est
 * connu. `undefined` si le format n'est pas pris en charge.
 */
export function mimeDepuisNom(nom: string, declare?: string): string | undefined {
  const extension = /\.([A-Za-z0-9]+)$/.exec(nom.trim())?.[1]?.toLowerCase();
  const parExtension = extension ? TYPES_PAR_EXTENSION[extension] : undefined;
  if (parExtension) return parExtension;
  return declare && Object.values(TYPES_PAR_EXTENSION).includes(declare) ? declare : undefined;
}
