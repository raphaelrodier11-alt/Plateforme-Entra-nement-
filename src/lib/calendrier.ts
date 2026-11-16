/**
 * Synchronisation du calendrier iCloud (sens unique : calendrier → app).
 *
 * Le lien .ics public est relu à l'ouverture de l'app, à chaque retour sur
 * l'app et toutes les 30 minutes. Le serveur ne fait que relayer le
 * fichier ; il est lu ici, puis les événements sont enregistrés localement
 * et partagés avec les autres appareils.
 */
import { JOUR_MS } from '../../shared/dates';
import { lireIcs } from '../../shared/ics';
import type { Evenement } from '../../shared/types';
import { base, ecrireMeta, lireMeta } from '../db/base';
import { enregistrerPlusieurs, lireEtatSync, supprimer } from '../db/sync';
import { ErreurApi, api } from './api';

const JOURS_PASSES = 7;
const JOURS_FUTURS = 240;
export const PERIODE_RELECTURE_MS = 30 * 60_000;
const META_DERNIERE = 'calendrier:derniere';

export type ResultatCalendrier =
  | { ok: true; nb: number }
  | { ok: false; raison: 'sans_serveur' | 'non_configure' | 'inaccessible' | 'illisible' | 'hors_ligne' };

export async function derniereLecture(): Promise<number | undefined> {
  return lireMeta<number>(META_DERNIERE);
}

function identique(a: Evenement, b: Evenement): boolean {
  return (
    a.titre === b.titre &&
    a.debut === b.debut &&
    a.fin === b.fin &&
    a.journeeEntiere === b.journeeEntiere
  );
}

/** Relit le calendrier et met à jour les événements enregistrés. */
export async function actualiserCalendrier(): Promise<ResultatCalendrier> {
  if (lireEtatSync().statut === 'local') return { ok: false, raison: 'sans_serveur' };

  let texte: string;
  try {
    texte = await (await api('/calendrier/ics')).text();
  } catch (e) {
    if (e instanceof ErreurApi) {
      return { ok: false, raison: e.statut === 404 ? 'non_configure' : 'inaccessible' };
    }
    return { ok: false, raison: 'hors_ligne' };
  }

  let lus: Evenement[];
  try {
    const maintenant = Date.now();
    lus = lireIcs(texte, maintenant - JOURS_PASSES * JOUR_MS, maintenant + JOURS_FUTURS * JOUR_MS);
  } catch {
    return { ok: false, raison: 'illisible' };
  }

  const table = base.collection<Evenement>('evenements');
  const connus = new Map((await table.toArray()).map((e) => [e.id, e]));
  const nouveaux = lus.filter((e) => {
    const connu = connus.get(e.id);
    return !connu || !identique(connu, e);
  });
  const idsLus = new Set(lus.map((e) => e.id));
  await enregistrerPlusieurs('evenements', nouveaux);
  for (const id of connus.keys()) {
    if (!idsLus.has(id)) await supprimer('evenements', id);
  }
  await ecrireMeta(META_DERNIERE, Date.now());
  return { ok: true, nb: lus.length };
}
