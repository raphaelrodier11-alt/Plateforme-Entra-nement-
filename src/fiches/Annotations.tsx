/**
 * Notes personnelles et surlignage d'une fiche. Toucher un passage (point
 * d'une liste, paragraphe) le surligne ; les notes se saisissent sous la fiche.
 * Tout est enregistré et synchronisé comme le reste de ta progression.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { Highlighter, NotebookPen } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Annotations } from '../../shared/types';
import { Carte, STYLE_CHAMP } from '../composants/ui';
import { base } from '../db/base';
import { enregistrer } from '../db/sync';

interface Contexte {
  surligne: (cle: string) => boolean;
  basculer: (cle: string) => void;
}

const Ctx = createContext<Contexte | undefined>(undefined);

async function lire(chapitreId: string): Promise<Annotations> {
  return (await base.collection<Annotations>('annotations').get(chapitreId)) ?? { id: chapitreId, notes: '', surlignes: [], majLe: 0 };
}

export function FournisseurAnnotations({ chapitreId, children }: { chapitreId: string; children: ReactNode }) {
  const doc = useLiveQuery(() => base.collection<Annotations>('annotations').get(chapitreId), [chapitreId]);
  const surlignes = new Set(doc?.surlignes ?? []);
  const valeur: Contexte = {
    surligne: (cle) => surlignes.has(cle),
    basculer: (cle) => {
      void (async () => {
        const courant = await lire(chapitreId);
        const suivant = new Set(courant.surlignes);
        if (suivant.has(cle)) suivant.delete(cle);
        else suivant.add(cle);
        await enregistrer<Annotations>('annotations', { ...courant, surlignes: [...suivant], majLe: Date.now() });
      })();
    },
  };
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

/** Passage touchable : surligné en jaune doux, avec une icône (jamais la couleur seule). */
export function Surlignable({ cle, children, className = '' }: { cle: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return <span className={className}>{children}</span>;
  const actif = ctx.surligne(cle);
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={() => ctx.basculer(cle)}
      className={`rounded-md px-1 text-left transition-colors ${actif ? 'bg-alerte/25 text-texte [box-decoration-break:clone]' : 'hover:bg-surface-3/60'} ${className}`}
    >
      {children}
      {actif && <Highlighter size={12} className="ml-1 inline text-alerte" aria-label="surligné" />}
    </button>
  );
}

/** Notes personnelles du chapitre, enregistrées au fil de la frappe. */
export function NotesChapitre({ chapitreId }: { chapitreId: string }) {
  const doc = useLiveQuery(() => base.collection<Annotations>('annotations').get(chapitreId), [chapitreId]);
  const [texte, setTexte] = useState('');
  const charge = useRef(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reprend le texte enregistré une seule fois, pour ne jamais écraser la saisie en cours.
  useEffect(() => {
    if (!charge.current && doc !== undefined) {
      setTexte(doc.notes);
      charge.current = true;
    }
  }, [doc]);
  useEffect(() => {
    charge.current = false;
    setTexte('');
  }, [chapitreId]);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const changer = (valeur: string) => {
    setTexte(valeur);
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      void (async () => {
        const courant = await lire(chapitreId);
        await enregistrer<Annotations>('annotations', { ...courant, notes: valeur, majLe: Date.now() });
      })();
    }, 700);
  };

  return (
    <Carte
      className="mt-4"
      titre={
        <span className="flex items-center gap-2">
          <NotebookPen size={16} aria-hidden /> Mes notes
        </span>
      }
    >
      <label className="block">
        <span className="sr-only">Mes notes sur ce chapitre</span>
        <textarea
          value={texte}
          onChange={(e) => changer(e.target.value)}
          rows={5}
          maxLength={20000}
          placeholder="Tes remarques, astuces, questions pour l'enseignant… Touche un passage de la fiche pour le surligner."
          className={`${STYLE_CHAMP} py-2`}
        />
      </label>
      <p className="mt-1.5 text-xs text-muet">Enregistré automatiquement.</p>
    </Carte>
  );
}
