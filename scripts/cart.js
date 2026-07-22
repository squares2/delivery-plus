/* ============================================================
   scripts/cart.js
   Multi-store cart — items grouped by store in sidebar.
   Each item carries { id, name, price, storeName, storeType }.
   Checkout writes one request per store to Firebase.
   ============================================================ */

const RTDB_CART_URL    = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
let DELIVERY_FEE_PER_STORE = 2; // $2 default — overwritten by settings/deliveryFee on load
const POINTS_PER_ORDER = 10;    // loyalty points awarded per store order

// Top-level toast helper (reuses the same #cart-toast element/styling as
// the cart's own internal _showToast). Needed because that one is private
// to initCart() and unreachable from top-level functions like the
// coverage-warning flow below.
let _covToastTimer = null;
function _showToast(msg, type = 'success') {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        toast.className = 'cart-toast';
        document.body.appendChild(toast);
    }
    if (_covToastTimer) { clearTimeout(_covToastTimer); _covToastTimer = null; }
    toast.classList.remove('visible');
    toast.textContent = msg;
    toast.className   = `cart-toast cart-toast--${type}`;
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
    _covToastTimer = setTimeout(() => { toast.classList.remove('visible'); _covToastTimer = null; }, 4000);
}

/* ── Prefetch admin phone for the warning link in cart footer ────────── */
function _applyAdminPhoneLink(phone) {
    const clean = String(phone).replace(/[^0-9]/g, '');
    if (!clean || clean.length < 7) return;
    const link = document.getElementById('cart-warning-admin-link');
    if (!link) return;
    link.href   = `https://wa.me/${clean}`;
    link.target = '_blank';
    link.rel    = 'noopener';
    link.title  = `واتساب: +${clean}`;
    link.textContent = 'واتسآب';
    if (!document.getElementById('cart-warning-call-link')) {
        link.insertAdjacentHTML('afterend',
            ` / <a id="cart-warning-call-link" href="tel:+${clean}"
               style="color:#d97706;font-weight:800;text-decoration:underline;"
               title="اتصال مباشر">اتصال</a>`
        );
    }
}

async function _loadAdminPhoneLink() {
    // Apply from cache immediately (instant) then refresh from Firebase
    try {
        const cached = localStorage.getItem('delivo_admin_phone');
        if (cached) _applyAdminPhoneLink(cached);
    } catch (_) {}

    try {
        const r = await fetch(`${RTDB_CART_URL}/settings/adminPhone.json`);
        if (!r.ok) return;
        const phone = await r.json();
        if (!phone) return;
        _applyAdminPhoneLink(phone);
        try { localStorage.setItem('delivo_admin_phone', String(phone)); } catch (_) {}
    } catch (_) {}
}

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
   NIGHT DELIVERY SURGE
   Reads settings/nightDelivery = { enabled, startHour, endHour, flatFee, perKm }.
   Adds a static surcharge on top of whatever the normal fee comes out to
   (flat OR smart-computed) for the entire configured night window — full
   fee the instant startHour hits, same fee at 2am as at 11:01pm, back to
   $0 the instant endHour is reached. No ramp/curve.
   flatFee/perKm are admin-entered in Lebanese Lira (large numbers, same
   >1000-is-LBP convention as the rest of the app) and converted to USD
   here via _toUSD before being added to the USD-denominated delivery fee.
══════════════════════════════════════════════════════════════ */
let _nightCfg       = null;
let _nightCfgLoaded = false;

async function _loadNightCfg() {
    if (_nightCfgLoaded) return _nightCfg;
    try {
        const r = await fetch(`${RTDB_CART_URL}/settings/nightDelivery.json`);
        _nightCfg = r.ok ? await r.json() : null;
    } catch (_) { _nightCfg = null; }
    _nightCfgLoaded = true;
    return _nightCfg;
}

// Current hour-of-day in Beirut time as a decimal (e.g. 23.5 = 11:30pm) —
// matters because the night window is a real-world clock concept, not
// whatever timezone a visiting customer's device happens to be set to.
function _beirutHourFrac() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Beirut', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const h = parseFloat(parts.find(p => p.type === 'hour').value);
    const m = parseFloat(parts.find(p => p.type === 'minute').value);
    return h + m / 60;
}

// true for the entire configured window, correctly handling windows that
// cross midnight (e.g. 22 → 6). No ramp — the fee is fully on or fully off.
function _isNightActive(startHour, endHour) {
    let duration = endHour - startHour;
    if (duration <= 0) duration += 24;
    let elapsed = _beirutHourFrac() - startHour;
    if (elapsed < 0) elapsed += 24;
    return elapsed <= duration;
}

async function _calcNightSurcharge(distanceKm) {
    const cfg = await _loadNightCfg();
    if (!cfg || !cfg.enabled) return 0;
    const startHour = parseFloat(cfg.startHour ?? 22);
    const endHour   = parseFloat(cfg.endHour   ?? 6);
    if (!_isNightActive(startHour, endHour)) return 0;
    // Stored in ل.ل — _toUSD auto-detects (values >1000 = LBP) and converts
    // to the USD figure this function's caller expects.
    const flatFeeUSD = _toUSD(parseFloat(cfg.flatFee ?? 90000));
    const perKmUSD   = _toUSD(parseFloat(cfg.perKm   ?? 0));
    return flatFeeUSD + perKmUSD * (distanceKm || 0);
}

// Small transparency touch shown next to the delivery-fee line in the cart —
// only appears when the night surcharge is actually contributing right now.
async function _nightBadgeHtml() {
    const cfg = await _loadNightCfg();
    if (!cfg || !cfg.enabled) return '';
    const active = _isNightActive(parseFloat(cfg.startHour ?? 22), parseFloat(cfg.endHour ?? 6));
    if (!active) return '';
    return ` <span title="رسوم توصيل ليلي مُفعّلة الآن 🌙" style="font-size:0.85em;">🌙</span>`;
}

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

/* ── "Distance-from-center" pricing table ────────────────────
   Alternative to the baseFee+ratePerKm formula above: instead of
   computing a formula per store, the admin defines boundary rows
   — e.g. [0-2km]→$1, [2-3km]→$1.5, [3km+]→$2.5 — measured from a
   single fixed point: settings/deliveryCenter (the Delivo HQ pin
   already used for the coverage-radius check). Returns null if
   centerTiers is empty/missing so the caller can fall back. */
function _calcCenterTierFee(distanceKm, centerTiers) {
    if (!centerTiers || !Array.isArray(centerTiers) || !centerTiers.length) return null;
    const sorted = [...centerTiers].sort((a, b) => parseFloat(a.fromKm||0) - parseFloat(b.fromKm||0));
    for (const t of sorted) {
        const from = parseFloat(t.fromKm) || 0;
        const to   = (t.toKm === null || t.toKm === '' || t.toKm === undefined) ? Infinity : parseFloat(t.toKm);
        if (distanceKm >= from && distanceKm < to) return parseFloat(t.fee) || 0;
    }
    // Beyond every defined boundary — best effort: use the last (farthest) tier's fee
    // rather than silently falling back, so far-out customers still get *a* price.
    return parseFloat(sorted[sorted.length - 1].fee) || 0;
}

/* ══════════════════════════════════════════════════════════════
   DELIVERY COVERAGE RADIUS
   Reads settings/deliveryCenter = { lat, lng, radiusKm } from
   Firebase (set by the admin on the live map panel) and rejects
   checkout when the customer's chosen delivery pin falls outside
   that circle. Fails OPEN (allows checkout) if no center/radius has
   been configured yet, so this never blocks orders on a fresh setup.
   ══════════════════════════════════════════════════════════════ */
const DEFAULT_COVERAGE_RADIUS_KM = 7;

async function _getDeliveryCenter() {
    try {
        const resp = await fetch(`${RTDB_CART_URL}/settings/deliveryCenter.json`);
        const data = await resp.json();
        if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
            return {
                lat: data.lat,
                lng: data.lng,
                radiusKm: (typeof data.radiusKm === 'number' && data.radiusKm > 0)
                    ? data.radiusKm : DEFAULT_COVERAGE_RADIUS_KM,
            };
        }
    } catch (_) { /* network hiccup — fail open below */ }
    return null;
}

// Returns { ok:true } when inside coverage (or when no center is
// configured), or { ok:false, distanceKm, radiusKm, center } when the
// point falls outside the delivery circle.
async function _checkDeliveryRadius(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) return { ok: true };
    const center = await _getDeliveryCenter();
    if (!center) return { ok: true };
    const distanceKm = _haversineKm(lat, lng, center.lat, center.lng);
    if (distanceKm > center.radiusKm) {
        return { ok: false, distanceKm, radiusKm: center.radiusKm, center };
    }
    return { ok: true };
}
window._checkDeliveryRadius = _checkDeliveryRadius;
window._getDeliveryCenter   = _getDeliveryCenter;

// Convenience one-call helper for any flow that sets a customer location
// (checkout, registration, edit-profile): checks the point against the
// admin-configured coverage circle, and if it falls outside, pops up the
// same map warning used at checkout — with an optional custom callback
// for what "change location" should do in that specific context (e.g.
// reopen the registration map picker instead of the cart's).
// Resolves to `true` if the point is OK to use, `false` if it was rejected
// (the warning modal is already showing in that case).
async function _checkCoverageOrWarn(lat, lng, onChangeLocation = null, onConfirm = null) {
    const check = await _checkDeliveryRadius(lat, lng);
    if (check.ok) return true;
    await _showCoverageWarning(check.center, check.radiusKm, lat, lng, check.distanceKm, onChangeLocation, onConfirm);
    return false;
}
window._checkCoverageOrWarn = _checkCoverageOrWarn;

// Show the "outside coverage" warning with a live, INTERACTIVE map:
// coverage circle, Delivo center pin, and a draggable pin for the
// customer's location. The customer can drag the pin, click anywhere
// on this same map, or tap "موقعي الحالي" (GPS) to reposition it —
// no need to leave this modal to fix an out-of-range location.
// `onChangeLocation`, if provided, is kept as a legacy escape hatch —
// unused by the buttons below now, but still callable programmatically.
// `onConfirm(lat, lng)`, if provided, is called once the customer picks
// a point that IS inside the coverage circle and presses "تأكيد الموقع".
// If not provided, the default (cart/checkout context) writes straight
// into the cart's own location fields.
let _covWarnMap = null, _covWarnOnChange = null, _covWarnOnConfirm = null;
let _covWarnMarker = null, _covWarnLat = null, _covWarnLng = null;
let _covWarnCenter = null, _covWarnRadiusKm = null;

function _covWarnUpdateMsg(distanceKm, radiusKm, stillOutside) {
    const msgEl = document.getElementById('coverage-warning-msg');
    if (!msgEl) return;
    if (stillOutside) {
        msgEl.innerHTML = `<b style="color:#dc2626;">لا يزال هذا الموقع خارج النطاق</b> — يبعد ${distanceKm.toFixed(1)} كم عن مركز التوصيل (النطاق المسموح ${radiusKm} كم). حرّك الدبوس ضمن الدائرة البرتقالية ثم اضغط "تأكيد الموقع".`;
    } else {
        msgEl.innerHTML = `<b style="color:#16a34a;">✓ هذا الموقع ضمن نطاق التغطية</b> — يبعد ${distanceKm.toFixed(1)} كم عن المركز. اضغط "تأكيد الموقع" للمتابعة.`;
    }
}

// Move the working pin to a new lat/lng — used by drag, map click, and
// the GPS button. `fly`, when true, animates the map over to the point
// (used for GPS since the new point may be far from the current view).
function _covWarnSetLocation(lat, lng, fly = false) {
    _covWarnLat = lat;
    _covWarnLng = lng;
    if (_covWarnMarker) _covWarnMarker.setLatLng([lat, lng]);
    if (_covWarnMap && fly) _covWarnMap.flyTo([lat, lng], 15, { animate: true, duration: 0.9 });
    if (_covWarnCenter) {
        const d = _haversineKm(lat, lng, _covWarnCenter.lat, _covWarnCenter.lng);
        _covWarnUpdateMsg(d, _covWarnRadiusKm, d > _covWarnRadiusKm);
    }
}

async function _showCoverageWarning(center, radiusKm, custLat, custLng, distanceKm, onChangeLocation = null, onConfirm = null) {
    _covWarnOnChange  = onChangeLocation;
    _covWarnOnConfirm = onConfirm;
    _covWarnCenter    = center;
    _covWarnRadiusKm  = radiusKm;
    _covWarnLat       = !isNaN(custLat) ? custLat : center.lat;
    _covWarnLng       = !isNaN(custLng) ? custLng : center.lng;

    const modal  = document.getElementById('coverage-warning-modal');
    const mapDiv = document.getElementById('coverage-warning-map');
    const msgEl  = document.getElementById('coverage-warning-msg');

    if (!modal || !mapDiv) {
        _showToast(`⚠️ عذراً، موقعك (${distanceKm.toFixed(1)} كم) خارج نطاق التغطية (${radiusKm} كم)`, 'error');
        return;
    }

    if (msgEl) _covWarnUpdateMsg(distanceKm, radiusKm, true);

    modal.style.display = 'flex';
    await _ensureLeafletLoaded();

    if (_covWarnMap) { _covWarnMap.remove(); _covWarnMap = null; }
    mapDiv.innerHTML = '';
    _covWarnMarker = null;

    requestAnimationFrame(() => {
        const map = L.map(mapDiv, { zoomControl: true, tap: false }).setView([center.lat, center.lng], 12);

        // ── Tile layers — standard (OSM) + satellite/hybrid (Google, with
        // place labels) so the customer can switch to whichever makes it
        // easier to recognize their own street/building, same toggle used
        // on the registration map picker.
        const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
        const standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap', maxZoom: 19,
        });
        const satelliteLayer = L.tileLayer(
            `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
            { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
        );
        standardLayer.addTo(map);
        let covWarnLayer = 'standard';

        const toggleCtrl = L.control({ position: 'topright' });
        toggleCtrl.onAdd = function () {
            const btn = L.DomUtil.create('button', 'map-toggle-btn');
            btn.innerHTML = '🛰 صورة جوية';
            btn.title     = 'تبديل نوع الخريطة';
            btn.style.cssText = `
                background:#fff; border:2px solid #FF5C00;
                border-radius:6px; padding:5px 9px;
                font-size:12px; font-weight:700;
                cursor:pointer; color:#FF5C00;
                box-shadow:0 1px 5px rgba(0,0,0,0.3);
                white-space:nowrap;
            `;
            L.DomEvent.on(btn, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                if (covWarnLayer === 'standard') {
                    map.removeLayer(standardLayer);
                    satelliteLayer.addTo(map);
                    covWarnLayer = 'satellite';
                    btn.innerHTML = '🗺 خريطة';
                } else {
                    map.removeLayer(satelliteLayer);
                    standardLayer.addTo(map);
                    covWarnLayer = 'standard';
                    btn.innerHTML = '🛰 صورة جوية';
                }
            });
            return btn;
        };
        toggleCtrl.addTo(map);

        const centerIcon = L.divIcon({
            className: '',
            html: '<div style="width:30px;height:30px;background:#8b5cf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 3px 10px rgba(139,92,246,0.55);border:2px solid #fff;">🏢</div>',
            iconSize: [30, 30], iconAnchor: [15, 15],
        });
        L.marker([center.lat, center.lng], { icon: centerIcon })
            .addTo(map).bindPopup('🏢 مركز التوصيل');

        const circle = L.circle([center.lat, center.lng], {
            radius: radiusKm * 1000,
            color: '#FF5C00',
            weight: 2,
            dashArray: '6,8',
            fillColor: '#FF5C00',
            fillOpacity: 0.07,
        }).addTo(map);

        let bounds = circle.getBounds();

        const custIcon = L.divIcon({
            className: '',
            html: '<div style="width:26px;height:26px;background:#ef4444;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
            iconSize: [26, 26], iconAnchor: [13, 26],
        });

        // Draggable pin for the customer's (currently rejected) location —
        // this is the whole point: fix it right here instead of opening
        // a second map elsewhere.
        _covWarnMarker = L.marker([_covWarnLat, _covWarnLng], { icon: custIcon, draggable: true })
            .addTo(map).bindPopup('📍 موقعك — اسحب لتعديله');
        bounds = bounds.extend([_covWarnLat, _covWarnLng]);

        _covWarnMarker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            _covWarnSetLocation(pos.lat, pos.lng, false);
        });

        // Click anywhere on the map to move the pin there directly
        map.on('click', (e) => {
            _covWarnSetLocation(e.latlng.lat, e.latlng.lng, false);
        });

        map.fitBounds(bounds, { padding: [28, 28] });
        _covWarnMap = map;
        setTimeout(() => map.invalidateSize(), 120);
    });
}

function _closeCoverageWarning() {
    const modal = document.getElementById('coverage-warning-modal');
    if (modal) modal.style.display = 'none';
    if (_covWarnMap) { _covWarnMap.remove(); _covWarnMap = null; }
    _covWarnMarker    = null;
    _covWarnOnChange  = null;
    _covWarnOnConfirm = null;
    _covWarnCenter    = null;
    _covWarnRadiusKm  = null;
}
window._closeCoverageWarning = _closeCoverageWarning;

function _initCoverageWarningModal() {
    const closeBtn   = document.getElementById('coverage-warning-close');
    const closeBtn2  = document.getElementById('coverage-warning-close-btn');
    const gpsBtn     = document.getElementById('coverage-warning-gps-btn');
    const confirmBtn = document.getElementById('coverage-warning-confirm-btn');
    const overlay    = document.getElementById('coverage-warning-modal');

    if (closeBtn)  closeBtn.addEventListener('click', _closeCoverageWarning);
    if (overlay)   overlay.addEventListener('click', (e) => { if (e.target === overlay) _closeCoverageWarning(); });

    // "موقعي الحالي" — re-run GPS right here and fly the map to the
    // fresh position; still subject to the same coverage check as
    // everything else (message updates, doesn't auto-confirm).
    if (gpsBtn) {
        gpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                _showToast('جهازك لا يدعم تحديد الموقع', 'error');
                return;
            }
            const orig = gpsBtn.innerHTML;
            gpsBtn.disabled  = true;
            gpsBtn.innerHTML = '⏳ جاري التحديد...';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    gpsBtn.disabled  = false;
                    gpsBtn.innerHTML = orig;
                    _covWarnSetLocation(pos.coords.latitude, pos.coords.longitude, true);
                },
                () => {
                    gpsBtn.disabled  = false;
                    gpsBtn.innerHTML = orig;
                    _showToast('تعذّر تحديد موقعك. حرّك الدبوس يدوياً على الخريطة', 'error');
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    }

    // "تأكيد الموقع" — confirm the pin's current spot on THIS map.
    // Re-checks it against the coverage circle first; if it's still
    // outside, keeps the modal open and updates the warning instead of
    // silently accepting an invalid point.
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (_covWarnLat == null || _covWarnLng == null || !_covWarnCenter) return;
            const dist = _haversineKm(_covWarnLat, _covWarnLng, _covWarnCenter.lat, _covWarnCenter.lng);
            if (dist > _covWarnRadiusKm) {
                _covWarnUpdateMsg(dist, _covWarnRadiusKm, true);
                return;
            }
            const finalLat = _covWarnLat, finalLng = _covWarnLng;
            const cb = _covWarnOnConfirm;
            _closeCoverageWarning();
            if (typeof cb === 'function') {
                cb(finalLat, finalLng);
                return;
            }
            // Default (cart/checkout context): write straight into the
            // checkout's own location fields so "إرسال الطلب" picks up
            // the corrected point without reopening any other picker.
            const latEl = document.getElementById('cart-loc-lat');
            const lngEl = document.getElementById('cart-loc-lng');
            if (latEl) latEl.value = finalLat;
            if (lngEl) lngEl.value = finalLng;
            _showToast('✓ تم تحديث موقع التوصيل، بإمكانك إتمام الطلب الآن', 'success');
        });
    }
}

// Compute delivery fee for one store given customer coords and cart subtotal ($).
// Returns { fee, distanceKm } — distanceKm is null when unknown (only used
// by the night-delivery surcharge's optional per-km component).
async function _calcSmartFee(storeName, custLat, custLng, cartSubtotalUSD) {
    const cfg = await _loadSmartCfg();
    if (!cfg || !cfg.enabled) return { fee: DELIVERY_FEE_PER_STORE, distanceKm: null };

    const mode      = cfg.mode || 'formula'; // 'formula' (default, back-compat) | 'centerTiers'
    const baseFee   = parseFloat(cfg.baseFee   ?? 1.5);
    const ratePerKm = parseFloat(cfg.ratePerKm ?? 0.3);
    const minFee    = parseFloat(cfg.minFee    ?? 0.5);
    const maxFee    = parseFloat(cfg.maxFee    ?? 5.0);

    let distFee;
    let isExactTierPrice   = false;
    let distanceKmForNight = null;

    if (mode === 'centerTiers') {
        const center = await _getDeliveryCenter();
        if (center && custLat && custLng) {
            const kmFromCenter = _haversineKm(custLat, custLng, center.lat, center.lng);
            distanceKmForNight = kmFromCenter;
            const tierFeeLBP = _calcCenterTierFee(kmFromCenter, cfg.centerTiers);
            // Center-tier prices are admin-entered in Lebanese Lira (large numbers,
            // e.g. 50000) — convert to a USD-equivalent right away so the discount
            // subtraction below (which is $-denominated) works correctly, and the
            // final _normalizeDeliveryFee() call at the call site converts this back
            // to a clean LBP number for display, same as every other fee in the app.
            if (tierFeeLBP !== null) { distFee = _toUSD(tierFeeLBP); isExactTierPrice = true; }
        }
        if (distFee === undefined) {
            // No customer location yet (or no HQ center configured) — show the
            // cheapest configured tier as a "starting from" estimate. baseFee is
            // a formula-mode concept and has no real meaning here, so falling
            // back to it would show a number that doesn't match any tier at all.
            if (cfg.centerTiers && cfg.centerTiers.length) {
                const cheapest = [...cfg.centerTiers].sort((a, b) => (parseFloat(a.fee)||0) - (parseFloat(b.fee)||0))[0];
                distFee = _toUSD(parseFloat(cheapest.fee) || 0);
                isExactTierPrice = true;
            } else {
                distFee = baseFee; // no tiers configured at all yet — nothing better to show
            }
        }
    } else {
        // Formula mode (original behaviour) — distance from the store itself
        distFee = baseFee;
        if (custLat && custLng) {
            const storeLoc = await _loadStoreLoc(storeName);
            if (storeLoc) {
                const km = _haversineKm(custLat, custLng, storeLoc.lat, storeLoc.lng);
                distFee = baseFee + km * ratePerKm;
                distanceKmForNight = km;
            }
        }
    }

    // Cart-total discount tiers (sorted desc so highest matching tier wins) —
    // shared behaviour across both modes
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

    // Center-tier prices are exact admin-set prices per boundary — still honour
    // cart discounts, but don't clamp them into the formula's min/max band.
    const fee = isExactTierPrice
        ? Math.max(0, distFee - discount)
        : Math.min(maxFee, Math.max(minFee, distFee - discount));
    return { fee, distanceKm: distanceKmForNight };
}

// Cached per-store fees for current render cycle (invalidated on cart change)
let _feeCache       = {};   // storeName → fee $
let _feeCacheSubtot = -1;   // subtotal when cache was built
let _feeCacheLat    = null;
let _feeCacheLng    = null;

async function _getStoreFee(storeName, custLat, custLng, cartSubtotalUSD) {
    const cacheKey = `${storeName}|${custLat}|${custLng}|${cartSubtotalUSD}`;
    if (_feeCache[cacheKey] !== undefined) return _feeCache[cacheKey];
    const { fee: baseFee, distanceKm } = await _calcSmartFee(storeName, custLat, custLng, cartSubtotalUSD);
    const nightSurcharge = await _calcNightSurcharge(distanceKm);
    const fee = Math.max(0, baseFee + nightSurcharge);
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

/* ══════════════════════════════════════════════════════════════
   LOYALTY REWARD QUEUE
   /users/{uid}/rewardQueue  → FIFO array of one-time reward objects:
     { pts, icon, reward, type, value }
   type ∈ free_delivery | discount_fixed | discount_percent | account_credit | manual

   - free_delivery / discount_fixed / discount_percent: applied to the
     customer's NEXT checkout, then removed from the queue.
   - account_credit: credited immediately to /users/{uid}/credit when
     the threshold is crossed (not queued for "next order").
   - manual: stays in the queue until an admin marks it fulfilled
     (admin Rewards Inbox).
══════════════════════════════════════════════════════════════ */
let _activeReward      = null;   // first queue-applicable item (free_delivery/discount_*), resolved once per session
let _activeRewardChecked = false;
let _activeRewardPromise = null;

/** Returns the first auto-appliable reward in the queue (or null) */
async function _checkActiveReward() {
    const user = window.DelivoUser;
    if (!user) return null;
    if (_activeRewardChecked) return _activeReward;
    if (_activeRewardPromise) return _activeRewardPromise;

    _activeRewardPromise = (async () => {
        try {
            const r = await fetch(`${RTDB_CART_URL}/users/${user.uid}/rewardQueue.json`);
            const queue = await r.json();
            if (Array.isArray(queue)) {
                // Skip rewards the user deferred this session via "تخطّ" button
                _activeReward = queue.find(it =>
                    it &&
                    ['free_delivery','discount_fixed','discount_percent'].includes(it.type) &&
                    !sessionStorage.getItem('delivo_reward_skipped_' + it.pts)
                ) || null;
            } else {
                _activeReward = null;
            }
        } catch (_) { _activeReward = null; }
        _activeRewardChecked = true;
        return _activeReward;
    })();

    return _activeRewardPromise;
}

/** Expose reward cache reset so loyalty modal can call it after reordering queue */
window._resetRewardCache = function() {
    _activeReward        = null;
    _activeRewardChecked = false;
    _activeRewardPromise = null;
};

/** Skip (defer) the currently active reward — it stays in queue but won't auto-apply
    this session. Cart banner is hidden and totals refresh without the reward.     */
window._skipCartReward = function() {
    // Mark this reward as skipped for this session only (not permanently removed)
    if (_activeReward) {
        sessionStorage.setItem('delivo_reward_skipped_' + _activeReward.pts, '1');
    }
    _activeReward        = null;
    _activeRewardChecked = true; // prevent re-fetch
    _activeRewardPromise = null;
    const bannerEl = document.getElementById('cart-reward-banner');
    if (bannerEl) bannerEl.style.display = 'none';
    if (typeof _refreshTotals === 'function') _refreshTotals();
    if (typeof _refreshTotalsAsync === 'function') _refreshTotalsAsync();
};

/** Remove the given reward from the user's queue (after it's been used at checkout) */
async function _consumeActiveReward(item) {
    const user = window.DelivoUser;
    if (!user || !item) return;
    try {
        const r = await fetch(`${RTDB_CART_URL}/users/${user.uid}/rewardQueue.json`);
        const queue = await r.json();
        if (!Array.isArray(queue)) return;
        const idx = queue.findIndex(it => it && it.pts === item.pts && it.type === item.type);
        if (idx !== -1) queue.splice(idx, 1);
        await fetch(`${RTDB_CART_URL}/users/${user.uid}/rewardQueue.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(queue),
        });
    } catch (_) {}
    _activeReward        = null;
    _activeRewardChecked = false;
    _activeRewardPromise = null;
}

/**
 * Compare oldPts → newPts against the loyalty ladder and queue any
 * newly-crossed thresholds. account_credit is applied immediately;
 * the rest are pushed to rewardQueue (FIFO, oldest threshold first).
 */
async function _processLoyaltyThresholds(uid, oldPts, newPts) {
    try {
        const rewards = (typeof window._loadLoyaltyRewards === 'function')
            ? await window._loadLoyaltyRewards()
            : [];
        if (!Array.isArray(rewards) || !rewards.length) return;

        const [claimedResp, queueResp] = await Promise.all([
            fetch(`${RTDB_CART_URL}/users/${uid}/claimedTiers.json`),
            fetch(`${RTDB_CART_URL}/users/${uid}/rewardQueue.json`),
        ]);
        let claimed = await claimedResp.json();
        let queue   = await queueResp.json();
        claimed = Array.isArray(claimed) ? claimed : [];
        queue   = Array.isArray(queue)   ? queue   : [];

        let creditAdd = 0;
        const newlyCrossed = rewards.filter(s => s.pts > oldPts && s.pts <= newPts && !claimed.includes(s.pts));

        for (const step of newlyCrossed) {
            claimed.push(step.pts);
            if (step.type === 'account_credit') {
                creditAdd += parseFloat(step.value) || 0;
            } else {
                queue.push({ pts: step.pts, icon: step.icon, reward: step.reward, type: step.type, value: step.value || 0 });
            }
        }

        if (!newlyCrossed.length) return;

        const writes = [
            fetch(`${RTDB_CART_URL}/users/${uid}/claimedTiers.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(claimed),
            }),
            fetch(`${RTDB_CART_URL}/users/${uid}/rewardQueue.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(queue),
            }),
        ];
        if (creditAdd > 0) {
            const credResp = await fetch(`${RTDB_CART_URL}/users/${uid}/credit.json`);
            const credNow  = parseFloat((await credResp.json()) || 0) || 0;
            writes.push(fetch(`${RTDB_CART_URL}/users/${uid}/credit.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credNow + creditAdd),
            }));
        }
        await Promise.all(writes);

        // Reset session cache so the new queue/credit is reflected immediately
        _activeReward        = null;
        _activeRewardChecked = false;
        _activeRewardPromise = null;
    } catch (_) { /* non-critical */ }
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

        addItem(id, name, price, storeName, storeType, notes, imgUrl) {
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
                    imgUrl   : imgUrl  || '',   // pre-resolved image URL from store panel
                });
            }
            this.save();
            this.updateBadge();
            window.DelivoAttn?.event('addToCart');
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
        window.DelivoAttn?.event('cartOpen');
        // Load Arabic store names in background before rendering
        _loadNameArCache().then(() => {
            renderCartSidebar();
            _loadAdminPhoneLink();
        });
        overlay.classList.add('active');
        sidebar.classList.add('active');
        document.body.classList.add('modal-open');
        if (typeof window._cartLocationRefresh === 'function') window._cartLocationRefresh();

        // Kick off active reward check in background so it's ready by checkout time
        if (window.DelivoUser) {
            _checkActiveReward().then(() => _refreshTotals());
        }
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
    // nameAr cache: companyname → Arabic display name (populated on first cart open)
    let _nameArCache = {};
    async function _loadNameArCache() {
        if (Object.keys(_nameArCache).length) return;
        try {
            const r = await fetch(`${RTDB_CART_URL}/pattern.json`);
            const data = await r.json();
            if (!data || typeof data !== 'object') return;
            for (const entries of Object.values(data)) {
                if (!entries || typeof entries !== 'object') continue;
                const arr = Array.isArray(entries) ? entries : Object.values(entries);
                for (const s of arr) {
                    if (s && s.companyname && s.nameAr) {
                        _nameArCache[s.companyname] = s.nameAr.trim();
                    }
                }
            }
        } catch (_) {}
    }

    function _renderStoreGroup(storeName, items) {
        const feeDisplay = `<span class="fee-loading" style="color:var(--clr-gray-400);font-size:0.75em;">…</span>`;
        const displayName = (_nameArCache[storeName] && _nameArCache[storeName]) || storeName;

        return `
        <div class="cart-store-group" id="csg-${_cslug(storeName)}">
            <div class="cart-store-group__header">
                <span class="cart-store-group__name">🏪 ${displayName}</span>
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
            try {
                const fee = await _getStoreFee(storeName, coords.lat, coords.lng, subtotal);
                const cfg = await _loadSmartCfg();
                const isSmartMode = cfg && cfg.enabled;
                const badge = isSmartMode
                    ? `<span style="font-size:0.68em;background:rgba(255,92,0,0.12);color:var(--clr-orange);border-radius:4px;padding:1px 5px;margin-right:4px;">ذكي</span>`
                    : '';
                hintEl.innerHTML = `🛵 رسوم توصيل هذا المتجر: ${badge}<strong>${_formatDeliveryFee(fee)}</strong>`;
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
        // Use the pre-resolved imgUrl stored on the item (set by store panel when pngExist=1).
        // Never guess a path from the item id — that causes 404s for numeric/Arabic ids.
        const resolvedImg = item.imgUrl || '';
        const imgHtml     = resolvedImg
            ? `<img class="cart-item__img" src="${resolvedImg}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="cart-item__img-fallback" style="display:none">🛒</div>`
            : `<div class="cart-item__img-fallback" style="display:flex">🛒</div>`;
        const uniqueKey   = `${item.storeName}__${item.id}`;
        const isInstance  = item.id.includes('__i');

        return `
        <div class="cart-item${item.notes ? ' cart-item--noted' : ''}" id="ci-${_cslug(uniqueKey)}">
            ${imgHtml}
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

    /* Apply the active queued reward (if any) to displayed totals.
       Returns { deliveryFee, discount, grandTotal } after adjustment.
       freeDeliveryAlready = true when first-order free delivery already zeroed the fee. */
    function _applyActiveRewardToTotals(subtotalUSD, deliveryFee, freeDeliveryAlready) {
        const bannerEl = document.getElementById('cart-reward-banner');
        const rowEl    = document.getElementById('cart-discount-row');
        const discEl   = document.getElementById('cart-discount');
        const titleEl  = document.getElementById('cart-reward-title');
        const iconEl   = document.getElementById('cart-reward-icon');

        let discount = 0;
        const item = _activeReward;

        if (!item) {
            if (bannerEl) bannerEl.style.display = 'none';
            if (rowEl)    rowEl.style.display    = 'none';
            return { deliveryFee, discount: 0, grandTotal: subtotalUSD + deliveryFee };
        }

        if (item.type === 'free_delivery' && !freeDeliveryAlready) {
            deliveryFee = 0;
        } else if (item.type === 'discount_fixed') {
            discount = Math.min(parseFloat(item.value) || 0, subtotalUSD + deliveryFee);
        } else if (item.type === 'discount_percent') {
            discount = (subtotalUSD + deliveryFee) * ((parseFloat(item.value) || 0) / 100);
        }

        if (bannerEl && titleEl && iconEl) {
            // Hide reward banner when loyalty system is hidden by admin
            bannerEl.style.display = (window._loyaltyUiVisible === false) ? 'none' : 'flex';
            iconEl.textContent = item.icon || '🎉';
            titleEl.textContent = item.reward || 'مكافأة';
        }
        if (rowEl && discEl) {
            if (discount > 0) {
                rowEl.style.display = 'flex';
                discEl.textContent  = '−$' + discount.toFixed(2);
            } else {
                rowEl.style.display = 'none';
            }
        }

        const grandTotal = Math.max(0, subtotalUSD + deliveryFee - discount);
        return { deliveryFee, discount, grandTotal };
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

        let deliveryFee = storeCount * DELIVERY_FEE_PER_STORE; // raw USD — used for the actual total math
        const { grandTotal } = _applyActiveRewardToTotals(subtotalUSD, deliveryFee, false);

        if (subtotalEl)   subtotalEl.textContent   = '$' + subtotalUSD.toFixed(2);
        if (deliveryEl) {
            if (_activeReward && _activeReward.type === 'free_delivery') {
                deliveryEl.innerHTML = `<span style="text-decoration:line-through;color:#aaa;font-size:0.82em;">${_formatDeliveryFee(storeCount * DELIVERY_FEE_PER_STORE)}</span> <span style="color:#ea580c;font-weight:800;">مجاناً 🎉</span>`;
            } else {
                deliveryEl.textContent = deliveryFee > 0 ? _formatDeliveryFee(deliveryFee) : 'مجاناً';
            }
        }
        if (grandtotalEl) grandtotalEl.textContent = '$' + grandTotal.toFixed(2);

        if (bannerEl) bannerEl.style.display = 'none';

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
        if (bannerEl)   bannerEl.style.display = 'none';

        // Sum per-store fees
        let totalDelivery = 0;
        for (const storeName of stores) {
            const items   = cart.getStoreItems(storeName);
            const storeSub = _storeUSD(items);
            const fee     = await _getStoreFee(storeName, coords.lat, coords.lng, storeSub);
            totalDelivery += fee;
        }
        // totalDelivery stays raw USD here — it feeds the actual grand-total
        // math below; only the displayed delivery line is shown in LBP.

        const { deliveryFee, grandTotal } = _applyActiveRewardToTotals(subtotalUSD, totalDelivery, false);
        if (deliveryEl) {
            if (_activeReward && _activeReward.type === 'free_delivery') {
                deliveryEl.innerHTML = `<span style="text-decoration:line-through;color:#aaa;font-size:0.82em;">${_formatDeliveryFee(totalDelivery)}</span> <span style="color:#ea580c;font-weight:800;">مجاناً 🎉</span>`;
            } else {
                deliveryEl.textContent = _formatDeliveryFee(deliveryFee);
                _nightBadgeHtml().then(badge => { if (badge) deliveryEl.insertAdjacentHTML('beforeend', badge); });
            }
        }
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
        window.DelivoAttn?.event('checkoutStart');

        const user = window.DelivoUser;
        if (!user) {
            closeCartSidebar();
            setTimeout(async () => {
                let lead = null;
                try { lead = await window.DelivoAuth.getDeviceLead(); } catch (_) {}

                if (lead && !lead.converted) {
                    // Already gave us name+phone at launch — just need
                    // location + OTP now, then the order goes through.
                    if (typeof window.startPhoneFirstRegistration === 'function') {
                        window.startPhoneFirstRegistration(lead.fullName, lead.phone, () => window.cartCheckout());
                    } else if (typeof openModal === 'function') {
                        openModal('modal-login'); // defensive fallback
                    }
                } else if (typeof openModal === 'function') {
                    // No lead at all yet (rare — e.g. cart survived from
                    // before the launch modal was ever completed). Capture
                    // name+phone first, then chain straight into the same
                    // registration-completion step above.
                    window._launchModalOnSuccess = async () => {
                        const freshLead = await window.DelivoAuth.getDeviceLead();
                        if (freshLead && typeof window.startPhoneFirstRegistration === 'function') {
                            window.startPhoneFirstRegistration(freshLead.fullName, freshLead.phone, () => window.cartCheckout());
                        }
                    };
                    openModal('modal-launch');
                }
            }, 200);
            return;
        }

        // Block checkout if no phone number on file
        const userPhone = (window.DelivoUser && window.DelivoUser.phone) || '';
        if (!userPhone) {
            closeCartSidebar();
            setTimeout(() => {
                _showToast('⚠️ يجب إضافة رقم هاتفك أولاً لإرسال الطلب', 'error');
                if (typeof openModal === 'function') openModal('modal-account');
            }, 200);
            return;
        }

        // ── Require a delivery location — once ──────────────────────
        // Applies equally to brand-new and long-existing accounts: this
        // checks the CURRENT profile at the moment of checkout, not
        // signup date, so any account (old or new) that never set a
        // location gets caught here on its next order, regardless of
        // when it was created. The cart's own location picker (GPS or
        // map pin, in the "extras" panel below the cart items) already
        // existed as an optional convenience — this just makes it
        // mandatory the first time, and once picked it's written back
        // to the profile further down so this gate never fires again.
        const profileLocOnFile = window.DelivoUser.location || {};
        const hasProfileLoc    = !!((profileLocOnFile.lat || window.DelivoUser.lat));
        const cartLocLatEl     = document.getElementById('cart-loc-lat');
        const cartLocLngEl     = document.getElementById('cart-loc-lng');
        const hasCartPickedLoc = !!(cartLocLatEl && cartLocLatEl.value && cartLocLngEl && cartLocLngEl.value);
        if (!hasProfileLoc && !hasCartPickedLoc) {
            const extrasToggle = document.getElementById('cart-extras-toggle');
            const extrasPanel  = document.getElementById('cart-extras-panel');
            if (extrasPanel && !extrasPanel.classList.contains('open')) {
                extrasPanel.classList.add('open');
                extrasToggle?.classList.add('open');
            }
            extrasPanel?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            _showToast('📍 حدد موقعك أولاً لإتمام الطلب — اضغط "موقعي الحالي" أو "تحديد على الخريطة" بالأسفل', 'error');
            return;
        }

        const btn = document.getElementById('cart-checkout-btn');
        const btnOriginalHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>جاري…</span>'; }

        try {
            // Reserve order id(s) atomically — one per store in this
            // checkout — via the allocateOrderId Cloud Function. This
            // replaces the old read-globalCounter-then-write-it-back
            // pattern, which could race with external-order.js or the
            // admin "create order" panel doing the same thing at the
            // same moment and, on top of that, silently restarted the
            // whole sequence at 1 if the counter read ever came back
            // empty. The transaction inside that function makes both
            // failure modes impossible.
            const idsResp = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/allocateOrderId', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ count: stores.length || 1 }),
            });
            if (!idsResp.ok) throw new Error('تعذّر حجز رقم الطلب');
            const idsData = await idsResp.json();
            let nextId = idsData.firstId;


            const userProfile = window.DelivoUser || {};
            const now         = new Date();
            const dateStr     = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

            const phone = userPhone.startsWith('+961') ? userPhone : '+961' + userPhone;

            const cartLat  = document.getElementById('cart-loc-lat')?.value || '';
            const cartLng  = document.getElementById('cart-loc-lng')?.value || '';
            const orderLat = cartLat || String(userProfile.location?.lat || userProfile.lat || '');
            const orderLng = cartLng || String(userProfile.location?.lng || userProfile.lng || '');

            // ── Delivery coverage radius check ──────────────────────
            // Rejects the order if the chosen delivery point falls
            // outside the admin-configured coverage circle around the
            // Delivo center. Fails open if no center is configured.
            const radiusCheck = await _checkDeliveryRadius(parseFloat(orderLat), parseFloat(orderLng));
            if (!radiusCheck.ok) {
                if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalHtml; }
                _showCoverageWarning(radiusCheck.center, radiusCheck.radiusKm, parseFloat(orderLat), parseFloat(orderLng), radiusCheck.distanceKm);
                return;
            }

            // Save this location to the profile if it wasn't on file yet —
            // this is what makes the checkout-time location gate above a
            // true one-time step instead of asking again on every order.
            // Fire-and-forget: never worth blocking or failing an order
            // over a profile write, the gate above already guarantees
            // orderLat/orderLng are set at this point.
            if (!hasProfileLoc && orderLat && orderLng) {
                const newLoc = { lat: parseFloat(orderLat), lng: parseFloat(orderLng) };
                fetch(`${RTDB_CART_URL}/users/${user.uid}/location.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newLoc),
                }).then(() => { window.DelivoUser.location = newLoc; }).catch(() => {});
            }

            // Compute effective delivery fee per store (smart or flat)
            const coords = _getCustomerCoords();

            // Resolve active queued reward (free_delivery / discount_fixed / discount_percent)
            const activeRewardNow = await _checkActiveReward();

            // Write one request per store
            for (const storeName of stores) {
                const storeItems     = cart.getStoreItems(storeName);
                const storeSub       = _storeUSD(storeItems);
                let   smartFee       = await _getStoreFee(storeName, coords.lat, coords.lng, storeSub);
                // smartFee stays raw USD here — it drives storeTotalNum below.
                // The LBP-converted value (for saving/display) is derived
                // separately further down, after any free-delivery reward.

                // Apply free-delivery reward
                if (activeRewardNow && activeRewardNow.type === 'free_delivery') {
                    smartFee = 0;
                }

                let storeTotalNum = storeSub + smartFee;

                // Apply discount rewards proportionally across stores
                if (activeRewardNow && activeRewardNow.type === 'discount_fixed' && stores.length) {
                    const share = (parseFloat(activeRewardNow.value) || 0) / stores.length;
                    storeTotalNum = Math.max(0, storeTotalNum - share);
                } else if (activeRewardNow && activeRewardNow.type === 'discount_percent') {
                    storeTotalNum = Math.max(0, storeTotalNum * (1 - (parseFloat(activeRewardNow.value) || 0) / 100));
                }

                const cartStr        = storeItems.map(i => `${i.qty}:${i.name}:${i.price}:${storeName}:${(i.notes||'').replace(/,/g,'،').replace(/:/g,'؛')}`).join(',');
                const storeTotal     = storeTotalNum.toFixed(2);
                const deliveryFeeLBP = smartFee > 0 ? _normalizeDeliveryFee(smartFee) : 0;
                const requestKey = `id_${nextId}`;

                const requestObj = {
                    cart         : cartStr,
                    city         : 'Baalbeck',
                    date         : dateStr,
                    delivryplusid: user.uid || '',
                    deliveryFee  : String(deliveryFeeLBP),
                    driver       : '0',
                    rewardApplied: activeRewardNow ? `${activeRewardNow.type}:${activeRewardNow.value || ''}` : '',
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
                    username     : userProfile.username || (user.email || '').split('@')[0] || '',
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

            // Consume the queued reward (one-time use) now that it's been applied
            if (activeRewardNow) {
                await _consumeActiveReward(activeRewardNow);
            }

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
                        // Store notification in RTDB for admin — do NOT redirect customer
                        fetch(RTDB_CART_URL + '/pendingWaNotifications.json', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ waLink, orderTime:new Date().toISOString(), customer:name, phone:'+961'+phone, stores:storeList, read:false }) }).catch(function(){});
                    }
                }
            } catch (_) { /* non-critical — order is already saved */ }
            // ─────────────────────────────────────────────────────────────

            // ── Loyalty points ────────────────────────────────────────────
            // Points are awarded ONLY when the order is marked as delivered
            // by the admin (changeState → state '1'). No points at checkout.
            // ─────────────────────────────────────────────────────────────

            cart.clear();
            closeCartSidebar();
            window.DelivoAttn?.event('order');

            let successMsg;
            if (activeRewardNow) {
                successMsg = `🎉 تم تطبيق مكافأتك (${activeRewardNow.reward || 'مكافأة'}) على هذا الطلب!`;
            } else {
                successMsg = `✅ تم إرسال ${stores.length > 1 ? stores.length + ' طلبات' : 'طلبك'} بنجاح!`;
            }
            _showToast(successMsg, 'success');
            // Request notification permission after first order placed
            if (typeof window._onOrderPlaced === 'function') window._onOrderPlaced();

            // Refresh the store counts section so the total reflects the new order
            if (typeof window.refreshStoreCounts === 'function') window.refreshStoreCounts();

        } catch (err) {
            console.error('[Cart] Checkout error:', err);
            _showToast('❌ حدث خطأ، حاول مجدداً', 'error');
        } finally {
            if (btn) {
                btn.disabled  = false;
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> إرسال الطلب`;
            }
        }
    };

    /* ── Toast ──────────────────────────────────────────────── */
    let _toastTimer = null;
    function _showToast(msg, type = 'success') {
        let toast = document.getElementById('cart-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cart-toast';
            toast.className = 'cart-toast';
            document.body.appendChild(toast);
        }
        // Clear pending dismiss so old timer can't freeze the toast
        if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
        toast.classList.remove('visible');
        toast.textContent = msg;
        toast.className   = `cart-toast cart-toast--${type}`;
        requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
        _toastTimer = setTimeout(() => { toast.classList.remove('visible'); _toastTimer = null; }, 4000);
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

    /* ── Coverage-radius warning modal ─────────────────────── */
    _initCoverageWarningModal();
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
        _recalcDeliveryFees();
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
        _recalcDeliveryFees();
    }

    // Smart delivery fees depend on the distance from the customer's chosen
    // location to each store, so any time that location changes (GPS, map
    // pin, or clearing it) the per-store fee hints and the grand total need
    // to be recomputed right away — previously they only refreshed the next
    // time an item was added/removed, which read as "the fee is stuck" and
    // forced customers to remove-then-re-add an item just to see it update.
    // renderCartSidebar() already does a full, correct recompute (it's the
    // same path add/remove already used), so re-running it here is the
    // simplest fix that can't drift out of sync with that logic.
    function _recalcDeliveryFees() {
        if (window.DelivoCart && window.DelivoCart.getCount() > 0 && typeof window.renderCartSidebar === 'function') {
            window.renderCartSidebar();
        }
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

    mapBtn.addEventListener('click', async () => {
        const modal  = document.getElementById('cart-map-modal');
        const mapDiv = document.getElementById('cart-map-modal-map');
        if (!modal || !mapDiv) return;

        modal.style.display = 'flex';

        await _ensureLeafletLoaded();

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

    function _closeCartMapModal() {
        document.getElementById('cart-map-modal').style.display = 'none';
        if (_cartMap) { _cartMap.remove(); _cartMap = null; _cartMarker = null; }
    }
    window._closeCartMapModal = _closeCartMapModal;

    const confirmBtn = document.getElementById('cart-map-modal-confirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (_cartMarker) {
                const pos = _cartMarker.getLatLng();
                setLocation(pos.lat.toFixed(6), pos.lng.toFixed(6));
                mapBtn.classList.add('active');
            }
            _closeCartMapModal();
        });
    }

    const modalClose = document.getElementById('cart-map-modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', _closeCartMapModal);
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
    let sidebarWidth  = 0; // cached at touchstart — doesn't change during the drag

    const THRESHOLD   = 72;
    const VELOCITY_TH = 0.35;

    sidebar.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        const rect  = sidebar.getBoundingClientRect();
        const relX  = touch.clientX - rect.left;
        sidebarWidth = sidebar.offsetWidth; // read once per gesture, not on every move
        if (relX > sidebarWidth * 0.35) return;
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
        const progress  = Math.abs(currentDeltaX) / sidebarWidth;
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

// Delivery fees (smart or standard) are configured by the admin almost
// always in USD (small numbers like 1.5, 2, 5) — but the customer should
// always see the delivery fee in Lebanese Lira, rounded to a clean
// whole number to the nearest 10,000 LL. If the raw fee is already
// LBP-scale (an admin set it directly in LL, so already > 1000) it's
// just rounded; otherwise it's converted using the live exchange rate.
function _normalizeDeliveryFee(fee) {
    let n = parseFloat(fee);
    if (isNaN(n)) return 0;
    if (n <= 1000) n = n * (window._LBP_RATE || 90000);
    return Math.round(n / 10000) * 10000;
}

function _formatDeliveryFee(fee) {
    return _normalizeDeliveryFee(fee).toLocaleString('en-US') + ' ل.ل';
}

function _fmt(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return '';
    if (v < 1000) return '$' + v.toFixed(v % 1 === 0 ? 0 : 2);
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' مليون ل.ل';
    return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + ' ألف ل.ل';
}

function _toUSD(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return 0;
    return v < 1000 ? v : v / (window._LBP_RATE || 90000);
}

function _storeUSD(items) {
    return items.reduce((sum, i) => sum + _toUSD(i.price) * i.qty, 0);
}

function _cartTotalUSD() {
    if (!window.DelivoCart) return 0;
    return _storeUSD(window.DelivoCart.items);
}
// Exposed for presence.js's abandoned-cart snapshot — same >1000-is-LBP
// conversion as checkout, so the admin sees a true USD value.
window._delivoCartTotalUSD = _cartTotalUSD;

function _cslug(s) {
    return String(s).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
}

function _getQty(id, storeName) {
    if (!window.DelivoCart) return 0;
    const item = window.DelivoCart.items.find(i => i.id === id && i.storeName === storeName);
    return item ? item.qty : 0;
}