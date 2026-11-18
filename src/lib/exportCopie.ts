/** Export de la copie (correction d'une série) : Word, PDF, ou texte à copier. */
import { copieEnTexte, type Copie } from '../../shared/copie';
import { sanitiser } from './pdfFiche';

export async function copieEnWord(c: Copie): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');
  const gras = (t: string) => new TextRun({ text: t, bold: true });
  const simple = (t: string, opts: { italique?: boolean; couleur?: string } = {}) => new TextRun({ text: t, italics: opts.italique, color: opts.couleur });
  const enfants: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [simple(c.titre)] }),
  ];
  if (c.matiere) enfants.push(new Paragraph({ children: [simple(c.matiere, { couleur: '666666' })] }));
  enfants.push(new Paragraph({ children: [simple(`Le ${new Date(c.date).toLocaleDateString('fr-FR')}`, { couleur: '666666' })] }));
  if (c.noteSur20 !== undefined) {
    enfants.push(new Paragraph({ spacing: { before: 160, after: 160 }, children: [gras(`Note : ${c.noteSur20.toFixed(1).replace('.', ',')} / 20`), simple(c.points !== undefined ? `   (${c.points} point${c.points > 1 ? 's' : ''} sur ${c.total})` : '')] }));
  }

  for (const q of c.questions) {
    enfants.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320 }, children: [simple(`Question ${q.numero}${q.repondue ? '' : ' (sans réponse)'}`)] }));
    enfants.push(new Paragraph({ children: [gras(q.enonce)] }));
    for (const e of q.elements) {
      const etat = q.type === 'trous'
        ? `${e.saisie ? `ta réponse : ${e.saisie}  -  ` : ''}attendu : ${e.texte}`
        : `${e.juste ? 'JUSTE' : 'FAUX'}${e.coche ? '  -  cochée' : ''}${e.saisie ? `  -  ta réponse : ${e.saisie}` : ''}`;
      const erreur = q.type !== 'trous' && e.juste !== e.coche && q.type !== 'vrai_faux';
      enfants.push(
        new Paragraph({
          indent: { left: 360 },
          children: [
            simple(q.type === 'trous' ? `Trou ${e.repere} : ` : `${e.repere}. ${e.texte}   `),
            new TextRun({ text: etat, bold: true, color: e.juste ? '1E7A3A' : 'B3261E', italics: !e.coche && !e.juste }),
            ...(erreur ? [simple('   (erreur)', { couleur: 'B3261E' })] : []),
          ],
        }),
      );
    }
    if (q.points !== undefined) enfants.push(new Paragraph({ children: [simple(`Points obtenus : ${q.points}`, { italique: true, couleur: '666666' })] }));
    enfants.push(new Paragraph({ spacing: { before: 120 }, children: [gras('Explication : '), simple(q.explication)] }));
    if (q.rappel) enfants.push(new Paragraph({ children: [gras('Rappel de cours : '), simple(q.rappel)] }));
    if (q.profondeur) {
      enfants.push(new Paragraph({ spacing: { before: 120 }, children: [gras('Explication approfondie')] }));
      for (const ligne of q.profondeur.replace(/[*`]+/g, '').split('\n')) {
        if (!ligne.trim()) continue;
        const titre = /^#{1,4}\s+(.*)$/.exec(ligne);
        enfants.push(new Paragraph({ indent: { left: 240 }, children: [titre ? gras(titre[1]!) : simple(ligne.replace(/^\s*[-•]\s+/, '• '))] }));
      }
    }
  }
  enfants.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [simple('Généré par Dr Rodier', { italique: true, couleur: '999999' })] }));

  const doc = new Document({
    creator: 'Dr Rodier',
    title: c.titre,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: enfants }],
  });
  return Packer.toBlob(doc);
}

export async function copieEnPdf(c: Copie): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 18;
  const L = 210 - 2 * M;
  let y = M;
  let page = 1;
  const pied = () => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130);
    doc.text(sanitiser(`Dr Rodier - ${c.titre}`), M, 288);
    doc.text(String(page), 210 - M, 288, { align: 'right' });
  };
  const texte = (t: string, taille: number, opts: { gras?: boolean; couleur?: [number, number, number]; retrait?: number } = {}) => {
    doc.setFont('helvetica', opts.gras ? 'bold' : 'normal').setFontSize(taille).setTextColor(...(opts.couleur ?? [30, 30, 30]));
    const lignes = doc.splitTextToSize(sanitiser(t), L - (opts.retrait ?? 0)) as string[];
    for (const l of lignes) {
      if (y > 276) {
        pied();
        doc.addPage();
        page += 1;
        y = M;
      }
      doc.text(l, M + (opts.retrait ?? 0), y);
      y += taille * 0.4;
    }
    y += 1;
  };
  texte(c.titre, 20, { gras: true });
  if (c.matiere) texte(c.matiere, 11, { couleur: [100, 100, 100] });
  texte(`Le ${new Date(c.date).toLocaleDateString('fr-FR')}`, 10, { couleur: [100, 100, 100] });
  if (c.noteSur20 !== undefined) texte(`Note : ${c.noteSur20.toFixed(1).replace('.', ',')} / 20`, 13, { gras: true });
  for (const q of c.questions) {
    y += 3;
    texte(`Question ${q.numero}${q.repondue ? '' : ' (sans reponse)'}`, 12, { gras: true });
    texte(q.enonce, 10.5, { gras: true });
    for (const e of q.elements) {
      const etat = q.type === 'trous' ? `${e.saisie ? `ta reponse : ${e.saisie} - ` : ''}attendu : ${e.texte}` : `${e.juste ? 'JUSTE' : 'FAUX'}${e.coche ? ' - cochee' : ''}`;
      texte(q.type === 'trous' ? `Trou ${e.repere} : ${etat}` : `${e.repere}. ${e.texte}  [${etat}]`, 10, { retrait: 4, couleur: e.juste ? [30, 122, 58] : [140, 40, 30] });
    }
    texte(`Explication : ${q.explication}`, 10);
    if (q.rappel) texte(`Rappel de cours : ${q.rappel}`, 10, { couleur: [60, 60, 60] });
    if (q.profondeur) texte(`Approfondissement : ${q.profondeur.replace(/[*#`]+/g, '')}`, 9.5, { couleur: [70, 70, 70] });
  }
  pied();
  return doc.output('blob');
}

export const texteDeLaCopie = copieEnTexte;
