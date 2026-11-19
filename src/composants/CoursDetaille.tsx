/** Onglets « Cours complet » et « Cours ultra complet » d'un chapitre. */
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { nouvelleDemande } from '../../shared/assistant';
import type { Chapitre, DemandeDocument, NiveauCours } from '../../shared/types';
import { RenduFiche } from '../fiches/RenduFiche';
import { base } from '../db/base';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { demanderPassage } from '../lib/decisions';
import { Bouton, EtatVide } from './ui';

export function CoursChapitre({ chapitre, niveau }: { chapitre: Chapitre; niveau: NiveauCours }) {
  const d = useDonnees();
  const cours = d.coursParChapitre.get(chapitre.id)?.[niveau];
  const demandes = useLiveQuery(() => base.collection<DemandeDocument>('demandes').toArray(), []) ?? [];
  const demande = demandes
    .filter((x) => x.type === 'cours_ultra' && x.chapitreId === chapitre.id)
    .sort((a, b) => b.creeLe - a.creeLe)[0];
  const [envoi, setEnvoi] = useState(false);

  if (cours) {
    return (
      <>
        <p className="mb-3 text-xs text-muet">
          {niveau === 'complet'
            ? 'Le cours du drive remis au propre : structuré, annoté des pièges fréquents et illustré.'
            : 'Version approfondie : le pourquoi du comment, la physiopathologie et toutes les possibilités.'}
          {cours.version < chapitre.version && ' Une mise à jour du chapitre est en cours de rédaction.'}
        </p>
        <RenduFiche fiche={cours} />
        {niveau === 'ultra' && (
          <div className="mt-4">
            <Bouton variante="discret" icone={Sparkles} disabled={envoi || demande?.statut === 'en_attente' || demande?.statut === 'en_cours'} onClick={() => void demander()}>
              Régénérer
            </Bouton>
          </div>
        )}
      </>
    );
  }

  async function demander() {
    setEnvoi(true);
    try {
      await enregistrer('demandes', nouvelleDemande({ type: 'cours_ultra', sujet: chapitre.titre, matiereId: chapitre.matiereId, chapitreId: chapitre.id }, Date.now(), `dem-${crypto.randomUUID()}`));
      void demanderPassage();
    } finally {
      setEnvoi(false);
    }
  }

  if (niveau === 'complet') {
    return (
      <EtatVide icone={BookOpen} titre="Cours complet en préparation">
        Il est rédigé automatiquement après la fiche, au prochain passage de l'import.
      </EtatVide>
    );
  }
  const enCours = demande?.statut === 'en_attente' || demande?.statut === 'en_cours';
  return (
    <EtatVide icone={Sparkles} titre="Cours ultra complet">
      <p>Beaucoup plus long que le cours : mécanismes, physiopathologie, causes et conséquences, toutes les possibilités.</p>
      {enCours ? (
        <p role="status" className="mt-3 inline-flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" aria-hidden /> En cours de rédaction : tu seras notifié quand il sera prêt.
        </p>
      ) : (
        <div className="mt-3">
          <Bouton variante="primaire" icone={Sparkles} disabled={envoi} onClick={() => void demander()}>
            Générer le cours ultra complet
          </Bouton>
          {demande?.statut === 'erreur' && <p className="mt-2 text-sm text-alerte">{demande.message ?? 'La rédaction a échoué, réessaie.'}</p>}
        </div>
      )}
    </EtatVide>
  );
}
