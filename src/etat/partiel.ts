/** Où en est-on par rapport aux partiels : jour J (arrêt cardiaque) ou partiel tout juste fini (mode bravo). */
import { useState } from 'react';
import { dernierFini, phaseExamen } from '../../shared/examens';
import type { Examen } from '../../shared/types';
import { useDonnees } from './donnees';

const CLE = 'dr-rodier:bravo-vu:';

const dejaVu = (id: string): boolean => {
  try {
    return localStorage.getItem(CLE + id) === '1';
  } catch {
    return false;
  }
};

export function useSituationPartiel(): { arret?: Examen; fini?: Examen; bravo?: Examen; fermerBravo: () => void } {
  const d = useDonnees();
  const [, relire] = useState(0);
  const arret = d.examens.find((x) => phaseExamen(x, d.maintenant) === 'jour_j');
  const fini = dernierFini(d.examens, d.maintenant, 2);
  const bravo = !arret && fini && !dejaVu(fini.id) ? fini : undefined;
  const fermerBravo = () => {
    if (!fini) return;
    try {
      localStorage.setItem(CLE + fini.id, '1');
    } catch {
      // Le bandeau reviendra à la prochaine ouverture.
    }
    relire((n) => n + 1);
  };
  return { arret, fini, bravo, fermerBravo };
}
