/** Réglage « animations » : l'ECG et ses lueurs peuvent être coupés (batterie, confort). */
const CLE = 'dr-rodier:animations';

export function animationsActives(): boolean {
  try {
    if (localStorage.getItem(CLE) === 'off') return false;
  } catch {
    // Sans stockage : animations actives.
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function reglerAnimations(actives: boolean): void {
  try {
    localStorage.setItem(CLE, actives ? 'on' : 'off');
  } catch {
    // Le choix ne dure alors que la session.
  }
  window.dispatchEvent(new Event('dr-rodier:animations'));
}
