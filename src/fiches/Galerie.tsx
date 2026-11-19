/**
 * Galerie d'images d'une section : on fait défiler sur le côté, image par image.
 * Les images viennent des PDF du cours, de schémas dessinés par l'IA ou
 * d'internet (Wikimedia Commons, avec le crédit et la licence).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Illustration, Media } from '../../shared/types';
import { base } from '../db/base';
import { cx } from '../composants/ui';

const ETIQUETTE = { cours: 'Figure du cours', schema: 'Schéma', web: 'Internet' } as const;

function ImageCours({ mediaId, alt, classe }: { mediaId: string; alt: string; classe: string }) {
  const media = useLiveQuery(() => base.collection<Media>('medias').get(mediaId), [mediaId]);
  if (!media) return <div className={cx(classe, 'animate-pulse bg-surface-3')} role="img" aria-label="Image en chargement" />;
  return <img src={`data:${media.mimeType};base64,${media.donnees}`} alt={alt} className={classe} width={media.largeur} height={media.hauteur} />;
}

function Image({ image, classe }: { image: Illustration; classe: string }) {
  const alt = image.legende ?? ETIQUETTE[image.source];
  if (image.source === 'cours') return <ImageCours mediaId={image.mediaId} alt={alt} classe={classe} />;
  if (image.source === 'schema') {
    // Un SVG chargé comme <img> n'exécute aucun script, en plus du nettoyage déjà fait.
    return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`} alt={alt} className={cx(classe, 'bg-white')} />;
  }
  return <img src={image.url} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={cx(classe, 'bg-white')} />;
}

function Legende({ image }: { image: Illustration }) {
  return (
    <p className="mt-1.5 text-xs text-muet">
      <span className="font-medium text-texte-2">{ETIQUETTE[image.source]}</span>
      {image.legende ? ` · ${image.legende}` : ''}
      {image.source === 'web' && (
        <>
          {image.credit ? ` · ${image.credit}` : ''}
          {image.licence ? ` (${image.licence})` : ''}
          {image.page && (
            <a href={image.page} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-accent-clair hover:underline">
              source <ExternalLink size={11} aria-hidden />
            </a>
          )}
        </>
      )}
    </p>
  );
}

export function GalerieImages({ titre, images }: { titre?: string; images: Illustration[] }) {
  const piste = useRef<HTMLUListElement>(null);
  const [courante, setCourante] = useState(0);
  const [agrandie, setAgrandie] = useState<number | undefined>();
  if (images.length === 0) return null;

  const aller = (i: number) => {
    const n = Math.max(0, Math.min(images.length - 1, i));
    const el = piste.current?.children[n] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setCourante(n);
  };

  return (
    <figure aria-label={titre ?? 'Illustrations'}>
      <div className="relative">
        <ul
          ref={piste}
          onScroll={(e) => {
            const el = e.currentTarget;
            const largeur = (el.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1;
            setCourante(Math.round(el.scrollLeft / (largeur + 12)));
          }}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          {images.map((image, i) => (
            <li key={i} className="w-[85%] shrink-0 snap-center sm:w-[60%]">
              <button type="button" onClick={() => setAgrandie(i)} className="block w-full overflow-hidden rounded-xl border border-bord" aria-label="Agrandir l'image">
                <Image image={image} classe="h-56 w-full object-contain sm:h-64" />
              </button>
              <Legende image={image} />
            </li>
          ))}
        </ul>
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Image précédente" onClick={() => aller(courante - 1)} disabled={courante === 0} className="absolute top-24 left-1 grid size-9 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <button type="button" aria-label="Image suivante" onClick={() => aller(courante + 1)} disabled={courante >= images.length - 1} className="absolute top-24 right-1 grid size-9 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30">
              <ChevronRight size={18} aria-hidden />
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <p className="chiffres text-center text-xs text-muet" aria-live="polite">{courante + 1} / {images.length}</p>
      )}

      {agrandie !== undefined && (
        <div role="dialog" aria-label="Image agrandie" className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4" onClick={() => setAgrandie(undefined)}>
          <button type="button" aria-label="Fermer" className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-black/60 text-white" onClick={() => setAgrandie(undefined)}>
            <X size={20} aria-hidden />
          </button>
          <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image image={images[agrandie]!} classe="max-h-[80dvh] w-full rounded-lg object-contain" />
            <div className="text-white/80"><Legende image={images[agrandie]!} /></div>
          </div>
        </div>
      )}
    </figure>
  );
}
