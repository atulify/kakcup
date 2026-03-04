// Use fixed version for cache - update this when deploying
const CACHE_VERSION = '9613b7c';
const CACHE_NAME = `kak-cup-${CACHE_VERSION}`;
const STATIC_CACHE = 'kak-cup-static';

// This array is rewritten at build time by swPrecachePlugin in vite.config.ts
// with the actual hashed asset paths from the Vite manifest.
const urlsToCache = [
  '/',
  '/icon-192.png',
  '/icon-180.png'
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      // Don't call skipWaiting() here — let the client control activation
      // via SKIP_WAITING message to avoid cache mismatch with running JS
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old caches that don't match current cache name
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Ensure the new service worker takes control immediately
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Skip caching for API requests to ensure fresh data
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests (HTML pages) — network-first so new deploys take effect immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh HTML for offline use
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => {
          // Offline fallback: serve cached HTML
          return caches.match(event.request)
            .then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Static assets (JS, CSS, etc.) — cache-first with fallback
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));

            return response;
          })
          .catch(() => {
            // If a JS/CSS chunk fails to load (old hash after new deploy),
            // return the cached index.html so the app can reload cleanly
            const url = new URL(event.request.url);
            if (url.pathname.match(/\.(js|css)$/)) {
              return caches.match('/');
            }
            return new Response('', { status: 408 });
          });
      })
  );
});

// Notify clients when cache is updated
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
