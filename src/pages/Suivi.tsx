/**
 * Suivi : tableaux de bord de la progression (avancement par chapitre,
 * progrès dans le temps, taux de réussite, carte de chaleur), analyse des
 * types d'erreur, notes prévues et badges.
 */
import {
  Award,
  BookCheck,
  ChartLine,
  Flame,
  Footprints,
  Library,
  Lock,
  Mountain,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dernieresTentatives } from '../../shared/bareme';
import { ajouterJours, cleJour, jourLisible, lundiDe } from '../../shared/dates';
import type { TypeErreur } from '../../shared/types';
import {
  EtatVide,
  Jauge,
  PastilleStatut,
  Puce,
  TitrePage,
  cx,
  nombre,
  pourcent,
} from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import {
  BarreSegmentee,
  BarresClassees,
  CarteChaleur,
  CarteGraphique,
  Courbe,
  Tuile,
} from '../graphiques/Graphiques';
import { LIBELLE_TYPE_ERREUR } from './Session';

const ICONES_BADGE: Record<string, LucideIcon> = {
  footprints: Footprints,
  target: Target,
  mountain: Mountain,
  flame: Flame,
  sparkles: Sparkles,
  'book-check': BookCheck,
  library: Library,
  'shield-check': ShieldCheck,
  star: Star,
  timer: Timer,
  award: Award,
  zap: Zap,
};

/** Couleurs des trois types d'erreur (palette catégorielle validée). */
const COULEUR_TYPE: Record<TypeErreur, string> = {
  lacune: 'var(--color-accent)',
  inattention: 'var(--color-serie-2)',
  piege: 'var(--color-serie-3)',
};

const PERIODES = [
  { jours: 14, libelle: '14 jours' },
  { jours: 30, libelle: '30 jours' },
  { jours: 90, libelle: '90 jours' },
];

function court(jour: string): string {
  return jourLisible(jour).split(' ').slice(1).join(' ');
}

export function Suivi() {
  const d = useDonnees();
  const [periode, setPeriode] = useState(30);
  const aujourdHui = cleJour(d.maintenant);

  const parJour = useMemo(() => {
    const carte = new Map<string, { n: number; points: number }>();
    for (const t of d.tentatives) {
      const jour = cleJour(t.date);
      const c = carte.get(jour) ?? { n: 0, points: 0 };
      c.n += 1;
      c.points += t.points;
      carte.set(jour, c);
    }
    return carte;
  }, [d.tentatives]);

  // Progrès dans le temps : avancement global reconstitué jour après jour.
  const progres = useMemo(() => {
    const total = [...d.stats.values()].reduce((s, c) => s + c.nbQuestions, 0);
    const triees = [...d.tentatives].sort((a, b) => a.date - b.date);
    const jours = Array.from({ length: periode }, (_, i) => ajouterJours(aujourdHui, i - periode + 1));
    let curseur = 0;
    const vues: typeof triees = [];
    return jours.map((jour) => {
      const fin = new Date(`${ajouterJours(jour, 1)}T00:00:00`).getTime();
      while (curseur < triees.length && triees[curseur]!.date < fin) vues.push(triees[curseur++]!);
      const points = [...dernieresTentatives(vues).values()].reduce((s, t) => s + t.points, 0);
      return { libelle: court(jour), valeur: total ? (points / total) * 100 : 0 };
    });
  }, [d.tentatives, d.stats, periode, aujourdHui]);

  const reussite = useMemo(
    () =>
      Array.from({ length: periode }, (_, i) => {
        const jour = ajouterJours(aujourdHui, i - periode + 1);
        const c = parJour.get(jour);
        return { libelle: court(jour), valeur: c ? (c.points / c.n) * 100 : null };
      }),
    [parJour, periode, aujourdHui],
  );

  const chaleur = useMemo(() => {
    const debut = ajouterJours(lundiDe(aujourdHui), -7 * 52);
    const jours = [];
    for (let jour = debut; jour <= aujourdHui; jour = ajouterJours(jour, 1)) {
      jours.push({ jour, libelle: jourLisible(jour), valeur: parJour.get(jour)?.n ?? 0 });
    }
    return jours;
  }, [parJour, aujourdHui]);

  if (d.estVide) {
    return (
      <EtatVide icone={ChartLine} titre="Pas encore de suivi">
        Les graphiques apparaîtront dès que des cours seront importés.
      </EtatVide>
    );
  }

  const types: Record<TypeErreur, number> = { lacune: 0, inattention: 0, piege: 0 };
  for (const t of d.tentatives) if (t.typeErreur) types[t.typeErreur] += 1;
  const dominant = (Object.entries(types) as [TypeErreur, number][]).sort((a, b) => b[1] - a[1])[0];

  const total = d.tentatives.length;
  const points = d.tentatives.reduce((s, t) => s + t.points, 0);
  const { profil } = d;
  const tauxMatieres = d.matieres
    .map((m) => {
      const s = d.statsMatiere.get(m.id);
      return {
        id: m.id,
        libelle: m.nom,
        valeur: s?.maitrise ?? 0,
        texte: s && s.maitrise > 0 ? pourcent(s.maitrise) : '—',
      };
    })
    .sort((a, b) => b.valeur - a.valeur);

  return (
    <div className="space-y-4">
      <TitrePage titre="Suivi" sousTitre="Ta progression, tes points forts et ce qu'il reste à faire." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tuile
          libelle="Points"
          valeur={nombre(profil.points)}
          complement={`Niveau ${profil.niveau + 1} · ${profil.titre}`}
        />
        <Tuile
          libelle="Série en cours"
          valeur={`${profil.series.courante} j`}
          complement={`Record : ${profil.series.meilleure} jours`}
          icone={<Flame size={16} className={profil.series.courante ? 'text-serieux' : ''} aria-hidden />}
        />
        <Tuile libelle="Questions répondues" valeur={nombre(total)} complement={`${profil.series.joursActifs.length} jours de révision`} />
        <Tuile
          libelle="Taux de réussite"
          valeur={total ? pourcent(points / total) : '—'}
          complement="Toutes tentatives confondues"
        />
      </div>

      {/* Un seul sélecteur de période pour tous les graphiques temporels. */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Période">
        <span className="mr-1 text-xs text-muet">Période</span>
        {PERIODES.map((p) => (
          <Puce key={p.jours} actif={periode === p.jours} onClick={() => setPeriode(p.jours)}>
            {p.libelle}
          </Puce>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteGraphique
          titre="Progrès dans le temps"
          sousTitre="Part du programme sue, en %"
          tableau={{
            colonnes: ['Jour', 'Avancement'],
            lignes: progres.map((p) => [p.libelle, `${nombre(p.valeur, 1)} %`]),
          }}
        >
          <Courbe nomSerie="Avancement global" points={progres} max={100} format={(v) => `${Math.round(v)} %`} />
        </CarteGraphique>

        <CarteGraphique
          titre="Taux de réussite aux QCM"
          sousTitre="Points obtenus par question, jour par jour, en %"
          tableau={{
            colonnes: ['Jour', 'Réussite', 'Questions'],
            lignes: reussite.map((p, i) => [
              p.libelle,
              p.valeur === null ? '—' : `${Math.round(p.valeur)} %`,
              parJour.get(ajouterJours(aujourdHui, i - periode + 1))?.n ?? 0,
            ]),
          }}
        >
          <Courbe nomSerie="Taux de réussite" points={reussite} max={100} format={(v) => `${Math.round(v)} %`} />
        </CarteGraphique>
      </div>

      <CarteGraphique
        titre="Carte de chaleur des révisions"
        sousTitre="Questions répondues chaque jour"
        tableau={{
          colonnes: ['Jour', 'Questions'],
          lignes: chaleur.filter((j) => j.valeur > 0).reverse().map((j) => [j.libelle, j.valeur]),
        }}
      >
        <CarteChaleur jours={chaleur} unite="questions" />
      </CarteGraphique>

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteGraphique
          titre="Réussite par matière"
          sousTitre="Dernière réponse à chaque question travaillée"
          tableau={{
            colonnes: ['Matière', 'Réussite', 'Note prévue / 20'],
            lignes: tauxMatieres.map((m) => [
              m.libelle,
              m.texte,
              d.predictions.get(m.id) ? nombre(d.predictions.get(m.id)!.note, 1) : '—',
            ]),
          }}
        >
          <BarresClassees lignes={tauxMatieres} max={1} />
        </CarteGraphique>

        <CarteGraphique
          titre="Types d'erreur"
          sousTitre={
            dominant && dominant[1] > 0
              ? `Le plus fréquent : ${LIBELLE_TYPE_ERREUR[dominant[0]].titre.toLowerCase()}`
              : 'Renseigné après chaque réponse fausse'
          }
          tableau={{
            colonnes: ['Type', 'Erreurs'],
            lignes: (Object.keys(types) as TypeErreur[]).map((t) => [LIBELLE_TYPE_ERREUR[t].titre, types[t]]),
          }}
        >
          <BarreSegmentee
            unite="erreurs"
            parts={(Object.keys(types) as TypeErreur[]).map((t) => ({
              id: t,
              libelle: LIBELLE_TYPE_ERREUR[t].titre,
              valeur: types[t],
              couleur: COULEUR_TYPE[t],
            }))}
          />
          <ul className="mt-4 space-y-1.5 text-xs text-texte-2">
            {(Object.keys(types) as TypeErreur[]).map((t) => (
              <li key={t}>
                <strong className="font-semibold text-texte">{LIBELLE_TYPE_ERREUR[t].titre}</strong> —{' '}
                {LIBELLE_TYPE_ERREUR[t].aide.toLowerCase()}
              </li>
            ))}
          </ul>
        </CarteGraphique>
      </div>

      <section className="carte p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Avancement par chapitre</h2>
        <div className="space-y-6">
          {d.matieres.map((m) => (
            <div key={m.id}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muet uppercase">{m.nom}</h3>
              <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {(d.chapitresParMatiere.get(m.id) ?? []).map((c) => {
                  const s = d.stats.get(c.id);
                  return (
                    <li key={c.id} className="min-w-0">
                      <Link to={`/chapitre/${c.id}`} className="block">
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{c.titre}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <PastilleStatut statut={s?.statut ?? 'a_commencer'} />
                            <span className="chiffres w-12 text-right whitespace-nowrap text-texte-2">
                              {pourcent(s?.avancement ?? 0)}
                            </span>
                          </span>
                        </div>
                        <Jauge valeur={s?.avancement ?? 0} libelle={`Avancement de ${c.titre}`} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="carte p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">
          Badges{' '}
          <span className="chiffres font-normal text-muet">
            {profil.badges.filter((b) => b.obtenu).length} / {profil.badges.length}
          </span>
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profil.badges.map((b) => {
            const Icone = b.obtenu ? (ICONES_BADGE[b.definition.icone] ?? Award) : Lock;
            return (
              <li
                key={b.definition.id}
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-3',
                  b.obtenu ? 'border-accent/50 bg-accent-fond' : 'border-bord bg-surface-2',
                )}
              >
                <span
                  className={cx(
                    'grid size-11 shrink-0 place-items-center rounded-full',
                    b.obtenu ? 'bg-accent text-white' : 'bg-surface-3 text-muet',
                  )}
                >
                  <Icone size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {b.definition.nom}
                    <span className="sr-only">{b.obtenu ? ' (obtenu)' : ' (à débloquer)'}</span>
                  </p>
                  <p className="text-xs text-texte-2">{b.definition.description}</p>
                  {!b.obtenu && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Jauge valeur={b.progression} libelle={`Progression vers ${b.definition.nom}`} />
                      <span className="chiffres shrink-0 text-[11px] text-muet">
                        {Math.min(b.valeur, b.definition.cible)} / {b.definition.cible}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
