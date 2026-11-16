import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Les tests de dates raisonnent en heure de Paris, comme l'utilisateur.
    env: { TZ: 'Europe/Paris' },
  },
});
