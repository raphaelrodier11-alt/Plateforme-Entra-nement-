/**
 * Décisions de l'utilisateur : valider ou refuser une correction proposée
 * ou la mise à jour d'un fichier modifié dans le drive.
 *
 * La décision est enregistrée (c'est le journal) et synchronisée ; le
 * serveur en applique l'effet. Pour que l'écran réagisse tout de suite,
 * même hors connexion, le même effet est appliqué à la copie locale.
 */
import { appliquerPatch, ciblesDuPatch, deciderFichier } from '../../shared/corrections';
import type { Anomalie, Chapitre, Decision, Fichier, Question, Tache } from '../../shared/types';
import { base } from '../db/base';
import { ecrireLocal, enregistrer } from '../db/sync';
import { api } from './api';
import { nouvelId } from './sessions';

export async function deciderAnomalie(
  anomalie: Anomalie,
  decision: 'validee' | 'refusee',
): Promise<void> {
  const date = Date.now();
  const doc: Decision = {
    id: `anomalie:${anomalie.id}`,
    cible: 'anomalie',
    cibleId: anomalie.id,
    decision,
    date,
    resume: `${anomalie.description} → ${anomalie.correction}`,
  };
  await enregistrer('decisions', doc);
  await ecrireLocal('anomalies', [{ ...anomalie, statut: decision, decideLe: date }]);

  if (decision === 'validee' && anomalie.patch) {
    const cibles = ciblesDuPatch(anomalie.patch);
    const question = cibles.questionId
      ? await base.collection<Question>('questions').get(cibles.questionId)
      : undefined;
    const chapitre = cibles.chapitreId
      ? await base.collection<Chapitre>('chapitres').get(cibles.chapitreId)
      : undefined;
    const resultat = appliquerPatch(anomalie.patch, { question, chapitre });
    if (resultat.question) await ecrireLocal('questions', [resultat.question]);
    if (resultat.chapitre) await ecrireLocal('chapitres', [resultat.chapitre]);
  }
}

export async function deciderMiseAJour(
  fichier: Fichier,
  decision: 'validee' | 'refusee',
): Promise<void> {
  const doc: Decision = {
    id: `fichier:${fichier.id}`,
    cible: 'fichier',
    cibleId: fichier.id,
    decision,
    date: Date.now(),
    resume: `Mise à jour de « ${fichier.nom} »`,
  };
  await enregistrer('decisions', doc);
  await ecrireLocal('fichiers', [deciderFichier(fichier, decision)]);
  if (decision === 'validee') void demanderPassage();
}

/** Demande au pipeline de passer sans attendre (si le serveur le permet). */
export async function demanderPassage(): Promise<boolean> {
  try {
    const reponse = await api('/pipeline/lancer', { method: 'POST' });
    return ((await reponse.json()) as { declenche: boolean }).declenche;
  } catch {
    return false;
  }
}

/** Crée une tâche pour le pipeline (génération complète, questions en plus…). */
export async function creerTache(type: Tache['type'], chapitreId?: string): Promise<void> {
  const maintenant = Date.now();
  const tache: Tache = {
    id: nouvelId(),
    type,
    statut: 'en_attente',
    chapitreId,
    creeLe: maintenant,
    majLe: maintenant,
  };
  await enregistrer('taches', tache);
  void demanderPassage();
}
