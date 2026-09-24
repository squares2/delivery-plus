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
