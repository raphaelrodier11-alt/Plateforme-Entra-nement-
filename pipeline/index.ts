/**
 * Point d'entrée du pipeline (lancé par GitHub Actions : `npm run pipeline`).
 *
 * Variables d'environnement :
 *  - APP_URL            adresse de l'application (https://…)
 *  - PIPELINE_KEY       clé du pipeline, connue aussi du serveur
 *  - GEMINI_API_KEY     clé de l'API Gemini (nécessaire à la génération)
 *  - PIPELINE_MODE      « auto » (défaut) ou « scan » pour forcer la vérification du drive
 *  - PIPELINE_BUDGET_MIN durée maximale d'un passage, en minutes (défaut : 50)
 */
import { driveGoogle } from './drive';
import { lireFichier } from './extraction';
import { iaGemini } from './ia';
import { journal } from './journal';
import { executer, type Mode } from './orchestrateur';
import { stockageApi } from './stockage';

async function principal(): Promise<void> {
  const appUrl = process.env.APP_URL?.trim();
  const cle = process.env.PIPELINE_KEY?.trim();
  if (!appUrl || !cle) {
    // Pas encore configuré : ce n'est pas une erreur, le passage se termine.
    journal("Pipeline non configuré (adresse de l'app ou clé absente) : rien à faire");
    return;
  }
  const cleGemini = process.env.GEMINI_API_KEY?.trim();
  const mode: Mode = process.env.PIPELINE_MODE === 'scan' ? 'scan' : 'auto';

  const issue = await executer({
    stockage: stockageApi(appUrl, cle),
    creerDrive: driveGoogle,
    creerIa: cleGemini ? (options) => iaGemini({ cle: cleGemini, ...options }) : undefined,
    lire: lireFichier,
    mode,
    budgetMinutes: Number(process.env.PIPELINE_BUDGET_MIN) || 50,
  });
  journal(`Fin du passage : ${issue}`);
  if (issue === 'erreur') process.exitCode = 1;
}

principal().catch((erreur: unknown) => {
  // Le détail d'une erreur peut contenir du contenu privé : il n'est pas journalisé.
  journal(`Erreur inattendue : ${erreur instanceof Error ? erreur.name : 'inconnue'}`);
  process.exitCode = 1;
});
