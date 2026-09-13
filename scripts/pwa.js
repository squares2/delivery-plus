/* ============================================================
   scripts/pwa.js
   PWA: service worker registration + update banner
   ============================================================ */

// ── 0. Keep .bottom-bar above the update banner when it's showing ──
// #update-banner is position:fixed; bottom:0 (see styles/base.css) —
// same edge as .bottom-bar (styles/navbar.css), just a higher
// z-index, so without this it'd simply paint over the tab bar
// instead of pushing it up. Called whenever the banner's visibility
// changes; reverts the bar back to bottom:0 once it's hidden again.
function _syncBottomBarOffset() {
    const bar = document.querySelector('.bottom-bar');
    if (!bar) return;
    const banner = document.getElementById('update-banner');
    if (!banner || !banner.classList.contains('install-banner--visible')) {
        bar.style.bottom = '';
        return;
    }
    bar.style.bottom = banner.offsetHeight + 'px';
}

// ── 0.5 Bake this device's UUID into the install manifest ──────
// The receiving half lives at the top of firebase-init.js (the ?duid=
// adoption block); this is the giving half. While the customer is
// still in the BROWSER, rewrite the manifest's start_url to carry the
// browser's device UUID — so if they later tap "Add to Home Screen",
// the installed PWA launches with ?duid=… and adopts the same identity
// instead of minting a new one.
//
// iOS-only on purpose:
//   • iOS is where the problem exists (Safari ↔ home-screen apps have
//     fully partitioned storage). Android's installed PWA shares the
//     browser profile's storage, so the UUID already matches there —
//     and swapping in a blob: manifest on Android can break Chrome's
//     WebAPK install flow, so we don't touch it.
//   • Skipped when already running standalone — nothing to hand off.
//
// Implementation notes: a blob: manifest resolves relative URLs
// against the blob origin (i.e. breaks them), so every icon src plus
// start_url/scope is absolutized against the real origin first.
(function _injectUuidManifest() {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerading as macOS
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    if (!isIOS || isStandalone) return;

    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;

    async function inject() {
        try {
            let uuid = localStorage.getItem('delivo_device_uuid');
            if (!uuid && window.DelivoAuth?.getDeviceUUID) {
                uuid = await window.DelivoAuth.getDeviceUUID();
            }
            if (!uuid) return;

            const res = await fetch('manifest.json');
            if (!res.ok) return;
            const m = await res.json();

            m.start_url = location.origin + '/?duid=' + encodeURIComponent(uuid);
            m.scope     = location.origin + '/';
            if (Array.isArray(m.icons)) {
                m.icons = m.icons.map(ic => ({ ...ic, src: new URL(ic.src, location.href).href }));
            }

            const blob = new Blob([JSON.stringify(m)], { type: 'application/manifest+json' });
            link.href = URL.createObjectURL(blob);
            console.log('[PWA] Manifest start_url now carries this device UUID for install handoff ✓');
        } catch (_) { /* static manifest stays — worst case is today's behavior */ }
    }

    // DelivoAuth appears once firebase-init has done its thing; give it a
    // moment, then go with whatever's available (localStorage fast path
    // usually already has the UUID by then).
    if (document.readyState === 'complete') setTimeout(inject, 1200);
    else window.addEventListener('load', () => setTimeout(inject, 1200));
})();

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

    // Record BEFORE register() whether this page already had a controller.
    // clients.claim() in sw.js's activate handler fires 'controllerchange'
    // in BOTH of these cases:
    //   1. A real update — an already-installed SW is being replaced by a
    //      newer one. The page above was served from the OLD cache, so it
    //      genuinely needs the reload to pick up fresh files.
    //   2. A brand new device/first-ever visit — there was no SW at all
    //      yet, so this load already came straight from the network with
    //      the latest files. clients.claim() still "claims" this
    //      previously-uncontrolled page and still fires 'controllerchange',
    //      but there's nothing stale to replace — reloading here was pure
    //      noise, and is exactly the extra "launch, then relaunch" seen on
    //      a fresh device.
    // Only case 1 should ever trigger a reload.
    const _hadControllerBeforeRegister = !!navigator.serviceWorker.controller;

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
        // when clients.claim() in sw.js's activate handler hands control to
        // the new worker. The SW also separately posts an SW_UPDATED message
        // around the same moment (see below); that used to ALSO trigger its
        // own reload, which raced with this one and caused the page to
        // visibly reload twice on every deploy. Now the message is purely
        // informational — logging only, no reload here.
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('[PWA] New version activated (reload is handled by controllerchange)');
            }
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            if (!_hadControllerBeforeRegister) {
                // First-ever install on this device/browser — this load
                // already has the latest files, nothing to reload for.
                console.log('[PWA] First install claimed this page — no reload needed.');
                return;
            }
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

// ── 2. Install signal (nagging popup banner removed — the bottom-nav
//      center logo is the persistent, non-nagging install CTA now;
//      see navbar.js _applyLogoState/_handleLogoClick) ─────────────
let _deferredPrompt = null;

// Read by navbar.js so the center logo can double as a persistent
// install/update CTA — set true the moment each becomes actionable.
window._pwaInstallAvailable = false;
window._pwaUpdateAvailable  = false;

// Capture the install prompt — keep it alive, don't consume it on dismiss
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    window._pwaInstallAvailable = true;
    window.dispatchEvent(new Event('delivo:pwa-install-available'));
});

// Expose triggerInstall so it can be called from anywhere (e.g. the
// bottom-nav center logo, or the account page's install row)
window.triggerInstall = async function() {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    if (outcome === 'accepted') {
        _deferredPrompt = null;
    }
    // If dismissed — keep _deferredPrompt alive so user can try again
};

// Hide when installed
window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed ✓');
    _deferredPrompt = null;
    window._pwaInstallAvailable = false;
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

    // Snooze: once dismissed or acted on, don't show again for 1 day.
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