/* ============================================================
   scripts/launch-gate.js
   NEW-VISITOR LAUNCH GATE — feature-flagged via settings/launchGateEnabled
   ------------------------------------------------------------
   When the admin enables this (Settings → "بوابة الدخول للزوار الجدد"),
   any device that has never completed OFFICIAL registration is required
   to enter a full name + phone number in a non-dismissible popup before
   it can browse the site. This does NOT replace official registration —
   it's a lightweight pre-registration capture:

     • A device that already has a registered account (whether currently
       logged in or logged out) never sees this at all.
     • Once filled, the visitor can browse and shop freely, but checkout
       still requires a real account — see cartCheckout() in cart.js,
       which is untouched and already blocks unauthenticated checkout.
     • The captured name/phone are cached locally so the official
       registration modal (#modal-subscribe) can auto-fill them — see
       scripts/modal-auth.js.
     • The moment that same device completes official registration, its
       unregisteredUsers/{uuid} record is deleted there — the visitor is
       now simply a normal registered user like everyone else.

   Data lives in RTDB at unregisteredUsers/{uuid}, mirroring the same
   uuid already used everywhere else (presence.js, device-fingerprinting
   in firebase-init.js) via the shared localStorage key.
   ============================================================ */
(function () {
    'use strict';

    const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    // Same uuid generator/key as presence.js and firebase-init.js — whichever
    // script runs first establishes it, the others just reuse the same value.
    function getDeviceUUID() {
        let uuid = localStorage.getItem('delivo_device_uuid');
        if (!uuid) {
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            localStorage.setItem('delivo_device_uuid', uuid);
        }
        return uuid;
    }

    async function rtdbGet(path) {
        try {
            const r = await fetch(`${RTDB_BASE}/${path}.json`);
            if (!r.ok) return null;
            return await r.json();
        } catch (_) { return null; }
    }
    async function rtdbPut(path, data) {
        try {
            await fetch(`${RTDB_BASE}/${path}.json`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data),
            });
        } catch (_) {}
    }
    async function rtdbPatch(path, data) {
        try {
            await fetch(`${RTDB_BASE}/${path}.json`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data),
            });
        } catch (_) {}
    }

    // Same Lebanese-number pattern used by official registration —
    // guarantees a number accepted here is guaranteed valid there too.
    const PHONE_RE = /^(03|70|71|76|78|79|81|82|83|86)\d{6}$/;

    function showModal() {
        const overlay = document.getElementById('modal-launch-gate');
        if (!overlay) return;
        overlay.classList.add('lg-active');
        document.body.classList.add('modal-open');
    }
    function hideModal() {
        const overlay = document.getElementById('modal-launch-gate');
        if (!overlay) return;
        overlay.classList.remove('lg-active');
        document.body.classList.remove('modal-open');
    }
    function setError(msg) {
        const el = document.getElementById('launch-gate-error');
        if (!el) return;
        if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
        el.textContent = msg;
        el.style.display = 'block';
    }

    async function handleSubmit() {
        const nameEl  = document.getElementById('launch-gate-name');
        const phoneEl = document.getElementById('launch-gate-phone');
        const btn     = document.getElementById('launch-gate-submit');
        setError('');

        const fullname = (nameEl?.value || '').trim();
        const digits   = (phoneEl?.value || '').replace(/[\s\-]/g, '');

        if (!fullname) {
            setError('الرجاء إدخال اسمك الكامل.');
            nameEl?.focus();
            return;
        }
        if (!digits || !PHONE_RE.test(digits)) {
            setError('رقم لبناني غير صحيح. مثال: 71 123 456');
            phoneEl?.focus();
            return;
        }

        const origBtnText = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ التحقق…'; }

        try {
            const [phoneData, limitData] = await Promise.all([
                rtdbGet(`phoneIndex/${digits}`),
                rtdbGet('settings/maxAccountsPerPhone'),
            ]);
            const limit = Math.max(1, parseInt(limitData) || 1);
            let phCount = 0;
            if (phoneData !== null) {
                phCount = (typeof phoneData === 'object' && !Array.isArray(phoneData))
                    ? Object.keys(phoneData).length : 1;
            }
            if (phCount >= limit) {
                setError('❌ رقم الهاتف هذا مسجّل مسبقاً. الرجاء إدخال رقم آخر.');
                if (btn) { btn.disabled = false; btn.textContent = origBtnText; }
                phoneEl?.focus();
                return;
            }

            const uuid   = getDeviceUUID();
            const record = {
                fullname,
                phone:     digits,
                createdAt: Date.now(),
                lastSeen:  Date.now(),
            };
            await rtdbPut(`unregisteredUsers/${uuid}`, record);

            // Cached locally so the official registration modal can
            // auto-fill instantly without another round trip.
            localStorage.setItem('delivo_launch_fullname', fullname);
            localStorage.setItem('delivo_launch_phone', digits);

            hideModal();
        } catch (e) {
            setError('حدث خطأ، حاول مجدداً.');
            if (btn) { btn.disabled = false; btn.textContent = origBtnText; }
        }
    }

    async function init() {
        // Completely inert unless the admin has explicitly enabled it.
        const enabled = await rtdbGet('settings/launchGateEnabled');
        if (enabled !== true && enabled !== 'true') return;

        const uuid = getDeviceUUID();

        // Rule: a device that already completed official registration is
        // never shown this, whether currently logged in or logged out.
        const deviceInfo = await rtdbGet(`devices/${uuid}`);
        if (deviceInfo && (deviceInfo.accountCount || 0) > 0) return;

        // Already filled the gate on an earlier visit — don't nag again,
        // just quietly refresh "last seen" for the admin panel and move on.
        const existing = await rtdbGet(`unregisteredUsers/${uuid}`);
        if (existing) {
            rtdbPatch(`unregisteredUsers/${uuid}`, { lastSeen: Date.now() });
            return;
        }

        showModal();

        const btn = document.getElementById('launch-gate-submit');
        btn?.addEventListener('click', handleSubmit);

        // Enter key submits from either field
        ['launch-gate-name', 'launch-gate-phone'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
            });
        });

        document.getElementById('launch-gate-phone')?.addEventListener('input', () => setError(''));
        document.getElementById('launch-gate-name')?.addEventListener('input', () => setError(''));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();