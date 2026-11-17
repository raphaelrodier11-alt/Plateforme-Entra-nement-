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
  Question,
  Reglages,
  Tache,
} from '../shared/types';
import { ECHECS_MAX, notifier, type Contexte } from './contexte';
import { idDossier, type Drive } from './drive';
import { comparer, finaliserAnciens } from './actualisations';
import { DOSSIER_DEPOT, driveComposite, driveDepot, estFichierDepot, idFichierDepot } from './depot';
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
}

export type Issue =
  | 'non_configure'
  | 'rien_a_faire'
  | 'estimation'
  | 'termine'
  | 'a_reprendre'
  | 'plafond'
  | 'sans_cle'
  | 'erreur';

const NOMS_PAR_DEFAUT: Record<Niveau, string> = {
  masse: 'gemini-flash (choisi au lancement)',
  expert: 'gemini-pro (choisi au lancement)',
};

export async function executer(d: Dependances): Promise<Issue> {
  const maintenant = d.maintenant ?? Date.now();
  const memoire = new Memoire(d.stockage);
  await memoire.charger('reglages', 'etat', 'taches', 'fichiers', 'depots', 'chapitres', 'estimations', 'notifications');

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
  const dossierCours = idDossier(reglages?.dossierCours);
  const dossierAnnales = idDossier(reglages?.dossierAnnales);
  const driveConfigure = !!dossierCours && !!dossierAnnales;
  const jeton = driveConfigure ? await d.stockage.jetonDrive() : undefined;
  const avecDrive = driveConfigure && !!jeton;
  const depotsActuels = (): Depot[] => memoire.liste<Depot>('depots');
  const fichiersDepot = (): Fichier[] =>
    memoire.liste<Fichier>('fichiers').filter((f) => estFichierDepot(f.id) && f.etat !== 'supprime');
  const avecDepot = depotsActuels().length > 0 || fichiersDepot().length > 0;

  if (!avecDrive && !avecDepot) {
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
    memoire.liste<Chapitre>('chapitres').some((x) => x.aGenerer || x.aVerifier || x.aComparer);

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
    ),
    maintenant,
    lire: d.lire,
    echeance: Date.now() + d.budgetMinutes * 60_000,
  };

  try {
    await majEtat({ statut: 'en_cours', message: undefined, driveConnecte: avecDrive });

    if (scanDu) {
      await scanner(contexte, {
        cours: [...(avecDrive ? [dossierCours!] : []), ...(avecDepot ? [DOSSIER_DEPOT.cours] : [])],
        annales: [...(avecDrive ? [dossierAnnales!] : []), ...(avecDepot ? [DOSSIER_DEPOT.annales] : [])],
        anciens: avecDepot ? [DOSSIER_DEPOT.anciens] : [],
        garde: avecDrive,
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
      const estimation = estimer(contexte, NOMS_PAR_DEFAUT);
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
    });
    contexte.ia = ia;
    for (const t of tachesOuvertes().filter((x) => x.type === 'generation_complete' && x.statut === 'en_attente')) {
      await memoire.ecrire<Tache>('taches', { ...t, statut: 'en_cours', majLe: maintenant });
    }

    let plafondAtteint = false;
    try {
      await lireScans(contexte);
      await structurer(contexte);
      await finaliserAnciens(contexte);
      await traiterAnnales(contexte);
      await genererChapitres(contexte);
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
      if ((erreur as Error).name !== 'PlafondAtteint') throw erreur;
      plafondAtteint = true;
    } finally {
      await majEtat({
        depense: { mois, usd: Math.round((dejaDepense + ia.compteur.total) * 100) / 100 },
        modeles: ia.modeles,
      });
      journal(`Dépense de ce passage : ${ia.compteur.total.toFixed(2)} $`);
    }

    if (plafondAtteint) {
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
