/**
 * Tracés d'ECG animés : un moniteur sur l'accueil et un fil discret en haut
 * de chaque page. À chaque battement, une lueur naît au pic R et les éléments
 * `.pouls` de l'appli s'illuminent.
 */
import { useEffect, useRef } from 'react';
import { animationsActives } from '../lib/animations';
import { PERIODE_MS, PHASE_PIC, abonner, ecg, phaseA } from '../lib/ecg';

interface Options {
  /** Vitesse de défilement, en pixels CSS par seconde. */
  vitesse: number;
  /** Amplitude du tracé, en part de la hauteur. */
  amplitude: number;
  /** Grille de moniteur en fond. */
  grille?: boolean;
  /** Épaisseur du trait. */
  trait: number;
}

function couleur(nom: string, repli: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli;
}

/** Couleur #rrggbb avec transparence (compatible avec tous les navigateurs). */
function avecAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)},${Math.max(0, Math.min(1, alpha))})`;
}

/** Trace l'ECG dans un canevas ; renvoie ce qu'il faut pour nettoyer. */
function lancer(canvas: HTMLCanvasElement, o: Options): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  let L = 0;
  let H = 0;
  let dpr = 1;
  let tampon = new Float32Array(0);
  let tete = 0;
  let vert = '#34e0a1';
  let compteur = 0;
  let pics: { x: number; y: number }[] = [];

  const dimensionner = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tampon = new Float32Array(Math.ceil(L) + 2);
    // Remplit tout l'historique visible pour ne jamais démarrer sur une ligne vide.
    const maintenant = Date.now();
    for (let i = 0; i < tampon.length; i++) {
      tampon[i] = ecg(phaseA(maintenant - ((tampon.length - i) / o.vitesse) * 1000));
    }
    tete = tampon.length - 2;
    pics = [];
  };

  const yDe = (v: number) => H * 0.62 - v * H * o.amplitude * 0.55;

  const tracer = (de: number, a: number, alpha0: number, alpha1: number) => {
    if (a - de < 2) return;
    const g = ctx.createLinearGradient(de, 0, a, 0);
    g.addColorStop(0, avecAlpha(vert, alpha0));
    g.addColorStop(1, avecAlpha(vert, alpha1));
    ctx.strokeStyle = g;
    ctx.beginPath();
    for (let x = Math.floor(de); x <= Math.min(a, tampon.length - 1); x++) {
      const y = yDe(tampon[x] ?? 0);
      if (x === Math.floor(de)) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const rendu = (statique: boolean) => {
    ctx.clearRect(0, 0, L, H);
    if (o.grille) {
      ctx.strokeStyle = avecAlpha(vert, 0.09);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < L; x += 22) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
      }
      for (let y = 0; y < H; y += 22) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(L, y + 0.5);
      }
      ctx.stroke();
    }
    ctx.lineWidth = o.trait;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (statique) {
      tracer(0, tampon.length - 1, 0.7, 0.7);
      return;
    }
    const ecart = 26; // le trou devant la pointe, comme sur un vrai moniteur
    tracer(0, tete, Math.max(0.3, 1 - tete / L), 1);
    tracer(tete + ecart, tampon.length - 1, Math.max(0.2, ecart / L), Math.max(0.3, (L - tete) / L));

    // Lueurs nées des pics R, qui s'éteignent à mesure que la pointe s'éloigne.
    for (const p of pics) {
      const age = (tete - p.x + L) % L;
      const force = Math.max(0, 1 - age / (L * 0.45));
      if (force <= 0) continue;
      const r = 14 + 30 * force;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, avecAlpha(vert, 0.7 * force));
      g.addColorStop(1, avecAlpha(vert, 0));
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    // Point lumineux à la pointe du tracé.
    const it = Math.min(Math.floor(tete), tampon.length - 1);
    const yt = yDe(tampon[it] ?? 0);
    const g = ctx.createRadialGradient(tete, yt, 0, tete, yt, 9);
    g.addColorStop(0, vert);
    g.addColorStop(1, avecAlpha(vert, 0));
    ctx.fillStyle = g;
    ctx.fillRect(tete - 9, yt - 9, 18, 18);
  };

  let precedentePhase = 0;
  const abonne = {
    dessiner(maintenant: number, dt: number) {
      if (++compteur % 90 === 1) vert = couleur('--color-ecg', '#34e0a1');
      const avance = (o.vitesse * dt) / 1000;
      const cible = tete + avance;
      for (let x = Math.floor(tete) + 1; x <= Math.floor(cible); x++) {
        const t = maintenant - ((cible - x) / o.vitesse) * 1000;
        const phase = phaseA(t);
        const i = x % tampon.length;
        tampon[i] = ecg(phase);
        if (precedentePhase < PHASE_PIC && phase >= PHASE_PIC) pics.push({ x: i, y: yDe(1) });
        precedentePhase = phase;
      }
      tete = cible >= tampon.length - 1 ? 0 : cible;
      pics = pics.filter((p) => (tete - p.x + L) % L < L * 0.45);
      rendu(false);
    },
  };

  dimensionner();
  vert = couleur('--color-ecg', '#34e0a1');
  const observateur = new ResizeObserver(() => {
    dimensionner();
    if (!animationsActives()) rendu(true);
  });
  observateur.observe(canvas);

  let desabonner: (() => void) | undefined;
  const relancer = () => {
    desabonner?.();
    desabonner = undefined;
    if (animationsActives()) desabonner = abonner(abonne);
    else rendu(true);
  };
  window.addEventListener('dr-rodier:animations', relancer);
  relancer();

  return () => {
    desabonner?.();
    observateur.disconnect();
    window.removeEventListener('dr-rodier:animations', relancer);
  };
}

function Canevas({ options, className, label }: { options: Options; className: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? lancer(ref.current, options) : undefined), [options]);
  return <canvas ref={ref} className={className} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />;
}

const OPTIONS_MONITEUR: Options = { vitesse: 130, amplitude: 1, grille: true, trait: 2.6 };
const OPTIONS_FOND: Options = { vitesse: 90, amplitude: 0.8, trait: 1.4 };

/** Moniteur de l'accueil : grille, tracé qui défile, lueur à chaque battement. */
export function MoniteurEcg({ className = '' }: { className?: string }) {
  return <Canevas options={OPTIONS_MONITEUR} className={`block h-full w-full ${className}`} label="Tracé d'électrocardiogramme animé" />;
}

/** Fil d'ECG discret, fixé en haut de toutes les pages. */
export function FondEcg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-24 opacity-40 [mask-image:linear-gradient(to_bottom,black_30%,transparent)] print:hidden"
    >
      <Canevas options={OPTIONS_FOND} className="block h-full w-full" />
    </div>
  );
}

export { PERIODE_MS };
