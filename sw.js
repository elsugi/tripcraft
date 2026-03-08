// TripCraft Service Worker – offline-first caching
const CACHE_NAME = 'tripcraft-v4';
const MAP_TILE_CACHE = 'tripcraft-maptiles-v4';

const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http') || url.includes('unpkg') || url.includes('fonts')))
        .catch(() => {}); // Non-fatal if some external assets fail
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== MAP_TILE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Map tiles – cache aggressively
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(MAP_TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // index.html – network-first so updates deploy immediately,
  // falls back to cache when offline
  if (url.includes('/index.html') || url.endsWith('/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Other static assets (manifest, fonts, leaflet) – cache-first
  if (url.includes('/manifest.json') || url.includes('unpkg.com') || url.includes('fonts.googleapis')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
