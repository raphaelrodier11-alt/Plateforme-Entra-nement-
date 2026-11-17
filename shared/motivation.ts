/**
 * Mot du jour : une phrase d'encouragement, la même toute la journée
 * (choisie d'après la date), et question du jour tirée de la même façon.
 */
export const MOTS_DU_JOUR: string[] = [
  'Un chapitre aujourd’hui, un point de plus demain. Ça compte, vraiment.',
  'Tu n’as pas besoin d’être parfait, juste régulier.',
  'Chaque QCM raté est un piège que tu ne referas plus.',
  'Les futurs médecins ne sont pas ceux qui savent tout, mais ceux qui reviennent chaque jour.',
  'Respire, ouvre ton cours, commence par dix minutes.',
  'Ta mémoire se muscle comme un cœur : par la répétition.',
  'Aujourd’hui, vise une petite victoire, pas la perfection.',
  'Un patient, un jour, sera content que tu aies révisé ce soir.',
  'Même un grand clinicien a un jour appris les bases pour la première fois.',
  'Le plus dur, c’est de commencer. Tu y es presque.',
  'Tes erreurs d’aujourd’hui sont les réflexes de demain.',
  'Une pause fait aussi partie de la révision. Écoute ta fatigue.',
  'Tu avances, même quand tu ne le sens pas.',
  'Pas à pas, chapitre après chapitre, le programme se réduit.',
  'La constance bat l’intensité. Un peu chaque jour suffit.',
  'Tu as déjà tenu plus longtemps que tu ne le crois.',
  'Fais confiance à ta préparation : elle se construit en ce moment.',
  'Un schéma bien compris vaut dix pages relues.',
  'Bois un verre d’eau, redresse-toi, et lance ta séance.',
  'Chaque réponse juste renforce un chemin dans ta mémoire.',
  'Ne compare pas ton chapitre 3 au chapitre 30 de quelqu’un d’autre.',
  'Le Dr Rodier croit en toi. Les statistiques aussi.',
  'Retiens l’essentiel d’abord, les détails viendront ensuite.',
  'Une annale refaite, c’est un partiel apprivoisé.',
  'Tu es plus proche du but qu’hier.',
  'Si c’est difficile, c’est que ton cerveau est en train d’apprendre.',
  'Révise un peu, dors bien : le sommeil range tout ça.',
  'Les grandes réussites sont faites de petites séances.',
  'Aujourd’hui compte autant que la veille du partiel.',
  'Allez, un QCM pour se mettre en route ?',
  'Tu fais un métier où l’on apprend toute sa vie. Autant y prendre goût.',
  'Une erreur identifiée est à moitié corrigée.',
  'Ton futur toi te remerciera pour cette séance.',
  'Rien de grand ne se fait sans quelques soirées de travail. Courage.',
  'Écris ce que tu retiens sans regarder : c’est là que tu apprends.',
  'Garde le cap : un partiel est une étape, pas un jugement.',
  'Un cœur qui bat, un cerveau qui apprend : bonne séance.',
  'Transforme « je dois réviser » en « je commence par celui-ci ».',
  'Tu n’es pas en retard, tu es en chemin.',
  'La répétition espacée est ton alliée : fais confiance au rythme.',
];

export const QUESTIONS_DU_JOUR_PAR_DEFAUT = 5;

function jourDeLAnnee(date: Date): number {
  const debut = Date.UTC(date.getFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - debut) / 86_400_000);
}

/** Même phrase toute la journée, différente chaque jour. */
export function motDuJour(date: Date): string {
  return MOTS_DU_JOUR[(jourDeLAnnee(date) + date.getFullYear()) % MOTS_DU_JOUR.length]!;
}

export function salutation(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Bonne nuit, courage';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
