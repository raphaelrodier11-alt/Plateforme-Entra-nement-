/**
 * Connexion à Google Drive en lecture seule (OAuth).
 *
 * L'utilisateur autorise l'accès depuis l'app ; le serveur conserve le jeton
 * de rafraîchissement, chiffré (AES-GCM) avec une clé dérivée de la clé du
 * pipeline. Le pipeline demande ensuite un jeton d'accès de courte durée.
 * La seule permission demandée est `drive.readonly` : rien ne peut être
 * modifié dans le drive.
 */
import type { Env } from './env';
import { ecrireMeta, lireMeta, supprimerMeta } from './schema';

const PORTEE = 'https://www.googleapis.com/auth/drive.readonly';
const META_JETON = 'drive_jeton';
const META_ETAT = 'drive_etat';
const VALIDITE_ETAT_MS = 10 * 60_000;

function base64(octets: Uint8Array): string {
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

function depuisBase64(texte: string): Uint8Array {
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

async function cleChiffrement(env: Env): Promise<CryptoKey> {
  const secret = `dr-rodier:drive:${env.PIPELINE_KEY ?? ''}`;
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', empreinte, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function chiffrer(env: Env, texte: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cleChiffrement(env),
    new TextEncoder().encode(texte),
  );
  return `${base64(iv)}.${base64(new Uint8Array(chiffre))}`;
}

export async function dechiffrer(env: Env, valeur: string): Promise<string> {
  const [iv, chiffre] = valeur.split('.');
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: depuisBase64(iv ?? '') },
    await cleChiffrement(env),
    depuisBase64(chiffre ?? ''),
  );
  return new TextDecoder().decode(clair);
}

export function driveConfigurable(env: Env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.PIPELINE_KEY);
}

export async function driveConnecte(env: Env): Promise<boolean> {
  return !!(await lireMeta(env.DB, META_JETON));
}

export function urlRetour(origine: string): string {
  return `${origine}/api/drive/retour`;
}

/** Adresse de la page d'autorisation Google. */
export async function urlAutorisation(env: Env, origine: string): Promise<string> {
  const etat = base64(crypto.getRandomValues(new Uint8Array(24))).replace(/[^a-zA-Z0-9]/g, '');
  await ecrireMeta(env.DB, META_ETAT, JSON.stringify({ etat, expire: Date.now() + VALIDITE_ETAT_MS }));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: urlRetour(origine),
    response_type: 'code',
    scope: PORTEE,
    access_type: 'offline',
    prompt: 'consent',
    state: etat,
  }).toString();
  return url.toString();
}

/** Termine l'autorisation : échange le code contre un jeton de rafraîchissement. */
export async function terminerAutorisation(
  env: Env,
  origine: string,
  code: string,
  etat: string,
): Promise<boolean> {
  const attendu = await lireMeta(env.DB, META_ETAT);
  await supprimerMeta(env.DB, META_ETAT);
  if (!attendu) return false;
  const { etat: valeur, expire } = JSON.parse(attendu) as { etat: string; expire: number };
  if (valeur !== etat || Date.now() > expire) return false;

  const reponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: urlRetour(origine),
      grant_type: 'authorization_code',
    }),
  });
  if (!reponse.ok) return false;
  const jetons = (await reponse.json()) as { refresh_token?: string };
  if (!jetons.refresh_token) return false;
  await ecrireMeta(env.DB, META_JETON, await chiffrer(env, jetons.refresh_token));
  return true;
}

/** Jeton d'accès de courte durée pour le pipeline. */
export async function jetonAcces(
  env: Env,
): Promise<{ access_token: string; expires_in: number } | undefined> {
  const stocke = await lireMeta(env.DB, META_JETON);
  if (!stocke) return undefined;
  const reponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: await dechiffrer(env, stocke),
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!reponse.ok) {
    // Jeton expiré ou révoqué (en mode « Test », Google l'invalide après 7 jours) :
    // on l'oublie pour que les Réglages proposent de se reconnecter.
    const erreur = (await reponse.json().catch(() => ({}))) as { error?: string };
    if (erreur.error === 'invalid_grant') await supprimerMeta(env.DB, META_JETON);
    return undefined;
  }
  return (await reponse.json()) as { access_token: string; expires_in: number };
}

export async function deconnecterDrive(env: Env): Promise<void> {
  const stocke = await lireMeta(env.DB, META_JETON);
  await supprimerMeta(env.DB, META_JETON);
  if (!stocke) return;
  try {
    const jeton = await dechiffrer(env, stocke);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(jeton)}`, {
      method: 'POST',
    });
  } catch {
    // La révocation est un plus : le jeton local est déjà supprimé.
  }
}
