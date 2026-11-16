/**
 * Effets des décisions de l'utilisateur.
 *
 * Valider une correction applique son patch aux données de l'app ; valider
 * un fichier modifié le remet dans la file du pipeline. Les fichiers du
 * drive ne sont jamais touchés. La décision elle-même est conservée : c'est
 * le journal des corrections validées et refusées.
 */
import { appliquerPatch, ciblesDuPatch, deciderFichier } from '../shared/corrections';
import type { DocSync } from '../shared/collections';
import type { Anomalie, Chapitre, Decision, Fichier, Question } from '../shared/types';
import { instructionEcriture, lireDoc } from './docs';

export async function appliquerDecision(db: D1Database, decision: Decision): Promise<void> {
  const maintenant = Date.now();
  const ecritures: DocSync[] = [];

  if (decision.cible === 'anomalie') {
    const anomalie = await lireDoc<Anomalie>(db, 'anomalies', decision.cibleId);
    if (!anomalie || anomalie.statut !== 'en_attente') return;
    ecritures.push({
      collection: 'anomalies',
      id: anomalie.id,
      data: { ...anomalie, statut: decision.decision, decideLe: decision.date },
      majLe: maintenant,
    });

    if (decision.decision === 'validee' && anomalie.patch) {
      const cibles = ciblesDuPatch(anomalie.patch);
      const question = cibles.questionId
        ? await lireDoc<Question>(db, 'questions', cibles.questionId)
        : undefined;
      const chapitre = cibles.chapitreId
        ? await lireDoc<Chapitre>(db, 'chapitres', cibles.chapitreId)
        : undefined;
      const resultat = appliquerPatch(anomalie.patch, { question, chapitre });
      if (resultat.question) {
        ecritures.push({
          collection: 'questions',
          id: resultat.question.id,
          data: resultat.question,
          majLe: maintenant,
        });
      }
      if (resultat.chapitre) {
        ecritures.push({
          collection: 'chapitres',
          id: resultat.chapitre.id,
          data: resultat.chapitre,
          majLe: maintenant,
        });
      }
    }
  } else {
    const fichier = await lireDoc<Fichier>(db, 'fichiers', decision.cibleId);
    if (!fichier || fichier.etat !== 'modifie') return;
    const decide = deciderFichier(fichier, decision.decision);
    ecritures.push({ collection: 'fichiers', id: fichier.id, data: decide, majLe: maintenant });

    // Mise à jour refusée : le badge du chapitre disparaît s'il ne reste
    // aucun autre fichier modifié en attente.
    if (decision.decision === 'refusee' && fichier.chapitreId) {
      const autres = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM docs
           WHERE collection = 'fichiers' AND deleted = 0 AND id != ?1
             AND json_extract(data, '$.chapitreId') = ?2
             AND json_extract(data, '$.etat') IN ('modifie', 'maj_validee')`,
        )
        .bind(fichier.id, fichier.chapitreId)
        .first<{ n: number }>();
      const chapitre = await lireDoc<Chapitre>(db, 'chapitres', fichier.chapitreId);
      if (chapitre?.majEnAttente && !autres?.n) {
        ecritures.push({
          collection: 'chapitres',
          id: chapitre.id,
          data: { ...chapitre, majEnAttente: false },
          majLe: maintenant,
        });
      }
    }
  }

  if (ecritures.length) await db.batch(ecritures.map((d) => instructionEcriture(db, d)));
}
