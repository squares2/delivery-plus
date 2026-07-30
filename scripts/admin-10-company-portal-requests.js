document.getElementById('map-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderMap();
    document.getElementById('map-last-update').textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar');
    toast('✅ تم تحديث الخريطة');
});

// Orders refresh
document.getElementById('orders-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderOrders(); toast('✅ تم تحديث الطلبات');
});

// Order filter pills
document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        orderFilter = btn.dataset.filter;
        renderOrders();
    });
});

// Order sort toggle (by number / by date) — see renderOrders()
// Reflect the current (default or previously-saved) mode on load, since
// the HTML no longer hardcodes which pill starts active.
document.querySelectorAll('.sort-pill').forEach(btn => {
    if (btn.dataset.sort === orderSort) btn.classList.add('active');
});
document.querySelectorAll('.sort-pill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        orderSort = btn.dataset.sort;
        localStorage.setItem('delivo_admin_order_sort', orderSort);
        renderOrders();
    });
});

// Order search
document.getElementById('orders-search').addEventListener('input', e => {
    orderSearch = e.target.value.trim();
    renderOrders();
});

// Daily delivered-orders chart — range pills (7 / 14 / 30 days)
document.querySelectorAll('#orders-chart-card .chart-range-pill').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.chartRange) === orderChartRange);
    btn.addEventListener('click', e => {
        e.stopPropagation(); // don't let this bubble up to the header's collapse toggle
        orderChartRange = parseInt(btn.dataset.chartRange);
        localStorage.setItem('delivo_admin_order_chart_range', orderChartRange);
        document.querySelectorAll('#orders-chart-card .chart-range-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderOrdersDailyChart();
    });
});

// Daily delivered-orders chart — collapse/expand (shrunk by default).
// Clicking anywhere on the header toggles it; the chevron button is just
// a visual affordance sitting inside that same header.
document.getElementById('orders-chart-card').classList.toggle('collapsed', orderChartCollapsed);
document.getElementById('orders-chart-header').addEventListener('click', () => {
    orderChartCollapsed = !orderChartCollapsed;
    localStorage.setItem('delivo_admin_order_chart_collapsed', orderChartCollapsed ? '1' : '0');
    document.getElementById('orders-chart-card').classList.toggle('collapsed', orderChartCollapsed);
    if (!orderChartCollapsed) renderOrdersDailyChart(); // draw lazily on first expand
});

// Order date filter
// Reflect the current (default or previously-saved) state on load, since
// the <select>/inputs don't know about localStorage on their own.
document.getElementById('orders-date-select').value = orderDateFilter;
document.getElementById('orders-date-from').value = orderDateFrom;
document.getElementById('orders-date-to').value = orderDateTo;
document.getElementById('orders-date-custom').classList.toggle('active', orderDateFilter === 'custom');

document.getElementById('orders-date-select').addEventListener('change', e => {
    orderDateFilter = e.target.value;
    localStorage.setItem('delivo_admin_order_date_filter', orderDateFilter);
    document.getElementById('orders-date-custom').classList.toggle('active', orderDateFilter === 'custom');
    if (orderDateFilter !== 'custom') renderOrders();
});
document.getElementById('orders-date-from').addEventListener('change', e => {
    orderDateFrom = e.target.value;
    localStorage.setItem('delivo_admin_order_date_from', orderDateFrom);
    if (orderDateFilter === 'custom') renderOrders();
});
document.getElementById('orders-date-to').addEventListener('change', e => {
    orderDateTo = e.target.value;
    localStorage.setItem('delivo_admin_order_date_to', orderDateTo);
    if (orderDateFilter === 'custom') renderOrders();
});

// Online-orders date filter — same pattern, own state, defaults to "اليوم"
document.getElementById('or-date-select').value = onlineOrderDateFilter;
document.getElementById('or-date-from').value = onlineOrderDateFrom;
document.getElementById('or-date-to').value = onlineOrderDateTo;
document.getElementById('or-date-custom').classList.toggle('active', onlineOrderDateFilter === 'custom');

document.getElementById('or-date-select').addEventListener('change', e => {
    onlineOrderDateFilter = e.target.value;
    localStorage.setItem('delivo_admin_online_date_filter', onlineOrderDateFilter);
    document.getElementById('or-date-custom').classList.toggle('active', onlineOrderDateFilter === 'custom');
    if (onlineOrderDateFilter !== 'custom') renderOnlineRequests();
});
document.getElementById('or-date-from').addEventListener('change', e => {
    onlineOrderDateFrom = e.target.value;
    localStorage.setItem('delivo_admin_online_date_from', onlineOrderDateFrom);
    if (onlineOrderDateFilter === 'custom') renderOnlineRequests();
});
document.getElementById('or-date-to').addEventListener('change', e => {
    onlineOrderDateTo = e.target.value;
    localStorage.setItem('delivo_admin_online_date_to', onlineOrderDateTo);
    if (onlineOrderDateFilter === 'custom') renderOnlineRequests();
});

// Map layer toggles
document.querySelectorAll('.map-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        mapLayers[btn.dataset.layer] = btn.classList.contains('active');
        renderMap();
    });
});

// Distance-measurement "clear" button
document.getElementById('map-measure-clear')?.addEventListener('click', () => {
    _clearMeasure();
    _setMeasureHint('📍 اضغط على الخريطة لتحديد نقطة الانطلاق');
});

// Sidebar collapse
document.getElementById('collapse-btn').addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
});




// ═══════════════════════════════════════════════════════════════
// COMPANY PORTAL
// ═══════════════════════════════════════════════════════════════
let cpFilter    = 'active';
let cpSearch    = '';
let cpOrdersCache = {};
let cpRefreshTimer = null;
let standbyPending = null; // { orderId, driverName }

const CP_STATES = {
    '0': { label:'جديد',           cls:'cs-0' },
    '6': { label:'استُلم',         cls:'cs-6' },
    '7': { label:'قيد التحضير',    cls:'cs-7' },
    '8': { label:'جاهز للتسليم',   cls:'cs-8' },
    '1': { label:'وُصِّل',          cls:'cs-1' },
    '2': { label:'ملغى',           cls:'cs-2' },
};

async function startCompanyPortal() {
    window.currentAdmin = currentAdmin; // exposed for admin-presence.js (role gating)
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('company-portal').classList.add('visible');
    // localStorage (not sessionStorage) so this survives across tabs too —
    // e.g. an employee opening the admin link from a WhatsApp notification.
    localStorage.setItem('delivoAdmin', JSON.stringify(currentAdmin));

    // Reset items state for fresh session
    _cpiAllItems  = {};
    _cpiFilter    = null;
    _cpiSearchQ   = '';
    _cpiStoreType = '';
    cpSwitchTab('orders'); // always start on orders tab

    const store    = currentAdmin.linkedStore || '';
    const uname    = currentAdmin.fullname || currentAdmin.username || '';
    const initial  = uname[0]?.toUpperCase() || '?';

    // FIX 5 — page title
    document.title = store ? store + ' — Delivo' : 'Delivo';

    // FIX 4 — username in topbar
    document.getElementById('cp-store-name').textContent = store;
    document.getElementById('cp-username').textContent   = uname;
    document.getElementById('cp-avatar').textContent     = initial;
    _updateNotifBellUI();

    // Wire search (FIX 3)
    document.getElementById('cp-search')?.addEventListener('input', e => {
        cpSearch = e.target.value.trim();
        cpRender();
    });

    await cpLoadOrders();
    cpRefreshTimer = setInterval(cpLoadOrders, 20000);

    // ── Store open/close button ──────────────────────────────
    await cpUpdateStoreToggleBtn();
    document.getElementById('cp-store-toggle-btn')?.addEventListener('click', async () => {
        const storeName = currentAdmin.linkedStore || '';
        if (!storeName) return;
        const st = await fbGet(`storeStatus/${storeName}`).catch(() => null);
        const isClosed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
        openCloseStoreModal(storeName, isClosed, st?.reason || '', st?.opensAt || '');
        // After modal closes, update button state
        const observer = new MutationObserver(() => {
            if (!document.getElementById('cs-modal-overlay')) {
                observer.disconnect();
                cpUpdateStoreToggleBtn();
            }
        });
        observer.observe(document.body, { childList: true });
    });
}

async function cpUpdateStoreToggleBtn() {
    const btn   = document.getElementById('cp-store-toggle-btn');
    const label = document.getElementById('cp-store-toggle-label');
    if (!btn || !label) return;
    const storeName = currentAdmin?.linkedStore || '';
    if (!storeName) { btn.style.display = 'none'; return; }
    const st       = await fbGet(`storeStatus/${storeName}`).catch(() => null);
    const isClosed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
    btn.classList.toggle('is-closed', isClosed);
    btn.querySelector('svg path')?.setAttribute('d',
        isClosed ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4'
    );
    label.textContent = isClosed ? 'فتح المتجر' : 'إغلاق المتجر';
}

async function cpLoadOrders() {
    try {
        const raw = await fbGet('requests');
        cpOrdersCache = raw || {};
        const store = currentAdmin?.linkedStore || '';
        if (store) _detectAndAlertNewOrders(cpOrdersCache, store);
    } catch(e) {}
    cpRender();
}

// Parse cart string into segments
function cpParseCart(cartStr) {
    return (cartStr || '').split(',').filter(Boolean).map(seg => {
        const p = seg.trim().split(':');
        return { qty: p[0] || '1', name: p[1] || '', rawPrice: p[2] || '', storePart: p[3] || '', notes: p[4] || '' };
    });
}

// Render item cards into a container div (async, fills in after products load)
async function cpLoadItemsIntoEl(el, o) {
    const segments = cpParseCart(o.cart);
    if (!segments.length) {
        el.innerHTML = '<div style="color:var(--gray);font-size:0.78rem;padding:8px 0;">لا توجد عناصر في السلة</div>';
        return;
    }

    const storeName     = o.store || currentAdmin.linkedStore || '';
    const storeTypeMap  = { Restaurants:'🍔', BakeryShops:'🥖', ButcherShops:'🥩', Markets:'🛒', Groceries:'🏪', SweetsShops:'🍰', FishShops:'🐟', CoffeeShops:'☕' };
    const fallbackEmoji = storeTypeMap[(allStores[storeName]?.type)] || '📦';

    el.innerHTML = '';
    segments.forEach(({ qty, name, rawPrice, notes }) => {
        const priceNum = parseFloat(rawPrice) || 0;
        const priceStr = priceNum > 0
            ? (priceNum < 1000 ? '$' + priceNum : (priceNum / 1000).toFixed(0) + 'k ل.ل')
            : '';

        const itemEl = document.createElement('div');
        itemEl.className = 'coc-item-card';
        itemEl.innerHTML = `
            <div class="coc-item-img-placeholder">${fallbackEmoji}</div>
            <div class="coc-item-info">
                <div class="coc-item-name-big">${name || '—'}</div>
                ${priceStr ? `<div class="coc-item-sub">${priceStr} / قطعة</div>` : ''}
                ${notes ? `<div class="coc-item-notes">📝 ${notes}</div>` : ''}
            </div>
            <div class="coc-item-qty-badge">${qty}×</div>
        `;
        el.appendChild(itemEl);
    });
}

function cpRender() {
    const grid   = document.getElementById('cp-grid');
    const countEl= document.getElementById('cp-count-label');
    const badge  = document.getElementById('cp-new-badge');
    if (!grid) return;

    const store = currentAdmin.linkedStore || '';
    let entries = Object.entries(cpOrdersCache)
        .filter(([,o]) => (o.store||'') === store && o.vault != 1)
        .sort(([a],[b]) => (parseInt(b.replace('id_',''))||0)-(parseInt(a.replace('id_',''))||0));

    // Filter
    const filtered = entries.filter(([key,o]) => {
        const s = o.state||'0';
        let tabOk = true;
        if (cpFilter === 'active') tabOk = ['0','6','7'].includes(s);
        else if (cpFilter === 'ready')  tabOk = s === '8';
        else if (cpFilter === 'done')   tabOk = ['1','2','8'].includes(s);
        if (!tabOk) return false;
        if (cpSearch) {
            const q = cpSearch.toLowerCase();
            const num = (o.shipnumber || key.replace('id_','')).toLowerCase();
            if (!num.includes(q)) return false;
        }
        return true;
    });

    const newCount = entries.filter(([,o]) => (o.state||'0') === '0').length;
    badge.textContent = newCount + ' جديد';
    badge.style.display = newCount > 0 ? '' : 'none';
    countEl.textContent = filtered.length + ' طلب';
    // Sync tab badge
    const tabBadge = document.getElementById('cp-tab-orders-badge');
    if (tabBadge) {
        tabBadge.textContent     = newCount;
        tabBadge.style.display   = newCount > 0 ? 'inline-block' : 'none';
    }

    // ── Snapshot expanded keys BEFORE any DOM changes ──────────
    const expandedKeys = new Set(
        [...grid.querySelectorAll('.coc.expanded')].map(el => el.dataset.key)
    );

    // ── Determine which keys are currently rendered ────────────
    const renderedKeys = new Set(
        [...grid.querySelectorAll('.coc[data-key]')].map(el => el.dataset.key)
    );
    const filteredKeys = new Set(filtered.map(([k]) => k));

    // Remove cards that are no longer in the filtered list
    grid.querySelectorAll('.coc[data-key]').forEach(el => {
        if (!filteredKeys.has(el.dataset.key)) el.remove();
    });

    if (!filtered.length) {
        if (!grid.querySelector('.cp-empty-msg')) {
            grid.innerHTML = '<div class="cp-empty-msg" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--gray);padding:60px;"><svg width=40 height=40 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.5 stroke-linecap=round><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span>لا توجد طلبات</span></div>';
        }
        return;
    }
    // Remove empty msg if orders exist
    grid.querySelector('.cp-empty-msg')?.remove();

    // ── Build / patch each card in sorted order ────────────────
    filtered.forEach(([key, o], sortIdx) => {
        const s         = o.state || '0';
        const si        = CP_STATES[s] || CP_STATES['0'];
        const isNew     = s === '0';
        const shipNum   = o.shipnumber || key.replace('id_','');
        const price     = parseFloat(o.orderprice || o.total || 0);
        const hasDriver = o.driver && o.driver !== '0';
        const etaMs     = o.standbyUntil ? (o.standbyUntil - Date.now()) : null;
        const etaMins   = etaMs ? Math.ceil(etaMs / 60000) : null;
        const itemCount = cpParseCart(o.cart).length;

        let card = grid.querySelector(`.coc[data-key="${key}"]`);

        if (card) {
            // ── Card exists — patch only what changed, preserve expand state ──
            // Update state badge
            const badge = card.querySelector('.coc-state-badge');
            if (badge) { badge.className = `coc-state-badge ${si.cls}`; badge.textContent = si.label; }
            // Update new-dot
            const headEl = card.querySelector('.coc-head');
            const dotEl  = card.querySelector('.coc-new-dot');
            if (isNew && !dotEl && headEl) {
                const dot = document.createElement('div');
                dot.className = 'coc-new-dot';
                headEl.insertBefore(dot, headEl.firstChild);
            } else if (!isNew && dotEl) {
                dotEl.remove();
            }
            // Update driver cell
            const driverCell = card.querySelector('.coc-meta-val.green, .coc-meta-val.gray');
            if (driverCell) {
                driverCell.className = `coc-meta-val ${hasDriver?'green':'gray'}`;
                driverCell.textContent = hasDriver ? '🛵 '+o.driver : 'غير معيَّن';
            }
            // Update ETA banner
            const etaBanner = card.querySelector('.coc-eta');
            if (etaMins && etaMins > 0) {
                if (etaBanner) {
                    // Element already exists — just keep its data-until in sync;
                    // the live ticker (startCocEtaTicker below) handles the mm:ss text.
                    etaBanner.dataset.until = o.standbyUntil;
                } else {
                    // BUG FIX: previously this branch did nothing when the banner
                    // was missing, which is exactly the common case — a fresh
                    // order card is built with no standbyUntil yet (state 0), so
                    // .coc-eta never gets created. When the store later clicks
                    // "⏳ قيد التحضير" and sets a prep time, this patch path ran
                    // but could only update an existing element, never create
                    // one — so the countdown never appeared at all. Now we
                    // create it here too, same markup as a fresh card.
                    const newEtaBanner = document.createElement('div');
                    newEtaBanner.className = 'coc-eta';
                    newEtaBanner.style.margin = '12px 16px 0';
                    newEtaBanner.dataset.until = o.standbyUntil;
                    newEtaBanner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> <span class="coc-eta-text">متبقي للتجهيز: …</span>`;
                    const metaStrip = card.querySelector('.coc-meta-strip');
                    if (metaStrip) metaStrip.insertAdjacentElement('afterend', newEtaBanner);
                    else card.querySelector('.coc-collapsible')?.appendChild(newEtaBanner);
                }
            } else if (etaBanner) {
                etaBanner.remove();
            }
            // Update action buttons
            const actionsEl = card.querySelector(`#coc-actions-${key}`);
            if (actionsEl) actionsEl.innerHTML = cpActionsHTML(key, s);
            // Re-wire action buttons
            card.querySelectorAll('[data-cp-action]').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); cpHandleAction(key, btn.dataset.cpAction, o); });
            });

        } else {
            // ── New card — build from scratch ──────────────────────────
            card = document.createElement('div');
            card.className = 'coc';
            card.dataset.key = key;

            // Expand only if it was already open before this refresh
            if (expandedKeys.has(key)) {
                card.classList.add('expanded');
            }

            card.innerHTML = `
                <div class="coc-head">
                    ${isNew ? '<div class="coc-new-dot"></div>' : ''}
                    <span class="coc-num">#${shipNum}</span>
                    <span class="coc-state-badge ${si.cls}">${si.label}</span>
                    <span class="coc-date">${o.date||'—'}</span>
                    <span class="coc-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></span>
                </div>
                <div class="coc-collapsible">
                <div class="coc-meta-strip">
                    <div class="coc-meta-cell">
                        <span class="coc-meta-label">عدد العناصر</span>
                        <span class="coc-meta-val orange">${itemCount} صنف</span>
                    </div>
                    <div class="coc-meta-cell">
                        <span class="coc-meta-label">المتجر</span>
                        <span class="coc-meta-val">${o.store||'—'}</span>
                    </div>
                    <div class="coc-meta-cell">
                        <span class="coc-meta-label">السائق</span>
                        <span class="coc-meta-val ${hasDriver?'green':'gray'}">${hasDriver ? '🛵 '+o.driver : 'غير معيَّن'}</span>
                    </div>
                </div>
                ${etaMins && etaMins > 0 ? `
                <div class="coc-eta" style="margin:12px 16px 0;" data-until="${o.standbyUntil}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span class="coc-eta-text">متبقي للتجهيز: …</span>
                </div>` : ''}
                <div class="coc-items-section">
                    <div class="coc-items-header">تفاصيل الطلب</div>
                    <div class="coc-items-body" id="coc-items-${key}">
                        <div class="coc-item-shimmer"></div>
                        <div class="coc-item-shimmer" style="opacity:.6;"></div>
                    </div>
                </div>
                ${o.xnote || o.note ? `
                <div class="coc-xnote">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    ${o.xnote||o.note}
                </div>` : ''}
                <div class="coc-actions" id="coc-actions-${key}">
                    ${cpActionsHTML(key, s)}
                </div>
                </div><!-- /coc-collapsible -->
            `;

            card.querySelector('.coc-head').addEventListener('click', () => {
                card.classList.toggle('expanded');
            });
            card.querySelectorAll('[data-cp-action]').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); cpHandleAction(key, btn.dataset.cpAction, o); });
            });

            // Insert at correct sort position
            const allCards = [...grid.querySelectorAll('.coc[data-key]')];
            const nextCard = allCards[sortIdx];
            if (nextCard && nextCard !== card) {
                grid.insertBefore(card, nextCard);
            } else {
                grid.appendChild(card);
            }

            // Load product images
            const itemsBody = card.querySelector(`#coc-items-${key}`);
            if (itemsBody) cpLoadItemsIntoEl(itemsBody, o);
        }
    });
}

function cpActionsHTML(key, s) {
    if (['1','2'].includes(s)) return '<span style="font-size:0.72rem;color:var(--gray);padding:4px 0;">✔ الطلب مكتمل</span>';
    if (s === '8') return '<span style="font-size:0.72rem;color:var(--green);padding:4px 0;font-weight:800;">🛵 سُلِّم للسائق — بانتظار التوصيل</span>';
    return `
        <button class="coc-btn pick ${s==='6'||s==='7'||s==='8'?'active-s':''}"  data-cp-action="pick"    title="تم استلام الطلب">📋 استلام</button>
        <button class="coc-btn standby ${s==='7'?'active-s':''}" data-cp-action="standby" title="قيد التحضير — حدد وقت التجهيز">⏳ قيد التحضير</button>
        <button class="coc-btn ready ${['0','6'].includes(s)?'active-s':''}"  data-cp-action="ready"  title="جاهز للتسليم للسائق">✅ جاهز</button>
    `;
}

async function cpHandleAction(orderId, action, o) {
    if (action === 'pick') {
        await cpSetState(orderId, '6');
    } else if (action === 'standby') {
        // Open standby time modal
        standbyPending = { orderId, driverName: o.driver };
        const dNote = document.getElementById('standby-driver-note');
        if (o.driver && o.driver !== '0') {
            dNote.textContent = '🛵 سيتم إبلاغ السائق ' + o.driver + ' بوقت التجهيز فوراً.';
            dNote.style.display = '';
        } else {
            dNote.style.display = 'none';
        }
        document.getElementById('standby-minutes').value = 20;
        document.getElementById('modal-standby').classList.add('open');
    } else if (action === 'ready') {
        await cpSetState(orderId, '8');
        // Notify driver that order is ready for pickup
        if (o.driver && o.driver !== '0') {
            await cpNotifyDriver(orderId, o.driver, 'ready', 0);
        }
        toast('✅ الطلب جاهز — تم إبلاغ السائق');
    }
}

async function cpSetState(orderId, newState) {
    try {
        await fbSet('requests/' + orderId + '/state', newState);
        if (cpOrdersCache[orderId]) cpOrdersCache[orderId].state = newState;
        cpRender();
    } catch(e) { toast('خطأ في تحديث الحالة', true); }
}

// Write a driver notification into Firebase under /driverNotifications/{driver}/{orderId}
async function cpNotifyDriver(orderId, driverName, type, prepMins) {
    try {
        const payload = {
            orderId,
            store: currentAdmin.linkedStore || '',
            type,          // 'standby' | 'ready'
            prepMins,
            readyAt: type === 'standby' ? Date.now() + prepMins * 60000 : Date.now(),
            sentAt: Date.now(),
            read: '0',
        };
        await fbSet('driverNotifications/' + driverName + '/' + orderId, payload);
    } catch(e) {}
}

// Notify a driver that a new order was assigned to them (admin order list / map assignment).
// Respects settings/driverAssignNotifyMethod: 'app' (in-app notification, default) or 'whatsapp' (GREEN-API).
// Fire-and-forget — never blocks the assignment flow.
// Manual test push — lets you confirm end-to-end delivery (including with
// the recipient's app fully closed) without waiting for a real order to
// come in. Used by the 🔔 test buttons on driver cards and employee cards.
async function sendTestPush(identityKey, name) {
    if (!identityKey) { toast('لا يوجد معرف صالح لهذا المستخدم', true); return; }
    try {
        const tokenSnap = await fetch(`${RTDB}/fcmTokens/${identityKey}.json`).then(r => r.json());
        if (!tokenSnap || !tokenSnap.token) {
            toast('⚠️ لم يسجّل هذا المستخدم بعد لاستقبال الإشعارات (لم يفتح التطبيق منذ إعداد الميزة)', true);
            return;
        }
        await fetch(`${RTDB}/pushQueue.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to:    identityKey,
                title: '🔔 إشعار تجريبي',
                body:  `مرحباً ${name || ''} — هذا إشعار تجريبي من Delivo`,
                data:  { url: './', type: 'test' },
                createdAt: Date.now(),
            }),
        });
        toast('✅ تم إرسال الإشعار التجريبي');
    } catch(e) {
        toast('فشل الإرسال: ' + e.message, true);
    }
}

async function notifyDriverAssigned(orderId, driverName, driverObj, order) {
    try {
        const method = window._driverAssignNotifyMethod
            || await fbGet('settings/driverAssignNotifyMethod').catch(() => null)
            || 'app';
        const idNum = orderId.replace('id_', '');

        if (method === 'whatsapp') {
            const phone = driverObj?.phone;
            if (!phone) { console.warn('[Delivo] notifyDriverAssigned: no phone on record for', driverName); return; }
            const msg = `🛵 طلب جديد مُعيَّن لك — #${idNum}\n🏪 ${order?.store || '—'}\n💰 $${order?.total || '0'}\n\nافتح تطبيق السائق للتفاصيل الكاملة.`;
            await _sendWhatsappMessage(phone, msg);
        } else {
            const payload = {
                orderId,
                store:  order?.store || '',
                type:   'assigned',
                sentAt: Date.now(),
                read:   '0',
            };
            await fbSet('driverNotifications/' + driverName + '/' + orderId, payload);
        }

        // Real push notification (OS-level, works even with driver.html fully
        // closed) — fires regardless of the method above, since that setting
        // only controls the in-app/WhatsApp channel, not push delivery.
        try {
            const driverKey = driverObj?._key || driverObj?.id;
            if (driverKey) {
                await fetch(`${RTDB}/pushQueue.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to:    driverKey,
                        title: '🛵 طلب جديد',
                        body:  `طلب #${idNum} من ${order?.store || '—'} — بانتظارك`,
                        data:  { url: './driver.html', type: 'order_assigned', orderId },
                        createdAt: Date.now(),
                    }),
                });
            }
        } catch (_) { /* push is best-effort — never blocks assignment */ }
    } catch(e) {
        console.warn('[Delivo] notifyDriverAssigned failed:', e.message);
        toast('⚠️ تم تعيين السائق لكن فشل إرسال التنبيه: ' + e.message, true);
    }
}

// Standby modal confirm
document.getElementById('standby-confirm-btn')?.addEventListener('click', async () => {
    if (!standbyPending) return;
    const mins = parseInt(document.getElementById('standby-minutes').value) || 20;
    const { orderId, driverName } = standbyPending;
    document.getElementById('modal-standby').classList.remove('open');
    try {
        const readyAt = Date.now() + mins * 60000;
        await fbSet('requests/' + orderId + '/state', '7');
        await fbSet('requests/' + orderId + '/standbyMinutes', mins);
        await fbSet('requests/' + orderId + '/standbyUntil', readyAt);
        if (cpOrdersCache[orderId]) {
            cpOrdersCache[orderId].state = '7';
            cpOrdersCache[orderId].standbyMinutes = mins;
            cpOrdersCache[orderId].standbyUntil = readyAt;
        }
        if (driverName && driverName !== '0') {
            await cpNotifyDriver(orderId, driverName, 'standby', mins);
            toast('⏳ وقت التحضير: ' + mins + ' د — تم إبلاغ السائق ' + driverName);
        } else {
            toast('⏳ وقت التحضير: ' + mins + ' دقيقة');
        }
        cpRender();
    } catch(e) { toast('خطأ في الحفظ', true); }
    standbyPending = null;
});
document.getElementById('standby-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('modal-standby').classList.remove('open');
    standbyPending = null;
});

// ═══════════════════════════════════════════════════════════════
// COMPANY PORTAL — ITEMS MANAGEMENT (منتجاتي)
// ═══════════════════════════════════════════════════════════════

let _cpiAllItems    = {};   // itemId → item object
let _cpiFilter      = null; // active catmain filter
let _cpiSearchQ     = '';
let _cpiStoreType   = '';

/* ── Tab switching ─────────────────────────────────────────── */
function cpSwitchTab(tab) {
    ['orders','items','sales'].forEach(t => {
        const view = document.getElementById(`cp-view-${t}`);
        if (view) view.style.display = t === tab ? 'flex' : 'none';
        document.getElementById(`cp-tab-${t}`)?.classList.toggle('active', t === tab);
    });
    if (tab === 'items'  && !Object.keys(_cpiAllItems).length) cpLoadItems();
    if (tab === 'sales') cpLoadSales();
}

/* ── Load items for this company's store ───────────────────── */
async function cpLoadItems() {
    const storeName = currentAdmin?.linkedStore || '';
    if (!storeName) return;
    _cpiFilter = null;
    _cpiSearchQ = '';
    document.getElementById('cpi-search').value = '';
    document.getElementById('cpi-grid').innerHTML = _cpiSkeleton(8);

    try {
        // Get store type from pattern
        const patternAll = await fbGet('pattern').catch(() => null);
        if (patternAll) {
            outer: for (const [type, list] of Object.entries(patternAll)) {
                const arr = typeof list === 'object' ? Object.values(list) : [];
                for (const s of arr) {
                    if (s && s.companyname === storeName) { _cpiStoreType = type; break outer; }
                }
            }
        }
        const raw = await fbGet(`items/${storeName}`);
        _cpiAllItems = raw || {};
    } catch(e) {
        document.getElementById('cpi-grid').innerHTML =
            `<div class="cpi-empty"><div class="cpi-empty__icon">⚠️</div><div class="cpi-empty__title">خطأ في التحميل</div><div class="cpi-empty__sub">${e.message}</div></div>`;
        return;
    }
    cpiRender();
}

/* ── Render ────────────────────────────────────────────────── */
function cpiRender() {
    const grid = document.getElementById('cpi-grid');
    const bar  = document.getElementById('cpi-cats-bar');
    const items = Object.values(_cpiAllItems).filter(Boolean);

    // Category filter bar
    const mains = [...new Set(items.map(i => i.catmain || 'عام'))].sort();
    bar.innerHTML = [null, ...mains].map(m => {
        const isActive = _cpiFilter === m;
        const label    = m === null ? `الكل (${items.length})` : m;
        return `<button onclick="cpiSetFilter(${m===null?'null':`'${m.replace(/'/g,"\\'")}' `})"
            style="flex-shrink:0;padding:5px 13px;border-radius:20px;border:none;cursor:pointer;
                   font-size:0.72rem;font-weight:700;font-family:var(--font);
                   background:${isActive?'var(--orange)':'var(--surface3)'};
                   color:${isActive?'#fff':'var(--gray-light)'};">${label}</button>`;
    }).join('');

    // Filter + search
    let filtered = _cpiFilter ? items.filter(i => (i.catmain||'عام') === _cpiFilter) : items;
    if (_cpiSearchQ) {
        const q = _cpiSearchQ.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name||'').toLowerCase().includes(q) ||
            (i.ID||i.id||'').toLowerCase().includes(q) ||
            (i.catmain||'').toLowerCase().includes(q)
        );
    }

    document.getElementById('cpi-count-label').textContent =
        `${filtered.length} منتج${filtered.length !== items.length ? ` من ${items.length}` : ''}`;

    if (!filtered.length) {
        grid.innerHTML = `<div class="cpi-empty">
            <div class="cpi-empty__icon">${items.length ? '🔍' : '🛍️'}</div>
            <div class="cpi-empty__title">${items.length ? 'لا توجد نتائج' : 'لا توجد منتجات بعد'}</div>
            <div class="cpi-empty__sub">${items.length ? 'جرب كلمة بحث مختلفة' : 'اضغط «إضافة منتج» لإضافة أول منتج'}</div>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const id      = item.ID || item.id || '';
        const price   = parseFloat(item.price) || 0;
        const sale    = parseFloat(item.sale)  || 0;
        const hasSale = sale > 0 && sale < price;
        const hasPng  = item.pngExist === '1' || item.pngExist === 1;
        const imgSrc  = _cpiLocalImagePreview[id]
            || `items2/${String(id).toLowerCase()}.webp${item.imgUpdatedAt ? '?v=' + item.imgUpdatedAt : ''}`;
        const emoji   = _catTypeEmoji(_cpiStoreType);
        const safeItem = JSON.stringify(item).replace(/"/g,'&quot;');
        return `
        <div class="cpi-card">
            <div class="cpi-card__thumb">
                ${hasPng
                    ? `<img src="${imgSrc}" alt="${item.name||''}"
                           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                       <div class="cpi-card__no-img" style="display:none;">${emoji}</div>`
                    : `<div class="cpi-card__no-img">${emoji}</div>
                       <div class="cpi-card__badge-noimg">بدون صورة</div>`
                }
                ${hasSale ? `<div class="cpi-card__badge-sale">خصم</div>` : ''}
            </div>
            <div class="cpi-card__body">
                <div class="cpi-card__name">${item.name||'—'}</div>
                <div class="cpi-card__cat">${item.catmain||''}${item.cat&&item.cat!==item.catmain?' › '+item.cat:''}</div>
                <div class="cpi-card__price-row">
                    <span class="cpi-card__price">${_catFmtPrice(hasSale?sale:price)}</span>
                    ${hasSale?`<span class="cpi-card__price-orig">${_catFmtPrice(price)}</span>`:''}
                </div>
                <div class="cpi-card__id">ID: ${id}</div>
            </div>
            <div class="cpi-card__actions">
                <button class="cpi-card__btn cpi-card__btn--edit" onclick="cpOpenItemModal(${safeItem})">✏️ تعديل</button>
                <button class="cpi-card__btn cpi-card__btn--del"  onclick="cpiDeleteItem('${String(id)}')">🗑️ حذف</button>
            </div>
        </div>`;
    }).join('');
}

function cpiSetFilter(main) { _cpiFilter = main; cpiRender(); }
function cpiSearch(q)       { _cpiSearchQ = q.trim(); cpiRender(); }

/* ── Auto-generate a globally-unique numeric item ID ─────────────
   Scans /items across ALL stores in Firebase, collects every purely-
   numeric ID found, and returns (max + 1) as a string. This guarantees
   the new ID never collides with any existing item, in this store or
   any other. ── */
async function cpiGenerateNextId() {
    try {
        const allItems = await fbGet('items').catch(() => null);
        let maxNum = 0;
        if (allItems && typeof allItems === 'object') {
            for (const storeItems of Object.values(allItems)) {
                if (!storeItems || typeof storeItems !== 'object') continue;
                for (const item of Object.values(storeItems)) {
                    if (!item || typeof item !== 'object') continue;
                    const id = String(item.ID ?? item.id ?? '').trim();
                    if (/^\d+$/.test(id)) {
                        const n = parseInt(id, 10);
                        if (n > maxNum) maxNum = n;
                    }
                }
            }
        }
        return String(maxNum + 1);
    } catch (e) {
        // Fallback: timestamp-based ID (still extremely unlikely to collide)
        return String(Date.now()).slice(-6);
    }
}

/* Regenerate a fresh auto-ID into the open modal's ID field */
async function cpiRegenerateId(btn) {
    btn.disabled = true;
    const newId = await cpiGenerateNextId();
    const input = document.getElementById('cim-id');
    if (input) {
        input.value = newId;
        document.getElementById('cat-modal-img-name').textContent = newId.toLowerCase() + '.webp';
    }
    btn.disabled = false;
}

/* ── Add / Edit modal ──────────────────────────────────────── */
async function cpOpenItemModal(item) {
    // Reuse the same logic as admin catalog but bound to company store
    // Temporarily set _catCurrentStore and _catAllItems so saveCatalogItem works
    const storeName = currentAdmin?.linkedStore || '';
    _catCurrentStore = { name: storeName, type: _cpiStoreType };
    _catAllItems     = _cpiAllItems;
    _cpiPendingImageFile = null; // clear any stale staged image from a previous session
    _cpiPendingImageDataUrl = null;

    // For new items, pre-generate a globally-unique numeric ID
    let autoId = '';
    if (!item) {
        autoId = await cpiGenerateNextId();
    }

    // Build same modal as admin catalog
    document.getElementById('cat-item-modal')?.remove();
    const isNew = !item;
    const id    = item ? (item.ID || item.id || '') : autoId;
    const modal = document.createElement('div');
    modal.id = 'cat-item-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;`;
    modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;width:100%;max-width:460px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
        <div style="padding:16px 20px;border-bottom:1px solid var(--surface3);display:flex;align-items:center;gap:10px;background:var(--surface2);border-radius:16px 16px 0 0;">
            <span style="font-size:1rem;">📦</span>
            <span style="font-size:0.9rem;font-weight:800;color:var(--white);">${isNew?'إضافة منتج جديد':'تعديل المنتج'}</span>
            <button onclick="document.getElementById('cat-item-modal').remove()"
                    style="margin-right:auto;background:var(--surface3);border:none;cursor:pointer;color:var(--gray-light);
                           width:28px;height:28px;border-radius:50%;font-size:1rem;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">
            <div style="text-align:center;margin-bottom:2px;">
                <div onclick="document.getElementById('cim-img-file').click()"
                     style="width:90px;height:90px;border-radius:12px;overflow:hidden;background:var(--surface3);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px dashed var(--border);position:relative;transition:border-color .15s;"
                     onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'"
                     id="cat-modal-img-wrap">
                    ${(!isNew && (item.pngExist==='1'||item.pngExist===1))
                        ? `<img src="items2/${String(id).toLowerCase()}.webp?_t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;" id="cim-img-preview"
                               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div style="display:none;font-size:2rem;width:100%;height:100%;align-items:center;justify-content:center;" id="cim-img-placeholder">📷</div>`
                        : `<span style="font-size:2rem;" id="cim-img-placeholder">📷</span>
                           <img src="" style="width:100%;height:100%;object-fit:cover;display:none;" id="cim-img-preview">`
                    }
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.62rem;font-weight:700;padding:3px 0;text-align:center;">📤 رفع / تغيير</div>
                </div>
                <input type="file" id="cim-img-file" accept="image/*" style="display:none;" onchange="cpiPreviewImage(this)">
                <div style="font-size:0.68rem;color:var(--gray);line-height:1.5;">
                    اضغط على الصورة لرفع صورة المنتج مباشرة — سيتم حفظها كـ
                    <code style="color:var(--orange)" id="cat-modal-img-name">${id ? id.toLowerCase()+'.webp' : 'ID.webp'}</code>
                </div>
                <div id="cim-img-status" style="font-size:0.66rem;color:var(--gray);margin-top:2px;"></div>
            </div>
            <div class="modal-field">
                <label>اسم المنتج <span style="color:var(--orange)">*</span></label>
                <input type="text" id="cim-name" value="${item?.name||''}" placeholder="مثال: شاورما دجاج" style="width:100%;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="modal-field">
                    <label>السعر (ل.ل أو $)</label>
                    <input type="number" id="cim-price" value="${item?.price||''}" placeholder="75000" step="any" style="width:100%;">
                </div>
                <div class="modal-field">
                    <label>سعر بعد الخصم</label>
                    <input type="number" id="cim-sale" value="${item?.sale||''}" placeholder="0 = بدون" step="any" style="width:100%;">
                </div>
            </div>
            <div class="modal-field">
                <label>القسم الرئيسي <span style="color:var(--orange)">*</span></label>
                <div style="display:flex;gap:6px;">
                    <select id="cim-catmain-sel" onchange="cimCatmainChanged()"
                            style="flex:1;background:var(--surface3);border:1px solid #3a3a3a;border-radius:8px;color:var(--white);padding:7px 10px;font-size:0.8rem;outline:none;cursor:pointer;">
                        ${[...new Set(Object.values(_cpiAllItems).filter(Boolean).map(i=>i.catmain).filter(Boolean))].sort()
                            .map(c=>`<option value="${c}" ${(item?.catmain||'')=== c ?'selected':''}>${c}</option>`).join('')}
                        <option value="__new__">➕ إضافة جديد…</option>
                    </select>
                </div>
                <input type="text" id="cim-catmain" value="${item?.catmain||''}"
                       placeholder="اكتب قسم رئيسي جديد…" style="width:100%;margin-top:6px;display:${
                           (!item?.catmain || Object.values(_cpiAllItems).filter(Boolean).some(i=>i.catmain===item?.catmain)) ? 'none' : 'block'
                       };">
            </div>
            <div class="modal-field">
                <label>القسم الفرعي</label>
                <div style="display:flex;gap:6px;">
                    <select id="cim-cat-sel" onchange="cimCatChanged()"
                            style="flex:1;background:var(--surface3);border:1px solid #3a3a3a;border-radius:8px;color:var(--white);padding:7px 10px;font-size:0.8rem;outline:none;cursor:pointer;">
                        ${_cimCatOptions(item?.catmain, item?.cat)}
                    </select>
                </div>
                <input type="text" id="cim-cat" value="${item?.cat||''}"
                       placeholder="اكتب قسم فرعي جديد…" style="width:100%;margin-top:6px;display:none;">
            </div>
            <div class="modal-field">
                <label>الوصف</label>
                <textarea id="cim-desc" rows="2" placeholder="وصف اختياري" style="width:100%;resize:vertical;">${item?.unitdesc||''}</textarea>
            </div>
            <div class="modal-field">
                <label>الـ ID <span style="color:var(--orange)">*</span> <small style="color:var(--gray)">(اسم ملف الصورة = ID.webp)</small></label>
                <div style="display:flex;gap:6px;">
                    <input type="text" id="cim-id" value="${id}" placeholder="مثال: sha001" dir="ltr" style="flex:1;font-family:monospace;"
                           oninput="document.getElementById('cat-modal-img-name').textContent=(this.value.toLowerCase()||'id')+'.webp'">
                    ${isNew ? `
                    <button type="button" onclick="cpiRegenerateId(this)" title="توليد رقم جديد"
                            style="padding:0 12px;background:var(--surface3);border:1px solid var(--border);border-radius:8px;color:var(--gray-light);cursor:pointer;font-size:0.9rem;flex-shrink:0;">
                        🔄
                    </button>` : ''}
                </div>
                ${isNew ? `<div style="font-size:0.66rem;color:var(--green);margin-top:4px;">✓ تم توليد رقم تعريف فريد تلقائياً — يمكنك تغييره إن أردت</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;background:var(--surface3);padding:10px 12px;border-radius:8px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
                    <input type="checkbox" id="cim-pngexist" ${(item?.pngExist==='1'||item?.pngExist===1)?'checked':''}>
                    <span style="font-size:0.78rem;color:var(--gray-light);">صورة موجودة (pngExist = 1)</span>
                </label>
            </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--surface3);display:flex;gap:8px;">
            <button onclick="cpiSaveItem(${isNew})" id="cim-save-btn"
                    style="flex:1;padding:11px;background:var(--orange);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.84rem;font-weight:800;">
                ${isNew ? '✅ إضافة المنتج' : '💾 حفظ التغييرات'}
            </button>
            <button onclick="document.getElementById('cat-item-modal').remove()"
                    style="padding:11px 18px;background:var(--surface3);color:var(--gray-light);border:none;border-radius:10px;cursor:pointer;font-size:0.84rem;">
                إلغاء
            </button>
        </div>
    </div>`;
    modal._itemKey  = isNew ? null : (item._fbKey || id);
    modal._origItem = item;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('cim-name').focus();
    const cmSel = document.getElementById('cim-catmain-sel');
    const cSel  = document.getElementById('cim-cat-sel');
    const cmIn  = document.getElementById('cim-catmain');
    const cIn   = document.getElementById('cim-cat');
    if (cmSel && cmSel.value !== '__new__' && cmIn) cmIn.value = cmSel.value;
    if (cSel  && cSel.value  !== '__new__' && cIn)  cIn.value  = cSel.value;
}

/* ── Direct image upload (from منتجاتي, no manage.html needed) ──── */
let _cpiPendingImageFile = null; // File selected but not yet uploaded (uploads on save)
let _cpiPendingImageDataUrl = null; // data: URL for the pending file, so we can show it instantly post-save
const _cpiLocalImagePreview = {}; // { itemId: dataUrl } — shown instead of items2/{id}.webp right after an upload,
                                   // so the grid reflects the new image immediately instead of waiting on
                                   // GitHub → hosting propagation and possibly a stale browser cache.

function cpiPreviewImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
        showNotif('الملف كبير جداً', 'الحد الأقصى 6MB', 'error');
        input.value = '';
        return;
    }
    _cpiPendingImageFile = file;

    const preview     = document.getElementById('cim-img-preview');
    const placeholder = document.getElementById('cim-img-placeholder');
    const status       = document.getElementById('cim-img-status');
    const reader = new FileReader();
    reader.onload = (e) => {
        _cpiPendingImageDataUrl = e.target.result;
        if (preview) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    if (status) status.innerHTML = `<span style="color:var(--orange);">📤 سيتم رفع "${file.name}" عند الحفظ</span>`;

    // Auto-check the "صورة موجودة" box since an image is now staged
    const pngExistCb = document.getElementById('cim-pngexist');
    if (pngExistCb) pngExistCb.checked = true;
}

/* Convert any image file to WebP via canvas (skips if already webp) */
async function _cpiConvertToWebp(file, quality = 0.92) {
    if (file.type === 'image/webp') return file;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            c.toBlob(b => b ? resolve(b) : reject(new Error('تعذّر تحويل الصورة')), 'image/webp', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر تحميل الصورة')); };
        img.src = url;
    });
}

function _cpiBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/* Upload (or replace) the item's image as items2/{id}.webp, via the
   adminUploadImage Cloud Function (see _adminUploadImage above). */
async function cpiUploadItemImage(file, itemId) {
    const targetName = itemId.toLowerCase() + '.webp';
    await _adminUploadImage(file, ITEM_GH_FOLDER, targetName);
}

/* ── Save item (company portal version) ────────────────────── */
async function cpiSaveItem(isNew) {
    const storeName = currentAdmin?.linkedStore || '';
    if (!storeName) return;

    const name     = document.getElementById('cim-name').value.trim();
    const price    = document.getElementById('cim-price').value.trim();
    const sale     = document.getElementById('cim-sale').value.trim();
    const catmain  = document.getElementById('cim-catmain').value.trim();
    const cat      = document.getElementById('cim-cat').value.trim();
    const desc     = document.getElementById('cim-desc').value.trim();
    const itemId   = document.getElementById('cim-id').value.trim();
    const pngExist = document.getElementById('cim-pngexist').checked ? '1' : '0';

    if (!name || !itemId) { showNotif('بيانات ناقصة', 'الاسم والـ ID إلزاميان', 'error'); return; }

    const btn = document.getElementById('cim-save-btn');
    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';

    // For new items, do a final global collision check (covers the rare race
    // where two employees generated the same suggested ID at once)
    if (isNew) {
        try {
            const allItems = await fbGet('items').catch(() => null);
            if (allItems && typeof allItems === 'object') {
                for (const storeItems of Object.values(allItems)) {
                    if (!storeItems || typeof storeItems !== 'object') continue;
                    if (Object.prototype.hasOwnProperty.call(storeItems, itemId)) {
                        showNotif('رقم تعريف مستخدم', `الـ ID "${itemId}" مستخدم بالفعل — اضغط 🔄 لتوليد رقم جديد`, 'error');
                        btn.disabled = false;
                        btn.textContent = '✅ إضافة المنتج';
                        return;
                    }
                }
            }
        } catch (_) { /* if check fails, proceed */ }
    }

    const payload = {
        ID: itemId, name,
        price:    price || '0',
        sale:     sale  || '0',
        catmain:  catmain || 'عام',
        cat:      cat    || catmain || 'عام',
        unitdesc: desc,
        pngExist,
        companytype: _cpiStoreType,
    };

    try {
        await fbSet(`items/${storeName}/${itemId}`, payload);
        _cpiAllItems[itemId] = payload;

        // Upload staged image (if the user selected one) to items2/{id}.webp
        if (_cpiPendingImageFile) {
            btn.textContent = '📤 جاري رفع الصورة…';
            try {
                await cpiUploadItemImage(_cpiPendingImageFile, itemId);
                // Show the new image immediately in the grid — don't make the
                // admin wait for GitHub → hosting propagation, and don't let a
                // stale browser cache keep showing the old file for that path.
                if (_cpiPendingImageDataUrl) _cpiLocalImagePreview[itemId] = _cpiPendingImageDataUrl;
                _cpiAllItems[itemId].imgUpdatedAt = Date.now();
                await fbUpdate(`items/${storeName}/${itemId}`, { imgUpdatedAt: _cpiAllItems[itemId].imgUpdatedAt });
            } catch (imgErr) {
                showNotif('تم حفظ المنتج، لكن فشل رفع الصورة', imgErr.message, 'error');
            }
        }

        _cpiPendingImageFile = null;
        _cpiPendingImageDataUrl = null;
        showNotif(isNew ? '✅ تمت الإضافة' : '💾 تم الحفظ', name, 'success');
        document.getElementById('cat-item-modal').remove();
        cpiRender();
    } catch(e) {
        showNotif('خطأ في الحفظ', e.message, 'error');
        btn.disabled = false;
        btn.textContent = isNew ? '✅ إضافة المنتج' : '💾 حفظ التغييرات';
    }
}

/* ── Delete item ───────────────────────────────────────────── */
async function cpiDeleteItem(itemId) {
    const storeName = currentAdmin?.linkedStore || '';
    if (!storeName) return;
    const item = _cpiAllItems[itemId];
    const name = item?.name || itemId;
    const confirmed = await showConfirm({
        title: 'حذف المنتج', msg: `هل تريد حذف «${name}» نهائياً؟`,
        type: 'error', okLabel: 'حذف', icon: '🗑️'
    });
    if (!confirmed) return;
    try {
        await fbSet(`items/${storeName}/${itemId}`, null);
        delete _cpiAllItems[itemId];
        showNotif('تم الحذف', name, 'success');
        cpiRender();
    } catch(e) { showNotif('خطأ', e.message, 'error'); }
}

/* ── Skeleton loader ───────────────────────────────────────── */
function _cpiSkeleton(n) {
    return Array(n).fill(0).map(() => `
        <div class="cpi-skeleton">
            <div class="cpi-skeleton__thumb"></div>
            <div class="cpi-skeleton__body">
                <div class="cpi-skeleton__line" style="width:80%;"></div>
                <div class="cpi-skeleton__line" style="width:55%;"></div>
                <div class="cpi-skeleton__line" style="width:40%;margin-top:4px;"></div>
            </div>
        </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════
   COMPANY PORTAL — SALES MANAGEMENT
══════════════════════════════════════════════════════════ */
async function cpLoadSales() {
    const store   = currentAdmin?.linkedStore || '';
    const grid    = document.getElementById('cp-sales-grid');
    const countEl = document.getElementById('cp-sales-count');

    if (!grid) return;

    // No store linked — show clear message
    if (!store) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">⚠️ لم يتم ربط متجر بهذا الحساب</div>';
        if (countEl) countEl.textContent = '';
        return;
    }

    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);">⏳ جاري التحميل…</div>';

    try {
        const url = `${RTDB}/sales/${encodeURIComponent(store)}.json`;
        const res  = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data || typeof data !== 'object') {
            grid.innerHTML = `
                <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:50px 20px;gap:12px;">
                    <div style="font-size:2.5rem;">🏷️</div>
                    <div style="font-size:0.9rem;font-weight:800;color:var(--white);">لا توجد عروض بعد</div>
                    <div style="font-size:0.75rem;color:var(--gray);">اضغط "إضافة عرض" لإنشاء أول عرض لمتجرك</div>
                </div>`;
            if (countEl) countEl.textContent = '0 عروض';
            return;
        }

        const sales = Object.entries(data).map(([id, s]) => ({ id, ...s }));
        if (countEl) countEl.textContent = `${sales.length} ${sales.length === 1 ? 'عرض' : 'عروض'}`;

        grid.innerHTML = sales.map(s => {
            const saleP  = parseFloat(s.salePrice) || 0;
            const origP  = parseFloat(s.origPrice)  || 0;
            const curr   = s.currency === 'LBP' ? 'ل.ل' : '$';
            const pct    = origP > saleP && origP > 0 ? Math.round((1 - saleP/origP)*100) : 0;
            const items  = Array.isArray(s.items)
                ? s.items.map(i => { const q=parseInt(i.qty)||1; return i.name?(q>1?`${q}× ${i.name}`:i.name):''; }).filter(Boolean).join(' + ')
                : '';
            const active = s.active !== false;
            const safeS  = JSON.stringify(s).replace(/'/g, "\'");
            return `
            <div style="background:var(--surface2);border:1px solid var(--border-bright);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;">
                ${s.image ? `<div style="width:100%;height:110px;overflow:hidden;"><img src="${s.image}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentNode.style.display='none'"></div>` : ''}
                <div style="padding:12px 13px;display:flex;flex-direction:column;flex:1;">
                    <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;">
                        <span style="font-size:0.88rem;font-weight:900;flex:1;line-height:1.3;">${s.title || 'عرض'}</span>
                        <button onclick="cpToggleSaleActive('${s.id}',${active})" title="${active?'إيقاف العرض':'تفعيل العرض'}"
                                style="flex-shrink:0;padding:3px 8px;border-radius:50px;font-size:0.62rem;font-weight:800;cursor:pointer;border:1px solid;
                                       background:${active?'rgba(74,222,128,0.12)':'rgba(239,68,68,0.08)'};
                                       border-color:${active?'rgba(74,222,128,0.3)':'rgba(239,68,68,0.25)'};
                                       color:${active?'#4ade80':'var(--red)'};">
                            ${active ? '✅ نشط' : '⏸ متوقف'}
                        </button>
                    </div>
                    ${items ? `<div style="font-size:0.68rem;color:var(--gray);margin-bottom:8px;line-height:1.5;">${items}</div>` : ''}
                    <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:10px;flex-wrap:wrap;">
                        <span style="font-size:1.05rem;font-weight:900;color:var(--orange);">${saleP}${curr}</span>
                        ${origP > saleP ? `<span style="font-size:0.72rem;color:var(--gray);text-decoration:line-through;">${origP}${curr}</span>` : ''}
                        ${pct > 0 ? `<span style="font-size:0.7rem;font-weight:800;color:#4ade80;background:rgba(74,222,128,0.1);padding:2px 7px;border-radius:50px;">خصم ${pct}%</span>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;margin-top:auto;">
                        <button onclick='cpEditSale(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(s))}")))' style="flex:1;padding:8px;background:rgba(255,92,0,0.1);border:1px solid rgba(255,92,0,0.25);border-radius:10px;color:var(--orange);font-family:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">✏️ تعديل</button>
                        <button onclick="cpDeleteSale('${s.id}')" style="flex:1;padding:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:var(--red);font-family:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">🗑 حذف</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        console.error('[cpLoadSales]', e);
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red);font-size:0.82rem;">❌ تعذّر تحميل العروض<br><small style="color:var(--gray);">${e.message}</small></div>`;
    }
}

// Toggle active/inactive without opening modal
window.cpToggleSaleActive = async function(saleId, currentlyActive) {
    const store = currentAdmin?.linkedStore || '';
    if (!store) return;
    try {
        await fetch(`${RTDB}/sales/${encodeURIComponent(store)}/${saleId}/active.json`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(!currentlyActive),
        });
        toast(currentlyActive ? '⏸ تم إيقاف العرض' : '✅ تم تفعيل العرض');
        cpLoadSales();
    } catch(e) { toast('❌ فشل التحديث'); }
};

window.cpOpenSaleModal = function() {
    _salesCurrentStore = currentAdmin?.linkedStore || '';
    window._cpSaleAfterSave = true;
    openSaleModal();
};

window.cpEditSale = function(s) {
    _salesCurrentStore = currentAdmin?.linkedStore || '';
    window._cpSaleAfterSave = true;
    editSale(s);
};

window.cpDeleteSale = async function(saleId) {
    if (!confirm('هل تريد حذف هذا العرض نهائياً؟')) return;
    const store = currentAdmin?.linkedStore || '';
    if (!store) return;
    try {
        await fetch(`${RTDB}/sales/${encodeURIComponent(store)}/${saleId}.json`, { method: 'DELETE' });
        toast('🗑 تم حذف العرض');
        cpLoadSales();
    } catch(e) { toast('❌ فشل الحذف'); }
};

// Patch closeSaleModal to reload cp sales after save
const _cpOrigClose = window.closeSaleModal;
window.closeSaleModal = function() {
    if (typeof _cpOrigClose === 'function') _cpOrigClose();
    if (window._cpSaleAfterSave) {
        window._cpSaleAfterSave = false;
        const view = document.getElementById('cp-view-sales');
        if (view && view.style.display !== 'none') setTimeout(cpLoadSales, 300);
    }
};

// Filter pills inside company portal
document.addEventListener('click', e => {
    const pill = e.target.closest('[data-cp-filter]');
    if (!pill) return;
    document.querySelectorAll('[data-cp-filter]').forEach(b => b.classList.remove('active'));
    pill.classList.add('active');
    cpFilter = pill.dataset.cpFilter;
    cpRender();
});

document.getElementById('cp-refresh-btn')?.addEventListener('click', cpLoadOrders);
document.getElementById('cp-logout-btn')?.addEventListener('click', () => {
    clearInterval(cpRefreshTimer);
    currentAdmin = null;
    window.currentAdmin = null;
    localStorage.removeItem('delivoAdmin');
    document.getElementById('company-portal').classList.remove('visible');
    document.getElementById('login-screen').style.display = 'flex';
});

// Restore session — always through startApp(), which decides what a given
// role is allowed to see on THIS page (admin.html's own startApp rejects
// store-linked roles; store.html's store-guard.js override routes them to
// startCompanyPortal() instead — see scripts/store-guard.js).
const savedSession = localStorage.getItem('delivoAdmin');
if (savedSession) {
    try {
        currentAdmin = JSON.parse(savedSession);
        startApp();
    } catch(e) { localStorage.removeItem('delivoAdmin'); }
}

// ── Online-requests countdown ticker (state 7) ───────────────
(function startOrCountdown() {
    function tick() {
        document.querySelectorAll('.or-countdown[data-until]').forEach(el => {
            const until = parseInt(el.dataset.until);
            if (!until) return;
            const diffMs   = until - Date.now();
            const diffSec  = Math.ceil(diffMs / 1000);
            if (diffSec <= 0) {
                el.textContent = '⏱ انتهى';
                el.classList.add('urgent');
                return;
            }
            const m = Math.floor(diffSec / 60);
            const s = diffSec % 60;
            el.textContent = '⏱ ' + m + ':' + String(s).padStart(2,'0');
            el.classList.toggle('urgent', diffSec <= 120); // red in last 2 min
        });
    }
    tick();
    setInterval(tick, 1000);
})();

// ── Store/company panel prep-time countdown ticker (قيد التحضير) ──
// Same idea as startOrCountdown() above, but for .coc-eta banners in the
// store-user order cards. This is what actually makes the countdown "count
// down" — cpRender() only re-runs every 20s (or on data change), which
// isn't a live ticker, and previously the banner element itself often never
// even got created after the fact (see the cpRender() patch-path fix).
(function startCocEtaTicker() {
    function tick() {
        document.querySelectorAll('.coc-eta[data-until]').forEach(el => {
            const until = parseInt(el.dataset.until);
            const textEl = el.querySelector('.coc-eta-text') || el;
            if (!until) return;
            const diffMs  = until - Date.now();
            const diffSec = Math.ceil(diffMs / 1000);
            if (diffSec <= 0) {
                textEl.textContent = 'انتهى وقت التجهيز';
                el.classList.add('urgent');
                return;
            }
            const m = Math.floor(diffSec / 60);
            const s = diffSec % 60;
            textEl.textContent = `متبقي للتجهيز: ${m}:${String(s).padStart(2,'0')}`;
            el.classList.toggle('urgent', diffSec <= 120); // last 2 min
        });
    }
    tick();
    setInterval(tick, 1000);
})();

// Responsive: sidebar is always visible as icon rail on narrow screens


// ═══════════════════════════════════════════════════════════════
// ONLINE REQUESTS PANEL
// ═══════════════════════════════════════════════════════════════
let orFilter = 'all';
let orSearch = '';
let companyVars  = null;  // cached from Firebase /companydatas

async function fetchCompanyVars() {
    if (companyVars) return companyVars;
    try {
        const data = await fbGet('companydatas');
        companyVars = data || {};
    } catch(e) { companyVars = {}; }
    return companyVars;
}

// Delivery profit = orderPrice * (companyVars.deliveryProfitPercent / 100)
// or a flat fee from companyVars.deliveryProfitFlat
// Driver cost fetched from driver record: driver.deliveryCost or companyVars.defaultDriverCost
function calcDeliveryProfit(orderPrice, cv) {
    if (!cv) return null;
    if (cv.deliveryProfitFlat)    return parseFloat(cv.deliveryProfitFlat);
    if (cv.deliveryProfitPercent) return (parseFloat(orderPrice) * parseFloat(cv.deliveryProfitPercent) / 100);
    if (cv.deliveryProfit)        return parseFloat(cv.deliveryProfit);
    return null;
}

// Preferred source of truth: the actual delivery fee charged to the
// customer on this specific order (order.deliveryFee, saved at checkout
// since scripts/cart.js was updated to persist it). Falls back to the
// company-wide estimate (calcDeliveryProfit) for older orders placed
// before that field existed.
function getOrderDeliveryProfit(order, cv) {
    if (order && order.deliveryFee !== undefined && order.deliveryFee !== null && order.deliveryFee !== '') {
        const fee = parseFloat(order.deliveryFee);
        if (!isNaN(fee)) return fee;
    }
    const orderPrice = parseFloat(order?.orderprice || order?.total || 0);
    return calcDeliveryProfit(orderPrice, cv);
}

function calcDriverCost(driverName, cv) {
    if (!driverName || driverName === '0') return null;
    const d = allDrivers.find(dr => dr && (dr.owner === driverName || dr.username === driverName));
    if (d?.deliveryCost) return parseFloat(d.deliveryCost);
    if (d?.driverCost)   return parseFloat(d.driverCost);
    if (cv?.defaultDriverCost) return parseFloat(cv.defaultDriverCost);
    if (cv?.driverDeliveryCost) return parseFloat(cv.driverDeliveryCost);
    return null;
}

function formatMoney(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return val >= 1000 ? (val/1000).toFixed(2) + 'k ل.ل' : '$' + parseFloat(val).toFixed(2);
}

// Delivery fees are stored either as LBP (> 1000, the normal case — see
// cart.js's _normalizeDeliveryFee) or occasionally as a raw USD value an
// admin typed manually into the fee field (<= 1000). This converts either
// form to USD using the live exchange rate, so it can be subtracted from
// order.total (which is always the merged order+delivery amount in USD).
function _deliveryFeeToUSD(fee) {
    const n = parseFloat(fee);
    if (isNaN(n) || n <= 0) return 0;
    return n > 1000 ? n / (window._dollarRate || 90000) : n;
}

// Generic "raw typed/stored amount → USD" conversion, same magnitude rule
// as _currencySymbol/_normalizeMoneyValue (>1000 = Lebanese Lira). This is
// exactly what _deliveryFeeToUSD already does — aliased under a
// currency-neutral name since it's used for order totals too, not just
// delivery fees (see oc-total-input / or-price-input change handlers,
// and _splitOrderTotal below).
const _toUSD = _deliveryFeeToUSD;

// order.total is written at checkout as (order subtotal + delivery fee),
// merged, in USD (see cart.js requestObj.total). For display we want the
// order-only price split out from the delivery fee shown alongside it —
// this mirrors whatever delivery value is actually being displayed for
// that order (the admin's manual deliveryFee override if set, otherwise
// the estimated profit), so the two numbers always add back up to total.
function _splitOrderTotal(order, effectiveDeliveryRaw) {
    // Should always already be USD — but a handful of historical orders
    // ended up with a Lebanese-Lira-magnitude number in here instead, from
    // a since-fixed bug where editing the price while it displayed in ل.ل
    // saved the raw LBP figure straight into this USD field. Guard against
    // that here too, so old bad records don't blow up every sum that reads
    // from this function (e.g. the "الطلبات: $..." topbar total).
    const merged      = _toUSD(order?.orderprice || order?.total || 0);
    const deliveryUSD = _deliveryFeeToUSD(effectiveDeliveryRaw);
    return Math.max(0, merged - deliveryUSD);
}

// Order-only price (goods total, excluding delivery) — a genuine,
// independently-stored figure. Orders placed before this field existed
// (or never edited in admin since) don't have it yet, so for those we
// still fall back to splitting it out of the merged order.total via
// _splitOrderTotal, same as before. But as soon as the admin edits EITHER
// the order price or the delivery fee on an order (see the oc-total-input
// / oc-fee-input and or-price-input / or-fee-input change handlers),
// order.orderprice gets written explicitly — so from that point on the
// two figures are read independently and never recalculate each other.
function _getOrderOnlyPrice(order, effectiveDeliveryRaw) {
    if (order && order.orderprice !== undefined && order.orderprice !== null && order.orderprice !== '') {
        return _toUSD(order.orderprice);
    }
    return _splitOrderTotal(order, effectiveDeliveryRaw);
}

// Currency symbol for an editable price/fee field — LBP amounts are
// always well over 1000, USD amounts (almost) never are, so the
// magnitude alone tells us which currency the admin is typing.
function _currencySymbol(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '$';
    return n > 1000 ? 'ل.ل' : '$';
}

// Lebanese Lira is never dealt with in fractions of a lira in practice,
// and prices/fees are conventionally round numbers — so once a typed
// value crosses into LBP territory (>1000), snap it to a whole number
// rounded to the nearest 1000. USD values are rounded to the nearest cent.
function _normalizeMoneyValue(raw) {
    const n = parseFloat(raw);
    if (isNaN(n)) return '';
    if (n > 1000) return String(Math.round(n / 1000) * 1000);
    return (Math.round(n * 100) / 100).toFixed(2);
}

/* Format Lebanese phone numbers stored as "96170714152+" (or with the
   "+" anywhere, or already with "+961" prefix) into the standard
   "+961 70 714 152" form — "+" first, country code, then grouped digits. */
function formatPhone(raw) {
    if (!raw) return '—';
    // Keep only digits
    let digits = String(raw).replace(/\D/g, '');
    // Strip leading country code "961" if present
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    if (!digits) return '—';
    // Group: 2 digits (operator prefix) + remaining in 3-3
    const part1 = digits.slice(0, 2);
    const rest  = digits.slice(2);
    const grouped = rest.length > 3
        ? `${rest.slice(0, 3)} ${rest.slice(3)}`
        : rest;
    return `+961 ${part1}${grouped ? ' ' + grouped : ''}`.trim();
}

// Builds a wa.me chat link from a stored phone value — same digit
// normalization as formatPhone() above (handles a "961" country-code
// prefix or a leading "0" already present in the stored value), just
// re-assembled into a link instead of a display string. Returns '' when
// there's nothing usable to link to.
function _waLinkFromPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    digits = digits.replace(/^0/, '');
    return digits ? `https://wa.me/961${digits}` : '';
}

// True only for a complete Lebanese mobile number — accepts either form:
// with country code ("+96176123456"/"96176123456") or local ("76123456"),
// same digit-normalization as _waLinkFromPhone. Used to hold back WhatsApp
// buttons/chips when a stored phone is missing digits or obviously not a
// real Lebanese mobile number, rather than offering a button that would
// just fail or message the wrong person.
function _isCompleteLebanesePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    digits = digits.replace(/^0/, '');
    // 8-digit mobile prefixes (70/71/76/78/79/81/82/83/86), or the old
    // Alfa "03" prefix which is 7 digits once its leading 0 is dropped.
    return /^(70|71|76|78|79|81|82|83|86)\d{6}$/.test(digits) || /^3\d{6}$/.test(digits);
}

// Sends a WhatsApp message straight from the browser via GREEN-API —
// same approach scripts/modal-auth.js already uses for OTP codes
// (settings/greenApiInstance + settings/greenApiToken, cached on
// window._greenApi* after the first successful read). No WhatsApp
// app/web tab is ever opened; the message just arrives in the
// customer's chat. Throws on failure so callers can toast the error.
async function _sendGreenApiWhatsapp(phone, message) {
    let idInstance = window._greenApiInstance || '';
    let apiToken   = window._greenApiToken    || '';
    if (!idInstance || !apiToken) {
        const s = await fbGet('settings').catch(() => null);
        if (s?.greenApiInstance) idInstance = window._greenApiInstance = s.greenApiInstance;
        if (s?.greenApiToken)    apiToken   = window._greenApiToken    = s.greenApiToken;
    }
    if (!idInstance || !apiToken) throw new Error('GREEN-API غير مهيأ — تحقق من إعدادات الأدمن');
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    digits = digits.replace(/^0/, '');
    if (!digits) throw new Error('رقم هاتف غير صالح');
    const chatId   = '961' + digits + '@c.us';
    const gaServer = String(idInstance).slice(0, 4);
    const apiUrl   = `https://${gaServer}.api.greenapi.com/waInstance${idInstance}/sendMessage/${apiToken}`;
    const resp = await fetch(apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chatId, message }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) throw new Error(data.error || `فشل الإرسال (${resp.status})`);
    return true;
}

function orStateLabel(state) {
    const map = { '0':'جديد', '1':'وُصِّل', '2':'ملغى', '3':'متأخر', '6':'استُلم', '7':'قيد التحضير', '8':'جاهز للتسليم' };
    return map[state] || state;
}

let _orRowSnapshots = {}; // orderKey -> last-rendered row signature, avoids needless row rebuilds

async function renderOnlineRequests() {
    const tbody   = document.getElementById('or-tbody');
    const emptyEl = document.getElementById('or-empty');
    const countEl = document.getElementById('or-count-label');
    const table   = document.getElementById('or-table');
    if (!tbody) return;

    // Only show the loading placeholder before the very first real
    // render — doing this unconditionally on every background refresh
    // wiped every row (and any open select / in-progress typing) on
    // every tick, even when nothing had actually changed.
    const isFirstRender = !tbody.querySelector('tr[data-key]');
    if (isFirstRender) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--gray);padding:24px;font-size:var(--fs-xs);">جارٍ التحميل…</td></tr>';
    }

    const cv = await fetchCompanyVars();

    // Build entries from allOrders
    let entries = Object.entries(allOrders)
        .sort(([a],[b]) => (parseInt(b.replace('id_',''))||0) - (parseInt(a.replace('id_',''))||0));

    // Filter by active tab
    entries = entries.filter(([,o]) => {
        const s = o.state || '0';
        const archived = o.vault == 1;
        if (orFilter === 'active')    return !archived && ['0','3','6','7','8'].includes(s);
        if (orFilter === 'delivered') return !archived && s === '1';
        if (orFilter === 'cancelled') return !archived && s === '2';
        return !archived; // 'all'
    });

    // Filter by date range
    entries = entries.filter(([,o]) => _onlineOrderMatchesDateFilter(o));

    // Search filter
    if (orSearch) {
        const q = orSearch.toLowerCase();
        entries = entries.filter(([key, o]) =>
            key.replace('id_','').includes(q) ||
            (o.fullname  || '').toLowerCase().includes(q) ||
            (o.username  || '').toLowerCase().includes(q) ||
            (o.store     || '').toLowerCase().includes(q) ||
            (o.shipnumber|| key).toLowerCase().includes(q)
        );
    }

    countEl.textContent = entries.length + ' طلب';
    emptyEl.style.display = entries.length === 0 ? 'flex' : 'none';
    table.style.display   = entries.length === 0 ? 'none' : '';

    // Summary totals
    let totalRevenue = 0, totalProfit = 0, newCount = 0;
    entries.forEach(([,o]) => {
        const price = parseFloat(o.orderprice || o.total || 0);
        totalRevenue += price;
        const p = getOrderDeliveryProfit(o, cv);
        if (p !== null) totalProfit += p;
        if ((o.state||'0') === '0') newCount++;
    });
    document.getElementById('or-sum-new').textContent     = newCount;
    document.getElementById('or-sum-revenue').textContent = formatMoney(totalRevenue);
    document.getElementById('or-sum-profit').textContent  = totalProfit > 0 ? formatMoney(totalProfit) : '—';

    // Drop stale rows no longer in the filtered/searched list; everything
    // else is diffed per-row below instead of a full wipe-and-rebuild.
    const newRowKeys = new Set(entries.map(([k]) => k));
    tbody.querySelectorAll('tr[data-key]').forEach(tr => {
        if (!newRowKeys.has(tr.dataset.key)) tr.remove();
    });
    if (isFirstRender) tbody.innerHTML = ''; // clear the one-time loading row

    // ── Detect synchronized groups (same date = placed together) ──
    // A "sync group" = 2+ consecutive entries sharing the exact same o.date.
    // We alternate between two palette classes (or-sync-a / or-sync-b) each
    // time a NEW sync group appears, so adjacent groups are always distinct.
    const dateOf = ([, o]) => (o.date || '').trim();
    // Build a groupId per entry: entries with the same date that are
    // contiguous get the same groupId; a lone entry has groupId = null.
    const groupIds = [];
    {
        // First pass: mark contiguous runs of same-date
        const runIds = [];
        let runStart = 0;
        for (let i = 0; i <= entries.length; i++) {
            const cur  = i < entries.length ? dateOf(entries[i]) : null;
            const prev = i > 0 ? dateOf(entries[i - 1]) : null;
            if (i === entries.length || (i > 0 && cur !== prev)) {
                const runLen = i - runStart;
                const isSync = runLen >= 2 && prev !== '';
                for (let j = runStart; j < i; j++) {
                    runIds.push(isSync ? prev : null); // null = singleton
                }
                runStart = i;
            }
        }
        // Second pass: assign alternating palette index per sync group
        const seenGroups = new Map(); // dateKey → paletteIndex (0 or 1)
        let nextPalette = 0;
        runIds.forEach(gid => {
            if (gid === null) { groupIds.push(null); return; }
            if (!seenGroups.has(gid)) {
                seenGroups.set(gid, nextPalette);
                nextPalette = 1 - nextPalette;
            }
            groupIds.push(seenGroups.get(gid)); // 0 → 'a', 1 → 'b'
        });
    }

    entries.forEach(([key, o], idx) => {
        const shipNum    = o.shipnumber || key.replace('id_','');
        const state      = o.state || '0';
        const isUnread   = o.read !== '1';
        const profit     = getOrderDeliveryProfit(o, cv);
        // Effective delivery value shown in the "ربح التوصيل" column — the
        // admin's manual override if set, otherwise the estimated profit.
        const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : profit;
        // Order-only price shown in "سعر الطلب" — reads the independent
        // order.orderprice field when present, only falling back to
        // splitting the old merged order.total for orders never edited yet.
        const orderOnlyPrice = _getOrderOnlyPrice(o, effectiveDeliveryRaw);
        const driverCost = calcDriverCost(o.driver, cv);
        const assigned   = o.driver && o.driver !== '0';

        const syncPalette = groupIds[idx]; // null | 0 | 1
        const syncClass   = syncPalette === 0 ? 'or-sync-a' : syncPalette === 1 ? 'or-sync-b' : '';
        // Is this the first row of its sync group? → show the badge
        const isFirstInGroup = syncPalette !== null &&
            (idx === 0 || groupIds[idx - 1] !== syncPalette ||
             dateOf(entries[idx]) !== dateOf(entries[idx - 1]));
        const syncBadgeClass  = syncPalette === 0 ? 'or-sync-label-a' : 'or-sync-label-b';
        const syncBadgeColor  = syncPalette === 0 ? '🔵' : '🟠';
        const syncBadge = isFirstInGroup
            ? `<div class="or-sync-label ${syncBadgeClass}">${syncBadgeColor} متزامن</div>` : '';

        // ── Skip rebuilding this row if nothing about it changed, or if
        // the admin is currently interacting with it (typing a price,
        // has the driver dropdown focused) — this function runs on a
        // refresh timer, so rebuilding unconditionally was closing open
        // selects and wiping in-progress edits on every tick.
        const driverStatus = allDrivers.find(d => d && (d.owner === o.driver || d.username === o.driver))?.status || '';
        const rowSnapshot = JSON.stringify(o) + '|' + driverStatus + '|' + syncClass + '|' + (isFirstInGroup ? 1 : 0);
        const existingRow = tbody.querySelector(`tr[data-key="${key}"]`);
        if (existingRow && _orRowSnapshots[key] === rowSnapshot) return;
        if (existingRow && existingRow.contains(document.activeElement)) return;
        _orRowSnapshots[key] = rowSnapshot;

        const tr = document.createElement('tr');
        tr.dataset.key = key;
        if (isUnread) tr.classList.add('or-unread');
        if (syncClass) tr.classList.add(syncClass);

        tr.innerHTML = `
            <td><span class="or-shipnum">${shipNum}</span>${syncBadge}</td>
            <td>
                <span class="or-state-badge or-state-${state}">${orStateLabel(state)}</span>
                ${state === '7' && o.standbyUntil ? `<span class="or-countdown" data-until="${o.standbyUntil}">⏱ …</span>` : ''}
            </td>
            <td><span class="or-store">${o.store || '—'}</span></td>
            <td>
                <div style="font-weight:700;">${o.fullname || o.username || '—'}</div>
                ${o.username && o.fullname ? `<div class="or-customer">@${o.username}</div>` : ''}
            </td>
            <td dir="ltr" style="text-align:left;"><span class="or-phone">${formatPhone(o.phone)}</span></td>
            <td><span class="or-city">${o.city || '—'}${o.street ? ' · '+o.street : ''}</span></td>
            <td><span class="or-price-cur" data-oid="${key}">${_currencySymbol(orderOnlyPrice)}</span><input type="number" class="or-price-input" data-oid="${key}" value="${orderOnlyPrice ? orderOnlyPrice.toFixed(2) : ''}" placeholder="0" step="0.01" title="سعر الطلب بدون رسم التوصيل — اضغط للتعديل"></td>
            <td><span class="or-fee-cur" data-oid="${key}">${_currencySymbol(o.deliveryFee != null && o.deliveryFee !== '' ? o.deliveryFee : profit)}</span><input type="number" class="or-fee-input" data-oid="${key}" value="${o.deliveryFee != null && o.deliveryFee !== '' ? o.deliveryFee : (profit !== null ? profit.toFixed(2) : '')}" placeholder="—" step="0.01" title="رسم التوصيل — يمكن تعديله يدوياً"></td>
            <td><span class="${driverCost !== null ? 'or-drivercost' : 'or-profit-loading'}">${driverCost !== null ? formatMoney(driverCost) : (assigned ? '—' : '—')}</span></td>
            <td><span class="or-date">${o.date || '—'}</span></td>
            <td>
                <button class="or-remove-btn" data-ordelete="${key}" title="حذف الطلب نهائياً من قاعدة البيانات">🗑 حذف الطلب</button>
            </td>
        `;

        // Editable price
        const orPriceInput = tr.querySelector('.or-price-input');
        if (orPriceInput) {
            const orPriceCur = tr.querySelector('.or-price-cur');
            orPriceInput.addEventListener('input', () => {
                const sym = _currencySymbol(orPriceInput.value);
                if (orPriceCur) orPriceCur.textContent = sym;
                orPriceInput.step = sym === 'ل.ل' ? '1000' : '0.01';
            });
            orPriceInput.addEventListener('change', async () => {
                const val = _normalizeMoneyValue(orPriceInput.value.trim());
                orPriceInput.value = val;
                if (orPriceCur) orPriceCur.textContent = _currencySymbol(val);
                // Order price and delivery fee are independent fields — this
                // only ever writes order.orderprice (a value the admin typed
                // in ل.ل is converted to USD first via _toUSD). order.total
                // is refreshed alongside it purely for other reports that
                // still read the merged figure; the delivery fee itself is
                // never touched here.
                const orderOnlyUSD = _toUSD(val);
                const deliveryUSD = _deliveryFeeToUSD(effectiveDeliveryRaw);
                await updateOrderFields(key, {
                    orderprice: orderOnlyUSD.toFixed(2),
                    total: (orderOnlyUSD + deliveryUSD).toFixed(2)
                });
                toast('✅ تم تحديث سعر الطلب');
            });
        }

        // Editable delivery fee (admin override of the smart auto-fee)
        const orFeeInput = tr.querySelector('.or-fee-input');
        if (orFeeInput) {
            const orFeeCur = tr.querySelector('.or-fee-cur');
            orFeeInput.addEventListener('input', () => {
                const sym = _currencySymbol(orFeeInput.value);
                if (orFeeCur) orFeeCur.textContent = sym;
                orFeeInput.step = sym === 'ل.ل' ? '1000' : '0.01';
            });
            orFeeInput.addEventListener('change', async () => {
                const val = _normalizeMoneyValue(orFeeInput.value.trim());
                orFeeInput.value = val;
                if (orFeeCur) orFeeCur.textContent = _currencySymbol(val);
                // Lock in the order price exactly as currently displayed
                // (as an explicit order.orderprice field) so editing the
                // delivery fee never shifts it — order.total is refreshed
                // alongside for other reports, but the order-price input
                // itself is untouched.
                const newDeliveryUSD = _deliveryFeeToUSD(val);
                await updateOrderFields(key, {
                    deliveryFee: val,
                    orderprice: orderOnlyPrice.toFixed(2),
                    total: (orderOnlyPrice + newDeliveryUSD).toFixed(2)
                });
                toast('✅ تم تحديث رسم التوصيل');
            });
        }

        // Permanently delete the order — from /requests AND its synced
        // /historyRequests copy. Irreversible, so the confirm dialog is explicit.
        tr.querySelector('[data-ordelete]').addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'حذف الطلب نهائياً',
                msg: `هل تريد حذف الطلب <b>#${shipNum}</b> نهائياً من قاعدة البيانات؟<br>لا يمكن التراجع عن هذا الإجراء.`,
                type: 'danger',
                icon: '🗑',
                okLabel: 'نعم، احذف نهائياً',
                cancelLabel: 'إلغاء'
            });
            if (!confirmed) return;
            await orDeleteOrder(key);
        });

        if (existingRow) {
            existingRow.replaceWith(tr);
        } else {
            const rows = [...tbody.querySelectorAll('tr[data-key]')];
            const nextRow = rows.find(r => (parseInt(r.dataset.key.replace('id_','')) || 0) < (parseInt(key.replace('id_','')) || 0));
            if (nextRow) tbody.insertBefore(tr, nextRow);
            else tbody.appendChild(tr);
        }
    });
}

// Generic single-field order update — writes to /requests and its
// /historyRequests mirror, same convention as orAssignDriver etc.
// Used by the editable price ("total") and delivery-fee inputs so admin
// can fill in a price for orders placed without one (e.g. "طلب خارجي")
// or override the auto-calculated ("smart") delivery fee when needed.
async function updateOrderField(orderId, field, value) {
    const uid = allOrders[orderId]?.delivryplusid;
    const upd = {};
    upd[`/requests/${orderId}/${field}`] = value;
    if (uid) upd[`/historyRequests/${uid}/${orderId}/${field}`] = value;
    await fbUpdate('', upd);
    if (allOrders[orderId]) allOrders[orderId][field] = value;
}

// Same as updateOrderField but writes several fields in one round-trip —
// used when editing the order price or delivery fee, so the order price
// (order.orderprice) and delivery fee (order.deliveryFee) can each be
// saved as independent fields (plus a refreshed order.total kept in sync
// for other code that still reads the merged figure) without the two
// visible inputs ever recalculating each other. See _getOrderOnlyPrice.
async function updateOrderFields(orderId, fields) {
    const uid = allOrders[orderId]?.delivryplusid;
    const upd = {};
    Object.entries(fields).forEach(([field, value]) => {
        upd[`/requests/${orderId}/${field}`] = value;
        if (uid) upd[`/historyRequests/${uid}/${orderId}/${field}`] = value;
    });
    await fbUpdate('', upd);
    if (allOrders[orderId]) Object.assign(allOrders[orderId], fields);
}

// Opens the same shared map picker used in "اطلب" (order/store location),
// pre-filled with the order's existing pin if it has one, and lets the
// admin drag/click a new spot — replacing the old read-only coordinate
// text with something actually editable.
function _ocEditOrderLocation(key, order) {
    const hasLoc = order.lat && order.lat !== '0';
    let [lat, lng] = hasLoc ? _fixSwappedLatLng(parseFloat(order.lat), parseFloat(order.lng)) : [null, null];
    _openGenericMapPicker({
        title: `📍 تعديل موقع التوصيل — طلب #${key.replace('id_', '')}`,
        initLat: lat,
        initLng: lng,
        showAddressSearch: false,
        waPhone: order.phone || '',
        onSave: async (newLat, newLng) => {
            await Promise.all([
                updateOrderField(key, 'lat', String(newLat)),
                updateOrderField(key, 'lng', String(newLng)),
            ]);
            toast('✅ تم تحديث موقع التوصيل');
            // Setting/changing the location is exactly the moment the smart
            // delivery fee can now be (re)computed — auto-trigger the same
            // calculation the "🧮 تلقائي" button runs, so the admin doesn't
            // have to press both separately.
            if (allOrders[key]) { allOrders[key].lat = String(newLat); allOrders[key].lng = String(newLng); }
            await _ocAutoCalcFee(key, { quiet: true });
            renderOrders();
        },
    });
}

// Resolve a store's coordinates for the order-card auto-fee calc —
// external-store orders carry their own storeLat/storeLng (saved by
// _ocEditOrderStore), internal stores are looked up from the live
// allStores cache by name.
function _ocResolveStoreCoords(order) {
    if (order.storeLat && order.storeLng) {
        return { lat: parseFloat(order.storeLat), lng: parseFloat(order.storeLng) };
    }
    const s = allStores[order.store];
    if (s && s.lat && s.lng) return { lat: parseFloat(s.lat), lng: parseFloat(s.lng) };
    return { lat: null, lng: null };
}

// Order-card "🧮 تلقائي" — computes and applies the smart delivery fee for
// one specific order, using its saved destination pin (order.lat/lng) and
// its store's location, via the same _calcAutoDeliveryFee engine as the
// otlob form and regular customer checkout. `opts.quiet` suppresses the
// "no location" warning toast, used when this is auto-triggered right
// after a location was just saved (so nothing should be missing) rather
// than from the admin pressing the button directly.
async function _ocAutoCalcFee(key, opts = {}) {
    const order = allOrders[key];
    if (!order) return;
    const hasLoc = order.lat && order.lat !== '0';
    if (!hasLoc) {
        if (!opts.quiet) toast('لا يوجد موقع توصيل محفوظ لهذا الطلب — حدّد الموقع أولاً', true);
        return;
    }
    const [destLat, destLng] = _fixSwappedLatLng(parseFloat(order.lat), parseFloat(order.lng));
    const { lat: storeLat, lng: storeLng } = _ocResolveStoreCoords(order);
    const result = await _calcAutoDeliveryFee(destLat, destLng, storeLat, storeLng).catch(() => null);
    if (!result) {
        if (!opts.quiet) toast('تعذّر الحساب — تأكّد من تحديد متجر الطلب وموقعه', true);
        return;
    }
    const effectiveDeliveryRaw = (order.deliveryFee != null && order.deliveryFee !== '') ? order.deliveryFee : getOrderDeliveryProfit(order, companyVars);
    const orderOnlyUSD    = _getOrderOnlyPrice(order, effectiveDeliveryRaw);
    const newDeliveryUSD  = _deliveryFeeToUSD(String(result.fee));
    await updateOrderFields(key, {
        deliveryFee: String(result.fee),
        orderprice : orderOnlyUSD.toFixed(2),
        total      : (orderOnlyUSD + newDeliveryUSD).toFixed(2),
    });
    toast(`🧮 رسم تلقائي: ${result.fee.toLocaleString('en-US')} ل.ل${result.distanceKm != null ? ' — ' + result.distanceKm.toFixed(1) + ' كم' : ''}`);
}

// Lets admin correct/backdate an order's date & time — mainly for
// entering a historical order (one that actually happened by phone or
// WhatsApp before it was logged here) with a real past timestamp instead
// of "now". Uses _parseOrderDate (above) so it understands both the
// current "Y-M-D H:MM:SS" format and the legacy slash format old manual
// orders may still have, and always SAVES back in the current format.
function _ocEditOrderDate(key, order) {
    const stale = document.getElementById('date-edit-overlay');
    if (stale) stale.remove();

    const parsed = _parseOrderDate(order) || new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateVal = `${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}`;
    const timeVal = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;

    const overlay = document.createElement('div');
    overlay.id = 'date-edit-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;width:100%;max-width:380px;font-family:var(--font);direction:rtl;padding:20px;box-sizing:border-box;">
        <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0 0 4px;">📅 تعديل تاريخ الطلب</h3>
        <div style="font-size:0.75rem;color:var(--gray);margin-bottom:16px;">طلب #${key.replace('id_', '')}</div>
        <div style="display:flex;gap:10px;margin-bottom:16px;">
            <div style="flex:1;">
                <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:4px;">التاريخ</label>
                <input id="de-date" type="date" value="${dateVal}"
                    style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
                <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:4px;">الوقت</label>
                <input id="de-time" type="time" step="1" value="${timeVal}"
                    style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;">
            </div>
        </div>
        <div style="display:flex;gap:10px;">
            <button id="de-cancel-btn" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:10px;color:var(--white);font-family:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="de-save-btn" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:10px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">💾 حفظ</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('de-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('de-save-btn').addEventListener('click', async () => {
        const dEl = document.getElementById('de-date');
        const tEl = document.getElementById('de-time');
        if (!dEl.value) { toast('اختر تاريخاً صحيحاً', true); return; }
        const [y, m, d] = dEl.value.split('-').map(Number);
        const [h, mi, s] = (tEl.value || '00:00:00').split(':').map(Number);
        // Same no-zero-padding format used everywhere else (cart.js /
        // admin manual-order creation) so the admin date filter parses it.
        const newDateStr = `${y}-${m}-${d} ${h||0}:${mi||0}:${s||0}`;
        const btn = document.getElementById('de-save-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            await updateOrderField(key, 'date', newDateStr);
            toast('✅ تم تحديث تاريخ الطلب');
            close();
            // Force renderOrders to rebuild in sorted order rather than
            // leaving this card in its old spot — matters when sorted by
            // date, since editing the date should move the card, but the
            // normal diff only rebuilds cards whose content changed and
            // otherwise leaves untouched cards' positions alone.
            _lastOrderSort = orderSort === 'date' ? 'number' : 'date';
            renderOrders();
        } catch (e) {
            toast('فشل تحديث التاريخ: ' + e.message, true);
            btn.disabled = false; btn.textContent = '💾 حفظ';
        }
    });
}

// Lets admin set/correct an order's store — same map-picker pattern as
// _ocEditOrderLocation, but the pins here are every internal ("متاجر")
// and external ("متاجر خارجية") store that has a saved lat/lng, plus a
// combined dropdown listing ALL stores of both kinds (even ones without
// a location yet) and a manual-text fallback for anything not on Delivo.
// Picking an external store also carries its address/phone/coords onto
// the order (storeAddress/storeLat/storeLng/storePhone) so the driver
// app can still link to it, same as the "اطلب خارجي" flow does.
function _ocEditOrderStore(key, order) {
    const stale = document.getElementById('store-pick-overlay');
    if (stale) stale.remove();
    if (typeof L === 'undefined') { toast('تعذّر تحميل الخريطة', true); return; }

    const current = order.store || '';
    const intNames = Object.keys(allStores).sort((a, b) => a.localeCompare(b, 'ar'));
    const extEntries = Object.entries(allExtStores || {}).sort((a, b) => (a[1].name||'').localeCompare(b[1].name||'', 'ar'));

    // { type: 'internal'|'external'|null, name, lat, lng, address, phone }
    let picked = { type: null, name: current, lat: null, lng: null, address: '', phone: '' };

    const overlay = document.createElement('div');
    overlay.id = 'store-pick-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--surface2);border-radius:16px;width:100%;max-width:680px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;font-family:var(--font);direction:rtl;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <div style="font-weight:800;color:var(--white);">🏪 تحديد المتجر — طلب #${key.replace('id_', '')}</div>
                <button id="sp-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div style="padding:10px 20px;display:flex;gap:14px;font-size:0.7rem;color:var(--gray);border-bottom:1px solid var(--border);flex-shrink:0;">
                <span>🏪 <span style="color:var(--orange);font-weight:700;">برتقالي</span> = متجر داخلي</span>
                <span>🌍 <span style="color:#0ea5e9;font-weight:700;">أزرق</span> = متجر خارجي مفعّل</span>
                <span>🌍 <span style="color:#9a9ab0;font-weight:700;">رمادي</span> = متجر خارجي غير مفعّل</span>
            </div>
            <div style="flex:1;min-height:280px;position:relative;">
                <div id="sp-map" style="width:100%;height:100%;min-height:280px;"></div>
            </div>
            <div style="padding:14px 20px;flex-shrink:0;">
                <div id="sp-current" style="font-size:0.75rem;color:var(--gray);margin-bottom:10px;">
                    المتجر المحدد حالياً: <span style="color:var(--orange);font-weight:700;">${current || '— بدون متجر —'}</span>
                </div>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:6px;">اختر متجراً من القائمة (داخلي أو خارجي)</label>
                <select id="sp-select" style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;padding:9px 10px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;margin-bottom:12px;">
                    <option value="">— بدون متجر / إدخال يدوي —</option>
                    <optgroup label="متاجر داخلية">
                        ${intNames.map(n => `<option value="int::${n}" ${n === current ? 'selected' : ''}>🏪 ${n}</option>`).join('')}
                    </optgroup>
                    <optgroup label="متاجر خارجية">
                        ${extEntries.map(([k, s]) => `<option value="ext::${k}" ${s.name === current ? 'selected' : ''}>🌍 ${s.name || '—'}${s.active ? '' : ' (غير مفعّل)'}</option>`).join('')}
                    </optgroup>
                </select>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:6px;">أو أدخل اسم المتجر يدوياً</label>
                <input id="sp-manual" type="text" placeholder="اسم المتجر"
                    value="${current && !intNames.includes(current) && !extEntries.some(([,s]) => s.name === current) ? current : ''}"
                    style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;padding:9px 10px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0;">
                <button id="sp-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--white);font-family:inherit;cursor:pointer;">إلغاء</button>
                <button id="sp-save" style="flex:2;background:var(--orange);border:none;border-radius:10px;padding:10px;color:#fff;font-family:inherit;font-weight:800;cursor:pointer;">💾 حفظ المتجر</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    // ── Map + markers for every store (internal/external) that has a location ──
    const map = L.map('sp-map', { zoomControl: true }).setView([34.003, 36.212], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);

    const bounds = [];
    const spMarkers = {}; // key -> {marker, type, name, ...}
    const spLabelStyle = `
        font-family:'Almarai',sans-serif;font-size:10px;font-weight:800;
        white-space:nowrap;pointer-events:none;
        background:rgba(10,10,15,0.85);color:#f0f0f8;
        padding:2px 6px;border-radius:4px;
        box-shadow:0 1px 4px rgba(0,0,0,0.5);
        position:absolute;left:50%;transform:translateX(-50%);
        bottom:calc(100% + 4px);
    `;

    Object.values(allStores).forEach(s => {
        if (!s.lat || !s.lng) return;
        const isCurrent = s.companyname === current;
        const icon = mkDiv(
            `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                <div style="${spLabelStyle}">🏪 ${s.companyname}</div>
                <div style="width:26px;height:26px;border-radius:8px;background:#FF5C00;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(255,92,0,0.5);border:2px solid ${isCurrent ? '#fff' : 'rgba(255,255,255,0.3)'};">🏪</div>
            </div>`,
            [26, 42], [13, 26]
        );
        const m = L.marker([s.lat, s.lng], { icon })
            .bindPopup(`<b style="font-family:Almarai">🏪 ${s.companyname}</b>`)
            .addTo(map);
        m.on('click', () => selectStore('internal', s.companyname, null, s.lat, s.lng, '', ''));
        bounds.push([s.lat, s.lng]);
        spMarkers[`int::${s.companyname}`] = m;
    });

    Object.entries(allExtStores || {}).forEach(([k, s]) => {
        if (!s || !s.lat || !s.lng) return;
        const isCurrent = s.name === current;
        const color = s.active ? '#0ea5e9' : '#9a9ab0';
        const t = (typeof esTypeInfo === 'function') ? esTypeInfo(s.type) : { emoji: '🌍' };
        const icon = mkDiv(
            `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                <div style="${spLabelStyle}">${t.emoji} ${s.name || '—'}</div>
                <div style="width:26px;height:26px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 8px rgba(14,165,233,0.4);border:2px solid ${isCurrent ? '#fff' : 'rgba(255,255,255,0.3)'};">${t.emoji}</div>
            </div>`,
            [26, 42], [13, 26]
        );
        const lat = parseFloat(s.lat), lng = parseFloat(s.lng);
        const m = L.marker([lat, lng], { icon })
            .bindPopup(`<b style="font-family:Almarai">${t.emoji} ${s.name || '—'}</b><br><small style="color:#888">${s.address || ''}</small>`)
            .addTo(map);
        m.on('click', () => selectStore('external', s.name || '', k, lat, lng, s.address || '', s.phone || ''));
        bounds.push([lat, lng]);
        spMarkers[`ext::${k}`] = m;
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 80);

    const selectEl  = overlay.querySelector('#sp-select');
    const manualEl  = overlay.querySelector('#sp-manual');
    const currentEl = overlay.querySelector('#sp-current');

    function selectStore(type, name, extKey, lat, lng, address, phone) {
        picked = { type, name, lat, lng, address, phone };
        manualEl.value = '';
        selectEl.value = type === 'internal' ? `int::${name}` : `ext::${extKey}`;
        currentEl.innerHTML = `المتجر المحدد الآن: <span style="color:var(--orange);font-weight:700;">${type === 'internal' ? '🏪' : '🌍'} ${name}</span>`;
        const m = spMarkers[type === 'internal' ? `int::${name}` : `ext::${extKey}`];
        if (m) map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    }

    selectEl.addEventListener('change', () => {
        const val = selectEl.value;
        if (!val) { picked = { type: null, name: '', lat: null, lng: null, address: '', phone: '' }; return; }
        manualEl.value = '';
        if (val.startsWith('int::')) {
            const name = val.slice(5);
            const s = allStores[name] || {};
            selectStore('internal', name, null, s.lat || null, s.lng || null, '', '');
        } else if (val.startsWith('ext::')) {
            const k = val.slice(5);
            const s = allExtStores[k] || {};
            selectStore('external', s.name || '', k, s.lat ? parseFloat(s.lat) : null, s.lng ? parseFloat(s.lng) : null, s.address || '', s.phone || '');
        }
    });

    manualEl.addEventListener('input', () => {
        if (manualEl.value.trim()) {
            selectEl.value = '';
            picked = { type: 'manual', name: manualEl.value.trim(), lat: null, lng: null, address: '', phone: '' };
        }
    });

    const close = () => { map.remove(); overlay.remove(); };
    overlay.querySelector('#sp-close').addEventListener('click', close);
    overlay.querySelector('#sp-cancel').addEventListener('click', close);
    overlay.querySelector('#sp-save').addEventListener('click', async () => {
        const newStore = (manualEl.value.trim()) || picked.name || '';
        if (!newStore) { toast('اختر متجراً أو أدخل اسمه', true); return; }
        const updates = { store: newStore };
        if (picked.type === 'external') {
            updates.storeAddress = picked.address || '';
            updates.storeLat     = picked.lat != null ? String(picked.lat) : '';
            updates.storeLng     = picked.lng != null ? String(picked.lng) : '';
            updates.storePhone   = picked.phone || '';
        }
        await Promise.all(Object.entries(updates).map(([f, v]) => updateOrderField(key, f, v)));
        toast('✅ تم تحديث المتجر');
        close();
        renderOrders();
    });
}

async function orAssignDriver(orderId, driverName) {
    try {
        const uid = allOrders[orderId]?.delivryplusid;
        const updates = {};
        updates['/requests/' + orderId + '/driver'] = driverName;
        if (uid) updates['/historyRequests/' + uid + '/' + orderId + '/driver'] = driverName;
        await fbUpdate('', updates);
        allOrders[orderId].driver = driverName;
        toast('✅ تم تعيين ' + driverName + ' للشحنة');
        renderOnlineRequests();
    } catch(e) { toast('خطأ في التعيين', true); }
}

async function orDeleteOrder(orderId) {
    try {
        const uid = allOrders[orderId]?.delivryplusid;
        const updates = {};
        updates['/requests/' + orderId] = null;
        if (uid) updates['/historyRequests/' + uid + '/' + orderId] = null;
        await fbUpdate('', updates);
        delete allOrders[orderId];
        toast('🗑 تم حذف الطلب نهائياً');
        renderOnlineRequests();
    } catch(e) {
        toast('خطأ في حذف الطلب: ' + e.message, true);
    }
}

// ── Toolbar events (Online Requests) ──────────────────────────
document.addEventListener('click', e => {
    const pill = e.target.closest('[data-or-filter]');
    if (!pill) return;
    document.querySelectorAll('[data-or-filter]').forEach(b => b.classList.remove('active'));
    pill.classList.add('active');
    orFilter = pill.dataset.orFilter;
    renderOnlineRequests();
});

document.getElementById('or-search')?.addEventListener('input', e => {
    orSearch = e.target.value.trim();
    renderOnlineRequests();
});

document.getElementById('or-refresh-btn')?.addEventListener('click', () => {
    companyVars = null;
    loadData();
});