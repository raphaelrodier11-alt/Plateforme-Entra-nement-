/**
 * QCM : composition libre d'un entraînement (matière, chapitres, types,
 * difficulté, source) et historique des dernières sessions.
 */
import { ListChecks, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { scoreDepuisPoints } from '../../shared/bareme';
import { jourLisible, cleJour } from '../../shared/dates';
import {
  Bouton,
  Carte,
  EtatVide,
  Puce,
  STYLE_CHAMP,
  TitrePage,
  nombre,
} from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import {
  LIBELLE_SESSION,
  LIBELLE_TYPE,
  choisirQuestions,
  demarrerSession,
  questionsCorrespondantes,
  type FiltreQcm,
  type TypeFiltre,
} from '../lib/sessions';

const NOMBRES = [5, 10, 20, 30, 50];
const DIFFICULTES = [
  { valeur: 1, libelle: 'Facile' },
  { valeur: 2, libelle: 'Moyen' },
  { valeur: 3, libelle: 'Difficile' },
];
const SOURCES: { valeur: NonNullable<FiltreQcm['source']>; libelle: string }[] = [
  { valeur: 'toutes', libelle: 'Toutes' },
  { valeur: 'annale', libelle: 'Annales' },
  { valeur: 'genere', libelle: 'Générées' },
];

function basculer<T>(liste: T[], valeur: T): T[] {
  return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
}

export function Qcm() {
  const d = useDonnees();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [matiereId, setMatiereId] = useState(params.get('matiere') ?? '');
  const [chapitreIds, setChapitreIds] = useState<string[]>([]);
  const [nombreVoulu, setNombreVoulu] = useState(10);
  const [types, setTypes] = useState<TypeFiltre[]>([]);
  const [difficultes, setDifficultes] = useState<number[]>([]);
  const [source, setSource] = useState<NonNullable<FiltreQcm['source']>>('toutes');
  const [incontournables, setIncontournables] = useState(params.get('incontournables') === '1');

  const filtre: FiltreQcm = useMemo(
    () => ({
      matiereId: matiereId || undefined,
      chapitreIds,
      nombre: nombreVoulu,
      types,
      difficultes,
      source,
      incontournables,
    }),
    [matiereId, chapitreIds, nombreVoulu, types, difficultes, source, incontournables],
  );
  const disponibles = useMemo(() => questionsCorrespondantes(d, filtre).length, [d, filtre]);

  if (d.estVide) {
    return (
      <EtatVide icone={ListChecks} titre="Aucune question disponible">
        Les QCM seront générés après l'import de tes cours.
      </EtatVide>
    );
  }

  const chapitres = matiereId ? (d.chapitresParMatiere.get(matiereId) ?? []) : [];
  const recentes = [...d.sessions].sort((a, b) => b.debut - a.debut).slice(0, 8);

  const lancer = async () => {
    const questions = choisirQuestions(d, filtre);
    if (questions.length === 0) return;
    const titre =
      chapitreIds.length === 1
        ? (d.chapitreParId.get(chapitreIds[0]!)?.titre ?? 'QCM')
        : matiereId
          ? (d.matiereParId.get(matiereId)?.nom ?? 'QCM')
          : 'Toutes les matières';
    const id = await demarrerSession({
      type: 'qcm',
      titre: incontournables ? `${titre} — incontournables` : titre,
      questions,
      matiereId: matiereId || undefined,
      chapitreIds: chapitreIds.length ? chapitreIds : undefined,
    });
    void navigate(`/session/${id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage titre="QCM" sousTitre="Compose ton entraînement. Chaque réponse est suivie de son explication." />

      <Carte className="mb-4">
        <div className="space-y-5">
          <label className="block text-sm">
            <span className="mb-1.5 block text-texte-2">Matière</span>
            <select
              value={matiereId}
              onChange={(e) => {
                setMatiereId(e.target.value);
                setChapitreIds([]);
              }}
              className={STYLE_CHAMP}
            >
              <option value="">Toutes les matières</option>
              {d.matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </label>

          {chapitres.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-sm text-texte-2">
                Chapitres <span className="text-muet">(tous si aucun n'est choisi)</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {chapitres.map((c) => (
                  <Puce
                    key={c.id}
                    actif={chapitreIds.includes(c.id)}
                    onClick={() => setChapitreIds(basculer(chapitreIds, c.id))}
                  >
                    {c.titre}
                  </Puce>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1.5 text-sm text-texte-2">Nombre de questions</legend>
            <div className="flex flex-wrap gap-1.5">
              {NOMBRES.map((n) => (
                <Puce key={n} actif={nombreVoulu === n} onClick={() => setNombreVoulu(n)}>
                  {n}
                </Puce>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm text-texte-2">
              Types <span className="text-muet">(tous si aucun n'est choisi)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LIBELLE_TYPE) as TypeFiltre[]).map((t) => (
                <Puce key={t} actif={types.includes(t)} onClick={() => setTypes(basculer(types, t))}>
                  {LIBELLE_TYPE[t]}
                </Puce>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-sm text-texte-2">Difficulté</legend>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTES.map((x) => (
                  <Puce
                    key={x.valeur}
                    actif={difficultes.includes(x.valeur)}
                    onClick={() => setDifficultes(basculer(difficultes, x.valeur))}
                  >
                    {x.libelle}
                  </Puce>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm text-texte-2">Source</legend>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <Puce key={s.valeur} actif={source === s.valeur} onClick={() => setSource(s.valeur)}>
                    {s.libelle}
                  </Puce>
                ))}
              </div>
            </fieldset>
          </div>

          <Puce actif={incontournables} onClick={() => setIncontournables(!incontournables)}>
            Incontournables seulement (tombées dans 2 partiels ou plus)
          </Puce>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-bord pt-4">
          <p className="chiffres text-sm text-texte-2" role="status">
            {disponibles} question{disponibles > 1 ? 's' : ''} correspondent
          </p>
          <Bouton variante="primaire" icone={Play} disabled={disponibles === 0} onClick={() => void lancer()}>
            Commencer ({Math.min(nombreVoulu, disponibles)})
          </Bouton>
        </div>
      </Carte>

      {recentes.length > 0 && (
        <Carte titre="Dernières sessions">
          <ul className="divide-y divide-grille">
            {recentes.map((s) => {
              const score = scoreDepuisPoints(s.points ?? 0, s.questionIds.length);
              return (
                <li key={s.id}>
                  <Link to={`/session/${s.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent-clair">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.titre}</span>
                      <span className="block text-xs text-muet">
                        {LIBELLE_SESSION[s.type]} · {jourLisible(cleJour(s.debut))} · {s.questionIds.length}{' '}
                        questions
                      </span>
                    </span>
                    <span className="chiffres shrink-0 text-texte-2">
                      {s.termine ? `${nombre(score.noteSur20, 1)} / 20` : 'À reprendre'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Carte>
      )}
    </div>
  );
}
