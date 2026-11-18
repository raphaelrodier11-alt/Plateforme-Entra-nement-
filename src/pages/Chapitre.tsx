/**
 * Page d'un chapitre : fiche de révision, aides (mnémotechniques, schémas,
 * modèles 3D, flashcards) et questions d'annales.
 */
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FilePen,
  GitCompare,
  Layers,
  Minus,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { cleJour, jourLisible } from '../../shared/dates';
import { estIncontournable, nbPartiels } from '../../shared/marqueurs';
import type { Actualisation, BlocFiche, Changement } from '../../shared/types';
import { Suggestions } from '../composants/Suggestions';
import { NotesChapitre } from '../fiches/Annotations';
import { CarteMentale } from '../fiches/CarteMentale';
import { ExportPdfChapitre } from '../composants/ExportPdf';
import { ContexteChapitre } from '../composants/PublierContexte';
import { Complements } from '../fiches/Complements';
import {
  Bouton,
  EtatVide,
  Jauge,
  LienBouton,
  Onglets,
  Pastille,
  PastilleStatut,
  nombre,
  pourcent,
} from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import { RenduFiche } from '../fiches/RenduFiche';
import { lancerQcmChapitre } from '../lib/actions';
import { choisirQuestions, demarrerSession } from '../lib/sessions';

type Onglet = 'fiche' | 'carte' | 'aides' | 'annales' | 'actualisations';

const BLOCS_AIDES: BlocFiche['type'][] = ['mnemo', 'schema', 'etapes', 'arbre', 'scene3d'];

const ICONE_CHANGEMENT = { ajout: Plus, retrait: Minus, modification: RefreshCw } as const;
const LIBELLE_CHANGEMENT = { ajout: 'Ajouté', retrait: 'Retiré', modification: 'Modifié' } as const;

function LigneChangement({ changement }: { changement: Changement }) {
  const Icone = ICONE_CHANGEMENT[changement.type];
  return (
    <li className="rounded-xl border border-bord bg-surface-2 p-3 text-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Pastille ton={changement.importance === 'majeure' ? 'alerte' : 'neutre'} icone={Icone}>
          {LIBELLE_CHANGEMENT[changement.type]}
          {changement.importance === 'majeure' ? ' · majeur' : ''}
        </Pastille>
        <span className="font-medium">{changement.sujet}</span>
        {changement.page !== undefined && <span className="chiffres text-xs text-muet">page {changement.page}</span>}
      </div>
      {(changement.avant || changement.apres) && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
          <p className="rounded-lg bg-surface p-2.5 text-texte-2">
            <span className="mb-0.5 block text-[11px] tracking-wide text-muet uppercase">Avant</span>
            {changement.avant ?? '—'}
          </p>
          <ArrowRight size={16} className="hidden self-center text-muet sm:block" aria-hidden />
          <p className="rounded-lg bg-accent-fond p-2.5">
            <span className="mb-0.5 block text-[11px] tracking-wide text-accent-clair uppercase">Maintenant</span>
            {changement.apres ?? '—'}
          </p>
        </div>
      )}
    </li>
  );
}

function BlocActualisation({ actualisation }: { actualisation: Actualisation }) {
  const majeurs = actualisation.changements.filter((c) => c.importance === 'majeure');
  const mineurs = actualisation.changements.filter((c) => c.importance !== 'majeure');
  return (
    <section className="carte p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GitCompare size={16} className="text-accent-clair" aria-hidden />
        {actualisation.origine === 'ancien'
          ? "Par rapport à l'ancienne version"
          : 'Par rapport à la version précédente'}
      </h3>
      <p className="mt-1 text-xs text-muet">
        Comparé le {jourLisible(cleJour(actualisation.comparesLe))} · {actualisation.fichiers.join(', ')}
      </p>
      {actualisation.resume && <p className="mt-3 text-sm text-texte-2">{actualisation.resume}</p>}
      {actualisation.changements.length === 0 ? (
        <p className="mt-3 text-sm text-texte-2">Aucun changement de fond.</p>
      ) : (
        <>
          {majeurs.length > 0 && (
            <>
              <h4 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muet uppercase">
                À réapprendre ({majeurs.length})
              </h4>
              <ul className="space-y-2">
                {majeurs.map((c, i) => (
                  <LigneChangement key={i} changement={c} />
                ))}
              </ul>
            </>
          )}
          {mineurs.length > 0 && (
            <>
              <h4 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muet uppercase">
                Détails ({mineurs.length})
              </h4>
              <ul className="space-y-2">
                {mineurs.map((c, i) => (
                  <LigneChangement key={i} changement={c} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function PageChapitre() {
  const { id = '' } = useParams();
  const d = useDonnees();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [onglet, setOnglet] = useState<Onglet>('fiche');

  // Arrivée depuis un rappel de cours : on se place sur la section citée.
  useEffect(() => {
    if (!hash) return;
    setOnglet('fiche');
    const cible = document.getElementById(decodeURIComponent(hash.slice(1)));
    cible?.scrollIntoView({ block: 'start' });
  }, [hash, id]);

  const chapitre = d.chapitreParId.get(id);
  if (!chapitre) {
    return (
      <EtatVide icone={BookOpen} titre="Chapitre introuvable">
        <LienBouton to="/cours">Retour aux cours</LienBouton>
      </EtatVide>
    );
  }

  const matiere = d.matiereParId.get(chapitre.matiereId);
  const stats = d.stats.get(id);
  const fiche = d.ficheParChapitre.get(id);
  const questions = d.questionsParChapitre.get(id) ?? [];
  const annales = questions.filter((q) => q.source === 'annale');
  const flashcards = d.flashcards.filter((f) => f.chapitreId === id);
  const actualisations = d.actualisationsParChapitre.get(id) ?? [];
  const nbChangements = actualisations.reduce((somme, a) => somme + a.changements.length, 0);
  const nbAides =
    fiche?.sections.reduce(
      (s, section) => s + section.blocs.filter((b) => BLOCS_AIDES.includes(b.type)).length,
      0,
    ) ?? 0;

  const lancer = async (options: { source?: 'annale'; incontournables?: boolean } = {}) => {
    if (!options.source && !options.incontournables) {
      const url = await lancerQcmChapitre(d, id);
      if (url) void navigate(url);
      return;
    }
    const choisies = choisirQuestions(d, { chapitreIds: [id], nombre: 20, ...options });
    if (choisies.length === 0) return;
    const sessionId = await demarrerSession({
      type: 'qcm',
      titre: `${chapitre.titre} — ${options.incontournables ? 'incontournables' : 'annales'}`,
      questions: choisies,
      matiereId: chapitre.matiereId,
      chapitreIds: [id],
    });
    void navigate(`/session/${sessionId}`);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={`/cours/${chapitre.matiereId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-texte-2 hover:text-texte"
      >
        <ArrowLeft size={16} aria-hidden />
        {matiere?.nom ?? 'Cours'}
      </Link>

      <header className="carte mb-4 p-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <PastilleStatut statut={stats?.statut ?? 'a_commencer'} />
          {chapitre.nouveau && (
            <Pastille ton="accent" icone={Sparkles}>
              Nouveau
            </Pastille>
          )}
          {!!stats?.nbIncontournables && (
            <Pastille icone={Star}>
              {stats.nbIncontournables} incontournable{stats.nbIncontournables > 1 ? 's' : ''}
            </Pastille>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{chapitre.titre}</h1>
        {chapitre.resume && <p className="mt-2 text-sm text-texte-2">{chapitre.resume}</p>}

        <div className="mt-4">
          <div className="chiffres mb-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muet">
            <span>
              {stats?.nbTentees ?? 0} / {stats?.nbQuestions ?? 0} questions travaillées ·{' '}
              {stats?.nbErreurs ?? 0} erreur{(stats?.nbErreurs ?? 0) > 1 ? 's' : ''} en cours
            </span>
            <span className="text-texte-2">Avancement {pourcent(stats?.avancement ?? 0)}</span>
          </div>
          <Jauge valeur={stats?.avancement ?? 0} libelle="Avancement du chapitre" epaisse />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Bouton
            variante="primaire"
            icone={Play}
            disabled={questions.length === 0}
            onClick={() => void lancer()}
          >
            QCM de 10 questions
          </Bouton>
          {flashcards.length > 0 && (
            <LienBouton to={`/chapitre/${id}/flashcards`} icone={Layers}>
              {flashcards.length} flashcards
            </LienBouton>
          )}
        </div>
      </header>

      {chapitre.majEnAttente && (
        <Link
          to="/corrections"
          className="carte mb-4 flex items-center gap-3 border-alerte/40 bg-alerte/10 p-3 text-sm"
        >
          <FilePen size={18} className="shrink-0 text-alerte" aria-hidden />
          Un fichier de ce chapitre a changé dans le drive. Valide la mise à jour pour régénérer
          la fiche et les QCM.
        </Link>
      )}

      {!!chapitre.erratums?.length && (
        <section className="carte mb-4 border-alerte/40 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert size={16} className="text-alerte" aria-hidden />
            Erratums validés sur le cours
          </h2>
          <ul className="space-y-1.5 text-sm text-texte-2">
            {chapitre.erratums.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      <ContexteChapitre chapitre={chapitre} />
      <div className="mb-4 print:hidden">
        <Suggestions chapitreId={chapitre.id} max={2} titre="Le Dr Rodier te propose" />
      </div>

      <div className="mb-4 print:hidden">
        <Onglets
          libelle="Contenu du chapitre"
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'fiche', libelle: 'Fiche' },
            { valeur: 'carte', libelle: 'Carte mentale' },
            { valeur: 'aides', libelle: 'Aides', compte: nbAides },
            { valeur: 'annales', libelle: 'Annales', compte: annales.length },
            { valeur: 'actualisations', libelle: 'Actualisations', compte: nbChangements },
          ]}
        />
      </div>

      {onglet === 'fiche' &&
        (fiche ? (
          <>
            <div className="mb-3 flex flex-wrap justify-end gap-1 print:hidden">
              <ExportPdfChapitre chapitre={chapitre} />
              <Bouton variante="discret" icone={Printer} className="min-h-9 px-3" onClick={() => window.print()}>
                Imprimer
              </Bouton>
            </div>
            <RenduFiche fiche={fiche} />
            <NotesChapitre chapitreId={chapitre.id} />
            <Complements chapitre={chapitre} />
          </>
        ) : (
          <>
            <EtatVide icone={BookOpen} titre="Fiche en cours de préparation">
              La fiche de ce chapitre sera générée au prochain passage de l'import.
            </EtatVide>
            <Complements chapitre={chapitre} />
          </>
        ))}

      {onglet === 'carte' &&
        (fiche ? (
          <CarteMentale fiche={fiche} />
        ) : (
          <EtatVide icone={BookOpen} titre="Pas encore de carte mentale">
            La carte est tirée de la fiche : elle apparaîtra dès que la fiche sera générée.
          </EtatVide>
        ))}

      {onglet === 'aides' &&
        (fiche && nbAides > 0 ? (
          <RenduFiche fiche={fiche} filtre={(b) => BLOCS_AIDES.includes(b.type)} />
        ) : (
          <EtatVide icone={Sparkles} titre="Pas encore d'aides pour ce chapitre">
            Mnémotechniques, schémas interactifs et modèles 3D apparaîtront ici.
          </EtatVide>
        ))}

      {onglet === 'actualisations' &&
        (actualisations.length === 0 ? (
          <EtatVide icone={GitCompare} titre="Pas encore de comparaison pour ce chapitre">
            Envoie les anciennes versions de ce cours (page Fichiers, onglet « Anciennes versions ») : l'app
            compare et te montre ce qui a changé. Chaque fois que tu renvoies une nouvelle version du cours, elle
            est comparée à la précédente.
            <div className="mt-4">
              <LienBouton to="/fichiers">Envoyer des fichiers</LienBouton>
            </div>
          </EtatVide>
        ) : (
          <div className="space-y-4">
            {actualisations.map((a) => (
              <BlocActualisation key={a.id} actualisation={a} />
            ))}
          </div>
        ))}

      {onglet === 'annales' &&
        (annales.length === 0 ? (
          <EtatVide icone={Star} titre="Aucune question d'annale rattachée à ce chapitre" />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Bouton icone={Play} onClick={() => void lancer({ source: 'annale' })}>
                S'entraîner sur les annales
              </Bouton>
              {!!stats?.nbIncontournables && (
                <Bouton icone={Star} onClick={() => void lancer({ incontournables: true })}>
                  Incontournables seulement
                </Bouton>
              )}
            </div>
            <ul className="space-y-2">
              {[...annales]
                .sort((a, b) => nbPartiels(b) - nbPartiels(a))
                .map((q) => {
                  const etat = d.etats.get(q.id);
                  const partiels = [...new Set((q.occurrences ?? []).map((o) => o.partielId))]
                    .map((pid) => d.partielParId.get(pid)?.libelle)
                    .filter(Boolean);
                  return (
                    <li key={q.id} className="carte p-3 text-sm">
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {estIncontournable(q) && (
                          <Pastille ton="accent" icone={Star}>
                            Incontournable
                          </Pastille>
                        )}
                        {etat?.piegeuse && (
                          <Pastille ton="alerte" icone={TriangleAlert}>
                            Piégeuse
                          </Pastille>
                        )}
                        {q.corrige === 'propose_ia' && <Pastille>Corrigé officiel absent</Pastille>}
                      </div>
                      <p>{q.enonce.replace(/\{\{[^}]+\}\}/g, '…')}</p>
                      <p className="chiffres mt-1.5 text-xs text-muet">
                        {partiels.length > 0 ? partiels.join(' · ') : 'Partiel non identifié'}
                        {etat
                          ? ` — dernière réponse : ${nombre(etat.derniersPoints, 1)} point`
                          : ' — jamais tentée'}
                      </p>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
    </div>
  );
}
