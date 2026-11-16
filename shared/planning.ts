/**
 * Planning intelligent.
 *
 * Le planning est une fonction pure de l'état courant (disponibilités,
 * examens, événements du calendrier, progression). Il est donc recalculé à
 * chaque progrès, sans rien mémoriser.
 *
 * Étape 1 — placer les séances : chaque créneau coché devient une séance.
 * Si un événement du calendrier occupe la plage, la séance est décalée dans
 * le temps libre du créneau, sinon déplacée vers le créneau libre le plus
 * proche (elle n'est jamais perdue silencieusement).
 *
 * Étape 2 — remplir les séances : chaque bloc de travail va au chapitre dont
 * le score est le plus élevé. Le score combine ce qui n'est pas su, la
 * fréquence aux examens, la proximité de l'examen et un frein qui équilibre
 * le temps entre les matières.
 */
import {
  MINUTE_MS,
  ajouterJours,
  cleJour,
  instantDuJour,
  joursEntre,
} from './dates';
import { CRENEAUX } from './types';
import type { Creneau, Disponibilite, Evenement, Examen, Reglages } from './types';

/** Durée d'un bloc de travail sur un chapitre. */
export const BLOC_MIN = 30;
/** En dessous de cette durée, une séance n'est pas planifiée. */
export const SEANCE_MIN = 20;
export const DUREE_ERREURS_MIN = 15;
export const DUREE_EXAMEN_BLANC_MIN = 60;
export const HORIZON_DEFAUT_JOURS = 21;
/** Nombre de jours explorés pour replacer une séance chassée par un événement. */
export const RECHERCHE_DEPLACEMENT_JOURS = 7;
/** Un chapitre acquis garde un besoin minimal : il revient de temps en temps. */
const BESOIN_PLANCHER = 0.08;

export interface ChapitrePlanifiable {
  id: string;
  matiereId: string;
  /** Part du chapitre actuellement sue (0 à 1). */
  avancement: number;
  /** Part des questions déjà tentées (0 = jamais travaillé). */
  couverture: number;
  /** Part du chapitre dans les partiels de sa matière. */
  poidsExamen: number;
}

export type TypeTachePlanning =
  | 'decouverte'
  | 'qcm'
  | 'erreurs'
  | 'examen_blanc'
  | 'revision_generale';

export interface TachePlanifiee {
  type: TypeTachePlanning;
  matiereId?: string;
  chapitreId?: string;
  dureeMin: number;
  raison: string;
}

export interface Seance {
  id: string;
  date: string;
  creneau: Creneau;
  /** Début en minutes depuis minuit (heure locale). */
  debutMin: number;
  dureeMin: number;
  taches: TachePlanifiee[];
  /** Séance déplacée depuis un autre créneau à cause d'un événement. */
  deplacee?: { date: string; creneau: Creneau; evenement: string };
  /** Séance décalée à l'intérieur de son créneau à cause d'un événement. */
  decalee?: { evenement: string };
}

export type AlertePlanning =
  | { type: 'aucune_disponibilite' }
  | { type: 'sans_seance_avant_examen'; examenId: string }
  | { type: 'seance_non_replacee'; date: string; creneau: Creneau; evenement: string };

export interface Planning {
  seances: Seance[];
  minutesParMatiere: Record<string, number>;
  alertes: AlertePlanning[];
}

export interface EntreePlanning {
  maintenant: number;
  horizonJours?: number;
  disponibilites: Disponibilite[];
  heuresCreneaux: Reglages['heuresCreneaux'];
  evenements: Evenement[];
  examens: Examen[];
  chapitres: ChapitrePlanifiable[];
  /** Échéances (ms) des erreurs suivies en répétition espacée. */
  echeancesErreurs?: number[];
}

type Intervalle = [number, number];

/** Retire des plages occupées d'un intervalle ; renvoie les plages libres. */
export function soustraire(base: Intervalle, occupes: Intervalle[]): Intervalle[] {
  let libres: Intervalle[] = [base];
  for (const [debut, fin] of occupes) {
    const suivants: Intervalle[] = [];
    for (const [a, b] of libres) {
      if (fin <= a || debut >= b) {
        suivants.push([a, b]);
        continue;
      }
      if (debut > a) suivants.push([a, debut]);
      if (fin < b) suivants.push([fin, b]);
    }
    libres = suivants;
  }
  return libres;
}

function minutesDepuisMinuit(instant: number, jour: string): number {
  return Math.round((instant - instantDuJour(jour, 0)) / MINUTE_MS);
}

function arrondi5(minutes: number): number {
  return Math.floor(minutes / 5) * 5;
}

interface Demande {
  date: string;
  creneau: Creneau;
  minutes: number;
}

interface SeancePlacee extends Seance {
  debut: number;
  fin: number;
}

/** Étape 1 : transforme les créneaux cochés en séances, en évitant les événements. */
export function placerSeances(e: EntreePlanning): {
  seances: SeancePlacee[];
  alertes: AlertePlanning[];
} {
  const aujourdHui = cleJour(e.maintenant);
  const horizon = e.horizonJours ?? HORIZON_DEFAUT_JOURS;
  const dernierJour = ajouterJours(aujourdHui, horizon - 1);
  // On ne planifie pas avant « maintenant », arrondi aux 5 minutes suivantes.
  const plancher = Math.ceil(e.maintenant / (5 * MINUTE_MS)) * 5 * MINUTE_MS;

  const evenements = e.evenements
    .filter((ev) => !ev.journeeEntiere && ev.fin > e.maintenant)
    .sort((a, b) => a.debut - b.debut);
  const plagesEvenements: Intervalle[] = evenements.map((ev) => [ev.debut, ev.fin]);
  const plagesSeances: Intervalle[] = [];

  const fenetre = (date: string, creneau: Creneau): Intervalle | undefined => {
    const [h1, h2] = e.heuresCreneaux[creneau];
    const debut = Math.max(instantDuJour(date, h1), plancher);
    const fin = instantDuJour(date, h2);
    return fin - debut >= SEANCE_MIN * MINUTE_MS ? [debut, fin] : undefined;
  };

  const evenementSur = (plage: Intervalle): string | undefined =>
    evenements.find((ev) => ev.debut < plage[1] && ev.fin > plage[0])?.titre;

  const seances: SeancePlacee[] = [];
  const alertes: AlertePlanning[] = [];
  const aDeplacer: (Demande & { evenement: string })[] = [];

  const ajouter = (
    date: string,
    creneau: Creneau,
    debut: number,
    minutes: number,
    extra: Partial<Seance>,
  ) => {
    const fin = debut + minutes * MINUTE_MS;
    plagesSeances.push([debut, fin]);
    seances.push({
      id: `${date}:${creneau}`,
      date,
      creneau,
      debutMin: minutesDepuisMinuit(debut, date),
      dureeMin: minutes,
      taches: [],
      debut,
      fin,
      ...extra,
    });
  };

  const demandes: Demande[] = [];
  for (const dispo of e.disponibilites) {
    if (dispo.id < aujourdHui || dispo.id > dernierJour) continue;
    for (const creneau of CRENEAUX) {
      const minutes = dispo.creneaux[creneau] ?? 0;
      if (minutes > 0) demandes.push({ date: dispo.id, creneau, minutes });
    }
  }
  demandes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      CRENEAUX.indexOf(a.creneau) - CRENEAUX.indexOf(b.creneau),
  );

  for (const d of demandes) {
    const plage = fenetre(d.date, d.creneau);
    if (!plage) continue; // créneau déjà passé
    const voulu = Math.min(d.minutes, arrondi5((plage[1] - plage[0]) / MINUTE_MS));
    const evenement = evenementSur(plage);
    const libres = soustraire(plage, [...plagesEvenements, ...plagesSeances]);

    const assezGrand = libres.find(([a, b]) => b - a >= voulu * MINUTE_MS);
    if (assezGrand) {
      const decalee = assezGrand[0] > plage[0] && evenement ? { decalee: { evenement } } : {};
      ajouter(d.date, d.creneau, assezGrand[0], voulu, decalee);
      continue;
    }

    // Pas assez de place : on garde ce qui tient, le reste est déplacé.
    const plusGrand = [...libres].sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
    const place = plusGrand ? arrondi5((plusGrand[1] - plusGrand[0]) / MINUTE_MS) : 0;
    let reste = voulu;
    if (plusGrand && place >= SEANCE_MIN) {
      ajouter(d.date, d.creneau, plusGrand[0], place, evenement ? { decalee: { evenement } } : {});
      reste = voulu - place;
    }
    if (evenement && reste >= SEANCE_MIN) {
      aDeplacer.push({ date: d.date, creneau: d.creneau, minutes: reste, evenement });
    }
  }

  // Séances chassées par un événement : créneau libre le plus proche.
  for (const d of aDeplacer) {
    const indice = CRENEAUX.indexOf(d.creneau);
    const candidats: { date: string; creneau: Creneau }[] = [
      ...CRENEAUX.slice(indice + 1).map((creneau) => ({ date: d.date, creneau })),
      ...CRENEAUX.slice(0, indice).reverse().map((creneau) => ({ date: d.date, creneau })),
    ];
    for (let j = 1; j <= RECHERCHE_DEPLACEMENT_JOURS; j++) {
      const date = ajouterJours(d.date, j);
      for (const creneau of CRENEAUX) candidats.push({ date, creneau });
    }

    let replacee = false;
    for (const c of candidats) {
      const plage = fenetre(c.date, c.creneau);
      if (!plage) continue;
      const libres = soustraire(plage, [...plagesEvenements, ...plagesSeances]);
      const libre = libres.find(([a, b]) => b - a >= d.minutes * MINUTE_MS);
      if (!libre) continue;
      ajouter(c.date, c.creneau, libre[0], d.minutes, {
        id: `${c.date}:${c.creneau}:depuis:${d.date}:${d.creneau}`,
        deplacee: { date: d.date, creneau: d.creneau, evenement: d.evenement },
      });
      replacee = true;
      break;
    }
    if (!replacee) {
      alertes.push({
        type: 'seance_non_replacee',
        date: d.date,
        creneau: d.creneau,
        evenement: d.evenement,
      });
    }
  }

  seances.sort((a, b) => a.debut - b.debut);
  return { seances, alertes };
}

/** Proximité d'examen : 1 loin de l'examen, jusqu'à 2,5 la veille, 0 après. */
function urgence(
  matiereId: string,
  dateSeance: string,
  examensParMatiere: Map<string, string[]>,
  desExamensExistent: boolean,
): number {
  const dates = examensParMatiere.get(matiereId);
  if (!dates) return desExamensExistent ? 0.7 : 1;
  const jours = dates
    .map((d) => joursEntre(dateSeance, d))
    .filter((j) => j >= 0)
    .sort((a, b) => a - b)[0];
  if (jours === undefined) return 0; // tous les examens de la matière sont passés
  return 1 + 1.5 * Math.exp(-jours / 7);
}

function joursAvantExamen(
  matiereId: string,
  dateSeance: string,
  examensParMatiere: Map<string, string[]>,
): number | undefined {
  return (examensParMatiere.get(matiereId) ?? [])
    .map((d) => joursEntre(dateSeance, d))
    .filter((j) => j >= 0)
    .sort((a, b) => a - b)[0];
}

export function calculerPlanning(e: EntreePlanning): Planning {
  const { seances, alertes } = placerSeances(e);
  const aujourdHui = cleJour(e.maintenant);

  if (e.disponibilites.every((d) => Object.values(d.creneaux).every((m) => !m))) {
    alertes.push({ type: 'aucune_disponibilite' });
  }

  const examensFuturs = e.examens.filter((x) => joursEntre(aujourdHui, x.date) >= 0);
  const examensParMatiere = new Map<string, string[]>();
  for (const x of e.examens) {
    examensParMatiere.set(x.matiereId, [...(examensParMatiere.get(x.matiereId) ?? []), x.date]);
  }
  const desExamensExistent = examensFuturs.length > 0;

  const matieresAvecChapitres = new Set(e.chapitres.map((c) => c.matiereId));
  const maxPoids = new Map<string, number>();
  for (const c of e.chapitres) {
    maxPoids.set(c.matiereId, Math.max(maxPoids.get(c.matiereId) ?? 0, c.poidsExamen));
  }

  // Examen blanc : une séance assez longue, de préférence 2 à 6 jours avant.
  const examenBlancDe = new Map<string, Examen>();
  for (const x of examensFuturs) {
    if (!matieresAvecChapitres.has(x.matiereId)) continue;
    const candidates = seances.filter((s) => {
      const j = joursEntre(s.date, x.date);
      return j >= 1 && j <= 6 && s.dureeMin >= 45 && !examenBlancDe.has(s.id);
    });
    const preferees = candidates.filter((s) => joursEntre(s.date, x.date) >= 2);
    const choisie = (preferees.length ? preferees : candidates).at(-1);
    if (choisie) examenBlancDe.set(choisie.id, x);
  }

  for (const x of examensFuturs) {
    const avant = seances.some((s) => joursEntre(s.date, x.date) >= 0);
    if (!avant) alertes.push({ type: 'sans_seance_avant_examen', examenId: x.id });
  }

  const simule = new Map(e.chapitres.map((c) => [c.id, c.avancement]));
  const minutesParMatiere: Record<string, number> = {};
  const echeances = [...(e.echeancesErreurs ?? [])].sort((a, b) => a - b);
  let curseurErreurs = 0;
  let dernierJourErreurs = '';

  for (const seance of seances) {
    let reste = seance.dureeMin;
    const taches: TachePlanifiee[] = [];

    // Répétition espacée : en tête de la première séance de chaque jour.
    if (seance.date !== dernierJourErreurs) {
      const finJour = instantDuJour(seance.date, 24);
      let dues = 0;
      while (curseurErreurs + dues < echeances.length && echeances[curseurErreurs + dues]! <= finJour) {
        dues += 1;
      }
      if (dues > 0) {
        const duree = Math.min(DUREE_ERREURS_MIN, Math.max(5, arrondi5(reste / 2)));
        taches.push({
          type: 'erreurs',
          dureeMin: duree,
          raison: `${dues} erreur${dues > 1 ? 's' : ''} à revoir (répétition espacée)`,
        });
        reste -= duree;
        curseurErreurs += dues;
        dernierJourErreurs = seance.date;
      }
    }

    const examen = examenBlancDe.get(seance.id);
    if (examen && reste >= 30) {
      const duree = Math.min(reste, DUREE_EXAMEN_BLANC_MIN);
      const j = joursEntre(seance.date, examen.date);
      taches.push({
        type: 'examen_blanc',
        matiereId: examen.matiereId,
        dureeMin: duree,
        raison: `Examen dans ${j} jour${j > 1 ? 's' : ''} : entraînement en conditions réelles`,
      });
      minutesParMatiere[examen.matiereId] = (minutesParMatiere[examen.matiereId] ?? 0) + duree;
      reste -= duree;
    }

    const minutesChapitre = new Map<string, number>();
    while (reste >= 15 && e.chapitres.length > 0) {
      const bloc = reste >= BLOC_MIN + 15 ? BLOC_MIN : reste;

      let meilleur: ChapitrePlanifiable | undefined;
      let meilleurScore = 0;
      for (const c of e.chapitres) {
        const u = urgence(c.matiereId, seance.date, examensParMatiere, desExamensExistent);
        if (u === 0) continue;
        const besoin = Math.max(BESOIN_PLANCHER, 1 - (simule.get(c.id) ?? 0));
        const frequence = c.poidsExamen / (maxPoids.get(c.matiereId) || 1);
        const equilibre = 1 / (1 + (minutesParMatiere[c.matiereId] ?? 0) / 60);
        let score = besoin * (0.6 + 0.4 * frequence) * u * equilibre;
        // Pas plus d'une heure d'affilée sur le même chapitre.
        if ((minutesChapitre.get(c.id) ?? 0) >= 2 * BLOC_MIN) score *= 0.25;
        if (score > meilleurScore) {
          meilleur = c;
          meilleurScore = score;
        }
      }
      if (!meilleur) break;

      const c = meilleur;
      const jours = joursAvantExamen(c.matiereId, seance.date, examensParMatiere);
      const avancement = simule.get(c.id) ?? 0;
      const jamaisVu = c.couverture === 0 && avancement === 0;
      const frequent = c.poidsExamen >= (maxPoids.get(c.matiereId) ?? 0) * 0.8;

      let type: TypeTachePlanning = jamaisVu ? 'decouverte' : 'qcm';
      const motifs: string[] = [];
      if (jours !== undefined && jours <= 1) {
        type = 'revision_generale';
        motifs.push(jours === 0 ? "Jour de l'examen" : "Veille d'examen");
      } else {
        motifs.push(jamaisVu ? 'Jamais travaillé' : `Su à ${Math.round(avancement * 100)} %`);
        if (frequent) motifs.push('tombe souvent aux partiels');
        if (jours !== undefined) motifs.push(`examen dans ${jours} j`);
      }

      const precedente = taches.at(-1);
      if (precedente && precedente.chapitreId === c.id && precedente.type === type) {
        precedente.dureeMin += bloc;
      } else {
        taches.push({
          type,
          matiereId: c.matiereId,
          chapitreId: c.id,
          dureeMin: bloc,
          raison: motifs.join(' · '),
        });
      }

      // Le travail prévu fait baisser le besoin : le plan passe aux suivants.
      simule.set(c.id, avancement + (1 - avancement) * 0.3 * (bloc / BLOC_MIN));
      minutesChapitre.set(c.id, (minutesChapitre.get(c.id) ?? 0) + bloc);
      minutesParMatiere[c.matiereId] = (minutesParMatiere[c.matiereId] ?? 0) + bloc;
      reste -= bloc;
    }

    seance.taches = taches;
  }

  return {
    seances: seances.map(({ debut: _debut, fin: _fin, ...s }) => s),
    minutesParMatiere,
    alertes,
  };
}
