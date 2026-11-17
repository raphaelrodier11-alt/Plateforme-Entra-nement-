import { afterEach, describe, expect, it, vi } from 'vitest';
import { driveGoogle } from '../../pipeline/drive';

type Reponse = { status?: number; corps?: unknown; octets?: Uint8Array };
const appels: string[] = [];

function simuler(routes: (url: URL) => Reponse | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url);
      appels.push(url.pathname + url.search);
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton-test');
      expect(init?.method ?? 'GET').toBe('GET');
      const r = routes(url);
      if (!r) return new Response('introuvable', { status: 404 });
      const corps = r.octets ?? JSON.stringify(r.corps ?? {});
      return new Response(corps as ConstructorParameters<typeof Response>[0], { status: r.status ?? 200 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  appels.length = 0;
});

const drive = () => driveGoogle(async () => 'jeton-test');
const dossier = (id: string, name: string) => ({ id, name, mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-01-01T00:00:00Z' });
const fichier = (id: string, name: string, mimeType = 'application/pdf') => ({ id, name, mimeType, modifiedTime: '2026-11-01T10:00:00Z', md5Checksum: `md5-${id}`, size: '1234' });

describe('lecture de Google Drive', () => {
  it('parcourt les sous-dossiers et les pages de résultats, en lecture seule', async () => {
    simuler((url) => {
      const q = url.searchParams.get('q') ?? '';
      if (q.includes("'racine' in parents")) {
        return url.searchParams.get('pageToken')
          ? { corps: { files: [fichier('f2', 'Cours 2.pdf')] } }
          : { corps: { files: [dossier('dA', 'SEMESTRE 1'), fichier('f1', 'Cours 1.pdf')], nextPageToken: 'suite' } };
      }
      if (q.includes("'dA' in parents")) {
        return { corps: { files: [dossier('dB', 'INFECTIO'), fichier('f3', 'Plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')] } };
      }
      if (q.includes("'dB' in parents")) return { corps: { files: [fichier('f4', 'Cours infectio.pdf')] } };
      return undefined;
    });

    const fichiers = await drive().lister('racine');
    expect(fichiers.map((f) => f.chemin).sort()).toEqual([
      'Cours 1.pdf',
      'Cours 2.pdf',
      'SEMESTRE 1/INFECTIO/Cours infectio.pdf',
      'SEMESTRE 1/Plan.docx',
    ]);
    expect(fichiers.find((f) => f.id === 'f4')).toMatchObject({ nom: 'Cours infectio.pdf', empreinte: 'md5-f4', taille: 1234 });
    // Drive partagé de la promo : tous les types de drives, corbeille exclue.
    const premier = new URL(`https://x${appels[0]}`);
    expect(premier.searchParams.get('supportsAllDrives')).toBe('true');
    expect(premier.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(premier.searchParams.get('corpora')).toBe('allDrives');
    expect(premier.searchParams.get('q')).toContain('trashed = false');
  });

  it('suit les raccourcis et ne boucle pas sur un dossier qui se contient lui-même', async () => {
    simuler((url) => {
      const q = url.searchParams.get('q') ?? '';
      if (q.includes("'racine' in parents")) {
        return {
          corps: {
            files: [
              { id: 'raccourci', name: 'Lien vers autre dossier', mimeType: 'application/vnd.google-apps.shortcut', modifiedTime: '2026-01-01T00:00:00Z', shortcutDetails: { targetId: 'dC', targetMimeType: 'application/vnd.google-apps.folder' } },
              { id: 'boucle', name: 'Boucle', mimeType: 'application/vnd.google-apps.shortcut', modifiedTime: '2026-01-01T00:00:00Z', shortcutDetails: { targetId: 'racine', targetMimeType: 'application/vnd.google-apps.folder' } },
            ],
          },
        };
      }
      if (q.includes("'dC' in parents")) return { corps: { files: [fichier('f9', 'Cours cible.pdf')] } };
      return undefined;
    });
    const fichiers = await drive().lister('racine');
    expect(fichiers.map((f) => f.chemin)).toEqual(['Lien vers autre dossier/Cours cible.pdf']);
  });

  it('télécharge un PDF tel quel et exporte un document Google en PDF', async () => {
    simuler((url) => {
      if (url.pathname.endsWith('/files/pdf1') && url.searchParams.get('alt') === 'media') return { octets: new Uint8Array([37, 80, 68, 70]) };
      if (url.pathname.endsWith('/files/doc1/export') && url.searchParams.get('mimeType') === 'application/pdf') return { octets: new Uint8Array([1, 2, 3]) };
      return undefined;
    });
    const d = drive();
    const pdf = await d.telecharger({ id: 'pdf1', nom: 'a.pdf', chemin: 'a.pdf', mimeType: 'application/pdf', modifieLe: 'x' });
    expect(pdf).toMatchObject({ mimeType: 'application/pdf' });
    expect([...pdf.octets]).toEqual([37, 80, 68, 70]);
    const doc = await d.telecharger({ id: 'doc1', nom: 'b', chemin: 'b', mimeType: 'application/vnd.google-apps.document', modifieLe: 'x' });
    expect(doc.mimeType).toBe('application/pdf');
    expect([...doc.octets]).toEqual([1, 2, 3]);
  });

  it('n\'émet que des lectures (GET) et échoue clairement si l\'accès est refusé', async () => {
    simuler(() => ({ status: 401, corps: { error: 'invalide' } }));
    await expect(drive().lister('racine')).rejects.toMatchObject({ status: 401 });
  });
});
