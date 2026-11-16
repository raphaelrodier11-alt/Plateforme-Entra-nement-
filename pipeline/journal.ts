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

/** Message complet, destiné à l'application (privée), jamais au journal public. */
export function erreurPrivee(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message.slice(0, 400) : String(erreur).slice(0, 400);
}
