/**
 * Appels à l'IA (Gemini).
 *
 * Deux niveaux de modèle : « masse » (économique : lecture des scans,
 * extraction des annales, fiches, QCM) et « expert » (plus puissant, réservé
 * à la détection d'erreurs et aux corrigés manquants). Les modèles sont
 * choisis dans la liste que l'API publie le jour de l'exécution, pour ne pas
 * dépendre d'un nom de modèle figé dans le code.
 *
 * Chaque appel renvoie du JSON, vérifié ensuite par `validation.ts`. La
 * consommation est comptée et un plafond de dépense arrête le traitement.
 */
import { GoogleGenAI, type Part } from '@google/genai';
import { choisirModele } from '../shared/modeles';
import type { TarifModele } from '../shared/types';
import { journal } from './journal';
import { Compteur, tarifPour, type Niveau } from './tarifs';

export interface Piece {
  octets: Uint8Array;
  mimeType: string;
}

export interface DemandeIa {
  niveau: Niveau;
  /** Nom de l'étape, pour le suivi des coûts. */
  etape: string;
  systeme: string;
  consigne: string;
  pieces?: Piece[];
  maxSortie?: number;
}

export interface Ia {
  /** Envoie la demande et renvoie la réponse JSON décodée (non validée). */
  json(demande: DemandeIa): Promise<unknown>;
  readonly modeles: Record<Niveau, string>;
  readonly tarifs: Record<Niveau, TarifModele>;
  readonly compteur: Compteur;
}

export class PlafondAtteint extends Error {
  constructor(readonly depenseUsd: number) {
    super(`Plafond de dépense atteint (${depenseUsd.toFixed(2)} $)`);
    this.name = 'PlafondAtteint';
  }
}

/** La limite du palier gratuit (ou un quota) est atteinte : le travail reprendra plus tard. */
export class QuotaAtteint extends Error {
  constructor() {
    super('Limite de requêtes atteinte');
    this.name = 'QuotaAtteint';
  }
}

/** Au-delà de cette taille, les pièces passent par l'API de fichiers. */
const TAILLE_EN_LIGNE_MAX = 12_000_000;
const ESSAIS = 4;
/** Écart minimal entre deux requêtes en mode gratuit (≈ 7 requêtes par minute). */
const ECART_GRATUIT_MS = 8500;

export { choisirModele };

/**
 * Lit une erreur 429 de Gemini : limite par jour (inutile d'attendre) ou par
 * minute (on peut réessayer après le délai indiqué). Le message de Google
 * contient l'identifiant du quota touché et, souvent, le délai conseillé.
 */
export function analyser429(erreur: unknown): { quotidien: boolean; delaiMs?: number; quota?: string } {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  const quota = /"quotaId"\s*:\s*"([^"]+)"/.exec(message)?.[1];
  const quotidien = /PerDay/i.test(quota ?? '') || /per\s*day|requests per day/i.test(message);
  const delai = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message)?.[1] ?? /retry in (\d+(?:\.\d+)?)s/i.exec(message)?.[1];
  return { quotidien, quota, ...(delai ? { delaiMs: Math.ceil(Number(delai) * 1000) + 1500 } : {}) };
}

/** Plus long que cela, on laisse le prochain passage reprendre. */
const ATTENTE_429_MAX_MS = 150_000;
const ATTENTES_429_MAX = 8;

/** Décode la réponse du modèle, en tolérant un bloc de code autour du JSON. */
export function decoderJson(texte: string): unknown {
  const net = texte
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(net);
}

function base64(octets: Uint8Array): string {
  return Buffer.from(octets).toString('base64');
}

export async function iaGemini(options: {
  cle: string;
  modeleMasse?: string;
  modeleExpert?: string;
  tarifs?: TarifModele[];
  /** Dépense maximale autorisée pour ce passage, en dollars. */
  plafondUsd: number;
  /** Palier gratuit : un seul modèle, aucun coût, rythme limité. */
  gratuit?: boolean;
}): Promise<Ia> {
  const gratuit = options.gratuit === true;
  const client = new GoogleGenAI({ apiKey: options.cle });

  const noms: string[] = [];
  for await (const modele of await client.models.list()) {
    if (modele.name && (modele.supportedActions ?? []).includes('generateContent')) noms.push(modele.name);
  }
  const masse = options.modeleMasse || choisirModele(noms, 'flash') || '';
  // Les modèles « Pro » ne sont pas gratuits : en mode gratuit, un seul modèle sert à tout.
  const modeles: Record<Niveau, string> = {
    masse,
    expert: gratuit ? masse : options.modeleExpert || choisirModele(noms, 'pro') || '',
  };
  for (const niveau of ['masse', 'expert'] as const) {
    if (!modeles[niveau]) throw new Error(`Aucun modèle Gemini disponible pour le niveau « ${niveau} »`);
  }
  journal(`Modèles : masse = ${modeles.masse}, expert = ${modeles.expert}${gratuit ? ' (mode gratuit)' : ''}`);

  const sansCout = (modele: string): TarifModele => ({ modele, entreeUsdParM: 0, sortieUsdParM: 0, aVerifier: false });
  const tarifs: Record<Niveau, TarifModele> = gratuit
    ? { masse: sansCout(modeles.masse), expert: sansCout(modeles.expert) }
    : {
        masse: tarifPour(modeles.masse, 'masse', options.tarifs),
        expert: tarifPour(modeles.expert, 'expert', options.tarifs),
      };
  const compteur = new Compteur();
  let dernierAppel = 0;

  const enParties = async (pieces: Piece[]): Promise<{ parties: Part[]; aSupprimer: string[] }> => {
    const parties: Part[] = [];
    const aSupprimer: string[] = [];
    for (const piece of pieces) {
      if (piece.octets.byteLength <= TAILLE_EN_LIGNE_MAX) {
        parties.push({ inlineData: { data: base64(piece.octets), mimeType: piece.mimeType } });
        continue;
      }
      const fichier = await client.files.upload({
        file: new Blob([piece.octets.slice()], { type: piece.mimeType }),
        config: { mimeType: piece.mimeType },
      });
      if (fichier.uri) parties.push({ fileData: { fileUri: fichier.uri, mimeType: piece.mimeType } });
      if (fichier.name) aSupprimer.push(fichier.name);
    }
    return { parties, aSupprimer };
  };

  return {
    modeles,
    tarifs,
    compteur,
    async json(demande) {
      if (compteur.total >= options.plafondUsd) throw new PlafondAtteint(compteur.total);
      if (gratuit) {
        // Le palier gratuit limite le nombre de requêtes par minute.
        const attente = dernierAppel + ECART_GRATUIT_MS - Date.now();
        if (attente > 0) await new Promise((r) => setTimeout(r, attente));
        dernierAppel = Date.now();
      }
      const { parties, aSupprimer } = await enParties(demande.pieces ?? []);
      try {
        let rappel = '';
        let attentes429 = 0;
        for (let essai = 1; ; essai++) {
          try {
            const reponse = await client.models.generateContent({
              model: modeles[demande.niveau],
              contents: [{ role: 'user', parts: [...parties, { text: demande.consigne + rappel }] }],
              config: {
                systemInstruction: demande.systeme,
                responseMimeType: 'application/json',
                temperature: 0.2,
                maxOutputTokens: demande.maxSortie ?? 32_000,
              },
            });
            const usage = reponse.usageMetadata;
            const prix = compteur.ajouter(
              demande.etape,
              tarifs[demande.niveau],
              usage?.promptTokenCount ?? 0,
              // Les tokens de réflexion sont facturés comme des tokens écrits.
              (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
            );
            journal(`IA ${demande.etape} : ${prix.toFixed(4)} $ (total ${compteur.total.toFixed(2)} $)`);
            return decoderJson(reponse.text ?? '');
          } catch (erreur) {
            const statut = (erreur as { status?: number }).status;
            const reessayable =
              erreur instanceof SyntaxError || statut === 429 || (statut !== undefined && statut >= 500);
            if (statut === 429) {
              // Limite par minute : on attend le délai indiqué et on recommence, sans compter d'essai.
              const info = analyser429(erreur);
              const delai = info.delaiMs ?? 35_000;
              if (!info.quotidien && delai <= ATTENTE_429_MAX_MS && attentes429 < (info.delaiMs ? ATTENTES_429_MAX : 2)) {
                attentes429 += 1;
                journal(`Limite par minute (${info.quota ?? 'quota non précisé'}) : attente de ${Math.round(delai / 1000)} s`);
                await new Promise((r) => setTimeout(r, delai));
                essai -= 1;
                continue;
              }
              journal(`Limite atteinte (${info.quota ?? 'quota non précisé'}${info.quotidien ? ', quotidienne' : ''}) : reprise au prochain passage`);
              throw new QuotaAtteint();
            }
            if (!reessayable || essai >= ESSAIS) throw erreur;
            if (erreur instanceof SyntaxError) {
              rappel = '\n\nTa réponse précédente n’était pas un JSON valide. Réponds uniquement par le JSON demandé.';
            }
            await new Promise((r) => setTimeout(r, 3000 * 2 ** (essai - 1)));
          }
        }
      } finally {
        for (const nom of aSupprimer) await client.files.delete({ name: nom }).catch(() => undefined);
      }
    },
  };
}
