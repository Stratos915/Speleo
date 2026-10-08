// Service worker minimo: rende l'app installabile e veloce da riaprire.
// - I file statici con hash (/assets/...) e le icone vengono messi in cache.
// - Le pagine si chiedono sempre prima alla rete (così ogni aggiornamento arriva subito);
//   senza rete si apre l'ultima versione salvata.
// - Le chiamate a Supabase NON vengono mai salvate: i dati sono sempre quelli reali.
const CACHE = 'gsu-app-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? new Response(
          '<meta charset="utf-8"><p style="font-family:sans-serif;padding:2rem">Sei offline. Riapri l\'app quando torna la connessione.</p>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// ---------------------------------------------------------------------------
// Notifiche push (avvisi nuove uscite). Le invia il job notification-cron.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'GSU · Gestionale';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/calendario' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/calendario', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const aperta = clients.find((client) => client.url.startsWith(self.location.origin));
      if (aperta) {
        aperta.focus();
        return aperta.navigate(url);
      }
      return self.clients.openWindow(url);
    }),
  );
});
