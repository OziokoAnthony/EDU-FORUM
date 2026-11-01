/*
 * EDU-FORUM service worker (PWA, user 2026-11-01). Hand-written, no library:
 * - the offline page and app icons are saved at install;
 * - Next.js build files and images: cache first (their names change with every build);
 * - public pages: network first, saved copy when offline, else the offline page;
 * - the API, signed-in areas and page-data requests are never cached;
 * - push alerts: show the notification and open its link when tapped.
 */
const VERSION = 'v1';
const STATIC = `eduforum-static-${VERSION}`;
const PAGES = `eduforum-pages-${VERSION}`;
const OFFLINE = '/offline';
const PRECACHE = [OFFLINE, '/brand/icon-192.png', '/brand/badge-96.png', '/manifest.webmanifest'];
const PRIVATE = /^\/(teacher|hiring|admin|login|register|verify-email|verify-phone|forgot-password|reset-password)(\/|$)/;
const MAX_PAGES = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('eduforum-') && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    const isPrivate = PRIVATE.test(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !isPrivate) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy).then(() => trim(PAGES, MAX_PAGES)));
          }
          return res;
        })
        .catch(async () => (!isPrivate && (await caches.match(req))) || (await caches.match(OFFLINE)) || Response.error()),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'EDU-FORUM', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'EDU-FORUM', {
      body: data.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/badge-96.png',
      tag: data.tag || undefined,
      data: { link: data.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) return w.navigate(link).then((c) => (c || w).focus());
      }
      return self.clients.openWindow(link);
    }),
  );
});
