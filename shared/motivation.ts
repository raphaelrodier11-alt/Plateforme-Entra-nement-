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

// ---------------------------------------------------------------------------
// Message d'accueil : un titre enthousiaste et une phrase qui change chaque jour
// ---------------------------------------------------------------------------

export const PRENOM_PAR_DEFAUT = 'Raphaël';

function graine(texte: string): number {
  let h = 2166136261;
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const cle = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const TITRES = [
  "Salut {p}, aujourd'hui on va bien travailler !",
  "Salut {p} ! Aujourd'hui, on donne tout !",
  "Hello {p} ! Prêt à faire des étincelles ?",
  'Salut {p} ! On attaque, et on le fait bien.',
  "Salut {p}, c'est parti pour une belle journée de révision !",
  'Yo {p} ! Une journée, un grand pas de plus.',
  "Salut {p} ! Aujourd'hui, on transforme le travail en réussite.",
  'Coucou {p} ! Ton cerveau est prêt, le mien aussi.',
  'Salut {p}, on est une équipe, et ça va chauffer !',
  "Hello {p} ! Aujourd'hui, on avance à fond.",
];

const TITRES_JOUR: Record<number, string[]> = {
  1: ['Salut {p}, nouvelle semaine, nouvelles victoires !', 'Lundi, {p} ! On démarre fort la semaine !'],
  5: ['Salut {p}, on termine la semaine en beauté !', 'Vendredi, {p} ! Un dernier coup de collier !'],
  6: ['Salut {p}, le week-end des champions !', 'Samedi, {p} : une bonne séance et du repos mérité !'],
  0: ['Salut {p}, un dimanche malin : une séance, puis détente !', 'Dimanche, {p} ! Prépare la semaine, tu seras serein.'],
};

const ELANS = [
  'Chaque page relue est une question de plus que tu sauras.',
  'Ton futur patient compte sur le médecin que tu deviens aujourd’hui.',
  'La motivation donne envie de commencer, la régularité fait réussir.',
  'Les grands médecins ont tous été des étudiants fatigués qui ont continué.',
  'Tu construis quelque chose de grand, une séance à la fois.',
  'Un partiel se gagne en amont, séance après séance, comme celle-ci.',
  'Ton cerveau adore la répétition : offre-lui son entraînement du jour.',
  'La confiance se fabrique avec des révisions, pas avec de la chance.',
  'Chaque erreur corrigée aujourd’hui est un point gagné le jour J.',
  'Tu es plus capable que tu ne le crois, et les chiffres le prouvent.',
  'Les petits efforts répétés écrasent les grands efforts occasionnels.',
  'Aujourd’hui n’a pas besoin d’être parfait, juste d’être utile.',
  'Le plus dur est de s’asseoir ; après, tout s’enchaîne.',
  'Ton avenir en blouse blanche se prépare dès maintenant.',
  'Un schéma compris aujourd’hui, c’est des points assurés demain.',
  'La fatigue passe, le diplôme reste.',
  'Tu avances même les jours où tu as l’impression de patiner.',
  'Les réflexes cliniques naissent des révisions répétées.',
  'Chaque QCM est un entraînement, pas un jugement.',
  'Tu n’as pas à tout savoir, tu as à progresser : c’est exactement ce que tu fais.',
  'La médecine, c’est un marathon : on le gagne au rythme, pas au sprint.',
  'Ce que tu apprends ce soir, tu le retrouveras à la garde.',
  'Une bonne séance vaut mieux que dix intentions.',
  'Ton niveau d’hier est déjà dépassé, c’est le principe de la progression.',
];

const ACTIONS = [
  'Commence par dix minutes, tu verras la suite.',
  'Attaque le chapitre qui te fait le plus peur : le reste paraîtra facile.',
  'Fais un QCM pour t’échauffer.',
  'Refais tes erreurs du jour : c’est le meilleur investissement.',
  'Relis une fiche, puis ferme-la et récite-la de mémoire.',
  'Pose une question au Dr Rodier sur ce qui te bloque.',
  'Teste-toi à l’oral : explique un chapitre à voix haute.',
  'Choisis une seule notion et comprends-la vraiment.',
  'Fais une pause toutes les 45 minutes, ton cerveau te dira merci.',
  'Termine par une carte mentale pour ancrer le tout.',
  'Surligne ce qui compte, et ignore le reste pour aujourd’hui.',
  'Lance l’interro orale et vois où tu en es.',
  'Un chapitre, un QCM, une carte mentale : voilà ta séance idéale.',
  'Note ce que tu ne sais pas encore : c’est ta liste de victoires à venir.',
  'Commence par le plus utile, pas par le plus agréable.',
  'Prends un grand verre d’eau et lance-toi.',
  'Remets à zéro ton téléphone et profite de quarante minutes de calme.',
  'Rattrape un chapitre en retard, un seul, et c’est gagné.',
  'Refais une annale, tu verras ce qui revient souvent.',
  'Prépare ta séance de demain avant de dormir.',
  'Relis tes pièges classiques, ils tombent plus souvent qu’on ne le croit.',
  'Un petit défi : zéro faute sur ta prochaine série !',
  'Teste les flashcards, elles s’enchaînent vite.',
  'Demande une fiche sur le sujet qui t’agace, je te la prépare.',
];

export interface ContexteAccroche {
  prenom?: string;
  /** Jours avant le prochain partiel et sa matière, s'il y en a un proche. */
  examen?: { jours: number; matiere: string };
  serie?: number;
  erreursDues?: number;
}

export interface Accroche {
  titre: string;
  phrase: string;
}

/** Titre et phrase du jour : différents chaque jour, adaptés à ta situation quand il y a lieu. */
export function accroche(date: Date, contexte: ContexteAccroche = {}): Accroche {
  const prenom = contexte.prenom?.trim() || PRENOM_PAR_DEFAUT;
  const g = graine(cle(date));
  const soir = date.getHours() >= 19;
  const parJour = TITRES_JOUR[date.getDay()];
  const titres = soir ? ['Bonsoir {p} ! Une belle séance avant de souffler ?', 'Bonsoir {p}, on termine la journée en force !'] : parJour && g % 3 === 0 ? parJour : TITRES;
  // Espace insécable avant « ! » et « ? » : la ponctuation ne tombe jamais seule à la ligne.
  const titre = titres[g % titres.length]!.replace('{p}', prenom).replace(/ ([!?])/g, '\u00a0$1');

  let phrase: string | undefined;
  if (contexte.examen && contexte.examen.jours <= 3) {
    const { jours, matiere } = contexte.examen;
    phrase = jours === 0 ? `C’est le jour J pour ${matiere} : tu es prêt, respire et fais confiance à ton travail.` : `Plus que ${jours} jour${jours > 1 ? 's' : ''} avant ${matiere} : chaque séance compte, et tu as déjà beaucoup fait.`;
  } else if (contexte.serie && [3, 5, 7, 10, 14, 21, 30, 50, 100].includes(contexte.serie)) {
    phrase = `${contexte.serie} jours de suite : tu es en feu ! Ne casse pas la série aujourd’hui.`;
  } else if (contexte.erreursDues && contexte.erreursDues >= 5 && g % 2 === 0) {
    phrase = `Tu as ${contexte.erreursDues} erreurs à transformer en points : une petite révision et c’est réglé.`;
  }
  // Sinon : un élan + une action, choisis dans deux listes (576 combinaisons) ; la phrase change chaque jour.
  phrase ??= `${ELANS[(g >>> 3) % ELANS.length]!} ${ACTIONS[(g >>> 11) % ACTIONS.length]!}`;
  return { titre, phrase };
}
