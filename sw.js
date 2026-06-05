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
const BUILD_TS    = '20260605233045';   // replaced at deploy time
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
    './scripts/cart.js',
    './scripts/pwa.js',
    './assets/splash-logo.png',
    './assets/logo.png',
    './assets/hero_temple_bg.jpg',
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
   This means scripts/CSS always come fresh from network
   and fall back to cache only when offline.
══════════════════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

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
                }).catch(() => cached);
            })
        );
    } else {
        /* Network-first for HTML, CSS, JS, JSON — always fresh */
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
    }
});