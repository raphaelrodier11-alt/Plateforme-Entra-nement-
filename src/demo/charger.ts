/**
 * Chargement et retrait du jeu de démonstration.
 *
 * Tout est écrit dans la copie locale uniquement : rien de fictif n'est
 * envoyé au serveur. Un historique de révision simulé remplit les tableaux
 * de bord pour montrer à quoi ils ressemblent après quelques semaines.
 */
import { corriger } from '../../shared/bareme';
import { JOUR_MS, ajouterJours, cleJour } from '../../shared/dates';
import { generateurAleatoire, melanger } from '../../shared/examens';
import type {
  Anomalie,
  Disponibilite,
  Estimation,
  EtatPipeline,
  Examen,
  Fichier,
  NotificationApp,
  PassageIllisible,
  Question,
  ReponseDonnee,
  Session,
  Tentative,
  TypeErreur,
} from '../../shared/types';
import { base, ecrireMeta, lireMeta } from '../db/base';
import { ecrireLocal, supprimer } from '../db/sync';
import { CAS, CHAPITRES, FICHES, FLASHCARDS, IDS, MATIERES, PARTIELS, QUESTIONS } from './contenu';

const PREFIXE = 'demo-';
const META_DISPOS = 'demo:disponibilites';

/** Probabilité de bien répondre, par chapitre : certains sont volontairement fragiles. */
const NIVEAU: Record<string, number> = {
  [IDS.C.ecg]: 0.9,
  [IDS.C.ic]: 0.58,
  [IDS.C.asthme]: 0.5,
  [IDS.C.ira]: 0.28,
};

/** Fabrique une réponse comportant le nombre d'erreurs voulu. */
function reponseAvecErreurs(q: Question, erreurs: number): ReponseDonnee {
  if (q.type === 'trous') {
    const textes: Record<string, string> = {};
    (q.trous ?? []).forEach((t, i) => {
      textes[t.id] = i < erreurs ? 'je ne sais pas' : t.reponses[0]!;
    });
    return { textes };
  }
  const propositions = q.propositions ?? [];
  if (q.type === 'vrai_faux') {
    const jugements: Record<string, boolean> = {};
    propositions.forEach((p, i) => {
      jugements[p.id] = i < erreurs ? !p.correcte : p.correcte;
    });
    return { jugements };
  }
  if (q.type === 'simple') {
    const voulue = propositions.find((p) => (erreurs > 0 ? !p.correcte : p.correcte));
    return { cochees: voulue ? [voulue.id] : [] };
  }
  const cochees = propositions
    .filter((p, i) => (i < erreurs ? !p.correcte : p.correcte))
    .map((p) => p.id);
  return { cochees };
}

function historiqueSimule(maintenant: number): { tentatives: Tentative[]; sessions: Session[] } {
  const alea = generateurAleatoire(20261116);
  const travaillees = QUESTIONS.filter((q) => !q.reserveExamen && NIVEAU[q.chapitreId] !== undefined);
  const types: TypeErreur[] = ['lacune', 'lacune', 'inattention', 'piege'];
  const tentatives: Tentative[] = [];
  const sessions: Session[] = [];
  const reussites = new Map<string, number>();

  // Jours de révision sur les trois dernières semaines, avec quelques pauses.
  const joursActifs = [20, 19, 17, 16, 15, 13, 12, 10, 9, 8, 6, 5, 4, 3, 2, 1];
  for (const ecart of joursActifs) {
    const debut = new Date(maintenant - ecart * JOUR_MS);
    debut.setHours(18, 30, 0, 0);
    const choisies = melanger(travaillees, alea).slice(0, 5 + Math.floor(alea() * 7));
    const sessionId = `${PREFIXE}session-${ecart}`;
    let points = 0;

    choisies.forEach((q, i) => {
      // On progresse : chaque passage sur une question améliore les chances.
      const niveau = Math.min(0.95, (NIVEAU[q.chapitreId] ?? 0.5) + 0.04 * (reussites.get(q.id) ?? 0));
      const tirage = alea();
      const erreurs = tirage < niveau ? 0 : tirage < niveau + (1 - niveau) * 0.45 ? 1 : 2;
      const reponse = reponseAvecErreurs(q, erreurs);
      const correction = corriger(q, reponse);
      if (correction.nbErreurs === 0) reussites.set(q.id, (reussites.get(q.id) ?? 0) + 1);
      points += correction.points;
      tentatives.push({
        id: `${PREFIXE}tentative-${ecart}-${i}`,
        questionId: q.id,
        chapitreId: q.chapitreId,
        matiereId: q.matiereId,
        date: debut.getTime() + i * 70_000,
        reponse,
        nbErreurs: correction.nbErreurs,
        points: correction.points,
        typeErreur:
          correction.nbErreurs > 0
            ? q.piege
              ? 'piege'
              : types[Math.floor(alea() * types.length)]
            : undefined,
        sessionId,
        contexte: 'qcm',
        dureeMs: 20_000 + Math.floor(alea() * 50_000),
      });
    });

    sessions.push({
      id: sessionId,
      type: 'qcm',
      titre: 'Révision du soir',
      debut: debut.getTime(),
      fin: debut.getTime() + choisies.length * 70_000,
      questionIds: choisies.map((q) => q.id),
      points,
      termine: true,
    });
  }
  return { tentatives, sessions };
}

export async function chargerDemo(): Promise<void> {
  const maintenant = Date.now();
  const aujourdHui = cleJour(maintenant);
  const { tentatives, sessions } = historiqueSimule(maintenant);

  const fichier: Fichier = {
    id: 'demo-fichier-asthme',
    nom: 'Asthme - cours 2026.pdf',
    chemin: 'Appareil respiratoire/Asthme - cours 2026.pdf',
    mimeType: 'application/pdf',
    role: 'cours',
    etat: 'modifie',
    modifieLe: new Date(maintenant - 2 * JOUR_MS).toISOString(),
    versionTraitee: new Date(maintenant - 40 * JOUR_MS).toISOString(),
    matiereId: IDS.M.pneumo,
    chapitreId: IDS.C.asthme,
    nbPages: 34,
  };

  const anomalies: Anomalie[] = [
    {
      id: 'demo-anomalie-1',
      type: 'mal_classee',
      cible: {
        fichierNom: 'Annales néphrologie - mai 2024.pdf',
        chapitreId: IDS.C.ab,
        questionId: 'demo-ira-3',
        page: 3,
      },
      description:
        "Cette question sur l'hyperkaliémie menaçante est rangée dans « Équilibre acido-basique ».",
      correction: 'Déplacer la question vers le chapitre « Insuffisance rénale aiguë ».',
      explication:
        "L'hyperkaliémie menaçante et son traitement sont traités dans le cours d'insuffisance rénale aiguë, partie « Urgences vitales ».",
      source: 'Cours « Insuffisance rénale aiguë », page 9.',
      patch: { op: 'deplacer', questionId: 'demo-ira-3', chapitreId: IDS.C.ira, matiereId: IDS.M.nephro },
      statut: 'en_attente',
      creeLe: maintenant - JOUR_MS,
      demo: true,
    },
    {
      id: 'demo-anomalie-2',
      type: 'faute',
      cible: {
        fichierNom: 'ECG - les bases.pptx',
        chapitreId: IDS.C.ecg,
        page: 4,
        extrait: 'À 25 mm/s, un grand carreau correspond à 0,02 seconde.',
      },
      description: 'La durée du grand carreau indiquée sur la diapositive 4 est fausse.',
      correction: 'À 25 mm/s, un grand carreau correspond à 0,20 seconde.',
      explication:
        "Un petit carreau de 1 mm vaut 0,04 s ; un grand carreau en compte cinq, soit 0,20 s. La diapositive 6 du même cours donne d'ailleurs la bonne valeur.",
      source: 'Même cours, diapositive 6 ; calcul : 5 × 0,04 s.',
      patch: {
        op: 'erratum',
        chapitreId: IDS.C.ecg,
        note: 'Diapositive 4 : un grand carreau vaut 0,20 s à 25 mm/s (et non 0,02 s).',
      },
      statut: 'en_attente',
      creeLe: maintenant - JOUR_MS,
      demo: true,
    },
  ];

  const illisibles: PassageIllisible[] = [
    {
      id: 'demo-illisible-1',
      fichierId: 'demo-fichier-annale',
      fichierNom: 'Annales pneumologie - mai 2023 (scan).pdf',
      page: 5,
      contexte: 'Question 17, proposition D : texte manuscrit en marge, non déchiffrable.',
      creeLe: maintenant - 3 * JOUR_MS,
    },
  ];

  const notifications: NotificationApp[] = [
    {
      id: 'demo-notif-1',
      type: 'fichier_modifie',
      titre: 'Un cours a changé dans ton drive',
      message: '« Asthme - cours 2026.pdf » a été modifié. Valide la mise à jour pour régénérer la fiche et les QCM.',
      chapitreId: IDS.C.asthme,
      fichierId: fichier.id,
      date: maintenant - 2 * JOUR_MS,
    },
    {
      id: 'demo-notif-2',
      type: 'nouveau_chapitre',
      titre: 'Nouveau chapitre ajouté',
      message: '« Équilibre acido-basique » a été détecté. Sa fiche et ses QCM ont été générés.',
      chapitreId: IDS.C.ab,
      date: maintenant - 4 * JOUR_MS,
    },
  ];

  const estimation: Estimation = {
    id: 'demo-estimation',
    date: maintenant - JOUR_MS,
    lignes: [
      { etape: 'Lecture des fichiers (scans compris)', modele: 'modèle de masse', appels: 48, tokensEntree: 1_250_000, tokensSortie: 610_000, coutUsd: 0.92 },
      { etape: 'Extraction des annales', modele: 'modèle de masse', appels: 22, tokensEntree: 540_000, tokensSortie: 380_000, coutUsd: 0.51 },
      { etape: 'Fiches, QCM et flashcards', modele: 'modèle de masse', appels: 96, tokensEntree: 2_900_000, tokensSortie: 1_450_000, coutUsd: 2.18 },
      { etape: 'Détection des erreurs', modele: 'modèle expert', appels: 60, tokensEntree: 1_800_000, tokensSortie: 240_000, coutUsd: 4.65 },
    ],
    totalUsd: 8.26,
    mensuelUsd: 0.9,
    tauxEurParUsd: 0.92,
    hypotheses: [
      'Exemple de démonstration : ces montants ne correspondent pas à tes fichiers.',
      '32 chapitres, 35 questions générées par chapitre en moyenne.',
      'Régime de croisière : deux fichiers modifiés et un nouveau chapitre par mois.',
    ],
    tarifs: [],
    statut: 'a_valider',
  };

  const etat: EtatPipeline = {
    id: 'pipeline',
    statut: 'en_attente_validation',
    dernierScan: maintenant - JOUR_MS,
    message: 'Données de démonstration : aucun drive n’est relié.',
    nbFichiers: 14,
    nbChapitres: CHAPITRES.length,
    nbQuestions: QUESTIONS.length,
  };

  // Quelques créneaux et deux examens, pour montrer le planning.
  const modele: Disponibilite['creneaux'][] = [
    { soir: 90 },
    { soir: 60 },
    { apres_midi: 120 },
    { soir: 90 },
    {},
    { matin: 120, apres_midi: 90 },
    { matin: 90 },
  ];
  const existantes = new Set((await base.collection<Disponibilite>('disponibilites').toArray()).map((d) => d.id));
  const disponibilites: Disponibilite[] = [];
  for (let j = 0; j < 14; j++) {
    const jour = ajouterJours(aujourdHui, j);
    const creneaux = modele[new Date(maintenant + j * JOUR_MS).getDay()]!;
    if (!existantes.has(jour) && Object.keys(creneaux).length) disponibilites.push({ id: jour, creneaux });
  }
  const examens: Examen[] = [
    { id: 'demo-examen-nephro', matiereId: IDS.M.nephro, titre: 'Partiel de néphrologie', date: ajouterJours(aujourdHui, 9), source: 'manuel' },
    { id: 'demo-examen-cardio', matiereId: IDS.M.cardio, titre: 'Partiel de cardiologie', date: ajouterJours(aujourdHui, 24), source: 'manuel' },
  ];

  await ecrireLocal('matieres', MATIERES);
  await ecrireLocal('chapitres', CHAPITRES);
  await ecrireLocal('partiels', PARTIELS);
  await ecrireLocal('cas', CAS);
  await ecrireLocal('questions', QUESTIONS);
  await ecrireLocal('fiches', FICHES.map((f) => ({ ...f, genereLe: maintenant })));
  await ecrireLocal('flashcards', FLASHCARDS);
  await ecrireLocal('fichiers', [fichier]);
  await ecrireLocal('anomalies', anomalies);
  await ecrireLocal('illisibles', illisibles);
  await ecrireLocal('notifications', notifications);
  await ecrireLocal('estimations', [estimation]);
  if (!(await base.collection('etat').get('pipeline'))) await ecrireLocal('etat', [etat]);
  await ecrireLocal('tentatives', tentatives);
  await ecrireLocal('sessions', sessions);
  await ecrireLocal('disponibilites', disponibilites);
  await ecrireLocal('examens', examens);
  await ecrireMeta(META_DISPOS, disponibilites.map((d) => d.id));
}

const estDemo = (id: string | undefined): boolean => !!id && id.startsWith(PREFIXE);

/** Retire toute la démonstration, y compris les réponses données dessus. */
export async function supprimerDemo(): Promise<void> {
  // Documents créés par l'utilisateur sur le contenu de démonstration : leur
  // suppression est synchronisée, car ils ont pu être envoyés au serveur.
  const tentatives = await base.collection<Tentative>('tentatives').toArray();
  for (const t of tentatives) {
    if (estDemo(t.questionId) && !estDemo(t.id)) await supprimer('tentatives', t.id);
  }
  const sessions = await base.collection<Session>('sessions').toArray();
  for (const s of sessions) {
    if (!estDemo(s.id) && s.questionIds.some(estDemo)) await supprimer('sessions', s.id);
  }
  for (const x of await base.collection<Examen>('examens').toArray()) {
    if (!estDemo(x.id) && estDemo(x.matiereId)) await supprimer('examens', x.id);
  }
  for (const r of await base.collection('revues').toArray()) {
    if (estDemo(r.id)) await supprimer('revues', r.id);
  }
  for (const d of await base.collection<{ id: string; cibleId: string }>('decisions').toArray()) {
    if (estDemo(d.cibleId)) await supprimer('decisions', d.id);
  }
  for (const jour of (await lireMeta<string[]>(META_DISPOS)) ?? []) {
    await supprimer('disponibilites', jour);
  }

  // Tout ce qui porte un identifiant de démonstration n'existe qu'en local.
  await base.transaction('rw', base.tables, async () => {
    for (const table of base.tables) {
      if (table.name === 'file' || table.name === 'meta') continue;
      const cles = (await table.toCollection().primaryKeys()) as string[];
      await table.bulkDelete(cles.filter(estDemo));
    }
    const etat = await base.collection<EtatPipeline>('etat').get('pipeline');
    if (etat?.message?.startsWith('Données de démonstration')) await base.collection('etat').delete('pipeline');
  });
  await ecrireMeta(META_DISPOS, []);
}
