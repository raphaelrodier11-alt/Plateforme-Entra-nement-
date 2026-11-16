#!/usr/bin/env bash
# Prépare, pour GitHub Actions, la clé du pipeline et l'adresse de l'app.
#
# - PIPELINE_KEY : le secret du même nom s'il existe, sinon une clé dérivée
#   du jeton Cloudflare (ainsi aucun secret supplémentaire n'est à créer).
# - APP_URL : la variable du même nom si elle existe (domaine personnalisé),
#   sinon l'adresse workers.dev du compte.
# Les deux valeurs sont masquées dans les journaux, qui sont publics.
set -euo pipefail

cle="${PIPELINE_KEY:-}"
if [ -z "$cle" ]; then
  cle=$(printf 'dr-rodier:pipeline:%s' "$CLOUDFLARE_API_TOKEN" | sha256sum | cut -d' ' -f1)
fi
echo "::add-mask::$cle"
echo "PIPELINE_KEY=$cle" >> "$GITHUB_ENV"

if [ "${1:-}" = "avec-adresse" ]; then
  url="${APP_URL:-}"
  if [ -z "$url" ]; then
    sous_domaine=$(curl -fsS \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" |
      node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).result.subdomain)')
    url="https://dr-rodier.$sous_domaine.workers.dev"
  fi
  echo "::add-mask::$url"
  echo "::add-mask::${url#https://}"
  echo "APP_URL=$url" >> "$GITHUB_ENV"
fi
