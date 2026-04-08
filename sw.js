// sw.js — LehrerPlaner Service Worker (cache-first, full offline)
const CACHE = 'lehrerplaner-v14';
const BASE  = '/';

// All local app files — must be cached for full offline support
const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/db.js',
  '/pin.js',
  '/config.js',
  '/gcal.js',
  '/students.js',
  '/style.css',
  '/manifest.json',
  '/icon.svg',
  '/datenschutz.html',
];

// CDN assets — cached opportunistically; failures are non-fatal
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install', e => {
  console.log('[SW] Installing cache:', CACHE);
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      // Local files: cache individually so one failure doesn't block the rest
      const localResults = await Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url)
            .then(() => console.log('[SW] Cached:', url))
            .catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        )
      );

      // CDN files: best-effort
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          cache.add(url)
            .then(() => console.log('[SW] Cached CDN:', url))
            .catch(err => console.warn('[SW] CDN cache skipped:', url, err.message))
        )
      );

      const ok = localResults.filter(r => r.status === 'fulfilled').length;
      console.log(`[SW] Install done: ${ok}/${LOCAL_ASSETS.length} local files cached`);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating, removing old caches');
  e.waitUntil(
    caches.keys().then(keys => {
      const stale = keys.filter(k => k !== CACHE);
      if (stale.length) console.log('[SW] Deleting stale caches:', stale);
      return Promise.all(stale.map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Cache valid, non-opaque responses only
        if (response && response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(err => {
        console.warn('[SW] Fetch failed (offline?):', e.request.url, err.message);
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Status ping from app
self.addEventListener('message', e => {
  if (e.data === 'ping' && e.source) {
    try { e.source.postMessage({ type: 'pong', cache: CACHE }); }
    catch (_) { /* client gone — ignore */ }
  }
});
