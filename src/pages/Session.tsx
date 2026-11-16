/**
 * Déroulement d'une session.
 *
 * - QCM et révision d'erreurs : correction, explication et rappel de cours
 *   après chaque réponse, puis choix du type d'erreur.
 * - Examens : chronométrés, sans correction pendant l'épreuve ; toutes les
 *   explications sont données à la fin.
 */
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Flag,
  RotateCcw,
  Star,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { corriger, scoreSession, type Correction } from '../../shared/bareme';
import { estIncontournable, nbPartiels, suggererTypeErreur } from '../../shared/marqueurs';
import type { Question, ReponseDonnee, Session, Tentative, TypeErreur } from '../../shared/types';
import { QuestionVue } from '../composants/QuestionVue';
import { Bouton, EtatVide, Jauge, LienBouton, Pastille, Puce, cx, nombre } from '../composants/ui';
import { enregistrer, enregistrerPlusieurs } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import {
  LIBELLE_SESSION,
  creerTentative,
  demarrerSession,
  estExamen,
  reponseVide,
  terminerSession,
} from '../lib/sessions';

export const LIBELLE_TYPE_ERREUR: Record<TypeErreur, { titre: string; aide: string }> = {
  inattention: { titre: 'Inattention', aide: 'Je savais, j’ai mal lu ou répondu trop vite' },
  lacune: { titre: 'Lacune', aide: 'Je ne savais pas' },
  piege: { titre: 'Piège', aide: 'La question m’a induit en erreur' },
};

function libellePoints(c: Pick<Correction, 'points' | 'nbErreurs'>): string {
  if (c.nbErreurs === 0) return '1 point · aucune erreur';
  if (c.points === 0.5) return '0,5 point · 1 erreur';
  return '0 point · 2 erreurs ou plus';
}

function BandeauResultat({ correction }: { correction: Pick<Correction, 'points' | 'nbErreurs'> }) {
  const bon = correction.nbErreurs === 0;
  const moyen = correction.points === 0.5;
  const Icone = bon ? Check : moyen ? CircleAlert : X;
  return (
    <div
      role="status"
      className={cx(
        'flex items-center gap-2 rounded-xl p-3 text-sm font-medium',
        bon ? 'bg-bon/15' : moyen ? 'bg-alerte/15' : 'bg-critique/15',
      )}
    >
      <Icone size={18} className={bon ? 'text-bon' : moyen ? 'text-alerte' : 'text-critique'} aria-hidden />
      {libellePoints(correction)}
    </div>
  );
}

/** Explication, rappel de cours et provenance : affichés après chaque réponse. */
export function Explication({ question }: { question: Question }) {
  const { partielParId, chapitreParId } = useDonnees();
  const chapitre = chapitreParId.get(question.chapitreId);
  const partiels = [...new Set((question.occurrences ?? []).map((o) => o.partielId))]
    .map((id) => partielParId.get(id)?.libelle)
    .filter(Boolean);
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl bg-surface-2 p-4">
        <h3 className="mb-1 text-xs font-semibold tracking-wide text-muet uppercase">Explication</h3>
        <p className="whitespace-pre-line text-texte-2">{question.explication}</p>
        {question.corrige === 'propose_ia' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-texte-2">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
            Corrigé officiel absent : la réponse a été établie par l'IA à partir du cours.
          </p>
        )}
      </div>
      {question.rappel && (
        <div className="rounded-xl border border-accent/40 bg-accent-fond p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-accent-clair uppercase">
            <BookOpen size={14} aria-hidden />
            Rappel de cours
          </h3>
          <p className="whitespace-pre-line">{question.rappel}</p>
          {chapitre && (
            <Link
              to={`/chapitre/${chapitre.id}${question.sectionFiche ? `#${question.sectionFiche}` : ''}`}
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent-clair underline-offset-2 hover:underline"
            >
              Ouvrir la fiche « {chapitre.titre} »
              <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>
      )}
      {(partiels.length > 0 || question.source === 'annale') && (
        <p className="text-xs text-muet">
          Annale{partiels.length > 0 ? ` : ${partiels.join(', ')}` : ''}
        </p>
      )}
    </div>
  );
}

function Marqueurs({ question }: { question: Question }) {
  const { etats } = useDonnees();
  const etat = etats.get(question.id);
  return (
    <div className="flex flex-wrap gap-1.5">
      {estIncontournable(question) && (
        <Pastille ton="accent" icone={Star}>
          Incontournable · {nbPartiels(question)} partiels
        </Pastille>
      )}
      {etat?.piegeuse && (
        <Pastille ton="alerte" icone={TriangleAlert}>
          Piégeuse
        </Pastille>
      )}
      {etat?.aRevoir && (
        <Pastille ton="neutre" icone={Flag}>
          À revoir
        </Pastille>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entraînement : une question à la fois, correction immédiate
// ---------------------------------------------------------------------------

function Entrainement({
  session,
  questions,
  tentatives,
}: {
  session: Session;
  questions: Question[];
  tentatives: Tentative[];
}) {
  const { casParId, etats } = useDonnees();
  const faites = new Set(tentatives.map((t) => t.questionId));
  const premiereLibre = questions.findIndex((q) => !faites.has(q.id));
  const [indice, setIndice] = useState(premiereLibre < 0 ? questions.length - 1 : premiereLibre);
  const [reponse, setReponse] = useState<ReponseDonnee>({});
  const [rendu, setRendu] = useState<{ tentative: Tentative; correction: Correction }>();
  const debutQuestion = useRef(Date.now());
  const haut = useRef<HTMLDivElement>(null);

  // Session reprise alors que tout a déjà été répondu : on affiche le résultat.
  useEffect(() => {
    if (premiereLibre < 0) {
      void terminerSession(session, scoreSession(session.questionIds, tentatives).points);
    }
    // À vérifier une seule fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const question = questions[indice]!;
  // État de la question avant cette réponse, pour proposer un type d'erreur.
  const etatAvant = useRef(etats.get(question.id));

  useEffect(() => {
    debutQuestion.current = Date.now();
    etatAvant.current = etats.get(question.id);
    haut.current?.scrollIntoView({ block: 'start' });
    // L'état « avant » ne doit être relevé qu'au changement de question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const valider = async (r: ReponseDonnee) => {
    const correction = corriger(question, r);
    const dureeMs = Date.now() - debutQuestion.current;
    const typeErreur =
      correction.nbErreurs > 0
        ? suggererTypeErreur({ question, etatAvant: etatAvant.current, dureeMs })
        : undefined;
    const tentative = creerTentative(session, question, r, correction, { dureeMs, typeErreur });
    await enregistrer('tentatives', tentative);
    setRendu({ tentative, correction });
  };

  const changerType = async (type: TypeErreur) => {
    if (!rendu) return;
    const tentative = { ...rendu.tentative, typeErreur: type };
    await enregistrer('tentatives', tentative);
    setRendu({ ...rendu, tentative });
  };

  const suivante = async () => {
    if (indice + 1 < questions.length) {
      setIndice(indice + 1);
      setReponse({});
      setRendu(undefined);
      return;
    }
    const toutes = [...tentatives.filter((t) => t.id !== rendu?.tentative.id), ...(rendu ? [rendu.tentative] : [])];
    await terminerSession(session, scoreSession(session.questionIds, toutes).points);
  };

  return (
    <div ref={haut} className="mx-auto max-w-2xl scroll-mt-4">
      <header className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <Link to="/qcm" className="flex items-center gap-1 text-texte-2 hover:text-texte">
            <ArrowLeft size={16} aria-hidden />
            Quitter
          </Link>
          <span className="chiffres text-texte-2">
            Question {indice + 1} / {questions.length}
          </span>
        </div>
        <Jauge valeur={(indice + (rendu ? 1 : 0)) / questions.length} libelle="Avancement du QCM" />
      </header>

      <div className="carte apparait p-4 sm:p-6" key={question.id}>
        <div className="mb-3">
          <Marqueurs question={question} />
        </div>
        <QuestionVue
          question={question}
          cas={question.casId ? casParId.get(question.casId) : undefined}
          reponse={rendu ? rendu.tentative.reponse : reponse}
          onChange={setReponse}
          correction={rendu?.correction}
        />

        {!rendu && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Bouton
              variante="primaire"
              className="flex-1"
              disabled={reponseVide(reponse)}
              onClick={() => void valider(reponse)}
            >
              Valider
            </Bouton>
            <Bouton onClick={() => void valider({})}>Je ne sais pas</Bouton>
          </div>
        )}

        {rendu && (
          <div className="apparait mt-5 space-y-4">
            <BandeauResultat correction={rendu.correction} />
            <Explication question={question} />
            {rendu.correction.nbErreurs > 0 && (
              <fieldset>
                <legend className="mb-2 text-sm text-texte-2">Quel type d'erreur ?</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LIBELLE_TYPE_ERREUR) as TypeErreur[]).map((type) => (
                    <Puce
                      key={type}
                      actif={rendu.tentative.typeErreur === type}
                      onClick={() => void changerType(type)}
                    >
                      {LIBELLE_TYPE_ERREUR[type].titre}
                    </Puce>
                  ))}
                </div>
                {rendu.tentative.typeErreur && (
                  <p className="mt-1.5 text-xs text-muet">
                    {LIBELLE_TYPE_ERREUR[rendu.tentative.typeErreur].aide}
                  </p>
                )}
              </fieldset>
            )}
            <Bouton variante="primaire" icone={ArrowRight} className="w-full" onClick={() => void suivante()}>
              {indice + 1 < questions.length ? 'Question suivante' : 'Voir le résultat'}
            </Bouton>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Examen : chronométré, corrigé à la fin
// ---------------------------------------------------------------------------

function lireBrouillon(id: string): Record<string, ReponseDonnee> {
  try {
    return JSON.parse(localStorage.getItem(`dr-rodier:brouillon:${id}`) ?? '{}') as Record<
      string,
      ReponseDonnee
    >;
  } catch {
    return {};
  }
}

function chrono(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const reste = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${reste}` : `${m}:${reste}`;
}

function Examen({ session, questions }: { session: Session; questions: Question[] }) {
  const { casParId } = useDonnees();
  const [indice, setIndice] = useState(0);
  const [reponses, setReponses] = useState(() => lireBrouillon(session.id));
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [confirmation, setConfirmation] = useState(false);
  const termine = useRef(false);

  const echeance = session.dureeLimiteMs ? session.debut + session.dureeLimiteMs : undefined;
  const restant = echeance ? echeance - maintenant : undefined;

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(`dr-rodier:brouillon:${session.id}`, JSON.stringify(reponses));
  }, [reponses, session.id]);

  const rendre = async () => {
    if (termine.current) return;
    termine.current = true;
    const date = Date.now();
    // Les questions laissées sans réponse valent 0 point mais ne sont pas
    // comptées comme des erreurs : elles n'ont pas été travaillées.
    const tentatives = questions
      .filter((q) => reponses[q.id] && !reponseVide(reponses[q.id]!))
      .map((q) => {
        const r = reponses[q.id]!;
        const correction = corriger(q, r);
        return creerTentative(session, q, r, correction, {
          date,
          typeErreur: correction.nbErreurs > 0 ? suggererTypeErreur({ question: q }) : undefined,
        });
      });
    await enregistrerPlusieurs('tentatives', tentatives);
    await terminerSession(session, scoreSession(session.questionIds, tentatives).points);
    localStorage.removeItem(`dr-rodier:brouillon:${session.id}`);
  };

  // Fin du temps : la copie est rendue automatiquement.
  useEffect(() => {
    if (restant !== undefined && restant <= 0) void rendre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restant !== undefined && restant <= 0]);

  const question = questions[indice]!;
  const nbRepondues = questions.filter((q) => reponses[q.id] && !reponseVide(reponses[q.id]!)).length;
  const presse = restant !== undefined && restant < 5 * 60_000;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="carte sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.titre}</p>
          <p className="chiffres text-xs text-muet">
            {nbRepondues} / {questions.length} réponses
          </p>
        </div>
        {restant !== undefined && (
          <div
            role="timer"
            aria-label="Temps restant"
            className={cx(
              'chiffres flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-lg font-semibold',
              presse ? 'bg-alerte/15' : 'bg-surface-2',
            )}
          >
            <Clock size={18} className={presse ? 'text-alerte' : 'text-muet'} aria-hidden />
            {chrono(restant)}
          </div>
        )}
        <Bouton variante="primaire" icone={Flag} onClick={() => setConfirmation(true)}>
          Terminer
        </Bouton>
      </header>

      {confirmation && (
        <div role="alertdialog" aria-label="Terminer l'examen" className="carte mb-4 p-4">
          <p className="text-sm">
            Terminer l'examen maintenant ?{' '}
            {nbRepondues < questions.length &&
              `${questions.length - nbRepondues} question(s) sans réponse compteront 0 point.`}
          </p>
          <div className="mt-3 flex gap-2">
            <Bouton variante="primaire" onClick={() => void rendre()}>
              Oui, corriger ma copie
            </Bouton>
            <Bouton onClick={() => setConfirmation(false)}>Continuer</Bouton>
          </div>
        </div>
      )}

      <div className="carte p-4 sm:p-6" key={question.id}>
        <p className="chiffres mb-3 text-xs text-muet">
          Question {indice + 1} / {questions.length}
        </p>
        <QuestionVue
          question={question}
          cas={question.casId ? casParId.get(question.casId) : undefined}
          reponse={reponses[question.id] ?? {}}
          onChange={(r) => setReponses((prec) => ({ ...prec, [question.id]: r }))}
        />
        <div className="mt-5 flex justify-between gap-2">
          <Bouton icone={ArrowLeft} disabled={indice === 0} onClick={() => setIndice(indice - 1)}>
            Précédente
          </Bouton>
          <Bouton
            variante="primaire"
            disabled={indice === questions.length - 1}
            onClick={() => setIndice(indice + 1)}
          >
            Suivante
            <ArrowRight size={18} aria-hidden />
          </Bouton>
        </div>
      </div>

      <nav aria-label="Questions de l'examen" className="mt-4 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const repondue = reponses[q.id] && !reponseVide(reponses[q.id]!);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndice(i)}
              aria-current={i === indice}
              aria-label={`Question ${i + 1}${repondue ? ', répondue' : ', sans réponse'}`}
              className={cx(
                'chiffres size-9 rounded-lg border text-xs font-medium',
                i === indice ? 'border-accent-clair' : 'border-bord',
                repondue ? 'bg-accent-fond text-texte' : 'bg-surface text-muet',
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Résultat : score et revue des réponses
// ---------------------------------------------------------------------------

function Resultat({
  session,
  questions,
  tentatives,
}: {
  session: Session;
  questions: Question[];
  tentatives: Tentative[];
}) {
  const { casParId } = useDonnees();
  const navigate = useNavigate();
  const [ouverte, setOuverte] = useState<string>();
  const score = scoreSession(session.questionIds, tentatives);
  const parQuestion = new Map(tentatives.map((t) => [t.questionId, t]));
  const ratees = questions.filter((q) => (parQuestion.get(q.id)?.nbErreurs ?? 1) > 0);
  const duree = session.fin ? session.fin - session.debut : undefined;

  const refaire = async () => {
    const id = await demarrerSession({
      type: 'revision_erreurs',
      titre: `Erreurs de « ${session.titre} »`,
      questions: ratees,
      matiereId: session.matiereId,
    });
    void navigate(`/session/${id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <section className="carte apparait mb-4 p-6 text-center">
        <p className="text-sm text-texte-2">
          {LIBELLE_SESSION[session.type]} · {session.titre}
        </p>
        <p className="mt-2 text-6xl font-semibold tracking-tight">
          {nombre(score.noteSur20, 1)}
          <span className="text-2xl text-muet"> / 20</span>
        </p>
        <p className="chiffres mt-2 text-sm text-texte-2">
          {nombre(score.points, 1)} point{score.points > 1 ? 's' : ''} sur {score.total}
          {duree !== undefined && ` · ${chrono(duree)}`}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {ratees.length > 0 && (
            <Bouton variante="primaire" icone={RotateCcw} onClick={() => void refaire()}>
              Refaire mes {ratees.length} erreur{ratees.length > 1 ? 's' : ''}
            </Bouton>
          )}
          <LienBouton to={estExamen(session) ? '/examens' : '/qcm'}>Terminer</LienBouton>
        </div>
      </section>

      <h2 className="mb-2 text-sm font-semibold text-texte-2">Détail des réponses</h2>
      <ul className="space-y-2">
        {questions.map((q, i) => {
          const t = parQuestion.get(q.id);
          const correction = t ? corriger(q, t.reponse) : undefined;
          const Icone = !t ? CircleAlert : t.nbErreurs === 0 ? Check : t.points > 0 ? CircleAlert : X;
          const couleur = !t
            ? 'text-muet'
            : t.nbErreurs === 0
              ? 'text-bon'
              : t.points > 0
                ? 'text-alerte'
                : 'text-critique';
          const estOuverte = ouverte === q.id;
          return (
            <li key={q.id} className="carte overflow-hidden">
              <button
                type="button"
                aria-expanded={estOuverte}
                onClick={() => setOuverte(estOuverte ? undefined : q.id)}
                className="flex w-full items-center gap-3 p-3 text-left text-sm"
              >
                <Icone size={18} className={cx('shrink-0', couleur)} aria-hidden />
                <span className="chiffres w-6 shrink-0 text-muet">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{q.enonce.replace(/\{\{[^}]+\}\}/g, '…')}</span>
                <span className="chiffres shrink-0 text-texte-2">
                  {t ? nombre(t.points, 1) : 'Sans réponse'}
                </span>
                <ChevronDown
                  size={16}
                  className={cx('shrink-0 text-muet transition-transform', estOuverte && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {estOuverte && (
                <div className="space-y-4 border-t border-bord p-4">
                  <QuestionVue
                    question={q}
                    cas={q.casId ? casParId.get(q.casId) : undefined}
                    reponse={t?.reponse ?? {}}
                    correction={correction}
                    solution={!correction}
                  />
                  <Explication question={q} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PageSession() {
  const { id } = useParams();
  const { sessions, questionParId, tentatives } = useDonnees();
  const session = sessions.find((s) => s.id === id);

  const questions = useMemo(
    () =>
      (session?.questionIds ?? [])
        .map((qid) => questionParId.get(qid))
        .filter((q): q is Question => !!q),
    [session, questionParId],
  );
  const sesTentatives = useMemo(
    () => tentatives.filter((t) => t.sessionId === id),
    [tentatives, id],
  );

  if (!session || questions.length === 0) {
    return (
      <EtatVide icone={CircleAlert} titre="Session introuvable">
        Cette session n'existe pas sur cet appareil.
        <div className="mt-4">
          <LienBouton to="/qcm">Retour aux QCM</LienBouton>
        </div>
      </EtatVide>
    );
  }
  if (session.termine) {
    return <Resultat session={session} questions={questions} tentatives={sesTentatives} />;
  }
  if (estExamen(session)) return <Examen session={session} questions={questions} />;
  return <Entrainement session={session} questions={questions} tentatives={sesTentatives} />;
}
