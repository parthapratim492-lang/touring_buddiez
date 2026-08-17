/* ============================================================
   TOURING BUDDIEZ — SERVICE WORKER
   Strategy:
   - /api/* and anything under /admin — NEVER cached. This app's whole
     admin workflow depends on live data always being fresh; caching API
     responses would silently reintroduce the exact "my edits aren't
     showing" problem this site already went through once.
   - HTML pages — network-first, falling back to cache only when offline.
   - CSS/JS/images/fonts — cache-first (they're versioned by CACHE_NAME
     below, so a deploy invalidates them automatically).
   ============================================================ */

const CACHE_NAME = 'touring-buddiez-v13';

const PRECACHE_URLS = [
  '/index.html',
  '/packages.html',
  '/css/tokens.css',
  '/css/components.css',
  '/css/main.css',
  '/js/main.js',
  '/js/site-data.js',
  '/assets/logo/logo.png',
  '/assets/logo/favicon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function isNeverCache(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin');
}

function isStaticAsset(url) {
  return /\.(css|js|png|jpg|jpeg|webp|svg|woff2?|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (CDNs, WhatsApp, etc.) pass through untouched
  if (isNeverCache(url)) return; // always hit the network — no caching, no fallback

  if (isStaticAsset(url)) {
    // Cache-first: fast repeat loads, still updates in the background.
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // HTML navigations: network-first, cache fallback, offline page as last resort.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/offline.html')))
  );
});
