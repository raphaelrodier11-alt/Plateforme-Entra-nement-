/** Règle la vitesse de l'ECG de fond sur ton avance ou ton retard (rien n'est affiché). */
import { matieresExamen } from '../../shared/examens';
import { useEffect, useMemo } from 'react';
import { ajouterJours, cleJour, joursEntre } from '../../shared/dates';
import { situationRetard, type SituationRetard } from '../../shared/retard';
import { useDonnees } from '../etat/donnees';
import { definirBpm } from '../lib/ecg';

export function useSituationRetard(): SituationRetard {
  const d = useDonnees();
  const jour = cleJour(d.maintenant);
  return useMemo(() => {
    const depuis = ajouterJours(jour, -14);
    let prevues = 0;
    for (const dispo of d.disponibilites) {
      if (dispo.id >= depuis && dispo.id < jour) prevues += Object.values(dispo.creneaux).reduce((a, m) => a + (m ?? 0), 0);
    }
    const debutMs = d.maintenant - 14 * 86_400_000;
    const faites = d.sessions
      .filter((s) => s.termine && s.fin && s.debut >= debutMs)
      .reduce((a, s) => a + Math.min(180, ((s.fin ?? s.debut) - s.debut) / 60_000), 0);
    const prochain = d.examens.filter((e) => e.date >= jour).sort((a, b) => a.date.localeCompare(b.date))[0];
    let maitrise: number | undefined;
    if (prochain) {
      const valeurs = (matieresExamen(prochain).length ? matieresExamen(prochain).flatMap((m) => d.chapitresParMatiere.get(m) ?? []) : d.chapitres).map((c) => d.maitriseParChapitre.get(c.id) ?? 0);
      if (valeurs.length) maitrise = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    }
    return situationRetard({
      minutesPrevues: prevues,
      minutesFaites: faites,
      maitrise,
      joursRestants: prochain ? joursEntre(jour, prochain.date) : undefined,
    });
  }, [d.disponibilites, d.sessions, d.examens, d.chapitresParMatiere, d.maitriseParChapitre, jour, d.maintenant]);
}

export function RythmeEcg() {
  const { bpm } = useSituationRetard();
  useEffect(() => definirBpm(bpm), [bpm]);
  return null;
}
