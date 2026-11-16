/**
 * Application des corrections validées.
 *
 * Une correction ne touche jamais les fichiers du drive : elle modifie les
 * données de l'app (réponses d'une question, classement, texte) ou ajoute un
 * erratum au chapitre concerné. La même fonction est utilisée par le serveur
 * (source de vérité) et par l'app (effet immédiat, même hors connexion).
 */
import type { Chapitre, Fichier, Patch, Question } from './types';

export interface DocsCibles {
  question?: Question;
  chapitre?: Chapitre;
}

export interface ResultatPatch {
  question?: Question;
  chapitre?: Chapitre;
}

/** Renvoie les documents modifiés par le patch (copies ; rien n'est muté). */
export function appliquerPatch(patch: Patch, cibles: DocsCibles): ResultatPatch {
  switch (patch.op) {
    case 'reponses': {
      const q = cibles.question;
      if (!q?.propositions) return {};
      const correctes = new Set(patch.correctes);
      return {
        question: {
          ...q,
          propositions: q.propositions.map((p) => ({ ...p, correcte: correctes.has(p.id) })),
          version: q.version + 1,
        },
      };
    }
    case 'deplacer': {
      const q = cibles.question;
      if (!q) return {};
      return {
        question: {
          ...q,
          chapitreId: patch.chapitreId,
          matiereId: patch.matiereId,
          version: q.version + 1,
        },
      };
    }
    case 'texte': {
      const q = cibles.question;
      if (!q) return {};
      return { question: { ...q, [patch.champ]: patch.apres, version: q.version + 1 } };
    }
    case 'erratum': {
      const c = cibles.chapitre;
      if (!c) return {};
      const erratums = c.erratums ?? [];
      if (erratums.includes(patch.note)) return {};
      return { chapitre: { ...c, erratums: [...erratums, patch.note] } };
    }
  }
}

/** Identifiants des documents dont le patch a besoin. */
export function ciblesDuPatch(patch: Patch): { questionId?: string; chapitreId?: string } {
  return patch.op === 'erratum' ? { chapitreId: patch.chapitreId } : { questionId: patch.questionId };
}

/**
 * Effet d'une décision sur un fichier modifié dans le drive :
 *  - validée : le fichier sera retraité au prochain passage du pipeline ;
 *  - refusée : la version actuelle est ignorée, le contenu existant est conservé.
 */
export function deciderFichier(fichier: Fichier, decision: 'validee' | 'refusee'): Fichier {
  if (fichier.etat !== 'modifie') return fichier;
  return decision === 'validee'
    ? { ...fichier, etat: 'maj_validee' }
    : { ...fichier, etat: 'a_jour', versionIgnoree: fichier.modifieLe };
}
