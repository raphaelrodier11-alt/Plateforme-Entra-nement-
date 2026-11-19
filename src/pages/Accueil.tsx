/**
 * Tableau de bord : ce qu'il faut faire aujourd'hui, où j'en suis, et les
 * conseils de révision.
 */
import { libelleExamen } from '../../shared/examens';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CircleAlert,
  Flame,
  GraduationCap,
  Lightbulb,
  Play,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cleJour, dureeLisible, heureLisible, joursEntre, jourLisible } from '../../shared/dates';
import type { Recommandation } from '../../shared/recommandations';
import { Bouton, Carte, EtatVide, Jauge, LienBouton, Pastille, nombre, pourcent } from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import { Anneau, Tuile } from '../graphiques/Graphiques';
import { LIBELLE_TACHE, lancerRevisionErreurs, lancerTache } from '../lib/actions';
import { Docteur } from '../composants/Docteur';
import { MoniteurEcg } from '../composants/Ecg';
import { accroche } from '../../shared/motivation';
import { CoeurPartiel } from '../composants/CoeurPartiel';
import { CompteARebours } from '../composants/CompteARebours';
import { ProgressionImport } from '../composants/ProgressionImport';
import { QuestionDuJour } from '../composants/QuestionDuJour';
import { Suggestions } from '../composants/Suggestions';
import { chargerDemo } from '../demo/charger';

function cibleRecommandation(r: Recommandation): string {
  switch (r.action.type) {
    case 'erreurs':
      return '/erreurs';
    case 'chapitre':
      return `/chapitre/${r.action.chapitreId}`;
    case 'examen_blanc':
      return `/examens?matiere=${r.action.matiereId}`;
    case 'planning':
      return '/planning';
    case 'incontournables':
      return '/qcm?incontournables=1';
  }
}

export function Accueil() {
  const d = useDonnees();
  const navigate = useNavigate();
  const aujourdHui = cleJour(d.maintenant);

  if (d.estVide) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <EtatVide icone={BookOpen} titre="Bienvenue dans Dr Rodier">
          <p>
            Aucun cours n'a encore été importé. Envoie tes cours et tes annales depuis ton
            téléphone ou ton ordinateur : l'application en tire les chapitres, les fiches et les
            QCM. Tu peux aussi charger un petit jeu de démonstration pour découvrir l'application.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LienBouton to="/fichiers" variante="primaire">
              Envoyer mes fichiers
            </LienBouton>
            <Bouton icone={Sparkles} onClick={() => void chargerDemo()}>
              Charger la démonstration
            </Bouton>
          </div>
        </EtatVide>
      </div>
    );
  }

  const stats = [...d.stats.values()];
  const totalQuestions = stats.reduce((s, c) => s + c.nbQuestions, 0);
  const avancement = totalQuestions
    ? stats.reduce((s, c) => s + c.avancement * c.nbQuestions, 0) / totalQuestions
    : 0;
  const nbAcquis = stats.filter((s) => s.statut === 'acquis').length;
  const seancesDuJour = d.planning.seances.filter((s) => s.date === aujourdHui);
  const prochaine = d.planning.seances.find((s) => s.date > aujourdHui);
  const examens = [...d.examens]
    .filter((x) => joursEntre(aujourdHui, x.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const { profil } = d;
  const prochainExamen = examens[0];
  const message = accroche(new Date(d.maintenant), {
    prenom: d.reglages.prenom,
    examen: prochainExamen ? { jours: joursEntre(aujourdHui, prochainExamen.date), matiere: libelleExamen(prochainExamen.titre, d.matiereParId.get(prochainExamen.matiereId)?.nom) } : undefined,
    serie: profil.series.courante,
    erreursDues: d.erreursDues.length,
  });
  const tentativesDuJour = d.tentatives.filter((t) => cleJour(t.date) === aujourdHui).length;

  return (
    <div className="space-y-4">
      <header className="carte pouls relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <MoniteurEcg />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-surface/90 via-surface/45 to-transparent" aria-hidden />
        <div className="flex min-h-44 flex-col justify-between gap-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-texte-2 first-letter:uppercase">{jourLisible(aujourdHui)}</p>
              <h1 className="max-w-xl text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{message.titre}</h1>
            </div>
            {d.aDesDonneesDemo && <Pastille ton="alerte">Données de démonstration</Pastille>}
          </div>
          <p className="max-w-lg text-base leading-snug text-texte" aria-label="Mot du jour">
            {message.phrase}
          </p>
        </div>
      </header>

      {d.nbAValider + d.nbNotificationsNonLues > 0 && (
        <Link
          to="/corrections"
          className="carte flex items-center gap-3 border-accent/40 bg-accent-fond p-3 text-sm"
        >
          <Bell size={18} className="shrink-0 text-accent-clair" aria-hidden />
          <span className="flex-1">
            {d.nbAValider > 0
              ? `${d.nbAValider} élément${d.nbAValider > 1 ? 's' : ''} en attente de ta validation`
              : `${d.nbNotificationsNonLues} nouveauté${d.nbNotificationsNonLues > 1 ? 's' : ''} depuis ton drive`}
          </span>
          <ArrowRight size={16} aria-hidden />
        </Link>
      )}

      <Link
        to="/assistant"
        className="carte carte-vive pouls flex items-center gap-4 border-accent/30 bg-gradient-to-r from-accent-fond to-transparent p-4"
      >
        <Docteur taille={54} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Une question ? Demande au Dr Rodier</span>
          <span className="block text-sm text-texte-2">
            Il répond avec tes cours, crée tes fiches et QCM sur mesure, et les range dans ta bibliothèque.
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-accent-clair" aria-hidden />
      </Link>

      <ProgressionImport discret />

      <CoeurPartiel />

      <CompteARebours />

      <QuestionDuJour />

      <Suggestions />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Chiffre principal : avancement global */}
        <section className="carte pouls flex items-center gap-5 p-5 lg:col-span-2">
          <Anneau valeur={avancement} taille={104} libelle="Avancement global">
            <BookOpen size={28} className="text-accent-clair" aria-hidden />
          </Anneau>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm text-texte-2">Avancement du programme</h2>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{pourcent(avancement)}</p>
            <p className="mt-2 text-sm text-texte-2">
              {nbAcquis} chapitre{nbAcquis > 1 ? 's' : ''} acquis sur {stats.length} ·{' '}
              {tentativesDuJour} réponse{tentativesDuJour > 1 ? 's' : ''} aujourd'hui
            </p>
          </div>
        </section>

        <section className="carte p-5">
          <div className="flex items-center justify-between text-sm text-texte-2">
            <span className="flex items-center gap-1.5">
              <Trophy size={16} className="text-accent-clair" aria-hidden />
              Niveau {profil.niveau + 1} · {profil.titre}
            </span>
            <span className="chiffres">{nombre(profil.points)} pts</span>
          </div>
          <div className="mt-3">
            <Jauge
              valeur={profil.pointsDansNiveau / profil.pointsDuNiveau}
              libelle="Progression vers le niveau suivant"
              epaisse
            />
            <p className="chiffres mt-1.5 text-xs text-muet">
              {nombre(profil.pointsDuNiveau - profil.pointsDansNiveau)} points avant le niveau suivant
            </p>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <Flame
              size={28}
              className={profil.series.courante > 0 ? 'text-serieux' : 'text-muet'}
              aria-hidden
            />
            <div>
              <p className="text-lg leading-tight font-semibold">
                {profil.series.courante} jour{profil.series.courante > 1 ? 's' : ''} de suite
              </p>
              <p className="text-xs text-muet">Record : {profil.series.meilleure}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Carte
          className="lg:col-span-2"
          titre="Aujourd'hui"
          action={
            <Link to="/planning" className="text-xs text-accent-clair hover:underline">
              Voir le planning
            </Link>
          }
        >
          {d.erreursDues.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
              <div className="flex items-center gap-2.5 text-sm">
                <CircleAlert size={18} className="text-alerte" aria-hidden />
                <span>
                  <strong className="font-semibold">{d.erreursDues.length}</strong> erreur
                  {d.erreursDues.length > 1 ? 's' : ''} à revoir (répétition espacée)
                </span>
              </div>
              <Bouton
                variante="primaire"
                icone={Play}
                onClick={() => void lancerRevisionErreurs(d).then((url) => url && navigate(url))}
              >
                Réviser
              </Bouton>
            </div>
          )}

          {seancesDuJour.length === 0 ? (
            <p className="text-sm text-texte-2">
              Aucune séance prévue aujourd'hui.{' '}
              {prochaine
                ? `Prochaine séance : ${jourLisible(prochaine.date)} à ${heureLisible(prochaine.debutMin)}.`
                : 'Coche tes disponibilités pour construire ton planning.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {seancesDuJour.map((s) => (
                <li key={s.id}>
                  <p className="chiffres mb-1.5 flex items-center gap-2 text-xs text-muet">
                    <CalendarDays size={14} aria-hidden />
                    {heureLisible(s.debutMin)} · {dureeLisible(s.dureeMin)}
                    {s.deplacee && <Pastille ton="alerte">Déplacée : {s.deplacee.evenement}</Pastille>}
                  </p>
                  <ul className="space-y-1.5">
                    {s.taches.map((t, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => void lancerTache(d, t).then((url) => navigate(url))}
                          className="flex w-full items-center gap-3 rounded-xl border border-bord bg-surface-2 p-3 text-left hover:bg-surface-3"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {t.chapitreId
                                ? d.chapitreParId.get(t.chapitreId)?.titre
                                : t.matiereId
                                  ? `${LIBELLE_TACHE[t.type]} — ${d.matiereParId.get(t.matiereId)?.nom ?? ''}`
                                  : LIBELLE_TACHE[t.type]}
                            </span>
                            <span className="block truncate text-xs text-muet">
                              {t.chapitreId ? `${LIBELLE_TACHE[t.type]} · ` : ''}
                              {t.raison}
                            </span>
                          </span>
                          <span className="chiffres shrink-0 text-xs text-texte-2">
                            {dureeLisible(t.dureeMin)}
                          </span>
                          <Play size={16} className="shrink-0 text-accent-clair" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte titre="Prochains examens">
          {examens.length === 0 ? (
            <p className="text-sm text-texte-2">
              Aucun examen saisi.{' '}
              <Link to="/planning" className="text-accent-clair hover:underline">
                Ajouter une date
              </Link>
            </p>
          ) : (
            <ul className="space-y-3">
              {examens.map((x) => {
                const prediction = d.predictions.get(x.matiereId);
                const jours = joursEntre(aujourdHui, x.date);
                return (
                  <li key={x.id} className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2">
                      <GraduationCap size={20} className="text-accent-clair" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {libelleExamen(x.titre, d.matiereParId.get(x.matiereId)?.nom)}
                      </p>
                      <p className="text-xs text-muet">
                        {jours === 0 ? "Aujourd'hui" : `Dans ${jours} jour${jours > 1 ? 's' : ''}`} ·{' '}
                        {jourLisible(x.date)}
                      </p>
                    </div>
                    {prediction && (
                      <div className="text-right">
                        <p className="chiffres text-lg leading-tight font-semibold">
                          {nombre(prediction.note, 1)}
                        </p>
                        <p className="text-[11px] text-muet">note prévue /20</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Carte className="lg:col-span-2" titre="Recommandations">
          {d.recommandations.length === 0 ? (
            <p className="text-sm text-texte-2">Rien de particulier : continue sur ta lancée.</p>
          ) : (
            <ul className="space-y-2">
              {d.recommandations.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <Link
                    to={cibleRecommandation(r)}
                    className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-surface-2"
                  >
                    <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent-clair" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.titre}</span>
                      <span className="block text-xs text-texte-2">{r.detail}</span>
                    </span>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-muet" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Tuile
            libelle="Erreurs en cours"
            valeur={d.erreurs.length}
            complement={`${d.aRevoir.length} piège${d.aRevoir.length > 1 ? 's' : ''} déjoué${d.aRevoir.length > 1 ? 's' : ''} à revoir`}
          />
          <Tuile
            libelle="Badges"
            valeur={`${profil.badges.filter((b) => b.obtenu).length} / ${profil.badges.length}`}
            complement={<Link to="/suivi" className="text-accent-clair hover:underline">Voir mes badges</Link>}
          />
        </div>
      </div>

      <Carte
        titre="Matières"
        action={
          <Link to="/cours" className="text-xs text-accent-clair hover:underline">
            Tous les chapitres
          </Link>
        }
      >
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {d.matieres.map((m) => {
            const s = d.statsMatiere.get(m.id);
            return (
              <li key={m.id} className="min-w-0">
                <Link to={`/cours/${m.id}`} className="block">
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{m.nom}</span>
                    <span className="chiffres shrink-0 text-texte-2">{pourcent(s?.avancement ?? 0)}</span>
                  </div>
                  <Jauge valeur={s?.avancement ?? 0} libelle={`Avancement en ${m.nom}`} />
                </Link>
              </li>
            );
          })}
        </ul>
      </Carte>
    </div>
  );
}
