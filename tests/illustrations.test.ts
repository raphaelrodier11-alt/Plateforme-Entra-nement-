import { describe, expect, it } from 'vitest';
import { assainirSvg, licenceLibre, texteSimple } from '../shared/illustrations';

describe('assainirSvg', () => {
  it('garde un schéma simple', () => {
    const s = assainirSvg('<svg viewBox="0 0 10 10"><rect x="1" y="1" width="5" height="5" fill="#f00"/><text x="2" y="9">A</text></svg>');
    expect(s).toContain('<rect');
    expect(s).toContain('xmlns=');
  });
  it('retire scripts, événements et ressources externes', () => {
    const s = assainirSvg(
      '<svg><script>alert(1)</script><rect onclick="x()" width="3" height="3" fill="url(https://x.fr/a)"/><image href="https://x.fr/a.png"/><a href="javascript:1"><circle r="2"/></a><foreignObject><div>x</div></foreignObject></svg>',
    )!;
    expect(s).not.toMatch(/script|onclick|image|href|foreignObject|https/i);
    expect(s).toContain('<circle');
  });
  it('refuse ce qui n’est pas un SVG', () => {
    expect(assainirSvg('<div>x</div>')).toBeUndefined();
    expect(assainirSvg('<svg><g></svg>')).toBeUndefined();
  });
});

describe('licences', () => {
  it('accepte le libre, refuse le non commercial', () => {
    expect(licenceLibre('CC BY-SA 4.0')).toBe(true);
    expect(licenceLibre('Public domain')).toBe(true);
    expect(licenceLibre('CC BY-NC 4.0')).toBe(false);
    expect(licenceLibre(undefined)).toBe(false);
  });
  it('nettoie les crédits', () => {
    expect(texteSimple('<a href="x">Jane &amp; Co</a>')).toBe('Jane & Co');
  });
});
