import { beforeEach, describe, expect, it } from 'vitest';
import { estIncontournable } from '../../shared/marqueurs';
import type {
  Anomalie,
  Chapitre,
  CoursDetaille,
  DemandeDocument,
  Estimation,
  EtatPipeline,
  Fiche,
  Fichier,
  Flashcard,
  Matiere,
  NotificationApp,
  PassageIllisible,
  Question,
  Tache,
} from '../../shared/types';
import { SEMAINE_MS, executer, type Dependances, type OptionsIa } from '../../pipeline/orchestrateur';
import { ANNALES, COURS, DriveMemoire, IaTest, StockageMemoire, fichier, lireTest } from './aide';

const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const PAGE = (titre: string, n: number) =>
  `${titre} — page ${n}. ${'Contenu du cours suffisamment long pour être considéré comme du texte. '.repeat(4)}`;
const COURS_IC = [PAGE('Insuffisance cardiaque', 1), PAGE('Insuffisance cardiaque', 2)].join('\f');
const ANNALE_2023 = `Partiel 2023 de cardiologie, sujet complet avec corrigé.
Q1: Quels sont les signes d'insuffisance cardiaque gauche ? | A) Orthopnée | B) Turgescence jugulaire | C) Crépitants pulmonaires | REP: A,C
Q2: Quel examen mesure la fraction d'éjection du ventricule gauche ? | A) Échocardiographie | B) Radiographie thoracique | REP: A`;
const ANNALE_2024 = `Partiel 2024 de cardiologie, sujet sans corrigé pour la dernière question.
Q1: Parmi ces signes, lesquels sont des signes d'insuffisance cardiaque gauche ? | A) Orthopnée | B) Turgescence jugulaire | C) Crépitants pulmonaires | REP: A,C
Q2: Quelle classe thérapeutique réduit la mortalité dans l'insuffisance cardiaque ? | A) Bêtabloquants | B) Diurétiques de l'anse`;

let stockage: StockageMemoire;
let drive: DriveMemoire;
let ias: IaTest[];
let options: OptionsIa[];
let maintenant: number;

const passer = (surcharge: Partial<Dependances> = {}) =>
  executer({
    stockage,
    creerDrive: () => drive,
    creerIa: async (o) => {
      options.push(o);
      const ia = new IaTest(o.plafondUsd);
      ias.push(ia);
      return ia;
    },
    lire: lireTest,
    mode: 'auto',
    budgetMinutes: 10,
    maintenant,
    ...surcharge,
  });

const nbAppels = () => ias.reduce((s, ia) => s + ia.appels.length, 0);
const approuver = () =>
  stockage.ecrire('taches', [
    { id: 't-generation', type: 'generation_complete', statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies Tache,
  ]);

beforeEach(async () => {
  stockage = new StockageMemoire();
  drive = new DriveMemoire();
  ias = [];
  options = [];
  maintenant = T0;
  await stockage.ecrire('reglages', [
    {
      id: 'principal',
      dossierCours: `https://drive.google.com/drive/folders/${COURS}`,
      dossierAnnales: `https://drive.google.com/drive/folders/${ANNALES}?usp=sharing`,
      // Ces tests couvrent le parcours payant ; le mode gratuit a ses propres tests.
      modeGratuit: false,
    },
  ]);
  drive.dossiers.set(COURS, [fichier('f-ic', 'Cardiologie/Insuffisance cardiaque.pdf', COURS_IC)]);
  drive.dossiers.set(ANNALES, [
    fichier('f-a23', 'Cardiologie/Annale 2023.pdf', ANNALE_2023),
    fichier('f-a24', 'Cardiologie/Annale 2024.pdf', ANNALE_2024),
  ]);
});

describe('pipeline : configuration', () => {
  it('ne fait rien tant que les dossiers ne sont pas renseignés', async () => {
    await stockage.ecrire('reglages', [{ id: 'principal' }]);
    expect(await passer()).toBe('non_configure');
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')?.message).toContain('dossiers');
    expect(stockage.liste('fichiers')).toHaveLength(0);
  });

  it('ne fait rien tant que Google Drive n\'est pas connecté', async () => {
    stockage.jeton = undefined;
    expect(await passer()).toBe('non_configure');
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')?.message).toContain('Google');
  });
});

describe('pipeline : estimation avant toute dépense', () => {
  it('scanne, lit les fichiers et présente une estimation sans appeler l\'IA', async () => {
    expect(await passer()).toBe('estimation');

    expect(stockage.liste<Fichier>('fichiers').map((f) => [f.id, f.etat, f.role]).sort()).toEqual([
      ['f-a23', 'nouveau', 'annale'],
      ['f-a24', 'nouveau', 'annale'],
      ['f-ic', 'nouveau', 'cours'],
    ]);
    expect(stockage.liste('textes')).toHaveLength(3);

    const [estimation] = stockage.liste<Estimation>('estimations');
    expect(estimation).toMatchObject({ statut: 'a_valider' });
    expect(estimation!.totalUsd).toBeGreaterThan(0);
    expect(estimation!.mensuelUsd).toBeGreaterThan(0);
    expect(estimation!.lignes.map((l) => l.etape)).toEqual(
      expect.arrayContaining(['Fiches de révision', 'QCM et examens blancs', "Détection d'erreurs", 'Extraction des annales']),
    );
    // Le modèle expert n'est prévu que pour les corrections et les corrigés manquants.
    const expert = estimation!.lignes.filter((l) => l.modele.includes('pro')).map((l) => l.etape);
    expect(expert.sort()).toEqual(['Corrigés manquants', "Détection d'erreurs"]);

    expect(nbAppels()).toBe(0);
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')).toMatchObject({ statut: 'en_attente_validation' });
    expect(stockage.liste<NotificationApp>('notifications').map((n) => n.type)).toContain('estimation');
    expect(stockage.liste('questions')).toHaveLength(0);
  });

  it('ne recalcule pas l\'estimation tant que les fichiers n\'ont pas changé', async () => {
    await passer();
    maintenant += 3_600_000;
    expect(await passer()).toBe('estimation');
    expect(stockage.liste('estimations')).toHaveLength(1);
    expect(nbAppels()).toBe(0);
  });

  it('remplace l\'estimation quand un fichier s\'ajoute', async () => {
    await passer();
    drive.dossiers.get(COURS)!.push(fichier('f-ecg', 'Cardiologie/ECG.pdf', COURS_IC.replaceAll('Insuffisance cardiaque', 'ECG')));
    await passer({ mode: 'scan' });
    const statuts = stockage.liste<Estimation>('estimations').map((e) => e.statut).sort();
    expect(statuts).toEqual(['a_valider', 'perimee']);
  });

  it('signale l\'absence de clé Gemini une fois la génération approuvée', async () => {
    await passer();
    await approuver();
    expect(await passer({ creerIa: undefined })).toBe('sans_cle');
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')?.message).toContain('GEMINI_API_KEY');
  });
});

describe('pipeline : génération complète après approbation', () => {
  beforeEach(async () => {
    await passer();
    await approuver();
    maintenant += 3_600_000;
  });

  it('classe les fichiers, génère fiche, QCM, flashcards et propose des corrections', async () => {
    expect(await passer()).toBe('termine');

    const matieres = stockage.liste<Matiere>('matieres');
    expect(matieres.map((m) => m.nom)).toEqual(['Cardiologie']);
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre).toMatchObject({ nouveau: true, aGenerer: false, aVerifier: false, version: 1, fichierIds: ['f-ic'] });

    // Fiche : le bloc « tableau » renvoyé par l'IA a été écarté.
    const fiche = stockage.un<Fiche>('fiches', chapitre.id)!;
    expect(fiche.sections).toHaveLength(2);
    expect(fiche.sections[0]!.blocs.map((b) => b.type)).toEqual(['texte', 'cles', 'arbre']);

    const questions = stockage.liste<Question>('questions');
    const generees = questions.filter((q) => q.source === 'genere');
    const entrainement = generees.filter((q) => !q.reserveExamen);
    // Entre 20 et 50 questions d'entraînement, annales comprises.
    const annales = questions.filter((q) => q.source === 'annale');
    expect(entrainement.length + annales.filter((q) => q.chapitreId === chapitre.id).length).toBeGreaterThanOrEqual(20);
    expect(entrainement.length).toBeLessThanOrEqual(52);
    expect(generees.filter((q) => q.reserveExamen).length).toBeGreaterThanOrEqual(6);
    expect(generees.every((q) => q.explication.length > 0)).toBe(true);
    expect(new Set(generees.map((q) => q.id)).size).toBe(generees.length);

    expect(stockage.liste<Flashcard>('flashcards')).toHaveLength(10);
    expect(stockage.liste<Fichier>('fichiers').every((f) => f.etat === 'a_jour')).toBe(true);

    // Corrections proposées : en attente, avec source ; celle sans source est écartée.
    const anomalies = stockage.liste<Anomalie>('anomalies');
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      statut: 'en_attente',
      type: 'faute',
      source: 'Cours, page 3.',
      patch: { op: 'erratum' },
      cible: { fichierNom: 'Insuffisance cardiaque.pdf', page: 2 },
    });

    expect(stockage.un<Tache>('taches', 't-generation')).toMatchObject({ statut: 'terminee' });
    const etat = stockage.un<EtatPipeline>('etat', 'pipeline')!;
    expect(etat).toMatchObject({ statut: 'ok', modeles: { masse: 'gemini-test-flash', expert: 'gemini-test-pro' } });
    expect(etat.depense!.usd).toBeGreaterThan(0);
    expect(stockage.liste<Estimation>('estimations')[0]).toMatchObject({ statut: 'approuvee' });
    const types = stockage.liste<NotificationApp>('notifications').map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['nouveau_chapitre', 'anomalies']));
  });

  it('réserve le modèle expert aux corrections et aux corrigés manquants', async () => {
    await passer();
    const expert = new Set(ias.flatMap((ia) => ia.appels).filter((a) => a.niveau === 'expert').map((a) => a.etape));
    expect([...expert].sort()).toEqual(['Corrigés manquants', "Détection d'erreurs"]);
  });

  it('extrait les annales et repère les questions incontournables', async () => {
    await passer();
    const annales = stockage.liste<Question>('questions').filter((q) => q.source === 'annale');
    expect(annales).toHaveLength(3);

    // La même question, formulée différemment en 2023 et en 2024, est fusionnée.
    const signes = annales.find((q) => q.enonce.includes('signes'))!;
    expect(signes.occurrences!.map((o) => o.partielId).sort()).toHaveLength(2);
    expect(new Set(signes.occurrences!.map((o) => o.partielId)).size).toBe(2);
    expect(estIncontournable(signes)).toBe(true);
    expect(signes.propositions!.map((p) => p.correcte)).toEqual([true, false, true]);
    expect(signes.corrige).toBe('officiel');
    expect(signes.explication).toContain('Explication du corrigé');

    const fevg = annales.find((q) => q.enonce.includes('fraction'))!;
    expect(estIncontournable(fevg)).toBe(false);

    // Corrigé absent : réponse établie par le modèle expert et signalée comme telle.
    const sansCorrige = annales.find((q) => q.enonce.includes('mortalité'))!;
    expect(sansCorrige.corrige).toBe('propose_ia');
    expect(sansCorrige.propositions!.map((p) => p.correcte)).toEqual([true, false]);

    // Chaque question est rattachée au chapitre du cours.
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(annales.every((q) => q.chapitreId === chapitre.id)).toBe(true);
    expect(stockage.un<Matiere>('matieres', chapitre.matiereId)!.formatPartiel?.nbQuestions).toBe(2);
  });

  it('ne refait rien au passage suivant', async () => {
    await passer();
    const avant = nbAppels();
    maintenant += 3_600_000;
    expect(await passer()).toBe('rien_a_faire');
    expect(nbAppels()).toBe(avant);
  });
});

describe('pipeline : suivi des changements du drive', () => {
  beforeEach(async () => {
    await passer();
    await approuver();
    await passer();
    maintenant += SEMAINE_MS + 1;
  });

  it('revérifie le drive au bout d\'une semaine', async () => {
    expect(await passer()).toBe('termine');
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')!.dernierScan).toBe(maintenant);
  });

  it('un fichier modifié attend une validation : rien n\'est régénéré', async () => {
    drive.dossiers.set(COURS, [
      fichier('f-ic', 'Cardiologie/Insuffisance cardiaque.pdf', `${COURS_IC}\f${PAGE('Ajout', 3)}`, '2026-11-20T09:00:00Z'),
    ]);
    const avant = nbAppels();
    await passer();

    expect(stockage.un<Fichier>('fichiers', 'f-ic')).toMatchObject({ etat: 'modifie', versionTraitee: '2026-11-01T10:00:00Z' });
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre).toMatchObject({ majEnAttente: true, version: 1 });
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'fichier_modifie')).toBe(true);
    expect(nbAppels()).toBe(avant);
  });

  it('après validation, le chapitre est régénéré et le badge retiré', async () => {
    drive.dossiers.set(COURS, [
      fichier('f-ic', 'Cardiologie/Insuffisance cardiaque.pdf', `${COURS_IC}\f${PAGE('Ajout', 3)}`, '2026-11-20T09:00:00Z'),
    ]);
    await passer();
    // Effet de la validation dans l'app (appliqué par le serveur).
    const f = stockage.un<Fichier>('fichiers', 'f-ic')!;
    await stockage.ecrire('fichiers', [{ ...f, etat: 'maj_validee' }]);
    maintenant += 3_600_000;

    expect(await passer()).toBe('termine');
    expect(stockage.un<Fichier>('fichiers', 'f-ic')).toMatchObject({ etat: 'a_jour', versionTraitee: '2026-11-20T09:00:00Z', nbPages: 3 });
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    expect(chapitre).toMatchObject({ majEnAttente: false, version: 2 });
    expect(stockage.un<Fiche>('fiches', chapitre.id)!.version).toBe(2);
    // Les questions d'annales ne sont pas touchées par la régénération du cours.
    expect(stockage.liste<Question>('questions').filter((q) => q.source === 'annale')).toHaveLength(3);
  });

  it('une mise à jour refusée n\'est plus proposée', async () => {
    drive.dossiers.set(COURS, [
      fichier('f-ic', 'Cardiologie/Insuffisance cardiaque.pdf', COURS_IC, '2026-11-20T09:00:00Z'),
    ]);
    await passer();
    const f = stockage.un<Fichier>('fichiers', 'f-ic')!;
    // Effet du refus dans l'app.
    await stockage.ecrire('fichiers', [{ ...f, etat: 'a_jour', versionIgnoree: f.modifieLe }]);
    maintenant += SEMAINE_MS + 1;
    await passer();
    expect(stockage.un<Fichier>('fichiers', 'f-ic')!.etat).toBe('a_jour');
  });

  it('un nouveau chapitre est ajouté et généré automatiquement', async () => {
    drive.dossiers.get(COURS)!.push(
      fichier('f-ecg', 'Cardiologie/Électrocardiogramme.pdf', COURS_IC.replaceAll('Insuffisance cardiaque', 'Électrocardiogramme')),
    );
    expect(await passer()).toBe('termine');

    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Électrocardiogramme')!;
    expect(chapitre).toMatchObject({ nouveau: true, version: 1 });
    expect(stockage.un<Fiche>('fiches', chapitre.id)).toBeDefined();
    expect(stockage.liste<Question>('questions').filter((q) => q.chapitreId === chapitre.id).length).toBeGreaterThanOrEqual(20);
    expect(
      stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'nouveau_chapitre' && n.chapitreId === chapitre.id),
    ).toBe(true);
  });

  it('signale un fichier disparu sans supprimer le contenu généré', async () => {
    drive.dossiers.set(ANNALES, [fichier('f-a23', 'Cardiologie/Annale 2023.pdf', ANNALE_2023)]);
    await passer();
    expect(stockage.un<Fichier>('fichiers', 'f-a24')!.etat).toBe('supprime');
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'fichier_supprime')).toBe(true);
    expect(stockage.liste<Question>('questions').filter((q) => q.source === 'annale')).toHaveLength(3);
  });

  it('un drive qui paraît vide est traité comme une panne, pas comme une suppression', async () => {
    drive.dossiers.clear();
    expect(await passer()).toBe('erreur');
    expect(stockage.liste<Fichier>('fichiers').every((f) => f.etat === 'a_jour')).toBe(true);
    expect(stockage.un<EtatPipeline>('etat', 'pipeline')!.statut).toBe('erreur');
  });
});

describe('pipeline : scans et plafond de dépense', () => {
  it('fait lire les pages scannées par l\'IA et signale les passages illisibles', async () => {
    drive.dossiers.set(ANNALES, [fichier('f-scan', 'Cardiologie/Annale 2022.pdf', `${ANNALE_2023}\f`)]);
    await passer();
    const estimation = stockage.liste<Estimation>('estimations')[0]!;
    expect(estimation.lignes.map((l) => l.etape)).toContain('Lecture des pages scannées');

    await approuver();
    await passer();
    const lectures = ias.flatMap((ia) => ia.appels).filter((a) => a.etape === 'Lecture des pages scannées');
    expect(lectures).toHaveLength(1);
    expect(lectures[0]!.consigne).toContain('pages suivantes : 2');
    expect(lectures[0]!.pieces).toHaveLength(1);

    const illisibles = stockage.liste<PassageIllisible>('illisibles');
    expect(illisibles).toHaveLength(1);
    expect(illisibles[0]).toMatchObject({ fichierNom: 'Annale 2022.pdf', page: 2 });
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.type === 'illisible')).toBe(true);
  });

  it('applique le plafond mensuel : 2 fois l\'estimation approuvée par défaut', async () => {
    await passer();
    await approuver();
    await passer();
    const estimation = stockage.liste<Estimation>('estimations')[0]!;
    expect(options[0]!.plafondUsd).toBeCloseTo(Math.max(3, 2 * estimation.totalUsd), 5);
  });

  it('s\'arrête quand le plafond est atteint et reprend après relèvement', async () => {
    await stockage.ecrire('reglages', [
      {
        id: 'principal',
        dossierCours: COURS,
        dossierAnnales: ANNALES,
        modeGratuit: false,
        plafondMensuelUsd: 0.05,
      },
    ]);
    await passer();
    await approuver();
    expect(await passer()).toBe('plafond');
    const etat = stockage.un<EtatPipeline>('etat', 'pipeline')!;
    expect(etat.statut).toBe('en_attente_validation');
    expect(etat.message).toContain('Plafond');
    expect(etat.depense!.usd).toBeGreaterThan(0);
    const appelsAvant = nbAppels();

    // Passage suivant, même mois : rien n'est dépensé.
    maintenant += 3_600_000;
    expect(await passer()).toBe('plafond');
    expect(nbAppels()).toBe(appelsAvant);

    // Plafond relevé dans les réglages : le traitement reprend et se termine.
    await stockage.ecrire('reglages', [
      { id: 'principal', dossierCours: COURS, dossierAnnales: ANNALES, modeGratuit: false, plafondMensuelUsd: 50 },
    ]);
    maintenant += 3_600_000;
    expect(await passer()).toBe('termine');
    expect(stockage.liste<Fichier>('fichiers').every((f) => f.etat === 'a_jour')).toBe(true);
  });
});

describe('Drives ajoutés par l\'utilisateur', () => {
  const PAUL = 'drive-de-paul-0123456789abcdef';
  const ajouter = (drives: unknown[]) =>
    stockage.ecrire('reglages', [
      {
        id: 'principal',
        dossierCours: `https://drive.google.com/drive/folders/${COURS}`,
        dossierAnnales: `https://drive.google.com/drive/folders/${ANNALES}?usp=sharing`,
        drives,
        modeGratuit: false,
      },
    ]);

  it('lit un Drive nommé, garde son nom sur ses fichiers et ne touche pas aux autres', async () => {
    await ajouter([{ id: 'd1', nom: 'Fiches de Paul', lien: `https://drive.google.com/drive/folders/${PAUL}`, type: 'cours' }]);
    drive.dossiers.set(PAUL, [fichier('f-paul', 'SEMESTRE 1/PNEUMO/Asthme.pdf', COURS_IC.replaceAll('Insuffisance cardiaque', 'Asthme'))]);
    await passer();
    const fichiers = stockage.liste<Fichier>('fichiers');
    expect(fichiers.find((f) => f.id === 'f-paul')).toMatchObject({ role: 'cours', source: 'Fiches de Paul' });
    expect(fichiers.find((f) => f.id === 'f-ic')?.source).toBeUndefined();
  });

  it('un Drive ajouté inaccessible est signalé sans arrêter le passage ni supprimer ses fichiers', async () => {
    await ajouter([{ id: 'd1', nom: 'Fiches de Paul', lien: `https://drive.google.com/drive/folders/${PAUL}`, type: 'cours' }]);
    drive.dossiers.set(PAUL, [fichier('f-paul', 'PNEUMO/Asthme.pdf', COURS_IC)]);
    await passer();
    const lister = drive.lister.bind(drive);
    drive.lister = async (id: string) => {
      if (id === PAUL) throw new Error('403');
      return lister(id);
    };
    maintenant += SEMAINE_MS + 1;
    expect(await passer()).not.toBe('erreur');
    expect(stockage.un<Fichier>('fichiers', 'f-paul')?.etat).not.toBe('supprime');
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.titre.includes('inaccessible'))).toBe(true);
  });
});

describe('pipeline : cours complet et cours ultra complet', () => {
  beforeEach(async () => {
    await passer();
    await approuver();
    maintenant += 3_600_000;
    await passer();
  });

  it('écrit le cours complet de chaque chapitre, avec ses sections', async () => {
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    const cours = stockage.un<CoursDetaille>('cours', `${chapitre.id}:complet`)!;
    expect(cours).toMatchObject({ niveau: 'complet', chapitreId: chapitre.id, version: chapitre.version });
    expect(cours.sections).toHaveLength(3);
    expect(cours.sections[0]!.blocs.map((b) => b.type)).toEqual(['paragraphe', 'pieges']);
    // Pas de cours ultra complet sans demande.
    expect(stockage.un('cours', `${chapitre.id}:ultra`)).toBeUndefined();
  });

  it('ne refait pas le cours complet au passage suivant', async () => {
    const avant = ias.flatMap((ia) => ia.appels).filter((a) => a.etape === 'Cours complet').length;
    maintenant += 3_600_000;
    await passer();
    expect(ias.flatMap((ia) => ia.appels).filter((a) => a.etape === 'Cours complet')).toHaveLength(avant);
  });

  it('écrit le cours ultra complet à la demande', async () => {
    const chapitre = stockage.liste<Chapitre>('chapitres').find((c) => c.titre === 'Insuffisance cardiaque')!;
    await stockage.ecrire('demandes', [
      { id: 'dem-ultra', type: 'cours_ultra', chapitreId: chapitre.id, matiereId: chapitre.matiereId, sujet: chapitre.titre, statut: 'en_attente', creeLe: maintenant, majLe: maintenant } satisfies DemandeDocument,
    ]);
    maintenant += 3_600_000;
    await passer();
    const ultra = stockage.un<CoursDetaille>('cours', `${chapitre.id}:ultra`)!;
    expect(ultra).toMatchObject({ niveau: 'ultra' });
    expect(stockage.un<DemandeDocument>('demandes', 'dem-ultra')?.statut).toBe('terminee');
    expect(ias.flatMap((ia) => ia.appels).some((a) => a.etape === 'Cours ultra complet')).toBe(true);
  });
});
