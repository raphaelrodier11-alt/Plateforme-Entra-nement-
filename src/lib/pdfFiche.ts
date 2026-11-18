/**
 * Fiches de révision en vrai fichier PDF (A4), générées sur l'appareil : mise
 * en page identique partout, partageable, imprimable. Les arbres, schémas et
 * étapes sont mis à plat en listes lisibles ; les scènes 3D renvoient à l'appli.
 */
import type { jsPDF as JsPdf } from 'jspdf';
import type { BlocFiche, Fiche, NoeudArbre } from '../../shared/types';

export interface OptionsPdf {
  titre: string;
  sousTitre?: string;
  /** Couleur d'accent [r, g, b] (celle de la matière). */
  couleur?: [number, number, number];
}

const MARGE = 18;
const LARGEUR = 210;
const HAUTEUR = 297;
const UTILE = LARGEUR - 2 * MARGE;

/** Remplace ce que les polices standard d'un PDF ne savent pas écrire. */
export function sanitiser(texte: string): string {
  return texte
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->')
    .replace(/↑/g, '(hausse)').replace(/↓/g, '(baisse)').replace(/≈/g, '~').replace(/≠/g, '!=').replace(/±/g, '+/-')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/α/g, 'alpha').replace(/β/g, 'beta').replace(/γ/g, 'gamma').replace(/δ/g, 'delta').replace(/κ/g, 'kappa')
    .replace(/λ/g, 'lambda').replace(/μ/g, 'µ').replace(/Δ/g, 'Delta').replace(/Σ/g, 'Sigma').replace(/π/g, 'pi')
    .replace(/[‐‑‒]/g, '-').replace(/[   ]/g, ' ').replace(/[✓✔]/g, 'v').replace(/[✗✘]/g, 'x')
    .replace(/\*\*/g, '')
    // Ce qui reste hors de l'alphabet latin étendu devient « ? » plutôt que du charabia.
    .replace(/[^ -~ -ÿ–—‘’“”•…€™\n]/gu, '?');
}

function resumeArbre(n: NoeudArbre, niveau = 0): string[] {
  const lignes = [`${'   '.repeat(niveau)}${niveau === 0 ? '' : '-> '}${n.label}${n.detail ? ` : ${n.detail}` : ''}`];
  for (const b of n.branches ?? []) {
    lignes.push(`${'   '.repeat(niveau + 1)}Si ${b.condition} :`);
    lignes.push(...resumeArbre(b.noeud, niveau + 2));
  }
  return lignes;
}

export async function genererPdfFiches(fiches: Fiche[], options: OptionsPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const [r, g, b] = options.couleur ?? [57, 135, 229];
  let y = MARGE;
  let page = 1;

  const pied = () => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130);
    doc.text(sanitiser(`Dr Rodier - ${options.titre}`), MARGE, HAUTEUR - 9);
    doc.text(String(page), LARGEUR - MARGE, HAUTEUR - 9, { align: 'right' });
  };
  const nouvellePage = () => {
    pied();
    doc.addPage();
    page += 1;
    y = MARGE;
  };
  const place = (hauteur: number) => {
    if (y + hauteur > HAUTEUR - 18) nouvellePage();
  };
  const ecrire = (texte: string, taille: number, opts: { gras?: boolean; italique?: boolean; couleur?: number; retrait?: number; interligne?: number } = {}) => {
    doc.setFont('helvetica', opts.gras ? 'bold' : opts.italique ? 'italic' : 'normal').setFontSize(taille).setTextColor(opts.couleur ?? 30);
    const retrait = opts.retrait ?? 0;
    const lignes = doc.splitTextToSize(sanitiser(texte), UTILE - retrait) as string[];
    const pas = (opts.interligne ?? 1.3) * taille * 0.3528;
    for (const l of lignes) {
      place(pas);
      doc.text(l, MARGE + retrait, y + taille * 0.3528 * 0.8);
      y += pas;
    }
  };
  const puces = (elements: string[], retrait = 4) => {
    for (const e of elements) {
      const lignes = doc.splitTextToSize(sanitiser(e), UTILE - retrait - 4) as string[];
      place(lignes.length * 5);
      doc.setFillColor(r, g, b).circle(MARGE + retrait + 0.8, y + 2.4, 0.7, 'F');
      ecrire(e, 10, { retrait: retrait + 4 });
      y += 0.8;
    }
  };
  const encadre = (titre: string, fond: [number, number, number], bord: [number, number, number], contenu: () => void) => {
    place(22);
    const debut = y;
    y += 2.5;
    ecrire(titre, 10, { gras: true, retrait: 3, couleur: 40 });
    y += 0.8;
    contenu();
    y += 1.5;
    // Le fond est dessiné après coup, puis le texte repassé dessus : on garde donc une boîte simple (liseré).
    doc.setDrawColor(...bord).setLineWidth(0.5).line(MARGE, debut, MARGE, y);
    void fond;
  };

  // --- Page de titre -------------------------------------------------------
  doc.setFillColor(r, g, b).rect(0, 0, LARGEUR, 4, 'F');
  y = 26;
  ecrire(options.titre, 24, { gras: true, couleur: 20, interligne: 1.2 });
  if (options.sousTitre) {
    y += 1;
    ecrire(options.sousTitre, 12, { couleur: 90 });
  }
  y += 3;
  ecrire(`${fiches.length} fiche${fiches.length > 1 ? 's' : ''} de révision - générées le ${new Date().toLocaleDateString('fr-FR')}`, 9, { italique: true, couleur: 120 });
  y += 6;

  fiches.forEach((fiche, indice) => {
    if (indice > 0) nouvellePage();
    else place(30);
    doc.setFillColor(r, g, b).rect(MARGE, y, UTILE, 0.8, 'F');
    y += 4;
    ecrire(fiche.titre, 17, { gras: true, couleur: 20 });
    y += 3;

    for (const section of fiche.sections) {
      place(24);
      y += 2;
      doc.setFillColor(r, g, b).rect(MARGE, y, 1.6, 6, 'F');
      ecrire(section.titre, 12.5, { gras: true, retrait: 4, couleur: 30 });
      y += 1.5;
      for (const bloc of section.blocs) blocEnPdf(bloc);
      y += 2;
    }
  });

  function blocEnPdf(bloc: BlocFiche): void {
    switch (bloc.type) {
      case 'texte':
        ecrire(bloc.contenu, 10, { couleur: 55 });
        y += 1.5;
        break;
      case 'liste':
        if (bloc.titre) ecrire(bloc.titre, 10, { gras: true });
        puces(bloc.elements);
        y += 1;
        break;
      case 'cles':
        encadre('A retenir', [232, 241, 253], [r, g, b], () => puces(bloc.elements, 5));
        break;
      case 'pieges':
        encadre('Pièges classiques', [253, 244, 225], [217, 150, 0], () => puces(bloc.elements, 5));
        break;
      case 'etapes':
        if (bloc.titre) ecrire(bloc.titre, 10, { gras: true });
        bloc.etapes.forEach((e, i) => {
          ecrire(`${i + 1}. ${e.titre}`, 10, { gras: true, retrait: 2 });
          ecrire(e.detail, 10, { retrait: 6, couleur: 60 });
        });
        y += 1;
        break;
      case 'arbre':
        ecrire(bloc.titre ?? 'Arbre de décision', 10, { gras: true });
        for (const l of resumeArbre(bloc.racine)) ecrire(l.replace(/^ +/, (m) => m), 9.5, { retrait: 2, couleur: 55 });
        y += 1;
        break;
      case 'schema': {
        ecrire(bloc.titre ?? 'Schéma', 10, { gras: true });
        puces(bloc.noeuds.map((n) => `${n.label}${n.detail ? ` : ${n.detail}` : ''}`));
        const nom = new Map(bloc.noeuds.map((n) => [n.id, n.label]));
        if (bloc.liens.length) {
          ecrire(bloc.liens.map((l) => `${nom.get(l.de) ?? l.de} -> ${nom.get(l.vers) ?? l.vers}${l.label ? ` (${l.label})` : ''}`).join('   |   '), 9, { italique: true, couleur: 100, retrait: 2 });
        }
        y += 1;
        break;
      }
      case 'mnemo':
        ecrire(`Mnémo : ${bloc.phrase}`, 11, { gras: true, couleur: 40 });
        puces(bloc.signification);
        y += 1;
        break;
      case 'scene3d':
        ecrire(`Animation 3D : ${bloc.scene.titre} (à voir dans l'application)`, 9.5, { italique: true, couleur: 110 });
        y += 1;
        break;
    }
  }

  pied();
  return doc.output('blob');
}

/** Télécharge un PDF (ou l'ouvre dans un nouvel onglet quand le navigateur ne sait pas télécharger). */
export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const nomDeFichier = (titre: string): string =>
  `${titre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fiches'}.pdf`;
