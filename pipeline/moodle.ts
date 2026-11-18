/**
 * Moodle de la fac, en lecture seule. On utilise l'API officielle de Moodle avec
 * un jeton personnel (« clé de sécurité » du profil) : le mot de passe de
 * l'étudiant n'est jamais demandé ni stocké. Seuls des appels de lecture sont émis.
 */
import type { Drive, FichierDrive } from './drive';

export const DOSSIER_MOODLE = 'moodle:cours';
const PREFIXE = 'moodle:';

export const estFichierMoodle = (id: string): boolean => id.startsWith(PREFIXE);

export interface NotificationMoodle {
  id: string;
  titre: string;
  message: string;
  date: number;
}

type Appel = <T>(fonction: string, params?: Record<string, string | number>) => Promise<T>;

interface Contenu {
  type: string;
  filename: string;
  fileurl: string;
  filesize?: number;
  timemodified?: number;
  mimetype?: string;
}
interface Section {
  name?: string;
  modules?: { id: number; name?: string; contents?: Contenu[] }[];
}

/** « 2025-2026 – S5 – UE Cardiologie » → semestre 5, « Cardiologie ». */
export function nomCoursMoodle(nomComplet: string): { semestre?: number; matiere: string } {
  const semestre = /\bS(?:emestre)?\s*([1-9])\b/i.exec(nomComplet);
  const matiere = nomComplet
    .replace(/\b20\d{2}\s*[-/–]\s*(?:20)?\d{2}\b/g, ' ')
    .replace(/\bS(?:emestre)?\s*[1-9]\b/gi, ' ')
    .replace(/\b(?:UE|U\.E\.|EC)\s*\d*\b[\s:.-]*/gi, ' ')
    .replace(/[|–—:/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '');
  return { ...(semestre ? { semestre: Number(semestre[1]) } : {}), matiere: matiere || nomComplet.trim() };
}

const nettoyer = (s: string) => s.replace(/[\\/]+/g, '-').trim();

export function creerAppel(base: string, jeton: string, http: typeof fetch = fetch): Appel {
  const racine = base.replace(/\/+$/, '');
  return async <T>(fonction: string, params: Record<string, string | number> = {}): Promise<T> => {
    const url = new URL(`${racine}/webservice/rest/server.php`);
    const corps = new URLSearchParams({ wstoken: jeton, wsfunction: fonction, moodlewsrestformat: 'json' });
    for (const [k, v] of Object.entries(params)) corps.set(k, String(v));
    const reponse = await http(url, { method: 'POST', body: corps });
    if (!reponse.ok) throw new Error(`Moodle : ${reponse.status}`);
    const json = (await reponse.json()) as { exception?: string; errorcode?: string } & T;
    // Le message d'erreur peut contenir du contenu privé : seul le code est conservé.
    if (json && typeof json === 'object' && 'exception' in json && json.exception) throw new Error(`Moodle : ${json.errorcode ?? 'erreur'}`);
    return json;
  };
}

export function driveMoodle(base: string, jeton: string, http: typeof fetch = fetch): Drive {
  const appel = creerAppel(base, jeton, http);
  const sections = new Map<number, Promise<Section[]>>();
  const contenuCours = (id: number) => {
    let p = sections.get(id);
    if (!p) sections.set(id, (p = appel<Section[]>('core_course_get_contents', { courseid: id })));
    return p;
  };

  return {
    async lister() {
      const site = await appel<{ userid: number }>('core_webservice_get_site_info');
      const cours = await appel<{ id: number; fullname: string }[]>('core_enrol_get_users_courses', { userid: site.userid });
      const fichiers: FichierDrive[] = [];
      for (const c of cours) {
        const { semestre, matiere } = nomCoursMoodle(c.fullname);
        const racine = `${semestre ? `SEMESTRE ${semestre} / ` : ''}${nettoyer(matiere)}`;
        let liste: Section[];
        try {
          liste = await contenuCours(c.id);
        } catch {
          continue; // Un cours inaccessible n'arrête pas les autres.
        }
        for (const s of liste) {
          for (const m of s.modules ?? []) {
            (m.contents ?? []).forEach((f, i) => {
              if (f.type !== 'file') return;
              fichiers.push({
                id: `${PREFIXE}${c.id}:${m.id}:${i}`,
                nom: f.filename,
                chemin: `${racine} / ${nettoyer(s.name ?? 'Section')} / ${f.filename}`,
                mimeType: f.mimetype ?? 'application/octet-stream',
                modifieLe: new Date((f.timemodified ?? 0) * 1000).toISOString(),
                taille: f.filesize,
              });
            });
          }
        }
      }
      return fichiers;
    },
    async telecharger(fichier) {
      const [, cours, module, rang] = fichier.id.split(':');
      const liste = await contenuCours(Number(cours));
      const contenu = liste.flatMap((s) => s.modules ?? []).find((m) => m.id === Number(module))?.contents?.[Number(rang)];
      if (!contenu) throw new Error('Fichier Moodle introuvable');
      const url = new URL(contenu.fileurl);
      url.searchParams.set('token', jeton);
      const reponse = await http(url);
      if (!reponse.ok) throw new Error(`Moodle : ${reponse.status}`);
      return { octets: new Uint8Array(await reponse.arrayBuffer()), mimeType: contenu.mimetype ?? 'application/octet-stream' };
    },
  };
}

/** Notifications Moodle récentes (annonces des profs, devoirs, messages). */
export async function notificationsMoodle(base: string, jeton: string, http: typeof fetch = fetch): Promise<NotificationMoodle[]> {
  const appel = creerAppel(base, jeton, http);
  const site = await appel<{ userid: number }>('core_webservice_get_site_info');
  type Reponse = { notifications?: { id: number; subject?: string; smallmessage?: string; fullmessage?: string; timecreated: number }[] };
  let r: Reponse;
  try {
    r = await appel<Reponse>('message_popup_get_popup_notifications', { useridto: site.userid, limit: 30 });
  } catch {
    r = await appel<Reponse>('core_message_get_popup_notifications', { useridto: site.userid, limit: 30 });
  }
  return (r.notifications ?? []).map((n) => ({
    id: `moodle-notif:${n.id}`,
    titre: (n.subject ?? 'Notification Moodle').slice(0, 120),
    message: (n.smallmessage ?? n.fullmessage ?? '').replace(/\s+/g, ' ').slice(0, 400),
    date: n.timecreated * 1000,
  }));
}
