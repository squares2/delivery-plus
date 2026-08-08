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

// Pure calendar-date formatter — NOT business-day-aware. Only for
// dates that already represent a specific chosen calendar day with no
// meaningful time-of-day (e.g. _cbShiftDate's day-nav arithmetic
// below). For bucketing a real order/expense TIMESTAMP by day, use
// bizDateKey() from admin-04 instead, which applies the 4 AM cutover.
function _cbPlainDateKey(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function _cbShiftDate(dateStr, delta) {
    const [y, m, d] = (dateStr || _todayStr()).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + delta);
    return _cbPlainDateKey(dt);
}

// Replays orders + expenses for a single BUSINESS day (4 AM cutover —
// see bizDateKey() in admin-04) against that day's opening balance (if
// any) and returns the full picture: the opening amount, the sorted
// transaction list (each with a running balanceAfter), and the
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
        if (!od || bizDateKey(od) !== dateStr) return;

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

    renderCashboxWhish(); // always-current, not tied to the day picker below

    const { entry, openingUSD, transactions, incomeUSD, expenseUSD, closingUSD } = _cbComputeDayTotals(date);

    document.getElementById('cb-no-opening-banner').style.display = entry ? 'none' : '';
    document.getElementById('cb-opening-amount').textContent = '$' + openingUSD.toFixed(2);
    document.getElementById('cb-income-amount').textContent  = '$' + incomeUSD.toFixed(2);
    document.getElementById('cb-expense-amount').textContent = '$' + expenseUSD.toFixed(2);
    const curEl = document.getElementById('cb-current-amount');
    curEl.textContent = '$' + closingUSD.toFixed(2);
    curEl.style.color = closingUSD < 0 ? 'var(--red)' : '';

    const setBtnLabel = document.getElementById('cb-set-opening-btn-label');
    if (setBtnLabel) setBtnLabel.textContent = entry ? '✏️ تعديل الرصيد الافتتاحي' : '💰 تعيين الرصيد الافتتاحي';

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
            <td style="font-family:var(--mono);white-space:nowrap;">
                ${entry ? '$' + openingUSD.toFixed(2) : '—'}
                <button type="button" id="cb-opening-row-edit-btn" title="تعديل الرصيد الافتتاحي" style="background:none;border:none;color:var(--orange);cursor:pointer;font-size:0.8rem;margin-right:6px;">✏️</button>
            </td>
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
        document.getElementById('cb-opening-row-edit-btn')?.addEventListener('click', () => cbOpenOpeningModal());
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

    const delBtn = document.getElementById('cb-opening-delete-btn');
    if (delBtn) delBtn.style.display = entry ? '' : 'none';

    document.getElementById('modal-cashbox-opening').classList.add('open');
    setTimeout(() => document.getElementById('cb-opening-input').focus(), 50);
}

document.getElementById('cb-set-opening-btn').addEventListener('click', () => cbOpenOpeningModal());
document.getElementById('cb-opening-cancel-btn').addEventListener('click', () => document.getElementById('modal-cashbox-opening').classList.remove('open'));

document.getElementById('cb-opening-delete-btn').addEventListener('click', async () => {
    const date = document.getElementById('cb-date').value || _todayStr();
    const confirmed = await showConfirm({
        title: 'حذف الرصيد الافتتاحي',
        msg: `هل تريد حذف الرصيد الافتتاحي المسجَّل ليوم ${date}؟ ستحتاج لتعيينه من جديد لعرض حركة ذلك اليوم بشكل صحيح.`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف', cancelLabel: 'إلغاء',
    });
    if (!confirmed) return;
    try {
        await fbSet(`cashbox/${date}`, null);
        if (window.allCashbox) delete window.allCashbox[date];
        document.getElementById('modal-cashbox-opening').classList.remove('open');
        toast('✅ تم حذف الرصيد الافتتاحي');
        renderCashbox();
    } catch (e) {
        toast('⚠️ فشل الحذف: ' + e.message, true);
    }
});

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

/* ── WHISH balance (📲 رصيد Whish) ─────────────────────────────────
   A separate, always-current running balance for Delivo's Whish Money
   e-wallet — NOT day-scoped like the cash drawer above. Built purely
   from manual in/out transactions logged at /cashboxWhish/{key}, since
   there's no automatic source of truth for it the way orders/expenses
   are for the cash drawer. Balance = sum(in) − sum(out), always in USD
   via _toUSD (same >1000-is-LBP convention as everywhere else). ── */

let _cbWhishType = 'in'; // currently selected type in the add-transaction modal

const _CB_WHISH_EXPANDED_KEY = 'delivo_admin_whish_expanded';

// Collapsed by default (matches the static HTML above) so the day ledger
// gets most of the room; expanding it hands the day ledger back down to
// a fixed 320px and lets this section take the freed space instead.
function _cbWhishSetExpanded(expanded, persist = true) {
    const body    = document.getElementById('cb-whish-body');
    const chevron = document.getElementById('cb-whish-toggle-chevron');
    const section = document.getElementById('cb-whish-section');
    const dayWrap = document.getElementById('cb-table-wrap');
    if (!body || !section || !dayWrap) return;

    if (expanded) {
        body.style.display = 'flex';
        section.style.flex = '1 1 auto';
        section.style.minHeight = '220px';
        dayWrap.style.flex = '0 1 320px';
        dayWrap.style.maxHeight = '320px';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    } else {
        body.style.display = 'none';
        section.style.flex = '0 0 auto';
        section.style.minHeight = '';
        dayWrap.style.flex = '1';
        dayWrap.style.maxHeight = '';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
    if (persist) {
        try { localStorage.setItem(_CB_WHISH_EXPANDED_KEY, expanded ? '1' : '0'); } catch (_) {}
    }
}

document.getElementById('cb-whish-toggle-btn').addEventListener('click', () => {
    const body = document.getElementById('cb-whish-body');
    _cbWhishSetExpanded(body.style.display === 'none');
});

// Restore the admin's last choice (falls back to the collapsed default
// already baked into the static HTML, so nothing to do if never expanded).
(() => {
    let saved = '0';
    try { saved = localStorage.getItem(_CB_WHISH_EXPANDED_KEY) || '0'; } catch (_) {}
    if (saved === '1') _cbWhishSetExpanded(true, false);
})();

function _cbWhishTotals() {
    const entries = Object.entries(window.allCashboxWhish || {}).filter(([, t]) => t);
    let totalIn = 0, totalOut = 0;
    entries.forEach(([, t]) => {
        const amt = _toUSD(t.amount);
        if (t.type === 'out') totalOut += amt; else totalIn += amt;
    });
    return { entries, totalIn, totalOut, balance: totalIn - totalOut };
}

function renderCashboxWhish() {
    const { entries, totalIn, totalOut, balance } = _cbWhishTotals();

    const balStr = '$' + balance.toFixed(2);
    const inlineBal = document.getElementById('cb-whish-balance-inline');
    if (inlineBal) inlineBal.textContent = balStr;
    const sectionBal = document.getElementById('cb-whish-balance');
    if (sectionBal) { sectionBal.textContent = balStr; sectionBal.style.color = balance < 0 ? 'var(--red)' : '#a78bfa'; }

    const totInEl  = document.getElementById('cb-whish-total-in');
    const totOutEl = document.getElementById('cb-whish-total-out');
    if (totInEl)  totInEl.textContent  = '$' + totalIn.toFixed(2);
    if (totOutEl) totOutEl.textContent = '$' + totalOut.toFixed(2);

    const countEl = document.getElementById('cb-whish-count-label');
    if (countEl) countEl.textContent = `${entries.length} حركة`;

    const tbody = document.getElementById('cb-whish-tbody');
    const table = document.getElementById('cb-whish-table');
    const empty = document.getElementById('cb-whish-empty');
    if (!tbody || !table || !empty) return;

    const sorted = entries.sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!sorted.length) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
        return;
    }
    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = sorted.map(([key, t]) => {
        const isIn = t.type !== 'out';
        const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleString('ar-LB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        return `<tr data-key="${key}">
            <td style="white-space:nowrap;">${dateStr}</td>
            <td>${_expEscHtml(t.desc || '—')}</td>
            <td style="color:${isIn ? 'var(--green)' : 'var(--red)'};white-space:nowrap;">${isIn ? '⬇️ إيداع' : '⬆️ سحب'}</td>
            <td style="font-family:var(--mono);color:${isIn ? 'var(--green)' : 'var(--red)'};white-space:nowrap;">${isIn ? '+' : '−'}$${_toUSD(t.amount).toFixed(2)}</td>
            <td style="color:var(--gray-light);font-size:var(--fs-xs);">${_expEscHtml(t.addedByName || t.addedBy || '—')}</td>
            <td style="white-space:nowrap;">
                <button class="or-remove-btn" data-whish-del="${key}">🗑</button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-whish-del]').forEach(btn => {
        btn.addEventListener('click', () => _cbWhishDelete(btn.dataset.whishDel));
    });
}

function _cbWhishSetType(type) {
    _cbWhishType = type;
    document.getElementById('cb-whish-type-in')?.classList.toggle('active', type === 'in');
    document.getElementById('cb-whish-type-out')?.classList.toggle('active', type === 'out');
}

function _cbWhishOpenModal() {
    _cbWhishSetType('in');
    document.getElementById('cb-whish-desc').value = '';
    document.getElementById('cb-whish-amount').value = '';
    document.getElementById('cb-whish-amount-cur').textContent = '($)';
    document.getElementById('cb-whish-modal-error').style.display = 'none';
    document.getElementById('modal-cashbox-whish').classList.add('open');
    setTimeout(() => document.getElementById('cb-whish-desc').focus(), 50);
}

document.getElementById('cb-whish-add-btn').addEventListener('click', _cbWhishOpenModal);
document.getElementById('cb-whish-type-in').addEventListener('click', () => _cbWhishSetType('in'));
document.getElementById('cb-whish-type-out').addEventListener('click', () => _cbWhishSetType('out'));
document.getElementById('cb-whish-cancel-btn').addEventListener('click', () => document.getElementById('modal-cashbox-whish').classList.remove('open'));

document.getElementById('cb-whish-amount').addEventListener('input', e => {
    document.getElementById('cb-whish-amount-cur').textContent = e.target.value ? `(${_currencySymbol(e.target.value)})` : '($)';
});

document.getElementById('cb-whish-save-btn').addEventListener('click', async () => {
    const desc      = document.getElementById('cb-whish-desc').value.trim();
    const amountRaw = document.getElementById('cb-whish-amount').value.trim();
    const errEl     = document.getElementById('cb-whish-modal-error');
    const btn       = document.getElementById('cb-whish-save-btn');

    errEl.style.display = 'none';
    const amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount) || amount <= 0) {
        errEl.textContent = '⚠️ أدخل مبلغاً صحيحاً'; errEl.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';
    try {
        const payload = {
            type: _cbWhishType,
            desc: desc || (_cbWhishType === 'in' ? 'إيداع' : 'سحب'),
            amount: amountRaw,
            addedBy:     currentAdmin?.username || '',
            addedByName: currentAdmin?.fullname || currentAdmin?.username || '',
            createdAt: Date.now(),
        };
        const res = await fbPush('cashboxWhish', payload);
        if (res && res.name) {
            window.allCashboxWhish = window.allCashboxWhish || {};
            window.allCashboxWhish[res.name] = payload;
        }
        document.getElementById('modal-cashbox-whish').classList.remove('open');
        toast(_cbWhishType === 'in' ? '✅ تم تسجيل الإيداع' : '✅ تم تسجيل السحب');
        renderCashboxWhish();
    } catch (e) {
        errEl.textContent = '⚠️ خطأ: ' + e.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = '💾 حفظ';
    }
});

async function _cbWhishDelete(key) {
    const t = (window.allCashboxWhish || {})[key];
    const confirmed = await showConfirm({
        title: 'حذف حركة Whish',
        msg: `هل تريد حذف هذه الحركة (${t?.type === 'out' ? 'سحب' : 'إيداع'} — ${t?.desc || ''})؟`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف', cancelLabel: 'إلغاء',
    });
    if (!confirmed) return;
    try {
        await fbSet(`cashboxWhish/${key}`, null);
        if (window.allCashboxWhish) delete window.allCashboxWhish[key];
        toast('✅ تم حذف الحركة');
        renderCashboxWhish();
    } catch (e) {
        toast('⚠️ فشل الحذف: ' + e.message, true);
    }
}