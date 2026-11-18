/**
 * Entraînements sur mesure : tu fixes les règles (matière, chapitres, types,
 * difficulté, nombre, pièges, chrono) et tu ajoutes tes consignes ; les
 * questions sont écrites en arrière-plan et utilisables dès qu'elles arrivent.
 */
import { Dumbbell, Pencil, Pin, PinOff, Play, Plus, RotateCcw, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { comprendrePhrase, type ReglesComprises } from '../../shared/phraseEntrainement';
import type { Entrainement, ReglesEntrainement, TypeQuestion } from '../../shared/types';
import { Bouton, Carte, EtatVide, Jauge, Pastille, Puce, STYLE_CHAMP, TitrePage } from '../composants/ui';
import { enregistrer, supprimer } from '../db/sync';
import { useDonnees } from '../etat/donnees';
import { couleurMatiere } from '../lib/couleurs';
import { demarrerSession } from '../lib/sessions';

const TYPES: { valeur: TypeQuestion; libelle: string }[] = [
  { valeur: 'simple', libelle: 'Choix simple' },
  { valeur: 'multiple', libelle: 'Choix multiples' },
  { valeur: 'vrai_faux', libelle: 'Vrai / faux' },
  { valeur: 'trous', libelle: 'Texte à trous' },
];
const DIFFICULTES: { valeur: ReglesEntrainement['difficulte']; libelle: string }[] = [
  { valeur: 'mixte', libelle: 'Mixte' },
  { valeur: 'facile', libelle: 'Facile' },
  { valeur: 'moyenne', libelle: 'Moyenne' },
  { valeur: 'difficile', libelle: 'Difficile' },
];
const NOMBRES = [10, 20, 50, 100, 200];
const MAX = 500;

function resume(r: ReglesEntrainement, nomMatiere?: string): string {
  const parties = [
    nomMatiere ?? 'Toutes matières',
    r.chapitreIds.length ? `${r.chapitreIds.length} chapitre${r.chapitreIds.length > 1 ? 's' : ''}` : undefined,
    r.types.length ? r.types.map((t) => TYPES.find((x) => x.valeur === t)?.libelle).join(', ') : 'types mélangés',
    `difficulté ${r.difficulte}`,
    r.pieges ? 'pièges' : undefined,
    r.casCliniques ? 'cas cliniques' : undefined,
    r.chronoMin ? `${r.chronoMin} min` : undefined,
  ];
  return parties.filter(Boolean).join(' · ');
}

export function Entrainements() {
  const d = useDonnees();
  const navigate = useNavigate();

  const [titre, setTitre] = useState('');
  const [matiereId, setMatiereId] = useState<string | undefined>();
  const [chapitreIds, setChapitreIds] = useState<string[]>([]);
  const [types, setTypes] = useState<TypeQuestion[]>([]);
  const [cas, setCas] = useState(false);
  const [difficulte, setDifficulte] = useState<ReglesEntrainement['difficulte']>('mixte');
  const [nombre, setNombre] = useState(20);
  const [pieges, setPieges] = useState(false);
  const [chrono, setChrono] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [consignes, setConsignes] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [analyse, setAnalyse] = useState<ReglesComprises | undefined>();

  const chapitres = (matiereId ? d.chapitresParMatiere.get(matiereId) : d.chapitres) ?? [];
  const bascule = <T,>(liste: T[], x: T): T[] => (liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x]);
  const entrainements = [...d.entrainements].sort((a, b) => Number(!!b.epingle) - Number(!!a.epingle) || b.creeLe - a.creeLe);

  // La phrase remplit le formulaire ; rien n'est lancé avant ta vérification.
  const comprendre = () => {
    if (!phrase.trim()) return;
    const r = comprendrePhrase(phrase, d.matieres.filter((m) => (d.chapitresParMatiere.get(m.id) ?? []).length > 0), d.chapitres);
    const g = r.regles;
    setMatiereId(g.matiereId);
    setChapitreIds(g.chapitreIds);
    setTypes(g.types);
    setCas(g.casCliniques);
    setDifficulte(g.difficulte);
    setNombre(g.nombre);
    setPieges(g.pieges);
    setChrono(!!g.chronoMin);
    if (g.chronoMin) setMinutes(g.chronoMin);
    setConsignes(g.consignes ?? '');
    setAnalyse(r);
  };

  const melanger = <T,>(liste: T[]): T[] => {
    const a = [...liste];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  const relancer = async (e: Entrainement, seulementErreurs: boolean) => {
    let questions = e.questionIds.map((id) => d.questionParId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
    if (seulementErreurs) {
      questions = questions.filter((q) => {
        const etat = d.etats.get(q.id);
        return !!etat && etat.nbTentatives > 0 && (etat.dansListeErreurs || etat.derniersPoints < 1);
      });
    }
    if (questions.length === 0) return;
    const id = await demarrerSession({
      type: 'qcm',
      titre: `${e.titre}${seulementErreurs ? ' — mes erreurs' : ''}`,
      questions: melanger(questions),
      matiereId: e.regles.matiereId,
      chapitreIds: e.regles.chapitreIds.length ? e.regles.chapitreIds : undefined,
      ...(e.regles.chronoMin ? { dureeLimiteMs: e.regles.chronoMin * 60_000 } : {}),
    });
    navigate(`/session/${id}`);
  };

  const renommer = async (e: Entrainement) => {
    const nom = window.prompt('Nouveau nom de l’entraînement', e.titre)?.trim();
    if (nom) await enregistrer('entrainements', { ...e, titre: nom.slice(0, 80), majLe: Date.now() });
  };

  const epingler = (e: Entrainement) => enregistrer('entrainements', { ...e, epingle: !e.epingle, majLe: Date.now() });

  const creer = async () => {
    const n = Math.min(MAX, Math.max(1, Math.round(nombre) || 1));
    const maintenant = Date.now();
    const regles: ReglesEntrainement = {
      ...(matiereId ? { matiereId } : {}),
      chapitreIds,
      types,
      casCliniques: cas,
      difficulte,
      pieges,
      nombre: n,
      ...(chrono ? { chronoMin: Math.max(1, Math.round(minutes)) } : {}),
      ...(consignes.trim() ? { consignes: consignes.trim().slice(0, 600) } : {}),
    };
    const entrainement: Entrainement = {
      id: `entr-${crypto.randomUUID()}`,
      titre: titre.trim() || `Entraînement du ${new Date(maintenant).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`,
      regles,
      statut: 'en_attente',
      questionIds: [],
      creeLe: maintenant,
      majLe: maintenant,
    };
    await enregistrer('entrainements', entrainement);
    setEnvoye(true);
    setTitre('');
    setConsignes('');
    setTimeout(() => setEnvoye(false), 6000);
  };

  const lancer = async (e: Entrainement) => {
    const questions = e.questionIds.map((id) => d.questionParId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
    if (questions.length === 0) return;
    const id = await demarrerSession({
      type: 'qcm',
      titre: e.titre,
      questions,
      matiereId: e.regles.matiereId,
      chapitreIds: e.regles.chapitreIds.length ? e.regles.chapitreIds : undefined,
      ...(e.regles.chronoMin ? { dureeLimiteMs: e.regles.chronoMin * 60_000 } : {}),
    });
    navigate(`/session/${id}`);
  };

  const ajouter = async (e: Entrainement, n: number) => {
    await enregistrer('entrainements', {
      ...e,
      regles: { ...e.regles, nombre: Math.min(MAX, e.questionIds.length + n) },
      statut: 'en_attente',
      message: undefined,
      majLe: Date.now(),
    });
  };

  const retirer = async (e: Entrainement) => {
    for (const id of e.questionIds) await supprimer('questionsPerso', id);
    await supprimer('entrainements', e.id);
  };

  if (d.estVide) {
    return (
      <EtatVide icone={Dumbbell} titre="Pas encore de cours">
        Les entraînements sur mesure s'appuient sur tes cours : ils seront disponibles dès que l'import aura créé des chapitres.
      </EtatVide>
    );
  }

  return (
    <div className="space-y-4">
      <TitrePage titre="Entraînements" sousTitre="Demande l'entraînement que tu veux, avec tes règles. Autant de questions que tu veux." />

      <Carte titre="Dis-le avec une phrase">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            comprendre();
          }}
        >
          <input
            value={phrase}
            onChange={(ev) => setPhrase(ev.target.value)}
            maxLength={300}
            aria-label="Décris ton entraînement"
            placeholder="20 questions de génétique, niveau difficile, 25 minutes, uniquement le chapitre 3"
            className={`${STYLE_CHAMP} min-w-0 flex-1`}
          />
          <Bouton type="submit" variante="primaire" icone={Wand2} disabled={!phrase.trim()}>Remplir le formulaire</Bouton>
        </form>
        {analyse && (
          <div role="status" className="mt-3 rounded-xl border border-bord bg-surface-2 p-3 text-sm">
            <p className="font-medium">J'ai compris — vérifie ci-dessous puis lance :</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {analyse.compris.map((c) => <li key={c}><Pastille ton="accent">{c}</Pastille></li>)}
            </ul>
            {analyse.avertissements.map((a) => <p key={a} className="mt-1.5 text-xs text-alerte">{a}</p>)}
          </div>
        )}
      </Carte>

      <Carte titre="Nouvel entraînement">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muet">Nom (facultatif)</span>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={80} placeholder="Ex. : Pièges de cardio" className={STYLE_CHAMP} />
          </label>

          <div>
            <p className="mb-1.5 text-xs text-muet">Matière</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matière">
              <Puce actif={!matiereId} onClick={() => { setMatiereId(undefined); setChapitreIds([]); }}>Toutes</Puce>
              {d.matieres.filter((m) => (d.chapitresParMatiere.get(m.id) ?? []).length > 0).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={matiereId === m.id}
                  onClick={() => { setMatiereId(m.id); setChapitreIds([]); }}
                  style={matiereId === m.id ? { background: couleurMatiere(m.id).fond, borderColor: couleurMatiere(m.id).bord } : undefined}
                  className={`min-h-9 rounded-full border px-3 text-sm ${matiereId === m.id ? 'text-texte' : 'border-bord bg-surface text-texte-2'}`}
                >
                  {m.nom}
                </button>
              ))}
            </div>
          </div>

          {matiereId && chapitres.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-xs text-muet">Chapitres (aucun coché : toute la matière)</legend>
              <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {chapitres.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
                      <input type="checkbox" checked={chapitreIds.includes(c.id)} onChange={() => setChapitreIds(bascule(chapitreIds, c.id))} className="size-5 shrink-0 accent-[#3987e5]" />
                      <span className="min-w-0 flex-1 truncate">{c.titre}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <div>
            <p className="mb-1.5 text-xs text-muet">Types de questions (aucun coché : un mélange comme aux partiels)</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Types de questions">
              {TYPES.map((t) => (
                <Puce key={t.valeur} actif={types.includes(t.valeur)} onClick={() => setTypes(bascule(types, t.valeur))}>{t.libelle}</Puce>
              ))}
              <Puce actif={cas} onClick={() => setCas(!cas)}>Cas cliniques</Puce>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muet">Difficulté</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulté">
              {DIFFICULTES.map((x) => (
                <Puce key={x.valeur} actif={difficulte === x.valeur} onClick={() => setDifficulte(x.valeur)}>{x.libelle}</Puce>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muet">Nombre de questions (jusqu'à {MAX})</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {NOMBRES.map((n) => (
                <Puce key={n} actif={nombre === n} onClick={() => setNombre(n)}>{n}</Puce>
              ))}
              <input
                type="number"
                min={1}
                max={MAX}
                value={nombre}
                onChange={(e) => setNombre(Number(e.target.value))}
                aria-label="Nombre de questions"
                className={`${STYLE_CHAMP} w-24!`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={pieges} onChange={(e) => setPieges(e.target.checked)} className="size-5 shrink-0 accent-[#3987e5]" />
              Insister sur les pièges classiques
            </label>
            <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={chrono} onChange={(e) => setChrono(e.target.checked)} className="size-5 shrink-0 accent-[#3987e5]" />
              Avec un chronomètre
              {chrono && (
                <span className="flex items-center gap-1.5">
                  <input type="number" min={1} max={300} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutes" className={`${STYLE_CHAMP} w-20!`} />
                  min
                </span>
              )}
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs text-muet">Tes consignes en plus (facultatif)</span>
            <textarea
              value={consignes}
              onChange={(e) => setConsignes(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Ex. : insiste sur les doses et les valeurs seuils, avec des cas de garde aux urgences"
              className={`${STYLE_CHAMP} py-2`}
            />
          </label>

          <div>
            <Bouton variante="primaire" icone={Sparkles} onClick={() => void creer()}>
              Générer l'entraînement
            </Bouton>
            <p className="mt-2 text-xs text-muet">
              Les questions sont écrites en arrière-plan avec le quota gratuit, par lots. Tu peux commencer dès que les premières sont prêtes, et tu reçois une notification à la fin.
            </p>
            {envoye && (
              <p role="status" className="mt-2 rounded-xl border border-bon/40 bg-bon/10 p-3 text-sm">
                Demande enregistrée ! Elle apparaît ci-dessous et se remplit au fil de la génération.
              </p>
            )}
          </div>
        </div>
      </Carte>

      <Carte titre="Ma bibliothèque d'entraînements">
        {entrainements.length === 0 ? (
          <p className="text-sm text-texte-2">Aucun entraînement pour l'instant.</p>
        ) : (
          <ul className="space-y-3">
            {entrainements.map((e) => {
              const prets = e.questionIds.length;
              const part = e.regles.nombre ? Math.min(1, prets / e.regles.nombre) : 0;
              const nomMatiere = e.regles.matiereId ? d.matiereParId.get(e.regles.matiereId)?.nom : undefined;
              return (
                <li key={e.id} className="rounded-2xl bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.titre}</span>
                    <Pastille ton={e.statut === 'pret' ? 'bon' : e.statut === 'erreur' ? 'critique' : 'accent'}>
                      {e.statut === 'pret' ? 'Prêt' : e.statut === 'erreur' ? 'Échec' : e.statut === 'en_cours' ? 'En écriture' : 'En file'}
                    </Pastille>
                  </div>
                  <p className="mt-1 text-xs text-muet">{resume(e.regles, nomMatiere)}</p>
                  <div className="chiffres mt-2.5 flex items-center gap-2 text-xs text-texte-2">
                    <div className="flex-1"><Jauge valeur={part} libelle={`Questions prêtes : ${e.titre}`} /></div>
                    {prets} / {e.regles.nombre}
                  </div>
                  {e.message && <p className="mt-2 text-xs text-texte-2">{e.message}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Bouton variante="primaire" icone={Play} className="min-h-9" disabled={prets === 0} onClick={() => void lancer(e)}>
                      {e.statut === 'pret' ? 'Lancer' : `Lancer (${prets} prêtes)`}
                    </Bouton>
                    <Bouton icone={RotateCcw} className="min-h-9" disabled={prets === 0} onClick={() => void relancer(e, false)}>Relancer (mélangé)</Bouton>
                    <Bouton className="min-h-9" disabled={prets === 0} onClick={() => void relancer(e, true)}>Mes erreurs</Bouton>
                    <Bouton icone={Plus} className="min-h-9" onClick={() => void ajouter(e, 20)}>20 de plus</Bouton>
                    <Bouton variante="discret" icone={Pencil} className="min-h-9" aria-label={`Renommer ${e.titre}`} onClick={() => void renommer(e)}>Renommer</Bouton>
                    <Bouton variante="discret" icone={e.epingle ? PinOff : Pin} className="min-h-9" onClick={() => void epingler(e)}>{e.epingle ? 'Désépingler' : 'Épingler'}</Bouton>
                    <Bouton variante="discret" icone={Trash2} className="min-h-9" aria-label={`Supprimer ${e.titre}`} onClick={() => void retirer(e)}>Supprimer</Bouton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </div>
  );
}
