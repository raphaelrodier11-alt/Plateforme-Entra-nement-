/** Création ou modification d'un partiel : nom, jour, horaires et matières au programme. */
import { CalendarPlus, Check } from 'lucide-react';
import { useState } from 'react';
import { matieresExamen } from '../../shared/examens';
import { cleJour } from '../../shared/dates';
import type { Examen } from '../../shared/types';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Puce, STYLE_CHAMP } from './ui';

export function FormulaireExamen({ initial, onFini }: { initial?: Examen; onFini?: (examen: Examen) => void }) {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const [nom, setNom] = useState(initial?.titre ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [heure, setHeure] = useState(initial?.heure ?? '');
  const [heureFin, setHeureFin] = useState(initial?.heureFin ?? '');
  const [ids, setIds] = useState<string[]>(initial ? matieresExamen(initial) : []);
  const bascule = (id: string) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const valide = !!date && (!heureFin || !!heure);

  const enregistrerExamen = async () => {
    const { matiereId: _a, matiereIds: _b, heure: _c, heureFin: _e, ...reste } = initial ?? ({} as Partial<Examen>);
    const examen: Examen = {
      ...reste,
      id: initial?.id ?? `exam-${crypto.randomUUID()}`,
      titre: nom.trim().slice(0, 60) || 'Partiel',
      date,
      source: initial?.source ?? 'manuel',
      ...(ids[0] ? { matiereId: ids[0], matiereIds: ids } : {}),
      ...(heure ? { heure } : {}),
      ...(heure && heureFin ? { heureFin } : {}),
    };
    await enregistrer('examens', examen);
    if (!initial) {
      setNom('');
      setDate('');
      setHeure('');
      setHeureFin('');
      setIds([]);
    }
    onFini?.(examen);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muet">Nom du partiel</span>
        <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} placeholder="Partiel final, CC, rattrapage…" className={STYLE_CHAMP} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Jour</span>
          <input type="date" value={date} min={initial ? undefined : aujourdHui} onChange={(e) => setDate(e.target.value)} className={STYLE_CHAMP} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Début (facultatif)</span>
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={STYLE_CHAMP} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Fin (facultatif)</span>
          <input type="time" value={heureFin} min={heure || undefined} disabled={!heure} onChange={(e) => setHeureFin(e.target.value)} className={STYLE_CHAMP} />
        </label>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-muet">Matières au programme (aucune cochée : partiel général)</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matières au programme">
          {d.matieres.map((m) => (
            <Puce key={m.id} actif={ids.includes(m.id)} onClick={() => bascule(m.id)}>{m.nom}</Puce>
          ))}
        </div>
      </div>
      <Bouton variante="primaire" icone={initial ? Check : CalendarPlus} disabled={!valide} onClick={() => void enregistrerExamen()}>
        {initial ? 'Enregistrer les modifications' : 'Enregistrer ce partiel'}
      </Bouton>
    </div>
  );
}
