/* ============================================================
   stores.js — Dynamic top-5 stores ranked by request count
   Reads /requests from RTDB, counts per store, renders cards
   ============================================================ */

const STORES_RTDB_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

/* ── Static store registry — rtdbKey must match Firebase requests.store field exactly ── */
const STORE_REGISTRY = [
    {
        id:      'classic-food',
        name:    'كلاسيك فود',
        rtdbKey: 'Classic-Food',
        tags:    'شاورما • غربي',
        img:     'assets/classic-food.png',
        type:    'restaurants',
        min:     '500,000 ل.ل',
        time:    '20-30 د',
    },
    {
        id:      'king-pizza',
        name:    'كينغ بيتزا',
        rtdbKey: 'King-Pizza',
        tags:    'بيتزا',
        img:     'assets/king-pizza.webp',
        type:    'restaurants',
        min:     '500,000 ل.ل',
        time:    '20-30 د',
    },
    {
        id:      'zahret-lobnan',
        name:    'زهرة لبنان',
        rtdbKey: 'Zahret-Lobnan',
        tags:    'مطعم',
        img:     'assets/zahret-lobnan.png',
        type:    'restaurants',
        min:     '500,000 ل.ل',
        time:    '20-30 د',
        imgContain: true,
    },
    {
        id:      'al-amana',
        name:    'الأمانة',
        rtdbKey: 'Al-Amana',
        tags:    'سوبرماركت',
        img:     'assets/al-amana.png',
        emoji:   '🛒',
        type:    'supermarket',
        min:     '200,000 ل.ل',
        time:    '20-35 د',
    },
    {
        id:      'hellani-kitchen',
        name:    'حلاني كيتشن',
        rtdbKey: 'Hellani-Kitchen',
        tags:    'مطبخ منزلي',
        img:     'assets/hellani-kitchen.webp',
        type:    'restaurants',
        min:     '300,000 ل.ل',
        time:    '25-40 د',
    },
    {
        id:      'bhalib',
        name:    'بحليب',
        rtdbKey: 'Bhalib',
        tags:    'حلويات • ألبان',
        img:     'assets/bhalib.webp',
        type:    'supermarket',
        min:     '200,000 ل.ل',
        time:    '15-25 د',
    },
    {
        id:      'al-beik',
        name:    'البيك',
        rtdbKey: 'AL-Beik',
        tags:    'برجر • وجبات',
        img:     'assets/al-beik.png',
        emoji:   '🍔',
        type:    'restaurants',
        min:     '200,000 ل.ل',
        time:    '20-30 د',
    },
    {
        id:      'al-fajr',
        name:    'الفجر',
        rtdbKey: 'AL-Fajr',
        tags:    'ملحمة',
        img:     'assets/al-fajr.png',
        emoji:   '🥩',
        type:    'meat',
        min:     '150,000 ل.ل',
        time:    '20-35 د',
    },
    {
        id:      'assaf-grocery',
        name:    'بقالة عساف',
        rtdbKey: 'Assaf-Grocery',
        tags:    'بقالة',
        img:     'assets/assaf-grocery.png',
        emoji:   '🧺',
        type:    'supermarket',
        min:     '100,000 ل.ل',
        time:    '15-25 د',
    },
    {
        id:      'foodigo',
        name:    'فوديغو',
        rtdbKey: 'Foodigo',
        tags:    'سوبرماركت',
        img:     'assets/foodigo.png',
        emoji:   '🛒',
        type:    'supermarket',
        min:     '200,000 ل.ل',
        time:    '20-30 د',
    },
    {
        id:      'minini',
        name:    'ميني ني',
        rtdbKey: 'Minini',
        tags:    'ملحمة',
        img:     'assets/minini.png',
        emoji:   '🥩',
        type:    'meat',
        min:     '150,000 ل.ل',
        time:    '20-35 د',
    },
];

/* ── Rank medal colours ────────────────────────────────────── */
const RANK_META = [
    { label: '#1', bg: '#FFD700', color: '#7a5800', icon: '🥇' },
    { label: '#2', bg: '#C0C0C0', color: '#444',    icon: '🥈' },
    { label: '#3', bg: '#CD7F32', color: '#fff',    icon: '🥉' },
    { label: '#4', bg: '#f0f0f0', color: '#666',    icon: '4'  },
    { label: '#5', bg: '#f0f0f0', color: '#666',    icon: '5'  },
];

/* ── Fetch /requests and aggregate counts ──────────────────── */
async function fetchStoreCounts() {
    try {
        const res  = await fetch(`${STORES_RTDB_URL}/requests.json?shallow=false`);
        const data = await res.json();
        if (!data) return {};

        const counts = {};
        Object.values(data).forEach(req => {
            const s = (req.store || '').trim();
            if (s) {
                // Normalise to lowercase for matching
                const key = s.toLowerCase();
                counts[key] = (counts[key] || 0) + 1;
            }
        });
        return counts;
    } catch (e) {
        console.warn('[Stores] Could not fetch requests:', e);
        return {};
    }
}

/* ── Render the section ────────────────────────────────────── */
async function renderTopStores() {
    const section = document.getElementById('stores-section');
    if (!section) return;

    /* Show skeleton while loading */
    renderSkeletons(section);

    const [counts, storeStatusRaw] = await Promise.all([
        fetchStoreCounts(),
        fetch(`${STORES_RTDB_URL}/storeStatus.json`).then(r => r.json()).catch(() => null),
    ]);
    const storeStatus = storeStatusRaw || {};

    /* Sort registry by request count descending, take top 5 */
    const ranked = [...STORE_REGISTRY]
        .map(s => {
            const st     = storeStatus[s.rtdbKey] || storeStatus[s.name] || null;
            const closed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
            return { ...s, requests: counts[s.rtdbKey.toLowerCase()] || 0,
                     _closed: closed,
                     _closedReason: closed ? (st.reason  || '') : '',
                     _opensAt:      closed ? (st.opensAt || '') : '' };
        })
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 5);

    const totalRequests = ranked.reduce((sum, s) => sum + s.requests, 0);

    /* Build HTML */
    const scroll = section.querySelector('.stores__scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    ranked.forEach((store, idx) => {
        const rank      = RANK_META[idx];
        const pct       = totalRequests > 0 ? Math.round((store.requests / totalRequests) * 100) : 0;
        const isTop     = idx === 0;
        const imgStyle  = store.imgContain
            ? `background-image:url('${store.img}');background-size:contain;background-color:#fff;`
            : `background-image:url('${store.img}');`;
        const storeEmoji = store.emoji || (store.type === 'restaurants' ? '🍽️' : store.type === 'supermarket' ? '🛒' : store.type === 'meat' ? '🥩' : store.type === 'coffee' ? '☕' : store.type === 'sweets' ? '🍰' : store.type === 'bakery' ? '🥖' : store.type === 'fish' ? '🐟' : '🏪');

        // Compute opens-at chip for closed stores
        let opensChipTop = '';
        if (store._closed && store._opensAt) {
            const dt = new Date(store._opensAt);
            let opensStr = store._opensAt;
            if (!isNaN(dt) && dt > new Date()) {
                const now3      = new Date();
                const nowDate3  = new Date(now3.getFullYear(), now3.getMonth(), now3.getDate());
                const dtDate3   = new Date(dt.getFullYear(),  dt.getMonth(),  dt.getDate());
                const dayDiff3  = Math.round((dtDate3 - nowDate3) / 86400000);
                const t         = dt.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', hour12:true });
                const days      = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
                const months3   = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
                const sameYear3 = dt.getFullYear() === now3.getFullYear();
                if (dayDiff3 === 0)      opensStr = `اليوم ${t}`;
                else if (dayDiff3 === 1) opensStr = `غداً ${t}`;
                else if (dayDiff3 < 7)  opensStr = `${days[dt.getDay()]} ${t}`;
                else {
                    const datePart3 = sameYear3
                        ? `${dt.getDate()} ${months3[dt.getMonth()]}`
                        : `${dt.getDate()} ${months3[dt.getMonth()]} ${dt.getFullYear()}`;
                    opensStr = `${days[dt.getDay()]} ${datePart3} ${t}`;
                }
            }
            opensChipTop = `<div class="store-card__opens-chip">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                يفتح ${opensStr}
            </div>`;
        }

        scroll.insertAdjacentHTML('beforeend', `
        <div class="store-card ${isTop ? 'store-card--top' : ''} ${store._closed ? 'store-card--closed' : ''}"
             data-store-id="${store.id}"
             data-store-type="${store.type}"
             style="${store._closed ? 'pointer-events:none;cursor:not-allowed;' : ''}">

            <!-- Rank badge -->
            <div class="store-card__rank"
                 style="background:${rank.bg};color:${rank.color};">
                ${rank.icon}
            </div>

            <div class="store-card__thumb store-thumb" style="${imgStyle}"
                 onerror-target="sc-img-${store.id}">
                <img src="${store.img}" alt="${store.name}" class="store-card__thumb-img"
                     style="display:none"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="store-card__thumb-fallback" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.5rem;background:#f7f7f8;">${storeEmoji}</div>
                ${!store._closed ? `<button class="store-card__wish" aria-label="حفظ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="#fff" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
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
                ${store._closed ? opensChipTop : ''}

                <!-- Request stat bar -->
                <div class="store-card__stat">
                    <div class="store-card__stat-row">
                        <span class="store-card__stat-label">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="2.5"
                                 stroke-linecap="round" stroke-linejoin="round">
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

    /* Update header with live total */
    const headerEl = section.querySelector('.stores__stat-total');
    if (headerEl) {
        headerEl.textContent = totalRequests > 0
            ? `${totalRequests} طلب منجز`
            : 'لا توجد طلبات بعد';
    }

    /* Re-wire events */
    wireStoreEvents(section);
}

/* ── Skeleton loader ───────────────────────────────────────── */
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

/* ── Name & type maps — must match store-panel.js nameMap ─── */
const SP_NAME_MAP = {
    'classic-food'    : 'Classic-Food',
    'king-pizza'      : 'King-Pizza',
    'zahret-lobnan'   : 'Zahret-Lobnan',
    'burger-house'    : 'AL-Beik',
    'al-beik'         : 'AL-Beik',
    'al-fajr'         : 'AL-Fajr',
    'al-amana'        : 'Al-Amana',
    'assaf-grocery'   : 'Assaf-Grocery',
    'bhalib'          : 'Bhalib',
    'foodigo'         : 'Foodigo',
    'hellani-kitchen' : 'Hellani-Kitchen',
    'minini'          : 'Minini',
};
const SP_TYPE_MAP = {
    restaurants  : 'Restaurants',
    coffee       : 'CoffeeShops',
    supermarket  : 'Markets',
    sweets       : 'SweetsShops',
    meat         : 'ButcherShops',
    fish         : 'FishShops',
    bakery       : 'BakeryShops',
};

/* ── Event wiring ──────────────────────────────────────────── */
function wireStoreEvents(section) {
    section.querySelectorAll('.store-card:not(.store-card--skeleton):not(.store-card--closed)').forEach(card => {
        card.addEventListener('click', () => {
            const storeId   = card.getAttribute('data-store-id');
            const storeType = card.getAttribute('data-store-type');
            const fireName  = SP_NAME_MAP[storeId] || storeId;
            const fireType  = SP_TYPE_MAP[storeType] || 'Restaurants';
            if (storeId && typeof openStorePanel === 'function') {
                openStorePanel(storeId, fireName, fireType);
            }
        });
    });

    section.querySelectorAll('.store-card__wish').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            btn.classList.toggle('active');
        });
    });
}

/* ── Scroll drag (shared rows) ─────────────────────────────── */
function initScrollDrag() {
    const scrollRows = document.querySelectorAll(
        '.categories__scroll, .stores__scroll, .offers__scroll'
    );
    scrollRows.forEach(row => {
        let isDown = false, startX, scrollLeft, hasDragged = false;
        row.addEventListener('mousedown', e => {
            isDown = true; hasDragged = false;
            row.classList.add('dragging');
            startX = e.pageX - row.offsetLeft;
            scrollLeft = row.scrollLeft;
        });
        row.addEventListener('mouseleave', () => { isDown = false; hasDragged = false; row.classList.remove('dragging'); });
        row.addEventListener('mouseup',    () => { isDown = false; row.classList.remove('dragging'); });
        row.addEventListener('mousemove', e => {
            if (!isDown) return;
            const x = e.pageX - row.offsetLeft;
            if (Math.abs(x - startX) > 5) {
                hasDragged = true;
                e.preventDefault();
                row.scrollLeft = scrollLeft - (x - startX) * 1.5;
            }
        });
        row.addEventListener('click', e => {
            if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged = false; }
        }, true);
        let touchStartX, touchScrollLeft;
        row.addEventListener('touchstart', e => {
            touchStartX = e.touches[0].pageX - row.offsetLeft;
            touchScrollLeft = row.scrollLeft;
        }, { passive: true });
        row.addEventListener('touchmove', e => {
            const x = e.touches[0].pageX - row.offsetLeft;
            row.scrollLeft = touchScrollLeft - (x - touchStartX) * 1.5;
        }, { passive: true });
    });
}

/* ── Category filter — only affects categories scroll, not stores section ── */
function initCategoryFilter() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-category]');
        if (!btn) return;
        document.querySelectorAll('[data-category]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        /* Intentionally does NOT touch store cards — stores section
           is ranked by requests and is independent of category tabs */
    });
}

/* ── Entry point ───────────────────────────────────────────── */
function initStores() {
    initScrollDrag();
    initCategoryFilter();
    renderTopStores();
    initOffersCarousel();
}

/* ── Offers carousel (unchanged) ──────────────────────────── */
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
    function updateDots() {
        dotsEl.querySelectorAll('.offers__dot').forEach((d, i) => d.classList.toggle('active', i === current));
    }
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
    function stopAuto()  { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
    scroll.addEventListener('touchstart', stopAuto, { passive: true });
    scroll.addEventListener('mousedown',  stopAuto);
    scroll.addEventListener('touchend',   () => setTimeout(startAuto, 4000), { passive: true });
    scroll.addEventListener('mouseup',    () => setTimeout(startAuto, 4000));
    scroll.addEventListener('scrollend', () => {
        if (!isPhone()) return;
        const center = scroll.scrollLeft + scroll.clientWidth / 2;
        let closest = 0, minDist = Infinity;
        cards.forEach((c, i) => {
            const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
            if (dist < minDist) { minDist = dist; closest = i; }
        });
        current = closest;
        updateDots();
    });
    window.addEventListener('resize', () => { buildDots(); if (isPhone()) startAuto(); else stopAuto(); });
    buildDots();
    startAuto();
}