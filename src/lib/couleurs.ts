/** Une teinte stable par matière (même matière, même couleur partout). */
const TEINTES = [
  { nom: 'bleu', h: 215 },
  { nom: 'turquoise', h: 175 },
  { nom: 'vert', h: 140 },
  { nom: 'jaune', h: 48 },
  { nom: 'orange', h: 25 },
  { nom: 'rose', h: 335 },
  { nom: 'violet', h: 270 },
  { nom: 'indigo', h: 245 },
] as const;

function indice(matiereId: string | undefined): number {
  if (!matiereId) return 0;
  let h = 0;
  for (const c of matiereId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % TEINTES.length;
}

/** Couleur d'accent d'une matière, lisible en thème clair comme en thème sombre. */
export function couleurMatiere(matiereId: string | undefined): { accent: string; fond: string; bord: string } {
  const { h } = TEINTES[indice(matiereId)] ?? TEINTES[0];
  return {
    accent: `oklch(0.72 0.14 ${h})`,
    fond: `oklch(0.72 0.14 ${h} / 0.16)`,
    bord: `oklch(0.72 0.14 ${h} / 0.45)`,
  };
}
