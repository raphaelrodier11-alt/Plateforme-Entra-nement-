/**
 * Prépare la configuration de déploiement Cloudflare.
 *
 * Trouve la base D1 « dr-rodier » du compte (ou la crée au premier
 * déploiement) et écrit `wrangler.deploiement.json` avec son identifiant.
 * Usage : node scripts/config-deploiement.cjs (variables CLOUDFLARE_API_TOKEN
 * et CLOUDFLARE_ACCOUNT_ID requises).
 */
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');

const NOM_BASE = 'dr-rodier';

function wrangler(...args) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function idDeLaBase() {
  const sortie = wrangler('d1', 'list', '--json');
  const bases = JSON.parse(sortie.slice(sortie.indexOf('[')));
  return bases.find((b) => b.name === NOM_BASE)?.uuid;
}

let id = idDeLaBase();
if (!id) {
  console.log('Création de la base de données (premier déploiement)');
  wrangler('d1', 'create', NOM_BASE);
  id = idDeLaBase();
}
if (!id) throw new Error('Base de données introuvable après création');

// wrangler.jsonc ne contient que des commentaires sur des lignes entières.
const source = readFileSync('wrangler.jsonc', 'utf8')
  .split('\n')
  .filter((ligne) => !ligne.trim().startsWith('//'))
  .join('\n');
const config = JSON.parse(source);
delete config.$schema;
config.d1_databases = [{ binding: 'DB', database_name: NOM_BASE, database_id: id }];
writeFileSync('wrangler.deploiement.json', JSON.stringify(config, null, 2));
console.log('Configuration de déploiement prête');
