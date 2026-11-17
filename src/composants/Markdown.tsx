/**
 * Affiche le texte mis en forme par l'assistant : titres, listes, gras,
 * italique. Aucun HTML brut n'est interprété. Les tableaux ne sont jamais
 * produits : s'il en reste, ils s'affichent comme du texte.
 */
import type { ReactNode } from 'react';

function enLigne(texte: string, cle: string): ReactNode[] {
  const morceaux: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let dernier = 0;
  let i = 0;
  for (const m of texte.matchAll(re)) {
    const debut = m.index ?? 0;
    if (debut > dernier) morceaux.push(texte.slice(dernier, debut));
    const t = m[0];
    if (t.startsWith('**')) morceaux.push(<strong key={`${cle}${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) {
      morceaux.push(
        <code key={`${cle}${i++}`} className="rounded bg-surface-3 px-1 py-0.5 text-[0.9em]">
          {t.slice(1, -1)}
        </code>,
      );
    } else morceaux.push(<em key={`${cle}${i++}`}>{t.slice(1, -1)}</em>);
    dernier = debut + t.length;
  }
  if (dernier < texte.length) morceaux.push(texte.slice(dernier));
  return morceaux;
}

export function Markdown({ texte, className }: { texte: string; className?: string }) {
  const blocs: ReactNode[] = [];
  const lignes = texte.replace(/\r/g, '').split('\n');
  let liste: { ordonnee: boolean; items: string[] } | undefined;
  let paragraphe: string[] = [];
  let k = 0;

  const viderParagraphe = () => {
    if (paragraphe.length) {
      blocs.push(
        <p key={k++} className="leading-relaxed">
          {enLigne(paragraphe.join(' '), `p${k}`)}
        </p>,
      );
      paragraphe = [];
    }
  };
  const viderListe = () => {
    if (!liste) return;
    const Balise = liste.ordonnee ? 'ol' : 'ul';
    blocs.push(
      <Balise key={k++} className={`ml-5 space-y-1 ${liste.ordonnee ? 'list-decimal' : 'list-disc'}`}>
        {liste.items.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {enLigne(item, `l${k}-${i}`)}
          </li>
        ))}
      </Balise>,
    );
    liste = undefined;
  };

  for (const brute of lignes) {
    const ligne = brute.trimEnd();
    const titre = /^(#{1,4})\s+(.*)$/.exec(ligne);
    const puce = /^\s*[-*•]\s+(.*)$/.exec(ligne);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(ligne);
    if (titre) {
      viderParagraphe();
      viderListe();
      const niveau = (titre[1] ?? '#').length;
      blocs.push(
        <p
          key={k++}
          className={
            niveau === 1
              ? 'mt-1 text-lg font-semibold tracking-tight'
              : niveau === 2
                ? 'mt-2 text-base font-semibold'
                : 'mt-1 text-sm font-semibold text-texte-2'
          }
        >
          {enLigne(titre[2] ?? '', `t${k}`)}
        </p>,
      );
    } else if (puce || numero) {
      viderParagraphe();
      const ordonnee = !!numero;
      if (liste && liste.ordonnee !== ordonnee) viderListe();
      liste ??= { ordonnee, items: [] };
      liste.items.push((puce ?? numero)?.[1] ?? '');
    } else if (ligne.trim() === '') {
      viderParagraphe();
      viderListe();
    } else {
      viderListe();
      paragraphe.push(ligne.trim());
    }
  }
  viderParagraphe();
  viderListe();
  return <div className={`space-y-2 text-sm ${className ?? ''}`}>{blocs}</div>;
}
