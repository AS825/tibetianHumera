// Offline-Cache: Seiten zuerst aus dem Netz (damit Änderungen sofort sichtbar sind), Dateien aus dem Cache.
const CACHE = 'balance-zeit-v7';
const ASSETS = [
  '/', '/gutschein', '/styles.css', '/app.js', '/gallery.js', '/manifest.webmanifest',
  '/img/humera-namaste.webp', '/img/kraeuterstempel-massage-900.webp', '/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Zahlungen, API, Firebase-SDK und Admin nie cachen
  if (e.request.method !== 'GET' || url.origin !== location.origin
    || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')
    || url.pathname.startsWith('/admin') || url.pathname.startsWith('/gutschein-danke')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
