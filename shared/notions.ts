/**
 * Carnet « À revoir » : chaque erreur de QCM rattache une notion de cours (une
 * section de fiche). La notion garde son rappel pour être relue tout de suite et
 * plus tard, puis un mini-test vérifie qu'elle est ancrée. Trois mini-tests réussis
 * à la suite, espacés dans le temps, et la notion sort du carnet toute seule.
 */
import { texteFiche } from './assistant';
import { cleJour } from './dates';
import type { Chapitre, Fiche, Notion, Question } from './types';

/** Délais (en jours) avant la prochaine relecture, après 1 puis 2 mini-tests réussis. */
export const DELAIS_JOURS = [2, 6] as const;
export const REUSSITES_POUR_ANCRER = 3;

export const cleNotion = (q: Pick<Question, 'chapitreId' | 'sectionFiche'>): string => `${q.chapitreId}|${q.sectionFiche ?? 'general'}`;

function jourPlus(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number];
  const d = new Date(a, m - 1, j + n, 12);
  return cleJour(d);
}

/** Crée ou met à jour les notions correspondant aux questions ratées. */
export function notionsDepuisErreurs(
  ratees: Question[],
  chapitres: Map<string, Chapitre>,
  fiches: Map<string, Fiche>,
  existantes: Map<string, Notion>,
  maintenant: number,
): Notion[] {
  const resultat = new Map<string, Notion>();
  for (const q of ratees) {
    const id = cleNotion(q);
    const chapitre = chapitres.get(q.chapitreId);
    if (!chapitre) continue;
    const avant = resultat.get(id) ?? existantes.get(id);
    const section = q.sectionFiche ? fiches.get(q.chapitreId)?.sections.find((s) => s.id === q.sectionFiche) : undefined;
    const rappels = [...new Set([...(avant?.rappels ?? []), ...(q.rappel ? [q.rappel] : [])])].slice(0, 6);
    resultat.set(id, {
      id,
      matiereId: chapitre.matiereId,
      chapitreId: chapitre.id,
      ...(q.sectionFiche ? { sectionId: q.sectionFiche } : {}),
      titre: section?.titre ?? chapitre.titre,
      rappels,
      questionIds: [...new Set([...(avant?.questionIds ?? []), q.id])].slice(0, 30),
      // Une notion ancrée qui re-fait une erreur revient dans le carnet.
      statut: 'a_revoir',
      reussitesDeSuite: avant?.statut === 'ancree' ? 0 : (avant?.reussitesDeSuite ?? 0),
      echecs: (avant?.echecs ?? 0) + 1,
      ...(avant?.profondeur ? { profondeur: avant.profondeur } : {}),
      creeLe: avant?.creeLe ?? maintenant,
      majLe: maintenant,
    });
  }
  return [...resultat.values()];
}

/** Rappel à relire : la section de fiche concernée, puis les rappels des questions ratées. */
export function texteRappelNotion(n: Notion, fiche: Fiche | undefined): string {
  const parties: string[] = [];
  const section = n.sectionId ? fiche?.sections.find((s) => s.id === n.sectionId) : undefined;
  if (section && fiche) parties.push(texteFiche({ ...fiche, sections: [section] }));
  if (n.rappels.length > 0) parties.push(`### À retenir de tes erreurs\n${n.rappels.map((r) => `- ${r}`).join('\n')}`);
  return parties.join('\n\n') || 'Relis le chapitre correspondant.';
}

/** 2 à 3 questions pour vérifier que la notion est ancrée, de préférence celles que tu as ratées. */
export function choisirMiniTest(n: Notion, questions: Question[], nb = 3): Question[] {
  const memeNotion = questions.filter((q) => !q.perso && q.chapitreId === n.chapitreId && (n.sectionId ? q.sectionFiche === n.sectionId : true));
  const liees = memeNotion.filter((q) => n.questionIds.includes(q.id));
  const autres = memeNotion.filter((q) => !n.questionIds.includes(q.id));
  const complement = questions.filter((q) => !q.perso && !q.reserveExamen && q.chapitreId === n.chapitreId && !memeNotion.includes(q));
  return [...liees, ...autres, ...complement].slice(0, nb);
}

/** Résultat d'un mini-test : succès → relecture espacée puis ancrage ; échec → retour au départ. */
export function apresMiniTest(n: Notion, toutJuste: boolean, aujourdHui: string, maintenant: number): Notion {
  if (!toutJuste) return { ...n, statut: 'a_revoir', reussitesDeSuite: 0, echecs: n.echecs + 1, prochaineRevue: undefined, majLe: maintenant };
  const reussites = n.reussitesDeSuite + 1;
  if (reussites >= REUSSITES_POUR_ANCRER) return { ...n, statut: 'ancree', reussitesDeSuite: reussites, prochaineRevue: undefined, majLe: maintenant };
  return { ...n, statut: 'a_revoir', reussitesDeSuite: reussites, prochaineRevue: jourPlus(aujourdHui, DELAIS_JOURS[reussites - 1] ?? 6), majLe: maintenant };
}

export const notionDue = (n: Notion, aujourdHui: string): boolean => n.statut === 'a_revoir' && (!n.prochaineRevue || n.prochaineRevue <= aujourdHui);
