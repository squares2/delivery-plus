/* ============================================================
   scripts/pwa.js
   PWA: service worker registration + install banner
   ============================================================ */

// ── 1. Register Service Worker ────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('[PWA] Service worker registered ✓', reg.scope);

                // Check for updates every time the page loads
                reg.update();
            })
            .catch(err => console.warn('[PWA] SW registration failed:', err));

        // Listen for SW_UPDATED message → reload page silently to get fresh files
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('[PWA] New version detected — reloading for fresh files');
                // Small delay so the SW fully activates before reload
                setTimeout(() => window.location.reload(), 500);
            }
        });

        // Also handle controller change (new SW took control)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    });
}

// ── 2. Install banner ─────────────────────────────────────────
let _deferredPrompt = null;
const SNOOZE_KEY = 'delivo_install_snooze';

// Snooze: hide for 1 day if user taps ✕ (don't block for 7 days)
function isSnoozed() {
    const t = localStorage.getItem(SNOOZE_KEY);
    if (!t) return false;
    return Date.now() - parseInt(t) < 24 * 60 * 60 * 1000; // 1 day
}

function showBanner() {
    if (isSnoozed()) return;
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.style.display = 'flex';
    setTimeout(() => banner.classList.add('install-banner--visible'), 50);
}

function hideBanner(snooze = false) {
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    if (snooze) localStorage.setItem(SNOOZE_KEY, Date.now().toString());
    banner.classList.remove('install-banner--visible');
    setTimeout(() => { banner.style.display = 'none'; }, 320);
}

// ── Dev helper: force show banner (call in console: showInstallBanner()) ──
window.showInstallBanner = function() {
    localStorage.removeItem(SNOOZE_KEY);
    showBanner();
};

// Capture the install prompt — keep it alive, don't consume it on dismiss
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    setTimeout(showBanner, 2500);
});

// Expose triggerInstall so it can be called from anywhere (e.g. app-download section)
window.triggerInstall = async function() {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    if (outcome === 'accepted') {
        _deferredPrompt = null;
        hideBanner();
    }
    // If dismissed — keep _deferredPrompt alive so user can try again
};

document.addEventListener('click', async (e) => {
    // Install button
    if (e.target.closest('#install-btn')) {
        await window.triggerInstall();
        return;
    }
    // Dismiss — just snooze 1 day, don't consume the prompt
    if (e.target.closest('#install-dismiss')) {
        hideBanner(true); // snooze = true
        return;
    }
});

// Hide when installed
window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed ✓');
    _deferredPrompt = null;
    hideBanner();
    localStorage.removeItem(SNOOZE_KEY);
});

// ── 3. iOS "Add to Home Screen" — bottom sheet ───────────────
const IOS_HINT_KEY = 'delivo_ios_hint_dismissed';

function isIosSafari() {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|opios|chromium/i.test(ua);
    return isIos && isSafari;
}

function isAlreadyInstalled() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
}

function iosHintSnoozed() {
    const t = localStorage.getItem(IOS_HINT_KEY);
    if (!t) return false;
    return Date.now() - parseInt(t) < 24 * 60 * 60 * 1000; // 1 day snooze
}

function showIosHint() {
    const hint = document.getElementById('ios-hint');
    if (!hint) return;
    hint.style.display = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => hint.classList.add('ios-hint--visible'));
    });
}

function hideIosHint(snooze = false) {
    const hint = document.getElementById('ios-hint');
    if (!hint) return;
    if (snooze) localStorage.setItem(IOS_HINT_KEY, Date.now().toString());
    hint.classList.remove('ios-hint--visible');
    setTimeout(() => { hint.style.display = 'none'; }, 340);
}

// Wire close + got-it + backdrop
document.addEventListener('click', (e) => {
    if (e.target.closest('#ios-hint-close'))  { hideIosHint(true);  return; }
    if (e.target.closest('#ios-hint-got-it')) { hideIosHint(true);  return; }
    if (e.target.id === 'ios-hint-backdrop')  { hideIosHint(false); return; }
});

if (isIosSafari()) {
    // Hide the Android install banner — it does nothing on iOS
    const androidBanner = document.getElementById('install-banner');
    if (androidBanner) androidBanner.style.display = 'none';

    // Show the iOS bottom sheet
    if (!isAlreadyInstalled() && !iosHintSnoozed()) {
        setTimeout(showIosHint, 2500);
    }
}

// Dev helper — run in Safari console to re-test: showIosInstallHint()
window.showIosInstallHint = function() {
    localStorage.removeItem(IOS_HINT_KEY);
    showIosHint();
};
// ── 4. PWA install row in account modal ──────────────────────

function _isPwaInstalled() {
    return window.navigator.standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches;
}

function _updatePwaRow() {
    const btn      = document.getElementById('acct-pwa-btn');
    const title    = document.getElementById('acct-pwa-title');
    const sub      = document.getElementById('acct-pwa-sub');
    const badge    = document.getElementById('acct-pwa-badge');
    const chevron  = document.getElementById('acct-pwa-chevron');
    if (!btn) return;

    const installed = _isPwaInstalled();

    if (installed) {
        title.textContent   = 'التطبيق مثبّت ✓';
        sub.textContent     = 'أنت تستخدم نسخة الشاشة الرئيسية';
        badge.style.display = 'inline-flex';
        chevron.style.display = 'none';
        btn.style.cursor    = 'default';
        btn.style.opacity   = '0.75';
        btn.disabled        = true;
    } else {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        title.textContent    = 'تثبيت التطبيق';
        sub.textContent      = isIos
            ? 'Safari ← المشاركة ← إضافة للشاشة'
            : 'أضف Delivo لشاشتك الرئيسية';
        badge.style.display  = 'none';
        chevron.style.display = '';
        btn.style.cursor     = 'pointer';
        btn.style.opacity    = '1';
        btn.disabled         = false;
    }
}

// Wire click on the PWA row
document.addEventListener('click', async (e) => {
    if (!e.target.closest('#acct-pwa-btn')) return;
    if (_isPwaInstalled()) return; // already installed, row is disabled

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
                  /safari/i.test(navigator.userAgent) &&
                  !/crios|fxios/i.test(navigator.userAgent);

    if (isIos) {
        // Close account modal then show iOS bottom sheet
        if (typeof closeModal === 'function') closeModal('modal-account');
        setTimeout(() => {
            localStorage.removeItem(IOS_HINT_KEY);
            showIosHint();
        }, 300);
    } else if (_deferredPrompt) {
        // Android / desktop Chrome — trigger native prompt
        _deferredPrompt.prompt();
        const { outcome } = await _deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            _deferredPrompt = null;
            hideBanner();
            _updatePwaRow();
        }
    } else {
        // No prompt available (already dismissed system prompt) — show instructions
        const isIosAny = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isIosAny) {
            if (typeof closeModal === 'function') closeModal('modal-account');
            setTimeout(() => { localStorage.removeItem(IOS_HINT_KEY); showIosHint(); }, 300);
        }
    }
});

// Update row every time account modal opens
document.addEventListener('modalOpen', (e) => {
    if (e.detail === 'modal-account') _updatePwaRow();
});

// Also update when app is installed (Android)
window.addEventListener('appinstalled', () => {
    _updatePwaRow();
});

// Initial update on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _updatePwaRow);
} else {
    _updatePwaRow();
}

// ── 5. iOS slim top banner (one-line, auto-dismisses) ────────
const IOS_TOP_KEY = 'delivo_ios_top_seen';

function _showIosTopBanner() {
    const el = document.getElementById('ios-top-banner');
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() =>
        requestAnimationFrame(() => el.classList.add('ios-top-banner--visible'))
    );
    // Auto-dismiss after 7 seconds
    setTimeout(() => _hideIosTopBanner(true), 7000);
}

function _hideIosTopBanner(snooze) {
    const el = document.getElementById('ios-top-banner');
    if (!el) return;
    if (snooze) localStorage.setItem(IOS_TOP_KEY, '1');
    el.classList.remove('ios-top-banner--visible');
    setTimeout(() => { el.style.display = 'none'; }, 400);
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#ios-top-banner-close')) _hideIosTopBanner(true);
});

// Show only on iOS Safari, not installed, and only once ever
if (isIosSafari() && !isAlreadyInstalled() &&
    !localStorage.getItem(IOS_TOP_KEY)) {
    // Wait for splash to clear before sliding in
    setTimeout(_showIosTopBanner, 1800);
}
// ── 6. Notification permission ────────────────────────────────
// Request gently after the page settles (only if not already decided)
// We defer to avoid blocking page load and only show after user has
// had a chance to interact with the page.
(function() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return; // already granted or denied

    // Wait for first meaningful user interaction, then ask
    const _askOnce = () => {
        if (Notification.permission !== 'default') return;
        // Small delay so modal/UI doesn't clash
        setTimeout(() => {
            if (typeof window._requestNotifPermission === 'function') {
                window._requestNotifPermission();
            } else {
                Notification.requestPermission().catch(() => {});
            }
        }, 800);
        document.removeEventListener('click', _askOnce);
    };

    // Ask after first click (most permissive browsers require gesture)
    document.addEventListener('click', _askOnce, { once: true });
})();