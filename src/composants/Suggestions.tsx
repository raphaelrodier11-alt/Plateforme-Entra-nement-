/**
 * Suggestions de documents d'aide du Dr Rodier : un bouton pour les créer.
 * Les suggestions sont calculées sans IA ; l'IA ne travaille qu'au clic.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Lightbulb, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LIBELLE_TYPE_DOCUMENT } from '../../shared/assistant';
import { cleJour } from '../../shared/dates';
import { suggerer, type Suggestion } from '../../shared/suggestions';
import type { DemandeDocument, DocumentBiblio } from '../../shared/types';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import { ErreurAssistant, demanderDocument } from '../lib/assistant';
import { couleurMatiere } from '../lib/couleurs';
import { Bouton, Carte } from './ui';

const CLE_IGNOREES = 'dr-rodier:suggestions-ignorees';

function lireIgnorees(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLE_IGNOREES) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function Suggestions({ chapitreId, max = 3, titre = 'Suggestions du Dr Rodier' }: { chapitreId?: string; max?: number; titre?: string }) {
  const d = useDonnees();
  const documents = useLiveQuery(() => base.collection<DocumentBiblio>('documents').toArray(), []);
  const demandes = useLiveQuery(() => base.collection<DemandeDocument>('demandes').toArray(), []);
  const [ignorees, setIgnorees] = useState(lireIgnorees);
  const [etat, setEtat] = useState<Record<string, 'en_cours' | 'fait' | 'file' | string>>({});
  // Les suggestions acceptées restent affichées avec leur résultat, le temps de la session.
  const [acceptees, setAcceptees] = useState<Suggestion[]>([]);

  const liste = useMemo(() => {
    if (!documents || !demandes) return [];
    return suggerer({
      matieres: d.matieres,
      chapitres: d.chapitres,
      fiches: d.fiches,
      flashcards: d.flashcards,
      stats: d.stats,
      actualisations: d.actualisationsParChapitre,
      examens: d.examens,
      documents,
      demandes,
      aujourdHui: cleJour(d.maintenant),
    })
      .filter((s) => !ignorees.has(s.id) && (!chapitreId || s.chapitreId === chapitreId))
      .slice(0, max);
  }, [d, documents, demandes, ignorees, chapitreId, max]);

  const affichees: Suggestion[] = [...acceptees, ...liste.filter((s) => !acceptees.some((a) => a.id === s.id))];
  if (affichees.length === 0) return null;

  const creer = async (s: Suggestion) => {
    setEtat((e) => ({ ...e, [s.id]: 'en_cours' }));
    setAcceptees((a) => (a.some((x) => x.id === s.id) ? a : [...a, s]));
    try {
      const r = await demanderDocument(d, { type: s.type, sujet: s.sujet, consignes: s.consignes, matiereId: s.matiereId, chapitreId: s.chapitreId });
      setEtat((e) => ({ ...e, [s.id]: r.demande ? 'file' : 'fait' }));
    } catch (erreur) {
      setEtat((e) => ({ ...e, [s.id]: erreur instanceof ErreurAssistant ? erreur.message : 'Échec, réessaie.' }));
    }
  };

  const ignorer = (id: string) => {
    const suivant = new Set(ignorees).add(id);
    setIgnorees(suivant);
    try {
      localStorage.setItem(CLE_IGNOREES, JSON.stringify([...suivant]));
    } catch {
      // Sans stockage, la suggestion revient à la prochaine ouverture.
    }
  };

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <Lightbulb size={16} className="text-alerte" aria-hidden /> {titre}
        </span>
      }
    >
      <ul className="space-y-2.5">
        {affichees.map((s) => {
          const c = couleurMatiere(s.matiereId);
          const statut = etat[s.id];
          return (
            <li key={s.id} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3" style={{ borderLeft: `3px solid ${c.accent}` }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{s.titre}</p>
                <p className="mt-0.5 text-xs text-muet">
                  {s.raison} · {LIBELLE_TYPE_DOCUMENT[s.type]}
                </p>
                {statut === 'fait' && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs" role="status">
                    <Check size={14} className="text-bon" aria-hidden /> Créé.{' '}
                    <Link to="/assistant?vue=biblio" className="text-accent-clair underline">
                      Voir dans la bibliothèque
                    </Link>
                  </p>
                )}
                {statut === 'file' && (
                  <p className="mt-1.5 text-xs text-texte-2" role="status">
                    Demande enregistrée : prête dans l'heure, dans ta bibliothèque.
                  </p>
                )}
                {statut && !['en_cours', 'fait', 'file'].includes(statut) && (
                  <p className="mt-1.5 text-xs text-critique" role="alert">{statut}</p>
                )}
              </div>
              {statut !== 'fait' && statut !== 'file' && (
                <div className="flex shrink-0 items-center gap-1">
                  <Bouton variante="primaire" icone={Sparkles} className="min-h-9 px-3" disabled={statut === 'en_cours'} onClick={() => void creer(s)}>
                    {statut === 'en_cours' ? 'Création…' : 'Créer'}
                  </Bouton>
                  <button type="button" aria-label="Pas maintenant" onClick={() => ignorer(s.id)} className="grid size-9 place-items-center rounded-xl text-muet hover:text-texte">
                    <X size={16} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Carte>
  );
}
