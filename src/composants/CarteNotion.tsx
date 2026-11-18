/** Une notion du carnet : relecture immédiate, approfondissement à la demande, mini-test. */
import { BookOpen, ChevronDown, GraduationCap, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { texteRappelNotion } from '../../shared/notions';
import type { Notion } from '../../shared/types';
import { useDonnees } from '../etat/donnees';
import { ErreurAssistant } from '../lib/assistant';
import { couleurMatiere } from '../lib/couleurs';
import { approfondirNotion, lancerMiniTest } from '../lib/notions';
import { enregistrer } from '../db/sync';
import { Markdown } from './Markdown';
import { Bouton, Pastille, cx } from './ui';

export function CarteNotion({ notion, ouvertParDefaut = false }: { notion: Notion; ouvertParDefaut?: boolean }) {
  const d = useDonnees();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();
  const chapitre = d.chapitreParId.get(notion.chapitreId);
  const c = couleurMatiere(notion.matiereId);
  const rappel = texteRappelNotion(notion, d.ficheParChapitre.get(notion.chapitreId));

  const approfondir = async () => {
    setOccupe(true);
    setErreur(undefined);
    try {
      await approfondirNotion(d, notion);
    } catch (e) {
      setErreur(e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <li className="carte overflow-hidden" style={{ borderLeft: `3px solid ${c.accent}` }}>
      <button type="button" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{notion.titre}</span>
          <span className="text-xs text-muet">
            {chapitre?.titre} · {d.matiereParId.get(notion.matiereId)?.nom}
          </span>
        </span>
        {notion.statut === 'ancree' ? <Pastille ton="bon">Ancrée</Pastille> : <Pastille ton="alerte">{notion.reussitesDeSuite}/3 tests</Pastille>}
        <ChevronDown size={18} className={cx('shrink-0 text-muet transition-transform', ouvert && 'rotate-180')} aria-hidden />
      </button>
      {ouvert && (
        <div className="space-y-4 border-t border-bord p-4">
          <div className="rounded-2xl bg-surface-2 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent-clair"><BookOpen size={14} aria-hidden /> À relire</p>
            <Markdown texte={rappel} />
            {chapitre && (
              <Link to={`/chapitre/${chapitre.id}${notion.sectionId ? `#${notion.sectionId}` : ''}`} className="mt-3 inline-block text-xs text-accent-clair underline">
                Ouvrir la fiche « {chapitre.titre} »
              </Link>
            )}
          </div>
          {notion.profondeur && (
            <div className="rounded-2xl border border-accent/30 bg-accent-fond p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent-clair"><Sparkles size={14} aria-hidden /> En profondeur</p>
              <Markdown texte={notion.profondeur} />
            </div>
          )}
          {erreur && <p role="alert" className="rounded-xl border border-critique/50 bg-critique/10 p-3 text-sm">{erreur}</p>}
          <div className="flex flex-wrap gap-2">
            <Bouton variante="primaire" icone={GraduationCap} onClick={async () => { const url = await lancerMiniTest(d, notion); if (url) navigate(url); }}>
              J'ai relu : mini-test
            </Bouton>
            {!notion.profondeur && (
              <Bouton icone={Sparkles} disabled={occupe} onClick={() => void approfondir()}>
                {occupe ? 'Le Dr Rodier rédige…' : 'Aller en profondeur'}
              </Bouton>
            )}
            {notion.statut === 'a_revoir' && (
              <Bouton variante="discret" onClick={() => void enregistrer<Notion>('notions', { ...notion, statut: 'ancree', reussitesDeSuite: 3, prochaineRevue: undefined, majLe: Date.now() })}>
                Je la maîtrise
              </Bouton>
            )}
          </div>
          {notion.prochaineRevue && <p className="text-xs text-muet">Prochaine relecture conseillée : {new Date(notion.prochaineRevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.</p>}
        </div>
      )}
    </li>
  );
}
