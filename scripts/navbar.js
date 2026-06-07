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

            <button class="bb-tab" id="bb-orders-btn" aria-label="طلباتي">
                <span class="bb-tab__icon">
                    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 17H5a2 2 0 0 0-2 2"/>
                        <path d="M9 3H5a2 2 0 0 0-2 2v14"/>
                        <rect x="9" y="3" width="12" height="18" rx="2"/>
                    </svg>
                </span>
                <span class="bb-tab__label">طلباتي</span>
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
        const t = document.getElementById('categories') || document.getElementById('stores-section');
        if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('bb-orders-btn').addEventListener('click', () => {
        const ov = document.getElementById('modal-account');
        if (ov) {
            ov.classList.add('open');
            document.body.classList.add('modal-open');
            setTimeout(() => { const b = document.getElementById('acct-orders-btn'); if (b) b.click(); }, 80);
        }
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

function updateCartBadge() {
    const old = document.getElementById('cart-badge');
    if (old) old.style.display = 'none';
    const badge = document.getElementById('bb-cart-badge');
    if (!badge) return;
    const count = window.DelivoCart ? window.DelivoCart.getCount() : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}