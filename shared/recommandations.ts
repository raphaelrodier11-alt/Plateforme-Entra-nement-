/**
 * Recommandations de révision : quelques conseils concrets, classés par
 * importance, déduits de la progression, des erreurs et des examens à venir.
 */
import { cleJour, joursEntre, JOUR_MS } from './dates';
import type { StatsChapitre } from './progression';
import type { Examen, Session, Tentative, TypeErreur } from './types';

export type ActionRecommandee =
  | { type: 'erreurs' }
  | { type: 'chapitre'; chapitreId: string }
  | { type: 'examen_blanc'; matiereId: string }
  | { type: 'planning' }
  | { type: 'incontournables' };

export interface Recommandation {
  id: string;
  /** Plus la valeur est grande, plus le conseil est prioritaire. */
  priorite: number;
  titre: string;
  detail: string;
  action: ActionRecommandee;
}

export interface EntreeRecommandations {
  maintenant: number;
  stats: StatsChapitre[];
  titresChapitres: Map<string, string>;
  nomsMatieres: Map<string, string>;
  examens: Examen[];
  tentatives: Tentative[];
  sessions: Session[];
  erreursDues: number;
  incontournablesARevoir: number;
  aDesDisponibilites: boolean;
}

const CONSEIL_TYPE: Record<TypeErreur, { titre: string; detail: string }> = {
  inattention: {
    titre: "Tes erreurs sont surtout d'inattention",
    detail:
      'Relis chaque proposition en entier avant de valider et repère les négations, les « toujours » et les « jamais ».',
  },
  lacune: {
    titre: 'Tes erreurs viennent surtout de lacunes',
    detail:
      'Reprends la fiche du chapitre avant de refaire des QCM : le rappel de cours est affiché avec chaque erreur.',
  },
  piege: {
    titre: 'Tu tombes souvent dans les pièges',
    detail:
      'Travaille la liste des questions piégeuses et lis les encadrés « pièges » des fiches.',
  },
};

export function recommander(e: EntreeRecommandations): Recommandation[] {
  const liste: Recommandation[] = [];
  const aujourdHui = cleJour(e.maintenant);

  if (e.erreursDues > 0) {
    liste.push({
      id: 'erreurs_dues',
      priorite: 100,
      titre: `${e.erreursDues} erreur${e.erreursDues > 1 ? 's' : ''} à revoir aujourd'hui`,
      detail: 'La répétition espacée les a remises au programme : 10 à 15 minutes suffisent.',
      action: { type: 'erreurs' },
    });
  }

  if (!e.aDesDisponibilites) {
    liste.push({
      id: 'disponibilites',
      priorite: 60,
      titre: 'Coche tes disponibilités',
      detail: 'Le planning se construit à partir des jours et créneaux où tu peux réviser.',
      action: { type: 'planning' },
    });
  }

  // Examens proches : chapitres jamais travaillés et examen blanc à faire.
  for (const examen of e.examens) {
    const jours = joursEntre(aujourdHui, examen.date);
    if (jours < 0 || jours > 21 || !examen.matiereId) continue;
    const nom = e.nomsMatieres.get(examen.matiereId) ?? 'la matière';
    const chapitres = e.stats.filter((s) => s.matiereId === examen.matiereId);
    const jamais = chapitres.filter((s) => s.statut === 'a_commencer');
    if (jamais.length > 0) {
      const premier = [...jamais].sort((a, b) => b.poidsExamen - a.poidsExamen)[0]!;
      liste.push({
        id: `examen_chapitres:${examen.id}`,
        priorite: 95 - jours,
        titre: `Examen de ${nom} dans ${jours} jour${jours > 1 ? 's' : ''} : ${jamais.length} chapitre${jamais.length > 1 ? 's' : ''} jamais travaillé${jamais.length > 1 ? 's' : ''}`,
        detail: `Commence par « ${e.titresChapitres.get(premier.chapitreId) ?? 'le plus fréquent'} », le plus tombé aux partiels.`,
        action: { type: 'chapitre', chapitreId: premier.chapitreId },
      });
    }
    const blancRecent = e.sessions.some(
      (s) =>
        s.termine &&
        s.type === 'examen_blanc' &&
        s.matiereId === examen.matiereId &&
        e.maintenant - s.debut < 14 * JOUR_MS,
    );
    if (!blancRecent && chapitres.length > 0 && jours <= 14) {
      liste.push({
        id: `examen_blanc:${examen.id}`,
        priorite: 80 - jours,
        titre: `Fais un examen blanc de ${nom}`,
        detail: `L'examen est dans ${jours} jour${jours > 1 ? 's' : ''} et tu n'as pas fait d'examen blanc depuis deux semaines.`,
        action: { type: 'examen_blanc', matiereId: examen.matiereId },
      });
    }
  }

  // Chapitre le plus rentable : peu su et souvent tombé.
  const rentable = e.stats
    .filter((s) => s.statut !== 'acquis' && s.nbQuestions > 0)
    .map((s) => ({ s, gain: (1 - s.avancement) * s.poidsExamen }))
    .sort((a, b) => b.gain - a.gain)[0];
  if (rentable) {
    const s = rentable.s;
    liste.push({
      id: `rentable:${s.chapitreId}`,
      priorite: 70,
      titre: `Priorité : ${e.titresChapitres.get(s.chapitreId) ?? 'chapitre'}`,
      detail:
        s.nbOccurrencesAnnales > 0
          ? `Tombé ${s.nbOccurrencesAnnales} fois aux partiels et su à ${Math.round(s.avancement * 100)} %.`
          : `Su à ${Math.round(s.avancement * 100)} % seulement.`,
      action: { type: 'chapitre', chapitreId: s.chapitreId },
    });
  }

  const aRevoir = e.stats.filter((s) => s.statut === 'a_revoir');
  if (aRevoir.length > 0) {
    const pire = [...aRevoir].sort((a, b) => a.maitrise - b.maitrise)[0]!;
    liste.push({
      id: `a_revoir:${pire.chapitreId}`,
      priorite: 65,
      titre: `${aRevoir.length} chapitre${aRevoir.length > 1 ? 's' : ''} à revoir`,
      detail: `Le plus fragile : « ${e.titresChapitres.get(pire.chapitreId) ?? ''} » (${Math.round(pire.maitrise * 100)} % de réussite).`,
      action: { type: 'chapitre', chapitreId: pire.chapitreId },
    });
  }

  if (e.incontournablesARevoir > 0) {
    liste.push({
      id: 'incontournables',
      priorite: 55,
      titre: `${e.incontournablesARevoir} question${e.incontournablesARevoir > 1 ? 's' : ''} incontournable${e.incontournablesARevoir > 1 ? 's' : ''} pas encore réussie${e.incontournablesARevoir > 1 ? 's' : ''}`,
      detail: 'Elles sont tombées dans au moins deux partiels : ce sont les points les plus sûrs à gagner.',
      action: { type: 'incontournables' },
    });
  }

  // Type d'erreur dominant sur les 30 derniers jours.
  const recentes = e.tentatives.filter(
    (t) => t.typeErreur && e.maintenant - t.date < 30 * JOUR_MS,
  );
  if (recentes.length >= 8) {
    const compte: Record<TypeErreur, number> = { inattention: 0, lacune: 0, piege: 0 };
    for (const t of recentes) compte[t.typeErreur!] += 1;
    const [dominant, nombre] = (Object.entries(compte) as [TypeErreur, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    if (nombre / recentes.length >= 0.45) {
      liste.push({
        id: `type:${dominant}`,
        priorite: 50,
        titre: CONSEIL_TYPE[dominant].titre,
        detail: `${Math.round((nombre / recentes.length) * 100)} % de tes erreurs récentes. ${CONSEIL_TYPE[dominant].detail}`,
        action: { type: 'erreurs' },
      });
    }
  }

  return liste.sort((a, b) => b.priorite - a.priorite).slice(0, 6);
}
