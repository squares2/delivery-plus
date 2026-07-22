/* ============================================================
   attendance-admin.js — Admin Attendance / Momentum dashboard

   Reads the persistent log written by presence.js
   (attendance/sessions/{date}/{key}, attendance/devices/{uuid}) and
   renders KPI cards + hand-built SVG charts: daily visit momentum,
   new-vs-returning devices, registered-vs-guest mix, average
   time-on-site, and today's hourly rhythm.

   Nothing here ever touches `presence/` (the live/ephemeral node) —
   this is a read-only reporting layer on top of a separate, never-
   deleted log, so it can't affect the live "الزوار المتصلون" system.
   ============================================================ */

(function () {
    'use strict';

    const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    const COLOR = {
        orange: '#FF5C00', orangeDim: 'rgba(255,92,0,.16)',
        green:  '#22c55e', greenDim:  'rgba(34,197,94,.16)',
        blue:   '#3b82f6', blueDim:   'rgba(59,130,246,.16)',
        purple: '#a855f7', purpleDim: 'rgba(168,85,247,.16)',
        yellow: '#f59e0b', yellowDim: 'rgba(245,158,11,.16)',
        gray:   '#6b6b82',
    };

    let currentRange = 30;         // days
    let hourlyOffset = 0;          // days back from today — which single day the hourly-rhythm chart shows
    let _cache       = null;       // last computed dataset, for range-pill re-render w/o refetch when possible
    let _loading     = false;
    let _abandonedCollapsed = localStorage.getItem('delivo_admin_att_abandoned_collapsed') !== '0'; // shrunk by default; '0' means the admin explicitly expanded it before

    /* ── Date helpers (Beirut calendar day, matching presence.js) ──── */
    function beirutDateKey(ts) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(ts));
    }
    function beirutHour(ts) {
        const s = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Beirut', hour: '2-digit', hourCycle: 'h23',
        }).format(new Date(ts));
        return parseInt(s, 10) || 0;
    }
    function dayLabel(dateKey) {
        const d = new Date(dateKey + 'T12:00:00');
        return d.toLocaleDateString('ar-LB', { day: 'numeric', month: 'short' });
    }
    function weekdayLabel(dateKey) {
        const d = new Date(dateKey + 'T12:00:00');
        return d.toLocaleDateString('ar-LB', { weekday: 'short' });
    }
    function fmtDuration(ms) {
        if (!ms || ms <= 0) return '—';
        const mins = Math.round(ms / 60000);
        if (mins < 1)  return `${Math.round(ms / 1000)} ث`;
        if (mins < 60) return `${mins} د`;
        return `${Math.floor(mins / 60)} س ${mins % 60} د`;
    }
    function fmtNum(n) { return (n || 0).toLocaleString('en-US'); }

    /* ── Fetch ──────────────────────────────────────────────────── */
    async function fetchSessionsRange(days) {
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        const startKey = beirutDateKey(start.getTime());
        const url = `${RTDB_BASE}/attendance/sessions.json`
            + `?orderBy=${encodeURIComponent('"$key"')}`
            + `&startAt=${encodeURIComponent('"' + startKey + '"')}`;
        try {
            const r = await fetch(url);
            const j = await r.json();
            return j || {};
        } catch (_) { return {}; }
    }

    // Single day's sessions — used only to page the hourly-rhythm chart
    // back to an earlier day, independent of the main range/period above.
    async function fetchSessionsForDay(dateKey) {
        try {
            const r = await fetch(`${RTDB_BASE}/attendance/sessions/${dateKey}.json`);
            const j = await r.json();
            return j || {};
        } catch (_) { return {}; }
    }

    function dayKeyForOffset(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() - offsetDays);
        return beirutDateKey(d.getTime());
    }

    async function fetchDevices() {
        try {
            const r = await fetch(`${RTDB_BASE}/attendance/devices.json`);
            const j = await r.json();
            return j || {};
        } catch (_) { return {}; }
    }

    // ── Attendance exclusions — lets an admin keep their own test/dev
    // device (or a tester/employee account) out of the visitor counts,
    // since someone constantly reloading the site to check a deploy
    // isn't a real visitor. Stored at settings/attendanceExclusions:
    //   { devices: {uuid: {label, addedAt}}, accounts: {uid: {label, addedAt}} }
    async function fetchAttendanceExclusions() {
        try {
            const r = await fetch(`${RTDB_BASE}/settings/attendanceExclusions.json`);
            const j = await r.json();
            return j || {};
        } catch (_) { return {}; }
    }

    async function _attAddExclusion(kind, key, label) {
        const r = await fetch(`${RTDB_BASE}/settings/attendanceExclusions/${kind}/${key}.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: label || '', addedAt: Date.now() }),
        });
        if (!r.ok) throw new Error(`RTDB PUT ${r.status}`);
    }

    async function _attRemoveExclusion(kind, key) {
        const r = await fetch(`${RTDB_BASE}/settings/attendanceExclusions/${kind}/${key}.json`, { method: 'DELETE' });
        if (!r.ok) throw new Error(`RTDB DELETE ${r.status}`);
    }

    // Builds the effective set of device UUIDs to drop from every count —
    // the raw excluded devices, plus (best-effort) the current device UUID
    // on file for each excluded account. Sessions only ever store `uuid`,
    // never `uid`, so an account exclusion has to be resolved this way;
    // if that account logs in from a new device later, its old exclusion
    // won't follow automatically (same limitation admin-presence.js's own
    // account matching has).
    function _attBuildExcludedUuidSet(exclusions) {
        const set = new Set(Object.keys(exclusions.devices || {}));
        const excludedUids = new Set(Object.keys(exclusions.accounts || {}));
        if (excludedUids.size && window.allUsers) {
            Object.entries(window.allUsers).forEach(([uid, u]) => {
                if (excludedUids.has(uid) && u && u.deviceUUID) set.add(u.deviceUUID);
            });
        }
        return set;
    }

    function _attStripExcluded(sessionsByDate, excludedSet) {
        if (!excludedSet.size) return sessionsByDate;
        const out = {};
        Object.entries(sessionsByDate || {}).forEach(([dateKey, bucket]) => {
            const kept = {};
            Object.entries(bucket || {}).forEach(([k, s]) => { if (!excludedSet.has(s.uuid)) kept[k] = s; });
            out[dateKey] = kept;
        });
        return out;
    }

    /* ── Aggregate ──────────────────────────────────────────────── */
    function buildDayList(days) {
        const out = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            out.push(beirutDateKey(d.getTime()));
        }
        return out;
    }

    function aggregate(sessionsByDate, days, devices) {
        const dayKeys = buildDayList(days);
        const todayKey = dayKeys[dayKeys.length - 1];
        const yesterdayKey = dayKeys.length > 1 ? dayKeys[dayKeys.length - 2] : null;

        const abandonedCarts = []; // range-wide, newest first (filled below)

        const perDay = dayKeys.map(dateKey => {
            const list = Object.values(sessionsByDate[dateKey] || {});
            let newDev = 0, registered = 0, durSum = 0, durCount = 0;
            let browsed = 0, addedToCart = 0, cartOpened = 0, checkoutStarted = 0, ordered = 0, bounces = 0;
            let trackedCount = 0; // sessions on this day that actually have a `funnel` node (tracking was live)
            const deviceKinds = { mobile: 0, desktop: 0, ios: 0, android: 0, other: 0 };

            list.forEach(s => {
                if (s.isNew) newDev++;
                if (s.isRegistered) registered++;
                const dur = Math.max(0, (s.lastSeen || s.startedAt) - s.startedAt);
                if (dur > 0 && dur < 6 * 3600 * 1000) { durSum += dur; durCount++; } // cap crashed/zombie outliers
                if (s.device === 'mobile') deviceKinds.mobile++; else deviceKinds.desktop++;
                if (s.os === 'ios') deviceKinds.ios++; else if (s.os === 'android') deviceKinds.android++; else deviceKinds.other++;

                // ── Funnel (sessions recorded before this feature shipped
                // simply have no `funnel` node at all — distinct from a
                // tracked session with zero events, so we can tell them
                // apart and scope the funnel to only tracked days) ──
                if (s.funnel !== undefined) trackedCount++;
                const f = s.funnel || {};
                const hasEvent = (f.storeOpens || f.productAdds || f.cartOpens || f.checkoutStarts || f.ordered);
                if (f.storeOpens)     browsed++;
                if (f.productAdds)    addedToCart++;
                if (f.cartOpens)      cartOpened++;
                if (f.checkoutStarts) checkoutStarted++;
                if (f.ordered)        ordered++;
                // Bounce = in-and-out with nothing done: no funnel event
                // and under 30 seconds on site.
                if (!hasEvent && dur < 30 * 1000) bounces++;

                if (s.abandonedCart && !f.ordered) {
                    abandonedCarts.push({ ...s.abandonedCart, date: dateKey, device: s.device, os: s.os });
                }
            });

            return {
                date: dateKey,
                total: list.length,
                newDevices: newDev,
                returning: list.length - newDev,
                registered,
                guest: list.length - registered,
                avgDurationMs: durCount ? durSum / durCount : 0,
                deviceKinds,
                browsed, addedToCart, cartOpened, checkoutStarted, ordered, bounces,
                trackedCount,
            };
        });

        abandonedCarts.sort((a, b) => (b.at || 0) - (a.at || 0));

        // Today's hourly rhythm. Guard against a stray session logged with
        // a future startedAt (a visitor device with a wrong clock, before
        // the presence.js server-time fix) — showing an hour that hasn't
        // happened yet is never correct, so those are dropped here rather
        // than displayed.
        const now = Date.now();
        const hourly = new Array(24).fill(0);
        Object.values(sessionsByDate[todayKey] || {}).forEach(s => {
            if (!s.startedAt || s.startedAt > now) return;
            hourly[beirutHour(s.startedAt)]++;
        });

        const todayRow     = perDay[perDay.length - 1];
        const yesterdayRow = yesterdayKey ? perDay.find(r => r.date === yesterdayKey) : null;

        const totalVisits   = perDay.reduce((a, r) => a + r.total, 0);
        const totalNew      = perDay.reduce((a, r) => a + r.newDevices, 0);
        const totalReg      = perDay.reduce((a, r) => a + r.registered, 0);
        const durRows       = perDay.filter(r => r.avgDurationMs > 0);
        const avgDurAll     = durRows.length ? durRows.reduce((a, r) => a + r.avgDurationMs, 0) / durRows.length : 0;

        // ── Scope the funnel to days that actually have tracking data.
        // Sessions logged before the funnel feature shipped have no
        // `funnel` node at all — mixing them in as "visits" massively
        // deflates every conversion percentage. Find the first day with
        // any tracked session and sum the funnel only from there forward,
        // so the numbers are honest from day one instead of only
        // becoming accurate after weeks of new data pile up.
        const funnelStartIdx = perDay.findIndex(r => r.trackedCount > 0);
        const funnelRows_    = funnelStartIdx === -1 ? [] : perDay.slice(funnelStartIdx);
        const funnelTotals = {
            visits:          funnelRows_.reduce((a, r) => a + r.total, 0),
            browsed:         funnelRows_.reduce((a, r) => a + r.browsed, 0),
            addedToCart:     funnelRows_.reduce((a, r) => a + r.addedToCart, 0),
            cartOpened:      funnelRows_.reduce((a, r) => a + r.cartOpened, 0),
            checkoutStarted: funnelRows_.reduce((a, r) => a + r.checkoutStarted, 0),
            ordered:         funnelRows_.reduce((a, r) => a + r.ordered, 0),
            bounces:         funnelRows_.reduce((a, r) => a + r.bounces, 0),
            startKey:        funnelStartIdx === -1 ? null : perDay[funnelStartIdx].date,
            daysCount:       funnelRows_.length,
        };

        return {
            perDay, hourly, todayRow, yesterdayRow,
            totalDevicesEver: Object.keys(devices || {}).length,
            rangeTotals: { totalVisits, totalNew, totalReg, avgDurAll },
            funnelTotals,
            abandonedCarts,
        };
    }

    /* ── SVG chart builders ────────────────────────────────────── */
    const VB_W = 1000, VB_H = 280;
    const PAD  = { l: 34, r: 14, t: 18, b: 28 };

    function niceMax(v) {
        if (v <= 0) return 4;
        const p = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / p;
        const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
        return step * p;
    }

    function gridAndLabels(maxVal, days) {
        const innerH = VB_H - PAD.t - PAD.b;
        const innerW = VB_W - PAD.l - PAD.r;
        let svg = '';
        // horizontal grid lines (4 bands)
        for (let i = 0; i <= 4; i++) {
            const y = PAD.t + innerH - (innerH * i / 4);
            const val = Math.round(maxVal * i / 4);
            svg += `<line x1="${PAD.l}" y1="${y}" x2="${VB_W - PAD.r}" y2="${y}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
            svg += `<text x="${PAD.l - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--gray,#6b6b82)" font-family="var(--mono,monospace)">${val}</text>`;
        }
        // x-axis day labels (thin out if many days)
        const every = days <= 10 ? 1 : days <= 31 ? Math.ceil(days / 10) : Math.ceil(days / 8);
        return { svg, innerH, innerW, every };
    }

    function svgLineArea(rows, valueKey, opts) {
        opts = opts || {};
        const color = opts.color || COLOR.orange;
        const dim   = opts.dim   || COLOR.orangeDim;
        const gid   = 'grad_' + Math.random().toString(36).slice(2, 9);
        const maxVal = niceMax(Math.max(...rows.map(r => r[valueKey]), 1) * 1.15);
        const { svg: grid, innerH, innerW, every } = gridAndLabels(maxVal, rows.length);
        const n = rows.length;
        const stepX = n > 1 ? innerW / (n - 1) : 0;

        const pts = rows.map((r, i) => {
            const x = PAD.l + i * stepX;
            const y = PAD.t + innerH - (innerH * (r[valueKey] / maxVal));
            return { x, y, r };
        });

        const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
        const areaPath = linePath + ` L${pts[pts.length - 1].x.toFixed(1)},${PAD.t + innerH} L${pts[0].x.toFixed(1)},${PAD.t + innerH} Z`;

        // 7-day moving average (only when enough points) — shows the underlying momentum trend
        let avgPath = '';
        if (n >= 7 && opts.showAvg !== false) {
            const win = 7;
            const avgPts = rows.map((r, i) => {
                const lo = Math.max(0, i - win + 1);
                const slice = rows.slice(lo, i + 1);
                const avg = slice.reduce((a, s) => a + s[valueKey], 0) / slice.length;
                const x = PAD.l + i * stepX;
                const y = PAD.t + innerH - (innerH * (avg / maxVal));
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            avgPath = `<polyline points="${avgPts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".55"/>`;
        }

        const dots = pts.map((p, i) => {
            const showLabel = i % every === 0 || i === n - 1;
            return `
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="transparent">
                    <title>${dayLabel(p.r.date)} — ${fmtNum(p.r[valueKey])}${opts.suffix || ''}</title>
                </circle>
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"/>
                ${showLabel ? `<text x="${p.x.toFixed(1)}" y="${VB_H - 8}" text-anchor="middle" font-size="9.5" fill="var(--gray,#6b6b82)">${dayLabel(p.r.date)}</text>` : ''}`;
        }).join('');

        return `
        <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="none" style="width:100%;height:230px;overflow:visible;">
            <defs>
                <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity=".38"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${grid}
            <path d="${areaPath}" fill="url(#${gid})"/>
            <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
            ${avgPath}
            ${dots}
        </svg>`;
    }

    function svgStackedBars(rows, keyA, keyB, colorA, colorB, labelA, labelB) {
        const maxVal = niceMax(Math.max(...rows.map(r => r[keyA] + r[keyB]), 1) * 1.15);
        const { svg: grid, innerH, innerW, every } = gridAndLabels(maxVal, rows.length);
        const n = rows.length;
        const gap = innerW / n;
        const barW = Math.max(2, Math.min(26, gap * 0.55));

        const bars = rows.map((r, i) => {
            const cx = PAD.l + gap * i + gap / 2;
            const hA = innerH * (r[keyA] / maxVal);
            const hB = innerH * (r[keyB] / maxVal);
            const yBase = PAD.t + innerH;
            const yA = yBase - hA;
            const yB = yA - hB;
            const showLabel = i % every === 0 || i === n - 1;
            return `
                <rect x="${(cx - barW / 2).toFixed(1)}" y="${yA.toFixed(1)}" width="${barW.toFixed(1)}" height="${hA.toFixed(1)}" rx="2" fill="${colorA}">
                    <title>${dayLabel(r.date)} — ${labelA}: ${fmtNum(r[keyA])}</title>
                </rect>
                <rect x="${(cx - barW / 2).toFixed(1)}" y="${yB.toFixed(1)}" width="${barW.toFixed(1)}" height="${hB.toFixed(1)}" rx="2" fill="${colorB}">
                    <title>${dayLabel(r.date)} — ${labelB}: ${fmtNum(r[keyB])}</title>
                </rect>
                ${showLabel ? `<text x="${cx.toFixed(1)}" y="${VB_H - 8}" text-anchor="middle" font-size="9.5" fill="var(--gray,#6b6b82)">${dayLabel(r.date)}</text>` : ''}`;
        }).join('');

        return `
        <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="none" style="width:100%;height:230px;overflow:visible;">
            ${grid}
            ${bars}
        </svg>`;
    }

    function _hourlyDeviceIcon(s) {
        if (s.os === 'ios') return '🍎';
        if (s.os === 'android') return '🤖';
        return s.device === 'mobile' ? '📱' : '💻';
    }

    // Same identity-matching approach as admin-presence.js's live "الزوار
    // المتصلون" panel, reused here for historical sessions: a registered
    // visit is matched back to its account via deviceUUID (attendance
    // sessions don't store uid directly), a guest visit is matched to any
    // pre-signup name+phone lead captured for that device.
    function _hourlyIdentity(s) {
        const uuid = s.uuid || '';
        if (s.isRegistered && uuid && window.allUsers) {
            const match = Object.values(window.allUsers).find(u => u && u.deviceUUID === uuid);
            if (match) {
                return {
                    name:  match.displayName || match.fullname || match.username || null,
                    user:  match.username || null,
                    phone: match.phone || null,
                };
            }
        }
        if (uuid && window.allVisitors && window.allVisitors[uuid]) {
            const lead = window.allVisitors[uuid];
            if (lead && lead.fullName) return { name: lead.fullName, user: null, phone: lead.phone || null };
        }
        return { name: null, user: null, phone: null };
    }

    // Cache of the currently-rendered hourly chart's per-hour session lists
    // and which day they belong to — read by the popup when a bar is
    // clicked (click happens well after render, so this can't just be a
    // local variable inside renderAttendance).
    let _attHourlySessionsCache = Array.from({ length: 24 }, () => []);
    let _attHourlyDateKeyCache  = '';

    function _ensureAttHourlyPopup() {
        if (document.getElementById('att-hp-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'att-hp-overlay';
        overlay.className = 'att-hp-overlay';
        overlay.innerHTML = `
            <div class="att-hp-modal" id="att-hp-modal">
                <div class="att-hp-header">
                    <div class="att-hp-title" id="att-hp-title"></div>
                    <button class="att-hp-close" id="att-hp-close" aria-label="إغلاق">✕</button>
                </div>
                <div class="att-hp-body" id="att-hp-body"></div>
            </div>`;
        document.body.appendChild(overlay);
        // Click anywhere outside the modal (i.e. directly on the overlay
        // backdrop) closes it — clicks inside the modal don't bubble to
        // a target that IS the overlay, so this check is enough.
        overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeAttHourlyPopup(); });
        document.getElementById('att-hp-close').addEventListener('click', _closeAttHourlyPopup);
    }

    function _closeAttHourlyPopup() {
        document.getElementById('att-hp-overlay')?.classList.remove('active');
    }

    function _attOpenHourlyPopup(hour) {
        _ensureAttHourlyPopup();
        const sessions = (_attHourlySessionsCache[hour] || []).slice().sort((a, b) => a.startedAt - b.startedAt);
        const dayPrefix = _attHourlyDateKeyCache ? `${weekdayLabel(_attHourlyDateKeyCache)} ${dayLabel(_attHourlyDateKeyCache)} — ` : '';
        document.getElementById('att-hp-title').textContent = `${dayPrefix}الساعة ${hour}:00 — ${fmtNum(sessions.length)} زيارة`;

        const body = document.getElementById('att-hp-body');
        if (!sessions.length) {
            body.innerHTML = `<div style="padding:36px 20px;text-align:center;color:var(--gray,#6b6b82);font-size:.85rem;">لا توجد زيارات في هذه الساعة</div>`;
        } else {
            const fmtTime = new Intl.DateTimeFormat('ar', { timeZone: 'Asia/Beirut', hour: '2-digit', minute: '2-digit', hour12: false });
            body.innerHTML = `
            <table class="att-hp-table">
                <thead><tr><th>الوقت</th><th>الجهاز</th><th>الحالة</th><th>الاسم / المستخدم</th><th>الهاتف</th></tr></thead>
                <tbody>
                ${sessions.map(s => {
                    const time  = fmtTime.format(new Date(s.startedAt));
                    const icon  = _hourlyDeviceIcon(s);
                    const who   = s.isRegistered ? 'مسجّل' : 'زائر';
                    const id    = _hourlyIdentity(s);
                    const nameCell  = [id.name, id.user ? '@' + id.user : ''].filter(Boolean).join(' ') || '—';
                    const phoneCell = id.phone ? (typeof window.formatPhone === 'function' ? window.formatPhone(id.phone) : id.phone) : '—';
                    return `<tr>
                        <td dir="ltr">${time}</td>
                        <td>${icon}</td>
                        <td>${who}${s.isNew ? ' <span class="att-hp-new">جديد</span>' : ''}</td>
                        <td>${nameCell}</td>
                        <td dir="ltr">${phoneCell}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>`;
        }
        document.getElementById('att-hp-overlay').classList.add('active');
    }

    function svgHourlyBars(hourly) {
        const maxVal = niceMax(Math.max(...hourly, 1) * 1.15);
        const { svg: grid, innerH, innerW } = gridAndLabels(maxVal, 24);
        const gap = innerW / 24;
        const barW = Math.max(4, gap * 0.6);
        const peak = Math.max(...hourly);

        const bars = hourly.map((v, h) => {
            const cx = PAD.l + gap * h + gap / 2;
            const hh = innerH * (v / maxVal);
            const y  = PAD.t + innerH - hh;
            const isPeak = v === peak && peak > 0;
            // A full-height, transparent rect widens the click target to
            // the whole hour-slot (not just the visible bar, which can be
            // a sliver for quiet hours) — click opens the popup, no hover
            // tooltip involved.
            return `
                <rect class="att-hour-hit" data-hour="${h}" x="${(cx - gap / 2).toFixed(1)}" y="${PAD.t}" width="${gap.toFixed(1)}" height="${innerH.toFixed(1)}" fill="transparent"></rect>
                <rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}" rx="2"
                      fill="${isPeak ? COLOR.orange : 'rgba(255,92,0,.35)'}" style="pointer-events:none;"></rect>
                ${h % 3 === 0 ? `<text x="${cx.toFixed(1)}" y="${VB_H - 8}" text-anchor="middle" font-size="9" fill="var(--gray,#6b6b82)">${h}</text>` : ''}`;
        }).join('');

        return `
        <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="none" style="width:100%;height:230px;overflow:visible;">
            ${grid}
            ${bars}
        </svg>`;
    }

    function proportionBar(segments) {
        // segments: [{label, value, color}]
        const total = segments.reduce((a, s) => a + s.value, 0) || 1;
        let x = 0;
        const bars = segments.map(s => {
            const w = (s.value / total) * 100;
            const html = w > 0 ? `<div style="width:${w}%;background:${s.color};height:100%;" title="${s.label}: ${fmtNum(s.value)}"></div>` : '';
            x += w;
            return html;
        }).join('');
        const legend = segments.map(s => `
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:var(--gray-light,#a0a0b8);margin-inline-end:14px;">
                <span style="width:9px;height:9px;border-radius:3px;background:${s.color};display:inline-block;"></span>
                ${s.label} <b style="color:var(--white,#f0f0f8);font-family:var(--mono,monospace);">${fmtNum(s.value)}</b>
            </span>`).join('');
        return `
            <div style="display:flex;width:100%;height:12px;border-radius:8px;overflow:hidden;background:var(--surface3,#1e1e28);">${bars}</div>
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;">${legend}</div>`;
    }

    /* ── KPI card ───────────────────────────────────────────────── */
    function kpiCard(icon, label, value, sub, deltaPct, color) {
        let deltaHtml = '';
        if (deltaPct !== null && deltaPct !== undefined && isFinite(deltaPct)) {
            const up = deltaPct >= 0;
            deltaHtml = `<div style="font-size:.72rem;font-weight:800;margin-top:4px;color:${up ? COLOR.green : '#ef4444'};display:flex;align-items:center;gap:3px;">
                <span>${up ? '▲' : '▼'}</span>${Math.abs(deltaPct).toFixed(0)}% ${up ? 'مقارنة بالأمس' : 'مقارنة بالأمس'}
            </div>`;
        }
        return `
        <div style="background:var(--surface2,#18181f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:16px;padding:16px 18px;flex:1;min-width:150px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:1.1rem;">${icon}</span>
                <span style="font-size:.76rem;color:var(--gray,#6b6b82);font-weight:700;">${label}</span>
            </div>
            <div style="font-size:1.6rem;font-weight:900;color:${color || 'var(--white,#f0f0f8)'};font-family:var(--mono,monospace);">${value}</div>
            ${sub ? `<div style="font-size:.72rem;color:var(--gray,#6b6b82);margin-top:3px;">${sub}</div>` : ''}
            ${deltaHtml}
        </div>`;
    }

    function sectionCard(title, subtitle, bodyHtml, headerExtra) {
        return `
        <div style="background:var(--surface2,#18181f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:16px;padding:18px 20px;margin-bottom:16px;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
                <h3 style="font-size:.95rem;font-weight:800;color:var(--white,#f0f0f8);margin:0;">${title}</h3>
                ${subtitle ? `<span style="font-size:.74rem;color:var(--gray,#6b6b82);">${subtitle}</span>` : ''}
                ${headerExtra || ''}
            </div>
            ${bodyHtml}
        </div>`;
    }

    let _hasRenderedOnce = false;

    // ── Exclusions management modal ─────────────────────────────
    // Raw (unfiltered) devices, cached each render so the search box
    // below has something to search even though the charts themselves
    // only ever see the exclusion-filtered version.
    let _attRawDevicesCache = {};

    function _ensureAttExclusionsModal() {
        if (document.getElementById('att-excl-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'att-excl-overlay';
        overlay.className = 'att-hp-overlay';
        overlay.innerHTML = `
            <div class="att-hp-modal" id="att-excl-modal" style="max-width:640px;">
                <div class="att-hp-header">
                    <div class="att-hp-title">⚙️ استثناءات الحضور</div>
                    <button class="att-hp-close" id="att-excl-close" aria-label="إغلاق">✕</button>
                </div>
                <div class="att-hp-body">
                    <p style="font-size:.78rem;color:var(--gray-light,#a0a0b8);margin:0 0 14px;line-height:1.6;">
                        الأجهزة أو الحسابات المستثناة هنا ما بتنحسب ضمن أي رقم أو رسم بياني بقسم الحضور — مفيدة لجهازك الشخصي وحسابات التجربة.
                    </p>
                    <input type="text" id="att-excl-search" class="att-excl-search-input" placeholder="دوّر باسم، @username، رقم هاتف، أو جزء من UUID الجهاز...">
                    <div id="att-excl-results"></div>
                    <div style="margin-top:20px;">
                        <div style="font-weight:800;font-size:.8rem;margin-bottom:8px;color:var(--white,#f0f0f8);">المستثناة حالياً</div>
                        <div id="att-excl-current"></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeAttExclusionsModal(); });
        document.getElementById('att-excl-close').addEventListener('click', _closeAttExclusionsModal);
        document.getElementById('att-excl-search').addEventListener('input', (e) => _attRenderExclusionResults(e.target.value.trim()));
    }

    function _closeAttExclusionsModal() {
        document.getElementById('att-excl-overlay')?.classList.remove('active');
    }

    async function _openAttExclusionsModal() {
        _ensureAttExclusionsModal();
        document.getElementById('att-excl-search').value = '';
        document.getElementById('att-excl-results').innerHTML = '';
        document.getElementById('att-excl-overlay').classList.add('active');
        await _attRenderExclusionCurrentList();
    }

    async function _attRenderExclusionCurrentList() {
        const exclusions = await fetchAttendanceExclusions();
        const box = document.getElementById('att-excl-current');
        if (!box) return;
        const deviceRows = Object.entries(exclusions.devices || {});
        const accountRows = Object.entries(exclusions.accounts || {});
        if (!deviceRows.length && !accountRows.length) {
            box.innerHTML = `<div style="font-size:.78rem;color:var(--gray,#6b6b82);">ما في أجهزة أو حسابات مستثناة حالياً</div>`;
            return;
        }
        const row = (icon, label, sub, kind, key) => `
            <div class="att-excl-row">
                <span style="font-size:1rem;">${icon}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:.8rem;color:var(--white,#f0f0f8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
                    ${sub ? `<div style="font-size:.68rem;color:var(--gray,#6b6b82);">${sub}</div>` : ''}
                </div>
                <button class="att-excl-remove-btn" data-kind="${kind}" data-key="${key}" title="إلغاء الاستثناء">✕</button>
            </div>`;
        box.innerHTML = [
            ...deviceRows.map(([uuid, rec]) => row('📱', rec.label || `جهاز·${uuid.slice(0, 10)}`, `UUID: ${uuid.slice(0, 18)}…`, 'devices', uuid)),
            ...accountRows.map(([uid, rec]) => row('👤', rec.label || `حساب·${uid.slice(0, 10)}`, 'حساب مستخدم', 'accounts', uid)),
        ].join('');
        box.querySelectorAll('.att-excl-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '…';
                try {
                    await _attRemoveExclusion(btn.dataset.kind, btn.dataset.key);
                    toast('✅ تم إلغاء الاستثناء');
                    await _attRenderExclusionCurrentList();
                    renderAttendance();
                } catch (e) {
                    toast('⚠️ تعذّر إلغاء الاستثناء: ' + e.message, true);
                    btn.disabled = false; btn.textContent = '✕';
                }
            });
        });
    }

    async function _attRenderExclusionResults(query) {
        const box = document.getElementById('att-excl-results');
        if (!box) return;
        if (!query) { box.innerHTML = ''; return; }
        const q = query.toLowerCase();
        const exclusions = await fetchAttendanceExclusions();
        const alreadyExcludedDevices = new Set(Object.keys(exclusions.devices || {}));
        const alreadyExcludedAccounts = new Set(Object.keys(exclusions.accounts || {}));

        // Accounts — search by name / username / phone.
        const accountMatches = Object.entries(window.allUsers || {})
            .filter(([uid, u]) => {
                if (!u) return false;
                const hay = [u.displayName, u.fullname, u.username, u.phone].filter(Boolean).join(' ').toLowerCase();
                return hay.includes(q);
            })
            .slice(0, 15)
            .map(([uid, u]) => ({
                kind: 'accounts', key: uid,
                label: u.displayName || u.fullname || u.username || uid.slice(0, 10),
                sub: [u.username ? '@' + u.username : '', u.phone ? (window.formatPhone ? window.formatPhone(u.phone) : u.phone) : ''].filter(Boolean).join(' — '),
                icon: '👤',
                excluded: alreadyExcludedAccounts.has(uid),
            }));

        // Devices — search by resolved name/phone (via leads or matching
        // account), or by raw UUID substring for a device with no identity.
        const deviceMatches = Object.entries(_attRawDevicesCache)
            .map(([uuid, dev]) => {
                const lead  = (window.allVisitors || {})[uuid];
                const acct  = Object.values(window.allUsers || {}).find(u => u && u.deviceUUID === uuid);
                const name  = (acct && (acct.displayName || acct.fullname || acct.username)) || (lead && lead.fullName) || null;
                const phone = (acct && acct.phone) || (lead && lead.phone) || null;
                const hay   = [name, phone, uuid].filter(Boolean).join(' ').toLowerCase();
                return { uuid, dev, name, phone, hay };
            })
            .filter(d => d.hay.includes(q))
            .slice(0, 15)
            .map(d => ({
                kind: 'devices', key: d.uuid,
                label: d.name || `جهاز غير معروف`,
                sub: [d.phone ? (window.formatPhone ? window.formatPhone(d.phone) : d.phone) : '', `${fmtNum(d.dev.visits || 0)} زيارة`, `UUID: ${d.uuid.slice(0, 14)}…`].filter(Boolean).join(' — '),
                icon: '📱',
                excluded: alreadyExcludedDevices.has(d.uuid),
            }));

        const all = [...accountMatches, ...deviceMatches];
        if (!all.length) {
            box.innerHTML = `<div style="padding:14px 0;font-size:.78rem;color:var(--gray,#6b6b82);">ما في نتائج مطابقة</div>`;
            return;
        }
        box.innerHTML = all.map(r => `
            <div class="att-excl-row">
                <span style="font-size:1rem;">${r.icon}</span>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:.8rem;color:var(--white,#f0f0f8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.label}</div>
                    ${r.sub ? `<div style="font-size:.68rem;color:var(--gray,#6b6b82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.sub}</div>` : ''}
                </div>
                ${r.excluded
                    ? `<span style="font-size:.68rem;font-weight:800;color:var(--gray,#6b6b82);">مستثنى بالفعل</span>`
                    : `<button class="att-excl-add-btn" data-kind="${r.kind}" data-key="${r.key}" data-label="${(r.label || '').replace(/"/g, '&quot;')}">استثناء</button>`}
            </div>`).join('');

        box.querySelectorAll('.att-excl-add-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '…';
                try {
                    await _attAddExclusion(btn.dataset.kind, btn.dataset.key, btn.dataset.label);
                    toast('✅ تمت إضافة الاستثناء');
                    await _attRenderExclusionResults(document.getElementById('att-excl-search').value.trim());
                    await _attRenderExclusionCurrentList();
                    renderAttendance();
                } catch (e) {
                    toast('⚠️ تعذّر إضافة الاستثناء: ' + e.message, true);
                    btn.disabled = false; btn.textContent = 'استثناء';
                }
            });
        });
    }


    async function renderAttendance() {
        const root = document.getElementById('attendance-root');
        if (!root) return;
        if (_loading) return;
        _loading = true;

        const savedScrollTop = root.scrollTop;

        if (!_hasRenderedOnce) {
            root.innerHTML = `<div style="padding:60px;text-align:center;color:var(--gray,#6b6b82);">
                <div style="font-size:2rem;margin-bottom:10px;">📊</div>جارِ تحميل إحصائيات الحضور…
            </div>`;
        }

        const [sessionsByDateRaw, devicesRaw, exclusions] = await Promise.all([
            fetchSessionsRange(currentRange),
            fetchDevices(),
            fetchAttendanceExclusions(),
        ]);
        const excludedUuids = _attBuildExcludedUuidSet(exclusions);
        const sessionsByDate = _attStripExcluded(sessionsByDateRaw, excludedUuids);
        const devices = excludedUuids.size
            ? Object.fromEntries(Object.entries(devicesRaw).filter(([uuid]) => !excludedUuids.has(uuid)))
            : devicesRaw;
        _attRawDevicesCache = devicesRaw;
        const data = aggregate(sessionsByDate, currentRange, devices);
        _cache = data;
        _loading = false;

        const rangeLabelEl = document.getElementById('attendance-range-label');
        if (rangeLabelEl) rangeLabelEl.textContent = `آخر ${currentRange} يوم`;

        const badge = document.getElementById('nav-badge-attendance');
        if (badge) { badge.textContent = fmtNum(data.todayRow.total); badge.style.display = data.todayRow.total > 0 ? 'flex' : 'none'; }

        const t  = data.todayRow;
        const y  = data.yesterdayRow;
        const visitsDelta = y && y.total > 0 ? ((t.total - y.total) / y.total) * 100 : null;
        const newDelta    = y && y.newDevices > 0 ? ((t.newDevices - y.newDevices) / y.newDevices) * 100 : null;
        const durDelta    = (y && y.avgDurationMs > 0 && t.avgDurationMs > 0) ? ((t.avgDurationMs - y.avgDurationMs) / y.avgDurationMs) * 100 : null;
        const regPct      = t.total > 0 ? Math.round((t.registered / t.total) * 100) : 0;
        const convPct     = t.total > 0 ? Math.round((t.ordered / t.total) * 100) : 0;
        const bouncePct   = t.total > 0 ? Math.round((t.bounces / t.total) * 100) : 0;
        const yConv       = (y && y.total > 0) ? (y.ordered / y.total) * 100 : null;
        const convDelta   = (yConv !== null && yConv > 0) ? (convPct - yConv) : null;

        const kpiRow = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
            ${kpiCard('👁️', 'زيارات اليوم', fmtNum(t.total), 'إجمالي مرات فتح الموقع اليوم', visitsDelta, COLOR.orange)}
            ${kpiCard('🛒', 'نسبة التحويل اليوم', convPct + '%', `${fmtNum(t.ordered)} زيارة انتهت بطلب من ${fmtNum(t.total)}`, convDelta, COLOR.green)}
            ${kpiCard('🚪', 'نسبة الارتداد اليوم', bouncePct + '%', `${fmtNum(t.bounces)} دخلوا وخرجوا دون أي تفاعل`, null, COLOR.red || '#ef4444')}
            ${kpiCard('🆕', 'أجهزة جديدة اليوم', fmtNum(t.newDevices), 'لأول مرة على الإطلاق', newDelta, COLOR.blue)}
            ${kpiCard('🔁', 'زوار عائدون', fmtNum(t.returning), 'زاروا الموقع من قبل', null, COLOR.purple)}
            ${kpiCard('✅', 'نسبة المسجّلين', regPct + '%', `${fmtNum(t.registered)} من ${fmtNum(t.total)} مسجّلون`, null, COLOR.green)}
            ${kpiCard('⏱️', 'متوسط مدة المشاهدة', fmtDuration(t.avgDurationMs), 'لكل زيارة اليوم', durDelta, COLOR.yellow)}
            ${kpiCard('🗂️', 'إجمالي الأجهزة (كل الوقت)', fmtNum(data.totalDevicesEver), 'منذ بدء تشغيل النظام', null, COLOR.gray)}
        </div>`;

        const rangePills = `
        <div class="orders-toolbar" style="flex-shrink:0;margin-bottom:16px;">
            ${[7, 30, 90].map(d => `<button class="filter-pill att-range-pill ${d === currentRange ? 'active' : ''}" data-days="${d}">
                ${d === 7 ? 'آخر أسبوع' : d === 30 ? 'آخر شهر' : 'آخر 3 أشهر'}
            </button>`).join('')}
        </div>`;

        // ── Hourly-rhythm chart's own day — independent of the range
        // pills above. Day 0 (today) reuses the hourly data already
        // computed in `data.hourly`; any earlier day is fetched on its
        // own, since it may fall outside the currently selected range.
        const hourlyDateKey = dayKeyForOffset(hourlyOffset);
        const hourlySourceRaw = (hourlyOffset === 0)
            ? (sessionsByDate[hourlyDateKey] || {})
            : await fetchSessionsForDay(hourlyDateKey);
        const hourlySource = excludedUuids.size
            ? Object.fromEntries(Object.entries(hourlySourceRaw).filter(([, s]) => !excludedUuids.has(s.uuid)))
            : hourlySourceRaw;
        const hourlyBars = new Array(24).fill(0);
        const hourlySessions = Array.from({ length: 24 }, () => []);
        const _nowMs = Date.now();
        Object.values(hourlySource).forEach(s => {
            if (!s.startedAt || s.startedAt > _nowMs) return; // clock-skew guard — see aggregate()
            const h = beirutHour(s.startedAt);
            hourlyBars[h]++;
            hourlySessions[h].push(s);
        });
        const hourlyIsToday = hourlyOffset === 0;
        const hourlyTotal = hourlyBars.reduce((a, b) => a + b, 0);
        const hourlyAvgPerHour = hourlyTotal / 24;
        _attHourlySessionsCache = hourlySessions;
        _attHourlyDateKeyCache  = hourlyDateKey;

        const momentumChart = sectionCard(
            '📈 زخم الحضور اليومي',
            'إجمالي الزيارات يوميًا — الخط المتقطع هو المتوسط المتحرك لـ 7 أيام',
            svgLineArea(data.perDay, 'total', { color: COLOR.orange, dim: COLOR.orangeDim, suffix: ' زيارة' })
        );

        const newVsReturning = sectionCard(
            '🆕 الأجهزة الجديدة مقابل العائدة',
            'كل عمود = يوم واحد، مقسوم بين الزوار الجدد والعائدين',
            svgStackedBars(data.perDay, 'newDevices', 'returning', COLOR.blue, COLOR.purple, 'جديد', 'عائد')
            + `<div style="margin-top:10px;display:flex;gap:16px;font-size:.74rem;color:var(--gray-light,#a0a0b8);">
                <span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${COLOR.blue};margin-inline-end:5px;"></span>جديد</span>
                <span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${COLOR.purple};margin-inline-end:5px;"></span>عائد</span>
            </div>`
        );

        const regVsGuest = sectionCard(
            '👤 المسجّلون مقابل الزوار (Guest)',
            'من دخل وهو مسجّل الدخول، مقابل من تصفّح كزائر',
            svgStackedBars(data.perDay, 'registered', 'guest', COLOR.green, COLOR.gray, 'مسجّل', 'زائر')
            + `<div style="margin-top:10px;display:flex;gap:16px;font-size:.74rem;color:var(--gray-light,#a0a0b8);">
                <span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${COLOR.green};margin-inline-end:5px;"></span>مسجّل</span>
                <span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${COLOR.gray};margin-inline-end:5px;"></span>زائر</span>
            </div>`
        );

        const durationChart = sectionCard(
            '⏱️ متوسط مدة المشاهدة اليومية',
            'بالدقائق — كل نقطة هي متوسط مدة الزيارة لذلك اليوم',
            svgLineArea(data.perDay.map(r => ({ date: r.date, mins: +(r.avgDurationMs / 60000).toFixed(1) })), 'mins', { color: COLOR.yellow, dim: COLOR.yellowDim, suffix: ' د', showAvg: false })
        );

        // ── Visit → order funnel (whole selected range) ──────────────
        const ft = data.funnelTotals;
        const funnelRows = [
            { label: '👁️ زيارة',           value: ft.visits,          color: COLOR.orange },
            { label: '🏪 فتح متجراً',       value: ft.browsed,         color: COLOR.blue },
            { label: '🛒 فتح السلة',        value: ft.cartOpened,      color: COLOR.yellow },
            { label: '➕ أضاف للسلة',       value: ft.addedToCart,     color: COLOR.purple },
            { label: '📝 بدأ إرسال الطلب', value: ft.checkoutStarted, color: '#f472b6' },
            { label: '✅ أرسل طلباً',       value: ft.ordered,         color: COLOR.green },
        ];
        const funnelMax = Math.max(1, ft.visits);
        const funnelHtml = funnelRows.map((r, i) => {
            const pctOfVisits = Math.round((r.value / funnelMax) * 100);
            const prev = i > 0 ? funnelRows[i - 1].value : null;
            const dropTxt = (prev !== null && prev > 0)
                ? `<span style="font-size:.68rem;color:var(--gray,#6b6b82);">${Math.round((r.value / prev) * 100)}% من المرحلة السابقة</span>`
                : '';
            return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
                <div style="width:150px;flex-shrink:0;font-size:.78rem;font-weight:800;color:var(--white,#fff);">${r.label}</div>
                <div style="flex:1;background:rgba(255,255,255,.05);border-radius:8px;height:26px;position:relative;overflow:hidden;">
                    <div style="width:${Math.max(pctOfVisits, r.value > 0 ? 3 : 0)}%;height:100%;background:${r.color};border-radius:8px;transition:width .4s;"></div>
                    <span style="position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);font-size:.74rem;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55);">${fmtNum(r.value)} (${pctOfVisits}%)</span>
                </div>
                <div style="width:140px;flex-shrink:0;text-align:start;">${dropTxt}</div>
            </div>`;
        }).join('');
        const funnelNote = ft.startKey
            ? `
            <div style="margin-top:6px;font-size:.72rem;color:var(--gray,#6b6b82);">
                محسوبة فقط من ${dayLabel(ft.startKey)} (تاريخ بدء تفعيل نظام التتبّع) حتى اليوم — الزيارات المسجّلة قبل ذلك التاريخ مستبعدة تماماً لأنها لا تحتوي بيانات تفاعل، فلا تُشوّه النسب.
            </div>`
            : `
            <div style="margin-top:6px;font-size:.72rem;color:var(--gray,#6b6b82);">
                لا توجد بعد أي زيارات مسجّلة بنظام التتبّع الجديد خلال هذه الفترة.
            </div>`;
        const funnelChart = sectionCard(
            '🎯 قمع التحويل: من الزيارة إلى الطلب',
            ft.startKey
                ? `أين يتوقف الزوّار قبل إتمام الطلب — منذ ${dayLabel(ft.startKey)} (${fmtNum(ft.daysCount)} يوم تتبّع فعلي)`
                : `أين يتوقف الزوّار قبل إتمام الطلب`,
            funnelHtml + funnelNote
        );

        // ── Abandoned carts (whole selected range, newest first) ─────
        const ab = data.abandonedCarts || [];
        const abRegistered = ab.filter(a => a.username || a.uid);
        const abGuests     = ab.length - abRegistered.length;
        const abRowsHtml = ab.slice(0, 30).map(a => {
            const who = a.username
                ? `<b style="color:var(--white,#fff);">${a.username}</b>`
                : `<span style="color:var(--gray-light,#a0a0b8);">زائر ${a.os === 'ios' ? '🍎' : a.os === 'android' ? '🤖' : ''}</span>`;
            const val = (typeof a.valueUSD === 'number') ? `$${a.valueUSD.toFixed(2)}` : '—';
            const when = a.at ? new Date(a.at).toLocaleString('ar-LB', { timeZone: 'Asia/Beirut', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : a.date;
            const storesTxt = Array.isArray(a.stores) && a.stores.length ? a.stores.join('، ') : '';
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.05);font-size:.78rem;">
                <div style="flex:1;min-width:0;">${who}${storesTxt ? `<div style="font-size:.68rem;color:var(--gray,#6b6b82);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${storesTxt}</div>` : ''}</div>
                <div style="flex-shrink:0;color:var(--gray-light,#a0a0b8);">🧺 ${fmtNum(a.items)} منتج</div>
                <div style="flex-shrink:0;font-weight:800;color:var(--orange,#f97316);">${val}</div>
                <div style="flex-shrink:0;font-size:.68rem;color:var(--gray,#6b6b82);">${when}</div>
            </div>`;
        }).join('');
        const abandonedBodyHtml = ab.length
            ? abRowsHtml + (ab.length > 30 ? `<div style="margin-top:8px;font-size:.72rem;color:var(--gray,#6b6b82);">عرض أحدث 30 من أصل ${fmtNum(ab.length)}</div>` : '')
            : `<div style="padding:18px;text-align:center;color:var(--gray,#6b6b82);font-size:.8rem;">لا توجد سلال متروكة مسجّلة خلال هذه الفترة 🎉</div>`;
        const abandonedSection = `
        <div style="background:var(--surface2,#18181f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:16px;padding:18px 20px;margin-bottom:16px;">
            <div id="att-abandoned-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;${_abandonedCollapsed ? '' : 'margin-bottom:14px;'}">
                <button id="att-abandoned-toggle" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--gray-light,#a0a0b8);flex-shrink:0;padding:0;cursor:pointer;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${_abandonedCollapsed ? '-90deg' : '0deg'});transition:transform .2s;"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <h3 style="font-size:.95rem;font-weight:800;color:var(--white,#f0f0f8);margin:0;">🧺 سلال متروكة (غادروا دون إرسال الطلب)</h3>
                <span style="font-size:.74rem;color:var(--gray,#6b6b82);">خلال آخر ${currentRange} يوم — ${fmtNum(abRegistered.length)} مسجّلون يمكن متابعتهم، و${fmtNum(abGuests)} زوّار</span>
            </div>
            <div id="att-abandoned-body" style="${_abandonedCollapsed ? 'display:none;' : ''}">${abandonedBodyHtml}</div>
        </div>`;

        const hourlyNav = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;">
            <button class="ph-btn att-hourly-btn" id="att-hourly-next" ${hourlyIsToday ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ''} title="عرض اليوم التالي">اليوم التالي ▶</button>
            <span style="font-size:.78rem;color:var(--gray-light,#a0a0b8);font-weight:800;">${weekdayLabel(hourlyDateKey)} ${dayLabel(hourlyDateKey)}</span>
            <button class="ph-btn att-hourly-btn" id="att-hourly-prev" title="عرض اليوم السابق">◀ اليوم السابق</button>
            ${!hourlyIsToday ? `<button class="ph-btn" id="att-hourly-today" style="margin-inline-start:auto;">↩ اليوم</button>` : ''}
        </div>`;

        const hourlyStats = `
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:800;color:var(--orange,#f97316);background:rgba(249,115,22,.12);border-radius:8px;padding:3px 9px;">
                📊 الإجمالي: ${fmtNum(hourlyTotal)}
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:800;color:var(--blue,#3b82f6);background:rgba(59,130,246,.12);border-radius:8px;padding:3px 9px;">
                📈 المعدّل بالساعة: ${hourlyAvgPerHour.toFixed(1)}
            </span>`;

        const hourlyChart = sectionCard(
            hourlyIsToday ? '🕐 إيقاع اليوم الحالي (كل ساعة)' : `🕐 إيقاع يوم ${dayLabel(hourlyDateKey)} (كل ساعة)`,
            `أي ساعات ${hourlyIsToday ? 'اليوم' : 'ذلك اليوم'} شهدت أكبر زخم زوّار — بتوقيت بيروت`,
            svgHourlyBars(hourlyBars) + hourlyNav,
            hourlyStats
        );

        // Device mix across the whole selected range
        const mix = data.perDay.reduce((acc, r) => {
            Object.keys(r.deviceKinds).forEach(k => acc[k] = (acc[k] || 0) + r.deviceKinds[k]);
            return acc;
        }, {});
        const deviceMix = sectionCard(
            '📱 توزيع الأجهزة خلال الفترة المختارة',
            null,
            `<div style="margin-bottom:16px;">
                <div style="font-size:.74rem;color:var(--gray,#6b6b82);margin-bottom:6px;">موبايل مقابل ويب</div>
                ${proportionBar([
                    { label: 'موبايل 📱', value: mix.mobile || 0, color: COLOR.orange },
                    { label: 'ويب 💻', value: mix.desktop || 0, color: COLOR.blue },
                ])}
            </div>
            <div>
                <div style="font-size:.74rem;color:var(--gray,#6b6b82);margin-bottom:6px;">نظام التشغيل</div>
                ${proportionBar([
                    { label: 'آيفون 🍎', value: mix.ios || 0, color: '#e2e8f0' },
                    { label: 'أندرويد 🤖', value: mix.android || 0, color: COLOR.green },
                    { label: 'أخرى', value: mix.other || 0, color: COLOR.gray },
                ])}
            </div>`
        );

        root.innerHTML = kpiRow + rangePills + funnelChart + abandonedSection + momentumChart + hourlyChart + newVsReturning + regVsGuest + durationChart + deviceMix;
        _hasRenderedOnce = true;
        requestAnimationFrame(() => { root.scrollTop = savedScrollTop; });

        root.querySelectorAll('.att-range-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                currentRange = parseInt(btn.dataset.days, 10);
                renderAttendance();
            });
        });

        // Hourly chart's own day navigator — pages one day at a time,
        // independent of the range pills above. "Next" is disabled once
        // back at today.
        document.getElementById('att-hourly-prev')?.addEventListener('click', () => {
            hourlyOffset += 1;
            renderAttendance();
        });
        document.getElementById('att-hourly-next')?.addEventListener('click', () => {
            hourlyOffset = Math.max(0, hourlyOffset - 1);
            renderAttendance();
        });
        document.getElementById('att-hourly-today')?.addEventListener('click', () => {
            hourlyOffset = 0;
            renderAttendance();
        });

        // Abandoned-carts section — collapsed by default; toggling just
        // flips visibility + the chevron in place, no refetch/re-render needed.
        document.getElementById('att-abandoned-header')?.addEventListener('click', () => {
            _abandonedCollapsed = !_abandonedCollapsed;
            localStorage.setItem('delivo_admin_att_abandoned_collapsed', _abandonedCollapsed ? '1' : '0');
            const header = document.getElementById('att-abandoned-header');
            const body   = document.getElementById('att-abandoned-body');
            const chevron = header.querySelector('svg');
            if (body)    body.style.display = _abandonedCollapsed ? 'none' : '';
            if (header)  header.style.marginBottom = _abandonedCollapsed ? '0' : '14px';
            if (chevron) chevron.style.transform = `rotate(${_abandonedCollapsed ? '-90deg' : '0deg'})`;
        });

        // Click a bar (or its quiet-hour hit area) to open the scrollable
        // visitor-list popup for that hour — no more hover tooltip.
        root.querySelectorAll('.att-hour-hit').forEach(rect => {
            rect.addEventListener('click', () => _attOpenHourlyPopup(parseInt(rect.dataset.hour, 10)));
        });
    }

    window.renderAttendance = renderAttendance;

    // This file is injected dynamically on the window 'load' event (see
    // admin.html), which always fires AFTER DOMContentLoaded — so waiting
    // for DOMContentLoaded here would wait for an event that already
    // happened, and this wiring would simply never run. The panel's DOM
    // already exists by this point, so just wire it up directly.
    document.getElementById('attendance-refresh-btn')?.addEventListener('click', () => {
        if (document.getElementById('panel-attendance')?.classList.contains('active')) renderAttendance();
    });
    document.getElementById('attendance-exclusions-btn')?.addEventListener('click', _openAttExclusionsModal);
})();