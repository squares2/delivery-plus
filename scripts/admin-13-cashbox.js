/* ═══════════════════════════════════════════════════════════════
   DELIVO ADMIN — Cashbox / Cash-Drawer Ledger (حركة الصندوق)
   ------------------------------------------------------------------
   Sits under "المصاريف اليومية" in the sidebar (same permission —
   'expenses'). A per-day cash-drawer ledger:

     • Each day starts with a manually entered opening balance
       (رصيد افتتاحي), stored at /cashbox/{YYYY-MM-DD}.
     • Every delivered order's realized profit (delivery profit —
       fee minus driver cut, same split as admin-05's renderOrders —
       plus any extraProfit) is listed as an income row.
     • Every logged expense (scripts/admin-12-expenses.js) for that
       day is listed as an expense row.
     • Rows are shown chronologically with a running balance, ending
       in the drawer's current on-hand total for that day.

   Nothing here is written per-transaction — orders/expenses are the
   existing source of truth; this panel just replays them against the
   day's opening balance. Only the opening balance itself is stored.
═══════════════════════════════════════════════════════════════ */

// Guards against re-popping the "set today's opening balance" prompt
// more than once per admin session.
let _cbAutoPromptShown = false;

function _cbDateKey(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function _cbShiftDate(dateStr, delta) {
    const [y, m, d] = (dateStr || _todayStr()).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + delta);
    return _cbDateKey(dt);
}

// Replays orders + expenses for a single day against that day's opening
// balance (if any) and returns the full picture: the opening amount, the
// sorted transaction list (each with a running balanceAfter), and the
// income/expense/closing totals. Used both to render the ledger and to
// suggest the previous day's closing balance when prompting for a new
// day's opening.
function _cbComputeDayTotals(dateStr) {
    const entry = (window.allCashbox || {})[dateStr] || null;
    const openingUSD = entry ? _toUSD(entry.opening) : 0;

    const transactions = [];

    Object.entries(allOrders || {}).forEach(([key, o]) => {
        if (!o || (o.state || '0') !== '1') return; // only delivered orders are realized cash
        const od = _parseOrderDate(o);
        if (!od || _cbDateKey(od) !== dateStr) return;

        const deliveryProfit = getOrderDeliveryProfit(o, companyVars);
        const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : deliveryProfit;
        const driverFeeRaw = _getOrderDriverFeeRaw(o, effectiveDeliveryRaw);
        const deliveryProfitUSD = _deliveryFeeToUSD(effectiveDeliveryRaw) - _deliveryFeeToUSD(driverFeeRaw);
        const extraUSD = (o.extraProfit != null && o.extraProfit !== '') ? _toUSD(o.extraProfit) : 0;
        const amountUSD = deliveryProfitUSD + extraUSD;
        if (!amountUSD) return; // nothing realized on this order — skip the row

        const orderNo = key.replace('id_', '');
        transactions.push({
            ts: od.getTime(), type: 'income', key,
            label: `📦 طلب #${orderNo} — ${o.fullname || o.store || 'زبون'}`,
            amountUSD,
        });
    });

    Object.entries(allExpenses || {}).forEach(([key, e]) => {
        if (!e || e.date !== dateStr) return;
        const ts = e.createdAt || new Date(`${dateStr}T12:00:00`).getTime();
        transactions.push({
            ts, type: 'expense', key, category: e.category,
            label: e.desc || 'مصروف',
            amountUSD: -_toUSD(e.amount),
        });
    });

    transactions.sort((a, b) => a.ts - b.ts);

    let running = openingUSD;
    transactions.forEach(t => { running += t.amountUSD; t.balanceAfter = running; });

    const incomeUSD  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amountUSD, 0);
    const expenseUSD = transactions.filter(t => t.type === 'expense').reduce((s, t) => s - t.amountUSD, 0);

    return { entry, openingUSD, transactions, incomeUSD, expenseUSD, closingUSD: running };
}

// Reflect today's date into the picker as soon as this script loads,
// same pattern as admin-12's date-filter defaults.
document.getElementById('cb-date').value = _todayStr();

function renderCashbox() {
    const dateInput = document.getElementById('cb-date');
    if (!dateInput.value) dateInput.value = _todayStr();
    const date = dateInput.value;
    const todayStr = _todayStr();

    const { entry, openingUSD, transactions, incomeUSD, expenseUSD, closingUSD } = _cbComputeDayTotals(date);

    document.getElementById('cb-no-opening-banner').style.display = entry ? 'none' : '';
    document.getElementById('cb-opening-amount').textContent = '$' + openingUSD.toFixed(2);
    document.getElementById('cb-income-amount').textContent  = '$' + incomeUSD.toFixed(2);
    document.getElementById('cb-expense-amount').textContent = '$' + expenseUSD.toFixed(2);
    const curEl = document.getElementById('cb-current-amount');
    curEl.textContent = '$' + closingUSD.toFixed(2);
    curEl.style.color = closingUSD < 0 ? 'var(--red)' : '';

    document.getElementById('cb-count-label').textContent = `${transactions.length} حركة`;

    const tbody = document.getElementById('cb-tbody');
    const table = document.getElementById('cb-table');
    const empty = document.getElementById('cb-empty');

    if (!entry && !transactions.length) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
    } else {
        table.style.display = '';
        empty.style.display = 'none';

        let rowsHtml = `<tr style="background:rgba(255,255,255,0.03);">
            <td>—</td>
            <td><b>🌅 رصيد افتتاحي</b></td>
            <td style="color:var(--gray-light);">افتتاحي</td>
            <td style="font-family:var(--mono);">${entry ? '$' + openingUSD.toFixed(2) : '<span style="color:var(--gray);">لم يُحدَّد</span>'}</td>
            <td style="font-family:var(--mono);">${entry ? '$' + openingUSD.toFixed(2) : '—'}</td>
        </tr>`;

        rowsHtml += transactions.map(t => {
            const timeStr = new Date(t.ts).toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit' });
            const isIncome = t.type === 'income';
            const typeLabel = isIncome ? '📦 دخل طلب' : ('💸 مصروف' + (t.category ? ` (${_expEscHtml(t.category)})` : ''));
            const amountColor = isIncome ? 'var(--green)' : 'var(--red)';
            const sign = isIncome ? '+' : '−';
            const balColor = t.balanceAfter < 0 ? 'color:var(--red);' : '';
            return `<tr data-key="${t.key}">
                <td style="white-space:nowrap;">${timeStr}</td>
                <td>${_expEscHtml(t.label)}</td>
                <td style="color:var(--gray-light);">${typeLabel}</td>
                <td style="font-family:var(--mono);color:${amountColor};white-space:nowrap;">${sign}$${Math.abs(t.amountUSD).toFixed(2)}</td>
                <td style="font-family:var(--mono);white-space:nowrap;${balColor}">$${t.balanceAfter.toFixed(2)}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }

    // A brand-new day with no opening balance yet — ask for it once per
    // session. Past days simply show the "not set" banner + manual button
    // instead, since retroactively "asking" for an already-closed day
    // doesn't make sense.
    if (!entry && date === todayStr && !_cbAutoPromptShown) {
        _cbAutoPromptShown = true;
        setTimeout(() => cbOpenOpeningModal(), 150);
    }
}

// ── Opening-balance modal ────────────────────────────────────────
function cbOpenOpeningModal() {
    const date = document.getElementById('cb-date').value || _todayStr();
    const entry = (window.allCashbox || {})[date];

    document.getElementById('cb-opening-modal-title').textContent = entry ? 'تعديل الرصيد الافتتاحي' : 'تعيين الرصيد الافتتاحي';
    document.getElementById('cb-opening-modal-sub').textContent = `ليوم ${date}`;
    document.getElementById('cb-opening-modal-error').style.display = 'none';

    let suggested = entry ? entry.opening : '';
    if (!entry) {
        // No opening set yet for this day — suggest yesterday's closing
        // balance as a starting point (still fully editable/overridable).
        const prevTotals = _cbComputeDayTotals(_cbShiftDate(date, -1));
        if (prevTotals.entry) suggested = prevTotals.closingUSD.toFixed(2);
    }
    document.getElementById('cb-opening-input').value = suggested;
    document.getElementById('cb-opening-amount-cur').textContent = suggested ? `(${_currencySymbol(suggested)})` : '($)';

    document.getElementById('modal-cashbox-opening').classList.add('open');
    setTimeout(() => document.getElementById('cb-opening-input').focus(), 50);
}

document.getElementById('cb-set-opening-btn').addEventListener('click', () => cbOpenOpeningModal());
document.getElementById('cb-opening-cancel-btn').addEventListener('click', () => document.getElementById('modal-cashbox-opening').classList.remove('open'));

document.getElementById('cb-opening-input').addEventListener('input', e => {
    document.getElementById('cb-opening-amount-cur').textContent = e.target.value ? `(${_currencySymbol(e.target.value)})` : '($)';
});

document.getElementById('cb-opening-save-btn').addEventListener('click', async () => {
    const date = document.getElementById('cb-date').value || _todayStr();
    const raw  = document.getElementById('cb-opening-input').value.trim();
    const errEl = document.getElementById('cb-opening-modal-error');
    const btn   = document.getElementById('cb-opening-save-btn');

    errEl.style.display = 'none';
    const amount = parseFloat(raw);
    if (raw === '' || isNaN(amount) || amount < 0) {
        errEl.textContent = '⚠️ أدخل مبلغاً صحيحاً'; errEl.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';
    try {
        const payload = {
            opening: raw,
            openingSetBy:     currentAdmin?.username || '',
            openingSetByName: currentAdmin?.fullname || currentAdmin?.username || '',
            openingSetAt: Date.now(),
        };
        await fbSet(`cashbox/${date}`, payload);
        window.allCashbox = window.allCashbox || {};
        window.allCashbox[date] = payload;

        document.getElementById('modal-cashbox-opening').classList.remove('open');
        toast('✅ تم حفظ الرصيد الافتتاحي');
        renderCashbox();
    } catch (e) {
        errEl.textContent = '⚠️ خطأ: ' + e.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = '💾 حفظ';
    }
});

// ── Date navigation + refresh ────────────────────────────────────
document.getElementById('cb-date').addEventListener('change', () => renderCashbox());
document.getElementById('cb-prev-day-btn').addEventListener('click', () => {
    const el = document.getElementById('cb-date');
    el.value = _cbShiftDate(el.value, -1);
    renderCashbox();
});
document.getElementById('cb-next-day-btn').addEventListener('click', () => {
    const el = document.getElementById('cb-date');
    el.value = _cbShiftDate(el.value, 1);
    renderCashbox();
});
document.getElementById('cb-today-btn').addEventListener('click', () => {
    document.getElementById('cb-date').value = _todayStr();
    renderCashbox();
});
document.getElementById('cb-refresh-btn').addEventListener('click', async () => {
    await loadAllData();
    renderCashbox();
    toast('✅ تم تحديث حركة الصندوق');
});