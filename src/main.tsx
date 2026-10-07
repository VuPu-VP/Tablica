import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { requestPersistence } from './db/db';
import { startAutoSync } from './sync/runner';
import '@fontsource-variable/inter';
import 'katex/dist/katex.min.css';
import './app/theme.css';

// Rejestracja Service Workera (offline). W trybie deweloperskim plugin go nie włącza.
registerSW({ immediate: true });
requestPersistence();
startAutoSync();

// Tylko w trybie deweloperskim: dostęp do bazy z konsoli przeglądarki (np. tablica.repo.listSubjects()).
if (import.meta.env.DEV) {
  Promise.all([import('./db/db'), import('./db/repo')]).then(([d, repo]) => {
    (window as unknown as Record<string, unknown>).tablica = { db: d.db, repo };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
