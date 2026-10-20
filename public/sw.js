// Offline-Cache für die App.
// Seiten, CSS und JavaScript immer zuerst aus dem Netz (damit HTML und CSS nach einem Update zusammenpassen),
// nur ohne Verbindung aus dem Speicher. Bilder aus dem Speicher (sie bekommen bei Änderungen einen neuen Dateinamen).
const CACHE = 'balance-zeit-v9';
const ASSETS = [
  '/', '/gutschein', '/styles.css', '/app.js', '/gallery.js', '/arts.js', '/manifest.webmanifest',
  '/img/humera-namaste.webp', '/img/kraeuterstempel-massage-900.webp', '/icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den Browser-Cache, damit wirklich die neuen Dateien gespeichert werden
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const networkFirst = (req) => fetch(req).then((res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : undefined)));

const cacheFirst = (req) => caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req).then((res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Zahlungen, API, Firebase-SDK und Admin nie cachen
  if (e.request.method !== 'GET' || url.origin !== location.origin
    || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')
    || url.pathname.startsWith('/admin') || url.pathname.startsWith('/gutschein-danke')) return;

  const isImage = /\.(webp|png|jpe?g|svg)$/.test(url.pathname);
  e.respondWith(isImage ? cacheFirst(e.request) : networkFirst(e.request));
});
