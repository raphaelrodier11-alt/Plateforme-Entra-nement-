/**
 * Revue des erreurs : toutes les erreurs avec leurs filtres (chapitre,
 * fréquence, date, type), la file de répétition espacée, et pour chaque
 * erreur la bonne réponse et le rappel de cours correspondant.
 */
import { ChevronDown, CircleAlert, Flag, PartyPopper, Play, Star, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cleJour, joursEntre, jourLisible } from '../../shared/dates';
import { estIncontournable } from '../../shared/marqueurs';
import type { Question, TypeErreur } from '../../shared/types';
import { ExplicationDetaillee } from '../composants/ExplicationDetaillee';
import { ExpliquerToutes } from '../composants/ExpliquerToutes';
import { QuestionVue } from '../composants/QuestionVue';
import {
  Bouton,
  EtatVide,
  Onglets,
  Pastille,
  Puce,
  STYLE_CHAMP,
  TitrePage,
  cx,
} from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import { lancerRevisionErreurs } from '../lib/actions';
import { Explication, LIBELLE_TYPE_ERREUR } from './Session';

type Vue = 'dues' | 'toutes' | 'a_revoir';
type Tri = 'date' | 'frequence';

export function Erreurs() {
  const d = useDonnees();
  const navigate = useNavigate();
  const [vue, setVue] = useState<Vue>(d.erreursDues.length > 0 ? 'dues' : 'toutes');
  const [matiereId, setMatiereId] = useState('');
  const [chapitreId, setChapitreId] = useState('');
  const [type, setType] = useState<TypeErreur | undefined>();
  const [tri, setTri] = useState<Tri>('date');
  const [ouverte, setOuverte] = useState<string>();

  const aujourdHui = cleJour(d.maintenant);
  const base = vue === 'dues' ? d.erreursDues : vue === 'a_revoir' ? d.aRevoir : d.erreurs;

  const liste = useMemo(() => {
    const filtrees = base.filter((q) => {
      if (matiereId && q.matiereId !== matiereId) return false;
      if (chapitreId && q.chapitreId !== chapitreId) return false;
      if (type && d.etats.get(q.id)?.dernierTypeErreur !== type) return false;
      return true;
    });
    return filtrees.sort((a, b) => {
      const ea = d.etats.get(a.id)!;
      const eb = d.etats.get(b.id)!;
      return tri === 'frequence'
        ? eb.nbEchecs - ea.nbEchecs || (eb.derniereErreurLe ?? 0) - (ea.derniereErreurLe ?? 0)
        : (eb.derniereErreurLe ?? 0) - (ea.derniereErreurLe ?? 0);
    });
  }, [base, matiereId, chapitreId, type, tri, d.etats]);

  const reviser = async (questions: Question[], titre: string) => {
    const url = await lancerRevisionErreurs(d, questions, titre);
    if (url) void navigate(url);
  };

  const chapitres = matiereId ? (d.chapitresParMatiere.get(matiereId) ?? []) : [];
  const total = d.erreurs.length + d.aRevoir.length;

  return (
    <div className="mx-auto max-w-3xl">
      <TitrePage
        titre="Erreurs"
        sousTitre="Chaque erreur revient à intervalles croissants jusqu'à être maîtrisée."
        action={
          d.erreursDues.length > 0 && (
            <Bouton
              variante="primaire"
              icone={Play}
              onClick={() => void reviser(d.erreursDues, 'Erreurs du jour')}
            >
              Réviser les {d.erreursDues.length} du jour
            </Bouton>
          )
        }
      />

      {total === 0 ? (
        <EtatVide icone={PartyPopper} titre="Aucune erreur à revoir">
          Les questions ratées apparaîtront ici, avec leur rappel de cours.
        </EtatVide>
      ) : (
        <>
          <div className="mb-4">
            <Onglets
              libelle="Liste d'erreurs"
              valeur={vue}
              onChange={(v) => {
                setVue(v);
                setOuverte(undefined);
              }}
              options={[
                { valeur: 'dues', libelle: 'À revoir aujourd’hui', compte: d.erreursDues.length },
                { valeur: 'toutes', libelle: 'Toutes mes erreurs', compte: d.erreurs.length },
                { valeur: 'a_revoir', libelle: 'Pièges déjoués', compte: d.aRevoir.length },
              ]}
            />
            {vue === 'a_revoir' && (
              <p className="mt-2 text-xs text-muet">
                Questions piégeuses que tu as fini par réussir à 100 % : elles ont quitté la liste
                d'erreurs mais restent signalées « à revoir ».
              </p>
            )}
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="sr-only">Matière</span>
              <select
                value={matiereId}
                onChange={(e) => {
                  setMatiereId(e.target.value);
                  setChapitreId('');
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
            <label className="text-sm">
              <span className="sr-only">Chapitre</span>
              <select
                value={chapitreId}
                onChange={(e) => setChapitreId(e.target.value)}
                disabled={!matiereId}
                className={cx(STYLE_CHAMP, !matiereId && 'opacity-50')}
              >
                <option value="">Tous les chapitres</option>
                {chapitres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <fieldset className="flex flex-wrap items-center gap-1.5">
              <legend className="sr-only">Type d'erreur</legend>
              {(Object.keys(LIBELLE_TYPE_ERREUR) as TypeErreur[]).map((t) => (
                <Puce key={t} actif={type === t} onClick={() => setType(type === t ? undefined : t)}>
                  {LIBELLE_TYPE_ERREUR[t].titre}
                </Puce>
              ))}
            </fieldset>
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Tri</legend>
              <span className="text-xs text-muet">Trier par</span>
              <Puce actif={tri === 'date'} onClick={() => setTri('date')}>
                Date
              </Puce>
              <Puce actif={tri === 'frequence'} onClick={() => setTri('frequence')}>
                Fréquence
              </Puce>
            </fieldset>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="chiffres text-sm text-texte-2" role="status">
              {liste.length} question{liste.length > 1 ? 's' : ''}
            </p>
            {liste.length > 0 && vue !== 'dues' && (
              <Bouton icone={Play} onClick={() => void reviser(liste, 'Révision choisie')}>
                Réviser cette sélection
              </Bouton>
            )}
          </div>

          <ExpliquerToutes questions={liste} />

          {liste.length === 0 ? (
            <p className="carte p-6 text-center text-sm text-texte-2">
              Aucune question ne correspond à ces filtres.
            </p>
          ) : (
            <ul className="space-y-2">
              {liste.map((q) => {
                const etat = d.etats.get(q.id)!;
                const rep = d.repetitions.get(q.id);
                const jours = rep ? joursEntre(aujourdHui, cleJour(rep.echeance)) : undefined;
                const estOuverte = ouverte === q.id;
                const chapitre = d.chapitreParId.get(q.chapitreId);
                return (
                  <li key={q.id} className="carte overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={estOuverte}
                      onClick={() => setOuverte(estOuverte ? undefined : q.id)}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="mb-1.5 flex flex-wrap gap-1.5">
                          {etat.dernierTypeErreur && (
                            <Pastille>{LIBELLE_TYPE_ERREUR[etat.dernierTypeErreur].titre}</Pastille>
                          )}
                          {etat.piegeuse && (
                            <Pastille ton="alerte" icone={TriangleAlert}>
                              Piégeuse
                            </Pastille>
                          )}
                          {etat.aRevoir && (
                            <Pastille icone={Flag}>À revoir</Pastille>
                          )}
                          {estIncontournable(q) && (
                            <Pastille ton="accent" icone={Star}>
                              Incontournable
                            </Pastille>
                          )}
                        </span>
                        <span className="block text-sm">{q.enonce.replace(/\{\{[^}]+\}\}/g, '…')}</span>
                        <span className="chiffres mt-1.5 block text-xs text-muet">
                          {chapitre?.titre} · ratée {etat.nbEchecs} fois
                          {etat.derniereErreurLe && ` · dernière erreur ${jourLisible(cleJour(etat.derniereErreurLe))}`}
                          {jours !== undefined &&
                            ` · ${jours <= 0 ? 'à revoir maintenant' : `à revoir dans ${jours} j`}`}
                        </span>
                      </span>
                      <ChevronDown
                        size={18}
                        className={cx('mt-1 shrink-0 text-muet transition-transform', estOuverte && 'rotate-180')}
                        aria-hidden
                      />
                    </button>
                    {estOuverte && (
                      <div className="space-y-4 border-t border-bord p-4">
                        <QuestionVue
                          question={q}
                          cas={q.casId ? d.casParId.get(q.casId) : undefined}
                          reponse={{}}
                          solution
                        />
                        <Explication question={q} />
                        <ExplicationDetaillee question={q} />
                        <Bouton icone={Play} onClick={() => void reviser([q], 'Question à revoir')}>
                          Refaire cette question
                        </Bouton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {total === 0 && d.tentatives.length === 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muet">
          <CircleAlert size={16} aria-hidden />
          Commence un QCM pour alimenter cette page.
        </p>
      )}
    </div>
  );
}
