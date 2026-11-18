/**
 * Le Dr Rodier, toujours à portée : une bulle en bas à droite sur toutes les
 * pages. Il connaît ce que tu as sous les yeux (une correction, un chapitre) ;
 * panneau sur le côté sur grand écran, plein écran sur téléphone. Les échanges
 * restent dans tes conversations générales.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { Paperclip, Plus, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Conversation } from '../../shared/types';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { useContexteBot } from '../etat/contexteBot';
import { ErreurAssistant, nouvelleConversation, poserQuestion } from '../lib/assistant';
import { Bulle } from './Bulle';
import { Docteur } from './Docteur';
import { Markdown } from './Markdown';
import { BoutonMicro } from './Voix';
import { STYLE_CHAMP, cx } from './ui';

const CLE = 'dr-rodier:bot-conversation';

function conversationMemorisee(): string | undefined {
  try {
    return localStorage.getItem(CLE) ?? undefined;
  } catch {
    return undefined;
  }
}

export function BotFlottant() {
  const d = useDonnees();
  const { pathname } = useLocation();
  const contexte = useContexteBot();
  const [ouvert, setOuvert] = useState(false);
  const [detache, setDetache] = useState<string | undefined>();
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();
  const [courante, setCourante] = useState<Conversation>(() => nouvelleConversation());
  const fin = useRef<HTMLDivElement>(null);

  // Retrouve la dernière conversation du bot à l'ouverture.
  const enregistree = useLiveQuery(async () => {
    const id = conversationMemorisee();
    return id ? base.collection<Conversation>('conversations').get(id) : undefined;
  }, []);
  useEffect(() => {
    if (enregistree && courante.messages.length === 0) setCourante(enregistree);
    // Une seule reprise, à la première lecture.
  }, [enregistree]);

  useEffect(() => {
    if (ouvert) fin.current?.scrollIntoView({ block: 'end' });
  }, [ouvert, courante.messages.length, attente]);

  // Une nouvelle correction ou un nouveau chapitre réattache le contexte.
  useEffect(() => setDetache(undefined), [contexte?.id]);

  // Le bot a sa propre page (Dr Rodier) et n'a pas de sens sur l'écran de verrouillage.
  if (pathname.startsWith('/assistant')) return null;

  const actif = contexte && detache !== contexte.id ? contexte : undefined;
  const visibles = courante.messages.filter((m) => !m.masque);

  const envoyer = async () => {
    const texte = saisie.trim();
    if (!texte || attente) return;
    setSaisie('');
    setErreur(undefined);
    setAttente(true);
    const base0 = courante;
    setCourante({ ...courante, messages: [...courante.messages, { role: 'user', texte, instant: Date.now() }] });
    try {
      const suite = await poserQuestion(d, { ...base0, matiereId: base0.matiereId ?? actif?.matiereId }, texte, {
        contexteExtra: actif?.texte,
        etiquette: actif?.titre,
      });
      setCourante(suite);
      try {
        localStorage.setItem(CLE, suite.id);
      } catch {
        // La conversation reste enregistrée ; seule la reprise automatique est perdue.
      }
    } catch (e) {
      setErreur(e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setAttente(false);
    }
  };

  const nouvelle = () => {
    setCourante(nouvelleConversation());
    try {
      localStorage.removeItem(CLE);
    } catch {
      // Rien à faire.
    }
    setErreur(undefined);
  };

  return (
    <>
      {!ouvert && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-label="Parler au Dr Rodier"
          className="pouls fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full border border-bord bg-surface shadow-xl shadow-black/30 transition-transform hover:scale-105 active:scale-95 lg:right-6 lg:bottom-6"
        >
          <Docteur taille={44} />
          {actif && <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface bg-accent" aria-hidden />}
        </button>
      )}

      {ouvert && (
        <section
          role="dialog"
          aria-label="Le Dr Rodier"
          className={cx(
            'fixed z-50 flex flex-col overflow-hidden border border-bord bg-fond shadow-2xl shadow-black/50',
            'inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
            'lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[min(40rem,82dvh)] lg:w-[26rem] lg:rounded-3xl lg:pt-0 lg:pb-0',
          )}
        >
          <header className="flex items-center gap-2 border-b border-bord px-3 py-2.5">
            <Docteur taille={34} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Dr Rodier</p>
              <p className="text-[11px] text-muet">Pose-lui une question, il répond avec tes cours</p>
            </div>
            <button type="button" onClick={nouvelle} aria-label="Nouvelle conversation" className="grid size-9 place-items-center rounded-xl text-texte-2 hover:bg-surface-2 hover:text-texte">
              <Plus size={18} aria-hidden />
            </button>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid size-9 place-items-center rounded-xl text-texte-2 hover:bg-surface-2 hover:text-texte">
              <X size={18} aria-hidden />
            </button>
          </header>

          {actif && (
            <div className="flex items-center gap-2 border-b border-bord bg-accent-fond px-3 py-1.5 text-xs">
              <Paperclip size={13} className="shrink-0 text-accent-clair" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={actif.titre}>Il voit : {actif.titre}</span>
              <button type="button" onClick={() => setDetache(actif.id)} aria-label="Ne plus partager ce contexte" className="text-muet hover:text-texte">
                <X size={13} aria-hidden />
              </button>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {visibles.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <Docteur taille={56} />
                <p className="text-sm font-semibold">Un doute ? Je suis là.</p>
                <p className="text-xs text-texte-2">
                  {actif ? 'Je vois ce que tu as sous les yeux : demande-moi d’expliquer, de détailler, ou pourquoi telle réponse est fausse.' : 'Pose ta question sur un cours, une notion, ou demande-moi une explication.'}
                </p>
              </div>
            )}
            {visibles.map((m, i) => (
              <Bulle key={`${m.instant}-${i}`} role={m.role}>
                {m.role === 'assistant' ? <Markdown texte={m.texte} /> : <p className="text-sm whitespace-pre-wrap">{m.texte}</p>}
              </Bulle>
            ))}
            {attente && (
              <Bulle role="assistant">
                <p className="text-sm text-muet" role="status">Le Dr Rodier réfléchit…</p>
              </Bulle>
            )}
            {erreur && <p role="alert" className="rounded-xl border border-critique/50 bg-critique/10 p-3 text-sm">{erreur}</p>}
            <div ref={fin} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-bord p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void envoyer();
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Ta question</span>
              <textarea
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
                    e.preventDefault();
                    void envoyer();
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder="Ta question…"
                className={`${STYLE_CHAMP} resize-none py-2`}
              />
            </label>
            <BoutonMicro onTexte={setSaisie} />
            <button type="submit" disabled={attente || !saisie.trim()} aria-label="Envoyer" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-white transition-opacity disabled:opacity-40">
              <Send size={18} aria-hidden />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
