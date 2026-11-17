/** Dictée vocale et lecture à voix haute, quand l'appareil les propose (iPhone et iPad : oui). */
import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

interface Reconnaissance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function creerReconnaissance(): Reconnaissance | undefined {
  const W = window as unknown as Record<string, (new () => Reconnaissance) | undefined>;
  const Classe = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return Classe ? new Classe() : undefined;
}

export const dicteeDisponible = (): boolean => typeof window !== 'undefined' && !!creerReconnaissance();
export const lectureDisponible = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Bouton micro : le texte dicté est envoyé au fur et à mesure à `onTexte`. */
export function BoutonMicro({ onTexte, className }: { onTexte: (texte: string) => void; className?: string }) {
  const [ecoute, setEcoute] = useState(false);
  const rec = useRef<Reconnaissance | undefined>(undefined);
  const [dispo] = useState(dicteeDisponible);

  useEffect(() => () => rec.current?.stop(), []);
  if (!dispo) return null;

  const basculer = () => {
    if (ecoute) {
      rec.current?.stop();
      return;
    }
    const r = creerReconnaissance();
    if (!r) return;
    r.lang = 'fr-FR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let texte = '';
      for (let i = 0; i < e.results.length; i++) texte += e.results[i]?.[0]?.transcript ?? '';
      onTexte(texte);
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    rec.current = r;
    setEcoute(true);
    r.start();
  };

  return (
    <button
      type="button"
      onClick={basculer}
      aria-pressed={ecoute}
      aria-label={ecoute ? "Arrêter la dictée" : 'Dicter ma réponse'}
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors',
        ecoute ? 'pouls border-critique bg-critique/20 text-texte' : 'border-bord bg-surface-2 text-texte-2 hover:text-texte',
        className,
      )}
    >
      {ecoute ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
    </button>
  );
}

/** Lit un texte à voix haute en français (la mise en forme est retirée). */
export function parler(texte: string): void {
  if (!lectureDisponible()) return;
  window.speechSynthesis.cancel();
  const net = texte.replace(/[*#`_>-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const u = new SpeechSynthesisUtterance(net);
  u.lang = 'fr-FR';
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export function silence(): void {
  if (lectureDisponible()) window.speechSynthesis.cancel();
}
