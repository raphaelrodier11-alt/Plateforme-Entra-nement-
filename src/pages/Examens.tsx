/**
 * Examens : examen blanc type partiel (questions inédites, chronométré) et
 * entraînement général (tout le programme d'une matière), avec la note
 * prévue et l'historique.
 */
import { GraduationCap, Layers, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { scoreDepuisPoints } from '../../shared/bareme';
import { cleJour, dureeLisible, jourLisible } from '../../shared/dates';
import {
  composerExamenBlanc,
  composerExamenGeneral,
  generateurAleatoire,
} from '../../shared/examens';
import type { Fiabilite } from '../../shared/prediction';
import { Bouton, Carte, EtatVide, STYLE_CHAMP, TitrePage, nombre, pourcent } from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import { CarteGraphique, Courbe } from '../graphiques/Graphiques';
import { lancerExamenBlanc, lancerExamenGeneral } from '../lib/actions';
import { LIBELLE_SESSION, estExamen } from '../lib/sessions';

const LIBELLE_FIABILITE: Record<Fiabilite, string> = {
  faible: 'Estimation fragile : trop peu de questions travaillées',
  moyenne: 'Estimation indicative',
  bonne: 'Estimation fiable',
};

export function Examens() {
  const d = useDonnees();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [matiereId, setMatiereId] = useState(params.get('matiere') ?? d.matieres[0]?.id ?? '');

  const apercu = useMemo(() => {
    const poids = new Map([...d.stats.values()].map((s) => [s.chapitreId, s.poidsExamen]));
    const commun = {
      matiereId,
      questions: d.questions,
      etats: d.etats,
      poids,
      format: d.matiereParId.get(matiereId)?.formatPartiel,
    };
    return {
      blanc: composerExamenBlanc({ ...commun, alea: generateurAleatoire(1) }),
      general: composerExamenGeneral({ ...commun, alea: generateurAleatoire(1) }),
    };
  }, [d.questions, d.etats, d.stats, d.matiereParId, matiereId]);

  if (d.estVide) {
    return (
      <EtatVide icone={GraduationCap} titre="Aucun examen disponible">
        Les examens blancs seront composés après l'import de tes cours.
      </EtatVide>
    );
  }

  const prediction = d.predictions.get(matiereId);
  const passes = d.sessions
    .filter((s) => estExamen(s) && s.termine)
    .sort((a, b) => a.debut - b.debut);
  const passesMatiere = passes.filter((s) => s.matiereId === matiereId);
  const nbChapitres = d.chapitresParMatiere.get(matiereId)?.length ?? 0;

  const ouvrir = async (lanceur: typeof lancerExamenBlanc) => {
    const url = await lanceur(d, matiereId);
    if (url) void navigate(url);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <TitrePage titre="Examens" sousTitre="Entraîne-toi dans les conditions du partiel." />

      <label className="mb-4 block max-w-sm text-sm">
        <span className="mb-1.5 block text-texte-2">Matière</span>
        <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} className={STYLE_CHAMP}>
          {d.matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
      </label>

      {prediction && (
        <section className="carte mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <div>
            <h2 className="text-sm text-texte-2">Note prévue au partiel</h2>
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              {nombre(prediction.note, 1)}
              <span className="text-xl text-muet"> / 20</span>
            </p>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muet">Fourchette</dt>
              <dd className="chiffres">
                {nombre(prediction.min, 1)} à {nombre(prediction.max, 1)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muet">Programme travaillé</dt>
              <dd className="chiffres">{pourcent(prediction.couverture)}</dd>
            </div>
            <div className="col-span-2 text-xs text-texte-2">{LIBELLE_FIABILITE[prediction.fiabilite]}</div>
          </dl>
        </section>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Carte>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-fond text-accent-clair">
              <Timer size={22} aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Examen blanc type partiel</h2>
              <p className="mt-1 text-sm text-texte-2">
                Questions inédites uniquement (jamais celles des annales), réparties comme au
                partiel, en temps limité. Correction et explications à la fin.
              </p>
            </div>
          </div>
          <p className="chiffres mt-4 text-sm text-texte-2">
            {apercu.blanc.questionIds.length} questions · {dureeLisible(apercu.blanc.dureeMin)} ·{' '}
            {apercu.blanc.nbInedites} jamais vues
          </p>
          <Bouton
            variante="primaire"
            className="mt-4 w-full"
            disabled={apercu.blanc.questionIds.length === 0}
            onClick={() => void ouvrir(lancerExamenBlanc)}
          >
            Commencer l'examen blanc
          </Bouton>
        </Carte>

        <Carte>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-fond text-accent-clair">
              <Layers size={22} aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Entraînement général</h2>
              <p className="mt-1 text-sm text-texte-2">
                Tous les chapitres de la matière, annales comprises, pour vérifier que tu connais
                l'ensemble du programme.
              </p>
            </div>
          </div>
          <p className="chiffres mt-4 text-sm text-texte-2">
            {apercu.general.questionIds.length} questions · {dureeLisible(apercu.general.dureeMin)} ·{' '}
            {nbChapitres} chapitre{nbChapitres > 1 ? 's' : ''} couverts
          </p>
          <Bouton
            className="mt-4 w-full"
            disabled={apercu.general.questionIds.length === 0}
            onClick={() => void ouvrir(lancerExamenGeneral)}
          >
            Commencer l'entraînement général
          </Bouton>
        </Carte>
      </div>

      {passesMatiere.length > 1 && (
        <CarteGraphique
          className="mb-4"
          titre="Notes aux examens de la matière"
          sousTitre="Note sur 20, du plus ancien au plus récent"
          tableau={{
            colonnes: ['Date', 'Examen', 'Note / 20'],
            lignes: passesMatiere.map((s) => [
              jourLisible(cleJour(s.debut)),
              LIBELLE_SESSION[s.type],
              nombre(scoreDepuisPoints(s.points ?? 0, s.questionIds.length).noteSur20, 1),
            ]),
          }}
        >
          <Courbe
            nomSerie="Note sur 20"
            max={20}
            format={(v) => nombre(v, v % 1 ? 1 : 0)}
            points={passesMatiere.map((s) => ({
              libelle: jourLisible(cleJour(s.debut)).split(' ').slice(1).join(' '),
              valeur: scoreDepuisPoints(s.points ?? 0, s.questionIds.length).noteSur20,
            }))}
          />
        </CarteGraphique>
      )}

      <Carte titre="Historique">
        {passes.length === 0 ? (
          <p className="text-sm text-texte-2">Aucun examen terminé pour le moment.</p>
        ) : (
          <ul className="divide-y divide-grille">
            {[...passes].reverse().map((s) => {
              const score = scoreDepuisPoints(s.points ?? 0, s.questionIds.length);
              return (
                <li key={s.id}>
                  <Link to={`/session/${s.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent-clair">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.titre}</span>
                      <span className="block text-xs text-muet">
                        {jourLisible(cleJour(s.debut))} · {s.questionIds.length} questions
                      </span>
                    </span>
                    <span className="chiffres shrink-0 font-semibold">{nombre(score.noteSur20, 1)} / 20</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </div>
  );
}
