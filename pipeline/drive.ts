/**
 * Lecture de Google Drive (API v3), strictement en lecture seule : seuls des
 * appels GET sont émis, avec un jeton limité à la permission
 * `drive.readonly`. Aucun fichier du drive ne peut être modifié.
 */
export interface FichierDrive {
  id: string;
  nom: string;
  /** Chemin lisible depuis le dossier racine. */
  chemin: string;
  mimeType: string;
  modifieLe: string;
  empreinte?: string;
  taille?: number;
  lien?: string;
}

export interface Drive {
  /** Tous les fichiers du dossier et de ses sous-dossiers. */
  lister(dossierId: string): Promise<FichierDrive[]>;
  /** Contenu du fichier ; les documents Google natifs sont exportés en PDF. */
  telecharger(fichier: FichierDrive): Promise<{ octets: Uint8Array; mimeType: string }>;
}

const API = 'https://www.googleapis.com/drive/v3';
const DOSSIER = 'application/vnd.google-apps.folder';
const RACCOURCI = 'application/vnd.google-apps.shortcut';
const NATIF = 'application/vnd.google-apps.';
const PROFONDEUR_MAX = 12;

/** Extrait l'identifiant d'un dossier depuis son lien de partage (ou un identifiant brut). */
export function idDossier(lienOuId: string | undefined): string | undefined {
  const texte = (lienOuId ?? '').trim();
  if (!texte) return undefined;
  const trouve = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(texte) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(texte);
  if (trouve) return trouve[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(texte) ? texte : undefined;
}

interface ElementDrive {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
  webViewLink?: string;
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

export function driveGoogle(obtenirJeton: () => Promise<string>): Drive {
  const lire = async (url: string): Promise<Response> => {
    for (let essai = 0; ; essai++) {
      const reponse = await fetch(url, { headers: { Authorization: `Bearer ${await obtenirJeton()}` } });
      if (reponse.ok) return reponse;
      if (essai >= 3 || (reponse.status < 500 && reponse.status !== 429 && reponse.status !== 403)) {
        throw Object.assign(new Error(`Drive : ${reponse.status}`), { status: reponse.status });
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** essai));
    }
  };

  const contenu = async (dossierId: string): Promise<ElementDrive[]> => {
    const elements: ElementDrive[] = [];
    let page: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${dossierId}' in parents and trashed = false`,
        fields:
          'nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, webViewLink, shortcutDetails)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(page ? { pageToken: page } : {}),
      });
      const reponse = (await (await lire(`${API}/files?${params}`)).json()) as {
        files: ElementDrive[];
        nextPageToken?: string;
      };
      elements.push(...reponse.files);
      page = reponse.nextPageToken;
    } while (page);
    return elements;
  };

  const parcourir = async (
    dossierId: string,
    chemin: string,
    profondeur: number,
    vus: Set<string>,
  ): Promise<FichierDrive[]> => {
    if (profondeur > PROFONDEUR_MAX || vus.has(dossierId)) return [];
    vus.add(dossierId);
    const fichiers: FichierDrive[] = [];
    for (const element of await contenu(dossierId)) {
      // Un raccourci est suivi jusqu'à sa cible.
      const id = element.shortcutDetails?.targetId ?? element.id;
      const mimeType =
        element.mimeType === RACCOURCI
          ? (element.shortcutDetails?.targetMimeType ?? element.mimeType)
          : element.mimeType;
      const cheminElement = chemin ? `${chemin}/${element.name}` : element.name;
      if (mimeType === DOSSIER) {
        fichiers.push(...(await parcourir(id, cheminElement, profondeur + 1, vus)));
      } else {
        fichiers.push({
          id,
          nom: element.name,
          chemin: cheminElement,
          mimeType,
          modifieLe: element.modifiedTime,
          empreinte: element.md5Checksum,
          taille: element.size ? Number(element.size) : undefined,
          lien: element.webViewLink,
        });
      }
    }
    return fichiers;
  };

  return {
    lister: (dossierId) => parcourir(dossierId, '', 0, new Set()),
    async telecharger(fichier) {
      const natif = fichier.mimeType.startsWith(NATIF);
      const url = natif
        ? `${API}/files/${fichier.id}/export?mimeType=application/pdf`
        : `${API}/files/${fichier.id}?alt=media&supportsAllDrives=true`;
      const reponse = await lire(url);
      return {
        octets: new Uint8Array(await reponse.arrayBuffer()),
        mimeType: natif ? 'application/pdf' : fichier.mimeType,
      };
    },
  };
}
