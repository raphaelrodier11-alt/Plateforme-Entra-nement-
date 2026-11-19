/**
 * Cours détaillés : le « cours complet » (le cours du drive remis au propre,
 * annoté, illustré) est écrit pour chaque chapitre, et le « cours ultra complet »
 * (beaucoup plus loin) à la demande de l'étudiant.
 */
import type { Chapitre, CoursDetaille, DemandeDocument, NiveauCours, Question } from '../shared/types';
import { estArret, iaRequise, notifier, tempsEcoule, CHAPITRES_EN_PARALLELE, enParallele, type Contexte } from './contexte';
import { coursDuChapitre } from './generation';
import { illustrerSections, mediasUtilises, type FigureSource } from './illustrations';
import type { Piece } from './ia';
import { erreurPublique, journal } from './journal';
import { SYSTEME, consigneCours } from './prompts';
import { ressourcesDuChapitre } from './ressources';
import type { Memoire } from './stockage';
import { signature, validerFiche } from './validation';

export const idCours = (chapitreId: string, niveau: NiveauCours): string => `${chapitreId}:${niveau}`;

/** Chapitres dont le cours complet manque ou est périmé (le chapitre a changé depuis). */
export function chapitresSansCours(memoire: Memoire): Chapitre[] {
  return memoire
    .liste<Chapitre>('chapitres')
    .filter((x) => !x.aGenerer && x.version > 0 && memoire.lire('fiches', x.id))
    .filter((x) => {
      const cours = memoire.lire<CoursDetaille>('cours', idCours(x.id, 'complet'));
      return !cours || cours.version < x.version;
    });
}

interface RedactionCours {
  chapitre: Chapitre;
  niveau: NiveauCours;
  figures: FigureSource[];
  pieces: Piece[];
  /** Figures du chapitre à mémoriser dans le document (pour le cours ultra complet). */
  pool?: CoursDetaille['figures'];
}

async function ecrireCours(c: Contexte, r: RedactionCours): Promise<number> {
  const ia = iaRequise(c);
  const { chapitre, niveau } = r;
  const { texte } = coursDuChapitre(c, chapitre);
  if (!texte) throw new Error('Cours vide');
  const annales = c.memoire
    .liste<Question>('questions')
    .filter((q) => q.chapitreId === chapitre.id && q.source === 'annale')
    .map((q) => signature(q));
  const brut = await ia.json({
    niveau: 'masse',
    etape: niveau === 'complet' ? 'Cours complet' : 'Cours ultra complet',
    systeme: SYSTEME,
    consigne: consigneCours(niveau, chapitre.titre, texte, annales),
    pieces: r.pieces,
    maxSortie: 60_000,
  });
  const { sections: redigees, indications } = validerFiche(brut, `${chapitre.id}-${niveau}`);
  if (redigees.length < 3) throw new Error('Cours trop court');
  const sections = await illustrerSections(redigees, indications, r.figures);
  const utilises = mediasUtilises(sections);
  // Seules les figures qui ont une image (cours complet) sont écrites ; l'ultra réutilise celles du complet.
  await c.memoire.ecrire('medias', ...r.figures.filter((f) => utilises.has(f.media.id) && f.media.donnees).map((f) => f.media));
  const complet = c.memoire.lire<CoursDetaille>('cours', idCours(chapitre.id, 'complet'));
  await c.memoire.ecrire<CoursDetaille>('cours', {
    id: idCours(chapitre.id, niveau),
    chapitreId: chapitre.id,
    matiereId: chapitre.matiereId,
    niveau,
    titre: chapitre.titre,
    sections,
    version: chapitre.version,
    genereLe: c.maintenant,
    ...((r.pool ?? complet?.figures)?.length ? { figures: r.pool ?? complet?.figures } : {}),
  });
  return sections.length;
}

/** Écrit le cours complet des chapitres qui n'en ont pas encore (avec les figures de leurs PDF). */
export async function completerCours(c: Contexte): Promise<void> {
  iaRequise(c);
  await enParallele(chapitresSansCours(c.memoire), CHAPITRES_EN_PARALLELE, async (chapitre) => {
    if (tempsEcoule(c)) return;
    const { fichiers, complet, texte } = coursDuChapitre(c, chapitre);
    if (!complet || !texte) return;
    try {
      const { pieces, figures } = await ressourcesDuChapitre(c, fichiers);
      const pool = figures.map((f) => ({ mediaId: f.media.id, page: f.page, fichier: f.fichier }));
      const n = await ecrireCours(c, { chapitre, niveau: 'complet', figures, pieces, pool });
      journal(`Cours complet : ${n} sections`);
      await notifier(c, {
        id: `cours:${chapitre.id}:${chapitre.version}`,
        type: 'generation',
        titre: 'Cours complet prêt',
        message: `« ${chapitre.titre} » : cours complet illustré disponible.`,
        chapitreId: chapitre.id,
      });
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Cours complet en échec : ${erreurPublique(erreur)}`);
    }
  });
}

export const demandesCoursUltra = (memoire: Memoire, maintenant: number): DemandeDocument[] =>
  memoire
    .liste<DemandeDocument>('demandes')
    .filter((d) => d.type === 'cours_ultra' && (d.statut === 'en_attente' || (d.statut === 'en_cours' && maintenant - d.majLe > 2 * 3_600_000)))
    .sort((a, b) => a.creeLe - b.creeLe);

/** Cours ultra complets demandés dans l'app (texte seul : les figures sont celles du cours complet). */
export async function traiterCoursUltra(c: Contexte): Promise<number> {
  let faits = 0;
  for (const demande of demandesCoursUltra(c.memoire, c.maintenant)) {
    const chapitre = demande.chapitreId ? c.memoire.lire<Chapitre>('chapitres', demande.chapitreId) : undefined;
    const maj = (statut: DemandeDocument['statut'], message?: string) =>
      c.memoire.ecrire<DemandeDocument>('demandes', { ...demande, statut, majLe: Date.now(), message });
    if (!chapitre) {
      await maj('erreur', 'Chapitre introuvable.');
      continue;
    }
    await maj('en_cours');
    try {
      const pool = c.memoire.lire<CoursDetaille>('cours', idCours(chapitre.id, 'complet'))?.figures ?? [];
      const figures: FigureSource[] = pool.map((f) => ({
        page: f.page,
        fichier: f.fichier,
        media: { id: f.mediaId, mimeType: 'image/webp', donnees: '', largeur: 0, hauteur: 0 },
      }));
      const n = await ecrireCours(c, { chapitre, niveau: 'ultra', figures, pieces: [] });
      await c.memoire.ecrire<DemandeDocument>('demandes', { ...demande, statut: 'terminee', documentId: idCours(chapitre.id, 'ultra'), majLe: Date.now(), message: undefined });
      await notifier(c, {
        id: `cours-ultra:${chapitre.id}:${Date.now()}`,
        type: 'generation',
        titre: 'Cours ultra complet prêt',
        message: `« ${chapitre.titre} » : ${n} sections, beaucoup plus détaillées.`,
        chapitreId: chapitre.id,
      });
      faits++;
    } catch (erreur) {
      if (estArret(erreur)) {
        await c.memoire.ecrire<DemandeDocument>('demandes', { ...demande, statut: 'en_attente', majLe: c.maintenant });
        throw erreur;
      }
      journal(`Cours ultra complet en échec : ${erreurPublique(erreur)}`);
      await maj('erreur', 'La rédaction a échoué. Réessaie dans quelques minutes.');
    }
  }
  return faits;
}
