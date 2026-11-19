/**
 * Cours, en trois niveaux pour que tout reste clair :
 *  1. le semestre (on coche Semestre 1, Semestre 2…) ;
 *  2. les matières de ce semestre, sous forme de cartes ;
 *  3. les chapitres d'une matière (page dédiée), avec statut, avancement et badges.
 */
import { FusionsMatieres } from '../composants/FusionsMatieres';
import { ArrowLeft, BookOpen, FilePen, FolderOpen, RefreshCw, Search, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StatutChapitre } from '../../shared/progression';
import { LIBELLE_STATUT } from '../../shared/progression';
import type { Chapitre, Matiere } from '../../shared/types';
import {
  EtatVide,
  Jauge,
  Onglets,
  LienBouton,
  Pastille,
  PastilleStatut,
  Puce,
  STYLE_CHAMP,
  TitrePage,
  nombre,
  pourcent,
} from '../composants/ui';
import { ExportPdfMatiere } from '../composants/ExportPdf';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';

const STATUTS: StatutChapitre[] = ['a_commencer', 'en_cours', 'a_revoir', 'acquis'];
const CLE_SEMESTRE = 'dr-rodier:semestre';

type Selection = string; // '1', '2'… ou 'autres'

const parOrdre = (a: Matiere, b: Matiere) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr');

function lireSemestreMemorise(): string | undefined {
  try {
    return localStorage.getItem(CLE_SEMESTRE) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Semestre d'une matière sous forme de sélection (« autres » quand le Drive n'en indique pas). */
const selectionDe = (m: Matiere): Selection => (m.semestre ? String(m.semestre) : 'autres');

// ---------------------------------------------------------------------------
// Niveau 1 et 2 : semestre → matières
// ---------------------------------------------------------------------------

export function Cours() {
  const d = useDonnees();
  const [params, setParams] = useSearchParams();
  const [recherche, setRecherche] = useState('');

  const matieres = useMemo(() => [...d.matieres].sort(parOrdre), [d.matieres]);
  // Les matières encore vides (import en cours) n'encombrent pas l'écran.
  const avecChapitres = matieres.filter((m) => (d.chapitresParMatiere.get(m.id) ?? []).length > 0);
  const selections = useMemo(() => {
    const vues = new Set(avecChapitres.map(selectionDe));
    const numeros = [...vues].filter((s) => s !== 'autres').sort((a, b) => Number(a) - Number(b));
    return [...numeros, ...(vues.has('autres') ? ['autres'] : [])];
  }, [avecChapitres]);

  const demandee = params.get('s') ?? lireSemestreMemorise();
  const choix: Selection | undefined = demandee && selections.includes(demandee) ? demandee : selections[0];

  useEffect(() => {
    if (choix) {
      try {
        localStorage.setItem(CLE_SEMESTRE, choix);
      } catch {
        // Sans stockage, le choix ne dure que la session.
      }
    }
  }, [choix]);

  if (d.estVide) {
    return (
      <EtatVide icone={BookOpen} titre="Aucun cours importé">
        Les chapitres apparaîtront ici après l'import de ton Google Drive (Réglages).
      </EtatVide>
    );
  }
  if (!choix) {
    return (
      <EtatVide icone={BookOpen} titre="Import en cours">
        Les matières et leurs chapitres apparaîtront ici au fur et à mesure de l'import.
      </EtatVide>
    );
  }

  const visibles = avecChapitres.filter((m) => selectionDe(m) === choix);
  const cherche = recherche.trim().toLowerCase();
  const resultats = cherche
    ? visibles.flatMap((m) =>
        (d.chapitresParMatiere.get(m.id) ?? []).filter((c) => c.titre.toLowerCase().includes(cherche)).map((c) => ({ m, c })),
      )
    : [];
  const libelle = (s: Selection) => (s === 'autres' ? 'Autres' : `Semestre ${s}`);
  const nbChapitres = visibles.reduce((n, m) => n + (d.chapitresParMatiere.get(m.id)?.length ?? 0), 0);

  return (
    <div>
      <TitrePage
        titre="Cours"
        sousTitre={`${libelle(choix)} · ${visibles.length} matière${visibles.length > 1 ? 's' : ''} · ${nbChapitres} chapitres`}
        action={<LienBouton to="/avancement" variante="discret" className="min-h-9 px-3">Mon avancement</LienBouton>}
      />

      <FusionsMatieres />

      {selections.length > 1 && (
        <div className="mb-4">
          <Onglets<string>
            libelle="Semestre"
            valeur={choix}
            onChange={(s) => setParams({ s }, { replace: true })}
            options={selections.map((s) => ({ valeur: s, libelle: libelle(s), compte: avecChapitres.filter((m) => selectionDe(m) === s).length }))}
          />
        </div>
      )}

      <label className="relative mb-5 block">
        <span className="sr-only">Rechercher un chapitre de ce semestre</span>
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muet" aria-hidden />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={`Rechercher un chapitre (${libelle(choix).toLowerCase()})`}
          className={`${STYLE_CHAMP} pl-9`}
        />
      </label>

      {cherche ? (
        resultats.length === 0 ? (
          <EtatVide icone={Search} titre="Aucun chapitre trouvé">Essaie un autre mot, ou change de semestre.</EtatVide>
        ) : (
          <ul className="space-y-2">
            {resultats.map(({ m, c }) => (
              <li key={c.id}>
                <Link
                  to={`/chapitre/${c.id}`}
                  className="carte carte-vive flex items-center gap-3 p-3.5"
                  style={{ borderLeft: `3px solid ${couleurMatiere(m.id).accent}` }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.titre}</span>
                    <span className="text-xs text-muet">{m.nom}</span>
                  </span>
                  <PastilleStatut statut={d.stats.get(c.id)?.statut ?? 'a_commencer'} />
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((m) => {
            const chapitres = d.chapitresParMatiere.get(m.id) ?? [];
            const sm = d.statsMatiere.get(m.id);
            const prediction = d.predictions.get(m.id);
            const c = couleurMatiere(m.id);
            const nouveaux = chapitres.filter((x) => x.nouveau).length;
            const aValider = chapitres.filter((x) => x.majEnAttente).length;
            return (
              <li key={m.id}>
                <Link
                  to={`/cours/${m.id}`}
                  className="carte carte-vive flex h-full flex-col gap-3 p-4 hover:bg-surface-2"
                  style={{ borderTop: `3px solid ${c.accent}` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: c.fond }}>
                      <FolderOpen size={20} style={{ color: c.accent }} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold">{m.nom}</h2>
                      <p className="chiffres text-xs text-muet">
                        {chapitres.length} chapitre{chapitres.length > 1 ? 's' : ''} · {sm?.nbAcquis ?? 0} acquis
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {nouveaux > 0 && (
                      <Pastille ton="accent" icone={Sparkles}>
                        {nouveaux} nouveau{nouveaux > 1 ? 'x' : ''}
                      </Pastille>
                    )}
                    {aValider > 0 && (
                      <Pastille ton="alerte" icone={FilePen}>
                        {aValider} mise{aValider > 1 ? 's' : ''} à jour à valider
                      </Pastille>
                    )}
                  </div>
                  <div className="mt-auto">
                    <div className="chiffres mb-1.5 flex items-center justify-between text-xs text-muet">
                      <span>{prediction ? `Note prévue ${nombre(prediction.note, 1)}/20` : 'Avancement'}</span>
                      <span className="text-texte-2">{pourcent(sm?.avancement ?? 0)}</span>
                    </div>
                    <Jauge valeur={sm?.avancement ?? 0} libelle={`Avancement de ${m.nom}`} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Niveau 3 : les chapitres d'une matière
// ---------------------------------------------------------------------------

function CarteChapitre({ c }: { c: Chapitre }) {
  const d = useDonnees();
  const s = d.stats.get(c.id);
  const couleur = couleurMatiere(c.matiereId);
  return (
    <Link
      to={`/chapitre/${c.id}`}
      className="carte carte-vive flex h-full flex-col gap-3 p-4 hover:bg-surface-2"
      style={{ borderTop: `3px solid ${couleur.accent}` }}
    >
      <div className="flex flex-wrap gap-1.5">
        <PastilleStatut statut={s?.statut ?? 'a_commencer'} />
        {c.nouveau && (
          <Pastille ton="accent" icone={Sparkles}>
            Nouveau
          </Pastille>
        )}
        {(d.actualisationsParChapitre.get(c.id) ?? []).some((a) => a.changements.some((x) => x.importance === 'majeure')) && (
          <Pastille ton="accent" icone={RefreshCw}>
            Actualisé
          </Pastille>
        )}
        {c.majEnAttente && (
          <Pastille ton="alerte" icone={FilePen}>
            Mise à jour à valider
          </Pastille>
        )}
      </div>
      <h3 className="flex-1 text-sm leading-snug font-medium">{c.titre}</h3>
      <div>
        <div className="chiffres mb-1.5 flex items-center justify-between text-xs text-muet">
          <span className="flex items-center gap-3">
            <span>{s?.nbQuestions ?? 0} questions</span>
            {!!s?.nbIncontournables && (
              <span className="flex items-center gap-1">
                <Star size={12} aria-hidden />
                {s.nbIncontournables} incontournable{s.nbIncontournables > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span className="text-texte-2">{pourcent(s?.avancement ?? 0)}</span>
        </div>
        <Jauge valeur={s?.avancement ?? 0} libelle={`Avancement de ${c.titre}`} />
      </div>
    </Link>
  );
}

export function CoursMatiere() {
  const d = useDonnees();
  const { matiereId } = useParams();
  const navigate = useNavigate();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<StatutChapitre | undefined>();

  const matiere = matiereId ? d.matiereParId.get(matiereId) : undefined;
  if (!matiere) {
    return (
      <EtatVide icone={BookOpen} titre="Matière introuvable">
        <Link to="/cours" className="text-accent-clair underline">
          Retour aux cours
        </Link>
      </EtatVide>
    );
  }

  const sm = d.statsMatiere.get(matiere.id);
  const prediction = d.predictions.get(matiere.id);
  const c = couleurMatiere(matiere.id);
  const semestre = selectionDe(matiere);
  const cherche = recherche.trim().toLowerCase();
  const chapitres = [...(d.chapitresParMatiere.get(matiere.id) ?? [])]
    .sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr'))
    .filter((ch) => (!filtre || d.stats.get(ch.id)?.statut === filtre) && (!cherche || ch.titre.toLowerCase().includes(cherche)));
  // Les autres matières du même semestre, pour passer de l'une à l'autre sans revenir en arrière.
  const voisines = [...d.matieres].filter((m) => selectionDe(m) === semestre && (d.chapitresParMatiere.get(m.id)?.length ?? 0) > 0).sort(parOrdre);

  return (
    <div>
      <Link
        to={`/cours?s=${semestre}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-accent-clair hover:underline"
      >
        <ArrowLeft size={15} aria-hidden /> {semestre === 'autres' ? 'Autres matières' : `Semestre ${semestre}`}
      </Link>
      <TitrePage
        titre={matiere.nom}
        sousTitre={`${chapitres.length} chapitre${chapitres.length > 1 ? 's' : ''} · ${sm?.nbAcquis ?? 0} acquis · ${pourcent(sm?.avancement ?? 0)} d'avancement${prediction ? ` · note prévue ${nombre(prediction.note, 1)}/20` : ''}`}
      />
      <div className="mb-4 h-1 w-24 rounded-full" style={{ background: c.accent }} aria-hidden />

      <div className="mb-4">
        <ExportPdfMatiere matiere={matiere} chapitres={d.chapitresParMatiere.get(matiere.id) ?? []} />
      </div>

      {voisines.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Autres matières du semestre">
          {voisines.map((m) => (
            <Puce key={m.id} actif={m.id === matiere.id} onClick={() => navigate(`/cours/${m.id}`)}>
              {m.nom}
            </Puce>
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Rechercher un chapitre</span>
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muet" aria-hidden />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un chapitre"
            className={`${STYLE_CHAMP} pl-9`}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATUTS.map((s) => (
            <Puce key={s} actif={filtre === s} onClick={() => setFiltre(filtre === s ? undefined : s)}>
              {LIBELLE_STATUT[s]}
            </Puce>
          ))}
        </div>
      </div>

      {chapitres.length === 0 ? (
        <EtatVide icone={Search} titre="Aucun chapitre">
          Aucun chapitre ne correspond à ta recherche ou à ton filtre.
        </EtatVide>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {chapitres.map((ch) => (
            <li key={ch.id}>
              <CarteChapitre c={ch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
