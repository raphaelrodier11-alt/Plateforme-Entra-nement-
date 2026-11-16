import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// L'application est une PWA : l'interface est mise en cache par un service
// worker et fonctionne hors connexion ; les données vivent dans IndexedDB.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dr Rodier',
        short_name: 'Dr Rodier',
        description: 'Révision des cours et annales de DFGSM 3',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-masque-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // L'API n'est jamais servie depuis le cache.
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4_000_000,
      },
    }),
  ],
  server: {
    // En développement, l'API tourne à part (npm run dev:api).
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { target: 'es2022' },
});
