/* ============================================================
   scripts/back-handler.js  v6 — double-back-to-exit
   
   Strategy:
   - MutationObserver watches for open layers
   - When a layer opens → push one history entry
   - popstate fires → close top layer OR show "back again to exit" toast
   - Second back within 2s → window.close() for PWA
   ============================================================ */

(function () {
    'use strict';

    /* ── State ───────────────────────────────────────────────── */
    let _armed       = false;   // we have a pushed entry in history
    let _exitReady   = false;   // first back on clean screen already pressed
    let _exitTimer   = null;

    /* ── Arm / disarm ────────────────────────────────────────── */
    function _arm() {
        if (!_armed) {
            history.pushState({ delivo: true }, '');
            _armed = true;
        }
    }

    function _disarm() {
        _armed = false;
    }

    /* ── Layer open detector ─────────────────────────────────── */
    function _isShown(el) {
        // Covers both class-driven overlays (display set via CSS) and
        // inline style.display='flex' overlays used across the codebase.
        return !!el && el.style.display !== 'none' &&
               getComputedStyle(el).display !== 'none';
    }

    function _anyLayerOpen() {
        const introCard = document.getElementById('store-intro');
        if (introCard && introCard.classList.contains('visible'))     return true;
        if (document.querySelector('.modal-overlay.active'))          return true;
        if (document.querySelector('#track-modal.active'))            return true;
        if (document.querySelector('.track-modal.active'))            return true;
        if (document.querySelector('#modal-orders.active'))           return true;
        if (document.querySelector('.orders-modal.active'))           return true;
        if (document.querySelector('#bb-track-sheet.open'))           return true;
        const sp = document.getElementById('store-panel') ||
                   document.querySelector('.store-panel');
        if (sp && (sp.classList.contains('open') ||
                   sp.classList.contains('active')))                  return true;
        const cart = document.getElementById('cart-sidebar');
        if (cart && cart.classList.contains('active'))                return true;
        const nav = document.getElementById('mobile-menu');
        if (nav && nav.classList.contains('open'))                    return true;
        // Overlays toggled via inline style.display rather than a class
        if (_isShown(document.getElementById('cart-map-modal')))      return true;
        if (_isShown(document.getElementById('coverage-warning-modal'))) return true;
        if (_isShown(document.getElementById('ext-map-modal')))        return true;
        if (_isShown(document.getElementById('ext-order-overlay')))    return true;
        if (_isShown(document.getElementById('wc2026-modal')))         return true;
        return false;
    }

    /* ── Close top layer ─────────────────────────────────────── */
    function _closeTopLayer() {
        // Store-intro animation (the ~2.6s card shown right after tapping
        // a store, before the panel itself opens) — must be checked first
        // since it can be on screen before store-panel gets its 'active' class.
        const introCard = document.getElementById('store-intro');
        if (introCard && introCard.classList.contains('visible')) {
            if (typeof window._abortStoreIntro === 'function') window._abortStoreIntro();
            return true;
        }
        const trackModal = document.getElementById('track-modal') ||
                           document.querySelector('.track-modal');
        if (trackModal && (trackModal.classList.contains('active') ||
                           trackModal.style.display === 'flex')) {
            if (typeof window._closeTrackModal === 'function') window._closeTrackModal();
            return true;
        }
        const ordersModal = document.getElementById('modal-orders') ||
                            document.querySelector('.orders-modal');
        if (ordersModal && ordersModal.classList.contains('active')) {
            if (typeof closeOrdersModal === 'function') closeOrdersModal();
            return true;
        }
        // Nested map picker inside the "order externally" wizard — sits on
        // top of ext-order-overlay, so must close before it.
        if (_isShown(document.getElementById('ext-map-modal'))) {
            if (typeof window._extMapCancel === 'function') window._extMapCancel();
            else document.getElementById('ext-map-modal').style.display = 'none';
            return true;
        }
        if (_isShown(document.getElementById('cart-map-modal'))) {
            if (typeof window._closeCartMapModal === 'function') window._closeCartMapModal();
            else document.getElementById('cart-map-modal').style.display = 'none';
            return true;
        }
        if (_isShown(document.getElementById('coverage-warning-modal'))) {
            if (typeof window._closeCoverageWarning === 'function') window._closeCoverageWarning();
            else document.getElementById('coverage-warning-modal').style.display = 'none';
            return true;
        }
        if (_isShown(document.getElementById('wc2026-modal'))) {
            if (typeof window.closeWc2026Modal === 'function') window.closeWc2026Modal();
            else document.getElementById('wc2026-modal').style.display = 'none';
            return true;
        }
        const overlay = document.querySelector('.modal-overlay.active');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.classList.remove('modal-open');
            return true;
        }
        const trackSheet = document.getElementById('bb-track-sheet');
        if (trackSheet && trackSheet.classList.contains('open')) {
            if (typeof window._closeTrackSheet === 'function') window._closeTrackSheet();
            return true;
        }
        // "Order externally" wizard overlay (parent of ext-map-modal above)
        if (_isShown(document.getElementById('ext-order-overlay'))) {
            if (typeof window._extCloseModal === 'function') window._extCloseModal();
            else document.getElementById('ext-order-overlay').style.display = 'none';
            return true;
        }
        const sp = document.getElementById('store-panel') ||
                   document.querySelector('.store-panel');
        if (sp && (sp.classList.contains('open') || sp.classList.contains('active'))) {
            if (typeof window.closeStorePanel === 'function') window.closeStorePanel();
            return true;
        }
        const cart = document.getElementById('cart-sidebar');
        if (cart && cart.classList.contains('active')) {
            if (typeof window.closeCartSidebar === 'function') window.closeCartSidebar();
            return true;
        }
        const nav = document.getElementById('mobile-menu');
        if (nav && nav.classList.contains('open')) {
            nav.classList.remove('open');
            const btn = document.getElementById('mobile-menu-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            return true;
        }
        return false;
    }

    /* ── Double-back exit toast ──────────────────────────────── */
    function _showExitToast() {
        // Remove any existing toast
        const old = document.getElementById('exit-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = 'exit-toast';
        toast.setAttribute('role', 'alert');
        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: rgba(20,20,20,0.93);
            color: #fff;
            font-family: inherit;
            font-size: 0.88rem;
            font-weight: 700;
            padding: 12px 22px;
            border-radius: 50px;
            z-index: 99999;
            white-space: nowrap;
            box-shadow: 0 4px 24px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.08);
            opacity: 0;
            transition: opacity 0.22s, transform 0.22s;
            pointer-events: none;
            direction: rtl;
        `;
        toast.textContent = '🚪 اضغط مرة أخرى للخروج';
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        // Auto-dismiss after 2.5s
        _exitTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 250);
            _exitReady = false;
            _exitTimer = null;
            // Re-arm so next single back shows toast again
            _arm();
        }, 2500);
    }

    /* ── Do exit ─────────────────────────────────────────────── */
    function _doExit() {
        if (_exitTimer) { clearTimeout(_exitTimer); _exitTimer = null; }
        const toast = document.getElementById('exit-toast');
        if (toast) toast.remove();
        _exitReady = false;

        // PWA standalone: window.close() works (called from user gesture chain)
        const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true;
        if (isPWA) {
            window.close();
            // Fallback if close doesn't work immediately
            setTimeout(() => { history.go(-(history.length)); }, 300);
        } else {
            // Browser tab: just let it go naturally
            history.back();
        }
    }

    /* ── popstate ────────────────────────────────────────────── */
    window.addEventListener('popstate', function () {
        _disarm();

        const closed = _closeTopLayer();

        if (closed) {
            // Layer closed — re-arm if more layers still open
            setTimeout(() => { if (_anyLayerOpen()) _arm(); }, 80);
            return;
        }

        // Nothing open — double-back logic
        if (_exitReady) {
            // Second back within window → exit
            _doExit();
        } else {
            // First back on clean screen → show toast
            _exitReady = true;
            _showExitToast();
            // Don't re-arm here — the next popstate = second back = exit
        }
    });

    /* ── MutationObserver: arm when any layer opens ──────────── */
    let _observing = false;
    function _startObserver() {
        if (_observing) return;
        _observing = true;
        const observer = new MutationObserver(() => {
            if (_anyLayerOpen() && !_armed) _arm();
        });
        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _startObserver);
    } else {
        _startObserver();
    }

    /* ── Initial state ───────────────────────────────────────── */
    // Mark base entry so we always have a bottom to land on
    history.replaceState({ delivoBase: true }, '');

})();