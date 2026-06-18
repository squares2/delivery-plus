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

const CAT_MAP = {
    restaurants : { fbKey: 'Restaurants',  label: 'المطاعم',     emoji: '🍔' },
    meat        : { fbKey: 'ButcherShops', label: 'الملاحم',     emoji: '🥩' },
    bakery      : { fbKey: 'BakeryShops',  label: 'المخابز',     emoji: '🥖' },
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

    const order = await _getTypeOrder();

    // Re-order DOM nodes: for each fbKey in saved order, find the matching .category-item and append
    order.forEach(fbKey => {
        const localKey = fbKeyToLocal[fbKey];
        if (!localKey) return;
        const el = container.querySelector(`.category-item[data-category="${localKey}"]`);
        if (el) container.appendChild(el); // moves it to end = preserves saved order
    });
}

async function _markEmptyCategories() {
    try {
        const res  = await fetch(`${RTDB_BASE}/pattern.json`);
        const data = await res.json();
        if (!data || typeof data !== 'object') return;

        // Build set of types that have at least one active store
        const hasStores = new Set();
        for (const [type, entries] of Object.entries(data)) {
            if (!entries || typeof entries !== 'object') continue;
            const arr = Array.isArray(entries) ? entries : Object.values(entries);
            const active = arr.filter(s => s && s.companyname
                && s.disabled !== '1' && s.disabled !== 1 && s.disabled !== true);
            if (active.length > 0) hasStores.add(type);
        }

        // Mark each category-item as empty if its fbKey has no stores
        document.querySelectorAll('.category-item[data-category]').forEach(el => {
            const localKey = el.dataset.category;
            const meta     = CAT_MAP[localKey];
            if (!meta) return;
            if (!hasStores.has(meta.fbKey)) {
                el.classList.add('category-item--empty');
            } else {
                el.classList.remove('category-item--empty');
            }
        });
    } catch(e) {}
}

function initCategories() {
    _renderCategoryBar();
    _markEmptyCategories();
    document.querySelectorAll('.category-item[data-category]').forEach(item => {
        item.addEventListener('click', () => _toggleCategory(item.dataset.category));
    });
    _initDragScroll(document.getElementById('cat-dropdown-scroll'));
}

function _toggleCategory(cat) {
    const catMeta = CAT_MAP[cat];
    if (!catMeta) return;
    const dropdown = document.getElementById('cat-stores-dropdown');
    if (!dropdown) return;

    if (_openCategory === cat) { _closeDropdown(); return; }

    document.querySelectorAll('.category-item').forEach(el =>
        el.classList.toggle('active', el.dataset.category === cat));

    document.getElementById('cat-dd-emoji').textContent = catMeta.emoji;
    document.getElementById('cat-dd-title').textContent  = catMeta.label;
    document.getElementById('cat-dd-count').textContent  = '';

    const scrollEl = document.getElementById('cat-dropdown-scroll');
    scrollEl.innerHTML = _skeletonHTML(5);
    dropdown.classList.add('open');
    _openCategory = cat;

    _fetchStores(catMeta.fbKey)
        .then(stores => { if (_openCategory === cat) _renderStores(stores, cat, catMeta); })
        .catch(()    => { if (_openCategory === cat) scrollEl.innerHTML = `<div class="cat-stores-empty">⚠️ تعذّر التحميل</div>`; });
}

function _closeDropdown() {
    const dropdown = document.getElementById('cat-stores-dropdown');
    if (dropdown) dropdown.classList.remove('open');
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
    const raw = Object.values(data)
        .filter(s => s && typeof s === 'object' && s.companyname
                  && s.disabled !== '1' && s.disabled !== 1 && s.disabled !== true);

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
            const st     = status && status[s.companyname];
            const closed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
            return closed
                ? { ...s, _closed: true, _closedReason: st.reason || '', _opensAt: st.opensAt || '' }
                : s;
        });

    _cache[fbKey] = arr;
    return arr;
}

function _renderStores(stores, catKey, catMeta) {
    const scrollEl = document.getElementById('cat-dropdown-scroll');
    const countEl  = document.getElementById('cat-dd-count');
    if (!scrollEl) return;
    if (!stores || stores.length === 0) {
        scrollEl.innerHTML = `<div class="cat-stores-empty">لا توجد متاجر في هذا القسم حالياً</div>`;
        return;
    }
    countEl.textContent = stores.length + ' متجر';

    scrollEl.innerHTML = stores.map(s => _storeCardHTML(s, catKey, catMeta.fbKey)).join('');
    scrollEl.classList.remove('cat-stores-marquee');
    scrollEl.style.cssText = '';

    scrollEl.querySelectorAll('.store-card[data-store-name]').forEach(card => {
        if (card.classList.contains('store-card--soon'))   return;
        if (card.classList.contains('store-card--closed')) return;
        card.addEventListener('click', () => {
            if (typeof openStorePanel === 'function')
                openStorePanel(card.dataset.storeId, card.dataset.storeName, card.dataset.fbType);
        });
    });
    _initDragScroll(scrollEl);
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
                 style="width:100%;height:100%;object-fit:cover;display:block;"
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

function _initDragScroll(row) {
    if (!row) return;
    let isDown = false, startX, scrollLeft, hasDragged = false;
    row.addEventListener('mousedown', e => { isDown=true; hasDragged=false; row.classList.add('dragging'); startX=e.pageX-row.offsetLeft; scrollLeft=row.scrollLeft; });
    row.addEventListener('mouseleave', () => { isDown=false; row.classList.remove('dragging'); });
    row.addEventListener('mouseup',    () => { isDown=false; row.classList.remove('dragging'); });
    row.addEventListener('mousemove', e => {
        if (!isDown) return;
        const x = e.pageX - row.offsetLeft;
        if (Math.abs(x-startX) > 5) { hasDragged=true; e.preventDefault(); row.scrollLeft = scrollLeft-(x-startX)*1.5; }
    });
    row.addEventListener('click', e => { if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged=false; } }, true);
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