/* ═══════════════════════════════════════════════════════════════
   IMAGE HOST — single place that decides where content images load from.
   Why: inside the Play Store app (Capacitor), relative paths like
   "items2/123.webp" resolve to the copy frozen inside the APK, so any
   image uploaded later (items, hero backgrounds, promo cards, store
   logos) would never show. Building every content-image link from
   DELIVO_IMG_BASE makes the app and the website load the SAME live files.
   Logo, icons, favicon and splash images deliberately stay local so
   they still show offline.
   Named delivoImg / DELIVO_IMG_BASE so it can't clash with any other
   global name used by the Android app build.
   Must load BEFORE every other script (it's placed in <head>).
   To move images to another domain later, change DELIVO_IMG_BASE only.
═══════════════════════════════════════════════════════════════ */
(function () {
    var DELIVO_IMG_BASE = 'https://delivolb.com/';

    function delivoImg(path) {
        if (!path) return '';
        path = String(path);
        // Already a full link (or a local upload preview) — leave it alone
        if (/^(https?:|data:|blob:|\/\/)/i.test(path)) return path;
        return DELIVO_IMG_BASE + path.replace(/^\.?\/+/, '');
    }

    window.DELIVO_IMG_BASE = DELIVO_IMG_BASE;
    window.delivoImg       = delivoImg;
})();

/* ═══════════════════════════════════════════════════════════════
   SHARED CATALOG FETCH (BANDWIDTH FIX)
   The customer page used to download the full /pattern.json (all
   stores) separately in stores.js (x2), categories.js, mealtime.js
   and cart.js (x2) — up to 6 full copies per visit. They now all go
   through DelivoPattern.get(): one network download, reused for 2
   minutes. Every caller gets its own fresh copy (parsed from the
   cached text), so no caller can accidentally change another's data.
   Lives here because this file loads first on every page.
═══════════════════════════════════════════════════════════════ */
(function () {
    var URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com/pattern.json';
    var TTL = 2 * 60 * 1000;
    var text = null, at = 0, pending = null;

    function get() {
        if (text !== null && (Date.now() - at) < TTL) return Promise.resolve(JSON.parse(text));
        if (!pending) {
            pending = fetch(URL)
                .then(function (r) {
                    if (!r.ok) throw new Error('pattern ' + r.status);
                    return r.text();
                })
                .then(function (t) { text = t; at = Date.now(); pending = null; return t; },
                      function (e) { pending = null; throw e; });
        }
        return pending.then(function (t) { return JSON.parse(t); });
    }

    // Lets a live stream that already has the full catalog refresh the cache.
    function prime(data) {
        try { text = JSON.stringify(data === undefined ? null : data); at = Date.now(); } catch (_) {}
    }

    window.DelivoPattern = { get: get, prime: prime };
})();
