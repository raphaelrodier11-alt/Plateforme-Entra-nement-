/**
 * Fichiers : envoi direct des cours et des annales (PDF, Word, PowerPoint,
 * photos de pages), sans passer par Google Drive.
 */
import {
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  Loader,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EXTENSIONS_ACCEPTEES, TAILLE_MAX_FICHIER } from '../../shared/depot';
import type { Depot, Fichier, RoleDepot } from '../../shared/types';
import { Bouton, Carte, Jauge, Onglets, Pastille, TitrePage, nombre } from '../composants/ui';
import { base } from '../db/base';
import { synchroniser } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { envoyerFichier, retirerFichier, verifierFichier, type MotifRefus } from '../lib/depot';
import { useEtatSync } from '../App';

interface Envoi {
  cle: string;
  nom: string;
  part: number;
  erreur?: string;
}

const REFUS: Record<MotifRefus, string> = {
  format: 'Format non pris en charge (PDF, Word, PowerPoint, texte ou image).',
  taille: `Fichier trop gros (${TAILLE_MAX_FICHIER / 1_000_000} Mo au maximum).`,
};

function taille(octets: number): string {
  return octets >= 1_000_000 ? `${nombre(octets / 1_000_000, 1)} Mo` : `${Math.max(1, Math.round(octets / 1000))} Ko`;
}

function statut(depot: Depot, fichier: Fichier | undefined) {
  if (!fichier || fichier.modifieLe !== depot.modifieLe) {
    return { ton: 'neutre' as const, icone: Clock, texte: 'Envoyé, en attente de lecture' };
  }
  if (fichier.etat === 'a_jour') return { ton: 'bon' as const, icone: CircleCheck, texte: 'Lu et traité' };
  if ((fichier.echecs ?? 0) >= 3) {
    return { ton: 'critique' as const, icone: CircleAlert, texte: 'Lecture impossible' };
  }
  return { ton: 'accent' as const, icone: Loader, texte: 'Lu, traitement à venir' };
}

export function Fichiers() {
  const d = useDonnees();
  const sync = useEtatSync();
  const [role, setRole] = useState<RoleDepot>('cours');
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [refus, setRefus] = useState<string[]>([]);
  const champ = useRef<HTMLInputElement>(null);
  const enCours = envois.some((e) => !e.erreur && e.part < 1);
  const hors = sync.statut === 'hors_ligne';

  const envoyer = async (liste: FileList | null) => {
    if (!liste || liste.length === 0) return;
    const fichiers = [...liste];
    if (champ.current) champ.current.value = '';

    const acceptes: File[] = [];
    const messages: string[] = [];
    for (const f of fichiers) {
      const motif = verifierFichier(f);
      if (motif) messages.push(`${f.name} : ${REFUS[motif]}`);
      else acceptes.push(f);
    }
    setRefus(messages);

    const cles = acceptes.map((f, i) => `${Date.now()}-${i}-${f.name}`);
    setEnvois(acceptes.map((f, i) => ({ cle: cles[i]!, nom: f.name, part: 0 })));
    const majEnvoi = (cle: string, partiel: Partial<Envoi>) =>
      setEnvois((liste) => liste.map((e) => (e.cle === cle ? { ...e, ...partiel } : e)));

    // Un fichier après l'autre : plus fiable sur une connexion mobile.
    for (const [i, fichier] of acceptes.entries()) {
      try {
        await envoyerFichier(fichier, role, (part) => majEnvoi(cles[i]!, { part }));
      } catch {
        majEnvoi(cles[i]!, { erreur: "L'envoi a échoué. Vérifie ta connexion et renvoie ce fichier." });
      }
    }
    await synchroniser();
  };

  const retirer = async (depot: Depot) => {
    await retirerFichier(depot.id);
    await base.collection('depots').delete(depot.id);
    void synchroniser();
  };

  const depots = [...d.depots].sort((a, b) => b.ajouteLe - a.ajouteLe);
  const parId = new Map(d.fichiers.map((f) => [f.id, f]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TitrePage
        titre="Fichiers"
        sousTitre="Envoie tes cours et tes annales : l'application en tire les chapitres, les fiches et les QCM."
      />

      <Carte titre="Envoyer des fichiers">
        <Onglets
          libelle="Type de fichiers"
          valeur={role}
          onChange={setRole}
          options={[
            { valeur: 'cours', libelle: 'Cours' },
            { valeur: 'annales', libelle: 'Annales et corrigés' },
          ]}
        />
        <p className="mt-3 text-sm text-texte-2">
          {role === 'cours'
            ? 'Polycopiés, diaporamas, documents de cours. Un fichier par cours, de préférence nommé comme le cours.'
            : 'Sujets de partiels et corrigés, même scannés ou photographiés. Indique la matière et l’année dans le nom du fichier si tu peux (par exemple « Cardio partiel 2024.pdf »).'}
        </p>

        <input
          ref={champ}
          type="file"
          multiple
          accept={EXTENSIONS_ACCEPTEES}
          className="sr-only"
          id="champ-fichiers"
          onChange={(e) => void envoyer(e.target.files)}
        />
        <label
          htmlFor="champ-fichiers"
          className={`mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-axe bg-surface-2 p-5 text-center text-sm hover:bg-surface-3 ${hors || enCours ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Upload size={24} className="text-accent-clair" aria-hidden />
          <span className="font-medium">Choisir des fichiers</span>
          <span className="text-xs text-muet">
            PDF, Word, PowerPoint, texte ou photos · {TAILLE_MAX_FICHIER / 1_000_000} Mo maximum par fichier
          </span>
        </label>

        {hors && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-alerte/15 p-3 text-sm">
            <WifiOff size={16} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
            Hors connexion : l'envoi de fichiers demande du réseau.
          </p>
        )}
        {refus.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-xl bg-critique/15 p-3 text-sm" role="alert">
            {refus.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {envois.length > 0 && (
          <ul className="mt-4 space-y-3" aria-label="Envois en cours">
            {envois.map((e) => (
              <li key={e.cle}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{e.nom}</span>
                  <span className="chiffres shrink-0 text-xs text-texte-2">
                    {e.erreur ? 'Échec' : e.part >= 1 ? 'Envoyé' : `${Math.round(e.part * 100)} %`}
                  </span>
                </div>
                <Jauge valeur={e.part} libelle={`Envoi de ${e.nom}`} />
                {e.erreur && <p className="mt-1 text-xs text-critique">{e.erreur}</p>}
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre={`Mes fichiers (${depots.length})`}>
        {depots.length === 0 ? (
          <p className="text-sm text-texte-2">Aucun fichier envoyé pour le moment.</p>
        ) : (
          <ul className="divide-y divide-grille">
            {depots.map((depot) => {
              const s = statut(depot, parId.get(`depot:${depot.id}`));
              return (
                <li key={depot.id} className="flex items-center gap-3 py-3">
                  <FileText size={20} className="shrink-0 text-muet" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{depot.nom}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muet">
                      <span>{depot.role === 'cours' ? 'Cours' : 'Annales'}</span>
                      <span className="chiffres">{taille(depot.taille)}</span>
                      <Pastille ton={s.ton} icone={s.icone}>
                        {s.texte}
                      </Pastille>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retirer(depot)}
                    aria-label={`Retirer ${depot.nom}`}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-muet hover:bg-surface-2 hover:text-texte"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muet">
          Retirer un fichier n'efface pas ce qui en a déjà été tiré (fiches, questions).
        </p>
      </Carte>

      <Carte titre="Et ensuite ?">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-texte-2">
          <li>Le serveur lit tes fichiers au prochain passage (toutes les heures au plus).</li>
          <li>
            Une <strong className="font-semibold text-texte">estimation du coût</strong> apparaît dans{' '}
            <Link to="/corrections" className="text-accent-clair hover:underline">
              Mises à jour
            </Link>
            . Rien n'est dépensé avant ton accord.
          </li>
          <li>Après ton accord, les fiches, QCM et corrections arrivent chapitre par chapitre.</li>
        </ol>
        {d.etatPipeline?.message && (
          <p className="mt-3 text-xs text-muet">État du traitement : {d.etatPipeline.message}</p>
        )}
        <div className="mt-3">
          <Bouton variante="discret" onClick={() => void synchroniser()}>
            Actualiser
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}
