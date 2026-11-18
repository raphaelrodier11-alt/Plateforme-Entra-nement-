/** Carnet « À revoir » côté application : création des notions, mini-tests, approfondissement. */
import { cleJour } from '../../shared/dates';
import { apresMiniTest, choisirMiniTest, notionsDepuisErreurs } from '../../shared/notions';
import { assemblerContexte, chercherExtraits } from '../../shared/assistant';
import type { Notion, Question, Session, Tentative } from '../../shared/types';
import { lireMeta, ecrireMeta } from '../db/base';
import { enregistrer, enregistrerPlusieurs } from '../db/sync';
import type { Donnees } from '../etat/calcul';
import { demanderApprofondissementNotion } from './assistant';
import { demarrerSession } from './sessions';

/** Rattache les erreurs d'une série à leurs notions (une seule fois par série). */
export async function enregistrerNotionsDeLaSerie(d: Donnees, session: Session, ratees: Question[]): Promise<void> {
  const cle = `notions-session:${session.id}`;
  if (ratees.length === 0 || (await lireMeta<boolean>(cle))) return;
  await ecrireMeta(cle, true);
  const existantes = new Map(d.notions.map((n) => [n.id, n]));
  const notions = notionsDepuisErreurs(ratees, d.chapitreParId, d.ficheParChapitre, existantes, Date.now());
  await enregistrerPlusieurs<Notion>('notions', notions);
}

/** Applique le résultat d'un mini-test à sa notion (une seule fois par série). */
export async function appliquerMiniTest(d: Donnees, session: Session, tentatives: Tentative[]): Promise<Notion | undefined> {
  if (!session.notionId) return undefined;
  const notion = d.notions.find((n) => n.id === session.notionId);
  const cle = `mini-test:${session.id}`;
  if (!notion || (await lireMeta<boolean>(cle))) return notion;
  await ecrireMeta(cle, true);
  const faites = new Map(tentatives.map((t) => [t.questionId, t]));
  const toutJuste = session.questionIds.length > 0 && session.questionIds.every((id) => faites.get(id)?.nbErreurs === 0);
  const suivante = apresMiniTest(notion, toutJuste, cleJour(Date.now()), Date.now());
  await enregistrer<Notion>('notions', suivante);
  return suivante;
}

export async function lancerMiniTest(d: Donnees, notion: Notion): Promise<string | undefined> {
  const questions = choisirMiniTest(notion, d.questions);
  if (questions.length === 0) return undefined;
  const id = await demarrerSession({
    type: 'qcm',
    titre: `Mini-test : ${notion.titre}`,
    questions,
    matiereId: notion.matiereId,
    chapitreIds: [notion.chapitreId],
    notionId: notion.id,
  });
  return `/session/${id}`;
}

/** Rappel de cours approfondi par l'IA (à la demande), gardé avec la notion. */
export async function approfondirNotion(d: Donnees, notion: Notion): Promise<void> {
  const chapitre = d.chapitreParId.get(notion.chapitreId);
  const extraits = chercherExtraits({
    question: `${notion.titre} ${notion.rappels.join(' ')}`,
    matiereId: notion.matiereId,
    chapitres: chapitre ? [chapitre] : d.chapitres,
    fiches: d.fiches,
  });
  const texte = await demanderApprofondissementNotion({
    matiere: d.matiereParId.get(notion.matiereId)?.nom,
    sujet: `${notion.titre} (chapitre « ${chapitre?.titre ?? ''} »)`,
    rappels: notion.rappels,
    contexte: assemblerContexte(extraits),
  });
  await enregistrer<Notion>('notions', { ...notion, profondeur: texte, majLe: Date.now() });
}
