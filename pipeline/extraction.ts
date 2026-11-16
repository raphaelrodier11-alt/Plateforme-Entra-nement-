/**
 * Extraction du texte des fichiers.
 *
 * Tout est ramené au PDF : les documents Google sont exportés par le drive,
 * les fichiers Word et PowerPoint sont convertis par LibreOffice. Le texte
 * déjà présent dans le PDF est lu directement (gratuit et exact) ; les pages
 * qui n'en contiennent pas (scans, images) sont signalées pour être lues par
 * l'IA.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PageTexte } from '../shared/types';
import { journal } from './journal';

const executer = promisify(execFile);

/** En dessous de ce nombre de caractères, une page est considérée comme un scan. */
export const SEUIL_PAGE_SANS_TEXTE = 40;

const TYPES_BUREAUTIQUE = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
]);

export type Nature = 'pdf' | 'bureautique' | 'image' | 'texte' | 'ignore';

export function natureDe(mimeType: string): Nature {
  if (mimeType === 'application/pdf') return 'pdf';
  // Documents et présentations Google : le drive les exporte en PDF.
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.presentation'
  ) {
    return 'pdf';
  }
  // Formulaires, feuilles de calcul, dessins… ne sont pas des supports de cours.
  if (mimeType.startsWith('application/vnd.google-apps.')) return 'ignore';
  if (TYPES_BUREAUTIQUE.has(mimeType)) return 'bureautique';
  if (/^image\/(png|jpeg|webp|heic|heif)$/.test(mimeType)) return 'image';
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return 'texte';
  return 'ignore';
}

export interface Lecture {
  pages: PageTexte[];
  pagesAOcr: number[];
  /** Fichier à montrer à l'IA (PDF ou image), si le format le permet. */
  piece?: { octets: Uint8Array; mimeType: string };
}

let libreOfficePret: Promise<void> | undefined;

/** Installe LibreOffice à la première conversion (machines GitHub Actions). */
function assurerLibreOffice(): Promise<void> {
  libreOfficePret ??= (async () => {
    try {
      await executer('soffice', ['--version']);
      return;
    } catch {
      journal('Installation de LibreOffice pour convertir les fichiers Word et PowerPoint');
    }
    await executer('sudo', ['apt-get', 'update', '-qq'], { maxBuffer: 1 << 26 });
    await executer(
      'sudo',
      ['apt-get', 'install', '-y', '-qq', '--no-install-recommends', 'libreoffice-writer', 'libreoffice-impress'],
      { maxBuffer: 1 << 26, timeout: 15 * 60_000 },
    );
  })();
  return libreOfficePret;
}

async function convertirEnPdf(octets: Uint8Array): Promise<Uint8Array> {
  await assurerLibreOffice();
  const dossier = await mkdtemp(join(tmpdir(), 'dr-rodier-'));
  try {
    // Nom neutre : le nom réel du fichier n'apparaît nulle part.
    await writeFile(join(dossier, 'source'), octets);
    await executer(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', dossier, join(dossier, 'source')],
      { timeout: 5 * 60_000, maxBuffer: 1 << 26 },
    );
    return new Uint8Array(await readFile(join(dossier, 'source.pdf')));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

function nettoyer(texte: string): string {
  return texte.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function pagesDepuisTextes(textes: string[]): { pages: PageTexte[]; pagesAOcr: number[] } {
  const pages = textes.map((brut, i): PageTexte => {
    const texte = nettoyer(brut);
    return texte.length >= SEUIL_PAGE_SANS_TEXTE
      ? { n: i + 1, texte, source: 'couche' }
      : { n: i + 1, texte: '', source: 'vide' };
  });
  return { pages, pagesAOcr: pages.filter((p) => p.source === 'vide').map((p) => p.n) };
}

async function lirePdf(octets: Uint8Array): Promise<Lecture> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  // unpdf consomme le tampon : on lui en donne une copie.
  const document = await getDocumentProxy(octets.slice());
  const { text } = await extractText(document, { mergePages: false });
  return { ...pagesDepuisTextes(text), piece: { octets, mimeType: 'application/pdf' } };
}

/** Lit un fichier téléchargé et renvoie son texte page par page. */
export async function lireFichier(octets: Uint8Array, mimeType: string): Promise<Lecture | undefined> {
  switch (natureDe(mimeType)) {
    case 'pdf':
      return lirePdf(octets);
    case 'bureautique':
      return lirePdf(await convertirEnPdf(octets));
    case 'image':
      return {
        pages: [{ n: 1, texte: '', source: 'vide' }],
        pagesAOcr: [1],
        piece: { octets, mimeType },
      };
    case 'texte':
      return pagesDepuisTextes([new TextDecoder().decode(octets)]);
    case 'ignore':
      return undefined;
  }
}

/**
 * Contrôle d'un texte lu par l'IA : renvoie la raison pour laquelle il
 * paraît douteux, ou `undefined` s'il semble sain.
 */
export function texteSuspect(texte: string): string | undefined {
  const utile = texte.replace(/\s/g, '');
  if (utile.length === 0) return undefined; // page réellement vide
  const lettres = (utile.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (lettres / utile.length < 0.6) return 'texte lu composé surtout de symboles';
  const mots = texte.split(/\s+/).filter(Boolean);
  const motsLongs = mots.filter((m) => m.length > 28).length;
  if (mots.length > 5 && motsLongs / mots.length > 0.2) return 'mots anormalement longs';
  return undefined;
}
