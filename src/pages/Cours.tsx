/**
 * Cours : toutes les matières et leurs chapitres, avec statut, avancement
 * et badges (nouveau, mise à jour en attente).
 */
import { BookOpen, FilePen, Search, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StatutChapitre } from '../../shared/progression';
import { LIBELLE_STATUT } from '../../shared/progression';
import {
  EtatVide,
  Jauge,
  Pastille,
  PastilleStatut,
  Puce,
  STYLE_CHAMP,
  TitrePage,
  nombre,
  pourcent,
} from '../composants/ui';
import { useDonnees } from '../etat/donnees';

const STATUTS: StatutChapitre[] = ['a_commencer', 'en_cours', 'a_revoir', 'acquis'];

export function Cours() {
  const d = useDonnees();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<StatutChapitre | undefined>();

  if (d.estVide) {
    return (
      <EtatVide icone={BookOpen} titre="Aucun cours importé">
        Les chapitres apparaîtront ici après l'import de ton Google Drive (Réglages).
      </EtatVide>
    );
  }

  const cherche = recherche.trim().toLowerCase();

  return (
    <div>
      <TitrePage
        titre="Cours"
        sousTitre={`${d.matieres.length} matières · ${d.chapitres.length} chapitres`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Rechercher un chapitre</span>
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muet" aria-hidden />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un chapitre"
            className={`${STYLE_CHAMP} pl-9`}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATUTS.map((s) => (
            <Puce key={s} actif={filtre === s} onClick={() => setFiltre(filtre === s ? undefined : s)}>
              {LIBELLE_STATUT[s]}
            </Puce>
          ))}
        </div>
      </div>

      <div className="space-y-7">
        {d.matieres.map((m) => {
          const chapitres = (d.chapitresParMatiere.get(m.id) ?? []).filter((c) => {
            const s = d.stats.get(c.id);
            if (filtre && s?.statut !== filtre) return false;
            return !cherche || c.titre.toLowerCase().includes(cherche);
          });
          if (chapitres.length === 0) return null;
          const sm = d.statsMatiere.get(m.id);
          const prediction = d.predictions.get(m.id);
          return (
            <section key={m.id} id={m.id} className="scroll-mt-4">
              <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{m.nom}</h2>
                  <p className="chiffres text-xs text-muet">
                    {sm?.nbAcquis ?? 0} / {sm?.nbChapitres ?? 0} chapitres acquis ·{' '}
                    {pourcent(sm?.avancement ?? 0)} d'avancement
                    {prediction && ` · note prévue ${nombre(prediction.note, 1)}/20`}
                  </p>
                </div>
              </header>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {chapitres.map((c) => {
                  const s = d.stats.get(c.id);
                  return (
                    <li key={c.id}>
                      <Link
                        to={`/chapitre/${c.id}`}
                        className="carte flex h-full flex-col gap-3 p-4 transition-colors hover:bg-surface-2"
                      >
                        <div className="flex flex-wrap gap-1.5">
                          <PastilleStatut statut={s?.statut ?? 'a_commencer'} />
                          {c.nouveau && (
                            <Pastille ton="accent" icone={Sparkles}>
                              Nouveau
                            </Pastille>
                          )}
                          {c.majEnAttente && (
                            <Pastille ton="alerte" icone={FilePen}>
                              Mise à jour à valider
                            </Pastille>
                          )}
                        </div>
                        <h3 className="flex-1 text-sm leading-snug font-medium">{c.titre}</h3>
                        <div>
                          <div className="chiffres mb-1.5 flex items-center justify-between text-xs text-muet">
                            <span className="flex items-center gap-3">
                              <span>{s?.nbQuestions ?? 0} questions</span>
                              {!!s?.nbIncontournables && (
                                <span className="flex items-center gap-1">
                                  <Star size={12} aria-hidden />
                                  {s.nbIncontournables} incontournable{s.nbIncontournables > 1 ? 's' : ''}
                                </span>
                              )}
                            </span>
                            <span className="text-texte-2">{pourcent(s?.avancement ?? 0)}</span>
                          </div>
                          <Jauge valeur={s?.avancement ?? 0} libelle={`Avancement de ${c.titre}`} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
