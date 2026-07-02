/* ============================================================
   scripts/store-panel.js  v3 — description input (no keywords)
   For Restaurants & BakeryShops:
     • Direct add (+ button on card) → adds instantly, no modal
     • Item detail popup            → shows a free-text input for notes
   Cart item shape: { id, name, price, storeName, storeType, notes? }
   ============================================================ */

const RTDB_URL  = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

// Guards against a stale _loadStorePanel() call still running (and still
// writing to the DOM / eating main-thread time) after the panel has been
// closed and reopened again — e.g. quickly tapping a store, going back,
// and tapping it again before the first load finished.
let _spLoadGen = 0;
const GH_IMAGES = './items2';

/* Store types that show description input inside item popup */
const CUSTOMIZABLE_TYPES = ['Restaurants', 'BakeryShops'];

/* ── Category emoji map ───────────────────────────────────── */
const STORE_TYPE_EMOJI = {
    Restaurants  : '🍽️',
    BakeryShops  : '🥖',
    ButcherShops : '🥩',
    CoffeeShops  : '☕',
    Markets      : '🛒',
    SweetsShops  : '🍰',
    FishShops    : '🐟',
};

/* ── Helpers ──────────────────────────────────────────────── */
function rtdbGet(path) {
    return fetch(`${RTDB_URL}/${path}.json`)
        .then(r => {
            if (!r.ok) throw new Error(`RTDB ${r.status}`);
            return r.json();
        });
}

function formatPrice(p) {
    const n = parseFloat(p);
    if (isNaN(n)) return '';
    if (n < 1000) return '$' + n.toFixed(n % 1 === 0 ? 0 : 2);
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' مليون ل.ل';
    return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + ' ألف ل.ل';
}

/* ── Panel state ──────────────────────────────────────────── */
let _currentStore = null;
let _activeTab    = null;
const _spCache    = {};

/* ── Store Intro ──────────────────────────────────────────── */
function _ensureIntroCard() {
    if (document.getElementById('store-intro')) return;
    const el = document.createElement('div');
    el.className = 'store-intro';
    el.id = 'store-intro';
    el.innerHTML = `
        <div class="store-intro__bg">
            <div class="store-intro__blob"></div>
            <div class="store-intro__blob"></div>
            <div class="store-intro__blob"></div>
        </div>
        <div class="store-intro__logo-wrap" id="si-logo-wrap">
            <img class="store-intro__logo-img" id="si-logo-img" src="" alt=""
                 style="display:none"
                 onerror="this.style.display='none';document.getElementById('si-logo-emoji').style.display='block'">
            <span class="store-intro__logo-emoji" id="si-logo-emoji" style="display:none"></span>
        </div>
        <div class="store-intro__name"  id="si-name"></div>
        <div class="store-intro__cat"   id="si-cat"></div>
        <div class="store-intro__rating" id="si-rating" style="display:none">
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span id="si-rating-val"></span>
        </div>
        <div class="store-intro__dots" id="si-dots">
            <div class="store-intro__dot active"></div>
            <div class="store-intro__dot"></div>
            <div class="store-intro__dot"></div>
        </div>
        <div class="store-intro__progress" id="si-progress"></div>
    `;
    document.body.appendChild(el);
}

function showStoreIntro(storeId, storeName, storeType, storeMeta, onDone) {
    _ensureIntroCard();
    const card     = document.getElementById('store-intro');
    const logoImg  = document.getElementById('si-logo-img');
    const logoEmoji= document.getElementById('si-logo-emoji');
    const nameEl   = document.getElementById('si-name');
    const catEl    = document.getElementById('si-cat');
    const ratingEl = document.getElementById('si-rating');
    const ratingVal= document.getElementById('si-rating-val');
    const progress = document.getElementById('si-progress');
    const dots     = document.querySelectorAll('.store-intro__dot');
    const DURATION = 2200;

    nameEl.textContent = (storeMeta && storeMeta.nameAr && storeMeta.nameAr.trim())
        ? storeMeta.nameAr.trim()
        : storeName;
    catEl.textContent  = (_typeEmoji(storeType) || '') + '  ' + (_typeLabel(storeType) || storeType);
    const rank = storeMeta && storeMeta.rank ? parseFloat(storeMeta.rank) : null;
    if (rank) { ratingVal.textContent = rank.toFixed(1); ratingEl.style.display = 'flex'; }
    else       { ratingEl.style.display = 'none'; }

    const _introImgSl = _getImgSlug(storeId, storeMeta);
    const logoPath    = `assets/${_introImgSl}.webp`;
    const logoPngPath = `assets/${_introImgSl}.png`;
    logoImg.style.display  = 'none';
    logoEmoji.style.display = 'none';
    logoImg.onload  = () => { logoImg.style.display = 'block'; logoEmoji.style.display = 'none'; };
    logoImg.onerror = function() {
        if (this.src.includes('.webp')) { this.src = logoPngPath; return; }
        logoImg.style.display = 'none'; logoEmoji.textContent = _typeEmoji(storeType) || '🏪'; logoEmoji.style.display = 'block';
    };
    logoImg.src = logoPath;

    card.classList.remove('exit');
    card.style.display = 'flex';
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { card.classList.add('visible'); }));

    progress.style.transition = 'none';
    progress.style.transform = 'scaleX(0)';
    requestAnimationFrame(() => {
        progress.style.transition = `transform ${DURATION}ms linear`;
        progress.style.transform = 'scaleX(1)';
    });

    let dotIdx = 0;
    const dotTimer = setInterval(() => {
        dots.forEach(d => d.classList.remove('active'));
        dotIdx = (dotIdx + 1) % dots.length;
        dots[dotIdx].classList.add('active');
    }, DURATION / 4);

    setTimeout(() => {
        clearInterval(dotTimer);
        const logoWrap = document.getElementById('si-logo-wrap');
        const fromRect = logoWrap.getBoundingClientRect();
        const heroH    = Math.min(200, window.innerHeight * 0.28);
        const toX      = window.innerWidth / 2;
        const toY      = heroH / 2;
        const toScale  = 0.55;
        const dX = toX - (fromRect.left + fromRect.width / 2);
        const dY = toY - (fromRect.top  + fromRect.height / 2);
        logoWrap.style.transition = 'transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease';
        logoWrap.style.transformOrigin = 'center center';
        logoWrap.style.transform = `translate(${dX}px, ${dY}px) scale(${toScale})`;
        logoWrap.style.opacity   = '0';
        nameEl.style.transition = 'opacity 0.25s ease';
        catEl.style.transition  = 'opacity 0.25s ease';
        nameEl.style.opacity    = '0';
        catEl.style.opacity     = '0';
        if (ratingEl) { ratingEl.style.transition = 'opacity 0.25s'; ratingEl.style.opacity = '0'; }
        card.classList.add('exit');
        setTimeout(() => {
            card.classList.remove('visible', 'exit');
            card.style.display = 'none';
            logoWrap.style.transform  = '';
            logoWrap.style.opacity    = '';
            logoWrap.style.transition = '';
            nameEl.style.opacity = catEl.style.opacity = '';
            progress.style.transform = 'scaleX(0)';
            onDone();
        }, 460);
    }, DURATION);
}

// rtdbKey = original Firebase companyname key (always English).
// storeName = display name shown in UI (may be Arabic).
// Regular cards:  openStorePanel(slug, 'Classic-Food', type)          -> rtdbKey defaults to storeName
// Mealtime cards: openStorePanel('Classic-Food', 'كلاسيك فود', type, 'Classic-Food')
let _introInProgress = false; // prevents overlapping intro timer chains from rapid repeated taps
function openStorePanel(storeId, storeName, storeType, rtdbKey) {
    if (_introInProgress) return; // ignore taps while the ~2.6s intro animation is already playing
    const _fireKey = rtdbKey || storeName; // always the English Firebase key
    const _introCacheKey = `pattern_${storeType}`;
    const _introFetch = _spCache[_introCacheKey]
        ? Promise.resolve(_spCache[_introCacheKey])
        : rtdbGet(`pattern/${storeType}`).then(d => { _spCache[_introCacheKey] = d; return d; });

    _introFetch
        .then(patternData => {
            let storeMeta = null;
            if (patternData && typeof patternData === 'object') {
                storeMeta = Object.values(patternData).find(s => s && s.companyname === _fireKey);
            }
            _introInProgress = true;
            setTimeout(() => { _introInProgress = false; }, 3000); // failsafe — cycle normally completes in ~2.66s
            showStoreIntro(storeId, storeName, storeType, storeMeta, () => {
                _introInProgress = false;
                _openStorePanelNow(storeId, storeName, storeType, _fireKey);
            });
        })
        .catch(() => { _openStorePanelNow(storeId, storeName, storeType, _fireKey); });
}

function _openStorePanelNow(storeId, storeName, storeType, rtdbKey) {
    const _fireKey = rtdbKey || storeName;
    _currentStore = { id: storeId, name: storeName, type: storeType, rtdbKey: _fireKey };
    window._currentStore = _currentStore;
    const overlay = document.getElementById('store-panel-overlay');
    const panel   = document.getElementById('store-panel');
    if (!overlay || !panel) return;

    document.getElementById('sp-hero-name').textContent = storeName;
    document.getElementById('sp-hero-meta').innerHTML   = '';
    document.getElementById('sp-tabs-inner').innerHTML  = '';
    document.getElementById('sp-body').innerHTML        = renderSkeleton();
    document.getElementById('sp-cart-bar').classList.remove('visible');

    const logoImg    = document.getElementById('sp-hero-logo');
    const logoEmoji  = document.getElementById('sp-hero-logo-emoji');
    const bgImg      = document.getElementById('sp-hero-bg');
    const videoEl    = document.getElementById('sp-hero-video');
    const fallbackEl = document.getElementById('sp-hero-fallback');
    // storeId may be Arabic if companyname was renamed — strip non-ASCII for file paths
    const _heroImgSl  = _getImgSlug(storeId, null);
    const logoPath    = `assets/${_heroImgSl}.webp`;
    const logoPngPath = `assets/${_heroImgSl}.png`;
    const emojiDef    = _typeEmoji(storeType) || '🏪';

    if (logoImg)   { logoImg.style.display = 'none'; logoImg.src = ''; }
    if (logoEmoji) { logoEmoji.style.display = 'none'; logoEmoji.textContent = emojiDef; }
    if (bgImg)     { bgImg.style.display = 'none'; bgImg.src = ''; }
    if (fallbackEl){ fallbackEl.style.display = 'none'; }

    /* ── Hero video: try assets/videos/{slug}.webm → .mp4 → fallback to image ── */
    if (videoEl) {
        videoEl.style.display = 'none';
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();

        const tryVideo = (src) => new Promise(resolve => {
            videoEl.src = src;
            videoEl.oncanplay  = () => resolve(true);
            videoEl.onerror    = () => resolve(false);
            videoEl.load();
        });

        (async () => {
            const webm = await tryVideo(`assets/videos/${_heroImgSl}.webm`);
            if (webm) {
                videoEl.style.display = 'block';
                videoEl.play().catch(() => {});
                if (bgImg)     { bgImg.style.display = 'none'; }
                if (fallbackEl){ fallbackEl.style.display = 'none'; }
                return;
            }
            const mp4 = await tryVideo(`assets/videos/${_heroImgSl}.mp4`);
            if (mp4) {
                videoEl.style.display = 'block';
                videoEl.play().catch(() => {});
                if (bgImg)     { bgImg.style.display = 'none'; }
                if (fallbackEl){ fallbackEl.style.display = 'none'; }
                return;
            }
            /* No video found — fall through to blurred image below */
            videoEl.style.display = 'none';
        })();
    }

    if (logoImg) {
        logoImg.onload = () => {
            logoImg.style.display = 'block';
            if (logoEmoji) logoEmoji.style.display = 'none';
            if (bgImg) { bgImg.src = logoImg.src; bgImg.style.display = 'block'; }
            if (fallbackEl) fallbackEl.style.display = 'none';
        };
        logoImg.onerror = function() {
            if (this.src.includes('.webp')) { this.src = logoPngPath; return; }
            logoImg.style.display = 'none';
            if (logoEmoji) { logoEmoji.textContent = emojiDef; logoEmoji.style.display = 'flex'; }
            if (fallbackEl){ fallbackEl.textContent = emojiDef; fallbackEl.style.display = 'flex'; }
        };
        logoImg.src = logoPath;
        logoImg.alt = storeName;
    }

    overlay.classList.add('active');
    panel.classList.add('active');
    document.body.classList.add('modal-open');
    _loadStorePanel(_fireKey, storeType);
}

function closeStorePanel() {
    const overlay = document.getElementById('store-panel-overlay');
    const panel   = document.getElementById('store-panel');
    if (overlay) overlay.classList.remove('active');
    if (panel)   panel.classList.remove('active');
    document.body.classList.remove('modal-open');
    window._currentStore = null;
    const wrap = document.getElementById('sp-subcat-wrap');
    if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    /* Stop & reset hero video */
    const videoEl = document.getElementById('sp-hero-video');
    if (videoEl) {
        videoEl.pause();
        videoEl.style.display = 'none';
        videoEl.removeAttribute('src');
        videoEl.load();
    }
    _currentStore = null;
    _activeTab    = null;
}

/* ── Closed-store: humanise the opensAt string ────────────── */
function _formatOpensAt(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Already human-readable Arabic (admin typed it): return as-is
    // Try to parse ISO / "YYYY-MM-DD HH:mm"
    const dt = new Date(s);
    if (!isNaN(dt)) {
        const now  = new Date();
        const diff = dt - now;
        if (diff <= 0) return null; // already past — treat as open
        // Compare calendar dates (not milliseconds) to avoid timezone "today/tomorrow" errors
        const nowDate  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dtDate   = new Date(dt.getFullYear(),  dt.getMonth(),  dt.getDate());
        const dayDiff  = Math.round((dtDate - nowDate) / 86400000);
        const timeStr  = dt.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: true });
        const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const monthNames = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
        if (dayDiff === 0) return `اليوم الساعة ${timeStr}`;
        if (dayDiff === 1) return `غداً الساعة ${timeStr}`;
        if (dayDiff < 7)   return `${dayNames[dt.getDay()]} الساعة ${timeStr}`;
        // Beyond 7 days — build date manually to avoid locale formatting issues
        const sameYear = dt.getFullYear() === now.getFullYear();
        const datePart = sameYear
            ? `${dt.getDate()} ${monthNames[dt.getMonth()]}`
            : `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}`;
        return `${dayNames[dt.getDay()]} ${datePart} الساعة ${timeStr}`;
    }
    return s; // return as-is if unparseable
}

/* ── Load & render ────────────────────────────────────────── */
async function _loadStorePanel(storeName, storeType) {
    const myGen = ++_spLoadGen;
    const body = document.getElementById('sp-body');
    try {
        // ── Check closed status first (fast parallel fetch) ──
        const [patternData, storeStatusData] = await Promise.all([
            (_spCache[`pattern_${storeType}`]
                ? Promise.resolve(_spCache[`pattern_${storeType}`])
                : rtdbGet(`pattern/${storeType}`).then(d => { _spCache[`pattern_${storeType}`] = d; return d; })
            ),
            rtdbGet(`storeStatus/${storeName}`).catch(() => null),
        ]);
        if (myGen !== _spLoadGen) return; // superseded by a newer store open

        const _cacheKey = `pattern_${storeType}`;
        _spCache[_cacheKey] = patternData;

        let storeMeta = null;
        if (patternData && typeof patternData === 'object') {
            storeMeta = Object.values(patternData).find(s => s && s.companyname === storeName);
        }

        const metaEl = document.getElementById('sp-hero-meta');
        const emoji  = STORE_TYPE_EMOJI[storeType] || '🏪';

        // Update hero name to Arabic if nameAr is set
        if (storeMeta && storeMeta.nameAr && storeMeta.nameAr.trim()) {
            const heroNameEl = document.getElementById('sp-hero-name');
            if (heroNameEl) heroNameEl.textContent = storeMeta.nameAr.trim();
        }

        // Re-load hero logo with correct imgSlug now that storeMeta is available
        if (storeMeta) {
            const correctSlug = _getImgSlug(storeName, storeMeta);
            const heroLogo = document.getElementById('sp-hero-logo');
            const heroBg   = document.getElementById('sp-hero-bg');
            if (heroLogo && !heroLogo.src.includes(`/${correctSlug}.`)) {
                const correctPath = `assets/${correctSlug}.webp`;
                const correctPng  = `assets/${correctSlug}.png`;
                heroLogo.onerror = function() {
                    if (this.src.includes('.webp')) { this.src = correctPng; return; }
                    heroLogo.style.display = 'none';
                };
                heroLogo.onload = () => {
                    heroLogo.style.display = 'block';
                    if (heroBg) { heroBg.src = heroLogo.src; heroBg.style.display = 'block'; }
                };
                heroLogo.src = correctPath;
            }
        }

        // ── Handle closed state ───────────────────────────────
        const isClosed = storeStatusData && (storeStatusData.closed === true || storeStatusData.closed === '1' || storeStatusData.closed === 1);
        if (isClosed) {
            const reason   = storeStatusData.reason  || 'المتجر مغلق مؤقتاً';
            const opensAt  = _formatOpensAt(storeStatusData.opensAt);
            const opensRaw = storeStatusData.opensAt || '';

            // Hero meta badge
            if (metaEl) {
                metaEl.innerHTML = `
                    <span class="sp-hero__badge">${emoji} ${_typeLabel(storeType)}</span>
                    <span class="sp-hero__badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3);">🔴 مغلق الآن</span>
                `;
            }

            // Body: full closed screen
            body.innerHTML = `
            <div class="sp-closed">
                <div class="sp-closed__shutter">
                    <span class="sp-closed__shutter-icon">🔒</span>
                    <span class="sp-closed__shutter-dot"></span>
                </div>
                <div class="sp-closed__title">المتجر مغلق الآن</div>
                <div class="sp-closed__reason">${reason}</div>
                ${opensAt ? `
                <div class="sp-closed__opens">
                    <span class="sp-closed__opens-icon">🕐</span>
                    <div class="sp-closed__opens-text">
                        <div class="sp-closed__opens-label">موعد الفتح</div>
                        <div class="sp-closed__opens-time">${opensAt}</div>
                    </div>
                </div>` : ''}
                <div class="sp-closed__divider"></div>
                <p class="sp-closed__cta">تفضّل بزيارتنا لاحقاً —<br><strong>سنكون بخدمتك قريباً!</strong></p>
            </div>`;
            // Hide tabs and cart bar since store is closed
            document.getElementById('sp-tabs-inner').innerHTML = '';
            const subcatWrap = document.getElementById('sp-subcat-wrap');
            if (subcatWrap) { subcatWrap.style.display = 'none'; subcatWrap.innerHTML = ''; }
            return;
        }

        // ── Normal open flow below ────────────────────────────
        if (storeMeta) {
            metaEl.innerHTML = `
                <span class="sp-hero__badge">${emoji} ${_typeLabel(storeType)}</span>
                ${storeMeta.rank ? `<span class="sp-hero__badge sp-hero__badge--orange">⭐ ${storeMeta.rank}</span>` : ''}
                ${storeMeta.soon == '1' || storeMeta.soon === 1 ? '<span class="sp-hero__badge sp-hero__badge--soon">⏳ قريباً</span>' : ''}
            `;
            if (storeMeta.soon == '1' || storeMeta.soon === 1) {
                body.innerHTML = `<div class="sp-soon">
                    <div class="sp-soon__icon">🚧</div>
                    <div class="sp-soon__title">قريباً!</div>
                    <div class="sp-soon__sub">هذا المتجر سيكون متاحاً قريباً.<br>ترقّبوا العروض والأصناف الجديدة.</div>
                </div>`;
                return;
            }
        }

        let items = await rtdbGet(`items/${storeName}`);
        console.log(`[StorePanel] items/${storeName} →`, items ? 'found ✓' : 'null');
        // Fallback: try lowercase key in case Firebase key doesn't match case
        if (!items) {
            items = await rtdbGet(`items/${storeName.toLowerCase()}`).catch(() => null);
            console.log(`[StorePanel] items/${storeName.toLowerCase()} →`, items ? 'found ✓' : 'null');
        }
        // Fallback: try slug (hyphens) version — e.g. "Shams Resort" → "shams-resort"
        if (!items) {
            const _slugFb = storeName.toLowerCase().replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
            if (_slugFb !== storeName.toLowerCase()) {
                items = await rtdbGet(`items/${_slugFb}`).catch(() => null);
                console.log(`[StorePanel] items/${_slugFb} →`, items ? 'found ✓' : 'null');
            }
        }
        // Fallback: try no-spaces version — e.g. "Shams Resort" → "shamsresort"
        if (!items) {
            const _nosp = storeName.toLowerCase().replace(/\s+/g,'');
            items = await rtdbGet(`items/${_nosp}`).catch(() => null);
            console.log(`[StorePanel] items/${_nosp} →`, items ? 'found ✓' : 'null');
        }
        if (!items) {
            body.innerHTML = `<div class="sp-empty">
                <div class="sp-empty__icon">🛍️</div>
                <div class="sp-empty__title">لا توجد أصناف</div>
                <div class="sp-empty__sub">لم يتم إضافة منتجات لهذا المتجر بعد</div>
            </div>`;
            return;
        }
        if (myGen !== _spLoadGen) return; // superseded by a newer store open

        const tree = {};
        Object.values(items).forEach(item => {
            if (!item || !item.name) return;
            const main = (item.catmain || 'عام').trim();
            const sub  = (item.cat    || 'عام').trim();
            if (!tree[main])      tree[main] = {};
            if (!tree[main][sub]) tree[main][sub] = [];
            tree[main][sub].push(item);
        });

        // Apply admin-defined category order (settings/categoryOrder/{storeName})
        const catOrder = await rtdbGet(`settings/categoryOrder/${storeName}`).catch(() => null);
        if (myGen !== _spLoadGen) return; // superseded by a newer store open
        const mains = _sortByOrder(Object.keys(tree), catOrder?.main);

        const tabsEl = document.getElementById('sp-tabs-inner');
        tabsEl.innerHTML = mains.map((main, i) => `
            <button class="sp-tab ${i === 0 ? 'active' : ''}"
                    data-cat="${main}"
                    onclick="spSelectMain('${main}')">
                ${main}
            </button>`).join('');
        /* Wire drag-scroll on the main tabs row */
        const tabsRow = document.querySelector('.sp-tabs');
        if (tabsRow) _initDragScroll(tabsRow);

        window._spTree      = tree;
        window._spStoreName = storeName;
        window._spCatOrder  = catOrder;
        _renderMainSection(mains[0], tree, storeName, body);
        _initSectionObserver(mains);
        _updateSpCartBar();

    } catch (err) {
        console.error('[StorePanel]', err);
        body.innerHTML = `<div class="sp-error">
            <div class="sp-error__icon">⚠️</div>
            <div class="sp-error__title">تعذّر تحميل المنتجات</div>
            <div class="sp-error__sub">تحقق من اتصالك وحاول مجدداً</div>
        </div>`;
    }
}

/* ── Render item card ─────────────────────────────────────── */
function renderItem(item, storeName) {
    const id        = item.ID || item.id || '';
    const name      = item.name || '';
    const price     = parseFloat(item.price) || 0;
    const sale      = parseFloat(item.sale)  || 0;
    const hasSale   = sale > 0 && sale < price;
    const dispPrice = hasSale ? sale : price;
    const pngExist  = item.pngExist === '1' || item.pngExist === 1;
    const imgUrl    = pngExist ? `${GH_IMAGES}/${String(id).toLowerCase()}.webp` : '';
    const cartQty   = _getBaseItemQty(`${storeName}__${id}`, storeName);
    const uniqueId  = `${storeName}__${id}`;
    const sType     = _currentStore ? _currentStore.type : '';

    return `
    <div class="sp-item" id="sp-item-${_slugify(uniqueId)}">
        <div class="sp-item__img-wrap" style="cursor:pointer"
             onclick="openItemPopup(${JSON.stringify(item).replace(/"/g,'&quot;')},'${storeName.replace(/'/g,"\\'")}')">
            ${pngExist
                ? `<img class="sp-item__img" src="${imgUrl}" alt="${name}"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                       loading="lazy">
                   <div class="sp-item__img-fallback" style="display:none">${_typeEmoji(item.companytype)}</div>`
                : `<div class="sp-item__img-fallback">${_typeEmoji(item.companytype)}</div>`
            }
            ${hasSale ? `<span class="sp-item__sale-badge">خصم</span>` : ''}
            <div style="position:absolute;bottom:5px;right:5px;width:22px;height:22px;background:rgba(0,0,0,0.45);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </div>
        </div>
        <div class="sp-item__info">
            <div class="sp-item__name">${name}</div>
            ${item.catar ? `<div class="sp-item__cat">${item.catar}</div>` : ''}
            <div class="sp-item__price-row">
                <span class="sp-item__price">${formatPrice(dispPrice)}</span>
                ${hasSale ? `<span class="sp-item__price-old">${formatPrice(price)}</span>` : ''}
            </div>
        </div>
        <div class="sp-item__actions" id="sp-actions-${_slugify(uniqueId)}">
            ${cartQty > 0 ? `
            <div class="sp-item__qty-control" id="sp-qty-ctrl-${_slugify(uniqueId)}">
                <button class="sp-item__qty-btn"
                        onclick="spRemoveLastInstance('${uniqueId}','${storeName}')">−</button>
                <span class="sp-item__qty-num" id="sp-qty-${_slugify(uniqueId)}">${cartQty}</span>
                <button class="sp-item__qty-btn sp-item__qty-btn--add"
                        onclick="spAddItem('${uniqueId}','${name}',${dispPrice},'${storeName}','${sType}',event,'${imgUrl}')">+</button>
            </div>` : `
            <button class="sp-item__add-btn" id="sp-add-btn-${_slugify(uniqueId)}"
                    onclick="spAddItem('${uniqueId}','${name}',${dispPrice},'${storeName}','${sType}',event,'${imgUrl}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            </button>`}
        </div>
    </div>`;
}

/* ── Cart interactions ────────────────────────────────────── */

/*
 * spAddItem — always adds instantly (no modal, no keyword popup).
 * Description notes are only set via the item detail popup.
 */
function spAddItem(uniqueId, name, price, storeName, storeType, event, imgUrl) {
    if (!window.DelivoCart) return;
    if (event) event.stopPropagation();
    // Direct add — no notes, no modal
    _doAddItem(uniqueId, name, price, storeName, storeType, '', uniqueId, imgUrl);
}

/* Remove the most-recently-added instance of an item */
function spRemoveLastInstance(baseId, storeName) {
    if (!window.DelivoCart) return;
    const instances = window.DelivoCart.items.filter(i =>
        i.storeName === storeName && (i.id === baseId || i.id.startsWith(baseId + '__i'))
    );
    if (!instances.length) return;
    const last = instances[instances.length - 1];
    window.DelivoCart.decrementItem(last.id, storeName);
    _updatePanelQtyDisplay(baseId, storeName);
    if (window.renderCartSidebar) window.renderCartSidebar();
    _updateSpCartBar();
}

function _doAddItem(instanceId, name, price, storeName, storeType, notes, baseId, imgUrl) {
    const bId = baseId || instanceId;
    window.DelivoCart.addItem(instanceId, name, price, storeName, storeType, notes, imgUrl);
    _updatePanelQtyDisplay(bId, storeName);
    _updateSpCartBar();
    if (window.renderCartSidebar) window.renderCartSidebar();
}

/* Update the qty display in the store panel for a base item */
function _updatePanelQtyDisplay(baseId, storeName) {
    const slug     = _slugify(baseId);
    const total    = _getBaseItemQty(baseId, storeName);
    const actionsEl = document.getElementById(`sp-actions-${slug}`);
    if (!actionsEl) return;

    const sample = window.DelivoCart?.items.find(i =>
        i.storeName === storeName && (i.id === baseId || i.id.startsWith(baseId + '__i'))
    );
    if (!sample) return;
    const { name, price, storeType } = sample;

    if (total > 0) {
        actionsEl.innerHTML = `
            <div class="sp-item__qty-control" id="sp-qty-ctrl-${slug}">
                <button class="sp-item__qty-btn"
                        onclick="spRemoveLastInstance('${baseId}','${storeName}')">−</button>
                <span class="sp-item__qty-num" id="sp-qty-${slug}">${total}</span>
                <button class="sp-item__qty-btn sp-item__qty-btn--add"
                        onclick="spAddItem('${baseId}','${name.replace(/'/g,"\\'")}',${price},'${storeName}','${storeType}',event)">+</button>
            </div>`;
    } else {
        actionsEl.innerHTML = `
            <button class="sp-item__add-btn" id="sp-add-btn-${slug}"
                    onclick="spAddItem('${baseId}','${name.replace(/'/g,"\\'")}',${price},'${storeName}','${storeType}',event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            </button>`;
    }
}

function spChangeQty(baseId, name, price, delta, storeName, storeType) {
    if (!window.DelivoCart) return;
    if (delta > 0) {
        spAddItem(baseId, name, price, storeName, storeType, null);
    } else {
        spRemoveLastInstance(baseId, storeName);
    }
}

function _updateSpCartBar() {
    const bar     = document.getElementById('sp-cart-bar');
    const countEl = document.getElementById('sp-cart-count');
    const totalEl = document.getElementById('sp-cart-total');
    if (!bar) return;
    const count    = window.DelivoCart ? window.DelivoCart.getCount() : 0;
    const totalUSD = window.DelivoCart ? window.DelivoCart.items.reduce((sum, item) => {
        const p = parseFloat(item.price) || 0;
        return sum + (p < 1000 ? p : p / 90000) * item.qty;
    }, 0) : 0;
    bar.classList.toggle('visible', count > 0);
    if (countEl) countEl.textContent = count + ' منتج';
    if (totalEl) totalEl.textContent = '$' + totalUSD.toFixed(2);
}

/* ══════════════════════════════════════════════════════════
   TWO-LEVEL NAVIGATION
══════════════════════════════════════════════════════════ */
function spSelectMain(main) {
    const tree      = window._spTree;
    const storeName = window._spStoreName;
    const body      = document.getElementById('sp-body');
    if (!tree || !tree[main] || !body) return;
    _setActiveTab(main);
    _renderMainSection(main, tree, storeName, body);
    body.scrollTo({ top: 0, behavior: 'smooth' });
}

function spSelectSub(slug) {
    _setActiveSub(slug);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const sec  = document.getElementById(`sp-subsec-${slug}`);
        if (!sec) return;
        const body   = document.getElementById('sp-body');
        const target = sec.offsetTop - 2;
        const maxScroll = body.scrollHeight - body.clientHeight;
        body.scrollTo({ top: Math.max(0, Math.min(target, maxScroll)), behavior: 'smooth' });
    }));
}

/* ── Drag-scroll for a horizontal scrollable row ──────────── */
function _initDragScroll(el) {
    if (!el || el._dragBound) return;
    el._dragBound = true;
    let isDown = false, startX, scrollLeft, hasDragged = false;
    el.addEventListener('mousedown', e => {
        isDown = true; hasDragged = false;
        el.classList.add('dragging');
        startX     = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
    });
    el.addEventListener('mouseleave', () => { isDown = false; hasDragged = false; el.classList.remove('dragging'); });
    el.addEventListener('mouseup',    () => { isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mousemove', e => {
        if (!isDown) return;
        const x = e.pageX - el.offsetLeft;
        if (Math.abs(x - startX) > 5) {
            hasDragged = true;
            e.preventDefault();
            el.scrollLeft = scrollLeft - (x - startX) * 1.5;
        }
    });
    el.addEventListener('click', e => {
        if (hasDragged) { e.preventDefault(); e.stopPropagation(); hasDragged = false; }
    }, true);
    let touchStartX, touchScrollLeft;
    el.addEventListener('touchstart', e => {
        touchStartX     = e.touches[0].pageX - el.offsetLeft;
        touchScrollLeft = el.scrollLeft;
    }, { passive: true });
    el.addEventListener('touchmove', e => {
        const x = e.touches[0].pageX - el.offsetLeft;
        el.scrollLeft = touchScrollLeft - (x - touchStartX) * 1.5;
    }, { passive: true });
}

function _renderMainSection(main, tree, storeName, body) {
    const subOrder = window._spCatOrder?.sub?.[main];
    const subs     = _sortByOrder(Object.keys(tree[main]), subOrder);
    const multiSub = subs.length > 1;
    const wrap     = document.getElementById('sp-subcat-wrap');

    if (wrap) {
        if (multiSub) {
            wrap.style.display = 'block';
            wrap.innerHTML = `
                <div class="sp-subcat-bar" id="sp-subcat-bar">
                    ${subs.map((sub, i) => `
                        <button class="sp-subchip ${i === 0 ? 'active' : ''}"
                                data-slug="${_slugify(sub)}"
                                onclick="spSelectSub('${_slugify(sub)}')">
                            ${sub}
                        </button>`).join('')}
                </div>`;
            /* Wire drag-scroll on the freshly rendered bar */
            const bar = document.getElementById('sp-subcat-bar');
            if (bar) _initDragScroll(bar);
        } else {
            wrap.style.display = 'none';
            wrap.innerHTML = '';
        }
    }

    body.innerHTML = subs.map(sub => `
        <div class="sp-section" id="sp-subsec-${_slugify(sub)}" data-slug="${_slugify(sub)}" data-sub="${sub}">
            ${multiSub ? `<div class="sp-section__title sp-section__title--sub">${sub}</div>` : ''}
            <div class="sp-items">
                ${tree[main][sub].map(item => renderItem(item, storeName)).join('')}
            </div>
        </div>`).join('');

    if (multiSub) _initSubObserver(subs);
    _updateSpCartBar();
}

function _initSubObserver(subs) {
    const body = document.getElementById('sp-body');
    if (!body || !('IntersectionObserver' in window)) return;
    if (window._spSubObserver) window._spSubObserver.disconnect();
    window._spSubObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) _setActiveSub(e.target.dataset.slug); });
    }, { root: body, rootMargin: '-10% 0px -60% 0px', threshold: 0 });
    subs.forEach(sub => {
        const el = document.getElementById(`sp-subsec-${_slugify(sub)}`);
        if (el) window._spSubObserver.observe(el);
    });
}

function _setActiveSub(slug) {
    document.querySelectorAll('.sp-subchip').forEach(c => {
        c.classList.toggle('active', c.dataset.slug === slug);
    });
    const activeChip = document.querySelector(`.sp-subchip[data-slug="${slug}"]`);
    if (activeChip) activeChip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
}

function spScrollToSection(cat) { spSelectMain(cat); }
function _initSectionObserver(mains) {}

function _setActiveTab(cat) {
    document.querySelectorAll('.sp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.cat === cat);
    });
    const activeTab = document.querySelector(`.sp-tab[data-cat="${cat}"]`);
    if (activeTab) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    _activeTab = cat;
}

function renderSkeleton() {
    return `<div class="sp-skeleton">${Array(5).fill(0).map(() => `
        <div class="sp-skeleton__item">
            <div class="sp-skeleton__img"></div>
            <div class="sp-skeleton__lines">
                <div class="sp-skeleton__line"></div>
                <div class="sp-skeleton__line"></div>
                <div class="sp-skeleton__line"></div>
            </div>
        </div>`).join('')}</div>`;
}

/* ── Utilities ────────────────────────────────────────────── */
function _slugify(s)     { return String(s).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_'); }

/* Returns the English image slug for a store — uses imgSlug field if set,
   otherwise strips non-ASCII from the provided storeId/companyname.       */
function _getImgSlug(storeId, storeMeta) {
    if (storeMeta && storeMeta.imgSlug && storeMeta.imgSlug.trim())
        return storeMeta.imgSlug.trim().toLowerCase();
    return String(storeId).toLowerCase()
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        || String(storeId).toLowerCase();
}

/**
 * Sort `keys` according to an admin-defined `orderList` (array of names).
 * Keys present in orderList come first, in that order; any remaining
 * keys (not in orderList) are appended afterward, alphabetically.
 */
function _sortByOrder(keys, orderList) {
    if (!Array.isArray(orderList) || !orderList.length) return [...keys].sort();
    const known   = orderList.filter(k => keys.includes(k));
    const unknown = keys.filter(k => !orderList.includes(k)).sort();
    return [...known, ...unknown];
}

function _getItemQty(id) {
    if (!window.DelivoCart) return 0;
    const item = window.DelivoCart.items.find(i => i.id === id);
    return item ? item.qty : 0;
}

/* Sum qty across all instances of a base item */
function _getBaseItemQty(baseId, storeName) {
    if (!window.DelivoCart) return 0;
    return window.DelivoCart.items
        .filter(i => i.storeName === storeName && (i.id === baseId || i.id.startsWith(baseId + '__i')))
        .reduce((s, i) => s + i.qty, 0);
}
function _typeLabel(t) {
    const map = { Restaurants:'مطاعم', CoffeeShops:'قهوة', Markets:'سوبرماركت', SweetsShops:'حلويات', ButcherShops:'ملاحم', FishShops:'أسماك', BakeryShops:'مخابز' };
    return map[t] || t;
}
function _typeEmoji(t) {
    const map = { Restaurants:'🍔', CoffeeShops:'☕', Markets:'🛒', SweetsShops:'🍰', ButcherShops:'🥩', FishShops:'🐟', BakeryShops:'🥖' };
    return map[t] || '🏪';
}

/* ── Init ─────────────────────────────────────────────────── */
function initStorePanel() {
    const overlay = document.getElementById('store-panel-overlay');
    if (overlay) overlay.addEventListener('click', closeStorePanel);
    const backBtn = document.getElementById('sp-back-btn');
    if (backBtn) backBtn.addEventListener('click', closeStorePanel);
    const cartBarBtn = document.getElementById('sp-cart-bar-btn');
    if (cartBarBtn) cartBarBtn.addEventListener('click', () => {
        closeStorePanel();
        setTimeout(() => openCartSidebar(), 180);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStorePanel(); });

    document.querySelectorAll('[data-store-id]').forEach(card => {
        card.addEventListener('click', () => {
            const storeId   = card.dataset.storeId;
            const storeType = card.dataset.storeType || 'Restaurants';
            const nameMap   = {
                'classic-food':'Classic-Food','king-pizza':'King-Pizza','zahret-lobnan':'Zahret-Lobnan',
                'burger-house':'AL-Beik','store-burger':'AL-Beik','al-beik':'AL-Beik',
                'al-fajr':'AL-Fajr','al-amana':'Al-Amana','assaf-grocery':'Assaf-Grocery',
                'bhalib':'Bhalib','foodigo':'Foodigo','hellani-kitchen':'Hellani-Kitchen','minini':'Minini',
            };
            const typeMap   = { restaurants:'Restaurants', coffee:'CoffeeShops', supermarket:'Markets', sweets:'SweetsShops', meat:'ButcherShops', fish:'FishShops', bakery:'BakeryShops' };
            const fireName  = nameMap[storeId]  || _toFirebaseName(storeId);
            const fireType  = typeMap[storeType] || 'Restaurants';
            openStorePanel(storeId, fireName, fireType);
        });
    });

    window.openStorePanel         = openStorePanel;
    window._currentStore          = null;   // kept in sync by listener
    window._spCache               = _spCache;
    window.spSelectMain           = spSelectMain;
    window.spSelectSub            = spSelectSub;
    window.closeStorePanel        = closeStorePanel;
    window.spAddItem              = spAddItem;
    window.spRemoveLastInstance   = spRemoveLastInstance;
    window._updatePanelQtyDisplay = _updatePanelQtyDisplay;
    window.spChangeQty            = spChangeQty;
    window.spScrollToSection      = spScrollToSection;
    window.updateSpCartBar        = _updateSpCartBar;
}

function _toFirebaseName(id) {
    return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
}

/* ══════════════════════════════════════════════════════════
   ITEM DETAIL POPUP — description text input (Restaurants & Bakeries)
══════════════════════════════════════════════════════════ */
function _ensureItemPopup() {
    if (document.getElementById('item-popup')) return;

    /* ── Inject styles for the description input ── */
    const style = document.createElement('style');
    style.textContent = `
    /* Description input inside item popup */
    .ip-desc-input-wrap {
        margin-top: 16px;
        border: 1.5px solid #f0f0f2;
        border-radius: 14px;
        overflow: hidden;
        transition: border-color 0.2s;
        background: #fafafa;
    }
    .ip-desc-input-wrap:focus-within {
        border-color: #FF5C00;
        background: #fff;
    }
    .ip-desc-input-label {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 10px 14px 6px;
        font-size: 0.68rem;
        font-weight: 800;
        color: #9898a6;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        user-select: none;
    }
    .ip-desc-input-label svg { flex-shrink: 0; }
    .ip-desc-input {
        width: 100%;
        min-height: 62px;
        max-height: 120px;
        border: none;
        background: transparent;
        resize: none;
        font-family: 'Almarai', sans-serif;
        font-size: 0.88rem;
        color: #1a1a1a;
        padding: 4px 14px 12px;
        outline: none;
        line-height: 1.55;
        direction: rtl;
    }
    .ip-desc-input::placeholder { color: #c0c0cc; }
    .ip-desc-char-count {
        font-size: 0.62rem;
        color: #c0c0cc;
        text-align: left;
        padding: 0 14px 8px;
        font-weight: 600;
    }
    .ip-desc-char-count.warn { color: #f59e0b; }
    .ip-desc-char-count.over { color: #ef4444; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'item-popup-overlay';
    overlay.id = 'item-popup-overlay';
    overlay.addEventListener('click', closeItemPopup);

    const popup = document.createElement('div');
    popup.className = 'item-popup';
    popup.id = 'item-popup';
    popup.innerHTML = `
        <div class="item-popup__hero" id="ip-hero">
            <button class="item-popup__close" id="ip-close" aria-label="رجوع">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
            </button>
            <button class="item-popup__close item-popup__close--x" id="ip-close-x" aria-label="إغلاق">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <span class="item-popup__sale-hero" id="ip-sale-hero" style="display:none"></span>
            <div class="item-popup__img-wrap" id="ip-img-wrap">
                <img id="ip-img" src="" alt=""
                     onerror="this.style.display='none';document.getElementById('ip-img-fallback').style.display='flex'">
                <div class="item-popup__img-fallback" id="ip-img-fallback" style="display:none"></div>
            </div>
        </div>
        <div class="item-popup__body" id="ip-body">
            <div class="item-popup__name" id="ip-name"></div>
            <div class="item-popup__desc" id="ip-desc-wrap" style="display:none">
                <span id="ip-desc-text"></span>
                <button class="item-popup__desc-toggle" id="ip-desc-toggle" style="display:none">... اقرأ المزيد</button>
            </div>
            <div class="item-popup__price-row">
                <div class="item-popup__price-block" id="ip-price-block">
                    <span class="item-popup__price-main" id="ip-price"></span>
                    <span class="item-popup__price-old"  id="ip-price-old"  style="display:none"></span>
                    <span class="item-popup__sale-pct"   id="ip-sale-pct"   style="display:none"></span>
                </div>
                <div class="item-popup__qty-pill">
                    <button class="item-popup__qty-btn" id="ip-minus">&#8722;</button>
                    <span   class="item-popup__qty-num"  id="ip-qty">1</span>
                    <button class="item-popup__qty-btn" id="ip-plus">+</button>
                </div>
            </div>

            <!-- Description input — visible only for Restaurants & BakeryShops -->
            <div id="ip-notes-section" style="display:none;">
                <div class="ip-desc-input-wrap">
                    <div class="ip-desc-input-label">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.2"
                             stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        ملاحظات على الصنف
                    </div>
                    <textarea
                        id="ip-notes-input"
                        class="ip-desc-input"
                        maxlength="160"
                        placeholder="مثال: بدون ثوم، حار، بدون بصل…"></textarea>
                    <div class="ip-desc-char-count" id="ip-char-count">0 / 160</div>
                </div>
            </div>

            <button class="item-popup__add-btn" id="ip-add-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                أضف إلى السلة
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    document.getElementById('ip-close').addEventListener('click', closeItemPopup);
    document.getElementById('ip-close-x').addEventListener('click', closeItemPopup);
    document.getElementById('ip-minus').addEventListener('click', _ipDecrement);
    document.getElementById('ip-plus').addEventListener('click',  _ipIncrement);
    document.getElementById('ip-add-btn').addEventListener('click', _ipAddToCart);

    /* live character counter */
    const ta = document.getElementById('ip-notes-input');
    const cc = document.getElementById('ip-char-count');
    ta.addEventListener('input', () => {
        const len = ta.value.length;
        cc.textContent = `${len} / 160`;
        cc.className = 'ip-desc-char-count' + (len >= 160 ? ' over' : len >= 130 ? ' warn' : '');
    });
}

let _ipItem = null;
let _ipQty  = 1;
const DESC_LIMIT = 90;

async function openItemPopup(item, storeName) {
    _ensureItemPopup();

    const price    = parseFloat(item.price) || 0;
    const sale     = parseFloat(item.sale)  || 0;
    const hasSale  = sale > 0 && sale < price;
    const disp     = hasSale ? sale : price;
    const id       = item.ID || item.id || '';
    const pngExist = item.pngExist === '1' || item.pngExist === 1;
    const imgUrl   = pngExist ? `${GH_IMAGES}/${String(id).toLowerCase()}.webp` : '';
    const desc     = (item.unitdesc || '').trim();
    const sType    = _currentStore ? _currentStore.type : '';

    _ipItem = { item, storeName, price: disp, uniqueId: `${storeName}__${id}`, storeType: sType };
    _ipQty  = Math.max(1, _getItemQty(_ipItem.uniqueId)) || 1;

    /* Image */
    const imgEl      = document.getElementById('ip-img');
    const fallbackEl = document.getElementById('ip-img-fallback');
    if (pngExist && imgUrl) {
        imgEl.onerror = function () {
            this.style.display = 'none';
            fallbackEl.textContent = _typeEmoji(item.companytype);
            fallbackEl.style.display = 'flex';
        };
        imgEl.src = imgUrl; imgEl.alt = item.name || '';
        imgEl.style.display = 'block'; fallbackEl.style.display = 'none';
    } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        fallbackEl.textContent = _typeEmoji(item.companytype);
        fallbackEl.style.display = 'flex';
    }

    /* Sale badge */
    const saleBadge = document.getElementById('ip-sale-hero');
    if (hasSale) {
        const pct = Math.round((1 - sale / price) * 100);
        saleBadge.textContent = `خصم ${pct}%`;
        saleBadge.style.display = 'inline-block';
    } else { saleBadge.style.display = 'none'; }

    /* Name */
    document.getElementById('ip-name').textContent = item.name || '';

    /* Item description (unitdesc) */
    const descWrap   = document.getElementById('ip-desc-wrap');
    const descText   = document.getElementById('ip-desc-text');
    const descToggle = document.getElementById('ip-desc-toggle');
    if (desc) {
        descWrap.style.display = 'block';
        if (desc.length > DESC_LIMIT) {
            descText.textContent = desc.slice(0, DESC_LIMIT);
            descToggle.style.display = 'inline';
            descToggle.onclick = () => { descText.textContent = desc; descToggle.style.display = 'none'; };
        } else { descText.textContent = desc; descToggle.style.display = 'none'; }
    } else { descWrap.style.display = 'none'; }

    /* Price */
    document.getElementById('ip-price').textContent = formatPrice(disp);
    const oldEl = document.getElementById('ip-price-old');
    const pctEl = document.getElementById('ip-sale-pct');
    if (hasSale) {
        oldEl.textContent = formatPrice(price); oldEl.style.display = 'inline';
        const pct = Math.round((1 - sale / price) * 100);
        pctEl.textContent = `-${pct}%`; pctEl.style.display = 'inline-block';
    } else { oldEl.style.display = 'none'; pctEl.style.display = 'none'; }

    /* Qty */
    document.getElementById('ip-qty').textContent = _ipQty;

    /* Notes input — only for Restaurants & BakeryShops */
    const notesSection = document.getElementById('ip-notes-section');
    const notesInput   = document.getElementById('ip-notes-input');
    const charCount    = document.getElementById('ip-char-count');
    if (CUSTOMIZABLE_TYPES.includes(sType)) {
        notesSection.style.display = 'block';
        notesInput.value = '';
        charCount.textContent = '0 / 160';
        charCount.className = 'ip-desc-char-count';
    } else {
        notesSection.style.display = 'none';
        notesInput.value = '';
    }

    _ipResetAddBtn();
    document.getElementById('item-popup-overlay').classList.add('active');
    document.getElementById('item-popup').classList.add('active');
    document.body.classList.add('modal-open');
}

function closeItemPopup() {
    const overlay    = document.getElementById('item-popup-overlay');
    const popup      = document.getElementById('item-popup');
    if (overlay) overlay.classList.remove('active');
    if (popup)   popup.classList.remove('active');
    const storeOpen  = document.getElementById('store-panel')?.classList.contains('active');
    const searchOpen = window._bbsFromSearch;
    if (!storeOpen && !searchOpen) {
        document.body.classList.remove('modal-open');
    }
    if (!storeOpen && searchOpen) {
        // Return to search overlay
        window._bbsFromSearch = false;
        const srch = document.getElementById('bb-search-overlay');
        if (srch) {
            srch.classList.add('bbs--open');
            document.body.classList.add('modal-open');
        }
    }
    _ipItem = null;
}

function _ipDecrement() { if (_ipQty > 1) { _ipQty--; document.getElementById('ip-qty').textContent = _ipQty; } }
function _ipIncrement() { _ipQty++; document.getElementById('ip-qty').textContent = _ipQty; }

function _ipAddToCart() {
    if (!_ipItem || !window.DelivoCart) return;
    const { uniqueId, item, storeName, price, storeType } = _ipItem;

    /* Collect notes from the description textarea */
    const notesInput    = document.getElementById('ip-notes-input');
    const notes         = (notesInput ? notesInput.value.trim() : '');
    const isCustomizable = CUSTOMIZABLE_TYPES.includes(storeType);

    if (isCustomizable) {
        /* Each popup add = a brand new instance carrying its notes */
        for (let i = 0; i < _ipQty; i++) {
            const instanceId = uniqueId + '__i' + (Date.now() + i);
            const _pngUrl = (item.pngExist === '1' || item.pngExist === 1)
                ? `./items2/${String(item.ID || item.id || '').toLowerCase()}.webp` : '';
            window.DelivoCart.addItem(instanceId, item.name, price, storeName, storeType, notes, _pngUrl);
        }
        _updatePanelQtyDisplay(uniqueId, storeName);
    } else {
        /* Non-customizable: stack qty on single entry */
        const current = _getItemQty(uniqueId);
        const diff    = _ipQty - current;
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                const _qi = (item.pngExist === '1' || item.pngExist === 1)
                ? `./items2/${String(item.ID || item.id || '').toLowerCase()}.webp` : '';
            window.DelivoCart.addItem(uniqueId, item.name, price, storeName, storeType, '', _qi);
            }
        } else if (diff < 0) {
            for (let i = 0; i < Math.abs(diff); i++) window.DelivoCart.decrementItem(uniqueId, storeName);
        } else {
            const _qi = (item.pngExist === '1' || item.pngExist === 1)
                ? `./items2/${String(item.ID || item.id || '').toLowerCase()}.webp` : '';
            window.DelivoCart.addItem(uniqueId, item.name, price, storeName, storeType, '', _qi);
        }
    }

    /* Sync store panel qty display */
    const slug   = _slugify(uniqueId);
    const itemEl = document.getElementById(`sp-item-${slug}`);
    if (itemEl) {
        const actionsEl = itemEl.querySelector('.sp-item__actions');
        const newQty    = _getBaseItemQty(uniqueId, storeName);
        if (actionsEl) {
            actionsEl.innerHTML = `
                <div class="sp-item__qty-control" id="sp-qty-ctrl-${slug}">
                    <button class="sp-item__qty-btn"
                            onclick="spChangeQty('${uniqueId}','${item.name}',${price},-1,'${storeName}','${storeType}')">−</button>
                    <span class="sp-item__qty-num" id="sp-qty-${slug}">${newQty}</span>
                    <button class="sp-item__qty-btn"
                            onclick="spChangeQty('${uniqueId}','${item.name}',${price},1,'${storeName}','${storeType}')">+</button>
                </div>`;
        }
    }

    _updateSpCartBar();
    if (window.renderCartSidebar) window.renderCartSidebar();

    const btn = document.getElementById('ip-add-btn');
    btn.classList.add('added');
    btn.textContent = '✓ تمت الإضافة';
    setTimeout(() => { _ipResetAddBtn(); btn.classList.remove('added'); closeItemPopup(); }, 900);
}

function _ipResetAddBtn() {
    const btn = document.getElementById('ip-add-btn');
    if (!btn) return;
    btn.classList.remove('added');
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
        أضف إلى السلة`;
}

window.openItemPopup  = openItemPopup;
window.closeItemPopup = closeItemPopup;

/* Called by search to inject storeType before openItemPopup */
window._setCurrentStoreForSearch = function(storeName, storeType) {
    _currentStore = { id: storeName, name: storeName, type: storeType, rtdbKey: storeName };
};