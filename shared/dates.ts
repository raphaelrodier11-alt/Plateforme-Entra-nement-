/**
 * Outils de dates. Un « jour » est une clé AAAA-MM-JJ en heure locale.
 */
export const MINUTE_MS = 60_000;
export const HEURE_MS = 3_600_000;
export const JOUR_MS = 86_400_000;

function deuxChiffres(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Clé AAAA-MM-JJ du jour local contenant l'instant donné. */
export function cleJour(instant: Date | number): string {
  const d = typeof instant === 'number' ? new Date(instant) : instant;
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

/** Minuit (heure locale) du jour désigné par la clé. */
export function dateDepuisCle(cle: string): Date {
  const [a, m, j] = cle.split('-').map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1);
}

export function ajouterJours(cle: string, n: number): string {
  const d = dateDepuisCle(cle);
  d.setDate(d.getDate() + n);
  return cleJour(d);
}

/** Nombre de jours de `a` à `b` (positif si `b` est après `a`). */
export function joursEntre(a: string, b: string): number {
  // Midi évite les décalages d'une heure aux changements d'heure.
  const da = dateDepuisCle(a);
  const db = dateDepuisCle(b);
  da.setHours(12);
  db.setHours(12);
  return Math.round((db.getTime() - da.getTime()) / JOUR_MS);
}

/** Instant (ms) correspondant à une heure décimale d'un jour local. */
export function instantDuJour(cle: string, heure: number): number {
  const d = dateDepuisCle(cle);
  d.setMinutes(Math.round(heure * 60));
  return d.getTime();
}

/** Lundi de la semaine contenant le jour donné. */
export function lundiDe(cle: string): string {
  const d = dateDepuisCle(cle);
  const decalage = (d.getDay() + 6) % 7;
  return ajouterJours(cle, -decalage);
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** « lun. 16 nov. » */
export function jourLisible(cle: string): string {
  const d = dateDepuisCle(cle);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** « 14 h 30 » à partir d'un nombre de minutes depuis minuit. */
export function heureLisible(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${deuxChiffres(m)}`;
}

/** « 1 h 30 » ou « 45 min ». */
export function dureeLisible(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${deuxChiffres(m)}`;
}
