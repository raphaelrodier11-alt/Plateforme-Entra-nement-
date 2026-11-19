/**
 * Illustrations des cours et des fiches.
 *  - figures extraites des PDF du cours (réduites en WebP, rangées dans `medias`) ;
 *  - images libres de droits trouvées sur Wikimedia Commons (liées, jamais copiées) ;
 *  - schémas SVG dessinés par l'IA (nettoyés par `assainirSvg`).
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { extractImages, getDocumentProxy } from 'unpdf';
import { licenceLibre, texteSimple } from '../shared/illustrations';
import type { Illustration, Media } from '../shared/types';

export interface Figure {
  page: number;
  media: Media;
}

const LARGEUR_MAX = 800;
const OCTETS_MAX = 70_000;
const PAGES_MAX = 200;
/** Figures gardées par chapitre (le stockage gratuit est limité). */
const FIGURES_MAX = 16;
/** Une image répétée sur autant de pages est un logo ou un décor, pas une figure. */
const REPETITIONS_DECOR = 3;

async function encoder(data: Uint8ClampedArray, largeur: number, hauteur: number, canaux: 1 | 3 | 4): Promise<{ webp: Buffer; l: number; h: number } | undefined> {
  const brut = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  for (const [qualite, largeurMax] of [[60, LARGEUR_MAX], [50, 640], [40, 480]] as const) {
    const { data: webp, info } = await sharp(brut, { raw: { width: largeur, height: hauteur, channels: canaux } })
      .resize({ width: Math.min(largeurMax, largeur), withoutEnlargement: true })
      .webp({ quality: qualite })
      .toBuffer({ resolveWithObject: true });
    if (webp.byteLength <= OCTETS_MAX) return { webp, l: info.width, h: info.height };
  }
  return undefined;
}

/** Figures d'un PDF, sans les logos ni les décors. Ne lève jamais : sans figure, on renvoie []. */
export async function extraireFigures(pdf: Uint8Array, prefixe: string): Promise<Figure[]> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const brutes: { page: number; hash: string; data: Uint8ClampedArray; l: number; h: number; c: 1 | 3 | 4 }[] = [];
    const pages = Math.min(doc.numPages, PAGES_MAX);
    for (let page = 1; page <= pages; page++) {
      let images;
      try {
        images = await extractImages(doc, page);
      } catch {
        continue;
      }
      for (const im of images) {
        if (im.width < 160 || im.height < 120 || im.width * im.height < 40_000) continue;
        const ratio = im.width / im.height;
        if (ratio > 6 || ratio < 1 / 6) continue;
        const hash = createHash('sha1').update(Buffer.from(im.data.buffer, im.data.byteOffset, Math.min(im.data.byteLength, 65_536))).update(`${im.width}x${im.height}`).digest('hex').slice(0, 12);
        brutes.push({ page, hash, data: im.data, l: im.width, h: im.height, c: im.channels });
      }
    }
    const pagesParHash = new Map<string, Set<number>>();
    for (const b of brutes) pagesParHash.set(b.hash, (pagesParHash.get(b.hash) ?? new Set()).add(b.page));
    const vus = new Set<string>();
    const gardees = brutes
      .filter((b) => (pagesParHash.get(b.hash)?.size ?? 0) < REPETITIONS_DECOR && !vus.has(b.hash) && !!vus.add(b.hash))
      .sort((a, b) => b.l * b.h - a.l * a.h)
      .slice(0, FIGURES_MAX)
      .sort((a, b) => a.page - b.page);
    const figures: Figure[] = [];
    for (const b of gardees) {
      const e = await encoder(b.data, b.l, b.h, b.c).catch(() => undefined);
      if (!e) continue;
      figures.push({
        page: b.page,
        media: { id: `img-${prefixe}-${b.hash}`, mimeType: 'image/webp', donnees: e.webp.toString('base64'), largeur: e.l, hauteur: e.h },
      });
    }
    return figures;
  } catch {
    return [];
  }
}

const MOTS_VIDES = new Set(['the', 'of', 'and', 'in', 'with', 'for', 'a', 'an', 'to', 'diagram', 'file', 'jpg', 'png', 'svg']);
const mots = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m));

interface PageCommons {
  index?: number;
  title: string;
  imageinfo?: {
    thumburl?: string;
    url?: string;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

/** Jusqu'à `max` images libres de droits de Wikimedia Commons pour une recherche (en anglais, de préférence). */
export async function chercherCommons(recherche: string, max = 2, http: typeof fetch = fetch): Promise<Illustration[]> {
  const requete = recherche.trim().slice(0, 120);
  if (!requete) return [];
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    for (const [k, v] of Object.entries({
      action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: requete, gsrlimit: '10',
      prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '900', origin: '*',
    })) url.searchParams.set(k, v);
    const reponse = await http(url, { headers: { 'User-Agent': 'DrRodier-etude/1.0 (outil pedagogique personnel)' } });
    if (!reponse.ok) return [];
    const json = (await reponse.json()) as { query?: { pages?: Record<string, PageCommons> } };
    const attendus = mots(requete);
    const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const resultat: Illustration[] = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl && !info?.url) continue;
      if (!/^image\/(jpeg|png|svg\+xml|webp)$/.test(info.mime ?? '')) continue;
      const meta = info.extmetadata ?? {};
      const licence = texteSimple(meta.LicenseShortName?.value, 40);
      if (!licenceLibre(licence)) continue;
      // Le titre du fichier doit parler du sujet : on évite les résultats hors sujet.
      const titre = mots(p.title);
      if (attendus.length && !attendus.some((m) => titre.some((t) => t.includes(m) || m.includes(t)))) continue;
      resultat.push({
        source: 'web',
        url: info.thumburl ?? info.url!,
        legende: texteSimple(meta.ImageDescription?.value, 200) ?? p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
        ...(texteSimple(meta.Artist?.value) ? { credit: texteSimple(meta.Artist?.value) } : {}),
        ...(licence ? { licence } : {}),
        ...(info.descriptionurl ? { page: info.descriptionurl } : {}),
      });
      if (resultat.length >= max) break;
    }
    return resultat;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Assemblage : des figures, des images libres et des schémas au bon endroit
// ---------------------------------------------------------------------------

import { assainirSvg } from '../shared/illustrations';
import type { BlocFiche, SectionFiche } from '../shared/types';

/** Ce que l'IA indique pour illustrer une section. */
export interface IndicationIllustration {
  pages: number[];
  /** Nom (ou début du nom) du fichier d'où vient la section, quand le chapitre en a plusieurs. */
  fichier?: string;
  recherches: string[];
  schemas: { titre: string; svg: string }[];
}

export interface FigureSource extends Figure {
  fichier: string;
}

const PAR_SECTION = { figures: 3, web: 2, schemas: 1 };

export async function illustrerSections(
  sections: SectionFiche[],
  indications: IndicationIllustration[],
  figures: FigureSource[],
  chercher: (recherche: string) => Promise<Illustration[]> = chercherCommons,
): Promise<SectionFiche[]> {
  const nomsVus = new Set<string>();
  const sortie: SectionFiche[] = [];
  for (const [i, section] of sections.entries()) {
    const ind = indications[i];
    const images: Illustration[] = [];
    if (ind) {
      const cible = ind.fichier ? figures.filter((f) => f.fichier.toLowerCase().includes(ind.fichier!.toLowerCase())) : [];
      const candidates = cible.length ? cible : figures;
      for (const page of ind.pages) {
        for (const f of candidates.filter((x) => x.page === page)) {
          if (nomsVus.has(f.media.id) || images.length >= PAR_SECTION.figures) continue;
          nomsVus.add(f.media.id);
          images.push({ source: 'cours', mediaId: f.media.id, page: f.page, legende: `Figure du cours (page ${f.page})` });
        }
      }
      for (const s of ind.schemas.slice(0, PAR_SECTION.schemas)) {
        const svg = assainirSvg(s.svg);
        if (svg) images.push({ source: 'schema', svg, legende: s.titre || 'Schéma' });
      }
      let web = 0;
      for (const r of ind.recherches.slice(0, 2)) {
        for (const w of await chercher(r)) {
          if (web >= PAR_SECTION.web || (w.source === 'web' && images.some((x) => x.source === 'web' && x.url === w.url))) continue;
          images.push(w);
          web++;
        }
      }
    }
    if (images.length === 0) {
      sortie.push(section);
      continue;
    }
    const galerie: BlocFiche = { type: 'images', images };
    // La galerie ouvre la section, juste après le premier bloc (souvent une introduction).
    const blocs = [...section.blocs];
    blocs.splice(blocs.length > 1 ? 1 : blocs.length, 0, galerie);
    sortie.push({ ...section, blocs });
  }
  return sortie;
}

/** Figures réellement utilisées dans des sections (pour ne stocker que celles-là). */
export function mediasUtilises(sections: SectionFiche[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sections) for (const b of s.blocs) if (b.type === 'images') for (const im of b.images) if (im.source === 'cours') ids.add(im.mediaId);
  return ids;
}
