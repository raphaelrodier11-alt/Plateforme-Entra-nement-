/**
 * Page d'un chapitre : fiche de révision, aides (mnémotechniques, schémas,
 * modèles 3D, flashcards) et questions d'annales.
 */
import {
  ArrowLeft,
  BookOpen,
  FilePen,
  Layers,
  Play,
  Sparkles,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { estIncontournable, nbPartiels } from '../../shared/marqueurs';
import type { BlocFiche } from '../../shared/types';
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

type Onglet = 'fiche' | 'aides' | 'annales';

const BLOCS_AIDES: BlocFiche['type'][] = ['mnemo', 'schema', 'etapes', 'arbre', 'scene3d'];

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
        to={`/cours#${chapitre.matiereId}`}
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

      <div className="mb-4">
        <Onglets
          libelle="Contenu du chapitre"
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'fiche', libelle: 'Fiche' },
            { valeur: 'aides', libelle: 'Aides', compte: nbAides },
            { valeur: 'annales', libelle: 'Annales', compte: annales.length },
          ]}
        />
      </div>

      {onglet === 'fiche' &&
        (fiche ? (
          <RenduFiche fiche={fiche} />
        ) : (
          <EtatVide icone={BookOpen} titre="Fiche en cours de préparation">
            La fiche de ce chapitre sera générée au prochain passage de l'import.
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
