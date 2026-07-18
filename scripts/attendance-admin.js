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

        const perDay = dayKeys.map(dateKey => {
            const list = Object.values(sessionsByDate[dateKey] || {});
            let newDev = 0, registered = 0, durSum = 0, durCount = 0;
            const deviceKinds = { mobile: 0, desktop: 0, ios: 0, android: 0, other: 0 };

            list.forEach(s => {
                if (s.isNew) newDev++;
                if (s.isRegistered) registered++;
                const dur = Math.max(0, (s.lastSeen || s.startedAt) - s.startedAt);
                if (dur > 0 && dur < 6 * 3600 * 1000) { durSum += dur; durCount++; } // cap crashed/zombie outliers
                if (s.device === 'mobile') deviceKinds.mobile++; else deviceKinds.desktop++;
                if (s.os === 'ios') deviceKinds.ios++; else if (s.os === 'android') deviceKinds.android++; else deviceKinds.other++;
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
            };
        });

        // Today's hourly rhythm
        const hourly = new Array(24).fill(0);
        Object.values(sessionsByDate[todayKey] || {}).forEach(s => {
            hourly[beirutHour(s.startedAt)]++;
        });

        const todayRow     = perDay[perDay.length - 1];
        const yesterdayRow = yesterdayKey ? perDay.find(r => r.date === yesterdayKey) : null;

        const totalVisits   = perDay.reduce((a, r) => a + r.total, 0);
        const totalNew      = perDay.reduce((a, r) => a + r.newDevices, 0);
        const totalReg      = perDay.reduce((a, r) => a + r.registered, 0);
        const durRows       = perDay.filter(r => r.avgDurationMs > 0);
        const avgDurAll     = durRows.length ? durRows.reduce((a, r) => a + r.avgDurationMs, 0) / durRows.length : 0;

        return {
            perDay, hourly, todayRow, yesterdayRow,
            totalDevicesEver: Object.keys(devices || {}).length,
            rangeTotals: { totalVisits, totalNew, totalReg, avgDurAll },
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
            return `
                <rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}" rx="2"
                      fill="${isPeak ? COLOR.orange : 'rgba(255,92,0,.35)'}">
                    <title>الساعة ${h}:00 — ${fmtNum(v)} زيارة</title>
                </rect>
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

    function sectionCard(title, subtitle, bodyHtml) {
        return `
        <div style="background:var(--surface2,#18181f);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:16px;padding:18px 20px;margin-bottom:16px;">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
                <h3 style="font-size:.95rem;font-weight:800;color:var(--white,#f0f0f8);margin:0;">${title}</h3>
                ${subtitle ? `<span style="font-size:.74rem;color:var(--gray,#6b6b82);">${subtitle}</span>` : ''}
            </div>
            ${bodyHtml}
        </div>`;
    }

    let _hasRenderedOnce = false;

    /* ── Main render ────────────────────────────────────────────── */
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

        const [sessionsByDate, devices] = await Promise.all([
            fetchSessionsRange(currentRange),
            fetchDevices(),
        ]);
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

        const kpiRow = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
            ${kpiCard('👁️', 'زيارات اليوم', fmtNum(t.total), 'إجمالي مرات فتح الموقع اليوم', visitsDelta, COLOR.orange)}
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
        let hourlyBars;
        if (hourlyOffset === 0) {
            hourlyBars = data.hourly;
        } else {
            const daySessions = await fetchSessionsForDay(hourlyDateKey);
            hourlyBars = new Array(24).fill(0);
            Object.values(daySessions).forEach(s => { hourlyBars[beirutHour(s.startedAt)]++; });
        }
        const hourlyIsToday = hourlyOffset === 0;

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

        const hourlyNav = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;">
            <button class="ph-btn att-hourly-btn" id="att-hourly-prev" title="عرض اليوم السابق">◀ اليوم السابق</button>
            <span style="font-size:.78rem;color:var(--gray-light,#a0a0b8);font-weight:800;">${weekdayLabel(hourlyDateKey)} ${dayLabel(hourlyDateKey)}</span>
            <button class="ph-btn att-hourly-btn" id="att-hourly-next" ${hourlyIsToday ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ''} title="عرض اليوم التالي">اليوم التالي ▶</button>
            ${!hourlyIsToday ? `<button class="ph-btn" id="att-hourly-today" style="margin-inline-start:auto;">↩ اليوم</button>` : ''}
        </div>`;

        const hourlyChart = sectionCard(
            hourlyIsToday ? '🕐 إيقاع اليوم الحالي (كل ساعة)' : `🕐 إيقاع يوم ${dayLabel(hourlyDateKey)} (كل ساعة)`,
            `أي ساعات ${hourlyIsToday ? 'اليوم' : 'ذلك اليوم'} شهدت أكبر زخم زوّار — بتوقيت بيروت`,
            svgHourlyBars(hourlyBars) + hourlyNav
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

        root.innerHTML = kpiRow + rangePills + momentumChart + newVsReturning + regVsGuest + durationChart + hourlyChart + deviceMix;
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
    }

    window.renderAttendance = renderAttendance;

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('attendance-refresh-btn')?.addEventListener('click', () => {
            if (document.getElementById('panel-attendance')?.classList.contains('active')) renderAttendance();
        });
    });
})();