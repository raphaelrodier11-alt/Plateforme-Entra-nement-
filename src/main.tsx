import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './index.css';
import { initialiserTheme } from './lib/theme';

initialiserTheme();

// Service worker : met l'interface en cache pour l'usage hors connexion.
registerSW({ immediate: true });

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
