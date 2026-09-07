/* ============================================================
   scripts/loader.js  v2
   1. Loads dynamic HTML components
   2. Inits all feature scripts
   3. Dismisses the splash screen — with extended duration for PWA
   ============================================================ */

/* ── Detect launch context ───────────────────────────────────
   isPWA = launched from home screen (standalone / fullscreen)
   In PWA mode we hold the JS splash longer so the OS splash
   (low-res) transitions directly into our HD splash, with no
   visible flash of the main page in between.
   ──────────────────────────────────────────────────────────── */
const _isPWA = window.matchMedia('(display-mode: standalone)').matches ||
               window.matchMedia('(display-mode: fullscreen)').matches ||
               window.navigator.standalone === true;

/* ── Adaptive splash hold ─────────────────────────────────────
   First-ever visit: keep the full cinematic splash so the brand
   intro actually lands. Every visit after that, the customer has
   already seen it — holding the same 2-2.8s again just delays
   getting to the store list, so cut it down to a quick beat. */
const _SPLASH_SEEN_KEY = 'delivo_seen_splash';
const _isReturningVisitor = !!localStorage.getItem(_SPLASH_SEEN_KEY);

/* How long to keep the HD splash visible after everything is ready */
const SPLASH_HOLD_MS = _isReturningVisitor
    ? (_isPWA ? 900  : 600)
    : (_isPWA ? 2800 : 2000);

/* ── Ensure the splash is visible from the very first paint ──
   body starts as visibility:hidden (base.css).
   We make the splash itself visible immediately so there is
   zero gap between OS splash → JS splash.                    */
(function () {
    const splash = document.getElementById('delivo-splash');
    if (splash) {
        splash.style.opacity    = '1';
        splash.style.visibility = 'visible';
    }
})();

/* ── Component loader ────────────────────────────────────────*/
async function loadComponent(slotId, file) {
    try {
        // Was `?v=${Date.now()}` — that busted the cache on EVERY
        // visit (browser cache AND the service worker's precache),
        // forcing 5 uncacheable round-trips before the page could
        // even reveal. window.APP_VERSION only changes on real
        // deploys, so returning visitors now get these from cache.
        const res = await fetch(`components/${file}?v=${window.APP_VERSION || '1'}`);
        if (!res.ok) throw new Error(`Failed: ${file} (${res.status})`);
        const html = await res.text();
        const slot = document.getElementById(slotId);
        if (slot) slot.innerHTML = html;
    } catch (err) {
        console.warn(`[Delivo Loader] ${err.message}`);
    }
}

/* Formats a raw Lebanese phone number (digits only, with or without
   the 961 country code) into "+961 70 714 152" — same grouping the
   admin dashboard uses, so the footer always matches. */
function _formatFooterPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    if (!digits) return '';
    const part1 = digits.slice(0, 2);
    const rest  = digits.slice(2);
    const grouped = rest.length > 3 ? `${rest.slice(0, 3)} ${rest.slice(3)}` : rest;
    return `+961 ${part1}${grouped ? ' ' + grouped : ''}`.trim();
}

/* ── Splash hide ─────────────────────────────────────────────*/
function hideSplash() {
    try { localStorage.setItem(_SPLASH_SEEN_KEY, '1'); } catch (_) {}
    const splash = document.getElementById('delivo-splash');
    if (!splash) return;
    splash.classList.add('hiding');
    setTimeout(() => splash.classList.add('hidden'), 520);
}

/* ── Item 4: hard reveal failsafe ─────────────────────────────
   Independent of loadAll()'s own control flow — if a bug in any
   feature script throws before the normal reveal at the end of
   loadAll(), or a component fetch hangs on a bad connection, the
   customer must never be stuck staring at a blank/splash screen
   forever. This fires on its own clock no matter what else does
   or doesn't complete, and is cleared once the normal path wins. */
const _hardRevealTimer = setTimeout(() => {
    console.warn('[Delivo Loader] Hard reveal failsafe fired — boot took too long or errored.');
    document.body.classList.add('loaded');
    hideSplash();
}, 8000);

/* ── App-store / Play-store buttons (settings/playStoreUrl,
   settings/appStoreUrl) ───────────────────────────────────────
   Both buttons render in the disabled "قريباً" state by default
   (see index.html markup). Once the admin fills in a store's URL
   from the settings panel, that button's .store-btn--soon class is
   dropped and its href is wired live — no code deploy needed when
   the app actually goes live on either store. A blank/whitespace
   value puts the button straight back into the "soon" state.
   Called both on initial boot (loadAll, below) and on every live
   settings update (_applySettings further down). */
function _applyStoreLinks(settings) {
    const map = [
        { id: 'store-btn-googleplay', url: settings?.playStoreUrl },
        { id: 'store-btn-appstore',   url: settings?.appStoreUrl  },
    ];
    map.forEach(({ id, url }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const clean = String(url || '').trim();
        if (clean) {
            el.classList.remove('store-btn--soon');
            el.removeAttribute('aria-disabled');
            el.href = clean;
        } else {
            el.classList.add('store-btn--soon');
            el.setAttribute('aria-disabled', 'true');
            el.href = '#';
        }
    });
}

/* ── Main boot sequence ──────────────────────────────────────*/
async function loadAll() {

    /* Record when boot started so we can honour SPLASH_HOLD_MS
       regardless of how fast or slow the network is.          */
    const bootStart = Date.now();

    /* Item 5: one settings.json fetch instead of two separate
       settings-key round trips (adminPhone + introEnabled used to
       each open their own connection). Kicked off alongside the
       component fetches below so it doesn't add any extra time —
       whichever finishes last is what determines this section's
       total wait, not their sum. */
    const settingsFetch = fetch('https://deliveryonline-300f7-default-rtdb.firebaseio.com/settings.json')
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));

    /* Fetch all components in parallel */
    await Promise.all([
        loadComponent('categories',   'categories.html'),
        loadComponent('promo-flip',   'promo-flip.html'),
        loadComponent('offers',       'offers.html'),
        loadComponent('join-partner', 'join-partner.html'),
        loadComponent('footer',       'footer.html'),
    ]);

    const settings = await settingsFetch;

    /* Footer phone number — always the live admin-configured number
       (settings/adminPhone, digits only e.g. "96170714152") rather
       than a hardcoded fallback, so it stays correct if the admin
       ever changes it from the dashboard without a code deploy.
       Drives both the "tel:" link and the WhatsApp ("wa.me") link. */
    try {
        const raw = settings?.adminPhone;
        const digits = String(raw || '').replace(/\D/g, '');
        if (digits) {
            const phoneLink = document.getElementById('footer-phone-link');
            const phoneText = document.getElementById('footer-phone-number');
            const waLink    = document.getElementById('footer-whatsapp-link');
            const heroWaLink = document.getElementById('hero-whatsapp-link');
            if (phoneLink) phoneLink.href = `tel:+${digits}`;
            if (phoneText) phoneText.textContent = _formatFooterPhone(digits);
            if (waLink)    waLink.href = `https://wa.me/${digits}`;
            if (heroWaLink) heroWaLink.href = `https://wa.me/${digits}`;
        }
    } catch (_) { /* keep the static fallbacks already in the markup */ }

    /* Category icon shape — settings/categoryIconShape ('circle' default,
       'square' opt-in). Applied before reveal so there's no visible
       flash from one shape to the other; also kept live via the SSE
       settings stream below (_applySettings → _applyCategoryIconShape). */
    document.body.classList.toggle('icon-shape-square', settings?.categoryIconShape === 'square');

    /* Play Store / App Store buttons — see _applyStoreLinks above */
    _applyStoreLinks(settings);

    /* Item 4: init scripts wrapped so one feature throwing doesn't
       stop the rest from running or block the page reveal right
       after this block — previously a single bad script here could
       leave the customer staring at the splash/a blank page forever. */
    try {
        if (typeof initNavbar     === 'function') initNavbar();
        if (typeof initModals     === 'function') initModals();
        if (typeof initCart       === 'function') initCart();
        if (typeof initModalAuth  === 'function') initModalAuth();
        if (typeof initStores     === 'function') initStores();
        if (typeof initCategories === 'function') initCategories();
        if (typeof initStorePanel === 'function') initStorePanel();
        if (typeof window.initMealtime === 'function') window.initMealtime();
        if (typeof initPromoFlip === 'function') initPromoFlip();
        if (typeof initHeroBg === 'function') initHeroBg();
    } catch (err) {
        console.error('[Delivo Loader] A feature failed to init:', err);
    }

    /* Reveal the page content UNDER the splash (no flash —
       splash is still covering everything at this point)     */
    document.body.classList.add('loaded');
    if (typeof initOnboarding === 'function') {
        /* Check admin-controlled toggle before showing the first-launch
           onboarding walkthrough. Defaults to enabled (fail-open) if the
           setting is missing, so a network hiccup never silently hides
           the intro for real first-time visitors. Reuses the settings
           fetch above instead of opening its own connection. */
        const val = settings?.introEnabled;
        const introOn = (val === null || val === undefined || val === true || val === 'true');
        window._introEnabled = introOn;
        if (introOn) initOnboarding();
    }
    console.log('[Delivo] All components loaded ✓');

    /* ── Pick up pending sale from sales.html ────────────────
       When customer taps "أضف للسلة" on sales.html, we store
       the bundle in sessionStorage and redirect to index.html.
       Here we pick it up, add it to the cart, and open the sidebar. */
    (function _pickUpPendingSale() {
        const raw = sessionStorage.getItem('pendingSaleCart');
        if (!raw) return;
        try {
            const sale = JSON.parse(raw);
            if (Date.now() - (sale.ts || 0) > 30000) { sessionStorage.removeItem('pendingSaleCart'); return; }
            sessionStorage.removeItem('pendingSaleCart');

            const { storeName, storeType, saleTitle, salePrice, items, image } = sale;
            const cart = window.DelivoCart;
            if (!cart || typeof cart.addItem !== 'function') return;

            // Single bundle item at sale price — name includes contents summary
            const bundleId   = `sale__${Date.now()}__i`;
            const summary    = (items || []).map(i => {
                const q = parseInt(i.qty) || 1;
                return i.name ? (q > 1 ? `${q}× ${i.name}` : i.name) : '';
            }).filter(Boolean).join(' + ');
            const bundleName = saleTitle + (summary ? ` (${summary})` : '');

            cart.addItem(bundleId, bundleName, salePrice, storeName, storeType, 'عرض خاص', image);

            // Open cart sidebar after short delay (let DOM settle)
            setTimeout(() => {
                if (typeof openCartSidebar === 'function') openCartSidebar();
            }, 500);

            // Show success toast
            setTimeout(() => {
                let toastEl = document.getElementById('cart-toast');
                if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'cart-toast'; toastEl.className = 'cart-toast'; document.body.appendChild(toastEl); }
                toastEl.textContent = `✅ ${saleTitle} أُضيف للسلة`;
                toastEl.className   = 'cart-toast cart-toast--success visible';
                setTimeout(() => toastEl.classList.remove('visible'), 3000);
            }, 600);

        } catch(e) { sessionStorage.removeItem('pendingSaleCart'); }
    })();

    /* ── Real-time settings stream ───────────────────────────
       Opens a Firebase SSE stream on /settings.json so any
       change the admin makes (testMode, maintenance, etc.)
       is reflected on the customer page instantly — no refresh.
       Reconnects automatically on network drop.               */
    _startSettingsStream();
    /* ─────────────────────────────────────────────────────── */

    clearTimeout(_hardRevealTimer);

    /* Wait at least SPLASH_HOLD_MS from boot start before hiding */
    const elapsed   = Date.now() - bootStart;
    const remaining = Math.max(0, SPLASH_HOLD_MS - elapsed);

    setTimeout(() => {
        /* One rAF to guarantee the page has painted under the splash */
        requestAnimationFrame(() => hideSplash());
        /* Splash fade-out itself takes ~520ms (see hideSplash) — wait
           for that to finish, plus a beat to let the eye settle, before
           playing the promo-flip hint. Otherwise it happens invisibly
           underneath the still-fading splash. */
        setTimeout(() => {
            if (typeof playPromoFlipHint === 'function') playPromoFlipHint();
        }, 900);
    }, remaining);
}

document.addEventListener('DOMContentLoaded', loadAll);

/* ── Splash: moto JS removed — waving flag is pure CSS ───── */
/* All animation is handled by CSS keyframes in base.css.
   No JS needed for the new splash entrance.                  */

/* ============================================================
   Real-time settings stream
   Uses Firebase SSE (EventSource) on /settings.json so the
   page reacts instantly when admin toggles any setting.
   Handles: testMode, maintenance
   Reconnects automatically with exponential backoff.
   ============================================================ */
(function () {
    const RTDB     = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const URL      = `${RTDB}/settings.json`;
    let   _sse     = null;
    let   _retryMs = 2000;
    const MAX_RETRY = 30000;

    /* ── Apply settings object to the page ─────────────────── */
    function _applySettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        /* testMode — show launch popup once, keep permanent banner hidden */
        const isTest   = settings.testMode === true || settings.testMode === 'true';
        const banner   = document.getElementById('test-mode-banner');
        if (banner) banner.style.display = 'none';
        document.documentElement.style.setProperty('--tmb-h', '0px');
        document.body.classList.remove('tmb-active');
        if (isTest) _showTestPopup();

        /* maintenance */
        const isMaint  = settings.maintenance === true || settings.maintenance === 'true';
        const overlay  = document.getElementById('maintenance-overlay');
        if (overlay) {
            overlay.style.display = isMaint ? 'flex' : 'none';
            document.body.style.overflow = isMaint ? 'hidden' : '';
        }

        /* deleted flag — sign out immediately if account was deleted by admin */
        if (settings.deletedUsers && typeof settings.deletedUsers === 'object') {
            const user = window.DelivoUser;
            if (user && user.uid && settings.deletedUsers[user.uid]) {
                // Account deleted — sign out and show blocked screen
                if (window.DelivoAuth && typeof window.DelivoAuth.logout === 'function') {
                    window.DelivoAuth.logout();
                } else if (window.firebase?.auth) {
                    window.firebase.auth().signOut();
                }
                window.DelivoUser = null;
                if (typeof _showBlockedScreen === 'function') {
                    _showBlockedScreen('تم حذف هذا الحساب من قِبَل الإدارة.');
                } else {
                    alert('تم حذف حسابك. يرجى التواصل مع الدعم.');
                    location.reload();
                }
                return;
            }
        }

        /* regType — switch register modal between direct and OTP */
        window._regType          = settings.regType          || 'direct';
        _applyRegType(window._regType);

        /* loyaltyVisible — hide/show all reward UI; points still accumulate silently */
        const loyaltyOn = settings.loyaltyVisible === undefined
                       || settings.loyaltyVisible === null
                       || settings.loyaltyVisible === true
                       || settings.loyaltyVisible === 'true';
        window._loyaltyVisible = loyaltyOn;
        _applyLoyaltyVisibility(loyaltyOn);

        /* topStoresVisible — show/hide the "المتاجر الأكثر طلباً" section on the home page */
        const topStoresOn = settings.topStoresVisible === undefined
                          || settings.topStoresVisible === null
                          || settings.topStoresVisible === true
                          || settings.topStoresVisible === 'true';
        window._topStoresVisible = topStoresOn;
        _applyTopStoresVisibility(topStoresOn);

        /* categoryIconShape — 'circle' (default) or 'square' icons for the
           "تصفح الأقسام" bar. Toggled live so an admin change is reflected
           immediately without the customer needing to refresh. */
        document.body.classList.toggle('icon-shape-square', settings.categoryIconShape === 'square');

        /* Play Store / App Store buttons — see _applyStoreLinks above */
        _applyStoreLinks(settings);

        /* squaresAdEnabled / squaresAdTriggerAt — the "Squares" developer-
           credit ad. Hidden by default; only appears when BOTH the admin
           master switch is on AND a fresh trigger timestamp comes through.
           See _maybeShowSquaresAd for the per-device dedupe + validity
           window logic. */
        _applySquaresAdContent(settings.squaresAdContent);
        _maybeShowSquaresAd(settings);
    }

    /* ── "Squares" ad CONTENT (editable from admin, no app-store release
       needed) ─────────────────────────────────────────────────────────
       Every field falls back to the original hardcoded copy already
       sitting in the HTML, so an admin who never touches these settings
       sees exactly the same ad as before. c is settings/squaresAdContent,
       shaped like:
         { title, tagline, body, points: [line1, line2, ...],
           ctaText, phone (digits only, e.g. "96176884643"), footer,
           logoUrl }
       phone drives both the visible number and the wa.me link; logoUrl
       lets the admin swap the image itself (hosted elsewhere) without
       touching the bundled asset. */
    function _applySquaresAdContent(c) {
        c = c && typeof c === 'object' ? c : {};

        const setText = (id, val, fallback) => {
            const el = document.getElementById(id);
            if (el && (val || fallback)) el.textContent = val || fallback;
        };

        setText('squares-ad-brand',      c.title,   'Squares');
        setText('squares-ad-tag',        c.tagline, 'Software & Digital Systems');
        setText('squares-ad-cta-text',   c.ctaText, 'لديك فكرة مشروع أو تحتاج نظاماً مشابهاً؟ تواصل معنا مباشرة:');
        setText('squares-ad-footer',     c.footer,  'Delivo — Powered by Squares');

        const leadEl = document.getElementById('squares-ad-lead');
        if (leadEl && c.body) leadEl.textContent = c.body; // plain text only — admin content, no HTML/markup risk

        const pointsList = Array.isArray(c.points) ? c.points.filter(p => p && String(p).trim()) : null;
        if (pointsList && pointsList.length) {
            const ul = document.getElementById('squares-ad-points');
            if (ul) ul.innerHTML = pointsList.map(p => `<li>${_escapeHtml(String(p))}</li>`).join('');
        }

        const logoEl = document.getElementById('squares-ad-logo');
        if (logoEl && c.logoUrl) logoEl.src = c.logoUrl;

        const digits = String(c.phone || '').replace(/\D/g, '');
        if (digits) {
            const phoneEl = document.getElementById('squares-ad-phone-display');
            const linkEl  = document.getElementById('squares-ad-whatsapp');
            if (phoneEl) phoneEl.textContent = _formatFooterPhone(digits);
            if (linkEl)  linkEl.href = `https://wa.me/${digits}`;
        }
    }

    function _escapeHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ── "Squares" ad trigger check ──────────────────────────
       - settings.squaresAdEnabled must be true (admin master switch).
       - settings.squaresAdTriggerAt must be a timestamp newer than the
         last one this device has already seen (localStorage), so the
         same broadcast never pops twice on one device — including on
         a plain page refresh, since _applySettings also runs on the
         very first settings fetch at load.
       - Limited to a 24h window from the trigger so a device that opens
         the page long after a trigger (e.g. next week) doesn't suddenly
         get shown an old announcement.
       - If the admin disables the ad afterward, nothing shows even if a
         past trigger is technically still within its window.
       - If the customer ever closed it with "don't show again" checked,
         it's suppressed permanently — for every future trigger, not just
         the current one — until the device UUID / local storage is lost
         (app data cleared, reinstall, account reset), since that's the
         only thing tracking this preference. */
    const SQUARES_AD_SEEN_KEY      = 'delivo_squares_ad_seen_ts';
    const SQUARES_AD_DISMISSED_KEY = 'delivo_squares_ad_dismissed';
    function _maybeShowSquaresAd(settings) {
        try { if (localStorage.getItem(SQUARES_AD_DISMISSED_KEY) === '1') return; } catch (_) {}

        const enabled = settings.squaresAdEnabled === true || settings.squaresAdEnabled === 'true';
        if (!enabled) return;
        const triggerAt = parseInt(settings.squaresAdTriggerAt);
        if (!triggerAt) return;
        const windowHours = parseInt(settings.squaresAdWindowHours) || 24; // admin-configurable, settings/squaresAdWindowHours
        if (Date.now() - triggerAt > windowHours * 60 * 60 * 1000) return; // trigger too old — expired

        let seenTs = 0;
        try { seenTs = parseInt(localStorage.getItem(SQUARES_AD_SEEN_KEY)) || 0; } catch (_) {}
        if (triggerAt <= seenTs) return; // this device already saw this exact trigger

        const modal = document.getElementById('modal-squares-ad');
        if (!modal) return;
        _bindSquaresAdDismiss(modal);
        // Small delay so it never fights with the launch/onboarding modal
        // for the very first paint of a session.
        setTimeout(() => {
            if (typeof openModal === 'function') openModal('modal-squares-ad');
            else modal.classList.add('active');
            try { localStorage.setItem(SQUARES_AD_SEEN_KEY, String(triggerAt)); } catch (_) {}
        }, 300);
    }

    /* Captures the "don't show again" checkbox at the moment the ad is
       closed — via the ✕ button, a backdrop click, or Escape (the three
       ways modals.js already closes any modal) — and persists it so
       _maybeShowSquaresAd skips every future trigger, not just this one. */
    let _squaresAdDismissBound = false;
    function _bindSquaresAdDismiss(modal) {
        if (_squaresAdDismissBound) return;
        _squaresAdDismissBound = true;
        const persistIfChecked = () => {
            const cb = document.getElementById('squares-ad-dont-show-again');
            if (cb && cb.checked) {
                try { localStorage.setItem(SQUARES_AD_DISMISSED_KEY, '1'); } catch (_) {}
            }
        };
        modal.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]') || e.target === modal) persistIfChecked();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) persistIfChecked();
        });
    }

    function _applyRegType(type) {
        const otpStep  = document.getElementById('otp-step');
        const submitBtn = document.getElementById('reg-submit');
        if (!otpStep) return;
        const isOtp = type === 'otp';
        // In OTP mode the OTP step is shown only after phone is verified
        // Reset to hidden on each settings change
        otpStep.style.display = 'none';
        if (submitBtn) submitBtn.textContent = isOtp ? 'إرسال كود التحقق' : 'إنشاء الحساب';
    }

    function _applyLoyaltyVisibility(visible) {
        // Offers carousel — loyalty card
        const loyaltyCard = document.getElementById('loyalty-card');
        if (loyaltyCard) loyaltyCard.style.display = visible ? '' : 'none';

        // Profile — points card
        const pointsCard = document.getElementById('acct-points-card');
        if (pointsCard) pointsCard.style.display = visible ? '' : 'none';

        // Cart — reward banner
        const rewardBanner = document.getElementById('cart-reward-banner');
        if (rewardBanner) rewardBanner.style.display = visible ? '' : 'none';

        // Reward reminder toast — hide entirely when invisible
        const reminderToast = document.getElementById('reward-reminder-toast');
        if (reminderToast && !visible) reminderToast.style.display = 'none';

        // Loyalty modal backdrop + sheet
        const loyaltyOverlay = document.getElementById('loyalty-overlay');
        const loyaltySheet   = document.getElementById('loyalty-sheet');
        if (!visible) {
            if (loyaltyOverlay) { loyaltyOverlay.classList.remove('open'); loyaltyOverlay.style.display = 'none'; }
            if (loyaltySheet)   { loyaltySheet.classList.remove('open');   loyaltySheet.style.display   = 'none'; }
        } else {
            if (loyaltyOverlay) loyaltyOverlay.style.display = '';
            if (loyaltySheet)   loyaltySheet.style.display   = '';
        }

        // Disable/enable _checkRewardReminder so toast never fires when hidden
        window._loyaltyUiVisible = visible;
    }

    function _applyTopStoresVisibility(visible) {
        const section = document.getElementById('stores-section');
        if (section) section.style.display = visible ? '' : 'none';
    }

    /* ── Open SSE connection ────────────────────────────────── */
    function _connect() {
        if (_sse) { _sse.close(); _sse = null; }

        try {
            _sse = new EventSource(URL);

            _sse.addEventListener('put', e => {
                try {
                    const msg  = JSON.parse(e.data);
                    // Root put gives full settings object; nested put gives partial
                    const data = (msg.path === '/') ? msg.data : _buildPartial(msg.path, msg.data);
                    if (data) _applySettings(data);
                    // Also store latest for partial merges
                    if (msg.path === '/') _latest = msg.data || {};
                    else if (_latest && msg.path) {
                        const key = msg.path.replace('/', '');
                        _latest[key] = msg.data;
                        _applySettings(_latest);
                    }
                } catch (_) {}
                _retryMs = 2000; // reset backoff on success
            });

            _sse.addEventListener('patch', e => {
                try {
                    const msg = JSON.parse(e.data);
                    if (_latest && msg.data) {
                        Object.assign(_latest, msg.data);
                        _applySettings(_latest);
                    }
                } catch (_) {}
            });

            _sse.onerror = () => {
                _sse.close(); _sse = null;
                setTimeout(_connect, _retryMs);
                _retryMs = Math.min(_retryMs * 2, MAX_RETRY);
            };
        } catch (_) {
            // EventSource not supported or blocked — fall back to polling
            _pollFallback();
        }
    }

    /* ── Fallback: poll every 30s if SSE unavailable ──────── */
    function _pollFallback() {
        fetch(`${URL}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) _applySettings(data); })
            .catch(() => {})
            .finally(() => setTimeout(_pollFallback, 8000));
    }

    /* ── Build partial object from SSE path ─────────────────── */
    function _buildPartial(path, data) {
        const key = (path || '').replace(/^\//, '').split('/')[0];
        if (!key) return null;
        return { [key]: data };
    }

    let _latest = {};
    let _testPopupShown = false;

    /* ── Test-mode launch popup (shows once on load, auto-dismisses) ── */
    function _showTestPopup() {
        if (_testPopupShown) return;
        _testPopupShown = true;

        const el = document.createElement('div');
        el.id = 'test-mode-popup';
        el.setAttribute('role', 'alertdialog');
        el.setAttribute('aria-modal', 'false');
        el.style.cssText = [
            'position:fixed',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%) scale(0.85)',
            'z-index:9999',
            'background:linear-gradient(135deg,#e64d00 0%,#FF5C00 100%)',
            'color:#fff',
            'border-radius:20px',
            'padding:28px 32px',
            'box-shadow:0 20px 60px rgba(255,92,0,0.45),0 0 0 1px rgba(255,255,255,0.12)',
            'text-align:center',
            'max-width:300px',
            'width:calc(100vw - 48px)',
            'opacity:0',
            'transition:opacity 0.35s ease,transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            'pointer-events:none',
            'direction:rtl',
            'font-family:inherit',
        ].join(';');

        el.innerHTML = `
            <div style="font-size:2.4rem;margin-bottom:12px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.3))">🧪</div>
            <div style="font-size:1.05rem;font-weight:800;letter-spacing:0.01em;margin-bottom:6px">الموقع قيد التجربة</div>
            <div style="font-size:0.78rem;opacity:0.88;line-height:1.5">لا يتم قبول طلبات حقيقية<br>سيُعلَن عن الإطلاق الرسمي قريباً</div>
            <div id="tmp-bar" style="margin-top:18px;height:3px;background:rgba(255,255,255,0.25);border-radius:99px;overflow:hidden">
                <div id="tmp-fill" style="height:100%;width:100%;background:rgba(255,255,255,0.7);transform-origin:left;transform:scaleX(1);transition:transform 3.6s linear"></div>
            </div>`;

        document.body.appendChild(el);

        /* Animate in */
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%,-50%) scale(1)';
            /* Start progress bar drain after paint */
            requestAnimationFrame(() => {
                const fill = document.getElementById('tmp-fill');
                if (fill) fill.style.transform = 'scaleX(0)';
            });
        }));

        /* Auto-dismiss after 4s */
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%,-50%) scale(0.9)';
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
        }, 4000);
    }

    /* ── Public entry point called by loadAll() ─────────────── */
    window._startSettingsStream = _connect;
})();