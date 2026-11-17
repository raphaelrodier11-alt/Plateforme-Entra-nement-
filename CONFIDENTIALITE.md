# Règles de confidentialité de Dr Rodier

Dr Rodier est une application personnelle de révision, utilisée par une seule personne : son propriétaire. Elle n'est pas proposée au public.

## Données Google utilisées

- L'application demande l'accès **en lecture seule** à Google Drive (portée `drive.readonly`), uniquement pour lire les dossiers de cours et d'annales que le propriétaire a indiqués.
- Elle ne modifie, ne supprime et ne crée aucun fichier dans Google Drive.
- Le jeton d'accès fourni par Google est conservé **chiffré** sur le serveur personnel du propriétaire (Cloudflare). Il n'est jamais affiché ni partagé.

## Ce qui est fait de ces données

- Le contenu des fichiers lus est traité par le serveur personnel du propriétaire pour produire des fiches, des questions d'entraînement et des comparaisons de versions.
- Pour cela, des extraits de ces contenus sont envoyés à l'API Gemini de Google. Ils ne sont transmis à aucun autre service.
- Les données ne sont ni vendues, ni partagées avec des tiers, ni utilisées pour de la publicité.
- L'utilisation et le transfert à toute autre application des informations reçues des API Google respecteront la [politique de données utilisateur des services API Google](https://developers.google.com/terms/api-services-user-data-policy), y compris les exigences d'utilisation limitée.

## Supprimer l'accès

L'accès peut être retiré à tout moment : dans l'application (Réglages, « Déconnecter Google »), ou depuis le compte Google (https://myaccount.google.com/permissions). Le jeton conservé est alors supprimé et révoqué.

## Contact

Propriétaire de l'application : voir le profil du dépôt GitHub `raphaelrodier11-alt`.
