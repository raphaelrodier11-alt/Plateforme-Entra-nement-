/** Liaisons et secrets du Worker (voir wrangler.jsonc et le README). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Clé du pipeline GitHub Actions (droits d'écriture sur le contenu). */
  PIPELINE_KEY?: string;
  /** Identifiants OAuth Google pour la lecture seule du drive. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Clé Gemini de l'assistant (projet Google gratuit distinct de celui de l'import). */
  GEMINI_CHAT_KEY?: string;
  /** Facultatif : jeton GitHub pour lancer le pipeline sans attendre. */
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCHE?: string;
}

export type Role = 'app' | 'pipeline';
