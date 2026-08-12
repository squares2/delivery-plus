/* ═══════════════════════════════════════════════════════════════
   DELIVO ADMIN — Daily Expenses (المصاريف اليومية)
   ------------------------------------------------------------------
   Stand-alone panel for logging day-to-day business costs (rent,
   salaries, fuel, maintenance…), stored in Firebase at /expenses/{key}.
   Also feeds the orders panel's "صافي ربحك" figure (see admin-05's
   renderOrders): net profit there is now delivery/2 + extra − the
   expenses that fall inside that panel's OWN date filter, so it
   reflects the real bottom line for whatever period the admin is
   looking at, not just delivery+extra income.

   Amounts are stored exactly as typed (USD or ل.ل — auto-detected by
   magnitude, same >1000-is-LBP convention used everywhere else in this
   app) and only converted to USD via _toUSD() at render/sum time, so
   re-opening an expense to edit it shows the original number, not a
   rounded conversion.
═══════════════════════════════════════════════════════════════ */

let allExpenses = {}; // expenses/{key} → { date, desc, category, amount, addedBy, addedByName, createdAt }

// ── Date-filter + search state (own, independent of the orders panel's) ──
let expDateFilter = localStorage.getItem('delivo_admin_exp_date_filter') || 'today';
let expDateFrom   = localStorage.getItem('delivo_admin_exp_date_from') || '';
let expDateTo     = localStorage.getItem('delivo_admin_exp_date_to') || '';
let expSearch     = '';

// Reflect saved/default state into the controls on load, same pattern as
// the orders/online-requests date filters.
document.getElementById('exp-date-select').value = expDateFilter;
document.getElementById('exp-date-from').value   = expDateFrom;
document.getElementById('exp-date-to').value     = expDateTo;
document.getElementById('exp-date-custom').classList.toggle('active', expDateFilter === 'custom');

document.getElementById('exp-date-select').addEventListener('change', e => {
    expDateFilter = e.target.value;
    localStorage.setItem('delivo_admin_exp_date_filter', expDateFilter);
    document.getElementById('exp-date-custom').classList.toggle('active', expDateFilter === 'custom');
    if (expDateFilter !== 'custom') renderExpenses();
});
document.getElementById('exp-date-from').addEventListener('change', e => {
    expDateFrom = e.target.value;
    localStorage.setItem('delivo_admin_exp_date_from', expDateFrom);
    if (expDateFilter === 'custom') renderExpenses();
});
document.getElementById('exp-date-to').addEventListener('change', e => {
    expDateTo = e.target.value;
    localStorage.setItem('delivo_admin_exp_date_to', expDateTo);
    if (expDateFilter === 'custom') renderExpenses();
});
document.getElementById('exp-search').addEventListener('input', e => {
    expSearch = e.target.value.trim();
    renderExpenses();
});

function _expEscHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// "YYYY-MM-DDTHH:MM" in LOCAL time, for pre-filling/reading <input type=
// "datetime-local"> fields (expense date/time, Whish transaction date/time).
// Deliberately local-time formatting (not toISOString, which is UTC) so the
// picker shows/accepts the same wall-clock time the admin expects.
function _dtLocalStr(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Expense amounts can be negative (a refund/credit that reduces total
// spend), unlike _toUSD (aliased from _deliveryFeeToUSD in admin-10 —
// used for fees/order totals, which can never legitimately go negative
// and are zeroed out if they do). This keeps the sign while applying the
// same magnitude-based currency detection (>1000 = LBP) as everywhere else.
function _expToUSD(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return 0;
    return Math.abs(v) < 1000 ? v : v / (window._dollarRate || 90000);
}

// "Today" for every date-scoped feature in the admin panel (expenses'
// default date, حركة الصندوق's default day, etc.) — resolves through
// the shared 4 AM business-day cutover in admin-04 (bizDateKey), so a
// 2 AM shift still counts as "yesterday" everywhere consistently.
function _todayStr() {
    return bizDateKey();
}

// The orders panel's own net-profit figure depends on allExpenses — refresh
// it immediately if that panel happens to already be open, rather than
// waiting for its next periodic auto-refresh. Also refreshes حركة الصندوق
// (cashbox) if that's the active panel — its own "إضافة مصروف" button
// (admin.html) lives there now, so a newly added/edited/deleted expense
// should show up in the day ledger right away too.
function _expRefreshOrdersNetIfActive() {
    const po = document.getElementById('panel-orders');
    if (po && po.classList.contains('active') && typeof renderOrders === 'function') renderOrders();

    const pc = document.getElementById('panel-cashbox');
    if (pc && pc.classList.contains('active') && typeof renderCashbox === 'function') renderCashbox();
}

// _dateFilterMatches (shared with the orders panel) expects order.date as
// a real "Y-M-D H:MM:SS" timestamp so it can correctly apply the 4 AM
// business-day cutover. An expense's own `date` field is just the
// already-bucketed "YYYY-MM-DD" label (from bizDateKey at save time), with
// no time component — passing that straight through made _dateFilterMatches
// parse it as literal midnight, which is BEFORE the 4 AM cutover, so it got
// bucketed into the PREVIOUS business day a second time (double-applying
// the cutover) — e.g. an expense correctly dated "2026-08-12" showing up
// under "أمس" instead of "اليوم". Rebuilding the real date+time string from
// createdAt (the actual moment it was saved) gives _dateFilterMatches the
// real wall-clock time it expects, matching how orders behave.
function _expDateTimeStr(e) {
    if (!e.createdAt) return e.date; // legacy records with no createdAt — best effort
    const d = new Date(e.createdAt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Render ────────────────────────────────────────────────────
function renderExpenses() {
    const tbody   = document.getElementById('exp-tbody');
    const empty   = document.getElementById('exp-empty');
    const table   = document.getElementById('exp-table');
    const countEl = document.getElementById('exp-count-label');
    const totalEl = document.getElementById('exp-total-amount');
    if (!tbody) return;

    const entries = Object.entries(allExpenses)
        .filter(([, e]) => e && _dateFilterMatches({ date: _expDateTimeStr(e) }, expDateFilter, expDateFrom, expDateTo))
        .filter(([, e]) => !expSearch || (e.desc || '').toLowerCase().includes(expSearch.toLowerCase()))
        .sort(([, a], [, b]) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    countEl.textContent = `${entries.length} مصروف`;

    let totalUSD = 0;
    entries.forEach(([, e]) => { totalUSD += _expToUSD(e.amount); });
    totalEl.textContent = (totalUSD < 0 ? '-$' : '$') + Math.abs(totalUSD).toFixed(2);

    if (!entries.length) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
        return;
    }
    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = entries.map(([key, e]) => {
        const amtUSD = _expToUSD(e.amount);
        const isCredit = amtUSD < 0; // negative amount = refund/credit that reduces total spend
        return `
        <tr data-key="${key}">
            <td style="white-space:nowrap;">${e.date || '—'}</td>
            <td>${_expEscHtml(e.desc || '—')}</td>
            <td style="color:var(--gray-light);">${_expEscHtml(e.category || 'عام')}${isCredit ? ' — استرداد' : ''}</td>
            <td style="font-family:var(--mono);color:${isCredit ? 'var(--green)' : 'var(--red)'};white-space:nowrap;">${isCredit ? '+' : ''}$${Math.abs(amtUSD).toFixed(2)}</td>
            <td style="color:var(--gray-light);font-size:var(--fs-xs);">${_expEscHtml(e.addedByName || e.addedBy || '—')}</td>
            <td style="white-space:nowrap;">
                <button class="or-remove-btn" data-exp-edit="${key}" style="border-color:rgba(255,92,0,0.35);color:var(--orange);margin-left:4px;">✏️</button>
                <button class="or-remove-btn" data-exp-del="${key}">🗑</button>
            </td>
        </tr>
    `;
    }).join('');

    tbody.querySelectorAll('[data-exp-edit]').forEach(btn => {
        btn.addEventListener('click', () => expOpenModal(allExpenses[btn.dataset.expEdit], btn.dataset.expEdit));
    });
    tbody.querySelectorAll('[data-exp-del]').forEach(btn => {
        btn.addEventListener('click', () => expDeleteExpense(btn.dataset.expDel));
    });
}

// ── Add/Edit modal ─────────────────────────────────────────────
function expOpenModal(exp, key) {
    document.getElementById('exp-edit-key').value = key || '';
    document.getElementById('exp-modal-title').textContent = exp ? 'تعديل المصروف' : 'إضافة مصروف جديد';
    document.getElementById('exp-save-btn').textContent = exp ? '💾 حفظ التغييرات' : '💾 حفظ';
    document.getElementById('exp-modal-error').style.display = 'none';

    document.getElementById('exp-date').value = _dtLocalStr(exp?.createdAt ? new Date(exp.createdAt) : new Date());
    document.getElementById('exp-desc').value = exp?.desc || '';
    document.getElementById('exp-category').value = exp?.category || 'عام';
    document.getElementById('exp-amount').value = exp?.amount ?? '';
    document.getElementById('exp-amount-cur').textContent = exp?.amount ? `(${_currencySymbol(exp.amount)})` : '($)';

    document.getElementById('modal-expense').classList.add('open');
    setTimeout(() => document.getElementById('exp-desc').focus(), 50);
}

document.getElementById('exp-add-btn').addEventListener('click', () => expOpenModal(null, null));
document.getElementById('exp-cancel-btn').addEventListener('click', () => document.getElementById('modal-expense').classList.remove('open'));

document.getElementById('exp-refresh-btn').addEventListener('click', async () => {
    await loadAllData();
    renderExpenses();
    toast('✅ تم تحديث المصاريف');
});

document.getElementById('exp-amount').addEventListener('input', e => {
    document.getElementById('exp-amount-cur').textContent = e.target.value ? `(${_currencySymbol(e.target.value)})` : '($)';
});

document.getElementById('exp-save-btn').addEventListener('click', async () => {
    const key       = document.getElementById('exp-edit-key').value.trim();
    const isNew     = !key;
    const dtRaw     = document.getElementById('exp-date').value;
    const desc      = document.getElementById('exp-desc').value.trim();
    const category  = document.getElementById('exp-category').value;
    const amountRaw = document.getElementById('exp-amount').value.trim();
    const errEl     = document.getElementById('exp-modal-error');
    const btn       = document.getElementById('exp-save-btn');

    errEl.style.display = 'none';
    if (!dtRaw) { errEl.textContent = '⚠️ التاريخ والوقت مطلوب'; errEl.style.display = 'block'; return; }
    if (!desc) { errEl.textContent = '⚠️ البيان مطلوب';  errEl.style.display = 'block'; return; }
    const amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount) || amount === 0) {
        errEl.textContent = '⚠️ أدخل مبلغاً صحيحاً (سالباً لتسجيل استرداد/تخفيض)'; errEl.style.display = 'block'; return;
    }

    // The admin-chosen date/time is the real timestamp of the transaction —
    // `date` (the YYYY-MM-DD bucket used by every day-filter/ledger) is
    // derived from it through the same 4 AM business-day cutover as
    // everything else, so a 2 AM entry still lands in "yesterday" everywhere.
    const createdAtDate = new Date(dtRaw);
    const createdAt = createdAtDate.getTime();
    const date = bizDateKey(createdAtDate);

    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';
    try {
        const payload = {
            date, desc, category, amount, createdAt,
            addedBy:     currentAdmin?.username || '',
            addedByName: currentAdmin?.fullname || currentAdmin?.username || '',
        };
        if (isNew) {
            const res = await fbPush('expenses', payload);
            if (res && res.name) allExpenses[res.name] = payload;
        } else {
            await fbUpdate(`expenses/${key}`, payload);
            allExpenses[key] = { ...allExpenses[key], ...payload };
        }
        document.getElementById('modal-expense').classList.remove('open');
        toast(isNew ? '✅ تم إضافة المصروف' : '💾 تم حفظ التعديلات');
        renderExpenses();
        _expRefreshOrdersNetIfActive();
    } catch (e) {
        errEl.textContent = '⚠️ خطأ: ' + e.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = isNew ? '💾 حفظ' : '💾 حفظ التغييرات';
    }
});

async function expDeleteExpense(key) {
    const exp = allExpenses[key];
    const confirmed = await showConfirm({
        title: 'حذف المصروف',
        msg: `هل تريد حذف مصروف «${exp?.desc || ''}» نهائياً؟`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف', cancelLabel: 'إلغاء',
    });
    if (!confirmed) return;
    try {
        await fbSet(`expenses/${key}`, null);
        delete allExpenses[key];
        toast('✅ تم حذف المصروف');
        renderExpenses();
        _expRefreshOrdersNetIfActive();
    } catch (e) {
        toast('⚠️ فشل الحذف: ' + e.message, true);
    }
}