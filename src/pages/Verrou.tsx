/**
 * Écrans d'accès : création du lien secret à la première ouverture, puis
 * saisie du lien sur les autres appareils. Ni compte ni mot de passe.
 */
import { Check, Copy, KeyRound, Link as IconeLien, WifiOff } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { Bouton, STYLE_CHAMP } from '../composants/ui';
import {
  ErreurApi,
  api,
  cleDepuisTexte,
  creerCle,
  enregistrerCle,
  lienSecret,
  oublierCle,
} from '../lib/api';

function Cadre({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="carte w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icone.svg" alt="" className="size-11 rounded-xl" />
          <span className="text-xl font-semibold tracking-tight">Dr Rodier</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** QR code du lien secret, pour ouvrir l'app sur un autre appareil. */
export function QrLien({ lien }: { lien: string }) {
  const [image, setImage] = useState<string>();
  useEffect(() => {
    void QRCode.toDataURL(lien, { margin: 1, width: 220 }).then(setImage);
  }, [lien]);
  if (!image) return null;
  return (
    <img
      src={image}
      width={180}
      height={180}
      alt="QR code du lien secret"
      className="rounded-xl bg-white p-2"
    />
  );
}

export function BoutonCopier({ texte, libelle = 'Copier le lien' }: { texte: string; libelle?: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <Bouton
      icone={copie ? Check : Copy}
      onClick={() => {
        void navigator.clipboard.writeText(texte).then(() => {
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
        });
      }}
    >
      {copie ? 'Copié' : libelle}
    </Bouton>
  );
}

export function CreationLien({
  onTermine,
  onDejaCree,
}: {
  onTermine: () => void;
  onDejaCree: () => void;
}) {
  const [cle, setCle] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  const creer = async () => {
    setEnCours(true);
    setErreur(undefined);
    const nouvelle = creerCle();
    try {
      await api('/configurer', { method: 'POST', body: JSON.stringify({ cle: nouvelle }) });
      enregistrerCle(nouvelle);
      setCle(nouvelle);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) onDejaCree();
      else setErreur('La création a échoué. Vérifie ta connexion et réessaie.');
    } finally {
      setEnCours(false);
    }
  };

  if (cle) {
    const lien = lienSecret(cle);
    return (
      <Cadre>
        <h1 className="text-lg font-semibold">Ton lien secret est créé</h1>
        <p className="mt-2 text-sm text-texte-2">
          Garde-le précieusement : c'est lui qui ouvre Dr Rodier sur tes autres appareils. Il
          reste disponible dans les réglages de cet appareil.
        </p>
        <div className="mt-5 flex flex-col items-center gap-4">
          <QrLien lien={lien} />
          <code className="w-full rounded-xl bg-surface-2 p-3 text-xs break-all text-texte-2">{lien}</code>
          <BoutonCopier texte={lien} />
        </div>
        <Bouton variante="primaire" className="mt-6 w-full" onClick={onTermine}>
          J'ai noté mon lien, continuer
        </Bouton>
      </Cadre>
    );
  }

  return (
    <Cadre>
      <h1 className="text-lg font-semibold">Première ouverture</h1>
      <p className="mt-2 text-sm text-texte-2">
        Dr Rodier n'a ni compte ni mot de passe. À la place, cet appareil va créer un lien
        secret : sans lui, personne ne peut voir tes cours ni modifier ta progression.
      </p>
      {erreur && (
        <p role="alert" className="mt-4 rounded-xl bg-critique/15 p-3 text-sm">
          {erreur}
        </p>
      )}
      <Bouton
        variante="primaire"
        icone={KeyRound}
        className="mt-6 w-full"
        disabled={enCours}
        onClick={() => void creer()}
      >
        {enCours ? 'Création…' : 'Créer mon lien secret'}
      </Bouton>
    </Cadre>
  );
}

export function Verrou({
  horsLigne,
  refuse,
  onOuvert,
}: {
  horsLigne: boolean;
  refuse: boolean;
  onOuvert: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState(false);

  const ouvrir = async () => {
    const cle = cleDepuisTexte(texte);
    if (!cle) {
      setErreur("Ce texte ne ressemble pas à un lien secret. Colle le lien entier.");
      return;
    }
    setEnCours(true);
    setErreur(undefined);
    enregistrerCle(cle);
    try {
      await api('/sync/tirer?depuis=0&limite=1');
      onOuvert();
    } catch (e) {
      oublierCle();
      setErreur(
        e instanceof ErreurApi && e.statut === 401
          ? "Ce lien n'est pas reconnu."
          : 'Connexion impossible. Réessaie quand tu as du réseau.',
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Cadre>
      <h1 className="text-lg font-semibold">Ouvrir Dr Rodier</h1>
      {horsLigne && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-alerte/15 p-3 text-sm">
          <WifiOff size={18} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
          Tu es hors connexion. La première ouverture sur un appareil demande du réseau.
        </p>
      )}
      {refuse && (
        <p className="mt-3 rounded-xl bg-alerte/15 p-3 text-sm">
          Le lien enregistré sur cet appareil n'est plus valable. Colle le nouveau lien ; tes
          données locales sont conservées.
        </p>
      )}
      <p className="mt-3 text-sm text-texte-2">
        Colle ton lien secret (ou ouvre-le directement, ou scanne son QR code depuis un appareil
        déjà connecté : Réglages → Lien secret).
      </p>
      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block text-texte-2">Lien secret</span>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={3}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://…/#k=…"
          className={`${STYLE_CHAMP} py-2.5`}
        />
      </label>
      {erreur && (
        <p role="alert" className="mt-3 rounded-xl bg-critique/15 p-3 text-sm">
          {erreur}
        </p>
      )}
      <Bouton
        variante="primaire"
        icone={IconeLien}
        className="mt-5 w-full"
        disabled={enCours || !texte.trim()}
        onClick={() => void ouvrir()}
      >
        {enCours ? 'Vérification…' : 'Ouvrir'}
      </Bouton>
    </Cadre>
  );
}
