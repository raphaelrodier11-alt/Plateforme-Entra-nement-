# Dr Rodier

Plateforme personnelle de révision des cours et annales de DFGSM 3 (UPEC).
Application web en français, thème sombre, utilisable sur ordinateur, tablette et
téléphone, y compris hors connexion. Aucun compte, aucun mot de passe : l'accès se
fait par un lien secret.

## Ce que fait l'application

- **Import des cours et annales**, de deux façons qui peuvent se combiner :
  l'envoi direct de fichiers depuis l'app (page **Fichiers**, la plus simple),
  ou la connexion à un Google Drive (lecture seule, revérifié chaque semaine).
  PDF, Word, PowerPoint, texte, photos de pages. Les chapitres sont détectés et
  classés automatiquement.
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
| `worker/` | Serveur Cloudflare (Hono) et base D1, dont le dépôt de fichiers (`worker/depot.ts`). |
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

### 3. Envoyer tes fichiers (le plus simple)

Aucun compte Google à configurer. Dans l'app, page **Fichiers** :

1. Choisis **Cours** ou **Annales et corrigés**, puis **Choisir des fichiers**
   (depuis un téléphone, l'app de fichiers ou la photothèque s'ouvre).
2. Formats : PDF, Word, PowerPoint, texte, photos. 50 Mo au maximum par fichier.
3. Renvoyer un fichier du même nom le remplace : le chapitre est régénéré, sans
   validation supplémentaire puisque c'est toi qui l'as renvoyé.
4. Un conseil pour les annales : mets la matière et l'année dans le nom du fichier
   (« Cardio partiel 2024.pdf »), le classement s'en sert.

**Envoyer beaucoup de fichiers d'un coup.** Trois façons : une sélection multiple, un
dossier entier (bouton « Choisir un dossier entier », sur ordinateur et Android), ou
un **ZIP** (le plus simple : télécharge le dossier de ton Drive, qui arrive en ZIP, puis
choisis-le). Le ZIP est déplié dans l'app, fichier par fichier : les fichiers cachés et
les formats sans intérêt sont ignorés, les sous-dossiers sont conservés pour aider au
classement. Trois fichiers partent en parallèle ; ceux déjà présents sont reconnus et
sautés, donc il suffit de refaire le même choix pour reprendre un envoi interrompu.

**Comparer les versions en permanence.** Deux comparaisons, refaites automatiquement :

- onglet **Anciennes versions** : envoie l'ancienne série de cours (le « Lot de survie »).
  Chaque ancien fichier est rattaché au cours actuel qui traite du même sujet ; il ne
  produit ni fiche ni QCM, il sert seulement à montrer ce qui a changé ;
- chaque fois que tu **renvoies un cours** du même nom et du même dossier, la nouvelle
  version est comparée à celle qu'elle remplace.

Le résultat est dans l'onglet **Actualisations** du chapitre : les changements à
réapprendre (valeur, seuil, traitement, classification) d'abord, puis les détails, avec
« avant » et « maintenant ». Les chapitres actualisés portent un badge dans la liste des
cours. Un ancien fichier sans cours correspondant est gardé mais ne crée aucun chapitre.

Les fichiers sont gardés dans la base Cloudflare (jamais dans le dépôt GitHub). Le
traitement démarre au passage suivant du pipeline, toutes les heures au plus ; passe
ensuite à l'étape 5 (clé Gemini) et au premier import.

### 3 bis. Google Drive (facultatif, gratuit, lecture seule)

Utile pour surveiller automatiquement les mises à jour d'un drive partagé. Si tu n'en as
pas besoin, saute cette étape. **C'est gratuit** : créer un projet Google Cloud et activer
l'API Drive ne demande aucune carte bancaire (ne clique jamais sur « Activer la
facturation » ni sur un essai gratuit). L'app se connecte avec ton compte Google et ne
demande que la permission `drive.readonly` : elle ne peut rien modifier ni supprimer.

1. Ouvre <https://console.cloud.google.com> avec ton compte Gmail, crée un projet
   (« Dr Rodier »). Si Google propose un essai gratuit ou la facturation, ignore-le.
2. **API et services → Bibliothèque** : cherche « Google Drive API » → **Activer**.
3. **API et services → Écran de consentement OAuth** (ou « Google Auth Platform ») :
   type **Externe**, nom `Dr Rodier`, ton adresse e-mail. Ajoute la portée
   `…/auth/drive.readonly`. Ajoute ton adresse Gmail comme utilisateur test.
4. **Publier l'application** (statut « En production »). Sans cela, l'autorisation
   expire au bout de 7 jours. Aucune validation par Google n'est nécessaire pour un
   usage personnel : à la connexion, un écran « application non validée » s'affichera ;
   choisis « Paramètres avancés », puis « Accéder à Dr Rodier ».
5. **Identifiants → Créer des identifiants → ID client OAuth** : type **Application
   Web**. Dans « URI de redirection autorisés », colle l'adresse affichée dans l'app
   (**Réglages → Google Drive → Adresse de redirection**), de la forme
   `https://…workers.dev/api/drive/retour`.
6. Dans GitHub, crée les secrets `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` avec les
   deux valeurs obtenues, puis relance **Actions → Déploiement → Run workflow**.
7. Dans l'app, **Réglages → Google Drive** : colle le lien du dossier de cours, celui du
   dossier d'annales et, facultatif, celui du dossier des anciennes versions (comparées
   aux cours actuels). Enregistre, puis touche **Connecter mon compte Google**.

Le Drive et les fichiers envoyés depuis l'app (page Fichiers) peuvent s'utiliser
ensemble. Le jeton Google est conservé chiffré dans la base. Si le jeton d'API Cloudflare
est remplacé un jour, il faudra reconnecter Google (la clé de chiffrement en dépend).

### 4. Gemini (intelligence artificielle), gratuit

1. Ouvre <https://aistudio.google.com/apikey> et crée une clé (**Create API key**).
2. Dans GitHub, crée le secret `GEMINI_API_KEY` avec cette clé.

**Rien n'est facturé tant que tu n'actives pas la facturation.** Une clé créée dans
Google AI Studio sans carte bancaire relève du palier gratuit : si la limite est dépassée,
Google refuse les requêtes, il ne facture pas. Ne renseigne jamais de moyen de paiement
sur ce projet. Dr Rodier est en **mode gratuit** par défaut (Réglages → Intelligence
artificielle) : il n'utilise que le modèle gratuit, espace ses requêtes et s'arrête
tout seul quand la limite du jour est atteinte, puis reprend le lendemain.

Conséquences : un gros volume de cours se traite en plusieurs heures, voire quelques
jours ; et la détection d'erreurs utilise le même modèle que le reste, pas le modèle le
plus puissant (réservé au mode payant). D'après les conditions de Google, les contenus
envoyés avec le palier gratuit peuvent servir à améliorer ses produits : à garder en tête
pour des documents qui ne sont pas les tiens.

### 5. Premier import

1. Envoie tes fichiers (étape 3) ou connecte ton drive (étape 3 bis), puis attends le
   passage automatique (toutes les heures) ou lance **Actions → Import du drive → Run
   workflow**.
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
| Vérification | Liste les fichiers envoyés et, si un drive est connecté, ses deux dossiers, puis compare avec l'état connu : fichiers nouveaux, modifiés, disparus. Les fichiers envoyés sont pris en compte à chaque passage ; le drive, chaque semaine ou à la demande. | Gratuit |
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

## Rangement par matière

À l'import, la matière d'un fichier vient du **dossier du Drive** (`SEMESTRE n / MATIÈRE / fichiers`) : c'est fiable et sans IA, et l'IA ne peut plus la changer. Elle ne décide que pour les fichiers sans dossier de matière (à la racine, ou dans un dossier « vrac »). Les cours, annales et anciennes versions d'une même matière se retrouvent ensemble, et la page Cours les regroupe par semestre. Pour un dossier envoyé depuis l'appli, la matière n'est imposée que si le chemin contient un dossier « SEMESTRE n ».

## Suggestions de documents

L'accueil et chaque chapitre proposent des documents d'aide (QCM ciblés après des erreurs, « ce qui a changé » après une actualisation, synthèse avant un partiel, flashcards pour un nouveau chapitre, résumé d'une page pour un chapitre qui pèse lourd). Elles sont calculées dans l'appli, sans IA ni quota ; l'IA ne travaille qu'au clic sur « Créer ».

## Assistant « Dr Rodier »

Un petit médecin virtuel, accessible depuis l'onglet **Dr Rodier** :

- **Discuter** : un bot par matière (ou toutes). Il répond d'abord avec tes cours (les chapitres les plus proches de ta question, cherchés sur l'appareil dans tes fiches), puis complète avec des connaissances générales dans une partie distincte « Pour aller plus loin ». Il cite toujours les chapitres utilisés. Les conversations sont enregistrées et synchronisées.
- **Créer un document** : fiche, résumé, série de QCM, flashcards ou document libre. Une demande courte (jusqu'à 15 questions, fiche normale) est faite tout de suite. Une demande longue est mise en file : le pipeline la rédige au prochain passage (au plus une heure) et la range dans la bibliothèque.
- **Bibliothèque** : tous les documents créés, relisibles hors connexion, copiables et imprimables.

**Clé dédiée.** Le bot utilise sa propre clé Gemini (`GEMINI_CHAT_KEY`), créée dans un autre projet Google gratuit que celle de l'import (`GEMINI_API_KEY`). Les deux quotas sont ainsi séparés : le bot ne ralentit jamais l'import, et inversement. Pour l'activer : créer la clé sur aistudio.google.com/apikey, l'ajouter comme secret GitHub `GEMINI_CHAT_KEY`, puis relancer « Déploiement ».

**Apparence.** Réglages → Apparence : sombre, clair ou automatique, réglable séparément sur chaque appareil.

## Drives supplémentaires, entraînements sur mesure, PDF, cœur

- **Autres Drives** (Réglages) : ajoute autant de Drives que tu veux, avec le nom et le type (cours, annales, anciennes versions) de ton choix. Lecture seule ; la matière vient des dossiers ; les fichiers gardent le nom du Drive. Un Drive inaccessible est signalé sans bloquer le reste.
- **Entraînements** : formulaire de règles (matière, chapitres, types, cas cliniques, difficulté, nombre jusqu'à 500, pièges, chrono) et consignes libres. Les questions sont écrites en arrière-plan par le pipeline (par lots, avec le quota gratuit), utilisables au fil de l'eau, avec une notification à la fin. Elles n'entrent ni dans l'avancement des chapitres ni dans les examens blancs tant qu'elles n'ont pas été travaillées.
- **Explications d'erreurs détaillées** : proposition par proposition, avec cours et connaissances générales distingués, gardées avec la question ; « Expliquer toutes mes erreurs » dans la page Erreurs.
- **PDF** : vrai fichier A4 généré sur l'appareil, pour un chapitre ou une matière (chapitres cochés).
- **Cœur du compte à rebours** (accueil) : saisis tes dates d'examen ; le cœur 3D grossit, bat plus vite et plus fort et le sang circule plus vite à l'approche du partiel (≈ 58 bpm au loin, 122 bpm le jour J). Les autres partiels sont listés dessous.
- **Calendrier iPhone** : lecture seule (Planning → lien `webcal://` du calendrier public).
- **Passages de l'import** : tranches de 20 minutes enchaînées jusqu'à 5 h 20 ; les demandes de l'app passent en premier à chaque tranche.

## Révision, alertes et rythme

- **Planning adaptatif** : le temps se répartit ≈ 60 % points faibles / 25 % moyens / 15 % points forts, à partir de ta maîtrise réelle (ce que tu déclares, fusionné avec tes résultats).
- **Révision pure** (page Planning) : tu choisis une période et éventuellement une matière ; le planning n'y propose que du carnet « À revoir », fiches, annales, examen blanc chronométré, interro orale et flashcards, avec des cases à cocher.
- **Alerte J-7 / J-3 / J-1** : bandeau à l'ouverture avec les chapitres les plus faibles et les notions à revoir ; il se ferme jusqu'au palier suivant.
- **ECG de fond** : son rythme (55 à 130 bpm) suit ton avance ou ton retard — séances réellement faites sur 14 jours et maîtrise de la matière du prochain partiel comparée à ce qui est attendu.
- **Entraînements** : une phrase (« 20 questions de génétique, difficile, 25 minutes, chapitre 3 ») remplit le formulaire (analyse locale, gratuite) ; tu vérifies puis tu lances. La bibliothèque permet de relancer (mélangé), de refaire seulement ses erreurs, de renommer et d'épingler.
- **Cœur 3D** : modelé en code (muscle, graisse, coronaires, reflets). Il n'a pas la précision d'un modèle médical ; un fichier .glb pourra le remplacer plus tard.

## Moodle de la fac

Le pipeline lit ton Moodle en **lecture seule**, via l'API officielle et un jeton personnel (jamais ton mot de passe) :
- les fichiers de tes cours sont importés comme ceux du Drive (le semestre et la matière sont déduits du nom du cours, ex. « 2025-2026 – S5 – UE Cardiologie ») ;
- tes notifications Moodle (annonces des profs, devoirs) apparaissent dans les notifications de l'app, à chaque passage.

Configuration : dans GitHub → Settings → Secrets → Actions, ajoute `MOODLE_URL` (adresse du site, sans `/` final) et `MOODLE_TOKEN` (jeton : Moodle → Préférences → Compte utilisateur → Clés de sécurité → « Moodle mobile web service »).

## Cours : synthèse, complet, ultra complet

Chaque chapitre a trois niveaux de lecture (onglets de la page du chapitre) :
- **Fiche synthèse** : la fiche visuelle de révision (≈ 10 minutes) ;
- **Cours complet** : le cours du drive remis au propre, structuré, annoté des pièges fréquents et illustré. Il est écrit automatiquement pour chaque chapitre, après la fiche ;
- **Cours ultra complet** : beaucoup plus long (le pourquoi du comment, la physiopathologie, toutes les possibilités). Il se génère **à la demande** (bouton dans l'onglet) : il consomme beaucoup du quota gratuit, d'où la file d'attente.

Illustrations (galerie qu'on fait défiler, image par image, avec agrandissement) :
- **Figures du cours** extraites des PDF du drive (réduites en WebP ≤ 70 Ko, 16 par chapitre au maximum, logos répétés écartés) ;
- **Images libres de droits** de Wikimedia Commons (licences CC BY, CC BY-SA, CC0, domaine public), liées et jamais copiées, avec le crédit et la licence affichés. La pertinence repose sur le titre du fichier : une image peut parfois être légèrement hors sujet ;
- **Schémas dessinés par l'IA** (SVG nettoyé : aucun script ni ressource externe).

Limites : les schémas « vectoriels » d'un PDF (non importés comme images) ne sont pas extraits ; les images d'internet ne s'affichent pas hors ligne ; les images stockées pèsent dans la base gratuite (≈ 0,5 Mo par chapitre au plus).

## Partiels, emploi du temps et jour J

- **Partiel** : nom libre (« Partiel final », « CC »…), jour, horaires facultatifs et **matières au programme** (plusieurs possibles, elles peuvent différer d'un partiel à l'autre ; aucune = partiel général). Modifiable depuis la page Planning. Les horaires sont des plages bloquées : aucune séance n'y est planifiée.
- **Priorités** : une matière peut passer en priorité entre deux dates (page Planning).
- **Révisions voulues** : pour chaque matière, le nombre de passages avant le partiel. L'emploi du temps finit le programme assez tôt (2 passages : aux deux tiers du temps, 3 : à mi-parcours environ), puis alterne les révisions.
- **Jour J** : le cœur s'arrête (quelques secondes de fibrillation puis il se fige, le muscle pâlit) et l'ECG de fond fait de même : fibrillation puis ligne plate.
- **Partiel fini** : mode « bravo » pendant deux jours (accent vert, confettis une fois, message de félicitations, cœur et ECG apaisés). Le planning reprend avec le partiel suivant.

## Ajouter une matière à la main

Page Fichiers → « Ajouter une matière » : un nom et un semestre, sans lien de Drive. La matière existe tout de suite (choix des matières d'un partiel, priorités, révisions voulues). Envoie ensuite ses cours et ses annales en la choisissant dans « Matière de ces fichiers » : les fichiers sont rangés dans « SEMESTRE n / Matière / … » comme dans un Drive, et l'import en tire chapitres, fiches, QCM et cours détaillés. Le planning les intègre dès que les chapitres existent.

## Coûts

**Tout est gratuit par défaut** : Cloudflare (Worker et base D1), GitHub Actions (dépôt
public), Google Drive (lecture) et Gemini (palier gratuit, mode gratuit). Dr Rodier ne
peut rien dépenser en mode gratuit : l'estimation affiche 0 €, avec la valeur qu'aurait
la génération au tarif payant, à titre indicatif seulement.

Si un jour tu veux un traitement plus rapide ou le modèle le plus puissant, tu peux
décocher le mode gratuit (Réglages → Intelligence artificielle) et activer la facturation
chez Google. Dans ce cas seulement : l'estimation affiche un coût réel, un **plafond de
dépense** (deux fois l'estimation approuvée, 3 $ au minimum, réglable) met la génération
en pause en cas de dépassement, et les tarifs par défaut (`pipeline/tarifs.ts`) sont des
ordres de grandeur à vérifier sur <https://ai.google.dev/gemini-api/docs/pricing>.

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
- **Fichiers envoyés.** Ils passent par le serveur gratuit de Cloudflare : un fichier de
  50 Mo est découpé en 84 morceaux d'environ 600 Ko. Une connexion mobile très instable
  peut interrompre un envoi ; il suffit de renvoyer le fichier.
- **Délai après validation.** Sans le jeton facultatif `DISPATCH_TOKEN`, une
  validation est traitée au passage horaire suivant.
