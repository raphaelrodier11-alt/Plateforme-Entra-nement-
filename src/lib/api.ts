/**
 * Accès à l'API et gestion du lien secret.
 *
 * La clé d'accès est créée sur l'appareil à la première ouverture, puis
 * gardée dans le stockage local du navigateur. Elle voyage dans le fragment
 * du lien (#k=…), qui n'est jamais envoyé aux serveurs ni journalisé.
 */
const CLE_STOCKAGE = 'dr-rodier:cle';

export function lireCle(): string | undefined {
  try {
    return localStorage.getItem(CLE_STOCKAGE) ?? undefined;
  } catch {
    return undefined;
  }
}

export function enregistrerCle(cle: string): void {
  localStorage.setItem(CLE_STOCKAGE, cle);
}

export function oublierCle(): void {
  localStorage.removeItem(CLE_STOCKAGE);
}

/** Clé aléatoire de 256 bits, encodée pour tenir dans une adresse. */
export function creerCle(): string {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Extrait la clé d'un lien secret complet ou d'une clé collée seule. */
export function cleDepuisTexte(texte: string): string | undefined {
  const t = texte.trim();
  const dansLien = /[#&]k=([A-Za-z0-9_-]{32,})/.exec(t);
  if (dansLien) return dansLien[1];
  return /^[A-Za-z0-9_-]{32,}$/.test(t) ? t : undefined;
}

export function lienSecret(cle: string): string {
  return `${location.origin}/#k=${cle}`;
}

/** Récupère la clé présente dans l'adresse, puis nettoie l'adresse. */
export function capterCleDansAdresse(): void {
  const cle = cleDepuisTexte(location.hash);
  if (!cle) return;
  enregistrerCle(cle);
  history.replaceState(null, '', location.pathname + location.search);
}

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

/** Appel authentifié à l'API. Lève `ErreurApi` si la réponse n'est pas un succès. */
export async function api(chemin: string, init: RequestInit = {}): Promise<Response> {
  const cle = lireCle();
  const reponse = await fetch(`/api${chemin}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cle ? { Authorization: `Bearer ${cle}` } : {}),
      ...init.headers,
    },
  });
  if (!reponse.ok) throw new ErreurApi(reponse.status, `Erreur ${reponse.status} sur ${chemin}`);
  return reponse;
}

export type EtatServeur =
  /** Le serveur répond et attend une clé. */
  | { type: 'configure' }
  /** Première ouverture : aucune clé n'a encore été créée. */
  | { type: 'a_configurer' }
  /** Pas de réseau, ou serveur injoignable. */
  | { type: 'hors_ligne' }
  /** L'app est servie sans API (développement de l'interface seule). */
  | { type: 'sans_serveur' };

export async function etatServeur(): Promise<EtatServeur> {
  try {
    const reponse = await fetch('/api/etat', { cache: 'no-store' });
    const type = reponse.headers.get('Content-Type') ?? '';
    if (!reponse.ok || !type.includes('application/json')) return { type: 'sans_serveur' };
    const { configure } = (await reponse.json()) as { configure: boolean };
    return { type: configure ? 'configure' : 'a_configurer' };
  } catch {
    return { type: 'hors_ligne' };
  }
}
