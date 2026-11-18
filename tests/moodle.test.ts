import { describe, expect, it } from 'vitest';
import { driveMoodle, nomCoursMoodle, notificationsMoodle } from '../pipeline/moodle';

const faux = ((url: URL | string, init?: RequestInit) => {
  const u = new URL(String(url));
  const fonction = new URLSearchParams(String(init?.body ?? '')).get('wsfunction');
  const rep = (x: unknown) => Promise.resolve(new Response(JSON.stringify(x)));
  if (u.pathname.includes('pluginfile.php')) return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  if (fonction === 'core_webservice_get_site_info') return rep({ userid: 7 });
  if (fonction === 'core_enrol_get_users_courses') return rep([{ id: 3, fullname: '2025-2026 - S5 - UE Cardiologie' }]);
  if (fonction === 'core_course_get_contents')
    return rep([{ name: 'Cours', modules: [{ id: 9, contents: [{ type: 'file', filename: 'c1.pdf', fileurl: 'https://m.fr/webservice/pluginfile.php/1/c1.pdf', mimetype: 'application/pdf', timemodified: 1700000000 }] }] }]);
  if (fonction === 'message_popup_get_popup_notifications') return rep({ notifications: [{ id: 5, subject: 'Annonce', smallmessage: 'Cours déplacé', timecreated: 1700000000 }] });
  return rep({ exception: 'x', errorcode: 'nope' });
}) as unknown as typeof fetch;

describe('Moodle', () => {
  it('nettoie le nom du cours', () => {
    expect(nomCoursMoodle('2025-2026 - S5 - UE Cardiologie')).toEqual({ semestre: 5, matiere: 'Cardiologie' });
  });
  it('liste et télécharge les fichiers, avec le semestre dans le chemin', async () => {
    const d = driveMoodle('https://m.fr', 'tok', faux);
    const l = await d.lister('moodle:cours');
    expect(l[0]?.chemin).toBe('SEMESTRE 5 / Cardiologie / Cours / c1.pdf');
    const f = await d.telecharger(l[0]!);
    expect([...f.octets]).toEqual([1, 2, 3]);
  });
  it('lit les notifications', async () => {
    const n = await notificationsMoodle('https://m.fr', 'tok', faux);
    expect(n[0]).toMatchObject({ id: 'moodle-notif:5', titre: 'Annonce' });
  });
});
