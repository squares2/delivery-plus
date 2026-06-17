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
function toSlug(companyname) {
    return companyname.toLowerCase()
        .replace(/[^\x00-\x7F]/g, '')  // strip Arabic/non-ASCII
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'store';
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
                    nameAr      : s.nameAr || '',   // ← Arabic name set in admin
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

/* ── Fetch historyRequests and aggregate counts ──────────── */
async function fetchStoreCounts() {
    try {
        const res  = await fetch(`${STORES_RTDB_URL}/historyRequests.json?shallow=false`);
        const data = await res.json();
        if (!data) return {};
        const counts = {};
        Object.values(data).forEach(userOrders => {
            if (!userOrders || typeof userOrders !== 'object') return;
            Object.values(userOrders).forEach(req => {
                if (String(req.state) !== '1') return;
                const s = (req.store || '').trim().toLowerCase();
                if (s) counts[s] = (counts[s] || 0) + 1;
            });
        });
        return counts;
    } catch (e) {
        console.warn('[Stores] Could not fetch historyRequests:', e);
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
    const requests    = counts[name.toLowerCase()] || counts[slug] || 0;
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
             data-store-firetype="${store.fireType}"
             style="${store._closed ? 'pointer-events:none;cursor:not-allowed;' : ''}">

            <div class="store-card__rank" style="background:${rank.bg};color:${rank.color};">${rank.icon}</div>

            <div class="store-card__thumb store-thumb" style="background-image:url('${store.img}');">
                <img src="${store.img}" alt="${store.name}" class="store-card__thumb-img"
                     style="display:none"
                     onerror="this.style.display='none';
                              this.parentElement.style.backgroundImage=&quot;url('${store.imgFallback}')&quot;;">
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
            const storeId  = card.getAttribute('data-store-id');
            const rtdbKey  = card.getAttribute('data-store-rtdbkey');
            const fireType = card.getAttribute('data-store-firetype');
            if (storeId && typeof openStorePanel === 'function') {
                openStorePanel(storeId, rtdbKey, fireType);
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
function initOffersCarousel() {
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
    function startAuto() { stopAuto(); if (!isPhone()) return; autoTimer = setInterval(next, 3000); }
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