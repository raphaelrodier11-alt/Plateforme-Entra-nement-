import { describe, expect, it } from 'vitest';
import { genererPdfFiches, nomDeFichier, sanitiser } from '../src/lib/pdfFiche';
import type { Fiche } from '../shared/types';

const fiche = (id: string, nbPoints = 3): Fiche => ({
  id, chapitreId: id, matiereId: 'm1', titre: `Insuffisance cardiaque ${id}`, version: 1, genereLe: 0,
  sections: [
    { id: 's1', titre: 'Définition et classification', blocs: [
      { type: 'texte', contenu: 'Syndrome clinique dû à une anomalie cardiaque. Débit ≤ besoins : état d’équilibre précaire.' },
      { type: 'cles', elements: ['Fraction d’éjection ≤ 40 % : réduite', 'Dyspnée d’effort'] },
      { type: 'pieges', elements: ['Ne pas confondre dyspnée et orthopnée'] },
      { type: 'liste', titre: 'Signes gauches', elements: Array.from({ length: nbPoints }, (_, i) => `Signe numéro ${i} avec une phrase assez longue pour passer à la ligne dans la page A4 du document`) },
    ] },
    { id: 's2', titre: 'Conduite à tenir', blocs: [
      { type: 'etapes', titre: 'Pas à pas', etapes: [{ titre: 'Évaluer', detail: 'Clinique et BNP' }, { titre: 'Traiter', detail: 'Diurétiques, IEC' }] },
      { type: 'arbre', titre: 'Décision', racine: { label: 'Dyspnée aiguë', branches: [{ condition: 'OAP', noeud: { label: 'Diurétiques IV' } }] } },
      { type: 'schema', titre: 'Mécanisme', noeuds: [{ id: 'a', label: 'Baisse du débit' }, { id: 'b', label: 'Activation neuro-hormonale', detail: 'SRAA' }], liens: [{ de: 'a', vers: 'b', label: 'compensation' }] },
      { type: 'mnemo', phrase: 'DOUCE', signification: ['Dyspnée', 'Orthopnée'] },
    ] },
  ],
});

async function texte(blob: Blob): Promise<{ pages: string[]; nb: number }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
  const { text } = await extractText(doc, { mergePages: false });
  return { pages: text, nb: text.length };
}

describe('PDF des fiches', () => {
  it('produit un vrai PDF avec titres, accents et tous les types de blocs', async () => {
    const blob = await genererPdfFiches([fiche('c1')], { titre: 'Cardiologie', sousTitre: 'Semestre 1' });
    expect(blob.type).toBe('application/pdf');
    const { pages } = await texte(blob);
    const tout = pages.join('\n');
    expect(tout).toContain('Cardiologie');
    expect(tout).toContain('Définition et classification');
    expect(tout).toContain('Pièges classiques');
    expect(tout).toContain('Évaluer');
    expect(tout).toContain('Dyspnée aiguë');
    expect(tout).toContain('Activation neuro-hormonale');
    expect(tout).toContain('DOUCE');
    // Les symboles que la police ne sait pas écrire sont remplacés lisiblement.
    expect(tout).toContain('<= 40');
  });

  it('coupe en plusieurs pages, une fiche par page, avec numérotation', async () => {
    const blob = await genererPdfFiches([fiche('c1', 60), fiche('c2'), fiche('c3')], { titre: 'Matière' });
    const { nb, pages } = await texte(blob);
    expect(nb).toBeGreaterThanOrEqual(4);
    expect(pages.at(-1)).toContain('Dr Rodier');
  });

  it('nettoie le texte et nomme le fichier proprement', () => {
    expect(sanitiser('α et β ≥ 3 → ok')).toBe('alpha et beta >= 3 -> ok');
    expect(sanitiser('**gras** 😀')).toBe('gras ?');
    expect(sanitiser('cœur et sœur')).toBe('coeur et soeur');
    expect(nomDeFichier('Appareil cardiovasculaire (S1)')).toBe('Appareil-cardiovasculaire-S1.pdf');
  });
});
