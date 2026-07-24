/* ============================================================
   scripts/pwa.js
   PWA: service worker registration + install banner
   ============================================================ */

// ── 0. Keep .bottom-bar above whichever banner is showing ──────
// Both #install-banner and #update-banner are position:fixed; bottom:0
// (see styles/base.css) — same edge as .bottom-bar (styles/navbar.css),
// just a higher z-index, so without this they'd simply paint over the
// tab bar instead of pushing it up. Called whenever either banner's
// visibility changes; reverts the bar back to bottom:0 the moment
// neither banner is visible anymore.
function _syncBottomBarOffset() {
    const bar = document.querySelector('.bottom-bar');
    if (!bar) return;
    const visible = ['install-banner', 'update-banner']
        .map(id => document.getElementById(id))
        .filter(b => b && b.classList.contains('install-banner--visible'));
    if (!visible.length) {
        bar.style.bottom = '';
        return;
    }
    // If both were ever visible at once, the taller one wins — in
    // practice only one shows at a time (update takes priority).
    const height = Math.max.apply(null, visible.map(b => b.offsetHeight));
    bar.style.bottom = height + 'px';
}

// ── 1. Register Service Worker ────────────────────────────────
// Skipped entirely on localhost/127.0.0.1 — the whole point of this
// service worker is production caching behavior (instant repeat visits,
// controlled rollout via BUILD_TS), which actively works against rapid
// local iteration by serving stale cached JS under the same URL. Real
// deployments (delivolb.com / GitHub Pages) are unaffected — this only
// checks the hostname, nothing about the production registration path
// below changes.
const _isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator && !_isLocalDev) {
    let _swReg = null;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then(reg => {
                _swReg = reg;
                console.log('[PWA] Service worker registered ✓', reg.scope);

                // Check for updates every time the page loads
                reg.update();
            })
            .catch(err => console.warn('[PWA] SW registration failed:', err));

        // 'controllerchange' is the ONE actual reload trigger — it fires
        // exactly once when clients.claim() in sw.js's activate handler
        // hands control to the new worker. The SW also separately posts an
        // SW_UPDATED message around the same moment (see below); that used
        // to ALSO trigger its own reload, which raced with this one and
        // caused the page to visibly reload twice on every deploy. Now the
        // message is purely informational — logging only, no reload here.
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('[PWA] New version activated (reload is handled by controllerchange)');
            }
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('[PWA] New version detected — reloading for fresh files');
            window.location.reload();
        });
    });

    // ── Catch updates when the PWA is reopened without a real reload ──
    // On mobile, closing and reopening an installed PWA (or switching
    // back to it after a while) very often does NOT re-run this file at
    // all — the OS just resumes a frozen/suspended page from memory,
    // same as a backgrounded browser tab. That's the main reason "some
    // devices" only pick up a new version after a manual hard refresh:
    // the "check on load" above never re-fires because there was no
    // fresh load. Re-checking on `visibilitychange` (tab/app becomes
    // visible again) and `pageshow` with `persisted` (page restored from
    // the back/forward cache) covers both of those resume paths too.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && _swReg) _swReg.update();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted && _swReg) _swReg.update();
    });
}

// ── 2. Install banner ─────────────────────────────────────────
let _deferredPrompt = null;
const SNOOZE_KEY = 'delivo_install_snooze';

// Read by navbar.js so the center logo can double as a persistent
// install/update CTA — set true the moment each becomes actionable, and
// left true even if the corresponding banner gets snoozed/dismissed
// (unlike the nagging banner, this is a quiet, always-there affordance).
window._pwaInstallAvailable = false;
window._pwaUpdateAvailable  = false;

// Snooze: hide for 1 day if user taps ✕ (don't block for 7 days)
function isSnoozed() {
    const t = localStorage.getItem(SNOOZE_KEY);
    if (!t) return false;
    return Date.now() - parseInt(t) < 24 * 60 * 60 * 1000; // 1 day
}

// Update banner takes priority over the install prompt — if it's up when
// showBanner() is called, the install prompt just waits its turn instead
// of stacking underneath it (see _hideUpdateBanner below, which re-runs
// showBanner() once the update banner clears).
let _installPendingShow = false;
function _isUpdateBannerVisible() {
    const b = document.getElementById('update-banner');
    return !!(b && b.classList.contains('install-banner--visible'));
}

function showBanner() {
    if (isSnoozed()) return;
    if (_isUpdateBannerVisible()) { _installPendingShow = true; return; }
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.style.display = 'flex';
    setTimeout(() => { banner.classList.add('install-banner--visible'); _syncBottomBarOffset(); }, 50);
}

function hideBanner(snooze = false) {
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    if (snooze) localStorage.setItem(SNOOZE_KEY, Date.now().toString());
    banner.classList.remove('install-banner--visible');
    _syncBottomBarOffset();
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
    window._pwaInstallAvailable = true;
    window.dispatchEvent(new Event('delivo:pwa-install-available'));
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
    window._pwaInstallAvailable = false;
    hideBanner();
    localStorage.removeItem(SNOOZE_KEY);
    window.dispatchEvent(new Event('delivo:pwa-installed'));
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

    if (!isAlreadyInstalled()) {
        // No beforeinstallprompt on iOS — this is the only install signal
        // the center logo gets, so it stays on regardless of whether the
        // auto-shown bottom sheet below is snoozed.
        window._pwaInstallAvailable = true;
        window.dispatchEvent(new Event('delivo:pwa-install-available'));
        // Show the iOS bottom sheet (still subject to its own snooze)
        if (!iosHintSnoozed()) setTimeout(showIosHint, 2500);
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
// ── 6. Force-update banner — independent of the service worker ──
// Everything above (SW update detection, visibility/pageshow re-checks)
// depends on the browser's own service worker lifecycle, which — even
// with those fixes — some devices (especially installed PWAs resumed
// from a frozen background state) can still take a while to run. This
// is a second, independent layer: fetch version.json with a
// cache-busting query param (so no HTTP/CDN cache can intercept it),
// compare it to window.APP_VERSION baked into THIS page at deploy time,
// and show a banner the moment they differ — regardless of what the
// service worker has or hasn't done yet.
//
// IMPORTANT for future deploys: bump all three of these together —
//   1. BUILD_TS in sw.js
//   2. window.APP_VERSION in index.html's <head>
//   3. the "version" field in version.json
(function () {
    let _updateBannerShown = false;

    // Snooze: once dismissed or acted on, don't show again for 1 day —
    // same pattern as the install banner's SNOOZE_KEY above, just its
    // own key since these are independent prompts.
    const UPDATE_SNOOZE_KEY = 'delivo_update_snooze';
    function isUpdateSnoozed() {
        const t = localStorage.getItem(UPDATE_SNOOZE_KEY);
        if (!t) return false;
        return Date.now() - parseInt(t) < 24 * 60 * 60 * 1000; // 1 day
    }
    function snoozeUpdate() {
        localStorage.setItem(UPDATE_SNOOZE_KEY, Date.now().toString());
    }

    async function _checkForNewVersion() {
        if (_updateBannerShown) return; // already showing, no need to re-fetch
        if (isUpdateSnoozed()) return;
        try {
            const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.version && window.APP_VERSION && data.version !== window.APP_VERSION) {
                _showUpdateBanner();
            }
        } catch (_) { /* offline or blocked — just try again next cycle */ }
    }

    function _showUpdateBanner() {
        // ── Try a silent auto-apply first ──────────────────────────
        // If the customer isn't in the middle of anything (empty cart,
        // no modal or cart sidebar open), the friendliest update is the
        // invisible one: just refresh into the new version, no tap
        // needed. The banner remains the fallback for anyone mid-order.
        if (_tryAutoApplyUpdate()) return;

        _updateBannerShown = true;
        window._pwaUpdateAvailable = true;
        window.dispatchEvent(new Event('delivo:pwa-update-available'));
        // Update takes priority over the install prompt — if that one's
        // already up when this becomes ready, step in front of it. It'll
        // resume automatically once this banner clears (see below).
        const installEl = document.getElementById('install-banner');
        if (installEl && installEl.classList.contains('install-banner--visible')) {
            _installPendingShow = true;
            hideBanner(false);
        }
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.style.display = 'flex';
        setTimeout(() => { banner.classList.add('install-banner--visible'); _syncBottomBarOffset(); }, 50);
    }

    function _hideUpdateBanner(snooze = false) {
        _updateBannerShown = false;
        if (snooze) snoozeUpdate();
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.classList.remove('install-banner--visible');
        _syncBottomBarOffset();
        setTimeout(() => { banner.style.display = 'none'; }, 320);

        // The update banner was the one holding the floor — if the install
        // prompt was waiting behind it, let it show now.
        if (_installPendingShow) {
            _installPendingShow = false;
            setTimeout(() => showBanner(), 400);
        }
    }

    async function _forceUpdate() {
        const btn = document.getElementById('update-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث…'; }
        // Snooze regardless of outcome below — if the reload somehow still
        // sees a version mismatch (slow CDN propagation, offline, etc.),
        // the banner shouldn't just immediately reappear and nag again.
        snoozeUpdate();
        try {
            // Belt-and-suspenders: clear every cache this origin owns
            // directly, rather than waiting on the service worker's own
            // activate step to get around to it.
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.update().catch(() => {})));
            }
        } catch (_) { /* fall through to reload regardless */ }
        window.location.reload();
    }
    // Let the center-logo CTA in navbar.js trigger the same reload path
    // as the banner's own button — same cache-clear, same snooze.
    window._forceAppUpdate = _forceUpdate;

    document.addEventListener('click', (e) => {
        if (e.target.closest('#update-btn')) _forceUpdate();
        if (e.target.closest('#update-dismiss')) _hideUpdateBanner(true);
    });

    // Check on initial load, then keep re-checking on the same resume
    // events used for the SW update check above, plus a periodic timer
    // for tabs/PWAs that just stay open/foregrounded a long time.
    window.addEventListener('load', () => setTimeout(_checkForNewVersion, 1500));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _checkForNewVersion();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) _checkForNewVersion();
    });
    setInterval(() => {
        if (document.visibilityState === 'visible') _checkForNewVersion();
    }, 5 * 60 * 1000); // every 5 minutes while the app is open and in view

    // ── Silent auto-apply ─────────────────────────────────────────
    // Reloading into the new version without asking is only OK when it
    // can't possibly lose the customer anything:
    //   • cart is empty (nothing mid-order to interrupt — cart items
    //     themselves survive reloads via localStorage, but a reload
    //     mid-checkout or mid-form would still be jarring)
    //   • no modal and no cart sidebar open
    // A once-per-10-minutes guard prevents a reload loop when the CDN
    // is still serving the old index.html right after a deploy (reload
    // would land on the old APP_VERSION, mismatch again, reload again…).
    const AUTO_APPLY_GUARD_KEY = 'delivo_auto_update_at';
    function _autoApplyAllowed() {
        const t = parseInt(localStorage.getItem(AUTO_APPLY_GUARD_KEY) || '0', 10);
        return !t || (Date.now() - t > 10 * 60 * 1000);
    }
    function _uiIsIdle() {
        const cartCount   = window.DelivoCart ? window.DelivoCart.getCount() : 0;
        const modalOpen   = !!document.querySelector('.modal-overlay.active');
        const sidebarOpen = !!document.getElementById('cart-sidebar')?.classList.contains('active');
        return cartCount === 0 && !modalOpen && !sidebarOpen;
    }
    function _tryAutoApplyUpdate() {
        if (!_autoApplyAllowed() || !_uiIsIdle()) return false;
        localStorage.setItem(AUTO_APPLY_GUARD_KEY, Date.now().toString());
        console.log('[PWA] New version — auto-applying silently (idle UI)');
        _forceUpdate();
        return true;
    }

    // If the banner IS showing (customer was mid-something when the
    // update landed), apply it the moment they background the app —
    // a reload while hidden is completely invisible to them, and they
    // resume straight into the new version.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden'
            && _updateBannerShown
            && _uiIsIdle()
            && _autoApplyAllowed()) {
            localStorage.setItem(AUTO_APPLY_GUARD_KEY, Date.now().toString());
            _forceUpdate();
        }
    });

    // ── Push layer: RTDB appVersion stream ────────────────────────
    // The polling above means an already-open app can take up to 5
    // minutes to notice a deploy. This closes that gap to ~seconds:
    // the same Firebase SSE trick store-status-listener.js uses, on a
    // tiny appVersion node. Write the new version string there as the
    // last step of every deploy and every open site/PWA reacts
    // immediately — silently self-refreshing when idle, or showing the
    // banner when mid-order. Harmless no-op if the node doesn't exist.
    (function _versionPushStream() {
        const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
        let retryMs = 5000;
        const MAX_RETRY = 60000;

        function _handlePushedVersion(raw) {
            const v = (raw && typeof raw === 'object') ? raw.version : raw;
            if (!v || typeof v !== 'string') return;
            if (!window.APP_VERSION || v === window.APP_VERSION) return;
            // Same entry point the poller uses — auto-applies when idle,
            // banner otherwise. Bypasses the snooze deliberately: a push
            // is an explicit "update now" signal from the admin, unlike
            // the passive periodic check.
            _showUpdateBanner();
        }

        function connect() {
            let es;
            try { es = new EventSource(`${RTDB}/appVersion.json?accept=text/event-stream`); }
            catch (_) { return; } // ancient browser — polling still covers it
            es.addEventListener('put', e => {
                try { _handlePushedVersion(JSON.parse(e.data).data); retryMs = 5000; } catch (_) {}
            });
            es.addEventListener('patch', e => {
                try { _handlePushedVersion(JSON.parse(e.data).data); } catch (_) {}
            });
            es.onerror = () => {
                es.close();
                setTimeout(connect, retryMs);
                retryMs = Math.min(retryMs * 2, MAX_RETRY);
            };
        }
        connect();
    })();
})();
// ── 7. Notification permission ────────────────────────────────
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