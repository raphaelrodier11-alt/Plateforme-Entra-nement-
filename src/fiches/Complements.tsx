/**
 * Compléments d'un chapitre : tu envoies un document (PDF, Word, PowerPoint,
 * image, texte) et il est rattaché à ce chapitre, sans classement. Au prochain
 * passage de l'import, la fiche, les QCM et les flashcards du chapitre sont
 * régénérés en le prenant en compte.
 */
import { CircleCheck, FilePlus2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { EXTENSIONS_ACCEPTEES } from '../../shared/depot';
import type { Chapitre } from '../../shared/types';
import { Bouton, Carte } from '../composants/ui';
import { useDonnees } from '../etat/donnees';
import { envoyerFichier, preparer } from '../lib/depot';

interface Envoi {
  cle: string;
  nom: string;
  statut: 'en_cours' | 'fait' | 'echec';
  part: number;
  message?: string;
}

export function Complements({ chapitre }: { chapitre: Chapitre }) {
  const d = useDonnees();
  const entree = useRef<HTMLInputElement>(null);
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [refus, setRefus] = useState<string[]>([]);

  const deja = d.fichiers.filter((f) => f.chapitreImpose === chapitre.id && f.etat !== 'supprime');
  const enCours = envois.some((e) => e.statut === 'en_cours');

  const choisir = async (liste: FileList | null) => {
    if (!liste || liste.length === 0) return;
    const prep = await preparer([...liste]);
    setRefus(prep.refus);
    for (const c of prep.candidats) {
      const maj = (partiel: Partial<Envoi>) =>
        setEnvois((e) => e.map((x) => (x.cle === c.cle ? { ...x, ...partiel } : x)));
      setEnvois((e) => [...e, { cle: c.cle, nom: c.nom, statut: 'en_cours', part: 0 }]);
      try {
        // Le dossier « Compléments/<chapitre> » garde ce fichier distinct de tes autres envois.
        await envoyerFichier(await c.lire(), c.nom, `Compléments/${chapitre.id}/${c.nom}`, 'cours', (part) => maj({ part }), chapitre.id);
        maj({ statut: 'fait', part: 1 });
      } catch {
        maj({ statut: 'echec', message: "L'envoi a échoué. Vérifie ta connexion et réessaie." });
      }
    }
    await prep.fermer();
    if (entree.current) entree.current.value = '';
  };

  return (
    <Carte
      className="mt-4"
      titre={
        <span className="flex items-center gap-2">
          <FilePlus2 size={16} aria-hidden /> Compléments de ce chapitre
        </span>
      }
    >
      <p className="mb-3 text-sm text-texte-2">
        Un cours en plus, un poly, des notes du prof, des photos de tableau : envoie-les ici. Ils sont rattachés à ce
        chapitre et pris en compte : la fiche, les QCM et les flashcards sont régénérés avec eux au prochain passage de l'import.
      </p>
      <input
        ref={entree}
        type="file"
        multiple
        accept={EXTENSIONS_ACCEPTEES}
        className="sr-only"
        id={`complement-${chapitre.id}`}
        onChange={(e) => void choisir(e.target.files)}
      />
      <Bouton variante="primaire" icone={FilePlus2} disabled={enCours} onClick={() => entree.current?.click()}>
        {enCours ? 'Envoi en cours…' : 'Ajouter un complément'}
      </Bouton>

      {envois.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm" aria-live="polite">
          {envois.map((e) => (
            <li key={e.cle} className="flex items-center gap-2">
              {e.statut === 'fait' ? (
                <CircleCheck size={16} className="shrink-0 text-bon" aria-hidden />
              ) : e.statut === 'echec' ? (
                <TriangleAlert size={16} className="shrink-0 text-critique" aria-hidden />
              ) : (
                <LoaderCircle size={16} className="shrink-0 animate-spin text-muet" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{e.nom}</span>
              <span className="chiffres text-xs text-muet">
                {e.statut === 'fait' ? 'Reçu' : e.statut === 'echec' ? 'Échec' : `${Math.round(e.part * 100)} %`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {refus.map((r) => (
        <p key={r} className="mt-2 text-xs text-alerte" role="alert">{r}</p>
      ))}
      {envois.some((e) => e.statut === 'fait') && (
        <p className="mt-3 text-xs text-texte-2" role="status">
          Reçu. L'import le prendra en compte au prochain passage (de quelques minutes à quelques heures selon la file).
        </p>
      )}

      {deja.length > 0 && (
        <div className="mt-4 border-t border-bord pt-3">
          <p className="mb-1.5 text-xs font-medium text-texte-2">Déjà envoyés pour ce chapitre</p>
          <ul className="space-y-1 text-xs">
            {deja.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{f.nom}</span>
                <span className="text-muet">{f.etat === 'a_jour' ? 'Pris en compte' : 'En attente de traitement'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Carte>
  );
}
