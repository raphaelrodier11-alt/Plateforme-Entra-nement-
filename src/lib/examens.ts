import { matieresExamen } from '../../shared/examens';
import type { Donnees } from '../etat/calcul';
import type { Examen } from '../../shared/types';

/** Noms des matières d'un partiel, pour l'affichage (« Cardiologie », « Cardiologie, Néphrologie », « 4 matières »). */
export function nomMatieresExamen(d: Pick<Donnees, 'matiereParId'>, x: Pick<Examen, 'matiereId' | 'matiereIds'>): string | undefined {
  const noms = matieresExamen(x).map((id) => d.matiereParId.get(id)?.nom).filter((n): n is string => !!n);
  if (noms.length === 0) return undefined;
  return noms.length <= 2 ? noms.join(', ') : `${noms.length} matières`;
}
