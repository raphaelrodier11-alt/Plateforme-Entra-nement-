# Dr Rodier

Plateforme personnelle de révision des cours et annales de DFGSM 3 (UPEC).
Application web en français, thème sombre, utilisable sur ordinateur, tablette et
téléphone, y compris hors connexion. Aucun compte, aucun mot de passe : l'accès se
fait par un lien secret.

## Ce que fait l'application

- **Import du Google Drive** (lecture seule) : cours en PDF, Word, PowerPoint ou
  Google Docs, annales et corrigés. Les chapitres sont détectés et classés
  automatiquement. Le drive est revérifié chaque semaine.
- **Fiches de révision visuelles** : arbres de décision, schémas interactifs,
  séquences pas à pas, listes courtes, moyens mnémotechniques, modèles 3D
  schématiques. Jamais de tableau.
- **QCM** : 20 à 50 questions par chapitre (annales et questions générées), choix
  simple, choix multiples, vrai/faux, cas cliniques, texte à trous, avec une
  explication et un rappel de cours après chaque réponse.
- **Examens** : examen blanc type partiel (questions inédites, chronométré) et
  entraînement général sur tout le programme d'une matière. Note prévue par matière.
- **Erreurs** : liste filtrable (chapitre, type, date, fréquence), répétition
  espacée, rappel de cours associé à chaque erreur.
- **Planning** : disponibilités par jour et par créneau, dates d'examens, calendrier
  iCloud, recalcul à chaque progrès.
- **Suivi** : avancement par chapitre, progrès dans le temps, taux de réussite, carte
  de chaleur, points, séries de jours, badges.
- **Validations** : fichier modifié, correction d'une erreur détectée dans une annale
  ou un cours, coût de génération. Rien n'est appliqué sans accord, et **les fichiers
  du drive ne sont jamais modifiés**.

## Architecture

```
┌──────────── appareil ────────────┐      ┌──────────── Cloudflare (gratuit) ───────────┐
│ PWA React (src/)                 │      │ Worker (worker/)                            │
│  • interface, calculs, planning  │◄────►│  • sert l'application                       │
│  • copie locale IndexedDB        │ sync │  • API de synchronisation, lien secret      │
│  • service worker (hors ligne)   │      │  • connexion Google Drive, relais du .ics   │
└──────────────────────────────────┘      │ Base D1 (SQLite) : documents JSON           │
                                          └───────────────────▲─────────────────────────┘
┌──────────── GitHub Actions (gratuit sur dépôt public) ──────┴─────────────────────────┐
│ Pipeline (pipeline/), toutes les heures :                                             │
│  drive → lecture des fichiers → estimation → [accord] → IA Gemini → fiches, QCM,      │
│  annales, détection d'erreurs                                                         │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

| Dossier | Rôle |
|---|---|
| `shared/` | Logique métier pure, partagée par l'app, le serveur et le pipeline : barème, incontournables et pièges, répétition espacée, planning, prédiction de note, gamification, lecture du calendrier. |
| `src/` | Application web (React, Vite, Tailwind, Dexie pour IndexedDB, three.js pour la 3D). |
| `worker/` | Serveur Cloudflare (Hono) et base D1. |
| `pipeline/` | Import du drive et génération par l'IA, lancés par GitHub Actions. |
| `tests/` | Tests automatisés (Vitest). |
| `.github/workflows/` | Vérifications, déploiement, pipeline, réinitialisation du lien secret. |

**Stockage.** Tout enregistrement est un document JSON rangé par collection
(`shared/collections.ts`). La base D1 fait foi ; chaque appareil en garde une copie
complète dans IndexedDB. Les écritures se font d'abord en local, puis partent vers le
serveur dès que la connexion le permet ; en cas de conflit, la modification la plus
récente gagne. Tout ce qui se déduit des réponses (scores, erreurs, planning, points)
est recalculé à partir du journal des réponses, donc identique sur tous les appareils.

**Confidentialité.** Le dépôt est public, mais rien de ce qui vient du drive n'y est
écrit : le contenu vit dans la base Cloudflare, derrière le lien secret. Les journaux
GitHub Actions, publics eux aussi, ne contiennent que des compteurs (ni nom de
fichier, ni texte de cours, ni adresse de l'app).

## Règles appliquées

| Règle | Définition retenue |
|---|---|
| Barème | 0 erreur = 1 point, 1 erreur = 0,5 point, 2 erreurs ou plus = 0 point. Une erreur est une proposition cochée à tort ou oubliée, une affirmation mal jugée, un trou mal rempli. |
| Question à un seul élément | Choix simple, affirmation unique ou trou unique : une réponse fausse vaut 0 point (sinon se tromper entièrement rapporterait 0,5). |
| Incontournable | Question tombée dans 2 partiels distincts ou plus. Deux formulations proches de la même question sont fusionnées. |
| Piégeuse | Le cumul des erreurs sur toutes les tentatives atteint 2. |
| Liste d'erreurs | La question y entre à la première réponse fautive et en sort quand elle est réussie à 100 %. Une question piégeuse qui en sort reste signalée « à revoir ». |
| Scores | Par question (dernière tentative), par QCM, par chapitre, global. |
| Statut d'un chapitre | À commencer, en cours, acquis (avancement ≥ 70 % et réussite ≥ 80 %), à revoir (réussite < 50 % ou trop d'erreurs en cours). Seuils dans `shared/progression.ts`. |
| Nombre de QCM | 20 à 50 questions d'entraînement par chapitre selon la longueur du cours, annales comprises, plus 6 à 12 questions gardées en réserve pour les examens blancs. |

## Installation

Il faut un compte GitHub (celui du dépôt), un compte Cloudflare, un compte Google.
Tout se fait depuis un navigateur ; aucune installation sur l'ordinateur.

Les secrets se créent dans GitHub : dépôt → **Settings → Secrets and variables →
Actions → New repository secret**.

### 1. Cloudflare (hébergement)

1. Crée un compte gratuit sur <https://dash.cloudflare.com>.
2. Relève ton **identifiant de compte** : page d'accueil du tableau de bord, menu
   à trois points à côté du nom du compte → « Copier l'ID du compte ».
3. Crée un **jeton d'API** : icône de profil → **Mon profil → Jetons d'API → Créer
   un jeton** → modèle **« Modifier Cloudflare Workers »**. Avant de valider, ajoute
   la permission **Compte → D1 → Modifier**. Copie le jeton affiché.
4. Dans GitHub, crée deux secrets :
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant de compte ;
   - `CLOUDFLARE_API_TOKEN` : le jeton.
5. Lance le déploiement : onglet **Actions → Déploiement → Run workflow**.
   Il se relancera ensuite à chaque modification de la branche principale.
6. Récupère l'adresse de l'app : tableau de bord Cloudflare → **Workers & Pages →
   dr-rodier** (adresse en `…workers.dev`). Elle est volontairement masquée dans
   les journaux GitHub.

> Les tâches planifiées de GitHub ne tournent que sur la **branche par défaut** du
> dépôt. Si le code est sur une autre branche, fais-en la branche par défaut
> (Settings → General → Default branch) ou fusionne-la dans `main`.

### 2. Première ouverture et lien secret

1. Ouvre l'adresse de l'app. Elle propose de **créer ton lien secret**.
2. Garde ce lien (gestionnaire de mots de passe, note chiffrée). Il reste visible
   dans **Réglages → Lien secret**, avec un QR code.
3. Sur un autre appareil : ouvre le lien, ou scanne le QR code, ou colle le lien
   dans l'écran d'ouverture. Sur iPhone, une app ajoutée à l'écran d'accueil a son
   propre stockage : colle le lien une fois dans l'app installée.
4. Lien perdu ou divulgué : **Actions → Réinitialiser le lien secret → Run
   workflow**, puis rouvre l'app pour en créer un nouveau. Les données sont conservées.

Tu peux essayer l'app tout de suite avec **Réglages → Charger la démonstration**
(six chapitres fictifs, stockés sur l'appareil seulement).

### 3. Google Drive (lecture seule)

L'app se connecte avec ton compte Google et ne demande que la permission
`drive.readonly` : elle ne peut rien modifier ni supprimer.

1. Ouvre <https://console.cloud.google.com>, crée un projet (par exemple « Dr Rodier »).
2. **API et services → Bibliothèque** : cherche « Google Drive API » → **Activer**.
3. **API et services → Écran de consentement OAuth** : type **Externe**, nom de
   l'application, ton adresse e-mail. Ajoute le champ d'application
   `…/auth/drive.readonly`. Ajoute-toi comme utilisateur de test.
4. Toujours sur l'écran de consentement : **Publier l'application** (statut « En
   production »). Sans cela, l'autorisation expire au bout de 7 jours. Aucune
   validation par Google n'est nécessaire pour un usage personnel : un écran
   « application non validée » s'affichera à la connexion ; choisis « Paramètres
   avancés », puis « Accéder à Dr Rodier ».
5. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   type **Application Web**. Dans « URI de redirection autorisés », colle l'adresse
   affichée dans l'app (**Réglages → Google Drive → Adresse de redirection**), de la
   forme `https://…workers.dev/api/drive/retour`.
6. Dans GitHub, crée les secrets `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` avec
   les deux valeurs obtenues, puis relance **Actions → Déploiement**.
7. Dans l'app, **Réglages → Google Drive** : colle le lien du dossier de cours et
   celui du dossier d'annales, enregistre, puis **Connecter mon compte Google**.

Le jeton Google est conservé chiffré dans la base. Si le jeton d'API Cloudflare est
remplacé un jour, il faudra reconnecter Google (la clé de chiffrement en dépend).

### 4. Gemini (intelligence artificielle)

1. Crée une clé sur <https://aistudio.google.com/apikey>.
2. Dans GitHub, crée le secret `GEMINI_API_KEY`.

D'après les conditions de Google, les contenus envoyés avec le palier gratuit
peuvent servir à améliorer ses produits, ce qui n'est pas le cas quand la
facturation est activée. Vérifie les conditions en vigueur avant de choisir.

### 5. Premier import

1. **Actions → Import du drive → Run workflow**, mode `scan` (ou attends le passage
   automatique, toutes les heures).
2. Le pipeline lit les fichiers et calcule une **estimation de coût**, sans rien
   dépenser. Elle apparaît dans l'app, page **Mises à jour**.
3. Vérifie les tarifs utilisés (voir « Coûts »), puis **Approuver et lancer la
   génération**. Le traitement démarre au passage suivant (une heure au plus) et se
   poursuit de passage en passage s'il est long.
4. Ensuite, tout est automatique : vérification du drive chaque semaine, nouveau
   chapitre généré et signalé, fichier modifié soumis à ta validation.

Pour ne pas attendre le passage horaire après une validation, tu peux relancer
**Import du drive** à la main. Facultatif : crée un jeton GitHub « fine-grained »
limité à ce dépôt avec la permission **Actions : lecture et écriture**, et
enregistre-le dans le secret `DISPATCH_TOKEN` ; l'app déclenchera alors le pipeline
elle-même.

## Import du drive : fonctionnement

| Étape | Ce qui se passe | Coût |
|---|---|---|
| Vérification | Liste les deux dossiers et compare avec l'état connu : fichiers nouveaux, modifiés, disparus. Chaque semaine, ou à la demande. | Gratuit |
| Lecture | Télécharge les fichiers nouveaux. Word et PowerPoint sont convertis en PDF (LibreOffice), les documents Google exportés en PDF. Le texte présent dans le fichier est lu directement. | Gratuit |
| Estimation | Calcule le coût de la génération et attend ton accord. | Gratuit |
| Scans | Les pages sans texte (scans, photos) sont lues par l'IA. Un passage illisible est marqué et listé dans l'app, jamais deviné. Un texte lu incohérent est signalé. | Modèle économique |
| Classement | Matières et chapitres déduits des dossiers, des noms de fichiers et du début du texte. | Modèle économique |
| Annales | Toutes les questions, les corrigés présents, le partiel et la date. Chaque question est rattachée à son chapitre ; les questions retombées sont fusionnées. | Modèle économique |
| Corrigés manquants | Réponse établie à partir du cours, signalée dans l'app comme non officielle. | Modèle expert |
| Fiches, QCM, flashcards | Par chapitre, à partir du cours et des annales. Chaque réponse de l'IA est contrôlée (`pipeline/validation.ts`) : question sans explication, choix simple à plusieurs bonnes réponses, tableau dans une fiche… sont écartés. | Modèle économique |
| Détection d'erreurs | Corrigé faux, contradiction avec le cours, faute, incohérence, question mal classée. Chaque proposition indique le fichier, le chapitre, la question, la page, la correction exacte, l'explication et la source. | Modèle expert |

**Fichier modifié.** Notification, badge sur le chapitre, et rien d'autre tant que tu
n'as pas répondu. « Mettre à jour » relance la lecture et régénère la fiche et les QCM
du chapitre ; « Garder l'ancienne version » ignore cette modification.

**Corrections.** Une correction validée modifie les données de l'app (réponses d'une
question, classement, erratum affiché sur le chapitre). Validées ou refusées, toutes
les décisions restent dans le journal de la page Mises à jour. Une correction refusée
n'est pas reproposée.

## Coûts

**Hébergement : 0 €.** Offre gratuite de Cloudflare (Worker et base D1) et GitHub
Actions, gratuit sur un dépôt public.

**IA : selon tes fichiers.** L'estimation affichée dans l'app est calculée sur tes
fichiers réels, étape par étape, avec le coût unique de la génération complète et
une estimation mensuelle. Points à connaître :

- Le pipeline choisit à chaque passage le modèle Gemini « Flash » stable le plus
  récent pour la masse, et le modèle « Pro » pour les corrections. Tu peux imposer un
  modèle dans **Réglages → Intelligence artificielle**.
- Les tarifs par défaut (`pipeline/tarifs.ts`) sont des ordres de grandeur prudents,
  marqués « à vérifier » dans l'estimation. Pour une estimation exacte, recopie dans
  les réglages ceux de <https://ai.google.dev/gemini-api/docs/pricing>.
- **Plafond de dépense** : par défaut deux fois l'estimation approuvée (3 $ au
  minimum) par mois. Au-delà, la génération se met en pause et l'app te prévient.
  Réglable dans les réglages.

## Synchronisation du calendrier iCloud

Sens unique : Dr Rodier lit le calendrier et n'y écrit jamais.

1. Sur iPhone ou Mac, ouvre Calendrier (ou <https://www.icloud.com/calendar>).
2. Touche **Calendriers**, puis le bouton d'information (i) du calendrier à relier.
3. Active **Calendrier public**, puis **Partager le lien** et copie le lien `webcal://…`.
4. Dans l'app : **Planning → Calendrier iCloud**, colle le lien et enregistre.

Le lien est relu à chaque ouverture de l'app, à chaque retour sur l'app et toutes les
30 minutes. Toute personne qui possède ce lien peut lire ce calendrier : utilise un
calendrier dédié si tu veux limiter ce qui est visible.

- **Révision déplacée.** Un événement qui recouvre une plage de révision la décale
  dans le temps libre du créneau ; si le créneau est entièrement pris, la séance est
  déplacée vers le créneau libre le plus proche (même jour d'abord, puis les 7 jours
  suivants) et signalée comme déplacée. Les événements « journée entière » ne
  bloquent pas les révisions.
- **Examens.** Un événement dont le titre contient un mot-clé (« examen »,
  « partiel », « exam » par défaut, modifiables) est proposé comme examen. Il n'est
  ajouté qu'après ta validation, avec la matière que tu confirmes.
- **Priorités.** Chaque bloc de travail va au chapitre qui combine le plus ce qui
  n'est pas su, la fréquence aux partiels et la proximité de l'examen, avec un frein
  qui équilibre le temps entre les matières (`shared/planning.ts`).

## Développement

```bash
npm install
npm test            # tests (barème, planning, incontournables, pièges, API, pipeline…)
npm run typecheck   # vérification des types
npm run dev:api     # API locale avec base D1 locale (port 8787)
npm run dev         # interface en développement (port 5173, relaie /api)
npm run build && npm run preview   # version de production en local
```

Pour l'API locale, crée un fichier `.dev.vars` contenant
`PIPELINE_KEY=une-longue-chaine-aleatoire`.

### Tests

| Fichier | Ce qui est vérifié |
|---|---|
| `tests/bareme.test.ts` | Points selon le nombre d'erreurs, pour chaque type de question ; scores par QCM, chapitre et global. |
| `tests/marqueurs.test.ts` | Incontournables, fusion des questions récurrentes, piégeuses par cumul, liste d'erreurs, « à revoir », type d'erreur proposé. |
| `tests/planning.test.ts` | Placement des séances, déplacement en cas d'événement, priorités, équilibre entre matières, examens, recalcul. |
| `tests/repetition.test.ts` | Répétition espacée. |
| `tests/calendrier.test.ts` | Lecture d'un fichier .ics (fuseaux, récurrences, exceptions), reconnaissance des examens. |
| `tests/api.test.ts` | Lien secret, droits, synchronisation, validation des corrections et des mises à jour. |
| `tests/pipeline/` | Pipeline complet avec un faux drive et une fausse IA : estimation avant toute dépense, génération, validations, plafond, contrôle des réponses de l'IA. |

## Limites connues

- **Modèles 3D schématiques.** Les scènes sont construites à partir de formes
  simples et d'étapes animées. Elles expliquent un mécanisme ; ce ne sont pas des
  modèles anatomiques.
- **Qualité du contenu généré.** Fiches et QCM sont produits par une IA à partir de
  tes cours. Ils sont contrôlés sur la forme, pas relus par un médecin : en cas de
  doute, le cours fait foi.
- **Classement automatique.** Un fichier mal nommé peut être rangé dans le mauvais
  chapitre ; la détection d'erreurs signale les questions mal classées.
- **Délai après validation.** Sans le jeton facultatif `DISPATCH_TOKEN`, une
  validation est traitée au passage horaire suivant.
