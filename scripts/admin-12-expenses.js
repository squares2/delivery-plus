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

// "Today" for every date-scoped feature in the admin panel (expenses'
// default date, حركة الصندوق's default day, etc.) — resolves through
// the shared 4 AM business-day cutover in admin-04 (bizDateKey), so a
// 2 AM shift still counts as "yesterday" everywhere consistently.
function _todayStr() {
    return bizDateKey();
}

// The orders panel's own net-profit figure depends on allExpenses — refresh
// it immediately if that panel happens to already be open, rather than
// waiting for its next periodic auto-refresh.
function _expRefreshOrdersNetIfActive() {
    const p = document.getElementById('panel-orders');
    if (p && p.classList.contains('active') && typeof renderOrders === 'function') renderOrders();
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
        .filter(([, e]) => e && _dateFilterMatches({ date: e.date }, expDateFilter, expDateFrom, expDateTo))
        .filter(([, e]) => !expSearch || (e.desc || '').toLowerCase().includes(expSearch.toLowerCase()))
        .sort(([, a], [, b]) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    countEl.textContent = `${entries.length} مصروف`;

    let totalUSD = 0;
    entries.forEach(([, e]) => { totalUSD += _toUSD(e.amount); });
    totalEl.textContent = '$' + totalUSD.toFixed(2);

    if (!entries.length) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        tbody.innerHTML = '';
        return;
    }
    table.style.display = '';
    empty.style.display = 'none';

    tbody.innerHTML = entries.map(([key, e]) => `
        <tr data-key="${key}">
            <td style="white-space:nowrap;">${e.date || '—'}</td>
            <td>${_expEscHtml(e.desc || '—')}</td>
            <td style="color:var(--gray-light);">${_expEscHtml(e.category || 'عام')}</td>
            <td style="font-family:var(--mono);color:var(--red);white-space:nowrap;">$${_toUSD(e.amount).toFixed(2)}</td>
            <td style="color:var(--gray-light);font-size:var(--fs-xs);">${_expEscHtml(e.addedByName || e.addedBy || '—')}</td>
            <td style="white-space:nowrap;">
                <button class="or-remove-btn" data-exp-edit="${key}" style="border-color:rgba(255,92,0,0.35);color:var(--orange);margin-left:4px;">✏️</button>
                <button class="or-remove-btn" data-exp-del="${key}">🗑</button>
            </td>
        </tr>
    `).join('');

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

    document.getElementById('exp-date').value = exp?.date || _todayStr();
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
    const date      = document.getElementById('exp-date').value;
    const desc      = document.getElementById('exp-desc').value.trim();
    const category  = document.getElementById('exp-category').value;
    const amountRaw = document.getElementById('exp-amount').value.trim();
    const errEl     = document.getElementById('exp-modal-error');
    const btn       = document.getElementById('exp-save-btn');

    errEl.style.display = 'none';
    if (!date) { errEl.textContent = '⚠️ التاريخ مطلوب'; errEl.style.display = 'block'; return; }
    if (!desc) { errEl.textContent = '⚠️ البيان مطلوب';  errEl.style.display = 'block'; return; }
    const amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount) || amount <= 0) {
        errEl.textContent = '⚠️ أدخل مبلغاً صحيحاً'; errEl.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';
    try {
        const payload = {
            date, desc, category, amount,
            addedBy:     currentAdmin?.username || '',
            addedByName: currentAdmin?.fullname || currentAdmin?.username || '',
        };
        if (isNew) {
            payload.createdAt = Date.now();
            const res = await fbPush('expenses', payload);
            if (res && res.name) allExpenses[res.name] = payload;
        } else {
            payload.createdAt = allExpenses[key]?.createdAt || Date.now();
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