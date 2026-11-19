/** Réglages de l'emploi du temps : matières en priorité sur une période, et nombre de révisions voulues avant le partiel. */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { matieresExamen } from '../../shared/examens';
import { cleJour, jourLisible } from '../../shared/dates';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Carte, STYLE_CHAMP } from './ui';

export function PrioritesMatieres() {
  const d = useDonnees();
  const liste = d.reglages.priorites ?? [];
  const aujourdhui = cleJour(d.maintenant);
  const [matiereId, setMatiereId] = useState('');
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState(aujourdhui);
  const maj = (priorites: typeof liste) => enregistrer('reglages', { ...d.reglages, priorites });

  return (
    <Carte titre="Matières en priorité">
      <p className="text-sm text-texte-2">
        Choisis une matière à travailler en priorité entre deux dates : l'emploi du temps lui donne plus de place sur cette période, tout en gardant les autres matières.
      </p>
      {liste.length > 0 && (
        <ul className="mt-3 space-y-2">
          {liste.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl border border-bord bg-surface-2 p-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{d.matiereParId.get(p.matiereId)?.nom ?? 'Matière'}</span>
                <span className="block text-xs text-muet">du {jourLisible(p.debut)} au {jourLisible(p.fin)}</span>
              </span>
              <button type="button" aria-label="Supprimer cette priorité" onClick={() => void maj(liste.filter((x) => x.id !== p.id))} className="grid size-9 place-items-center rounded-xl text-texte-2 hover:bg-surface-3 hover:text-critique">
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
            <option value="">Choisis…</option>
            {d.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
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
      <Bouton icone={Plus} className="mt-3" disabled={!matiereId || !debut || !fin || debut > fin} onClick={() => void maj([...liste, { id: crypto.randomUUID(), matiereId, debut, fin }])}>
        Ajouter la priorité
      </Bouton>
    </Carte>
  );
}

const CHOIX = [1, 2, 3, 4, 5];

export function ObjectifsRevisions() {
  const d = useDonnees();
  const objectifs = d.reglages.objectifsRevisions ?? {};
  const concernees = d.matieres.filter((m) => d.examens.some((x) => matieresExamen(x).includes(m.id)));
  const matieres = concernees.length ? concernees : d.matieres;
  const changer = (id: string, n: number) => enregistrer('reglages', { ...d.reglages, objectifsRevisions: { ...objectifs, [id]: n } });

  if (matieres.length === 0) return null;
  return (
    <Carte titre="Révisions voulues avant le partiel">
      <p className="text-sm text-texte-2">
        Combien de passages sur le programme veux-tu avant le partiel ? L'emploi du temps finit le programme plus tôt pour te laisser le temps de réviser (1 : juste le programme ; 3 : programme fini aux deux tiers du temps, puis deux révisions).
      </p>
      <ul className="mt-3 divide-y divide-grille">
        {matieres.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{m.nom}</span>
            <div className="flex gap-1" role="group" aria-label={`Passages voulus pour ${m.nom}`}>
              {CHOIX.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={(objectifs[m.id] ?? 1) === n}
                  onClick={() => void changer(m.id, n)}
                  className={`size-9 rounded-lg border text-sm ${(objectifs[m.id] ?? 1) === n ? 'border-accent bg-accent-fond text-texte' : 'border-bord bg-surface text-texte-2'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Carte>
  );
}
