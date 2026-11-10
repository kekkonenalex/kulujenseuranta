/* ============================================================
   Service worker: keeps the app's shell, so it opens at once and shows even on a bad connection.
   Supabase's answers are never cached: the data is always fresh, and saving needs the network.

   On every release, VERSION here and APP_VERSION in js/config.js go up together, and every file the
   app loads is in SHELL.
   ============================================================ */

const VERSION = '2.0.1';
const CACHE = `otso-expenses-v${VERSION}`;

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
  './fonts/schibsted-grotesk-600-latin.woff2',
  './fonts/schibsted-grotesk-700-latin.woff2',
  './fonts/atkinson-hyperlegible-400-latin.woff2',
  './fonts/atkinson-hyperlegible-700-latin.woff2',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/export.js',
  './js/format.js',
  './js/icons.js',
  './js/state.js',
  './js/ui-common.js',
  './js/ui-expenses.js',
  './js/ui-log.js',
  './js/ui-month.js',
  './js/ui-otso.js',
  './js/ui-settings.js',
];

// The pinned libraries (checked against their hashes by the page): kept, so the app starts during a
// short outage too.
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file mustn't stop the install.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (err) { console.warn('SW: not cached', url, err); }
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
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return; // (Supabase: straight to the network)

  // Stale-while-revalidate: answer from the cache at once, refresh it in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);
    if (cached) { network.catch(() => {}); return cached; }
    const response = await network;
    if (response) return response;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('No connection', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
