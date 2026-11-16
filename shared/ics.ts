/**
 * Lecture d'un calendrier au format iCalendar (.ics), tel que le publie
 * iCloud pour un calendrier public.
 *
 * Les événements récurrents sont développés sur la fenêtre demandée, en
 * tenant compte des exceptions (EXDATE) et des occurrences modifiées
 * (RECURRENCE-ID).
 */
import ICAL from 'ical.js';
import type { Evenement } from './types';

/** Garde-fou contre les récurrences sans fin. */
const MAX_OCCURRENCES = 1500;

function instant(temps: ICAL.Time): number {
  return temps.toJSDate().getTime();
}

/**
 * Convertit le texte d'un fichier .ics en événements compris, au moins en
 * partie, dans l'intervalle [debut, fin] (millisecondes).
 */
export function lireIcs(texte: string, debut: number, fin: number): Evenement[] {
  const racine = new ICAL.Component(ICAL.parse(texte));

  // Les fuseaux décrits dans le fichier servent à convertir les heures locales.
  for (const fuseau of racine.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(fuseau);
  }

  const composants = racine.getAllSubcomponents('vevent');
  const principaux: ICAL.Event[] = [];
  const exceptions = new Map<string, ICAL.Event[]>();
  for (const composant of composants) {
    const evenement = new ICAL.Event(composant);
    if (evenement.isRecurrenceException()) {
      exceptions.set(evenement.uid, [...(exceptions.get(evenement.uid) ?? []), evenement]);
    } else {
      principaux.push(evenement);
    }
  }

  const resultat: Evenement[] = [];
  const ajouter = (id: string, titre: string, d: ICAL.Time, f: ICAL.Time) => {
    const debutMs = instant(d);
    let finMs = instant(f);
    if (finMs <= debutMs) finMs = debutMs + (d.isDate ? 86_400_000 : 0);
    if (finMs < debut || debutMs > fin) return;
    resultat.push({
      id,
      titre: titre || '(sans titre)',
      debut: debutMs,
      fin: finMs,
      journeeEntiere: d.isDate,
    });
  };

  for (const evenement of principaux) {
    if (evenement.component.getFirstPropertyValue('status') === 'CANCELLED') continue;

    if (!evenement.isRecurring()) {
      ajouter(evenement.uid, evenement.summary, evenement.startDate, evenement.endDate);
      continue;
    }

    for (const exception of exceptions.get(evenement.uid) ?? []) {
      evenement.relateException(exception);
    }
    const iterateur = evenement.iterator();
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const suivante = iterateur.next();
      if (!suivante) break;
      if (instant(suivante) > fin) break;
      const occurrence = evenement.getOccurrenceDetails(suivante);
      const statut = occurrence.item.component.getFirstPropertyValue('status');
      if (statut === 'CANCELLED') continue;
      ajouter(
        `${evenement.uid}@${occurrence.recurrenceId.toString()}`,
        occurrence.item.summary,
        occurrence.startDate,
        occurrence.endDate,
      );
    }
  }

  return resultat.sort((a, b) => a.debut - b.debut);
}

/** Les liens iCloud commencent par webcal:// ; le contenu se lit en https. */
export function urlIcsEnHttps(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, 'https://');
}
