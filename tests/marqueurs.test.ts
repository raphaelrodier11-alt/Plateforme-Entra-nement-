import { describe, expect, it } from 'vitest';
import {
  estIncontournable,
  etatQuestion,
  etatsQuestions,
  nbPartiels,
  suggererTypeErreur,
} from '../shared/marqueurs';
import { grouperRecurrentes, similarite } from '../shared/recurrence';

const t = (date: number, nbErreurs: number) => ({
  questionId: 'q',
  date,
  nbErreurs,
  points: nbErreurs === 0 ? 1 : nbErreurs === 1 ? 0.5 : 0,
});

describe('questions incontournables', () => {
  it('tombée dans un seul partiel : pas incontournable', () => {
    expect(estIncontournable({ occurrences: [{ partielId: 'p2023' }] })).toBe(false);
    expect(estIncontournable({})).toBe(false);
  });

  it('tombée dans 2 partiels ou plus : incontournable', () => {
    const q = { occurrences: [{ partielId: 'p2022' }, { partielId: 'p2024' }] };
    expect(nbPartiels(q)).toBe(2);
    expect(estIncontournable(q)).toBe(true);
  });

  it('deux fois dans le même partiel ne compte que pour un partiel', () => {
    const q = {
      occurrences: [
        { partielId: 'p2023', numero: '4' },
        { partielId: 'p2023', numero: '31' },
      ],
    };
    expect(estIncontournable(q)).toBe(false);
  });
});

describe('questions récurrentes dans les annales', () => {
  const q1 = 'Concernant l\'insuffisance cardiaque gauche, quelles propositions sont exactes ? dyspnée d\'effort orthopnée œdème pulmonaire';
  const q1bis = 'Parmi les propositions suivantes concernant l\'insuffisance cardiaque gauche, lesquelles sont exactes : orthopnée, dyspnée d\'effort, œdème pulmonaire';
  const q2 = 'Le débit de filtration glomérulaire est estimé par la clairance de la créatinine';

  it('rapproche deux formulations de la même question', () => {
    expect(similarite(q1, q1bis)).toBeGreaterThan(0.72);
    expect(similarite(q1, q2)).toBeLessThan(0.2);
  });

  it('fusionne les occurrences et rend la question incontournable', () => {
    const groupes = grouperRecurrentes([
      { id: 'a', texte: q1, occurrence: { partielId: 'p2022', numero: '3' } },
      { id: 'b', texte: q2, occurrence: { partielId: 'p2022', numero: '4' } },
      { id: 'c', texte: q1bis, occurrence: { partielId: 'p2024', numero: '12' } },
    ]);
    expect(groupes).toHaveLength(2);
    const recurrent = groupes.find((g) => g.ids.includes('a'))!;
    expect(recurrent.ids).toEqual(['a', 'c']);
    expect(estIncontournable(recurrent)).toBe(true);
    expect(estIncontournable(groupes.find((g) => g.ids.includes('b'))!)).toBe(false);
  });
});

describe('questions piégeuses (cumul des erreurs sur toutes les tentatives)', () => {
  it('une seule erreur au total : pas piégeuse', () => {
    const etat = etatQuestion('q', [t(1, 1)]);
    expect(etat.erreursCumulees).toBe(1);
    expect(etat.piegeuse).toBe(false);
  });

  it('2 erreurs dans une même tentative : piégeuse', () => {
    expect(etatQuestion('q', [t(1, 2)]).piegeuse).toBe(true);
  });

  it('deux tentatives à 1 erreur : piégeuse par cumul', () => {
    const etat = etatQuestion('q', [t(1, 1), t(2, 1)]);
    expect(etat.erreursCumulees).toBe(2);
    expect(etat.piegeuse).toBe(true);
  });

  it('une réussite intercalée n\'efface pas le cumul', () => {
    expect(etatQuestion('q', [t(1, 1), t(2, 0), t(3, 1)]).piegeuse).toBe(true);
  });

  it('une question toujours réussie n\'est ni piégeuse ni dans la liste d\'erreurs', () => {
    const etat = etatQuestion('q', [t(1, 0), t(2, 0)]);
    expect(etat).toMatchObject({ piegeuse: false, dansListeErreurs: false, aRevoir: false });
  });
});

describe('liste d\'erreurs et signalement « à revoir »', () => {
  it('une réponse avec erreur fait entrer la question dans la liste', () => {
    expect(etatQuestion('q', [t(1, 1)]).dansListeErreurs).toBe(true);
  });

  it('piégeuse réussie à 100 % : sort de la liste mais reste « à revoir »', () => {
    const etat = etatQuestion('q', [t(1, 3), t(2, 0)]);
    expect(etat).toMatchObject({ piegeuse: true, dansListeErreurs: false, aRevoir: true });
  });

  it('une réussite partielle (1 erreur) ne fait pas sortir de la liste', () => {
    const etat = etatQuestion('q', [t(1, 2), t(2, 1)]);
    expect(etat).toMatchObject({ dansListeErreurs: true, aRevoir: false });
  });

  it('non piégeuse réussie à 100 % : sort de la liste sans signalement', () => {
    const etat = etatQuestion('q', [t(1, 1), t(2, 0)]);
    expect(etat).toMatchObject({ piegeuse: false, dansListeErreurs: false, aRevoir: false });
  });

  it('une nouvelle erreur fait revenir la question dans la liste', () => {
    const etat = etatQuestion('q', [t(1, 2), t(2, 0), t(3, 1)]);
    expect(etat).toMatchObject({ piegeuse: true, dansListeErreurs: true, aRevoir: false });
  });

  it('l\'ordre d\'arrivée des tentatives n\'a pas d\'importance', () => {
    expect(etatQuestion('q', [t(2, 0), t(1, 3)])).toEqual(etatQuestion('q', [t(1, 3), t(2, 0)]));
  });

  it('compte la fréquence d\'erreur et regroupe par question', () => {
    const etats = etatsQuestions([
      { ...t(1, 1), questionId: 'a' },
      { ...t(2, 2), questionId: 'a' },
      { ...t(1, 0), questionId: 'b' },
    ]);
    expect(etats.get('a')).toMatchObject({ nbTentatives: 2, nbEchecs: 2, erreursCumulees: 3 });
    expect(etats.get('b')).toMatchObject({ nbTentatives: 1, nbEchecs: 0 });
  });
});

describe('type d\'erreur proposé', () => {
  it('piège si la question est piégeuse', () => {
    expect(suggererTypeErreur({ question: { piege: true } })).toBe('piege');
    expect(
      suggererTypeErreur({
        question: {},
        etatAvant: { piegeuse: true, nbTentatives: 2, nbEchecs: 2 },
      }),
    ).toBe('piege');
  });

  it('inattention si la question avait déjà été réussie ou si la réponse est très rapide', () => {
    expect(
      suggererTypeErreur({
        question: {},
        etatAvant: { piegeuse: false, nbTentatives: 1, nbEchecs: 0 },
      }),
    ).toBe('inattention');
    expect(suggererTypeErreur({ question: {}, dureeMs: 3000 })).toBe('inattention');
  });

  it('lacune sinon', () => {
    expect(suggererTypeErreur({ question: {}, dureeMs: 40_000 })).toBe('lacune');
  });
});
