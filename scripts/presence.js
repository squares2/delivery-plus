/* ============================================================
   presence.js — Real-time online visitor counter
   Key: device UUID (stable across tabs/refreshes, same device)
   Payload: { uuid, uid, username, device, connectedAt, lastSeen }
   ============================================================ */

(function () {
    'use strict';

    const RTDB_BASE  = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const HEARTBEAT  = 8 * 1000;   // must be well under admin STALE_MS (45s)
    const STALE_MS   = 45 * 1000;  // MUST match admin-presence.js STALE_MS
    const SWEEP_MS   = 30 * 1000;  // how often this tab may prune dead entries

    let lastSweep = 0;

    // Admin-configurable padding added on top of the real live-visitor
    // count (settings/presenceBoost = { min, max }) — purely cosmetic
    // "social proof", never affects the actual presence data or count
    // logic below. Re-rolled to a fresh random value in range every 2
    // minutes so it reads as natural fluctuation, not a static number.
    const BOOST_REROLL_MS = 2 * 60 * 1000;
    let _boostMin = 0, _boostMax = 0;
    let _boost = 0;
    let _lastRealCount = null;

    function _rollBoost() {
        _boost = (_boostMax > _boostMin)
            ? _boostMin + Math.floor(Math.random() * (_boostMax - _boostMin + 1))
            : _boostMin;
        // Reflect the new value immediately rather than waiting for the
        // next real presence update.
        if (_lastRealCount !== null) updateWidget(_lastRealCount);
    }

    async function loadBoostRange() {
        try {
            const r = await fetch(`${RTDB_BASE}/settings/presenceBoost.json`);
            const v = await r.json();
            if (v && typeof v === 'object') {
                _boostMin = (typeof v.min === 'number' && v.min > 0) ? v.min : 0;
                _boostMax = (typeof v.max === 'number' && v.max > 0) ? v.max : 0;
            } else if (typeof v === 'number' && v > 0) {
                _boostMin = _boostMax = v; // legacy static value
            } else {
                _boostMin = _boostMax = 0;
            }
        } catch (_) { _boostMin = _boostMax = 0; }
        _rollBoost();
    }

    // Count only entries whose heartbeat is recent; anything older is a
    // leaked/zombie node (crashed tab, killed app, REST client that never
    // got to fire beforeunload) that never got cleaned up.
    function countActive(raw) {
        const cutoff = _correctedNow() - STALE_MS;
        let n = 0;
        for (const k in raw) {
            if (raw[k] && (raw[k].lastSeen || 0) >= cutoff) n++;
        }
        return n;
    }

    // Best-effort cleanup so zombie nodes don't sit in the DB forever just
    // because the admin panel happens to be closed. Any connected client
    // (not only admin) can prune them; throttled so we don't hammer RTDB
    // every time many tabs receive the same snapshot.
    function sweepStale(raw, deleteFn) {
        const now = _correctedNow();
        if (now - lastSweep < SWEEP_MS) return;
        lastSweep = now;
        const cutoff = now - STALE_MS;
        for (const k in raw) {
            if (raw[k] && (raw[k].lastSeen || 0) < cutoff) deleteFn(k);
        }
    }

    // Delegates to firebase-init.js's fingerprint-aware resolver — this used
    // to generate its own UUID independently whenever localStorage was empty,
    // which raced against firebase-init.js doing the exact same thing (e.g.
    // during the first-launch name/phone modal's async Firestore fingerprint
    // lookup) and could leave this session heartbeating under a DIFFERENT
    // UUID than the one deviceLeads/devices/users ultimately got saved under.
    // Only falls back to the old simple logic if, for whatever reason,
    // firebase-init.js hasn't defined window.DelivoAuth.getDeviceUUID yet —
    // script load order (firebase-init.js is included before this file)
    // means that should never actually happen in practice.
    async function getDeviceUUID() {
        if (window.DelivoAuth && typeof window.DelivoAuth.getDeviceUUID === 'function') {
            try {
                const uuid = await window.DelivoAuth.getDeviceUUID();
                if (uuid) return uuid;
            } catch (_) { /* fall through to the local fallback below */ }
        }
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

    // ── Server-time correction ────────────────────────────────
    // connectedAt/startedAt/lastSeen all ultimately come from this
    // device's own clock. If it's wrong — a surprisingly common
    // real-world case (phone set to the wrong time or timezone) —
    // a session can log into an impossible hour/day in the admin's
    // Attendance charts (e.g. a 6am bar appearing before 6am has
    // even happened). _correctedNow() folds in the gap between this
    // device's clock and Firebase's real server clock — read once
    // via the SDK's virtual `.info/serverTimeOffset` when available,
    // or a one-time write/read probe over REST otherwise — the same
    // "never trust the client clock" principle already used for
    // deviceLeads/lastVisit and customerActivity/lastActive below.
    let _timeOffsetMs = 0;
    function _correctedNow() { return Date.now() + _timeOffsetMs; }

    function _initServerTimeOffsetSDK(db) {
        try {
            db.ref('.info/serverTimeOffset').on('value', snap => {
                const v = snap.val();
                if (typeof v === 'number' && isFinite(v)) _timeOffsetMs = v;
            });
        } catch (_) { /* keep offset at 0 — best-effort only */ }
    }

    async function _initServerTimeOffsetREST() {
        try {
            const localBefore = Date.now();
            const r = await fetch(`${RTDB_BASE}/attendance/_timeProbe.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ '.sv': 'timestamp' }),
            });
            const serverTs   = await r.json();
            const localAfter = Date.now();
            if (typeof serverTs === 'number' && isFinite(serverTs)) {
                _timeOffsetMs = serverTs - Math.round((localBefore + localAfter) / 2);
            }
        } catch (_) { /* keep offset at 0 — best-effort only */ }
    }

    function rtdbPut(path, data, keepalive = false) {
        return fetch(`${RTDB_BASE}/${path}.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
            keepalive,
        }).catch(() => {});
    }

    function rtdbDelete(path, keepalive = false) {
        return fetch(`${RTDB_BASE}/${path}.json`, { method: 'DELETE', keepalive }).catch(() => {});
    }

    async function rtdbGet(path) {
        try {
            const r = await fetch(`${RTDB_BASE}/${path}.json`);
            return await r.json();
        } catch (_) { return null; }
    }

    async function rtdbPush(path, data) {
        try {
            const r = await fetch(`${RTDB_BASE}/${path}.json`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data),
            });
            const j = await r.json();
            return (j && j.name) || null;
        } catch (_) { return null; }
    }

    /* ── Attendance logging (persistent visit history for admin stats) ──
       Separate from `presence/` above (deleted the instant a device
       disconnects) — this keeps a permanent record so the admin
       Attendance panel can chart daily/monthly visitor momentum,
       new-vs-returning devices, registered-vs-guest mix, and average
       time-on-site. Never deleted. One attendance "visit" per page
       load (not per reconnect), keyed by Beirut calendar date so the
       admin dashboard's day boundaries match the business's actual day. */
    function _beirutDateKey(ts) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(ts || Date.now()));
    }

    let _attnPath    = null;  // attendance/sessions/{date}/{key} for THIS page load
    let _attnStarted = false;

    async function _attnBegin(uuid, device, os, startedAt) {
        if (_attnStarted) return; // one visit per page load, ever
        _attnStarted = true;
        try {
            const existing = await rtdbGet(`attendance/devices/${uuid}`);
            const isNew     = !existing;
            const auth      = window._delivoAuthUser || null;
            const dateKey   = _beirutDateKey(startedAt);

            const key = await rtdbPush(`attendance/sessions/${dateKey}`, {
                uuid, device, os,
                isNew,
                isRegistered: !!(auth && auth.uid),
                startedAt,
                lastSeen: startedAt,
            });
            if (key) _attnPath = `attendance/sessions/${dateKey}/${key}`;

            // Carry over any funnel events that fired before this
            // session record existed (e.g. a very fast store tap).
            if (_funnel.storeOpens || _funnel.productAdds || _funnel.cartOpens || _funnel.checkoutStarts || _funnel.ordered) {
                _funnelFlush(true);
            }

            if (isNew) {
                rtdbPut(`attendance/devices/${uuid}`, { firstSeen: startedAt, lastSeen: startedAt, visits: 1 });
            } else {
                rtdbPut(`attendance/devices/${uuid}`, {
                    firstSeen: existing.firstSeen || startedAt,
                    lastSeen:  startedAt,
                    visits:    (existing.visits || 0) + 1,
                });
            }
        } catch (_) { /* best-effort — never blocks presence itself */ }
    }

    function _attnTouch() {
        if (!_attnPath) return;
        fetch(`${RTDB_BASE}/${_attnPath}/lastSeen.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_correctedNow()),
        }).catch(() => {});
    }

    function _attnMarkRegistered() {
        if (!_attnPath) return;
        fetch(`${RTDB_BASE}/${_attnPath}/isRegistered.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(true),
        }).catch(() => {});
    }

    /* ── Funnel + abandoned-cart tracking (attendance phase-1 upgrade) ──
       Counts what THIS visit actually did — opened a store, added to
       cart, opened the cart, started checkout, ordered — so the admin
       Attendance panel can chart the visit→order funnel and a real
       conversion rate instead of only raw traffic. Counters live
       locally and the whole `funnel` object is re-PUT on change
       (debounced): this session record is only ever written by this
       page load, so the local counters are authoritative and there's
       no read-modify-write race. Events may fire before _attnBegin
       has created the session — they accumulate locally and the first
       flush after _attnPath exists carries them all.

       Abandoned cart: when the page is hidden/closed with items still
       in the cart and no order submitted this visit, a small snapshot
       (item count + USD value + who, if logged in) is written onto
       the session so the admin can see exactly what walked away. */
    let _funnel = { storeOpens: 0, productAdds: 0, cartOpens: 0, checkoutStarts: 0, ordered: false };
    let _funnelTimer = null;

    function _funnelFlush(immediate = false, keepalive = false) {
        if (!_attnPath) return; // will retry on next event/heartbeat once session exists
        const write = () => fetch(`${RTDB_BASE}/${_attnPath}/funnel.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_funnel), keepalive,
        }).catch(() => {});
        clearTimeout(_funnelTimer);
        if (immediate) write();
        else _funnelTimer = setTimeout(write, 1500);
    }

    function _cartSnapshot() {
        const c = window.DelivoCart;
        if (!c || !Array.isArray(c.items) || !c.items.length) return null;
        // Prefer the cart's own USD total (same >1000-is-LBP conversion
        // used at checkout); fall back to a raw sum if unavailable.
        let valueUSD = null;
        try {
            if (typeof window._delivoCartTotalUSD === 'function') valueUSD = +window._delivoCartTotalUSD().toFixed(2);
        } catch (_) { /* fall through */ }
        return {
            items: c.items.reduce((s, i) => s + (i.qty || 1), 0),
            valueUSD,
            stores: [...new Set(c.items.map(i => i.storeName))].slice(0, 5),
        };
    }

    function _abandonSnapshot(keepalive = false) {
        if (!_attnPath || _funnel.ordered) return;
        const snap = _cartSnapshot();
        if (!snap) return;
        const auth = window._delivoAuthUser || null;
        fetch(`${RTDB_BASE}/${_attnPath}/abandonedCart.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...snap,
                at:       _correctedNow(),
                uid:      auth?.uid      || null,
                username: auth?.username || null,
            }),
            keepalive,
        }).catch(() => {});
    }

    window.DelivoAttn = {
        event(name) {
            switch (name) {
                case 'storeOpen':     _funnel.storeOpens++;     break;
                case 'addToCart':     _funnel.productAdds++;    break;
                case 'cartOpen':      _funnel.cartOpens++;      break;
                case 'checkoutStart': _funnel.checkoutStarts++; break;
                case 'order':
                    _funnel.ordered = true;
                    _funnelFlush(true);
                    // An order supersedes any abandoned-cart snapshot
                    // written earlier in this same visit.
                    if (_attnPath) rtdbDelete(`${_attnPath}/abandonedCart`);
                    return;
                default: return;
            }
            _funnelFlush();
        },
    };

    window.addEventListener('pagehide', () => { _funnelFlush(true, true); _abandonSnapshot(true); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return;
        _funnelFlush(true, true);
        _abandonSnapshot(true);
    });

    // Whether this device already has a captured visitor-lead record
    // (deviceLeads/{uuid} — full name + phone from the first-launch modal).
    // Checked once per page load; if true, we keep that record's
    // `lastVisit` field fresh on connect/heartbeat/reconnect so the admin
    // Visitors panel shows an actual up-to-date last-seen time (instead of
    // only ever showing the very first visit) and can keep a returning
    // visitor ranked by recency even after they disconnect.
    let _hasDeviceLead = false;

    async function _checkDeviceLead(uuid) {
        try {
            const lead = await rtdbGet(`deviceLeads/${uuid}`);
            _hasDeviceLead = !!lead;
        } catch (_) { _hasDeviceLead = false; }
    }

    function _touchDeviceLeadVisit(uuid) {
        if (!_hasDeviceLead) return;
        // Server-side timestamp, same convention as createdAt in
        // firebase-init.js's saveDeviceLead — a client clock can't be
        // trusted for chronological sorting in the admin panel.
        fetch(`${RTDB_BASE}/deviceLeads/${uuid}/lastVisit.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ '.sv': 'timestamp' }),
        }).catch(() => {});
    }

    // Same idea as _touchDeviceLeadVisit, but for logged-in customer
    // accounts. Accounts live in Firestore (fsGetCollection('users') on
    // the admin side), but presence/lastVisit tracking has always lived
    // in the Realtime Database — so rather than writing into Firestore
    // (a different security-rule surface entirely), this keeps a small
    // parallel RTDB node the admin panel merges in by uid. Only fires
    // when this session is actually authenticated as a customer.
    function _touchCustomerActivity() {
        const uid = window._delivoAuthUser?.uid;
        if (!uid) return;
        fetch(`${RTDB_BASE}/customerActivity/${uid}/lastActive.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ '.sv': 'timestamp' }),
        }).catch(() => {});
    }

    function buildPayload(uuid, connectedAt) {
        const auth = window._delivoAuthUser || null;
        const ua   = navigator.userAgent;
        let os = 'other';
        if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
        else if (/Android/i.test(ua))     os = 'android';
        return {
            uuid,
            uid:         auth?.uid      || null,
            username:    auth?.username || null,
            device:      /Mobi/i.test(ua) ? 'mobile' : 'desktop',
            os,          // 'ios' | 'android' | 'other' — lets the admin panel show 🍎/🤖 instead of a generic 📱
            connectedAt: connectedAt || _correctedNow(),
            lastSeen:    _correctedNow(),
        };
    }

    /* ── SDK path ───────────────────────────────────────────── */
    function initWithSDK(uuid, db) {
        _initServerTimeOffsetSDK(db);
        const ref          = db.ref(`presence/${uuid}`);
        const connectedRef = db.ref('.info/connected');

        let connectedAt    = null;
        let registered     = false;
        let reconnectTimer = null;

        connectedRef.on('value', async snap => {
            if (!snap.val()) return;
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(async () => {
                await ref.onDisconnect().remove().catch(() => {});
                if (!registered) {
                    registered = true;
                    const existing = await ref.once('value').catch(() => null);
                    connectedAt = (existing?.exists() && existing.val().connectedAt) || _correctedNow();
                    const payload = buildPayload(uuid, connectedAt);
                    await ref.set(payload).catch(() => {});
                    _attnBegin(uuid, payload.device, payload.os, connectedAt);
                } else {
                    // Reconnect: update only — never set() which triggers leave+join on admin
                    const existing = await ref.once('value').catch(() => null);
                    if (existing?.exists()) {
                        connectedAt = existing.val().connectedAt || connectedAt || _correctedNow();
                        await ref.update({ lastSeen: _correctedNow(), uid: window._delivoAuthUser?.uid || null, username: window._delivoAuthUser?.username || null }).catch(() => {});
                    } else {
                        connectedAt = _correctedNow();
                        await ref.set(buildPayload(uuid, connectedAt)).catch(() => {});
                    }
                }
                _touchDeviceLeadVisit(uuid);
                _touchCustomerActivity();
            }, 1500);
        });

        // Heartbeat: update() only, never delete+recreate
        setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            ref.update({
                lastSeen: _correctedNow(),
                uid:      window._delivoAuthUser?.uid      || null,
                username: window._delivoAuthUser?.username || null,
            }).catch(() => {
                connectedAt = connectedAt || _correctedNow();
                ref.onDisconnect().remove().catch(() => {});
                ref.set(buildPayload(uuid, connectedAt)).catch(() => {});
            });
            _touchDeviceLeadVisit(uuid);
            _touchCustomerActivity();
            _attnTouch();
        }, HEARTBEAT);

        // Visibility restore: quiet update, not re-register
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            ref.update({ lastSeen: _correctedNow(), uid: window._delivoAuthUser?.uid || null, username: window._delivoAuthUser?.username || null }).catch(() => {});
            _touchDeviceLeadVisit(uuid);
            _touchCustomerActivity();
            _attnTouch();
        });

        db.ref('presence').on('value', snap => {
            const raw = snap.val() || {};
            updateWidget(countActive(raw));
            sweepStale(raw, k => db.ref(`presence/${k}`).remove().catch(() => {}));
        });

        window._delivoPresence = {
            linkUser(uid, username) {
                window._delivoAuthUser = { uid, username };
                ref.update({ uid, username: username || null, lastSeen: _correctedNow() }).catch(() => {});
                _touchCustomerActivity();
                _attnMarkRegistered();
            },
            markDeviceLead() { _hasDeviceLead = true; _touchDeviceLeadVisit(uuid); _touchCustomerActivity(); }
        };
    }

    /* ── REST fallback ──────────────────────────────────────── */
    async function initWithREST(uuid) {
        await _initServerTimeOffsetREST();
        const path = `presence/${uuid}`;
        const restConnectedAt = _correctedNow();
        const restPayload = buildPayload(uuid, restConnectedAt);
        await rtdbPut(path, restPayload);
        _touchDeviceLeadVisit(uuid);
        _touchCustomerActivity();
        _attnBegin(uuid, restPayload.device, restPayload.os, restConnectedAt);

        const hb = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            rtdbPut(path, { ...buildPayload(uuid, restConnectedAt), lastSeen: _correctedNow() });
            _touchDeviceLeadVisit(uuid);
            _touchCustomerActivity();
            _attnTouch();
        }, HEARTBEAT);

        let cleaned = false;
        function cleanup() {
            if (cleaned) return; cleaned = true;
            clearInterval(hb); rtdbDelete(path, true);
        }
        window.addEventListener('pagehide',     cleanup);
        window.addEventListener('beforeunload', cleanup);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            cleaned = false;
            rtdbPut(path, { ...buildPayload(uuid, restConnectedAt), lastSeen: _correctedNow() });
            _touchDeviceLeadVisit(uuid);
            _touchCustomerActivity();
            _attnTouch();
        });

        async function pollCount() {
            const d   = await rtdbGet('presence');
            const raw = d || {};
            updateWidget(d ? countActive(raw) : 1);
            sweepStale(raw, k => rtdbDelete(`presence/${k}`));
        }
        pollCount();
        setInterval(pollCount, HEARTBEAT);

        window._delivoPresence = {
            linkUser(uid, username) {
                window._delivoAuthUser = { uid, username };
                rtdbPut(path, buildPayload(uuid, restConnectedAt));
                _touchCustomerActivity();
                _attnMarkRegistered();
            },
            markDeviceLead() { _hasDeviceLead = true; _touchDeviceLeadVisit(uuid); _touchCustomerActivity(); }
        };
    }

    function updateWidget(count) {
        _lastRealCount = count;
        const el = document.getElementById('hero-online-count');
        if (!el) return;
        const num = el.querySelector('.online-num');
        const dot = el.querySelector('.online-dot');
        if (!num) return;
        const displayCount = count + _boost;
        const prev = parseInt(num.textContent) || 0;
        if (prev === displayCount) return;
        num.style.transform = 'translateY(-5px)';
        num.style.opacity   = '0';
        setTimeout(() => {
            num.textContent     = displayCount;
            num.style.transform = 'translateY(0)';
            num.style.opacity   = '1';
        }, 180);
        dot?.classList.add('pulse');
        setTimeout(() => dot?.classList.remove('pulse'), 600);
    }

    function init() {
        setTimeout(async () => {
            loadBoostRange();
            const uuid = await getDeviceUUID();
            _checkDeviceLead(uuid); // fire-and-forget; heartbeat re-touches lastVisit regardless of exact timing
            function trySDK() {
                if (window.firebase?.database) { initWithSDK(uuid, window.firebase.database()); return true; }
                return false;
            }
            if (!trySDK()) setTimeout(() => { if (!trySDK()) initWithREST(uuid); }, 1500);
        }, 800);

        // Every 2 minutes: re-read the admin-configured range (in case it
        // changed) and roll a fresh random value within it.
        setInterval(loadBoostRange, BOOST_REROLL_MS);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();