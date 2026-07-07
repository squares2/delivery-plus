/* ============================================================
   admin-presence.js — Admin real-time presence monitor

   KEY FIX: STALE_MS raised to 45s so the admin never sweeps
   a live user whose heartbeat (8s) hasn't arrived yet.
   Old value was 15s which was shorter than the old 20s heartbeat
   — that's what caused the constant leave/join bounce.
   ============================================================ */

(function () {
    'use strict';

    const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const STALE_MS  = 45_000;   // MUST be > client HEARTBEAT (8s) with large margin
    const TOAST_DUR = 6_000;

    // Ignore join/leave events within this window of page load
    // (avoids toasts firing for every user already online when admin opens)
    const BOOT_GRACE_MS = 4_000;
    const bootTime = Date.now();

    let prevSessions = {};
    let modalOpen    = false;

    // Admin-only feature. Two different account types share this loaded
    // script but must never see it: 'store' (shares the main #app dashboard
    // with real admins, just fewer permissions) and 'company' (its own
    // fully separate #company-portal). Both end up with this script running
    // in the background regardless, so every visible surface (toasts, the
    // topbar chip, the modal itself) needs this same check.
    function _presenceBlockedForRole() {
        const role = window.currentAdmin?.role;
        return role === 'store' || role === 'company';
    }

    function displayName(s) {
        if (s.username) return `@${s.username}`;
        if (s.uid)      return `uid·${s.uid.slice(0, 12)}`;
        return `uuid·${(s.uuid || s.sid || '?').slice(0, 13)}`;
    }

    function shortUUID(s) {
        return (s.uuid || s.sid || '').slice(0, 18) + '…';
    }

    function deviceIcon(s) {
        return (s.device === 'mobile') ? '📱' : '💻';
    }

    /* ── Match a session's device UUID against registered accounts ──
       Covers the case where a visitor is browsing logged-out (or was
       never logged in this session) but their device fingerprint
       already belongs to one or more registered users — e.g. they
       registered earlier and are now just browsing signed out. */
    function matchRegisteredAccounts(uuid) {
        if (!uuid) return [];
        const users = window.allUsers || {};
        return Object.entries(users)
            .filter(([, u]) => u && u.deviceUUID === uuid)
            .map(([uid, u]) => ({ uid, username: u.username, name: u.displayName || u.fullname || u.username || '—' }));
    }

    function typeTag(s) {
        if (s.username) return `<span class="ps-tag ps-tag--user">مسجّل</span>`;
        if (s.uid)      return `<span class="ps-tag ps-tag--uid">uid</span>`;
        return `<span class="ps-tag ps-tag--guest">زائر</span>`;
    }

    /* ── Stale sweep ────────────────────────────────────────── */
    async function sweepStale(sessions) {
        const cutoff = Date.now() - STALE_MS;
        const stale  = Object.entries(sessions).filter(([, v]) => (v.lastSeen || 0) < cutoff);
        await Promise.all(stale.map(([k]) =>
            fetch(`${RTDB_BASE}/presence/${k}.json`, { method: 'DELETE' }).catch(() => {})
        ));
        stale.forEach(([k]) => delete sessions[k]);
    }

    /* ── Toast ──────────────────────────────────────────────── */
    function showToast(session, type) {
        // Admin-only feature — never surface these for store/company accounts.
        if (_presenceBlockedForRole()) return;
        // Suppress toasts during boot grace period (avoids flood on page load)
        if (Date.now() - bootTime < BOOT_GRACE_MS) return;

        const box = document.getElementById('presence-toasts');
        if (!box) return;

        const isJoin = type === 'join';
        const name   = displayName(session);
        const icon   = deviceIcon(session);
        const color  = isJoin ? '#22c55e' : '#ef4444';
        const uuid   = (session.uuid || session.sid || '').slice(0, 16);

        const t = document.createElement('div');
        t.className = `presence-toast presence-toast--${type}`;
        t.innerHTML = `
            <div class="pt-dot" style="background:${color}"></div>
            <div class="pt-body">
                <div class="pt-name">${icon} ${name}</div>
                <div class="pt-uuid">${uuid}…</div>
                <div class="pt-action" style="color:${color}">${isJoin ? '🟢 اتصل بالموقع' : '🔴 غادر الموقع'}</div>
            </div>
            <button class="pt-close" onclick="this.parentElement.remove()">✕</button>`;

        box.appendChild(t);
        requestAnimationFrame(() => t.classList.add('presence-toast--in'));
        setTimeout(() => {
            t.classList.remove('presence-toast--in');
            setTimeout(() => t.remove(), 350);
        }, TOAST_DUR);
    }

    /* ── Diff & notify ──────────────────────────────────────── */
    function diffAndNotify(current) {
        const cur = new Set(Object.keys(current));
        const prv = new Set(Object.keys(prevSessions));

        for (const sid of cur) {
            if (!prv.has(sid)) showToast(current[sid], 'join');
        }
        for (const sid of prv) {
            if (!cur.has(sid)) showToast(prevSessions[sid], 'leave');
        }
        prevSessions = { ...current };
    }

    /* ── Chip update ────────────────────────────────────────── */
    function updateChip(count) {
        const el = document.getElementById('admin-online-count');
        if (el) {
            el.style.transform  = 'scale(1.3)';
            el.style.transition = 'transform 0.2s';
            setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
            el.textContent = count;
        }
    }

    /* ── Time ago ───────────────────────────────────────────── */
    function timeAgo(ts) {
        if (!ts) return '–';
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60)   return `${s} ث`;
        if (s < 3600) return `${Math.floor(s / 60)} د`;
        return `${Math.floor(s / 3600)} س`;
    }

    /* ── Modal render ───────────────────────────────────────── */
    function renderModal(sessions) {
        const list    = document.getElementById('pm-list');
        const counter = document.getElementById('pm-count');
        if (!list) return;

        const entries = Object.values(sessions).sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0));
        if (counter) counter.textContent = entries.length;

        if (entries.length === 0) {
            list.innerHTML = `<div class="pm-empty">
                <div style="font-size:2rem">👥</div>
                <div>لا يوجد زوار متصلون حالياً</div>
            </div>`;
            return;
        }

        list.innerHTML = entries.map((s, i) => {
            const name   = displayName(s);
            const icon   = deviceIcon(s);
            const ago    = timeAgo(s.connectedAt);
            const isUser = !!s.username;
            const uuid   = (s.uuid || s.sid || '');

            // Not logged in right now — check if this device fingerprint
            // already belongs to one or more registered (but logged-out) accounts
            const matches = isUser ? [] : matchRegisteredAccounts(uuid);

            return `
            <div class="pm-row ${isUser ? 'pm-row--user' : ''}" data-connected="${s.connectedAt || Date.now()}">
                <div class="pm-rank">${i + 1}</div>
                <div class="pm-live-dot"></div>
                <div class="pm-info">
                    <div class="pm-name" style="font-size:1.05rem">${icon} ${name} ${typeTag(s)}</div>
                    <div class="pm-uuid-full">🔑 ${uuid}</div>
                    ${matches.length ? `
                    <div class="pm-known-account">
                        🔗 هذا الجهاز مسجّل باسم:
                        ${matches.map(m => `<button class="pm-known-account-btn" data-username="${m.username||''}" data-uid="${m.uid}">@${m.username||m.name}</button>`).join(' ')}
                    </div>` : ''}
                    <div class="pm-meta">
                        <span class="pm-timer" data-ts="${s.connectedAt || Date.now()}">⏱ ${ago}</span>
                        ${s.username && s.uid ? `<span class="pm-uid-badge">uid·${s.uid.slice(0,12)}</span>` : ''}
                    </div>
                </div>
                <div class="pm-device" style="font-size:.85rem">${s.device === 'mobile' ? '📱 موبايل' : '💻 ويب'}</div>
            </div>`;
        }).join('');

        // Wire "jump to this account in Customers" buttons
        list.querySelectorAll('.pm-known-account-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const uname = btn.dataset.username;
                if (typeof window.switchPanel === 'function') window.switchPanel('customers');
                const search = document.getElementById('customers-search');
                if (search) {
                    search.value = uname || '';
                    search.dispatchEvent(new Event('input'));
                }
                window.togglePresencePanel();
            });
        });
    }

    /* ── Live timer tick ────────────────────────────────────── */
    function startTimerTick() {
        setInterval(() => {
            if (!modalOpen) return;
            document.querySelectorAll('.pm-timer[data-ts]').forEach(el => {
                const ts  = parseInt(el.getAttribute('data-ts'));
                const sec = Math.floor((Date.now() - ts) / 1000);
                let label;
                if (sec < 60)        label = `${sec} ث`;
                else if (sec < 3600) label = `${Math.floor(sec/60)} د ${sec%60} ث`;
                else                 label = `${Math.floor(sec/3600)} س ${Math.floor((sec%3600)/60)} د`;
                el.textContent = `⏱ ${label}`;
            });
        }, 1000);
    }

    /* ── Toggle modal ───────────────────────────────────────── */
    window.togglePresencePanel = function () {
        // Admin-only feature — store/company accounts share this loaded
        // script but must never see who's browsing the customer-facing site.
        if (_presenceBlockedForRole()) return;
        const overlay = document.getElementById('presence-modal');
        if (!overlay) return;
        modalOpen = !modalOpen;
        overlay.classList.toggle('pm-overlay--hidden', !modalOpen);
        if (modalOpen) renderModal(prevSessions);
    };

    /* ── Inject HTML ────────────────────────────────────────── */
    function injectHTML() {
        document.getElementById('presence-panel')?.remove();
        document.body.insertAdjacentHTML('beforeend', `
        <div id="presence-toasts"></div>
        <div id="presence-modal" class="pm-overlay pm-overlay--hidden" onclick="if(event.target===this)togglePresencePanel()">
            <div class="pm-modal">
                <div class="pm-header">
                    <span class="pm-header-dot"></span>
                    <span class="pm-header-title">الزوار المتصلون الآن</span>
                    <span id="pm-count" class="pm-header-count">0</span>
                    <button class="pm-close" onclick="togglePresencePanel()">✕</button>
                </div>
                <div id="pm-list" class="pm-list">
                    <div class="pm-empty"><div style="font-size:3rem">👥</div><div>لا يوجد زوار متصلون حالياً</div></div>
                </div>
            </div>
        </div>`);
    }

    /* ── CSS ────────────────────────────────────────────────── */
    function injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
        .admin-online-dot {
            display:inline-block; width:7px; height:7px; border-radius:50%;
            background:#22c55e; flex-shrink:0;
            box-shadow:0 0 0 0 rgba(34,197,94,.7);
            animation:admPing 1.8s ease-in-out infinite;
        }
        @keyframes admPing {
            0%  { box-shadow:0 0 0 0   rgba(34,197,94,.7); }
            70% { box-shadow:0 0 0 6px rgba(34,197,94,0);  }
            100%{ box-shadow:0 0 0 0   rgba(34,197,94,0);  }
        }
        #presence-toasts {
            position:fixed; bottom:20px; left:20px; z-index:99999;
            display:flex; flex-direction:column-reverse; gap:8px; pointer-events:none;
        }
        .presence-toast {
            display:flex; align-items:center; gap:10px;
            background:var(--surface,#1e1e2e); border:1px solid var(--border,#2a2a3a);
            border-radius:12px; padding:10px 14px;
            min-width:240px; max-width:310px;
            box-shadow:0 4px 24px rgba(0,0,0,.45);
            pointer-events:all; direction:rtl;
            opacity:0; transform:translateX(-20px);
            transition:opacity .3s, transform .3s;
        }
        .presence-toast--in  { opacity:1; transform:translateX(0); }
        .presence-toast--join  { border-color:rgba(34,197,94,.35); }
        .presence-toast--leave { border-color:rgba(239,68,68,.35); }
        .pt-dot   { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
        .pt-body  { flex:1;min-width:0; }
        .pt-name  { font-size:.78rem;font-weight:700;color:var(--gray-light,#e2e8f0);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .pt-action{ font-size:.65rem;font-weight:600;margin-top:2px; }
        .pt-close { background:none;border:none;color:var(--gray,#6b7280);
                    cursor:pointer;font-size:.8rem;padding:0;flex-shrink:0; }
        .pm-overlay {
            position:fixed;inset:0;z-index:88888;
            background:rgba(0,0,0,.65);backdrop-filter:blur(6px);
            display:flex;align-items:center;justify-content:center;
            transition:opacity .25s;
        }
        .pm-overlay--hidden { opacity:0;pointer-events:none; }
        .pm-modal {
            background:var(--surface,#1e1e2e);
            border:1px solid var(--border,#2a2a3a);
            border-radius:22px; width:min(780px,95vw); max-height:82vh;
            display:flex;flex-direction:column;
            box-shadow:0 12px 64px rgba(0,0,0,.6);
            direction:rtl; overflow:hidden;
        }
        .pm-header {
            display:flex;align-items:center;gap:14px;
            padding:22px 28px; border-bottom:1px solid var(--border,#2a2a3a); flex-shrink:0;
        }
        .pm-header-dot {
            width:14px;height:14px;border-radius:50%;background:#22c55e;
            box-shadow:0 0 0 0 rgba(34,197,94,.7);
            animation:admPing 1.8s ease-in-out infinite;flex-shrink:0;
        }
        .pm-header-title { font-size:1.15rem;font-weight:800;color:var(--gray-light,#e2e8f0); }
        .pm-header-count {
            margin-right:auto;
            background:rgba(34,197,94,.15);color:#22c55e;
            border:1px solid rgba(34,197,94,.3);
            border-radius:99px;padding:4px 18px;
            font-size:1rem;font-weight:900;
        }
        .pm-close {
            background:none;border:none;color:var(--gray,#6b7280);
            cursor:pointer;font-size:1.3rem;padding:6px 10px;border-radius:8px;
            transition:background .2s;
        }
        .pm-close:hover { background:rgba(255,255,255,.08); }
        .pm-list { flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px; }
        .pm-empty {
            text-align:center;color:var(--gray,#6b7280);
            font-size:1rem;padding:60px 0;display:flex;
            flex-direction:column;align-items:center;gap:12px;
        }
        .pm-row {
            display:flex;align-items:center;gap:16px;
            background:var(--surface2,#252535);
            border:1px solid var(--border,#2a2a3a);
            border-radius:14px;padding:18px 22px;
            transition:border-color .2s, background .2s;
        }
        .pm-row:hover { background:rgba(255,255,255,.03); }
        .pm-row--user { border-color:rgba(255,92,0,.3); }
        .pm-rank { font-size:.9rem;font-weight:900;color:var(--gray,#6b7280);width:24px;text-align:center;flex-shrink:0; }
        .pm-live-dot { width:12px;height:12px;border-radius:50%;background:#22c55e;flex-shrink:0;box-shadow:0 0 8px rgba(34,197,94,.7); }
        .pm-info { flex:1;min-width:0; }
        .pm-name { font-size:1rem;font-weight:700;color:var(--gray-light,#e2e8f0);display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
        .pm-meta { font-size:.8rem;color:var(--gray,#6b7280);margin-top:5px;display:flex;gap:14px;align-items:center; }
        .pm-device { font-size:.78rem;font-weight:700;color:var(--gray,#6b7280);background:rgba(255,255,255,.07);border-radius:8px;padding:4px 12px;flex-shrink:0; }
        .ps-tag { font-size:.72rem;font-weight:800;border-radius:99px;padding:2px 10px;border:1px solid; }
        .ps-tag--user  { color:#f97316;border-color:rgba(249,115,22,.4);background:rgba(249,115,22,.1); }
        .ps-tag--uid   { color:#818cf8;border-color:rgba(129,140,248,.4);background:rgba(129,140,248,.1); }
        .ps-tag--guest { color:#6b7280;border-color:rgba(107,114,128,.3);background:rgba(107,114,128,.08); }
        .pm-uuid-full {
            font-family:monospace;font-size:.74rem;color:#64748b;
            letter-spacing:.04em;margin-top:4px;word-break:break-all;
            background:rgba(255,255,255,.04);border-radius:6px;
            padding:3px 8px;border:1px solid rgba(255,255,255,.06);
            user-select:all;cursor:text;
        }
        .pm-uid-badge { font-family:monospace;font-size:.68rem;color:#818cf8;background:rgba(129,140,248,.1);border-radius:4px;padding:1px 6px; }
        .pm-known-account {
            font-size:.72rem;color:#f59e0b;margin-top:5px;
            display:flex;align-items:center;gap:6px;flex-wrap:wrap;
        }
        .pm-known-account-btn {
            font-family:inherit;font-size:.72rem;font-weight:800;color:#f59e0b;
            background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);
            border-radius:99px;padding:2px 10px;cursor:pointer;
        }
        .pm-known-account-btn:hover { background:rgba(245,158,11,.2); }
        .pt-uuid { font-family:monospace;font-size:.58rem;color:var(--gray,#6b7280);margin-top:1px;letter-spacing:.02em; }
        .pm-timer { font-variant-numeric:tabular-nums; }
        `;
        document.head.appendChild(style);
    }

    /* ── Firebase SDK listener ──────────────────────────────── */
    function initWithSDK(db) {
        const presenceRef = db.ref('presence');
        presenceRef.on('value', async snap => {
            const raw      = snap.val() || {};
            const sessions = { ...raw };
            await sweepStale(sessions);
            diffAndNotify(sessions);
            updateChip(Object.keys(sessions).length);
            if (modalOpen) renderModal(sessions);
            prevSessions = { ...sessions };
            window._delivoOnlineSessions = prevSessions; // exposed for the live map / customers list
        });
    }

    /* ── REST fallback ──────────────────────────────────────── */
    async function pollREST() {
        try {
            const r   = await fetch(`${RTDB_BASE}/presence.json`);
            const raw = await r.json();
            const sessions = raw && typeof raw === 'object' ? { ...raw } : {};
            await sweepStale(sessions);
            diffAndNotify(sessions);
            updateChip(Object.keys(sessions).length);
            if (modalOpen) renderModal(sessions);
            prevSessions = { ...sessions };
            window._delivoOnlineSessions = prevSessions; // exposed for the live map / customers list
        } catch (_) {}
    }

    /* ── Init ───────────────────────────────────────────────── */
    function init() {
        injectCSS();
        injectHTML();
        startTimerTick();

        function trySDK() {
            if (window.firebase?.database) { initWithSDK(window.firebase.database()); return true; }
            return false;
        }

        if (!trySDK()) {
            setTimeout(() => {
                if (!trySDK()) { pollREST(); setInterval(pollREST, 8_000); }
            }, 1500);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();