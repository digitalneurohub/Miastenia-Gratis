/* Horus — service worker
   1) Cache offline (cache-first per le risorse statiche della stessa origine)
   2) Web Push: riceve le notifiche inviate dalla Edge Function `send-reminders`
      e al tocco apre l'app sulla schermata giusta (?checkin=1 / ?tests=1).
   Quando aggiorni i file statici incrementa la versione qui sotto. */
const CACHE = 'horus-v2';
const ASSETS = [
  './',
  './index.html',
  './medico.html',
  './config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Solo GET della stessa origine: le chiamate a Supabase/CDN passano dirette.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
      return hit || net;
    })
  );
});

/* ---------- Web Push ---------- */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Horus';
  const opts = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'horus',
    renotify: true,
    data: { url: data.url || './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ type: 'open-url', url: target });
          return c.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
