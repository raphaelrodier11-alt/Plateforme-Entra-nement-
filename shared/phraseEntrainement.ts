/**
 * Comprend une phrase du type « 20 questions de génétique, niveau difficile,
 * 25 minutes, uniquement le chapitre 3 » et en tire les règles d'un
 * entraînement. Analyse locale (gratuite, instantanée) : l'étudiant vérifie
 * toujours le résultat avant de lancer.
 */
import type { Chapitre, Matiere, ReglesEntrainement, TypeQuestion } from './types';
import { normaliser } from './assistant';

export interface ReglesComprises {
  regles: ReglesEntrainement;
  /** Ce qui a été compris, en phrases courtes, pour la vérification. */
  compris: string[];
  /** Ce qui n'a pas pu être compris (aucune matière trouvée, chapitre inconnu…). */
  avertissements: string[];
}

const MAX = 500;

function matiereCitee(texte: string, matieres: Matiere[]): Matiere | undefined {
  let meilleure: { m: Matiere; score: number } | undefined;
  for (const m of matieres) {
    const nom = normaliser(m.nom);
    let score = texte.includes(nom) ? nom.length + 10 : 0;
    if (!score) {
      for (const mot of nom.split(' ')) {
        if (mot.length >= 5 && texte.includes(mot.slice(0, Math.max(5, mot.length - 2)))) score = Math.max(score, mot.length);
      }
    }
    if (score && (!meilleure || score > meilleure.score)) meilleure = { m, score };
  }
  return meilleure?.m;
}

function chapitresCites(texte: string, chapitres: Chapitre[]): { ids: string[]; inconnus: number[] } {
  const numeros = new Set<number>();
  for (const bloc of texte.matchAll(/(?:chapitres?|chap\.?|ch\.?|cours)\s*((?:\d+\s*(?:,|et|&|a|à|-)?\s*)+)/g)) {
    const liste = bloc[1] ?? '';
    const plage = /(\d+)\s*(?:a|à|-)\s*(\d+)/.exec(liste);
    if (plage) {
      for (let n = Number(plage[1]); n <= Number(plage[2]) && n - Number(plage[1]) < 60; n++) numeros.add(n);
    } else {
      for (const n of liste.matchAll(/\d+/g)) numeros.add(Number(n[0]));
    }
  }
  const tries = [...chapitres].sort((a, b) => a.ordre - b.ordre);
  const ids: string[] = [];
  const inconnus: number[] = [];
  for (const n of numeros) {
    const parTitre = tries.find((c) => new RegExp(`^(?:chapitre|chap|cours|ch)?\\s*0*${n}(?![0-9])`).test(normaliser(c.titre)));
    const cible = parTitre ?? tries[n - 1];
    if (cible) ids.push(cible.id);
    else inconnus.push(n);
  }
  return { ids: [...new Set(ids)], inconnus };
}

function dureeMin(texte: string): number | undefined {
  const hm = /(\d+)\s*h(?:eures?)?\s*(\d{1,2})?/.exec(texte);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const m = /(\d+)\s*(?:min|minutes?|mn)\b/.exec(texte);
  return m ? Number(m[1]) : undefined;
}

export function comprendrePhrase(phrase: string, matieres: Matiere[], chapitres: Chapitre[]): ReglesComprises {
  const t = normaliser(phrase);
  const compris: string[] = [];
  const avertissements: string[] = [];

  const matiere = matiereCitee(t, matieres);
  if (matiere) compris.push(`Matière : ${matiere.nom}`);
  else if (matieres.length) avertissements.push('Aucune matière reconnue : toutes les matières seront utilisées.');

  const chapitresMatiere = chapitres.filter((c) => !matiere || c.matiereId === matiere.id);
  const cites = chapitresCites(t, chapitresMatiere);
  if (cites.ids.length) compris.push(`${cites.ids.length} chapitre${cites.ids.length > 1 ? 's' : ''} ciblé${cites.ids.length > 1 ? 's' : ''}`);
  for (const n of cites.inconnus) avertissements.push(`Chapitre ${n} introuvable.`);

  const sansDuree = t.replace(/\d+\s*(?:h(?:eures?)?\s*\d{0,2}|min(?:utes?)?|mn)\b/g, ' ');
  const sansChapitres = sansDuree.replace(/(?:chapitres?|chap\.?|ch\.?|cours)\s*(?:\d+\s*(?:,|et|&|a|à|-)?\s*)+/g, ' ');
  const nb = /(\d+)\s*(?:questions?|qcms?|qroc|q\b|exercices?)/.exec(sansChapitres) ?? /(\d+)/.exec(sansChapitres);
  const nombre = Math.min(MAX, Math.max(1, nb ? Number(nb[1]) : 20));
  compris.push(`${nombre} questions`);

  const duree = dureeMin(t);
  if (duree) compris.push(`Chrono : ${duree} min`);

  const difficulte: ReglesEntrainement['difficulte'] = /\b(difficile|dur|durs|corse|compliqu\w*|hard)\b/.test(t)
    ? 'difficile'
    : /\b(facile|simple|debutant)\b/.test(t) && !/choix simple/.test(t)
      ? 'facile'
      : /\bmoyen\w*\b/.test(t)
        ? 'moyenne'
        : 'mixte';
  if (difficulte !== 'mixte') compris.push(`Difficulté : ${difficulte}`);

  const types: TypeQuestion[] = [];
  if (/vrai\s*(?:\/|ou|-)?\s*faux/.test(t)) types.push('vrai_faux');
  if (/choix multiples?|reponses? multiples?|qcm multiples?/.test(t)) types.push('multiple');
  if (/choix simples?|une seule reponse|qcm simples?/.test(t)) types.push('simple');
  if (/\btrous?\b/.test(t)) types.push('trous');
  if (types.length) compris.push('Types demandés');

  const pieges = /pieges?|piegeux/.test(t);
  if (pieges) compris.push('Pièges classiques');
  const cas = /cas cliniques?/.test(t);
  if (cas) compris.push('Cas cliniques');

  const regles: ReglesEntrainement = {
    ...(matiere ? { matiereId: matiere.id } : {}),
    chapitreIds: cites.ids,
    types,
    casCliniques: cas,
    difficulte,
    pieges,
    nombre,
    ...(duree ? { chronoMin: duree } : {}),
    consignes: phrase.trim().slice(0, 600),
  };
  return { regles, compris, avertissements };
}
