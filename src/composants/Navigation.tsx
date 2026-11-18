/**
 * Navigation : barre latérale sur ordinateur et tablette en paysage, barre
 * d'onglets en bas de l'écran sur téléphone.
 */
import {
  BookOpen,
  CalendarDays,
  ChartLine,
  CircleAlert,
  Cloud,
  CloudOff,
  Dumbbell,
  Ellipsis,
  FilePen,
  GraduationCap,
  House,
  MessageCircleHeart,
  ListChecks,
  RefreshCw,
  Search,
  Settings,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useEtatSync } from '../App';
import type { EtatSync } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { Docteur } from './Docteur';
import { cx } from './ui';

interface Entree {
  vers: string;
  libelle: string;
  icone: LucideIcon;
  compte?: number;
}

function LibelleSync({ sync }: { sync: EtatSync }) {
  const { statut, enAttente } = sync;
  const Icone = statut === 'en_cours' ? RefreshCw : statut === 'a_jour' ? Cloud : CloudOff;
  const texte =
    statut === 'local'
      ? 'Mode local (sans serveur)'
      : statut === 'en_cours'
        ? 'Synchronisation…'
        : statut === 'a_jour'
          ? 'Synchronisé'
          : statut === 'hors_ligne'
            ? `Hors connexion${enAttente ? ` · ${enAttente} en attente` : ''}`
            : 'Synchronisation impossible';
  return (
    <span className="flex items-center gap-2 text-xs text-muet" role="status">
      <Icone size={14} className={statut === 'en_cours' ? 'animate-spin' : ''} aria-hidden />
      {texte}
    </span>
  );
}

function Compteur({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="chiffres ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Navigation() {
  const { erreursDues, nbAValider, nbNotificationsNonLues } = useDonnees();
  const sync = useEtatSync();
  const [plus, setPlus] = useState(false);

  const entrees: Entree[] = [
    { vers: '/', libelle: 'Accueil', icone: House },
    { vers: '/cours', libelle: 'Cours', icone: BookOpen },
    { vers: '/assistant', libelle: 'Dr Rodier', icone: MessageCircleHeart },
    { vers: '/recherche', libelle: 'Recherche', icone: Search },
    { vers: '/qcm', libelle: 'QCM', icone: ListChecks },
    { vers: '/entrainements', libelle: 'Entraînements', icone: Dumbbell },
    { vers: '/erreurs', libelle: 'Erreurs', icone: CircleAlert, compte: erreursDues.length },
    { vers: '/planning', libelle: 'Planning', icone: CalendarDays },
    { vers: '/examens', libelle: 'Examens', icone: GraduationCap },
    { vers: '/suivi', libelle: 'Suivi', icone: ChartLine },
    { vers: '/fichiers', libelle: 'Fichiers', icone: Upload },
    {
      vers: '/corrections',
      libelle: 'Mises à jour',
      icone: FilePen,
      compte: nbAValider + nbNotificationsNonLues,
    },
    { vers: '/reglages', libelle: 'Réglages', icone: Settings },
  ];
  // En bas de l'écran : l'essentiel, dont l'assistant ; le reste est sous « Plus ».
  const ordrePrincipal = ['/', '/cours', '/assistant', '/qcm', '/erreurs'];
  const principales = ordrePrincipal.map((v) => entrees.find((e) => e.vers === v)!);
  const secondaires = entrees.filter((e) => !ordrePrincipal.includes(e.vers));
  const compteSecondaire = secondaires.reduce((s, e) => s + (e.compte ?? 0), 0);

  return (
    <>
      {/* Ordinateur : barre latérale */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-bord px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Docteur taille={38} className="pouls-logo pouls" />
          <span className="text-lg font-semibold tracking-tight">Dr Rodier</span>
        </div>
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1">
          {entrees.map((e) => (
            <NavLink
              key={e.vers}
              to={e.vers}
              end={e.vers === '/'}
              className={({ isActive }) =>
                cx(
                  'relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent-fond text-texte before:absolute before:top-2.5 before:bottom-2.5 before:-left-3 before:w-1 before:rounded-full before:bg-accent'
                    : 'text-texte-2 hover:bg-surface hover:text-texte',
                )
              }
            >
              <e.icone size={18} aria-hidden />
              {e.libelle}
              <Compteur n={e.compte} />
            </NavLink>
          ))}
        </nav>
        <div className="px-2">
          <LibelleSync sync={sync} />
        </div>
      </aside>

      {/* Téléphone et tablette : onglets en bas */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-bord bg-fond/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {plus && (
          <div className="border-b border-bord px-3 py-2">
            <div className="grid grid-cols-2 gap-1">
              {secondaires.map((e) => (
                <NavLink
                  key={e.vers}
                  to={e.vers}
                  onClick={() => setPlus(false)}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm',
                      isActive ? 'bg-accent-fond text-texte' : 'text-texte-2',
                    )
                  }
                >
                  <e.icone size={18} aria-hidden />
                  {e.libelle}
                  <Compteur n={e.compte} />
                </NavLink>
              ))}
            </div>
            <div className="px-3 pt-2">
              <LibelleSync sync={sync} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-6">
          {principales.map((e) => (
            <NavLink
              key={e.vers}
              to={e.vers}
              end={e.vers === '/'}
              onClick={() => setPlus(false)}
              className={({ isActive }) =>
                cx(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
                  isActive ? 'text-accent-clair' : 'text-muet',
                )
              }
            >
              <e.icone size={20} aria-hidden />
              {e.libelle}
              {!!e.compte && (
                <span className="chiffres absolute top-1.5 left-1/2 ml-2 rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                  {e.compte > 99 ? '99+' : e.compte}
                </span>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            aria-expanded={plus}
            onClick={() => setPlus((v) => !v)}
            className={cx(
              'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
              plus ? 'text-accent-clair' : 'text-muet',
            )}
          >
            <Ellipsis size={20} aria-hidden />
            Plus
            {!!compteSecondaire && (
              <span className="chiffres absolute top-1.5 left-1/2 ml-2 rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                {compteSecondaire}
              </span>
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
