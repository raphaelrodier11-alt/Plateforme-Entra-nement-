/** Explication détaillée d'une question : affichée si elle est déjà gardée, sinon un bouton la demande. */
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { ExplicationDetaillee as Doc, Question, ReponseDonnee } from '../../shared/types';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { ErreurAssistant, expliquerQuestion } from '../lib/assistant';
import { Docteur } from './Docteur';
import { Markdown } from './Markdown';
import { Bouton } from './ui';

export function ExplicationDetaillee({ question, reponse }: { question: Question; reponse?: ReponseDonnee }) {
  const d = useDonnees();
  const gardee = useLiveQuery(() => base.collection<Doc>('explications').get(question.id), [question.id]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  const demander = async () => {
    setOccupe(true);
    setErreur(undefined);
    try {
      await expliquerQuestion(d, question, reponse);
    } catch (e) {
      setErreur(e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div>
      {gardee ? (
        <div className="apparait rounded-2xl bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <Docteur taille={28} />
            <span className="flex-1 text-xs font-semibold text-texte-2">En profondeur, par le Dr Rodier</span>
            <Bouton variante="discret" icone={RefreshCw} className="min-h-8 px-2 text-xs" disabled={occupe} onClick={() => void demander()}>
              {occupe ? '…' : 'Refaire'}
            </Bouton>
          </div>
          <Markdown texte={gardee.texte} />
        </div>
      ) : (
        <Bouton icone={BookOpenCheck} disabled={occupe} onClick={() => void demander()}>
          {occupe ? 'Le Dr Rodier rédige…' : 'Aller en profondeur'}
        </Bouton>
      )}
      {erreur && (
        <p role="alert" className="mt-2 rounded-xl border border-critique/50 bg-critique/10 p-3 text-sm">
          {erreur}
        </p>
      )}
    </div>
  );
}
