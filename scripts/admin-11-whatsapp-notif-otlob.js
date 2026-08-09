var _waNotifCache={}, _waNotifWired=false;
    function _initWaNotifListener(){
        if(_waNotifWired)return; _waNotifWired=true;
        // Poll via REST every 8s (avoids SDK db reference)
        async function _pollWa(){
            try {
                const r = await fetch(`${RTDB}/pendingWaNotifications.json`);
                _waNotifCache = (await r.json()) || {};
            } catch(_) { _waNotifCache = {}; }
            _refreshWaBell();
        }
        _pollWa();
        setInterval(_pollWa, 8000);
    }
    function _refreshWaBell(){
        var unread=Object.values(_waNotifCache).filter(function(n){return n&&!n.read;}).length;
        var btn=document.getElementById('wa-notif-btn');
        var count=document.getElementById('wa-notif-count');
        if(btn){btn.style.display=unread>0?'inline-flex':'none';}
        if(count){count.textContent=unread>0?unread:'';}
        _renderWaNotifList();
    }
    function _renderWaNotifList(){
        var list=document.getElementById('wa-notif-list');
        if(!list)return;
        var entries=Object.entries(_waNotifCache).sort(function(a,b){return new Date(b[1].orderTime||0)-new Date(a[1].orderTime||0);});
        if(!entries.length){list.innerHTML='<div style="padding:20px;text-align:center;color:var(--gray);font-size:0.78rem;">No notifications</div>';return;}
        list.innerHTML=entries.map(function(e){
            var key=e[0],n=e[1];
            var time=n.orderTime?new Date(n.orderTime).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}):'';
            return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);background:'+(n.read?'transparent':'rgba(34,197,94,0.07)')+'">'
                +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">'
                +'<span style="font-size:0.78rem;font-weight:800;color:var(--text);">'+(n.customer||'Customer')+' &mdash; '+(n.stores||'')+'</span>'
                +'<span style="font-size:0.63rem;color:var(--gray);">'+time+'</span>'
                +'</div>'
                +'<div style="font-size:0.7rem;color:var(--gray);margin-bottom:8px;">'+(n.phone||'')+'</div>'
                +'<div style="display:flex;gap:7px;">'
                +'<a href="'+(n.waLink||'#')+'" target="_blank" rel="noopener" onclick="markWaNotifRead(\''+key+'\')" style="flex:1;text-align:center;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;padding:6px;font-size:0.72rem;font-weight:800;">&#128172; Open WhatsApp</a>'
                +'<button onclick="deleteWaNotif(\''+key+'\')" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--gray);font-size:0.72rem;">&times;</button>'
                +'</div></div>';
        }).join('');
    }
    function toggleWaNotifPanel(){
        var panel=document.getElementById('wa-notif-panel');
        if(!panel)return;
        var open=panel.style.display!=='none';
        panel.style.display=open?'none':'block';
        if(!open){Object.keys(_waNotifCache).forEach(function(k){if(!_waNotifCache[k]||!_waNotifCache[k].read)markWaNotifRead(k);});}
    }
    function markWaNotifRead(key){
        fetch(`${RTDB}/pendingWaNotifications/${key}/read.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:'true'}).catch(function(){});
        if(_waNotifCache[key]) _waNotifCache[key].read=true;
        _refreshWaBell();
    }
    function deleteWaNotif(key){
        fetch(`${RTDB}/pendingWaNotifications/${key}.json`,{method:'DELETE'}).catch(function(){});
        delete _waNotifCache[key];
        _refreshWaBell();
    }
    function clearAllWaNotifs(){
        if(!confirm('Clear all WA notifications?'))return;
        fetch(`${RTDB}/pendingWaNotifications.json`,{method:'DELETE'}).catch(function(){});
        _waNotifCache={};
        _refreshWaBell();
        document.getElementById('wa-notif-panel').style.display='none';
    }
    document.addEventListener('click',function(e){
        var panel=document.getElementById('wa-notif-panel');
        var btn=document.getElementById('wa-notif-btn');
        if(panel&&btn&&!panel.contains(e.target)&&!btn.contains(e.target)){panel.style.display='none';}
    });
    setTimeout(_initWaNotifListener,3000);

/* ════════════════════════════════════════════════════════════
   ADMIN MANUAL ORDER — "اطلب"
   Lets staff place an order on behalf of a caller: a registered
   customer (searched from allUsers) or a phone-only guest, for a
   store already on Delivo (allStores) or any outside store typed
   in manually — mirroring external-order.js's data model
   (externalOrder / storeAddress / storeLat / storeLng / storePhone)
   so it renders identically everywhere else in the admin panel.
   Writes straight into requests/{key} (+ historyRequests for
   registered customers) using the same globalCounter/requestId
   sequence as regular checkout.

   GUEST-CUSTOMER DIRECTORY — guestCustomers/{phoneKey}: every
   "🆕 عميل غير مسجل" order upserts a lightweight record here
   (name, phone, last address, order count/history) keyed by the
   caller's normalized phone number — no account is ever created.
   The customer search box above now searches this directory
   alongside allUsers, so a returning walk-in caller is found by
   name or phone exactly like a registered customer. Existing
   guest orders already sitting in requests/ before this feature
   shipped are mined into the directory once per session by
   _aoBackfillGuestCustomersFromOrders() the first time this panel
   opens, so past callers are searchable immediately too.
════════════════════════════════════════════════════════════ */
let _aoInitialized  = false;
let _aoStoreMode    = 'internal';   // 'internal' | 'external'
let _aoSelectedCust = null;         // { uid, username, fullname, phone, city, street, lat, lng }
let _aoSelectedGuestKey   = null;   // phoneKey of a matched guestCustomers/ record, once found/selected
let _aoGuestBackfillDone  = false;
let _aoDestLat = null, _aoDestLng = null;
let _aoStoreLat = null, _aoStoreLng = null;
let _aoQuickCategories = {};
let _aoSmartCfgCache = undefined; // undefined = not fetched yet, null = fetched but absent
let _aoNightCfgCache  = undefined; // undefined = not fetched yet, null = fetched but absent

// ── Store-catalog item picker (see _aoLoadStoreCatalogAndTogglePicker) ──
let _aoStoreCatalog    = {};    // items/{companyname} for the currently selected internal store
let _aoOrderLines      = [];    // [{ id, type:'item', itemId, name, qty, unitUSD } | { id, type:'free', text }]
let _aoPriceAutoSynced = true;  // true until the admin manually edits ao-order-price
let _aoLineSeq         = 0;     // incrementing id generator for line rows

function renderAdminOrderPanel() {
    _aoInitOnce();
    _aoPopulateStoreSelect();
    _aoPopulateDriverSelect();
    _aoBackfillGuestCustomersFromOrders();
    _aoUpdateMissingWarnings();
    _aoUpdateNotifyStoreVisibility();
}

function _aoInitOnce() {
    if (_aoInitialized) return;
    _aoInitialized = true;

    document.getElementById('ao-cust-phone')?.addEventListener('input', e => {
        _aoSearchCustomers(e.target.value);
        _aoOnGuestPhoneInput(e.target.value);
        _aoUpdateMissingWarnings();
    });
    document.getElementById('ao-cust-name')?.addEventListener('input', _aoUpdateMissingWarnings);
    document.getElementById('ao-guest-known-fill-btn')?.addEventListener('click', _aoFillFromKnownGuest);

    document.querySelectorAll('[data-ao-store]').forEach(btn => {
        btn.addEventListener('click', () => _aoSetStoreMode(btn.dataset.aoStore));
    });
    document.getElementById('ao-store-select')?.addEventListener('change', _aoOnInternalStoreChange);
    document.getElementById('ao-ext-store-name')?.addEventListener('input', _aoUpdateMissingWarnings);
    document.getElementById('ao-order-desc')?.addEventListener('input', _aoUpdateMissingWarnings);
    document.getElementById('ao-order-price')?.addEventListener('input', _aoUpdateMissingWarnings);

    document.getElementById('ao-dest-map-btn')?.addEventListener('click', () => _aoOpenMapPicker('dest'));
    document.getElementById('ao-store-map-btn')?.addEventListener('click', () => _aoOpenMapPicker('store'));

    document.getElementById('ao-fee-auto-btn')?.addEventListener('click', _aoAutoCalcFee);
    document.getElementById('ao-ext-quickselect')?.addEventListener('change', e => _aoOnExtQuickSelect(e.target.value));
    document.getElementById('ao-submit-btn')?.addEventListener('click', _aoSubmit);

    // ── Store-catalog item picker ──
    document.getElementById('ao-item-search')?.addEventListener('input', e => _aoSearchStoreItems(e.target.value));
    document.getElementById('ao-item-search')?.addEventListener('focus', e => _aoSearchStoreItems(e.target.value));
    document.getElementById('ao-add-free-line-btn')?.addEventListener('click', () => _aoAddFreeLine());
    document.getElementById('ao-order-price')?.addEventListener('input', () => {
        _aoPriceAutoSynced = false;
        _aoUpdateResyncHintVisibility();
    });
    document.getElementById('ao-resync-price-btn')?.addEventListener('click', () => {
        _aoPriceAutoSynced = true;
        _aoSyncPriceFromLines(true);
    });
    document.addEventListener('click', e => {
        const box = document.getElementById('ao-item-search-results');
        const inp = document.getElementById('ao-item-search');
        if (box && inp && box.style.display !== 'none' && !box.contains(e.target) && e.target !== inp) {
            box.style.display = 'none';
        }
    });

    _aoLoadQuickCategories();
}

function _aoSetStoreMode(mode) {
    _aoStoreMode = mode;
    document.querySelectorAll('[data-ao-store]').forEach(b => b.classList.toggle('active', b.dataset.aoStore === mode));
    const intBody = document.getElementById('ao-store-internal-body');
    const extBody = document.getElementById('ao-store-external-body');
    if (intBody) intBody.style.display = mode === 'internal' ? '' : 'none';
    if (extBody) extBody.style.display = mode === 'external' ? 'flex' : 'none';
    if (mode === 'external') {
        _aoPopulateExtQuickSelect();
        _aoResetOrderLines();
        const picker = document.getElementById('ao-item-picker');
        if (picker) picker.style.display = 'none';
    } else {
        _aoLoadStoreCatalogAndTogglePicker();
    }
    _aoUpdateNotifyStoreVisibility();
    _aoUpdateMissingWarnings();
}

// ── Missing-field warnings — purely visual, never blocks submit. Turns
// a field's label red and lists it in a small banner above the submit
// button when it's still empty, so the admin can see at a glance which
// placeholder values ("زبون", "غير محدد", "طلب", 0) will be used. ──────
function _aoMarkLabel(labelId, missing) {
    const el = document.getElementById(labelId);
    if (el) el.style.color = missing ? 'var(--red)' : '';
}

function _aoUpdateMissingWarnings() {
    const missing = [];

    const phone = document.getElementById('ao-cust-phone')?.value.trim();
    const phoneMissing = !_aoSelectedCust && !phone;
    _aoMarkLabel('ao-label-cust-phone', phoneMissing);
    if (phoneMissing) missing.push('رقم الهاتف');

    // The name field only matters while no registered account is picked —
    // it's hidden entirely once one is selected.
    if (!_aoSelectedCust) {
        const nameMissing = !document.getElementById('ao-cust-name')?.value.trim();
        _aoMarkLabel('ao-label-cust-name', nameMissing);
        if (nameMissing) missing.push('اسم العميل (سيُسجَّل كـ «زبون»)');
    } else {
        _aoMarkLabel('ao-label-cust-name', false);
    }

    if (_aoStoreMode === 'external') {
        const extMissing = !document.getElementById('ao-ext-store-name')?.value.trim();
        _aoMarkLabel('ao-label-ext-store-name', extMissing);
        _aoMarkLabel('ao-label-store-select', false);
        if (extMissing) missing.push('اسم المتجر (سيُسجَّل كـ «غير محدد»)');
    } else {
        const storeMissing = !document.getElementById('ao-store-select')?.value;
        _aoMarkLabel('ao-label-store-select', storeMissing);
        _aoMarkLabel('ao-label-ext-store-name', false);
        if (storeMissing) missing.push('المتجر (سيُسجَّل كـ «غير محدد»)');
    }

    const descMissing = !document.getElementById('ao-order-desc')?.value.trim();
    _aoMarkLabel('ao-label-order-desc', descMissing);
    if (descMissing) missing.push('وصف الطلب (سيُسجَّل كـ «طلب»)');

    const priceRaw = parseFloat(document.getElementById('ao-order-price')?.value);
    const priceMissing = !priceRaw || priceRaw <= 0;
    _aoMarkLabel('ao-label-order-price', priceMissing);
    if (priceMissing) missing.push('سعر الطلب (سيُسجَّل كـ 0)');

    const banner = document.getElementById('ao-missing-warning');
    if (banner) {
        if (missing.length) {
            banner.style.display = 'block';
            banner.textContent = `⚠️ يمكن إنشاء الطلب، لكن ينقصه: ${missing.join(' · ')}`;
        } else {
            banner.style.display = 'none';
        }
    }
}

function _aoPopulateStoreSelect() {
    const sel = document.getElementById('ao-store-select');
    if (!sel) return;
    const current = sel.value;
    const names = Object.keys(allStores || {}).sort((a,b) => a.localeCompare(b, 'ar'));
    sel.innerHTML = '<option value="">— اختر متجراً —</option>' +
        names.map(n => `<option value="${n.replace(/"/g,'&quot;')}">${n}</option>`).join('');
    if (names.includes(current)) sel.value = current;
}

function _aoOnInternalStoreChange() {
    const sel = document.getElementById('ao-store-select');
    const store = allStores?.[sel?.value];
    _aoStoreLat = (store && store.lat) ? parseFloat(store.lat) : null;
    _aoStoreLng = (store && store.lng) ? parseFloat(store.lng) : null;
    _aoUpdateCoordBadge('store'); // internal store has no visible badge element, no-op guard inside handles it
    _aoResetOrderLines(); // a different store's items no longer apply
    _aoLoadStoreCatalogAndTogglePicker();
    _aoUpdateNotifyStoreVisibility();
    _aoUpdateMissingWarnings();
}

function _aoPopulateDriverSelect() {
    const sel = document.getElementById('ao-driver-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— بدون تعيين (يظهر كطلب جديد) —</option>' +
        (allDrivers || []).filter(d => d && d.active === true).map(d =>
            `<option value="${(d.owner || d.username || '').replace(/"/g,'&quot;')}">${d.owner || d.username} ${d.status==='online'?'🟢':'⚫'}</option>`
        ).join('');
    if (current) sel.value = current;
}

// ── Customer search — registered accounts (allUsers) AND
// unregistered callers previously placed as a "🆕 عميل غير مسجل"
// order (allGuestCustomers). A phone number now finds its owner
// either way; guest rows are visually distinct and, on click,
// switch to the guest tab with everything prefilled instead of
// attaching an account that doesn't exist. ──────────────────────
function _aoSearchCustomers(q) {
    const resultsEl = document.getElementById('ao-cust-results');
    if (!resultsEl) return;
    q = (q || '').trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }
    const qDigits = q.replace(/\D/g, '');

    const regMatches = Object.entries(allUsers || {}).filter(([, u]) =>
        (u.fullname || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q)
    ).slice(0, 8);

    const guestMatches = Object.entries(allGuestCustomers || {}).filter(([key, g]) =>
        (g.fullname || '').toLowerCase().includes(q) ||
        (g.phone || '').includes(q) ||
        (qDigits && key.includes(qDigits))
    ).slice(0, 8);

    if (!regMatches.length && !guestMatches.length) {
        resultsEl.innerHTML = '<div style="font-size:0.78rem;color:var(--gray);padding:8px;">لا نتائج</div>';
        return;
    }

    const regHtml = regMatches.map(([uid, u]) => `
        <button type="button" class="ao-cust-result" data-uid="${uid}"
                style="text-align:right;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--white);font-family:inherit;">
            <div style="font-weight:700;">🔗 ${u.fullname || u.username || '—'}</div>
            <div style="font-size:0.72rem;color:var(--gray);">${u.username ? '@'+u.username+' · ' : ''}<bdi dir="ltr">${formatPhone(u.phone)}</bdi></div>
        </button>`).join('');

    const guestHtml = guestMatches.map(([key, g]) => {
        const count = g.orderCount || Object.keys(g.orders || {}).length || 1;
        return `
        <button type="button" class="ao-cust-result" data-guest-key="${key}"
                style="text-align:right;background:rgba(255,92,0,0.06);border:1px solid rgba(255,92,0,0.25);border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--white);font-family:inherit;">
            <div style="font-weight:700;">🆕 ${g.fullname || '—'}</div>
            <div style="font-size:0.72rem;color:var(--gray);">غير مسجّل · <bdi dir="ltr">${formatPhone(g.phone)}</bdi> · طلب ${count} ${count === 1 ? 'مرة' : 'مرات'}</div>
        </button>`;
    }).join('');

    resultsEl.innerHTML = regHtml + guestHtml;
    resultsEl.querySelectorAll('.ao-cust-result[data-uid]').forEach(btn => {
        btn.addEventListener('click', () => _aoSelectCustomer(btn.dataset.uid));
    });
    resultsEl.querySelectorAll('.ao-cust-result[data-guest-key]').forEach(btn => {
        btn.addEventListener('click', () => _aoSelectGuestFromSearch(btn.dataset.guestKey));
    });
}

// Picking a guest result from the (registered-tab) search box: switch
// to the guest tab and prefill everything we already know about them,
// instead of pretending they have an account.
function _aoSelectGuestFromSearch(key) {
    const g = allGuestCustomers?.[key];
    if (!g) return;
    const nameInp  = document.getElementById('ao-cust-name');
    const phoneInp = document.getElementById('ao-cust-phone');
    if (nameInp)  nameInp.value  = g.fullname || '';
    if (phoneInp) phoneInp.value = g.phone || '';
    _aoSelectedGuestKey = key;
    _aoApplyGuestAddress(g);
    _aoShowGuestKnownHint(g);

    const resultsEl = document.getElementById('ao-cust-results');
    if (resultsEl) resultsEl.innerHTML = '';
    _aoUpdateMissingWarnings();
}

// Live lookup as the admin types straight into the merged phone field —
// recognizes a returning walk-in caller without needing to click a
// search result at all.
function _aoOnGuestPhoneInput(val) {
    const key = _aoPhoneKey(val);
    if (!key || key.length < 7) { _aoHideGuestKnownHint(); _aoSelectedGuestKey = null; return; }
    const g = allGuestCustomers?.[key];
    if (!g) { _aoHideGuestKnownHint(); _aoSelectedGuestKey = null; return; }
    _aoSelectedGuestKey = key;
    _aoShowGuestKnownHint(g);
}

function _aoShowGuestKnownHint(g) {
    const hint = document.getElementById('ao-guest-known-hint');
    if (!hint) return;
    const count = g.orderCount || Object.keys(g.orders || {}).length || 1;
    const lastLabel = g.lastOrderAt ? ` · آخر طلب ${g.lastOrderAt.split(' ')[0]}` : '';
    document.getElementById('ao-guest-known-title').textContent = `📋 عميل سابق: ${g.fullname || '—'}`;
    document.getElementById('ao-guest-known-sub').textContent   = `طلب ${count} ${count === 1 ? 'مرة' : 'مرات'} سابقاً عبر اطلب${lastLabel}`;
    hint.style.display = 'flex';
}

function _aoHideGuestKnownHint() {
    const hint = document.getElementById('ao-guest-known-hint');
    if (hint) hint.style.display = 'none';
}

function _aoApplyGuestAddress(g) {
    const cityInp   = document.getElementById('ao-dest-city');
    const streetInp = document.getElementById('ao-dest-street');
    if (cityInp && g.city)     cityInp.value   = g.city;
    if (streetInp && g.street) streetInp.value = g.street;
    if (g.lat && g.lng) {
        // Defensive: records saved before the swap-fix (or backfilled from
        // an old order that already had it swapped) may still carry
        // lat/lng flipped — re-check every time we apply, not just on write.
        [_aoDestLat, _aoDestLng] = _fixSwappedLatLng(parseFloat(g.lat), parseFloat(g.lng));
        _aoUpdateCoordBadge('dest');
    }
}

// "📋 تعبئة العنوان" button next to the known-guest hint — fills in
// their last known address without overwriting a name already typed.
function _aoFillFromKnownGuest() {
    if (!_aoSelectedGuestKey) return;
    const g = allGuestCustomers?.[_aoSelectedGuestKey];
    if (!g) return;
    const nameInp = document.getElementById('ao-cust-name');
    if (nameInp && !nameInp.value.trim()) nameInp.value = g.fullname || '';
    _aoApplyGuestAddress(g);
    toast('📋 تم تعبئة بيانات العميل السابقة');
}

// ── Guest-customer directory (guestCustomers/{phoneKey}) ─────────
function _aoPhoneKey(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    return digits;
}

// Creates/updates one guest's directory record in-memory (caller
// persists it to Firebase) — shared by live order submission and the
// one-time historical backfill below, so both stay in sync.
//
// Address/coordinates are only overwritten if this order is the
// chronologically newest one seen for this guest so far — orders/
// isn't guaranteed to be iterated in date order (its keys are
// "id_N" strings, not sorted numerically), so a naive "always
// overwrite" here could leave an OLDER order's address showing as
// if it were current. Coordinates are also run through the same
// _fixSwappedLatLng() Lebanon-bounds check used everywhere else in
// the admin panel, since older manual orders can have lat/lng saved
// swapped.
function _aoUpsertGuestCustomer(phone, fullname, orderMeta) {
    const key = _aoPhoneKey(phone);
    if (!key) return null;
    const rec = allGuestCustomers[key] || { fullname: '', phone: '', city: '', street: '', lat: '', lng: '', orderCount: 0, orders: {} };
    rec.orders = rec.orders || {};
    rec.orders[orderMeta.reqKey] = { date: orderMeta.date || '', store: orderMeta.store || '', total: orderMeta.total || '' };
    rec.fullname = fullname || rec.fullname;
    rec.phone    = phone    || rec.phone;

    const od = orderMeta.date ? _parseOrderDate({ date: orderMeta.date }) : null;
    const ms = od ? od.getTime() : null;
    const isFirstEver = !rec.lastOrderMs && !rec.city && !rec.street && !rec.lat; // nothing recorded yet — always take what we have
    const isNewest = isFirstEver || (ms !== null && (!rec.lastOrderMs || ms >= rec.lastOrderMs));
    if (isNewest) {
        if (orderMeta.city)   rec.city   = orderMeta.city;
        if (orderMeta.street) rec.street = orderMeta.street;
        if (orderMeta.lat && orderMeta.lng) {
            const [fixedLat, fixedLng] = _fixSwappedLatLng(parseFloat(orderMeta.lat), parseFloat(orderMeta.lng));
            rec.lat = String(fixedLat); rec.lng = String(fixedLng);
        }
    }
    if (od) {
        if (!rec.firstOrderMs || ms < rec.firstOrderMs) { rec.firstOrderMs = ms; rec.firstOrderAt = orderMeta.date; }
        if (!rec.lastOrderMs  || ms > rec.lastOrderMs)  { rec.lastOrderMs  = ms; rec.lastOrderAt  = orderMeta.date; }
    }
    rec.orderCount = Object.keys(rec.orders).length;
    allGuestCustomers[key] = rec;
    return { key, rec };
}

// Runs once per admin session, the first time the "اطلب" panel opens:
// mines every pre-existing guest order in requests/ (no delivryplusid,
// i.e. never had this feature to save them into guestCustomers/) into
// the directory, so callers from before this shipped are searchable
// immediately instead of only from their next order onward.
function _aoBackfillGuestCustomersFromOrders() {
    if (_aoGuestBackfillDone) return;
    _aoGuestBackfillDone = true;
    const patch = {};
    let changed = false;
    Object.entries(allOrders || {}).forEach(([reqKey, o]) => {
        if (!o || o.delivryplusid) return; // has a linked account — not a guest order
        const phone    = (o.phone || '').trim();
        const fullname = (o.fullname || '').trim();
        if (!phone || !fullname) return;
        const key = _aoPhoneKey(phone);
        if (!key) return;
        if (allGuestCustomers[key]?.orders?.[reqKey]) return; // already recorded
        const result = _aoUpsertGuestCustomer(phone, fullname, {
            reqKey, date: o.date, store: o.store, total: o.total,
            city: o.city, street: o.street, lat: o.lat, lng: o.lng,
        });
        if (result) { patch[result.key] = result.rec; changed = true; }
    });
    if (changed) fbUpdate('guestCustomers', patch).catch(() => {});
}

function _aoSelectCustomer(uid) {
    const u = allUsers?.[uid];
    if (!u) return;
    _aoSelectedCust = {
        uid, username: u.username || '', fullname: u.fullname || u.displayName || '', phone: u.phone || '',
        city: u.city || '', street: u.street || '',
        lat: (u.location && u.location.lat) || u.lat || null,
        lng: (u.location && u.location.lng) || u.lng || null,
    };
    const searchInp = document.getElementById('ao-cust-phone');
    if (searchInp) searchInp.value = '';
    const resultsEl = document.getElementById('ao-cust-results');
    if (resultsEl) resultsEl.innerHTML = '';
    const box = document.getElementById('ao-cust-selected');
    if (box) box.style.display = 'flex';
    const nameEl = document.getElementById('ao-cust-selected-name');
    const subEl  = document.getElementById('ao-cust-selected-sub');
    if (nameEl) nameEl.textContent = _aoSelectedCust.fullname || '—';
    if (subEl)  subEl.innerHTML  = `${_aoSelectedCust.username ? '@'+_aoSelectedCust.username+' · ' : ''}<bdi dir="ltr">${formatPhone(_aoSelectedCust.phone)}</bdi>`;
    // A registered account already has its own name on file — hide the
    // free-text name field (and any stale guest hint) while it's selected.
    const nameWrap = document.getElementById('ao-cust-name-wrap');
    if (nameWrap) nameWrap.style.display = 'none';
    _aoHideGuestKnownHint();
    _aoUpdateMissingWarnings();

    // Prefill delivery address from the customer's saved profile, if any
    const cityInp = document.getElementById('ao-dest-city');
    const streetInp = document.getElementById('ao-dest-street');
    if (cityInp && _aoSelectedCust.city)     cityInp.value = _aoSelectedCust.city;
    if (streetInp && _aoSelectedCust.street) streetInp.value = _aoSelectedCust.street;
    if (_aoSelectedCust.lat && _aoSelectedCust.lng) {
        _aoDestLat = parseFloat(_aoSelectedCust.lat);
        _aoDestLng = parseFloat(_aoSelectedCust.lng);
        _aoUpdateCoordBadge('dest');
    }
}

function aoClearSelectedCustomer() {
    _aoSelectedCust = null;
    const box = document.getElementById('ao-cust-selected');
    if (box) box.style.display = 'none';
    const nameWrap = document.getElementById('ao-cust-name-wrap');
    if (nameWrap) nameWrap.style.display = '';
    _aoUpdateMissingWarnings();
}

// ── Shared map picker modal — used by "اطلب" (store & destination
// pins) and by "متاجر خارجية" (external store location). Pass a
// title, optional initial lat/lng, and an onSave(lat,lng) callback. ──

// ── Smart address lookup for phone-dictated locations ──
// Three engines, tried in order, all biased to the Bekaa/Baalbek area:
//   1. Google Places Text Search (New) — by far the best at informal
//      local POIs ("معهد ...", "فرن الرحمة", "صيدلية ...") because
//      Google's Lebanon business/landmark data is much richer than OSM.
//   2. Google Geocoding API — catches street/area-level addresses that
//      aren't a named business.
//   3. Nominatim (OSM) — free last-resort fallback, e.g. if the Google
//      key doesn't have those APIs enabled or quota runs out.
// Returns up to 4 candidates so the admin can pick which "معهد فلان"
// the caller actually meant instead of trusting a single blind match.
// NOTE: requires "Places API (New)" + "Geocoding API" enabled for the
// key in Google Cloud Console — otherwise it silently degrades to OSM.
const _GMP_GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
const _GMP_BIAS = { lat: 34.006, lng: 36.218, radiusM: 40000 }; // Baalbek + surrounding Bekaa

async function _gmpGeocodeAddress(query) {
    // ── 1. Google Places Text Search (New) ──
    try {
        const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': _GMP_GOOGLE_KEY,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: 'ar',
                regionCode: 'LB',
                maxResultCount: 4,
                locationBias: { circle: { center: { latitude: _GMP_BIAS.lat, longitude: _GMP_BIAS.lng }, radius: _GMP_BIAS.radiusM } },
            }),
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.places?.length) {
                return data.places.slice(0, 4).map(p => ({
                    lat: p.location.latitude, lng: p.location.longitude,
                    radius: 120, // Google POI pins are building-level — tight circle
                    label: `${p.displayName?.text || ''}${p.formattedAddress ? ' — ' + p.formattedAddress : ''}`,
                    source: 'Google Places',
                }));
            }
        }
    } catch (_) { /* fall through */ }

    // ── 2. Google Geocoding API ──
    try {
        const bounds = '33.75,35.85|34.35,36.60'; // SW|NE box around Bekaa/Baalbek (soft bias)
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=lb&language=ar&bounds=${encodeURIComponent(bounds)}&key=${_GMP_GOOGLE_KEY}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'OK' && data.results?.length) {
                return data.results.slice(0, 4).map(r => {
                    let radius = 250;
                    const vp = r.geometry?.viewport;
                    if (vp) {
                        const latM = Math.abs(vp.northeast.lat - vp.southwest.lat) * 111000;
                        const lngM = Math.abs(vp.northeast.lng - vp.southwest.lng) * 111000 * Math.cos(r.geometry.location.lat * Math.PI / 180);
                        radius = Math.min(800, Math.max(90, Math.round(Math.max(latM, lngM) / 2)));
                    }
                    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, radius, label: r.formatted_address, source: 'Google' };
                });
            }
        }
    } catch (_) { /* fall through */ }

    // ── 3. Nominatim (OSM) fallback ──
    try {
        const viewbox = '35.7,34.3,36.7,33.6';
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=lb&viewbox=${viewbox}&bounded=0&limit=4&accept-language=ar`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('geocode-network');
        const results = await resp.json();
        return results.slice(0, 4).map(r => {
            let radius = 250;
            if (r.boundingbox) {
                const [south, north, west, east] = r.boundingbox.map(Number);
                const latM = (north - south) * 111000;
                const lngM = (east - west) * 111000 * Math.cos(((north + south) / 2) * Math.PI / 180);
                radius = Math.min(800, Math.max(90, Math.round(Math.max(latM, lngM) / 2)));
            }
            return { lat: Number(r.lat), lng: Number(r.lon), radius, label: r.display_name, source: 'OSM' };
        });
    } catch (_) {
        throw new Error('geocode-network');
    }
}

// ── Universal coordinate parser — one paste box, any format ──
// Accepts whatever the admin happens to have on the clipboard:
//   • "33.991550, 36.175729"  (Google Maps place panel, WhatsApp)
//   • "33.991550 36.175729"   (space/semicolon/tab separated)
//   • 33°59'29.6"N 36°10'32.6"E   (DMS, Google Maps title bar)
//   • a full Google Maps URL (…/@33.99,36.17,… or ?q=33.99,36.17)
// Order is normalized through _fixSwappedLatLng, so pasting "lng, lat"
// backwards still lands on the right spot within Lebanon's bounds.
function _gmpParseCoords(raw) {
    if (!raw) return null;
    let s = String(raw).trim();

    // Normalize unicode variants pasted from maps/WhatsApp: fancy quotes,
    // Arabic decimal separators/digits, and RTL direction marks.
    s = s.replace(/[\u200e\u200f\u202a-\u202e]/g, '')          // bidi control chars
         .replace(/[’′]/g, "'").replace(/[”″]/g, '"')          // curly/prime marks → ascii
         .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))     // Arabic-Indic digits
         .replace(/٫/g, '.');                                   // Arabic decimal point

    // ── DMS: 33°59'29.6"N 36°10'32.6"E (letters may come before or after) ──
    const dmsRe = /(\d{1,3})°\s*(\d{1,2})'\s*([\d.]+)"?\s*([NSEW])/gi;
    const dmsMatches = [...s.matchAll(dmsRe)];
    if (dmsMatches.length >= 2) {
        const toDec = m => {
            let v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
            if (/[SW]/i.test(m[4])) v = -v;
            return { v, isLat: /[NS]/i.test(m[4]) };
        };
        const a = toDec(dmsMatches[0]), b = toDec(dmsMatches[1]);
        const lat = a.isLat ? a.v : b.v;
        const lng = a.isLat ? b.v : a.v;
        if (!isNaN(lat) && !isNaN(lng)) return _fixSwappedLatLng(lat, lng);
    }

    // ── Google Maps URL: prefer ?q=/&query= pin over the /@ viewport ──
    const urlQ = s.match(/[?&](?:q|query|ll|destination)=(-?[\d.]+)\s*,\s*(-?[\d.]+)/i)
              || s.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/)
              || s.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (urlQ) {
        const lat = parseFloat(urlQ[1]), lng = parseFloat(urlQ[2]);
        if (!isNaN(lat) && !isNaN(lng)) return _fixSwappedLatLng(lat, lng);
    }

    // ── Plain decimal pair, any common separator ──
    // Grab the first two decimal numbers in the string.
    const nums = s.match(/-?\d{1,3}\.\d+/g) || [];
    if (nums.length >= 2) {
        const lat = parseFloat(nums[0]), lng = parseFloat(nums[1]);
        if (!isNaN(lat) && !isNaN(lng)) return _fixSwappedLatLng(lat, lng);
    }

    return null;
}

function _openGenericMapPicker({ title, initLat, initLng, onSave, showAddressSearch = true, waPhone = null }) {
    if (typeof L === 'undefined') { toast('تعذّر تحميل الخريطة', true); return; }
    const startLat = initLat || 34.003, startLng = initLng || 36.212; // Baalbeck-ish default

    // When the address/coordinates input section is turned off (order
    // delivery-location editing — see _ocEditOrderLocation), a single
    // WhatsApp button replaces it instead: sends the customer a message
    // (directly via GREEN-API — see gmp-wa-request's click handler below,
    // no WhatsApp app/web tab ever opens) asking them to share their live
    // location in the chat, which the admin then eyeballs onto the
    // satellite map below (click-to-pin still works exactly the same).
    // Held back entirely when the phone isn't a complete Lebanese mobile
    // number — nothing usable to send to.
    const waRequestPhone = (!showAddressSearch && waPhone && _isCompleteLebanesePhone(waPhone)) ? waPhone : '';
    const waRequestMsg = 'مرحباً 👋، لتحديد موقع التوصيل بدقة، نرجو منك إرسال موقعك الحالي إلينا مباشرة عبر واتساب (📎 ثم 📍 الموقع). شكراً لك 🙏 — Delivo';

    const addressSearchHtml = showAddressSearch ? `
                <div style="display:flex;gap:8px;">
                    <input type="text" id="gmp-addr-input" placeholder="📝 صف العنوان كما ذكره الزبون هاتفياً (مثال: بعلبك، قرب فرن الرحمة، مقابل الصيدلية)"
                        style="flex:1;min-width:0;background:var(--surface1,#1a1a1a);border:1px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;">
                    <button id="gmp-addr-search" style="flex-shrink:0;background:var(--surface1,#1a1a1a);border:1px solid var(--orange);border-radius:10px;padding:9px 14px;color:var(--orange);font-family:inherit;font-size:0.8rem;font-weight:800;cursor:pointer;white-space:nowrap;">🔎 تحديد تقريبي</button>
                </div>
                <div id="gmp-addr-results" style="display:none;flex-wrap:wrap;gap:6px;"></div>` : '';
    const waSectionHtml = waRequestPhone ? `
                <div style="display:flex;gap:8px;align-items:center;">
                    <button type="button" id="gmp-wa-request"
                        style="flex:1;text-align:center;background:rgba(37,211,102,0.12);border:1.5px solid #25D366;border-radius:10px;padding:10px 14px;color:#25D366;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">
                        📲 اطلب الموقع من الزبون عبر واتساب
                    </button>
                </div>
                <div style="font-size:0.7rem;color:var(--gray);">تُرسَل الرسالة مباشرة دون فتح واتساب — بعد استلام الزبون للموقع، انقر على المكان المطابق في الخريطة أدناه، أو الصق إحداثياته في الحقل أدناه 📍</div>` : '';
    // The coordinate-paste box is always available — even on the order
    // delivery-location picker (showAddressSearch:false) — since a caller
    // may dictate/paste exact coordinates (WhatsApp share, Google Maps
    // link) rather than only replying to the WhatsApp location-request
    // button above.
    const addressSectionHtml = `
                ${addressSearchHtml}
                <div id="gmp-addr-status" style="display:none;font-size:0.72rem;line-height:1.6;"></div>
                ${waSectionHtml}
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.75rem;color:var(--gray);font-weight:700;white-space:nowrap;">📡 إحداثيات:</span>
                    <input type="text" id="gmp-coord-input" placeholder="الصق الإحداثيات كما هي — مثال: 33.991550, 36.175729 أو 33°59'29.6&quot;N 36°10'32.6&quot;E أو رابط خرائط غوغل"
                        style="flex:1;min-width:220px;background:var(--surface1,#1a1a1a);border:1px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:inherit;font-size:0.78rem;direction:ltr;text-align:left;">
                    <button id="gmp-coord-apply" style="flex-shrink:0;background:var(--orange);border:none;border-radius:8px;padding:7px 12px;color:#fff;font-family:inherit;font-size:0.76rem;font-weight:800;cursor:pointer;white-space:nowrap;">📌 تطبيق</button>
                </div>`;

    // Admin almost always opens this on a PC, so let it actually use the
    // screen instead of sitting in a small fixed box — on narrow/mobile
    // viewports it still falls back to something screen-appropriate.
    const isWide     = window.innerWidth >= 860;
    const cardWidth  = isWide ? 'min(1300px, 95vw)' : '95vw';
    const cardHeight = isWide ? 'min(90vh, 900px)'  : '90vh';

    const overlay = document.createElement('div');
    overlay.id = 'generic-map-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--surface2);border-radius:16px;width:${cardWidth};height:${cardHeight};display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <div style="font-weight:800;color:var(--white);">${title || '📍 تحديد الموقع'}</div>
                <button id="gmp-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div style="padding:12px 20px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--border);flex-shrink:0;">
                ${addressSectionHtml}
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <button id="gmp-layer-cust" style="background:var(--surface1,#1a1a1a);border:1px solid var(--border);border-radius:999px;padding:6px 12px;color:var(--gray);font-family:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;white-space:nowrap;">👥 مواقع الزبائن</button>
                    <button id="gmp-layer-hist" style="background:var(--surface1,#1a1a1a);border:1px solid var(--border);border-radius:999px;padding:6px 12px;color:var(--gray);font-family:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;white-space:nowrap;">🕐 مواقع طلبات سابقة</button>
                    <input type="text" id="gmp-people-filter" placeholder="🔍 فلترة بالاسم أو الهاتف (مثال: علي / 71...)"
                        style="flex:1;min-width:180px;background:var(--surface1,#1a1a1a);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--white);font-family:inherit;font-size:0.74rem;">
                    <span id="gmp-layer-count" style="font-size:0.7rem;color:var(--gray);white-space:nowrap;"></span>
                </div>
            </div>
            <div style="flex:1;min-height:260px;position:relative;">
                <div id="gmp-canvas" style="width:100%;height:100%;min-height:260px;"></div>
            </div>
            <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0;">
                <button id="gmp-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--white);font-family:inherit;cursor:pointer;">إلغاء</button>
                <button id="gmp-save" style="flex:2;background:var(--orange);border:none;border-radius:10px;padding:10px;color:#fff;font-family:inherit;font-weight:800;cursor:pointer;">💾 حفظ الموقع</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const map = L.map('gmp-canvas', { zoomControl: true }).setView([startLat, startLng], initLat ? 16 : 13);
    // Two base layers — standard (OSM) and satellite/hybrid (Google, with
    // place labels) — same pair + toggle button used everywhere else on
    // the site (see cart.js's coverage-warning map, external-order.js,
    // modal-auth.js's registration map). Kept identical here for a
    // consistent look, and so the satellite view actually shows street/
    // place labels instead of bare imagery.
    const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
    const gmpStandardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
    });
    const gmpSatelliteLayer = L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
    );
    gmpSatelliteLayer.addTo(map);
    let gmpCurrentLayer = 'satellite';

    const gmpToggleCtrl = L.control({ position: 'topright' });
    gmpToggleCtrl.onAdd = function () {
        const btn = L.DomUtil.create('button', 'map-toggle-btn');
        btn.innerHTML = '🗺 خريطة';
        btn.title     = 'تبديل نوع الخريطة';
        btn.style.cssText = `
            background:#fff; border:2px solid #FF5C00;
            border-radius:6px; padding:5px 9px;
            font-size:12px; font-weight:700;
            cursor:pointer; color:#FF5C00;
            box-shadow:0 1px 5px rgba(0,0,0,0.3);
            white-space:nowrap;
        `;
        L.DomEvent.on(btn, 'click', function (e) {
            L.DomEvent.stopPropagation(e);
            if (gmpCurrentLayer === 'standard') {
                map.removeLayer(gmpStandardLayer);
                gmpSatelliteLayer.addTo(map);
                gmpCurrentLayer = 'satellite';
                btn.innerHTML = '🗺 خريطة';
            } else {
                map.removeLayer(gmpSatelliteLayer);
                gmpStandardLayer.addTo(map);
                gmpCurrentLayer = 'standard';
                btn.innerHTML = '🛰 صورة جوية';
            }
        });
        return btn;
    };
    gmpToggleCtrl.addTo(map);

    let marker = initLat ? L.marker([initLat, initLng], { draggable: true }).addTo(map) : null;
    let picked = initLat ? { lat: initLat, lng: initLng } : null;
    // The dashed circle marks an *approximate* region when all the admin
    // has is a spoken description — it's cleared the moment the location
    // becomes exact (manual click/drag, or WhatsApp coordinates applied),
    // since at that point the pin is no longer a guess.
    let uncertaintyCircle = null;
    const clearUncertainty = () => { if (uncertaintyCircle) { map.removeLayer(uncertaintyCircle); uncertaintyCircle = null; } };

    const onMarkerMoved = () => { picked = marker.getLatLng(); clearUncertainty(); };
    if (marker) marker.on('dragend', onMarkerMoved);

    map.on('click', e => {
        picked = e.latlng;
        clearUncertainty();
        if (marker) marker.setLatLng(e.latlng);
        else {
            marker = L.marker(e.latlng, { draggable: true }).addTo(map);
            marker.on('dragend', onMarkerMoved);
        }
    });

    setTimeout(() => map.invalidateSize(), 80);
    // Modal is sized relative to the viewport, so keep the map canvas in
    // sync if the admin resizes the browser window while it's open.
    const onWinResize = () => map.invalidateSize();
    window.addEventListener('resize', onWinResize);

    // ── Approximate locate from a phone-dictated address ──
    // Uses the Google-first lookup chain above. Because informal spoken
    // descriptions are ambiguous, up to 4 candidates come back as
    // clickable chips — the admin picks the one matching what the caller
    // meant, gets an uncertainty circle, and fine-tunes by dragging.
    // Only wired up when showAddressSearch rendered this section at all
    // (see waRequestPhone/addressSectionHtml above) — order delivery-
    // location editing replaces it with the WhatsApp-request button
    // instead, so none of these elements exist in that case.
    const addrStatusEl  = overlay.querySelector('#gmp-addr-status');
    const setAddrStatus = (text, color) => {
        addrStatusEl.style.display = text ? 'block' : 'none';
        addrStatusEl.style.color = color || 'var(--gray)';
        addrStatusEl.textContent = text || '';
    };
    if (showAddressSearch) {
    const addrResultsEl = overlay.querySelector('#gmp-addr-results');
    const focusCandidate = (c) => {
        clearUncertainty();
        uncertaintyCircle = L.circle([c.lat, c.lng], {
            radius: c.radius, color: '#FF5C00', weight: 2, dashArray: '5,7',
            fillColor: '#FF5C00', fillOpacity: 0.12,
        }).addTo(map);
        if (marker) marker.setLatLng([c.lat, c.lng]);
        else { marker = L.marker([c.lat, c.lng], { draggable: true }).addTo(map); marker.on('dragend', onMarkerMoved); }
        picked = { lat: c.lat, lng: c.lng };
        map.setView([c.lat, c.lng], c.radius <= 150 ? 17 : 16);
        setAddrStatus(`🎯 ${c.label.slice(0, 90)} — اسحب العلامة 📍 لتدقيق الموقع بعد التأكد من الزبون`, '#22c55e');
    };
    const renderCandidates = (list) => {
        addrResultsEl.innerHTML = '';
        addrResultsEl.style.display = list.length ? 'flex' : 'none';
        list.forEach((c, i) => {
            const chip = document.createElement('button');
            chip.style.cssText = 'background:var(--surface1,#1a1a1a);border:1px solid var(--orange);border-radius:999px;padding:5px 11px;color:var(--white);font-family:inherit;font-size:0.72rem;font-weight:700;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            chip.textContent = `${i === 0 ? '⭐ ' : '📍 '}${c.label.slice(0, 60)}${c.label.length > 60 ? '…' : ''}`;
            chip.title = `${c.label} (${c.source})`;
            chip.addEventListener('click', () => focusCandidate(c));
            addrResultsEl.appendChild(chip);
        });
    };
    const runAddrSearch = async () => {
        const q = overlay.querySelector('#gmp-addr-input').value.trim();
        if (!q) { setAddrStatus('⚠️ اكتب وصف العنوان أولاً', '#ef4444'); return; }
        const btn = overlay.querySelector('#gmp-addr-search');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ جاري البحث...';
        renderCandidates([]);
        setAddrStatus('🔎 يتم البحث عبر Google ضمن منطقة بعلبك/البقاع...');
        try {
            const candidates = await _gmpGeocodeAddress(q);
            if (!candidates || !candidates.length) {
                setAddrStatus('❌ ما لقينا نتيجة مطابقة — جرّب صياغة أخرى (اسم المؤسسة + البلدة)، أو حدد يدوياً / إحداثيات واتساب', '#ef4444');
            } else {
                renderCandidates(candidates);
                focusCandidate(candidates[0]);
            }
        } catch (e) {
            setAddrStatus('❌ تعذّر الاتصال بخدمات تحديد العناوين، حاول مجدداً', '#ef4444');
        } finally {
            btn.disabled = false; btn.textContent = orig;
        }
    };
    overlay.querySelector('#gmp-addr-search').addEventListener('click', runAddrSearch);
    overlay.querySelector('#gmp-addr-input').addEventListener('keydown', e => { if (e.key === 'Enter') runAddrSearch(); });
    } // end if (showAddressSearch)

    // ── Exact pin from a pasted coordinate string (WhatsApp share,
    // Google Maps panel, DMS, or a full maps URL) — one box, any format.
    // Always wired up (not just when showAddressSearch is true) so the
    // order delivery-location picker — which relies on the WhatsApp
    // location-request button instead of the address-search box — can
    // still accept coordinates the customer shares back.
    const coordInput = overlay.querySelector('#gmp-coord-input');
    const applyCoords = () => {
        const parsed = _gmpParseCoords(coordInput.value);
        if (!parsed) { toast('صيغة الإحداثيات غير مفهومة — الصقها كما هي من الخريطة أو واتساب', true); return; }
        const [lat, lng] = parsed;
        clearUncertainty();
        if (marker) marker.setLatLng([lat, lng]);
        else { marker = L.marker([lat, lng], { draggable: true }).addTo(map); marker.on('dragend', onMarkerMoved); }
        picked = { lat, lng };
        map.setView([lat, lng], 17);
        setAddrStatus(`📌 تم تحديد النقطة: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, '#22c55e');
    };
    overlay.querySelector('#gmp-coord-apply').addEventListener('click', applyCoords);
    coordInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyCoords(); });
    // Pasting is the whole point of this box — apply immediately so the
    // admin doesn't even need to press the button.
    coordInput.addEventListener('paste', () => setTimeout(applyCoords, 50));

    // ── Reference layers: registered customers' saved locations +
    // unregistered guestCustomers/ callers' last known address, plus
    // previous orders' delivery pins. When reception has the caller's
    // name/phone, filtering instantly surfaces their saved home pin and
    // every past delivery — clicking any dot adopts it as the new pin.
    // Reads the admin panel's already-loaded allUsers / allGuestCustomers
    // / allOrders globals, so toggling is instant (no extra fetches). ──
    const custLayer = L.layerGroup();
    const histLayer = L.layerGroup();
    let custOn = false, histOn = false;
    const countEl = overlay.querySelector('#gmp-layer-count');

    // Name/phone label is baked directly into the marker's own divIcon
    // (instead of a separate floating Leaflet tooltip) so it is always
    // pixel-locked to its dot — no possibility of the label drifting
    // away from the marker it belongs to, even in a dense cluster.
    const _personIcon = (bg, glyph, name, phone) => {
        const nameEsc  = _gmpEsc(name);
        const phoneEsc = phone ? _gmpEsc(formatPhone ? formatPhone(phone) : phone) : '';
        const label = `<div style="position:absolute;top:50%;right:100%;transform:translateY(-50%);margin-right:6px;
                        background:rgba(20,20,20,0.94);color:#fff;border:1.5px solid ${bg};border-radius:6px;
                        padding:3px 8px;font-size:11px;font-weight:700;line-height:1.5;white-space:nowrap;
                        direction:rtl;box-shadow:0 1px 5px rgba(0,0,0,0.4);">
                        <b>${nameEsc}</b>${phoneEsc ? '<br><bdi dir="ltr">📞 ' + phoneEsc + '</bdi>' : ''}
                    </div>`;
        return L.divIcon({
            className: '',
            html: `<div style="position:relative;width:26px;height:26px;">
                     <div style="width:26px;height:26px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;font-size:13px;">${glyph}</div>
                     ${label}
                   </div>`,
            iconSize: [26, 26], iconAnchor: [13, 13],
        });
    };

    const _adoptBtnHtml = (lat, lng) =>
        `<button onclick="window._gmpAdoptRefPoint(${lat},${lng})" style="margin-top:6px;width:100%;background:#FF5C00;border:none;border-radius:8px;padding:6px 10px;color:#fff;font-family:inherit;font-size:0.74rem;font-weight:800;cursor:pointer;">📌 اعتماد هذا الموقع</button>`;
    // Popup buttons are raw HTML, so the adopt action rides on a window
    // hook scoped to this open picker; cleared again on close.
    window._gmpAdoptRefPoint = (lat, lng) => {
        clearUncertainty();
        if (marker) marker.setLatLng([lat, lng]);
        else { marker = L.marker([lat, lng], { draggable: true }).addTo(map); marker.on('dragend', onMarkerMoved); }
        picked = { lat, lng };
        map.closePopup();
        map.setView([lat, lng], 17);
    };

    const _gmpEsc = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _filterMatch = (filter, ...fields) => {
        if (!filter) return true;
        const f = filter.toLowerCase().replace(/\s+/g, '');
        return fields.some(v => String(v || '').toLowerCase().replace(/\s+/g, '').includes(f));
    };

    function rebuildRefLayers() {
        const filter = overlay.querySelector('#gmp-people-filter').value.trim();
        let custN = 0, histN = 0;

        custLayer.clearLayers();
        if (custOn && typeof allUsers === 'object') {
            Object.values(allUsers).forEach(u => {
                const loc = u.location;
                let lat = parseFloat(loc?.lat ?? loc?.latitude ?? u.lat ?? u.latitude ?? NaN);
                let lng = parseFloat(loc?.lng ?? loc?.longitude ?? u.lng ?? u.longitude ?? NaN);
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
                [lat, lng] = _fixSwappedLatLng(lat, lng);
                const phone = u.phone || '';
                // A registered account with no fullname/username on file still
                // has a phone number — show that instead of a bare "—" so every
                // pin on the map is identifiable at a glance.
                const name  = u.displayName || u.fullname || u.username || (phone ? formatPhone(phone) : 'بدون اسم');
                if (!_filterMatch(filter, name, u.username, phone)) return;
                custN++;
                L.marker([lat, lng], { icon: _personIcon('#2563eb', '👤', name, phone) })
                    .bindPopup(`<div style="font-family:inherit;font-size:0.8rem;min-width:170px;"><b>👤 ${name}</b><br><span dir="ltr">📞 ${_gmpEsc(formatPhone ? formatPhone(phone) : (phone || '—'))}</span><br><span style="color:#888;font-size:0.72rem;">موقع محفوظ بالحساب</span>${_adoptBtnHtml(lat, lng)}</div>`)
                    .addTo(custLayer);
            });

            // Unregistered callers who ordered before via "اطلب" → "عميل غير
            // مسجل" (guestCustomers/ — see _aoUpsertGuestCustomer). Shown on
            // the same layer, orange-coded, so a returning walk-in caller's
            // last delivery point is just as findable as a registered one's.
            Object.values(allGuestCustomers || {}).forEach(g => {
                let lat = parseFloat(g.lat), lng = parseFloat(g.lng);
                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
                [lat, lng] = _fixSwappedLatLng(lat, lng);
                const phone = g.phone || '';
                const name  = g.fullname || (phone ? formatPhone(phone) : 'بدون اسم');
                if (!_filterMatch(filter, name, phone)) return;
                custN++;
                const count = g.orderCount || Object.keys(g.orders || {}).length || 1;
                L.marker([lat, lng], { icon: _personIcon('#FF5C00', '🆕', name, phone) })
                    .bindPopup(`<div style="font-family:inherit;font-size:0.8rem;min-width:170px;"><b>🆕 ${name}</b><br><span dir="ltr">📞 ${_gmpEsc(formatPhone ? formatPhone(phone) : (phone || '—'))}</span><br><span style="color:#FF5C00;font-size:0.72rem;">غير مسجّل · طلب ${count} ${count === 1 ? 'مرة' : 'مرات'} عبر اطلب</span>${_adoptBtnHtml(lat, lng)}</div>`)
                    .addTo(custLayer);
            });
        }

        histLayer.clearLayers();
        if (histOn && typeof allOrders === 'object') {
            // Newest first, capped so a big history doesn't drown the map.
            const entries = Object.entries(allOrders)
                .filter(([, o]) => o && o.lat && o.lat !== '0' && o.lng && o.lng !== '0')
                .sort((a, b) => parseInt(b[0].replace('id_', '')) - parseInt(a[0].replace('id_', '')));
            for (const [key, o] of entries) {
                if (histN >= 400) break;
                let lat = parseFloat(o.lat), lng = parseFloat(o.lng);
                if (isNaN(lat) || isNaN(lng)) continue;
                [lat, lng] = _fixSwappedLatLng(lat, lng);
                if (!_filterMatch(filter, o.fullname, o.username, o.phone)) continue;
                histN++;
                const orderNo = key.replace('id_', '');
                const clr = STATE_CLR[o.state || '0'] || STATE_CLR['0'];
                // Same pill badge as the main live map's order layer — just
                // the order number, colored by state — so an admin who
                // knows that map instantly recognizes these too.
                const icon = mkDiv(
                    `<div style="background:${clr.bg};color:${clr.tx};font-weight:800;font-size:0.62rem;
                                 padding:3px 7px;border-radius:50px;white-space:nowrap;
                                 box-shadow:0 2px 8px ${clr.bg}88;font-family:Almarai;
                                 border:1.5px solid rgba(255,255,255,0.35);">#${orderNo}</div>`,
                    null, [0, 0]
                );
                // Exact same popup as the main map (state, store, customer,
                // total, date, driver-assign) — plus one extra action to
                // adopt this order's delivery point as the new pin here.
                L.marker([lat, lng], { icon })
                    .bindPopup(orderPopupHTML(key, o) + _adoptBtnHtml(lat, lng))
                    .addTo(histLayer);
            }
        }

        countEl.textContent = (custOn || histOn) ? `${custN} زبون · ${histN} طلب` : '';

        // When a filter narrows things to one person's few points, jump
        // the view to them so reception doesn't have to hunt manually.
        if (filter && (custN + histN) > 0 && (custN + histN) <= 12) {
            const pts = [];
            custLayer.eachLayer(m => pts.push(m.getLatLng()));
            histLayer.eachLayer(m => pts.push(m.getLatLng()));
            if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 17 });
        }
    }

    const _chipStyle = (btn, on) => {
        btn.style.background = on ? 'var(--orange)' : 'var(--surface1,#1a1a1a)';
        btn.style.color      = on ? '#fff' : 'var(--gray)';
        btn.style.borderColor= on ? 'var(--orange)' : 'var(--border)';
    };
    const custBtn = overlay.querySelector('#gmp-layer-cust');
    const histBtn = overlay.querySelector('#gmp-layer-hist');
    custBtn.addEventListener('click', () => {
        custOn = !custOn;
        _chipStyle(custBtn, custOn);
        if (custOn) custLayer.addTo(map); else map.removeLayer(custLayer);
        rebuildRefLayers();
    });
    histBtn.addEventListener('click', () => {
        histOn = !histOn;
        _chipStyle(histBtn, histOn);
        if (histOn) histLayer.addTo(map); else map.removeLayer(histLayer);
        rebuildRefLayers();
    });
    let _filterT = null;
    overlay.querySelector('#gmp-people-filter').addEventListener('input', () => {
        clearTimeout(_filterT);
        _filterT = setTimeout(rebuildRefLayers, 250);
        // Typing a name implies wanting to see that person's pins — turn
        // both layers on automatically the first time the filter is used.
        if (!custOn && !histOn) {
            custOn = histOn = true;
            _chipStyle(custBtn, true); _chipStyle(histBtn, true);
            custLayer.addTo(map); histLayer.addTo(map);
        }
    });

    const waReqBtn = overlay.querySelector('#gmp-wa-request');
    if (waReqBtn) {
        waReqBtn.addEventListener('click', async () => {
            const orig = waReqBtn.textContent;
            waReqBtn.disabled = true; waReqBtn.textContent = '⏳ جارِ الإرسال...';
            try {
                await _sendGreenApiWhatsapp(waRequestPhone, waRequestMsg);
                toast('✅ تم إرسال طلب الموقع للزبون عبر واتساب');
                waReqBtn.textContent = '✅ تم الإرسال';
            } catch (e) {
                toast('❌ فشل الإرسال: ' + e.message, true);
                waReqBtn.disabled = false; waReqBtn.textContent = orig;
            }
        });
    }

    const close = () => {
        window.removeEventListener('resize', onWinResize);
        delete window._gmpAdoptRefPoint;
        map.remove(); overlay.remove();
    };
    overlay.querySelector('#gmp-close').addEventListener('click', close);
    overlay.querySelector('#gmp-cancel').addEventListener('click', close);
    overlay.querySelector('#gmp-save').addEventListener('click', () => {
        if (!picked) { toast('انقر على الخريطة لتحديد الموقع أولاً', true); return; }
        onSave(picked.lat, picked.lng);
        close();
    });
}

// ── Shared map picker (used for both store & destination pins) ──
function _aoOpenMapPicker(target) {
    const isStore = target === 'store';
    _openGenericMapPicker({
        title: isStore ? '📍 تحديد موقع المتجر' : '📍 تحديد موقع التوصيل',
        initLat: isStore ? _aoStoreLat : _aoDestLat,
        initLng: isStore ? _aoStoreLng : _aoDestLng,
        onSave: (lat, lng) => {
            if (isStore) { _aoStoreLat = lat; _aoStoreLng = lng; _aoUpdateCoordBadge('store'); }
            else         { _aoDestLat  = lat; _aoDestLng  = lng; _aoUpdateCoordBadge('dest'); }
        },
    });
}

function _aoUpdateCoordBadge(target) {
    const isStore = target === 'store';
    const el  = document.getElementById(isStore ? 'ao-store-coord-badge' : 'ao-dest-coord-badge');
    const lat = isStore ? _aoStoreLat : _aoDestLat;
    const lng = isStore ? _aoStoreLng : _aoDestLng;
    if (!el) return; // internal-store mode has no badge element — nothing to update
    if (lat && lng) { el.style.display = 'block'; el.textContent = `📌 ${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
    else el.style.display = 'none';
}

// ── Quick category chips — reuses settings/otlobFastItems, the
// same admin-configured categories shown to customers in "اطلب
// خارجي" on the index page, respecting the enable/disable toggle. ──
async function _aoLoadQuickCategories() {
    try {
        const [cats, enabled] = await Promise.all([
            fbGet('settings/otlobFastItems').catch(() => null),
            fbGet('settings/otlobFastItemsEnabled').catch(() => null),
        ]);
        if (enabled === false) return; // admin turned the quick-picker off — respect it here too
        if (Array.isArray(cats) && cats.length) {
            _aoQuickCategories = {};
            cats.forEach(c => { if (c && c.label && Array.isArray(c.items) && c.items.length) _aoQuickCategories[c.label] = c.items; });
        }
        const chipsEl = document.getElementById('ao-cat-chips');
        if (chipsEl && Object.keys(_aoQuickCategories).length) {
            chipsEl.innerHTML = Object.keys(_aoQuickCategories).map(cat =>
                `<button type="button" class="ao-cat-chip" data-cat="${cat.replace(/"/g,'&quot;')}"
                         style="font-size:0.78rem;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:6px 12px;color:var(--white);cursor:pointer;font-family:inherit;">${cat}</button>`
            ).join('');
            chipsEl.querySelectorAll('.ao-cat-chip').forEach(btn => {
                btn.addEventListener('click', () => _aoShowCatItems(btn.dataset.cat));
            });
        }
    } catch (_) {}
}

function _aoShowCatItems(cat) {
    const itemsEl = document.getElementById('ao-cat-items');
    const items = _aoQuickCategories[cat] || [];
    if (!itemsEl) return;
    itemsEl.style.display = 'flex';
    itemsEl.innerHTML = items.map((item, i) =>
        `<button type="button" class="ao-item-pill" data-i="${i}"
                  style="font-size:0.76rem;background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:5px 10px;cursor:pointer;font-family:inherit;">${item}</button>`
    ).join('');
    itemsEl.querySelectorAll('.ao-item-pill').forEach(btn => {
        btn.addEventListener('click', () => _aoAppendItem(items[parseInt(btn.dataset.i)]));
    });
}

function _aoAppendItem(item) {
    const ta = document.getElementById('ao-order-desc');
    if (!ta || !item) return;
    const cur = ta.value.trim();
    ta.value = cur ? `${cur}، ${item}` : item;
}

/* ── Store-catalog item picker ───────────────────────────────────
   Once an internal Delivo store is chosen above, this loads that
   store's real catalog (items/{companyname} — same data the "المنتجات"
   panel manages) and lets the admin build "وصف الطلب" by picking
   real items with quantities instead of typing blind, with an
   auto-computed subtotal that keeps "سعر الطلب" in sync (until the
   admin edits it manually). A "سطر وصف حر" button still allows a
   plain free-text line for anything not on the store's catalog. ── */

async function _aoLoadStoreCatalogAndTogglePicker() {
    const picker = document.getElementById('ao-item-picker');
    const sel = document.getElementById('ao-store-select');
    const storeName = sel?.value || '';

    if (_aoStoreMode !== 'internal' || !storeName) {
        if (picker) picker.style.display = 'none';
        _aoStoreCatalog = {};
        return;
    }

    if (picker) picker.style.display = '';
    const nameEl = document.getElementById('ao-item-picker-store-name');
    if (nameEl) nameEl.textContent = storeName;
    const searchInp = document.getElementById('ao-item-search');
    if (searchInp) searchInp.value = '';
    const resultsBox = document.getElementById('ao-item-search-results');
    if (resultsBox) resultsBox.style.display = 'none';
    const countEl = document.getElementById('ao-item-picker-count');
    if (countEl) countEl.textContent = '⏳ جارِ التحميل…';

    try {
        const raw = await fbGet(`items/${storeName}`);
        _aoStoreCatalog = raw || {};
    } catch (_) {
        _aoStoreCatalog = {};
    }

    const n = Object.values(_aoStoreCatalog).filter(Boolean).length;
    if (countEl) countEl.textContent = n
        ? `${n} صنف متاح`
        : 'لا توجد أصناف مسجّلة لهذا المتجر — استخدم «سطر وصف حر»';
}

function _aoSearchStoreItems(q) {
    const box = document.getElementById('ao-item-search-results');
    if (!box) return;
    q = (q || '').trim().toLowerCase();
    const items = Object.entries(_aoStoreCatalog || {}).filter(([, it]) => it && it.name);

    if (!items.length) { box.style.display = 'none'; return; }

    const matches = q ? items.filter(([, it]) => (it.name || '').toLowerCase().includes(q)) : items;

    if (!matches.length) {
        box.innerHTML = `<div style="padding:12px;text-align:center;color:var(--gray);font-size:0.78rem;">لا توجد أصناف مطابقة لـ «${_expEscHtml(q)}»</div>`;
        box.style.display = 'block';
        return;
    }

    box.innerHTML = matches.slice(0, 30).map(([id, it]) => {
        const price = it.price;
        const sale  = it.sale;
        const hasSale = parseFloat(sale) > 0 && parseFloat(sale) < parseFloat(price);
        const shown = hasSale ? sale : price;
        return `<div class="ao-item-result" data-id="${id}"
                     style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--surface3);">
            <div style="min-width:0;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_expEscHtml(it.name)}</div>
                <div style="font-size:0.65rem;color:var(--gray);">${_expEscHtml(it.catmain || '')}</div>
            </div>
            <div style="flex-shrink:0;font-size:0.76rem;font-weight:800;color:var(--orange);white-space:nowrap;">
                ${_catFmtPrice(shown)}${hasSale ? ` <span style="color:var(--gray);text-decoration:line-through;font-weight:400;">${_catFmtPrice(price)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
    box.style.display = 'block';

    box.querySelectorAll('.ao-item-result').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'var(--surface2)');
        el.addEventListener('mouseleave', () => el.style.background = '');
        el.addEventListener('click', () => {
            _aoAddItemLine(el.dataset.id);
            const inp = document.getElementById('ao-item-search');
            if (inp) inp.value = '';
            box.style.display = 'none';
        });
    });
}

function _aoAddItemLine(itemId) {
    const it = _aoStoreCatalog[itemId];
    if (!it) return;
    const existing = _aoOrderLines.find(l => l.type === 'item' && l.itemId === itemId);
    if (existing) {
        existing.qty += 1;
    } else {
        const hasSale = parseFloat(it.sale) > 0 && parseFloat(it.sale) < parseFloat(it.price);
        _aoOrderLines.push({
            id: ++_aoLineSeq, type: 'item', itemId,
            name: it.name, qty: 1,
            unitUSD: _toUSD(hasSale ? it.sale : it.price),
        });
    }
    _aoRenderOrderLines();
}

function _aoAddFreeLine() {
    _aoOrderLines.push({ id: ++_aoLineSeq, type: 'free', text: '' });
    _aoRenderOrderLines();
    const seq = _aoLineSeq;
    setTimeout(() => document.querySelector(`[data-free-input="${seq}"]`)?.focus(), 30);
}

function _aoRemoveLine(id) {
    _aoOrderLines = _aoOrderLines.filter(l => l.id !== id);
    _aoRenderOrderLines();
}

function _aoChangeQty(id, delta) {
    const l = _aoOrderLines.find(x => x.id === id);
    if (!l) return;
    l.qty = Math.max(1, (l.qty || 1) + delta);
    _aoRenderOrderLines();
}

function _aoUpdateFreeLineText(id, text) {
    const l = _aoOrderLines.find(x => x.id === id);
    if (!l) return;
    l.text = text;
    _aoRebuildDescFromLines(); // rebuild the description text only — a full row re-render would drop focus mid-typing
}

function _aoRenderOrderLines() {
    const wrap = document.getElementById('ao-order-lines');
    if (!wrap) return;

    if (!_aoOrderLines.length) {
        wrap.innerHTML = '';
    } else {
        wrap.innerHTML = _aoOrderLines.map(l => {
            if (l.type === 'item') {
                const lineTotal = l.unitUSD * l.qty;
                return `<div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;">
                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                        <button type="button" data-qty-btn="${l.id}" data-delta="-1" style="width:22px;height:22px;border-radius:6px;border:1px solid var(--border);background:var(--surface3);color:var(--white);cursor:pointer;font-weight:800;">－</button>
                        <span style="min-width:18px;text-align:center;font-family:var(--mono);font-size:0.8rem;">${l.qty}</span>
                        <button type="button" data-qty-btn="${l.id}" data-delta="1" style="width:22px;height:22px;border-radius:6px;border:1px solid var(--border);background:var(--surface3);color:var(--white);cursor:pointer;font-weight:800;">＋</button>
                    </div>
                    <div style="flex:1;min-width:0;font-size:0.8rem;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_expEscHtml(l.name)}</div>
                    <div style="flex-shrink:0;font-size:0.76rem;font-family:var(--mono);color:var(--green);">$${lineTotal.toFixed(2)}</div>
                    <button type="button" data-remove-line="${l.id}" title="إزالة" style="flex-shrink:0;background:none;border:none;color:var(--red);cursor:pointer;font-size:0.9rem;">🗑</button>
                </div>`;
            }
            return `<div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px dashed var(--border);border-radius:var(--radius-md);padding:6px 10px;">
                <span style="flex-shrink:0;font-size:0.9rem;">📝</span>
                <input type="text" data-free-input="${l.id}" value="${(l.text || '').replace(/"/g,'&quot;')}" placeholder="اكتب وصفاً حراً…"
                       style="flex:1;min-width:0;background:transparent;border:none;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.8rem;outline:none;">
                <button type="button" data-remove-line="${l.id}" title="إزالة" style="flex-shrink:0;background:none;border:none;color:var(--red);cursor:pointer;font-size:0.9rem;">🗑</button>
            </div>`;
        }).join('');

        wrap.querySelectorAll('[data-qty-btn]').forEach(btn => {
            btn.addEventListener('click', () => _aoChangeQty(parseInt(btn.dataset.qtyBtn), parseInt(btn.dataset.delta)));
        });
        wrap.querySelectorAll('[data-remove-line]').forEach(btn => {
            btn.addEventListener('click', () => _aoRemoveLine(parseInt(btn.dataset.removeLine)));
        });
        wrap.querySelectorAll('[data-free-input]').forEach(inp => {
            inp.addEventListener('input', () => _aoUpdateFreeLineText(parseInt(inp.dataset.freeInput), inp.value));
        });
    }

    _aoRebuildDescFromLines();
    _aoSyncPriceFromLines(false);
}

// Rebuilds "وصف الطلب" from the current line list — only once at least
// one line exists, so a store with no picked items still leaves the
// textarea fully free-typed exactly as before this feature existed.
function _aoRebuildDescFromLines() {
    const ta = document.getElementById('ao-order-desc');
    if (!ta || !_aoOrderLines.length) return;
    const parts = _aoOrderLines
        .map(l => l.type === 'item' ? `${l.qty}× ${l.name}` : (l.text || '').trim())
        .filter(Boolean);
    ta.value = parts.join('، ');
    _aoUpdateMissingWarnings();
}

function _aoSyncPriceFromLines(forced) {
    const hasItemLines = _aoOrderLines.some(l => l.type === 'item');
    const subtotal = _aoOrderLines.filter(l => l.type === 'item').reduce((s, l) => s + l.unitUSD * l.qty, 0);

    const subtotalEl = document.getElementById('ao-items-subtotal');
    if (subtotalEl) {
        if (hasItemLines) {
            subtotalEl.style.display = '';
            const b = subtotalEl.querySelector('b');
            if (b) b.textContent = '$' + subtotal.toFixed(2);
        } else {
            subtotalEl.style.display = 'none';
        }
    }

    if (hasItemLines && (_aoPriceAutoSynced || forced)) {
        const priceInp = document.getElementById('ao-order-price');
        if (priceInp) priceInp.value = subtotal > 0 ? subtotal.toFixed(2) : '';
        _aoPriceAutoSynced = true;
        _aoUpdateMissingWarnings();
    }
    _aoUpdateResyncHintVisibility();
}

function _aoUpdateResyncHintVisibility() {
    const hint = document.getElementById('ao-price-sync-hint');
    const btn  = document.getElementById('ao-resync-price-btn');
    const hasItemLines = _aoOrderLines.some(l => l.type === 'item');
    if (hint) hint.style.display = hasItemLines ? '' : 'none';
    if (btn)  btn.style.display  = (hasItemLines && !_aoPriceAutoSynced) ? '' : 'none';
}

function _aoResetOrderLines() {
    _aoOrderLines = [];
    _aoPriceAutoSynced = true;
    const wrap = document.getElementById('ao-order-lines');
    if (wrap) wrap.innerHTML = '';
    const subtotalEl = document.getElementById('ao-items-subtotal');
    if (subtotalEl) subtotalEl.style.display = 'none';
    const box = document.getElementById('ao-item-search-results');
    if (box) box.style.display = 'none';
    _aoUpdateResyncHintVisibility();
}

// ── "Notify store to arrange a driver" checkbox — only meaningful for
// an internal Delivo store once one is picked (see _aoSubmit for the
// actual WhatsApp send). ─────────────────────────────────────────
function _aoUpdateNotifyStoreVisibility() {
    const row = document.getElementById('ao-notify-store-row');
    if (!row) return;
    const sel = document.getElementById('ao-store-select');
    const show = _aoStoreMode === 'internal' && !!sel?.value;
    row.style.display = show ? 'flex' : 'none';
    if (!show) {
        const cb = document.getElementById('ao-notify-store-check');
        if (cb) cb.checked = false;
    }
}

// ── Delivery-fee auto-calculator — same formula & config
// (settings/smartDelivery) as regular checkout in cart.js, applied
// to this order's own store/destination pins, plus the same static
// night-delivery surcharge (settings/nightDelivery) regular checkout adds. ──
function _aoHaversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Same boundary-lookup as scripts/cart.js's _calcCenterTierFee — duplicated
// here since admin.html doesn't load cart.js as a script.
function _aoCalcCenterTierFee(distanceKm, centerTiers) {
    if (!centerTiers || !Array.isArray(centerTiers) || !centerTiers.length) return null;
    const sorted = [...centerTiers].sort((a, b) => parseFloat(a.fromKm||0) - parseFloat(b.fromKm||0));
    for (const t of sorted) {
        const from = parseFloat(t.fromKm) || 0;
        const to   = (t.toKm === null || t.toKm === '' || t.toKm === undefined) ? Infinity : parseFloat(t.toKm);
        if (distanceKm >= from && distanceKm < to) return parseFloat(t.fee) || 0;
    }
    return parseFloat(sorted[sorted.length - 1].fee) || 0;
}

// Same static night-window surcharge as regular checkout (scripts/cart.js's
// _calcNightSurcharge) — duplicated here since admin.html doesn't load
// cart.js as a script. Reuses _ndActiveAt/_ndBeirutHourFrac (night-delivery
// settings section above) and _toUSD (>1000 = ل.ل convention) so a
// phone/manual order placed at night carries the same night fee a normal
// customer order would. Returns the surcharge in USD.
async function _aoCalcNightSurchargeUSD(distanceKm) {
    if (_aoNightCfgCache === undefined) _aoNightCfgCache = await fbGet('settings/nightDelivery').catch(() => null);
    const cfg = _aoNightCfgCache;
    if (!cfg || !cfg.enabled) return 0;
    const startHour = parseFloat(cfg.startHour ?? 22);
    const endHour   = parseFloat(cfg.endHour   ?? 6);
    if (!_ndActiveAt(_ndBeirutHourFrac(), startHour, endHour)) return 0;
    const flatFeeUSD = _toUSD(parseFloat(cfg.flatFee ?? 90000));
    const perKmUSD   = _toUSD(parseFloat(cfg.perKm   ?? 0));
    return flatFeeUSD + perKmUSD * (distanceKm || 0);
}

// Same rounding convention as cart.js's _normalizeDeliveryFee — always
// expresses the result in ل.ل, rounded to the nearest 10,000, whether the
// input was USD-scale (<=1000) or already ل.ل-scale.
function _aoNormalizeFeeLBP(fee) {
    let n = parseFloat(fee);
    if (isNaN(n)) return 0;
    if (n <= 1000) n = n * (window._LBP_RATE || window._dollarRate || 90000);
    return Math.round(n / 10000) * 10000;
}

async function _aoAutoCalcFee() {
    if (!_aoDestLat) { toast('حدّد موقع التوصيل أولاً', true); return; }
    try {
        if (_aoSmartCfgCache === undefined) _aoSmartCfgCache = await fbGet('settings/smartDelivery').catch(() => null);
        const cfg  = _aoSmartCfgCache;
        const mode = cfg?.mode || 'formula';
        const input = document.getElementById('ao-delivery-fee');

        if (mode === 'centerTiers') {
            const center = await fbGet('settings/deliveryCenter').catch(() => null);
            if (!center || typeof center.lat !== 'number') { toast('⚠️ لم يُحدَّد موقع المركز بعد (الخريطة المباشرة)', true); return; }
            const km  = _aoHaversineKm(_aoDestLat, _aoDestLng, center.lat, center.lng);
            const tierFee = _aoCalcCenterTierFee(km, cfg.centerTiers);
            const baseFeeRaw = tierFee !== null ? tierFee : parseFloat(cfg?.baseFee ?? 1.5);
            const nightUSD = await _aoCalcNightSurchargeUSD(km);
            // Combine in USD regardless of which scale the base fee started in
            // (tier fees are ل.ل-scale, the baseFee fallback is USD-scale), then
            // always express the total in ل.ل, rounded to the nearest 10,000 —
            // same convention regular checkout uses everywhere.
            const fee = _aoNormalizeFeeLBP(_toUSD(baseFeeRaw) + nightUSD);
            if (input) input.value = String(fee);
            toast(`📍 المسافة من المركز ${km.toFixed(1)} كم — رسم الشريحة ${fee.toLocaleString('en-US')} ل.ل${nightUSD > 0 ? ' 🌙' : ''}`);
            return;
        }

        if (!_aoStoreLat) { toast('حدّد موقع المتجر وموقع التوصيل أولاً', true); return; }
        const baseFee   = parseFloat(cfg?.baseFee   ?? 1.5);
        const ratePerKm = parseFloat(cfg?.ratePerKm ?? 0.3);
        const minFee    = parseFloat(cfg?.minFee    ?? 0.5);
        const maxFee    = parseFloat(cfg?.maxFee    ?? 5.0);
        const km  = _aoHaversineKm(_aoStoreLat, _aoStoreLng, _aoDestLat, _aoDestLng);
        const baseFeeUSD = Math.min(maxFee, Math.max(minFee, baseFee + km * ratePerKm));
        const nightUSD = await _aoCalcNightSurchargeUSD(km);
        const fee = _aoNormalizeFeeLBP(baseFeeUSD + nightUSD);
        if (input) input.value = String(fee);
        toast(`🧮 المسافة ${km.toFixed(1)} كم — رسم مقترح ${fee.toLocaleString('en-US')} ل.ل${nightUSD > 0 ? ' 🌙' : ''}`);
    } catch (e) { toast('تعذّر الحساب التلقائي', true); }
}

// Shared core of the otlob auto-calc button above, factored out so an
// existing order card's own "🧮 تلقائي" button (_ocAutoCalcFee below) can
// reuse the exact same smart-delivery + night-surcharge math instead of a
// third copy of it. Returns { fee, distanceKm } (fee in ل.ل) or null when
// it can't be computed (missing destination, or missing store location
// in formula mode).
async function _calcAutoDeliveryFee(destLat, destLng, storeLat, storeLng) {
    if (destLat == null || destLng == null || isNaN(destLat) || isNaN(destLng)) return null;
    if (_aoSmartCfgCache === undefined) _aoSmartCfgCache = await fbGet('settings/smartDelivery').catch(() => null);
    const cfg  = _aoSmartCfgCache;
    const mode = cfg?.mode || 'formula';

    if (mode === 'centerTiers') {
        const center = await fbGet('settings/deliveryCenter').catch(() => null);
        if (!center || typeof center.lat !== 'number') return null;
        const km = _aoHaversineKm(destLat, destLng, center.lat, center.lng);
        const tierFee = _aoCalcCenterTierFee(km, cfg.centerTiers);
        const baseFeeRaw = tierFee !== null ? tierFee : parseFloat(cfg?.baseFee ?? 1.5);
        const nightUSD = await _aoCalcNightSurchargeUSD(km);
        return { fee: _aoNormalizeFeeLBP(_toUSD(baseFeeRaw) + nightUSD), distanceKm: km };
    }

    if (storeLat == null || storeLng == null || isNaN(storeLat) || isNaN(storeLng)) return null;
    const baseFee   = parseFloat(cfg?.baseFee   ?? 1.5);
    const ratePerKm = parseFloat(cfg?.ratePerKm ?? 0.3);
    const minFee    = parseFloat(cfg?.minFee    ?? 0.5);
    const maxFee    = parseFloat(cfg?.maxFee    ?? 5.0);
    const km = _aoHaversineKm(storeLat, storeLng, destLat, destLng);
    const baseFeeUSD = Math.min(maxFee, Math.max(minFee, baseFee + km * ratePerKm));
    const nightUSD = await _aoCalcNightSurchargeUSD(km);
    return { fee: _aoNormalizeFeeLBP(baseFeeUSD + nightUSD), distanceKm: km };
}

// ── Submit ───────────────────────────────────────────────────
function _aoErr(msg) {
    const errEl = document.getElementById('ao-error');
    if (errEl) { errEl.textContent = '⚠️ ' + msg; errEl.style.display = 'block'; }
    const okEl = document.getElementById('ao-success');
    if (okEl) okEl.style.display = 'none';
}

async function _aoSubmit() {
    const errEl = document.getElementById('ao-error');
    const okEl  = document.getElementById('ao-success');
    if (errEl) errEl.style.display = 'none';
    if (okEl)  okEl.style.display  = 'none';

    // ── Resolve customer ── the merged "اطلب" flow: a registered account
    // picked from the search results always wins; otherwise this is a
    // guest/new-customer order using whatever is in the merged phone+name
    // fields. Phone is the only thing that blocks submission — every other
    // field here gets a sensible placeholder instead of an error, since
    // whoever's typing this in is often rushing through it on a call. ──
    let fullname = '', phone = '', username = '', uid = '';
    if (_aoSelectedCust) {
        ({ fullname, phone, username, uid } = _aoSelectedCust);
    } else {
        phone    = document.getElementById('ao-cust-phone')?.value.trim() || '';
        fullname = document.getElementById('ao-cust-name')?.value.trim()  || 'زبون';
        if (!phone) return _aoErr('أدخل رقم هاتف العميل');
    }

    // ── Resolve store ── no store picked/typed simply lands the order as
    // "غير محدد" rather than blocking submission.
    const isExternal = _aoStoreMode === 'external';
    let storeName = '', storeAddress = '', storePhone = '';
    if (isExternal) {
        storeName    = document.getElementById('ao-ext-store-name')?.value.trim() || 'غير محدد';
        storeAddress = document.getElementById('ao-ext-store-addr')?.value.trim()  || '';
        storePhone   = document.getElementById('ao-ext-store-phone')?.value.trim() || '';
    } else {
        storeName = document.getElementById('ao-store-select')?.value || 'غير محدد';
    }

    const orderDesc = document.getElementById('ao-order-desc')?.value.trim() || 'طلب';

    const orderPriceRaw = parseFloat(document.getElementById('ao-order-price')?.value) || 0;
    // Same >1000-is-LBP convention used everywhere else (see _toUSD) — without
    // this, a Lebanese-Lira price typed here (e.g. 1,500,000 ل.ل) was being
    // added straight into the USD total instead of being converted first.
    const orderPriceUSD = _toUSD(orderPriceRaw);

    const feeRaw = document.getElementById('ao-delivery-fee')?.value.trim();
    const feeVal = feeRaw ? _normalizeMoneyValue(feeRaw) : '';

    const city   = document.getElementById('ao-dest-city')?.value.trim()   || 'Baalbeck';
    const street = document.getElementById('ao-dest-street')?.value.trim() || '';
    const note   = document.getElementById('ao-note')?.value.trim() || '';
    const driver = document.getElementById('ao-driver-select')?.value || '0';
    const customDate = document.getElementById('ao-order-date')?.value || '';   // "YYYY-MM-DD"
    const customTime = document.getElementById('ao-order-time')?.value || '';   // "HH:MM" or "HH:MM:SS"

    // order.total is stored merged (order + delivery, USD) everywhere
    // else in the app — keep this order consistent with that model.
    const deliveryUSD  = feeVal ? _deliveryFeeToUSD(feeVal) : 0;
    const totalMerged  = (orderPriceUSD + deliveryUSD).toFixed(2);

    const submitBtn = document.getElementById('ao-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ جاري الإنشاء…'; }

    try {
        // Reserve the order id atomically via the allocateOrderId Cloud
        // Function (see functions/allocateorderid.js) instead of reading
        // globalCounter and writing it back here — that old pattern could
        // race with a customer checking out (cart.js) or the external-order
        // flow at the same moment, and silently fell back to id 1 if the
        // read ever came back empty.
        const idResp = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/allocateOrderId', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ count: 1 }),
        });
        if (!idResp.ok) throw new Error('تعذّر حجز رقم الطلب');
        const idData    = await idResp.json();
        const nextId     = idData.firstId;
        const requestKey = `id_${nextId}`;
        const now        = new Date();
        // Admin can optionally backdate this order (e.g. to record one
        // placed by phone/WhatsApp before this tool existed) — if either
        // field is left blank, this falls back to right now exactly like
        // before. Match the exact format cart.js writes at checkout
        // (Y-M-D H:MM:SS, no zero-padding) — this order type previously
        // used en-GB DD/MM/YYYY, which the admin date filter couldn't
        // parse and silently dropped these orders from any non-"all"
        // date range.
        let dateStr;
        if (customDate) {
            const [cy, cm, cd] = customDate.split('-').map(Number);
            const [ch, cmi, cs] = (customTime || '00:00:00').split(':').map(Number);
            dateStr = `${cy}-${cm}-${cd} ${ch||0}:${cmi||0}:${cs||0}`;
        } else {
            dateStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
        }

        const requestObj = {
            cart          : `1:${orderDesc}:0:${storeName}:`,
            city, street,
            date          : dateStr,
            delivryplusid : uid || '',
            deliveryFee   : feeVal || '',
            driver        : driver || '0',
            rewardApplied : '',
            fullname, phone,
            lat           : _aoDestLat ? String(_aoDestLat) : '',
            lng           : _aoDestLng ? String(_aoDestLng) : '',
            read          : '0',
            state         : '0',
            store         : storeName,
            total         : totalMerged,
            orderprice    : orderPriceUSD.toFixed(2),
            trackorder    : '0',
            username      : username || '',
            vault         : '0',
            placedByAdmin : (currentAdmin && (currentAdmin.username || currentAdmin.fullname)) || '1',
            ...(note ? { xnote: note } : {}),
            ...(isExternal ? {
                externalOrder : '1',
                storeAddress  : storeAddress,
                storeLat      : _aoStoreLat ? String(_aoStoreLat) : '',
                storeLng      : _aoStoreLng ? String(_aoStoreLng) : '',
                storePhone    : storePhone,
            } : {}),
        };

        await fbSet(`requests/${requestKey}`, requestObj);
        if (uid) await fbSet(`historyRequests/${uid}/${requestKey}`, { ...requestObj, trackorder: '0' });

        // This is the actual gap for this page: when a driver is picked
        // directly in this "اطلب" form (ao-driver-select), the order is
        // created already-assigned — there's no separate "assign driver"
        // click afterwards, so notifyDriverAssigned() (defined in
        // admin-10-company-portal-requests.js) never used to fire for
        // this path at all. Only orders assigned a driver AFTER creation,
        // from the online-requests/Talabat panels, ever got a message.
        if (driver && driver !== '0' && typeof notifyDriverAssigned === 'function') {
            const driverObj = (allDrivers || []).find(d => d && (d.owner === driver || d.username === driver));
            notifyDriverAssigned(requestKey, driver, driverObj, requestObj); // fire-and-forget
        }

        // Guest (no account): upsert their entry in guestCustomers/ so a
        // future search by this same phone number finds them again.
        if (!_aoSelectedCust) {
            const result = _aoUpsertGuestCustomer(phone, fullname, {
                reqKey: requestKey, date: dateStr, store: storeName, total: totalMerged,
                city, street, lat: _aoDestLat, lng: _aoDestLng,
            });
            if (result) fbUpdate(`guestCustomers/${result.key}`, result.rec).catch(() => {});
        }

        // Opt-in: ping the store directly with the full order details so it
        // can arrange its own driver — separate from (and more detailed
        // than) the automatic generic "new order" WhatsApp every order
        // already triggers server-side (functions/notifyneworders.js),
        // which only links back to the dashboard with no specifics in it.
        if (!isExternal && document.getElementById('ao-notify-store-check')?.checked) {
            const storeRec = allStores?.[storeName];
            if (storeRec && storeRec.whatsapp) {
                const notifyMsg =
                    `🔔 طلب جديد رقم #${nextId} على Delivo\n` +
                    `🧾 تفاصيل الطلب:\n${orderDesc}\n` +
                    `💵 سعر الطلب: $${orderPriceUSD.toFixed(2)}`;
                _sendWhatsappMessage(storeRec.whatsapp, notifyMsg)
                    .then(() => toast('📣 تم إرسال تفاصيل الطلب إلى المتجر عبر واتساب'))
                    .catch(e => toast('⚠️ تعذّر إرسال الطلب إلى المتجر: ' + e.message, true));
            } else {
                toast('⚠️ لا يوجد رقم واتساب مفعّل لهذا المتجر — لم يتم إرسال تفاصيل الطلب', true);
            }
        }

        toast(`✅ تم إنشاء الطلب #${nextId}`);
        if (okEl) { okEl.style.display = 'block'; okEl.textContent = `✅ تم إنشاء الطلب #${nextId} بنجاح`; }
        _aoResetForm();
        await loadAllData();
        renderOrders(); renderOnlineRequests();
    } catch (e) {
        _aoErr('فشل إنشاء الطلب: ' + e.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🚀 إنشاء الطلب'; }
    }
}

function _aoResetForm() {
    ['ao-cust-phone','ao-cust-name','ao-ext-store-name','ao-ext-store-phone','ao-ext-store-addr',
     'ao-order-desc','ao-order-price','ao-delivery-fee'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const storeSel  = document.getElementById('ao-store-select');
    const driverSel = document.getElementById('ao-driver-select');
    if (storeSel)  storeSel.value  = '';
    if (driverSel) driverSel.value = '';
    const catItems = document.getElementById('ao-cat-items');
    if (catItems) catItems.style.display = 'none';
    aoClearSelectedCustomer();
    _aoSelectedGuestKey = null;
    _aoHideGuestKnownHint();
    _aoDestLat = _aoDestLng = _aoStoreLat = _aoStoreLng = null;
    _aoUpdateCoordBadge('dest'); _aoUpdateCoordBadge('store');
    const cityInp = document.getElementById('ao-dest-city');
    if (cityInp) cityInp.value = 'Baalbeck';
    const quickSel = document.getElementById('ao-ext-quickselect');
    if (quickSel) quickSel.value = '';
    // Store-catalog item picker + notify-store checkbox
    _aoStoreCatalog = {};
    _aoResetOrderLines();
    const picker = document.getElementById('ao-item-picker');
    if (picker) picker.style.display = 'none';
    const notifyCb = document.getElementById('ao-notify-store-check');
    if (notifyCb) notifyCb.checked = false;
    _aoUpdateNotifyStoreVisibility();
    _aoUpdateMissingWarnings();
}

// ── admin-order integration: quick-pick from active external stores ──
async function _aoPopulateExtQuickSelect() {
    allExtStores = await fbGet('externalStores').catch(() => null) || allExtStores || {};
    const wrap = document.getElementById('ao-ext-quickselect-wrap');
    const sel  = document.getElementById('ao-ext-quickselect');
    if (!sel || !wrap) return;
    const actives = Object.entries(allExtStores).filter(([, s]) => s && s.active);
    if (!actives.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    sel.innerHTML = '<option value="">— أدخل متجراً جديداً يدوياً —</option>' +
        actives.map(([key, s]) => `<option value="${key}">${esTypeInfo(s.type).emoji} ${s.name}</option>`).join('');
}

function _aoOnExtQuickSelect(key) {
    if (!key) return;
    const s = allExtStores?.[key];
    if (!s) return;
    const nameInp  = document.getElementById('ao-ext-store-name');
    const phoneInp = document.getElementById('ao-ext-store-phone');
    const addrInp  = document.getElementById('ao-ext-store-addr');
    if (nameInp)  nameInp.value  = s.name || '';
    if (phoneInp) phoneInp.value = s.phone || '';
    if (addrInp)  addrInp.value  = s.address || '';
    if (s.lat && s.lng) {
        _aoStoreLat = parseFloat(s.lat); _aoStoreLng = parseFloat(s.lng);
        _aoUpdateCoordBadge('store');
    }
}

/* ════════════════════════════════════════════════════════════
   EXTERNAL STORES — "متاجر خارجية"
   Firebase RTDB path: externalStores/{key} →
     { name, type, phone, address, lat, lng, active, notes,
       createdAt, updatedAt }
   These are stores with no contract/catalog on Delivo. The
   "active" switch is the single source of truth both "اطلب" flows
   check before offering a store as a quick-pick option: the
   admin's own "اطلب" tool (ao-ext-quickselect above) and the
   customer-facing "اطلب خارجي" form on the index page
   (scripts/external-order.js, fetched read-only from there).
════════════════════════════════════════════════════════════ */
const EXT_STORE_TYPES = [
    { key:'restaurant',   label:'مطعم',        emoji:'🍔' },
    { key:'butcher',      label:'ملحمة',        emoji:'🥩' },
    { key:'bakery',       label:'مخبز',         emoji:'🥖' },
    { key:'market',       label:'سوبرماركت',    emoji:'🛒' },
    { key:'grocery',      label:'بقالة',        emoji:'🧺' },
    { key:'sweets',       label:'حلويات',       emoji:'🍰' },
    { key:'fish',         label:'أسماك',        emoji:'🐟' },
    { key:'coffee',       label:'قهوة',         emoji:'☕' },
    { key:'chicken',      label:'دجاج',         emoji:'🍗' },
    { key:'dairy',        label:'ألبان',        emoji:'🥛' },
    { key:'flowers',      label:'زهور',         emoji:'💐' },
    { key:'pharmacy',     label:'صيدلية',       emoji:'💊' },
    { key:'clothing',     label:'ملابس',        emoji:'👕' },
    { key:'electronics',  label:'إلكترونيات',   emoji:'🔌' },
    { key:'other',        label:'أخرى',         emoji:'🏬' },
];
function esTypeInfo(key) { return EXT_STORE_TYPES.find(t => t.key === key) || EXT_STORE_TYPES[EXT_STORE_TYPES.length - 1]; }

/* ── Daily auto open/close hours (same logic used on the customer
   side — scripts/stores.js, categories.js, store-panel.js). Store
   record may carry autoHours: { enabled, open:"HH:MM", close:"HH:MM" }.
   Used here just to show admins a live "within hours now?" hint next
   to the schedule fields — the actual enforcement happens client-side
   for customers. Handles overnight windows correctly. */
function _autoHoursClosedInfo(autoHours) {
    if (!autoHours || !autoHours.enabled || !autoHours.open || !autoHours.close) return null;
    const [oh, om] = autoHours.open.split(':').map(Number);
    const [ch, cm] = autoHours.close.split(':').map(Number);
    if ([oh, om, ch, cm].some(n => isNaN(n))) return null;

    const now      = new Date();
    const curMin   = now.getHours() * 60 + now.getMinutes();
    const openMin  = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    if (openMin === closeMin) return null; // identical times = open 24h

    const within = openMin < closeMin
        ? (curMin >= openMin && curMin < closeMin)
        : (curMin >= openMin || curMin < closeMin); // overnight window wraps past midnight

    if (within) return null;
    return { reason: 'خارج أوقات الدوام' };
}

let _esFilter      = 'all'; // all | active | inactive
let _esTypeFilter  = '';
let _esSearch      = '';
let _esView        = 'list'; // list | map
let _esMap         = null;
let _esMarkers     = {};
let _esInitialized = false;

async function renderExtStores() {
    _esInitOnce();
    await _esLoad();
    _esRenderTypeFilterOptions();
    _esRenderList();
    if (_esView === 'map') _esRenderMap();
}

function _esInitOnce() {
    if (_esInitialized) return;
    _esInitialized = true;

    document.getElementById('es-add-btn')?.addEventListener('click', () => _esOpenEditor(null));
    document.getElementById('es-refresh-btn')?.addEventListener('click', () => renderExtStores());
    document.getElementById('es-search')?.addEventListener('input', e => {
        _esSearch = e.target.value.trim().toLowerCase();
        _esRenderList();
        if (_esView === 'map') _esRenderMap();
    });
    document.getElementById('es-type-filter')?.addEventListener('change', e => {
        _esTypeFilter = e.target.value;
        _esRenderList();
        if (_esView === 'map') _esRenderMap();
    });

    document.querySelectorAll('[data-es-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-es-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _esFilter = btn.dataset.esFilter;
            _esRenderList();
            if (_esView === 'map') _esRenderMap();
        });
    });

    document.getElementById('es-view-list')?.addEventListener('click', () => _esSwitchView('list'));
    document.getElementById('es-view-map')?.addEventListener('click', () => _esSwitchView('map'));
}

function _esSwitchView(view) {
    _esView = view;
    document.getElementById('es-view-list')?.classList.toggle('active', view === 'list');
    document.getElementById('es-view-map')?.classList.toggle('active', view === 'map');
    const listEl = document.getElementById('es-list-view');
    const mapEl  = document.getElementById('es-map-view');
    if (listEl) listEl.style.display = view === 'list' ? '' : 'none';
    if (mapEl)  mapEl.style.display  = view === 'map'  ? 'flex' : 'none';
    if (view === 'map') {
        _esRenderMap();
        setTimeout(() => _esMap && _esMap.invalidateSize(), 100);
    }
}

async function _esLoad() {
    allExtStores = await fbGet('externalStores').catch(() => null) || {};
}

function _esRenderTypeFilterOptions() {
    const sel = document.getElementById('es-type-filter');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">كل الأنواع</option>' +
        EXT_STORE_TYPES.map(t => `<option value="${t.key}">${t.emoji} ${t.label}</option>`).join('');
    sel.value = current;
}

function _esFilteredEntries() {
    return Object.entries(allExtStores || {}).filter(([, s]) => {
        if (!s) return false;
        if (_esFilter === 'active'   && !s.active) return false;
        if (_esFilter === 'inactive' && s.active)  return false;
        if (_esTypeFilter && s.type !== _esTypeFilter) return false;
        if (_esSearch) {
            const q = _esSearch;
            if (!(s.name || '').toLowerCase().includes(q) && !(s.address || '').toLowerCase().includes(q)) return false;
        }
        return true;
    }).sort(([,a],[,b]) => (b.createdAt || 0) - (a.createdAt || 0));
}

function _esRenderList() {
    const wrap    = document.getElementById('es-list-view');
    const emptyEl = document.getElementById('es-empty');
    const countEl = document.getElementById('es-count-label');
    if (!wrap) return;

    const entries = _esFilteredEntries();
    if (countEl) countEl.textContent = `${entries.length} متجر`;

    wrap.querySelectorAll('.es-card').forEach(c => c.remove());
    if (emptyEl) emptyEl.style.display = entries.length ? 'none' : 'flex';

    entries.forEach(([key, s]) => {
        const t = esTypeInfo(s.type);
        const card = document.createElement('div');
        card.className = 'es-card';
        card.style.cssText = 'background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;';
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:10px;background:rgba(255,92,0,0.12);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${t.emoji}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || '—'}</div>
                    <div style="font-size:0.72rem;color:var(--gray);">${t.label}</div>
                </div>
                <label class="toggle" style="transform:scale(0.8);flex-shrink:0;" title="${s.active ? 'مفعّل — يظهر في اطلب' : 'غير مفعّل'}">
                    <input type="checkbox" class="es-active-toggle" data-key="${key}" ${s.active ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div style="font-size:0.76rem;color:var(--gray);">📍 ${s.address || '—'}</div>
            ${s.phone ? `<div style="font-size:0.76rem;color:var(--gray);" dir="ltr">📞 ${formatPhone(s.phone)}</div>` : ''}
            ${(s.lat && s.lng) ? `<div style="font-size:0.68rem;color:var(--orange);font-family:var(--mono);">📌 ${parseFloat(s.lat).toFixed(5)}, ${parseFloat(s.lng).toFixed(5)}</div>` : `<div style="font-size:0.68rem;color:var(--red);">⚠ لا يوجد موقع محدد</div>`}
            ${s.autoHours?.enabled ? `<div style="font-size:0.68rem;color:var(--gray);">⏰ ${s.autoHours.open}–${s.autoHours.close} ${
                _autoHoursClosedInfo(s.autoHours)
                    ? '<span style="color:#ef4444;font-weight:800;">🔴 خارج الدوام الآن</span>'
                    : '<span style="color:#22c55e;font-weight:800;">🟢 ضمن الدوام الآن</span>'
            }</div>` : ''}
            <div style="display:flex;gap:8px;margin-top:4px;">
                <button class="oc-action-btn es-edit-btn" data-key="${key}" style="flex:1;">✏️ تعديل</button>
                <button class="oc-action-btn es-del-btn" data-key="${key}" style="flex:1;color:var(--red);border-color:rgba(239,68,68,0.35);">🗑 حذف</button>
            </div>`;
        wrap.appendChild(card);
    });

    wrap.querySelectorAll('.es-active-toggle').forEach(cb => {
        cb.addEventListener('change', () => _esToggleActive(cb.dataset.key, cb.checked));
    });
    wrap.querySelectorAll('.es-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => _esOpenEditor(btn.dataset.key));
    });
    wrap.querySelectorAll('.es-del-btn').forEach(btn => {
        btn.addEventListener('click', () => _esDelete(btn.dataset.key));
    });
}

async function _esToggleActive(key, active) {
    try {
        await fbSet(`externalStores/${key}/active`, active);
        if (allExtStores[key]) allExtStores[key].active = active;
        toast(active ? '✅ تم تفعيل المتجر' : '⏸ تم إيقاف المتجر');
    } catch (e) {
        toast('فشل التحديث', true);
        _esRenderList();
    }
}

async function _esDelete(key) {
    const s = allExtStores[key];
    if (!confirm(`حذف "${s?.name || 'هذا المتجر'}" نهائياً؟`)) return;
    try {
        await fbSet(`externalStores/${key}`, null);
        delete allExtStores[key];
        toast('🗑 تم حذف المتجر');
        _esRenderList();
        if (_esView === 'map') _esRenderMap();
    } catch (e) { toast('فشل الحذف', true); }
}

// ── Map view ─────────────────────────────────────────────────
function _esRenderMap() {
    const container = document.getElementById('es-map');
    if (!container || typeof L === 'undefined') return;

    if (!_esMap) {
        _esMap = L.map('es-map', { zoomControl: true }).setView([34.003, 36.212], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(_esMap);
    }

    Object.values(_esMarkers).forEach(m => _esMap.removeLayer(m));
    _esMarkers = {};

    const entries = _esFilteredEntries().filter(([, s]) => s.lat && s.lng);
    entries.forEach(([key, s]) => {
        const t = esTypeInfo(s.type);
        const icon = L.divIcon({
            className: '',
            html: `<div style="width:30px;height:30px;background:${s.active ? '#FF5C00' : '#6b6b82'};border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
                       <span style="transform:rotate(45deg);font-size:13px;">${t.emoji}</span>
                   </div>`,
            iconSize: [30, 30], iconAnchor: [15, 30],
        });
        const marker = L.marker([parseFloat(s.lat), parseFloat(s.lng)], { icon }).addTo(_esMap);
        marker.bindPopup(`
            <div style="font-family:'Almarai',sans-serif;direction:rtl;min-width:160px;">
                <div style="font-weight:800;margin-bottom:4px;">${t.emoji} ${s.name || '—'}</div>
                <div style="font-size:0.78rem;color:#555;margin-bottom:6px;">${s.address || '—'}</div>
                <div style="font-size:0.75rem;color:${s.active ? '#22c55e' : '#ef4444'};font-weight:700;">${s.active ? '🟢 مفعّل' : '⚫ غير مفعّل'}</div>
            </div>`);
        _esMarkers[key] = marker;
    });

    if (entries.length) {
        const bounds = L.latLngBounds(entries.map(([, s]) => [parseFloat(s.lat), parseFloat(s.lng)]));
        _esMap.fitBounds(bounds.pad(0.2));
    }
}

// ── Add / Edit modal ─────────────────────────────────────────
function _esOpenEditor(key) {
    const isEdit = !!key;
    const s = isEdit ? allExtStores[key] : null;

    const overlay = document.createElement('div');
    overlay.id = 'es-editor-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:18px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);">
                <div style="font-weight:800;font-size:1rem;color:var(--white);">${isEdit ? '✏️ تعديل متجر خارجي' : '➕ إضافة متجر خارجي'}</div>
                <button id="es-ed-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">
                <div>
                    <label class="setting-label" style="display:block;margin-bottom:5px;">اسم المتجر *</label>
                    <input type="text" id="es-ed-name" value="${(s?.name || '').replace(/"/g,'&quot;')}"
                           style="width:100%;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.85rem;outline:none;box-sizing:border-box;">
                </div>
                <div>
                    <label class="setting-label" style="display:block;margin-bottom:5px;">نوع المتجر *</label>
                    <select id="es-ed-type" style="width:100%;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.85rem;outline:none;box-sizing:border-box;">
                        ${EXT_STORE_TYPES.map(t => `<option value="${t.key}" ${s?.type === t.key ? 'selected' : ''}>${t.emoji} ${t.label}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="setting-label" style="display:block;margin-bottom:5px;">هاتف المتجر</label>
                    <input type="tel" dir="ltr" id="es-ed-phone" value="${(s?.phone || '').replace(/"/g,'&quot;')}"
                           style="width:100%;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;box-sizing:border-box;">
                </div>
                <div>
                    <label class="setting-label" style="display:block;margin-bottom:5px;">العنوان</label>
                    <input type="text" id="es-ed-addr" value="${(s?.address || '').replace(/"/g,'&quot;')}"
                           style="width:100%;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.85rem;outline:none;box-sizing:border-box;">
                </div>
                <button type="button" id="es-ed-map-btn"
                        style="align-self:flex-start;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 14px;color:var(--white);font-family:inherit;font-size:0.8rem;font-weight:700;cursor:pointer;">📍 تحديد الموقع على الخريطة</button>
                <div id="es-ed-coord-badge" style="display:${s?.lat ? 'block' : 'none'};font-size:0.72rem;color:var(--orange);font-family:var(--mono);">${s?.lat ? `📌 ${parseFloat(s.lat).toFixed(5)}, ${parseFloat(s.lng).toFixed(5)}` : ''}</div>
                <div>
                    <label class="setting-label" style="display:block;margin-bottom:5px;">ملاحظات (اختياري)</label>
                    <input type="text" id="es-ed-notes" value="${(s?.notes || '').replace(/"/g,'&quot;')}"
                           style="width:100%;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.85rem;outline:none;box-sizing:border-box;">
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <label class="toggle">
                        <input type="checkbox" id="es-ed-active" ${(s ? s.active : true) ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="setting-label" style="margin:0;">مفعّل — يظهر كخيار سريع في "اطلب"</div>
                </div>
                <div style="border-top:1px solid var(--border);padding-top:12px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <label class="toggle">
                            <input type="checkbox" id="es-ed-hours-enabled" ${s?.autoHours?.enabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <div class="setting-label" style="margin:0;">⏰ دوام تلقائي يومي (فتح/إغلاق حسب الوقت)</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <input type="time" id="es-ed-hours-open" value="${s?.autoHours?.open || '09:00'}"
                               style="flex:1;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;">
                        <span class="setting-label" style="margin:0;">إلى</span>
                        <input type="time" id="es-ed-hours-close" value="${s?.autoHours?.close || '23:00'}"
                               style="flex:1;background:var(--surface3,#1a1a2a);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:8px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;">
                    </div>
                </div>
                <div id="es-ed-err" style="display:none;color:var(--red);font-size:0.8rem;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:8px 12px;"></div>
            </div>
            <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);">
                <button id="es-ed-cancel" style="flex:1;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:10px;padding:10px;color:var(--white);font-family:inherit;cursor:pointer;">إلغاء</button>
                <button id="es-ed-save" style="flex:2;background:var(--orange);border:none;border-radius:10px;padding:10px;color:#fff;font-family:inherit;font-weight:800;cursor:pointer;">💾 ${isEdit ? 'حفظ التعديلات' : 'إضافة المتجر'}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    let pickedLat = s?.lat ? parseFloat(s.lat) : null;
    let pickedLng = s?.lng ? parseFloat(s.lng) : null;

    const close = () => overlay.remove();
    overlay.querySelector('#es-ed-close').addEventListener('click', close);
    overlay.querySelector('#es-ed-cancel').addEventListener('click', close);
    overlay.querySelector('#es-ed-map-btn').addEventListener('click', () => {
        _openGenericMapPicker({
            title: '📍 تحديد موقع المتجر الخارجي',
            initLat: pickedLat, initLng: pickedLng,
            onSave: (lat, lng) => {
                pickedLat = lat; pickedLng = lng;
                const badge = overlay.querySelector('#es-ed-coord-badge');
                if (badge) { badge.style.display = 'block'; badge.textContent = `📌 ${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
            },
        });
    });

    overlay.querySelector('#es-ed-save').addEventListener('click', async () => {
        const name   = overlay.querySelector('#es-ed-name').value.trim();
        const type   = overlay.querySelector('#es-ed-type').value;
        const phone  = overlay.querySelector('#es-ed-phone').value.trim();
        const addr   = overlay.querySelector('#es-ed-addr').value.trim();
        const notes  = overlay.querySelector('#es-ed-notes').value.trim();
        const active = overlay.querySelector('#es-ed-active').checked;
        const hoursEnabled = overlay.querySelector('#es-ed-hours-enabled').checked;
        const hoursOpen    = overlay.querySelector('#es-ed-hours-open').value || '09:00';
        const hoursClose   = overlay.querySelector('#es-ed-hours-close').value || '23:00';
        const errEl  = overlay.querySelector('#es-ed-err');

        if (!name) { errEl.textContent = '⚠️ أدخل اسم المتجر'; errEl.style.display = 'block'; return; }
        if (!addr && !pickedLat) { errEl.textContent = '⚠️ أدخل عنوان المتجر أو حدده على الخريطة'; errEl.style.display = 'block'; return; }

        const saveBtn = overlay.querySelector('#es-ed-save');
        saveBtn.disabled = true; saveBtn.textContent = '⏳ جارٍ الحفظ…';

        const payload = {
            name, type, phone, address: addr, notes,
            lat: pickedLat ? String(pickedLat) : '',
            lng: pickedLng ? String(pickedLng) : '',
            active,
            autoHours: { enabled: hoursEnabled, open: hoursOpen, close: hoursClose },
            createdAt: s?.createdAt || Date.now(),
            updatedAt: Date.now(),
        };

        try {
            const useKey = key || `ext_${Date.now()}`;
            await fbSet(`externalStores/${useKey}`, payload);
            allExtStores[useKey] = payload;
            toast(isEdit ? '💾 تم تحديث المتجر' : '✅ تمت إضافة المتجر');
            close();
            _esRenderList();
            if (_esView === 'map') _esRenderMap();
        } catch (e) {
            errEl.textContent = '❌ فشل الحفظ: ' + e.message;
            errEl.style.display = 'block';
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? '💾 حفظ التعديلات' : '💾 إضافة المتجر';
        }
    });
}