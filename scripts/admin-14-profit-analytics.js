/* ═══════════════════════════════════════════════════════════════
   DELIVO ADMIN — Profit Analytics (تحليل الأرباح)
   ------------------------------------------------------------------
   Groups delivered orders into candles (day / week / month) and shows,
   per candle: order count, gross orders-profit (delivery-fee profit +
   extra profit — the SAME components as the orders panel's "🚗 ربح
   التوصيل" + "➕ ربح إضافي", deliberately BEFORE expenses are
   subtracted, unlike that panel's "💚 صافي ربحك" chip), and average
   profit per order (that candle's profit ÷ its own order count — skips
   candles with zero orders rather than showing a misleading $0). Each
   bar is labeled with its own exact value directly on the chart.

   Clicking a candle in the profit chart opens the predicted-monthly-
   profit breakdown, using a flat per-granularity multiplier (not an
   exact day-count) and a MANUALLY entered expected-monthly-expenses
   figure (the "💸 المصاريف الشهرية المتوقعة" field in the toolbar —
   an admin-set planning number, not summed from logged expense
   entries, and not tied to any specific calendar month):
       day candle:   predicted = candleProfit × 30 − expectedMonthlyExpenses
       week candle:  predicted = candleProfit × 4  − expectedMonthlyExpenses
       month candle: predicted = candleProfit × 1  − expectedMonthlyExpenses
   e.g. a day that made $20 profit, with $200 set as expected monthly
   expenses: (20 × 30) − 200 = $400 predicted.

   Deliberately gross (not net-of-expenses) on the candles themselves:
   subtracting expenses once inside the candle AND again in the
   monthly projection would double-count them. Expenses only enter
   the picture once, in the predicted-profit figure.

   expectedMonthlyExpenses is stored at settings/expectedMonthlyExpenses
   in RTDB (same fbGet/fbSet pattern as settings/dollarRate in admin-04)
   so it's shared across devices/admins, not just this browser.
═══════════════════════════════════════════════════════════════ */

let paGranularity = localStorage.getItem('delivo_admin_pa_granularity') || 'day'; // 'day' | 'week' | 'month'
const PA_CANDLE_COUNT = { day: 30, week: 12, month: 12 };
// "📜 الكل" — same idea as the orders panel's own delivered-orders chart:
// show every candle since the earliest delivered order instead of the
// fixed last-N window above.
let paShowAll = localStorage.getItem('delivo_admin_pa_show_all') === '1';
// Flat multiplier from one candle's profit to a projected FULL MONTH —
// intentionally simple (30 days / 4 weeks / 1 month) rather than each
// candle's exact day-count, per how the admin wants this modeled.
const PA_MONTH_MULTIPLIER = { day: 30, week: 4, month: 1 };

let paExpectedMonthlyExpenses = 0; // loaded from settings/expectedMonthlyExpenses below

fbGet('settings/expectedMonthlyExpenses').then(val => {
    const n = parseFloat(val);
    paExpectedMonthlyExpenses = (n && n > 0) ? n : 0;
    const inp = document.getElementById('pa-expected-expenses');
    if (inp) inp.value = paExpectedMonthlyExpenses || '';
    // Panel may already be open/rendered by the time this resolves
    // (it's a network round-trip) — refresh the predicted figures once
    // the real value is in, rather than leaving it at the 0 default.
    const panel = document.getElementById('panel-profit-analytics');
    if (panel && panel.classList.contains('active')) renderProfitAnalytics();
}).catch(() => {});

document.getElementById('pa-expected-expenses-save')?.addEventListener('click', async () => {
    const inp = document.getElementById('pa-expected-expenses');
    const btn = document.getElementById('pa-expected-expenses-save');
    const val = parseFloat(inp.value);
    if (isNaN(val) || val < 0) { toast('⚠️ أدخل رقماً صحيحاً', true); return; }
    btn.disabled = true; btn.textContent = '⏳';
    try {
        await fbSet('settings/expectedMonthlyExpenses', val);
        paExpectedMonthlyExpenses = val;
        toast('✅ تم حفظ المصاريف الشهرية المتوقعة');
        renderProfitAnalytics();
    } catch (e) {
        toast('⚠️ فشل الحفظ: ' + e.message, true);
    } finally {
        btn.disabled = false; btn.textContent = '💾 حفظ';
    }
});

// Single-select pill row, same behavior as the reference "range" pills:
// exactly one of يوم/أسبوع/شهر/الكل is ever highlighted at a time.
// paGranularity still decides the candle SIZE either way (even while
// "الكل" is active, candles are still daily/weekly/monthly) — "الكل"
// only replaces the fixed recent window with full history at that size.
function _paUpdatePillStates() {
    document.querySelectorAll('[data-pa-gran]').forEach(b => {
        b.classList.toggle('active', !paShowAll && b.dataset.paGran === paGranularity);
    });
    document.getElementById('pa-showall-btn')?.classList.toggle('active', paShowAll);
}
_paUpdatePillStates();

document.querySelectorAll('[data-pa-gran]').forEach(btn => {
    btn.addEventListener('click', () => {
        paGranularity = btn.dataset.paGran;
        paShowAll = false;
        localStorage.setItem('delivo_admin_pa_granularity', paGranularity);
        localStorage.setItem('delivo_admin_pa_show_all', '0');
        _paUpdatePillStates();
        renderProfitAnalytics();
    });
});

document.getElementById('pa-showall-btn')?.addEventListener('click', () => {
    paShowAll = true;
    localStorage.setItem('delivo_admin_pa_show_all', '1');
    _paUpdatePillStates();
    renderProfitAnalytics();
});

document.getElementById('pa-refresh-btn')?.addEventListener('click', async () => {
    await loadAllData();
    renderProfitAnalytics();
    toast('✅ تم تحديث التحليل');
});

// ── Candle boundaries ────────────────────────────────────────────
// All anchored to the same 4 AM business-day cutover as everything
// else (bizDayStart/bizDateKey in admin-04), so a candle's "day" lines
// up exactly with what the rest of the admin panel calls "today".
function _paWeekStart(d) {
    const bd  = bizDayStart(d);
    const dow = bd.getDay();          // 0 Sun .. 6 Sat
    const off = (dow + 6) % 7;        // days back to Monday
    const ws  = new Date(bd);
    ws.setDate(bd.getDate() - off);
    return ws;
}
function _paMonthStart(d) {
    const bd = bizDayStart(d);
    return new Date(bd.getFullYear(), bd.getMonth(), 1, BIZ_DAY_START_HOUR);
}
function _paCandleStart(d, gran) {
    if (gran === 'week')  return _paWeekStart(d);
    if (gran === 'month') return _paMonthStart(d);
    return bizDayStart(d);
}
function _paCandleKey(start, gran) {
    if (gran === 'month') return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return bizDateKey(start);
}
function _paCandleLabel(start, gran) {
    if (gran === 'day') return start.toLocaleDateString('ar-LB', { day: 'numeric', month: 'short' });
    if (gran === 'week') {
        const end = new Date(start); end.setDate(start.getDate() + 6);
        return `${start.toLocaleDateString('ar-LB', { day: 'numeric', month: 'short' })}–${end.toLocaleDateString('ar-LB', { day: 'numeric', month: 'short' })}`;
    }
    return start.toLocaleDateString('ar-LB', { month: 'long', year: 'numeric' });
}
// Flat multiplier from this candle's own profit to a projected full
// month — see PA_MONTH_MULTIPLIER at the top of the file.
function _paMonthMultiplier(gran) {
    return PA_MONTH_MULTIPLIER[gran] || 1;
}

// Gross orders-profit for one delivered order — delivery-fee profit
// (fee minus driver cut) + extra profit. Same components as the orders
// panel's "🚗 ربح التوصيل" + "➕ ربح إضافي", intentionally excluding
// expenses (see file header).
function _paOrderProfitUSD(o) {
    const deliveryProfit = getOrderDeliveryProfit(o, companyVars);
    const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : deliveryProfit;
    const driverFeeRaw = _getOrderDriverFeeRaw(o, effectiveDeliveryRaw);
    const deliveryProfitUSD = _deliveryFeeToUSD(effectiveDeliveryRaw) - _deliveryFeeToUSD(driverFeeRaw);
    const extraUSD = (o.extraProfit != null && o.extraProfit !== '') ? _toUSD(o.extraProfit) : 0;
    return deliveryProfitUSD + extraUSD;
}

// Resolves paShowAll into an actual candle count for the current
// granularity, spanning from the earliest delivered order through
// today — mirrors _ordChartAllTimeDays() in admin-05 for the orders
// panel's own "📜 الكل" range option.
function _paAllTimeCandleCount(gran) {
    let earliest = null;
    Object.values(allOrders).forEach(o => {
        if ((o.state || '0') !== '1') return; // only delivered orders
        const od = _parseOrderDate(o);
        if (!od) return;
        if (!earliest || od < earliest) earliest = od;
    });
    if (!earliest) return PA_CANDLE_COUNT[gran] || 30; // no delivered orders yet — sane fallback

    const nowStart = _paCandleStart(new Date(), gran);
    const earliestStart = _paCandleStart(earliest, gran);
    if (gran === 'week') return Math.max(1, Math.round((nowStart - earliestStart) / (7 * 86400000)) + 1);
    if (gran === 'month') return Math.max(1, (nowStart.getFullYear() - earliestStart.getFullYear()) * 12 + (nowStart.getMonth() - earliestStart.getMonth()) + 1);
    return Math.max(1, Math.round((nowStart - earliestStart) / 86400000) + 1); // day
}

let _paCandleOrders = {}; // candle key -> [key, order][] — for the count-chart click-through

function _paBuildCandles() {
    const n = paShowAll ? _paAllTimeCandleCount(paGranularity) : (PA_CANDLE_COUNT[paGranularity] || 30);
    const candles = [];
    let cursor = _paCandleStart(new Date(), paGranularity);
    for (let i = 0; i < n; i++) {
        candles.unshift({ start: new Date(cursor), key: _paCandleKey(cursor, paGranularity), count: 0, profit: 0, orders: [] });
        cursor = _paCandleStart(new Date(cursor.getTime() - 86400000), paGranularity); // step back at least one day, then re-snap to that period's start
    }
    const byKey = {};
    candles.forEach(c => { byKey[c.key] = c; });

    Object.entries(allOrders).forEach(([key, o]) => {
        if ((o.state || '0') !== '1') return; // only delivered orders
        const od = _parseOrderDate(o);
        if (!od) return;
        const cKey = _paCandleKey(_paCandleStart(od, paGranularity), paGranularity);
        const c = byKey[cKey];
        if (!c) return; // outside the shown window
        c.count++;
        c.profit += _paOrderProfitUSD(o);
        c.orders.push([key, o]);
    });

    return candles;
}

// ── Reusable candle bar chart (shared shape for the count + profit
// charts) — renders bars with a value label on each, and wires a
// click handler per bar. `colorFn(value)` picks each bar's fill. ────
const _PA_CHART_VB_W = 1000, _PA_CHART_VB_H = 210;
const _PA_CHART_PAD  = { l: 40, r: 10, t: 24, b: 26 };

function _paNiceMax(v) {
    if (v <= 0) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const nrm = v / p;
    const step = nrm <= 1 ? 1 : nrm <= 2 ? 2 : nrm <= 5 ? 5 : 10;
    return step * p;
}

function _paRenderChart(bodyId, candles, opts) {
    const body = document.getElementById(bodyId);
    if (!body) return;

    const values = candles.map(c => opts.value(c));
    const maxAbs = Math.max(...values.map(v => Math.abs(v)), 1);
    const hasNeg = values.some(v => v < 0);
    const maxVal = _paNiceMax(maxAbs * 1.15);

    const innerH = _PA_CHART_VB_H - _PA_CHART_PAD.t - _PA_CHART_PAD.b;
    const innerW = _PA_CHART_VB_W - _PA_CHART_PAD.l - _PA_CHART_PAD.r;
    const n = candles.length;
    const gap = innerW / n;
    const barW = Math.max(1.5, Math.min(30, gap * 0.55));
    // Label density scales down as candle count grows (matters once
    // "📜 الكل" is showing many months/weeks of daily candles) — same
    // tiered thinning as the orders panel's own daily chart.
    const every = n <= 10 ? 1 : n <= 20 ? 2 : n <= 40 ? 4 : n <= 100 ? 7 : n <= 250 ? 14 : 30;
    // Per-bar value numbers stop being legible past ~40 bars — the exact
    // number is still available via the hover tooltip and click-through.
    const showValues = n <= 40;

    // Zero-line sits mid-height only when negative values are present
    // (profit chart); otherwise the baseline is the bottom, same as a
    // normal all-positive bar chart (count chart).
    const zeroY = hasNeg ? _PA_CHART_PAD.t + innerH / 2 : _PA_CHART_PAD.t + innerH;
    const posScale = hasNeg ? (innerH / 2) / maxVal : innerH / maxVal;
    const negScale = posScale;

    let grid = '';
    const gridSteps = hasNeg ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
    gridSteps.forEach(f => {
        const y = zeroY - (hasNeg ? f * (innerH / 2) : f * innerH);
        const val = Math.round(f * maxVal);
        grid += `<line x1="${_PA_CHART_PAD.l}" y1="${y.toFixed(1)}" x2="${_PA_CHART_VB_W - _PA_CHART_PAD.r}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
        grid += `<text x="${_PA_CHART_PAD.l - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--gray)" font-family="var(--mono)">${opts.fmtAxis ? opts.fmtAxis(val) : val}</text>`;
    });

    const bars = candles.map((c, i) => {
        const v = opts.value(c);
        const cx = _PA_CHART_PAD.l + gap * i + gap / 2;
        const h = Math.abs(v) * posScale;
        const yTop = v >= 0 ? zeroY - h : zeroY;
        const showLabel = i % every === 0 || i === n - 1;
        const isLast = i === n - 1;
        const fill = opts.colorFn(v, isLast);
        // Exact value on top of every bar (below-bar for negative ones).
        const valueLabelY = v >= 0 ? Math.max(yTop - 6, _PA_CHART_PAD.t - 4) : yTop + h + 12;
        const valueLabel = (v !== 0 && showValues)
            ? `<text x="${cx.toFixed(1)}" y="${valueLabelY.toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${fill}" style="pointer-events:none;">${opts.fmtBar ? opts.fmtBar(v) : v}</text>`
            : '';
        return `
            <rect class="pa-chart-hit" data-key="${c.key}" x="${(cx - gap / 2).toFixed(1)}" y="${_PA_CHART_PAD.t}" width="${gap.toFixed(1)}" height="${innerH.toFixed(1)}" fill="transparent" style="cursor:${v !== 0 ? 'pointer' : 'default'};"></rect>
            <rect class="pa-chart-bar" x="${(cx - barW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="3" fill="${fill}" opacity="${isLast ? '1' : '0.85'}" style="pointer-events:none;">
                <title>${_paCandleLabel(c.start, paGranularity)} — ${opts.tooltip(c)}</title>
            </rect>
            ${valueLabel}
            ${showLabel ? `<text x="${cx.toFixed(1)}" y="${_PA_CHART_VB_H - 8}" text-anchor="middle" font-size="9" fill="var(--gray)" style="pointer-events:none;">${_paCandleLabel(c.start, paGranularity)}</text>` : ''}`;
    }).join('');

    body.innerHTML = `
        <svg viewBox="0 0 ${_PA_CHART_VB_W} ${_PA_CHART_VB_H}" preserveAspectRatio="none" style="width:100%;height:180px;overflow:visible;">
            ${grid}
            ${bars}
        </svg>`;

    body.querySelectorAll('.pa-chart-hit').forEach(hit => {
        hit.addEventListener('click', () => {
            const c = candles.find(x => x.key === hit.dataset.key);
            if (c) opts.onClick(c);
        });
    });
}

function renderProfitAnalytics() {
    const candles = _paBuildCandles();
    _paCandleOrders = {};
    candles.forEach(c => { _paCandleOrders[c.key] = c; });

    const totalCount  = candles.reduce((a, c) => a + c.count, 0);
    const totalProfit = candles.reduce((a, c) => a + c.profit, 0);
    const avgCount    = totalCount / (candles.length || 1);
    const avgProfit   = totalProfit / (candles.length || 1);
    const avgPerOrder = totalCount ? totalProfit / totalCount : 0;

    const summaryEl = document.getElementById('pa-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <span>📦 إجمالي الطلبات: <b>${totalCount}</b></span>
            <span>💰 إجمالي ربح الطلبات: <b style="color:${totalProfit < 0 ? 'var(--red)' : 'var(--green)'};">$${totalProfit.toFixed(2)}</b></span>
            <span>📊 متوسط الطلبات/الفترة: <b>${avgCount.toFixed(1)}</b></span>
            <span>💵 متوسط الربح/الفترة: <b style="color:${avgProfit < 0 ? 'var(--red)' : ''};">$${avgProfit.toFixed(2)}</b></span>
            <span>🎯 متوسط الربح لكل طلب: <b>$${avgPerOrder.toFixed(2)}</b></span>`;
    }

    const rangeLabel = paShowAll
        ? 'منذ بداية السجل'
        : { day: 'آخر 30 يوم', week: 'آخر 12 أسبوع', month: 'آخر 12 شهر' }[paGranularity];
    const countTotEl = document.getElementById('pa-count-total');
    if (countTotEl) countTotEl.innerHTML = `${rangeLabel} — <b>${totalCount}</b> طلب`;
    const profitTotEl = document.getElementById('pa-profit-total');
    if (profitTotEl) profitTotEl.innerHTML = `${rangeLabel} — <b style="color:${totalProfit < 0 ? 'var(--red)' : ''};">$${totalProfit.toFixed(2)}</b>`;
    const perOrderTotEl = document.getElementById('pa-perorder-total');
    if (perOrderTotEl) perOrderTotEl.innerHTML = `${rangeLabel} — <b>$${avgPerOrder.toFixed(2)}</b> إجمالاً`;

    if (totalCount === 0) {
        document.getElementById('pa-count-body').innerHTML    = `<div class="orders-chart-empty">لا توجد طلبات مُسلَّمة في هذه الفترة</div>`;
        document.getElementById('pa-profit-body').innerHTML   = `<div class="orders-chart-empty">لا توجد طلبات مُسلَّمة في هذه الفترة</div>`;
        document.getElementById('pa-perorder-body').innerHTML = `<div class="orders-chart-empty">لا توجد طلبات مُسلَّمة في هذه الفترة</div>`;
        return;
    }

    _paRenderChart('pa-count-body', candles, {
        value: c => c.count,
        colorFn: (v, isLast) => isLast ? 'var(--orange)' : 'var(--green)',
        fmtBar: v => String(v),
        tooltip: c => `${c.count} طلب مُسلَّم`,
        onClick: c => { if (c.orders.length) _openDayOrdersModal(_paCandleLabel(c.start, paGranularity), c.orders); },
    });

    _paRenderChart('pa-profit-body', candles, {
        value: c => c.profit,
        colorFn: v => v < 0 ? 'var(--red)' : 'var(--green)',
        fmtAxis: v => '$' + v.toFixed(0),
        fmtBar: v => '$' + v.toFixed(v % 1 === 0 ? 0 : 1),
        tooltip: c => `$${c.profit.toFixed(2)} ربح — اضغط للتوقّع الشهري`,
        onClick: c => _openPredictedProfitModal(c),
    });

    // Per-order profit — this candle's profit divided by its own order
    // count, so a slow candle with a couple of high-value orders and a
    // busy candle with many small ones are both visible on equal footing,
    // separate from the raw totals in the other two charts. Candles with
    // zero orders are skipped (no division by zero, no misleading $0 bar).
    _paRenderChart('pa-perorder-body', candles.filter(c => c.count > 0), {
        value: c => c.profit / c.count,
        colorFn: v => v < 0 ? 'var(--red)' : 'var(--green)',
        fmtAxis: v => '$' + v.toFixed(1),
        fmtBar: v => '$' + v.toFixed(2),
        tooltip: c => `$${(c.profit / c.count).toFixed(2)} لكل طلب (${c.count} طلب)`,
        onClick: c => { if (c.orders.length) _openDayOrdersModal(_paCandleLabel(c.start, paGranularity), c.orders); },
    });
}

// ── Predicted-monthly-profit breakdown modal ─────────────────────
function _openPredictedProfitModal(candle) {
    const multiplier = _paMonthMultiplier(paGranularity);
    const projected = candle.profit * multiplier;
    const monthExp = paExpectedMonthlyExpenses;
    const predicted = projected - monthExp;
    const granLabel = { day: 'يوم واحد', week: 'أسبوع واحد', month: 'شهر واحد' }[paGranularity];

    const overlay = document.createElement('div');
    overlay.id = 'pa-predict-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-width:420px;width:100%;padding:20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                <div style="font-weight:800;color:var(--white);">🔮 الربح الشهري المتوقع — ${_paCandleLabel(candle.start, paGranularity)}</div>
                <button id="pa-predict-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:0.82rem;color:var(--gray-light);">
                <div style="display:flex;justify-content:space-between;"><span>ربح هذه الفترة (${granLabel})</span><b style="color:${candle.profit < 0 ? 'var(--red)' : 'var(--green)'};">$${candle.profit.toFixed(2)}</b></div>
                <div style="display:flex;justify-content:space-between;"><span>إسقاط على شهر (× ${multiplier})</span><b>$${projected.toFixed(2)}</b></div>
                <div style="display:flex;justify-content:space-between;"><span>💸 المصاريف الشهرية المتوقعة</span><b style="color:var(--red);">-$${monthExp.toFixed(2)}</b></div>
                <hr style="border:none;border-top:1px solid var(--border);margin:4px 0;">
                <div style="display:flex;justify-content:space-between;font-size:0.95rem;"><span style="font-weight:800;color:var(--white);">💚 الربح الشهري المتوقع</span><b style="color:${predicted < 0 ? 'var(--red)' : 'var(--green)'};">$${predicted.toFixed(2)}</b></div>
                <div style="font-size:0.7rem;color:var(--gray);margin-top:4px;">= ($${candle.profit.toFixed(2)} × ${multiplier}) − $${monthExp.toFixed(2)}</div>
                ${!monthExp ? `<div style="font-size:0.7rem;color:var(--orange);margin-top:2px;">⚠️ لم تُدخل مصاريف شهرية متوقعة بعد — أدخلها في أعلى الصفحة</div>` : ''}
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#pa-predict-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}