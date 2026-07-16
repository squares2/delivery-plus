/* ============================================================
   scripts/quick-menu.js  v1
   Fast graphical price-list side drawer for the currently open
   store. Reuses the category tree already loaded by
   scripts/store-panel.js (window._spTree / _spStoreName) — no
   extra network fetch needed. Categories are pinned as page-link
   tabs at the bottom; swipe or tap to switch between them.
   ============================================================ */

let _qmMains  = [];
let _qmActive = 0;

function _qmTypeEmoji(t) {
    const map = {
        Restaurants: '🍽️', BakeryShops: '🥖', ButcherShops: '🥩',
        CoffeeShops: '☕', Markets: '🛒', SweetsShops: '🍰', FishShops: '🐟',
    };
    return map[t] || '🏪';
}

function _qmRenderRow(item, storeName) {
    const id       = item.ID || item.id || '';
    const name     = item.name || '';
    const price    = parseFloat(item.price) || 0;
    const sale     = parseFloat(item.sale)  || 0;
    const hasSale  = sale > 0 && sale < price;
    const dispPrice= hasSale ? sale : price;
    const pngExist = item.pngExist === '1' || item.pngExist === 1;
    const imgUrl   = pngExist ? `${typeof GH_IMAGES !== 'undefined' ? GH_IMAGES : './items2'}/${String(id).toLowerCase()}.webp` : '';
    const uniqueId = `${storeName}__${id}`;
    const sType    = window._currentStore ? window._currentStore.type : '';
    const emoji    = _qmTypeEmoji(item.companytype);

    return `
    <div class="qm-row">
        <div class="qm-row__img">
            ${pngExist
                ? `<img src="${imgUrl}" alt="${name}" loading="lazy"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                   <div class="qm-row__img-fallback" style="display:none">${emoji}</div>`
                : `<div class="qm-row__img-fallback">${emoji}</div>`
            }
        </div>
        <div class="qm-row__info">
            <div class="qm-row__name">${name}</div>
            ${item.catar ? `<div class="qm-row__sub">${item.catar}</div>` : ''}
        </div>
        <div class="qm-row__price-wrap">
            <span class="qm-row__price">${typeof formatPrice === 'function' ? formatPrice(dispPrice) : dispPrice}</span>
            ${hasSale ? `<span class="qm-row__price-old">${typeof formatPrice === 'function' ? formatPrice(price) : price}</span>` : ''}
        </div>
        <button class="qm-row__add" aria-label="أضف للسلة"
                onclick="_qmQuickAdd(this,'${uniqueId}','${name.replace(/'/g,"\\'")}',${dispPrice},'${storeName.replace(/'/g,"\\'")}','${sType}','${imgUrl}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </button>
    </div>`;
}

function _qmQuickAdd(btn, uniqueId, name, price, storeName, storeType, imgUrl) {
    if (window.spAddItem) {
        window.spAddItem(uniqueId, name, price, storeName, storeType, null, imgUrl);
    } else if (window.DelivoCart) {
        window.DelivoCart.addItem(uniqueId, name, price, storeName, storeType, '', imgUrl);
        if (window.renderCartSidebar) window.renderCartSidebar();
    }
    if (!btn) return;
    btn.classList.add('qm-row__add--done');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
        btn.classList.remove('qm-row__add--done');
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    }, 700);
    if (window.updateSpCartBar) window.updateSpCartBar();
}

function _qmCatIcon(main, i) {
    const icons = ['🍽️','🥤','🍰','🍲','🍕','🥗','☕','🍦','🍞','🍟','🥙'];
    return icons[i % icons.length];
}

function openQuickMenu() {
    const tree      = window._spTree;
    const storeName = window._spStoreName;
    if (!tree || !storeName) return; // store panel hasn't finished loading yet

    const heroLogoSrc  = document.getElementById('sp-hero-logo')?.src || '';
    const heroLogoShown= document.getElementById('sp-hero-logo')?.style.display !== 'none';
    const heroEmoji    = document.getElementById('sp-hero-logo-emoji')?.textContent || '🏪';
    const displayName  = document.getElementById('sp-hero-name')?.textContent || storeName;

    _qmOpenPanel({
        tree, storeName, catOrder: window._spCatOrder,
        displayName,
        logoSrc  : (heroLogoSrc && heroLogoShown) ? heroLogoSrc : '',
        logoEmoji: heroEmoji,
    });
}

/* ── Shared renderer — used by both entry points ─────────── */
function _qmOpenPanel({ tree, storeName, catOrder, displayName, logoSrc, logoEmoji }) {
    _ensureQuickMenu();

    _qmMains = typeof _sortByOrder === 'function' ? _sortByOrder(Object.keys(tree), catOrder?.main) : Object.keys(tree);
    _qmActive = 0;

    document.getElementById('qm-store-name').textContent = displayName || storeName;
    const qmLogoImg   = document.getElementById('qm-logo-img');
    const qmLogoEmoji = document.getElementById('qm-logo-emoji');
    if (logoSrc) {
        qmLogoImg.src = logoSrc;
        qmLogoImg.style.display = 'block';
        qmLogoEmoji.style.display = 'none';
    } else {
        qmLogoImg.style.display = 'none';
        qmLogoEmoji.style.display = 'flex';
        qmLogoEmoji.textContent = logoEmoji || '🏪';
    }

    const track = document.getElementById('qm-track');
    track.style.width = (_qmMains.length * 100) + '%';
    track.style.transform = 'translateX(0%)';
    track.innerHTML = _qmMains.map(main => {
        const subOrder = catOrder?.sub?.[main];
        const subs = typeof _sortByOrder === 'function' ? _sortByOrder(Object.keys(tree[main]), subOrder) : Object.keys(tree[main]);
        const body = subs.map(sub => {
            const rows = tree[main][sub].map(item => _qmRenderRow(item, storeName)).join('');
            const showSubHeader = sub && sub.trim() && sub !== 'عام' && sub.trim() !== main.trim();
            return `${showSubHeader ? `<div class="qm-subcat">${sub}</div>` : ''}${rows}`;
        }).join('');
        return `<div class="qm-page" style="width:${100 / _qmMains.length}%">${body || '<div class="qm-empty">لا توجد أصناف</div>'}</div>`;
    }).join('');

    const tabs = document.getElementById('qm-tabs');
    tabs.innerHTML = _qmMains.map((main, i) => `
        <button class="qm-tab ${i === 0 ? 'active' : ''}" data-i="${i}" onclick="_qmGoTo(${i})">
            <span class="qm-tab__icon">${_qmCatIcon(main, i)}</span>
            <span>${main}</span>
        </button>`).join('');

    document.getElementById('qm-overlay').classList.add('active');
    document.getElementById('qm-panel').classList.add('active');
    document.body.classList.add('modal-open');
}

/* ============================================================
   Homepage entry point — hotline-style FAB + store picker
   Lets a customer see a store's prices WITHOUT opening the full
   store page first. Fetches items directly (same fallback-key
   logic as store-panel.js), independent of any panel state.
   ============================================================ */
let _qmStoresCache = null;

async function _qmFetchStoreList() {
    if (_qmStoresCache) return _qmStoresCache;
    _qmStoresCache = typeof fetchAllStores === 'function'
        ? await fetchAllStores()
        : [];
    return _qmStoresCache;
}

async function _qmFetchItemsFallback(storeName) {
    const tryPath = (p) => rtdbGet(p).catch(() => null);
    let items = await tryPath(`items/${storeName}`);
    if (!items) items = await tryPath(`items/${storeName.toLowerCase()}`);
    if (!items) {
        const slug = storeName.toLowerCase().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
        if (slug !== storeName.toLowerCase()) items = await tryPath(`items/${slug}`);
    }
    if (!items) items = await tryPath(`items/${storeName.toLowerCase().replace(/\s+/g,'')}`);
    return items;
}

function _qmBuildTree(items) {
    const tree = {};
    Object.values(items).forEach(item => {
        if (!item || !item.name) return;
        const main = (item.catmain || 'عام').trim();
        const sub  = (item.cat    || 'عام').trim();
        if (!tree[main])      tree[main] = {};
        if (!tree[main][sub]) tree[main][sub] = [];
        tree[main][sub].push(item);
    });
    return tree;
}

function _qmPickerRow(store) {
    const emoji = (typeof TYPE_EMOJI_STORE !== 'undefined' && TYPE_EMOJI_STORE[store.type]) || '🏪';
    const tag   = (typeof TYPE_TAGS_AR !== 'undefined' && TYPE_TAGS_AR[store.type]) || store.type || '';
    const slug  = (store.imgSlug && store.imgSlug.trim()) || (typeof toSlug === 'function' ? toSlug(store.companyname) : '');
    const name  = store.nameAr && store.nameAr.trim() ? store.nameAr.trim() : store.companyname;
    return `
    <button class="qm-pick-row" onclick='_qmPickStore(${JSON.stringify(store).replace(/'/g,"&apos;")})'>
        <div class="qm-pick-row__img">
            <img src="assets/${slug}.webp" alt="" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="qm-pick-row__fallback" style="display:none">${emoji}</div>
        </div>
        <div class="qm-pick-row__info">
            <div class="qm-pick-row__name">${name}</div>
            <div class="qm-pick-row__tag">${tag}</div>
        </div>
        <svg class="qm-pick-row__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>`;
}

async function openQuickMenuFromHome() {
    _ensureQmPicker();
    document.getElementById('qm-picker-overlay').classList.add('active');
    document.getElementById('qm-picker-sheet').classList.add('active');
    document.body.classList.add('modal-open');

    const list = document.getElementById('qm-picker-list');
    list.innerHTML = `<div class="qm-picker-loading"><div class="qm-picker-spinner"></div>جاري تحميل المتاجر...</div>`;

    const stores = (await _qmFetchStoreList()).filter(s => !s.disabled);
    _qmPickerRender(stores);

    const search = document.getElementById('qm-picker-search');
    search.value = '';
    search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        if (!q) { _qmPickerRender(stores); return; }
        _qmPickerRender(stores.filter(s =>
            (s.nameAr || '').toLowerCase().includes(q) ||
            (s.companyname || '').toLowerCase().includes(q)
        ));
    };
}

function _qmPickerRender(stores) {
    const list = document.getElementById('qm-picker-list');
    if (!stores.length) {
        list.innerHTML = `<div class="qm-picker-empty">🙁 لا توجد نتائج</div>`;
        return;
    }
    list.innerHTML = stores.map(_qmPickerRow).join('');
}

async function _qmPickStore(store) {
    closeQmPicker();
    _ensureQuickMenu();
    document.getElementById('qm-overlay').classList.add('active');
    document.getElementById('qm-panel').classList.add('active');
    document.body.classList.add('modal-open');

    const name = store.nameAr && store.nameAr.trim() ? store.nameAr.trim() : store.companyname;
    document.getElementById('qm-store-name').textContent = name;
    const qmLogoImg   = document.getElementById('qm-logo-img');
    const qmLogoEmoji = document.getElementById('qm-logo-emoji');
    qmLogoImg.style.display = 'none';
    qmLogoEmoji.style.display = 'flex';
    qmLogoEmoji.textContent = (typeof TYPE_EMOJI_STORE !== 'undefined' && TYPE_EMOJI_STORE[store.type]) || '🏪';
    const slug = (store.imgSlug && store.imgSlug.trim()) || (typeof toSlug === 'function' ? toSlug(store.companyname) : '');
    if (slug) {
        const testImg = new Image();
        testImg.onload = () => { qmLogoImg.src = testImg.src; qmLogoImg.style.display = 'block'; qmLogoEmoji.style.display = 'none'; };
        testImg.src = `assets/${slug}.webp`;
    }

    const track = document.getElementById('qm-track');
    track.style.width = '100%';
    track.innerHTML = `<div class="qm-page" style="width:100%"><div class="qm-picker-loading"><div class="qm-picker-spinner"></div>جاري تحميل الأسعار...</div></div>`;
    document.getElementById('qm-tabs').innerHTML = '';

    const items = await _qmFetchItemsFallback(store.companyname);
    if (!items) {
        track.innerHTML = `<div class="qm-page" style="width:100%"><div class="qm-empty">لا توجد أصناف لهذا المتجر بعد</div></div>`;
        return;
    }
    const tree     = _qmBuildTree(items);
    const catOrder = await rtdbGet(`settings/categoryOrder/${store.companyname}`).catch(() => null);

    _qmOpenPanel({
        tree, storeName: store.companyname, catOrder,
        displayName: name,
        logoSrc  : (qmLogoImg.style.display === 'block') ? qmLogoImg.src : '',
        logoEmoji: qmLogoEmoji.textContent,
    });
}

function _ensureQmPicker() {
    if (document.getElementById('qm-picker-sheet')) return;

    const overlay = document.createElement('div');
    overlay.className = 'qm-picker-overlay';
    overlay.id = 'qm-picker-overlay';
    overlay.addEventListener('click', closeQmPicker);

    const sheet = document.createElement('div');
    sheet.className = 'qm-picker-sheet';
    sheet.id = 'qm-picker-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'اختر متجراً لعرض أسعاره');
    sheet.innerHTML = `
        <div class="qm-picker-handle"></div>
        <div class="qm-picker-header">
            <div class="qm-picker-title">📋 شو بدك تشوف أسعاره؟</div>
            <button class="qm-close" id="qm-picker-close-btn" aria-label="إغلاق">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <input class="qm-picker-search" id="qm-picker-search" type="text" placeholder="دوّر عالمتجر...">
        <div class="qm-picker-list" id="qm-picker-list"></div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    document.getElementById('qm-picker-close-btn').addEventListener('click', closeQmPicker);
}

function closeQmPicker() {
    document.getElementById('qm-picker-overlay')?.classList.remove('active');
    document.getElementById('qm-picker-sheet')?.classList.remove('active');
    if (!document.getElementById('qm-panel')?.classList.contains('active') &&
        !document.getElementById('store-panel')?.classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
}

function _qmGoTo(i) {
    if (i < 0 || i >= _qmMains.length) return;
    _qmActive = i;
    const track = document.getElementById('qm-track');
    track.style.transform = `translateX(${i * (100 / _qmMains.length)}%)`;
    document.querySelectorAll('.qm-tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.i) === i));
    const activeTab = document.querySelector(`.qm-tab[data-i="${i}"]`);
    if (activeTab) activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function closeQuickMenu() {
    document.getElementById('qm-overlay')?.classList.remove('active');
    document.getElementById('qm-panel')?.classList.remove('active');
    if (!document.getElementById('store-panel')?.classList.contains('active') &&
        !document.getElementById('qm-picker-sheet')?.classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
}

function _ensureQuickMenu() {
    if (document.getElementById('qm-panel')) return;

    const overlay = document.createElement('div');
    overlay.className = 'qm-overlay';
    overlay.id = 'qm-overlay';
    overlay.addEventListener('click', closeQuickMenu);

    const panel = document.createElement('div');
    panel.className = 'qm-panel';
    panel.id = 'qm-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'قائمة الأسعار');
    panel.innerHTML = `
        <div class="qm-header">
            <div class="qm-header__store">
                <div class="qm-header__logo">
                    <img id="qm-logo-img" src="" alt="" style="display:none" onerror="this.style.display='none'">
                    <span id="qm-logo-emoji" style="display:none">🏪</span>
                </div>
                <div>
                    <div class="qm-header__title">قائمة الأسعار</div>
                    <div class="qm-header__store-name" id="qm-store-name"></div>
                </div>
            </div>
            <button class="qm-close" id="qm-close-btn" aria-label="إغلاق">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="qm-track-wrap" id="qm-track-wrap">
            <div class="qm-track" id="qm-track"></div>
        </div>
        <div class="qm-tabs" id="qm-tabs"></div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.getElementById('qm-close-btn').addEventListener('click', closeQuickMenu);
    _qmWireSwipe(document.getElementById('qm-track-wrap'));
}

function _qmWireSwipe(wrap) {
    if (!wrap) return;
    let startX = 0, startY = 0, dragging = false, locked = null;
    wrap.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = true;
        locked = null;
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
        if (!dragging) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (locked === null) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (locked === 'x') e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchend', e => {
        if (!dragging) return;
        dragging = false;
        if (locked !== 'x') return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 40) return;
        // RTL: swipe right (dx>0) → previous page, swipe left (dx<0) → next page
        if (dx > 0) _qmGoTo(_qmActive - 1);
        else _qmGoTo(_qmActive + 1);
    });
}

function _qmInitFab() {
    if (document.getElementById('qm-hotline-fab')) return;
    const fab = document.createElement('button');
    fab.className = 'qm-hotline-fab';
    fab.id = 'qm-hotline-fab';
    fab.setAttribute('aria-label', 'شوف أسعار المتاجر');
    fab.onclick = openQuickMenuFromHome;
    fab.innerHTML = `
        <span class="qm-hotline-fab__ring"></span>
        <span class="qm-hotline-fab__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
        </span>
        <span>أسعار المتاجر</span>
        <span class="qm-hotline-fab__badge">جديد</span>
    `;
    document.body.appendChild(fab);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _qmInitFab);
} else {
    _qmInitFab();
}

window.openQuickMenu       = openQuickMenu;
window.closeQuickMenu      = closeQuickMenu;
window._qmGoTo             = _qmGoTo;
window._qmQuickAdd         = _qmQuickAdd;
window.openQuickMenuFromHome = openQuickMenuFromHome;
window._qmPickStore        = _qmPickStore;
window.closeQmPicker       = closeQmPicker;