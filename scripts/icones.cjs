// Génère les icônes PNG de la PWA à partir de public/icone.svg.
// Usage : node scripts/icones.cjs (nécessite Playwright et Chromium).
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');

const svg = readFileSync('public/icone.svg', 'utf8');
// Icône « masquable » : le dessin tient dans la zone sûre, sur un fond plein.
const masque = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<path', '<g transform="translate(64 64) scale(0.75)"><path')
  .replace('</svg>', '</g></svg>');

const cibles = [
  { fichier: 'public/icone-192.png', taille: 192, source: svg },
  { fichier: 'public/icone-512.png', taille: 512, source: svg },
  { fichier: 'public/apple-touch-icon.png', taille: 180, source: svg.replace('rx="112"', 'rx="0"') },
  { fichier: 'public/icone-masque-512.png', taille: 512, source: masque },
];

(async () => {
  const navigateur = await chromium.launch();
  for (const { fichier, taille, source } of cibles) {
    const page = await navigateur.newPage({ viewport: { width: taille, height: taille } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${taille}px;height:${taille}px}</style>${source}`,
    );
    await page.screenshot({ path: fichier, omitBackground: true });
    await page.close();
  }
  await navigateur.close();
  console.log('Icônes générées.');
})();
