/** « Exporter ma copie » : la correction de la série en Word, en PDF, ou à copier. */
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ClipboardCopy, FileDown, FileText } from 'lucide-react';
import { useState } from 'react';
import { corriger } from '../../shared/bareme';
import { copieEnTexte, elementsDeQuestion, type Copie } from '../../shared/copie';
import type { ExplicationDetaillee, Question, Session, Tentative } from '../../shared/types';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { copieEnPdf, copieEnWord } from '../lib/exportCopie';
import { nomDeFichier, telecharger } from '../lib/pdfFiche';
import { Bouton, Carte } from './ui';

export function ExportCopie({ session, questions, tentatives, noteSur20, points, total }: { session: Session; questions: Question[]; tentatives: Tentative[]; noteSur20: number; points: number; total: number }) {
  const d = useDonnees();
  const profondes = useLiveQuery(() => base.collection<ExplicationDetaillee>('explications').toArray(), []);
  const [occupe, setOccupe] = useState<'word' | 'pdf' | undefined>();
  const [copie, setCopie] = useState(false);

  const construire = (): Copie => {
    const parQuestion = new Map(tentatives.map((t) => [t.questionId, t]));
    const gardees = new Map((profondes ?? []).map((e) => [e.id, e.texte]));
    return {
      titre: session.titre,
      matiere: session.matiereId ? d.matiereParId.get(session.matiereId)?.nom : undefined,
      date: session.fin ?? session.debut,
      noteSur20,
      points,
      total,
      questions: questions.map((q, i) => {
        const t = parQuestion.get(q.id);
        const c = t ? corriger(q, t.reponse) : undefined;
        return {
          numero: i + 1,
          type: q.type,
          enonce: q.enonce.replace(/\{\{[^}]+\}\}/g, '…'),
          elements: elementsDeQuestion(q, t?.reponse),
          points: t?.points,
          nbErreurs: c?.nbErreurs,
          repondue: !!t,
          explication: q.explication,
          rappel: q.rappel,
          profondeur: gardees.get(q.id),
        };
      }),
    };
  };

  const exporter = async (format: 'word' | 'pdf') => {
    setOccupe(format);
    try {
      const c = construire();
      const blob = format === 'word' ? await copieEnWord(c) : await copieEnPdf(c);
      const nom = nomDeFichier(`Copie ${session.titre}`).replace(/\.pdf$/, format === 'word' ? '.docx' : '.pdf');
      telecharger(blob, nom);
    } finally {
      setOccupe(undefined);
    }
  };

  return (
    <Carte titre={<span className="flex items-center gap-2"><FileDown size={16} aria-hidden /> Exporter ma copie</span>} className="mb-4">
      <p className="mb-3 text-sm text-texte-2">Questions, tes réponses, les bonnes réponses, les explications (y compris celles que tu as approfondies) et ta note.</p>
      <div className="flex flex-wrap gap-2">
        <Bouton variante="primaire" icone={FileText} disabled={!!occupe} onClick={() => void exporter('word')}>
          {occupe === 'word' ? 'Création…' : 'Word (.docx)'}
        </Bouton>
        <Bouton icone={FileDown} disabled={!!occupe} onClick={() => void exporter('pdf')}>
          {occupe === 'pdf' ? 'Création…' : 'PDF'}
        </Bouton>
        <Bouton
          icone={copie ? Check : ClipboardCopy}
          onClick={() => {
            void navigator.clipboard?.writeText(copieEnTexte(construire())).then(() => {
              setCopie(true);
              setTimeout(() => setCopie(false), 1800);
            });
          }}
        >
          {copie ? 'Copié' : 'Copier le texte'}
        </Bouton>
      </div>
    </Carte>
  );
}
