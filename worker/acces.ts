/**
 * Contrôle d'accès par lien secret.
 *
 * L'app n'a ni compte ni mot de passe : à la première ouverture, l'appareil
 * crée une clé aléatoire de 256 bits et le serveur n'en garde que
 * l'empreinte SHA-256. Chaque requête présente ensuite la clé dans l'en-tête
 * Authorization. Le pipeline GitHub Actions utilise une clé distincte.
 */
import type { Env, Role } from './env';
import { ecrireMeta, lireMeta, supprimerMeta } from './schema';

const META_ACCES = 'acces_hash';

export async function sha256Hex(texte: string): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Comparaison en temps constant de deux chaînes de même nature. */
export function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

export async function accesConfigure(env: Env): Promise<boolean> {
  return !!(await lireMeta(env.DB, META_ACCES));
}

/**
 * Enregistre la clé d'accès. Ne fonctionne qu'une fois : tant qu'une clé
 * existe, il faut la réinitialiser (action réservée au pipeline).
 */
export async function configurerAcces(env: Env, cle: string): Promise<boolean> {
  if (await accesConfigure(env)) return false;
  await ecrireMeta(env.DB, META_ACCES, await sha256Hex(cle));
  return true;
}

export async function reinitialiserAcces(env: Env): Promise<void> {
  await supprimerMeta(env.DB, META_ACCES);
}

/** Rôle associé à la clé présentée, ou `undefined` si elle est inconnue. */
export async function roleDeLaCle(env: Env, cle: string | undefined): Promise<Role | undefined> {
  if (!cle) return undefined;
  const empreinte = await sha256Hex(cle);
  if (env.PIPELINE_KEY && egalConstant(empreinte, await sha256Hex(env.PIPELINE_KEY))) {
    return 'pipeline';
  }
  const attendue = await lireMeta(env.DB, META_ACCES);
  return attendue && egalConstant(empreinte, attendue) ? 'app' : undefined;
}

export function cleDeLaRequete(requete: Request): string | undefined {
  const entete = requete.headers.get('Authorization') ?? '';
  return entete.startsWith('Bearer ') ? entete.slice(7).trim() : undefined;
}
