/**
 * Documents demandés dans l'app et trop longs pour être faits sur le moment
 * (grosses séries de QCM, fiches complètes) : le pipeline les rédige en
 * arrière-plan et les range dans la bibliothèque.
 *
 * Ces demandes passent AVANT l'import, pour ne pas attendre sa fin.
 */
import { LIBELLE_TYPE_DOCUMENT, systemeDocument } from '../shared/assistant';
import type { DemandeDocument, DocumentBiblio, Matiere } from '../shared/types';
import { estArret } from './contexte';
import type { Ia } from './ia';
import { journal } from './journal';
import type { Memoire } from './stockage';

/** Une demande « en cours » depuis plus longtemps est considérée comme interrompue. */
const DELAI_REPRISE_MS = 2 * 3_600_000;
const TAILLE_MAX = 60_000;

export function demandesATraiter(memoire: Memoire, maintenant: number): DemandeDocument[] {
  return memoire
    .liste<DemandeDocument>('demandes')
    .filter((d) => d.type !== 'cours_ultra')
    .filter((d) => d.statut === 'en_attente' || (d.statut === 'en_cours' && maintenant - d.majLe > DELAI_REPRISE_MS))
    .sort((a, b) => a.creeLe - b.creeLe);
}

/** Les tableaux ne sont jamais autorisés : toute ligne de tableau devient une liste. */
export function sansTableaux(texte: string): string {
  return texte
    .split('\n')
    .filter((l) => !/^\s*\|?[\s:|-]{3,}\|?\s*$/.test(l) || !l.includes('-'))
    .map((l) => {
      const m = /^\s*\|(.+)\|\s*$/.exec(l);
      return m ? `- ${m[1]!.split('|').map((c) => c.trim()).filter(Boolean).join(' — ')}` : l;
    })
    .join('\n');
}

export function lireReponse(brut: unknown): { titre: string; contenu: string } | undefined {
  if (!brut || typeof brut !== 'object') return undefined;
  const { titre, contenu } = brut as Record<string, unknown>;
  if (typeof contenu !== 'string' || contenu.trim().length < 40) return undefined;
  return {
    titre: typeof titre === 'string' && titre.trim() ? titre.trim().slice(0, 120) : 'Document',
    contenu: sansTableaux(contenu.trim().slice(0, TAILLE_MAX)),
  };
}

/** Traite les demandes en attente ; renvoie leur nombre. Relance l'arrêt (quota, plafond) tel quel. */
export async function traiterDemandes(memoire: Memoire, ia: Ia, maintenant: number): Promise<number> {
  const matieres = new Map(memoire.liste<Matiere>('matieres').map((m) => [m.id, m.nom]));
  let faites = 0;
  for (const demande of demandesATraiter(memoire, maintenant)) {
    await memoire.ecrire<DemandeDocument>('demandes', { ...demande, statut: 'en_cours', majLe: maintenant });
    const matiere = demande.matiereId ? matieres.get(demande.matiereId) : undefined;
    try {
      const brut = await ia.json({
        niveau: 'masse',
        etape: 'document demandé',
        systeme: `${systemeDocument(demande.type, matiere)}\n\nRéponds en JSON : {"titre": "titre court du document", "contenu": "le document, mis en forme comme indiqué"}.`,
        consigne: `${demande.contexte ? `<cours>\n${demande.contexte}\n</cours>\n\n` : ''}${LIBELLE_TYPE_DOCUMENT[demande.type]} sur : ${demande.sujet}${demande.consignes ? `\nConsignes : ${demande.consignes}` : ''}`,
        maxSortie: 32_000,
      });
      const reponse = lireReponse(brut);
      if (!reponse) throw new Error('Réponse inutilisable');
      const document: DocumentBiblio = {
        id: `doc-${demande.id}`,
        titre: reponse.titre,
        type: demande.type,
        matiereId: demande.matiereId,
        chapitreId: demande.chapitreId,
        contenu: reponse.contenu,
        creeLe: Date.now(),
        origine: 'file',
      };
      await memoire.ecrire<DocumentBiblio>('documents', document);
      await memoire.ecrire<DemandeDocument>('demandes', {
        ...demande,
        statut: 'terminee',
        documentId: document.id,
        majLe: Date.now(),
        message: undefined,
      });
      faites += 1;
    } catch (erreur) {
      if (estArret(erreur)) {
        // La limite gratuite est atteinte : la demande reste en file pour le prochain passage.
        await memoire.ecrire<DemandeDocument>('demandes', { ...demande, statut: 'en_attente', majLe: maintenant });
        throw erreur;
      }
      journal(`Document demandé : échec (${(erreur as Error).message})`);
      await memoire.ecrire<DemandeDocument>('demandes', {
        ...demande,
        statut: 'erreur',
        majLe: Date.now(),
        message: 'La rédaction a échoué. Refais la demande dans quelques minutes.',
      });
    }
  }
  return faites;
}
