/*
 * Service worker: makes the app work offline.
 *
 * All app files are cached on install. Requests are answered from the cache
 * immediately and refreshed in the background (stale-while-revalidate), so a
 * new deployment is picked up on the next start without bumping versions.
 */
const CACHE = 'offiziersskat-v1';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/engine.js',
  './js/ai.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Ignore query strings so e.g. "/?source=pwa" still hits the cached page.
      const cached = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      const res = await refresh;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    }),
  );
});
