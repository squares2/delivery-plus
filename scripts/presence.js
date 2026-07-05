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
    // count (settings/presenceBoost) — purely cosmetic "social proof",
    // never affects the actual presence data or count logic below.
    let _boost = 0;
    let _lastRealCount = null;
    async function loadBoost() {
        try {
            const r = await fetch(`${RTDB_BASE}/settings/presenceBoost.json`);
            const v = await r.json();
            _boost = (typeof v === 'number' && v > 0) ? v : 0;
        } catch (_) { _boost = 0; }
        // Reflect a boost change immediately rather than waiting for the
        // next real presence update.
        if (_lastRealCount !== null) updateWidget(_lastRealCount);
    }

    // Count only entries whose heartbeat is recent; anything older is a
    // leaked/zombie node (crashed tab, killed app, REST client that never
    // got to fire beforeunload) that never got cleaned up.
    function countActive(raw) {
        const cutoff = Date.now() - STALE_MS;
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
        const now = Date.now();
        if (now - lastSweep < SWEEP_MS) return;
        lastSweep = now;
        const cutoff = now - STALE_MS;
        for (const k in raw) {
            if (raw[k] && (raw[k].lastSeen || 0) < cutoff) deleteFn(k);
        }
    }

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

    function buildPayload(uuid, connectedAt) {
        const auth = window._delivoAuthUser || null;
        return {
            uuid,
            uid:         auth?.uid      || null,
            username:    auth?.username || null,
            device:      /Mobi/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            connectedAt: connectedAt || Date.now(),
            lastSeen:    Date.now(),
        };
    }

    /* ── SDK path ───────────────────────────────────────────── */
    function initWithSDK(uuid, db) {
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
                    connectedAt = (existing?.exists() && existing.val().connectedAt) || Date.now();
                    await ref.set(buildPayload(uuid, connectedAt)).catch(() => {});
                } else {
                    // Reconnect: update only — never set() which triggers leave+join on admin
                    const existing = await ref.once('value').catch(() => null);
                    if (existing?.exists()) {
                        connectedAt = existing.val().connectedAt || connectedAt || Date.now();
                        await ref.update({ lastSeen: Date.now(), uid: window._delivoAuthUser?.uid || null, username: window._delivoAuthUser?.username || null }).catch(() => {});
                    } else {
                        connectedAt = Date.now();
                        await ref.set(buildPayload(uuid, connectedAt)).catch(() => {});
                    }
                }
            }, 1500);
        });

        // Heartbeat: update() only, never delete+recreate
        setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            ref.update({
                lastSeen: Date.now(),
                uid:      window._delivoAuthUser?.uid      || null,
                username: window._delivoAuthUser?.username || null,
            }).catch(() => {
                connectedAt = connectedAt || Date.now();
                ref.onDisconnect().remove().catch(() => {});
                ref.set(buildPayload(uuid, connectedAt)).catch(() => {});
            });
        }, HEARTBEAT);

        // Visibility restore: quiet update, not re-register
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            ref.update({ lastSeen: Date.now(), uid: window._delivoAuthUser?.uid || null, username: window._delivoAuthUser?.username || null }).catch(() => {});
        });

        db.ref('presence').on('value', snap => {
            const raw = snap.val() || {};
            updateWidget(countActive(raw));
            sweepStale(raw, k => db.ref(`presence/${k}`).remove().catch(() => {}));
        });

        window._delivoPresence = {
            linkUser(uid, username) {
                window._delivoAuthUser = { uid, username };
                ref.update({ uid, username: username || null, lastSeen: Date.now() }).catch(() => {});
            }
        };
    }

    /* ── REST fallback ──────────────────────────────────────── */
    async function initWithREST(uuid) {
        const path = `presence/${uuid}`;
        const restConnectedAt = Date.now();
        await rtdbPut(path, buildPayload(uuid, restConnectedAt));

        const hb = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            rtdbPut(path, { ...buildPayload(uuid, restConnectedAt), lastSeen: Date.now() });
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
            rtdbPut(path, { ...buildPayload(uuid, restConnectedAt), lastSeen: Date.now() });
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
            }
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
        setTimeout(() => {
            loadBoost();
            const uuid = getDeviceUUID();
            function trySDK() {
                if (window.firebase?.database) { initWithSDK(uuid, window.firebase.database()); return true; }
                return false;
            }
            if (!trySDK()) setTimeout(() => { if (!trySDK()) initWithREST(uuid); }, 1500);
        }, 800);

        // Re-check periodically in case the admin changes the boost value
        // while this tab is already open — cheap single-field read.
        setInterval(loadBoost, 60 * 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();