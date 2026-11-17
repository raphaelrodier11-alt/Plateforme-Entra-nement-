/**
 * Assistant : le Dr Rodier répond à tes questions (un bot par matière),
 * crée des documents à la demande et les range dans une bibliothèque.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookMarked,
  Check,
  Clock,
  Copy,
  FilePlus2,
  MessageCircle,
  Plus,
  Printer,
  Send,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LIBELLE_TYPE_DOCUMENT } from '../../shared/assistant';
import type { Conversation, DemandeDocument, DocumentBiblio, TypeDocument } from '../../shared/types';
import { Docteur } from '../composants/Docteur';
import { Markdown } from '../composants/Markdown';
import { Bouton, Carte, EtatVide, Onglets, Pastille, Puce, STYLE_CHAMP, TitrePage, cx } from '../composants/ui';
import { base } from '../db/base';
import { useDonnees } from '../etat/donnees';
import {
  ErreurAssistant,
  assistantDisponible,
  demanderDocument,
  nouvelleConversation,
  poserQuestion,
  supprimerConversation,
  supprimerDocument,
} from '../lib/assistant';
import { couleurMatiere } from '../lib/couleurs';

type Vue = 'discuter' | 'creer' | 'biblio';

const dateCourte = (t: number) =>
  new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Assistant() {
  const [params] = useSearchParams();
  const vueDemandee = params.get('vue');
  const [vue, setVue] = useState<Vue>(vueDemandee === 'biblio' || vueDemandee === 'creer' ? vueDemandee : 'discuter');
  const [disponible, setDisponible] = useState<boolean | undefined>();
  const demandes = useLiveQuery(() => base.collection<DemandeDocument>('demandes').toArray(), []) ?? [];
  const enAttente = demandes.filter((d) => d.statut === 'en_attente' || d.statut === 'en_cours').length;

  useEffect(() => {
    void assistantDisponible().then(setDisponible);
  }, []);

  return (
    <div>
      <TitrePage
        titre="Dr Rodier"
        sousTitre="Pose tes questions, demande un document : tout est enregistré."
        action={<Docteur taille={52} />}
      />
      {disponible === false && (
        <div role="alert" className="carte mb-4 flex gap-3 border-alerte/40 p-4 text-sm">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
          <div>
            <p className="font-medium">L'assistant attend sa clé Gemini.</p>
            <p className="mt-1 text-texte-2">
              Crée une seconde clé gratuite sur aistudio.google.com/apikey (dans un autre projet que la première),
              puis ajoute-la dans GitHub : Settings → Secrets and variables → Actions → secret{' '}
              <code className="rounded bg-surface-3 px-1">GEMINI_CHAT_KEY</code>, puis relance « Déploiement ».
            </p>
          </div>
        </div>
      )}
      <div className="mb-4">
        <Onglets<Vue>
          libelle="Assistant"
          valeur={vue}
          onChange={setVue}
          options={[
            { valeur: 'discuter', libelle: 'Discuter' },
            { valeur: 'creer', libelle: 'Créer un document' },
            { valeur: 'biblio', libelle: 'Bibliothèque', compte: enAttente },
          ]}
        />
      </div>
      {vue === 'discuter' && <Discussion />}
      {vue === 'creer' && <CreerDocument onCree={() => setVue('biblio')} />}
      {vue === 'biblio' && <Bibliotheque />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

function ChoixMatiere({ valeur, onChange, tout }: { valeur?: string; onChange: (id?: string) => void; tout?: string }) {
  const { matieres } = useDonnees();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matière">
      <Puce actif={!valeur} onClick={() => onChange(undefined)}>
        {tout ?? 'Toutes'}
      </Puce>
      {matieres.map((m) => {
        const c = couleurMatiere(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={valeur === m.id}
            onClick={() => onChange(m.id)}
            style={valeur === m.id ? { background: c.fond, borderColor: c.bord } : undefined}
            className={cx(
              'min-h-9 rounded-full border px-3 text-sm transition-colors',
              valeur === m.id ? 'text-texte' : 'border-bord bg-surface text-texte-2 hover:text-texte',
            )}
          >
            <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full" style={{ background: c.accent }} />
            {m.nom}
          </button>
        );
      })}
    </div>
  );
}

function Discussion() {
  const d = useDonnees();
  const [matiereId, setMatiereId] = useState<string | undefined>();
  const [courante, setCourante] = useState<Conversation>(() => nouvelleConversation());
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();
  const fin = useRef<HTMLDivElement>(null);

  const toutes = useLiveQuery(() => base.collection<Conversation>('conversations').toArray(), []) ?? [];
  const historique = useMemo(
    () =>
      toutes
        .filter((c) => c.messages.length > 0 && (matiereId === undefined || c.matiereId === matiereId))
        .sort((a, b) => b.majLe - a.majLe)
        .slice(0, 12),
    [toutes, matiereId],
  );

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [courante.messages.length, attente]);

  const changerMatiere = (id?: string) => {
    setMatiereId(id);
    if (courante.messages.length === 0) setCourante(nouvelleConversation(id));
  };

  const nouvelle = () => {
    setCourante(nouvelleConversation(matiereId));
    setErreur(undefined);
  };

  const envoyer = async (texte: string) => {
    const question = texte.trim();
    if (!question || attente) return;
    setSaisie('');
    setErreur(undefined);
    setAttente(true);
    // La question s'affiche aussitôt ; la réponse arrive ensuite.
    setCourante((c) => ({ ...c, messages: [...c.messages, { role: 'user', texte: question, instant: Date.now() }] }));
    try {
      setCourante(await poserQuestion(d, courante, question));
    } catch (e) {
      setErreur(e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setAttente(false);
    }
  };

  const matiere = matiereId ? d.matiereParId.get(matiereId) : undefined;
  const chapitresMatiere = (matiereId ? d.chapitresParMatiere.get(matiereId) : d.chapitres) ?? [];
  const suggestions = [
    matiere ? `Quels sont les pièges classiques en ${matiere.nom} ?` : 'Qu’est-ce que je devrais réviser en priorité ?',
    chapitresMatiere[0] ? `Explique-moi simplement « ${chapitresMatiere[0].titre} »` : undefined,
    chapitresMatiere[0] ? `Pose-moi 5 questions sur « ${chapitresMatiere[0].titre} »` : undefined,
    'Donne-moi un moyen mnémotechnique pour retenir ça',
  ].filter((s): s is string => !!s);

  return (
    <div className="space-y-3">
      <ChoixMatiere valeur={matiereId} onChange={changerMatiere} tout="Toutes les matières" />

      <div className="flex flex-wrap items-center gap-1.5">
        <Bouton variante="discret" icone={Plus} onClick={nouvelle} className="min-h-9 px-3">
          Nouvelle
        </Bouton>
        {historique.map((c) => (
          <span key={c.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => {
                setCourante(c);
                setMatiereId(c.matiereId);
                setErreur(undefined);
              }}
              aria-current={c.id === courante.id}
              className={cx(
                'max-w-52 truncate rounded-l-full border px-3 py-1.5 text-xs',
                c.id === courante.id ? 'border-accent bg-accent-fond text-texte' : 'border-bord bg-surface text-texte-2',
              )}
              title={`${c.titre} · ${dateCourte(c.majLe)}`}
            >
              {c.titre}
            </button>
            <button
              type="button"
              aria-label={`Supprimer la conversation « ${c.titre} »`}
              onClick={() => {
                void supprimerConversation(c.id);
                if (c.id === courante.id) nouvelle();
              }}
              className="rounded-r-full border border-l-0 border-bord bg-surface px-2 py-1.5 text-muet hover:text-critique"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="carte flex min-h-[50dvh] flex-col p-3 sm:p-4">
        <div className="flex-1 space-y-4" aria-live="polite">
          {courante.messages.length === 0 && (
            <div className="apparait flex flex-col items-center gap-3 px-2 py-8 text-center">
              <Docteur taille={72} />
              <p className="text-base font-semibold">
                Bonjour, je suis le Dr Rodier{matiere ? ` — ton bot de ${matiere.nom}` : ''} !
              </p>
              <p className="max-w-md text-sm text-texte-2">
                Je réponds d'abord avec tes cours, puis je complète avec mes connaissances générales, en te disant
                toujours d'où ça vient.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <Puce key={s} actif={false} onClick={() => void envoyer(s)}>
                    {s}
                  </Puce>
                ))}
              </div>
            </div>
          )}
          {courante.messages.map((m, i) => (
            <Bulle key={`${m.instant}-${i}`} role={m.role}>
              {m.role === 'assistant' ? <Markdown texte={m.texte} /> : <p className="text-sm whitespace-pre-wrap">{m.texte}</p>}
              {m.sources && m.sources.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-bord pt-2 text-xs text-muet">
                  <BookMarked size={13} aria-hidden /> D'après :
                  {m.sources.map((s) => (
                    <Link key={s.chapitreId} to={`/chapitre/${s.chapitreId}`} className="rounded-full bg-surface-3 px-2 py-0.5 text-texte-2 hover:text-texte">
                      {s.titre}
                    </Link>
                  ))}
                </p>
              )}
            </Bulle>
          ))}
          {attente && (
            <Bulle role="assistant">
              <p className="flex items-center gap-2 text-sm text-muet" role="status">
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="size-1.5 animate-bounce rounded-full bg-muet [animation-delay:-0.2s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muet [animation-delay:-0.1s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muet" />
                </span>
                Le Dr Rodier réfléchit…
              </p>
            </Bulle>
          )}
          {erreur && (
            <p role="alert" className="rounded-xl border border-critique/50 bg-critique/10 p-3 text-sm">
              {erreur}
            </p>
          )}
          <div ref={fin} />
        </div>

        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer(saisie);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Ta question</span>
            <textarea
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
                  e.preventDefault();
                  void envoyer(saisie);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder={matiere ? `Une question en ${matiere.nom} ?` : 'Pose ta question…'}
              className={`${STYLE_CHAMP} resize-none py-2`}
            />
          </label>
          <Bouton type="submit" variante="primaire" icone={Send} disabled={attente || !saisie.trim()} aria-label="Envoyer" />
        </form>
        <p className="mt-2 text-xs text-muet">
          Le Dr Rodier peut se tromper : le cours officiel et tes enseignants font foi.
        </p>
      </div>
    </div>
  );
}

function Bulle({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  if (role === 'user') {
    return (
      <div className="apparait flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-white">{children}</div>
      </div>
    );
  }
  return (
    <div className="apparait flex items-start gap-2.5">
      <Docteur taille={32} className="mt-0.5 shrink-0" />
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création de documents
// ---------------------------------------------------------------------------

const TYPES: TypeDocument[] = ['fiche', 'resume', 'qcm', 'flashcards', 'libre'];

function CreerDocument({ onCree }: { onCree: () => void }) {
  const d = useDonnees();
  const [type, setType] = useState<TypeDocument>('fiche');
  const [matiereId, setMatiereId] = useState<string | undefined>();
  const [chapitreId, setChapitreId] = useState('');
  const [sujet, setSujet] = useState('');
  const [consignes, setConsignes] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  const chapitres = (matiereId ? d.chapitresParMatiere.get(matiereId) : d.chapitres) ?? [];

  const creer = async () => {
    setErreur(undefined);
    setInfo(undefined);
    setOccupe(true);
    try {
      const chapitre = chapitreId ? d.chapitreParId.get(chapitreId) : undefined;
      const resultat = await demanderDocument(d, {
        type,
        sujet: sujet.trim() || chapitre?.titre || '',
        consignes: consignes.trim() || undefined,
        matiereId,
        chapitreId: chapitreId || undefined,
      });
      if (resultat.demande) {
        setInfo(
          'Demande enregistrée : c’est un gros document, il est préparé en arrière-plan. Il apparaîtra dans ta bibliothèque d’ici une heure environ.',
        );
        setSujet('');
        setConsignes('');
      } else {
        setSujet('');
        setConsignes('');
        onCree();
      }
    } catch (e) {
      setErreur(e instanceof ErreurAssistant ? e.message : 'Une erreur est survenue. Réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  const pret = (sujet.trim() || chapitreId) && !occupe;

  return (
    <Carte titre="Qu'est-ce que je te prépare ?">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type de document">
          {TYPES.map((t) => (
            <Puce key={t} actif={type === t} onClick={() => setType(t)}>
              {LIBELLE_TYPE_DOCUMENT[t]}
            </Puce>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muet">Matière (facultatif)</p>
          <ChoixMatiere
            valeur={matiereId}
            onChange={(id) => {
              setMatiereId(id);
              setChapitreId('');
            }}
            tout="Aucune"
          />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muet">Chapitre (facultatif)</span>
          <select value={chapitreId} onChange={(e) => setChapitreId(e.target.value)} className={STYLE_CHAMP}>
            <option value="">Tous les chapitres de la matière</option>
            {chapitres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muet">Sujet</span>
          <input
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            maxLength={300}
            placeholder="Ex. : la régulation de la filtration glomérulaire"
            className={STYLE_CHAMP}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-muet">Consignes (facultatif)</span>
          <textarea
            value={consignes}
            onChange={(e) => setConsignes(e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="Ex. : 10 QCM niveau partiel, avec les pièges"
            className={`${STYLE_CHAMP} py-2`}
          />
        </label>
        <p className="text-xs text-muet">
          Jusqu'à 15 questions ou une fiche normale : créé tout de suite. Plus gros : préparé en arrière-plan.
        </p>
        <Bouton variante="primaire" icone={FilePlus2} disabled={!pret} onClick={() => void creer()}>
          {occupe ? 'Le Dr Rodier rédige…' : 'Créer le document'}
        </Bouton>
        {info && (
          <p role="status" className="flex gap-2 rounded-xl border border-bon/40 bg-bon/10 p-3 text-sm">
            <Check size={18} className="shrink-0 text-bon" aria-hidden />
            {info}
          </p>
        )}
        {erreur && (
          <p role="alert" className="rounded-xl border border-critique/50 bg-critique/10 p-3 text-sm">
            {erreur}
          </p>
        )}
      </div>
    </Carte>
  );
}

// ---------------------------------------------------------------------------
// Bibliothèque
// ---------------------------------------------------------------------------

function Bibliotheque() {
  const d = useDonnees();
  const documents = useLiveQuery(() => base.collection<DocumentBiblio>('documents').toArray(), []) ?? [];
  const demandes = useLiveQuery(() => base.collection<DemandeDocument>('demandes').toArray(), []) ?? [];
  const [ouvert, setOuvert] = useState<string | undefined>();
  const [copie, setCopie] = useState(false);
  const [filtreMatiere, setFiltreMatiere] = useState<string | undefined>();

  const tries = [...documents]
    .filter((x) => !filtreMatiere || x.matiereId === filtreMatiere)
    .sort((a, b) => b.creeLe - a.creeLe);
  const doc = tries.find((x) => x.id === ouvert);
  const enCours = demandes.filter((x) => x.statut !== 'terminee').sort((a, b) => b.creeLe - a.creeLe);

  if (doc) {
    const c = couleurMatiere(doc.matiereId);
    return (
      <Carte
        titre={
          <span className="flex items-center gap-2">
            <Pastille ton="accent">{LIBELLE_TYPE_DOCUMENT[doc.type]}</Pastille>
            <span className="text-xs font-normal text-muet">{dateCourte(doc.creeLe)}</span>
          </span>
        }
        action={
          <div className="flex gap-1">
            <Bouton
              variante="discret"
              icone={copie ? Check : Copy}
              className="min-h-9 px-3"
              onClick={() => {
                void navigator.clipboard?.writeText(doc.contenu).then(() => {
                  setCopie(true);
                  setTimeout(() => setCopie(false), 1500);
                });
              }}
            >
              {copie ? 'Copié' : 'Copier'}
            </Bouton>
            <Bouton variante="discret" icone={Printer} className="min-h-9 px-3" onClick={() => window.print()}>
              Imprimer
            </Bouton>
            <Bouton
              variante="discret"
              icone={Trash2}
              className="min-h-9 px-3"
              onClick={() => {
                void supprimerDocument(doc.id);
                setOuvert(undefined);
              }}
            >
              Supprimer
            </Bouton>
          </div>
        }
      >
        <button type="button" onClick={() => setOuvert(undefined)} className="mb-3 text-sm text-accent-clair">
          ← Retour à la bibliothèque
        </button>
        <h2 className="mb-3 text-xl font-semibold tracking-tight" style={{ borderLeft: `4px solid ${c.accent}`, paddingLeft: 10 }}>
          {doc.titre}
        </h2>
        <Markdown texte={doc.contenu} />
        {doc.matiereId && (
          <p className="mt-4 text-xs text-muet">{d.matiereParId.get(doc.matiereId)?.nom}</p>
        )}
      </Carte>
    );
  }

  return (
    <div className="space-y-3">
      {documents.length > 0 && <ChoixMatiere valeur={filtreMatiere} onChange={setFiltreMatiere} tout="Toutes les matières" />}
      {enCours.length > 0 && (
        <Carte titre="Demandes en préparation">
          <ul className="space-y-2">
            {enCours.map((x) => (
              <li key={x.id} className="flex items-start gap-2 text-sm">
                {x.statut === 'erreur' ? (
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-alerte" aria-hidden />
                ) : (
                  <Clock size={16} className="mt-0.5 shrink-0 text-muet" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  {LIBELLE_TYPE_DOCUMENT[x.type]} — {x.sujet}
                  <span className="block text-xs text-muet">
                    {x.statut === 'erreur' ? (x.message ?? 'Échec, nouvel essai possible.') : 'En file, prête dans l’heure environ'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Carte>
      )}
      {tries.length === 0 ? (
        <EtatVide icone={BookMarked as LucideIcon} titre="Ta bibliothèque est vide">
          Les documents que tu demandes au Dr Rodier (fiches, résumés, QCM, flashcards) se rangent ici et restent
          disponibles sur tous tes appareils.
        </EtatVide>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tries.map((x) => {
            const c = couleurMatiere(x.matiereId);
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setOuvert(x.id)}
                  className="carte flex w-full flex-col gap-1.5 p-4 text-left transition-colors hover:bg-surface-2"
                  style={{ borderLeft: `4px solid ${c.accent}` }}
                >
                  <span className="truncate text-sm font-semibold">{x.titre}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muet">
                    <Pastille ton="accent">{LIBELLE_TYPE_DOCUMENT[x.type]}</Pastille>
                    {x.matiereId && d.matiereParId.get(x.matiereId)?.nom}
                    <span>{dateCourte(x.creeLe)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muet">
        <MessageCircle size={13} aria-hidden /> Pour en demander un nouveau : onglet « Créer un document ».
      </p>
    </div>
  );
}
