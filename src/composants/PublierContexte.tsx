/** Petits composants invisibles : une page y déclare ce que le bot flottant peut voir. */
import type { Chapitre, Question, ReponseDonnee } from '../../shared/types';
import { useDonnees } from '../etat/donnees';
import { usePublierContexteBot } from '../etat/contexteBot';
import { descriptionQuestion } from '../lib/assistant';

/** Une correction affichée : la question, la réponse de l'étudiant et les bonnes réponses. */
export function ContexteQuestion({ question, reponse }: { question: Question; reponse: ReponseDonnee | undefined }) {
  const d = useDonnees();
  const chapitre = d.chapitreParId.get(question.chapitreId);
  usePublierContexteBot({
    id: `question:${question.id}`,
    titre: `Question${chapitre ? ` - ${chapitre.titre}` : ''}`,
    texte: descriptionQuestion(question, reponse),
    matiereId: question.matiereId,
  });
  return null;
}

/** Un chapitre ouvert. */
export function ContexteChapitre({ chapitre }: { chapitre: Chapitre }) {
  usePublierContexteBot({
    id: `chapitre:${chapitre.id}`,
    titre: `Chapitre - ${chapitre.titre}`,
    texte: `L'étudiant consulte le chapitre « ${chapitre.titre} ».${chapitre.resume ? ` Résumé : ${chapitre.resume}` : ''}`,
    matiereId: chapitre.matiereId,
  });
  return null;
}
