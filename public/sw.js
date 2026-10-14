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
  const opzioni = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/calendario', adesione: data.adesione || null },
  };
  // Pulsanti «Partecipo · Forse · No» (Android e computer; su iPhone non compaiono
  // e il tocco apre la scheda dell'uscita, dove ci sono gli stessi pulsanti).
  if (data.adesione?.token) {
    opzioni.actions = [
      { action: 'si', title: 'Partecipo' },
      { action: 'forse', title: 'Forse' },
      { action: 'no', title: 'No' },
    ];
  }
  event.waitUntil(self.registration.showNotification(title, opzioni));
});

const RISPOSTE_TESTO = { si: 'Partecipo', forse: 'Forse', no: 'Non partecipo' };

// Risposta dal pulsante della notifica: si registra con il link personale firmato.
async function rispondiDaNotifica(notifica, risposta) {
  const adesione = notifica.data?.adesione;
  const riserva = new URL(`/adesione?t=${encodeURIComponent(adesione.token)}&r=${risposta}`, self.location.origin).href;
  try {
    const response = await fetch(adesione.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: adesione.apikey,
        authorization: `Bearer ${adesione.apikey}`,
      },
      body: JSON.stringify({ p_token: adesione.token, p_risposta: risposta }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await self.registration.showNotification('Risposta registrata', {
      body: `${RISPOSTE_TESTO[risposta]} · ${notifica.title}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: notifica.tag || undefined,
      data: { url: notifica.data?.url || '/calendario' },
    });
  } catch {
    // Senza rete o con un errore: si apre la pagina che registra la risposta.
    await self.clients.openWindow(riserva);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (['si', 'forse', 'no'].includes(event.action) && event.notification.data?.adesione?.token) {
    event.waitUntil(rispondiDaNotifica(event.notification, event.action));
    return;
  }
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
