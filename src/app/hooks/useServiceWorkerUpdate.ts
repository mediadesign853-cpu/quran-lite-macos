import { useCallback, useEffect, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const onUpdateAvailable = () => setUpdateAvailable(true);
    const hadController = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
    let firstControllerChange = !hadController;

    const onControllerChange = () => {
      // Ignore only the first installation takeover. Later updates reload the current tab.
      if (firstControllerChange) {
        firstControllerChange = false;
        return;
      }
      window.location.reload();
    };

    window.addEventListener('quran:update-available', onUpdateAvailable);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      void navigator.serviceWorker.getRegistration()
        .then((registration) => {
          if (registration?.waiting && navigator.serviceWorker.controller) {
            onUpdateAvailable();
          }
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener('quran:update-available', onUpdateAvailable);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return;
    if (!registration.waiting) await registration.update().catch(() => undefined);
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  return { updateAvailable, applyUpdate };
}
