/**
 * Consignes envoyées à l'IA. Chaque consigne décrit précisément le JSON
 * attendu ; la réponse est ensuite contrôlée par `validation.ts`.
 */

/** Limite de texte envoyée dans une consigne (le reste est tronqué). */
const TEXTE_MAX = 380_000;

export const SYSTEME = `Tu es un enseignant de médecine qui prépare un étudiant de DFGSM 3 (troisième année, faculté de santé de l'UPEC) à ses partiels.
Règles permanentes :
- Tu réponds en français, uniquement par un objet JSON valide, sans texte autour.
- Tu t'appuies d'abord sur les documents fournis. Quand ils ne suffisent pas, tu utilises des connaissances médicales établies, jamais des suppositions.
- Tu n'inventes ni chiffre, ni référence, ni numéro de page.
- Tu écris de façon claire et concise, avec la terminologie médicale française.`;

function borner(texte: string): string {
  return texte.length > TEXTE_MAX ? `${texte.slice(0, TEXTE_MAX)}\n[… texte tronqué …]` : texte;
}

export function consigneLecture(pages: number[]): string {
  return `Le document joint contient des pages scannées ou des images. Transcris fidèlement le texte des pages suivantes : ${pages.join(', ')}.

Règles :
- Recopie exactement ce qui est écrit (y compris les fautes), sans reformuler ni compléter.
- Si un mot ou un passage est illisible ou incertain, écris ${'[ILLISIBLE]'} à sa place et décris-le dans "illisibles". Ne devine jamais.
- Décris en une phrase entre crochets les schémas et figures utiles, par exemple [Schéma : coupe du néphron].
- Une page sans texte donne un texte vide.

Réponds par :
{"pages":[{"page":1,"texte":"…","illisibles":["question 4, proposition C : annotation manuscrite illisible"]}]}`;
}

export interface LigneFichier {
  ref: string;
  dossier: 'cours' | 'annales' | 'anciens';
  chemin: string;
  debut: string;
  /** Matière imposée par le dossier du Drive (identifiant) : l'IA ne la change pas. */
  matiereImposee?: string;
}

export function consigneStructure(
  fichiers: LigneFichier[],
  matieres: { id: string; nom: string }[],
  chapitres: { id: string; matiereId: string; titre: string }[],
): string {
  return `Voici des fichiers d'un Google Drive d'étudiant en médecine : des supports de cours et des annales de partiels (sujets et corrigés). Classe chaque fichier dans une matière et un chapitre.

Matières déjà connues (réutilise leur identifiant quand c'est la même matière) :
${matieres.map((m) => `- ${m.id} : ${m.nom}`).join('\n') || '(aucune)'}

Chapitres déjà connus (réutilise leur identifiant quand c'est le même chapitre) :
${chapitres.map((c) => `- ${c.id} (matière ${c.matiereId}) : ${c.titre}`).join('\n') || '(aucun)'}

Fichiers à classer (référence | dossier d'origine | chemin | début du texte) :
${fichiers.map((f) => `${f.ref} | ${f.dossier} | ${f.chemin}${f.matiereImposee ? ` | MATIÈRE IMPOSÉE : ${f.matiereImposee}` : ''} | ${f.debut.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n')}

Règles :
- Quand une ligne indique « MATIÈRE IMPOSÉE : identifiant », le dossier du Drive fait foi : utilise exactement cette matière, sans en proposer d'autre. Ton travail pour ce fichier est alors le chapitre (et, pour une annale, le partiel).
- Une matière correspond à une unité d'enseignement ou à une discipline (exemple : « Appareil cardiovasculaire »). Un chapitre correspond à un cours.
- Appuie-toi sur les noms de dossiers et de fichiers, puis sur le début du texte. Plusieurs fichiers peuvent appartenir au même chapitre (diaporama et polycopié du même cours).
- Rôle "cours" : support de cours (dossier "cours" seulement). Rôle "annale" : sujet de partiel (avec ou sans corrigé intégré). Rôle "corrige" : corrigé seul d'un partiel. Rôle "autre" : ni l'un ni l'autre (planning, consignes…).
- Pour une annale ou un corrigé : indique la matière et le partiel (libellé court comme « Partiel janvier 2024 », date au format AAAA-MM ou AAAA si elle est connue, sinon null). Le chapitre reste null : les questions seront classées une par une. Un sujet et son corrigé portent exactement le même libellé de partiel.
- Dossier "anciens" : anciennes versions des cours, gardées uniquement pour être comparées au cours actuel. Rôle "ancien". Associe chacune au chapitre existant (ou créé dans ce lot à partir d'un cours) qui traite du même sujet ; si aucun ne correspond, mets "chapitre" à null. Un fichier ancien ne crée jamais de chapitre.
- Pour créer une matière ou un chapitre, invente une référence ("m1", "c1"…) et utilise-la dans "fichiers".

Réponds par :
{"matieres":[{"ref":"m1","nom":"…"}],
 "chapitres":[{"ref":"c1","matiere":"m1 ou identifiant existant","titre":"…"}],
 "fichiers":[{"ref":"f1","role":"cours","matiere":"m1 ou identifiant existant","chapitre":"c1 ou identifiant existant ou null","partiel":null}]}`;
}

export function consigneAnnale(chemin: string, sujet: string, corrige?: string): string {
  return `Voici le texte d'une annale de partiel (chemin du fichier : ${chemin}). Extrais toutes les questions, sans en oublier aucune.

Règles :
- Recopie l'énoncé et les propositions tels quels. Ne corrige rien et n'ajoute rien.
- "type" : "simple" (une seule réponse attendue), "multiple" (QCM à réponses multiples), "vrai_faux" (affirmations à juger), "trous" (texte à compléter : remplace chaque trou par {{1}}, {{2}}…).
- "reponsesCorrectes" : les lettres justes selon le corrigé officiel présent dans le document. S'il n'y a pas de corrigé pour cette question, mets null. Ne propose jamais ta propre réponse.
- "cas" : si la question dépend d'un cas clinique, recopie le texte du cas (identique pour toutes ses questions), sinon null.
- "page" : numéro de la page où se trouve la question, d'après les marqueurs « --- Page n --- ».
- Signale dans "illisibles" tout passage marqué [ILLISIBLE] ou incompréhensible, sans le deviner. Une question dont l'énoncé est illisible n'est pas extraite.
- "partiel" : libellé court (« Partiel janvier 2024 ») et date (AAAA-MM ou AAAA, sinon null) d'après le document ou le chemin.

Réponds par :
{"partiel":{"libelle":"…","date":"2024-01"},
 "questions":[{"numero":"12","page":3,"type":"multiple","enonce":"…","propositions":[{"texte":"…"}],"reponsesCorrectes":["A","C"],"trous":null,"cas":null}],
 "illisibles":[{"page":5,"contexte":"…"}]}

=== SUJET ===
${borner(sujet)}${corrige ? `\n\n=== CORRIGÉ (document séparé) ===\n${borner(corrige)}` : ''}`;
}

export function consigneClassement(
  chapitres: { id: string; titre: string; resume?: string }[],
  questions: { ref: string; texte: string }[],
): string {
  return `Rattache chaque question d'annale au chapitre de cours dont elle relève.

Chapitres :
${chapitres.map((c) => `- ${c.id} : ${c.titre}${c.resume ? ` — ${c.resume}` : ''}`).join('\n')}

Questions :
${questions.map((q) => `${q.ref} : ${q.texte.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n')}

Si aucun chapitre ne convient vraiment, mets null.
Réponds par : {"classement":[{"ref":"q1","chapitre":"identifiant ou null"}]}`;
}

const FORMAT_FICHE = `{"resume":"une phrase qui résume le chapitre",
 "sections":[{"titre":"…","blocs":[
   {"type":"texte","contenu":"2 à 4 phrases au maximum"},
   {"type":"liste","titre":"…","elements":["3 à 6 éléments courts"]},
   {"type":"cles","elements":["points à retenir absolument"]},
   {"type":"pieges","elements":["pièges classiques, confusions fréquentes"]},
   {"type":"arbre","titre":"…","racine":{"label":"question ou situation","detail":"…","branches":[{"condition":"si…","noeud":{"label":"…","detail":"…","branches":[]}}]}},
   {"type":"schema","titre":"…","noeuds":[{"id":"a","label":"court","detail":"explication"}],"liens":[{"de":"a","vers":"b","label":"court"}]},
   {"type":"etapes","titre":"…","etapes":[{"titre":"…","detail":"…"}]},
   {"type":"mnemo","phrase":"…","signification":["…"]},
   {"type":"scene3d","scene":{"titre":"…","description":"…",
      "objets":[{"id":"a","forme":"sphere|boite|cylindre|cone|tore|tube","position":[0,0,0],"taille":[1],"chemin":[[0,0,0],[1,1,0]],"couleur":"#3987e5","opacite":1,"label":"…","detail":"…"}],
      "etapes":[{"titre":"…","texte":"…","focus":["a"],"masques":[],"flux":[{"tube":"id d'un tube","couleur":"#ffb38f"}],"camera":[0,2,8]}]}}
 ]}]}`;

export function consigneFiche(titre: string, cours: string, annales: string[]): string {
  return `Rédige la fiche de révision du chapitre « ${titre} » à partir du cours ci-dessous (et des documents joints s'il y en a : ils contiennent les schémas).

Objectif : une fiche très visuelle, qui couvre tout le chapitre, à relire en 10 minutes.
- Découpe en 4 à 10 sections suivant le plan du cours. Chaque section mélange plusieurs types de blocs.
- Privilégie les arbres de décision (démarche diagnostique, conduite à tenir), les schémas (mécanismes, classifications, relations de cause à effet), les séquences pas à pas, les listes courtes et les encadrés « à retenir » et « pièges ».
- N'utilise jamais de tableau. Pas de longs paragraphes : un bloc "texte" fait 2 à 4 phrases.
- Ajoute des moyens mnémotechniques quand ils sont classiques ou réellement utiles.
- Ajoute au plus deux blocs "scene3d" quand un mécanisme se comprend mieux dans l'espace (circulation, trajet d'un influx, anatomie simple, filtration…). Une scène est schématique : 3 à 12 objets simples dans un cube de −4 à 4, des tubes pour les trajets, 3 à 6 étapes qui mettent des objets en évidence ("focus") et animent un flux le long d'un tube. Couleurs au format #rrggbb. Si aucun mécanisme ne s'y prête, n'en mets pas.
- Insiste sur les notions tombées aux partiels (questions d'annales ci-dessous).
- Tout doit être exact et fidèle au cours ; complète avec des connaissances établies seulement si le cours est muet sur un point indispensable.

Questions d'annales rattachées au chapitre :
${annales.length ? annales.map((a) => `- ${a.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') : '(aucune)'}

Format de réponse (les types de blocs sont tous facultatifs, à combiner librement) :
${FORMAT_FICHE}

=== COURS ===
${borner(cours)}`;
}

export interface DemandeQcm {
  titre: string;
  cours: string;
  sections: { id: string; titre: string }[];
  nombre: number;
  /** Énoncés déjà produits, à ne pas répéter. */
  dejaPosees: string[];
  annales: string[];
}

export function consigneQcm(d: DemandeQcm): string {
  return `Écris ${d.nombre} questions d'entraînement inédites sur le chapitre « ${d.titre} », à partir du cours ci-dessous.

Répartition visée sur l'ensemble du lot :
- types : environ 35 % "multiple" (5 propositions, 1 à 4 justes, comme aux partiels), 20 % "simple" (4 ou 5 propositions, une seule juste), 15 % "vrai_faux" (3 à 5 affirmations), 15 % "trous" (1 ou 2 trous), 15 % de questions appartenant à des cas cliniques (2 ou 3 questions par cas) ;
- difficulté : environ 30 % faciles (1), 45 % moyennes (2), 25 % difficiles (3) ;
- couverture : toutes les sections du chapitre doivent être interrogées, proportionnellement à leur importance.

Sections de la fiche (mets l'identifiant de la section concernée dans "section") :
${d.sections.map((s) => `- ${s.id} : ${s.titre}`).join('\n') || '(aucune)'}

Règles :
- Chaque question est autonome, sans ambiguïté, avec une seule lecture possible. Les réponses doivent se justifier par le cours.
- Les questions sont inédites : ne recopie pas les annales listées plus bas, mais inspire-toi de leur style et de leur niveau.
- "explication" (obligatoire) : pourquoi les bonnes réponses sont justes et les autres fausses, en 2 à 4 phrases. Ajoute une courte "explication" à chaque proposition fausse quand elle correspond à une confusion classique.
- "rappel" (obligatoire) : le rappel de cours à relire en cas d'erreur, en 1 à 3 phrases, compréhensible seul.
- "piege" : true si la question repose sur un piège classique.
- Texte à trous : marque les trous par {{1}}, {{2}} dans l'énoncé et donne pour chacun les réponses acceptées (synonymes, variantes d'écriture). Un trou attend un mot, une valeur ou une courte expression.
- Vrai/faux : chaque proposition porte "correcte": true si l'affirmation est vraie.
- Cas clinique : décris le cas dans "cas" (référence, titre, vignette de 3 à 6 phrases) et rattache ses questions par "casRef".

À ne pas répéter (questions déjà écrites) :
${d.dejaPosees.length ? d.dejaPosees.map((e) => `- ${e.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n') : '(aucune)'}

Annales du chapitre (pour le style et le niveau) :
${d.annales.length ? d.annales.slice(0, 25).map((a) => `- ${a.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n') : '(aucune)'}

Réponds par :
{"cas":[{"ref":"k1","titre":"…","vignette":"…"}],
 "questions":[{"type":"multiple","enonce":"…","propositions":[{"texte":"…","correcte":true,"explication":"…"}],"trous":null,"explication":"…","rappel":"…","section":"identifiant","difficulte":2,"piege":false,"casRef":null},
              {"type":"trous","enonce":"Le … est de {{1}} mmHg.","propositions":null,"trous":[{"reponses":["40","40 mmHg"]}],"explication":"…","rappel":"…","section":"identifiant","difficulte":1,"piege":false,"casRef":null}]}

=== COURS ===
${borner(d.cours)}`;
}

export function consigneFlashcards(titre: string, cours: string, nombre: number): string {
  return `Écris ${nombre} flashcards sur le chapitre « ${titre} » : une question courte au recto, la réponse courte au verso. Couvre les définitions, valeurs seuils, classifications, signes et traitements essentiels du cours.

Réponds par : {"flashcards":[{"recto":"…","verso":"…"}]}

=== COURS ===
${borner(cours)}`;
}

export interface QuestionPourIa {
  ref: string;
  enonce: string;
  propositions: string[];
  /** Réponses du corrigé officiel, absentes s'il n'y en a pas. */
  reponses?: string[];
  page?: number;
}

function ecrireQuestions(questions: QuestionPourIa[], avecReponses: boolean): string {
  return questions
    .map((q) =>
      [
        `${q.ref}${q.page ? ` (page ${q.page})` : ''} : ${q.enonce}`,
        ...q.propositions,
        ...(avecReponses ? [`Corrigé officiel : ${q.reponses?.length ? q.reponses.join(', ') : 'absent'}`] : []),
      ].join('\n'),
    )
    .join('\n\n');
}

export function consigneExplications(titre: string, cours: string, questions: QuestionPourIa[]): string {
  return `Voici des questions d'annales du chapitre « ${titre} », avec leur corrigé officiel. Pour chacune, rédige l'explication et le rappel de cours. Ne modifie pas les réponses : tu expliques le corrigé officiel tel qu'il est.

Pour chaque question :
- "explication" : pourquoi les propositions justes le sont et les autres non, en 2 à 4 phrases, d'après le cours ;
- "rappel" : le rappel de cours à relire en cas d'erreur, en 1 à 3 phrases, compréhensible seul ;
- "difficulte" : 1 (facile), 2 (moyenne) ou 3 (difficile) ;
- "piege" : true si la question repose sur un piège classique.

Réponds par : {"explications":[{"ref":"q1","explication":"…","rappel":"…","difficulte":2,"piege":false}]}

=== QUESTIONS ===
${ecrireQuestions(questions, true)}

=== COURS ===
${borner(cours)}`;
}

export function consigneCorrigesManquants(titre: string, cours: string, questions: QuestionPourIa[]): string {
  return `Ces questions d'annales du chapitre « ${titre} » n'ont pas de corrigé officiel. Établis la réponse la plus sûre à partir du cours, puis de connaissances médicales établies.

Pour chaque question :
- "correctes" : les lettres des propositions justes (pour un vrai/faux : les numéros des affirmations vraies) ;
- "explication" : la justification, en 2 à 4 phrases, en citant le passage du cours quand il existe ;
- "rappel" : le rappel de cours correspondant, en 1 à 3 phrases ;
- "difficulte" : 1, 2 ou 3 ;
- "incertain" : true si le cours ne permet pas de trancher avec certitude.

Réponds par : {"reponses":[{"ref":"q1","correctes":["A","D"],"explication":"…","rappel":"…","difficulte":2,"incertain":false}]}

=== QUESTIONS ===
${ecrireQuestions(questions, false)}

=== COURS ===
${borner(cours)}`;
}

export function consigneErreurs(
  titre: string,
  cours: string,
  questions: QuestionPourIa[],
  autresChapitres: { id: string; titre: string }[],
): string {
  return `Relis de façon critique le cours du chapitre « ${titre} » et les questions d'annales qui lui sont rattachées. Signale uniquement les erreurs réelles et vérifiables ; s'il n'y en a pas, renvoie une liste vide. Ne signale ni les choix de style, ni les simplifications pédagogiques acceptables.

Types d'erreur :
- "reponse_fausse" : le corrigé officiel d'une question est faux ;
- "contradiction" : le corrigé d'une question contredit le cours ;
- "faute" : erreur factuelle, valeur ou unité erronée, coquille qui change le sens, dans le cours ou dans une question ;
- "incoherence" : deux passages du cours se contredisent ;
- "mal_classee" : la question relève clairement d'un autre chapitre de la liste ci-dessous.

Pour chaque erreur :
- "question" : la référence de la question concernée (q1, q2…), ou null si l'erreur est dans le cours ;
- "page" : la page du cours ou de l'annale d'après les marqueurs « --- Page n --- », sinon null ; "ligne" : null si inconnue ;
- "extrait" : le passage fautif, recopié exactement ;
- "description" : l'erreur, en une phrase ;
- "correction" : la correction exacte à appliquer, rédigée telle qu'elle doit être lue ;
- "explication" : la justification, en 1 à 3 phrases ;
- "source" : ce qui justifie la correction (page du cours, autre passage du même document, référence médicale reconnue). Sans source précise, ne signale pas l'erreur ;
- "bonnesReponses" : pour "reponse_fausse" et "contradiction", les lettres réellement justes, sinon null ;
- "chapitreCorrect" : pour "mal_classee", l'identifiant du bon chapitre, sinon null ;
- "texteCorrige" : pour une faute dans l'énoncé d'une question, l'énoncé corrigé complet, sinon null.

Autres chapitres de la matière :
${autresChapitres.map((c) => `- ${c.id} : ${c.titre}`).join('\n') || '(aucun)'}

Réponds par :
{"anomalies":[{"type":"contradiction","question":"q3","page":2,"ligne":null,"extrait":"…","description":"…","correction":"…","explication":"…","source":"Cours, page 12 : « … »","bonnesReponses":["B","D"],"chapitreCorrect":null,"texteCorrige":null}]}

=== QUESTIONS D'ANNALES ===
${questions.length ? ecrireQuestions(questions, true) : '(aucune)'}

=== COURS ===
${borner(cours)}`;
}

export function consigneActualisation(
  titre: string,
  ancien: string,
  actuel: string,
  origine: 'ancien' | 'precedente',
): string {
  const lienAvant =
    origine === 'ancien'
      ? "l'ancienne version du cours (série précédente)"
      : 'la version précédente du même fichier, avant son remplacement';
  return `Compare ${lienAvant} et la version actuelle du chapitre « ${titre} ». Dis précisément ce qui a changé sur le fond, pour qu'un étudiant sache quoi réapprendre.

À signaler (changements de fond) :
- une valeur, un seuil, une durée, une dose, un critère ou une classification qui change ;
- un traitement, un examen, une stratégie qui apparaît, disparaît ou est remplacé ;
- une définition ou un mécanisme corrigé ;
- une notion entière ajoutée ou retirée.

À ignorer : mise en forme, changement d'ordre, reformulations sans changement de sens, fautes de frappe corrigées, numéros de pages.

Pour chaque changement :
- "type" : "ajout" (présent seulement dans la version actuelle), "retrait" (présent seulement dans l'ancienne), "modification" ;
- "importance" : "majeure" si cela peut changer une réponse à un QCM (valeur, critère, traitement, classification), sinon "mineure" ;
- "sujet" : l'objet du changement, en quelques mots ;
- "avant" : ce que disait l'ancienne version, recopié ou résumé fidèlement (null pour un ajout) ;
- "apres" : ce que dit la version actuelle (null pour un retrait) ;
- "page" : page de la version actuelle d'après « --- Page n --- », sinon null.

Ne signale que des différences réellement présentes dans les deux textes ; n'invente rien. 40 changements au plus, les majeurs d'abord. S'il n'y a aucun changement de fond, mets "identique" à true et une liste vide.

Réponds par :
{"identique":false,"resume":"2 à 3 phrases : l'essentiel de ce qui a changé","changements":[{"type":"modification","importance":"majeure","sujet":"…","avant":"…","apres":"…","page":3}]}

=== VERSION PLUS ANCIENNE ===
${borner(ancien)}

=== VERSION ACTUELLE ===
${borner(actuel)}`;
}
