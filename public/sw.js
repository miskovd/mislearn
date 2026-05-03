const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-precache-manifest.json'
];
let currentCacheName = 'mislearn-pwa-shell';

async function getPrecacheManifest() {
  try {
    const response = await fetch('/pwa-precache-manifest.json', { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.assets)) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = await getPrecacheManifest();
      currentCacheName = manifest?.version ? `mislearn-pwa-${manifest.version}` : 'mislearn-pwa-shell';
      const cache = await caches.open(currentCacheName);
      const assets = manifest?.assets || SHELL_ASSETS;
      await cache.addAll(assets);
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key === currentCacheName) {
            return undefined;
          }

          if (!key.startsWith('mislearn-pwa-')) {
            return undefined;
          }

          return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || caches.match('/');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      });
    })
  );
});
