/**
 * Génération du contenu : extraction des annales, fiches, QCM, flashcards
 * et détection des erreurs dans les sources.
 *
 * Le modèle économique fait la production de masse ; le modèle expert est
 * réservé aux corrigés manquants et à la détection d'erreurs. Les
 * corrections proposées ne sont jamais appliquées ici : elles attendent une
 * validation dans l'app.
 */
import { estIncontournable } from '../shared/marqueurs';
import { SEUIL_SIMILARITE, similarite } from '../shared/recurrence';
import type {
  Anomalie,
  CasClinique,
  Chapitre,
  Fiche,
  Fichier,
  Flashcard,
  Matiere,
  Partiel,
  PassageIllisible,
  Question,
} from '../shared/types';
import {
  avecPages,
  enLots,
  iaRequise,
  notifier,
  tempsEcoule,
  CHAPITRES_EN_PARALLELE,
  enParallele,
  texteDe,
  type Contexte,
  estArret,
} from './contexte';
import { aTraiter, nbQuestionsCible, nbQuestionsReserve } from './import';
import { erreurPublique, journal } from './journal';
import {
  SYSTEME,
  consigneAnnale,
  consigneClassement,
  consigneCorrigesManquants,
  consigneErreurs,
  consigneExplications,
  consigneFiche,
  consigneFlashcards,
  consigneQcm,
  type QuestionPourIa,
} from './prompts';
import { illustrerSections, mediasUtilises } from './illustrations';
import { ressourcesDuChapitre } from './ressources';
import { tokensDuTexte } from './tarifs';
import {
  empreinte,
  signature,
  texte,
  validerAnnale,
  validerAnomalies,
  validerFiche,
  validerFlashcards,
  validerLotQuestions,
  type QuestionAnnale,
  type QuestionBrute,
} from './validation';

const QUESTIONS_PAR_LOT = 16;
const CARACTERES_PAR_EXTRACTION = 55_000;

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function tableau(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(objet) : [];
}

/** Présente une question à l'IA avec ses propositions lettrées. */
function pourIa(ref: string, q: Question, avecReponses: boolean): QuestionPourIa {
  const propositions = (q.propositions ?? []).map((p) => `${p.id}. ${p.texte}`);
  const reponses =
    q.type === 'trous'
      ? (q.trous ?? []).map((t) => t.reponses[0] ?? '')
      : (q.propositions ?? []).filter((p) => p.correcte).map((p) => p.id);
  return {
    ref,
    enonce: q.enonce,
    propositions,
    page: q.occurrences?.[0]?.page,
    ...(avecReponses && q.corrige !== 'absent' ? { reponses } : {}),
  };
}

/** Texte de tous les cours d'un chapitre, avec le nom de chaque fichier. */
export function coursDuChapitre(c: Contexte, chapitre: Chapitre): { texte: string; fichiers: Fichier[]; complet: boolean } {
  const fichiers = chapitre.fichierIds
    .map((id) => c.memoire.lire<Fichier>('fichiers', id))
    .filter((f): f is Fichier => !!f && f.role === 'cours' && f.etat !== 'supprime');
  const morceaux: string[] = [];
  let complet = true;
  for (const f of fichiers) {
    const t = texteDe(c, f.id);
    // Un fichier pas encore lu, ou dont des scans restent à lire, rend le cours incomplet.
    if (!t || t.pagesAOcr.length > 0) {
      complet = false;
      continue;
    }
    morceaux.push(`##### Fichier : ${f.nom}\n${avecPages(t)}`);
  }
  return { texte: morceaux.join('\n\n'), fichiers, complet };
}

// ---------------------------------------------------------------------------
// Annales
// ---------------------------------------------------------------------------

/** Découpe un texte paginé en morceaux, sans couper une page. */
function parMorceaux(textePagine: string, tailleMax: number): string[] {
  const pages = textePagine.split(/(?=--- Page \d+ ---)/);
  const morceaux: string[] = [];
  let courant = '';
  for (const page of pages) {
    if (courant && courant.length + page.length > tailleMax) {
      morceaux.push(courant);
      courant = '';
    }
    courant += page;
  }
  if (courant.trim()) morceaux.push(courant);
  return morceaux;
}

async function chapitreNonClasse(c: Contexte, matiereId: string): Promise<string> {
  const id = `c-${matiereId.replace(/^m-/, '')}-non-classe`;
  if (!c.memoire.lire('chapitres', id)) {
    await c.memoire.ecrire<Chapitre>('chapitres', {
      id,
      matiereId,
      titre: 'Questions non classées',
      ordre: 999,
      fichierIds: [],
      version: 0,
      creeLe: c.maintenant,
    });
  }
  return id;
}

/** Retire d'une matière les occurrences venant d'un fichier (avant de le relire). */
async function retirerOccurrences(c: Contexte, fichierId: string): Promise<void> {
  for (const q of c.memoire.liste<Question>('questions')) {
    if (q.source !== 'annale' || !q.occurrences?.some((o) => o.fichierId === fichierId)) continue;
    const occurrences = q.occurrences.filter((o) => o.fichierId !== fichierId);
    if (occurrences.length === 0) await c.memoire.supprimer('questions', q.id);
    else await c.memoire.ecrire<Question>('questions', { ...q, occurrences });
  }
}

function questionDepuisAnnale(a: QuestionAnnale, matiereId: string, chapitreId: string): Question {
  const base = { enonce: a.enonce, propositions: a.propositions };
  return {
    id: `qa-${empreinte(`${matiereId}|${signature(base)}`)}`,
    matiereId,
    chapitreId,
    type: a.type,
    enonce: a.enonce,
    ...(a.propositions ? { propositions: a.propositions } : {}),
    ...(a.trous ? { trous: a.trous } : {}),
    explication: '',
    difficulte: 2,
    source: 'annale',
    corrige: a.corrigeOfficiel ? 'officiel' : 'absent',
    occurrences: [],
    version: 1,
  };
}

/** Explications des questions d'annales, et réponses quand le corrigé manque. */
async function enrichirAnnales(c: Contexte, nouvelles: Question[]): Promise<Question[]> {
  const ia = iaRequise(c);
  const parChapitre = new Map<string, Question[]>();
  for (const q of nouvelles) parChapitre.set(q.chapitreId, [...(parChapitre.get(q.chapitreId) ?? []), q]);
  const enrichies = new Map(nouvelles.map((q) => [q.id, q]));

  await enParallele([...parChapitre], CHAPITRES_EN_PARALLELE, async ([chapitreId, questions]) => {
    const chapitre = c.memoire.lire<Chapitre>('chapitres', chapitreId);
    const cours = chapitre ? coursDuChapitre(c, chapitre).texte : '';
    const titre = chapitre?.titre ?? 'Annales';

    for (const lot of enLots(questions.filter((q) => q.corrige === 'officiel'), 25)) {
      const refs = new Map(lot.map((q, i) => [`q${i + 1}`, q]));
      const reponse = await ia.json({
        niveau: 'masse',
        etape: 'Classement et explications des annales',
        systeme: SYSTEME,
        consigne: consigneExplications(titre, cours, [...refs].map(([ref, q]) => pourIa(ref, q, true))),
      });
      for (const e of tableau(objet(reponse).explications)) {
        const q = refs.get(texte(e.ref, 20));
        const explication = texte(e.explication, 3000);
        if (!q || !explication) continue;
        enrichies.set(q.id, {
          ...q,
          explication,
          ...(texte(e.rappel, 1500) ? { rappel: texte(e.rappel, 1500) } : {}),
          difficulte: (Math.min(3, Math.max(1, Number(e.difficulte) || 2)) as 1 | 2 | 3),
          piege: e.piege === true,
        });
      }
    }

    // Corrigé absent : le modèle expert établit la réponse, signalée comme telle dans l'app.
    for (const lot of enLots(questions.filter((q) => q.corrige === 'absent' && q.type !== 'trous'), 15)) {
      const refs = new Map(lot.map((q, i) => [`q${i + 1}`, q]));
      const reponse = await ia.json({
        niveau: 'expert',
        etape: 'Corrigés manquants',
        systeme: SYSTEME,
        consigne: consigneCorrigesManquants(titre, cours, [...refs].map(([ref, q]) => pourIa(ref, q, false))),
      });
      for (const r of tableau(objet(reponse).reponses)) {
        const q = refs.get(texte(r.ref, 20));
        const explication = texte(r.explication, 3000);
        const lettres = new Set((Array.isArray(r.correctes) ? r.correctes : []).map((l) => String(l).toUpperCase()));
        if (!q || !explication || lettres.size === 0) continue;
        const propositions = (q.propositions ?? []).map((p) => ({ ...p, correcte: lettres.has(p.id.toUpperCase()) }));
        if (q.type === 'simple' && propositions.filter((p) => p.correcte).length !== 1) continue;
        enrichies.set(q.id, {
          ...q,
          propositions,
          corrige: 'propose_ia',
          explication:
            r.incertain === true
              ? `${explication}\n\nLe cours ne permet pas de trancher avec certitude : réponse à vérifier.`
              : explication,
          ...(texte(r.rappel, 1500) ? { rappel: texte(r.rappel, 1500) } : {}),
          difficulte: (Math.min(3, Math.max(1, Number(r.difficulte) || 2)) as 1 | 2 | 3),
        });
      }
    }
  });

  // Une question sans réponse fiable n'est pas publiée ; les autres ont
  // toujours une explication, au minimum le rappel du corrigé officiel.
  return [...enrichies.values()]
    .filter((q) => q.corrige !== 'absent')
    .map((q) => {
      if (q.explication) return q;
      const justes =
        q.type === 'trous'
          ? (q.trous ?? []).map((t) => t.reponses[0]).join(', ')
          : (q.propositions ?? []).filter((p) => p.correcte).map((p) => p.id).join(', ');
      return { ...q, explication: `Corrigé officiel du partiel : ${justes || 'aucune proposition juste'}.` };
    });
}

export async function traiterAnnales(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  const sujets = c.memoire
    .liste<Fichier>('fichiers')
    .filter((f) => f.role === 'annale' && aTraiter(f) && !!f.matiereId);

  for (const sujet of sujets) {
    if (tempsEcoule(c)) break;
    const texteSujet = texteDe(c, sujet.id);
    if (!texteSujet || texteSujet.pagesAOcr.length > 0) continue;
    const matiereId = sujet.matiereId!;

    try {
      const corriges = c.memoire
        .liste<Fichier>('fichiers')
        .filter((f) => f.role === 'corrige' && f.partielId && f.partielId === sujet.partielId && f.etat !== 'supprime');
      const texteCorrige = corriges
        .map((f) => texteDe(c, f.id))
        .filter((t) => !!t && t.pagesAOcr.length === 0)
        .map((t) => avecPages(t!))
        .join('\n\n');

      await retirerOccurrences(c, sujet.id);

      // Extraction, par morceaux si le sujet est long.
      const extraites: QuestionAnnale[] = [];
      const illisibles: PassageIllisible[] = [];
      let libelle = '';
      let date: string | undefined;
      for (const morceau of parMorceaux(avecPages(texteSujet), CARACTERES_PAR_EXTRACTION)) {
        const annale = validerAnnale(
          await ia.json({
            niveau: 'masse',
            etape: 'Extraction des annales',
            systeme: SYSTEME,
            consigne: consigneAnnale(sujet.chemin, morceau, texteCorrige || undefined),
          }),
        );
        extraites.push(...annale.questions);
        libelle ||= annale.libelle;
        date ||= annale.date;
        for (const p of annale.illisibles) {
          illisibles.push({
            id: `ill-${sujet.id}-q-${illisibles.length}`,
            fichierId: sujet.id,
            fichierNom: sujet.nom,
            page: p.page,
            contexte: p.contexte,
            creeLe: c.maintenant,
          });
        }
      }
      await c.memoire.ecrire('illisibles', ...illisibles);

      // Partiel du sujet (créé au classement, sinon d'après le document).
      let partielId = sujet.partielId;
      if (!partielId) {
        partielId = `p-${matiereId.replace(/^m-/, '')}-${empreinte(libelle || sujet.nom)}`;
        await c.memoire.ecrire<Partiel>('partiels', {
          id: partielId,
          matiereId,
          libelle: libelle || sujet.nom,
          ...(date ? { date } : {}),
        });
      }
      const partiel = c.memoire.lire<Partiel>('partiels', partielId);
      if (partiel) {
        await c.memoire.ecrire<Partiel>('partiels', {
          ...partiel,
          nbQuestions: extraites.length,
          ...(partiel.date || !date ? {} : { date }),
        });
      }

      // Rattachement de chaque question à son chapitre.
      const chapitres = c.memoire
        .liste<Chapitre>('chapitres')
        .filter((x) => x.matiereId === matiereId && !x.id.endsWith('-non-classe'));
      const chapitreDe = new Map<number, string>();
      if (chapitres.length > 0) {
        for (const lot of enLots(extraites.map((q, i) => ({ q, i })), 40)) {
          const reponse = await ia.json({
            niveau: 'masse',
            etape: 'Classement et explications des annales',
            systeme: SYSTEME,
            consigne: consigneClassement(
              chapitres,
              lot.map(({ q, i }) => ({ ref: `q${i + 1}`, texte: signature(q) })),
            ),
            maxSortie: 8000,
          });
          for (const r of tableau(objet(reponse).classement)) {
            const indice = Number(texte(r.ref, 12).replace(/^q/, '')) - 1;
            const chapitreId = texte(r.chapitre, 160);
            if (chapitres.some((x) => x.id === chapitreId)) chapitreDe.set(indice, chapitreId);
          }
        }
      }

      // Fusion avec les questions déjà connues : une question retombée dans
      // un autre partiel gagne une occurrence (elle devient incontournable).
      const existantes = c.memoire
        .liste<Question>('questions')
        .filter((q) => q.source === 'annale' && q.matiereId === matiereId);
      const nouvelles: Question[] = [];
      const aEcrire = new Map<string, Question>();
      const cas = new Map<string, CasClinique>();
      const touches = new Set<string>();

      for (const [i, extraite] of extraites.entries()) {
        const occurrence = { partielId, fichierId: sujet.id, numero: extraite.numero, page: extraite.page };
        const sign = signature(extraite);
        const jumelle = [...existantes, ...nouvelles].find((q) => similarite(signature(q), sign) >= SEUIL_SIMILARITE);

        if (jumelle) {
          const courante = aEcrire.get(jumelle.id) ?? jumelle;
          const dejaLa = courante.occurrences?.some(
            (o) => o.partielId === partielId && o.numero === extraite.numero,
          );
          const fusion: Question = {
            ...courante,
            occurrences: dejaLa ? courante.occurrences : [...(courante.occurrences ?? []), occurrence],
          };
          // Un corrigé officiel remplace une réponse proposée par l'IA.
          if (courante.corrige !== 'officiel' && extraite.corrigeOfficiel && extraite.propositions) {
            Object.assign(fusion, { propositions: extraite.propositions, corrige: 'officiel' });
          }
          if (nouvelles.includes(jumelle)) Object.assign(jumelle, fusion);
          else aEcrire.set(jumelle.id, fusion);
          touches.add(fusion.chapitreId);
          continue;
        }

        const chapitreId = chapitreDe.get(i) ?? (await chapitreNonClasse(c, matiereId));
        const q = questionDepuisAnnale(extraite, matiereId, chapitreId);
        q.occurrences = [occurrence];
        if (extraite.cas) {
          const casId = `cas-${empreinte(`${matiereId}|${extraite.cas}`)}`;
          const dejaCas = cas.get(casId);
          if (!dejaCas) {
            cas.set(casId, { id: casId, matiereId, chapitreId, titre: 'Cas clinique', vignette: extraite.cas });
          }
          q.casId = casId;
          q.ordreCas = i;
        }
        nouvelles.push(q);
        touches.add(chapitreId);
      }

      const publiees = await enrichirAnnales(c, nouvelles);
      await c.memoire.ecrire('cas', ...[...cas.values()].filter((k) => publiees.some((q) => q.casId === k.id)));
      await c.memoire.ecrire('questions', ...publiees, ...aEcrire.values());

      // Format habituel des partiels de la matière, pour calibrer les examens blancs.
      const tailles = c.memoire
        .liste<Partiel>('partiels')
        .filter((p) => p.matiereId === matiereId && (p.nbQuestions ?? 0) > 0)
        .map((p) => p.nbQuestions!)
        .sort((a, b) => a - b);
      const matiere = c.memoire.lire<Matiere>('matieres', matiereId);
      if (matiere && tailles.length > 0) {
        await c.memoire.ecrire<Matiere>('matieres', {
          ...matiere,
          formatPartiel: {
            nbQuestions: tailles[Math.floor(tailles.length / 2)]!,
            minutesParQuestion: matiere.formatPartiel?.minutesParQuestion ?? 1.5,
          },
        });
      }

      for (const chapitreId of touches) {
        const chapitre = c.memoire.lire<Chapitre>('chapitres', chapitreId);
        if (chapitre && !chapitre.aVerifier) {
          await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aVerifier: true });
        }
      }
      for (const f of [sujet, ...corriges]) {
        const courant = c.memoire.lire<Fichier>('fichiers', f.id) ?? f;
        await c.memoire.ecrire<Fichier>('fichiers', { ...courant, etat: 'a_jour', versionTraitee: courant.modifieLe, partielId });
      }
      const incontournables = [...publiees, ...aEcrire.values()].filter(estIncontournable).length;
      journal(`Annale traitée : ${extraites.length} questions, ${incontournables} incontournables`);
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Annale en échec : ${erreurPublique(erreur)}`);
      await c.memoire.ecrire<Fichier>('fichiers', { ...sujet, echecs: (sujet.echecs ?? 0) + 1 });
    }
  }

  // Corrigés restés sans sujet : rien à extraire, ils sont simplement rangés.
  for (const f of c.memoire.liste<Fichier>('fichiers')) {
    if (f.role !== 'corrige' || !aTraiter(f) || !texteDe(c, f.id)) continue;
    const aUnSujet = c.memoire
      .liste<Fichier>('fichiers')
      .some((s) => s.role === 'annale' && s.partielId === f.partielId && aTraiter(s));
    if (!aUnSujet) {
      await c.memoire.ecrire<Fichier>('fichiers', { ...f, etat: 'a_jour', versionTraitee: f.modifieLe });
    }
  }
}

// ---------------------------------------------------------------------------
// Fiches, QCM, flashcards
// ---------------------------------------------------------------------------

function questionGeneree(
  brute: QuestionBrute,
  chapitre: Chapitre,
  sections: Set<string>,
  casIds: Map<string, string>,
  ordre: number,
  reserve: boolean,
): Question {
  const { section, casRef, ...reste } = brute;
  const casId = casRef ? casIds.get(casRef) : undefined;
  return {
    ...reste,
    id: `qg-${chapitre.id}-${empreinte(signature(brute))}`,
    matiereId: chapitre.matiereId,
    chapitreId: chapitre.id,
    source: 'genere',
    ...(section && sections.has(section) ? { sectionFiche: section } : {}),
    ...(casId ? { casId, ordreCas: ordre } : {}),
    ...(reserve ? { reserveExamen: true } : {}),
    version: 1,
  };
}

/** Écrit des questions par lots jusqu'à atteindre le nombre voulu. */
async function ecrireQuestions(
  c: Contexte,
  chapitre: Chapitre,
  cours: string,
  sections: { id: string; titre: string }[],
  nombre: number,
  dejaEcrites: Question[],
  annales: string[],
  reserve: boolean,
): Promise<{ questions: Question[]; cas: CasClinique[] }> {
  const ia = iaRequise(c);
  const idsSections = new Set(sections.map((s) => s.id));
  const questions: Question[] = [];
  const cas: CasClinique[] = [];
  let lotsSteriles = 0;

  while (questions.length < nombre && lotsSteriles < 2 && !tempsEcoule(c)) {
    const demande = Math.min(QUESTIONS_PAR_LOT, nombre - questions.length);
    const { questions: brutes, cas: casBruts } = validerLotQuestions(
      await ia.json({
        niveau: 'masse',
        etape: 'QCM et examens blancs',
        systeme: SYSTEME,
        consigne: consigneQcm({
          titre: chapitre.titre,
          cours,
          sections,
          nombre: demande,
          dejaPosees: [...dejaEcrites, ...questions].map((q) => q.enonce),
          annales,
        }),
      }),
    );

    const casIds = new Map<string, string>();
    for (const k of casBruts) {
      const id = `cas-${chapitre.id}-${empreinte(k.vignette)}`;
      casIds.set(k.ref, id);
      cas.push({ id, matiereId: chapitre.matiereId, chapitreId: chapitre.id, titre: k.titre || 'Cas clinique', vignette: k.vignette });
    }

    const avant = questions.length;
    for (const [i, brute] of brutes.entries()) {
      const q = questionGeneree(brute, chapitre, idsSections, casIds, questions.length + i, reserve);
      // On écarte les doublons, y compris les reformulations très proches.
      const doublon = [...dejaEcrites, ...questions].some(
        (autre) => autre.id === q.id || similarite(signature(autre), signature(q)) >= 0.8,
      );
      if (!doublon) questions.push(q);
    }
    lotsSteriles = questions.length === avant ? lotsSteriles + 1 : 0;
  }

  const utilises = new Set(questions.map((q) => q.casId));
  return { questions: questions.slice(0, nombre + 2), cas: cas.filter((k) => utilises.has(k.id)) };
}

export async function genererChapitres(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  await enParallele(c.memoire.liste<Chapitre>('chapitres').filter((x) => x.aGenerer), CHAPITRES_EN_PARALLELE, async (chapitre) => {
    if (tempsEcoule(c)) return;
    const { texte: cours, fichiers, complet } = coursDuChapitre(c, chapitre);
    // On attend que tous les fichiers du chapitre soient lus avant de générer.
    if (!complet || !cours) return;

    try {
      const questionsChapitre = c.memoire.liste<Question>('questions').filter((q) => q.chapitreId === chapitre.id);
      const annales = questionsChapitre.filter((q) => q.source === 'annale');
      const enoncesAnnales = annales.map((q) => signature(q));

      // 1. Fiche de révision, illustrée (figures du cours, images libres, schémas).
      const { pieces, figures } = await ressourcesDuChapitre(c, fichiers);
      const redigee = validerFiche(
        await ia.json({
          niveau: 'masse',
          etape: 'Fiches de révision',
          systeme: SYSTEME,
          consigne: consigneFiche(chapitre.titre, cours, enoncesAnnales),
          pieces,
        }),
        chapitre.id,
      );
      const resume = redigee.resume;
      if (redigee.sections.length === 0) throw new Error('Fiche vide');
      const sections = await illustrerSections(redigee.sections, redigee.indications, figures);
      const utilises = mediasUtilises(sections);
      await c.memoire.ecrire(
        'medias',
        ...figures.filter((f) => utilises.has(f.media.id)).map((f) => f.media),
      );
      const ancienne = c.memoire.lire<Fiche>('fiches', chapitre.id);
      const fiche: Fiche = {
        id: chapitre.id,
        chapitreId: chapitre.id,
        matiereId: chapitre.matiereId,
        titre: chapitre.titre,
        sections,
        version: (ancienne?.version ?? 0) + 1,
        genereLe: c.maintenant,
      };
      const plan = sections.map((s) => ({ id: s.id, titre: s.titre }));

      // 2. QCM : 20 à 50 questions d'entraînement au total, annales comprises.
      const cible = nbQuestionsCible(tokensDuTexte(cours));
      const aEcrire = Math.min(50, Math.max(10, cible - annales.length));
      const entrainement = await ecrireQuestions(c, chapitre, cours, plan, aEcrire, annales, enoncesAnnales, false);
      // 3. Réserve d'examen blanc : questions gardées inédites.
      const reserve = await ecrireQuestions(
        c,
        chapitre,
        cours,
        plan,
        nbQuestionsReserve(cible),
        [...annales, ...entrainement.questions],
        enoncesAnnales,
        true,
      );

      // 4. Flashcards.
      const cartes = validerFlashcards(
        await ia.json({
          niveau: 'masse',
          etape: 'Flashcards',
          systeme: SYSTEME,
          consigne: consigneFlashcards(chapitre.titre, cours, Math.min(30, Math.max(10, Math.round(tokensDuTexte(cours) / 600)))),
          maxSortie: 8000,
        }),
      ).map(
        (f): Flashcard => ({
          id: `fl-${chapitre.id}-${empreinte(f.recto)}`,
          matiereId: chapitre.matiereId,
          chapitreId: chapitre.id,
          ...f,
        }),
      );

      // Remplacement de l'ancien contenu généré du chapitre.
      const nouvelles = [...entrainement.questions, ...reserve.questions];
      const nouveauxCas = [...entrainement.cas, ...reserve.cas];
      const gardees = new Set([...nouvelles.map((q) => q.id), ...nouveauxCas.map((k) => k.id), ...cartes.map((f) => f.id)]);
      await c.memoire.ecrire('fiches', fiche);
      await c.memoire.ecrire('cas', ...nouveauxCas);
      await c.memoire.ecrire('questions', ...nouvelles);
      await c.memoire.ecrire('flashcards', ...cartes);
      await c.memoire.supprimer(
        'questions',
        ...questionsChapitre.filter((q) => q.source === 'genere' && !gardees.has(q.id)).map((q) => q.id),
      );
      await c.memoire.supprimer(
        'cas',
        ...c.memoire
          .liste<CasClinique>('cas')
          .filter((k) => k.chapitreId === chapitre.id && k.id.startsWith(`cas-${chapitre.id}-`) && !gardees.has(k.id))
          .map((k) => k.id),
      );
      await c.memoire.supprimer(
        'flashcards',
        ...c.memoire
          .liste<Flashcard>('flashcards')
          .filter((f) => f.chapitreId === chapitre.id && !gardees.has(f.id))
          .map((f) => f.id),
      );

      const premiereFois = chapitre.version === 0;
      await c.memoire.ecrire<Chapitre>('chapitres', {
        ...(c.memoire.lire<Chapitre>('chapitres', chapitre.id) ?? chapitre),
        ...(resume ? { resume } : {}),
        aGenerer: false,
        // Le cours vient d'être (re)généré : on le compare à ses versions plus anciennes.
        aComparer: true,
        majEnAttente: false,
        version: chapitre.version + 1,
      });
      for (const f of fichiers) {
        const courant = c.memoire.lire<Fichier>('fichiers', f.id) ?? f;
        if (aTraiter(courant)) {
          await c.memoire.ecrire<Fichier>('fichiers', { ...courant, etat: 'a_jour', versionTraitee: courant.modifieLe });
        }
      }
      await notifier(c, {
        id: `generation:${chapitre.id}:${chapitre.version + 1}`,
        type: premiereFois ? 'nouveau_chapitre' : 'generation',
        titre: premiereFois ? 'Nouveau chapitre ajouté' : 'Chapitre mis à jour',
        message: `« ${chapitre.titre} » : fiche, ${entrainement.questions.length} QCM, ${reserve.questions.length} questions d'examen blanc et ${cartes.length} flashcards ${premiereFois ? 'générés' : 'régénérés'}.`,
        chapitreId: chapitre.id,
      });
      journal(`Chapitre généré : ${nouvelles.length} questions, ${cartes.length} flashcards`);
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Génération d'un chapitre en échec : ${erreurPublique(erreur)}`);
    }
  });
}

/** Ajoute des questions d'examen blanc inédites à un chapitre (à la demande). */
export async function ajouterQuestions(c: Contexte, chapitreId: string, nombre = 10): Promise<number> {
  const chapitre = c.memoire.lire<Chapitre>('chapitres', chapitreId);
  if (!chapitre) return 0;
  const { texte: cours } = coursDuChapitre(c, chapitre);
  if (!cours) return 0;
  const existantes = c.memoire.liste<Question>('questions').filter((q) => q.chapitreId === chapitreId);
  const plan = (c.memoire.lire<Fiche>('fiches', chapitreId)?.sections ?? []).map((s) => ({ id: s.id, titre: s.titre }));
  const { questions, cas } = await ecrireQuestions(
    c,
    chapitre,
    cours,
    plan,
    nombre,
    existantes,
    existantes.filter((q) => q.source === 'annale').map((q) => signature(q)),
    true,
  );
  await c.memoire.ecrire('cas', ...cas);
  await c.memoire.ecrire('questions', ...questions);
  return questions.length;
}

// ---------------------------------------------------------------------------
// Détection des erreurs dans les sources
// ---------------------------------------------------------------------------

export async function verifierChapitres(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  await enParallele(c.memoire.liste<Chapitre>('chapitres').filter((x) => x.aVerifier && !x.aGenerer), CHAPITRES_EN_PARALLELE, async (chapitre) => {
    if (tempsEcoule(c)) return;
    const { texte: cours, fichiers, complet } = coursDuChapitre(c, chapitre);
    const annales = c.memoire
      .liste<Question>('questions')
      .filter((q) => q.chapitreId === chapitre.id && q.source === 'annale')
      .slice(0, 60);
    if (!complet) return;
    if (!cours && annales.length === 0) {
      await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aVerifier: false });
      return;
    }

    try {
      const refs = new Map(annales.map((q, i) => [`q${i + 1}`, q]));
      const autres = c.memoire
        .liste<Chapitre>('chapitres')
        .filter((x) => x.matiereId === chapitre.matiereId && x.id !== chapitre.id);
      const proposees = validerAnomalies(
        await ia.json({
          niveau: 'expert',
          etape: "Détection d'erreurs",
          systeme: SYSTEME,
          consigne: consigneErreurs(
            chapitre.titre,
            cours,
            [...refs].map(([ref, q]) => pourIa(ref, q, true)),
            autres,
          ),
        }),
        {
          chapitreId: chapitre.id,
          questions: refs,
          chapitres: new Map(autres.map((x) => [x.id, { matiereId: x.matiereId }])),
          fichierCours: fichiers[0] ? { id: fichiers[0].id, nom: fichiers[0].nom } : undefined,
          nomsFichiers: new Map(c.memoire.liste<Fichier>('fichiers').map((f) => [f.id, f.nom])),
          maintenant: c.maintenant,
        },
      );
      // Une anomalie déjà proposée (validée, refusée ou en attente) n'est pas reproposée.
      const nouvelles = proposees.filter((a) => !c.memoire.lire<Anomalie>('anomalies', a.id));
      await c.memoire.ecrire('anomalies', ...nouvelles);
      await c.memoire.ecrire<Chapitre>('chapitres', {
        ...(c.memoire.lire<Chapitre>('chapitres', chapitre.id) ?? chapitre),
        aVerifier: false,
      });
      if (nouvelles.length > 0) {
        await notifier(c, {
          id: `anomalies:${chapitre.id}:${empreinte(nouvelles.map((a) => a.id).join())}`,
          type: 'anomalies',
          titre: 'Des erreurs possibles ont été détectées',
          message: `${nouvelles.length} correction${nouvelles.length > 1 ? 's' : ''} proposée${nouvelles.length > 1 ? 's' : ''} pour « ${chapitre.titre} ». Rien n'est appliqué sans ta validation.`,
          chapitreId: chapitre.id,
        });
      }
      journal(`Chapitre vérifié : ${nouvelles.length} corrections proposées`);
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Vérification d'un chapitre en échec : ${erreurPublique(erreur)}`);
    }
  });
}
