/* Wissensarchiv – Service Worker
 * Cacht die App-Shell und die lokal mitgelieferten Bibliotheken (/vendor),
 * damit die App nach dem ersten Start vollständig offline läuft.
 * Strategie: cache-first für gleiche Origin, mit Laufzeit-Caching neuer Dateien
 * (z. B. vendor-Libs, die in späteren Etappen dazukommen). */

const VERSION = 'wa-v1';
const CACHE = `wissensarchiv-${VERSION}`;

// Kern der App-Shell, der beim Installieren fest vorgeladen wird.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Einzeln hinzufügen, damit ein fehlendes optionales Asset die Installation nicht abbricht.
      await Promise.allSettled(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('wissensarchiv-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // externe Requests (z. B. Claude API) nicht abfangen

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: false });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Erfolgreiche, cachebare Antworten für Offline-Nutzung ablegen (vendor-Libs etc.).
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        // Offline und nicht im Cache: für Navigationsanfragen die App-Shell liefern.
        if (req.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
