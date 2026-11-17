/**
 * Thème de l'interface : sombre, clair, ou celui de l'appareil.
 * Le choix est gardé sur chaque appareil (il peut différer entre tablette et téléphone).
 */
export type Theme = 'sombre' | 'clair' | 'auto';

const CLE = 'dr-rodier:theme';

export function lireTheme(): Theme {
  try {
    const v = localStorage.getItem(CLE);
    return v === 'clair' || v === 'auto' || v === 'sombre' ? v : 'sombre';
  } catch {
    return 'sombre';
  }
}

function resolu(theme: Theme): 'dark' | 'light' {
  if (theme === 'auto') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return theme === 'clair' ? 'light' : 'dark';
}

export function appliquerTheme(theme: Theme): void {
  const mode = resolu(theme);
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f6f5f2' : '#0d0d0d');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', mode);
}

export function choisirTheme(theme: Theme): void {
  try {
    localStorage.setItem(CLE, theme);
  } catch {
    // Sans stockage, le choix ne dure que le temps de la session.
  }
  appliquerTheme(theme);
}

/** À appeler au démarrage : applique le thème et suit l'appareil en mode automatique. */
export function initialiserTheme(): void {
  appliquerTheme(lireTheme());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (lireTheme() === 'auto') appliquerTheme('auto');
  });
}

// Impression et export PDF : toujours en thème clair, quel que soit le thème choisi.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => {
    document.documentElement.dataset.theme = 'light';
  });
  window.addEventListener('afterprint', () => appliquerTheme(lireTheme()));
}
