/**
 * Planning : disponibilités par jour et par créneau, dates d'examens,
 * calendrier iCloud, et l'emploi du temps de révision qui en découle.
 */
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  GraduationCap,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { devinerMatiere, examensAValider, jourEvenement } from '../../shared/calendrier';
import {
  ajouterJours,
  cleJour,
  dureeLisible,
  heureLisible,
  joursEntre,
  jourLisible,
  lundiDe,
} from '../../shared/dates';
import type { AlertePlanning, Seance } from '../../shared/planning';
import {
  CRENEAUX,
  type Creneau,
  type Disponibilite,
  type Evenement,
  type Examen,
} from '../../shared/types';
import {
  Bouton,
  Carte,
  Pastille,
  STYLE_CHAMP,
  TitrePage,
  cx,
} from '../composants/ui';
import { enregistrer, enregistrerPlusieurs, supprimer, synchroniser } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { BarresClassees } from '../graphiques/Graphiques';
import { LIBELLE_TACHE, lancerTache } from '../lib/actions';
import { actualiserCalendrier, derniereLecture, type ResultatCalendrier } from '../lib/calendrier';
import { nouvelId } from '../lib/sessions';

export const LIBELLE_CRENEAU: Record<Creneau, string> = {
  matin: 'Matin',
  midi: 'Midi',
  apres_midi: 'Après-midi',
  soir: 'Soir',
};

const DUREES = [30, 45, 60, 90, 120, 150, 180, 240];

const MESSAGE_CALENDRIER: Record<Exclude<ResultatCalendrier, { ok: true }>['raison'], string> = {
  sans_serveur: 'La lecture du calendrier nécessite la version en ligne de l’app.',
  non_configure: 'Enregistre d’abord le lien de ton calendrier.',
  inaccessible: 'Le lien du calendrier ne répond pas. Vérifie qu’il est toujours public.',
  illisible: 'Le fichier reçu n’est pas un calendrier lisible.',
  hors_ligne: 'Hors connexion : le calendrier sera relu au retour du réseau.',
};

function Disponibilites() {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const [lundi, setLundi] = useState(() => lundiDe(aujourdHui));
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
  const parJour = new Map(d.disponibilites.map((x) => [x.id, x]));

  const modifier = async (jour: string, creneau: Creneau, minutes: number | undefined) => {
    const actuelle = parJour.get(jour)?.creneaux ?? {};
    const creneaux = { ...actuelle };
    if (minutes) creneaux[creneau] = minutes;
    else delete creneaux[creneau];
    await enregistrer<Disponibilite>('disponibilites', { id: jour, creneaux });
  };

  const recopier = async () => {
    const copies: Disponibilite[] = [];
    for (let semaine = 1; semaine <= 4; semaine++) {
      jours.forEach((jour) => {
        copies.push({
          id: ajouterJours(jour, 7 * semaine),
          creneaux: { ...(parJour.get(jour)?.creneaux ?? {}) },
        });
      });
    }
    await enregistrerPlusieurs('disponibilites', copies);
  };

  const totalSemaine = jours.reduce(
    (s, jour) => s + Object.values(parJour.get(jour)?.creneaux ?? {}).reduce((x, m) => x + (m ?? 0), 0),
    0,
  );

  return (
    <Carte
      titre="Mes disponibilités"
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLundi(ajouterJours(lundi, -7))}
            disabled={lundi <= lundiDe(aujourdHui)}
            aria-label="Semaine précédente"
            className="grid size-9 place-items-center rounded-lg text-texte-2 hover:bg-surface-2 disabled:opacity-30"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="chiffres min-w-32 text-center text-xs text-texte-2">
            Semaine du {jourLisible(lundi).split(' ').slice(1).join(' ')}
          </span>
          <button
            type="button"
            onClick={() => setLundi(ajouterJours(lundi, 7))}
            aria-label="Semaine suivante"
            className="grid size-9 place-items-center rounded-lg text-texte-2 hover:bg-surface-2"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-muet">
        Coche les créneaux où tu peux réviser, puis ajuste la durée de chaque séance.
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[5.5rem_repeat(4,1fr)] gap-1.5 text-sm">
          <span />
          {CRENEAUX.map((c) => (
            <span key={c} className="pb-1 text-center text-xs text-muet">
              {LIBELLE_CRENEAU[c]}
              <span className="chiffres block text-[10px]">
                {d.reglages.heuresCreneaux[c][0]} h – {d.reglages.heuresCreneaux[c][1]} h
              </span>
            </span>
          ))}
          {jours.map((jour) => {
            const passe = jour < aujourdHui;
            return (
              <div key={jour} className="contents">
                <span
                  className={cx(
                    'flex items-center text-xs first-letter:uppercase',
                    jour === aujourdHui ? 'font-semibold text-texte' : 'text-texte-2',
                    passe && 'opacity-40',
                  )}
                >
                  {jourLisible(jour)}
                </span>
                {CRENEAUX.map((creneau) => {
                  const minutes = parJour.get(jour)?.creneaux[creneau];
                  const [h1, h2] = d.reglages.heuresCreneaux[creneau];
                  const max = (h2 - h1) * 60;
                  const libelle = `${jourLisible(jour)}, ${LIBELLE_CRENEAU[creneau]}`;
                  return (
                    <div
                      key={creneau}
                      className={cx(
                        'flex min-h-12 items-center gap-1 rounded-xl border px-1.5',
                        minutes ? 'border-accent bg-accent-fond' : 'border-bord bg-surface-2',
                        passe && 'opacity-40',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={!!minutes}
                        disabled={passe}
                        onChange={(e) =>
                          void modifier(
                            jour,
                            creneau,
                            e.target.checked ? Math.min(d.reglages.dureeDefautMin, max) : undefined,
                          )
                        }
                        aria-label={libelle}
                        className="size-5 shrink-0 accent-[#3987e5]"
                      />
                      {minutes ? (
                        <select
                          value={minutes}
                          disabled={passe}
                          onChange={(e) => void modifier(jour, creneau, Number(e.target.value))}
                          aria-label={`Durée, ${libelle}`}
                          className="chiffres min-w-0 flex-1 rounded-lg bg-transparent py-1 text-xs text-texte"
                        >
                          {DUREES.filter((x) => x <= max || x === minutes).map((x) => (
                            <option key={x} value={x} className="bg-surface-2">
                              {dureeLisible(x)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="chiffres text-sm text-texte-2">
          {dureeLisible(totalSemaine)} de révision cette semaine
        </p>
        <Bouton icone={Copy} disabled={totalSemaine === 0} onClick={() => void recopier()}>
          Recopier sur les 4 semaines suivantes
        </Bouton>
      </div>
    </Carte>
  );
}

function ExamensEtCalendrier() {
  const d = useDonnees();
  const aujourdHui = cleJour(d.maintenant);
  const [matiereId, setMatiereId] = useState(d.matieres[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [lien, setLien] = useState(d.reglages.icsUrl ?? '');
  const [motsCles, setMotsCles] = useState(d.reglages.motsClesExamen.join(', '));
  const [message, setMessage] = useState<string>();
  const [lecture, setLecture] = useState<number>();
  const [enCours, setEnCours] = useState(false);
  const [choix, setChoix] = useState<Record<string, string>>({});

  useEffect(() => {
    void derniereLecture().then(setLecture);
  }, [d.evenements]);

  const ajouter = async () => {
    if (!matiereId || !date) return;
    const examen: Examen = {
      id: nouvelId(),
      matiereId,
      titre: `Partiel ${d.matiereParId.get(matiereId)?.nom ?? ''}`.trim(),
      date,
      source: 'manuel',
    };
    await enregistrer('examens', examen);
    setDate('');
  };

  const relire = async () => {
    setEnCours(true);
    const resultat = await actualiserCalendrier();
    setMessage(
      resultat.ok
        ? `${resultat.nb} événement${resultat.nb > 1 ? 's' : ''} lu${resultat.nb > 1 ? 's' : ''}.`
        : MESSAGE_CALENDRIER[resultat.raison],
    );
    setEnCours(false);
  };

  const enregistrerCalendrier = async () => {
    await enregistrer('reglages', {
      ...d.reglages,
      icsUrl: lien.trim() || undefined,
      motsClesExamen: motsCles
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      majLe: Date.now(),
    });
    if (lien.trim()) {
      // Le serveur doit connaître le lien avant de pouvoir le relayer.
      await synchroniser();
      await relire();
    }
  };

  const candidats = examensAValider(d.evenements, d.examens, d.reglages, d.maintenant);

  const valider = async (ev: Evenement) => {
    const matiere = choix[ev.id] ?? devinerMatiere(ev.titre, d.matieres) ?? d.matieres[0]?.id;
    if (!matiere) return;
    const examen: Examen = {
      id: nouvelId(),
      matiereId: matiere,
      titre: ev.titre,
      date: jourEvenement(ev),
      source: 'icloud',
      evenementId: ev.id,
    };
    await enregistrer('examens', examen);
  };

  const ignorer = async (ev: Evenement) => {
    await enregistrer('reglages', {
      ...d.reglages,
      evenementsIgnores: [...d.reglages.evenementsIgnores, ev.id],
      majLe: Date.now(),
    });
  };

  const examens = [...d.examens].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Carte titre="Dates d'examens">
        {candidats.length > 0 && (
          <div className="mb-4 space-y-2">
            {candidats.map((ev) => (
              <div key={ev.id} className="rounded-xl border border-accent/50 bg-accent-fond p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <CalendarClock size={16} className="text-accent-clair" aria-hidden />
                  Examen détecté dans ton calendrier
                </p>
                <p className="mt-1 text-texte-2">
                  « {ev.titre} » · {jourLisible(jourEvenement(ev))}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Matière de l'examen"
                    value={choix[ev.id] ?? devinerMatiere(ev.titre, d.matieres) ?? d.matieres[0]?.id ?? ''}
                    onChange={(e) => setChoix({ ...choix, [ev.id]: e.target.value })}
                    className={`${STYLE_CHAMP} w-auto flex-1`}
                  >
                    {d.matieres.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom}
                      </option>
                    ))}
                  </select>
                  <Bouton variante="primaire" onClick={() => void valider(ev)}>
                    Ajouter
                  </Bouton>
                  <Bouton variante="discret" onClick={() => void ignorer(ev)}>
                    Ignorer
                  </Bouton>
                </div>
              </div>
            ))}
          </div>
        )}

        {examens.length === 0 ? (
          <p className="mb-3 text-sm text-texte-2">Aucun examen saisi.</p>
        ) : (
          <ul className="mb-4 divide-y divide-grille">
            {examens.map((x) => {
              const jours = joursEntre(aujourdHui, x.date);
              return (
                <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <GraduationCap size={18} className="shrink-0 text-accent-clair" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {d.matiereParId.get(x.matiereId)?.nom ?? x.titre}
                    </span>
                    <span className="chiffres block text-xs text-muet">
                      {jourLisible(x.date)} ·{' '}
                      {jours < 0 ? 'passé' : jours === 0 ? "aujourd'hui" : `dans ${jours} j`}
                      {x.source === 'icloud' && ' · depuis le calendrier'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void supprimer('examens', x.id)}
                    aria-label={`Supprimer l'examen ${x.titre}`}
                    className="grid size-9 place-items-center rounded-lg text-muet hover:bg-surface-2 hover:text-texte"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {d.matieres.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-36 flex-1 text-sm">
              <span className="mb-1 block text-xs text-muet">Matière</span>
              <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} className={STYLE_CHAMP}>
                {d.matieres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muet">Date</span>
              <input
                type="date"
                value={date}
                min={aujourdHui}
                onChange={(e) => setDate(e.target.value)}
                className={STYLE_CHAMP}
              />
            </label>
            <Bouton icone={Plus} disabled={!date} onClick={() => void ajouter()}>
              Ajouter
            </Bouton>
          </div>
        )}
      </Carte>

      <Carte titre="Calendrier iCloud">
        <p className="mb-3 text-xs text-muet">
          Sens unique : Dr Rodier lit ton calendrier, il n'y écrit jamais. Un événement qui tombe
          sur une révision la déplace automatiquement ; un titre contenant un mot-clé est proposé
          comme examen.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muet">Lien public du calendrier (webcal:// ou https://)</span>
          <input
            type="url"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder="webcal://p00-caldav.icloud.com/published/2/…"
            autoCapitalize="none"
            className={STYLE_CHAMP}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs text-muet">Mots-clés d'examen, séparés par des virgules</span>
          <input
            type="text"
            value={motsCles}
            onChange={(e) => setMotsCles(e.target.value)}
            className={STYLE_CHAMP}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Bouton variante="primaire" onClick={() => void enregistrerCalendrier()}>
            Enregistrer
          </Bouton>
          <Bouton icone={RefreshCw} disabled={enCours || !d.reglages.icsUrl} onClick={() => void relire()}>
            {enCours ? 'Lecture…' : 'Relire maintenant'}
          </Bouton>
        </div>
        <p className="mt-3 text-xs text-texte-2" role="status">
          {message ??
            (d.reglages.icsUrl
              ? `${d.evenements.length} événement(s) enregistré(s)${
                  lecture ? ` · dernière lecture ${new Date(lecture).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''
                }`
              : 'Aucun calendrier relié.')}
        </p>
        <Link to="/reglages#calendrier" className="mt-2 inline-block text-xs text-accent-clair hover:underline">
          Comment obtenir le lien de mon calendrier ?
        </Link>
      </Carte>
    </div>
  );
}

function texteAlerte(alerte: AlertePlanning, nomExamen: (id: string) => string): string {
  switch (alerte.type) {
    case 'aucune_disponibilite':
      return 'Aucune disponibilité cochée : le planning est vide.';
    case 'sans_seance_avant_examen':
      return `Aucune séance de révision n'est prévue avant ${nomExamen(alerte.examenId)}.`;
    case 'seance_non_replacee':
      return `La séance du ${jourLisible(alerte.date)} (${LIBELLE_CRENEAU[alerte.creneau].toLowerCase()}) est occupée par « ${alerte.evenement} » et n'a pas pu être replacée dans la semaine.`;
  }
}

function CarteSeance({ seance }: { seance: Seance }) {
  const d = useDonnees();
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-bord bg-surface-2 p-3">
      <p className="chiffres flex flex-wrap items-center gap-2 text-xs text-texte-2">
        <CalendarDays size={14} aria-hidden />
        {heureLisible(seance.debutMin)} – {heureLisible(seance.debutMin + seance.dureeMin)} ·{' '}
        {dureeLisible(seance.dureeMin)}
        {seance.deplacee && (
          <Pastille ton="alerte" icone={TriangleAlert}>
            Déplacée du {jourLisible(seance.deplacee.date)} ({LIBELLE_CRENEAU[seance.deplacee.creneau].toLowerCase()}) :{' '}
            {seance.deplacee.evenement}
          </Pastille>
        )}
        {seance.decalee && <Pastille>Décalée : {seance.decalee.evenement}</Pastille>}
      </p>
      <ul className="mt-2 space-y-1">
        {seance.taches.map((t, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => void lancerTache(d, t).then((url) => navigate(url))}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-3"
            >
              <span className="chiffres w-12 shrink-0 text-xs text-muet">{dureeLisible(t.dureeMin)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {t.chapitreId
                    ? d.chapitreParId.get(t.chapitreId)?.titre
                    : t.matiereId
                      ? `${LIBELLE_TACHE[t.type]} — ${d.matiereParId.get(t.matiereId)?.nom ?? ''}`
                      : LIBELLE_TACHE[t.type]}
                </span>
                <span className="block truncate text-xs text-muet">
                  {t.chapitreId ? `${LIBELLE_TACHE[t.type]} · ` : ''}
                  {t.raison}
                </span>
              </span>
              <Play size={14} className="shrink-0 text-accent-clair" aria-hidden />
            </button>
          </li>
        ))}
        {seance.taches.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muet">Séance libre (aucun contenu à planifier)</li>
        )}
      </ul>
    </div>
  );
}

export function PagePlanning() {
  const d = useDonnees();
  const { planning } = d;
  const jours = [...new Set(planning.seances.map((s) => s.date))];
  const nomExamen = (id: string) => {
    const x = d.examens.find((e) => e.id === id);
    return x ? `l'examen de ${d.matiereParId.get(x.matiereId)?.nom ?? x.titre}` : "l'examen";
  };
  const minutes = Object.entries(planning.minutesParMatiere)
    .map(([id, m]) => ({ id, libelle: d.matiereParId.get(id)?.nom ?? id, valeur: m, texte: dureeLisible(m) }))
    .sort((a, b) => b.valeur - a.valeur);

  return (
    <div className="space-y-4">
      <TitrePage
        titre="Planning"
        sousTitre="Recalculé à chaque progrès : priorité à ce que tu ne sais pas et à ce qui tombe le plus."
      />
      <Disponibilites />
      <ExamensEtCalendrier />

      {planning.alertes.length > 0 && (
        <ul className="space-y-2">
          {planning.alertes.map((a, i) => (
            <li key={i} className="carte flex items-start gap-2.5 border-alerte/40 bg-alerte/10 p-3 text-sm">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
              {texteAlerte(a, nomExamen)}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Carte className="lg:col-span-2" titre="Emploi du temps de révision">
          {jours.length === 0 ? (
            <p className="text-sm text-texte-2">
              Coche des créneaux ci-dessus : ton emploi du temps apparaîtra ici.
            </p>
          ) : (
            <ol className="space-y-4">
              {jours.map((jour) => (
                <li key={jour}>
                  <h3 className="mb-2 text-sm font-semibold first-letter:uppercase">{jourLisible(jour)}</h3>
                  <div className="space-y-2">
                    {planning.seances
                      .filter((s) => s.date === jour)
                      .map((s) => (
                        <CarteSeance key={s.id} seance={s} />
                      ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Carte>
        <Carte titre="Temps prévu par matière">
          {minutes.length === 0 ? (
            <p className="text-sm text-texte-2">Rien de planifié pour le moment.</p>
          ) : (
            <BarresClassees lignes={minutes} />
          )}
        </Carte>
      </div>
    </div>
  );
}
