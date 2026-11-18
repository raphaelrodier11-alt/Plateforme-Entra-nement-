/**
 * Révision pure : l'étudiant choisit une période (pour un partiel) pendant
 * laquelle le planning ne propose que de la révision, avec une checklist claire.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { cleJour, jourLisible } from '../../shared/dates';
import { Bouton, Carte, STYLE_CHAMP } from './ui';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { nouvelId } from '../lib/sessions';

export function PeriodesRevision() {
  const d = useDonnees();
  const periodes = d.reglages.revisionsPures ?? [];
  const aujourdhui = cleJour(d.maintenant);
  const prochain = d.examens
    .filter((e) => e.date >= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const [matiereId, setMatiereId] = useState(prochain?.matiereId ?? '');
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState(prochain?.date ?? aujourdhui);

  const maj = (liste: typeof periodes) => enregistrer('reglages', { ...d.reglages, revisionsPures: liste });
  const valide = debut && fin && debut <= fin;

  return (
    <Carte titre="Révision pure">
      <p className="text-sm text-texte-2">
        Choisis une période avant un partiel : le planning ne proposera plus que de la révision (carnet « À revoir »,
        fiches, annales, examen blanc chronométré, interro orale, flashcards), avec des tâches claires à cocher.
      </p>
      {periodes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {periodes.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl border border-bord bg-surface-2 p-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.matiereId ? (d.matiereParId.get(p.matiereId)?.nom ?? 'Matière') : 'Toutes les matières'}</span>
                <span className="block text-xs text-muet">
                  du {jourLisible(p.debut)} au {jourLisible(p.fin)}
                </span>
              </span>
              <button
                type="button"
                aria-label="Supprimer cette période"
                onClick={() => void maj(periodes.filter((x) => x.id !== p.id))}
                className="grid size-9 place-items-center rounded-xl text-texte-2 hover:bg-surface-3 hover:text-critique"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-texte-2">
          Matière
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} className={STYLE_CHAMP}>
            <option value="">Toutes</option>
            {d.matieres.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-texte-2">
          Du
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={STYLE_CHAMP} />
        </label>
        <label className="text-xs text-texte-2">
          Au
          <input type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} className={STYLE_CHAMP} />
        </label>
      </div>
      <Bouton
        icone={Plus}
        className="mt-3"
        disabled={!valide}
        onClick={() =>
          void maj([...periodes, { id: nouvelId(), debut, fin, ...(matiereId ? { matiereId } : {}) }])
        }
      >
        Ajouter la période
      </Bouton>
    </Carte>
  );
}
