/* ============================================================
   stores.js — Dynamic store listing from Firebase pattern/
   - Loads all stores from RTDB (same source as admin)
   - Uses nameAr field set in admin for Arabic display name
   - Falls back to cleaned-up English name if nameAr not set
   - Auto-derives image path from companyname slug
   ============================================================ */

const STORES_RTDB_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

/* ── Arabic type tags per Firebase store type ────────────── */
const TYPE_TAGS_AR = {
    Restaurants  : 'مطعم',
    ButcherShops : 'ملحمة',
    BakeryShops  : 'مخبز',
    Markets      : 'سوبرماركت',
    GroceryShops : 'بقالة',
    SweetsShops  : 'حلويات',
    FishShops    : 'أسماك',
    CoffeeShops  : 'قهوة',
    ChickenShops : 'دجاج',
    DairyShops   : 'ألبان',
    FlowerShops  : 'زهور',
    TobaccoShops : 'تبغ',
};

const TYPE_EMOJI_STORE = {
    Restaurants  : '🍽️',
    ButcherShops : '🥩',
    BakeryShops  : '🥖',
    Markets      : '🛒',
    GroceryShops : '🧺',
    SweetsShops  : '🍰',
    FishShops    : '🐟',
    CoffeeShops  : '☕',
    ChickenShops : '🍗',
    DairyShops   : '🥛',
    FlowerShops  : '💐',
    TobaccoShops : '🚬',
};

/* ── Helpers ─────────────────────────────────────────────── */
const STORE_IMG_PATH = './assets';
function _slugHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
}
function toSlug(companyname) {
    const cleaned = companyname.toLowerCase()
        .replace(/[^\x00-\x7F]/g, '')  // strip Arabic/non-ASCII
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    if (cleaned) return cleaned;
    // No usable ASCII characters at all (e.g. an Arabic-only company name
    // with no English imgSlug override set in admin). Do NOT fall back to
    // a shared literal like 'store' here — that silently makes every such
    // store point at the exact same image file. Hash the real name instead,
    // so two different Arabic-only names never collide onto the same path.
    // (No real asset will exist at this hashed path, so it correctly falls
    // through to the placeholder icon instead of showing a wrong logo.)
    return '_noimg-' + _slugHash(companyname);
}
function _storeImgSlug(store) {
    if (store.imgSlug && store.imgSlug.trim()) return store.imgSlug.trim().toLowerCase();
    return toSlug(store.companyname);
}
function cleanEnglishName(companyname) {
    return companyname.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Rank medal colours ──────────────────────────────────── */
const RANK_META = [
    { label: '#1', bg: '#FFD700', color: '#7a5800', icon: '🥇' },
    { label: '#2', bg: '#C0C0C0', color: '#444',    icon: '🥈' },
    { label: '#3', bg: '#CD7F32', color: '#fff',    icon: '🥉' },
    { label: '#4', bg: '#f0f0f0', color: '#666',    icon: '4'  },
    { label: '#5', bg: '#f0f0f0', color: '#666',    icon: '5'  },
];

/* ── Fetch all stores from Firebase pattern/ ─────────────── */
async function fetchAllStores() {
    try {
        const res  = await fetch(`${STORES_RTDB_URL}/pattern.json`);
        const data = await res.json();
        if (!data) return [];

        const seen   = new Set();
        const stores = [];

        for (const [type, entries] of Object.entries(data)) {
            if (!entries || typeof entries !== 'object') continue;
            const arr = Array.isArray(entries) ? entries : Object.values(entries);
            for (const s of arr) {
                if (!s || !s.companyname) continue;
                const name = s.companyname.trim();
                if (seen.has(name)) continue;
                seen.add(name);
                stores.push({
                    companyname : name,
                    nameAr      : s.nameAr  || '',   // ← Arabic name set in admin
                    imgSlug     : s.imgSlug || '',    // ← override image slug set in admin
                    type,
                    rank        : s.rank || 0,
                    disabled    : s.disabled,
                });
            }
        }
        return stores;
    } catch (e) {
        console.warn('[Stores] Could not fetch pattern:', e);
        return [];
    }
}

/* ── Store-count RTDB key (must match admin.html / driver.html) ──
   RTDB path segments can't contain . # $ [ ] / so we sanitise.    */
function _countKey(name) {
    return String(name || '').trim().toLowerCase().replace(/[.#$[\]/]/g, '_');
}

/* ── Fetch per-store delivered-order counts ────────────────
   Reads storeOrderCounts/ — a small flat node that admin.html and
   driver.html keep atomically up to date whenever an order flips
   to/from "delivered". This avoids ever downloading the full
   historyRequests tree (which only grows and would eventually make
   every homepage load slower) just to rank stores.             ── */
async function fetchStoreCounts() {
    try {
        const res  = await fetch(`${STORES_RTDB_URL}/storeOrderCounts.json`);
        const data = await res.json();
        return data || {};
    } catch (e) {
        console.warn('[Stores] Could not fetch storeOrderCounts:', e);
        return {};
    }
}

/* ── Build store data object ─────────────────────────────── */
function buildStoreData(s, counts, storeStatus) {
    const name   = s.companyname;
    const slug   = _storeImgSlug(s);          // always English, safe for filenames
    const idSlug = toSlug(name) || slug;      // for data-store-id (may be empty if Arabic)
    // Use admin-set Arabic name; fallback to cleaned English if not set yet
    const nameAr = s.nameAr && s.nameAr.trim() ? s.nameAr.trim() : cleanEnglishName(name);
    const type   = s.type;
    const tagAr  = TYPE_TAGS_AR[type] || type;
    const emoji  = TYPE_EMOJI_STORE[type] || '🏪';
    const img         = `assets/${slug}.webp`;
    const imgFallback = `assets/${slug}.png`;
    const requests    = counts[_countKey(name)] || counts[_countKey(slug)] || 0;
    const st          = storeStatus[name] || null;
    const closed      = st && (st.closed === true || st.closed === '1' || st.closed === 1);

    return {
        id            : idSlug || slug,
        name          : nameAr,
        rtdbKey       : name,
        tags          : tagAr,
        img, imgFallback, emoji,
        type          : idSlug || slug,
        fireType      : type,
        requests,
        disabled      : s.disabled,
        _closed       : closed,
        _closedReason : closed ? (st.reason  || '') : '',
        _opensAt      : closed ? (st.opensAt || '') : '',
    };
}

/* ── Render the section ──────────────────────────────────── */
async function renderTopStores() {
    const section = document.getElementById('stores-section');
    if (!section) return;

    renderSkeletons(section);

    const [allStoresFb, counts, storeStatusRaw] = await Promise.all([
        fetchAllStores(),
        fetchStoreCounts(),
        fetch(`${STORES_RTDB_URL}/storeStatus.json`).then(r => r.json()).catch(() => null),
    ]);
    const storeStatus = storeStatusRaw || {};

    const ranked = allStoresFb
        .filter(s => !s.disabled)
        .map(s => buildStoreData(s, counts, storeStatus))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 5);

    const totalRequests = ranked.reduce((sum, s) => sum + s.requests, 0);

    const scroll = section.querySelector('.stores__scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    ranked.forEach((store, idx) => {
        const rank  = RANK_META[idx];
        const pct   = totalRequests > 0 ? Math.round((store.requests / totalRequests) * 100) : 0;
        const isTop = idx === 0;

        let opensChip = '';
        if (store._closed && store._opensAt) {
            const dt = new Date(store._opensAt);
            let opensStr = store._opensAt;
            if (!isNaN(dt) && dt > new Date()) {
                const now     = new Date();
                const dayDiff = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()) -
                                            new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
                const t    = dt.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', hour12:true });
                const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
                if      (dayDiff === 0) opensStr = `اليوم ${t}`;
                else if (dayDiff === 1) opensStr = `غداً ${t}`;
                else if (dayDiff < 7)  opensStr = `${days[dt.getDay()]} ${t}`;
                else opensStr = dt.toLocaleDateString('ar-LB');
            }
            opensChip = `<div class="store-card__opens-chip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                يفتح ${opensStr}
            </div>`;
        }

        scroll.insertAdjacentHTML('beforeend', `
        <div class="store-card ${isTop ? 'store-card--top' : ''} ${store._closed ? 'store-card--closed' : ''}"
             data-store-id="${store.id}"
             data-store-rtdbkey="${store.rtdbKey}"
             data-store-name="${store.name}"
             data-store-firetype="${store.fireType}"
             style="${store._closed ? 'pointer-events:none;cursor:not-allowed;' : ''}">

            <div class="store-card__rank" style="background:${rank.bg};color:${rank.color};">${rank.icon}</div>

            <div class="store-card__thumb store-thumb" style="background-image:url('${store.img}');">
                <img src="${store.img}" alt="${store.name}" class="store-card__thumb-img"
                     style="display:none"
                     onerror="if(this.src.endsWith('.webp')){this.src='${store.imgFallback}';this.parentElement.style.backgroundImage=&quot;url('${store.imgFallback}')&quot;;}else{this.style.display='none';this.parentElement.style.backgroundImage='none';var fb=this.parentElement.querySelector('.store-card__thumb-fallback');if(fb)fb.style.display='flex';}">
                <div class="store-card__thumb-fallback"
                     style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.5rem;background:#f7f7f8;">${store.emoji}</div>
                ${!store._closed ? `<button class="store-card__wish" aria-label="حفظ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </button>
                <div class="store-card__rating">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>4.5
                </div>` : ''}
                ${store._closed ? `<div class="store-card__closed-badge">
                    <span class="store-card__closed-badge__icon">🔒</span>
                    <span class="store-card__closed-badge__label">مغلق الآن</span>
                </div>` : ''}
            </div>

            <div class="store-card__body">
                <p class="store-card__name">${store.name}</p>
                <p class="store-card__tags">${store.tags}</p>
                ${store._closed && store._closedReason ? `<p class="store-card__closed-reason">${store._closedReason}</p>` : ''}
                ${store._closed ? opensChip : ''}

                <div class="store-card__stat">
                    <div class="store-card__stat-row">
                        <span class="store-card__stat-label">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <path d="M16 10a4 4 0 01-8 0"/>
                            </svg>
                            ${store.requests > 0 ? store.requests + ' طلب' : 'جديد'}
                        </span>
                        <span class="store-card__stat-pct">${pct}%</span>
                    </div>
                    <div class="store-card__stat-bar">
                        <div class="store-card__stat-fill ${isTop ? 'store-card__stat-fill--top' : ''}"
                             style="width:${pct}%"></div>
                    </div>
                </div>
            </div>
        </div>`);
    });

    const headerEl = section.querySelector('.stores__stat-total');
    if (headerEl) {
        headerEl.textContent = totalRequests > 0 ? `${totalRequests} طلب منجز` : 'لا توجد طلبات بعد';
    }

    wireStoreEvents(section);
}

/* ── Skeleton loader ─────────────────────────────────────── */
function renderSkeletons(section) {
    const scroll = section.querySelector('.stores__scroll');
    if (!scroll) return;
    scroll.innerHTML = Array(5).fill(0).map(() => `
        <div class="store-card store-card--skeleton">
            <div class="sk-thumb"></div>
            <div class="store-card__body">
                <div class="sk-line sk-line--name"></div>
                <div class="sk-line sk-line--tags"></div>
                <div class="sk-line sk-line--bar"></div>
                <div class="sk-line sk-line--footer"></div>
            </div>
        </div>`).join('');
}

/* ── Event wiring ────────────────────────────────────────── */
function wireStoreEvents(section) {
    section.querySelectorAll('.store-card:not(.store-card--skeleton):not(.store-card--closed)').forEach(card => {
        card.addEventListener('click', () => {
            const storeId   = card.getAttribute('data-store-id');
            const storeName = card.getAttribute('data-store-name') || card.getAttribute('data-store-rtdbkey');
            const rtdbKey   = card.getAttribute('data-store-rtdbkey');
            const fireType  = card.getAttribute('data-store-firetype');
            if (storeId && typeof openStorePanel === 'function') {
                openStorePanel(storeId, storeName, fireType, rtdbKey);
            }
        });
    });
    section.querySelectorAll('.store-card__wish').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); btn.classList.toggle('active'); });
    });
}

/* ── Scroll drag ─────────────────────────────────────────── */
function initScrollDrag() {
    const scrollRows = document.querySelectorAll('.categories__scroll, .stores__scroll, .offers__scroll');
    scrollRows.forEach(row => {
        let isDown = false, startX, scrollLeft, hasDragged = false;
        row.addEventListener('mousedown', e => { isDown = true; hasDragged = false; row.classList.add('dragging'); startX = e.pageX - row.offsetLeft; scrollLeft = row.scrollLeft; });
        row.addEventListener('mouseleave', () => { isDown = false; hasDragged = false; row.classList.remove('dragging'); });
        row.addEventListener('mouseup', () => { isDown = false; row.classList.remove('dragging'); });
        row.addEventListener('mousemove', e => {
            if (!isDown) return;
            const x = e.pageX - row.offsetLeft;
            if (Math.abs(x - startX) > 5) { hasDragged = true; e.preventDefault(); row.scrollLeft = scrollLeft - (x - startX) * 1.5; }
        });
        row.addEventListener('click', e => { if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged = false; } }, true);
        let touchStartX, touchScrollLeft;
        row.addEventListener('touchstart', e => { touchStartX = e.touches[0].pageX - row.offsetLeft; touchScrollLeft = row.scrollLeft; }, { passive: true });
        row.addEventListener('touchmove', e => { const x = e.touches[0].pageX - row.offsetLeft; row.scrollLeft = touchScrollLeft - (x - touchStartX) * 1.5; }, { passive: true });
    });
}

/* ── Category filter ─────────────────────────────────────── */
function initCategoryFilter() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-category]');
        if (!btn) return;
        document.querySelectorAll('[data-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
}

/* ── Real-time nameAr listener ───────────────────────────────
   Listens to Firebase SSE on /pattern.json.
   When any store's nameAr changes, surgically updates the
   matching card's .store-card__name text in the DOM — no
   full re-render, no page refresh needed.                    */
function _startStoreNameSSE() {
    // _nameArCache: { companyname → last known nameAr }
    const _cache = {};

    function _applyNameAr(companyname, nameAr) {
        const section = document.getElementById('stores-section');
        const display = nameAr && nameAr.trim()
            ? nameAr.trim()
            : cleanEnglishName(companyname);

        // Update main stores-section cards
        if (section) {
            section.querySelectorAll(`.store-card[data-store-rtdbkey="${companyname}"]`).forEach(card => {
                const nameEl = card.querySelector('.store-card__name');
                if (nameEl && nameEl.textContent !== display) {
                    nameEl.textContent = display;
                    nameEl.style.transition = 'color 0.4s';
                    nameEl.style.color = 'var(--clr-orange, #FF5C00)';
                    setTimeout(() => { nameEl.style.color = ''; }, 1200);
                }
            });
        }

        // Also update category dropdown cards (multi-store fix)
        if (typeof window._onCategoryNameArChange === 'function') {
            window._onCategoryNameArChange(companyname, nameAr);
        }
    }

    function _processPattern(data) {
        if (!data || typeof data !== 'object') return;
        for (const [, entries] of Object.entries(data)) {
            if (!entries || typeof entries !== 'object') continue;
            const arr = Array.isArray(entries) ? entries : Object.values(entries);
            for (const s of arr) {
                if (!s || !s.companyname) continue;
                const name   = s.companyname.trim();
                const nameAr = s.nameAr || '';
                if (_cache[name] !== nameAr) {
                    _cache[name] = nameAr;
                    _applyNameAr(name, nameAr);
                }
            }
        }
    }

    let _sse = null;
    let _retryMs = 3000;

    function _connect() {
        if (_sse) { try { _sse.close(); } catch (_) {} _sse = null; }
        try {
            _sse = new EventSource(`${STORES_RTDB_URL}/pattern.json`);
            _sse.addEventListener('put', e => {
                try {
                    const msg = JSON.parse(e.data);
                    _processPattern(msg.data);
                } catch (_) {}
                _retryMs = 3000;
            });
            _sse.addEventListener('patch', e => {
                try {
                    const msg = JSON.parse(e.data);
                    _processPattern(msg.data);
                } catch (_) {}
            });
            _sse.onerror = () => {
                try { _sse.close(); } catch (_) {}
                _sse = null;
                setTimeout(_connect, _retryMs);
                _retryMs = Math.min(_retryMs * 2, 30000);
            };
        } catch (_) {
            // EventSource not supported — fall back to polling every 15s
            _pollNameAr();
        }
    }

    async function _pollNameAr() {
        try {
            const r = await fetch(`${STORES_RTDB_URL}/pattern.json`);
            const data = await r.json();
            _processPattern(data);
        } catch (_) {}
        setTimeout(_pollNameAr, 15000);
    }

    _connect();
}

/* ── Entry point ─────────────────────────────────────────── */
function initStores() {
    initScrollDrag();
    initCategoryFilter();
    renderTopStores();
    initOffersCarousel();
    _startStoreNameSSE();
    window.refreshStoreCounts = renderTopStores;
}

/* ── Offers carousel ─────────────────────────────────────── */

const RTDB_SALES_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

// Gradient palettes for sale cards — cycle through these
const SALE_GRADIENTS = [
    'linear-gradient(135deg,#7c2d12 0%,#dc2626 55%,#b91c1c 100%)',  // red
    'linear-gradient(135deg,#1e3a5f 0%,#1a56db 60%,#1d4ed8 100%)', // blue
    'linear-gradient(135deg,#14532d 0%,#16a34a 60%,#15803d 100%)', // green
    'linear-gradient(135deg,#4a1d96 0%,#7c3aed 60%,#6d28d9 100%)', // purple
    'linear-gradient(135deg,#78350f 0%,#d97706 60%,#b45309 100%)', // amber
    'linear-gradient(135deg,#0f172a 0%,#0e7490 60%,#0891b2 100%)', // cyan
];

async function _fetchAndInjectSaleCards() {
    const track = document.getElementById('offers-track');
    if (!track) return;

    try {
        const res  = await fetch(`${RTDB_SALES_URL}/sales.json?shallow=false`);
        const data = await res.json();
        if (!data || typeof data !== 'object') return;

        // Collect all active sales across all stores
        const allSales = [];
        for (const [storeName, storeSales] of Object.entries(data)) {
            if (!storeSales || typeof storeSales !== 'object') continue;
            for (const [id, s] of Object.entries(storeSales)) {
                if (s && s.active !== false && s.title) {
                    allSales.push({ id, storeName, ...s });
                }
            }
        }

        if (!allSales.length) return;

        // Fetch store types from pattern for storeType lookup — also build a logo-slug map
        // so each sale card can show the store's actual logo (same resolution rule used
        // everywhere else in the app: imgSlug override, else slugified companyname).
        let storeTypeMap = {};
        let storeLogoMap = {};
        try {
            const pr = await fetch(`${RTDB_SALES_URL}/pattern.json`);
            const pd = await pr.json();
            if (pd && typeof pd === 'object') {
                for (const [type, entries] of Object.entries(pd)) {
                    const arr = Array.isArray(entries) ? entries : Object.values(entries || {});
                    arr.forEach(s => {
                        if (s?.companyname) {
                            storeTypeMap[s.companyname] = type;
                            storeLogoMap[s.companyname] = _storeImgSlug(s);
                        }
                    });
                }
            }
        } catch(_) {}

        // Insert cards before the loyalty card (last card) so static cards stay first
        const loyaltyCard = track.querySelector('.offer-card--loyalty, #loyalty-card');
        let gradIdx = 0;

        allSales.forEach(sale => {
            const saleP   = parseFloat(sale.salePrice) || 0;
            const origP   = parseFloat(sale.origPrice)  || 0;
            const curr    = sale.currency === 'LBP' ? 'ل.ل' : '$';
            const pct     = origP > saleP && origP > 0 ? Math.round((1 - saleP/origP)*100) : 0;
            const storeType = storeTypeMap[sale.storeName] || '';

            // Items summary (max 2 items shown)
            const itemsSummary = Array.isArray(sale.items)
                ? sale.items.slice(0,2).map(i => { const q=parseInt(i.qty)||1; return i.name?(q>1?`${q}× ${i.name}`:i.name):''; }).filter(Boolean).join(' + ')
                  + (sale.items.length > 2 ? ` +${sale.items.length-2}` : '')
                : '';

            const grad = SALE_GRADIENTS[gradIdx % SALE_GRADIENTS.length];
            gradIdx++;

            // Build sale payload for cart
            const payload = encodeURIComponent(JSON.stringify({
                storeName : sale.storeName,
                storeType,
                saleTitle : sale.title,
                salePrice : saleP,
                items     : Array.isArray(sale.items) ? sale.items : [],
                image     : sale.image || '',
            }));

            // Pick symbol based on gradient index
            const SALE_SYMBOLS = ['assets/cat_sweets.png','assets/cat_meat.png','assets/cat_burger.png','assets/cat_bread.png','assets/cat_chicken.png','assets/cat_grocery.png'];
            const symbolSrc = SALE_SYMBOLS[gradIdx % SALE_SYMBOLS.length];

            const logoSlug = storeLogoMap[sale.storeName] || toSlug(sale.storeName);
            const logoUrl  = `${STORE_IMG_PATH}/${logoSlug}.webp`;

            const card = document.createElement('div');
            card.className = 'offer-card offer-card--sale-dynamic';
            card.dataset.saleId = sale.id;
            card.style.cssText = `background:${grad};`;

            card.innerHTML = `
                <!-- Symbol image — right side like old cards -->
                <div class="offer-card__img-wrap">
                    <img src="${symbolSrc}" alt="" class="offer-card__img" onerror="this.src='assets/cat_burger.png'">
                </div>

                <!-- Text content — left side -->
                <div class="offer-card__content">
                    ${pct > 0 ? `<div class="offer-card__code">خصم ${pct}%</div>` : ''}
                    <p class="offer-card__title">${sale.title}</p>
                    ${itemsSummary ? `<p class="offer-card__sub">${itemsSummary}</p>` : ''}
                    <div style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
                        <span style="font-size:clamp(0.82rem,3vw,1rem);font-weight:900;color:#fff;">${saleP}${curr}</span>
                        ${origP > saleP ? `<span style="font-size:0.62rem;color:rgba(255,255,255,0.55);text-decoration:line-through;">${origP}${curr}</span>` : ''}
                    </div>
                    <button class="offer-sale-add-btn" onclick="event.stopPropagation();_addSaleFromCarousel(this,'${payload}')">
                        🛒 أضف للسلة
                    </button>
                </div>

                <!-- Store-logo badge — bottom-center of the whole card, tap for all this store's sales -->
                <button class="offer-sale-store-btn" type="button" aria-label="كل عروض هذا المتجر">
                    <img src="${logoUrl}" alt="" onerror="this.style.display='none';this.parentElement.textContent='🏪'">
                </button>

                <!-- Shimmer shine — same as loyalty card -->
                <div class="offer-card__sale-shimmer"></div>
            `;

            card.querySelector('.offer-sale-store-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                openStoreSalesPanel(sale.storeName, storeType, logoUrl);
            });

            if (loyaltyCard) {
                track.insertBefore(card, loyaltyCard);
            } else {
                track.appendChild(card);
            }
        });

    } catch(e) {
        console.warn('[Sales carousel]', e);
    }
}

// Add sale to cart from the carousel button
window._addSaleFromCarousel = function(btn, encodedPayload) {
    try {
        const sale = JSON.parse(decodeURIComponent(encodedPayload));
        const cart = window.DelivoCart;
        if (!cart || typeof cart.addItem !== 'function') {
            // Not on index — redirect with session storage
            const { storeName, storeType, saleTitle, salePrice, items, image } = sale;
            sessionStorage.setItem('pendingSaleCart', JSON.stringify({ storeName, storeType, saleTitle, salePrice, items, image, ts: Date.now() }));
            window.location.href = 'index.html#open-cart';
            return;
        }
        const { storeName, storeType, saleTitle, salePrice, items, image } = sale;
        const summary = (items || []).map(i => { const q=parseInt(i.qty)||1; return i.name?(q>1?`${q}× ${i.name}`:i.name):''; }).filter(Boolean).join(' + ');
        const bundleName = saleTitle + (summary ? ` (${summary})` : '');
        cart.addItem(`sale__${Date.now()}__i`, bundleName, salePrice, storeName, storeType, 'عرض خاص', image);

        // Feedback
        btn.textContent = '✅ أُضيف!';
        btn.style.background = 'rgba(34,197,94,0.4)';
        setTimeout(() => { btn.textContent = '🛒 أضف'; btn.style.background = 'rgba(255,255,255,0.2)'; }, 2000);

        // Open cart
        setTimeout(() => { if (typeof openCartSidebar === 'function') openCartSidebar(); }, 300);
    } catch(e) { console.error('[carousel cart]', e); }
};

/* ══════════════════════════════════════════════════════════
   STORE SALES PANEL — "كل عروض هذا المتجر"
   Opened by tapping a sale card's store-logo button. Fetches
   every active sale under /sales/{storeName} and lists them
   in a bottom sheet, each addable to the cart directly.
   ══════════════════════════════════════════════════════════ */
function _ensureStoreSalesPanel() {
    if (document.getElementById('store-sales-panel')) return;

    const overlay = document.createElement('div');
    overlay.className = 'store-sales-overlay';
    overlay.id = 'store-sales-overlay';
    overlay.addEventListener('click', closeStoreSalesPanel);

    const panel = document.createElement('div');
    panel.className = 'store-sales-panel';
    panel.id = 'store-sales-panel';
    panel.innerHTML = `
        <div class="store-sales-panel__header">
            <div class="store-sales-panel__store">
                <div class="store-sales-panel__logo-wrap">
                    <img id="ssp-logo" src="" alt="" onerror="this.style.display='none';this.parentElement.textContent='🏪'">
                </div>
                <div>
                    <div class="store-sales-panel__title">عروض المتجر</div>
                    <div class="store-sales-panel__store-name" id="ssp-store-name"></div>
                </div>
            </div>
            <button class="store-sales-panel__close" id="ssp-close" aria-label="إغلاق">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="store-sales-panel__body" id="ssp-body"></div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.getElementById('ssp-close').addEventListener('click', closeStoreSalesPanel);
}

async function openStoreSalesPanel(storeName, storeType, logoUrl) {
    _ensureStoreSalesPanel();

    document.getElementById('ssp-logo').src        = logoUrl || '';
    document.getElementById('ssp-store-name').textContent = storeName;

    const body = document.getElementById('ssp-body');
    body.innerHTML = `
        <div class="store-sales-panel__loading">
            <div class="store-sales-panel__spinner"></div>
            جاري تحميل العروض...
        </div>`;

    document.getElementById('store-sales-overlay').classList.add('active');
    document.getElementById('store-sales-panel').classList.add('active');
    document.body.classList.add('modal-open');

    try {
        const res  = await fetch(`${RTDB_SALES_URL}/sales/${encodeURIComponent(storeName)}.json`);
        const data = await res.json();
        const sales = data && typeof data === 'object'
            ? Object.entries(data)
                .filter(([, s]) => s && s.active !== false && s.title)
                .map(([id, s]) => ({ id, ...s }))
            : [];

        if (!sales.length) {
            body.innerHTML = `<div class="store-sales-panel__empty">🙁 لا توجد عروض حالياً من هذا المتجر</div>`;
            return;
        }

        body.innerHTML = sales.map(sale => {
            const saleP = parseFloat(sale.salePrice) || 0;
            const origP = parseFloat(sale.origPrice)  || 0;
            const curr  = sale.currency === 'LBP' ? 'ل.ل' : '$';
            const pct   = origP > saleP && origP > 0 ? Math.round((1 - saleP/origP)*100) : 0;
            const itemsSummary = Array.isArray(sale.items)
                ? sale.items.slice(0,3).map(i => { const q=parseInt(i.qty)||1; return i.name?(q>1?`${q}× ${i.name}`:i.name):''; }).filter(Boolean).join(' + ')
                : '';
            const payload = encodeURIComponent(JSON.stringify({
                storeName, storeType,
                saleTitle : sale.title,
                salePrice : saleP,
                items     : Array.isArray(sale.items) ? sale.items : [],
                image     : sale.image || '',
            }));
            return `
                <div class="store-sales-item">
                    ${pct > 0 ? `<div class="store-sales-item__badge">خصم ${pct}%</div>` : ''}
                    <div class="store-sales-item__title">${sale.title}</div>
                    ${itemsSummary ? `<div class="store-sales-item__sub">${itemsSummary}</div>` : ''}
                    <div class="store-sales-item__row">
                        <div class="store-sales-item__price">
                            <span class="store-sales-item__price-new">${saleP}${curr}</span>
                            ${origP > saleP ? `<span class="store-sales-item__price-old">${origP}${curr}</span>` : ''}
                        </div>
                        <button class="store-sales-item__add" onclick="_addSaleFromCarousel(this,'${payload}')">🛒 أضف للسلة</button>
                    </div>
                </div>`;
        }).join('');
    } catch(e) {
        body.innerHTML = `<div class="store-sales-panel__empty">⚠️ تعذّر تحميل العروض، حاول مجدداً</div>`;
    }
}

function closeStoreSalesPanel() {
    const overlay = document.getElementById('store-sales-overlay');
    const panel   = document.getElementById('store-sales-panel');
    if (overlay) overlay.classList.remove('active');
    if (panel)   panel.classList.remove('active');
    if (!document.getElementById('item-popup')?.classList.contains('active') &&
        !document.getElementById('store-panel')?.classList.contains('active')) {
        document.body.classList.remove('modal-open');
    }
}

window.openStoreSalesPanel  = openStoreSalesPanel;
window.closeStoreSalesPanel = closeStoreSalesPanel;

async function initOffersCarousel() {
    // First inject sale cards, then start carousel
    await _fetchAndInjectSaleCards();

    const scroll = document.getElementById('offers-scroll');
    const dotsEl = document.getElementById('offers-dots');
    if (!scroll || !dotsEl) return;
    const cards = scroll.querySelectorAll('.offer-card');
    const total = cards.length;
    if (total === 0) return;
    let current = 0, autoTimer = null;
    const isPhone = () => window.innerWidth < 540;
    function buildDots() {
        dotsEl.innerHTML = '';
        if (!isPhone()) return;
        cards.forEach((_, i) => {
            const dot = document.createElement('span');
            dot.className = 'offers__dot' + (i === current ? ' active' : '');
            dot.addEventListener('click', () => goTo(i));
            dotsEl.appendChild(dot);
        });
    }
    function updateDots() { dotsEl.querySelectorAll('.offers__dot').forEach((d, i) => d.classList.toggle('active', i === current)); }
    function goTo(index) {
        if (!isPhone()) return;
        current = (index + total) % total;
        const card = cards[current];
        const padLeft = parseInt(getComputedStyle(scroll).paddingLeft) || 0;
        scroll.scrollTo({ left: card.offsetLeft - padLeft, behavior: 'smooth' });
        updateDots();
    }
    function next() { goTo(current + 1); }
    function startAuto() { stopAuto(); if (!isPhone()) return; autoTimer = setInterval(next, 3500); }
    function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    scroll.addEventListener('touchstart', stopAuto, { passive: true });
    scroll.addEventListener('mousedown', stopAuto);
    scroll.addEventListener('touchend', () => setTimeout(startAuto, 4000), { passive: true });
    scroll.addEventListener('mouseup', () => setTimeout(startAuto, 4000));
    scroll.addEventListener('scrollend', () => {
        if (!isPhone()) return;
        const center = scroll.scrollLeft + scroll.clientWidth / 2;
        let closest = 0, minDist = Infinity;
        cards.forEach((c, i) => { const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center); if (dist < minDist) { minDist = dist; closest = i; } });
        current = closest; updateDots();
    });
    window.addEventListener('resize', () => { buildDots(); if (isPhone()) startAuto(); else stopAuto(); });
    buildDots();
    startAuto();
}