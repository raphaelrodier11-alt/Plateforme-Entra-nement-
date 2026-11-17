/**
 * Actualisations : ce qui a changé d'une version d'un cours à l'autre.
 *
 * Deux comparaisons, refaites automatiquement dès que l'un des fichiers
 * change :
 *  - le cours actuel face à l'ancienne série (fichiers « anciens ») ;
 *  - le cours actuel face à sa version précédente, quand le fichier a été
 *    remplacé par une nouvelle version.
 */
import type { Actualisation, Chapitre, Fichier } from '../shared/types';
import { avecPages, CHAPITRES_EN_PARALLELE, enParallele, iaRequise, notifier, tempsEcoule, texteDe, type Contexte, estArret } from './contexte';
import { aTraiter, idPrecedent } from './import';
import { erreurPublique, journal } from './journal';
import { SYSTEME, consigneActualisation } from './prompts';
import { empreinte, validerActualisation } from './validation';

/** Texte complet d'un fichier (précédé de son nom), ou `undefined` s'il n'est pas encore entièrement lu. */
function texteComplet(c: Contexte, id: string, nom: string): { texte: string; version: string } | undefined {
  const t = texteDe(c, id);
  if (!t || t.pagesAOcr.length > 0) return undefined;
  const contenu = avecPages(t);
  return contenu ? { texte: `##### Fichier : ${nom}\n${contenu}`, version: t.version } : undefined;
}

/**
 * Les anciennes versions lues sont rattachées à leur chapitre et passent à
 * l'état « traité » : elles ne produisent ni fiche ni QCM.
 */
export async function finaliserAnciens(c: Contexte): Promise<void> {
  for (const f of c.memoire.liste<Fichier>('fichiers')) {
    if (f.role !== 'ancien' || !aTraiter(f) || !f.matiereId) continue;
    const t = texteDe(c, f.id);
    if (!t || t.pagesAOcr.length > 0 || t.version !== f.modifieLe) continue;
    await c.memoire.ecrire<Fichier>('fichiers', { ...f, etat: 'a_jour', versionTraitee: f.modifieLe });
    const chapitre = f.chapitreId ? c.memoire.lire<Chapitre>('chapitres', f.chapitreId) : undefined;
    if (chapitre && !chapitre.aComparer) {
      await c.memoire.ecrire<Chapitre>('chapitres', { ...chapitre, aComparer: true });
    }
  }
}

interface Comparaison {
  origine: Actualisation['origine'];
  signature: string;
  ancien: string;
  fichiers: string[];
}

function comparaisonsDuChapitre(c: Contexte, chapitre: Chapitre, actuel: { texte: string; version: string }[], idsActuels: string[]): Comparaison[] {
  const versionsActuelles = actuel.map((a) => a.version).join('|');
  const resultat: Comparaison[] = [];

  // 1. Anciennes séries.
  const anciens = c.memoire
    .liste<Fichier>('fichiers')
    .filter((f) => f.role === 'ancien' && f.chapitreId === chapitre.id && f.etat !== 'supprime')
    .map((f) => ({ f, t: texteComplet(c, f.id, f.nom) }))
    .filter((x): x is { f: Fichier; t: { texte: string; version: string } } => !!x.t);
  if (anciens.length > 0) {
    resultat.push({
      origine: 'ancien',
      signature: empreinte(`${anciens.map((x) => `${x.f.id}@${x.t.version}`).sort().join('|')}#${versionsActuelles}`),
      ancien: anciens.map((x) => x.t.texte).join('\n\n'),
      fichiers: anciens.map((x) => x.f.nom),
    });
  }

  // 2. Versions précédentes des fichiers de cours remplacés.
  const precedents = idsActuels
    .map((id) => {
      const f = c.memoire.lire<Fichier>('fichiers', id);
      return f ? { f, t: texteComplet(c, idPrecedent(id), f.nom) } : undefined;
    })
    .filter((x): x is { f: Fichier; t: { texte: string; version: string } } => !!x?.t);
  if (precedents.length > 0) {
    resultat.push({
      origine: 'precedente',
      signature: empreinte(`${precedents.map((x) => `${x.f.id}@${x.t.version}`).sort().join('|')}#${versionsActuelles}`),
      ancien: precedents.map((x) => x.t.texte).join('\n\n'),
      fichiers: precedents.map((x) => x.f.nom),
    });
  }
  return resultat;
}

export async function comparer(c: Contexte): Promise<void> {
  const ia = iaRequise(c);
  await enParallele(c.memoire.liste<Chapitre>('chapitres').filter((x) => x.aComparer), CHAPITRES_EN_PARALLELE, async (chapitre) => {
    if (tempsEcoule(c)) return;

    const fichiersCours = chapitre.fichierIds
      .map((id) => c.memoire.lire<Fichier>('fichiers', id))
      .filter((f): f is Fichier => !!f && f.role === 'cours' && f.etat !== 'supprime');
    const actuel = fichiersCours
      .map((f) => texteComplet(c, f.id, f.nom))
      .filter((t): t is { texte: string; version: string } => !!t);
    // Le cours actuel n'est pas encore entièrement lu : on y reviendra.
    if (actuel.length === 0 || actuel.length < fichiersCours.length) return;
    // Si le chapitre doit encore être régénéré à partir d'une nouvelle version, on attend.
    if (fichiersCours.some((f) => f.etat !== 'a_jour' && aTraiter(f))) return;

    try {
      const comparaisons = comparaisonsDuChapitre(c, chapitre, actuel, fichiersCours.map((f) => f.id));
      const gardees = new Set<string>();
      for (const comparaison of comparaisons) {
        const id = `act-${chapitre.id}-${comparaison.origine}`;
        gardees.add(id);
        if (c.memoire.lire<Actualisation>('actualisations', id)?.signature === comparaison.signature) continue;

        const brute = validerActualisation(
          await ia.json({
            niveau: 'masse',
            etape: 'Comparaison des anciennes versions',
            systeme: SYSTEME,
            consigne: consigneActualisation(
              chapitre.titre,
              comparaison.ancien,
              actuel.map((a) => a.texte).join('\n\n'),
              comparaison.origine,
            ),
            maxSortie: 16_000,
          }),
        );
        await c.memoire.ecrire<Actualisation>('actualisations', {
          id,
          chapitreId: chapitre.id,
          matiereId: chapitre.matiereId,
          origine: comparaison.origine,
          signature: comparaison.signature,
          resume: brute.resume,
          changements: brute.changements,
          comparesLe: c.maintenant,
          fichiers: comparaison.fichiers,
        });
        const majeurs = brute.changements.filter((x) => x.importance === 'majeure').length;
        if (brute.changements.length > 0) {
          await notifier(c, {
            id: `actualisation:${id}:${comparaison.signature}`,
            type: 'actualisation',
            titre: 'Un cours a été actualisé',
            message: `« ${chapitre.titre} » : ${brute.changements.length} changement${brute.changements.length > 1 ? 's' : ''}${majeurs ? ` dont ${majeurs} majeur${majeurs > 1 ? 's' : ''}` : ''} par rapport à ${comparaison.origine === 'ancien' ? "l'ancienne version" : 'la version précédente'}.`,
            chapitreId: chapitre.id,
          });
        }
        journal(`Comparaison faite : ${brute.changements.length} changements`);
      }
      // Une comparaison qui n'a plus lieu d'être (ancien fichier retiré) disparaît.
      for (const origine of ['ancien', 'precedente'] as const) {
        const id = `act-${chapitre.id}-${origine}`;
        if (!gardees.has(id) && c.memoire.lire('actualisations', id)) await c.memoire.supprimer('actualisations', id);
      }
      await c.memoire.ecrire<Chapitre>('chapitres', {
        ...(c.memoire.lire<Chapitre>('chapitres', chapitre.id) ?? chapitre),
        aComparer: false,
      });
    } catch (erreur) {
      if (estArret(erreur)) throw erreur;
      journal(`Comparaison en échec : ${erreurPublique(erreur)}`);
    }
  });
}
