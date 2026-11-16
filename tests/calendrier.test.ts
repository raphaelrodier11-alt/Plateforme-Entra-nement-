import { describe, expect, it } from 'vitest';
import { devinerMatiere, examensAValider, titreEvoqueExamen } from '../shared/calendrier';
import { lireIcs, urlIcsEnHttps } from '../shared/ics';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//iCloud//FR
BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:stage-1
SUMMARY:Stage cardiologie
DTSTART;TZID=Europe/Paris:20261117T083000
DTEND;TZID=Europe/Paris:20261117T123000
END:VEVENT
BEGIN:VEVENT
UID:td-hebdo
SUMMARY:TD sémiologie
DTSTART;TZID=Europe/Paris:20261116T140000
DTEND;TZID=Europe/Paris:20261116T160000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Paris:20261123T140000
END:VEVENT
BEGIN:VEVENT
UID:td-hebdo
RECURRENCE-ID;TZID=Europe/Paris:20261130T140000
SUMMARY:TD sémiologie (déplacé)
DTSTART;TZID=Europe/Paris:20261130T160000
DTEND;TZID=Europe/Paris:20261130T180000
END:VEVENT
BEGIN:VEVENT
UID:partiel-1
SUMMARY:Partiel Néphrologie
DTSTART;VALUE=DATE:20261215
DTEND;VALUE=DATE:20261216
END:VEVENT
BEGIN:VEVENT
UID:vieux
SUMMARY:Ancien cours
DTSTART;TZID=Europe/Paris:20250110T100000
DTEND;TZID=Europe/Paris:20250110T120000
END:VEVENT
END:VCALENDAR`;

const debut = new Date(2026, 10, 1).getTime();
const fin = new Date(2027, 0, 31).getTime();

describe('lecture du calendrier .ics', () => {
  const evenements = lireIcs(ICS, debut, fin);

  it('convertit les heures locales du fuseau du fichier', () => {
    const stage = evenements.find((e) => e.id === 'stage-1')!;
    expect(new Date(stage.debut).toISOString()).toBe('2026-11-17T07:30:00.000Z');
    expect(new Date(stage.fin).toISOString()).toBe('2026-11-17T11:30:00.000Z');
    expect(stage.journeeEntiere).toBe(false);
  });

  it('développe les récurrences, retire les exceptions et applique les occurrences modifiées', () => {
    const td = evenements.filter((e) => e.id.startsWith('td-hebdo'));
    expect(td.map((e) => new Date(e.debut).toISOString())).toEqual([
      '2026-11-16T13:00:00.000Z',
      '2026-11-30T15:00:00.000Z',
      '2026-12-07T13:00:00.000Z',
    ]);
    expect(td[1]!.titre).toBe('TD sémiologie (déplacé)');
  });

  it('repère les événements sur la journée entière', () => {
    const partiel = evenements.find((e) => e.id === 'partiel-1')!;
    expect(partiel.journeeEntiere).toBe(true);
  });

  it('écarte les événements hors de la fenêtre', () => {
    expect(evenements.some((e) => e.id === 'vieux')).toBe(false);
  });

  it('lit les liens webcal:// en https', () => {
    expect(urlIcsEnHttps(' webcal://p12-caldav.icloud.com/published/2/abc ')).toBe(
      'https://p12-caldav.icloud.com/published/2/abc',
    );
  });
});

describe('reconnaissance des examens', () => {
  const motsCles = ['examen', 'partiel'];

  it('reconnaît un mot-clé sans tenir compte de la casse ni des accents', () => {
    expect(titreEvoqueExamen('PARTIEL Néphrologie', motsCles)).toBe(true);
    expect(titreEvoqueExamen('Examen blanc de cardio', motsCles)).toBe(true);
    expect(titreEvoqueExamen('TD sémiologie', motsCles)).toBe(false);
  });

  it('devine la matière à partir du titre', () => {
    const matieres = [
      { id: 'cardio', nom: 'Cardiologie' },
      { id: 'nephro', nom: 'Néphrologie' },
    ];
    expect(devinerMatiere('Partiel Néphrologie', matieres)).toBe('nephro');
    expect(devinerMatiere('Examen cardio', matieres)).toBe('cardio');
    expect(devinerMatiere('Partiel', matieres)).toBeUndefined();
  });

  it('propose à la validation les examens à venir ni ajoutés ni écartés', () => {
    const evenements = lireIcs(ICS, debut, fin);
    const reglages = { motsClesExamen: motsCles, evenementsIgnores: [] as string[] };
    const maintenant = new Date(2026, 10, 16).getTime();

    expect(examensAValider(evenements, [], reglages, maintenant).map((e) => e.id)).toEqual([
      'partiel-1',
    ]);
    expect(examensAValider(evenements, [{ evenementId: 'partiel-1' }], reglages, maintenant)).toEqual([]);
    expect(
      examensAValider(evenements, [], { ...reglages, evenementsIgnores: ['partiel-1'] }, maintenant),
    ).toEqual([]);
  });
});
