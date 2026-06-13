/* ============================================================
   scripts/categories.js
   Category buttons → Firebase fetch → dropdown.
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

function initCategories() {
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
    const arr = Object.values(data)
        .filter(s => s && s.companyname && !s.disabled && s.disabled !== '1' && s.disabled !== 1)
        .sort((a, b) => {
            // 1st: priority (lower number = higher position; undefined = last)
            const pa = a.priority !== undefined ? parseInt(a.priority) : 9999;
            const pb = b.priority !== undefined ? parseInt(b.priority) : 9999;
            if (pa !== pb) return pa - pb;
            // 2nd: rank (higher rating first)
            return (parseFloat(b.rank) || 0) - (parseFloat(a.rank) || 0);
        })
        .map(s => {
            const st     = status && status[s.companyname];
            const closed = st && (st.closed === true || st.closed === '1' || st.closed === 1);
            return closed ? { ...s, _closed: true, _closedReason: st.reason || '', _opensAt: st.opensAt || '' } : s;
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

    const cardsHTML = stores.map(s => _storeCardHTML(s, catKey, catMeta.fbKey)).join('');

    /* Use marquee when 3+ stores, plain scroll otherwise */
    if (stores.length >= 3) {
        scrollEl.innerHTML = '';
        scrollEl.classList.add('cat-stores-marquee');
        scrollEl.style.cssText = 'overflow:hidden;padding:clamp(8px,2vw,12px) 0 clamp(10px,2.5vw,16px);direction:ltr;';
        /* Single set of cards — no duplication needed for ping-pong */
        scrollEl.innerHTML = `
            <div class="cat-stores-marquee-track" id="cat-marquee-track" style="direction:ltr;">
                ${cardsHTML}
            </div>`;

        /* Compute exact overflow after dropdown finishes opening */
        setTimeout(() => {
            const track = document.getElementById('cat-marquee-track');
            if (!track) return;
            const overflow = track.scrollWidth - scrollEl.offsetWidth;
            if (overflow <= 0) return;
            track.style.setProperty('--marquee-end', `-${overflow}px`);
            const dur = Math.round(overflow / 80);
            track.style.animationDuration = `${Math.max(3, dur)}s`;
        }, 350);

        /* Pause on touch */
        scrollEl.addEventListener('touchstart', () => scrollEl.classList.add('paused'),    { passive: true });
        scrollEl.addEventListener('touchend',   () => scrollEl.classList.remove('paused'), { passive: true });

        /* Wire clicks — all cards are real (no clones) */
        scrollEl.querySelectorAll('.store-card[data-store-name]').forEach(card => {
            if (card.classList.contains('store-card--soon'))   return;
            if (card.classList.contains('store-card--closed')) return;
            card.addEventListener('click', () => {
                if (typeof openStorePanel === 'function')
                    openStorePanel(card.dataset.storeId, card.dataset.storeName, card.dataset.fbType);
            });
        });
    } else {
        /* Plain drag-scroll for small lists */
        scrollEl.innerHTML = cardsHTML;
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
}

/* ── Arabic display names — keyed by Firebase companyname ─── */
const STORE_NAME_AR = {
    'Classic-Food'    : 'كلاسيك فود',
    'King-Pizza'      : 'كينغ بيتزا',
    'Zahret-Lobnan'   : 'زهرة لبنان',
    'Al-Amana'        : 'الأمانة',
    'Hellani-Kitchen' : 'حلاني كيتشن',
    'Bhalib'          : 'بحليب',
    'AL-Beik'         : 'البيك',
    'AL-Fajr'         : 'الفجر',
    'Assaf-Grocery'   : 'بقالة عساف',
    'Foodigo'         : 'فوديغو',
    'Minini'          : 'ميني ني',
    'Pan-Corner'      : 'بان كورنر',
    'Cesar'           : 'سيزار',
    'Al-Kanater'      : 'القناطر',
    'Shams-Pool'      : 'شمس بول',
    'Shams Pool'      : 'شمس بول',
    'Al Kanater'      : 'القناطر',
};

function _storeCardHTML(store, catKey, fbType) {
    const rawName  = store.companyname;
    const name     = STORE_NAME_AR[rawName] || rawName;
    const rank     = store.rank ? parseFloat(store.rank).toFixed(1) : null;
    const isSoon   = store.soon == '1' || store.soon === 1;
    const isClosed = !!store._closed;
    const imgBase  = `${STORE_IMG}/${encodeURIComponent(rawName.toLowerCase())}`;
    const imgUrl   = `${imgBase}.webp`;
    const id       = rawName.toLowerCase().replace(/\s+/g, '-');

    // Resolve "opens at" human string
    let opensChip = '';
    if (isClosed && store._opensAt) {
        const dt = new Date(store._opensAt);
        let opensStr = store._opensAt;
        if (!isNaN(dt) && dt > new Date()) {
            const now2       = new Date();
            const nowDate2   = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
            const dtDate2    = new Date(dt.getFullYear(),  dt.getMonth(),  dt.getDate());
            const dayDiff2   = Math.round((dtDate2 - nowDate2) / 86400000);
            const t          = dt.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', hour12:true });
            const days       = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
            const months     = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
            const sameYear2  = dt.getFullYear() === now2.getFullYear();
            if (dayDiff2 === 0)      opensStr = `اليوم ${t}`;
            else if (dayDiff2 === 1) opensStr = `غداً ${t}`;
            else if (dayDiff2 < 7)  opensStr = `${days[dt.getDay()]} ${t}`;
            else {
                const datePart2 = sameYear2
                    ? `${dt.getDate()} ${months[dt.getMonth()]}`
                    : `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
                opensStr = `${days[dt.getDay()]} ${datePart2} ${t}`;
            }
        }
        opensChip = `<div class="store-card__opens-chip">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            يفتح ${opensStr}
        </div>`;
    }

    const stateClass  = isClosed ? 'store-card--closed' : isSoon ? 'store-card--soon' : '';
    const stateStyle  = (isClosed || isSoon) ? 'cursor:default;pointer-events:none;' : 'cursor:pointer;';

    return `
    <div class="store-card ${stateClass}"
         data-store-name="${rawName}" data-store-id="${id}" data-fb-type="${fbType}"
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
                ${isClosed ? opensChip || '<span class="store-card__min-label" style="color:#9898a6;">مغلق مؤقتاً</span>'
                           : isSoon ? '<span class="store-card__min-label">قريباً</span>'
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
    return {
        restaurants:'🍔', meat:'🥩',      bakery:'🥖',     supermarket:'🛒',
        sweets:'🍰',      fish:'🐟',       coffee:'☕',     chickenshop:'🍗',
        dairyshop:'🥛',   groceries:'🧺',  flowershop:'💐', taxi:'🚕',
        tobacco:'🚬',     toys:'🧸'
    }[cat] || '🏪';
}

function _catLabel(cat) {
    return {
        restaurants:'مطعم',    meat:'ملحمة',      bakery:'مخبز',     supermarket:'سوبرماركت',
        sweets:'حلويات',       fish:'أسماك',       coffee:'قهوة',     chickenshop:'دجاج',
        dairyshop:'ألبان',     groceries:'بقالة',  flowershop:'زهور', taxi:'تاكسي',
        tobacco:'تبغ',         toys:'ألعاب'
    }[cat] || '';
}

window.initCategories   = initCategories;
window.closeCatDropdown = _closeDropdown;
// Allow the realtime listener to bust the cache so next open re-fetches
window._invalidateCategoriesCache = function() { _cache = {}; };