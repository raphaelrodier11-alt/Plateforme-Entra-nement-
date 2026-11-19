/**
 * Fichiers : envoi direct des cours, des anciennes versions et des annales
 * (PDF, Word, PowerPoint, photos de pages), sans passer par Google Drive.
 * On peut envoyer des fichiers en masse : sélection multiple, dossier entier
 * ou ZIP.
 */
import {
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  FolderUp,
  Loader,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EXTENSIONS_ACCEPTEES, TAILLE_MAX_FICHIER } from '../../shared/depot';
import { prefixeMatiere } from '../../shared/matieres';
import type { Depot, Fichier, RoleDepot } from '../../shared/types';
import { MatieresManuelles } from '../composants/MatieresManuelles';
import { Bouton, Carte, Jauge, Onglets, Pastille, STYLE_CHAMP, TitrePage, nombre } from '../composants/ui';
import { base } from '../db/base';
import { synchroniser } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import {
  cleDepot,
  envoyerLot,
  preparer,
  retirerFichier,
  type Candidat,
  type EtatEnvoi,
} from '../lib/depot';
import { useEtatSync } from '../App';

const LIBELLE_ROLE: Record<RoleDepot, string> = {
  cours: 'Cours',
  anciens: 'Ancienne version',
  annales: 'Annales',
};

const EXPLICATION: Record<RoleDepot, string> = {
  cours:
    "Polycopiés, diaporamas, documents de cours à jour. C'est à partir d'eux que sont faits les chapitres, les fiches et les QCM.",
  anciens:
    "Anciennes versions des cours (par exemple le « Lot de survie »). Elles ne servent qu'à être comparées aux cours actuels : l'app te montre ce qui a changé, chapitre par chapitre, et le refait à chaque nouvel envoi.",
  annales:
    "Sujets de partiels et corrigés, même scannés ou photographiés. Si tu peux, mets la matière et l'année dans le nom (« Cardio partiel 2024.pdf »).",
};

const AFFICHES = 50;

function taille(octets: number): string {
  return octets >= 1_000_000 ? `${nombre(octets / 1_000_000, 1)} Mo` : `${Math.max(1, Math.round(octets / 1000))} Ko`;
}

function statut(depot: Depot, fichier: Fichier | undefined) {
  if (!fichier || fichier.modifieLe !== depot.modifieLe) {
    return { ton: 'neutre' as const, icone: Clock, texte: 'En attente de lecture' };
  }
  if ((fichier.echecs ?? 0) >= 3) return { ton: 'critique' as const, icone: CircleAlert, texte: 'Lecture impossible' };
  if (fichier.etat === 'a_jour') return { ton: 'bon' as const, icone: CircleCheck, texte: 'Traité' };
  return { ton: 'accent' as const, icone: Loader, texte: 'Lu, traitement à venir' };
}

/** Sépare « Dossier/Sous-dossier/Fichier.pdf » en dossier et nom. */
function decouper(chemin: string): { dossier: string; nom: string } {
  const i = chemin.lastIndexOf('/');
  return i < 0 ? { dossier: '', nom: chemin } : { dossier: chemin.slice(0, i), nom: chemin.slice(i + 1) };
}

export function Fichiers() {
  const d = useDonnees();
  const sync = useEtatSync();
  const [role, setRole] = useState<RoleDepot>('cours');
  const [matiereChoisie, setMatiereChoisie] = useState('');
  const [envois, setEnvois] = useState<EtatEnvoi[]>([]);
  const [refus, setRefus] = useState<string[]>([]);
  const [ignores, setIgnores] = useState(0);
  const [recherche, setRecherche] = useState('');
  const [nbAffiches, setNbAffiches] = useState(AFFICHES);
  const champFichiers = useRef<HTMLInputElement>(null);
  const champDossier = useRef<HTMLInputElement>(null);
  const aReessayer = useRef<{ role: RoleDepot; candidats: Candidat[]; fermer: () => Promise<void> }>(undefined);

  const enCours = envois.some((e) => e.statut === 'en_cours' || e.statut === 'attente');
  const hors = sync.statut === 'hors_ligne';
  const echecs = envois.filter((e) => e.statut === 'echec');

  const existants = useMemo(
    () => new Map(d.depots.map((x) => [cleDepot(x.role, x.chemin ?? x.nom), x.taille])),
    [d.depots],
  );

  const lancer = async (candidats: Candidat[], roleEnvoi: RoleDepot, fermer: () => Promise<void>) => {
    const majEnvoi = (cle: string, partiel: Partial<EtatEnvoi>) =>
      setEnvois((liste) => liste.map((e) => (e.cle === cle ? { ...e, ...partiel } : e)));
    aReessayer.current = { role: roleEnvoi, candidats, fermer };
    await envoyerLot(candidats, roleEnvoi, existants, majEnvoi);
    await synchroniser();
  };

  const choisir = async (liste: FileList | null) => {
    if (!liste || liste.length === 0) return;
    const fichiers = [...liste];
    if (champFichiers.current) champFichiers.current.value = '';
    if (champDossier.current) champDossier.current.value = '';

    const preparation = await preparer(fichiers);
    // Matière choisie : tous les fichiers sont rangés dans « SEMESTRE n / Matière / … », comme dans un Drive.
    const cible = d.matieres.find((m) => m.id === matiereChoisie && m.semestre);
    if (cible?.semestre) {
      const prefixe = prefixeMatiere(cible.nom, cible.semestre);
      preparation.candidats = preparation.candidats.map((c) => ({ ...c, chemin: `${prefixe}${c.chemin}` }));
    }
    setRefus(preparation.refus);
    setIgnores(preparation.ignores);
    setEnvois(
      preparation.candidats.map((c) => ({ cle: c.cle, nom: c.nom, chemin: c.chemin, part: 0, statut: 'attente' as const })),
    );
    await lancer(preparation.candidats, role, preparation.fermer);
  };

  const reessayer = async () => {
    const precedent = aReessayer.current;
    if (!precedent) return;
    const cles = new Set(echecs.map((e) => e.cle));
    setEnvois((liste) => liste.map((e) => (cles.has(e.cle) ? { ...e, statut: 'attente' as const, part: 0 } : e)));
    await lancer(
      precedent.candidats.filter((c) => cles.has(c.cle)),
      precedent.role,
      precedent.fermer,
    );
  };

  const retirer = async (depot: Depot) => {
    await retirerFichier(depot.id);
    await base.collection('depots').delete(depot.id);
    void synchroniser();
  };

  const parId = new Map(d.fichiers.map((f) => [f.id, f]));
  const depots = useMemo(() => {
    const filtre = recherche.trim().toLowerCase();
    return [...d.depots]
      .filter((x) => !filtre || (x.chemin ?? x.nom).toLowerCase().includes(filtre))
      .sort((a, b) => b.ajouteLe - a.ajouteLe);
  }, [d.depots, recherche]);

  const termines = envois.filter((e) => e.statut === 'fait' || e.statut === 'deja').length;
  const dejaLa = envois.filter((e) => e.statut === 'deja').length;
  const partGlobale = envois.length ? envois.reduce((s, e) => s + (e.statut === 'echec' ? 1 : e.part), 0) / envois.length : 0;
  const parRole = (r: RoleDepot) => d.depots.filter((x) => x.role === r).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TitrePage
        titre="Fichiers"
        sousTitre="Envoie tes cours et tes annales, autant que tu veux : l'application en tire les chapitres, les fiches, les QCM et les changements d'une version à l'autre."
      />

      <MatieresManuelles />

      <Carte titre="Envoyer des fichiers">
        <Onglets
          libelle="Type de fichiers"
          valeur={role}
          onChange={setRole}
          options={[
            { valeur: 'cours', libelle: 'Cours', compte: parRole('cours') },
            { valeur: 'anciens', libelle: 'Anciennes versions', compte: parRole('anciens') },
            { valeur: 'annales', libelle: 'Annales', compte: parRole('annales') },
          ]}
        />
        <p className="mt-3 text-sm text-texte-2">{EXPLICATION[role]}</p>

        <label className="mt-3 block text-xs text-texte-2">
          Matière de ces fichiers
          <select value={matiereChoisie} onChange={(e) => setMatiereChoisie(e.target.value)} className={STYLE_CHAMP}>
            <option value="">Détectée automatiquement (dossiers, sinon par l'IA)</option>
            {d.matieres.filter((m) => m.semestre).map((m) => (
              <option key={m.id} value={m.id}>{m.nom} · semestre {m.semestre}</option>
            ))}
          </select>
        </label>

        <input
          ref={champFichiers}
          type="file"
          multiple
          accept={EXTENSIONS_ACCEPTEES}
          className="sr-only"
          id="champ-fichiers"
          onChange={(e) => void choisir(e.target.files)}
        />
        <input
          ref={champDossier}
          type="file"
          className="sr-only"
          id="champ-dossier"
          onChange={(e) => void choisir(e.target.files)}
          {...({ webkitdirectory: '', directory: '', multiple: true } as object)}
        />
        <label
          htmlFor="champ-fichiers"
          className={`mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-axe bg-surface-2 p-5 text-center text-sm hover:bg-surface-3 ${hors || enCours ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Upload size={24} className="text-accent-clair" aria-hidden />
          <span className="font-medium">Choisir des fichiers ou un ZIP</span>
          <span className="text-xs text-muet">
            Sélection multiple · PDF, Word, PowerPoint, texte, photos · {TAILLE_MAX_FICHIER / 1_000_000} Mo maximum par fichier
          </span>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label
            htmlFor="champ-dossier"
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-bord bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3 ${hors || enCours ? 'pointer-events-none opacity-50' : ''}`}
          >
            <FolderUp size={18} aria-hidden />
            Choisir un dossier entier
          </label>
          <p className="min-w-52 flex-1 text-xs text-muet">
            Le plus simple pour beaucoup de fichiers : télécharge le dossier de ton Drive (« Télécharger » → un
            ZIP), puis choisis le ZIP ici. Les sous-dossiers servent à classer les cours.
          </p>
        </div>

        {hors && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-alerte/15 p-3 text-sm">
            <WifiOff size={16} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
            Hors connexion : l'envoi de fichiers demande du réseau.
          </p>
        )}
        {refus.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-xl bg-critique/15 p-3 text-sm" role="alert">
            {refus.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        {envois.length > 0 && (
          <div className="mt-4 rounded-xl bg-surface-2 p-4" aria-label="Envois en cours">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="chiffres font-medium">
                {termines} / {envois.length} fichier{envois.length > 1 ? 's' : ''}
              </span>
              <span className="chiffres text-xs text-texte-2">
                {dejaLa > 0 && `${dejaLa} déjà présent${dejaLa > 1 ? 's' : ''} · `}
                {echecs.length > 0 && `${echecs.length} en échec · `}
                {Math.round(partGlobale * 100)} %
              </span>
            </div>
            <Jauge valeur={partGlobale} libelle="Avancement de l'envoi" epaisse />
            {ignores > 0 && (
              <p className="mt-2 text-xs text-muet">
                {ignores} élément{ignores > 1 ? 's' : ''} ignoré{ignores > 1 ? 's' : ''} (fichiers cachés ou formats sans intérêt).
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {envois
                .filter((e) => e.statut === 'en_cours')
                .map((e) => (
                  <li key={e.cle} className="flex items-center gap-3 text-xs">
                    <Loader size={14} className="shrink-0 animate-spin text-accent-clair" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-texte-2">{decouper(e.chemin).nom}</span>
                    <span className="chiffres shrink-0">{Math.round(e.part * 100)} %</span>
                  </li>
                ))}
            </ul>
            {echecs.length > 0 && !enCours && (
              <div className="mt-3 rounded-lg bg-critique/15 p-3 text-sm" role="alert">
                <p>
                  {echecs.length} fichier{echecs.length > 1 ? 's' : ''} n'ont pas pu être envoyés (connexion
                  interrompue, par exemple).
                </p>
                <Bouton className="mt-2" icone={RefreshCw} onClick={() => void reessayer()}>
                  Réessayer
                </Bouton>
              </div>
            )}
            {!enCours && echecs.length === 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <CircleCheck size={16} className="text-bon" aria-hidden />
                Envoi terminé. Le traitement démarre au prochain passage (toutes les heures au plus).
              </p>
            )}
          </div>
        )}
      </Carte>

      <Carte titre={`Mes fichiers (${d.depots.length})`}>
        {d.depots.length > 0 && (
          <label className="relative mb-3 block">
            <span className="sr-only">Rechercher un fichier</span>
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muet" aria-hidden />
            <input
              type="search"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setNbAffiches(AFFICHES);
              }}
              placeholder="Rechercher dans mes fichiers"
              className={`${STYLE_CHAMP} pl-9`}
            />
          </label>
        )}
        {d.depots.length === 0 ? (
          <p className="text-sm text-texte-2">Aucun fichier envoyé pour le moment.</p>
        ) : depots.length === 0 ? (
          <p className="text-sm text-texte-2">Aucun fichier ne correspond.</p>
        ) : (
          <ul className="divide-y divide-grille">
            {depots.slice(0, nbAffiches).map((depot) => {
              const s = statut(depot, parId.get(`depot:${depot.id}`));
              const { dossier, nom } = decouper(depot.chemin ?? depot.nom);
              return (
                <li key={depot.id} className="flex items-center gap-3 py-3">
                  <FileText size={20} className="shrink-0 text-muet" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nom}</p>
                    {dossier && <p className="truncate text-xs text-muet">{dossier}</p>}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muet">
                      <span>{LIBELLE_ROLE[depot.role]}</span>
                      <span className="chiffres">{taille(depot.taille)}</span>
                      <Pastille ton={s.ton} icone={s.icone}>
                        {s.texte}
                      </Pastille>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retirer(depot)}
                    aria-label={`Retirer ${nom}`}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-muet hover:bg-surface-2 hover:text-texte"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {depots.length > nbAffiches && (
          <Bouton className="mt-3 w-full" variante="discret" onClick={() => setNbAffiches(nbAffiches + AFFICHES)}>
            Afficher les {Math.min(AFFICHES, depots.length - nbAffiches)} suivants ({depots.length - nbAffiches} restants)
          </Bouton>
        )}
        <p className="mt-3 text-xs text-muet">
          Retirer un fichier n'efface pas ce qui en a déjà été tiré (fiches, questions). Renvoyer un fichier du même
          nom et du même dossier le remplace : le chapitre est régénéré et les changements sont comparés à la version
          précédente.
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
          <li>
            Après ton accord, les fiches, QCM et corrections arrivent chapitre par chapitre ; les changements entre
            versions apparaissent dans l'onglet « Actualisations » de chaque chapitre.
          </li>
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
