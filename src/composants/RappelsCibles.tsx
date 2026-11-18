/** À la fin d'un QCM : les notions de tes erreurs, à relire tout de suite pour qu'elles s'ancrent. */
import { Brain } from 'lucide-react';
import { useEffect } from 'react';
import { cleNotion } from '../../shared/notions';
import type { Question, Session } from '../../shared/types';
import { useDonnees } from '../etat/donnees';
import { enregistrerNotionsDeLaSerie } from '../lib/notions';
import { CarteNotion } from './CarteNotion';
import { Carte } from './ui';

export function RappelsCibles({ session, ratees }: { session: Session; ratees: Question[] }) {
  const d = useDonnees();
  useEffect(() => {
    void enregistrerNotionsDeLaSerie(d, session, ratees);
    // Une seule création par série (garde dans la base).
  }, [session.id, ratees.length]);

  const cles = new Set(ratees.map(cleNotion));
  const notions = d.notions.filter((n) => cles.has(n.id));
  if (notions.length === 0) return null;
  return (
    <Carte className="mb-4" titre={<span className="flex items-center gap-2"><Brain size={16} aria-hidden /> Relis ça tout de suite</span>}>
      <p className="mb-3 text-sm text-texte-2">
        Les notions de tes erreurs, avec le rappel de cours. Relis-les maintenant : c'est le meilleur moment pour les ancrer. Elles sont gardées dans « À revoir » pour les retrouver.
      </p>
      <ul className="space-y-2">
        {notions.map((n, i) => (
          <CarteNotion key={n.id} notion={n} ouvertParDefaut={i === 0} />
        ))}
      </ul>
    </Carte>
  );
}
