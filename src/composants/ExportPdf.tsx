/** Export des fiches en PDF : un chapitre, plusieurs chapitres cochés, ou toute une matière. */
import { Download, FileDown } from 'lucide-react';
import { useState } from 'react';
import type { Chapitre, Matiere } from '../../shared/types';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';
import { genererPdfFiches, nomDeFichier, telecharger } from '../lib/pdfFiche';
import { Bouton, Carte } from './ui';

function rgb(matiereId: string): [number, number, number] {
  // Les couleurs de matière sont en oklch : on rapproche par une teinte sûre pour le papier.
  const h = Number(/oklch\([^ ]+ [^ ]+ (\d+(?:\.\d+)?)/.exec(couleurMatiere(matiereId).accent)?.[1] ?? 215);
  const c = (n: number) => Math.round(255 * (0.5 + 0.35 * Math.cos(((h + n) * Math.PI) / 180)) * 0.9);
  return [c(0), c(120), c(240)];
}

/** Bouton d'un chapitre. */
export function ExportPdfChapitre({ chapitre }: { chapitre: Chapitre }) {
  const d = useDonnees();
  const [occupe, setOccupe] = useState(false);
  const fiche = d.ficheParChapitre.get(chapitre.id);
  if (!fiche) return null;
  const matiere = d.matiereParId.get(chapitre.matiereId);
  return (
    <Bouton
      variante="discret"
      icone={FileDown}
      className="min-h-9 px-3"
      disabled={occupe}
      onClick={async () => {
        setOccupe(true);
        try {
          const blob = await genererPdfFiches([fiche], { titre: chapitre.titre, sousTitre: matiere?.nom, couleur: rgb(chapitre.matiereId) });
          telecharger(blob, nomDeFichier(chapitre.titre));
        } finally {
          setOccupe(false);
        }
      }}
    >
      {occupe ? 'Création du PDF…' : 'PDF de la fiche'}
    </Bouton>
  );
}

/** Carte d'une matière : on coche les chapitres à inclure. */
export function ExportPdfMatiere({ matiere, chapitres }: { matiere: Matiere; chapitres: Chapitre[] }) {
  const d = useDonnees();
  const avecFiche = chapitres.filter((c) => d.ficheParChapitre.has(c.id));
  const [coches, setCoches] = useState<Set<string> | undefined>();
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  if (avecFiche.length === 0) return null;
  const choisis = coches ?? new Set(avecFiche.map((c) => c.id));

  const basculer = (id: string) => {
    const s = new Set(choisis);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setCoches(s);
  };

  const creer = async () => {
    setOccupe(true);
    try {
      const fiches = avecFiche.filter((c) => choisis.has(c.id)).map((c) => d.ficheParChapitre.get(c.id)!);
      const semestre = matiere.semestre ? `Semestre ${matiere.semestre}` : undefined;
      const blob = await genererPdfFiches(fiches, { titre: matiere.nom, sousTitre: semestre, couleur: rgb(matiere.id) });
      telecharger(blob, nomDeFichier(`${matiere.nom} fiches`));
    } finally {
      setOccupe(false);
    }
  };

  if (!ouvert) {
    return (
      <Bouton icone={FileDown} onClick={() => setOuvert(true)}>
        Exporter en PDF
      </Bouton>
    );
  }
  return (
    <Carte titre={<span className="flex items-center gap-2"><FileDown size={16} aria-hidden /> Exporter les fiches en PDF</span>}>
      <div className="mb-2 flex gap-2 text-xs">
        <button type="button" className="text-accent-clair underline" onClick={() => setCoches(new Set(avecFiche.map((c) => c.id)))}>Tout cocher</button>
        <button type="button" className="text-accent-clair underline" onClick={() => setCoches(new Set())}>Tout décocher</button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {avecFiche.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={choisis.has(c.id)} onChange={() => basculer(c.id)} className="size-5 shrink-0 accent-[#3987e5]" />
              <span className="min-w-0 flex-1 truncate">{c.titre}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Bouton variante="primaire" icone={Download} disabled={occupe || choisis.size === 0} onClick={() => void creer()}>
          {occupe ? 'Création du PDF…' : `Créer le PDF (${choisis.size} fiche${choisis.size > 1 ? 's' : ''})`}
        </Bouton>
        <Bouton variante="discret" onClick={() => setOuvert(false)}>Fermer</Bouton>
      </div>
    </Carte>
  );
}
