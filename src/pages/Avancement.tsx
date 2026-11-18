/**
 * Mon avancement : tu renseignes ce que tu as déjà travaillé (jour, difficulté
 * ressentie, confiance), chapitre par chapitre, matière par matière. Ensuite,
 * ce que tu fais dans l'appli met ces estimations à jour tout seul.
 */
import { CheckCheck, Check } from 'lucide-react';
import { useState } from 'react';
import { cleJour } from '../../shared/dates';
import { LIBELLE_CONFIANCE, LIBELLE_DIFFICULTE } from '../../shared/evaluations';
import type { Chapitre, Evaluation } from '../../shared/types';
import { Echelle } from '../composants/Ressenti';
import { Bouton, Carte, EtatVide, Jauge, Onglets, Puce, TitrePage, pourcent } from '../composants/ui';
import { enregistrer, enregistrerPlusieurs } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';

function LigneChapitre({ chapitre }: { chapitre: Chapitre }) {
  const d = useDonnees();
  const ev = d.evaluationParChapitre.get(chapitre.id);
  const maitrise = d.maitriseParChapitre.get(chapitre.id) ?? 0;
  const modifier = (c: Partial<Evaluation>) => enregistrer<Evaluation>('evaluations', { ...(ev ?? { id: chapitre.id }), ...c, id: chapitre.id, majLe: Date.now() });
  const [ouvert, setOuvert] = useState(false);
  return (
    <li className="rounded-2xl bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{chapitre.titre}</span>
          <span className="text-xs text-muet">
            {ev?.etudieLe ? `Étudié le ${new Date(ev.etudieLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : 'Date non renseignée'} · maîtrise {pourcent(maitrise)}
          </span>
        </button>
        <Puce actif={!!ev?.dejaVu} onClick={() => void modifier({ dejaVu: !ev?.dejaVu })}>
          {ev?.dejaVu ? 'Déjà vu' : 'Marquer comme déjà vu'}
        </Puce>
      </div>
      <div className="mt-2"><Jauge valeur={maitrise} libelle={`Maîtrise estimée : ${chapitre.titre}`} /></div>
      {ouvert && (
        <div className="apparait mt-3 space-y-3 border-t border-bord pt-3">
          <Echelle compact libelle="Difficulté du cours" valeur={ev?.difficulte} onChange={(n) => void modifier({ difficulte: n })} etiquettes={LIBELLE_DIFFICULTE} />
          <Echelle compact libelle="Ma confiance" valeur={ev?.confiance} onChange={(n) => void modifier({ confiance: n })} etiquettes={LIBELLE_CONFIANCE} />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs text-muet">Dernière étude</span>
            <input type="date" value={ev?.etudieLe ?? ''} max={cleJour(d.maintenant)} onChange={(e) => void modifier({ etudieLe: e.target.value || undefined })} className="min-h-10 rounded-xl border border-bord bg-surface px-2 text-sm" />
          </label>
        </div>
      )}
    </li>
  );
}

export function Avancement() {
  const d = useDonnees();
  const matieres = d.matieres.filter((m) => (d.chapitresParMatiere.get(m.id) ?? []).length > 0);
  const [choix, setChoix] = useState<string | undefined>();
  const [fait, setFait] = useState(false);
  const actuelle = matieres.find((m) => m.id === choix) ?? matieres[0];

  if (!actuelle) {
    return (
      <EtatVide icone={CheckCheck} titre="Pas encore de chapitres">
        Tu pourras renseigner ton avancement dès que l'import aura créé des chapitres.
      </EtatVide>
    );
  }
  const chapitres = [...(d.chapitresParMatiere.get(actuelle.id) ?? [])].sort((a, b) => a.ordre - b.ordre);

  /** Tout ce qui précède (et inclut) ce chapitre est « déjà vu », avec la date du jour de travail choisie. */
  const toutVuJusqua = async (jusqua: Chapitre) => {
    const jour = cleJour(d.maintenant);
    const docs = chapitres
      .filter((c) => c.ordre <= jusqua.ordre)
      .map((c) => ({ ...(d.evaluationParChapitre.get(c.id) ?? { id: c.id }), id: c.id, dejaVu: true, etudieLe: d.evaluationParChapitre.get(c.id)?.etudieLe ?? jour, majLe: Date.now() }));
    await enregistrerPlusieurs<Evaluation>('evaluations', docs);
    setFait(true);
    setTimeout(() => setFait(false), 2500);
  };

  return (
    <div className="space-y-4">
      <TitrePage titre="Mon avancement" sousTitre="Dis où tu en es : ça adapte ton emploi du temps. Ce que tu fais ensuite dans l'appli met tout à jour tout seul." />
      <Onglets<string>
        libelle="Matière"
        valeur={actuelle.id}
        onChange={setChoix}
        options={matieres.map((m) => ({ valeur: m.id, libelle: m.nom }))}
      />
      <Carte
        titre={<span className="flex items-center gap-2"><span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: couleurMatiere(actuelle.id).accent }} /> {actuelle.nom}</span>}
        action={fait ? <span className="flex items-center gap-1 text-xs text-bon"><Check size={14} aria-hidden /> Enregistré</span> : undefined}
      >
        <p className="mb-3 text-xs text-muet">Touche un chapitre pour régler sa difficulté, ta confiance et la date. « Tout vu jusqu'ici » marque d'un coup tout ce qui précède.</p>
        <ul className="space-y-2">
          {chapitres.map((c) => (
            <div key={c.id} className="space-y-1">
              <LigneChapitre chapitre={c} />
              <div className="flex justify-end">
                <Bouton variante="discret" className="min-h-8 px-2 text-xs" onClick={() => void toutVuJusqua(c)}>Tout vu jusqu'ici</Bouton>
              </div>
            </div>
          ))}
        </ul>
      </Carte>
    </div>
  );
}
