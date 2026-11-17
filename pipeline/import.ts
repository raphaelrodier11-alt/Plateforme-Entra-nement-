/**
 * Import du drive : détection des changements, lecture des fichiers,
 * estimation du coût, lecture des scans par l'IA et classement en matières
 * et chapitres.
 *
 * Les deux premières étapes et l'estimation ne coûtent rien : aucune
 * dépense d'IA n'a lieu avant que l'estimation soit approuvée dans l'app.
 */
import type {
  Chapitre,
  Estimation,
  Fichier,
  LigneEstimation,
  Matiere,
  Partiel,
  PassageIllisible,
  RoleFichier,
  TexteFichier,
} from '../shared/types';
import {
  ECHECS_MAX,
  avecPages,
  enLots,
  iaRequise,
  notifier,
  tempsEcoule,
  texteDe,
  type Contexte,
} from './contexte';
import type { FichierDrive } from './drive';
import { natureDe, texteSuspect } from './extraction';
import { erreurPublique, journal } from './journal';
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
  /**
   * Vrai quand un drive est connecté : un drive qui paraît soudain vide est
   * alors plus probablement une panne qu'une suppression générale.
   */
  garde: boolean;
}

export async function scanner(c: Contexte, sources: SourcesScan): Promise<BilanScan> {
  const listes: [RoleFichier, FichierDrive[]][] = [];
  for (const dossier of sources.cours) listes.push(['cours', await c.drive.lister(dossier)]);
  for (const dossier of sources.annales) listes.push(['annale', await c.drive.lister(dossier)]);
  const connus = c.memoire.liste<Fichier>('fichiers');
  const bilan: BilanScan = { total: 0, nouveaux: 0, modifies: 0, supprimes: 0 };
  const vus = new Set<string>();

  for (const [role, liste] of listes) {
    for (const f of liste) {
      if (natureDe(f.mimeType) === 'ignore' || vus.has(f.id)) continue;
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
        });
        continue;
      }

      const suivant: Fichier = { ...connu, nom: f.nom, chemin: f.chemin, mimeType: f.mimeType, lien: f.lien };
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

  for (const connu of actifs) {
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

async function enregistrerTexte(
  c: Contexte,
  fichier: Fichier,
  pages: TexteFichier['pages'],
  pagesAOcr: number[],
): Promise<void> {
  const anciens = c.memoire
    .liste<TexteFichier>('textes')
    .filter((t) => t.fichierId === fichier.id)
    .map((t) => t.id);
  const nouveaux = decouperTexte(fichier.id, fichier.modifieLe, pages, pagesAOcr);
  const gardes = new Set(nouveaux.map((t) => t.id));
  await c.memoire.ecrire('textes', ...nouveaux);
  await c.memoire.supprimer('textes', ...anciens.filter((id) => !gardes.has(id)));
}

export async function lireFichiers(c: Contexte): Promise<{ lus: number; echecs: number }> {
  let lus = 0;
  let echecs = 0;
  for (const fichier of c.memoire.liste<Fichier>('fichiers').filter(aTraiter)) {
    if (tempsEcoule(c)) break;
    if (texteDe(c, fichier.id)?.version === fichier.modifieLe) continue;
    try {
      const { octets, mimeType } = await c.drive.telecharger({ ...fichier });
      const lecture = await c.lire(octets, mimeType);
      if (!lecture) {
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role: 'autre', etat: 'a_jour', versionTraitee: fichier.modifieLe });
        continue;
      }
      await enregistrerTexte(c, fichier, lecture.pages, lecture.pagesAOcr);
      await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, nbPages: lecture.pages.length });
      lus += 1;
    } catch (erreur) {
      echecs += 1;
      journal(`Lecture impossible d'un fichier : ${erreurPublique(erreur)}`);
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
const QUESTIONS_PAR_LOT = 12;

export function estimer(
  c: Contexte,
  modeles: Record<Niveau, string>,
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
  const totalUsd = liste.reduce((s, l) => s + l.coutUsd, 0);
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
      `${pagesScannees} page${pagesScannees > 1 ? 's' : ''} scannée${pagesScannees > 1 ? 's' : ''} à faire lire par l'IA.`,
      `Environ ${questionsAnnales} questions d'annales à extraire ; 20 à 50 QCM générés par cours, plus une réserve pour les examens blancs.`,
      'Chaque mois ensuite : hypothèse de deux fichiers mis à jour et un nouveau chapitre. La vérification hebdomadaire du drive est gratuite.',
      "Estimation indicative : la dépense réelle dépend de la longueur des réponses de l'IA. Un plafond de dépense arrête le traitement en cas de dépassement.",
    ],
    tarifs: [tarifs.masse, tarifs.expert],
    statut: 'a_valider',
  };
}

// ---------------------------------------------------------------------------
// 4. Lecture des pages scannées par l'IA
// ---------------------------------------------------------------------------

export async function lireScans(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  for (const fichier of c.memoire.liste<Fichier>('fichiers').filter(aTraiter)) {
    if (tempsEcoule(c)) break;
    const texte = texteDe(c, fichier.id);
    if (!texte || texte.pagesAOcr.length === 0) continue;

    try {
      const { octets, mimeType } = await c.drive.telecharger({ ...fichier });
      const piece = (await c.lire(octets, mimeType))?.piece;
      if (!piece) continue;

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

      for (const lot of enLots(texte.pagesAOcr, PAGES_PAR_LECTURE)) {
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
      }

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
      if ((erreur as Error).name === 'PlafondAtteint') throw erreur;
      journal(`Lecture d'un scan impossible : ${erreurPublique(erreur)}`);
      await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, echecs: (fichier.echecs ?? 0) + 1 });
    }
  }
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
    .filter((f) => aTraiter(f) && !f.matiereId && !!texteDe(c, f.id));

  for (const lot of enLots(aClasser, FICHIERS_PAR_CLASSEMENT)) {
    if (tempsEcoule(c)) break;
    const refs = new Map(lot.map((f, i) => [`f${i + 1}`, f]));
    const lignes: LigneFichier[] = [...refs].map(([ref, f]) => ({
      ref,
      dossier: f.role === 'cours' ? 'cours' : 'annales',
      chemin: f.chemin,
      debut: texteDe(c, f.id)?.pages.find((p) => p.texte)?.texte ?? '',
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
    for (const m of (Array.isArray(reponse.matieres) ? reponse.matieres : []).map(objet)) {
      const nom = chaine(m.nom);
      if (!chaine(m.ref) || !nom) continue;
      const id = `m-${slug(nom)}`;
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

    const idChapitre = new Map<string, string>(chapitres.map((x) => [x.id, x.id]));
    for (const x of (Array.isArray(reponse.chapitres) ? reponse.chapitres : []).map(objet)) {
      const matiereId = idMatiere.get(chaine(x.matiere));
      const titre = chaine(x.titre);
      if (!chaine(x.ref) || !matiereId || !titre) continue;
      idChapitre.set(chaine(x.ref), await creerChapitre(matiereId, titre));
    }

    const classes = new Set<string>();
    for (const f of (Array.isArray(reponse.fichiers) ? reponse.fichiers : []).map(objet)) {
      const fichier = refs.get(chaine(f.ref));
      if (!fichier || classes.has(fichier.id)) continue;
      const role = (['cours', 'annale', 'corrige', 'autre'] as const).find((r) => r === f.role) ?? fichier.role;
      if (role === 'autre') {
        classes.add(fichier.id);
        await c.memoire.ecrire<Fichier>('fichiers', { ...fichier, role, etat: 'a_jour', versionTraitee: fichier.modifieLe });
        continue;
      }
      const matiereId = idMatiere.get(chaine(f.matiere));
      if (!matiereId) continue;
      classes.add(fichier.id);

      if (role === 'cours') {
        const chapitreId = idChapitre.get(chaine(f.chapitre)) ?? (await creerChapitre(matiereId, titreDepuisNom(fichier.nom)));
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
