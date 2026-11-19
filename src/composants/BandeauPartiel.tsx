/**
 * Alerte J-7 / J-3 / J-1 à l'ouverture : le partiel approche, voici quoi
 * réviser en priorité. Se ferme jusqu'au prochain palier.
 */
import { matieresExamen, phaseExamen } from '../../shared/examens';
import { nomMatieresExamen } from '../lib/examens';
import { libelleExamen } from '../../shared/examens';
import { Siren, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cleJour, joursEntre } from '../../shared/dates';
import { notionDue } from '../../shared/notions';
import { useDonnees } from '../etat/donnees';

const PALIERS = [1, 3, 7];
const PREFIXE = 'dr-rodier:alerte-partiel:';

const vu = (cle: string): boolean => {
  try {
    return localStorage.getItem(PREFIXE + cle) === '1';
  } catch {
    return false;
  }
};

export function BandeauPartiel() {
  const d = useDonnees();
  const [, relire] = useState(0);
  const jour = cleJour(d.maintenant);
  const candidats = d.examens
    .map((x) => ({ x, jours: joursEntre(jour, x.date) }))
    .filter(({ x, jours }) => jours >= 0 && jours <= 7 && phaseExamen(x, d.maintenant) !== 'fini')
    .map((e) => ({ ...e, palier: PALIERS.find((p) => e.jours <= p) ?? 7 }))
    .filter((e) => !vu(`${e.x.id}|${e.palier}`))
    .sort((a, b) => a.jours - b.jours);
  const alerte = candidats[0];
  if (!alerte) return null;

  const ids = matieresExamen(alerte.x);
  const nomsMatieres = nomMatieresExamen(d, alerte.x);
  const faibles = (ids.length ? ids.flatMap((m) => d.chapitresParMatiere.get(m) ?? []) : d.chapitres)
    .map((c) => ({ c, m: d.maitriseParChapitre.get(c.id) ?? 0 }))
    .sort((a, b) => a.m - b.m)
    .slice(0, 3);
  const dues = d.notions.filter((n) => notionDue(n, jour) && (ids.length === 0 || ids.includes(d.chapitreParId.get(n.chapitreId)?.matiereId ?? ''))).length;
  const etiquette = alerte.jours === 0 ? 'C’est aujourd’hui' : `J-${alerte.jours}`;
  const conseil =
    alerte.jours === 0
      ? 'C’est aujourd’hui : respire, tu as tout donné. Bonne chance !'
      : alerte.jours <= 1
      ? 'Veille de partiel : relis tes fiches et ton carnet, pas de nouvelle notion. Dors bien.'
      : alerte.jours <= 3
        ? 'Dernière ligne droite : annales chronométrées et points faibles.'
        : 'Une semaine : couvre d’abord les chapitres les moins maîtrisés, puis un examen blanc.';

  const fermer = () => {
    try {
      localStorage.setItem(PREFIXE + `${alerte.x.id}|${alerte.palier}`, '1');
    } catch {
      // Le bandeau reviendra à la prochaine ouverture.
    }
    relire((n) => n + 1);
  };

  return (
    <section role="alert" className="carte mb-4 flex items-start gap-3 border-alerte/50 bg-alerte/10 p-4">
      <Siren size={22} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          {etiquette} · {libelleExamen(alerte.x.titre, nomsMatieres)}
        </p>
        <p className="mt-1 text-texte-2">{conseil}</p>
        {faibles.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {faibles.map(({ c }) => (
              <li key={c.id}>
                <Link to={`/chapitre/${c.id}`} className="rounded-full border border-bord bg-surface px-2.5 py-1 text-xs hover:bg-surface-2">
                  {c.titre}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex flex-wrap gap-3 text-xs">
          {dues > 0 && (
            <Link to="/a-revoir" className="text-accent-clair hover:underline">
              {dues} notion{dues > 1 ? 's' : ''} à revoir
            </Link>
          )}
          <Link to="/planning" className="text-accent-clair hover:underline">Voir mon planning</Link>
        </p>
      </div>
      <button type="button" onClick={fermer} aria-label="Fermer l’alerte" className="grid size-9 shrink-0 place-items-center rounded-xl text-texte-2 hover:bg-surface-2">
        <X size={18} aria-hidden />
      </button>
    </section>
  );
}
