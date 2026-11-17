/** Avancement de l'import : fichiers classés, chapitres prêts, limite du jour de Gemini. */
import { Hourglass } from 'lucide-react';
import { useDonnees } from '../etat/donnees';
import { Carte, Jauge, pourcent } from './ui';

export function ProgressionImport({ discret = false }: { discret?: boolean }) {
  const d = useDonnees();
  const fichiers = d.fichiers.filter((f) => f.etat !== 'supprime' && f.role !== 'autre');
  if (fichiers.length === 0 || d.aDesDonneesDemo) return null;

  const classes = fichiers.filter((f) => f.etat === 'a_jour').length;
  const cours = fichiers.filter((f) => f.role === 'cours');
  const coursPrets = cours.filter((f) => f.etat === 'a_jour').length;
  const annales = fichiers.filter((f) => f.role === 'annale' || f.role === 'corrige');
  const annalesPretes = annales.filter((f) => f.etat === 'a_jour').length;
  const chapitresPrets = d.chapitres.filter((c) => !c.aGenerer && d.ficheParChapitre.has(c.id)).length;
  const avancement = classes / fichiers.length;
  const e = d.etatPipeline;
  const termine = avancement >= 0.999 && d.chapitres.every((c) => !c.aGenerer);
  if (termine && discret) return null;

  const jourQuota = new Date(d.maintenant).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const requetes = e?.requetesIa?.jour === jourQuota ? e.requetesIa.n : undefined;
  const limite = e?.limiteJour?.jour === jourQuota;

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <Hourglass size={16} className="text-accent-clair" aria-hidden /> {termine ? 'Import terminé' : "Avancement de l'import"}
        </span>
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Jauge valeur={avancement} libelle="Avancement de l'import" epaisse />
        </div>
        <span className="chiffres text-lg font-semibold">{pourcent(avancement)}</span>
      </div>
      <dl className="chiffres mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-texte-2 sm:grid-cols-4">
        <div><dt className="text-muet">Cours traités</dt><dd>{coursPrets} / {cours.length}</dd></div>
        <div><dt className="text-muet">Annales traitées</dt><dd>{annalesPretes} / {annales.length}</dd></div>
        <div><dt className="text-muet">Chapitres prêts</dt><dd>{chapitresPrets} / {d.chapitres.length}</dd></div>
        <div><dt className="text-muet">Requêtes IA aujourd'hui</dt><dd>{requetes ?? '—'}</dd></div>
      </dl>
      {e?.message && !termine && <p className="mt-3 text-xs text-texte-2">{e.message}</p>}
      {limite && !termine && (
        <p className="mt-1 text-xs text-muet">La limite gratuite du jour est atteinte : reprise automatique demain vers 9 h.</p>
      )}
    </Carte>
  );
}
