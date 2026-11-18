/** Carnet « À revoir » : les notions que tu ne maîtrises pas encore, à relire et à tester. */
import { Brain } from 'lucide-react';
import { useState } from 'react';
import { cleJour } from '../../shared/dates';
import { notionDue } from '../../shared/notions';
import { CarteNotion } from '../composants/CarteNotion';
import { EtatVide, Onglets, Puce, TitrePage } from '../composants/ui';
import { useDonnees } from '../etat/donnees';

type Vue = 'dues' | 'toutes' | 'ancrees';

export function ARevoir() {
  const d = useDonnees();
  const jour = cleJour(d.maintenant);
  const [vue, setVue] = useState<Vue>('dues');
  const [matiereId, setMatiereId] = useState<string | undefined>();

  const parMatiere = d.notions.filter((n) => !matiereId || n.matiereId === matiereId);
  const dues = parMatiere.filter((n) => notionDue(n, jour));
  const aRevoir = parMatiere.filter((n) => n.statut === 'a_revoir');
  const ancrees = parMatiere.filter((n) => n.statut === 'ancree');
  const liste = (vue === 'dues' ? dues : vue === 'toutes' ? aRevoir : ancrees).sort((a, b) => b.majLe - a.majLe);
  const matieres = d.matieres.filter((m) => d.notions.some((n) => n.matiereId === m.id));

  return (
    <div className="space-y-4">
      <TitrePage titre="À revoir" sousTitre="Les notions de cours que tu ne maîtrises pas encore. Relis, teste-toi, et elles sortent d'ici une fois ancrées." />
      <Onglets<Vue>
        libelle="Notions"
        valeur={vue}
        onChange={setVue}
        options={[
          { valeur: 'dues', libelle: 'À relire', compte: dues.length },
          { valeur: 'toutes', libelle: 'Toutes', compte: aRevoir.length },
          { valeur: 'ancrees', libelle: 'Ancrées', compte: ancrees.length },
        ]}
      />
      {matieres.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matière">
          <Puce actif={!matiereId} onClick={() => setMatiereId(undefined)}>Toutes</Puce>
          {matieres.map((m) => (
            <Puce key={m.id} actif={matiereId === m.id} onClick={() => setMatiereId(m.id)}>{m.nom}</Puce>
          ))}
        </div>
      )}
      {liste.length === 0 ? (
        <EtatVide icone={Brain} titre={d.notions.length === 0 ? 'Rien à revoir pour l’instant' : vue === 'dues' ? 'Tout est à jour' : 'Aucune notion ici'}>
          {d.notions.length === 0
            ? 'Après chaque QCM, les notions de tes erreurs arrivent ici avec leur rappel de cours.'
            : vue === 'dues'
              ? 'Aucune relecture n’est due aujourd’hui. Bravo !'
              : 'Rien dans cette liste.'}
        </EtatVide>
      ) : (
        <ul className="space-y-2">
          {liste.map((n, i) => (
            <CarteNotion key={n.id} notion={n} ouvertParDefaut={i === 0 && vue === 'dues'} />
          ))}
        </ul>
      )}
    </div>
  );
}
