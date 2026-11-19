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

  const [matiereIds, setMatiereIds] = useState<string[]>(params.get('matiere') ? [params.get('matiere')!] : []);
  const [equilibre, setEquilibre] = useState(true);
  const [chapitreIds, setChapitreIds] = useState<string[]>([]);
  const [nombreVoulu, setNombreVoulu] = useState(10);
  const [types, setTypes] = useState<TypeFiltre[]>([]);
  const [difficultes, setDifficultes] = useState<number[]>([]);
  const [source, setSource] = useState<NonNullable<FiltreQcm['source']>>('toutes');
  const [incontournables, setIncontournables] = useState(params.get('incontournables') === '1');

  const filtre: FiltreQcm = useMemo(
    () => ({
      matiereIds,
      equilibre,
      chapitreIds,
      nombre: nombreVoulu,
      types,
      difficultes,
      source,
      incontournables,
    }),
    [matiereIds, equilibre, chapitreIds, nombreVoulu, types, difficultes, source, incontournables],
  );
  const disponibles = useMemo(() => questionsCorrespondantes(d, filtre).length, [d, filtre]);

  if (d.estVide) {
    return (
      <EtatVide icone={ListChecks} titre="Aucune question disponible">
        Les QCM seront générés après l'import de tes cours.
      </EtatVide>
    );
  }

  // Les chapitres se choisissent dans les matières retenues (jusqu'à quatre, pour rester lisible).
  const matieresChoisies = matiereIds.slice(0, 4);
  const recentes = [...d.sessions].sort((a, b) => b.debut - a.debut).slice(0, 8);

  const lancer = async () => {
    const questions = choisirQuestions(d, filtre);
    if (questions.length === 0) return;
    const noms = matiereIds.map((id) => d.matiereParId.get(id)?.nom).filter(Boolean);
    const titre =
      chapitreIds.length === 1
        ? (d.chapitreParId.get(chapitreIds[0]!)?.titre ?? 'QCM')
        : noms.length === 0
          ? 'Mélange de toutes les matières'
          : noms.length <= 3
            ? noms.join(' + ')
            : `Mélange de ${noms.length} matières`;
    const id = await demarrerSession({
      type: 'qcm',
      titre: incontournables ? `${titre} — incontournables` : titre,
      questions,
      matiereId: matiereIds.length === 1 ? matiereIds[0] : undefined,
      chapitreIds: chapitreIds.length ? chapitreIds : undefined,
    });
    void navigate(`/session/${id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage titre="QCM" sousTitre="Compose ton entraînement. Chaque réponse est suivie de son explication." />

      <Carte className="mb-4">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-1.5 text-sm text-texte-2">
              Sujets <span className="text-muet">(rien de coché : un mélange de toutes les matières)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              <Puce actif={matiereIds.length === 0} onClick={() => { setMatiereIds([]); setChapitreIds([]); }}>
                Tout mélanger
              </Puce>
              {d.matieres.filter((m) => (d.chapitresParMatiere.get(m.id) ?? []).length > 0).map((m) => (
                <Puce
                  key={m.id}
                  actif={matiereIds.includes(m.id)}
                  onClick={() => {
                    const suite = basculer(matiereIds, m.id);
                    setMatiereIds(suite);
                    // Les chapitres cochés d'une matière décochée sont retirés.
                    setChapitreIds((l) => l.filter((id) => suite.includes(d.chapitreParId.get(id)?.matiereId ?? '')));
                  }}
                >
                  {m.nom}
                </Puce>
              ))}
            </div>
            {(matiereIds.length === 0 || matiereIds.length > 1) && (
              <div className="mt-2">
                <Puce actif={equilibre} onClick={() => setEquilibre(!equilibre)}>
                  Répartir équitablement entre les matières
                </Puce>
              </div>
            )}
          </fieldset>

          {matieresChoisies.map((id) => {
            const chapitres = d.chapitresParMatiere.get(id) ?? [];
            if (chapitres.length === 0) return null;
            return (
              <fieldset key={id}>
                <legend className="mb-1.5 text-sm text-texte-2">
                  Chapitres de {d.matiereParId.get(id)?.nom} <span className="text-muet">(tous si aucun n'est choisi)</span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {chapitres.map((c) => (
                    <Puce key={c.id} actif={chapitreIds.includes(c.id)} onClick={() => setChapitreIds(basculer(chapitreIds, c.id))}>
                      {c.titre}
                    </Puce>
                  ))}
                </div>
              </fieldset>
            );
          })}

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
