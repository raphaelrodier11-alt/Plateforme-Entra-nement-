import { describe, expect, it } from 'vitest';
import { idMatiere, matiereDepuisChemin, nomMatiereLisible, prefixeMatiere } from '../shared/matieres';
import { slug } from '../pipeline/validation';

describe('matières ajoutées à la main', () => {
  it('l’identifiant est celui que l’import créera à partir du dossier', () => {
    for (const nom of ['Cardiologie', 'INFECTIO', 'Génétique médicale', 'BMCT', 'Santé publique / ARC']) {
      expect(idMatiere(nom)).toBe(`m-${slug(nomMatiereLisible(nom))}`);
    }
  });
  it('un fichier envoyé avec le préfixe est rangé dans la bonne matière et le bon semestre', () => {
    const chemin = `${prefixeMatiere('Cardiologie', 5)}Chapitre 3/cours.pdf`;
    expect(matiereDepuisChemin(chemin, true)).toEqual({ nom: 'Cardiologie', semestre: 5 });
  });
  it('un nom avec une barre ne casse pas le chemin', () => {
    expect(matiereDepuisChemin(`${prefixeMatiere('Santé / ARC', 6)}a.pdf`, true)?.semestre).toBe(6);
  });
});
