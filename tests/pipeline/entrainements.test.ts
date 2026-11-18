import { describe, expect, it } from 'vitest';
import type { Chapitre, Entrainement, Fichier, Matiere, NotificationApp, Question } from '../../shared/types';
import type { DemandeIa, Ia } from '../../pipeline/ia';
import { executer } from '../../pipeline/orchestrateur';
import { decouperTexte } from '../../pipeline/stockage';
import { Compteur, tarifPour } from '../../pipeline/tarifs';
import { StockageMemoire, lireTest } from './aide';

const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const TEXTE = (t: string) => `${t}. ${'Contenu du cours assez long pour être lu comme du texte. '.repeat(6)}`;

async function monter(regles: Partial<Entrainement['regles']> = {}, nombre = 10) {
  const stockage = new StockageMemoire();
  stockage.jeton = undefined;
  await stockage.ecrire('reglages', [{ id: 'principal' }]);
  await stockage.ecrire<Matiere>('matieres', [{ id: 'm1', nom: 'Cardiologie', ordre: 1 }]);
  for (const [i, titre] of ['Insuffisance cardiaque', 'Valvulopathies'].entries()) {
    const fid = `f${i}`;
    await stockage.ecrire<Chapitre>('chapitres', [{ id: `c${i}`, matiereId: 'm1', titre, ordre: i, fichierIds: [fid], version: 1 }]);
    await stockage.ecrire<Fichier>('fichiers', [{ id: fid, nom: `${titre}.pdf`, chemin: `${titre}.pdf`, mimeType: 'application/pdf', role: 'cours', etat: 'a_jour', modifieLe: '2026-11-01T00:00:00Z' }]);
    await stockage.ecrire('textes', decouperTexte(fid, '2026-11-01T00:00:00Z', [{ n: 1, texte: TEXTE(titre), source: 'couche' }], []));
  }
  const e: Entrainement = {
    id: 'entr-0001-abcdefgh', titre: 'Mon QCM piège', statut: 'en_attente', questionIds: [], creeLe: T0, majLe: T0,
    regles: { chapitreIds: [], types: [], casCliniques: false, difficulte: 'mixte', pieges: true, nombre, ...regles },
  };
  await stockage.ecrire<Entrainement>('entrainements', [e]);
  return stockage;
}

/** Fausse IA : écrit autant de questions qu'on lui en demande, toutes différentes. */
function fausseIa(): Ia & { consignes: string[] } {
  const consignes: string[] = [];
  let k = 0;
  return {
    consignes,
    modeles: { masse: 'm', expert: 'e' },
    tarifs: { masse: tarifPour('m', 'masse'), expert: tarifPour('e', 'expert') },
    compteur: new Compteur(),
    async json(d: DemandeIa) {
      consignes.push(d.consigne);
      const n = Number(/Écris (\d+) questions/.exec(d.consigne)?.[1] ?? 1);
      return {
        cas: [],
        questions: Array.from({ length: n }, () => {
          k += 1;
          return {
            type: /UNIQUEMENT ces types : "simple"/.test(d.consigne) ? 'simple' : 'multiple',
            enonce: `Question numéro ${k} sur un sujet particulier ${'x'.repeat(k % 7)} ${k * 37}`,
            propositions: [{ texte: `Bonne réponse ${k}`, correcte: true }, { texte: `Mauvaise ${k} a`, correcte: false }, { texte: `Mauvaise ${k} b`, correcte: false }, { texte: `Mauvaise ${k} c`, correcte: false }],
            explication: 'Parce que le cours le dit, et pour une raison claire.', rappel: 'À relire.', difficulte: 2, piege: true, casRef: null, section: null,
          };
        }),
      };
    },
  };
}

const passer = (stockage: StockageMemoire, ia: Ia) =>
  executer({ stockage, creerDrive: () => { throw new Error('pas de drive'); }, creerIa: async () => ia, lire: lireTest, mode: 'auto', budgetMinutes: 10, maintenant: T0 + 60_000 });

describe('entraînements sur mesure', () => {
  it('crée le nombre de questions demandé, réparti sur les chapitres, et prévient', async () => {
    const stockage = await monter({ types: ['simple'] }, 10);
    const ia = fausseIa();
    await passer(stockage, ia);
    const e = stockage.un<Entrainement>('entrainements', 'entr-0001-abcdefgh')!;
    expect(e.statut).toBe('pret');
    expect(e.questionIds).toHaveLength(10);
    const questions = stockage.liste<Question>('questionsPerso');
    expect(questions).toHaveLength(10);
    expect(questions.every((q) => q.perso && q.type === 'simple' && q.entrainementId === e.id)).toBe(true);
    expect(questions.filter((q) => q.chapitreId === 'c0')).toHaveLength(5);
    expect(questions.filter((q) => q.chapitreId === 'c1')).toHaveLength(5);
    expect(stockage.liste<NotificationApp>('notifications').some((n) => n.titre.includes('prêt'))).toBe(true);
  });

  it('transmet les règles et les consignes libres à l’IA', async () => {
    const stockage = await monter({ difficulte: 'difficile', pieges: true, consignes: 'Insiste sur la classification NYHA' }, 4);
    const ia = fausseIa();
    await passer(stockage, ia);
    expect(ia.consignes[0]).toContain('70 % de difficulte 3');
    expect(ia.consignes[0]).toContain('60 % des questions reposent sur un piège');
    expect(ia.consignes[0]).toContain('Insiste sur la classification NYHA');
  });

  it('gère de grands volumes par lots, sans doublon', async () => {
    const stockage = await monter({}, 120);
    const ia = fausseIa();
    await passer(stockage, ia);
    expect(stockage.liste<Question>('questionsPerso')).toHaveLength(120);
    expect(ia.consignes.length).toBeGreaterThanOrEqual(8);
  });

  it('reprend où il en était quand la limite gratuite est atteinte', async () => {
    const stockage = await monter({}, 30);
    const ia = fausseIa();
    const base = ia.json.bind(ia);
    let appels = 0;
    ia.json = async (d) => {
      if (++appels === 3) throw Object.assign(new Error('quota'), { name: 'QuotaAtteint' });
      return base(d);
    };
    await passer(stockage, ia);
    const e1 = stockage.un<Entrainement>('entrainements', 'entr-0001-abcdefgh')!;
    expect(e1.statut).toBe('en_attente');
    expect(e1.questionIds.length).toBeLessThan(30);
    expect(stockage.liste<Question>('questionsPerso').length).toBeGreaterThan(0);
    // Passage suivant : l'entraînement s'achève.
    await passer(stockage, fausseIa());
    expect(stockage.un<Entrainement>('entrainements', 'entr-0001-abcdefgh')!.statut).toBe('pret');
  });

  it('signale quand aucun cours n’est prêt', async () => {
    const stockage = await monter();
    await stockage.supprimer('textes', stockage.liste<{ id: string }>('textes').map((t) => t.id));
    await passer(stockage, fausseIa());
    expect(stockage.un<Entrainement>('entrainements', 'entr-0001-abcdefgh')!.statut).toBe('erreur');
  });
});
