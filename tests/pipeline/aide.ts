/**
 * Doublures pour tester le pipeline sans réseau : un stockage en mémoire,
 * un faux drive et une fausse IA qui répond selon l'étape demandée.
 */
import type { Collection } from '../../shared/collections';
import type { Drive, FichierDrive } from '../../pipeline/drive';
import { pagesDepuisTextes, type Lecture } from '../../pipeline/extraction';
import type { DemandeIa, Ia } from '../../pipeline/ia';
import type { Stockage } from '../../pipeline/stockage';
import { Compteur, tarifPour } from '../../pipeline/tarifs';

export class StockageMemoire implements Stockage {
  readonly tables = new Map<Collection, Map<string, { id: string }>>();
  jeton: string | undefined = 'jeton-de-test';

  table(collection: Collection): Map<string, { id: string }> {
    let table = this.tables.get(collection);
    if (!table) {
      table = new Map();
      this.tables.set(collection, table);
    }
    return table;
  }

  async lire<T extends { id: string }>(collection: Collection): Promise<T[]> {
    return structuredClone([...this.table(collection).values()]) as T[];
  }

  async ecrire<T extends { id: string }>(collection: Collection, docs: T[]): Promise<void> {
    for (const d of docs) this.table(collection).set(d.id, structuredClone(d));
  }

  async supprimer(collection: Collection, ids: string[]): Promise<void> {
    for (const id of ids) this.table(collection).delete(id);
  }

  async jetonDrive(): Promise<string | undefined> {
    return this.jeton;
  }

  liste<T>(collection: Collection): T[] {
    return [...this.table(collection).values()] as T[];
  }

  un<T>(collection: Collection, id: string): T | undefined {
    return this.table(collection).get(id) as T | undefined;
  }
}

export interface FichierTest extends FichierDrive {
  /** Texte du fichier ; les pages sont séparées par un saut de page (\f). */
  contenu: string;
}

export class DriveMemoire implements Drive {
  dossiers = new Map<string, FichierTest[]>();
  telechargements = 0;

  async lister(dossierId: string): Promise<FichierDrive[]> {
    return (this.dossiers.get(dossierId) ?? []).map(({ contenu: _contenu, ...f }) => f);
  }

  async telecharger(fichier: FichierDrive): Promise<{ octets: Uint8Array; mimeType: string }> {
    this.telechargements += 1;
    const trouve = [...this.dossiers.values()].flat().find((f) => f.id === fichier.id);
    if (!trouve) throw new Error('Fichier introuvable');
    return { octets: new TextEncoder().encode(trouve.contenu), mimeType: 'application/pdf' };
  }
}

/** Lecture locale simulée : le « PDF » est du texte, une page par saut de page. */
export async function lireTest(octets: Uint8Array): Promise<Lecture> {
  const pages = new TextDecoder().decode(octets).split('\f');
  return { ...pagesDepuisTextes(pages), piece: { octets, mimeType: 'application/pdf' } };
}

export function fichier(id: string, chemin: string, contenu: string, modifieLe = '2026-11-01T10:00:00Z'): FichierTest {
  return {
    id,
    nom: chemin.split('/').at(-1)!,
    chemin,
    mimeType: 'application/pdf',
    modifieLe,
    contenu,
  };
}

const QCM = (n: number, depart: number) => ({
  cas: [],
  questions: Array.from({ length: n }, (_, i) => {
    const k = depart + i;
    return {
      type: 'multiple',
      enonce: `Question inédite numéro ${k} sur le thème ${['alpha', 'beta', 'gamma', 'delta', 'epsilon'][k % 5]} variante ${k * 7919}`,
      propositions: [
        { texte: `Proposition juste ${k}`, correcte: true },
        { texte: `Proposition fausse ${k}`, correcte: false, explication: 'Confusion classique.' },
        { texte: `Autre proposition fausse ${k}`, correcte: false },
      ],
      explication: `Explication de la question ${k}.`,
      rappel: `Rappel de cours ${k}.`,
      section: 'section-inconnue',
      difficulte: (k % 3) + 1,
      piege: false,
      casRef: null,
    };
  }),
});

export class IaTest implements Ia {
  readonly modeles = { masse: 'gemini-test-flash', expert: 'gemini-test-pro' };
  readonly tarifs = {
    masse: tarifPour('gemini-test-flash', 'masse'),
    expert: tarifPour('gemini-test-pro', 'expert'),
  };
  readonly compteur = new Compteur();
  readonly appels: DemandeIa[] = [];
  private numero = 0;

  constructor(
    private readonly plafondUsd: number,
    /** Coût fictif de chaque appel, en tokens écrits. */
    private readonly tokensParAppel = 1000,
  ) {}

  async json(demande: DemandeIa): Promise<unknown> {
    if (this.compteur.total >= this.plafondUsd) {
      throw Object.assign(new Error('Plafond'), { name: 'PlafondAtteint' });
    }
    this.appels.push(demande);
    this.compteur.ajouter(demande.etape, this.tarifs[demande.niveau], 1000, this.tokensParAppel);
    return this.repondre(demande);
  }

  private repondre({ etape, consigne }: DemandeIa): unknown {
    if (etape === 'Lecture des pages scannées') {
      const pages = /pages suivantes : ([\d, ]+)/.exec(consigne)![1]!.split(',').map((n) => Number(n.trim()));
      return {
        pages: pages.map((page) => ({
          page,
          texte: `Texte lu sur la page scannée ${page}, proposition D : [ILLISIBLE]`,
          illisibles: ['Proposition D : annotation manuscrite illisible'],
        })),
      };
    }
    if (etape === 'Classement en matières et chapitres') {
      const lignes = [...consigne.matchAll(/^(f\d+) \| (cours|annales) \| ([^|]+) \|/gm)];
      const matieres = new Map<string, string>();
      const chapitres = new Map<string, { ref: string; matiere: string; titre: string }>();
      const fichiers = lignes.map(([, ref, dossier, chemin]) => {
        const segments = chemin!.trim().split('/');
        const nomMatiere = segments[0]!;
        if (!matieres.has(nomMatiere)) matieres.set(nomMatiere, `m${matieres.size + 1}`);
        const matiere = matieres.get(nomMatiere)!;
        if (dossier === 'annales') {
          const nom = segments.at(-1)!;
          return {
            ref,
            role: /corrig/i.test(nom) ? 'corrige' : 'annale',
            matiere,
            chapitre: null,
            partiel: { libelle: `Partiel ${/\d{4}/.exec(nom)?.[0] ?? ''}`.trim(), date: /\d{4}/.exec(nom)?.[0] ?? null },
          };
        }
        const titre = segments.at(-1)!.replace(/\.pdf$/, '');
        if (!chapitres.has(titre)) chapitres.set(titre, { ref: `c${chapitres.size + 1}`, matiere, titre });
        return { ref, role: 'cours', matiere, chapitre: chapitres.get(titre)!.ref, partiel: null };
      });
      return {
        matieres: [...matieres].map(([nom, ref]) => ({ ref, nom })),
        chapitres: [...chapitres.values()],
        fichiers,
      };
    }
    if (etape === 'Extraction des annales') {
      // Les sujets de test contiennent des lignes « Q<n>: énoncé | A) … | B) … | REP: A,B ».
      const questions = [...consigne.matchAll(/^Q(\d+): (.+)$/gm)].map(([, numero, reste]) => {
        const [enonce, ...parties] = reste!.split(' | ');
        const reponse = parties.find((p) => p.startsWith('REP:'));
        return {
          numero,
          page: 1,
          type: 'multiple',
          enonce,
          propositions: parties.filter((p) => !p.startsWith('REP:')).map((p) => ({ texte: p.replace(/^[A-E]\) /, '') })),
          reponsesCorrectes: reponse ? reponse.replace('REP:', '').trim().split(',') : null,
          trous: null,
          cas: null,
        };
      });
      return { partiel: { libelle: 'Partiel', date: null }, questions, illisibles: [] };
    }
    if (etape === 'Classement et explications des annales') {
      if (consigne.startsWith('Rattache chaque question')) {
        const chapitres = [...consigne.matchAll(/^- (c-[^ ]+) : /gm)].map((m) => m[1]!);
        const refs = [...consigne.matchAll(/^(q\d+) : /gm)].map((m) => m[1]!);
        return { classement: refs.map((ref) => ({ ref, chapitre: chapitres[0] ?? null })) };
      }
      const refs = [...consigne.matchAll(/^(q\d+)(?: \(page \d+\))? : /gm)].map((m) => m[1]!);
      return {
        explications: refs.map((ref) => ({
          ref,
          explication: `Explication du corrigé de ${ref}.`,
          rappel: 'Rappel de cours.',
          difficulte: 2,
          piege: false,
        })),
      };
    }
    if (etape === 'Corrigés manquants') {
      const refs = [...consigne.matchAll(/^(q\d+)(?: \(page \d+\))? : /gm)].map((m) => m[1]!);
      return {
        reponses: refs.map((ref) => ({
          ref,
          correctes: ['A'],
          explication: `Réponse établie d'après le cours pour ${ref}.`,
          rappel: 'Rappel.',
          difficulte: 2,
          incertain: false,
        })),
      };
    }
    if (etape === 'Fiches de révision') {
      return {
        resume: 'Résumé du chapitre.',
        sections: [
          {
            titre: 'Définition',
            blocs: [
              { type: 'texte', contenu: 'Définition courte.' },
              { type: 'cles', elements: ['Point clé'] },
              { type: 'tableau', lignes: [['interdit']] },
              {
                type: 'arbre',
                racine: { label: 'Situation', branches: [{ condition: 'si oui', noeud: { label: 'Conduite à tenir' } }] },
              },
            ],
          },
          { titre: 'Traitement', blocs: [{ type: 'liste', elements: ['Premier traitement', 'Second traitement'] }] },
        ],
      };
    }
    if (etape === 'QCM et examens blancs') {
      const n = Number(/^Écris (\d+) questions/.exec(consigne)![1]);
      this.numero += n;
      return QCM(n, this.numero - n);
    }
    if (etape === 'Flashcards') {
      return { flashcards: Array.from({ length: 10 }, (_, i) => ({ recto: `Recto ${i}`, verso: `Verso ${i}` })) };
    }
    if (etape === "Détection d'erreurs") {
      return {
        anomalies: [
          {
            type: 'faute',
            question: null,
            page: 2,
            ligne: null,
            extrait: 'Valeur erronée',
            description: 'Une valeur du cours est fausse.',
            correction: 'La valeur exacte est 40 %.',
            explication: 'Le même cours donne 40 % plus loin.',
            source: 'Cours, page 3.',
            bonnesReponses: null,
            chapitreCorrect: null,
            texteCorrige: null,
          },
          // Sans source : doit être écartée.
          { type: 'faute', question: null, description: 'Vague', correction: 'Autre', explication: 'Parce que', source: '' },
        ],
      };
    }
    throw new Error(`Étape inattendue : ${etape}`);
  }
}

export const COURS = 'dossier-cours-0001';
export const ANNALES = 'dossier-annales-0001';
