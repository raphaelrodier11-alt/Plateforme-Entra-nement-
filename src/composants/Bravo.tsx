/**
 * Partiel terminé : la plateforme passe en mode « bravo ». Accent vert pendant
 * deux jours, confettis une seule fois, et un message de félicitations.
 */
import { PartyPopper, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { libelleExamen } from '../../shared/examens';
import { useDonnees } from '../etat/donnees';
import { useSituationPartiel } from '../etat/partiel';
import { animationsActives } from '../lib/animations';
import { nomMatieresExamen } from '../lib/examens';

const COULEURS = ['#34e0a1', '#ffd166', '#ef476f', '#4cc9f0', '#b388ff', '#ff9f43'];

function lancerConfettis(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const L = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  const morceaux = Array.from({ length: 140 }, () => ({
    x: Math.random() * L,
    y: -Math.random() * H * 0.6,
    vx: (Math.random() - 0.5) * 3 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    taille: (6 + Math.random() * 8) * dpr,
    angle: Math.random() * Math.PI,
    rot: (Math.random() - 0.5) * 0.3,
    couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)]!,
  }));
  let image = 0;
  const debut = performance.now();
  const boucle = (t: number) => {
    ctx.clearRect(0, 0, L, H);
    for (const m of morceaux) {
      m.x += m.vx;
      m.y += m.vy;
      m.angle += m.rot;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = m.couleur;
      ctx.fillRect(-m.taille / 2, -m.taille / 4, m.taille, m.taille / 2);
      ctx.restore();
    }
    if (t - debut < 5000) image = requestAnimationFrame(boucle);
    else ctx.clearRect(0, 0, L, H);
  };
  image = requestAnimationFrame(boucle);
  return () => cancelAnimationFrame(image);
}

/** Teinte « fête » de l'interface tant que le partiel vient de finir. */
export function Fete() {
  const { fini } = useSituationPartiel();
  useEffect(() => {
    const racine = document.documentElement;
    if (fini) racine.setAttribute('data-fete', '');
    else racine.removeAttribute('data-fete');
    return () => racine.removeAttribute('data-fete');
  }, [fini]);
  return null;
}

export function BandeauBravo() {
  const d = useDonnees();
  const { bravo, fermerBravo } = useSituationPartiel();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!bravo || !canvas.current || !animationsActives()) return;
    const cle = `dr-rodier:confettis:${bravo.id}`;
    try {
      if (localStorage.getItem(cle) === '1') return;
      localStorage.setItem(cle, '1');
    } catch {
      // Sans stockage, les confettis reviendront : sans gravité.
    }
    return lancerConfettis(canvas.current);
  }, [bravo?.id]);

  if (!bravo) return null;
  const nom = libelleExamen(bravo.titre, nomMatieresExamen(d, bravo));
  const prenom = d.reglages.prenom?.trim();
  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />
      <section role="status" className="carte mb-4 flex items-start gap-3 border-bon/50 bg-bon/10 p-4">
        <PartyPopper size={24} className="mt-0.5 shrink-0 text-bon" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-base font-semibold">Bravo{prenom ? ` ${prenom}` : ''}, c’est fini !</p>
          <p className="mt-1 text-texte-2">
            « {nom} » est derrière toi. Tu as travaillé dur : prends le temps de souffler, de dormir et de te faire plaisir.
            Le planning reprendra avec ton prochain partiel.
          </p>
          <p className="mt-2 text-xs">
            <Link to="/planning" className="text-accent-clair hover:underline">Voir la suite du planning</Link>
          </p>
        </div>
        <button type="button" onClick={fermerBravo} aria-label="Fermer le message" className="grid size-9 shrink-0 place-items-center rounded-xl text-texte-2 hover:bg-surface-2">
          <X size={18} aria-hidden />
        </button>
      </section>
    </>
  );
}
