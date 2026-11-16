/**
 * Racine de l'application : contrôle d'accès par lien secret, démarrage de
 * la synchronisation, puis routage des pages.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Navigation } from './composants/Navigation';
import {
  abonnerEtatSync,
  activerServeur,
  demarrerSynchro,
  lireEtatSync,
} from './db/sync';
import { FournisseurDonnees, useDonnees } from './etat/donnees';
import { capterCleDansAdresse, etatServeur, lireCle } from './lib/api';
import { PERIODE_RELECTURE_MS, actualiserCalendrier } from './lib/calendrier';
import { Accueil } from './pages/Accueil';
import { PageChapitre } from './pages/Chapitre';
import { Corrections } from './pages/Corrections';
import { Cours } from './pages/Cours';
import { Erreurs } from './pages/Erreurs';
import { Examens } from './pages/Examens';
import { Flashcards } from './pages/Flashcards';
import { PagePlanning } from './pages/Planning';
import { Qcm } from './pages/Qcm';
import { Reglages } from './pages/Reglages';
import { PageSession } from './pages/Session';
import { Suivi } from './pages/Suivi';
import { CreationLien, Verrou } from './pages/Verrou';

type Phase = 'chargement' | 'pret' | 'creation' | 'verrou';

export function useEtatSync() {
  return useSyncExternalStore(abonnerEtatSync, lireEtatSync);
}

/**
 * Relit le calendrier iCloud à l'ouverture, au retour sur l'app et toutes
 * les 30 minutes, dès qu'un lien est enregistré.
 */
function SynchroCalendrier() {
  const { reglages } = useDonnees();
  const lien = reglages.icsUrl;
  useEffect(() => {
    if (!lien) return;
    let derniere = 0;
    const relire = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - derniere < PERIODE_RELECTURE_MS - 5_000 && derniere > 0) return;
      derniere = Date.now();
      void actualiserCalendrier();
    };
    relire();
    const intervalle = setInterval(relire, PERIODE_RELECTURE_MS);
    document.addEventListener('visibilitychange', relire);
    return () => {
      clearInterval(intervalle);
      document.removeEventListener('visibilitychange', relire);
    };
  }, [lien]);
  return null;
}

export function App() {
  const [phase, setPhase] = useState<Phase>('chargement');
  const [horsLigne, setHorsLigne] = useState(false);
  const sync = useEtatSync();

  useEffect(() => {
    let annule = false;
    void (async () => {
      capterCleDansAdresse();
      const etat = await etatServeur();
      if (annule) return;
      const cle = lireCle();
      if (etat.type === 'sans_serveur') {
        activerServeur(false);
        setPhase('pret');
      } else if (etat.type === 'a_configurer') {
        setPhase('creation');
      } else if (!cle) {
        setHorsLigne(etat.type === 'hors_ligne');
        setPhase('verrou');
      } else {
        activerServeur(true);
        setPhase('pret');
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'pret' || lireEtatSync().statut === 'local') return;
    return demarrerSynchro();
  }, [phase]);

  const entrer = () => {
    activerServeur(true);
    setPhase('pret');
  };

  if (phase === 'chargement') {
    return (
      <div className="grid min-h-dvh place-items-center text-muet" role="status">
        Chargement…
      </div>
    );
  }
  if (phase === 'creation') return <CreationLien onTermine={entrer} onDejaCree={() => setPhase('verrou')} />;
  // Le serveur ne reconnaît plus la clé : il faut coller le nouveau lien.
  if (phase === 'verrou' || sync.statut === 'refuse') {
    return <Verrou horsLigne={horsLigne} refuse={sync.statut === 'refuse'} onOuvert={entrer} />;
  }

  return (
    <FournisseurDonnees>
      <SynchroCalendrier />
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <Navigation />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">
          <Routes>
              <Route path="/" element={<Accueil />} />
              <Route path="/cours" element={<Cours />} />
              <Route path="/chapitre/:id" element={<PageChapitre />} />
              <Route path="/chapitre/:id/flashcards" element={<Flashcards />} />
              <Route path="/qcm" element={<Qcm />} />
              <Route path="/session/:id" element={<PageSession />} />
              <Route path="/examens" element={<Examens />} />
              <Route path="/erreurs" element={<Erreurs />} />
              <Route path="/planning" element={<PagePlanning />} />
              <Route path="/suivi" element={<Suivi />} />
              <Route path="/corrections" element={<Corrections />} />
              <Route path="/reglages" element={<Reglages />} />
              <Route path="*" element={<Accueil />} />
          </Routes>
        </main>
      </div>
    </FournisseurDonnees>
  );
}
