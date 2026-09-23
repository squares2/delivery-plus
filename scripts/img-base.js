/* ═══════════════════════════════════════════════════════════════
   IMAGE HOST — single place that decides where content images load from.
   Why: inside the Play Store app (Capacitor), relative paths like
   "items2/123.webp" resolve to the copy frozen inside the APK, so any
   image uploaded later (items, hero backgrounds, promo cards, store
   logos) would never show. Building every content-image link from
   IMG_BASE makes the app and the website load the SAME live files.
   Logo, icons, favicon and splash images deliberately stay local so
   they still show offline.
   Must load BEFORE every other script (it's placed in <head>).
   To move images to another domain later, change IMG_BASE only.
═══════════════════════════════════════════════════════════════ */
(function () {
    var IMG_BASE = 'https://delivolb.com/';

    function imgUrl(path) {
        if (!path) return '';
        path = String(path);
        // Already a full link (or a local upload preview) — leave it alone
        if (/^(https?:|data:|blob:|\/\/)/i.test(path)) return path;
        return IMG_BASE + path.replace(/^\.?\/+/, '');
    }

    window.IMG_BASE = IMG_BASE;
    window.imgUrl   = imgUrl;
})();
