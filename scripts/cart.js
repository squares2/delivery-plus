/* ============================================================
   scripts/cart.js
   Multi-store cart — items grouped by store in sidebar.
   Each item carries { id, name, price, storeName, storeType }.
   Checkout writes one request per store to Firebase.
   ============================================================ */

const RTDB_CART_URL    = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
let DELIVERY_FEE_PER_STORE = 2; // $2 default — overwritten by settings/deliveryFee on load
const POINTS_PER_ORDER = 10;    // loyalty points awarded per store order

/* ── Load flat delivery fee from Firebase settings once per session ─── */
(async function _initFlatFee() {
    try {
        const r = await fetch(`${RTDB_CART_URL}/settings/deliveryFee.json`);
        if (r.ok) {
            const val = await r.json();
            if (val !== null && !isNaN(parseFloat(val))) {
                DELIVERY_FEE_PER_STORE = parseFloat(val);
            }
        }
    } catch (_) {}
})();

/* ══════════════════════════════════════════════════════════════
   SMART DELIVERY ENGINE
   Reads settings/smartDelivery from Firebase once per session.
   Formula: fee = max(minFee, baseFee + distKm × ratePerKm) − tierDiscount
   Falls back to flat DELIVERY_FEE_PER_STORE if disabled or error.
══════════════════════════════════════════════════════════════ */
let _smartCfg       = null;   // loaded once: { enabled, baseFee, ratePerKm, minFee, tiers }
let _smartCfgLoaded = false;
let _storeLocs      = {};     // storeName → { lat, lng } fetched once per session

async function _loadSmartCfg() {
    if (_smartCfgLoaded) return _smartCfg;
    try {
        const r = await fetch(`${RTDB_CART_URL}/settings/smartDelivery.json`);
        _smartCfg = r.ok ? await r.json() : null;
    } catch (_) { _smartCfg = null; }
    _smartCfgLoaded = true;
    return _smartCfg;
}

async function _loadStoreLoc(storeName) {
    if (_storeLocs[storeName]) return _storeLocs[storeName];
    try {
        // Search all pattern types for this store
        const r = await fetch(`${RTDB_CART_URL}/pattern.json?shallow=true`);
        if (!r.ok) return null;
        const types = Object.keys(await r.json() || {});
        for (const type of types) {
            const r2 = await fetch(`${RTDB_CART_URL}/pattern/${type}.json`);
            if (!r2.ok) continue;
            const list = await r2.json();
            if (!list) continue;
            const match = Object.values(list).find(s => s && s.companyname === storeName);
            if (match && match.lat && match.lng) {
                _storeLocs[storeName] = { lat: parseFloat(match.lat), lng: parseFloat(match.lng) };
                return _storeLocs[storeName];
            }
        }
    } catch (_) {}
    return null;
}

// Haversine distance in km between two lat/lng points
function _haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Compute delivery fee for one store given customer coords and cart subtotal ($)
async function _calcSmartFee(storeName, custLat, custLng, cartSubtotalUSD) {
    const cfg = await _loadSmartCfg();
    if (!cfg || !cfg.enabled) return DELIVERY_FEE_PER_STORE;

    const baseFee   = parseFloat(cfg.baseFee   ?? 1.5);
    const ratePerKm = parseFloat(cfg.ratePerKm ?? 0.3);
    const minFee    = parseFloat(cfg.minFee    ?? 0.5);
    const maxFee    = parseFloat(cfg.maxFee    ?? 5.0);

    // Distance component
    let distFee = baseFee;
    if (custLat && custLng) {
        const storeLoc = await _loadStoreLoc(storeName);
        if (storeLoc) {
            const km = _haversineKm(custLat, custLng, storeLoc.lat, storeLoc.lng);
            distFee = baseFee + km * ratePerKm;
        }
    }

    // Cart-total discount tiers (sorted desc so highest matching tier wins)
    let discount = 0;
    if (cfg.tiers && Array.isArray(cfg.tiers)) {
        const sorted = [...cfg.tiers].sort((a,b) => b.minTotal - a.minTotal);
        for (const tier of sorted) {
            if (cartSubtotalUSD >= parseFloat(tier.minTotal)) {
                discount = parseFloat(tier.discount);
                break;
            }
        }
    }

    return Math.min(maxFee, Math.max(minFee, distFee - discount));
}

// Cached per-store fees for current render cycle (invalidated on cart change)
let _feeCache       = {};   // storeName → fee $
let _feeCacheSubtot = -1;   // subtotal when cache was built
let _feeCacheLat    = null;
let _feeCacheLng    = null;

async function _getStoreFee(storeName, custLat, custLng, cartSubtotalUSD) {
    const cacheKey = `${storeName}|${custLat}|${custLng}|${cartSubtotalUSD}`;
    if (_feeCache[cacheKey] !== undefined) return _feeCache[cacheKey];
    const fee = await _calcSmartFee(storeName, custLat, custLng, cartSubtotalUSD);
    _feeCache[cacheKey] = fee;
    return fee;
}

// Get current customer coords from cart location inputs or user profile
function _getCustomerCoords() {
    const lat = parseFloat(document.getElementById('cart-loc-lat')?.value || '')
             || parseFloat(window.DelivoUser?.location?.lat || window.DelivoUser?.lat || '');
    const lng = parseFloat(document.getElementById('cart-loc-lng')?.value || '')
             || parseFloat(window.DelivoUser?.location?.lng || window.DelivoUser?.lng || '');
    return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };
}

// Expose so admin preview can call it
window._calcSmartFee = _calcSmartFee;
window._loadSmartCfg = _loadSmartCfg;

/* ── First-free-delivery state (resolved once per session) ── */
let _isFirstOrder       = false;  // true  → this checkout qualifies for free delivery
let _firstOrderChecked  = false;  // true  → check already ran, don't re-fetch
let _firstOrderPromise  = null;   // pending fetch — prevent duplicate requests

/**
 * Returns a promise that resolves to true if the signed-in user
 * has never placed an order before (historyRequests/{uid} is empty/absent).
 * Result is cached for the session so we only hit RTDB once.
 */
async function _checkIsFirstOrder() {
    const user = window.DelivoUser;
    if (!user) return false;

    if (_firstOrderChecked) return _isFirstOrder;

    if (_firstOrderPromise) return _firstOrderPromise;

    _firstOrderPromise = (async () => {
        try {
            const resp = await fetch(
                `${RTDB_CART_URL}/historyRequests/${user.uid}.json?shallow=true`
            );
            const data = await resp.json();
            // data is null (no history) or an object of keys → user has orders
            const hasOrders = data !== null && typeof data === 'object' && Object.keys(data).length > 0;
            _isFirstOrder      = !hasOrders;
            _firstOrderChecked = true;
        } catch (_) {
            _isFirstOrder      = false;
            _firstOrderChecked = true;
        }
        return _isFirstOrder;
    })();

    return _firstOrderPromise;
}

/** Reset cached first-order check (called after successful checkout) */
function _resetFirstOrderCache() {
    _isFirstOrder      = false;
    _firstOrderChecked = true;  // keep checked=true so we never show free delivery again
    _firstOrderPromise = null;
}

function initCart() {

    /* ── State ──────────────────────────────────────────────── */
    window.DelivoCart = {
        items: JSON.parse(localStorage.getItem('delivo_cart_v2') || '[]'),

        /* All unique store names in cart */
        getStores() {
            return [...new Set(this.items.map(i => i.storeName))];
        },

        /* Items for one specific store */
        getStoreItems(storeName) {
            return this.items.filter(i => i.storeName === storeName);
        },

        getCount() {
            return this.items.reduce((s, i) => s + i.qty, 0);
        },

        /* Raw sum (mixed currencies — use _cartTotalUSD for display) */
        getTotal() {
            return this.items.reduce((s, i) => s + i.price * i.qty, 0);
        },

        addItem(id, name, price, storeName, storeType, notes) {
            const isInstance = id.includes('__i');
            const existing   = !isInstance
                ? this.items.find(i => i.id === id && i.storeName === storeName)
                : null;

            if (existing) {
                existing.qty++;
            } else {
                this.items.push({
                    id,
                    name,
                    price    : parseFloat(price),
                    qty      : 1,
                    storeName: storeName || '',
                    storeType: storeType || '',
                    notes    : notes || '',
                });
            }
            this.save();
            this.updateBadge();
        },

        decrementItem(id, storeName) {
            const existing = this.items.find(i => i.id === id && i.storeName === storeName);
            if (!existing) return;
            existing.qty--;
            if (existing.qty <= 0) {
                this.items = this.items.filter(i => !(i.id === id && i.storeName === storeName));
            }
            this.save();
            this.updateBadge();
        },

        removeItem(id, storeName) {
            this.items = this.items.filter(i => !(i.id === id && i.storeName === storeName));
            this.save();
            this.updateBadge();
        },

        clearStore(storeName) {
            this.items = this.items.filter(i => i.storeName !== storeName);
            this.save();
            this.updateBadge();
        },

        clear() {
            this.items = [];
            this.save();
            this.updateBadge();
        },

        save() {
            localStorage.setItem('delivo_cart_v2', JSON.stringify(this.items));
        },

        updateBadge() {
            const count = this.getCount();
            const badge = document.getElementById('cart-badge');
            if (badge) badge.style.display = 'none';
            const bbBadge = document.getElementById('bb-cart-badge');
            if (bbBadge) {
                bbBadge.textContent = count;
                bbBadge.style.display = count > 0 ? 'flex' : 'none';
            }
        }
    };

    window.DelivoCart.updateBadge();

    /* ── Open / Close ───────────────────────────────────────── */
    window.openCartSidebar = function() {
        const overlay = document.getElementById('cart-overlay');
        const sidebar = document.getElementById('cart-sidebar');
        if (!overlay || !sidebar) return;
        renderCartSidebar();
        overlay.classList.add('active');
        sidebar.classList.add('active');
        document.body.classList.add('modal-open');
        if (typeof window._cartLocationRefresh === 'function') window._cartLocationRefresh();

        // Kick off first-order check in background so it's ready by checkout time
        if (window.DelivoUser) _checkIsFirstOrder().then(() => _refreshTotals());
    };

    window.closeCartSidebar = function() {
        const overlay = document.getElementById('cart-overlay');
        const sidebar = document.getElementById('cart-sidebar');
        if (overlay) overlay.classList.remove('active');
        if (sidebar) sidebar.classList.remove('active');
        document.body.classList.remove('modal-open');
    };

    /* ── Render sidebar ─────────────────────────────────────── */
    window.renderCartSidebar = function() {
        const cart     = window.DelivoCart;
        const countEl  = document.getElementById('cart-header-count');
        const bodyEl   = document.getElementById('cart-body');
        const footerEl = document.getElementById('cart-footer');
        const storeLabel = document.getElementById('cart-store-label');

        if (!bodyEl) return;

        const count  = cart.getCount();
        const stores = cart.getStores();

        if (countEl) {
            countEl.textContent   = count;
            countEl.style.display = count > 0 ? 'inline' : 'none';
        }

        if (storeLabel) storeLabel.style.display = 'none';

        if (count === 0) {
            bodyEl.innerHTML = `
                <div class="cart-empty">
                    <div class="cart-empty__icon">🛒</div>
                    <div class="cart-empty__title">السلة فارغة</div>
                    <div class="cart-empty__sub">أضف منتجات من أي متجر لتبدأ طلبك</div>
                </div>`;
            if (footerEl) footerEl.style.display = 'none';
            return;
        }

        /* Group items by store — one section per store */
        bodyEl.innerHTML = `<div class="cart-items" id="cart-items-list">
            ${stores.map(storeName => _renderStoreGroup(storeName, cart.getStoreItems(storeName))).join('')}
        </div>`;

        /* Footer */
        if (footerEl) {
            footerEl.style.display = 'flex';
            _refreshTotals();
        }

        setTimeout(_initMouseDragScroll, 0);
    };

    /* ── Store group section HTML ───────────────────────────── */
    function _renderStoreGroup(storeName, items) {
        const freeDelivery = _isFirstOrder;
        // Placeholder — fee updates asynchronously via _updateStoreFeeHint
        const feeDisplay = freeDelivery
            ? `<span style="text-decoration:line-through;color:#aaa;margin-left:4px;">$${DELIVERY_FEE_PER_STORE.toFixed(2)}</span> <span style="color:#22c55e;font-weight:800;">مجاناً 🎁</span>`
            : `<span class="fee-loading" style="color:var(--clr-gray-400);font-size:0.75em;">…</span>`;

        return `
        <div class="cart-store-group" id="csg-${_cslug(storeName)}">
            <div class="cart-store-group__header">
                <span class="cart-store-group__name">🏪 ${storeName}</span>
                <button class="cart-store-group__clear"
                        onclick="cartClearStore('${storeName}')"
                        title="مسح متجر">✕</button>
            </div>
            ${items.map(item => _renderCartItem(item)).join('')}
            <div class="cart-store-group__subtotal">
                المجموع: <strong>${'$' + _storeUSD(items).toFixed(2)}</strong>
            </div>
            <div class="cart-store-group__delivery-hint" id="fee-hint-${_cslug(storeName)}">
                🛵 رسوم توصيل هذا المتجر: ${feeDisplay}
            </div>
        </div>`;
    }

    // Async: fill in smart fee hint after DOM is ready
    async function _updateStoreFeeHints() {
        const cart    = window.DelivoCart;
        const coords  = _getCustomerCoords();
        const stores  = cart.getStores();
        for (const storeName of stores) {
            const items    = cart.getStoreItems(storeName);
            const subtotal = _storeUSD(items);
            const hintEl   = document.getElementById(`fee-hint-${_cslug(storeName)}`);
            if (!hintEl) continue;
            if (_isFirstOrder) continue; // banner already shown
            try {
                const fee = await _getStoreFee(storeName, coords.lat, coords.lng, subtotal);
                const cfg = await _loadSmartCfg();
                const isSmartMode = cfg && cfg.enabled;
                const badge = isSmartMode
                    ? `<span style="font-size:0.68em;background:rgba(255,92,0,0.12);color:var(--clr-orange);border-radius:4px;padding:1px 5px;margin-right:4px;">ذكي</span>`
                    : '';
                hintEl.innerHTML = `🛵 رسوم توصيل هذا المتجر: ${badge}<strong>$${fee.toFixed(2)}</strong>`;
            } catch(_) {}
        }
        // Also refresh totals with smart fees
        await _refreshTotalsAsync();
    }

    /* ── Single cart item row HTML ──────────────────────────── */
    function _renderCartItem(item) {
        const baseItemId  = item.id.replace(/__i\d+$/, '');
        const idParts     = baseItemId.split('__');
        const rawId       = idParts[idParts.length - 1];
        const imgUrl      = `./items2/${rawId.toLowerCase()}.webp`;
        const uniqueKey   = `${item.storeName}__${item.id}`;
        const isInstance  = item.id.includes('__i');

        return `
        <div class="cart-item${item.notes ? ' cart-item--noted' : ''}" id="ci-${_cslug(uniqueKey)}">
            <img class="cart-item__img" src="${imgUrl}" alt="${item.name}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="cart-item__img-fallback" style="display:none">🛍️</div>
            <div class="cart-item__info">
                <div class="cart-item__name">${item.name}</div>
                ${item.notes
                    ? `<div class="cart-item__notes">
                           ${item.notes.split('، ').map(kw =>
                               `<span class="cart-item__note-chip">${kw}</span>`
                           ).join('')}
                       </div>`
                    : ''}
                <div class="cart-item__unit-price">${_fmt(item.price)} / قطعة</div>
            </div>
            <div class="cart-item__controls">
                ${isInstance
                    ? `<button class="cart-item__btn cart-item__btn--remove"
                               onclick="cartRemoveItem('${item.id}','${item.storeName}')" title="حذف">🗑</button>`
                    : `<button class="cart-item__btn cart-item__btn--remove"
                               onclick="cartRemoveItem('${item.id}','${item.storeName}')" title="حذف">🗑</button>
                       <button class="cart-item__btn"
                               onclick="cartDecrement('${item.id}','${item.storeName}')">−</button>
                       <span class="cart-item__qty" id="cqty-${_cslug(uniqueKey)}">${item.qty}</span>
                       <button class="cart-item__btn"
                               onclick="cartIncrement('${item.id}','${item.name}',${item.price},'${item.storeName}','${item.storeType}')">+</button>`
                }
            </div>
        </div>`;
    }

    /* ── Mutations ──────────────────────────────────────────── */
    window.cartIncrement = function(id, name, price, storeName, storeType) {
        const existing = window.DelivoCart.items.find(i => i.id === id && i.storeName === storeName);
        const notes = existing ? existing.notes : '';
        window.DelivoCart.addItem(id, name, price, storeName, storeType, notes);
        _refreshCartItem(id, storeName);
        if (window.updateSpCartBar) window.updateSpCartBar();
    };

    window.cartDecrement = function(id, storeName) {
        window.DelivoCart.decrementItem(id, storeName);
        const qty = _getQty(id, storeName);
        if (qty <= 0) {
            const row = document.getElementById(`ci-${_cslug(storeName + '__' + id)}`);
            if (row) row.remove();
            _checkEmptyStore(storeName);
        } else {
            _refreshCartItem(id, storeName);
        }
        _checkEmptyCart();
        if (window.updateSpCartBar) window.updateSpCartBar();
        _syncStorePanelQty(id, qty);
    };

    window.cartRemoveItem = function(id, storeName) {
        window.DelivoCart.removeItem(id, storeName);
        const row = document.getElementById(`ci-${_cslug(storeName + '__' + id)}`);
        if (row) row.remove();
        _checkEmptyStore(storeName);
        _checkEmptyCart();
        if (window.updateSpCartBar) window.updateSpCartBar();
        _syncStorePanelQty(id, 0);
    };

    window.cartClearStore = function(storeName) {
        window.DelivoCart.clearStore(storeName);
        const group = document.getElementById(`csg-${_cslug(storeName)}`);
        if (group) group.remove();
        _checkEmptyCart();
        if (window.updateSpCartBar) window.updateSpCartBar();
    };

    function _checkEmptyStore(storeName) {
        const remaining = window.DelivoCart.getStoreItems(storeName);
        if (remaining.length === 0) {
            const group = document.getElementById(`csg-${_cslug(storeName)}`);
            if (group) group.remove();
        } else {
            const group = document.getElementById(`csg-${_cslug(storeName)}`);
            if (group) {
                const subEl = group.querySelector('.cart-store-group__subtotal strong');
                if (subEl) subEl.textContent = '$' + _storeUSD(remaining).toFixed(2);
            }
        }
    }

    function _refreshCartItem(id, storeName) {
        const item = window.DelivoCart.items.find(i => i.id === id && i.storeName === storeName);
        if (!item) return;
        const uniqueKey = `${storeName}__${id}`;
        const qtyEl = document.getElementById(`cqty-${_cslug(uniqueKey)}`);
        if (qtyEl) qtyEl.textContent = item.qty;
        const row = document.getElementById(`ci-${_cslug(uniqueKey)}`);
        if (row) {
            const sub = row.querySelector('.cart-item__subtotal');
            if (sub) sub.textContent = _fmt(item.price * item.qty);
        }
        _refreshTotals();
        window.DelivoCart.updateBadge();
    }

    function _refreshTotals() {
        // Sync version — uses flat fee; replaced by async version when smart mode is on
        const cart         = window.DelivoCart;
        const subtotalEl   = document.getElementById('cart-subtotal');
        const deliveryEl   = document.getElementById('cart-delivery');
        const grandtotalEl = document.getElementById('cart-grandtotal');
        const bannerEl     = document.getElementById('cart-free-delivery-banner');
        const subtotalUSD  = _cartTotalUSD();
        const storeCount   = cart.getStores().length;

        const deliveryFee  = _isFirstOrder ? 0 : storeCount * DELIVERY_FEE_PER_STORE;
        const grandTotal   = subtotalUSD + deliveryFee;

        if (subtotalEl)   subtotalEl.textContent   = '$' + subtotalUSD.toFixed(2);
        if (deliveryEl) {
            if (_isFirstOrder) {
                deliveryEl.innerHTML = `<span style="text-decoration:line-through;color:#aaa;font-size:0.82em;">$${(storeCount * DELIVERY_FEE_PER_STORE).toFixed(2)}</span> <span style="color:#22c55e;font-weight:800;">مجاناً 🎁</span>`;
            } else {
                deliveryEl.textContent = deliveryFee > 0 ? '$' + deliveryFee.toFixed(2) : 'مجاناً';
            }
        }
        if (grandtotalEl) grandtotalEl.textContent = '$' + grandTotal.toFixed(2);

        // Show/hide first-order banner
        if (bannerEl) bannerEl.style.display = _isFirstOrder ? 'flex' : 'none';

        // Trigger async smart-fee update (non-blocking)
        _updateStoreFeeHints().catch(() => {});
    }

    async function _refreshTotalsAsync() {
        const cart         = window.DelivoCart;
        const subtotalEl   = document.getElementById('cart-subtotal');
        const deliveryEl   = document.getElementById('cart-delivery');
        const grandtotalEl = document.getElementById('cart-grandtotal');
        const bannerEl     = document.getElementById('cart-free-delivery-banner');
        const subtotalUSD  = _cartTotalUSD();
        const stores       = cart.getStores();
        const coords       = _getCustomerCoords();

        if (subtotalEl) subtotalEl.textContent = '$' + subtotalUSD.toFixed(2);
        if (bannerEl)   bannerEl.style.display = _isFirstOrder ? 'flex' : 'none';

        if (_isFirstOrder) {
            const flatTotal = stores.length * DELIVERY_FEE_PER_STORE;
            if (deliveryEl) deliveryEl.innerHTML = `<span style="text-decoration:line-through;color:#aaa;font-size:0.82em;">$${flatTotal.toFixed(2)}</span> <span style="color:#22c55e;font-weight:800;">مجاناً 🎁</span>`;
            if (grandtotalEl) grandtotalEl.textContent = '$' + subtotalUSD.toFixed(2);
            return;
        }

        // Sum per-store fees
        let totalDelivery = 0;
        for (const storeName of stores) {
            const items   = cart.getStoreItems(storeName);
            const storeSub = _storeUSD(items);
            const fee     = await _getStoreFee(storeName, coords.lat, coords.lng, storeSub);
            totalDelivery += fee;
        }

        const grandTotal = subtotalUSD + totalDelivery;
        if (deliveryEl)   deliveryEl.textContent   = '$' + totalDelivery.toFixed(2);
        if (grandtotalEl) grandtotalEl.textContent = '$' + grandTotal.toFixed(2);
    }

    function _syncStorePanelQty(id, qty) {
        const slug  = id.replace(/[^a-zA-Z0-9]/g, '_');
        const qtyEl = document.getElementById(`sp-qty-${slug}`);
        if (qtyEl) qtyEl.textContent = qty;
    }

    function _checkEmptyCart() {
        window.DelivoCart.updateBadge();
        if (window.DelivoCart.getCount() === 0) renderCartSidebar();
        else _refreshTotals();
    }

    /* ── Checkout — one request per store ───────────────────── */
    window.cartCheckout = async function() {
        const cart   = window.DelivoCart;
        const stores = cart.getStores();
        if (stores.length === 0) return;

        const user = window.DelivoUser;
        if (!user) {
            closeCartSidebar();
            setTimeout(() => { if (typeof openModal === 'function') openModal('modal-login'); }, 200);
            return;
        }

        // Block checkout if no phone number on file
        const userPhone = (window.DelivoUser && window.DelivoUser.phone) || '';
        if (!userPhone) {
            closeCartSidebar();
            setTimeout(() => {
                _showToast('⚠️ يجب إضافة رقم هاتفك أولاً لإتمام الطلب', 'error');
                if (typeof openModal === 'function') openModal('modal-account');
            }, 200);
            return;
        }

        const btn = document.getElementById('cart-checkout-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>جاري الإرسال…</span>'; }

        try {
            // Re-check first-order status right before writing (definitive check)
            const isFirstOrderNow = await _checkIsFirstOrder();

            // Get current counter
            const counterResp = await fetch(`${RTDB_CART_URL}/globalCounter.json`);
            const counterData = await counterResp.json();
            let nextId = 200;
            if (counterData && counterData.requestId) nextId = parseInt(counterData.requestId) + 1;
            else if (typeof counterData === 'number')  nextId = counterData + 1;


            const userProfile = window.DelivoUser || {};
            const now         = new Date();
            const dateStr     = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

            const phone = userPhone.startsWith('+961') ? userPhone : '+961' + userPhone;

            const cartLat  = document.getElementById('cart-loc-lat')?.value || '';
            const cartLng  = document.getElementById('cart-loc-lng')?.value || '';
            const orderLat = cartLat || String(userProfile.location?.lat || userProfile.lat || '');
            const orderLng = cartLng || String(userProfile.location?.lng || userProfile.lng || '');

            // Compute effective delivery fee per store (smart or flat)
            const coords = _getCustomerCoords();

            // Write one request per store
            for (const storeName of stores) {
                const storeItems     = cart.getStoreItems(storeName);
                const storeSub       = _storeUSD(storeItems);
                const smartFee       = isFirstOrderNow ? 0 : await _getStoreFee(storeName, coords.lat, coords.lng, storeSub);
                const cartStr        = storeItems.map(i => `${i.qty}:${i.name}:${i.price}:${storeName}:${(i.notes||'').replace(/,/g,'،').replace(/:/g,'؛')}`).join(',');
                const storeTotal     = (storeSub + smartFee).toFixed(2);
                const requestKey = `id_${nextId}`;

                const requestObj = {
                    cart         : cartStr,
                    city         : 'Baalbeck',
                    date         : dateStr,
                    delivryplusid: user.uid || '',
                    driver       : '0',
                    freeDelivery : isFirstOrderNow ? '1' : '0',  // ← flag for admin/driver
                    fullname     : userProfile.displayName || user.displayName || user.email || '',
                    lat          : String(orderLat),
                    lng          : String(orderLng),
                    phone        : phone,
                    read         : '0',
                    state        : '0',
                    store        : storeName,
                    street       : userProfile.street || '',
                    total        : storeTotal,
                    trackorder   : '0',
                    username     : userProfile.username || user.email || '',
                    vault        : '0',
                };

                const writeRequest = fetch(`${RTDB_CART_URL}/requests/${requestKey}.json`, {
                    method  : 'PUT',
                    headers : { 'Content-Type': 'application/json' },
                    body    : JSON.stringify(requestObj),
                });

                const historyObj = { ...requestObj, trackorder: '0' };
                const writeHistory = fetch(`${RTDB_CART_URL}/historyRequests/${user.uid}/${requestKey}.json`, {
                    method  : 'PUT',
                    headers : { 'Content-Type': 'application/json' },
                    body    : JSON.stringify(historyObj),
                });

                await Promise.all([writeRequest, writeHistory]);
                nextId++;
            }

            // Update counter
            await fetch(`${RTDB_CART_URL}/globalCounter/requestId.json`, {
                method  : 'PUT',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify(nextId - 1),
            });

            // Invalidate first-order cache so it never applies again this session
            _resetFirstOrderCache();

            // ── WhatsApp admin notification ───────────────────────────────
            // Reads settings/adminPhone from Firebase (e.g. "96176123456")
            // Opens a wa.me deep link in a background tab so the customer
            // doesn't have to do anything — admin is notified immediately.
            try {
                const adminPhoneResp = await fetch(`${RTDB_CART_URL}/settings/adminPhone.json`);
                if (adminPhoneResp.ok) {
                    const adminPhone = await adminPhoneResp.json();
                    if (adminPhone) {
                        const userProfile = window.DelivoUser || {};
                        const phone       = (userProfile.phone || '').replace(/\D/g,'');
                        const name        = userProfile.displayName || userProfile.username || 'مجهول';
                        const storeList   = stores.join(' + ');
                        const msgLines    = [
                            `🔔 *طلب جديد على Delivo*`,
                            `👤 ${name}  📞 +961${phone}`,
                            `🏪 ${storeList}`,
                            `📍 https://maps.google.com/?q=${orderLat},${orderLng}`,
                        ];
                        const waMsg  = encodeURIComponent(msgLines.join('\n'));
                        const waLink = `https://wa.me/${adminPhone}?text=${waMsg}`;
                        window.open(waLink, '_blank', 'noopener,noreferrer');
                    }
                }
            } catch (_) { /* non-critical — order is already saved */ }
            // ─────────────────────────────────────────────────────────────

            // ── Loyalty points — increment in RTDB ───────────────────────
            // Done after orders are written so a checkout failure doesn't award points.
            // Non-critical: a failure here does NOT roll back the order.
            try {
                const pointsEarned = stores.length * POINTS_PER_ORDER;
                const ptsResp = await fetch(`${RTDB_CART_URL}/users/${user.uid}/points.json`);
                const ptsNow  = parseInt((await ptsResp.json()) || 0);
                const ptsNew  = ptsNow + pointsEarned;
                await fetch(`${RTDB_CART_URL}/users/${user.uid}/points.json`, {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(ptsNew),
                });
                // Sync local UI badge if account modal is already open
                const balEl = document.getElementById('acct-points-balance');
                if (balEl) balEl.textContent = ptsNew;
            } catch (_) { /* non-critical */ }
            // ─────────────────────────────────────────────────────────────

            cart.clear();
            closeCartSidebar();

            const successMsg = isFirstOrderNow
                ? `🎉 مبروك! طلبك الأول وصل مجاناً — بدون رسوم توصيل!`
                : `✅ تم إرسال ${stores.length > 1 ? stores.length + ' طلبات' : 'طلبك'} بنجاح! ⭐ +${stores.length * POINTS_PER_ORDER} نقاط عند التوصيل`;
            _showToast(successMsg, 'success');

            // Refresh the store counts section so the total reflects the new order
            if (typeof window.refreshStoreCounts === 'function') window.refreshStoreCounts();

        } catch (err) {
            console.error('[Cart] Checkout error:', err);
            _showToast('❌ حدث خطأ، حاول مجدداً', 'error');
        } finally {
            if (btn) {
                btn.disabled  = false;
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> إتمام الطلب`;
            }
        }
    };

    /* ── Toast ──────────────────────────────────────────────── */
    function _showToast(msg, type = 'success') {
        let toast = document.getElementById('cart-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cart-toast';
            toast.className = 'cart-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.className   = `cart-toast cart-toast--${type}`;
        requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
        setTimeout(() => toast.classList.remove('visible'), 3200);
    }

    /* ── Wire events ────────────────────────────────────────── */
    const cartIcon = document.getElementById('cart-icon');
    if (cartIcon) cartIcon.addEventListener('click', openCartSidebar);

    const overlay  = document.getElementById('cart-overlay');
    if (overlay)   overlay.addEventListener('click', closeCartSidebar);

    const closeBtn = document.getElementById('cart-close-btn');
    if (closeBtn)  closeBtn.addEventListener('click', closeCartSidebar);

    const clearBtn = document.getElementById('cart-clear-btn');
    if (clearBtn)  clearBtn.addEventListener('click', () => {
        if (window.DelivoCart.getCount() === 0) return;
        if (confirm('هل تريد مسح السلة كاملاً؟')) {
            window.DelivoCart.clear();
            renderCartSidebar();
            if (window.updateSpCartBar) window.updateSpCartBar();
        }
    });

    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (checkoutBtn)  checkoutBtn.addEventListener('click', cartCheckout);

    /* ── Extras toggle (note + location) ───────────────────── */
    const extrasToggle = document.getElementById('cart-extras-toggle');
    const extrasPanel  = document.getElementById('cart-extras-panel');
    if (extrasToggle && extrasPanel) {
        extrasToggle.addEventListener('click', () => {
            const open = extrasPanel.classList.toggle('open');
            extrasToggle.classList.toggle('open', open);
        });
    }

    /* ── Cart location picker ───────────────────────────────── */
    _initCartLocation();

    /* ── Mouse drag scroll ──────────────────────────────────── */
    _initMouseDragScroll();

    /* ── Swipe-to-close (mobile touch) ─────────────────────── */
    _initCartSwipe();
}

function _initCartLocation() {
    const gpsBtn    = document.getElementById('cart-loc-gps');
    const mapBtn    = document.getElementById('cart-loc-map');
    const clearBtn  = document.getElementById('cart-loc-clear');
    const mapWrap   = document.getElementById('cart-loc-map-wrap');
    const statusTxt = document.getElementById('cart-loc-status-text');
    const latInput  = document.getElementById('cart-loc-lat');
    const lngInput  = document.getElementById('cart-loc-lng');
    if (!gpsBtn || !mapBtn) return;

    function setLocation(lat, lng, label) {
        latInput.value  = lat;
        lngInput.value  = lng;
        statusTxt.textContent = label || `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
        statusTxt.classList.add('set');
        clearBtn.style.display = 'inline-flex';
        gpsBtn.classList.remove('active');
        mapBtn.classList.remove('active');
        const locDot = document.getElementById('cart-extras-loc-dot');
        if (locDot) locDot.style.display = 'inline';
    }

    function clearLocation() {
        latInput.value  = '';
        lngInput.value  = '';
        statusTxt.textContent = 'لم يتم تحديد الموقع';
        statusTxt.classList.remove('set');
        clearBtn.style.display = 'none';
        gpsBtn.classList.remove('active');
        mapBtn.classList.remove('active');
        const locDot = document.getElementById('cart-extras-loc-dot');
        if (locDot) locDot.style.display = 'none';
        if (mapWrap) mapWrap.style.display = 'none';
    }

    const prof = window.DelivoUser || {};
    const savedLat = prof.location?.lat || prof.lat || '';
    const savedLng = prof.location?.lng || prof.lng || '';
    if (savedLat && savedLng) {
        setLocation(savedLat, savedLng, '📍 موقعك المحفوظ');
    }

    gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            statusTxt.textContent = 'جهازك لا يدعم تحديد الموقع.';
            return;
        }
        gpsBtn.classList.add('active');
        gpsBtn.textContent = '⏳ جاري التحديد...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setLocation(lat, lng, '📍 موقعك الحالي');
                gpsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> موقعي الحالي`;
                if (mapWrap) mapWrap.style.display = 'none';
            },
            () => {
                gpsBtn.classList.remove('active');
                gpsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> موقعي الحالي`;
                statusTxt.textContent = 'تعذّر تحديد الموقع.';
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    });

    let _cartMap = null, _cartMarker = null;

    mapBtn.addEventListener('click', () => {
        const modal  = document.getElementById('cart-map-modal');
        const mapDiv = document.getElementById('cart-map-modal-map');
        if (!modal || !mapDiv) return;

        modal.style.display = 'flex';

        const initLat    = parseFloat(latInput.value) || 34.004;
        const initLng    = parseFloat(lngInput.value) || 36.210;
        const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';

        if (_cartMap) { _cartMap.remove(); _cartMap = null; _cartMarker = null; }
        mapDiv.innerHTML = '';

        requestAnimationFrame(() => {
            const tileSatellite = L.tileLayer(
                `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
                { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
            );
            const tileStandard = L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                { attribution: '© OpenStreetMap', maxZoom: 19 }
            );
            let currentLayer = 'satellite';

            _cartMap = L.map(mapDiv, {
                zoomControl: true,
                tap: false,
                attributionControl: true,
            }).setView([initLat, initLng], 16);

            tileSatellite.addTo(_cartMap);

            const toggleCtrl = L.control({ position: 'topright' });
            toggleCtrl.onAdd = function() {
                const btn = L.DomUtil.create('button', '');
                btn.innerHTML = '🗺 خريطة';
                btn.style.cssText = 'background:#fff;border:2px solid #FF5C00;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;color:#FF5C00;box-shadow:0 1px 5px rgba(0,0,0,0.3);white-space:nowrap;';
                L.DomEvent.on(btn, 'click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    if (currentLayer === 'satellite') {
                        _cartMap.removeLayer(tileSatellite);
                        tileStandard.addTo(_cartMap);
                        currentLayer = 'standard';
                        btn.innerHTML = '🛰 صورة جوية';
                    } else {
                        _cartMap.removeLayer(tileStandard);
                        tileSatellite.addTo(_cartMap);
                        currentLayer = 'satellite';
                        btn.innerHTML = '🗺 خريطة';
                    }
                });
                return btn;
            };
            toggleCtrl.addTo(_cartMap);

            const orangeIcon = L.divIcon({
                className: '',
                html: '<div style="width:30px;height:30px;background:#FF5C00;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
                iconSize: [30, 30],
                iconAnchor: [15, 30],
            });

            _cartMarker = L.marker([initLat, initLng], {
                icon: orangeIcon,
                draggable: true,
            }).addTo(_cartMap);

            _cartMap.on('click', (e) => { _cartMarker.setLatLng(e.latlng); });
            _cartMap.invalidateSize();
        });
    });

    const confirmBtn = document.getElementById('cart-map-modal-confirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (_cartMarker) {
                const pos = _cartMarker.getLatLng();
                setLocation(pos.lat.toFixed(6), pos.lng.toFixed(6));
                mapBtn.classList.add('active');
            }
            document.getElementById('cart-map-modal').style.display = 'none';
            if (_cartMap) { _cartMap.remove(); _cartMap = null; _cartMarker = null; }
        });
    }

    const modalClose = document.getElementById('cart-map-modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            document.getElementById('cart-map-modal').style.display = 'none';
            if (_cartMap) { _cartMap.remove(); _cartMap = null; _cartMarker = null; }
        });
    }

    clearBtn.addEventListener('click', clearLocation);

    window._cartLocationRefresh = function() {
        if (latInput.value) return;
        const p = window.DelivoUser || {};
        const lat = p.location?.lat || p.lat || '';
        const lng = p.location?.lng || p.lng || '';
        if (lat && lng) setLocation(lat, lng, '📍 موقعك المحفوظ');
    };
}

function _initMouseDragScroll() {
    const el = document.getElementById('cart-body');
    if (!el) return;

    let isDown    = false;
    let startY    = 0;
    let scrollTop = 0;

    el.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, textarea, a')) return;
        isDown    = true;
        startY    = e.pageY - el.offsetTop;
        scrollTop = el.scrollTop;
        el.classList.add('is-mouse-dragging');
    });

    el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('is-mouse-dragging'); });
    el.addEventListener('mouseup',    () => { isDown = false; el.classList.remove('is-mouse-dragging'); });

    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const y    = e.pageY - el.offsetTop;
        const walk = (y - startY) * 1.4;
        el.scrollTop = scrollTop - walk;
    });
}

function _initCartSwipe() {
    const sidebar = document.getElementById('cart-sidebar');
    if (!sidebar) return;

    let touchStartX   = 0;
    let touchStartY   = 0;
    let touchStartT   = 0;
    let currentDeltaX = 0;
    let isSwiping     = false;
    let isScrolling   = null;

    const THRESHOLD   = 72;
    const VELOCITY_TH = 0.35;

    sidebar.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const rect  = sidebar.getBoundingClientRect();
        const relX  = touch.clientX - rect.left;
        if (relX > sidebar.offsetWidth * 0.35) return;
        touchStartX   = touch.clientX;
        touchStartY   = touch.clientY;
        touchStartT   = e.timeStamp;
        currentDeltaX = 0;
        isSwiping     = true;
        isScrolling   = null;
    }, { passive: true });

    sidebar.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const touch = e.touches[0];
        const dX    = touch.clientX - touchStartX;
        const dY    = touch.clientY - touchStartY;
        if (isScrolling === null) { isScrolling = Math.abs(dY) > Math.abs(dX); }
        if (isScrolling) { isSwiping = false; return; }
        currentDeltaX = Math.min(0, dX);
        sidebar.classList.add('is-dragging');
        sidebar.style.transform = 'translateX(' + currentDeltaX + 'px)';
        const progress  = Math.abs(currentDeltaX) / sidebar.offsetWidth;
        const overlayEl = document.getElementById('cart-overlay');
        if (overlayEl) overlayEl.style.opacity = String(0.55 * (1 - progress));
    }, { passive: true });

    sidebar.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        sidebar.classList.remove('is-dragging');
        sidebar.style.transform = '';
        const touch    = e.changedTouches[0];
        const dX       = touch.clientX - touchStartX;
        const dt       = Math.max(1, e.timeStamp - touchStartT);
        const velocity = Math.abs(dX) / dt;
        const overlayEl = document.getElementById('cart-overlay');
        if (overlayEl) overlayEl.style.opacity = '';
        if (dX < -THRESHOLD || velocity > VELOCITY_TH) window.closeCartSidebar();
    }, { passive: true });
}

/* ── Utilities ──────────────────────────────────────────────── */

function _fmt(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return '';
    if (v < 1000) return '$' + v.toFixed(v % 1 === 0 ? 0 : 2);
    return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + ' ألف ل.ل';
}

function _toUSD(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return 0;
    return v < 1000 ? v : v / 90000;
}

function _storeUSD(items) {
    return items.reduce((sum, i) => sum + _toUSD(i.price) * i.qty, 0);
}

function _cartTotalUSD() {
    if (!window.DelivoCart) return 0;
    return _storeUSD(window.DelivoCart.items);
}

function _cslug(s) {
    return String(s).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
}

function _getQty(id, storeName) {
    if (!window.DelivoCart) return 0;
    const item = window.DelivoCart.items.find(i => i.id === id && i.storeName === storeName);
    return item ? item.qty : 0;
}