/* ============================================================
   scripts/navbar.js  —  Bottom bar + realtime logo flip
   Loaded BEFORE firebase-init.js so refreshActiveOrders is
   defined when onAuthStateChanged fires.
   ============================================================ */

const _RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
let _trackListener = null;
let _activeOrders  = [];

function initNavbar() {

    /* ── Inject bottom bar HTML ──────────────────────────────── */
    const bar = document.createElement('nav');
    bar.className = 'bottom-bar';
    bar.setAttribute('aria-label', 'القائمة الرئيسية');
    bar.innerHTML = `
        <div class="bottom-bar__inner">
            <button class="bb-tab" id="bb-cart-btn" aria-label="سلة التسوق">
                <span class="bb-tab__icon">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    <span id="bb-cart-badge"></span>
                </span>
                <span class="bb-tab__label">السلة</span>
            </button>

            <button class="bb-order-btn" id="bb-order-btn" aria-label="اطلب الآن">
                <span class="bb-order-btn__icon">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                </span>
                <span class="bb-order-btn__label">اطلب</span>
            </button>

            <button class="bb-logo-btn" id="bb-logo-btn" aria-label="الرئيسية">
                <div class="bb-logo-btn__circle">
                    <span class="bb-logo-state" id="bb-state-logo">
                        <img src="assets/icon-taskbar.png" alt="Delivo">
                    </span>
                    <span class="bb-logo-state bb-logo-state--hidden" id="bb-state-track">
                        <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32">
                            <!-- Radar ripples expanding from pin center -->
                            <circle cx="28" cy="30" r="10" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5">
                                <animate attributeName="r" values="8;26" dur="1.6s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite"/>
                            </circle>
                            <circle cx="28" cy="30" r="10" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5">
                                <animate attributeName="r" values="8;26" dur="1.6s" begin="0.5s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.8;0" dur="1.6s" begin="0.5s" repeatCount="indefinite"/>
                            </circle>
                            <circle cx="28" cy="30" r="10" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.5">
                                <animate attributeName="r" values="8;26" dur="1.6s" begin="1.1s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.8;0" dur="1.6s" begin="1.1s" repeatCount="indefinite"/>
                            </circle>
                            <!-- Map pin body -->
                            <path d="M28 6 C21 6 15 12 15 19 C15 29 28 44 28 44 C28 44 41 29 41 19 C41 12 35 6 28 6 Z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
                            <!-- Pin inner circle -->
                            <circle cx="28" cy="19" r="5.5" fill="#fff"/>
                            <!-- Live dot top-right -->
                            <circle cx="40" cy="8" r="4" fill="#4ade80"/>
                            <circle cx="40" cy="8" r="4" fill="#4ade80" opacity="0.4">
                                <animate attributeName="r" from="4" to="9" dur="1.5s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite"/>
                            </circle>
                        </svg>
                        <span class="bb-track-pulse"></span>
                    </span>
                    <span class="bb-logo-state bb-logo-state--hidden" id="bb-state-multi">
                        <svg viewBox="0 0 56 50" fill="none" xmlns="http://www.w3.org/2000/svg" width="30" height="30">
                            <circle cx="8" cy="8" r="3" fill="#fff"/>
                            <rect x="16" y="5.5" width="0" height="5" rx="2.5" fill="#fff">
                                <animate attributeName="width" values="0;30;30;0" dur="2s" keyTimes="0;0.3;0.7;1" repeatCount="indefinite"/>
                            </rect>
                            <circle cx="8" cy="22" r="3" fill="#fff"/>
                            <rect x="16" y="19.5" width="0" height="5" rx="2.5" fill="#fff">
                                <animate attributeName="width" values="0;30;30;0" dur="2s" keyTimes="0;0.3;0.7;1" begin="0.25s" repeatCount="indefinite"/>
                            </rect>
                            <circle cx="8" cy="36" r="3" fill="#fff"/>
                            <rect x="16" y="33.5" width="0" height="5" rx="2.5" fill="#fff">
                                <animate attributeName="width" values="0;30;30;0" dur="2s" keyTimes="0;0.3;0.7;1" begin="0.5s" repeatCount="indefinite"/>
                            </rect>
                        </svg>
                        <span class="bb-multi-badge" id="bb-multi-badge">2</span>
                    </span>
                </div>
                <span class="bb-logo-btn__label" id="bb-logo-label">Delivo</span>
            </button>

            <button class="bb-tab bb-search-btn" id="bb-search-btn" aria-label="بحث">
                <span class="bb-tab__icon">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="7"/>
                        <line x1="16.5" y1="16.5" x2="22" y2="22"/>
                    </svg>
                </span>
                <span class="bb-tab__label">بحث</span>
            </button>

            <button class="bb-account-btn" id="bb-account-btn" aria-label="حسابي">
                <span class="bb-account-btn__icon">
                    <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                </span>
                <span class="bb-account-btn__label">حسابي</span>
            </button>
        </div>

        <div class="bb-track-sheet" id="bb-track-sheet">
            <div class="bb-track-sheet__backdrop" id="bb-track-sheet-backdrop"></div>
            <div class="bb-track-sheet__panel">
                <div class="bb-track-sheet__handle"></div>
                <div class="bb-track-sheet__header">
                    <span>🛵 طلباتك النشطة</span>
                    <button id="bb-track-sheet-close">✕</button>
                </div>
                <div class="bb-track-sheet__list" id="bb-track-sheet-list"></div>
            </div>
        </div>
    `;
    document.body.appendChild(bar);

    /* ── Button wiring ────────────────────────────────────────── */
    document.getElementById('bb-cart-btn').addEventListener('click', () => {
        if (typeof openCartSidebar === 'function') openCartSidebar();
    });
    document.getElementById('bb-order-btn').addEventListener('click', () => {
        if (typeof window._extOpenModal === 'function') window._extOpenModal();
    });
    document.getElementById('bb-search-btn').addEventListener('click', () => {
        openSearchOverlay();
    });
    document.getElementById('bb-account-btn').addEventListener('click', () => {
        const b = document.getElementById('account-btn'); if (b) b.click();
    });
    document.getElementById('bb-track-sheet-close').addEventListener('click', _closeTrackSheet);
    document.getElementById('bb-track-sheet-backdrop').addEventListener('click', _closeTrackSheet);
    document.getElementById('bb-logo-btn').addEventListener('click', _handleLogoClick);

    /* ── Auth sync ────────────────────────────────────────────── */
    window.updateBottomBarAuth = function(loggedIn) {
        const btn = document.getElementById('bb-account-btn');
        if (btn) loggedIn ? btn.classList.add('logged-in') : btn.classList.remove('logged-in');
    };

    updateCartBadge();
}

/* ══════════════════════════════════════════════════════════════
   REALTIME TRACKING — called by firebase-init.js onAuthStateChanged
══════════════════════════════════════════════════════════════ */

window.refreshActiveOrders = async function() {
    const user = window.DelivoUser;
    if (!user) { _resetLogo(); return; }

    // Close previous SSE
    if (_trackListener) { _trackListener.close(); _trackListener = null; }

    // Get Firebase auth token to authenticate the SSE stream
    let token = '';
    try {
        if (window.firebase && window.firebase.auth) {
            const fbUser = window.firebase.auth().currentUser;
            if (fbUser) token = await fbUser.getIdToken();
        }
    } catch(e) {}

    // Open SSE stream with auth token
    const url = `${_RTDB}/historyRequests/${user.uid}.json${token ? '?auth=' + token : ''}`;
    const es  = new EventSource(url);
    _trackListener = es;

    // Firebase SSE sends 'put' for initial load AND for every direct write.
    // We keep a full local cache so any event type can update it correctly.
    let _ordersCache = {};  // full copy of historyRequests/{uid}

    es.addEventListener('put', (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (!msg.path || msg.path === '/') {
                // Full node replace
                _ordersCache = msg.data && typeof msg.data === 'object' ? msg.data : {};
            } else {
                // Sub-path put e.g. /id_241
                const parts = msg.path.split('/').filter(Boolean);
                if (parts.length === 1) {
                    if (msg.data === null) delete _ordersCache[parts[0]];
                    else _ordersCache[parts[0]] = msg.data;
                } else if (parts.length === 2) {
                    if (!_ordersCache[parts[0]]) _ordersCache[parts[0]] = {};
                    _ordersCache[parts[0]][parts[1]] = msg.data;
                }
            }
            _rebuildFromCache();
        } catch(_) {}
    });

    es.addEventListener('patch', (e) => {
        try {
            const msg = JSON.parse(e.data);

            // Firebase patch data can have flat slash-separated keys like:
            // path="/" data={"id_244/trackorder":"1","id_244/driverid":"3"}
            // OR nested: path="/id_244" data={trackorder:"1"}
            // We normalize both into _ordersCache

            const baseParts = (msg.path || '/').split('/').filter(Boolean);
            const patchData  = msg.data || {};

            if (typeof patchData === 'object' && patchData !== null) {
                Object.entries(patchData).forEach(([key, val]) => {
                    // key may be "id_244/trackorder" (flat) or "trackorder" (field)
                    const keyParts   = key.split('/').filter(Boolean);
                    const allParts   = [...baseParts, ...keyParts];

                    if (allParts.length >= 2) {
                        const orderId = allParts[0];
                        const field   = allParts[1];
                        if (!_ordersCache[orderId]) _ordersCache[orderId] = {};
                        _ordersCache[orderId][field] = val;
                    } else if (allParts.length === 1) {
                        // Whole order replaced
                        if (val === null) delete _ordersCache[allParts[0]];
                        else _ordersCache[allParts[0]] = Object.assign(_ordersCache[allParts[0]] || {}, val);
                    }
                });
            } else if (baseParts.length >= 2) {
                // Scalar value at a deep path
                const orderId = baseParts[0];
                const field   = baseParts[1];
                if (!_ordersCache[orderId]) _ordersCache[orderId] = {};
                _ordersCache[orderId][field] = patchData;
            }

            _rebuildFromCache();
        } catch(_) {}
    });

    function _rebuildFromCache() {
        _activeOrders = Object.entries(_ordersCache)
            .filter(([, o]) => o && (o.trackorder === '1' || o.trackorder === 1))
            .map(([id, order]) => ({ id, order }));
        _applyLogoState();
        // If the sheet is currently open, re-render it live
        const sheet = document.getElementById('bb-track-sheet');
        if (sheet && sheet.classList.contains('open')) {
            _renderTrackSheetList();
        }
    }

    es.onerror = () => {
        if (_trackListener === es) {
            es.close(); _trackListener = null;
            // Retry after 6s
            setTimeout(() => { if (window.DelivoUser) window.refreshActiveOrders(); }, 6000);
        }
    };
};

window._resetLogoToDefault = _resetLogo;

function _resetLogo() {
    if (_trackListener) { _trackListener.close(); _trackListener = null; }
    _activeOrders = [];
    _setLogoState('logo');
}

function _updateFromData(data) {
    _activeOrders = [];
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([id, o]) => {
            if (o && (o.trackorder === '1' || o.trackorder === 1)) {
                _activeOrders.push({ id, order: o });
            }
        });
    }
    _applyLogoState();
}

function _applyLogoState() {
    if (_activeOrders.length === 0)      _setLogoState('logo');
    else if (_activeOrders.length === 1) _setLogoState('track');
    else                                 _setLogoState('multi');
}

function _setLogoState(state) {
    const stLogo  = document.getElementById('bb-state-logo');
    const stTrack = document.getElementById('bb-state-track');
    const stMulti = document.getElementById('bb-state-multi');
    const label   = document.getElementById('bb-logo-label');
    const circle  = document.querySelector('.bb-logo-btn__circle');
    if (!stLogo) return;
    stLogo.classList.add('bb-logo-state--hidden');
    stTrack.classList.add('bb-logo-state--hidden');
    stMulti.classList.add('bb-logo-state--hidden');
    if (state === 'track') {
        stTrack.classList.remove('bb-logo-state--hidden');
        const _trackId = _activeOrders[0]?.id?.replace('id_', '#') || '';
        label.textContent = _trackId ? `تتبّع ${_trackId}` : 'تتبّع الطلب';
        circle.classList.add('bb-logo-btn__circle--active');
    } else if (state === 'multi') {
        stMulti.classList.remove('bb-logo-state--hidden');
        document.getElementById('bb-multi-badge').textContent = _activeOrders.length;
        label.textContent = 'طلبات نشطة';
        circle.classList.add('bb-logo-btn__circle--active');
    } else {
        stLogo.classList.remove('bb-logo-state--hidden');
        label.textContent = 'Delivo';
        circle.classList.remove('bb-logo-btn__circle--active');
    }
}

function _handleLogoClick() {
    if (_activeOrders.length === 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (_activeOrders.length === 1) {
        const { id, order } = _activeOrders[0];
        const uid = order.delivryplusid || window.DelivoUser?.uid || '';
        if (typeof window._openTrackModal === 'function') window._openTrackModal(id, uid);
    } else {
        _openTrackSheet();
    }
}

function _renderTrackSheetList() {
    const listEl = document.getElementById('bb-track-sheet-list');
    if (!listEl) return;

    if (_activeOrders.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center;padding:32px 20px;color:#9898a6;font-size:0.85rem;">
                <div style="font-size:2rem;margin-bottom:8px;">📭</div>
                لا توجد طلبات نشطة حالياً
            </div>`;
        return;
    }

    listEl.innerHTML = _activeOrders.map(({ id, order }) => {
        const store  = order.store || order.storeName || id;
        const uid    = order.delivryplusid || window.DelivoUser?.uid || '';
        const reqNum = id.replace('id_', '#');
        const stateMap = { '0':'🔵 جديد', '1':'✅ وُصِّل', '2':'🔴 ملغي', '3':'🟡 متأخر', '6':'🟠 قيد الاستلام', '7':'⏳ قيد التحضير', '8':'🟢 جاهز' };
        const stateLabel = stateMap[order.state || '0'] || '🔵 جديد';
        return `
        <div class="bb-track-item" onclick="_closeTrackSheet();setTimeout(()=>window._openTrackModal('${id}','${uid}',true),200);">
            <span class="bb-track-item__icon">🛵</span>
            <div class="bb-track-item__body">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <strong>${store}</strong>
                    <span style="font-size:0.68rem;font-weight:800;color:#FF5C00;background:rgba(255,92,0,0.1);
                                 border:1px solid rgba(255,92,0,0.25);border-radius:50px;padding:2px 8px;">
                        ${reqNum}
                    </span>
                    <span style="font-size:0.65rem;font-weight:700;color:#555;">${stateLabel}</span>
                </div>
                <small style="color:#9898a6;">${order.date || ''}</small>
            </div>
            <span class="bb-track-item__arrow">›</span>
        </div>`;
    }).join('');
}

window._openTrackSheet = function _openTrackSheet() {
    const sheet = document.getElementById('bb-track-sheet');
    sheet.classList.add('open');
    document.body.classList.add('modal-open');
    _renderTrackSheetList();
}

window._closeTrackSheet = function _closeTrackSheet() {
    document.getElementById('bb-track-sheet').classList.remove('open');
    document.body.classList.remove('modal-open');
}

/* ══════════════════════════════════════════════════════════════
   SEARCH OVERLAY
══════════════════════════════════════════════════════════════ */
function _injectSearchOverlay() {
    if (document.getElementById('bb-search-overlay')) return;
    const el = document.createElement('div');
    el.id = 'bb-search-overlay';
    el.innerHTML = `
        <div class="bbs__backdrop" id="bbs-backdrop"></div>
        <div class="bbs__panel" id="bbs-panel">
            <div class="bbs__header">
                <div class="bbs__input-wrap">
                    <span class="bbs__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                             stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
                        </svg>
                    </span>
                    <input
                        id="bbs-input"
                        type="search"
                        inputmode="search"
                        autocomplete="off"
                        autocorrect="off"
                        spellcheck="false"
                        dir="rtl"
                        placeholder="ابحث عن متجر أو وجبة أو منتج…"
                        class="bbs__input"
                    >
                    <button class="bbs__clear" id="bbs-clear" aria-label="مسح">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                             stroke-linecap="round" width="14" height="14">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <button class="bbs__cancel" id="bbs-cancel">إلغاء</button>
            </div>

            <div class="bbs__body" id="bbs-body">
                <!-- Initial state — trending / quick picks -->
                <div class="bbs__section" id="bbs-initial">
                    <p class="bbs__section-label">🔥 الأكثر بحثاً</p>
                    <div class="bbs__chips" id="bbs-trending">
                        <button class="bbs__chip">برغر</button>
                        <button class="bbs__chip">بيتزا</button>
                        <button class="bbs__chip">شاورما</button>
                        <button class="bbs__chip">فلافل</button>
                        <button class="bbs__chip">حلويات</button>
                        <button class="bbs__chip">قهوة</button>
                        <button class="bbs__chip">دجاج</button>
                        <button class="bbs__chip">سناك</button>
                    </div>
                    <p class="bbs__section-label" style="margin-top:20px;">⚡ تصفح سريع</p>
                    <div class="bbs__quick-grid" id="bbs-quick-grid">
                        <button class="bbs__quick-card" data-type="Restaurants">🍔<span>مطاعم</span></button>
                        <button class="bbs__quick-card" data-type="BakeryShops">🥖<span>مخابز</span></button>
                        <button class="bbs__quick-card" data-type="SweetsShops">🍰<span>حلويات</span></button>
                        <button class="bbs__quick-card" data-type="CoffeeShops">☕<span>قهوة</span></button>
                        <button class="bbs__quick-card" data-type="ButcherShops">🥩<span>ملاحم</span></button>
                        <button class="bbs__quick-card" data-type="Markets">🛒<span>سوبرماركت</span></button>
                        <button class="bbs__quick-card" data-type="FishShops">🐟<span>أسماك</span></button>
                        <button class="bbs__quick-card" data-type="GroceryShops">🧺<span>بقالة</span></button>
                    </div>
                </div>
                <!-- Results state -->
                <div class="bbs__results" id="bbs-results" style="display:none;">
                    <div class="bbs__results-list" id="bbs-results-list"></div>
                </div>
                <!-- Empty state -->
                <div class="bbs__empty" id="bbs-empty" style="display:none;">
                    <div class="bbs__empty-icon">🔍</div>
                    <p class="bbs__empty-title">لا نتائج</p>
                    <p class="bbs__empty-sub">جرّب كلمة أخرى</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(el);

    // Wire close triggers
    document.getElementById('bbs-cancel').addEventListener('click', closeSearchOverlay);
    document.getElementById('bbs-backdrop').addEventListener('click', closeSearchOverlay);
    document.getElementById('bbs-clear').addEventListener('click', () => {
        document.getElementById('bbs-input').value = '';
        document.getElementById('bbs-input').focus();
        _bbs_showInitial();
    });

    // Input handler (will be linked later)
    document.getElementById('bbs-input').addEventListener('input', _bbs_onInput);
    document.getElementById('bbs-input').addEventListener('keydown', e => {
        if (e.key === 'Escape') closeSearchOverlay();
    });

    // Chip clicks fill input and search
    function _wireChips() {
        document.querySelectorAll('.bbs__chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.getElementById('bbs-input').value = chip.textContent.trim();
                const clr = document.getElementById('bbs-clear');
                if (clr) clr.style.opacity = '1';
                _bbs_onInput();
            });
        });
    }
    _wireChips();

    // Load trending chips from Firebase settings/trendingSearch (array of strings)
    // Falls back to the hardcoded defaults already in the DOM
    fetch(`${_BBS_RTDB}/settings/trendingSearch.json`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!Array.isArray(data) || !data.length) return;
            const container = document.getElementById('bbs-trending');
            if (!container) return;
            container.innerHTML = data
                .map(term => `<button class="bbs__chip">${term}</button>`)
                .join('');
            _wireChips(); // re-wire new chips
        })
        .catch(() => {}); // silently fall back to defaults

    // Quick card clicks browse by store type
    document.querySelectorAll('.bbs__quick-card').forEach(card => {
        card.addEventListener('click', () => {
            const type  = card.dataset.type;
            const label = card.querySelector('span')?.textContent || '';
            // Show selected state
            document.querySelectorAll('.bbs__quick-card').forEach(c => c.classList.remove('bbs__quick-card--active'));
            card.classList.add('bbs__quick-card--active');
            _bbsSearchByType(type, label);
        });
    });
}

/* ── Search index ─────────────────────────────────────────── */

// Convert raw price to USD for fair cross-currency comparison.
// Prices < 1000 are already in USD; prices >= 1000 are Lebanese Lira (÷ 90,000).
function _toSearchUSD(rawPrice) {
    const v = parseFloat(rawPrice) || 0;
    return v < 1000 ? v : v / (window._LBP_RATE || 90000);
}

async function _bbsSearchByType(fbType, label) {
    _bbs_showLoading();
    const stores = await _bbsLoadStores();
    const typeStores = stores.filter(s => s.type === fbType);
    const results = [];
    const CHUNK = 6;
    for (let i = 0; i < typeStores.length; i += CHUNK) {
        const chunk = typeStores.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async store => {
            const items = await _bbsLoadItems(store.companyname);
            items.forEach(item => {
                const price   = parseFloat(item.price) || 0;
                const sale    = parseFloat(item.sale)  || 0;
                const hasSale = sale > 0 && sale < price;
                const dp = hasSale ? sale : price;
                results.push({
                    item,
                    storeName   : store.companyname,
                    storeNameAr : store.nameAr || store.companyname,
                    storeType   : store.type,
                    price, sale, hasSale,
                    dispPrice   : dp,
                    priceUSD    : _toSearchUSD(dp),   // normalized for fair sorting
                    matchScore  : 1,
                });
            });
        }));
    }
    results.sort((a, b) => a.priceUSD - b.priceUSD);
    _bbs_showResults(results, label);
}


const _BBS_RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
let _bbsStores    = null;  // [{companyname, nameAr, type}]
let _bbsItemCache = {};    // storeName → [item]
let _bbsSearchTimer = null;

async function _bbsLoadStores() {
    if (_bbsStores) return _bbsStores;
    try {
        const res  = await fetch(`${_BBS_RTDB}/pattern.json`);
        const data = await res.json();
        if (!data) { _bbsStores = []; return []; }
        const seen = new Set();
        const list = [];
        for (const [type, entries] of Object.entries(data)) {
            if (!entries || typeof entries !== 'object') continue;
            const arr = Array.isArray(entries) ? entries : Object.values(entries);
            for (const s of arr) {
                if (!s || !s.companyname) continue;
                const name = s.companyname.trim();
                if (seen.has(name)) continue;
                seen.add(name);
                if (s.disabled) continue;
                list.push({ companyname: name, nameAr: s.nameAr || '', type });
            }
        }
        _bbsStores = list;
        return list;
    } catch(e) { _bbsStores = []; return []; }
}

async function _bbsLoadItems(storeName) {
    if (_bbsItemCache[storeName]) return _bbsItemCache[storeName];
    try {
        const res  = await fetch(`${_BBS_RTDB}/items/${storeName}.json`);
        const data = await res.json();
        if (!data) { _bbsItemCache[storeName] = []; return []; }
        const items = Object.values(data).filter(i => i && i.name);
        _bbsItemCache[storeName] = items;
        return items;
    } catch(e) { _bbsItemCache[storeName] = []; return []; }
}

async function _bbsSearch(q) {
    const query = q.trim().toLowerCase();
    if (!query) { _bbs_showInitial(); return; }

    _bbs_showLoading();
    const stores = await _bbsLoadStores();

    // 1. Match stores by name (companyname / nameAr)
    const storeMatches = stores.filter(s => {
        const en = (s.companyname || '').toLowerCase();
        const ar = (s.nameAr     || '').toLowerCase();
        return en.includes(query) || ar.includes(query);
    });

    // 2. Search items across all stores
    const CHUNK = 6;
    const itemResults = [];

    for (let i = 0; i < stores.length; i += CHUNK) {
        const chunk = stores.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async store => {
            const items = await _bbsLoadItems(store.companyname);
            items.forEach(item => {
                const nameLower = (item.name || '').toLowerCase();
                const catLower  = (item.cat || item.catmain || '').toLowerCase();
                if (nameLower.includes(query) || catLower.includes(query)) {
                    const price   = parseFloat(item.price) || 0;
                    const sale    = parseFloat(item.sale)  || 0;
                    const hasSale = sale > 0 && sale < price;
                    const _dp = hasSale ? sale : price;
                    itemResults.push({
                        item,
                        storeName    : store.companyname,
                        storeNameAr  : store.nameAr || store.companyname,
                        storeType    : store.type,
                        price,
                        sale,
                        hasSale,
                        dispPrice    : _dp,
                        priceUSD     : _toSearchUSD(_dp),  // normalized for fair sorting
                        matchScore   : nameLower === query ? 3
                                     : nameLower.startsWith(query) ? 2 : 1,
                    });
                }
            });
        }));
    }

    itemResults.sort((a, b) => (b.matchScore - a.matchScore) || (a.priceUSD - b.priceUSD));
    _bbs_showResults(itemResults, null, storeMatches);
}

let _bbsDebounce = null;
function _bbs_onInput() {
    const q = (document.getElementById('bbs-input').value || '').trim();
    const clearBtn = document.getElementById('bbs-clear');
    if (clearBtn) clearBtn.style.opacity = q ? '1' : '0';
    if (!q) { _bbs_showInitial(); return; }
    clearTimeout(_bbsDebounce);
    _bbsDebounce = setTimeout(() => _bbsSearch(q), 340);
}

function _bbs_showInitial() {
    document.getElementById('bbs-initial').style.display = '';
    document.getElementById('bbs-results').style.display = 'none';
    document.getElementById('bbs-empty').style.display   = 'none';
    document.getElementById('bbs-loading')?.remove();
}

function _bbs_showLoading() {
    document.getElementById('bbs-initial').style.display = 'none';
    document.getElementById('bbs-results').style.display = 'none';
    document.getElementById('bbs-empty').style.display   = 'none';
    let ld = document.getElementById('bbs-loading');
    if (!ld) {
        ld = document.createElement('div');
        ld.id = 'bbs-loading';
        ld.className = 'bbs__loading';
        ld.innerHTML = `<span class="bbs__loading-dot"></span><span class="bbs__loading-dot"></span><span class="bbs__loading-dot"></span>`;
        document.getElementById('bbs-body').appendChild(ld);
    }
}

function _bbs_showResults(results, sectionLabel, storeMatches) {
    document.getElementById('bbs-loading')?.remove();
    document.getElementById('bbs-initial').style.display = 'none';

    const hasStores = storeMatches && storeMatches.length > 0;
    const hasItems  = results && results.length > 0;

    if (!hasStores && !hasItems) {
        document.getElementById('bbs-results').style.display = 'none';
        document.getElementById('bbs-empty').style.display   = '';
        return;
    }

    document.getElementById('bbs-results').style.display = '';
    document.getElementById('bbs-empty').style.display   = 'none';

    // Build store-name matches section
    let storeHtml = '';
    if (hasStores) {
        const TYPE_LABELS = {
            Restaurants: 'مطعم', BakeryShops: 'مخبز', ButcherShops: 'ملحمة',
            Markets: 'سوبرماركت', GroceryShops: 'بقالة', SweetsShops: 'حلويات',
            FishShops: 'أسماك', CoffeeShops: 'قهوة', ChickenShops: 'دجاج',
            DairyShops: 'ألبان', FlowerShops: 'زهور', TobaccoShops: 'تبغ',
        };
        const TYPE_EMOJIS = {
            Restaurants: '&#127829;', BakeryShops: '&#129366;', ButcherShops: '&#129385;',
            Markets: '&#128722;', GroceryShops: '&#129530;', SweetsShops: '&#127856;',
            FishShops: '&#128031;', CoffeeShops: '&#9749;', ChickenShops: '&#127831;',
            DairyShops: '&#129371;', FlowerShops: '&#128144;', TobaccoShops: '&#128684;',
        };
        const storeRows = storeMatches.map(s => {
            const display = (s.nameAr && s.nameAr.trim()) ? s.nameAr.trim()
                : s.companyname.replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
            const slug = s.companyname.toLowerCase()
                .replace(/[^\x00-\x7F]/g,'').replace(/\s+/g,'-')
                .replace(/-+/g,'-').replace(/^-|-$/g,'') || 'store';
            const emoji = TYPE_EMOJIS[s.type] || '&#127978;';
            const label = TYPE_LABELS[s.type]  || s.type;
            const safeDisplay = display.replace(/'/g, '\\x27');
            return `
            <div class="bbs__store-row"
                 data-store-slug="${slug}"
                 data-store-name="${display}"
                 data-store-type="${s.type}"
                 data-store-rtdb="${s.companyname}">
                <div class="bbs__store-img">
                    <img src="assets/${slug}.webp" alt="${display}"
                         onerror="if(this.src.includes('.webp')){this.src=this.src.replace('.webp','.png');return;}this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="bbs__store-img-fb" style="display:none">${emoji}</div>
                </div>
                <div class="bbs__item-info">
                    <span class="bbs__item-store">${display}</span>
                    <span class="bbs__item-cat">${label}</span>
                </div>
                <span class="bbs__result-arrow">&#8250;</span>
            </div>`;
        }).join('');
        storeHtml = `
        <div class="bbs__store-section">
            <p class="bbs__section-label" style="margin-bottom:8px;">🏪 متاجر</p>
            ${storeRows}
        </div>`;
    }

    // Show section label if browsing by type
    let headerHtml = '';
    if (sectionLabel) {
        headerHtml = `<div style="font-size:0.72rem;font-weight:800;color:rgba(255,255,255,0.4);
                                   letter-spacing:0.08em;text-transform:uppercase;direction:rtl;
                                   margin-bottom:14px;">${sectionLabel} — ${results.length} منتج</div>`;
    }

    // Group by item name for comparison
    const groups = {};
    results.forEach(r => {
        const key = (r.item.name || '').trim().toLowerCase();
        if (!groups[key]) groups[key] = { name: r.item.name, entries: [] };
        groups[key].entries.push(r);
        // Keep entries sorted by USD-normalized price so idx===0 is truly cheapest
        groups[key].entries.sort((a, b) => (a.priceUSD || a.dispPrice) - (b.priceUSD || b.dispPrice));
    });

    const html = Object.values(groups).map(group => {
        const entries = group.entries;
        const multi   = entries.length > 1;

        const rowsHtml = entries.map((r, idx) => {
            const imgId = r.item.ID || r.item.id || '';
            const hasPng = r.item.pngExist === '1' || r.item.pngExist === 1;
            const imgSrc = hasPng ? `./items2/${String(imgId).toLowerCase()}.webp` : '';
            const storeDisplay = r.storeNameAr && r.storeNameAr !== r.storeName
                ? r.storeNameAr
                : r.storeName.replace(/[-_]/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
            const cheapest = idx === 0 && multi;
            return `
            <div class="bbs__item-row ${cheapest ? 'bbs__item-row--best' : ''}"
                 onclick="_bbsOpenItem(${JSON.stringify(r.item).replace(/"/g,'&quot;')}, '${r.storeName}', '${r.storeType}')">
                <div class="bbs__item-img">
                    ${hasPng
                        ? `<img src="${imgSrc}" alt="${r.item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                        : ''
                    }
                    <div class="bbs__item-img-fb" style="${hasPng?'display:none':''}">🏪</div>
                </div>
                <div class="bbs__item-info">
                    <span class="bbs__item-store">${storeDisplay}</span>
                    ${r.item.cat ? `<span class="bbs__item-cat">${r.item.cat}</span>` : ''}
                </div>
                <div class="bbs__item-pricing">
                    ${r.hasSale ? `<span class="bbs__item-sale-badge">خصم</span>` : ''}
                    <span class="bbs__item-price ${r.hasSale ? 'bbs__item-price--sale' : ''}">
                        ${typeof formatPrice === 'function' ? formatPrice(r.dispPrice) : r.dispPrice}
                    </span>
                    ${r.hasSale ? `<span class="bbs__item-price-old">${typeof formatPrice === 'function' ? formatPrice(r.price) : r.price}</span>` : ''}
                    ${cheapest ? `<span class="bbs__item-best-tag">الأرخص</span>` : ''}
                </div>
                <span class="bbs__result-arrow">›</span>
            </div>`;
        }).join('');

        return `
        <div class="bbs__group">
            <div class="bbs__group-header">
                <span class="bbs__group-name">${group.name}</span>
                ${multi ? `<span class="bbs__group-count">${entries.length} متجر</span>` : ''}
            </div>
            ${rowsHtml}
        </div>`;
    }).join('');

    document.getElementById('bbs-results-list').innerHTML = storeHtml + (headerHtml || '') + html;

    // Wire store-row clicks
    document.querySelectorAll('.bbs__store-row').forEach(row => {
        row.addEventListener('click', () => {
            const slug  = row.dataset.storeSlug;
            const name  = row.dataset.storeName;
            const type  = row.dataset.storeType;
            const rtdb  = row.dataset.storeRtdb;
            closeSearchOverlay();
            setTimeout(() => {
                if (typeof openStorePanel === 'function') openStorePanel(slug, name, type, rtdb);
            }, 300);
        });
    });
}

/* Open item popup from search — injects storeType into _currentStore so
   notes section shows for Restaurants/BakeryShops                       */
window._bbsOpenItem = function(item, storeName, storeType) {
    // Flag so closeItemPopup knows to return here instead of clearing modal-open
    window._bbsFromSearch = true;
    // Inject storeType into store-panel's private _currentStore via the exposed setter
    if (typeof window._setCurrentStoreForSearch === 'function') {
        window._setCurrentStoreForSearch(storeName, storeType);
    }
    // Hide search panel (keep overlay in DOM, just remove open class so it slides down)
    const srch = document.getElementById('bb-search-overlay');
    if (srch) srch.classList.remove('bbs--open');
    setTimeout(() => {
        if (typeof openItemPopup === 'function') openItemPopup(item, storeName);
    }, 300);
};

window.openSearchOverlay = function openSearchOverlay() {
    _injectSearchOverlay();
    const ov = document.getElementById('bb-search-overlay');
    requestAnimationFrame(() => {
        ov.classList.add('bbs--open');
        setTimeout(() => {
            const inp = document.getElementById('bbs-input');
            if (inp) inp.focus();
        }, 320);
    });
    document.body.classList.add('modal-open');
};

window.closeSearchOverlay = function closeSearchOverlay() {
    const ov = document.getElementById('bb-search-overlay');
    if (!ov) return;
    window._bbsFromSearch = false;
    ov.classList.remove('bbs--open');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
        const inp = document.getElementById('bbs-input');
        if (inp) { inp.value = ''; inp.blur(); }
        const clr = document.getElementById('bbs-clear');
        if (clr) clr.style.opacity = '0';
        _bbs_showInitial();
    }, 380);
};

function updateCartBadge() {
    const old = document.getElementById('cart-badge');
    if (old) old.style.display = 'none';
    const badge = document.getElementById('bb-cart-badge');
    if (!badge) return;
    const count = window.DelivoCart ? window.DelivoCart.getCount() : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}