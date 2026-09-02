/* ============================================================
   Service worker: cachettaa sovelluksen kuoren, jotta sovellus
   avautuu nopeasti ja nakyy myos huonolla yhteydella.

   HUOM: Supabase-API-kutsuja ei cacheta koskaan - data on aina
   tuoretta ja v1 vaatii verkon tallentamiseen.
   ============================================================ */

const VERSION = '1.2.0';
const CACHE = `kulut-shell-v${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/export.js',
  './js/format.js',
  './js/state.js',
  './js/ui-auth.js',
  './js/ui-budget.js',
  './js/ui-categories.js',
  './js/ui-common.js',
  './js/ui-entry.js',
  './js/ui-summary.js',
  './js/ui-transactions.js',
];

// Kirjastot CDN:sta - cachetetaan jotta sovellus kaynnistyy myos
// hetkellisen katkon aikana.
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Yksi puuttuva tiedosto ei saa kaataa koko asennusta.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('SW: ei saatu cacheen', url, err); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);

  if (!sameOrigin && !isCdn) return; // esim. Supabase -> suoraan verkkoon

  // Stale-while-revalidate: vastaa cachesta heti ja paivita taustalla.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);

    const network = fetch(request).then((response) => {
      if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) {
      network.catch(() => {});
      return cached;
    }

    const response = await network;
    if (response) return response;

    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Ei verkkoyhteyttä', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
