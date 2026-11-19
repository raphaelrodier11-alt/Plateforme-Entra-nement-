/** Ajout d'une matière à la main : un nom et un semestre, sans lien de Drive. */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { idMatiere } from '../../shared/matieres';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Carte, STYLE_CHAMP } from './ui';

const SEMESTRES = [1, 2, 3, 4, 5, 6, 7, 8];

export function MatieresManuelles() {
  const d = useDonnees();
  const liste = d.reglages.matieresManuelles ?? [];
  const [nom, setNom] = useState('');
  const [semestre, setSemestre] = useState(liste.at(-1)?.semestre ?? d.matieres.find((m) => m.semestre)?.semestre ?? 5);
  const id = idMatiere(nom);
  const existe = d.matieres.some((m) => m.id === id);
  const valide = nom.trim().length >= 2 && !existe;

  const maj = (matieresManuelles: typeof liste) => enregistrer('reglages', { ...d.reglages, matieresManuelles });

  return (
    <Carte titre="Ajouter une matière">
      <p className="text-sm text-texte-2">
        Donne le nom et le semestre : la matière existe tout de suite (partiels, priorités, planning). Envoie ensuite ses cours et ses annales ci-dessous en la choisissant : l'application en tire les chapitres, les fiches et les QCM comme pour les autres matières.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1 text-xs text-texte-2">
          Nom de la matière
          <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} placeholder="Ex. : Hématologie" className={STYLE_CHAMP} />
        </label>
        <label className="text-xs text-texte-2">
          Semestre
          <select value={semestre} onChange={(e) => setSemestre(Number(e.target.value))} className={STYLE_CHAMP}>
            {SEMESTRES.map((n) => <option key={n} value={n}>Semestre {n}</option>)}
          </select>
        </label>
        <Bouton icone={Plus} disabled={!valide} onClick={() => { void maj([...liste, { id, nom: nom.trim(), semestre }]); setNom(''); }}>
          Ajouter
        </Bouton>
      </div>
      {existe && nom.trim() && <p className="mt-2 text-xs text-alerte">Cette matière existe déjà.</p>}
      {liste.length > 0 && (
        <ul className="mt-3 divide-y divide-grille text-sm">
          {liste.map((m) => {
            const chapitres = d.chapitresParMatiere.get(m.id)?.length ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.nom}</span>
                  <span className="block text-xs text-muet">
                    Semestre {m.semestre} · {chapitres ? `${chapitres} chapitre${chapitres > 1 ? 's' : ''}` : 'en attente de fichiers'}
                  </span>
                </span>
                {chapitres === 0 && (
                  <button type="button" aria-label={`Retirer ${m.nom}`} onClick={() => void maj(liste.filter((x) => x.id !== m.id))} className="grid size-9 place-items-center rounded-lg text-muet hover:bg-surface-2 hover:text-critique">
                    <Trash2 size={16} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}
