/**
 * Entraînements sur mesure demandés dans l'app : le pipeline écrit les
 * questions selon les règles de l'étudiant (types, difficulté, pièges,
 * consignes libres), par lots répartis sur les chapitres. Les questions sont
 * enregistrées au fur et à mesure, donc utilisables avant la fin ; une
 * notification prévient quand tout est prêt.
 */
import { SEUIL_SIMILARITE, similarite } from '../shared/recurrence';
import type { CasClinique, Chapitre, Entrainement, Question } from '../shared/types';
import { estArret, notifier, tempsEcoule, type Contexte } from './contexte';
import { coursDuChapitre } from './generation';
import { journal } from './journal';
import { consigneSurMesure } from './prompts';
import { SYSTEME } from './prompts';
import { empreinte, signature, validerLotQuestions } from './validation';

const LOT_MAX = 15;
const NOMBRE_MAX = 500;
/** Une demande « en cours » depuis plus longtemps est considérée comme interrompue. */
const DELAI_REPRISE_MS = 2 * 3_600_000;

export function entrainementsATraiter(c: Pick<Contexte, 'memoire' | 'maintenant'>): Entrainement[] {
  return c.memoire
    .liste<Entrainement>('entrainements')
    .filter((e) => e.statut === 'en_attente' || (e.statut === 'en_cours' && c.maintenant - e.majLe > DELAI_REPRISE_MS))
    .sort((a, b) => a.creeLe - b.creeLe);
}

/** Chapitres visés par les règles, avec un cours lisible. */
function chapitresVises(c: Contexte, e: Entrainement): { chapitre: Chapitre; cours: string }[] {
  const { matiereId, chapitreIds } = e.regles;
  return c.memoire
    .liste<Chapitre>('chapitres')
    .filter((ch) => (chapitreIds.length ? chapitreIds.includes(ch.id) : !matiereId || ch.matiereId === matiereId))
    .map((chapitre) => ({ chapitre, ...coursDuChapitre(c, chapitre) }))
    .filter((x) => x.complet && x.texte)
    .map((x) => ({ chapitre: x.chapitre, cours: x.texte }));
}

/** Traite les entraînements en attente ; renvoie le nombre de questions créées. Relance l'arrêt (quota) tel quel. */
export async function traiterEntrainements(c: Contexte): Promise<number> {
  const ia = c.ia;
  if (!ia) return 0;
  let creees = 0;

  for (const e0 of entrainementsATraiter(c)) {
    let e: Entrainement = { ...e0, statut: 'en_cours', majLe: c.maintenant };
    await c.memoire.ecrire<Entrainement>('entrainements', e);
    const regles = e.regles;
    const nombre = Math.min(NOMBRE_MAX, Math.max(1, Math.round(regles.nombre)));
    const vises = chapitresVises(c, e);

    if (vises.length === 0) {
      await c.memoire.ecrire<Entrainement>('entrainements', {
        ...e,
        statut: 'erreur',
        message: 'Aucun cours prêt pour ces chapitres : attends la fin de l’import, ou choisis d’autres chapitres.',
        majLe: Date.now(),
      });
      continue;
    }

    const existantes = c.memoire.liste<Question>('questionsPerso').filter((q) => q.entrainementId === e.id);
    let faites = existantes.length;
    const cible = Math.ceil(nombre / vises.length);
    let steriles = 0;

    try {
      for (const { chapitre, cours } of vises) {
        if (faites >= nombre || tempsEcoule(c) || steriles >= 3) break;
        let duChapitre = existantes.filter((q) => q.chapitreId === chapitre.id).length;
        while (duChapitre < cible && faites < nombre && steriles < 3 && !tempsEcoule(c)) {
          const demande = Math.min(LOT_MAX, cible - duChapitre, nombre - faites);
          const deja = [
            ...c.memoire.liste<Question>('questions').filter((q) => q.chapitreId === chapitre.id),
            ...c.memoire.liste<Question>('questionsPerso').filter((q) => q.chapitreId === chapitre.id),
          ];
          const { questions: brutes, cas: casBruts } = validerLotQuestions(
            await ia.json({
              niveau: 'masse',
              etape: 'Entraînement sur mesure',
              systeme: SYSTEME,
              consigne: consigneSurMesure({
                titre: chapitre.titre,
                cours,
                nombre: demande,
                dejaPosees: deja.map((q) => q.enonce),
                types: regles.types,
                casCliniques: regles.casCliniques,
                difficulte: regles.difficulte,
                pieges: regles.pieges,
                consignes: regles.consignes,
              }),
              maxSortie: 32_000,
            }),
          );

          const casIds = new Map<string, string>();
          const cas: CasClinique[] = [];
          if (regles.casCliniques) {
            for (const k of casBruts) {
              const id = `cas-qp-${e.id.slice(0, 12)}-${empreinte(k.vignette)}`;
              casIds.set(k.ref, id);
              cas.push({ id, matiereId: chapitre.matiereId, chapitreId: chapitre.id, titre: k.titre || 'Cas clinique', vignette: k.vignette });
            }
          }

          const nouvelles: Question[] = [];
          for (const brute of brutes) {
            if (regles.types.length && !regles.types.includes(brute.type)) continue;
            const { section: _s, casRef, ...reste } = brute;
            const casId = regles.casCliniques && casRef ? casIds.get(casRef) : undefined;
            const q: Question = {
              ...reste,
              id: `qp-${e.id.slice(0, 12)}-${empreinte(signature(brute))}`,
              matiereId: chapitre.matiereId,
              chapitreId: chapitre.id,
              source: 'genere',
              perso: true,
              entrainementId: e.id,
              ...(casId ? { casId, ordreCas: nouvelles.length } : {}),
              version: 1,
            };
            const doublon = [...deja, ...nouvelles].some((a) => a.id === q.id || similarite(signature(a), signature(q)) >= SEUIL_SIMILARITE);
            if (!doublon && faites + nouvelles.length < nombre) nouvelles.push(q);
          }

          if (nouvelles.length === 0) {
            steriles += 1;
            continue;
          }
          steriles = 0;
          const utilises = new Set(nouvelles.map((q) => q.casId));
          await c.memoire.ecrire('cas', ...cas.filter((k) => utilises.has(k.id)));
          await c.memoire.ecrire<Question>('questionsPerso', ...nouvelles);
          faites += nouvelles.length;
          duChapitre += nouvelles.length;
          creees += nouvelles.length;
          e = { ...e, questionIds: [...e.questionIds, ...nouvelles.map((q) => q.id)], majLe: Date.now() };
          await c.memoire.ecrire<Entrainement>('entrainements', e);
        }
      }
    } catch (erreur) {
      if (estArret(erreur)) {
        // Limite gratuite : ce qui est écrit est gardé, la suite reprendra au prochain passage.
        await c.memoire.ecrire<Entrainement>('entrainements', { ...e, statut: 'en_attente', majLe: Date.now() });
        throw erreur;
      }
      journal(`Entraînement sur mesure : échec (${(erreur as Error).name})`);
      await c.memoire.ecrire<Entrainement>('entrainements', { ...e, statut: 'erreur', message: 'La génération a échoué. Relance l’entraînement dans quelques minutes.', majLe: Date.now() });
      continue;
    }

    const incomplet = faites < nombre;
    if (incomplet && tempsEcoule(c) && steriles < 3) {
      // Temps du passage écoulé : la suite reprendra au prochain passage.
      await c.memoire.ecrire<Entrainement>('entrainements', { ...e, statut: 'en_attente', majLe: Date.now() });
      continue;
    }
    await c.memoire.ecrire<Entrainement>('entrainements', {
      ...e,
      statut: 'pret',
      message: incomplet ? `${faites} questions distinctes sur ${nombre} demandées : le cours ne permet pas d'en écrire davantage sans répéter.` : undefined,
      majLe: Date.now(),
    });
    await notifier(c, {
      id: `entrainement:${e.id}`,
      type: 'generation',
      titre: 'Ton entraînement est prêt',
      message: `« ${e.titre} » : ${faites} question${faites > 1 ? 's' : ''} prête${faites > 1 ? 's' : ''}.`,
    });
  }
  return creees;
}

