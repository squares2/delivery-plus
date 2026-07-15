/* ============================================================
   scripts/categories.js
   Category buttons → Firebase fetch → dropdown.

   PRIORITY MODEL:
   Each store entry lives under its own category path in Firebase,
   e.g. pattern/Restaurants/xxx  and  pattern/BakeryShops/yyy.
   Each path carries its OWN priority field independently, so a
   multi-category store (e.g. Al-Kanater) can have:
     pattern/Restaurants/xxx   → priority: 2
     pattern/BakeryShops/yyy   → priority: 1
   The sort simply uses whatever priority is on the path being
   fetched — no cross-category override, no global map.
   ============================================================ */

const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
const STORE_IMG = './assets';

/* ── Daily auto open/close hours (same logic as stores.js) ───
   Store record may carry autoHours: { enabled, open:"HH:MM", close:"HH:MM" }
   set in Admin → المتاجر. Handles overnight windows correctly. */
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

    const opensAt = new Date(now);
    opensAt.setHours(oh, om, 0, 0);
    if (opensAt <= now) opensAt.setDate(opensAt.getDate() + 1);

    return { reason: 'خارج أوقات الدوام', opensAtIso: opensAt.toISOString() };
}

const CAT_MAP = {
    restaurants : { fbKey: 'Restaurants',  label: 'المطاعم',     emoji: '🍔' },
    meat        : { fbKey: 'ButcherShops', label: 'الملاحم',     emoji: '🥩' },
    bakery      : { fbKey: 'BakeryShops',  label: 'الأفران',     emoji: '🥖' },
    supermarket : { fbKey: 'Markets',      label: 'السوبرماركت', emoji: '🛒' },
    sweets      : { fbKey: 'SweetsShops',  label: 'الحلويات',    emoji: '🍰' },
    fish        : { fbKey: 'FishShops',    label: 'الأسماك',     emoji: '🐟' },
    coffee      : { fbKey: 'CoffeeShops',  label: 'القهوة',      emoji: '☕' },
    chickenshop : { fbKey: 'ChickenShops', label: 'الدجاج',      emoji: '🍗' },
    dairyshop   : { fbKey: 'DairyShops',   label: 'الألبان',     emoji: '🥛' },
    groceries   : { fbKey: 'GroceryShops', label: 'البقالة',     emoji: '🧺' },
    flowershop  : { fbKey: 'FlowerShops',  label: 'الزهور',      emoji: '💐' },
    taxi        : { fbKey: 'Taxi',         label: 'تاكسي',       emoji: '🚕' },
    tobacco     : { fbKey: 'TobaccoShops', label: 'التبغ',       emoji: '🚬' },
    toys        : { fbKey: 'ToysShops',    label: 'الألعاب',     emoji: '🧸' },
};

let _openCategory = null;
let _cache        = {};
let _typeOrderCache = null;

async function _getTypeOrder() {
    if (_typeOrderCache) return _typeOrderCache;
    try {
        const res  = await fetch(`${RTDB_BASE}/settings/typeOrder.json`);
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
            _typeOrderCache = data;
            return data;
        }
    } catch(e) {}
    _typeOrderCache = Object.values(CAT_MAP).map(c => c.fbKey);
    return _typeOrderCache;
}

async function _renderCategoryBar() {
    // Build reverse map: fbKey → CAT_MAP local key (e.g. 'Restaurants' → 'restaurants')
    const fbKeyToLocal = {};
    Object.entries(CAT_MAP).forEach(([localKey, meta]) => { fbKeyToLocal[meta.fbKey] = localKey; });

    const container = document.querySelector('.categories__scroll');
    if (!container) return;

    const [order] = await Promise.all([ _getTypeOrder() ]);

    // Re-order DOM nodes: for each fbKey in saved order, find the matching .category-item and append
    order.forEach(fbKey => {
        const localKey = fbKeyToLocal[fbKey];
        if (!localKey) return;
        const el = container.querySelector(`.category-item[data-category="${localKey}"]`);
        if (el) container.appendChild(el); // moves it to end = preserves saved order
    });

    // Check which categories have active (non-disabled) stores and mark empty ones
    _markEmptyCategories(container, fbKeyToLocal);
}

/* ── Mark categories that have no active stores as empty (قريباً) ──────────
   Fetches the full /pattern.json and counts stores where disabled is NOT set.
   shallow=true is NOT used because it returns true even when every store is
   disabled — we need to inspect the actual entries.
   Runs async after bar renders so there is zero layout delay.               */
async function _markEmptyCategories(container, fbKeyToLocal) {
    try {
        const res     = await fetch(`${RTDB_BASE}/pattern.json`);
        const pattern = await res.json();   // { Restaurants: { 0: {...}, 1: {...} }, … }

        // Build a set of fbKeys that have at least one genuinely active store.
        // A store is disabled when its disabled field is truthy in the Firebase sense:
        // true, 1, or "1". Anything else (false, 0, "0", null, undefined, missing)
        // means the store is active. We use a helper to keep this consistent with
        // how _fetchStores filters stores throughout the rest of the app.
        const _isDisabled = s =>
            s.disabled === true || s.disabled === 1 || s.disabled === '1';

        const activeKeys = new Set();
        if (pattern && typeof pattern === 'object') {
            Object.entries(pattern).forEach(([fbKey, entries]) => {
                if (!entries || typeof entries !== 'object') return;
                const list = Array.isArray(entries) ? entries : Object.values(entries);
                const hasActive = list.some(s => s && s.companyname && !_isDisabled(s));
                if (hasActive) activeKeys.add(fbKey);
            });
        }

        // Apply or remove empty state on each category button
        Object.entries(CAT_MAP).forEach(([localKey, meta]) => {
            const el = container.querySelector(`.category-item[data-category="${localKey}"]`);
            if (!el) return;

            const hasActive = activeKeys.has(meta.fbKey);
            if (!hasActive) {
                el.classList.add('category-item--empty');
            } else {
                el.classList.remove('category-item--empty');
            }
        });
    } catch (_) {
        // Network failure — leave all categories active rather than blocking
    }
}

function _showCategoryToast(msg) {
    let toast = document.getElementById('cart-toast'); // reuse the shared site-wide toast element/style
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        document.body.appendChild(toast);
    }
    if (toast._hideTimer) { clearTimeout(toast._hideTimer); toast._hideTimer = null; }
    toast.classList.remove('visible');
    toast.textContent = msg;
    toast.className   = 'cart-toast cart-toast--error';
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
    toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function initCategories() {
    _renderCategoryBar();
    document.querySelectorAll('.category-item[data-category]').forEach(item => {
        item.addEventListener('click', () => {
            // Empty categories are clickable too — just show a message instead of opening the dropdown
            if (item.classList.contains('category-item--empty')) {
                _showCategoryToast('لا توجد متاجر في هذا القسم حالياً');
                return;
            }
            _toggleCategory(item.dataset.category);
        });
    });

    // Close the modal via the ✕ button, tapping the dimmed backdrop, or Escape
    const closeBtn  = document.getElementById('cat-dd-close');
    const backdrop  = document.getElementById('cat-dd-backdrop');
    if (closeBtn) closeBtn.addEventListener('click', _closeDropdown);
    if (backdrop) backdrop.addEventListener('click', _closeDropdown);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _openCategory) _closeDropdown();
    });
}

function _toggleCategory(cat) {
    const catMeta = CAT_MAP[cat];
    if (!catMeta) return;
    // Empty categories are handled entirely in the click listener above (toast message)
    const el = document.querySelector(`.category-item[data-category="${cat}"]`);
    if (el && el.classList.contains('category-item--empty')) {
        _showCategoryToast('لا توجد متاجر في هذا القسم حالياً');
        return;
    }
    const dropdown = document.getElementById('cat-stores-dropdown');
    if (!dropdown) return;

    if (_openCategory === cat) { _closeDropdown(); return; }

    document.querySelectorAll('.category-item').forEach(el =>
        el.classList.toggle('active', el.dataset.category === cat));

    document.getElementById('cat-dd-emoji').textContent = catMeta.emoji;
    document.getElementById('cat-dd-title').textContent  = catMeta.label;
    document.getElementById('cat-dd-count').textContent  = '';

    const scrollEl = document.getElementById('cat-dropdown-scroll');
    scrollEl.innerHTML = _skeletonHTML(6);
    dropdown.classList.add('open');
    document.body.classList.add('modal-open');
    _openCategory = cat;

    _fetchStores(catMeta.fbKey)
        .then(stores => { if (_openCategory === cat) _renderStores(stores, cat, catMeta); })
        .catch(()    => {
            if (_openCategory !== cat) return;
            scrollEl.innerHTML = `<div class="cat-stores-empty">⚠️ تعذّر التحميل</div>`;
            const hint = document.getElementById('cat-dd-more-hint');
            if (hint) hint.classList.remove('visible');
        });
}

function _closeDropdown() {
    const dropdown = document.getElementById('cat-stores-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
    _openCategory = null;
}

async function _fetchStores(fbKey) {
    if (_cache[fbKey]) return _cache[fbKey];

    const [patternRes, statusRes] = await Promise.all([
        fetch(`${RTDB_BASE}/pattern/${fbKey}.json`),
        fetch(`${RTDB_BASE}/storeStatus.json`).catch(() => null),
    ]);

    if (!patternRes.ok) throw new Error(`Firebase ${patternRes.status}`);
    const data   = await patternRes.json();
    const status = statusRes && statusRes.ok ? await statusRes.json().catch(() => null) : null;
    if (!data) { _cache[fbKey] = []; return []; }

    // Flatten — guard against non-object/null entries
    const _isDis = s => s.disabled === true || s.disabled === 1 || s.disabled === '1';
    const raw = Object.values(data)
        .filter(s => s && typeof s === 'object' && s.companyname && !_isDis(s));

    // Deduplicate by companyname within the same path (shouldn't normally
    // happen, but safe guard). When duplicates exist, keep the one with
    // the LOWEST priority so the intended position is preserved.
    const seen = {};
    raw.forEach(s => {
        const key = s.companyname;
        // Parse this path's own priority — no cross-category override
        const p   = (s.priority !== undefined && s.priority !== null && s.priority !== '')
                    ? parseInt(s.priority) : 9999;
        if (!seen[key] || p < seen[key]._priority) {
            seen[key] = { ...s, _priority: p };
        } else if (s.nameAr && s.nameAr.trim() && (!seen[key].nameAr || !seen[key].nameAr.trim())) {
            // Merge nameAr from any entry that has it, even if this entry lost priority race
            seen[key] = { ...seen[key], nameAr: s.nameAr };
        }
    });

    const arr = Object.values(seen)
        .sort((a, b) => {
            // 1st: this category's own priority (lower = earlier; missing = last)
            if (a._priority !== b._priority) return a._priority - b._priority;
            // 2nd: rank as tiebreaker (higher rating first)
            return (parseFloat(b.rank) || 0) - (parseFloat(a.rank) || 0);
        })
        .map(s => {
            const st           = status && status[s.companyname];
            const manualClosed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
            // Manual admin closure always wins; daily auto-hours (set in
            // Admin → المتاجر) only evaluated when there's no manual closure.
            const autoInfo     = !manualClosed ? _autoHoursClosedInfo(s.autoHours) : null;
            const closed       = manualClosed || !!autoInfo;
            if (!closed) return s;
            return {
                ...s,
                _closed       : true,
                _closedReason : manualClosed ? (st.reason  || '') : (autoInfo ? autoInfo.reason     : ''),
                _opensAt      : manualClosed ? (st.opensAt || '') : (autoInfo ? autoInfo.opensAtIso  : ''),
            };
        });

    _cache[fbKey] = arr;
    return arr;
}

function _renderStores(stores, catKey, catMeta) {
    const scrollEl = document.getElementById('cat-dropdown-scroll');
    const countEl  = document.getElementById('cat-dd-count');
    if (!scrollEl) return;

    if (!stores || stores.length === 0) {
        countEl.textContent = '';
        scrollEl.innerHTML = `<div class="cat-stores-empty">لا توجد متاجر في هذا القسم حالياً</div>`;
        const hint = document.getElementById('cat-dd-more-hint');
        if (hint) hint.classList.remove('visible');
        return;
    }
    countEl.textContent = stores.length + ' متجر';
    scrollEl.innerHTML = stores.map(s => _storeCardHTML(s, catKey, catMeta.fbKey)).join('');

    // Every store sits in the grid at once — plain vertical scroll,
    // plus drag-to-scroll for mouse users; wire up tap-to-open too.
    requestAnimationFrame(() => {
        _wireStoreCardClicks(scrollEl);
        _initVerticalDragScroll(scrollEl);
        _wireMoreHint(scrollEl);
    });
}

/* ── "More stores below" hint wiring ───────────────────────────────
   Shows a bouncing chevron + fade only when the grid actually has
   content hidden below the fold, and hides it once the person has
   scrolled far enough to see the last row — so it never lingers as
   a false promise of more stores once they've seen them all. */
function _wireMoreHint(scrollEl) {
    const hint = document.getElementById('cat-dd-more-hint');
    if (!hint) return;

    function update() {
        const overflowing = scrollEl.scrollHeight > scrollEl.clientHeight + 4;
        const nearBottom  = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 16;
        hint.classList.toggle('visible', overflowing && !nearBottom);
    }

    update();
    if (!scrollEl._moreHintBound) {
        scrollEl._moreHintBound = true;
        scrollEl.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
    }
}

/* ── Wires "open store panel" clicks onto every rendered store card
   within a given container. ──────────────────────────────────────── */
function _wireStoreCardClicks(container) {
    container.querySelectorAll('.store-card[data-store-name]').forEach(card => {
        if (card.classList.contains('store-card--soon'))   return;
        if (card.classList.contains('store-card--closed')) return;
        card.addEventListener('click', () => {
            if (typeof openStorePanel === 'function') {
                const displayName = (card.dataset.nameAr && card.dataset.nameAr.trim())
                    ? card.dataset.nameAr.trim()
                    : card.dataset.storeName;
                const storeId    = card.dataset.storeId;
                const fbType     = card.dataset.fbType;
                const rtdbKey    = card.dataset.storeRtdbkey || card.dataset.storeName;
                // Close the sheet first — otherwise it stays open underneath
                // (and previously, on top of) the store details panel.
                _closeDropdown();
                openStorePanel(storeId, displayName, fbType, rtdbKey);
            }
        });
    });
}

/* ── Display name: use nameAr from Firebase, fallback to companyname ── */
function _displayName(store) {
    if (store.nameAr && store.nameAr.trim()) return store.nameAr.trim();
    return store.companyname;
}

/* ── Image slug: always English, never Arabic ─────────────── */
function _imgSlug(store) {
    if (store.imgSlug && store.imgSlug.trim()) return store.imgSlug.trim().toLowerCase();
    // Derive from companyname stripping non-ASCII (safe even if Arabic)
    return store.companyname.toLowerCase()
        .replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'store';
}

function _storeCardHTML(store, catKey, fbType) {
    const rawName  = store.companyname;
    const name     = _displayName(store);
    const rank     = store.rank ? parseFloat(store.rank).toFixed(1) : null;
    const isSoon   = store.soon == '1' || store.soon === 1;
    const isClosed = !!store._closed;
    const imgUrl   = `${STORE_IMG}/${_imgSlug(store)}.webp`;
    const id       = _imgSlug(store);  // always English — used for store panel lookup

    let opensChip = '';
    if (isClosed && store._opensAt) {
        const dt = new Date(store._opensAt);
        let opensStr = store._opensAt;
        if (!isNaN(dt) && dt > new Date()) {
            const now2      = new Date();
            const dayDiff2  = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) - new Date(now2.getFullYear(), now2.getMonth(), now2.getDate())) / 86400000);
            const t         = dt.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', hour12:true });
            const days      = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
            const months    = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
            if (dayDiff2 === 0)      opensStr = `اليوم ${t}`;
            else if (dayDiff2 === 1) opensStr = `غداً ${t}`;
            else if (dayDiff2 < 7)  opensStr = `${days[dt.getDay()]} ${t}`;
            else {
                const dp = dt.getFullYear() === now2.getFullYear()
                    ? `${dt.getDate()} ${months[dt.getMonth()]}`
                    : `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
                opensStr = `${days[dt.getDay()]} ${dp} ${t}`;
            }
        }
        opensChip = `<div class="store-card__opens-chip">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            يفتح ${opensStr}
        </div>`;
    }

    const stateClass = isClosed ? 'store-card--closed' : isSoon ? 'store-card--soon' : '';
    const stateStyle = (isClosed || isSoon) ? 'cursor:default;pointer-events:none;' : 'cursor:pointer;';

    return `
    <div class="store-card ${stateClass}"
         data-store-name="${rawName}" data-store-id="${id}" data-fb-type="${fbType}" data-store-rtdbkey="${rawName}" data-name-ar="${store.nameAr ? store.nameAr.trim() : ""}"
         style="${stateStyle}flex-shrink:0;">
        <div class="store-card__thumb" style="position:relative;">
            <img src="${imgUrl}" alt="${name}"
                 style="width:100%;height:100%;object-fit:contain;display:block;background:var(--clr-gray-100);"
                 onerror="if(this.src.includes('.webp')){this.src=this.src.replace('.webp','.png');return;}this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div style="display:none;width:100%;height:100%;align-items:center;
                        justify-content:center;font-size:2rem;background:var(--clr-gray-100);">
                ${_catEmoji(catKey)}</div>
            ${rank ? `<div class="store-card__rating"><svg width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${rank}</div>` : ''}
            ${isClosed ? `<div class="store-card__closed-badge">
                <span class="store-card__closed-badge__icon">🔒</span>
                <span class="store-card__closed-badge__label">مغلق الآن</span>
            </div>` : isSoon ? `<div class="store-card__soon-badge">قريباً</div>` : ''}
        </div>
        <div class="store-card__body">
            <p class="store-card__name">${name}</p>
            <p class="store-card__tags">${_catLabel(catKey)}</p>
            ${isClosed && store._closedReason ? `<p class="store-card__closed-reason">${store._closedReason}</p>` : ''}
            <div class="store-card__footer">
                ${isClosed
                    ? opensChip || '<span class="store-card__min-label" style="color:#9898a6;">مغلق مؤقتاً</span>'
                    : isSoon
                    ? '<span class="store-card__min-label">قريباً</span>'
                    : '<span class="store-card__min-label">اضغط للطلب</span>'}
            </div>
        </div>
    </div>`;
}

function _skeletonHTML(n) {
    return Array(n).fill(0).map(() => `
        <div class="cat-skeleton-card">
            <div class="cat-skeleton-card__thumb"></div>
            <div class="cat-skeleton-card__body">
                <div class="cat-skeleton-card__line"></div>
                <div class="cat-skeleton-card__line"></div>
                <div class="cat-skeleton-card__line"></div>
            </div>
        </div>`).join('');
}

/* ── Vertical mouse-drag-to-scroll for the store grid ──────────────
   Touch already scrolls natively; this adds click-and-drag support for
   desktop/mouse users so the grid feels grabbable there too. Small
   drags are ignored so a normal click on a store card still works. */
function _initVerticalDragScroll(el) {
    if (!el || el._dragScrollBound) return;
    el._dragScrollBound = true;
    let isDown = false, startY, scrollTop, hasDragged = false;
    el.addEventListener('mousedown', e => {
        isDown = true; hasDragged = false;
        el.classList.add('dragging');
        startY = e.pageY; scrollTop = el.scrollTop;
    });
    el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mouseup',    () => { isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mousemove', e => {
        if (!isDown) return;
        const y = e.pageY;
        if (Math.abs(y - startY) > 5) { hasDragged = true; e.preventDefault(); el.scrollTop = scrollTop - (y - startY); }
    });
    el.addEventListener('click', e => {
        if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged = false; }
    }, true);
}

function _catEmoji(cat) {
    return { restaurants:'🍔', meat:'🥩', bakery:'🥖', supermarket:'🛒', sweets:'🍰',
             fish:'🐟', coffee:'☕', chickenshop:'🍗', dairyshop:'🥛', groceries:'🧺',
             flowershop:'💐', taxi:'🚕', tobacco:'🚬', toys:'🧸' }[cat] || '🏪';
}

function _catLabel(cat) {
    return { restaurants:'مطعم', meat:'ملحمة', bakery:'مخبز', supermarket:'سوبرماركت',
             sweets:'حلويات', fish:'أسماك', coffee:'قهوة', chickenshop:'دجاج',
             dairyshop:'ألبان', groceries:'بقالة', flowershop:'زهور', taxi:'تاكسي',
             tobacco:'تبغ', toys:'ألعاب' }[cat] || '';
}

window.initCategories   = initCategories;
window.closeCatDropdown = _closeDropdown;
window._invalidateCategoriesCache = function() { _cache = {}; };

/* ── Listen for nameAr changes from stores.js SSE and update category cards ── */
window._onCategoryNameArChange = function(companyname, nameAr) {
    const display = nameAr && nameAr.trim() ? nameAr.trim() : companyname;
    // Invalidate cache so next dropdown open fetches fresh data
    Object.keys(_cache).forEach(k => {
        _cache[k] = _cache[k].map(s => {
            if (s.companyname === companyname) return { ...s, nameAr };
            return s;
        });
    });
    // Update any currently-open category dropdown cards
    document.querySelectorAll(`.store-card[data-store-rtdbkey="${companyname}"]`).forEach(card => {
        card.dataset.nameAr = nameAr || '';
        const nameEl = card.querySelector('.store-card__name');
        if (nameEl && nameEl.textContent !== display) {
            nameEl.textContent = display;
            nameEl.style.transition = 'color 0.4s';
            nameEl.style.color = 'var(--clr-orange, #FF5C00)';
            setTimeout(() => { nameEl.style.color = ''; }, 1200);
        }
    });
};