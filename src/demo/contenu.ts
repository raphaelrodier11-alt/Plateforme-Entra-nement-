/**
 * Contenu de démonstration : trois matières, six chapitres.
 *
 * Il sert à découvrir l'application avant l'import du drive. Tous les
 * identifiants commencent par « demo- », ce qui permet de tout retirer.
 */
import type {
  CasClinique,
  Chapitre,
  Fiche,
  Flashcard,
  Matiere,
  Partiel,
  Proposition,
  Question,
  Scene3D,
} from '../../shared/types';

const M = { cardio: 'demo-cardio', nephro: 'demo-nephro', pneumo: 'demo-pneumo' };
const C = {
  ic: 'demo-ic',
  ecg: 'demo-ecg',
  ira: 'demo-ira',
  ab: 'demo-acido-basique',
  asthme: 'demo-asthme',
  ep: 'demo-ep',
};
const P = {
  cardio23: 'demo-p-cardio-2023',
  cardio24: 'demo-p-cardio-2024',
  nephro23: 'demo-p-nephro-2023',
  nephro24: 'demo-p-nephro-2024',
  pneumo23: 'demo-p-pneumo-2023',
  pneumo24: 'demo-p-pneumo-2024',
};

export const MATIERES: Matiere[] = [
  { id: M.cardio, nom: 'Appareil cardiovasculaire', ordre: 1, demo: true, formatPartiel: { nbQuestions: 8, minutesParQuestion: 1.5 } },
  { id: M.nephro, nom: 'Rein et voies urinaires', ordre: 2, demo: true, formatPartiel: { nbQuestions: 8, minutesParQuestion: 1.5 } },
  { id: M.pneumo, nom: 'Appareil respiratoire', ordre: 3, demo: true, formatPartiel: { nbQuestions: 8, minutesParQuestion: 1.5 } },
];

const chapitre = (id: string, matiereId: string, ordre: number, titre: string, resume: string): Chapitre => ({
  id,
  matiereId,
  ordre,
  titre,
  resume,
  fichierIds: [],
  version: 1,
  demo: true,
});

export const CHAPITRES: Chapitre[] = [
  chapitre(C.ic, M.cardio, 1, 'Insuffisance cardiaque', 'Signes gauches et droits, classification NYHA, traitements qui réduisent la mortalité.'),
  chapitre(C.ecg, M.cardio, 2, 'Électrocardiogramme : les bases', 'Lecture systématique, intervalles normaux, troubles de conduction et territoires.'),
  chapitre(C.ira, M.nephro, 1, 'Insuffisance rénale aiguë', 'Trois mécanismes, démarche diagnostique, urgences vitales.'),
  { ...chapitre(C.ab, M.nephro, 2, 'Équilibre acido-basique', 'Lecture des gaz du sang, trou anionique, grandes causes.'), nouveau: true },
  { ...chapitre(C.asthme, M.pneumo, 1, 'Asthme', 'Diagnostic, traitement de fond, signes de gravité.'), majEnAttente: true, fichierIds: ['demo-fichier-asthme'] },
  chapitre(C.ep, M.pneumo, 2, 'Embolie pulmonaire', 'Probabilité clinique, D-dimères, angioscanner, traitement.'),
];

export const PARTIELS: Partiel[] = [
  { id: P.cardio23, matiereId: M.cardio, libelle: 'Partiel janvier 2023', date: '2023-01', demo: true },
  { id: P.cardio24, matiereId: M.cardio, libelle: 'Partiel janvier 2024', date: '2024-01', demo: true },
  { id: P.nephro23, matiereId: M.nephro, libelle: 'Partiel mai 2023', date: '2023-05', demo: true },
  { id: P.nephro24, matiereId: M.nephro, libelle: 'Partiel mai 2024', date: '2024-05', demo: true },
  { id: P.pneumo23, matiereId: M.pneumo, libelle: 'Partiel mai 2023', date: '2023-05', demo: true },
  { id: P.pneumo24, matiereId: M.pneumo, libelle: 'Partiel mai 2024', date: '2024-05', demo: true },
];

export const CAS: CasClinique[] = [
  {
    id: 'demo-cas-oap',
    matiereId: M.cardio,
    chapitreId: C.ic,
    titre: 'Dyspnée nocturne brutale',
    vignette:
      "Un homme de 72 ans, hypertendu, est réveillé à 3 h par une dyspnée brutale. Il est assis au bord du lit, en sueurs. Pression artérielle 185/100 mmHg, fréquence cardiaque 110/min, SpO2 86 % en air ambiant. L'auscultation retrouve des crépitants bilatéraux remontant jusqu'à mi-champs.",
    demo: true,
  },
  {
    id: 'demo-cas-ira',
    matiereId: M.nephro,
    chapitreId: C.ira,
    titre: 'Créatinine en hausse après une gastro-entérite',
    vignette:
      "Une femme de 81 ans, traitée par un inhibiteur de l'enzyme de conversion et un diurétique thiazidique, présente une gastro-entérite depuis 4 jours. Pression artérielle 95/60 mmHg, pli cutané. Créatininémie 210 µmol/L (80 µmol/L un mois plus tôt). Sodium urinaire 12 mmol/L. L'échographie montre des reins de taille normale, sans dilatation des cavités pyélocalicielles.",
    demo: true,
  },
];

const props = (liste: [string, boolean, string?][]): Proposition[] =>
  liste.map(([texte, correcte, explication], i) => ({
    id: String.fromCharCode(65 + i),
    texte,
    correcte,
    ...(explication ? { explication } : {}),
  }));

type Base = Pick<Question, 'id' | 'matiereId' | 'chapitreId' | 'explication'> & Partial<Question>;

const question = (q: Base & Pick<Question, 'type' | 'enonce'>): Question => ({
  difficulte: 2,
  source: 'genere',
  version: 1,
  demo: true,
  ...q,
});

const annale = (partiels: string[], numero: string) => ({
  source: 'annale' as const,
  corrige: 'officiel' as const,
  occurrences: partiels.map((partielId) => ({ partielId, numero })),
});

export const QUESTIONS: Question[] = [
  // --- Insuffisance cardiaque -------------------------------------------
  question({
    id: 'demo-ic-1',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'multiple',
    ...annale([P.cardio23, P.cardio24], '7'),
    enonce: "Parmi les signes suivants, lesquels sont des signes d'insuffisance cardiaque gauche ?",
    propositions: props([
      ['Orthopnée', true],
      ['Turgescence jugulaire', false, "Signe d'insuffisance cardiaque droite."],
      ['Crépitants pulmonaires', true],
      ['Reflux hépato-jugulaire', false, "Signe d'insuffisance cardiaque droite."],
      ['Dyspnée paroxystique nocturne', true],
    ]),
    explication:
      "L'insuffisance cardiaque gauche entraîne une congestion en amont du cœur gauche, donc dans les poumons : dyspnée d'effort, orthopnée, dyspnée paroxystique nocturne, crépitants. La turgescence jugulaire et le reflux hépato-jugulaire traduisent une congestion veineuse systémique, donc une atteinte droite.",
    rappel:
      'Gauche = poumons (dyspnée, orthopnée, crépitants). Droite = veines systémiques (turgescence jugulaire, reflux hépato-jugulaire, hépatomégalie, œdèmes des membres inférieurs).',
    sectionFiche: 'demo-ic-signes',
    piege: true,
  }),
  question({
    id: 'demo-ic-2',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'simple',
    difficulte: 1,
    enonce:
      "Un patient est essoufflé pour des efforts minimes (toilette, habillage) mais n'a aucun symptôme au repos. Quel est son stade NYHA ?",
    propositions: props([
      ['Stade I', false],
      ['Stade II', false, 'Stade II : gêne pour les efforts importants de la vie courante.'],
      ['Stade III', true],
      ['Stade IV', false, 'Stade IV : symptômes présents au repos.'],
    ]),
    explication:
      'Stade III : limitation marquée, symptômes pour des efforts minimes, mais pas au repos.',
    rappel:
      'NYHA — I : aucune limitation. II : gêne aux efforts importants. III : gêne aux efforts minimes. IV : gêne au repos.',
    sectionFiche: 'demo-ic-signes',
  }),
  question({
    id: 'demo-ic-3',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'vrai_faux',
    enonce: "Concernant l'insuffisance cardiaque à fraction d'éjection réduite :",
    propositions: [
      { id: '1', texte: "Un BNP normal rend le diagnostic d'insuffisance cardiaque aiguë très peu probable.", correcte: true },
      {
        id: '2',
        texte: "Les diurétiques de l'anse réduisent la mortalité.",
        correcte: false,
        explication: "Ils soulagent les signes congestifs, sans bénéfice démontré sur la mortalité.",
      },
      {
        id: '3',
        texte: "Les bêtabloquants sont contre-indiqués dans l'insuffisance cardiaque chronique.",
        correcte: false,
        explication: 'Ils sont au contraire indiqués, introduits à distance d’une décompensation et à doses progressives.',
      },
    ],
    explication:
      "Les peptides natriurétiques ont surtout une forte valeur prédictive négative. Les diurétiques sont un traitement symptomatique. Les bêtabloquants font partie du traitement de fond qui réduit la mortalité.",
    rappel:
      "Réduisent la mortalité : IEC (ou sacubitril-valsartan), bêtabloquants, antagonistes des récepteurs minéralocorticoïdes, inhibiteurs de SGLT2. Diurétiques de l'anse : symptômes seulement.",
    sectionFiche: 'demo-ic-traitement',
    piege: true,
  }),
  question({
    id: 'demo-ic-4',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'trous',
    difficulte: 1,
    enonce:
      "L'insuffisance cardiaque à fraction d'éjection réduite est définie par une FEVG inférieure ou égale à {{1}} %.",
    trous: [{ id: '1', reponses: ['40'] }],
    explication:
      "FEVG ≤ 40 % : fraction d'éjection réduite. Entre 41 et 49 % : modérément réduite. ≥ 50 % : préservée.",
    rappel: 'FEVG ≤ 40 % réduite · 41 à 49 % modérément réduite · ≥ 50 % préservée.',
    sectionFiche: 'demo-ic-definition',
  }),
  question({
    id: 'demo-ic-5',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'simple',
    casId: 'demo-cas-oap',
    ordreCas: 1,
    enonce: 'Quel diagnostic évoquez-vous en priorité ?',
    propositions: props([
      ['Œdème aigu du poumon cardiogénique', true],
      ['Embolie pulmonaire', false],
      ["Crise d'asthme", false],
      ['Pneumopathie infectieuse', false],
    ]),
    explication:
      "Dyspnée brutale nocturne avec orthopnée, crépitants bilatéraux et poussée hypertensive chez un patient hypertendu : œdème aigu du poumon cardiogénique.",
    rappel:
      "OAP : dyspnée aiguë avec orthopnée, crépitants bilatéraux, souvent poussée hypertensive. C'est une insuffisance cardiaque gauche aiguë.",
    sectionFiche: 'demo-ic-traitement',
  }),
  question({
    id: 'demo-ic-6',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'multiple',
    casId: 'demo-cas-oap',
    ordreCas: 2,
    difficulte: 3,
    enonce: 'Quelles mesures thérapeutiques immédiates mettez-vous en place ?',
    propositions: props([
      ['Position demi-assise', true],
      ['Oxygénothérapie', true],
      ["Diurétique de l'anse par voie intraveineuse", true],
      ['Remplissage vasculaire par soluté salé', false, 'Il aggraverait la congestion pulmonaire.'],
      ['Dérivés nitrés par voie intraveineuse', true, 'Possibles ici car la pression artérielle est élevée.'],
    ]),
    explication:
      "Traitement de l'OAP : position demi-assise, oxygène, diurétique de l'anse intraveineux, dérivés nitrés si la pression artérielle le permet. Le remplissage est contre-indiqué.",
    rappel:
      "OAP : asseoir, oxygéner, diurétique de l'anse IV, dérivés nitrés si la pression artérielle systolique le permet. Jamais de remplissage.",
    sectionFiche: 'demo-ic-traitement',
  }),
  question({
    id: 'demo-ic-7',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'multiple',
    ...annale([P.cardio24], '12'),
    difficulte: 3,
    enonce:
      "Quels traitements ont démontré une réduction de la mortalité dans l'insuffisance cardiaque à fraction d'éjection réduite ?",
    propositions: props([
      ["Inhibiteurs de l'enzyme de conversion", true],
      ['Bêtabloquants', true],
      ['Furosémide', false, 'Traitement symptomatique de la congestion.'],
      ['Antagonistes des récepteurs minéralocorticoïdes', true],
      ['Inhibiteurs de SGLT2', true],
    ]),
    explication:
      "Quatre classes réduisent la mortalité : IEC (ou sacubitril-valsartan), bêtabloquants, antagonistes des récepteurs minéralocorticoïdes et inhibiteurs de SGLT2. Le furosémide n'agit que sur les symptômes.",
    rappel:
      "Réduisent la mortalité : IEC (ou sacubitril-valsartan), bêtabloquants, antagonistes des récepteurs minéralocorticoïdes, inhibiteurs de SGLT2.",
    sectionFiche: 'demo-ic-traitement',
  }),
  question({
    id: 'demo-ic-8',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'simple',
    difficulte: 1,
    reserveExamen: true,
    enonce: "Quel examen confirme le diagnostic d'insuffisance cardiaque et mesure la FEVG ?",
    propositions: props([
      ['Échocardiographie transthoracique', true],
      ['Radiographie thoracique', false],
      ['Électrocardiogramme', false],
      ['Dosage du BNP', false, 'Utile surtout pour éliminer le diagnostic.'],
    ]),
    explication: "L'échocardiographie transthoracique est l'examen clé : elle mesure la FEVG et recherche la cause.",
    rappel: "Échocardiographie : examen clé du diagnostic, mesure la FEVG et oriente vers l'étiologie.",
    sectionFiche: 'demo-ic-definition',
  }),
  question({
    id: 'demo-ic-9',
    matiereId: M.cardio,
    chapitreId: C.ic,
    type: 'vrai_faux',
    reserveExamen: true,
    enonce: "Concernant les signes d'insuffisance cardiaque droite :",
    propositions: [
      { id: '1', texte: 'Les œdèmes des membres inférieurs sont blancs, mous et prennent le godet.', correcte: true },
      { id: '2', texte: 'Le reflux hépato-jugulaire en fait partie.', correcte: true },
      { id: '3', texte: "L'orthopnée en est le signe le plus caractéristique.", correcte: false, explication: "L'orthopnée est un signe gauche." },
    ],
    explication:
      "L'insuffisance cardiaque droite donne une congestion veineuse systémique : turgescence jugulaire, reflux hépato-jugulaire, hépatomégalie douloureuse, œdèmes déclives.",
    rappel: 'Droite = veines systémiques : turgescence jugulaire, reflux hépato-jugulaire, hépatomégalie, œdèmes déclives.',
    sectionFiche: 'demo-ic-signes',
  }),

  // --- ECG --------------------------------------------------------------
  question({
    id: 'demo-ecg-1',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'simple',
    ...annale([P.cardio23], '2'),
    difficulte: 1,
    enonce: 'À la vitesse de déroulement habituelle de 25 mm/s, un petit carreau de 1 mm représente :',
    propositions: props([
      ['0,02 seconde', false],
      ['0,04 seconde', true],
      ['0,10 seconde', false],
      ['0,20 seconde', false, "C'est la durée d'un grand carreau de 5 mm."],
    ]),
    explication: 'À 25 mm/s, 1 mm = 0,04 s et un grand carreau de 5 mm = 0,20 s.',
    rappel: 'Vitesse 25 mm/s : petit carreau = 0,04 s, grand carreau = 0,20 s. Amplitude : 10 mm = 1 mV.',
    sectionFiche: 'demo-ecg-lecture',
  }),
  question({
    id: 'demo-ecg-2',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'trous',
    enonce: "L'intervalle PR normal est compris entre {{1}} et {{2}} seconde.",
    trous: [
      { id: '1', reponses: ['0,12', '0.12'] },
      { id: '2', reponses: ['0,20', '0.20', '0,2', '0.2'] },
    ],
    explication: "PR normal : 0,12 à 0,20 s. Au-delà de 0,20 s, on parle de bloc auriculo-ventriculaire du premier degré.",
    rappel: 'PR normal : 0,12 à 0,20 s. QRS normal : moins de 0,12 s.',
    sectionFiche: 'demo-ecg-lecture',
  }),
  question({
    id: 'demo-ecg-3',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'multiple',
    ...annale([P.cardio23, P.cardio24], '3'),
    enonce: 'Quels critères définissent un rythme sinusal ?',
    propositions: props([
      ['Une onde P précède chaque QRS', true],
      ['Onde P positive en D2', true],
      ['QRS obligatoirement fins', false, 'Un rythme sinusal peut coexister avec un bloc de branche.'],
      ['Intervalle PR constant', true],
      ['Fréquence obligatoirement entre 60 et 100/min', false, 'Bradycardie et tachycardie sinusales restent sinusales.'],
    ]),
    explication:
      "Le rythme est sinusal quand chaque QRS est précédé d'une onde P d'origine sinusale (positive en D2), avec un PR constant. La largeur des QRS et la fréquence n'entrent pas dans la définition.",
    rappel: 'Rythme sinusal : une onde P avant chaque QRS, P positive en D2, PR constant.',
    sectionFiche: 'demo-ecg-lecture',
    piege: true,
  }),
  question({
    id: 'demo-ecg-4',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'simple',
    enonce:
      'Un tracé montre une absence d’onde P, une ligne de base trémulante et des QRS fins irrégulièrement espacés. Quel est le diagnostic ?',
    propositions: props([
      ['Fibrillation atriale', true],
      ['Flutter atrial', false, 'Le flutter donne des ondes F régulières en dents de scie.'],
      ['Bloc auriculo-ventriculaire complet', false],
      ['Tachycardie sinusale', false],
    ]),
    explication:
      "Absence d'onde P, trémulation de la ligne de base et QRS irrégulièrement irréguliers : fibrillation atriale.",
    rappel: "Fibrillation atriale : pas d'onde P, ligne de base trémulante, QRS irréguliers.",
    sectionFiche: 'demo-ecg-troubles',
  }),
  question({
    id: 'demo-ecg-5',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'vrai_faux',
    enonce: 'Concernant les blocs auriculo-ventriculaires (BAV) :',
    propositions: [
      { id: '1', texte: 'BAV du premier degré : PR supérieur à 0,20 s, toutes les ondes P sont conduites.', correcte: true },
      { id: '2', texte: "Mobitz 1 : le PR s'allonge progressivement jusqu'à une onde P bloquée.", correcte: true },
      {
        id: '3',
        texte: 'BAV du troisième degré : ondes P et QRS restent liés par un PR fixe.',
        correcte: false,
        explication: 'La dissociation auriculo-ventriculaire est complète : aucune relation entre P et QRS.',
      },
    ],
    explication:
      "Premier degré : simple allongement du PR. Deuxième degré Mobitz 1 : allongement progressif puis P bloquée. Troisième degré : dissociation complète.",
    rappel:
      'BAV 1 : PR > 0,20 s. BAV 2 Mobitz 1 : PR qui s’allonge puis P bloquée. BAV 2 Mobitz 2 : P bloquées sans allongement. BAV 3 : dissociation complète.',
    sectionFiche: 'demo-ecg-troubles',
  }),
  question({
    id: 'demo-ecg-6',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'simple',
    enonce: 'Un sus-décalage du segment ST en D2, D3 et aVF correspond à quel territoire ?',
    propositions: props([
      ['Inférieur', true],
      ['Antérieur', false, 'Antérieur : V1 à V4.'],
      ['Latéral', false, 'Latéral : D1, aVL, V5, V6.'],
      ['Septal', false],
    ]),
    explication: 'D2, D3 et aVF explorent la paroi inférieure du ventricule gauche.',
    rappel: 'Territoires — inférieur : D2, D3, aVF. Antérieur : V1 à V4. Latéral : D1, aVL, V5, V6.',
    sectionFiche: 'demo-ecg-troubles',
  }),
  question({
    id: 'demo-ecg-7',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'simple',
    difficulte: 1,
    reserveExamen: true,
    enonce: 'Deux QRS consécutifs sont séparés par 3 grands carreaux. Quelle est la fréquence cardiaque ?',
    propositions: props([
      ['60/min', false],
      ['75/min', false],
      ['100/min', true],
      ['150/min', false],
    ]),
    explication: 'Fréquence = 300 divisé par le nombre de grands carreaux entre deux QRS : 300 / 3 = 100/min.',
    rappel: 'Fréquence cardiaque = 300 / nombre de grands carreaux entre deux QRS (300, 150, 100, 75, 60, 50).',
    sectionFiche: 'demo-ecg-lecture',
  }),
  question({
    id: 'demo-ecg-8',
    matiereId: M.cardio,
    chapitreId: C.ecg,
    type: 'multiple',
    reserveExamen: true,
    enonce: 'Quelles dérivations explorent la paroi latérale du ventricule gauche ?',
    propositions: props([
      ['D1', true],
      ['aVL', true],
      ['aVF', false, 'aVF explore la paroi inférieure.'],
      ['V5', true],
      ['V6', true],
    ]),
    explication: 'La paroi latérale est explorée par D1, aVL (latéral haut), V5 et V6 (latéral bas).',
    rappel: 'Territoires — inférieur : D2, D3, aVF. Antérieur : V1 à V4. Latéral : D1, aVL, V5, V6.',
    sectionFiche: 'demo-ecg-troubles',
  }),

  // --- Insuffisance rénale aiguë ----------------------------------------
  question({
    id: 'demo-ira-1',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'simple',
    ...annale([P.nephro23, P.nephro24], '5'),
    difficulte: 1,
    enonce:
      'Devant une insuffisance rénale aiguë, quel examen réalisez-vous en première intention pour éliminer un obstacle ?',
    propositions: props([
      ['Échographie rénale et vésicale', true],
      ['Scanner abdominal injecté', false, "L'injection de produit de contraste iodé est à éviter."],
      ['Ponction-biopsie rénale', false],
      ['Scintigraphie rénale', false],
    ]),
    explication:
      "L'échographie recherche une dilatation des cavités pyélocalicielles. Éliminer un obstacle est la première étape, car l'insuffisance rénale obstructive se traite par dérivation des urines.",
    rappel: "Première étape devant toute IRA : échographie rénale pour éliminer un obstacle (dilatation des cavités).",
    sectionFiche: 'demo-ira-demarche',
  }),
  question({
    id: 'demo-ira-2',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'multiple',
    ...annale([P.nephro24], '9'),
    difficulte: 3,
    enonce: 'Quels éléments orientent vers une insuffisance rénale aiguë fonctionnelle ?',
    propositions: props([
      ['Sodium urinaire inférieur à 20 mmol/L', true],
      ['Fraction excrétée du sodium supérieure à 2 %', false, 'Elle est inférieure à 1 % dans une IRA fonctionnelle.'],
      ['Rapport sodium/potassium urinaire inférieur à 1', true],
      ['Osmolarité urinaire élevée', true],
      ['Cylindres granuleux « brun sale »', false, 'Ils évoquent une nécrose tubulaire aiguë.'],
    ]),
    explication:
      "Dans l'IRA fonctionnelle, le rein réabsorbe sodium et eau pour restaurer la volémie : sodium urinaire bas, fraction excrétée du sodium < 1 %, rapport Na/K < 1, urines concentrées.",
    rappel:
      'IRA fonctionnelle : Na urinaire < 20 mmol/L, fraction excrétée du sodium < 1 %, Na/K urinaire < 1, urines concentrées.',
    sectionFiche: 'demo-ira-demarche',
    piege: true,
  }),
  question({
    id: 'demo-ira-3',
    matiereId: M.nephro,
    // Rangée volontairement dans le mauvais chapitre : la démonstration
    // propose de la reclasser (voir les anomalies).
    chapitreId: C.ab,
    type: 'vrai_faux',
    enonce: "Concernant l'hyperkaliémie menaçante :",
    propositions: [
      {
        id: '1',
        texte: 'Le gluconate de calcium fait baisser la kaliémie.',
        correcte: false,
        explication: 'Il protège le myocarde sans modifier la kaliémie.',
      },
      { id: '2', texte: "L'insuline associée au glucose fait entrer le potassium dans les cellules.", correcte: true },
      { id: '3', texte: 'Des ondes T amples, pointues et symétriques en sont un signe électrocardiographique précoce.', correcte: true },
    ],
    explication:
      "Le calcium intraveineux stabilise la membrane des cellules myocardiques ; il ne change pas la kaliémie. L'insuline-glucose et les bêta-2 mimétiques transfèrent le potassium vers les cellules.",
    rappel:
      "Hyperkaliémie menaçante : ECG en urgence. Calcium IV (protection du myocarde), insuline-glucose et bêta-2 mimétiques (transfert), épuration extrarénale si besoin.",
    sectionFiche: 'demo-ira-urgences',
    piege: true,
  }),
  question({
    id: 'demo-ira-4',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'trous',
    difficulte: 1,
    enonce: "La cause la plus fréquente d'insuffisance rénale aiguë organique est la nécrose {{1}} aiguë.",
    trous: [{ id: '1', reponses: ['tubulaire'] }],
    explication: "La nécrose tubulaire aiguë, ischémique ou toxique, est la première cause d'IRA organique.",
    rappel: 'IRA organique : la nécrose tubulaire aiguë (ischémique ou toxique) est de loin la plus fréquente.',
    sectionFiche: 'demo-ira-mecanismes',
  }),
  question({
    id: 'demo-ira-5',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'simple',
    casId: 'demo-cas-ira',
    ordreCas: 1,
    enonce: "Quel est le mécanisme le plus probable de cette insuffisance rénale aiguë ?",
    propositions: props([
      ['Fonctionnelle, par hypovolémie', true],
      ['Obstructive', false, "L'échographie ne montre pas de dilatation des cavités."],
      ['Nécrose tubulaire aiguë', false],
      ['Glomérulonéphrite aiguë', false],
    ]),
    explication:
      "Pertes digestives, hypotension, pli cutané et sodium urinaire bas : IRA fonctionnelle par déshydratation, favorisée par l'IEC et le diurétique.",
    rappel:
      'IRA fonctionnelle : contexte d’hypovolémie, souvent favorisée par IEC, sartans, diurétiques ou AINS. Sodium urinaire bas.',
    sectionFiche: 'demo-ira-mecanismes',
  }),
  question({
    id: 'demo-ira-6',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'multiple',
    casId: 'demo-cas-ira',
    ordreCas: 2,
    enonce: 'Quelle prise en charge proposez-vous ?',
    propositions: props([
      ["Arrêt temporaire de l'inhibiteur de l'enzyme de conversion", true],
      ['Arrêt du diurétique', true],
      ['Réhydratation par soluté salé isotonique', true],
      ['Ponction-biopsie rénale en urgence', false],
      ['Restriction hydrique', false, 'La patiente est déshydratée.'],
    ]),
    explication:
      "Le traitement est celui de la cause : restaurer la volémie et suspendre les médicaments qui altèrent l'hémodynamique rénale.",
    rappel: "IRA fonctionnelle : corriger l'hypovolémie, suspendre IEC, sartans, diurétiques et AINS.",
    sectionFiche: 'demo-ira-mecanismes',
  }),
  question({
    id: 'demo-ira-7',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'multiple',
    difficulte: 3,
    reserveExamen: true,
    enonce: "Quelles situations sont des indications d'épuration extrarénale en urgence ?",
    propositions: props([
      ['Hyperkaliémie menaçante résistante au traitement médical', true],
      ['Œdème aigu du poumon résistant aux diurétiques', true],
      ['Acidose métabolique sévère', true],
      ['Créatininémie supérieure à 200 µmol/L, quel que soit le contexte', false, 'Un chiffre isolé de créatinine ne suffit pas.'],
      ['Péricardite urémique', true],
    ]),
    explication:
      "L'épuration extrarénale s'impose devant une complication menaçante et réfractaire : hyperkaliémie, surcharge, acidose sévère, ou complication urémique.",
    rappel:
      'Dialyse en urgence : hyperkaliémie menaçante, OAP réfractaire, acidose métabolique sévère, complications urémiques (péricardite, encéphalopathie).',
    sectionFiche: 'demo-ira-urgences',
  }),
  question({
    id: 'demo-ira-8',
    matiereId: M.nephro,
    chapitreId: C.ira,
    type: 'simple',
    reserveExamen: true,
    enonce: "Selon la définition KDIGO, quelle diurèse définit une insuffisance rénale aiguë ?",
    propositions: props([
      ['Inférieure à 0,5 mL/kg/h pendant 6 heures', true],
      ['Inférieure à 1 mL/kg/h pendant 2 heures', false],
      ['Inférieure à 2 L par 24 heures', false],
      ['Nulle pendant 24 heures', false],
    ]),
    explication:
      "KDIGO : hausse de la créatininémie d'au moins 26,5 µmol/L en 48 h, ou d'au moins 1,5 fois la valeur de base en 7 jours, ou diurèse inférieure à 0,5 mL/kg/h pendant 6 h.",
    rappel:
      'IRA (KDIGO) : créatinine + 26,5 µmol/L en 48 h, ou × 1,5 en 7 jours, ou diurèse < 0,5 mL/kg/h pendant 6 h.',
    sectionFiche: 'demo-ira-mecanismes',
  }),

  // --- Équilibre acido-basique ------------------------------------------
  question({
    id: 'demo-ab-1',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'simple',
    ...annale([P.nephro23], '14'),
    enonce: 'Gaz du sang : pH 7,28 ; PaCO2 28 mmHg ; bicarbonates 13 mmol/L. Quel est le trouble ?',
    propositions: props([
      ['Acidose métabolique', true],
      ['Acidose respiratoire', false, 'La PaCO2 serait élevée.'],
      ['Alcalose métabolique', false],
      ['Alcalose respiratoire', false],
    ]),
    explication:
      'pH bas et bicarbonates bas : acidose métabolique. La PaCO2 basse traduit la compensation respiratoire par hyperventilation.',
    rappel:
      'Lecture en 3 temps : pH (acidose ou alcalose), puis bicarbonates et PaCO2 (métabolique ou respiratoire), puis compensation.',
    sectionFiche: 'demo-ab-lecture',
  }),
  question({
    id: 'demo-ab-2',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'trous',
    difficulte: 1,
    enonce: 'Le trou anionique plasmatique se calcule par la formule : Na − (Cl + {{1}}).',
    trous: [{ id: '1', reponses: ['HCO3', 'HCO3-', 'bicarbonates', 'bicarbonate'] }],
    explication: 'Trou anionique = Na − (Cl + HCO3−). Sa valeur normale est de 12 ± 4 mmol/L.',
    rappel: 'Trou anionique = Na − (Cl + HCO3−) = 12 ± 4 mmol/L.',
    sectionFiche: 'demo-ab-trou',
  }),
  question({
    id: 'demo-ab-3',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'multiple',
    ...annale([P.nephro23, P.nephro24], '15'),
    enonce: "Quelles sont des causes d'acidose métabolique à trou anionique élevé ?",
    propositions: props([
      ['Acidocétose diabétique', true],
      ['Diarrhée aiguë', false, 'Perte digestive de bicarbonates : trou anionique normal.'],
      ['Acidose lactique', true],
      ['Insuffisance rénale sévère', true],
      ['Acidose tubulaire rénale', false, 'Trou anionique normal, acidose hyperchlorémique.'],
    ]),
    explication:
      "Trou anionique élevé : accumulation d'un acide (lactate, corps cétoniques, acides de l'insuffisance rénale, toxiques). Trou anionique normal : perte de bicarbonates, digestive ou rénale.",
    rappel:
      'Trou anionique élevé : acidose lactique, acidocétose, insuffisance rénale, intoxications. Normal : diarrhée, acidoses tubulaires.',
    sectionFiche: 'demo-ab-trou',
    piege: true,
  }),
  question({
    id: 'demo-ab-4',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'vrai_faux',
    enonce: 'Concernant les troubles acido-basiques :',
    propositions: [
      { id: '1', texte: "Dans une acidose métabolique, la compensation attendue est une hyperventilation qui abaisse la PaCO2.", correcte: true },
      {
        id: '2',
        texte: 'Des vomissements abondants entraînent une acidose métabolique.',
        correcte: false,
        explication: "Ils entraînent une alcalose métabolique par perte d'ions H+ et de chlore.",
      },
      { id: '3', texte: 'Un pH à 7,30 avec une PaCO2 à 60 mmHg traduit une acidose respiratoire.', correcte: true },
    ],
    explication:
      "La compensation d'un trouble métabolique est respiratoire. Les vomissements font perdre de l'acide chlorhydrique : alcalose métabolique. Une PaCO2 élevée avec un pH bas signe une acidose respiratoire.",
    rappel:
      'Vomissements et diurétiques : alcalose métabolique. Hypoventilation alvéolaire : acidose respiratoire (PaCO2 élevée).',
    sectionFiche: 'demo-ab-lecture',
  }),
  question({
    id: 'demo-ab-5',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'simple',
    enonce: 'Natrémie 140 mmol/L, chlorémie 100 mmol/L, bicarbonates 14 mmol/L. Quel est le trou anionique ?',
    propositions: props([
      ['12 mmol/L', false],
      ['16 mmol/L', false],
      ['26 mmol/L', true],
      ['40 mmol/L', false],
    ]),
    explication: '140 − (100 + 14) = 26 mmol/L : le trou anionique est élevé.',
    rappel: 'Trou anionique = Na − (Cl + HCO3−) = 12 ± 4 mmol/L.',
    sectionFiche: 'demo-ab-trou',
  }),
  question({
    id: 'demo-ab-6',
    matiereId: M.nephro,
    chapitreId: C.ab,
    type: 'simple',
    reserveExamen: true,
    enonce: "Laquelle de ces situations est une cause classique d'alcalose métabolique ?",
    propositions: props([
      ['Traitement par diurétique de l’anse', true],
      ['Diarrhée profuse', false],
      ['Acidocétose diabétique', false],
      ['Insuffisance rénale chronique', false],
    ]),
    explication:
      "Les diurétiques de l'anse et thiazidiques, comme les vomissements, entraînent une alcalose métabolique, entretenue par l'hypovolémie et l'hypokaliémie.",
    rappel: 'Alcalose métabolique : vomissements, diurétiques ; entretenue par hypovolémie, déplétion chlorée et hypokaliémie.',
    sectionFiche: 'demo-ab-lecture',
  }),

  // --- Asthme -----------------------------------------------------------
  question({
    id: 'demo-asthme-1',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'multiple',
    ...annale([P.pneumo24], '4'),
    enonce: "Quels sont des signes de gravité d'une exacerbation d'asthme ?",
    propositions: props([
      ['Impossibilité de terminer ses phrases', true],
      ['Fréquence respiratoire supérieure à 30/min', true],
      ['Sibilants diffus', false, "Habituels dans la crise : ce n'est pas un critère de gravité."],
      ['Débit expiratoire de pointe inférieur à 50 %', true],
      ['Silence auscultatoire', true, "Signe d'alarme : l'air ne passe presque plus."],
    ]),
    explication:
      "Gravité : difficulté à parler, fréquence respiratoire > 30/min, fréquence cardiaque > 120/min, SpO2 < 90 %, débit expiratoire de pointe < 50 %. Le silence auscultatoire est un signe d'alarme.",
    rappel:
      "Asthme aigu grave : parole difficile, FR > 30, FC > 120, SpO2 < 90 %, DEP < 50 %. Alarme : silence auscultatoire, troubles de conscience, normo ou hypercapnie.",
    sectionFiche: 'demo-asthme-gravite',
    piege: true,
  }),
  question({
    id: 'demo-asthme-2',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'trous',
    enonce:
      "La réversibilité est significative si le VEMS augmente d'au moins {{1}} % et d'au moins {{2}} mL après bronchodilatateur.",
    trous: [
      { id: '1', reponses: ['12'] },
      { id: '2', reponses: ['200'] },
    ],
    explication: 'Réversibilité significative : gain de VEMS ≥ 12 % et ≥ 200 mL après bronchodilatateur.',
    rappel: 'Trouble ventilatoire obstructif : VEMS/CVF < 0,7. Réversible si VEMS + 12 % et + 200 mL.',
    sectionFiche: 'demo-asthme-diagnostic',
  }),
  question({
    id: 'demo-asthme-3',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'simple',
    ...annale([P.pneumo23, P.pneumo24], '6'),
    difficulte: 1,
    enonce: "Quel est le traitement de fond de première intention de l'asthme persistant ?",
    propositions: props([
      ['Corticoïdes inhalés', true],
      ['Bêta-2 mimétiques de longue durée d’action seuls', false, 'Jamais sans corticoïde inhalé associé.'],
      ['Corticoïdes oraux au long cours', false],
      ['Antihistaminiques', false],
    ]),
    explication:
      "Les corticoïdes inhalés traitent l'inflammation bronchique : c'est la pierre angulaire du traitement de fond.",
    rappel:
      'Traitement de fond : corticoïdes inhalés, éventuellement associés à un bêta-2 de longue durée d’action, jamais prescrit seul.',
    sectionFiche: 'demo-asthme-traitement',
  }),
  question({
    id: 'demo-asthme-4',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'vrai_faux',
    enonce: "Concernant l'asthme :",
    propositions: [
      {
        id: '1',
        texte: "Un bêta-2 mimétique de longue durée d'action peut être prescrit seul en traitement de fond.",
        correcte: false,
        explication: 'Il doit toujours être associé à un corticoïde inhalé.',
      },
      { id: '2', texte: "Une PaCO2 normale ou élevée au cours d'une crise sévère est un signe d'alarme.", correcte: true },
      { id: '3', texte: 'Le trouble ventilatoire obstructif est défini par un rapport VEMS/CVF inférieur à 0,7.', correcte: true },
    ],
    explication:
      "En crise, le patient hyperventile et sa PaCO2 est basse : une PaCO2 normale ou élevée signe l'épuisement.",
    rappel: "En crise, la PaCO2 attendue est basse. Normale ou élevée : épuisement respiratoire, signe d'alarme.",
    sectionFiche: 'demo-asthme-gravite',
    piege: true,
  }),
  question({
    id: 'demo-asthme-5',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'simple',
    difficulte: 1,
    enonce: "Quel est le traitement de première intention d'une crise d'asthme ?",
    propositions: props([
      ['Bêta-2 mimétique de courte durée d’action inhalé', true],
      ['Corticoïde inhalé à forte dose', false],
      ['Antibiotique', false],
      ['Théophylline', false],
    ]),
    explication:
      "Les bêta-2 mimétiques de courte durée d'action inhalés, répétés si besoin, sont le traitement de la crise. Une corticothérapie systémique s'y ajoute dans les exacerbations.",
    rappel:
      "Crise : bêta-2 de courte durée d'action inhalés, répétés. Exacerbation : ajouter une corticothérapie systémique et de l'oxygène si besoin.",
    sectionFiche: 'demo-asthme-traitement',
  }),
  question({
    id: 'demo-asthme-6',
    matiereId: M.pneumo,
    chapitreId: C.asthme,
    type: 'multiple',
    reserveExamen: true,
    enonce: "Quels symptômes évoquent un asthme ?",
    propositions: props([
      ['Dyspnée sifflante', true],
      ['Toux nocturne', true],
      ['Oppression thoracique', true],
      ['Symptômes variables dans le temps et réversibles', true],
      ['Hémoptysie', false, "Elle doit faire rechercher une autre cause."],
    ]),
    explication:
      "L'asthme associe des symptômes respiratoires variables et réversibles : sifflements, dyspnée, toux, oppression thoracique, volontiers nocturnes.",
    rappel: 'Asthme : symptômes variables et réversibles (sifflements, dyspnée, toux, oppression), surtout la nuit.',
    sectionFiche: 'demo-asthme-diagnostic',
  }),

  // --- Embolie pulmonaire ------------------------------------------------
  question({
    id: 'demo-ep-1',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'simple',
    ...annale([P.pneumo24], '10'),
    enonce:
      "Chez un patient stable dont la probabilité clinique d'embolie pulmonaire est faible, quel examen demandez-vous en première intention ?",
    propositions: props([
      ['Dosage des D-dimères', true],
      ['Angioscanner thoracique', false, "Réservé aux D-dimères positifs ou à une probabilité forte."],
      ['Scintigraphie pulmonaire', false],
      ['Échographie cardiaque', false],
    ]),
    explication:
      "Probabilité faible ou intermédiaire : D-dimères. Négatifs, ils éliminent l'embolie pulmonaire ; positifs, ils conduisent à l'angioscanner.",
    rappel:
      'Probabilité faible ou intermédiaire : D-dimères, puis angioscanner si positifs. Probabilité forte : angioscanner d’emblée.',
    sectionFiche: 'demo-ep-demarche',
  }),
  question({
    id: 'demo-ep-2',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'vrai_faux',
    enonce: "Concernant le diagnostic d'embolie pulmonaire :",
    propositions: [
      { id: '1', texte: "Des D-dimères négatifs éliminent l'embolie pulmonaire si la probabilité clinique est faible ou intermédiaire.", correcte: true },
      {
        id: '2',
        texte: 'Devant une probabilité clinique forte, on commence par doser les D-dimères.',
        correcte: false,
        explication: "On réalise l'angioscanner d'emblée.",
      },
      { id: '3', texte: "L'anomalie électrocardiographique la plus fréquente est la tachycardie sinusale.", correcte: true },
    ],
    explication:
      "Les D-dimères ont une forte valeur prédictive négative mais ne s'utilisent pas quand la probabilité clinique est forte.",
    rappel: 'D-dimères : utiles pour éliminer, jamais en cas de probabilité clinique forte.',
    sectionFiche: 'demo-ep-demarche',
    piege: true,
  }),
  question({
    id: 'demo-ep-3',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'multiple',
    ...annale([P.pneumo23, P.pneumo24], '11'),
    difficulte: 1,
    enonce: 'Quels sont des facteurs de risque de maladie thrombo-embolique veineuse ?',
    propositions: props([
      ['Chirurgie orthopédique récente', true],
      ['Cancer évolutif', true],
      ['Contraception œstroprogestative', true],
      ['Hypertension artérielle', false],
      ['Immobilisation prolongée', true],
    ]),
    explication:
      "Les facteurs de risque relèvent de la stase, de la lésion de la paroi veineuse et de l'hypercoagulabilité : chirurgie, immobilisation, cancer, œstrogènes, grossesse, antécédent thrombo-embolique.",
    rappel:
      'Facteurs de risque : chirurgie, immobilisation, cancer, œstrogènes, grossesse et post-partum, antécédent de thrombose, thrombophilie.',
    sectionFiche: 'demo-ep-facteurs',
  }),
  question({
    id: 'demo-ep-4',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'trous',
    enonce: "Après 50 ans, le seuil des D-dimères est ajusté à l'âge : âge × {{1}} µg/L.",
    trous: [{ id: '1', reponses: ['10'] }],
    explication: "Après 50 ans, le seuil devient âge × 10 µg/L, ce qui évite des angioscanners inutiles.",
    rappel: 'D-dimères : seuil de 500 µg/L, ajusté à âge × 10 µg/L après 50 ans.',
    sectionFiche: 'demo-ep-demarche',
  }),
  question({
    id: 'demo-ep-5',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'simple',
    enonce: "Quel élément définit une embolie pulmonaire à haut risque ?",
    propositions: props([
      ['État de choc ou hypotension artérielle persistante', true],
      ['Douleur thoracique', false],
      ['Tachycardie isolée', false],
      ['D-dimères très élevés', false],
    ]),
    explication:
      "L'embolie pulmonaire est à haut risque en cas de choc ou d'hypotension persistante : elle relève de la thrombolyse.",
    rappel: 'Haut risque : choc ou hypotension (pression artérielle systolique < 90 mmHg) → thrombolyse.',
    sectionFiche: 'demo-ep-traitement',
  }),
  question({
    id: 'demo-ep-6',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'simple',
    difficulte: 1,
    reserveExamen: true,
    enonce: "Quelle est la durée minimale du traitement anticoagulant d'une embolie pulmonaire ?",
    propositions: props([
      ['10 jours', false],
      ['6 semaines', false],
      ['3 mois', true],
      ['12 mois', false],
    ]),
    explication: "Le traitement anticoagulant dure au moins 3 mois ; il est prolongé selon le contexte.",
    rappel: 'Anticoagulation curative : au moins 3 mois, prolongée selon le caractère provoqué ou non.',
    sectionFiche: 'demo-ep-traitement',
  }),
  question({
    id: 'demo-ep-7',
    matiereId: M.pneumo,
    chapitreId: C.ep,
    type: 'simple',
    reserveExamen: true,
    enonce: "Quel examen confirme le diagnostic d'embolie pulmonaire en première intention ?",
    propositions: props([
      ['Angioscanner thoracique', true],
      ['Radiographie thoracique', false],
      ['Gaz du sang', false],
      ['Électrocardiogramme', false],
    ]),
    explication:
      "L'angioscanner thoracique visualise le thrombus dans les artères pulmonaires. La scintigraphie est une alternative en cas de contre-indication.",
    rappel: "Confirmation : angioscanner thoracique ; scintigraphie de ventilation-perfusion en cas de contre-indication.",
    sectionFiche: 'demo-ep-demarche',
  }),
];

const SCENE_CIRCULATION: Scene3D = {
  titre: 'Circulation du sang et congestion',
  description: 'Deux pompes en série : la congestion apparaît toujours en amont de la pompe défaillante.',
  objets: [
    { id: 'droit', forme: 'sphere', position: [-0.85, 0, 0], taille: [0.75], couleur: '#3987e5', label: 'Cœur droit', detail: 'Reçoit le sang veineux et l’envoie vers les poumons.' },
    { id: 'gauche', forme: 'sphere', position: [0.85, 0, 0], taille: [0.85], couleur: '#d95926', label: 'Cœur gauche', detail: "Reçoit le sang oxygéné et l'envoie dans tout l'organisme." },
    { id: 'poumons', forme: 'boite', position: [0, 2.6, 0], taille: [3.2, 0.9, 1.2], couleur: '#86b6ef', opacite: 0.55, label: 'Poumons', detail: "Lieu des échanges gazeux ; en amont du cœur gauche." },
    { id: 'organes', forme: 'boite', position: [0, -2.6, 0], taille: [3.2, 0.9, 1.2], couleur: '#c98500', opacite: 0.55, label: 'Organes et membres', detail: 'En amont du cœur droit, par les veines caves.' },
    { id: 'ap', forme: 'tube', chemin: [[-0.85, 0.7, 0], [-1.7, 1.5, 0], [-1.1, 2.3, 0]], taille: [0.11], couleur: '#3987e5', label: 'Artère pulmonaire' },
    { id: 'vp', forme: 'tube', chemin: [[1.1, 2.3, 0], [1.8, 1.5, 0], [0.85, 0.8, 0]], taille: [0.11], couleur: '#d95926', label: 'Veines pulmonaires' },
    { id: 'aorte', forme: 'tube', chemin: [[0.85, -0.8, 0], [1.8, -1.5, 0], [1.1, -2.3, 0]], taille: [0.13], couleur: '#d95926', label: 'Aorte' },
    { id: 'caves', forme: 'tube', chemin: [[-1.1, -2.3, 0], [-1.7, -1.5, 0], [-0.85, -0.7, 0]], taille: [0.13], couleur: '#3987e5', label: 'Veines caves' },
  ],
  etapes: [
    { titre: 'Deux pompes en série', texte: 'Le cœur droit et le cœur gauche travaillent l’un derrière l’autre.', focus: ['droit', 'gauche'] },
    {
      titre: 'Petite circulation',
      texte: "Le cœur droit envoie le sang vers les poumons ; il revient oxygéné au cœur gauche.",
      focus: ['droit', 'ap', 'poumons', 'vp', 'gauche'],
      flux: [{ tube: 'ap', couleur: '#86b6ef' }, { tube: 'vp', couleur: '#ffb38f' }],
      camera: [0, 3.5, 7],
    },
    {
      titre: 'Grande circulation',
      texte: "Le cœur gauche éjecte le sang dans l'aorte ; il revient au cœur droit par les veines caves.",
      focus: ['gauche', 'aorte', 'organes', 'caves', 'droit'],
      flux: [{ tube: 'aorte', couleur: '#ffb38f' }, { tube: 'caves', couleur: '#86b6ef' }],
      camera: [0, -2.5, 7.5],
    },
    {
      titre: 'Insuffisance cardiaque gauche',
      texte: 'Le sang stagne en amont du cœur gauche : congestion pulmonaire, donc dyspnée, orthopnée et crépitants.',
      focus: ['gauche', 'vp', 'poumons'],
      flux: [{ tube: 'vp', couleur: '#ffb38f' }],
      camera: [2.5, 3, 6.5],
    },
    {
      titre: 'Insuffisance cardiaque droite',
      texte: 'Le sang stagne en amont du cœur droit : turgescence jugulaire, hépatomégalie, œdèmes des membres inférieurs.',
      focus: ['droit', 'caves', 'organes'],
      flux: [{ tube: 'caves', couleur: '#86b6ef' }],
      camera: [-2.5, -2.5, 6.5],
    },
  ],
};

const SCENE_NEPHRON: Scene3D = {
  titre: "Les trois mécanismes d'insuffisance rénale aiguë",
  description: "Avant le rein, dans le rein, après le rein : l'endroit de l'atteinte donne le mécanisme.",
  objets: [
    { id: 'arteriole', forme: 'tube', chemin: [[-3.4, 1.6, 0], [-2.6, 1.9, 0], [-1.9, 1.5, 0]], taille: [0.12], couleur: '#d95926', label: 'Artériole afférente', detail: 'Apporte le sang au glomérule : sa perfusion conditionne la filtration.' },
    { id: 'glomerule', forme: 'sphere', position: [-1.5, 1.2, 0], taille: [0.55], couleur: '#e66767', label: 'Glomérule', detail: 'Filtre le plasma.' },
    { id: 'tubule', forme: 'tube', chemin: [[-1.0, 1.0, 0], [-0.3, 1.4, 0.3], [0.2, 0.6, 0], [0.2, -1.6, 0], [0.9, -1.6, 0], [0.9, 0.6, 0], [1.5, 1.2, 0.2], [2.1, 0.9, 0]], taille: [0.14], couleur: '#c98500', label: 'Tubule', detail: "Réabsorbe l'eau et le sodium ; siège de la nécrose tubulaire aiguë." },
    { id: 'collecteur', forme: 'tube', chemin: [[2.1, 0.9, 0], [2.5, 0, 0], [2.5, -1.8, 0]], taille: [0.17], couleur: '#199e70', label: 'Canal collecteur' },
    { id: 'uretere', forme: 'tube', chemin: [[2.5, -1.8, 0], [2.6, -2.6, 0], [3.2, -3.1, 0]], taille: [0.2], couleur: '#9085e9', label: 'Voies excrétrices', detail: "Uretère, vessie, urètre : un obstacle ici donne une IRA obstructive." },
  ],
  etapes: [
    { titre: 'Le néphron', texte: "Le sang est filtré par le glomérule, puis l'urine primitive est modifiée le long du tubule.", flux: [{ tube: 'tubule', couleur: '#ffe08a' }] },
    {
      titre: 'IRA fonctionnelle (avant le rein)',
      texte: 'La perfusion rénale chute (hypovolémie, IEC, AINS). Le rein est intact : le sodium urinaire est bas.',
      focus: ['arteriole', 'glomerule'],
      flux: [{ tube: 'arteriole', couleur: '#ffb38f' }],
      camera: [-3, 2, 6],
    },
    {
      titre: 'IRA organique (dans le rein)',
      texte: 'Le parenchyme est lésé. Cause la plus fréquente : la nécrose tubulaire aiguë, ischémique ou toxique.',
      focus: ['tubule', 'glomerule'],
      camera: [0, 0, 7],
    },
    {
      titre: 'IRA obstructive (après le rein)',
      texte: "Un obstacle sur les voies excrétrices dilate les cavités : c'est ce que recherche l'échographie.",
      focus: ['collecteur', 'uretere'],
      flux: [{ tube: 'collecteur', couleur: '#ffe08a' }],
      camera: [3.5, -2, 6],
    },
  ],
};

const fiche = (chapitreId: string, matiereId: string, titre: string, sections: Fiche['sections']): Fiche => ({
  id: chapitreId,
  chapitreId,
  matiereId,
  titre,
  sections,
  version: 1,
  genereLe: 0,
  demo: true,
});

export const FICHES: Fiche[] = [
  fiche(C.ic, M.cardio, 'Insuffisance cardiaque', [
    {
      id: 'demo-ic-definition',
      titre: 'Définition',
      blocs: [
        { type: 'texte', contenu: "Le cœur n'assure plus un débit adapté aux besoins de l'organisme, ou n'y parvient qu'au prix de pressions de remplissage élevées." },
        { type: 'liste', titre: "Selon la fraction d'éjection du ventricule gauche", elements: ['≤ 40 % : réduite', '41 à 49 % : modérément réduite', '≥ 50 % : préservée'] },
        { type: 'cles', elements: ["L'échocardiographie transthoracique confirme le diagnostic et mesure la FEVG.", 'Un BNP normal rend le diagnostic très peu probable.'] },
      ],
    },
    {
      id: 'demo-ic-signes',
      titre: 'Signes cliniques',
      blocs: [
        { type: 'scene3d', scene: SCENE_CIRCULATION },
        { type: 'liste', titre: 'Signes gauches (poumons)', elements: ["Dyspnée d'effort, orthopnée", 'Dyspnée paroxystique nocturne', 'Crépitants pulmonaires'] },
        { type: 'liste', titre: 'Signes droits (veines systémiques)', elements: ['Turgescence jugulaire, reflux hépato-jugulaire', 'Hépatomégalie douloureuse', 'Œdèmes des membres inférieurs'] },
        {
          type: 'etapes',
          titre: 'Classification NYHA',
          etapes: [
            { titre: 'Stade I', detail: 'Aucune limitation de l’activité physique.' },
            { titre: 'Stade II', detail: 'Gêne pour les efforts importants de la vie courante.' },
            { titre: 'Stade III', detail: 'Gêne pour des efforts minimes ; pas de symptôme au repos.' },
            { titre: 'Stade IV', detail: 'Symptômes présents au repos.' },
          ],
        },
        { type: 'pieges', elements: ['Turgescence jugulaire et reflux hépato-jugulaire sont des signes droits, pas gauches.'] },
      ],
    },
    {
      id: 'demo-ic-traitement',
      titre: 'Traitement',
      blocs: [
        {
          type: 'schema',
          titre: "Traitement de fond de l'insuffisance cardiaque à FEVG réduite",
          noeuds: [
            { id: 'ic', label: 'FEVG ≤ 40 %', detail: 'Quatre classes réduisent la mortalité ; elles sont associées.' },
            { id: 'iec', label: 'IEC ou sacubitril-valsartan', detail: 'Bloquent le système rénine-angiotensine.' },
            { id: 'bb', label: 'Bêtabloquant', detail: 'Introduit à distance d’une décompensation, à doses progressives.' },
            { id: 'arm', label: 'Antialdostérone', detail: 'Antagoniste des récepteurs minéralocorticoïdes ; surveiller la kaliémie.' },
            { id: 'sglt2', label: 'Inhibiteur de SGLT2', detail: 'Dapagliflozine ou empagliflozine.' },
            { id: 'diu', label: "Diurétique de l'anse", detail: 'Si signes congestifs : soulage les symptômes, sans effet démontré sur la mortalité.' },
          ],
          liens: [
            { de: 'ic', vers: 'iec' },
            { de: 'ic', vers: 'bb' },
            { de: 'ic', vers: 'arm' },
            { de: 'ic', vers: 'sglt2' },
            { de: 'ic', vers: 'diu', label: 'si congestion' },
          ],
        },
        {
          type: 'arbre',
          titre: 'Dyspnée aiguë avec crépitants',
          racine: {
            label: 'Œdème aigu du poumon suspecté',
            detail: 'Asseoir le patient, oxygène, voie veineuse, électrocardiogramme.',
            branches: [
              {
                condition: 'Pression artérielle systolique ≥ 110 mmHg',
                noeud: { label: "Diurétique de l'anse IV et dérivés nitrés IV", detail: 'Les dérivés nitrés diminuent la précharge et la postcharge.' },
              },
              {
                condition: 'Pression artérielle systolique < 90 mmHg',
                noeud: { label: 'Choc cardiogénique : pas de dérivés nitrés', detail: 'Avis réanimation, inotropes à discuter.' },
              },
            ],
          },
        },
        { type: 'pieges', elements: ["Le furosémide soulage, il ne réduit pas la mortalité.", "Pas de remplissage vasculaire dans l'œdème aigu du poumon."] },
      ],
    },
  ]),
  fiche(C.ecg, M.cardio, 'Électrocardiogramme : les bases', [
    {
      id: 'demo-ecg-lecture',
      titre: 'Lecture systématique',
      blocs: [
        {
          type: 'etapes',
          titre: 'Toujours dans le même ordre',
          etapes: [
            { titre: 'Fréquence', detail: '300 divisé par le nombre de grands carreaux entre deux QRS.' },
            { titre: 'Rythme', detail: 'Sinusal si une onde P précède chaque QRS, P positive en D2, PR constant.' },
            { titre: 'Conduction', detail: 'PR entre 0,12 et 0,20 s ; QRS inférieur à 0,12 s.' },
            { titre: 'Repolarisation', detail: 'Segment ST et onde T, territoire par territoire.' },
          ],
        },
        { type: 'cles', elements: ['25 mm/s : petit carreau = 0,04 s, grand carreau = 0,20 s.', '10 mm = 1 mV.'] },
        { type: 'mnemo', phrase: '300 – 150 – 100 – 75 – 60 – 50', signification: ['Fréquence selon le nombre de grands carreaux entre deux QRS : 1, 2, 3, 4, 5, 6.'] },
      ],
    },
    {
      id: 'demo-ecg-troubles',
      titre: 'Troubles à reconnaître',
      blocs: [
        {
          type: 'arbre',
          titre: 'Bloc auriculo-ventriculaire',
          racine: {
            label: 'Toutes les ondes P sont-elles suivies d’un QRS ?',
            branches: [
              { condition: 'Oui, mais PR > 0,20 s', noeud: { label: 'BAV du premier degré' } },
              {
                condition: 'Non, certaines P sont bloquées',
                noeud: {
                  label: "Le PR s'allonge-t-il avant la P bloquée ?",
                  branches: [
                    { condition: 'Oui', noeud: { label: 'BAV du deuxième degré, Mobitz 1' } },
                    { condition: 'Non', noeud: { label: 'BAV du deuxième degré, Mobitz 2' } },
                  ],
                },
              },
              { condition: 'Aucun lien entre P et QRS', noeud: { label: 'BAV du troisième degré', detail: 'Dissociation auriculo-ventriculaire complète.' } },
            ],
          },
        },
        { type: 'liste', titre: 'Territoires', elements: ['Inférieur : D2, D3, aVF', 'Antérieur : V1 à V4', 'Latéral : D1, aVL, V5, V6'] },
        { type: 'pieges', elements: ['Un rythme sinusal peut avoir des QRS larges ou une fréquence hors de 60 à 100/min.'] },
      ],
    },
  ]),
  fiche(C.ira, M.nephro, 'Insuffisance rénale aiguë', [
    {
      id: 'demo-ira-mecanismes',
      titre: 'Trois mécanismes',
      blocs: [
        { type: 'scene3d', scene: SCENE_NEPHRON },
        { type: 'liste', elements: ['Obstructive : obstacle sur les voies excrétrices', 'Fonctionnelle : baisse de la perfusion rénale', 'Organique : atteinte du parenchyme, surtout nécrose tubulaire aiguë'] },
        { type: 'cles', elements: ['KDIGO : créatinine + 26,5 µmol/L en 48 h, ou × 1,5 en 7 jours, ou diurèse < 0,5 mL/kg/h pendant 6 h.'] },
      ],
    },
    {
      id: 'demo-ira-demarche',
      titre: 'Démarche diagnostique',
      blocs: [
        {
          type: 'arbre',
          titre: 'Devant une créatinine qui monte',
          racine: {
            label: 'Échographie rénale : les cavités sont-elles dilatées ?',
            branches: [
              { condition: 'Oui', noeud: { label: 'IRA obstructive', detail: 'Dérivation des urines en urgence.' } },
              {
                condition: 'Non',
                noeud: {
                  label: 'Ionogramme urinaire : sodium urinaire < 20 mmol/L et fraction excrétée < 1 % ?',
                  branches: [
                    { condition: 'Oui', noeud: { label: 'IRA fonctionnelle', detail: 'Corriger la volémie, suspendre IEC, sartans, diurétiques, AINS.' } },
                    { condition: 'Non', noeud: { label: 'IRA organique', detail: 'Rechercher une nécrose tubulaire, une atteinte glomérulaire, interstitielle ou vasculaire.' } },
                  ],
                },
              },
            ],
          },
        },
        { type: 'pieges', elements: ['Cylindres « brun sale » : nécrose tubulaire aiguë, pas IRA fonctionnelle.', "Éviter l'injection de produit de contraste iodé."] },
      ],
    },
    {
      id: 'demo-ira-urgences',
      titre: 'Urgences vitales',
      blocs: [
        { type: 'liste', titre: 'À rechercher immédiatement', elements: ['Hyperkaliémie : électrocardiogramme', 'Œdème aigu du poumon', 'Acidose métabolique sévère'] },
        {
          type: 'schema',
          titre: "Traitement de l'hyperkaliémie menaçante",
          noeuds: [
            { id: 'k', label: 'Hyperkaliémie avec signes ECG', detail: 'Ondes T amples et pointues, puis élargissement du QRS.' },
            { id: 'ca', label: 'Calcium intraveineux', detail: 'Protège le myocarde ; ne modifie pas la kaliémie.' },
            { id: 'ins', label: 'Insuline et glucose', detail: 'Font entrer le potassium dans les cellules.' },
            { id: 'b2', label: 'Bêta-2 mimétiques', detail: 'Transfert intracellulaire du potassium.' },
            { id: 'eer', label: 'Épuration extrarénale', detail: 'Si échec ou insuffisance rénale anurique.' },
          ],
          liens: [
            { de: 'k', vers: 'ca', label: 'protéger' },
            { de: 'k', vers: 'ins', label: 'transférer' },
            { de: 'k', vers: 'b2', label: 'transférer' },
            { de: 'ins', vers: 'eer', label: 'si échec' },
          ],
        },
      ],
    },
  ]),
  fiche(C.ab, M.nephro, 'Équilibre acido-basique', [
    {
      id: 'demo-ab-lecture',
      titre: 'Lire des gaz du sang',
      blocs: [
        { type: 'cles', elements: ['pH : 7,40 ± 0,02', 'PaCO2 : 40 ± 4 mmHg', 'Bicarbonates : 24 ± 2 mmol/L'] },
        {
          type: 'arbre',
          titre: 'Identifier le trouble',
          racine: {
            label: 'Le pH est-il bas ou élevé ?',
            branches: [
              {
                condition: 'pH < 7,38 : acidose',
                noeud: {
                  label: 'Quel paramètre explique le pH ?',
                  branches: [
                    { condition: 'Bicarbonates bas', noeud: { label: 'Acidose métabolique', detail: 'Compensation : hyperventilation, PaCO2 basse.' } },
                    { condition: 'PaCO2 élevée', noeud: { label: 'Acidose respiratoire', detail: 'Hypoventilation alvéolaire.' } },
                  ],
                },
              },
              {
                condition: 'pH > 7,42 : alcalose',
                noeud: {
                  label: 'Quel paramètre explique le pH ?',
                  branches: [
                    { condition: 'Bicarbonates élevés', noeud: { label: 'Alcalose métabolique', detail: 'Vomissements, diurétiques.' } },
                    { condition: 'PaCO2 basse', noeud: { label: 'Alcalose respiratoire', detail: 'Hyperventilation.' } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: 'demo-ab-trou',
      titre: 'Trou anionique',
      blocs: [
        { type: 'texte', contenu: 'Trou anionique = Na − (Cl + HCO3−). Valeur normale : 12 ± 4 mmol/L.' },
        { type: 'liste', titre: 'Élevé : un acide s’accumule', elements: ['Acidose lactique', 'Acidocétose', 'Insuffisance rénale', 'Intoxications : méthanol, éthylène glycol, salicylés'] },
        { type: 'liste', titre: 'Normal : des bicarbonates sont perdus', elements: ['Diarrhée', 'Acidoses tubulaires rénales'] },
        { type: 'mnemo', phrase: 'KUSMALE', signification: ['Kétoacidose', 'Urémie', 'Salicylés', 'Méthanol', 'Aldéhydes', 'Lactates', 'Éthylène glycol'] },
      ],
    },
  ]),
  fiche(C.asthme, M.pneumo, 'Asthme', [
    {
      id: 'demo-asthme-diagnostic',
      titre: 'Diagnostic',
      blocs: [
        { type: 'texte', contenu: 'Maladie inflammatoire chronique des voies aériennes, avec des symptômes variables et réversibles.' },
        { type: 'liste', elements: ['Sifflements, dyspnée, toux, oppression thoracique', 'Surtout la nuit et au petit matin', 'Trouble ventilatoire obstructif réversible'] },
        { type: 'cles', elements: ['Obstruction : VEMS/CVF < 0,7.', 'Réversibilité : VEMS + 12 % et + 200 mL après bronchodilatateur.'] },
      ],
    },
    {
      id: 'demo-asthme-traitement',
      titre: 'Traitement',
      blocs: [
        { type: 'liste', titre: 'De fond', elements: ['Corticoïdes inhalés : pierre angulaire', "Bêta-2 de longue durée d'action : toujours associé à un corticoïde inhalé"] },
        { type: 'liste', titre: 'De la crise', elements: ["Bêta-2 de courte durée d'action inhalés, répétés", 'Corticothérapie systémique en cas d’exacerbation', 'Oxygène si besoin'] },
      ],
    },
    {
      id: 'demo-asthme-gravite',
      titre: 'Signes de gravité',
      blocs: [
        { type: 'liste', elements: ['Parole difficile', 'Fréquence respiratoire > 30/min', 'Fréquence cardiaque > 120/min', 'SpO2 < 90 %', 'Débit expiratoire de pointe < 50 %'] },
        { type: 'pieges', elements: ["Silence auscultatoire : signe d'alarme, pas d'amélioration.", "PaCO2 normale ou élevée en crise : épuisement."] },
      ],
    },
  ]),
  fiche(C.ep, M.pneumo, 'Embolie pulmonaire', [
    {
      id: 'demo-ep-facteurs',
      titre: 'Facteurs de risque',
      blocs: [
        { type: 'liste', elements: ['Chirurgie récente, immobilisation', 'Cancer évolutif', 'Œstrogènes, grossesse, post-partum', 'Antécédent thrombo-embolique, thrombophilie'] },
      ],
    },
    {
      id: 'demo-ep-demarche',
      titre: 'Démarche diagnostique',
      blocs: [
        {
          type: 'arbre',
          titre: "Suspicion d'embolie pulmonaire, patient stable",
          racine: {
            label: 'Probabilité clinique (score de Wells ou de Genève)',
            branches: [
              {
                condition: 'Faible ou intermédiaire',
                noeud: {
                  label: 'D-dimères',
                  detail: 'Seuil ajusté à l’âge après 50 ans : âge × 10 µg/L.',
                  branches: [
                    { condition: 'Négatifs', noeud: { label: 'Embolie pulmonaire éliminée' } },
                    { condition: 'Positifs', noeud: { label: 'Angioscanner thoracique' } },
                  ],
                },
              },
              { condition: 'Forte', noeud: { label: "Angioscanner thoracique d'emblée", detail: 'Pas de D-dimères ; débuter les anticoagulants sans attendre.' } },
            ],
          },
        },
        { type: 'pieges', elements: ['Les D-dimères ne se dosent pas quand la probabilité clinique est forte.'] },
      ],
    },
    {
      id: 'demo-ep-traitement',
      titre: 'Traitement',
      blocs: [
        { type: 'liste', elements: ['Anticoagulation curative dès la suspicion forte', 'Durée minimale : 3 mois', 'Haut risque (choc, hypotension) : thrombolyse'] },
      ],
    },
  ]),
];

const flash = (chapitreId: string, matiereId: string, n: number, recto: string, verso: string): Flashcard => ({
  id: `demo-flash-${chapitreId.slice(5)}-${n}`,
  chapitreId,
  matiereId,
  recto,
  verso,
  demo: true,
});

export const FLASHCARDS: Flashcard[] = [
  flash(C.ic, M.cardio, 1, "FEVG définissant l'insuffisance cardiaque à fraction d'éjection réduite ?", '≤ 40 %'),
  flash(C.ic, M.cardio, 2, 'Quatre classes qui réduisent la mortalité (FEVG réduite) ?', 'IEC ou sacubitril-valsartan · bêtabloquant · antialdostérone · inhibiteur de SGLT2'),
  flash(C.ic, M.cardio, 3, 'Stade NYHA III ?', 'Gêne pour des efforts minimes, aucun symptôme au repos'),
  flash(C.ic, M.cardio, 4, "Trois signes d'insuffisance cardiaque droite ?", 'Turgescence jugulaire · reflux hépato-jugulaire · œdèmes des membres inférieurs'),
  flash(C.ecg, M.cardio, 1, 'Durée d’un petit carreau à 25 mm/s ?', '0,04 seconde'),
  flash(C.ecg, M.cardio, 2, 'Intervalle PR normal ?', '0,12 à 0,20 seconde'),
  flash(C.ecg, M.cardio, 3, 'Dérivations du territoire inférieur ?', 'D2, D3, aVF'),
  flash(C.ecg, M.cardio, 4, 'Critères du rythme sinusal ?', 'Une onde P avant chaque QRS · P positive en D2 · PR constant'),
  flash(C.ira, M.nephro, 1, 'Premier examen devant une insuffisance rénale aiguë ?', 'Échographie rénale, pour éliminer un obstacle'),
  flash(C.ira, M.nephro, 2, 'Sodium urinaire dans une IRA fonctionnelle ?', 'Inférieur à 20 mmol/L (fraction excrétée < 1 %)'),
  flash(C.ira, M.nephro, 3, "Rôle du calcium IV dans l'hyperkaliémie ?", 'Protéger le myocarde, sans baisser la kaliémie'),
  flash(C.ira, M.nephro, 4, "Première cause d'IRA organique ?", 'Nécrose tubulaire aiguë'),
  flash(C.ab, M.nephro, 1, 'Formule du trou anionique ?', 'Na − (Cl + HCO3−) = 12 ± 4 mmol/L'),
  flash(C.ab, M.nephro, 2, 'Trouble provoqué par des vomissements abondants ?', 'Alcalose métabolique'),
  flash(C.ab, M.nephro, 3, 'Deux causes d’acidose métabolique à trou anionique normal ?', 'Diarrhée · acidose tubulaire rénale'),
  flash(C.asthme, M.pneumo, 1, "Traitement de fond de l'asthme persistant ?", 'Corticoïdes inhalés'),
  flash(C.asthme, M.pneumo, 2, 'Critères de réversibilité ?', 'VEMS + 12 % et + 200 mL après bronchodilatateur'),
  flash(C.asthme, M.pneumo, 3, 'Que signifie une PaCO2 normale en crise sévère ?', "Épuisement respiratoire : signe d'alarme"),
  flash(C.ep, M.pneumo, 1, 'Probabilité clinique forte : quel examen ?', "Angioscanner thoracique d'emblée, sans D-dimères"),
  flash(C.ep, M.pneumo, 2, 'Seuil des D-dimères après 50 ans ?', 'Âge × 10 µg/L'),
  flash(C.ep, M.pneumo, 3, 'Durée minimale de l’anticoagulation ?', '3 mois'),
];

export const IDS = { M, C, P };
