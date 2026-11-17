/** Question du jour sur l'accueil : une question, un clic, c'est parti. */
import { CircleCheck, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cleJour } from '../../shared/dates';
import { questionDuJour } from '../../shared/questiondujour';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';
import { demarrerSession } from '../lib/sessions';
import { Bouton, Carte, Pastille } from './ui';

export function QuestionDuJour() {
  const d = useDonnees();
  const navigate = useNavigate();
  const jour = cleJour(d.maintenant);
  const q = questionDuJour(d.questions, d.erreursDues, jour);
  if (!q) return null;

  const faiteAujourdHui = d.tentatives.some((t) => t.questionId === q.id && cleJour(t.date) === jour);
  const c = couleurMatiere(q.matiereId);
  const chapitre = d.chapitreParId.get(q.chapitreId);

  const lancer = async () => {
    const id = await demarrerSession({
      type: 'qcm',
      titre: 'Question du jour',
      questions: [q],
      matiereId: q.matiereId,
      chapitreIds: [q.chapitreId],
    });
    navigate(`/session/${id}`);
  };

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <Flame size={16} className="text-serieux" aria-hidden /> Question du jour
        </span>
      }
      action={faiteAujourdHui ? <Pastille ton="bon" icone={CircleCheck}>Faite</Pastille> : undefined}
    >
      <div className="rounded-2xl bg-surface-2 p-3.5" style={{ borderLeft: `3px solid ${c.accent}` }}>
        <p className="line-clamp-3 text-sm leading-relaxed font-medium">{q.enonce}</p>
        <p className="mt-1.5 text-xs text-muet">
          {d.matiereParId.get(q.matiereId)?.nom}
          {chapitre ? ` · ${chapitre.titre}` : ''}
          {d.erreursDues.some((e) => e.id === q.id) ? ' · une de tes erreurs à revoir' : ''}
        </p>
      </div>
      <Bouton variante="primaire" className="mt-3" onClick={() => void lancer()}>
        {faiteAujourdHui ? 'La refaire' : 'Répondre maintenant'}
      </Bouton>
    </Carte>
  );
}
