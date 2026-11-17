/**
 * Moteur de l'ECG : une seule boucle d'animation pour tous les tracés de
 * l'appli, et un battement commun (classe `bat` sur <html> pendant 0,7 s) qui
 * fait s'illuminer les éléments `.pouls`.
 */
import { animationsActives } from './animations';

export const BPM = 64;
export const PERIODE_MS = 60_000 / BPM;
/** Instant du pic R dans le cycle (0 à 1). */
export const PHASE_PIC = 0.3;

const gauss = (x: number, c: number, l: number, a: number): number => a * Math.exp(-((x - c) ** 2) / (2 * l * l));

/** Forme d'un complexe PQRST, de -0,3 à 1 (le pic R est à 1). */
export function ecg(phase: number): number {
  return (
    gauss(phase, 0.14, 0.028, 0.14) + // onde P
    gauss(phase, 0.265, 0.008, -0.16) + // Q
    gauss(phase, PHASE_PIC, 0.0085, 1) + // R
    gauss(phase, 0.335, 0.01, -0.28) + // S
    gauss(phase, 0.58, 0.05, 0.26) // onde T
  );
}

export const phaseA = (instantMs: number): number => (((instantMs % PERIODE_MS) + PERIODE_MS) % PERIODE_MS) / PERIODE_MS;

export interface Abonne {
  /** Dessine une image ; `maintenant` est l'instant en ms. */
  dessiner(maintenant: number, dtMs: number): void;
}

const abonnes = new Set<Abonne>();
let raf = 0;
let dernier = 0;
let dernierePhase = 0;
let finBattement: ReturnType<typeof setTimeout> | undefined;

function battement(): void {
  const racine = document.documentElement;
  racine.classList.add('bat');
  clearTimeout(finBattement);
  finBattement = setTimeout(() => racine.classList.remove('bat'), 700);
}

function image(maintenant: number): void {
  const dt = dernier ? Math.min(maintenant - dernier, 100) : 16;
  dernier = maintenant;
  const phase = phaseA(Date.now());
  if (dernierePhase < PHASE_PIC && phase >= PHASE_PIC) battement();
  dernierePhase = phase;
  // Une erreur de dessin ne doit jamais arrêter la boucle ni les battements.
  for (const a of abonnes) {
    try {
      a.dessiner(Date.now(), dt);
    } catch {
      // Image ignorée.
    }
  }
  raf = requestAnimationFrame(image);
}

function arreter(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  dernier = 0;
}

function demarrer(): void {
  if (raf || abonnes.size === 0 || document.hidden || !animationsActives()) return;
  raf = requestAnimationFrame(image);
}

/** Abonne un tracé à la boucle commune ; renvoie la fonction de désabonnement. */
export function abonner(a: Abonne): () => void {
  abonnes.add(a);
  demarrer();
  return () => {
    abonnes.delete(a);
    if (abonnes.size === 0) arreter();
  };
}

if (typeof document !== 'undefined') {
  // Rien ne bouge dans un onglet caché ou quand les animations sont coupées.
  document.addEventListener('visibilitychange', () => (document.hidden ? arreter() : demarrer()));
  window.addEventListener('dr-rodier:animations', () => {
    if (animationsActives()) demarrer();
    else {
      arreter();
      document.documentElement.classList.remove('bat');
    }
  });
}
