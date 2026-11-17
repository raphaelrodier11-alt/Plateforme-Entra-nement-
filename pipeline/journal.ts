/**
 * Journal du pipeline.
 *
 * Le dépôt est public, donc les journaux GitHub Actions le sont aussi : on
 * n'y écrit jamais de nom de fichier, de texte de cours ni de secret, seulement
 * des compteurs et des étapes.
 */
export function journal(message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

/** Résumé d'une erreur sans contenu sensible (type et code HTTP éventuel). */
export function erreurPublique(erreur: unknown): string {
  if (erreur instanceof Error) {
    const statut = (erreur as { status?: number }).status;
    return statut ? `${erreur.name} (HTTP ${statut})` : erreur.name;
  }
  return 'erreur inconnue';
}

/**
 * Cause probable d'une erreur, pour le diagnostic : le message nettoyé (sans
 * guillemets, chemins ni longues suites qui pourraient contenir un nom de
 * fichier ou un texte de cours), limité à 90 caractères.
 */
export function causeProbable(erreur: unknown): string {
  const base = erreurPublique(erreur);
  if (!(erreur instanceof Error) || !erreur.message) return base;
  const net = erreur.message
    .replace(/["'«»“”].*?["'«»“”]/g, '…')
    .replace(/(?:[A-Za-z]:)?[\/][^\s]+/g, '<chemin>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return net ? `${base} — ${net}` : base;
}

/** Message complet, destiné à l'application (privée), jamais au journal public. */
export function erreurPrivee(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message.slice(0, 400) : String(erreur).slice(0, 400);
}
