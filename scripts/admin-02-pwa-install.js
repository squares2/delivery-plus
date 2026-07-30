// ── PWA install button — lets an admin install this dashboard as its
// own home-screen app (separate from the customer app, via manifest-admin.json) ──
(function() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) return;

    function isStandalone() {
        return window.navigator.standalone === true ||
               window.matchMedia('(display-mode: standalone)').matches;
    }
    function isIosSafari() {
        const ua = navigator.userAgent;
        const isIos = /iphone|ipad|ipod/i.test(ua);
        const isSafari = /safari/i.test(ua) && !/crios|fxios|opios|chromium/i.test(ua);
        return isIos && isSafari;
    }

    if (isStandalone()) return; // already installed — leave button hidden

    let _admDeferredPrompt = null;

    // Android / desktop Chrome: browser fires this when installable
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _admDeferredPrompt = e;
        btn.style.display = 'inline-flex';
    });

    // iOS Safari never fires beforeinstallprompt — show the button anyway
    // and fall back to on-screen instructions (Share ← Add to Home Screen)
    if (isIosSafari()) btn.style.display = 'inline-flex';

    window._admTriggerInstall = async function() {
        if (_admDeferredPrompt) {
            _admDeferredPrompt.prompt();
            const { outcome } = await _admDeferredPrompt.userChoice;
            console.log('[Admin PWA] Install outcome:', outcome);
            if (outcome === 'accepted') {
                _admDeferredPrompt = null;
                btn.style.display = 'none';
            }
            return;
        }
        if (isIosSafari()) {
            if (typeof toast === 'function') {
                toast('📲 لتثبيت اللوحة: افتح قائمة المشاركة ← إضافة إلى الشاشة الرئيسية');
            } else {
                alert('لتثبيت اللوحة: افتح قائمة المشاركة (Share) ثم اختر "إضافة إلى الشاشة الرئيسية"');
            }
            return;
        }
        if (typeof toast === 'function') toast('التثبيت غير متاح على هذا المتصفح حالياً');
    };

    window.addEventListener('appinstalled', () => {
        console.log('[Admin PWA] Installed ✓');
        _admDeferredPrompt = null;
        btn.style.display = 'none';
    });
})();
