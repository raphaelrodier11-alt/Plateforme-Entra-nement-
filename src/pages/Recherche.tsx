/** Recherche dans tous tes cours, fiches, questions, flashcards et documents. */
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FileText, Layers, ListChecks, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { rechercher, type Resultat, type TypeResultat } from '../../shared/recherche';
import type { DocumentBiblio } from '../../shared/types';
import { EtatVide, STYLE_CHAMP, TitrePage } from '../composants/ui';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';

const TITRES: Record<TypeResultat, { libelle: string; icone: typeof Search }> = {
  chapitre: { libelle: 'Chapitres', icone: BookOpen },
  fiche: { libelle: 'Fiches', icone: FileText },
  question: { libelle: 'Questions', icone: ListChecks },
  flashcard: { libelle: 'Flashcards', icone: Layers },
  document: { libelle: 'Bibliothèque', icone: Sparkles },
};

function lien(r: Resultat): string {
  if (r.type === 'document') return '/assistant?vue=biblio';
  if (r.type === 'flashcard') return `/chapitre/${r.chapitreId}/flashcards`;
  return `/chapitre/${r.chapitreId}`;
}

export function Recherche() {
  const d = useDonnees();
  const [params, setParams] = useSearchParams();
  const [saisie, setSaisie] = useState(params.get('q') ?? '');
  const documents = useLiveQuery(() => base.collection<DocumentBiblio>('documents').toArray(), []) ?? [];

  const resultats = useMemo(
    () => rechercher(saisie, { matieres: d.matieres, chapitres: d.chapitres, fiches: d.fiches, questions: d.questions, flashcards: d.flashcards, documents }),
    [saisie, d, documents],
  );
  const groupes = (Object.keys(TITRES) as TypeResultat[])
    .map((t) => ({ t, liste: resultats.filter((r) => r.type === t) }))
    .filter((g) => g.liste.length > 0);

  return (
    <div>
      <TitrePage titre="Recherche" sousTitre="Dans tous tes cours, fiches, questions, flashcards et documents." />
      <label className="relative mb-5 block">
        <span className="sr-only">Rechercher</span>
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muet" aria-hidden />
        <input
          type="search"
          autoFocus
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
          }}
          placeholder="Ex. : filtration glomérulaire, insuffisance cardiaque…"
          className={`${STYLE_CHAMP} min-h-12 pl-11 text-base`}
        />
      </label>

      {saisie.trim().length < 2 ? (
        <EtatVide icone={Search} titre="Cherche n'importe quoi">
          Un mot, une notion, une phrase : l'appli fouille tes chapitres, tes fiches, tes questions et ta bibliothèque, même hors connexion.
        </EtatVide>
      ) : groupes.length === 0 ? (
        <EtatVide icone={Search} titre="Aucun résultat">
          Essaie un autre mot, ou demande au Dr Rodier : il connaît aussi ce qui n'est pas dans tes cours.
        </EtatVide>
      ) : (
        <div className="space-y-6">
          {groupes.map(({ t, liste }) => {
            const Icone = TITRES[t].icone;
            return (
              <section key={t}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-texte-2">
                  <Icone size={15} aria-hidden /> {TITRES[t].libelle} <span className="chiffres text-muet">{liste.length}</span>
                </h2>
                <ul className="space-y-2">
                  {liste.map((r) => {
                    const c = couleurMatiere(r.matiereId);
                    return (
                      <li key={`${r.type}-${r.id}`}>
                        <Link to={lien(r)} className="carte carte-vive block p-3.5" style={{ borderLeft: `3px solid ${c.accent}` }}>
                          <p className="text-sm leading-snug font-medium">{r.titre}</p>
                          {r.extrait && <p className="mt-1 line-clamp-2 text-xs text-texte-2">{r.extrait}</p>}
                          {r.matiereId && <p className="mt-1 text-[11px] text-muet">{d.matiereParId.get(r.matiereId)?.nom}</p>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
