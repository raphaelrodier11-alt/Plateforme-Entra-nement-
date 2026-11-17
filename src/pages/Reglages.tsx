/**
 * Réglages : lien secret, connexion à Google Drive, calendrier, créneaux,
 * modèles d'IA et gestion des données.
 */
import { Check, CloudOff, Download, HardDrive, Link2, Sparkles, Trash2, Unplug } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEtatSync } from '../App';
import { animationsActives, reglerAnimations } from '../lib/animations';
import { choisirTheme, lireTheme, type Theme } from '../lib/theme';
import { CRENEAUX, type Creneau, type Reglages as TypeReglages } from '../../shared/types';
import { Bouton, Carte, Pastille, Puce, STYLE_CHAMP, TitrePage } from '../composants/ui';
import { base } from '../db/base';
import { enregistrer, synchroniser } from '../db/sync';
import { chargerDemo, supprimerDemo } from '../demo/charger';
import { useDonnees } from '../etat/donnees';
import { api, lienSecret, lireCle } from '../lib/api';
import { LIBELLE_CRENEAU } from './Planning';
import { BoutonCopier, QrLien } from './Verrou';

interface StatutDrive {
  configurable: boolean;
  connecte: boolean;
  urlRetour: string;
}

function Etapes({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-sm text-texte-2">{children}</ol>;
}

function SectionLien() {
  const cle = lireCle();
  const [visible, setVisible] = useState(false);
  if (!cle) {
    return (
      <Carte titre="Lien secret">
        <p className="flex items-start gap-2 text-sm text-texte-2">
          <CloudOff size={16} className="mt-0.5 shrink-0" aria-hidden />
          L'app fonctionne ici en mode local, sans serveur : les données restent sur cet appareil.
        </p>
      </Carte>
    );
  }
  const lien = lienSecret(cle);
  return (
    <Carte titre="Lien secret">
      <p className="text-sm text-texte-2">
        Ce lien ouvre Dr Rodier sur tes autres appareils. Ne le partage pas : il donne accès à
        tes cours et à ta progression.
      </p>
      {visible ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <QrLien lien={lien} />
          <div className="min-w-0 flex-1 basis-56 space-y-3">
            <code className="block rounded-xl bg-surface-2 p-3 text-xs break-all text-texte-2">{lien}</code>
            <BoutonCopier texte={lien} />
          </div>
        </div>
      ) : (
        <Bouton className="mt-3" icone={Link2} onClick={() => setVisible(true)}>
          Afficher mon lien et son QR code
        </Bouton>
      )}
    </Carte>
  );
}

function SectionDrive({ reglages }: { reglages: TypeReglages }) {
  const sync = useEtatSync();
  const [params] = useSearchParams();
  const [statut, setStatut] = useState<StatutDrive>();
  const [cours, setCours] = useState(reglages.dossierCours ?? '');
  const [annales, setAnnales] = useState(reglages.dossierAnnales ?? '');
  const [anciens, setAnciens] = useState(reglages.dossierAnciens ?? '');
  const [enregistre, setEnregistre] = useState(false);
  const retour = params.get('drive');

  useEffect(() => {
    if (sync.statut === 'local') return;
    void api('/drive/statut')
      .then((r) => r.json() as Promise<StatutDrive>)
      .then(setStatut)
      .catch(() => undefined);
  }, [sync.statut]);

  const connecter = async () => {
    const { url } = (await (await api('/drive/connexion', { method: 'POST' })).json()) as { url: string };
    location.href = url;
  };

  const deconnecter = async () => {
    await api('/drive/deconnexion', { method: 'POST' });
    setStatut(statut && { ...statut, connecte: false });
  };

  const enregistrerDossiers = async () => {
    await enregistrer('reglages', {
      ...reglages,
      dossierCours: cours.trim() || undefined,
      dossierAnnales: annales.trim() || undefined,
      dossierAnciens: anciens.trim() || undefined,
      majLe: Date.now(),
    });
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  };

  return (
    <Carte
      titre="Google Drive"
      action={
        statut?.connecte ? (
          <Pastille ton="bon" icone={Check}>
            Connecté
          </Pastille>
        ) : (
          <Pastille>Non connecté</Pastille>
        )
      }
    >
      <p className="text-sm text-texte-2">
        Facultatif. Pour envoyer tes fichiers directement, utilise la page Fichiers. La connexion
        à Google Drive ajoute la surveillance automatique des mises à jour : Dr Rodier lit tes
        dossiers en lecture seule, sans rien modifier ni supprimer dans ton drive.
      </p>

      {retour === 'ok' && (
        <p role="status" className="mt-3 rounded-xl bg-bon/15 p-3 text-sm">
          Ton compte Google est connecté.
        </p>
      )}
      {retour === 'erreur' && (
        <p role="alert" className="mt-3 rounded-xl bg-critique/15 p-3 text-sm">
          La connexion à Google a échoué. Vérifie l'adresse de redirection ci-dessous et réessaie.
        </p>
      )}

      {sync.statut === 'local' ? (
        <p className="mt-3 text-sm text-muet">Disponible dans la version en ligne de l'app.</p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muet">Lien du dossier de cours</span>
              <input
                type="url"
                value={cours}
                onChange={(e) => setCours(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                className={STYLE_CHAMP}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muet">Lien du dossier d'annales</span>
              <input
                type="url"
                value={annales}
                onChange={(e) => setAnnales(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                className={STYLE_CHAMP}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muet">
                Lien du dossier des anciennes versions (facultatif, comparées aux cours actuels)
              </span>
              <input
                type="url"
                value={anciens}
                onChange={(e) => setAnciens(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                className={STYLE_CHAMP}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Bouton onClick={() => void enregistrerDossiers()} icone={enregistre ? Check : undefined}>
              {enregistre ? 'Enregistré' : 'Enregistrer les dossiers'}
            </Bouton>
            {statut?.connecte ? (
              <Bouton icone={Unplug} onClick={() => void deconnecter()}>
                Déconnecter Google
              </Bouton>
            ) : (
              <Bouton
                variante="primaire"
                icone={HardDrive}
                disabled={!statut?.configurable}
                onClick={() => void connecter()}
              >
                Connecter mon compte Google
              </Bouton>
            )}
          </div>

          {statut && !statut.configurable && (
            <p className="mt-3 rounded-xl bg-alerte/15 p-3 text-sm">
              Les identifiants Google ne sont pas encore configurés sur le serveur. Suis l'étape
              « Google Drive » du README, puis redéploie.
            </p>
          )}
          {statut && (
            <div className="mt-4 text-sm">
              <p className="mb-1 text-xs text-muet">
                Adresse de redirection à déclarer dans la console Google Cloud
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-xl bg-surface-2 p-2.5 text-xs break-all text-texte-2">
                  {statut.urlRetour}
                </code>
                <BoutonCopier texte={statut.urlRetour} libelle="Copier" />
              </div>
            </div>
          )}
        </>
      )}
    </Carte>
  );
}

function SectionCalendrier({ reglages }: { reglages: TypeReglages }) {
  const [heures, setHeures] = useState(reglages.heuresCreneaux);
  const [duree, setDuree] = useState(reglages.dureeDefautMin);
  const [enregistre, setEnregistre] = useState(false);

  const changer = (creneau: Creneau, indice: 0 | 1, valeur: number) => {
    const plage: [number, number] = [...heures[creneau]];
    plage[indice] = valeur;
    setHeures({ ...heures, [creneau]: plage });
  };

  const valide = CRENEAUX.every((c) => heures[c][0] < heures[c][1]);

  const sauver = async () => {
    await enregistrer('reglages', { ...reglages, heuresCreneaux: heures, dureeDefautMin: duree, majLe: Date.now() });
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  };

  return (
    <Carte titre="Calendrier et créneaux">
      <div id="calendrier" className="scroll-mt-4">
        <h3 className="mb-2 text-sm font-medium">Obtenir le lien de ton calendrier iCloud</h3>
        <Etapes>
          <li>Sur iPhone ou Mac, ouvre l'app Calendrier (ou icloud.com/calendar).</li>
          <li>
            Touche « Calendriers », puis le bouton d'information (i) du calendrier à relier.
          </li>
          <li>Active « Calendrier public », puis « Partager le lien » et copie le lien webcal://.</li>
          <li>Colle ce lien dans la page Planning, carte « Calendrier iCloud ».</li>
        </Etapes>
        <p className="mt-2 text-xs text-muet">
          Toute personne qui possède ce lien peut lire ce calendrier. Dr Rodier le relit à chaque
          ouverture et toutes les 30 minutes ; il n'y écrit jamais.
        </p>
      </div>

      <h3 className="mt-5 mb-2 text-sm font-medium">Heures des créneaux</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {CRENEAUX.map((c) => (
          <div key={c} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-texte-2">{LIBELLE_CRENEAU[c]}</span>
            {([0, 1] as const).map((i) => (
              <select
                key={i}
                value={heures[c][i]}
                onChange={(e) => changer(c, i, Number(e.target.value))}
                aria-label={`${LIBELLE_CRENEAU[c]}, heure de ${i === 0 ? 'début' : 'fin'}`}
                className={`${STYLE_CHAMP} chiffres w-24`}
              >
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            ))}
          </div>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-texte-2">Durée de séance proposée par défaut</span>
        <select value={duree} onChange={(e) => setDuree(Number(e.target.value))} className={`${STYLE_CHAMP} w-28`}>
          {[30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <Bouton className="mt-3" disabled={!valide} icone={enregistre ? Check : undefined} onClick={() => void sauver()}>
        {enregistre ? 'Enregistré' : 'Enregistrer'}
      </Bouton>
    </Carte>
  );
}

/** Nombre saisi dans un champ, ou `undefined` si le champ est vide ou invalide. */
function nombreSaisi(texte: string): number | undefined {
  const n = Number(texte.replace(',', '.'));
  return texte.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function SectionIa({ reglages }: { reglages: TypeReglages }) {
  const tarif = (role: string) => reglages.tarifs?.find((t) => t.modele === role);
  const [masse, setMasse] = useState(reglages.modeleMasse ?? '');
  const [expert, setExpert] = useState(reglages.modeleExpert ?? '');
  const [plafond, setPlafond] = useState(reglages.plafondMensuelUsd?.toString() ?? '');
  const [gratuit, setGratuit] = useState(reglages.modeGratuit !== false);
  const [prix, setPrix] = useState({
    masseEntree: tarif('masse')?.entreeUsdParM.toString() ?? '',
    masseSortie: tarif('masse')?.sortieUsdParM.toString() ?? '',
    expertEntree: tarif('expert')?.entreeUsdParM.toString() ?? '',
    expertSortie: tarif('expert')?.sortieUsdParM.toString() ?? '',
  });
  const [enregistre, setEnregistre] = useState(false);

  const sauver = async () => {
    const tarifs = (['masse', 'expert'] as const).flatMap((role) => {
      const entree = nombreSaisi(prix[`${role}Entree`]);
      const sortie = nombreSaisi(prix[`${role}Sortie`]);
      return entree !== undefined && sortie !== undefined
        ? [{ modele: role, entreeUsdParM: entree, sortieUsdParM: sortie, aVerifier: false }]
        : [];
    });
    await enregistrer('reglages', {
      ...reglages,
      modeleMasse: masse.trim() || undefined,
      modeleExpert: expert.trim() || undefined,
      plafondMensuelUsd: nombreSaisi(plafond),
      modeGratuit: gratuit,
      tarifs: tarifs.length ? tarifs : undefined,
      majLe: Date.now(),
    });
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  };

  const champPrix = (cle: keyof typeof prix, libelle: string) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muet">{libelle}</span>
      <input
        inputMode="decimal"
        value={prix[cle]}
        onChange={(e) => setPrix({ ...prix, [cle]: e.target.value })}
        placeholder="par défaut"
        className={`${STYLE_CHAMP} chiffres`}
      />
    </label>
  );

  return (
    <Carte titre="Intelligence artificielle (Gemini)">
      <label className="flex items-start gap-3 rounded-xl border border-bon/40 bg-bon/10 p-3 text-sm">
        <input
          type="checkbox"
          checked={gratuit}
          onChange={(e) => setGratuit(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[#3987e5]"
        />
        <span>
          <strong className="font-semibold">Mode gratuit (recommandé)</strong>
          <span className="mt-0.5 block text-texte-2">
            N'utilise que le palier gratuit de Gemini, avec un seul modèle. Rien ne peut être facturé : si la limite
            de Google est atteinte, le traitement s'arrête et reprend tout seul plus tard. Plus lent, et sans le
            modèle le plus puissant pour la détection d'erreurs.
          </span>
        </span>
      </label>
      <p className="mt-3 text-sm text-texte-2">
        Par défaut, l'import choisit lui-même un modèle économique pour la génération de masse
        (fiches, QCM, lecture des scans) et un modèle plus puissant pour les corrections
        d'erreurs. Tu peux imposer un modèle précis ; laisse vide pour le choix automatique.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Modèle de masse</span>
          <input value={masse} onChange={(e) => setMasse(e.target.value)} placeholder="automatique" className={STYLE_CHAMP} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Modèle expert</span>
          <input value={expert} onChange={(e) => setExpert(e.target.value)} placeholder="automatique" className={STYLE_CHAMP} />
        </label>
      </div>

      <h3 className="mt-5 mb-1 text-sm font-medium">Plafond de dépense</h3>
      <p className="mb-2 text-xs text-muet">
        Au-delà de ce montant dans le mois, la génération se met en pause. Vide : deux fois
        l'estimation que tu as approuvée (3 $ au minimum).
      </p>
      <label className="block max-w-48 text-sm">
        <span className="mb-1 block text-xs text-muet">Plafond mensuel, en dollars</span>
        <input
          inputMode="decimal"
          value={plafond}
          onChange={(e) => setPlafond(e.target.value)}
          placeholder="automatique"
          className={`${STYLE_CHAMP} chiffres`}
        />
      </label>

      <h3 className="mt-5 mb-1 text-sm font-medium">Tarifs, en dollars par million de tokens</h3>
      <p className="mb-2 text-xs text-muet">
        Les tarifs par défaut sont des ordres de grandeur prudents. Pour une estimation exacte,
        recopie ceux de la page officielle de Google (ai.google.dev/gemini-api/docs/pricing).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {champPrix('masseEntree', 'Masse, lus')}
        {champPrix('masseSortie', 'Masse, écrits')}
        {champPrix('expertEntree', 'Expert, lus')}
        {champPrix('expertSortie', 'Expert, écrits')}
      </div>

      <Bouton className="mt-4" icone={enregistre ? Check : undefined} onClick={() => void sauver()}>
        {enregistre ? 'Enregistré' : 'Enregistrer'}
      </Bouton>
      <p className="mt-2 text-xs text-muet">
        Une estimation de coût t'est toujours soumise avant la génération complète (page Mises à
        jour).
      </p>
    </Carte>
  );
}

function SectionDonnees() {
  const d = useDonnees();
  const sync = useEtatSync();

  const exporter = async () => {
    const contenu: Record<string, unknown[]> = {};
    for (const nom of ['tentatives', 'sessions', 'disponibilites', 'examens', 'decisions', 'revues', 'reglages']) {
      contenu[nom] = await base.table(nom).toArray();
    }
    const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = `dr-rodier-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  };

  return (
    <Carte titre="Données">
      <p className="chiffres text-sm text-texte-2">
        {d.questions.length} questions · {d.tentatives.length} réponses enregistrées ·{' '}
        {sync.statut === 'local'
          ? 'mode local'
          : sync.enAttente
            ? `${sync.enAttente} modification(s) en attente d'envoi`
            : 'tout est synchronisé'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Bouton icone={Download} onClick={() => void exporter()}>
          Exporter ma progression
        </Bouton>
        {sync.statut !== 'local' && <Bouton onClick={() => void synchroniser()}>Synchroniser maintenant</Bouton>}
        {d.aDesDonneesDemo ? (
          <Bouton variante="danger" icone={Trash2} onClick={() => void supprimerDemo()}>
            Retirer la démonstration
          </Bouton>
        ) : (
          <Bouton icone={Sparkles} onClick={() => void chargerDemo()}>
            Charger la démonstration
          </Bouton>
        )}
      </div>
      <p className="mt-2 text-xs text-muet">
        La démonstration ajoute quelques chapitres fictifs sur cet appareil pour essayer l'app.
        La retirer efface aussi les réponses données sur ces chapitres.
      </p>
    </Carte>
  );
}

function SectionApparence() {
  const [theme, setTheme] = useState<Theme>(lireTheme);
  const [animees, setAnimees] = useState(animationsActives);
  const choix: { valeur: Theme; libelle: string }[] = [
    { valeur: 'sombre', libelle: 'Sombre' },
    { valeur: 'clair', libelle: 'Clair' },
    { valeur: 'auto', libelle: 'Automatique' },
  ];
  return (
    <Carte titre="Apparence">
      <p className="mb-3 text-sm text-texte-2">
        Le thème se règle sur chaque appareil. « Automatique » suit le réglage de ton iPhone ou de ta tablette.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Thème">
        {choix.map((c) => (
          <Puce
            key={c.valeur}
            actif={theme === c.valeur}
            onClick={() => {
              setTheme(c.valeur);
              choisirTheme(c.valeur);
            }}
          >
            {c.libelle}
          </Puce>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={animees}
          onChange={(e) => {
            setAnimees(e.target.checked);
            reglerAnimations(e.target.checked);
          }}
          className="mt-0.5 size-5 shrink-0 accent-[#3987e5]"
        />
        <span>
          <span className="font-medium">Animation du cœur (ECG)</span>
          <span className="block text-texte-2">
            Tracé et lueurs à chaque battement. Décoche pour économiser la batterie ; c'est automatique si ton appareil
            demande de réduire les animations.
          </span>
        </span>
      </label>
    </Carte>
  );
}

export function Reglages() {
  const d = useDonnees();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TitrePage titre="Réglages" />
      <SectionLien />
      <SectionApparence />
      <SectionDrive reglages={d.reglages} />
      <SectionCalendrier reglages={d.reglages} />
      <SectionIa reglages={d.reglages} />
      <SectionDonnees />
    </div>
  );
}
