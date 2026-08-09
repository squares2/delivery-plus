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
            ts, type: 'expense', key, category: e.category, isExpenseRow: true,
            label: e.desc || 'مصروف',
            amountUSD: -_expToUSD(e.amount), // negative e.amount (a credit/refund) flips this positive
        });
    });

    // Whish transactions (📲 حركة Whish button/modal) move physical cash
    // between the drawer and the Whish e-wallet, so they belong in the cash
    // ledger too — with the OPPOSITE sign from the Whish sub-ledger's own
    // balance: depositing INTO Whish takes cash OUT of the drawer (expense
    // here), withdrawing FROM Whish puts cash BACK IN the drawer (income
    // here). Bucketed by business day like everything else. افتتاح
    // (balance-set) entries are excluded entirely — they only initialize/
    // correct the Whish-side balance and never touch real cash, so they
    // have no row here at all.
    Object.entries(window.allCashboxWhish || {}).forEach(([key, t]) => {
        if (!t || t.type === 'open') return;
        const ts = t.createdAt || Date.now();
        if (bizDateKey(new Date(ts)) !== dateStr) return;
        const isDeposit = t.type !== 'out'; // deposit into Whish vs withdraw from Whish
        transactions.push({
            ts, type: isDeposit ? 'expense' : 'income', key, whish: true,
            label: `📲 ${isDeposit ? 'إيداع Whish' : 'سحب من Whish'}${t.desc ? ' — ' + t.desc : ''}`,
            amountUSD: isDeposit ? -_toUSD(t.amount) : _toUSD(t.amount),
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
            <td style="font-family:var(--mono);white-space:nowrap;">${entry ? '$' + openingUSD.toFixed(2) : '—'}</td>
            <td style="white-space:nowrap;">
                <button type="button" id="cb-opening-row-edit-btn" title="تعديل الرصيد الافتتاحي" style="background:none;border:none;color:var(--orange);cursor:pointer;font-size:0.8rem;">✏️</button>
            </td>
        </tr>`;

        rowsHtml += transactions.map(t => {
            const timeStr = new Date(t.ts).toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit' });
            // For a plain logged expense, direction follows the actual sign of
            // amountUSD (a negative entered amount is a refund/credit and
            // flips it positive) rather than the fixed 'expense' type — orders
            // and Whish rows keep using type, since their sign is already set
            // to match at push time.
            const isIncome = t.isExpenseRow ? (t.amountUSD >= 0) : (t.type === 'income');
            const typeLabel = t.whish
                ? (isIncome ? '📲 سحب Whish' : '📲 إيداع Whish')
                : t.isExpenseRow
                    ? ((isIncome ? '↩️ استرداد مصروف' : '💸 مصروف') + (t.category ? ` (${_expEscHtml(t.category)})` : ''))
                    : '📦 دخل طلب';
            const amountColor = isIncome ? 'var(--green)' : 'var(--red)';
            const sign = isIncome ? '+' : '−';
            const balColor = t.balanceAfter < 0 ? 'color:var(--red);' : '';
            let actionsHtml = '';
            if (t.whish) {
                actionsHtml = `<button class="or-remove-btn" data-cb-whish-edit="${t.key}" style="border-color:rgba(139,92,246,0.35);color:#a78bfa;margin-left:4px;">✏️</button>
                <button class="or-remove-btn" data-cb-whish-del="${t.key}">🗑</button>`;
            } else if (t.isExpenseRow) {
                actionsHtml = `<button class="or-remove-btn" data-cb-exp-edit="${t.key}" style="border-color:rgba(255,92,0,0.35);color:var(--orange);margin-left:4px;">✏️</button>
                <button class="or-remove-btn" data-cb-exp-del="${t.key}">🗑</button>`;
            }
            return `<tr data-key="${t.key}">
                <td style="white-space:nowrap;">${timeStr}</td>
                <td>${_expEscHtml(t.label)}</td>
                <td style="color:var(--gray-light);">${typeLabel}</td>
                <td style="font-family:var(--mono);color:${amountColor};white-space:nowrap;">${sign}$${Math.abs(t.amountUSD).toFixed(2)}</td>
                <td style="font-family:var(--mono);white-space:nowrap;${balColor}">$${t.balanceAfter.toFixed(2)}</td>
                <td style="white-space:nowrap;">${actionsHtml}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rowsHtml;
        document.getElementById('cb-opening-row-edit-btn')?.addEventListener('click', () => cbOpenOpeningModal());
        tbody.querySelectorAll('[data-cb-exp-edit]').forEach(btn => {
            btn.addEventListener('click', () => expOpenModal(allExpenses[btn.dataset.cbExpEdit], btn.dataset.cbExpEdit));
        });
        tbody.querySelectorAll('[data-cb-exp-del]').forEach(btn => {
            btn.addEventListener('click', () => expDeleteExpense(btn.dataset.cbExpDel));
        });
        tbody.querySelectorAll('[data-cb-whish-edit]').forEach(btn => {
            btn.addEventListener('click', () => _cbWhishOpenModal(window.allCashboxWhish[btn.dataset.cbWhishEdit], btn.dataset.cbWhishEdit));
        });
        tbody.querySelectorAll('[data-cb-whish-del]').forEach(btn => {
            btn.addEventListener('click', () => _cbWhishDelete(btn.dataset.cbWhishDel));
        });
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

// Replays every Whish transaction in chronological order to get the
// current balance — needed (rather than a simple net sum) because a
// 'open' (افتتاح) transaction directly SETS the balance at that point in
// time rather than adding/subtracting, so anything after it must build on
// that set value, not on the raw total of everything before it. totalIn/
// totalOut stay pure "real money movement" figures — an افتتاح entry
// doesn't add to either, since it's a correction/initialization, not an
// actual deposit or withdrawal.
function _cbWhishTotals() {
    const entries = Object.entries(window.allCashboxWhish || {}).filter(([, t]) => t);
    const chronological = entries.slice().sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0));
    let balance = 0, totalIn = 0, totalOut = 0;
    chronological.forEach(([, t]) => {
        const amt = _toUSD(t.amount);
        if (t.type === 'open') {
            balance = amt;
        } else if (t.type === 'out') {
            totalOut += amt;
            balance -= amt;
        } else {
            totalIn += amt;
            balance += amt;
        }
    });
    return { entries, totalIn, totalOut, balance };
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
        const isOpen = t.type === 'open';
        const isIn = t.type !== 'out'; // 'in' and 'open' both read as non-'out' for color grouping below, but labels differ
        const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleString('ar-LB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const typeLabel = isOpen ? '🌅 افتتاح (تعيين الرصيد)' : (isIn ? '⬇️ إيداع' : '⬆️ سحب');
        const typeColor = isOpen ? '#a78bfa' : (isIn ? 'var(--green)' : 'var(--red)');
        const amountStr = isOpen ? `=$${_toUSD(t.amount).toFixed(2)}` : `${isIn ? '+' : '−'}$${_toUSD(t.amount).toFixed(2)}`;
        return `<tr data-key="${key}">
            <td style="white-space:nowrap;">${dateStr}</td>
            <td>${_expEscHtml(t.desc || '—')}</td>
            <td style="color:${typeColor};white-space:nowrap;">${typeLabel}</td>
            <td style="font-family:var(--mono);color:${typeColor};white-space:nowrap;">${amountStr}</td>
            <td style="color:var(--gray-light);font-size:var(--fs-xs);">${_expEscHtml(t.addedByName || t.addedBy || '—')}</td>
            <td style="white-space:nowrap;">
                <button class="or-remove-btn" data-whish-edit="${key}" style="border-color:rgba(139,92,246,0.35);color:#a78bfa;margin-left:4px;">✏️</button>
                <button class="or-remove-btn" data-whish-del="${key}">🗑</button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-whish-edit]').forEach(btn => {
        btn.addEventListener('click', () => _cbWhishOpenModal(window.allCashboxWhish[btn.dataset.whishEdit], btn.dataset.whishEdit));
    });
    tbody.querySelectorAll('[data-whish-del]').forEach(btn => {
        btn.addEventListener('click', () => _cbWhishDelete(btn.dataset.whishDel));
    });
}

function _cbWhishSetType(type) {
    _cbWhishType = type;
    document.getElementById('cb-whish-type-in')?.classList.toggle('active', type === 'in');
    document.getElementById('cb-whish-type-out')?.classList.toggle('active', type === 'out');
    document.getElementById('cb-whish-type-open')?.classList.toggle('active', type === 'open');
    // افتتاح sets the balance to an absolute number rather than adding a
    // delta, and doesn't touch the cash-drawer ledger at all — swap the
    // amount field's label/hint and surface the explanatory note for it.
    const isOpen = type === 'open';
    const amountLabelEl = document.getElementById('cb-whish-amount-label');
    if (amountLabelEl) amountLabelEl.childNodes[0].textContent = isOpen ? 'الرصيد المستهدف ' : 'المبلغ ';
    const amountHintEl = document.getElementById('cb-whish-amount-hint');
    if (amountHintEl) amountHintEl.style.display = isOpen ? 'none' : '';
    const typeHintEl = document.getElementById('cb-whish-type-hint');
    if (typeHintEl) typeHintEl.style.display = isOpen ? '' : 'none';
}

function _cbWhishOpenModal(t, key) {
    document.getElementById('cb-whish-edit-key').value = key || '';
    document.getElementById('cb-whish-modal-title').textContent = t ? 'تعديل حركة Whish' : 'حركة رصيد Whish جديدة';
    document.getElementById('cb-whish-save-btn').textContent = t ? '💾 حفظ التغييرات' : '💾 حفظ';
    _cbWhishSetType(t?.type === 'out' ? 'out' : (t?.type === 'open' ? 'open' : 'in'));
    document.getElementById('cb-whish-datetime').value = _dtLocalStr(t?.createdAt ? new Date(t.createdAt) : new Date());
    document.getElementById('cb-whish-desc').value = t?.desc || '';
    document.getElementById('cb-whish-amount').value = t?.amount ?? '';
    document.getElementById('cb-whish-amount-cur').textContent = t?.amount ? `(${_currencySymbol(t.amount)})` : '($)';
    document.getElementById('cb-whish-modal-error').style.display = 'none';
    document.getElementById('modal-cashbox-whish').classList.add('open');
    setTimeout(() => document.getElementById('cb-whish-desc').focus(), 50);
}

document.getElementById('cb-whish-add-btn').addEventListener('click', () => _cbWhishOpenModal(null, null));
document.getElementById('cb-whish-type-in').addEventListener('click', () => _cbWhishSetType('in'));
document.getElementById('cb-whish-type-out').addEventListener('click', () => _cbWhishSetType('out'));
document.getElementById('cb-whish-type-open').addEventListener('click', () => _cbWhishSetType('open'));
document.getElementById('cb-whish-cancel-btn').addEventListener('click', () => document.getElementById('modal-cashbox-whish').classList.remove('open'));

document.getElementById('cb-whish-amount').addEventListener('input', e => {
    document.getElementById('cb-whish-amount-cur').textContent = e.target.value ? `(${_currencySymbol(e.target.value)})` : '($)';
});

document.getElementById('cb-whish-save-btn').addEventListener('click', async () => {
    const key       = document.getElementById('cb-whish-edit-key').value.trim();
    const isNew     = !key;
    const desc      = document.getElementById('cb-whish-desc').value.trim();
    const amountRaw = document.getElementById('cb-whish-amount').value.trim();
    const dtRaw     = document.getElementById('cb-whish-datetime').value;
    const errEl     = document.getElementById('cb-whish-modal-error');
    const btn       = document.getElementById('cb-whish-save-btn');

    errEl.style.display = 'none';
    const amount = parseFloat(amountRaw);
    const isOpenType = _cbWhishType === 'open';
    // افتتاح sets an absolute target balance, so 0 is a valid value (e.g.
    // resetting the wallet to empty) — إيداع/سحب are real money movements
    // and must stay strictly positive.
    if (!amountRaw || isNaN(amount) || (isOpenType ? amount < 0 : amount <= 0)) {
        errEl.textContent = '⚠️ أدخل مبلغاً صحيحاً'; errEl.style.display = 'block'; return;
    }
    if (!dtRaw) {
        errEl.textContent = '⚠️ التاريخ والوقت مطلوب'; errEl.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';
    try {
        const payload = {
            type: _cbWhishType,
            desc: desc || (_cbWhishType === 'in' ? 'إيداع' : _cbWhishType === 'out' ? 'سحب' : 'افتتاح رصيد Whish'),
            amount: amountRaw,
            addedBy:     currentAdmin?.username || '',
            addedByName: currentAdmin?.fullname || currentAdmin?.username || '',
            createdAt: new Date(dtRaw).getTime(),
        };
        if (isNew) {
            const res = await fbPush('cashboxWhish', payload);
            if (res && res.name) {
                window.allCashboxWhish = window.allCashboxWhish || {};
                window.allCashboxWhish[res.name] = payload;
            }
        } else {
            await fbUpdate(`cashboxWhish/${key}`, payload);
            window.allCashboxWhish[key] = { ...window.allCashboxWhish[key], ...payload };
        }
        document.getElementById('modal-cashbox-whish').classList.remove('open');
        toast(isNew ? (_cbWhishType === 'in' ? '✅ تم تسجيل الإيداع' : _cbWhishType === 'out' ? '✅ تم تسجيل السحب' : '✅ تم تعيين رصيد Whish') : '💾 تم حفظ التعديلات');
        renderCashbox(); // also refreshes the day ledger — Whish moves now show up there too
    } catch (e) {
        errEl.textContent = '⚠️ خطأ: ' + e.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false; btn.textContent = isNew ? '💾 حفظ' : '💾 حفظ التغييرات';
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
        renderCashbox(); // also refreshes the day ledger — Whish moves now show up there too
    } catch (e) {
        toast('⚠️ فشل الحذف: ' + e.message, true);
    }
}