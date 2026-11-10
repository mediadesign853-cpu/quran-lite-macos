import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-500.css';
import '@fontsource/vazirmatn/arabic-700.css';
import '@fontsource/vazirmatn/latin-400.css';
import '@fontsource/vazirmatn/latin-500.css';
import '@fontsource/vazirmatn/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Offline support (see public/sw.js). Only in the production build and only over http(s):
// the desktop app (app://) reads its files directly and needs no service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registration) => {
        const announceUpdate = () => {
          if (!registration.waiting) return;
          if (navigator.serviceWorker.controller) {
            window.dispatchEvent(new Event('quran:update-available'));
          } else {
            // First installation: there is no previous app version to protect, so activate now.
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        };

        announceUpdate();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') announceUpdate();
          });
        });

        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        window.addEventListener('focus', checkForUpdate);
        void registration.update().catch(() => undefined);
      })
      .catch((error) => console.warn('Service worker registration failed:', error));
  });
}
