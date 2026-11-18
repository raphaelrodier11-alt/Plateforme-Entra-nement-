import { describe, expect, it } from 'vitest';
import { copieEnTexte, elementsDeQuestion, type Copie } from '../shared/copie';
import { copieEnPdf, copieEnWord } from '../src/lib/exportCopie';
import type { Question } from '../shared/types';

const q: Question = {
  id: 'q1', matiereId: 'm1', chapitreId: 'c1', type: 'multiple', enonce: 'Quels sont les signes gauches ?', explication: 'Orthopnée et crépitants.', difficulte: 2, source: 'genere', version: 1,
  propositions: [{ id: 'a', texte: 'Orthopnée', correcte: true }, { id: 'b', texte: 'Turgescence jugulaire', correcte: false }, { id: 'c', texte: 'Crépitants', correcte: true }],
};

const copie = (): Copie => ({
  titre: 'Série de cardiologie', matiere: 'Cardiologie', date: Date.UTC(2026, 10, 18), noteSur20: 12.5, points: 5, total: 8,
  questions: [{ numero: 1, type: 'multiple', enonce: q.enonce, elements: elementsDeQuestion(q, { cochees: ['a', 'b'] }), points: 0.5, nbErreurs: 2, repondue: true, explication: q.explication, rappel: 'Signes gauches : poumon.', profondeur: '## Analyse\n- **A. vraie** : parce que' }],
});

describe('ma copie', () => {
  it('marque les bonnes réponses et celles que tu as cochées', () => {
    const e = elementsDeQuestion(q, { cochees: ['a', 'b'] });
    expect(e.map((x) => [x.repere, x.juste, x.coche])).toEqual([['A', true, true], ['B', false, true], ['C', true, false]]);
  });
  it('gère le vrai/faux et les trous', () => {
    const vf: Question = { ...q, type: 'vrai_faux' };
    expect(elementsDeQuestion(vf, { jugements: { a: true, b: false } }).map((x) => [x.coche, x.saisie])).toEqual([[true, 'vrai'], [false, 'faux'], [false, undefined]]);
    const tr: Question = { ...q, type: 'trous', propositions: undefined, trous: [{ id: 't1', reponses: ['40'] }] };
    expect(elementsDeQuestion(tr, { textes: { t1: '45' } })[0]).toMatchObject({ texte: '40', saisie: '45' });
  });
  it('produit un texte lisible à coller', () => {
    const t = copieEnTexte(copie());
    expect(t).toContain('Note : 12,5 / 20');
    expect(t).toContain('A. Orthopnée  [JUSTE] [COCHÉE]');
    expect(t).toContain('B. Turgescence jugulaire  [FAUX] [COCHÉE]');
    expect(t).toContain('Explication approfondie');
  });
  it('génère un vrai fichier Word contenant la correction', async () => {
    const blob = await copieEnWord(copie());
    const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js');
    const lecteur = new ZipReader(new BlobReader(blob));
    const entree = (await lecteur.getEntries()).find((e) => e.filename === 'word/document.xml')!;
    const xml = await entree.getData!(new TextWriter());
    await lecteur.close();
    expect(xml).toContain('Série de cardiologie');
    expect(xml).toContain('Turgescence jugulaire');
    expect(xml).toContain('Explication approfondie');
  });
  it('génère un PDF lisible', async () => {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const blob = await copieEnPdf(copie());
    const doc = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
    const { text } = await extractText(doc, { mergePages: true });
    expect(text).toContain('Question 1');
    expect(text).toContain('Orthopn');
  });
});
