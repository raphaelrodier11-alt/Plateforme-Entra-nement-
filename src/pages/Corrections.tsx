/**
 * Mises à jour et corrections : tout ce qui vient de l'import du drive et
 * demande une décision. Rien n'est appliqué sans validation, et les fichiers
 * du drive ne sont jamais modifiés.
 */
import {
  Bell,
  Check,
  CircleCheck,
  Coins,
  FileQuestion,
  FileWarning,
  History,
  RefreshCw,
  ScanText,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Anomalie, Estimation, EtatPipeline, Tache, TypeAnomalie } from '../../shared/types';
import { ProgressionImport } from '../composants/ProgressionImport';
import { Bouton, Carte, EtatVide, Pastille, TitrePage, nombre } from '../composants/ui';
import { ecrireLocal, enregistrerPlusieurs } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { creerTache, deciderAnomalie, deciderMiseAJour } from '../lib/decisions';

const LIBELLE_ANOMALIE: Record<TypeAnomalie, string> = {
  reponse_fausse: 'Réponse fausse',
  contradiction: 'Contradiction entre corrigé et cours',
  faute: 'Faute',
  incoherence: 'Incohérence',
  mal_classee: 'Question mal classée',
};

const LIBELLE_ETAT: Record<EtatPipeline['statut'], string> = {
  jamais_lance: "L'import n'a pas encore tourné",
  en_cours: 'Import en cours',
  ok: 'Import à jour',
  erreur: "Le dernier import s'est arrêté sur une erreur",
  en_attente_validation: 'En attente de ta validation',
};

const LIBELLE_TACHE: Record<Tache['type'], string> = {
  generation_complete: 'Génération complète des fiches et QCM',
  regenerer_chapitre: "Régénération d'un chapitre",
  plus_de_questions: 'Questions supplémentaires',
  verifier_drive: 'Vérification du drive',
};

function quand(instant: number): string {
  return new Date(instant).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function euros(usd: number, taux: number): string {
  return `${nombre(usd * taux, 2)} €`;
}

function CarteEstimation({ estimation }: { estimation: Estimation }) {
  const [lance, setLance] = useState(false);
  const approuver = async () => {
    await creerTache('generation_complete');
    await ecrireLocal('estimations', [{ ...estimation, statut: 'approuvee' as const }]);
    setLance(true);
  };
  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <Coins size={16} className="text-accent-clair" aria-hidden />
          Estimation du coût de génération
        </span>
      }
    >
      {estimation.gratuit ? (
        <div className="rounded-xl border border-bon/40 bg-bon/10 p-4">
          <p className="text-4xl font-semibold tracking-tight">0,00 €</p>
          <p className="mt-1 text-sm">
            Palier gratuit de Gemini : aucune dépense n'est possible. Si la limite de Google est atteinte, le
            traitement s'arrête et reprend tout seul plus tard.
          </p>
          {estimation.equivalentUsd !== undefined && (
            <p className="chiffres mt-1 text-xs text-texte-2">
              Valeur au tarif payant, non facturée : environ {nombre(estimation.equivalentUsd, 2)} $.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muet">Génération complète (une seule fois)</p>
            <p className="text-4xl font-semibold tracking-tight">
              {euros(estimation.totalUsd, estimation.tauxEurParUsd)}
            </p>
            <p className="chiffres text-xs text-muet">{nombre(estimation.totalUsd, 2)} $</p>
          </div>
          <div>
            <p className="text-xs text-muet">Ensuite, chaque mois (estimation)</p>
            <p className="text-4xl font-semibold tracking-tight">
              {euros(estimation.mensuelUsd, estimation.tauxEurParUsd)}
            </p>
            <p className="chiffres text-xs text-muet">{nombre(estimation.mensuelUsd, 2)} $</p>
          </div>
        </div>
      )}

      <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muet uppercase">Détail par étape</h3>
      <ul className="divide-y divide-grille text-sm">
        {estimation.lignes.map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <span>
              {l.etape}
              <span className="chiffres block text-xs text-muet">
                {l.modele} · {l.appels} appel{l.appels > 1 ? 's' : ''} · {nombre(l.tokensEntree)} tokens lus ·{' '}
                {nombre(l.tokensSortie)} écrits
              </span>
            </span>
            <span className="chiffres font-medium">{estimation.gratuit ? 'gratuit' : `${nombre(l.coutUsd, 2)} $`}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muet uppercase">Hypothèses</h3>
      <ul className="space-y-1 text-sm text-texte-2">
        {estimation.hypotheses.map((h, i) => (
          <li key={i}>• {h}</li>
        ))}
        {estimation.tarifs.map((t) => (
          <li key={t.modele} className="chiffres">
            • {t.modele} : {nombre(t.entreeUsdParM, 2)} $ / million de tokens lus, {nombre(t.sortieUsdParM, 2)} $
            écrits{t.aVerifier ? ' — tarif à vérifier sur la page officielle de Google' : ''}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Bouton variante="primaire" icone={Check} disabled={lance} onClick={() => void approuver()}>
          {lance ? 'Génération demandée' : 'Approuver et lancer la génération'}
        </Bouton>
        <p className="text-xs text-muet">Calculée le {quand(estimation.date)}. Rien n'est dépensé avant ton accord.</p>
      </div>
    </Carte>
  );
}

function CarteAnomalie({ anomalie }: { anomalie: Anomalie }) {
  const d = useDonnees();
  const { cible } = anomalie;
  const chapitre = cible.chapitreId ? d.chapitreParId.get(cible.chapitreId) : undefined;
  const question = cible.questionId ? d.questionParId.get(cible.questionId) : undefined;
  const reperes = [
    cible.fichierNom && `Fichier : ${cible.fichierNom}`,
    chapitre && `Chapitre : ${chapitre.titre}`,
    cible.page !== undefined && `Page ${cible.page}`,
    cible.ligne !== undefined && `Ligne ${cible.ligne}`,
  ].filter(Boolean);

  return (
    <li className="carte p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pastille ton="alerte" icone={FileWarning}>
          {LIBELLE_ANOMALIE[anomalie.type]}
        </Pastille>
        <span className="text-xs text-muet">{reperes.join(' · ')}</span>
      </div>
      <p className="text-sm">{anomalie.description}</p>
      {question && (
        <p className="mt-2 rounded-lg bg-surface-2 p-2.5 text-sm text-texte-2">
          Question : {question.enonce.replace(/\{\{[^}]+\}\}/g, '…')}
        </p>
      )}
      {cible.extrait && (
        <blockquote className="mt-2 border-l-2 border-axe pl-3 text-sm text-texte-2 italic">
          {cible.extrait}
        </blockquote>
      )}
      <dl className="mt-3 space-y-2 text-sm">
        <div className="rounded-lg border border-bon/40 bg-bon/10 p-2.5">
          <dt className="text-xs font-semibold tracking-wide text-texte-2 uppercase">Correction proposée</dt>
          <dd className="mt-0.5">{anomalie.correction}</dd>
        </div>
        <div>
          <dt className="text-xs text-muet">Pourquoi</dt>
          <dd className="text-texte-2">{anomalie.explication}</dd>
        </div>
        <div>
          <dt className="text-xs text-muet">Source</dt>
          <dd className="text-texte-2">{anomalie.source}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Bouton variante="primaire" icone={Check} onClick={() => void deciderAnomalie(anomalie, 'validee')}>
          Valider la correction
        </Bouton>
        <Bouton icone={X} onClick={() => void deciderAnomalie(anomalie, 'refusee')}>
          Refuser
        </Bouton>
      </div>
      <p className="mt-2 text-xs text-muet">
        La correction s'applique dans l'app uniquement ; le fichier du drive n'est pas modifié.
      </p>
    </li>
  );
}

export function Corrections() {
  const d = useDonnees();
  const estimation = d.estimations.find((e) => e.statut === 'a_valider');
  const modifies = d.fichiers.filter((f) => f.etat === 'modifie');
  const anomalies = d.anomalies.filter((a) => a.statut === 'en_attente');
  const notifications = [...d.notifications].sort((a, b) => b.date - a.date);
  const journal = [...d.decisions].sort((a, b) => b.date - a.date);
  const taches = [...d.taches].sort((a, b) => b.majLe - a.majLe).slice(0, 5);
  const etat = d.etatPipeline;
  const [verification, setVerification] = useState(false);

  const toutLire = () =>
    enregistrerPlusieurs(
      'notifications',
      notifications.filter((n) => !n.lu).map((n) => ({ ...n, lu: true })),
    );

  const rienAFaire = !estimation && modifies.length === 0 && anomalies.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TitrePage
        titre="Mises à jour"
        sousTitre="Changements du drive, corrections proposées et journal de tes décisions."
      />

      <div className="mb-4">
        <ProgressionImport />
      </div>
      <Carte titre="Import du drive">
        <p className="flex items-center gap-2 text-sm">
          <RefreshCw size={16} className="text-muet" aria-hidden />
          {LIBELLE_ETAT[etat?.statut ?? 'jamais_lance']}
        </p>
        {etat?.message && <p className="mt-1 text-sm text-texte-2">{etat.message}</p>}
        <p className="chiffres mt-2 text-xs text-muet">
          {etat?.dernierScan ? `Dernière vérification du drive : ${quand(etat.dernierScan)}. ` : ''}
          La vérification est automatique chaque semaine.
          {etat?.nbFichiers !== undefined &&
            ` ${etat.nbFichiers} fichiers · ${etat.nbChapitres ?? 0} chapitres · ${etat.nbQuestions ?? 0} questions.`}
        </p>
        {taches.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-texte-2">
            {taches.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Pastille ton={t.statut === 'erreur' ? 'critique' : t.statut === 'terminee' ? 'bon' : 'accent'}>
                  {t.statut === 'en_attente'
                    ? 'En attente'
                    : t.statut === 'en_cours'
                      ? 'En cours'
                      : t.statut === 'terminee'
                        ? 'Terminée'
                        : 'Erreur'}
                </Pastille>
                {LIBELLE_TACHE[t.type]}
                {t.message && <span className="text-xs text-muet">— {t.message}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Bouton
            icone={RefreshCw}
            disabled={verification}
            onClick={() => {
              setVerification(true);
              void creerTache('verifier_drive');
            }}
          >
            {verification ? 'Vérification demandée' : 'Vérifier le drive maintenant'}
          </Bouton>
          <Link to="/reglages" className="text-xs text-accent-clair hover:underline">
            Réglages de l'import
          </Link>
        </div>
      </Carte>

      {estimation && <CarteEstimation estimation={estimation} />}

      {modifies.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-texte-2">
            Fichiers modifiés dans le drive ({modifies.length})
          </h2>
          <ul className="space-y-2">
            {modifies.map((f) => {
              const chapitre = f.chapitreId ? d.chapitreParId.get(f.chapitreId) : undefined;
              return (
                <li key={f.id} className="carte p-4">
                  <p className="text-sm font-medium">{f.nom}</p>
                  <p className="chiffres mt-0.5 text-xs text-muet">
                    {f.chemin} · modifié le {new Date(f.modifieLe).toLocaleDateString('fr-FR')}
                    {chapitre && ` · chapitre « ${chapitre.titre} »`}
                  </p>
                  <p className="mt-2 text-sm text-texte-2">
                    Valider relance la lecture du fichier et met à jour la fiche et les QCM du
                    chapitre. Refuser conserve le contenu actuel.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Bouton variante="primaire" icone={Check} onClick={() => void deciderMiseAJour(f, 'validee')}>
                      Mettre à jour
                    </Bouton>
                    <Bouton icone={X} onClick={() => void deciderMiseAJour(f, 'refusee')}>
                      Garder l'ancienne version
                    </Bouton>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {anomalies.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-texte-2">
            Corrections proposées ({anomalies.length})
          </h2>
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <CarteAnomalie key={a.id} anomalie={a} />
            ))}
          </ul>
        </section>
      )}

      {rienAFaire && (
        <EtatVide icone={CircleCheck} titre="Rien à valider">
          Les fichiers modifiés et les erreurs détectées dans les annales, les corrigés et les
          cours apparaîtront ici.
        </EtatVide>
      )}

      {d.illisibles.length > 0 && (
        <Carte
          titre={
            <span className="flex items-center gap-2">
              <ScanText size={16} aria-hidden />
              Passages illisibles ({d.illisibles.length})
            </span>
          }
        >
          <p className="mb-3 text-xs text-muet">
            La reconnaissance de texte n'a pas pu lire ces passages avec certitude. Ils ont été
            laissés de côté plutôt que devinés.
          </p>
          <ul className="space-y-2 text-sm">
            {d.illisibles.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5">
                <FileQuestion size={16} className="mt-0.5 shrink-0 text-muet" aria-hidden />
                <span>
                  <span className="font-medium">{p.fichierNom}</span>
                  {p.page !== undefined && <span className="chiffres text-muet"> · page {p.page}</span>}
                  <span className="block text-texte-2">{p.contexte}</span>
                </span>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <Carte
        titre={
          <span className="flex items-center gap-2">
            <Bell size={16} aria-hidden />
            Notifications
          </span>
        }
        action={
          d.nbNotificationsNonLues > 0 && (
            <button type="button" onClick={() => void toutLire()} className="text-xs text-accent-clair hover:underline">
              Tout marquer comme lu
            </button>
          )
        }
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-texte-2">Aucune notification.</p>
        ) : (
          <ul className="divide-y divide-grille">
            {notifications.slice(0, 30).map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-2.5 text-sm">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lu ? 'bg-surface-3' : 'bg-accent'}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {n.titre}
                    {!n.lu && <span className="sr-only"> (non lue)</span>}
                  </span>
                  <span className="block text-texte-2">{n.message}</span>
                  <span className="chiffres block text-xs text-muet">{quand(n.date)}</span>
                </span>
                {n.chapitreId && d.chapitreParId.has(n.chapitreId) && (
                  <Link to={`/chapitre/${n.chapitreId}`} className="shrink-0 text-xs text-accent-clair hover:underline">
                    Ouvrir
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte
        titre={
          <span className="flex items-center gap-2">
            <History size={16} aria-hidden />
            Journal des décisions
          </span>
        }
      >
        {journal.length === 0 ? (
          <p className="text-sm text-texte-2">Aucune décision pour le moment.</p>
        ) : (
          <ul className="divide-y divide-grille">
            {journal.map((j) => (
              <li key={j.id} className="flex items-start gap-3 py-2.5 text-sm">
                <Pastille ton={j.decision === 'validee' ? 'bon' : 'neutre'} icone={j.decision === 'validee' ? Check : X}>
                  {j.decision === 'validee' ? 'Validée' : 'Refusée'}
                </Pastille>
                <span className="min-w-0 flex-1">
                  <span className="block text-texte-2">{j.resume ?? j.cibleId}</span>
                  <span className="chiffres block text-xs text-muet">{quand(j.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </div>
  );
}
