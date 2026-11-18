/**
 * « Ma copie » : la correction d'une série, mise en forme pour l'export (Word, PDF,
 * texte à copier). Fonction pure : elle ne dépend ni du navigateur ni d'une librairie.
 */
import type { Question, ReponseDonnee, TypeQuestion } from './types';

export interface ElementCopie {
  /** Lettre (A, B…) ou numéro de trou. */
  repere: string;
  texte: string;
  /** L'affirmation ou la proposition est juste (bonne réponse). */
  juste: boolean;
  /** L'étudiant l'a cochée (ou jugée vraie), ou a répondu au trou. */
  coche: boolean;
  /** Réponse écrite (texte à trous). */
  saisie?: string;
  explication?: string;
}

export interface QuestionCopie {
  numero: number;
  type: TypeQuestion;
  enonce: string;
  elements: ElementCopie[];
  points?: number;
  nbErreurs?: number;
  repondue: boolean;
  explication: string;
  rappel?: string;
  /** Explication approfondie, si elle a été demandée. */
  profondeur?: string;
}

export interface Copie {
  titre: string;
  matiere?: string;
  date: number;
  noteSur20?: number;
  points?: number;
  total?: number;
  questions: QuestionCopie[];
}

const lettre = (i: number) => String.fromCharCode(65 + i);

export function elementsDeQuestion(q: Question, reponse: ReponseDonnee | undefined): ElementCopie[] {
  if (q.type === 'trous') {
    return (q.trous ?? []).map((t, i) => ({
      repere: String(i + 1),
      texte: t.reponses[0] ?? '',
      juste: true,
      coche: reponse?.textes?.[t.id] !== undefined,
      saisie: reponse?.textes?.[t.id],
    }));
  }
  return (q.propositions ?? []).map((p, i) => ({
    repere: lettre(i),
    texte: p.texte,
    juste: p.correcte,
    coche: q.type === 'vrai_faux' ? reponse?.jugements?.[p.id] === true : (reponse?.cochees ?? []).includes(p.id),
    ...(q.type === 'vrai_faux' && reponse?.jugements?.[p.id] !== undefined ? { saisie: reponse.jugements[p.id] ? 'vrai' : 'faux' } : {}),
    ...(p.explication ? { explication: p.explication } : {}),
  }));
}

/** Texte brut de la copie, prêt à être collé dans n'importe quel document. */
export function copieEnTexte(c: Copie): string {
  const l: string[] = [c.titre];
  if (c.matiere) l.push(c.matiere);
  l.push(`Le ${new Date(c.date).toLocaleDateString('fr-FR')}`);
  if (c.noteSur20 !== undefined) l.push(`Note : ${c.noteSur20.toFixed(1).replace('.', ',')} / 20${c.points !== undefined ? ` (${c.points} point${c.points > 1 ? 's' : ''} sur ${c.total})` : ''}`);
  for (const q of c.questions) {
    l.push('', `Question ${q.numero}${q.repondue ? '' : ' (sans réponse)'}`, q.enonce);
    for (const e of q.elements) {
      const marque = q.type === 'trous'
        ? `${e.saisie ? `ta réponse : ${e.saisie} - ` : ''}attendu : ${e.texte}`
        : `${e.juste ? '[JUSTE]' : '[FAUX]'}${e.coche ? ' [COCHÉE]' : ''}${e.saisie ? ` (ta réponse : ${e.saisie})` : ''}`;
      l.push(q.type === 'trous' ? `  Trou ${e.repere} : ${marque}` : `  ${e.repere}. ${e.texte}  ${marque}`);
    }
    if (q.points !== undefined) l.push(`Points : ${q.points}`);
    l.push(`Explication : ${q.explication}`);
    if (q.rappel) l.push(`Rappel de cours : ${q.rappel}`);
    if (q.profondeur) l.push('', 'Explication approfondie :', q.profondeur.replace(/[*#`]+/g, ''));
  }
  return l.join('\n');
}
