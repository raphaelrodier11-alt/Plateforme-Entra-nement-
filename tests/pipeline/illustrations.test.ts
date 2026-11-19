import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { chercherCommons, extraireFigures } from '../../pipeline/illustrations';

describe('figures des PDF', () => {
  it('extrait une figure et ignore le logo répété', async () => {
    const png = (r: number, g: number, b: number) =>
      sharp({ create: { width: 400, height: 300, channels: 3, background: { r, g, b } } })
        .png().toBuffer().then((x) => `data:image/png;base64,${x.toString('base64')}`);
    const figure = await png(200, 30, 30);
    const logo = await png(10, 10, 200);
    const doc = new jsPDF();
    for (let i = 0; i < 4; i++) {
      if (i > 0) doc.addPage();
      doc.text(`Page ${i + 1}`, 10, 10);
      doc.addImage(logo, 'PNG', 150, 5, 40, 30);
      if (i === 1) doc.addImage(figure, 'PNG', 20, 50, 120, 90);
    }
    const figures = await extraireFigures(new Uint8Array(doc.output('arraybuffer')), 'test');
    expect(figures).toHaveLength(1);
    expect(figures[0]?.page).toBe(2);
    expect(figures[0]?.media.mimeType).toBe('image/webp');
    expect(Buffer.from(figures[0]!.media.donnees, 'base64').byteLength).toBeLessThan(160_000);
  });
  it('renvoie [] pour un fichier illisible', async () => {
    expect(await extraireFigures(new Uint8Array([1, 2, 3]), 'x')).toEqual([]);
  });
});

describe('Wikimedia Commons', () => {
  const reponse = (pages: object) => (() => Promise.resolve(new Response(JSON.stringify({ query: { pages } })))) as unknown as typeof fetch;
  const page = (titre: string, licence: string, index = 1) => ({
    index, title: titre,
    imageinfo: [{ thumburl: `https://upload.wikimedia.org/${index}.png`, mime: 'image/png', descriptionurl: 'https://commons.wikimedia.org/wiki/x', extmetadata: { LicenseShortName: { value: licence }, Artist: { value: '<a>Jane</a>' } } }],
  });
  it('garde les images libres et pertinentes', async () => {
    const r = await chercherCommons('aortic valve anatomy', 2, reponse({
      a: page('File:Aortic valve diagram.png', 'CC BY-SA 4.0', 1),
      b: page('File:Aortic valve photo.png', 'CC BY-NC 4.0', 2),
      c: page('File:Cat.png', 'CC0', 3),
    }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'web', licence: 'CC BY-SA 4.0', credit: 'Jane' });
  });
  it('ne plante pas hors ligne', async () => {
    expect(await chercherCommons('heart', 2, (() => Promise.reject(new Error('x'))) as unknown as typeof fetch)).toEqual([]);
  });
});
