/* ============================================================
   sw.js — Delivo Service Worker
   AUTO-VERSIONING: cache key includes build timestamp so every
   new deployment automatically busts the old cache.
   No more manual version bumping needed.
   ============================================================ */

/* ── Auto-generated on each deploy ───────────────────────────
   Replace BUILD_TIMESTAMP with your deploy script, or just
   change this number whenever you upload new files.
   Even changing it by 1 is enough to bust all caches.        */
const BUILD_TS    = '20260724173000';   // replaced by deploy.bat at deploy time
const CACHE_NAME  = `delivo-${BUILD_TS}`;

/* ── Assets to pre-cache on install ──────────────────────────
   Keep this list SHORT — only the shell needed to render
   the first frame. Everything else loads on demand.          */
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './styles/base.css',
    './styles/navbar.css',
    './styles/hero.css',
    './styles/cards.css',
    './styles/modals.css',
    './styles/store-panel.css',
    './styles/cart.css',
    './styles/footer.css',
    './scripts/loader.js',
    './scripts/navbar.js',
    './scripts/firebase-init.js',
    './scripts/modal-auth.js',
    './scripts/modals.js',
    './scripts/stores.js',
    './scripts/categories.js',
    './scripts/store-panel.js',
    './scripts/mealtime.js',
    './scripts/cart.js',
    './scripts/pwa.js',
    './scripts/back-handler.js',
    './scripts/onboarding.js',
    './scripts/presence.js',
    './assets/splash-logo.webp',
    './assets/logo.png',
    './assets/hero-bg2.webp',
];

/* ══════════════════════════════════════════════════════════
   INSTALL — cache core assets
══════════════════════════════════════════════════════════ */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(
                PRECACHE.map(url =>
                    cache.add(url).catch(e =>
                        console.warn('[SW] Could not precache:', url, e.message)
                    )
                )
            ))
            .then(() => self.skipWaiting())   // activate immediately, don't wait for old tabs
    );
});

/* ══════════════════════════════════════════════════════════
   ACTIVATE — wipe ALL old caches, claim all tabs instantly
══════════════════════════════════════════════════════════ */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)   // delete everything except current
                    .map(k => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim())   // take control of all open tabs NOW
            .then(() => {
                // Tell all open tabs to reload so they get fresh files
                return self.clients.matchAll({ type: 'window' }).then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'SW_UPDATED' });
                    });
                });
            })
    );
});

/* ══════════════════════════════════════════════════════════
   FETCH — Network-first for everything except images
   This means scripts/CSS respond instantly from cache when available,
   while a background fetch refreshes the cache for next time. Actual
   freshness on deploy comes from bumping CACHE_NAME above (see ACTIVATE,
   which wipes old caches and reloads all open tabs) — not from forcing
   a network round-trip on every single request.
══════════════════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    /* version.json is the force-update check's whole reason for
       existing (see scripts/pwa.js § 6) — it must always hit the
       network fresh, never served from or written into any SW cache. */
    if (url.pathname.endsWith('/version.json')) return;

    /* Always bypass SW for these — let browser handle directly */
    const bypass = [
        'googleapis.com', 'gstatic.com', 'firebaseio.com',
        'firebaseapp.com', 'firebase.com', 'google.com',
        'unpkg.com', 'cdnjs.cloudflare.com', 'raw.githubusercontent.com',
        'leafletjs.com', 'openstreetmap.org',
    ];
    if (bypass.some(h => url.hostname.includes(h))) return;

    const ext = url.pathname.split('.').pop().toLowerCase();
    const isImage = ['png','jpg','jpeg','gif','webp','svg','ico'].includes(ext);
    const isNavigation = event.request.mode === 'navigate';

    /* Last-resort fallback so respondWith() NEVER resolves to undefined.
       Every branch below used to end a failed fetch with `.catch(() =>
       cached)` — fine when something was cached, but if `cached` was also
       undefined (nothing cached yet + network unreachable), respondWith()
       received `undefined` instead of a Response, which the browser treats
       as a hard failure of that request. For a navigation request (the
       PWA's start_url), a handful of those in a row is exactly what makes
       Android mark an already-installed app as broken and show "There was
       a problem" / repeatedly-occurred instead of the page — and it won't
       retry on its own until the user clears the app's storage or
       reinstalls. A tiny inline page beats that hard failure. */
    const OFFLINE_FALLBACK = () => new Response(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delivo</title></head><body style="margin:0;height:100vh;display:flex;
align-items:center;justify-content:center;background:#FF5C00;color:#fff;
font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;">
<div><p style="font-size:18px;margin:0 0 16px;">تعذّر الاتصال بالإنترنت</p>
<p style="font-size:14px;opacity:0.85;margin:0;">تحقق من الشبكة وحاول مجددًا</p>
</div></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );

    if (isImage) {
        /* Cache-first for images — they rarely change */
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return res;
                }).catch(() => cached || new Response('', { status: 404 }));
            })
        );
    } else {
        /* Stale-while-revalidate for HTML, CSS, JS, JSON — respond from
           cache instantly if we have it (huge win on slow connections),
           then quietly refresh the cache in the background for next time.
           Falls back to waiting on the network only when there's nothing
           cached yet (first visit). */
        event.respondWith(
            caches.match(event.request).then(cached => {
                const networkFetch = fetch(event.request).then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return res;
                }).catch(async () => {
                    if (cached) return cached;
                    // Nothing cached for this exact URL either — for a page
                    // load, fall back to the precached app shell rather than
                    // giving up outright.
                    if (isNavigation) {
                        const shell = await caches.match('./index.html');
                        if (shell) return shell;
                    }
                    return OFFLINE_FALLBACK();
                });

                // Keep the SW alive long enough for the background refresh
                // to finish even after we've already responded from cache.
                event.waitUntil(networkFetch);

                return cached || networkFetch;
            })
        );
    }
});

/* ══════════════════════════════════════════════════════════
   PUSH — background notifications (Firebase Cloud Messaging)
   This is the piece that makes notifications work even when
   NO Delivo tab/app is open at all — the OS wakes the service
   worker up in the background to run this handler.
══════════════════════════════════════════════════════════ */
self.addEventListener('push', event => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (_) {}

    const title = payload.notification?.title || payload.data?.title || 'Delivo';
    const body  = payload.notification?.body  || payload.data?.body  || '';
    const data  = payload.data || {};

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon:  './assets/logo.png',
            badge: './assets/logo.png',
            data,
            tag: data.tag || undefined,  // same tag replaces the older notification instead of stacking
        })
    );
});

// Clicking the notification focuses an already-open Delivo tab if one
// exists, otherwise opens a fresh one at the page the notification is for
// (e.g. driver.html for a new-order push, admin.html for an employee alert).
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || './';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(targetUrl.replace('./', '')) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});