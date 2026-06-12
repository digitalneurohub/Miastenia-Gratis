/* MG-Sense — service worker
   Strategia: cache-first con aggiornamento in background.
   IMPORTANTE: quando aggiorni index.html, incrementa la versione qui sotto
   (v14 → v15 → …), altrimenti gli utenti continueranno a vedere la versione in cache. */
const CACHE = 'mg-sense-v15';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        // cache runtime: stessa origine + risorse opache (es. Google Fonts)
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // offline e non in cache: per le navigazioni torna alla pagina principale
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
