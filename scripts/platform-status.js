/* ============================================================
   scripts/platform-status.js
   ------------------------------------------------------------
   Whole-site "closed" takeover — same idea as a single store's
   closed badge (storeStatus/{name} → closed/reason/opensAt),
   but for the entire platform (settings/platformClosed), shown
   as a full-screen, non-dismissable overlay that blocks the app
   until an admin re-opens it from admin.html.

   Supports two ways of being closed:
     - Manual: admin closes it right now (closed:true).
     - Scheduled: admin sets autoCloseAt / opensAt (a real date/
       time, not free text) in advance — the platform is computed
       as closed/open purely by comparing "now" against those
       times, on every client, with no server-side process and no
       admin tab needing to be open at the scheduled moment.

   Re-checks live via Firebase's onValue AND on a periodic timer
   (schedule transitions happen purely because time passed, which
   onValue alone wouldn't catch since no data actually changed).
   ============================================================ */

(function () {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const PATH = `${RTDB}/settings/platformClosed.json`;

    let _overlayShown = false;
    let _lastCfg       = null;

    const _ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;
    function _isIso(str) { return typeof str === 'string' && _ISO_DATE_RE.test(str); }

    // Computes whether the platform is closed RIGHT NOW, and with what
    // reason/opens-label, taking both the manual flag and any scheduled
    // auto-close/auto-open times into account. Returns null when open.
    function _computeClosed(cfg) {
        if (!cfg) return null;
        const now = Date.now();
        const autoOpenDue  = _isIso(cfg.opensAt)     && new Date(cfg.opensAt).getTime()     <= now;
        const autoCloseDue = _isIso(cfg.autoCloseAt) && new Date(cfg.autoCloseAt).getTime() <= now;

        if (cfg.closed) {
            // Manually/actively closed — unless a real scheduled reopen
            // time has already arrived, in which case treat as reopened
            // even though nobody clicked anything.
            if (autoOpenDue) return null;
            return { reason: cfg.reason, opensAt: cfg.opensAt };
        }
        // Not actively closed yet — but is a scheduled auto-close due?
        if (cfg.autoCloseAt && autoCloseDue) {
            if (autoOpenDue) return null; // whole scheduled window already passed
            return { reason: cfg.reason, opensAt: cfg.opensAt };
        }
        return null;
    }

    // Same relative-date-label idea used for store closures, kept simple
    // and self-contained here rather than reaching into the store-status
    // listener's private helper.
    function _opensLabel(opensAt) {
        if (!opensAt) return '';
        // JS's Date constructor is unreliably lenient with non-standard
        // strings (it can parse a stray digit out of Arabic free text
        // into a bogus-but-"valid" date instead of failing outright), so
        // only treat it as a real date if it matches the strict ISO
        // format we ourselves generate — anything else is shown as-is.
        if (!_ISO_DATE_RE.test(opensAt)) return opensAt;
        const dt = new Date(opensAt);
        if (isNaN(dt)) return opensAt;
        const now = new Date();
        if (dt <= now) return '';
        const days   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const months = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
        const t = dt.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: true });
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dtDate  = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const dayDiff = Math.round((dtDate - nowDate) / 86400000);
        if (dayDiff === 0) return `اليوم الساعة ${t}`;
        if (dayDiff === 1) return `غداً الساعة ${t}`;
        if (dayDiff < 7)   return `${days[dt.getDay()]} الساعة ${t}`;
        const sameYear = dt.getFullYear() === now.getFullYear();
        const datePart = sameYear
            ? `${dt.getDate()} ${months[dt.getMonth()]}`
            : `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
        return `${days[dt.getDay()]} ${datePart} الساعة ${t}`;
    }

    function _injectStyles() {
        if (document.getElementById('platform-closed-styles')) return;
        const style = document.createElement('style');
        style.id = 'platform-closed-styles';
        style.textContent = `
            #platform-closed-overlay {
                position: fixed; inset: 0; z-index: 999999;
                background: linear-gradient(180deg,#0a0a0f,#141420);
                display: flex; align-items: center; justify-content: center;
                padding: 24px; text-align: center; direction: rtl;
                font-family: inherit;
            }
            .pco-icon { font-size: 4rem; margin-bottom: 10px; }
            .pco-title { font-size: 1.4rem; font-weight: 900; color: #fff; margin: 0 0 8px; }
            .pco-reason { font-size: 0.95rem; color: rgba(255,255,255,0.75); margin: 0 0 16px; max-width: 380px; line-height: 1.7; }
            .pco-chip {
                display: inline-flex; align-items: center; gap: 6px;
                background: rgba(255,92,0,0.12); border: 1.5px solid rgba(255,92,0,0.35);
                color: #FF5C00; font-weight: 800; font-size: 0.85rem;
                padding: 8px 18px; border-radius: 50px;
            }
            .pco-logo { font-size: 1.1rem; font-weight: 900; color: #FF5C00; margin-top: 26px; opacity: 0.85; }
        `;
        document.head.appendChild(style);
    }

    function _showOverlay(st) {
        if (_overlayShown) {
            // Already showing — just refresh the text in case reason/opensAt changed
            const r = document.getElementById('pco-reason');
            const c = document.getElementById('pco-chip');
            if (r) r.textContent = st.reason || 'مغلق مؤقتاً';
            const label = _opensLabel(st.opensAt);
            if (c) c.style.display = label ? 'inline-flex' : 'none';
            if (c) c.querySelector('span').textContent = label;
            return;
        }
        _overlayShown = true;
        _injectStyles();

        const label = _opensLabel(st.opensAt);
        const overlay = document.createElement('div');
        overlay.id = 'platform-closed-overlay';
        overlay.innerHTML = `
            <div>
                <div class="pco-icon">🔒</div>
                <h1 class="pco-title">Delivo مغلق حالياً</h1>
                <p class="pco-reason" id="pco-reason">${st.reason || 'مغلق مؤقتاً'}</p>
                <div class="pco-chip" id="pco-chip" style="${label ? '' : 'display:none;'}">
                    🕐 يفتح: <span>${label}</span>
                </div>
                <div class="pco-logo">Delivo</div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    function _hideOverlay() {
        if (!_overlayShown) return;
        _overlayShown = false;
        document.getElementById('platform-closed-overlay')?.remove();
        document.body.style.overflow = '';
    }

    function _apply(cfg) {
        _lastCfg = cfg;
        const effective = _computeClosed(cfg);
        if (effective) _showOverlay(effective);
        else _hideOverlay();
    }

    async function _checkOnce() {
        try {
            const resp = await fetch(PATH);
            const cfg  = await resp.json();
            _apply(cfg);
        } catch (_) { /* network hiccup — leave current state as-is */ }
    }

    // ── Real-time listener (preferred) ──────────────────────────
    // Uses the Firebase SDK's live onValue-style listener so admin
    // opening/closing the platform reflects on every open customer tab
    // within a fraction of a second — no polling delay.
    function _initWithSDK(db) {
        db.ref('settings/platformClosed').on('value', snap => _apply(snap.val()));
    }

    // ── REST polling fallback ────────────────────────────────────
    // Only used if the Firebase SDK isn't available/ready for some
    // reason — checks every 5s so it still feels close to real-time.
    function _initWithREST() {
        _checkOnce();
        setInterval(_checkOnce, 5000);
    }

    function _init() {
        function trySDK() {
            if (window.firebase?.database) { _initWithSDK(window.firebase.database()); return true; }
            return false;
        }
        if (!trySDK()) {
            // Firebase SDK may still be loading — retry once shortly,
            // then fall back to REST polling if it never shows up.
            setTimeout(() => { if (!trySDK()) _initWithREST(); }, 1500);
        }

        // A scheduled auto-close/auto-open moment arriving doesn't change
        // any Firebase data by itself, so onValue alone would never catch
        // it — re-evaluate the last-known config against the clock every
        // 15s to catch those transitions right on schedule.
        setInterval(() => { if (_lastCfg !== null) _apply(_lastCfg); }, 15000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }
})();