/**
 * Déroulement d'un passage du pipeline.
 *
 * Le pipeline est lancé toutes les heures par GitHub Actions. La plupart du
 * temps il n'a rien à faire et s'arrête aussitôt. Sinon, dans l'ordre :
 *
 *  1. vérification du drive (une fois par semaine, ou à la demande) ;
 *  2. lecture locale des fichiers nouveaux ou dont la mise à jour est validée ;
 *  3. tant que la génération n'a pas été approuvée dans l'app : estimation
 *     du coût, puis arrêt (aucune dépense d'IA) ;
 *  4. une fois approuvée : lecture des scans, classement, annales, fiches et
 *     QCM, détection d'erreurs, dans la limite du plafond de dépense.
 *
 * Chaque étape enregistre son avancement : un passage interrompu (durée,
 * plafond, panne) reprend là où il s'était arrêté.
 */
import type {
  Chapitre,
  Depot,
  Estimation,
  EtatPipeline,
  Fichier,
  NotificationApp,
  Question,
  Reglages,
  Tache,
} from '../shared/types';
import { ECHECS_MAX, estArret, notifier, type Contexte } from './contexte';
import { idDossier, type Drive } from './drive';
import { comparer, finaliserAnciens } from './actualisations';
import { DOSSIER_DEPOT, driveComposite, driveDepot, estFichierDepot, idFichierDepot } from './depot';
import { DOSSIER_MOODLE, driveMoodle, notificationsMoodle } from './moodle';
import { chapitresSansCours, completerCours, demandesCoursUltra, traiterCoursUltra } from './cours';
import { demandesATraiter, traiterDemandes } from './documents';
import { entrainementsATraiter, traiterEntrainements } from './entrainements';
import { ajouterQuestions, genererChapitres, traiterAnnales, verifierChapitres } from './generation';
import type { Ia } from './ia';
import { aTraiter, estimer, lireFichiers, lireScans, scanner, structurer } from './import';
import { erreurPrivee, erreurPublique, journal } from './journal';
import { Memoire, type Stockage } from './stockage';
import type { Niveau } from './tarifs';

export const SEMAINE_MS = 7 * 86_400_000;
/** Plafond mensuel minimal, en dollars, quand aucun n'est réglé. */
export const PLAFOND_MINIMAL_USD = 3;

export type Mode = 'auto' | 'scan';

export interface OptionsIa {
  gratuit: boolean;
  modeleMasse?: string;
  modeleExpert?: string;
  tarifs?: Reglages['tarifs'];
  plafondUsd: number;
}

export interface Dependances {
  stockage: Stockage;
  creerDrive: (jeton: () => Promise<string>) => Drive;
  /** Absente si la clé Gemini n'est pas fournie. */
  creerIa?: (options: OptionsIa) => Promise<Ia>;
  lire: Contexte['lire'];
  mode: Mode;
  budgetMinutes: number;
  maintenant?: number;
  /** Moodle de la fac (adresse + jeton personnel), facultatif. */
  moodle?: { url: string; jeton: string };
}

export type Issue =
  | 'non_configure'
  | 'rien_a_faire'
  | 'estimation'
  | 'termine'
  | 'a_reprendre'
  | 'plafond'
  | 'quota'
  | 'sans_cle'
  | 'erreur';

const NOMS_PAR_DEFAUT: Record<Niveau, string> = {
  masse: 'gemini-flash (choisi au lancement)',
  expert: 'gemini-pro (choisi au lancement)',
};

export async function executer(d: Dependances): Promise<Issue> {
  const maintenant = d.maintenant ?? Date.now();
  const memoire = new Memoire(d.stockage);
  await memoire.charger('reglages', 'etat', 'taches', 'fichiers', 'depots', 'chapitres', 'estimations', 'notifications', 'demandes', 'entrainements', 'cours', 'fiches');
  memoire.ouvrirVide('medias');

  const reglages = memoire.lire<Reglages>('reglages', 'principal');
  const lireEtat = (): EtatPipeline =>
    memoire.lire<EtatPipeline>('etat', 'pipeline') ?? { id: 'pipeline', statut: 'jamais_lance' };
  const majEtat = async (partiel: Partial<EtatPipeline>): Promise<void> => {
    const courant = lireEtat();
    const suivant = { ...courant, ...partiel };
    // Pas d'écriture inutile : le pipeline passe toutes les heures.
    if (JSON.stringify(suivant) !== JSON.stringify(courant)) {
      await memoire.ecrire<EtatPipeline>('etat', { ...suivant, dernierPassage: maintenant });
    }
  };

  // Deux sources, utilisables ensemble ou séparément : le Google Drive
  // (s'il est configuré et connecté) et les fichiers envoyés depuis l'app.
  // Par défaut, seul le palier gratuit de Gemini est utilisé : rien ne peut être facturé.
  const gratuit = reglages?.modeGratuit !== false;
  const dossierCours = idDossier(reglages?.dossierCours);
  const dossierAnciens = idDossier(reglages?.dossierAnciens);
  const dossierAnnales = idDossier(reglages?.dossierAnnales);
  // Drives ajoutés par l'utilisateur, avec leur nom et leur type.
  const supplementaires = (reglages?.drives ?? [])
    .map((x) => ({ ...x, dossier: idDossier(x.lien) }))
    .filter((x): x is typeof x & { dossier: string } => !!x.dossier);
  const driveConfigure = (!!dossierCours && !!dossierAnnales) || supplementaires.length > 0;
  const jeton = driveConfigure ? await d.stockage.jetonDrive() : undefined;
  const avecDrive = driveConfigure && !!jeton;
  const avecMoodle = !!d.moodle;
  const depotsActuels = (): Depot[] => memoire.liste<Depot>('depots');
  const fichiersDepot = (): Fichier[] =>
    memoire.liste<Fichier>('fichiers').filter((f) => estFichierDepot(f.id) && f.etat !== 'supprime');
  const avecDepot = depotsActuels().length > 0 || fichiersDepot().length > 0;

  // Demandes de l'app (documents, entraînements sur mesure) : traitées en premier, indépendamment de l'import.
  const aDesDemandes = demandesATraiter(memoire, maintenant).length > 0;
  const aDesCoursUltra = demandesCoursUltra(memoire, maintenant).length > 0;
  const aDesEntrainements = entrainementsATraiter({ memoire, maintenant }).length > 0;
  if (d.creerIa && (aDesDemandes || aDesEntrainements || aDesCoursUltra)) {
    await memoire.charger('matieres', 'documents');
    try {
      const iaDemandes = await d.creerIa({
        modeleMasse: reglages?.modeleMasse,
        modeleExpert: reglages?.modeleExpert,
        tarifs: reglages?.tarifs,
        plafondUsd: gratuit ? Number.MAX_SAFE_INTEGER : (reglages?.plafondMensuelUsd ?? PLAFOND_MINIMAL_USD),
        gratuit,
      });
      if (aDesDemandes) {
        const n = await traiterDemandes(memoire, iaDemandes, maintenant);
        journal(`Documents demandés : ${n} rédigé${n > 1 ? 's' : ''}`);
      }
      if (aDesCoursUltra) {
        await memoire.charger('questions', 'textes');
        const contexteCours: Contexte = {
          memoire,
          drive: { lister: async () => [], telecharger: async () => { throw new Error('Sans drive'); } },
          ia: iaDemandes,
          maintenant,
          lire: d.lire,
          echeance: Date.now() + Math.min(d.budgetMinutes, 30) * 60_000,
        };
        const n = await traiterCoursUltra(contexteCours);
        journal(`Cours ultra complets : ${n} rédigé${n > 1 ? 's' : ''}`);
      }
      if (aDesEntrainements) {
        await memoire.charger('questionsPerso', 'questions', 'cas', 'textes');
        const contexteDemandes: Contexte = {
          memoire,
          drive: { lister: async () => [], telecharger: async () => { throw new Error('Sans drive'); } },
          ia: iaDemandes,
          maintenant,
          lire: d.lire,
          echeance: Date.now() + Math.min(d.budgetMinutes, 30) * 60_000,
        };
        const n = await traiterEntrainements(contexteDemandes);
        journal(`Entraînements sur mesure : ${n} question${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}`);
      }
    } catch (erreur) {
      if (!estArret(erreur)) journal(`Demandes de l'app : ${erreurPublique(erreur)}`);
      else journal("Demandes de l'app : limite atteinte, reprise au prochain passage");
    }
  }

  // Notifications Moodle : relues à chaque passage (rapide), sans doublon.
  if (d.moodle) {
    try {
      let nouvelles = 0;
      for (const n of await notificationsMoodle(d.moodle.url, d.moodle.jeton)) {
        if (memoire.lire('notifications', n.id)) continue;
        await memoire.ecrire<NotificationApp>('notifications', { id: n.id, type: 'info', titre: `Moodle · ${n.titre}`, message: n.message, date: n.date });
        nouvelles++;
      }
      if (nouvelles) journal(`Moodle : ${nouvelles} notification${nouvelles > 1 ? 's' : ''}`);
    } catch (erreur) {
      journal(`Moodle (notifications) : ${erreurPublique(erreur)}`);
    }
  }

  if (!avecDrive && !avecDepot && !avecMoodle) {
    const sansConnexion = driveConfigure;
    journal(sansConnexion ? 'Google Drive non connecté : rien à faire' : 'Aucune source de fichiers : rien à faire');
    await majEtat({
      statut: 'jamais_lance',
      message: sansConnexion
        ? 'Connecte ton compte Google dans les réglages, ou envoie tes fichiers depuis la page Fichiers.'
        : "Envoie tes fichiers depuis la page Fichiers, ou indique les dossiers du drive dans les réglages.",
      driveConnecte: false,
    });
    return 'non_configure';
  }

  /** Les fichiers envoyés ont-ils tous été vus par le pipeline, dans leur version actuelle ? */
  const depotsVus = (): boolean =>
    depotsActuels().every((dep) => {
      const f = memoire.lire<Fichier>('fichiers', idFichierDepot(dep.id));
      return !!f && f.etat !== 'supprime' && f.modifieLe === dep.modifieLe;
    }) && fichiersDepot().every((f) => !!memoire.lire('depots', f.id.slice('depot:'.length)));

  const tachesOuvertes = (): Tache[] =>
    memoire.liste<Tache>('taches').filter((t) => t.statut === 'en_attente' || t.statut === 'en_cours');
  const cloreTaches = async (type: Tache['type'], message?: string): Promise<void> => {
    for (const t of tachesOuvertes().filter((x) => x.type === type)) {
      await memoire.ecrire<Tache>('taches', { ...t, statut: 'terminee', majLe: maintenant, ...(message ? { message } : {}) });
    }
  };
  const resteDuTravail = (): boolean =>
    memoire.liste<Fichier>('fichiers').some(aTraiter) ||
    memoire.liste<Chapitre>('chapitres').some((x) => x.aGenerer || x.aVerifier || x.aComparer) ||
    (!!d.creerIa && chapitresSansCours(memoire).length > 0);

  const etatInitial = lireEtat();
  const scanDu =
    d.mode === 'scan' ||
    !etatInitial.dernierScan ||
    maintenant - etatInitial.dernierScan >= SEMAINE_MS ||
    // Un fichier envoyé est pris en compte tout de suite, sans attendre la semaine.
    !depotsVus() ||
    tachesOuvertes().some((t) => t.type === 'verifier_drive');
  if (!scanDu && !resteDuTravail() && tachesOuvertes().length === 0) {
    journal('Rien à faire');
    return 'rien_a_faire';
  }

  await memoire.charger(
    'matieres', 'partiels', 'questions', 'cas', 'fiches', 'flashcards', 'anomalies', 'illisibles', 'actualisations', 'textes',
  );
  const contexte: Contexte = {
    memoire,
    // Le jeton Google expire au bout d'une heure : il est redemandé au besoin.
    drive: driveComposite(
      avecDrive ? d.creerDrive(jetonRenouvele(d.stockage, jeton!)) : undefined,
      driveDepot(depotsActuels, d.stockage),
      d.moodle ? driveMoodle(d.moodle.url, d.moodle.jeton) : undefined,
    ),
    maintenant,
    lire: d.lire,
    echeance: Date.now() + d.budgetMinutes * 60_000,
  };

  try {
    await majEtat({ statut: 'en_cours', message: undefined, driveConnecte: avecDrive });

    if (scanDu) {
      const deType = (type: 'cours' | 'annales' | 'anciens') => supplementaires.filter((x) => x.type === type).map((x) => x.dossier);
      await scanner(contexte, {
        cours: [...(avecDrive && dossierCours ? [dossierCours] : []), ...(avecDrive ? deType('cours') : []), ...(avecDepot ? [DOSSIER_DEPOT.cours] : []), ...(avecMoodle ? [DOSSIER_MOODLE] : [])],
        annales: [...(avecDrive && dossierAnnales ? [dossierAnnales] : []), ...(avecDrive ? deType('annales') : []), ...(avecDepot ? [DOSSIER_DEPOT.annales] : [])],
        anciens: [...(avecDrive && dossierAnciens ? [dossierAnciens] : []), ...(avecDrive ? deType('anciens') : []), ...(avecDepot ? [DOSSIER_DEPOT.anciens] : [])],
        noms: { ...Object.fromEntries(supplementaires.map((x) => [x.dossier, x.nom])), [DOSSIER_MOODLE]: 'Moodle' },
        tolerants: [...supplementaires.map((x) => x.dossier), DOSSIER_MOODLE],
        garde: avecDrive || avecMoodle,
      });
      await majEtat({ dernierScan: maintenant });
      await cloreTaches('verifier_drive');
    }
    await lireFichiers(contexte);

    // Régénération demandée pour un chapitre.
    for (const t of tachesOuvertes().filter((x) => x.type === 'regenerer_chapitre')) {
      const chapitre = t.chapitreId ? memoire.lire<Chapitre>('chapitres', t.chapitreId) : undefined;
      if (chapitre) await memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aGenerer: true, aVerifier: true });
      await memoire.ecrire<Tache>('taches', { ...t, statut: 'terminee', majLe: maintenant });
    }

    const compter = () => ({
      nbFichiers: memoire.liste<Fichier>('fichiers').filter((f) => f.etat !== 'supprime').length,
      nbChapitres: memoire.liste<Chapitre>('chapitres').length,
      nbQuestions: memoire.liste<Question>('questions').length,
    });
    const enEchec = memoire.liste<Fichier>('fichiers').filter((f) => (f.echecs ?? 0) >= ECHECS_MAX).length;
    const noteEchecs = enEchec ? ` ${enEchec} fichier${enEchec > 1 ? 's' : ''} n'ont pas pu être traités.` : '';

    // --- Avant approbation : estimation seulement, aucune dépense ----------
    const approuvee = memoire.liste<Tache>('taches').some((t) => t.type === 'generation_complete');
    if (!approuvee) {
      if (!memoire.liste<Fichier>('fichiers').some(aTraiter)) {
        await majEtat({ statut: 'ok', message: noteEchecs.trim() || undefined, ...compter() });
        return 'termine';
      }
      const estimation = estimer(contexte, NOMS_PAR_DEFAUT, gratuit);
      if (!memoire.lire<Estimation>('estimations', estimation.id)) {
        for (const ancienne of memoire.liste<Estimation>('estimations').filter((e) => e.statut === 'a_valider')) {
          await memoire.ecrire<Estimation>('estimations', { ...ancienne, statut: 'perimee' });
        }
        await memoire.ecrire('estimations', estimation);
        await notifier(contexte, {
          id: `estimation:${estimation.id}`,
          type: 'estimation',
          titre: 'Estimation du coût prête',
          message: `La génération complète est estimée à ${estimation.totalUsd.toFixed(2)} $. Valide-la pour lancer la génération.`,
        });
      }
      journal('Estimation prête : en attente de validation dans l’app');
      await majEtat({
        statut: 'en_attente_validation',
        message: `Estimation du coût à valider avant de lancer la génération.${noteEchecs}`,
        ...compter(),
      });
      return 'estimation';
    }

    for (const e of memoire.liste<Estimation>('estimations').filter((x) => x.statut === 'a_valider')) {
      await memoire.ecrire<Estimation>('estimations', { ...e, statut: 'approuvee' });
    }
    const questionsDemandees = tachesOuvertes().filter((t) => t.type === 'plus_de_questions');
    if (!resteDuTravail() && questionsDemandees.length === 0) {
      await cloreTaches('generation_complete');
      await majEtat({ statut: 'ok', message: noteEchecs.trim() || undefined, ...compter() });
      return 'termine';
    }
    if (!d.creerIa) {
      journal('Clé Gemini absente : génération impossible');
      await majEtat({
        statut: 'erreur',
        message: 'La clé Gemini est absente : ajoute le secret GEMINI_API_KEY dans GitHub.',
      });
      return 'sans_cle';
    }

    // --- Plafond de dépense du mois -----------------------------------------
    const mois = new Date(maintenant).toISOString().slice(0, 7);
    const dejaDepense = etatInitial.depense?.mois === mois ? etatInitial.depense.usd : 0;
    const reference = memoire
      .liste<Estimation>('estimations')
      .filter((e) => e.statut === 'approuvee')
      .sort((a, b) => b.date - a.date)[0];
    const plafond =
      reglages?.plafondMensuelUsd ?? Math.max(PLAFOND_MINIMAL_USD, 2 * (reference?.totalUsd ?? 0));
    const signalerPlafond = async (): Promise<void> => {
      await notifier(contexte, {
        id: `plafond:${mois}`,
        type: 'info',
        titre: 'Plafond de dépense atteint',
        message: `Le plafond mensuel de ${plafond.toFixed(2)} $ est atteint : la génération est en pause. Tu peux le relever dans les réglages.`,
      });
      await majEtat({
        statut: 'en_attente_validation',
        message: `Plafond mensuel de dépense atteint (${plafond.toFixed(2)} $). Relève-le dans les réglages pour continuer.`,
      });
    };
    if (plafond - dejaDepense <= 0) {
      journal('Plafond mensuel atteint : génération en pause');
      await signalerPlafond();
      return 'plafond';
    }

    const ia = await d.creerIa({
      modeleMasse: reglages?.modeleMasse,
      modeleExpert: reglages?.modeleExpert,
      tarifs: reglages?.tarifs,
      plafondUsd: plafond - dejaDepense,
      gratuit,
    });
    contexte.ia = ia;
    for (const t of tachesOuvertes().filter((x) => x.type === 'generation_complete' && x.statut === 'en_attente')) {
      await memoire.ecrire<Tache>('taches', { ...t, statut: 'en_cours', majLe: maintenant });
    }

    let arret: 'plafond' | 'quota' | undefined;
    let quotaDuJour = false;
    let surcharge = false;
    try {
      await lireScans(contexte);
      await structurer(contexte);
      await finaliserAnciens(contexte);
      await traiterAnnales(contexte);
      await genererChapitres(contexte);
      await completerCours(contexte);
      await comparer(contexte);
      await verifierChapitres(contexte);
      for (const t of questionsDemandees) {
        const n = t.chapitreId ? await ajouterQuestions(contexte, t.chapitreId) : 0;
        await memoire.ecrire<Tache>('taches', {
          ...t,
          statut: 'terminee',
          majLe: maintenant,
          message: `${n} question${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`,
        });
      }
    } catch (erreur) {
      // Gemini surchargé (erreur 5xx persistante) : simple pause, le prochain passage reprend.
      const statut = (erreur as { status?: number }).status;
      surcharge = !estArret(erreur) && statut !== undefined && statut >= 500;
      if (!estArret(erreur) && !surcharge) throw erreur;
      arret = surcharge || (erreur as Error).name === 'QuotaAtteint' ? 'quota' : 'plafond';
      quotaDuJour = (erreur as { quotidien?: boolean }).quotidien === true;
    } finally {
      // Jour du quota Gemini : minuit heure du Pacifique (≈ 9 h à Paris).
      const jourQuota = new Date(maintenant).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      const avant = lireEtat().requetesIa;
      const n = (avant?.jour === jourQuota ? avant.n : 0) + (ia.requetes ?? 0);
      await majEtat({
        depense: { mois, usd: Math.round((dejaDepense + ia.compteur.total) * 100) / 100 },
        modeles: ia.modeles,
        requetesIa: { jour: jourQuota, n },
        ...(quotaDuJour ? { limiteJour: { jour: jourQuota, n } } : {}),
      });
      journal(`Requêtes Gemini aujourd'hui : ${n}${quotaDuJour ? ' (limite du jour atteinte)' : ''}`);
      journal(`Dépense de ce passage : ${ia.compteur.total.toFixed(2)} $`);
    }

    if (arret === 'quota') {
      journal('Limite du palier gratuit atteinte : reprise au prochain passage');
      await majEtat({
        statut: 'en_cours',
        message: surcharge
          ? 'Gemini est momentanément surchargé : le traitement reprend tout seul au prochain passage. Rien n’est dépensé.'
          : quotaDuJour
          ? 'Limite gratuite du jour de Gemini atteinte : le traitement reprend tout seul demain (vers 9 h, heure de Paris). Rien n’est dépensé.'
          : 'Limite gratuite de Gemini atteinte : le traitement reprend tout seul au prochain passage. Rien n’est dépensé.',
        ...compter(),
      });
      return 'quota';
    }
    if (arret === 'plafond') {
      await signalerPlafond();
      return 'plafond';
    }
    if (resteDuTravail()) {
      await majEtat({
        statut: 'en_cours',
        message: `Traitement en cours : la suite se fera au prochain passage.${noteEchecs}`,
        ...compter(),
      });
      return 'a_reprendre';
    }
    await cloreTaches('generation_complete', 'Génération terminée');
    await majEtat({ statut: 'ok', message: noteEchecs.trim() || undefined, ...compter() });
    return 'termine';
  } catch (erreur) {
    journal(`Passage interrompu : ${erreurPublique(erreur)}`);
    await majEtat({ statut: 'erreur', message: erreurPrivee(erreur) }).catch(() => undefined);
    return 'erreur';
  }
}

/** Fournit un jeton Google valide, renouvelé avant son expiration. */
function jetonRenouvele(stockage: Stockage, premier: string): () => Promise<string> {
  let jeton = premier;
  let obtenuLe = Date.now();
  return async () => {
    if (Date.now() - obtenuLe > 40 * 60_000) {
      jeton = (await stockage.jetonDrive()) ?? jeton;
      obtenuLe = Date.now();
    }
    return jeton;
  };
}
