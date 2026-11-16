/**
 * Flashcards d'un chapitre : on retourne la carte, puis on s'auto-évalue.
 * Les cartes sues reviennent de plus en plus tard, les autres tout de suite.
 */
import { ArrowLeft, Check, Layers, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { JOUR_MS } from '../../shared/dates';
import type { Flashcard, RevueFlash } from '../../shared/types';
import { Bouton, EtatVide, Jauge, LienBouton } from '../composants/ui';
import { enregistrer } from '../db/sync';
import { useDonnees } from '../etat/donnees';

/** Délai avant de revoir une carte selon le nombre de réussites consécutives. */
const PALIERS_JOURS = [1, 3, 7, 16, 35];

export function Flashcards() {
  const { id = '' } = useParams();
  const d = useDonnees();
  const chapitre = d.chapitreParId.get(id);
  const revues = useMemo(() => new Map(d.revues.map((r) => [r.id, r])), [d.revues]);

  // La pile est figée à l'ouverture : cartes à revoir d'abord, puis nouvelles.
  const [pile] = useState<Flashcard[]>(() => {
    const cartes = d.flashcards.filter((f) => f.chapitreId === id);
    const rang = (f: Flashcard) => {
      const r = revues.get(f.id);
      if (!r) return 1;
      return r.echeance <= d.maintenant ? 0 : 2;
    };
    return [...cartes].sort((a, b) => rang(a) - rang(b));
  });
  const [indice, setIndice] = useState(0);
  const [retournee, setRetournee] = useState(false);
  const [sues, setSues] = useState(0);

  if (!chapitre || pile.length === 0) {
    return (
      <EtatVide icone={Layers} titre="Aucune flashcard pour ce chapitre">
        <LienBouton to={`/chapitre/${id}`}>Retour au chapitre</LienBouton>
      </EtatVide>
    );
  }

  const noter = async (su: boolean) => {
    const carte = pile[indice]!;
    const serie = su ? (revues.get(carte.id)?.serie ?? 0) + 1 : 0;
    const delai = su ? PALIERS_JOURS[Math.min(serie, PALIERS_JOURS.length) - 1]! * JOUR_MS : 0;
    const revue: RevueFlash = { id: carte.id, date: Date.now(), serie, echeance: Date.now() + delai };
    await enregistrer('revues', revue);
    if (su) setSues(sues + 1);
    setRetournee(false);
    setIndice(indice + 1);
  };

  const terminee = indice >= pile.length;
  const carte = pile[indice];

  return (
    <div className="mx-auto max-w-xl">
      <Link
        to={`/chapitre/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-texte-2 hover:text-texte"
      >
        <ArrowLeft size={16} aria-hidden />
        {chapitre.titre}
      </Link>
      <div className="mb-4">
        <p className="chiffres mb-1.5 text-sm text-texte-2">
          Carte {Math.min(indice + 1, pile.length)} / {pile.length}
        </p>
        <Jauge valeur={indice / pile.length} libelle="Avancement des flashcards" />
      </div>

      {terminee || !carte ? (
        <div className="carte apparait p-8 text-center">
          <p className="text-5xl font-semibold">
            {sues} / {pile.length}
          </p>
          <p className="mt-2 text-sm text-texte-2">cartes sues</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Bouton
              icone={RotateCcw}
              onClick={() => {
                setIndice(0);
                setSues(0);
              }}
            >
              Recommencer
            </Bouton>
            <LienBouton to={`/chapitre/${id}`} variante="primaire">
              Retour au chapitre
            </LienBouton>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setRetournee(!retournee)}
            aria-label={retournee ? 'Réponse. Toucher pour revoir la question' : 'Question. Toucher pour retourner la carte'}
            className="carte apparait grid min-h-64 w-full place-items-center p-6 text-center"
            key={`${carte.id}-${retournee}`}
          >
            <span>
              <span className="mb-3 block text-xs tracking-wide text-muet uppercase">
                {retournee ? 'Réponse' : 'Question'}
              </span>
              <span className="block text-lg leading-relaxed whitespace-pre-line">
                {retournee ? carte.verso : carte.recto}
              </span>
              {!retournee && <span className="mt-4 block text-xs text-muet">Toucher pour retourner</span>}
            </span>
          </button>
          {retournee && (
            <div className="apparait mt-4 grid grid-cols-2 gap-3">
              <Bouton icone={X} onClick={() => void noter(false)}>
                À revoir
              </Bouton>
              <Bouton variante="primaire" icone={Check} onClick={() => void noter(true)}>
                Je savais
              </Bouton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
