/** Matières en double (« Infectio » / « Infectiologie ») : suggestions à confirmer, fusion manuelle, retour en arrière. */
import { GitMerge, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { suggererFusions, type Fusion } from '../../shared/fusions';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Bouton, Carte, STYLE_CHAMP } from './ui';

const RAISON = {
  nom: 'leurs noms se ressemblent',
  contenu: 'leurs chapitres se ressemblent',
  nom_et_contenu: 'leurs noms et leurs chapitres se ressemblent',
} as const;

export function FusionsMatieres() {
  const d = useDonnees();
  const fusions = d.reglages.fusionsMatieres ?? [];
  const ignorees = d.reglages.fusionsIgnorees ?? [];
  const suggestions = useMemo(() => suggererFusions(d.matieres, d.chapitres, fusions, ignorees), [d.matieres, d.chapitres, fusions, ignorees]);
  const [de, setDe] = useState('');
  const [vers, setVers] = useState('');
  const nom = (id: string) => d.matiereParId.get(id)?.nom ?? id;
  const nbChapitres = (id: string) => d.chapitresParMatiere.get(id)?.length ?? 0;

  const fusionner = (f: Fusion) =>
    enregistrer('reglages', { ...d.reglages, fusionsMatieres: [...fusions.filter((x) => x.de !== f.de), { ...f, nom: f.nom ?? nom(f.de) }] });
  const ignorer = (a: string, b: string) => enregistrer('reglages', { ...d.reglages, fusionsIgnorees: [...ignorees, `${a}|${b}`] });
  const defaire = (f: Fusion) => enregistrer('reglages', { ...d.reglages, fusionsMatieres: fusions.filter((x) => x.de !== f.de) });

  if (suggestions.length === 0 && fusions.length === 0 && d.matieres.length < 2) return null;

  return (
    <div className="mb-5 space-y-3">
      {suggestions.map((s) => (
        <Carte key={`${s.de}|${s.vers}`}>
          <div className="flex items-start gap-3">
            <GitMerge size={20} className="mt-0.5 shrink-0 text-accent-clair" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                « {nom(s.de)} » et « {nom(s.vers)} » sont peut-être la même matière
              </p>
              <p className="mt-1 text-xs text-muet">
                {RAISON[s.raison]} ({nbChapitres(s.de)} et {nbChapitres(s.vers)} chapitres
                {s.similitude > 0 ? `, ${Math.round(s.similitude * 100)} % de vocabulaire commun` : ''}).
                {s.communs.length > 0 && <> Chapitres proches : {s.communs.join(' · ')}.</>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Bouton variante="primaire" icone={GitMerge} className="min-h-9" onClick={() => void fusionner({ de: s.de, vers: s.vers })}>
                  Fusionner sous « {nom(s.vers)} »
                </Bouton>
                <Bouton variante="discret" className="min-h-9" onClick={() => void ignorer(s.de, s.vers)}>
                  Deux matières différentes
                </Bouton>
              </div>
            </div>
          </div>
        </Carte>
      ))}

      <details className="carte p-4 text-sm">
        <summary className="cursor-pointer font-medium">Matières en double ? Fusionner à la main</summary>
        <p className="mt-2 text-xs text-muet">
          Les chapitres, questions, fiches, partiels et résultats de la première matière passent dans la seconde. Rien n'est effacé : tu peux défaire la fusion.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-texte-2">
            Matière à absorber
            <select value={de} onChange={(e) => setDe(e.target.value)} className={STYLE_CHAMP}>
              <option value="">Choisis…</option>
              {d.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
          <label className="text-xs text-texte-2">
            Matière à garder
            <select value={vers} onChange={(e) => setVers(e.target.value)} className={STYLE_CHAMP}>
              <option value="">Choisis…</option>
              {d.matieres.filter((m) => m.id !== de).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
        </div>
        <Bouton icone={GitMerge} className="mt-3" disabled={!de || !vers || de === vers} onClick={() => { void fusionner({ de, vers }); setDe(''); setVers(''); }}>
          Fusionner
        </Bouton>

        {fusions.length > 0 && (
          <ul className="mt-4 divide-y divide-grille">
            {fusions.map((f) => (
              <li key={f.de} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">« {f.nom ?? f.de} » → « {nom(f.vers)} »</span>
                <Bouton variante="discret" icone={Undo2} className="min-h-9" onClick={() => void defaire(f)}>Défaire</Bouton>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
