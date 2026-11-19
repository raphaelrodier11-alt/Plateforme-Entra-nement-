import { describe, expect, it } from 'vitest';
import { HEURE_MS, MINUTE_MS, instantDuJour, joursEntre } from '../shared/dates';
import {
  calculerPlanning,
  placerSeances,
  soustraire,
  type ChapitrePlanifiable,
  type EntreePlanning,
} from '../shared/planning';
import { REGLAGES_DEFAUT, type Evenement } from '../shared/types';

/** Lundi 16 novembre 2026, 7 h, heure de Paris. */
const MAINTENANT = new Date(2026, 10, 16, 7, 0).getTime();

const chapitre = (
  id: string,
  matiereId: string,
  avancement = 0,
  poidsExamen = 0.5,
): ChapitrePlanifiable => ({
  id,
  matiereId,
  avancement,
  couverture: avancement > 0 ? 1 : 0,
  poidsExamen,
});

const evenement = (jour: string, debut: number, fin: number, titre = 'Stage'): Evenement => ({
  id: `${jour}-${debut}`,
  titre,
  debut: instantDuJour(jour, debut),
  fin: instantDuJour(jour, fin),
  journeeEntiere: false,
});

const entree = (partiel: Partial<EntreePlanning>): EntreePlanning => ({
  maintenant: MAINTENANT,
  disponibilites: [],
  heuresCreneaux: REGLAGES_DEFAUT.heuresCreneaux,
  evenements: [],
  examens: [],
  chapitres: [],
  ...partiel,
});

const minutesDuChapitre = (planning: ReturnType<typeof calculerPlanning>, id: string) =>
  planning.seances
    .flatMap((s) => s.taches)
    .filter((t) => t.chapitreId === id)
    .reduce((s, t) => s + t.dureeMin, 0);

describe('plages libres', () => {
  it('retire un événement au milieu d\'une plage', () => {
    expect(soustraire([0, 100], [[40, 60]])).toEqual([
      [0, 40],
      [60, 100],
    ]);
  });

  it('ignore les événements hors de la plage et gère les recouvrements', () => {
    expect(soustraire([0, 100], [[200, 300]])).toEqual([[0, 100]]);
    expect(soustraire([0, 100], [[-10, 30], [20, 50]])).toEqual([[50, 100]]);
    expect(soustraire([0, 100], [[0, 100]])).toEqual([]);
  });
});

describe('placement des séances', () => {
  it('crée une séance par créneau coché, avec la durée demandée', () => {
    const { seances } = placerSeances(
      entree({
        disponibilites: [
          { id: '2026-11-16', creneaux: { matin: 90, soir: 60 } },
          { id: '2026-11-18', creneaux: { apres_midi: 120 } },
        ],
      }),
    );
    expect(seances.map((s) => [s.date, s.creneau, s.debutMin, s.dureeMin])).toEqual([
      ['2026-11-16', 'matin', 8 * 60, 90],
      ['2026-11-16', 'soir', 18 * 60, 60],
      ['2026-11-18', 'apres_midi', 14 * 60, 120],
    ]);
  });

  it('ne planifie rien dans le passé ni au-delà de l\'horizon', () => {
    const { seances } = placerSeances(
      entree({
        horizonJours: 7,
        disponibilites: [
          { id: '2026-11-15', creneaux: { matin: 60 } },
          { id: '2026-11-22', creneaux: { matin: 60 } },
          { id: '2026-11-23', creneaux: { matin: 60 } },
        ],
      }),
    );
    expect(seances.map((s) => s.date)).toEqual(['2026-11-22']);
  });

  it('un créneau déjà entamé démarre à l\'heure courante', () => {
    const { seances } = placerSeances(
      entree({
        maintenant: new Date(2026, 10, 16, 9, 12).getTime(),
        disponibilites: [{ id: '2026-11-16', creneaux: { matin: 60 } }],
      }),
    );
    expect(seances[0]).toMatchObject({ debutMin: 9 * 60 + 15, dureeMin: 60 });
  });

  it('la durée ne dépasse jamais la plage du créneau', () => {
    const { seances } = placerSeances(
      entree({ disponibilites: [{ id: '2026-11-17', creneaux: { midi: 300 } }] }),
    );
    expect(seances[0]!.dureeMin).toBe(120);
  });
});

describe('événements du calendrier', () => {
  it('décale la séance dans le temps libre du créneau', () => {
    const { seances } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 60 } }],
        evenements: [evenement('2026-11-17', 8, 10, 'TP anatomie')],
      }),
    );
    expect(seances).toHaveLength(1);
    expect(seances[0]).toMatchObject({
      date: '2026-11-17',
      creneau: 'matin',
      debutMin: 10 * 60,
      dureeMin: 60,
      decalee: { evenement: 'TP anatomie' },
    });
  });

  it('déplace la séance vers le créneau libre le plus proche si la plage est occupée', () => {
    const ev = evenement('2026-11-17', 8, 12, 'Stage');
    const { seances, alertes } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 90 } }],
        evenements: [ev],
      }),
    );
    expect(alertes).toEqual([]);
    expect(seances).toHaveLength(1);
    expect(seances[0]).toMatchObject({
      date: '2026-11-17',
      creneau: 'midi',
      dureeMin: 90,
      deplacee: { date: '2026-11-17', creneau: 'matin', evenement: 'Stage' },
    });
    // La séance déplacée ne chevauche pas l'événement.
    const debut = instantDuJour('2026-11-17', 0) + seances[0]!.debutMin * MINUTE_MS;
    expect(debut).toBeGreaterThanOrEqual(ev.fin);
  });

  it('garde la partie qui tient et déplace le reste', () => {
    const { seances } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 120 } }],
        evenements: [evenement('2026-11-17', 9, 12)],
      }),
    );
    const total = seances.reduce((s, x) => s + x.dureeMin, 0);
    expect(total).toBe(120);
    expect(seances[0]).toMatchObject({ creneau: 'matin', debutMin: 8 * 60, dureeMin: 60 });
    expect(seances[1]).toMatchObject({ dureeMin: 60, deplacee: { creneau: 'matin' } });
  });

  it('ne place jamais deux séances au même moment', () => {
    const { seances } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 120, midi: 120 } }],
        evenements: [evenement('2026-11-17', 8, 12)],
      }),
    );
    const plages = seances.map((s) => [s.debutMin, s.debutMin + s.dureeMin] as const);
    for (let i = 0; i < plages.length; i++) {
      for (let j = i + 1; j < plages.length; j++) {
        const chevauche = plages[i]![0] < plages[j]![1] && plages[j]![0] < plages[i]![1];
        expect(seances[i]!.date === seances[j]!.date && chevauche).toBe(false);
      }
    }
    expect(seances.reduce((s, x) => s + x.dureeMin, 0)).toBe(240);
  });

  it('un événement sur la journée entière ne bloque pas les révisions', () => {
    const { seances } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 60 } }],
        evenements: [
          {
            id: 'x',
            titre: 'Anniversaire',
            debut: instantDuJour('2026-11-17', 0),
            fin: instantDuJour('2026-11-18', 0),
            journeeEntiere: true,
          },
        ],
      }),
    );
    expect(seances[0]).toMatchObject({ creneau: 'matin', debutMin: 480 });
    expect(seances[0]!.deplacee).toBeUndefined();
  });

  it('signale la séance si aucun créneau libre n\'existe dans la semaine', () => {
    const occupe: Evenement = {
      id: 'long',
      titre: 'Stage à l\'étranger',
      debut: instantDuJour('2026-11-17', 0),
      fin: instantDuJour('2026-11-17', 0) + 10 * 24 * HEURE_MS,
      journeeEntiere: false,
    };
    const { seances, alertes } = placerSeances(
      entree({
        disponibilites: [{ id: '2026-11-17', creneaux: { matin: 60 } }],
        evenements: [occupe],
      }),
    );
    expect(seances).toHaveLength(0);
    expect(alertes).toEqual([
      {
        type: 'seance_non_replacee',
        date: '2026-11-17',
        creneau: 'matin',
        evenement: 'Stage à l\'étranger',
      },
    ]);
  });
});

describe('priorités du planning', () => {
  const semaine = [0, 1, 2, 3, 4].map((j) => ({
    id: `2026-11-${16 + j}`,
    creneaux: { soir: 60 },
  }));

  it('remplit chaque séance sans dépasser sa durée', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('a', 'cardio'), chapitre('b', 'nephro')],
      }),
    );
    expect(planning.seances).toHaveLength(5);
    for (const s of planning.seances) {
      const total = s.taches.reduce((x, t) => x + t.dureeMin, 0);
      expect(total).toBe(s.dureeMin);
    }
  });

  it('privilégie ce qui n\'est pas su', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('su', 'cardio', 0.9), chapitre('pas-su', 'cardio', 0.1)],
      }),
    );
    expect(planning.seances[0]!.taches[0]!.chapitreId).toBe('pas-su');
    expect(minutesDuChapitre(planning, 'pas-su')).toBeGreaterThan(
      minutesDuChapitre(planning, 'su'),
    );
  });

  it('à niveau égal, privilégie le chapitre le plus tombé aux examens', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('rare', 'cardio', 0.3, 0.1), chapitre('frequent', 'cardio', 0.3, 0.6)],
      }),
    );
    expect(planning.seances[0]!.taches[0]!.chapitreId).toBe('frequent');
    expect(minutesDuChapitre(planning, 'frequent')).toBeGreaterThan(
      minutesDuChapitre(planning, 'rare'),
    );
  });

  it('garde un équilibre entre les matières', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [
          chapitre('c1', 'cardio'),
          chapitre('c2', 'cardio'),
          chapitre('n1', 'nephro'),
          chapitre('n2', 'nephro'),
          chapitre('p1', 'pneumo'),
          chapitre('p2', 'pneumo'),
        ],
      }),
    );
    const minutes = Object.values(planning.minutesParMatiere);
    expect(minutes).toHaveLength(3);
    expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(30);
  });

  it('une matière très en retard reçoit plus de temps, sans exclure les autres', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('c1', 'cardio', 0.85), chapitre('n1', 'nephro', 0)],
      }),
    );
    expect(planning.minutesParMatiere.nephro).toBeGreaterThan(planning.minutesParMatiere.cardio!);
    expect(planning.minutesParMatiere.cardio).toBeGreaterThan(0);
  });

  it('donne la priorité à la matière dont l\'examen approche', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('c1', 'cardio', 0.3), chapitre('n1', 'nephro', 0.3)],
        examens: [
          { id: 'x1', matiereId: 'nephro', titre: 'Partiel', date: '2026-11-23', source: 'manuel' },
          { id: 'x2', matiereId: 'cardio', titre: 'Partiel', date: '2027-01-20', source: 'manuel' },
        ],
      }),
    );
    expect(planning.minutesParMatiere.nephro).toBeGreaterThan(planning.minutesParMatiere.cardio!);
  });

  it('accepte un partiel général, sans matière, sans rien casser', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('c1', 'cardio', 0.3)],
        examens: [{ id: 'x', titre: 'Partiel final', date: '2026-11-23', source: 'manuel' }],
      }),
    );
    expect(planning.seances.length).toBeGreaterThan(0);
    expect(planning.minutesParMatiere.cardio).toBeGreaterThan(0);
  });

  it('ne planifie plus une matière dont l\'examen est passé', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('c1', 'cardio'), chapitre('n1', 'nephro')],
        examens: [
          { id: 'x1', matiereId: 'nephro', titre: 'Partiel', date: '2026-11-10', source: 'manuel' },
        ],
      }),
    );
    expect(planning.minutesParMatiere.nephro).toBeUndefined();
    expect(planning.minutesParMatiere.cardio).toBeGreaterThan(0);
  });

  it('se recalcule quand la progression change', () => {
    const base = {
      disponibilites: semaine,
      chapitres: [chapitre('a', 'cardio', 0.2), chapitre('b', 'cardio', 0.2)],
    };
    const avant = calculerPlanning(entree(base));
    const apres = calculerPlanning(
      entree({ ...base, chapitres: [chapitre('a', 'cardio', 0.95), chapitre('b', 'cardio', 0.2)] }),
    );
    expect(minutesDuChapitre(apres, 'a')).toBeLessThan(minutesDuChapitre(avant, 'a'));
    expect(minutesDuChapitre(apres, 'b')).toBeGreaterThan(minutesDuChapitre(avant, 'b'));
  });

  it('place les erreurs à revoir en tête de la première séance du jour', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: [{ id: '2026-11-16', creneaux: { matin: 60, soir: 60 } }],
        chapitres: [chapitre('a', 'cardio')],
        echeancesErreurs: [MAINTENANT - HEURE_MS, MAINTENANT - 2 * HEURE_MS],
      }),
    );
    expect(planning.seances[0]!.taches[0]).toMatchObject({ type: 'erreurs', dureeMin: 15 });
    expect(planning.seances[0]!.taches[0]!.raison).toContain('2 erreurs');
    expect(planning.seances[1]!.taches.some((t) => t.type === 'erreurs')).toBe(false);
  });

  it('prévoit un examen blanc quelques jours avant l\'examen', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('c1', 'cardio', 0.5)],
        examens: [
          { id: 'x', matiereId: 'cardio', titre: 'Partiel', date: '2026-11-21', source: 'manuel' },
        ],
      }),
    );
    const blancs = planning.seances.filter((s) => s.taches.some((t) => t.type === 'examen_blanc'));
    expect(blancs).toHaveLength(1);
    expect(blancs[0]!.date).toBe('2026-11-19');
    // La veille : révision générale plutôt que découverte.
    const veille = planning.seances.find((s) => s.date === '2026-11-20')!;
    expect(veille.taches[0]!.type).toBe('revision_generale');
  });

  it('alerte quand aucune séance ne précède un examen', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: [{ id: '2026-11-20', creneaux: { soir: 60 } }],
        chapitres: [chapitre('c1', 'cardio')],
        examens: [
          { id: 'x', matiereId: 'cardio', titre: 'Partiel', date: '2026-11-18', source: 'manuel' },
        ],
      }),
    );
    expect(planning.alertes).toContainEqual({ type: 'sans_seance_avant_examen', examenId: 'x' });
  });

  it('signale l\'absence de disponibilités', () => {
    expect(calculerPlanning(entree({})).alertes).toEqual([{ type: 'aucune_disponibilite' }]);
  });

  it('le même état donne toujours le même planning', () => {
    const e = entree({
      disponibilites: semaine,
      chapitres: [chapitre('a', 'cardio', 0.2), chapitre('b', 'nephro', 0.4)],
      evenements: [evenement('2026-11-17', 18, 20)],
    });
    expect(calculerPlanning(e)).toEqual(calculerPlanning(e));
  });
});

describe('emploi du temps adaptatif et révision pure', () => {
  const semaine = [0, 1, 2, 3, 4].map((j) => ({ id: `2026-11-${16 + j}`, creneaux: { soir: 90 } }));

  it('donne plus de temps aux points faibles, sans oublier les points forts', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [
          { ...chapitre('faible', 'cardio', 0.1), maitrise: 0.1 },
          { ...chapitre('moyen', 'cardio', 0.5), maitrise: 0.55 },
          { ...chapitre('fort', 'cardio', 0.9), maitrise: 0.92 },
        ],
      }),
    );
    const faible = minutesDuChapitre(planning, 'faible');
    const moyen = minutesDuChapitre(planning, 'moyen');
    const fort = minutesDuChapitre(planning, 'fort');
    expect(faible).toBeGreaterThan(moyen);
    expect(moyen).toBeGreaterThanOrEqual(fort);
    expect(fort).toBeGreaterThan(0);
    expect(faible / (faible + moyen + fort)).toBeGreaterThan(0.45);
  });

  it('un chapitre que tu as déclaré maîtrisé passe après un chapitre jugé difficile et faible', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [
          { ...chapitre('declare-fort', 'cardio', 0), maitrise: 0.9, difficulte: 1 },
          { ...chapitre('declare-dur', 'cardio', 0), maitrise: 0.3, difficulte: 5 },
        ],
      }),
    );
    expect(planning.seances[0]!.taches[0]!.chapitreId).toBe('declare-dur');
  });

  it('en révision pure : aucune découverte, tâches précises qui varient, seulement la matière choisie', () => {
    const jours = ['2026-11-16', '2026-11-17', '2026-11-18'];
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        examens: [{ id: 'x', matiereId: 'cardio', titre: 'Partiel', date: '2026-11-19', source: 'manuel' }],
        chapitres: [
          { ...chapitre('a', 'cardio', 0), notionsDues: 2 },
          { ...chapitre('b', 'cardio', 0.3) },
          chapitre('autre', 'nephro', 0),
        ],
        revisionsPures: [{ id: 'p', debut: jours[0]!, fin: jours[2]!, matiereId: 'cardio' }],
      }),
    );
    const taches = planning.seances.filter((s) => jours.includes(s.date) && joursEntre(s.date, '2026-11-18') >= 0).flatMap((s) => s.taches);
    const types = new Set(taches.map((t) => t.type));
    expect(types.has('decouverte')).toBe(false);
    expect(taches.filter((t) => t.chapitreId).every((t) => t.matiereId === 'cardio')).toBe(true);
    expect([...types].some((t) => ['relecture_fiche', 'carnet', 'annales', 'interro_orale', 'flashcards'].includes(t))).toBe(true);
    expect(taches.some((t) => t.raison.includes('Révision pure'))).toBe(true);
  });

  it('hors de la période de révision pure, le planning reste normal', () => {
    const planning = calculerPlanning(
      entree({
        disponibilites: semaine,
        chapitres: [chapitre('a', 'cardio', 0)],
        revisionsPures: [{ id: 'p', debut: '2027-01-01', fin: '2027-01-10' }],
      }),
    );
    expect(planning.seances[0]!.taches.some((t) => t.type === 'decouverte')).toBe(true);
  });
});
