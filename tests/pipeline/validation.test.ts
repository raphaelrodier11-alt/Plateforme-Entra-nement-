import { describe, expect, it } from 'vitest';
import { idDossier } from '../../pipeline/drive';
import { natureDe, pagesDepuisTextes, texteSuspect } from '../../pipeline/extraction';
import { choisirModele, decoderJson } from '../../pipeline/ia';
import { nbQuestionsCible, nbQuestionsReserve } from '../../pipeline/import';
import { assemblerTexte, decouperTexte } from '../../pipeline/stockage';
import { Compteur, cout, familleDe, tarifPour } from '../../pipeline/tarifs';
import {
  empreinte,
  slug,
  validerActualisation,
  validerAnnale,
  validerAnomalies,
  validerBloc,
  validerFiche,
  validerLotQuestions,
  validerQuestion,
  validerScene,
} from '../../pipeline/validation';
import type { Question } from '../../shared/types';

const multiple = {
  type: 'multiple',
  enonce: 'Énoncé',
  propositions: [
    { texte: 'a', correcte: true },
    { texte: 'b', correcte: false },
    { texte: 'c', correcte: false },
  ],
  explication: 'Parce que.',
  difficulte: 2,
};

describe('validation des questions générées', () => {
  it('accepte une question complète et numérote les propositions', () => {
    const q = validerQuestion(multiple)!;
    expect(q.propositions!.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(q).toMatchObject({ type: 'multiple', difficulte: 2, piege: false });
  });

  it('refuse une question sans explication', () => {
    expect(validerQuestion({ ...multiple, explication: '' })).toBeUndefined();
    expect(validerQuestion({ ...multiple, explication: undefined })).toBeUndefined();
  });

  it('refuse un choix simple qui n\'a pas exactement une bonne réponse', () => {
    const deux = multiple.propositions.map((p) => ({ ...p, correcte: true }));
    expect(validerQuestion({ ...multiple, type: 'simple', propositions: deux })).toBeUndefined();
    expect(validerQuestion({ ...multiple, type: 'simple' })).toBeDefined();
  });

  it('refuse un choix multiple sans aucune bonne réponse', () => {
    const aucune = multiple.propositions.map((p) => ({ ...p, correcte: false }));
    expect(validerQuestion({ ...multiple, propositions: aucune })).toBeUndefined();
  });

  it('vérifie la cohérence des textes à trous', () => {
    const trous = {
      type: 'trous',
      enonce: 'Le PR normal va de {{1}} à {{2}} seconde.',
      trous: [{ reponses: ['0,12'] }, { reponses: ['0,20', '0,2'] }],
      explication: 'Valeurs normales.',
    };
    expect(validerQuestion(trous)!.trous).toEqual([
      { id: '1', reponses: ['0,12'] },
      { id: '2', reponses: ['0,20', '0,2'] },
    ]);
    // Un trou annoncé dans l'énoncé mais sans réponse : question refusée.
    expect(validerQuestion({ ...trous, trous: [{ reponses: ['0,12'] }] })).toBeUndefined();
    expect(validerQuestion({ ...trous, enonce: 'Sans marqueur.' })).toBeUndefined();
  });

  it('borne la difficulté et ignore les types inconnus', () => {
    expect(validerQuestion({ ...multiple, difficulte: 9 })!.difficulte).toBe(3);
    expect(validerQuestion({ ...multiple, type: 'ouverte' })).toBeUndefined();
  });

  it('détache une question d\'un cas clinique introuvable', () => {
    const { questions, cas } = validerLotQuestions({
      cas: [{ ref: 'k1', titre: 'Cas', vignette: 'Un patient de 60 ans…' }],
      questions: [
        { ...multiple, casRef: 'k1' },
        { ...multiple, enonce: 'Autre', casRef: 'k9' },
      ],
    });
    expect(cas).toHaveLength(1);
    expect(questions.map((q) => q.casRef)).toEqual(['k1', undefined]);
  });
});

describe('validation des annales extraites', () => {
  it('distingue corrigé officiel et corrigé absent', () => {
    const annale = validerAnnale({
      partiel: { libelle: 'Partiel janvier 2024', date: '2024-01' },
      questions: [
        { numero: 3, page: 2, type: 'multiple', enonce: 'Q', propositions: [{ texte: 'a' }, { texte: 'b' }], reponsesCorrectes: ['b'] },
        { numero: '4', type: 'multiple', enonce: 'R', propositions: [{ texte: 'a' }, { texte: 'b' }], reponsesCorrectes: null },
        { type: 'multiple', enonce: '', propositions: [] },
      ],
      illisibles: [{ page: 5, contexte: 'Question 17 illisible' }, { contexte: '' }],
    });
    expect(annale).toMatchObject({ libelle: 'Partiel janvier 2024', date: '2024-01' });
    expect(annale.questions).toHaveLength(2);
    expect(annale.questions[0]).toMatchObject({ numero: '3', page: 2, corrigeOfficiel: true });
    expect(annale.questions[0]!.propositions!.map((p) => p.correcte)).toEqual([false, true]);
    expect(annale.questions[1]).toMatchObject({ corrigeOfficiel: false });
    expect(annale.questions[1]!.propositions!.every((p) => !p.correcte)).toBe(true);
    expect(annale.illisibles).toEqual([{ page: 5, contexte: 'Question 17 illisible' }]);
  });
});

describe('validation des fiches', () => {
  it('écarte les tableaux et les blocs vides, garde les blocs visuels', () => {
    const { sections, resume } = validerFiche(
      {
        resume: 'Résumé',
        sections: [
          {
            titre: 'Démarche',
            blocs: [
              { type: 'tableau', lignes: [] },
              { type: 'liste', elements: [] },
              { type: 'schema', noeuds: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], liens: [{ de: 'a', vers: 'b' }, { de: 'a', vers: 'z' }] },
              { type: 'etapes', etapes: [{ titre: '1', detail: 'x' }, { titre: '2', detail: 'y' }] },
              { type: 'mnemo', phrase: 'KUSMALE', signification: ['Kétoacidose'] },
            ],
          },
          { titre: 'Vide', blocs: [{ type: 'texte', contenu: '' }] },
        ],
      },
      'c-test',
    );
    expect(resume).toBe('Résumé');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.id).toBe('c-test-s1');
    expect(sections[0]!.blocs.map((b) => b.type)).toEqual(['schema', 'etapes', 'mnemo']);
    const schema = sections[0]!.blocs[0]!;
    expect(schema.type === 'schema' && schema.liens).toEqual([{ de: 'a', vers: 'b' }]);
  });

  it('un arbre sans branche n\'est pas un arbre de décision', () => {
    expect(validerBloc({ type: 'arbre', racine: { label: 'Seul' } })).toBeUndefined();
  });

  it('valide une scène 3D et retire les références inconnues', () => {
    const scene = validerScene({
      titre: 'Circulation',
      objets: [
        { id: 'coeur', forme: 'sphere', position: [0, 0, 0], taille: [1], couleur: '#d95926', label: 'Cœur' },
        { id: 'aorte', forme: 'tube', chemin: [[0, 0, 0], [1, 2, 0]], couleur: '#3987e5' },
        { id: 'faux', forme: 'pyramide', position: [0, 0, 0], couleur: '#ffffff' },
        { id: 'sans-couleur', forme: 'boite', position: [0, 0, 0], couleur: 'rouge' },
        { id: 'loin', forme: 'boite', position: [99, 0, 0], couleur: '#ffffff' },
      ],
      etapes: [
        { titre: 'Vue', texte: 'Ensemble', focus: ['coeur', 'inconnu'], flux: [{ tube: 'aorte' }, { tube: 'coeur' }] },
        { titre: 'Éjection', texte: 'Le sang part', camera: [0, 2, 8] },
      ],
    })!;
    expect(scene.objets.map((o) => o.id)).toEqual(['coeur', 'aorte', 'loin']);
    expect(scene.objets[2]!.position).toEqual([8, 0, 0]);
    expect(scene.etapes[0]).toMatchObject({ focus: ['coeur'], flux: [{ tube: 'aorte' }] });
    expect(validerScene({ titre: 'Trop simple', objets: [], etapes: [] })).toBeUndefined();
  });
});

describe('validation des corrections proposées', () => {
  const question: Question = {
    id: 'qa-1',
    matiereId: 'm-cardio',
    chapitreId: 'c-ic',
    type: 'multiple',
    enonce: 'Énoncé',
    propositions: [
      { id: 'A', texte: 'a', correcte: true },
      { id: 'B', texte: 'b', correcte: false },
    ],
    explication: 'x',
    difficulte: 2,
    source: 'annale',
    occurrences: [{ partielId: 'p1', fichierId: 'f-annale', page: 4 }],
    version: 1,
  };
  const contexte = {
    chapitreId: 'c-ic',
    questions: new Map([['q1', question]]),
    chapitres: new Map([['c-ecg', { matiereId: 'm-cardio' }]]),
    fichierCours: { id: 'f-cours', nom: 'IC.pdf' },
    nomsFichiers: new Map([['f-annale', 'Annale 2024.pdf'], ['f-cours', 'IC.pdf']]),
    maintenant: 1000,
  };
  const base = { description: 'Erreur', correction: 'Correction', explication: 'Raison', source: 'Cours, page 3' };

  it('une réponse fausse devient une correction des bonnes réponses, localisée', () => {
    const [a] = validerAnomalies(
      { anomalies: [{ ...base, type: 'contradiction', question: 'q1', bonnesReponses: ['b'] }] },
      contexte,
    );
    expect(a).toMatchObject({
      statut: 'en_attente',
      patch: { op: 'reponses', questionId: 'qa-1', correctes: ['B'] },
      cible: { questionId: 'qa-1', chapitreId: 'c-ic', fichierId: 'f-annale', fichierNom: 'Annale 2024.pdf', page: 4 },
    });
  });

  it('exige une correction exacte, une explication et une source', () => {
    for (const champ of ['correction', 'explication', 'source', 'description'] as const) {
      const anomalies = validerAnomalies(
        { anomalies: [{ ...base, [champ]: '', type: 'faute', question: null }] },
        contexte,
      );
      expect(anomalies).toHaveLength(0);
    }
  });

  it('écarte une « correction » qui ne change rien', () => {
    expect(
      validerAnomalies({ anomalies: [{ ...base, type: 'reponse_fausse', question: 'q1', bonnesReponses: ['A'] }] }, contexte),
    ).toHaveLength(0);
  });

  it('une question mal classée propose un déplacement vers un chapitre existant', () => {
    const [a] = validerAnomalies(
      { anomalies: [{ ...base, type: 'mal_classee', question: 'q1', chapitreCorrect: 'c-ecg' }] },
      contexte,
    );
    expect(a!.patch).toEqual({ op: 'deplacer', questionId: 'qa-1', chapitreId: 'c-ecg', matiereId: 'm-cardio' });
    expect(
      validerAnomalies({ anomalies: [{ ...base, type: 'mal_classee', question: 'q1', chapitreCorrect: 'c-inconnu' }] }, contexte),
    ).toHaveLength(0);
  });

  it('une faute dans le cours devient un erratum daté de sa page', () => {
    const [a] = validerAnomalies({ anomalies: [{ ...base, type: 'faute', question: null, page: 7 }] }, contexte);
    expect(a).toMatchObject({
      patch: { op: 'erratum', chapitreId: 'c-ic', note: 'Page 7 : Correction' },
      cible: { fichierId: 'f-cours', fichierNom: 'IC.pdf', page: 7 },
    });
  });

  it('la même anomalie reçoit toujours le même identifiant', () => {
    const entree = { anomalies: [{ ...base, type: 'faute', question: null }] };
    expect(validerAnomalies(entree, contexte)[0]!.id).toBe(validerAnomalies(entree, contexte)[0]!.id);
  });
});

describe('outils du pipeline', () => {
  it('extrait l\'identifiant d\'un dossier Drive depuis son lien', () => {
    expect(idDossier('https://drive.google.com/drive/folders/1AbC_dEf-GhIjKlMnOp?usp=sharing')).toBe('1AbC_dEf-GhIjKlMnOp');
    expect(idDossier('https://drive.google.com/open?id=1AbC_dEf-GhIjKlMnOp')).toBe('1AbC_dEf-GhIjKlMnOp');
    expect(idDossier('1AbC_dEf-GhIjKlMnOp')).toBe('1AbC_dEf-GhIjKlMnOp');
    expect(idDossier('')).toBeUndefined();
    expect(idDossier('pas un lien')).toBeUndefined();
  });

  it('reconnaît les formats lisibles', () => {
    expect(natureDe('application/pdf')).toBe('pdf');
    expect(natureDe('application/vnd.google-apps.document')).toBe('pdf');
    expect(natureDe('application/vnd.google-apps.presentation')).toBe('pdf');
    expect(natureDe('application/vnd.google-apps.spreadsheet')).toBe('ignore');
    expect(natureDe('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('bureautique');
    expect(natureDe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('bureautique');
    expect(natureDe('image/jpeg')).toBe('image');
    expect(natureDe('video/mp4')).toBe('ignore');
  });

  it('repère les pages sans texte, à faire lire par l\'IA', () => {
    const { pages, pagesAOcr } = pagesDepuisTextes(['Une page avec assez de texte pour être lue directement.', '  ', 'x']);
    expect(pages.map((p) => p.source)).toEqual(['couche', 'vide', 'vide']);
    expect(pagesAOcr).toEqual([2, 3]);
  });

  it('signale un texte lu douteux', () => {
    expect(texteSuspect('Dyspnée d\'effort et orthopnée.')).toBeUndefined();
    expect(texteSuspect('')).toBeUndefined();
    expect(texteSuspect('@@## %% ^^ && ** (( )) __ ++ == ~~')).toBeDefined();
  });

  it('choisit le modèle stable le plus récent de la famille', () => {
    const noms = [
      'models/gemini-2.5-flash',
      'models/gemini-3.8-flash',
      'models/gemini-3.8-flash-lite',
      'models/gemini-4.0-flash-preview',
      'models/gemini-3.8-flash-image',
      'models/gemini-3.5-pro',
      'models/gemini-3.8-pro-preview-11-2026',
      'models/gemini-embedding-001',
    ];
    expect(choisirModele(noms, 'flash')).toBe('gemini-3.8-flash');
    expect(choisirModele(noms, 'pro')).toBe('gemini-3.5-pro');
    // À défaut de version stable, une préversion est retenue.
    expect(choisirModele(['models/gemini-4.0-pro-preview'], 'pro')).toBe('gemini-4.0-pro-preview');
    expect(choisirModele(['models/gemini-embedding-001'], 'pro')).toBeUndefined();
  });

  it('décode un JSON entouré d\'un bloc de code', () => {
    expect(decoderJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(decoderJson(' {"a":1} ')).toEqual({ a: 1 });
    expect(() => decoderJson('pas du json')).toThrow(SyntaxError);
  });

  it('découpe et réassemble le texte d\'un long fichier', () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({ n: i + 1, texte: 'x'.repeat(300_000), source: 'couche' as const }));
    const morceaux = decouperTexte('f1', 'v1', pages, [9]);
    expect(morceaux.length).toBeGreaterThan(1);
    expect(morceaux.map((m) => m.id)).toEqual(['f1', ...morceaux.slice(1).map((_, i) => `f1#${i + 1}`)]);
    const assemble = assemblerTexte([...morceaux].reverse(), 'f1')!;
    expect(assemble.pages.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    expect(assemble.pagesAOcr).toEqual([9]);
    expect(assemblerTexte(morceaux, 'autre')).toBeUndefined();
  });

  it('vise 20 à 50 QCM par cours selon sa longueur', () => {
    expect(nbQuestionsCible(500)).toBe(20);
    expect(nbQuestionsCible(12_000)).toBe(34);
    expect(nbQuestionsCible(200_000)).toBe(50);
    expect(nbQuestionsReserve(20)).toBe(6);
    expect(nbQuestionsReserve(50)).toBe(12);
  });

  it('calcule les coûts et applique les tarifs imposés', () => {
    expect(familleDe('gemini-3.8-flash-lite')).toBe('flash-lite');
    expect(familleDe('gemini-3.8-flash')).toBe('flash');
    expect(familleDe('gemini-3.5-pro')).toBe('pro');

    const defaut = tarifPour('gemini-3.8-flash', 'masse');
    expect(defaut.aVerifier).toBe(true);
    const impose = tarifPour('gemini-3.8-flash', 'masse', [
      { modele: 'masse', entreeUsdParM: 1, sortieUsdParM: 4, aVerifier: false },
    ]);
    expect(impose).toMatchObject({ modele: 'gemini-3.8-flash', entreeUsdParM: 1, sortieUsdParM: 4, aVerifier: false });
    expect(cout(impose, 1_000_000, 500_000)).toBe(3);

    const compteur = new Compteur();
    compteur.ajouter('QCM', impose, 1_000_000, 0);
    compteur.ajouter('QCM', impose, 0, 1_000_000);
    expect(compteur.total).toBe(5);
    expect(compteur.detail).toEqual([
      { etape: 'QCM', modele: 'gemini-3.8-flash', appels: 2, tokensEntree: 1_000_000, tokensSortie: 1_000_000, coutUsd: 5 },
    ]);
  });

  it('fabrique des identifiants stables', () => {
    expect(slug('Équilibre acido-basique : les bases !')).toBe('equilibre-acido-basique-les-bases');
    expect(slug('???')).toBe('sans-titre');
    expect(empreinte('abc')).toBe(empreinte('abc'));
    expect(empreinte('abc')).not.toBe(empreinte('abd'));
  });
});

describe('validation des actualisations', () => {
  it('garde les changements complets, les majeurs en premier', () => {
    const { resume, changements } = validerActualisation({
      identique: false,
      resume: 'Quatre classes au lieu de trois.',
      changements: [
        { type: 'modification', importance: 'mineure', sujet: 'Seuil', avant: '45 %', apres: '40 %', page: 3 },
        { type: 'ajout', importance: 'majeure', sujet: 'SGLT2', avant: null, apres: 'Inhibiteurs de SGLT2.', page: '14' },
        { type: 'retrait', importance: 'inconnue', sujet: 'Ancienne notion', avant: 'Texte retiré.' },
      ],
    });
    expect(resume).toBe('Quatre classes au lieu de trois.');
    expect(changements.map((c) => [c.sujet, c.importance])).toEqual([
      ['SGLT2', 'majeure'],
      ['Seuil', 'mineure'],
      ['Ancienne notion', 'mineure'],
    ]);
    expect(changements[0]).toMatchObject({ type: 'ajout', page: 14, apres: 'Inhibiteurs de SGLT2.' });
    expect(changements[0]).not.toHaveProperty('avant');
  });

  it('écarte les changements sans type, sans sujet ou sans contenu à montrer', () => {
    const { changements } = validerActualisation({
      changements: [
        { type: 'autre', sujet: 'x', avant: 'a' },
        { type: 'ajout', sujet: '', apres: 'a' },
        { type: 'ajout', sujet: 'Vide' },
        { type: 'ajout', sujet: 'Bon', apres: 'a' },
      ],
    });
    expect(changements.map((c) => c.sujet)).toEqual(['Bon']);
  });

  it('une comparaison « identique » ne garde aucun changement', () => {
    expect(validerActualisation({ identique: true, changements: [{ type: 'ajout', sujet: 'x', apres: 'a' }] })).toEqual({
      resume: 'Aucun changement de fond.',
      changements: [],
    });
  });

  it('limite à 40 changements', () => {
    const beaucoup = Array.from({ length: 60 }, (_, i) => ({ type: 'ajout', importance: 'mineure', sujet: `s${i}`, apres: 'a' }));
    expect(validerActualisation({ changements: beaucoup }).changements).toHaveLength(40);
  });
});
