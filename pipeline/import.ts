/**
 * Import du drive : détection des changements, lecture des fichiers,
 * estimation du coût, lecture des scans par l'IA et classement en matières
 * et chapitres.
 *
 * Les deux premières étapes et l'estimation ne coûtent rien : aucune
 * dépense d'IA n'a lieu avant que l'estimation soit approuvée dans l'app.
 */
import { canonique } from '../shared/fusions';
import type {
  Chapitre,
  Estimation,
  Fichier,
  LigneEstimation,
  Matiere,
  Reglages,
  Partiel,
  PassageIllisible,
  RoleFichier,
  TexteFichier,
} from '../shared/types';
import {
  ECHECS_MAX,
  avecPages,
  enLots,
  enParallele,
  iaRequise,
  notifier,
  tempsEcoule,
  texteDe,
  type Contexte,
  estArret,
} from './contexte';
import { matiereDepuisChemin } from '../shared/matieres';
import { estFichierDepot } from './depot';
import type { FichierDrive } from './drive';
import { natureDe, texteSuspect } from './extraction';
import { causeProbable, erreurPublique, journal } from './journal';
import { SYSTEME, consigneLecture, consigneStructure, type LigneFichier } from './prompts';
import { decouperTexte } from './stockage';
import {
  TAUX_EUR_PAR_USD,
  cout,
  tarifPour,
  tokensDuTexte,
  type Niveau,
} from './tarifs';
import { MARQUEUR_ILLISIBLE, empreinte, slug, validerLecture } from './validation';

const PAGES_PAR_LECTURE = 20;
/** Lectures de scans menées en même temps : fichiers, et groupes de pages d'un même fichier. */
const FICHIERS_SCANS_EN_PARALLELE = 3;
const GROUPES_SCANS_EN_PARALLELE = 3;
const FICHIERS_PAR_CLASSEMENT = 120;
const JOURS_BADGE_NOUVEAU = 14;

// ---------------------------------------------------------------------------
// 1. Détection des changements du drive
// ---------------------------------------------------------------------------

export interface BilanScan {
  total: number;
  nouveaux: number;
  modifies: number;
  supprimes: number;
}

/** Où chercher les fichiers : dossiers du drive et/ou fichiers envoyés. */
export interface SourcesScan {
  cours: string[];
  annales: string[];
  /** Anciennes versions des cours, gardées pour être comparées. */
  anciens?: string[];
  /** Nom donné par l'utilisateur à un Drive ajouté (par identifiant de dossier). */
  noms?: Record<string, string>;
  /** Drives ajoutés : s'ils sont inaccessibles, on le signale sans arrêter le passage. */
  tolerants?: string[];
  /**
   * Vrai quand un drive est connecté : un drive qui paraît soudain vide est
   * alors plus probablement une panne qu'une suppression générale.
   */
  garde: boolean;
}

export async function scanner(c: Contexte, sources: SourcesScan): Promise<BilanScan> {
  const listes: [RoleFichier, FichierDrive[], string | undefined][] = [];
  let listageIncomplet = false;
  const lister = async (role: RoleFichier, dossier: string): Promise<void> => {
    try {
      listes.push([role, await c.drive.lister(dossier), sources.noms?.[dossier]]);
    } catch (erreur) {
      if (!sources.tolerants?.includes(dossier)) throw erreur;
      // Drive ajouté mais inaccessible (droits, lien) : on le signale, et on ne marque rien comme supprimé.
      listageIncomplet = true;
      journal(`Un Drive ajouté est inaccessible : ${erreurPublique(erreur)}`);
      await notifier(c, {
        id: `drive-inaccessible:${dossier}`,
        type: 'info',
        titre: 'Un Drive est inaccessible',
        message: `Le Drive « ${sources.noms?.[dossier] ?? 'sans nom'} » n'a pas pu être lu : vérifie le lien et que ton compte Google y a accès.`,
      });
    }
  };
  for (const dossier of sources.cours) await lister('cours', dossier);
  for (const dossier of sources.annales) await lister('annale', dossier);
  for (const dossier of sources.anciens ?? []) await lister('ancien', dossier);
  const connus = c.memoire.liste<Fichier>('fichiers');
  const bilan: BilanScan = { total: 0, nouveaux: 0, modifies: 0, supprimes: 0 };
  const vus = new Set<string>();
  const ignores = new Map<string, number>();
  let listes_total = 0;

  for (const [role, liste, nomSource] of listes) {
    listes_total += liste.length;
    for (const f of liste) {
      if (natureDe(f.mimeType) === 'ignore') {
        ignores.set(f.mimeType, (ignores.get(f.mimeType) ?? 0) + 1);
        continue;
      }
      if (vus.has(f.id)) continue;
      vus.add(f.id);
      bilan.total += 1;
      const connu = c.memoire.lire<Fichier>('fichiers', f.id);

      if (!connu) {
        bilan.nouveaux += 1;
        await c.memoire.ecrire<Fichier>('fichiers', {
          id: f.id,
          nom: f.nom,
          chemin: f.chemin,
          mimeType: f.mimeType,
          role,
          etat: 'nouveau',
          modifieLe: f.modifieLe,
          empreinte: f.empreinte,
          lien: f.lien,
          ...(f.chapitreId ? { chapitreImpose: f.chapitreId } : {}),
          ...(nomSource ? { source: nomSource } : {}),
        });
        continue;
      }

      const suivant: Fichier = { ...connu, nom: f.nom, chemin: f.chemin, mimeType: f.mimeType, lien: f.lien, ...(f.chapitreId ? { chapitreImpose: f.chapitreId } : {}), ...(nomSource ? { source: nomSource } : {}) };
      const change =
        connu.modifieLe !== f.modifieLe ||
        (!!connu.empreinte && !!f.empreinte && connu.empreinte !== f.empreinte);
      if (connu.etat === 'supprime') {
        // Le fichier est revenu : on le traite comme un nouveau fichier.
        Object.assign(suivant, { etat: 'nouveau', modifieLe: f.modifieLe, empreinte: f.empreinte, echecs: 0 });
        bilan.nouveaux += 1;
      } else if (change) {
        Object.assign(suivant, { modifieLe: f.modifieLe, empreinte: f.empreinte, echecs: 0 });
        const dejaVue = f.modifieLe === connu.versionIgnoree || f.modifieLe === connu.versionTraitee;
        if (connu.etat === 'a_jour' && !dejaVue && f.depot) {
          // Fichier renvoyé par l'utilisateur lui-même : c'est déjà son accord.
          suivant.etat = 'maj_validee';
          bilan.modifies += 1;
        } else if (connu.etat === 'a_jour' && !dejaVue) {
          // Fichier modifié dans le drive : rien n'est mis à jour sans validation.
          suivant.etat = 'modifie';
          bilan.modifies += 1;
          await notifier(c, {
            id: `fichier:${f.id}:${f.modifieLe}`,
            type: 'fichier_modifie',
            titre: 'Un fichier a changé dans ton drive',
            message: `« ${f.nom} » a été modifié. Valide la mise à jour pour l'intégrer.`,
            fichierId: f.id,
            chapitreId: connu.chapitreId,
          });
          const chapitre = connu.chapitreId
            ? c.memoire.lire<Chapitre>('chapitres', connu.chapitreId)
            : undefined;
          if (chapitre && !chapitre.majEnAttente) {
            await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, majEnAttente: true });
          }
        }
      }
      if (JSON.stringify(suivant) !== JSON.stringify(connu)) {
        await c.memoire.ecrire<Fichier>('fichiers', suivant);
      }
    }
  }

  // Garde-fou : un drive qui paraît soudain vide est plus sûrement une
  // panne ou un dossier mal renseigné qu'une suppression générale.
  const actifs = connus.filter((f) => f.etat !== 'supprime');
  if (sources.garde && bilan.total === 0 && actifs.length > 0) {
    throw new Error('Le drive ne renvoie aucun fichier : vérifie les dossiers indiqués dans les réglages.');
  }

  for (const connu of listageIncomplet ? [] : actifs) {
    if (vus.has(connu.id)) continue;
    bilan.supprimes += 1;
    await c.memoire.ecrire<Fichier>('fichiers', { ...connu, etat: 'supprime' });
    await notifier(c, {
      id: `supprime:${connu.id}:${connu.modifieLe}`,
      type: 'fichier_supprime',
      titre: 'Un fichier a disparu',
      message: `« ${connu.nom} » n'est plus disponible. Le contenu déjà généré est conservé.`,
      fichierId: connu.id,
      chapitreId: connu.chapitreId,
    });
  }

  // Le badge « nouveau » d'un chapitre disparaît au bout de deux semaines.
  const limite = c.maintenant - JOURS_BADGE_NOUVEAU * 86_400_000;
  for (const chapitre of c.memoire.liste<Chapitre>('chapitres')) {
    if (chapitre.nouveau && (chapitre.creeLe ?? 0) < limite) {
      await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, nouveau: false });
    }
  }

  journal(
    `Drive : ${listes_total} éléments listés, ${bilan.total} retenus` +
      (ignores.size
        ? `, ignorés (type non pris en charge) : ${[...ignores].map(([t, n]) => `${t} ×${n}`).join(', ')}`
        : ''),
  );
  journal(
    `Drive : ${bilan.total} fichiers, ${bilan.nouveaux} nouveaux, ${bilan.modifies} modifiés, ${bilan.supprimes} supprimés`,
  );
  return bilan;
}

// ---------------------------------------------------------------------------
// 2. Lecture locale des fichiers (texte déjà présent dans les documents)
// ---------------------------------------------------------------------------

/** Fichiers à (re)traiter : nouveaux, ou dont la mise à jour a été validée. */
export function aTraiter(f: Fichier): boolean {
  return (f.etat === 'nouveau' || f.etat === 'maj_validee') && f.role !== 'autre' && (f.echecs ?? 0) < ECHECS_MAX;
}

/** Écrit le texte d'un fichier (en plusieurs documents si besoin) et retire les restes d'une version plus longue. */
async function ecrireTextes(
  c: Contexte,
  idBase: string,
  version: string,
  pages: TexteFichier['pages'],
  pagesAOcr: number[],
): Promise<void> {
  const anciens = c.memoire
    .liste<TexteFichier>('textes')
    .filter((t) => t.fichierId === idBase)
    .map((t) => t.id);
  const nouveaux = decouperTexte(idBase, version, pages, pagesAOcr);
  const gardes = new Set(nouveaux.map((t) => t.id));
  await c.memoire.ecrire('textes', ...nouveaux);
  await c.memoire.supprimer('textes', ...anciens.filter((id) => !gardes.has(id)));
}

export async function enregistrerTexte(
  c: Contexte,
  fichier: Fichier,
  pages: TexteFichier['pages'],
  pagesAOcr: number[],
): Promise<void> {
  await ecrireTextes(c, fichier.id, fichier.modifieLe, pages, pagesAOcr);
}

/** Identifiant sous lequel on garde la version précédente du texte d'un fichier. */
export const idPrecedent = (fichierId: string): string => `prec:${fichierId}`;

/**
 * Avant de remplacer le texte d'un cours par sa nouvelle version, on garde
 * l'ancienne : c'est elle qui permet de montrer ce qui a changé.
 */
async function garderVersionPrecedente(c: Contexte, fichier: Fichier, ancien: TexteFichier): Promise<void> {
  await ecrireTextes(c, idPrecedent(fichier.id), ancien.version, ancien.pages, []);
  const chapitre = fichier.chapitreId ? c.memoire.lire<Chapitre>('chapitres', fichier.chapitreId) : undefined;
  if (chapitre && !chapitre.aComparer) {
    await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aComparer: true });
  }
}

export async function lireFichiers(c: Contexte): Promise<{ lus: number; echecs: number }> {
  let lus = 0;
  let echecs = 0;
  for (const fichier of c.memoire.liste<Fichier>('fichiers').filter(aTraiter)) {
    if (tempsEcoule(c)) break;
    const precedent = texteDe(c, fichier.id);
    if (precedent?.version === fichier.modifieLe) continue;
    try {
      const { octets, mimeType } = await c.drive.telecharger({ ...fichier });
      const lecture = await c.lire(octets, mimeType);
      if (!lecture) {
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role: 'autre', etat: 'a_jour', versionTraitee: fichier.modifieLe });
        continue;
      }
      if (precedent && fichier.role === 'cours' && precedent.pagesAOcr.length === 0) {
        await garderVersionPrecedente(c, fichier, precedent);
      }
      await enregistrerTexte(c, fichier, lecture.pages, lecture.pagesAOcr);
      await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, nbPages: lecture.pages.length });
      lus += 1;
    } catch (erreur) {
      echecs += 1;
      journal(`Lecture impossible d'un fichier (${fichier.mimeType}) : ${causeProbable(erreur)}`);
      await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, echecs: (fichier.echecs ?? 0) + 1 });
    }
  }
  if (lus || echecs) journal(`Lecture : ${lus} fichiers lus, ${echecs} en échec`);
  return { lus, echecs };
}

// ---------------------------------------------------------------------------
// 3. Estimation du coût (aucun appel payant)
// ---------------------------------------------------------------------------

/** Nombre de questions d'entraînement visé pour un cours, entre 20 et 50. */
export function nbQuestionsCible(tokensCours: number): number {
  return Math.min(50, Math.max(20, Math.round(tokensCours / 350)));
}

/** Questions gardées en réserve pour les examens blancs. */
export function nbQuestionsReserve(cible: number): number {
  return Math.min(12, Math.max(6, Math.round(cible / 4)));
}

/** Tokens comptés pour une page envoyée sous forme d'image. */
const TOKENS_PAGE_IMAGE = 700;
const QUESTIONS_PAR_LOT = 16;

export function estimer(
  c: Contexte,
  modeles: Record<Niveau, string>,
  gratuit = false,
  tarifsImposes = c.memoire.liste<{ id: string; tarifs?: Estimation['tarifs'] }>('reglages')[0]?.tarifs,
): Estimation {
  const fichiers = c.memoire.liste<Fichier>('fichiers').filter(aTraiter);
  const tarifs = {
    masse: tarifPour(modeles.masse, 'masse', tarifsImposes),
    expert: tarifPour(modeles.expert, 'expert', tarifsImposes),
  };
  const lignes = new Map<string, LigneEstimation>();
  const ajouter = (etape: string, niveau: Niveau, appels: number, entree: number, sortie: number) => {
    const ligne = lignes.get(etape) ?? { etape, modele: tarifs[niveau].modele, appels: 0, tokensEntree: 0, tokensSortie: 0, coutUsd: 0 };
    ligne.appels += appels;
    ligne.tokensEntree += Math.round(entree);
    ligne.tokensSortie += Math.round(sortie);
    ligne.coutUsd += cout(tarifs[niveau], entree, sortie);
    lignes.set(etape, ligne);
  };

  let nbCours = 0;
  let nbAnnales = 0;
  let nbAnciens = 0;
  let pagesScannees = 0;
  let questionsAnnales = 0;
  let tokensCoursTotal = 0;

  for (const fichier of fichiers) {
    const texte = texteDe(c, fichier.id);
    if (!texte) continue;
    const nbPages = texte.pages.length;
    const scans = texte.pagesAOcr.length;
    // Une page scannée fournira, une fois lue, à peu près autant de texte qu'une page ordinaire.
    const tokens = tokensDuTexte(avecPages(texte)) + scans * 450;
    pagesScannees += scans;

    if (scans > 0) {
      const appels = Math.ceil(scans / PAGES_PAR_LECTURE);
      ajouter('Lecture des pages scannées', 'masse', appels, appels * nbPages * TOKENS_PAGE_IMAGE, scans * 600);
    }

    if (fichier.role === 'cours') {
      nbCours += 1;
      tokensCoursTotal += tokens;
      const cible = nbQuestionsCible(tokens);
      const total = cible + nbQuestionsReserve(cible);
      const lots = Math.ceil(total / QUESTIONS_PAR_LOT);
      ajouter('Fiches de révision', 'masse', 1, tokens + nbPages * TOKENS_PAGE_IMAGE, 5000);
      ajouter('QCM et examens blancs', 'masse', lots, lots * (tokens + 2500), total * 340);
      ajouter('Flashcards', 'masse', 1, tokens, 1800);
      // Le modèle expert réfléchit avant de répondre : ces tokens sont facturés comme écrits.
      ajouter("Détection d'erreurs", 'expert', 1, tokens + 4000, 9000);
    } else if (fichier.role === 'ancien') {
      nbAnciens += 1;
      // Comparaison avec le cours actuel, supposé de taille voisine.
      ajouter('Comparaison des anciennes versions', 'masse', 1, tokens * 2 + 1500, 2500);
    } else {
      nbAnnales += 1;
      const questions = Math.max(5, Math.round(tokens / 180));
      questionsAnnales += questions;
      ajouter('Extraction des annales', 'masse', Math.ceil(tokens / 16_000), tokens + 1500, tokens * 1.3);
      ajouter('Classement et explications des annales', 'masse', Math.ceil(questions / 25) + 1, questions * 900, questions * 260);
      // Hypothèse : un tiers des questions n'a pas de corrigé officiel.
      ajouter('Corrigés manquants', 'expert', Math.ceil(questions / 45), (questions / 3) * 900, (questions / 3) * 700);
    }
  }
  ajouter('Classement en matières et chapitres', 'masse', Math.ceil(fichiers.length / FICHIERS_PAR_CLASSEMENT) || 1, fichiers.length * 160 + 800, fichiers.length * 70);

  const liste = [...lignes.values()].filter((l) => l.coutUsd > 0);
  const equivalentUsd = liste.reduce((s, l) => s + l.coutUsd, 0);
  const nbRequetes = liste.reduce((s, l) => s + l.appels, 0);
  // Mode gratuit : tout est comptabilisé à zéro, la valeur payante n'est donnée qu'à titre indicatif.
  const totalUsd = gratuit ? 0 : equivalentUsd;
  if (gratuit) for (const l of liste) l.coutUsd = 0;
  const parChapitre = nbCours > 0 ? totalUsd / nbCours : totalUsd;
  // Régime de croisière : deux fichiers mis à jour et un nouveau chapitre par mois.
  const mensuelUsd = parChapitre * 3;

  return {
    id: `est-${empreinte(fichiers.map((f) => `${f.id}@${f.modifieLe}`).sort().join('|'))}`,
    date: c.maintenant,
    lignes: liste.map((l) => ({ ...l, coutUsd: Math.round(l.coutUsd * 100) / 100 })),
    totalUsd: Math.round(totalUsd * 100) / 100,
    mensuelUsd: Math.round(mensuelUsd * 100) / 100,
    tauxEurParUsd: TAUX_EUR_PAR_USD,
    hypotheses: [
      `${nbCours} fichier${nbCours > 1 ? 's' : ''} de cours et ${nbAnnales} fichier${nbAnnales > 1 ? 's' : ''} d'annales à traiter, soit environ ${Math.round(tokensCoursTotal / 1000)} milliers de tokens de cours.`,
      ...(nbAnciens > 0
        ? [`${nbAnciens} fichier${nbAnciens > 1 ? 's' : ''} d'anciennes versions à comparer aux cours actuels, pour montrer ce qui a changé.`]
        : []),
      `${pagesScannees} page${pagesScannees > 1 ? 's' : ''} scannée${pagesScannees > 1 ? 's' : ''} à faire lire par l'IA.`,
      `Environ ${questionsAnnales} questions d'annales à extraire ; 20 à 50 QCM générés par cours, plus une réserve pour les examens blancs.`,
      'Chaque mois ensuite : hypothèse de deux fichiers mis à jour et un nouveau chapitre. La vérification hebdomadaire du drive est gratuite.',
      ...(gratuit
        ? [
            "Mode gratuit : seul le palier gratuit de Gemini est utilisé, avec un seul modèle. Aucune dépense n'est possible : si la limite de Google est atteinte, le traitement s'arrête et reprend plus tard.",
            `Environ ${nbRequetes} requêtes à envoyer. Le palier gratuit limite leur nombre par minute et par jour : compte plusieurs heures, voire quelques jours pour un gros volume. Valeur au tarif payant, non facturée : environ ${(Math.round(equivalentUsd * 100) / 100).toFixed(2)} $.`,
          ]
        : [
            "Estimation indicative : la dépense réelle dépend de la longueur des réponses de l'IA. Un plafond de dépense arrête le traitement en cas de dépassement.",
          ]),
    ],
    tarifs: gratuit ? [] : [tarifs.masse, tarifs.expert],
    ...(gratuit ? { gratuit: true, equivalentUsd: Math.round(equivalentUsd * 100) / 100 } : {}),
    statut: 'a_valider',
  };
}

// ---------------------------------------------------------------------------
// 4. Lecture des pages scannées par l'IA
// ---------------------------------------------------------------------------

export async function lireScans(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  // Les lectures de scans sont lentes (le PDF est envoyé en entier à chaque groupe de pages) :
  // on en mène plusieurs à la fois, fichiers et groupes de pages confondus. L'IA répartit les
  // requêtes entre les modèles gratuits et respecte leur cadence.
  const aLire = c.memoire.liste<Fichier>('fichiers').filter(aTraiter);
  await enParallele(aLire, FICHIERS_SCANS_EN_PARALLELE, async (fichier) => {
    if (tempsEcoule(c)) return;
    const texte = texteDe(c, fichier.id);
    if (!texte || texte.pagesAOcr.length === 0) return;

    try {
      const { octets, mimeType } = await c.drive.telecharger({ ...fichier });
      const piece = (await c.lire(octets, mimeType))?.piece;
      if (!piece) return;

      const pages = new Map(texte.pages.map((p) => [p.n, p]));
      const illisibles: PassageIllisible[] = [];
      const signaler = (page: number, contexte: string) =>
        illisibles.push({
          id: `ill-${fichier.id}-${page}-${illisibles.length}`,
          fichierId: fichier.id,
          fichierNom: fichier.nom,
          page,
          contexte,
          creeLe: c.maintenant,
        });

      let interrompu = false;
      await enParallele(enLots(texte.pagesAOcr, PAGES_PAR_LECTURE), GROUPES_SCANS_EN_PARALLELE, async (lot) => {
        if (interrompu || tempsEcoule(c)) {
          interrompu = true;
          return;
        }
        const lues = validerLecture(
          await ia.json({
            niveau: 'masse',
            etape: 'Lecture des pages scannées',
            systeme: SYSTEME,
            consigne: consigneLecture(lot),
            pieces: [piece],
          }),
        );
        const parPage = new Map(lues.map((l) => [l.page, l]));
        for (const n of lot) {
          const lue = parPage.get(n);
          if (!lue) {
            signaler(n, "Page non lue par la reconnaissance de texte.");
            continue;
          }
          pages.set(n, { n, texte: lue.texte, source: lue.texte ? 'ocr' : 'vide' });
          for (const contexte of lue.illisibles) signaler(n, contexte);
          if (lue.illisibles.length === 0 && lue.texte.includes(MARQUEUR_ILLISIBLE)) {
            signaler(n, 'Passage illisible sur cette page.');
          }
          // Contrôle du texte lu : un texte incohérent est signalé, pas utilisé tel quel en silence.
          const doute = texteSuspect(lue.texte);
          if (doute) signaler(n, `Lecture douteuse : ${doute}.`);
        }
      });
      // Temps écoulé avant la fin : rien n'est enregistré, le fichier sera relu au prochain passage.
      if (interrompu) return;

      const anciens = c.memoire
        .liste<PassageIllisible>('illisibles')
        .filter((p) => p.fichierId === fichier.id)
        .map((p) => p.id);
      await c.memoire.supprimer('illisibles', ...anciens);
      await c.memoire.ecrire('illisibles', ...illisibles);
      await enregistrerTexte(c, fichier, [...pages.values()].sort((a, b) => a.n - b.n), []);
      if (illisibles.length > 0) {
        await notifier(c, {
          id: `illisible:${fichier.id}:${fichier.modifieLe}`,
          type: 'illisible',
          titre: 'Des passages n’ont pas pu être lus',
          message: `${illisibles.length} passage${illisibles.length > 1 ? 's' : ''} illisible${illisibles.length > 1 ? 's' : ''} dans « ${fichier.nom} ». Ils ont été laissés de côté plutôt que devinés.`,
          fichierId: fichier.id,
        });
      }
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Lecture d'un scan impossible : ${erreurPublique(erreur)}`);
      await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, echecs: (fichier.echecs ?? 0) + 1 });
    }
  });
}

// ---------------------------------------------------------------------------
// 5. Classement des fichiers en matières et chapitres
// ---------------------------------------------------------------------------

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function chaine(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function titreDepuisNom(nom: string): string {
  return nom.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim() || 'Chapitre';
}

export async function structurer(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  const aClasser = c.memoire
    .liste<Fichier>('fichiers')
    .filter((f) => aTraiter(f) && !f.matiereId && !!texteDe(c, f.id))
    // Les anciennes versions passent en dernier : les chapitres actuels existent alors déjà.
    .sort((a, b) => Number(a.role === 'ancien') - Number(b.role === 'ancien'));

  // Compléments envoyés pour un chapitre précis : rattachés directement, sans classement par l'IA.
  for (const f of [...aClasser]) {
    if (!f.chapitreImpose) continue;
    const chapitre = c.memoire.lire<Chapitre>('chapitres', f.chapitreImpose);
    if (!chapitre) continue;
    await c.memoire.ecrire<Fichier>('fichiers', { ...f, role: 'cours', matiereId: chapitre.matiereId, chapitreId: chapitre.id });
    await c.memoire.ecrire<Chapitre>('chapitres', {
      ...chapitre,
      fichierIds: [...new Set([...chapitre.fichierIds, f.id])],
      // Le chapitre est régénéré avec le complément : fiche, QCM, flashcards, puis vérification.
      aGenerer: true,
      aVerifier: true,
    });
    aClasser.splice(aClasser.indexOf(f), 1);
  }

  // Matière imposée par le dossier du Drive (« SEMESTRE n / MATIÈRE / … ») : créée
  // d'avance, et l'IA ne peut plus la changer.
  const imposees = new Map<string, string>();
  const canonMatiere = canonique(c.memoire.lire<Reglages>('reglages', 'principal')?.fusionsMatieres);
  for (const f of aClasser) {
    const dossier = matiereDepuisChemin(f.chemin, estFichierDepot(f.id));
    if (!dossier) continue;
    // Une matière fusionnée par l'étudiant reçoit ses nouveaux fichiers sous son nom définitif.
    const id = canonMatiere(`m-${slug(dossier.nom)}`);
    const existante = c.memoire.lire<Matiere>('matieres', id);
    if (!existante) {
      const ordre = Math.max(0, ...c.memoire.liste<Matiere>('matieres').map((m) => m.ordre)) + 1;
      await c.memoire.ecrire<Matiere>('matieres', { id, nom: dossier.nom, ordre, ...(dossier.semestre ? { semestre: dossier.semestre } : {}) });
    } else if (dossier.semestre && !existante.semestre) {
      await c.memoire.ecrire<Matiere>('matieres', { ...existante, semestre: dossier.semestre });
    }
    imposees.set(f.id, id);
  }

  for (const lot of enLots(aClasser, FICHIERS_PAR_CLASSEMENT)) {
    if (tempsEcoule(c)) break;
    const refs = new Map(lot.map((f, i) => [`f${i + 1}`, f]));
    const lignes: LigneFichier[] = [...refs].map(([ref, f]) => ({
      ref,
      dossier: f.role === 'cours' ? 'cours' : f.role === 'ancien' ? 'anciens' : 'annales',
      chemin: f.chemin,
      debut: texteDe(c, f.id)?.pages.find((p) => p.texte)?.texte ?? '',
      matiereImposee: imposees.get(f.id),
    }));
    const matieres = c.memoire.liste<Matiere>('matieres');
    const chapitres = c.memoire.liste<Chapitre>('chapitres');

    const reponse = objet(
      await ia.json({
        niveau: 'masse',
        etape: 'Classement en matières et chapitres',
        systeme: SYSTEME,
        consigne: consigneStructure(lignes, matieres, chapitres),
        maxSortie: 16_000,
      }),
    );

    // Matières : identifiant existant, ou création à partir de la référence proposée.
    const idMatiere = new Map<string, string>(matieres.map((m) => [m.id, m.id]));
    let ordre = Math.max(0, ...matieres.map((m) => m.ordre));
    // Quand tous les fichiers du lot ont leur matière imposée par le dossier, l'IA n'en crée pas d'autre.
    const lotImpose = lot.every((f) => imposees.has(f.id));
    for (const m of (lotImpose ? [] : Array.isArray(reponse.matieres) ? reponse.matieres : []).map(objet)) {
      const nom = chaine(m.nom);
      if (!chaine(m.ref) || !nom) continue;
      const id = canonMatiere(`m-${slug(nom)}`);
      if (!c.memoire.lire('matieres', id)) {
        await c.memoire.ecrire<Matiere>('matieres', { id, nom, ordre: ++ordre });
      }
      idMatiere.set(chaine(m.ref), id);
    }

    const creerChapitre = async (matiereId: string, titre: string): Promise<string> => {
      const id = `c-${matiereId.replace(/^m-/, '')}-${slug(titre)}`;
      if (!c.memoire.lire('chapitres', id)) {
        const ordreChapitre =
          Math.max(0, ...c.memoire.liste<Chapitre>('chapitres').filter((x) => x.matiereId === matiereId).map((x) => x.ordre)) + 1;
        await c.memoire.ecrire<Chapitre>('chapitres', {
          id,
          matiereId,
          titre,
          ordre: ordreChapitre,
          fichierIds: [],
          nouveau: true,
          creeLe: c.maintenant,
          version: 0,
        });
      }
      return id;
    };

    // Un chapitre n'est créé que quand un fichier de cours s'y rattache : une
    // ancienne version seule ne crée jamais de chapitre.
    const idChapitre = new Map<string, string>(chapitres.map((x) => [x.id, x.id]));
    const chapitresProposes = new Map<string, { matiereId: string; titre: string }>();
    for (const x of (Array.isArray(reponse.chapitres) ? reponse.chapitres : []).map(objet)) {
      const matiereId = idMatiere.get(chaine(x.matiere));
      const titre = chaine(x.titre);
      if (!chaine(x.ref) || !matiereId || !titre) continue;
      chapitresProposes.set(chaine(x.ref), { matiereId, titre });
    }
    const chapitreDuCours = async (ref: string, imposee?: string): Promise<string | undefined> => {
      const connu = idChapitre.get(ref);
      const chapitreConnu = connu ? c.memoire.lire<Chapitre>('chapitres', connu) : undefined;
      // Un chapitre d'une autre matière que celle du dossier n'est jamais réutilisé.
      if (connu && (!imposee || chapitreConnu?.matiereId === imposee)) return connu;
      const propose = chapitresProposes.get(ref);
      if (!propose) return undefined;
      const id = await creerChapitre(imposee ?? propose.matiereId, propose.titre);
      if (!imposee) idChapitre.set(ref, id);
      return id;
    };

    const classes = new Set<string>();
    const reponses = (Array.isArray(reponse.fichiers) ? reponse.fichiers : [])
      .map(objet)
      // Les anciennes versions en dernier, une fois les chapitres des cours créés.
      .sort((a, b) => Number(refs.get(chaine(a.ref))?.role === 'ancien') - Number(refs.get(chaine(b.ref))?.role === 'ancien'));
    for (const f of reponses) {
      const fichier = refs.get(chaine(f.ref));
      if (!fichier || classes.has(fichier.id)) continue;
      const role =
        fichier.role === 'ancien'
          ? ('ancien' as const)
          : ((['cours', 'annale', 'corrige', 'autre'] as const).find((r) => r === f.role) ?? fichier.role);
      if (role === 'ancien') {
        const ref = chaine(f.chapitre);
        const chapitreId = idChapitre.get(ref);
        const trouve = chapitreId ? c.memoire.lire<Chapitre>('chapitres', chapitreId) : undefined;
        const imposeeAncien = imposees.get(fichier.id);
        // Un chapitre d'une autre matière que celle du dossier n'est pas rattaché.
        const chapitre = trouve && (!imposeeAncien || trouve.matiereId === imposeeAncien) ? trouve : undefined;
        const matiereAncien = chapitre?.matiereId ?? imposeeAncien ?? idMatiere.get(chaine(f.matiere));
        if (!matiereAncien) continue;
        classes.add(fichier.id);
        await c.memoire.ecrire<Fichier>('fichiers', {
          ...fichier,
          matiereId: matiereAncien,
          ...(chapitre ? { chapitreId: chapitre.id } : {}),
        });
        continue;
      }
      if (role === 'autre') {
        classes.add(fichier.id);
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role, etat: 'a_jour', versionTraitee: fichier.modifieLe });
        continue;
      }
      const imposee = imposees.get(fichier.id);
      const matiereId = imposee ?? idMatiere.get(chaine(f.matiere));
      if (!matiereId) continue;
      classes.add(fichier.id);

      if (role === 'cours') {
        const chapitreId = (await chapitreDuCours(chaine(f.chapitre), imposee)) ?? (await creerChapitre(matiereId, titreDepuisNom(fichier.nom)));
        const chapitre = c.memoire.lire<Chapitre>('chapitres', chapitreId)!;
        await c.memoire.ecrire<Chapitre>('chapitres', {
          ...chapitre,
          fichierIds: [...new Set([...chapitre.fichierIds, fichier.id])],
          aGenerer: true,
          aVerifier: true,
        });
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role, matiereId: chapitre.matiereId, chapitreId });
      } else {
        const partiel = objet(f.partiel);
        const libelle = chaine(partiel.libelle) || titreDepuisNom(fichier.nom);
        const partielId = `p-${matiereId.replace(/^m-/, '')}-${slug(libelle)}`;
        if (!c.memoire.lire('partiels', partielId)) {
          await c.memoire.ecrire<Partiel>('partiels', {
            id: partielId,
            matiereId,
            libelle,
            ...(chaine(partiel.date) ? { date: chaine(partiel.date) } : {}),
          });
        }
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role, matiereId, partielId });
      }
    }

    // Un fichier que l'IA n'a pas su classer sera retenté, trois fois au plus.
    for (const fichier of lot) {
      if (!classes.has(fichier.id)) {
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, echecs: (fichier.echecs ?? 0) + 1 });
      }
    }
  }

  // Cours dont la mise à jour a été validée : le chapitre est à régénérer.
  for (const fichier of c.memoire.liste<Fichier>('fichiers')) {
    if (fichier.etat !== 'maj_validee' || fichier.role !== 'cours' || !fichier.chapitreId) continue;
    const chapitre = c.memoire.lire<Chapitre>('chapitres', fichier.chapitreId);
    if (chapitre && !(chapitre.aGenerer && chapitre.aVerifier)) {
      await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aGenerer: true, aVerifier: true });
    }
  }

  // Un corrigé arrivé après son sujet : le sujet est relu avec ce corrigé.
  for (const corrige of c.memoire.liste<Fichier>('fichiers')) {
    if (corrige.role !== 'corrige' || !aTraiter(corrige) || !corrige.partielId) continue;
    for (const sujet of c.memoire.liste<Fichier>('fichiers')) {
      if (sujet.role === 'annale' && sujet.partielId === corrige.partielId && sujet.etat === 'a_jour') {
        await c.memoire.ecrire<Fichier>('fichiers', { ...sujet, etat: 'maj_validee' });
      }
    }
  }
}
