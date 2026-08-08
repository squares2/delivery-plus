/* ═══════════════════════════════════════════════════════════════
   DELIVO ADMIN — Core
═══════════════════════════════════════════════════════════════ */
const RTDB        = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
// External stores cache — declared here (rather than down near
// renderExtStores(), where it used to live) because renderMap() and
// other code in this earlier script block already read/write it
// during initial load, before that later script block has run. A
// `let` declared only down there left this in the temporal dead zone
// whenever the live-map/auth-state code fired first, throwing
// "allExtStores is not defined" (see renderMap's forEach over it).
let allExtStores = {};    // cached from Firebase externalStores/

// Some historical orders (at least order #42, likely others created the
// same way) ended up with lat/lng saved backwards — the real longitude
// sitting in the "lat" field and the real latitude in "lng". Lebanon's
// geography makes this easy to detect: latitude here is always ~32–35.5,
// longitude always ~34–37.5, and those two bands barely overlap — so a
// pair that fails the normal check but passes when swapped is almost
// certainly backwards, not a legitimately different location. Used
// wherever a stored order.lat/order.lng gets turned into a real map
// position, so old bad records self-heal instead of pointing at the
// wrong spot forever.
// Hoisted here (rather than down near the shared map-picker modal, where
// it used to live) for the same cross-script-block reason as
// allExtStores just above — renderMap() and buildOrderCard() in this
// earlier script block already call it during initial load, before that
// later script block has run, which threw "_fixSwappedLatLng is not
// defined" whenever the live map or order list rendered first.
function _fixSwappedLatLng(lat, lng) {
    const inRange = (v, lo, hi) => v >= lo && v <= hi;
    const LAT_RANGE = [32.0, 35.5], LNG_RANGE = [34.0, 37.5];
    const looksOk = inRange(lat, LAT_RANGE[0], LAT_RANGE[1]) && inRange(lng, LNG_RANGE[0], LNG_RANGE[1]);
    if (looksOk) return [lat, lng];
    const swappedLooksOk = inRange(lng, LAT_RANGE[0], LAT_RANGE[1]) && inRange(lat, LNG_RANGE[0], LNG_RANGE[1]);
    return swappedLooksOk ? [lng, lat] : [lat, lng];
}
// Store-count RTDB key (must match driver.html / scripts/stores.js).
// RTDB path segments can't contain . # $ [ ] / so we sanitise.
function _countKey(name) {
    return String(name || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, '_');
}

// GitHub config — used for direct item-image uploads from "منتجاتي" (company portal)
const ITEM_GH_OWNER  = 'squares2';
const ITEM_GH_REPO   = 'delivery-plus';
const ITEM_GH_BRANCH = 'main';
const ITEM_GH_FOLDER = 'items2';
const PROMO_GH_FOLDER = 'assets/promos'; // promo flip-card images — same repo/credentials as item images above
const HEROBG_GH_FOLDER = 'assets/hero-bg'; // hero background images — same repo/credentials

/* Shared upload path for item photos, promo cards, and hero backgrounds.
   The GitHub token used to live here as a plain string — it kept getting
   auto-revoked by GitHub's secret scanning (correctly so, since anyone who
   views-source the page could read it). It now lives server-side only, in
   the adminUploadImage Cloud Function (functions/adminuploadimage.js),
   which the browser never sees. This just calls that function. */
async function _adminUploadImage(file, folder, filename, quality = 0.92) {
    const blob   = await _cpiConvertToWebp(file, quality);
    const base64 = await _cpiBlobToBase64(blob);

    const idToken = await window._adminAuth?.currentUser?.getIdToken();
    if (!idToken) throw new Error('جلسة المدير غير صالحة، سجّل الدخول من جديد');

    const res = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/adminUploadImage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body:    JSON.stringify({ folder, filename, base64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `فشل الرفع (${res.status})`);
    return data.path;
}

    /* Load admin presence monitor after DOM ready */
    window.addEventListener('load', () => {
        const s = document.createElement('script');
        s.src = 'scripts/admin-presence.js?v=5';
        document.body.appendChild(s);
    });
    /* Load attendance dashboard alongside it — separate file, read-only
       reporting layer. Injected through _ensureAttendanceLoaded() so the
       same loader can also be called on-demand from switchPanel: if the
       admin clicks "الحضور" before this load-time injection has finished
       (or if it failed — cache hiccup, missing file), the panel loads the
       script right then instead of crashing on an undefined
       renderAttendance. */
    let _attScriptPromise = null;
    function _ensureAttendanceLoaded() {
        if (typeof window.renderAttendance === 'function') return Promise.resolve();
        if (_attScriptPromise) return _attScriptPromise;
        _attScriptPromise = new Promise((resolve, reject) => {
            const s2 = document.createElement('script');
            s2.src = 'scripts/attendance-admin.js?v=15';
            s2.onload  = () => resolve();
            s2.onerror = () => { _attScriptPromise = null; reject(new Error('attendance-admin.js failed to load')); };
            document.body.appendChild(s2);
        });
        return _attScriptPromise;
    }
    // Kicks off the render only once the script is genuinely ready —
    // shared by the load-time prefetch below and both switchPanel/
    // initial-panel call sites.
    function renderAttendanceSafe() {
        _ensureAttendanceLoaded()
            .then(() => { if (typeof window.renderAttendance === 'function') window.renderAttendance(); })
            .catch(() => { if (typeof toast === 'function') toast('تعذّر تحميل لوحة الحضور — أعد تحميل الصفحة', true); });
    }
    window.addEventListener('load', () => { _ensureAttendanceLoaded().catch(() => {}); });
const FIRESTORE   = 'https://firestore.googleapis.com/v1/projects/deliveryonline-300f7/databases/(default)/documents';
const FB_API_KEY  = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
const FB_AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`;

// ── Firestore Auth credentials ────────────────────────────────
// Must match a real Firebase Auth user in your project
// (Firebase Console → Authentication → Users → Add user)
const FS_ADMIN_EMAIL = 'admin@delivo.app';  // ← your Firebase Auth email
const FS_ADMIN_PASS  = 'delivo26';           // ← that user's password

// ── Firebase Auth token (for Firestore reads) ─────────────────
let _fsToken        = null;
let _fsTokenExpiry  = 0;
let _fsTokenPromise = null;   // in-flight sign-in promise — prevents parallel sign-in hammering
let _fsSignInFails  = 0;      // consecutive failure counter
const _FS_MAX_FAILS = 3;      // stop retrying after this many consecutive failures

async function getFsToken() {
    // Re-use cached token if still valid (refresh 60s before expiry)
    if (_fsToken && Date.now() < _fsTokenExpiry) return _fsToken;

    // If a sign-in is already in progress, wait for it instead of firing another one
    if (_fsTokenPromise) return _fsTokenPromise;

    // Hard stop after too many consecutive failures — prevents Firebase lockout
    if (_fsSignInFails >= _FS_MAX_FAILS) {
        throw new Error('Firebase Auth: too many failed attempts. Reload the page.');
    }

    _fsTokenPromise = (async () => {
        try {
            console.log('[Auth] Signing into Firebase Auth as:', FS_ADMIN_EMAIL);
            const r = await fetch(FB_AUTH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email:             FS_ADMIN_EMAIL,
                    password:          FS_ADMIN_PASS,
                    returnSecureToken: true,
                }),
            });
            const d = await r.json();
            if (!r.ok) {
                _fsSignInFails++;
                console.error('[Auth] Firebase sign-in failed:', d?.error?.message, '| email:', FS_ADMIN_EMAIL);
                throw new Error('Firebase Auth: ' + (d?.error?.message || r.status));
            }
            _fsSignInFails  = 0;   // reset on success
            _fsToken        = d.idToken;
            _fsTokenExpiry  = Date.now() + (parseInt(d.expiresIn) - 60) * 1000;
            console.log('[Auth] Got Firestore token, expires in', d.expiresIn, 's');
            // Resume auto-refresh if it was paused due to auth failure
            _resumeAutoRefresh();
            return _fsToken;
        } finally {
            _fsTokenPromise = null;   // release lock regardless of success/failure
        }
    })();

    return _fsTokenPromise;
}

// ── Admin accounts stored in Firebase at /adminUsers ──────────
// Super-admin is seeded here as fallback for first boot
const SEED_SUPERADMIN = {
    username:    'admin',
    password:    'delivo26',
    fullname:    'Super Admin',
    role:        'superadmin',
    permissions: ['map','orders','online-req','drivers','customers','stores','catalog','employees','settings','expenses'],
};



// ── State ─────────────────────────────────────────────────────
let currentAdmin = null;
let allOrders    = {};
let allDrivers   = [];
let allUsers        = {};
let allGuestCustomers = {}; // guestCustomers/{phoneKey}: unregistered callers who ordered via admin's "اطلب" tool — see _aoUpsertGuestCustomer
let allVisitors     = {}; // deviceLeads: unregistered visitors (full name + phone captured pre-signup)
let allDeviceGroups = {}; // uuid → [user, user, ...]
let allStores    = {};
let _assignmentMode = 'both'; // 'both' | 'driver_only' | 'admin_only' — see settings/orderAssignmentMode
let adminUsers   = {};
let orderFilter    = 'all';
let orderSearch    = '';
let orderSort       = localStorage.getItem('delivo_admin_order_sort') || 'date'; // 'number' | 'date' — see renderOrders(); persisted so it survives a refresh
let _lastOrderSort  = null;     // tracks the previous orderSort so a mode switch forces a full re-sort of the DOM
let orderDateFilter = localStorage.getItem('delivo_admin_order_date_filter') || 'all'; // 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'
let orderDateFrom   = localStorage.getItem('delivo_admin_order_date_from') || '';    // yyyy-mm-dd, used when orderDateFilter === 'custom'
let orderDateTo     = localStorage.getItem('delivo_admin_order_date_to') || '';    // yyyy-mm-dd, used when orderDateFilter === 'custom'
// Same shape as above, independent state for the "طلبات أونلاين" panel —
// defaults to "اليوم" (today) rather than "all" per admin request.
let onlineOrderDateFilter = localStorage.getItem('delivo_admin_online_date_filter') || 'today';
let onlineOrderDateFrom   = localStorage.getItem('delivo_admin_online_date_from') || '';
let onlineOrderDateTo     = localStorage.getItem('delivo_admin_online_date_to') || '';
let orderChartRange = (() => { // 7 | 14 | 30 | 90 | 365 | 'all' — range shown in the delivered-orders daily "candle" chart
    const raw = localStorage.getItem('delivo_admin_order_chart_range');
    if (raw === 'all') return 'all';
    const n = parseInt(raw);
    return [7, 14, 30, 90, 365].includes(n) ? n : 14;
})();
let orderChartCollapsed = localStorage.getItem('delivo_admin_order_chart_collapsed') !== '0'; // shrunk by default; '0' means the admin explicitly expanded it before
let topCustomersCollapsed = localStorage.getItem('delivo_admin_top_customers_collapsed') !== '0'; // shrunk by default, same pattern as the daily chart card
let driverFilter   = 'all';
let showInactiveDrivers = false;
let driverSearch   = '';
let customerFilter = 'all';
let customerSearch = '';
let visitorFilter = 'all';
let visitorSearch = '';
let allBlacklist   = {};
let storeFilter    = 'all';
let storeSearch    = '';
let hideDisabledStores = localStorage.getItem('delivo_hide_disabled_stores') === '1';
// Hero backgrounds: hidden by default (unlike the stores toggle above),
// so an admin only sees '1' explicitly means "show them" — anything
// else (unset, or '0') keeps inactive cards out of the grid.
let hideInactiveHeroBg = localStorage.getItem('delivo_show_inactive_herobg') !== '1';
let mapLayers    = { stores: true, drivers: true, customers: true, orders: true, center: true, extStores: true, priceTiers: false };
// Restore the admin's last-chosen visibility for each live-map layer
// toggle ("المركز/متاجر/سائقين/عملاء/طلبات/متاجر خارجية") so a page
// refresh or relaunch doesn't silently re-show everything they'd
// hidden — the buttons themselves are re-synced to this in admin-10's
// click-wiring, right before their listeners are attached.
try {
    const _savedMapLayers = JSON.parse(localStorage.getItem('delivo_admin_map_layers') || 'null');
    if (_savedMapLayers && typeof _savedMapLayers === 'object') {
        Object.assign(mapLayers, _savedMapLayers);
    }
} catch (_) { /* malformed/blocked storage — keep the defaults above */ }
let adminMap     = null;
let _adminMapStandardLayer  = null;
let _adminMapSatelliteLayer = null;
let _adminMapCurrentLayer   = 'standard';
let mapMarkers   = { stores: [], drivers: [], customers: [], orders: [], center: [], extStores: [], priceTiers: [] };
let deliveryCenterLoc = null; // { lat, lng } — Delivo HQ, settings/deliveryCenter
let deliveryRadiusKm  = 7;    // coverage radius (km) around the HQ — settings/deliveryCenter.radiusKm
let refreshTimer         = null;
let _refreshPaused       = false;
const REFRESH_INTERVAL   = 12_000;   // 12 seconds

// ── Tab-visibility pause ────────────────────────────────────────
// Both the 12s full-data loop below and admin-05's 1s driver-position
// poll used to keep firing at full rate even while this tab sat in the
// background (e.g. an admin leaves the panel open in another tab all
// day). That's pure wasted Firebase RTDB bandwidth — nobody's looking
// at it. _tabHidden is checked by both loops; a fresh refresh fires
// immediately the moment the tab becomes visible again so data is
// never stale on return.
let _tabHidden = document.hidden;
document.addEventListener('visibilitychange', () => {
    _tabHidden = document.hidden;
    if (!_tabHidden && typeof currentAdmin !== 'undefined' && currentAdmin) {
        loadAllData().then(() => {
            updateTopbarStats();
            updateNavBadge();
        }).catch(() => {});
    }
});

function _pauseAutoRefresh() {
    if (_refreshPaused) return;
    _refreshPaused = true;
    clearInterval(refreshTimer);
    refreshTimer = null;
    console.warn('[Admin] Auto-refresh PAUSED (auth lockout)');
}

function _resumeAutoRefresh() {
    if (!_refreshPaused) return;
    _refreshPaused = false;
    const banner = document.getElementById('auth-lockout-banner');
    if (banner) banner.remove();
    // Restart the refresh cycle
    if (!refreshTimer) {
        refreshTimer = setInterval(async () => {
            if (_refreshPaused || _tabHidden) return;
            await loadAllData();
            updateTopbarStats(); updateNavBadge();
        }, REFRESH_INTERVAL);
    }
    console.log('[Admin] Auto-refresh RESUMED');
}
let pendingAssignOrderId = null;
let sidebarCollapsed = false;

// ── Permission-aware nav items ─────────────────────────────────
const NAV_ITEMS = [
    { id: 'map',       label: 'الخريطة المباشرة',  icon: mapIcon(),    perm: 'map'       },
    { id: 'orders',    label: 'الطلبات',            icon: ordersIcon(), perm: 'orders'    },
    { id: 'online-req', label: 'طلبات أونلاين',      icon: onlineReqIcon(), perm: 'orders'    },
    { id: 'expenses',  label: 'المصاريف اليومية',    icon: expensesIcon(), perm: 'expenses' },
    { id: 'cashbox',   label: 'حركة الصندوق',        icon: cashboxIcon(), perm: 'expenses' },
    { id: 'admin-order', label: 'اطلب',             icon: adminOrderIcon(), perm: 'orders'  },
    { id: 'drivers',   label: 'السائقون',           icon: driverIcon(), perm: 'drivers'   },
    { id: 'customers', label: 'العملاء',            icon: usersIcon(),  perm: 'customers' },
    { id: 'visitors',  label: 'الزوار',              icon: visitorsIcon(), perm: 'customers' },
    { id: 'attendance', label: 'الحضور',            icon: attendanceIcon(), perm: 'customers' },
    { id: 'stores',    label: 'المتاجر',            icon: storeIcon(),  perm: 'stores'    },
    { id: 'ext-stores', label: 'متاجر خارجية',       icon: extStoreIcon(), perm: 'stores'  },
    { id: 'catalog',   label: 'المنتجات',            icon: catalogIcon(), perm: 'stores'   },
    { id: 'sales',     label: 'عروض المتاجر',         icon: salesIcon(),   perm: 'stores'   },
    { id: 'promoflip', label: 'كروت العروض',          icon: promoFlipIcon(), perm: 'stores' },
    { id: 'herobg',    label: 'خلفيات الواجهة',       icon: heroBgIcon(),    perm: 'stores' },
    { id: 'employees', label: 'الموظفون',           icon: empIcon(),    perm: 'employees' },
    { id: 'rewards',   label: 'نظام النقاط',        icon: rewardsIcon(),perm: 'settings'  },
    { id: 'settings',  label: 'الإعدادات',          icon: settingsIcon(),perm: 'settings' },
    { id: 'backup',    label: 'النسخ الاحتياطي',    icon: backupIcon(),  perm: 'settings' },
];

// Which sidebar items show a live count badge beside their label
const NAV_COUNT_IDS = {
    'orders':     true, // all unarchived orders
    'online-req': true, // new (unread, state 0) orders
    'drivers':    true, // active/online drivers
    'customers':  true, // total customers
    'visitors':   true, // visitors who haven't converted to a real account yet
    'attendance': true, // today's total visit count
    'stores':     true, // total stores
    'employees':  true, // total employees
};

function backupIcon()  { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`; }
function salesIcon()   { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`; }
function promoFlipIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="9" height="16" rx="2"/><rect x="13" y="4" width="9" height="16" rx="2" stroke-dasharray="3 3"/></svg>`; }
function heroBgIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 13l4-4 5 5 3-3 6 6"/><circle cx="8" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>`; }
function mapIcon()     { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>`; }
function ordersIcon()  { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 17H5a2 2 0 0 0-2 2"/><path d="M9 3H5a2 2 0 0 0-2 2v14"/><rect x="9" y="3" width="12" height="18" rx="2"/></svg>`; }
function adminOrderIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`; }
function extStoreIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>`; }
function driverIcon()  { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function usersIcon()   { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`; }
function visitorsIcon(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
function attendanceIcon(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>`; }
function storeIcon()   { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`; }
function empIcon()     { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function onlineReqIcon(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M2 20c0-4 4-7 10-7s10 3 10 7"/><polyline points="16 12 18 14 22 10"/></svg>`; }
function settingsIcon(){ return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`; }
function catalogIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`; }
function rewardsIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`; }
function expensesIcon() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-4a2 2 0 0 1 0-4h4z"/><circle cx="16.5" cy="12" r="1" fill="currentColor" stroke="none"/></svg>`; }
function cashboxIcon()  { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/><circle cx="12" cy="13.5" r="2.75"/></svg>`; }

// ── Toast ─────────────────────────────────────────────────────
/* ================================================================
   NOTIFICATION SYSTEM
   showNotif(title, sub, type, duration)  -- type: success|error|warning|info
   toast(msg, isError)                    -- legacy wrapper
   showConfirm({title,msg,type,icon,okLabel,cancelLabel}) -> Promise<bool>
================================================================ */
const NOTIF_ICONS = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

function showNotif(title, sub = '', type = 'success', duration = 3800) {
    const stack = document.getElementById('notif-stack');
    const el = document.createElement('div');
    el.className = `notif notif--${type}`;
    el.innerHTML = `
        <div class="notif__icon">${NOTIF_ICONS[type] || NOTIF_ICONS.info}</div>
        <div class="notif__body">
            <div class="notif__title">${title}</div>
            ${sub ? `<div class="notif__sub">${sub}</div>` : ''}
        </div>
        <button class="notif__close" aria-label="close">\u2715</button>
        <div class="notif__bar" style="animation-duration:${duration}ms"></div>
    `;
    el.querySelector('.notif__close').addEventListener('click', () => dismissNotif(el));
    stack.appendChild(el);
    const t = setTimeout(() => dismissNotif(el), duration);
    el._timer = t;
}

function dismissNotif(el) {
    clearTimeout(el._timer);
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
}

function toast(msg, isError = false) {
    // Strip leading emoji for title, use rest as sub if long
    const clean = msg.replace(/^[\u{1F300}-\u{1FFFF}\u2600-\u27BF\uFE0F\u20D0-\u20FF\s]+/u, '').trim();
    const type  = isError ? 'error' : 'success';
    showNotif(clean || msg, '', type);
}

/* ══════════════════════════════════════════════════════════
   NEW-ORDER SOUND + NOTIFICATIONS — admin & store/company panel
   ------------------------------------------------------------
   Plays an audible chime, shows a toast, and (if the browser tab
   is in the background and permission was granted) a desktop
   notification, the moment a genuinely NEW order shows up —
   whether the viewer is the main admin dashboard (all stores) or
   a store/company login (their own store only, via cpLoadOrders).
   Never alerts for orders that already existed before this tab
   was opened — only for ones that arrive while it's open.
══════════════════════════════════════════════════════════ */
let _notifSeenOrderKeys = {};              // scope key → Set of already-alerted order IDs
let _notifMuted = localStorage.getItem('delivo_notif_muted') === '1';
let _notifAudioCtx = null;

function _playOrderChime() {
    if (_notifMuted) return;
    try {
        if (!_notifAudioCtx) _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_notifAudioCtx.state === 'suspended') _notifAudioCtx.resume();
        const ctx = _notifAudioCtx;
        const now = ctx.currentTime;
        // Two-tone friendly "ding-dong" — audible but not jarring
        [[880, 0, 0.16], [1180, 0.16, 0.22]].forEach(([freq, delay, dur]) => {
            const start = now + delay;
            const osc   = ctx.createOscillator();
            const gain  = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.05);
        });
    } catch (_) { /* audio not available — sound is a bonus, never fatal */ }
}

function _requestNotifPermission() {
    try {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    } catch (_) {}
}

function _showBrowserNotif(title, body) {
    try {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (document.visibilityState === 'visible') return; // tab is focused — the in-app toast + sound is enough
        new Notification(title, { body, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png' });
    } catch (_) {}
}

function _updateNotifBellUI() {
    document.querySelectorAll('.js-notif-bell').forEach(btn => {
        btn.textContent = _notifMuted ? '🔕' : '🔔';
        btn.title = _notifMuted
            ? 'الإشعارات الصوتية متوقفة — اضغط للتفعيل'
            : 'الإشعارات الصوتية مفعّلة — اضغط للإيقاف';
        btn.classList.toggle('js-notif-bell--muted', _notifMuted);
    });
}

function _toggleNotifMute() {
    _notifMuted = !_notifMuted;
    localStorage.setItem('delivo_notif_muted', _notifMuted ? '1' : '0');
    _updateNotifBellUI();
    if (!_notifMuted) { _requestNotifPermission(); _playOrderChime(); } // audible confirmation it's back on
}

// Compares the given orders map against what's already been seen for this
// scope ('admin' for the full dashboard, or a store name for the company
// panel) and alerts once for every order that's new since the last check.
// The very first call for a given scope only records a baseline — it never
// alerts on orders that were already sitting there before the tab opened.
function _detectAndAlertNewOrders(ordersMap, storeFilter) {
    const scopeKey = storeFilter ? `store:${storeFilter}` : 'admin';
    const keys = Object.keys(ordersMap || {}).filter(k => {
        const o = ordersMap[k];
        if (!o) return false;
        if (storeFilter && (o.store || '') !== storeFilter) return false;
        return (o.state || '0') === '0'; // only new/pending orders count as "arrived"
    });

    if (!_notifSeenOrderKeys[scopeKey]) {
        _notifSeenOrderKeys[scopeKey] = new Set(keys);
        return;
    }

    const seen  = _notifSeenOrderKeys[scopeKey];
    const fresh = keys.filter(k => !seen.has(k));
    keys.forEach(k => seen.add(k));
    if (!fresh.length) return;

    _playOrderChime();

    const first = ordersMap[fresh[0]];
    const label = fresh.length === 1
        ? `🔔 طلب جديد من ${first?.fullname || first?.username || 'عميل'}${!storeFilter && first?.store ? ' — ' + first.store : ''}`
        : `🔔 ${fresh.length} طلبات جديدة وصلت`;
    toast(label);
    _showBrowserNotif('Delivo', label);

    // NOTE: WhatsApp notifications for new orders (store + opted-in
    // employees) used to be sent from here. That meant every open
    // admin.html tab/device independently sent its own message — 3 open
    // tabs = 3 duplicate WhatsApp texts. That logic now lives server-side
    // in functions/notifyneworders.js (notifyNewOrder, triggered once per
    // order on /requests/{orderId} create), so it fires exactly once no
    // matter how many admin sessions are open. This function only handles
    // the local toast/sound/browser-notification feedback above, which is
    // fine to happen per-tab.
}

// Sends a "new order arrived" WhatsApp message to a store's configured
// number — only if that store has whatsappActive = true AND a saved
// whatsapp number. Silently does nothing otherwise (e.g. GREEN-API not
// configured yet, or the store hasn't set/activated a number).
// Tells the customer via WhatsApp their order is now trackable, with a
// direct deep link straight into the live tracking map (see index.html's
// ?track=&uid= handler, which opens it automatically on load — no need
// for the customer to be logged in on that device/browser). Silently
// does nothing if there's no phone on the order or GREEN-API isn't
// configured — a failed notification should never block the actual
// track-toggle action itself.
async function _notifyCustomerTrackingWhatsapp(orderKey, order) {
    try {
        if (!order || !order.phone) return;
        const orderNum = String(orderKey || '').replace(/^id_/, '');
        const uid  = order.delivryplusid || '';
        const link = `https://delivolb.com/index.html?track=${orderKey}${uid ? `&uid=${uid}` : ''}`;
        const message =
            `📡 طلبك رقم #${orderNum} أصبح قابلاً للتتبع الآن!\n` +
            `تابع سائقك مباشرة على الخريطة من هنا:\n` +
            link;
        await _sendWhatsappMessage(order.phone, message);
    } catch (e) {
        console.warn('[Delivo] Track WhatsApp notify failed:', e.message);
    }
}

// _notifyStoreWhatsapp / _notifyEmployeesWhatsapp used to live here.
// That logic (WhatsApp-on-new-order for the store + opted-in employees)
// now runs server-side — see functions/notifyneworders.js (notifyNewOrder).

function showConfirm({ title, msg, type = 'danger', icon = '\uD83D\uDDD1', okLabel, cancelLabel }) {
    return new Promise(resolve => {
        const overlay   = document.getElementById('confirm-overlay');
        const iconWrap  = document.getElementById('confirm-icon-wrap');
        const titleEl   = document.getElementById('confirm-title');
        const msgEl     = document.getElementById('confirm-msg');
        const okBtn     = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        iconWrap.className  = `confirm-icon-wrap ${type}`;
        iconWrap.textContent = icon;
        titleEl.textContent  = title;
        msgEl.innerHTML      = msg;
        okBtn.className      = `confirm-btn confirm-btn--ok ${type}`;
        okBtn.textContent    = okLabel    || '\u062a\u0623\u0643\u064a\u062f';
        cancelBtn.textContent = cancelLabel || '\u0625\u0644\u063a\u0627\u0621';

        overlay.classList.add('open');

        const done = (val) => {
            overlay.classList.remove('open');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBg);
            resolve(val);
        };
        const onOk     = () => done(true);
        const onCancel = () => done(false);
        const onBg     = (e) => { if (e.target === overlay) done(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBg);
    });
}

// ── Firebase RTDB helpers ─────────────────────────────────────
/* ═══════════════════════════════════════════════════════════
   TYPE ORDER — drag-and-drop reorder for store categories
   Saved to Firebase: settings/typeOrder = ['Restaurants','BakeryShops',...]
   ═══════════════════════════════════════════════════════════ */
const ALL_TYPES = [
    { key:'Restaurants',  label:'مطاعم',      emoji:'🍔' },
    { key:'ButcherShops', label:'ملاحم',      emoji:'🥩' },
    { key:'BakeryShops',  label:'أفران',      emoji:'🥖' },
    { key:'Markets',      label:'أسواق',      emoji:'🛒' },
    { key:'GroceryShops', label:'بقالة',      emoji:'🧺' },
    { key:'SweetsShops',  label:'حلويات',     emoji:'🍰' },
    { key:'FishShops',    label:'أسماك',      emoji:'🐟' },
    { key:'CoffeeShops',  label:'قهوة',       emoji:'☕' },
    { key:'ChickenShops', label:'دجاج',       emoji:'🍗' },
    { key:'DairyShops',   label:'ألبان',      emoji:'🥛' },
    { key:'FlowerShops',  label:'زهور',       emoji:'💐' },
    { key:'TobaccoShops', label:'تبغ',        emoji:'🚬' },
    { key:'ToysShops',    label:'ألعاب',      emoji:'🧸' },
    { key:'Taxi',         label:'تاكسي',      emoji:'🚕' },
];

let _typeOrder = null; // cached order array

async function getTypeOrder() {
    if (_typeOrder) return _typeOrder;
    const saved = await fbGet('settings/typeOrder').catch(() => null);
    if (Array.isArray(saved) && saved.length) {
        // Merge: start with saved order, append any new types not yet in it
        const savedKeys = new Set(saved);
        const merged = [...saved, ...ALL_TYPES.map(t=>t.key).filter(k => !savedKeys.has(k))];
        _typeOrder = merged;
    } else {
        _typeOrder = ALL_TYPES.map(t => t.key);
    }
    return _typeOrder;
}

function _typeByKey(key) { return ALL_TYPES.find(t => t.key === key) || { key, label: key, emoji: '📦' }; }

async function renderTypeOrderList() {
    const list = document.getElementById('typeorder-list');
    if (!list) return;
    const order = await getTypeOrder();
    list.innerHTML = order.map((key, i) => {
        const t = _typeByKey(key);
        return `<div class="typeorder-row" draggable="true" data-key="${key}" data-idx="${i}"
                     style="display:flex;align-items:center;gap:12px;background:var(--surface2);
                            border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;
                            cursor:grab;user-select:none;transition:background 0.15s;">
            <span style="font-size:1.1rem;flex-shrink:0;">⠿</span>
            <span style="font-size:1.2rem;">${t.emoji}</span>
            <span style="font-size:0.88rem;font-weight:700;color:var(--white);flex:1;">${t.label}</span>
            <span style="font-size:0.72rem;color:var(--gray);font-family:var(--mono);">${t.key}</span>
        </div>`;
    }).join('');
    _initTypeOrderDrag(list);
}

function _initTypeOrderDrag(list) {
    let dragSrc = null;
    list.querySelectorAll('.typeorder-row').forEach(row => {
        row.addEventListener('dragstart', e => {
            dragSrc = row;
            row.style.opacity = '0.45';
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => { row.style.opacity = '1'; });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rows = [...list.querySelectorAll('.typeorder-row')];
            const targetIdx = rows.indexOf(row);
            const srcIdx    = rows.indexOf(dragSrc);
            if (dragSrc && dragSrc !== row) {
                row.style.borderColor = 'var(--orange)';
                if (srcIdx < targetIdx) list.insertBefore(dragSrc, row.nextSibling);
                else                    list.insertBefore(dragSrc, row);
            }
        });
        row.addEventListener('dragleave', () => { row.style.borderColor = 'var(--border)'; });
        row.addEventListener('drop',      () => { row.style.borderColor = 'var(--border)'; });
    });
}

async function saveTypeOrder() {
    const list = document.getElementById('typeorder-list');
    if (!list) return;
    const order = [...list.querySelectorAll('.typeorder-row')].map(r => r.dataset.key);
    _typeOrder = order;
    await fbSet('settings/typeOrder', order);
    await renderAdminFilterBar();
    toast('✅ تم حفظ ترتيب الأقسام');
}

async function renderAdminFilterBar() {
    const bar = document.getElementById('stores-filter-bar');
    if (!bar) return;
    const order = await getTypeOrder();
    const active = bar.querySelector('.filter-pill.active')?.dataset?.storeFilter || 'all';
    bar.innerHTML = `<button class="filter-pill ${active==='all'?'active':''}" data-store-filter="all">الكل</button>` +
        order.map(key => {
            const t = _typeByKey(key);
            return `<button class="filter-pill ${active===key?'active':''}" data-store-filter="${key}">${t.emoji} ${t.label}</button>`;
        }).join('');
    // Re-wire click handlers
    bar.querySelectorAll('.filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            storeFilter = btn.dataset.storeFilter;
            renderStores();
        });
    });
}

async function fbGet(path) {
    const r = await fetch(`${RTDB}/${path}.json`);
    if (!r.ok) throw new Error(`RTDB ${r.status}: ${path}`);
    return r.json();
}
async function fbSet(path, data) {
    const r = await fetch(`${RTDB}/${path}.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`RTDB PUT ${r.status}: ${path}`);
    // This write came from an admin acting inside this panel (settings save,
    // employee add/remove, etc.) — it's not a breach, so silently adopt the
    // new state as the security baseline instead of flagging it on the next poll.
    if (path.startsWith('settings') || path.startsWith('adminUsers')) {
        if (typeof _secSilentRebaseline === 'function') _secSilentRebaseline();
    }
    return r.json();
}

// ── Dollar/LBP exchange rate — fetched once at load so order-price
// splits (order total vs. delivery fee) can convert LBP delivery fees
// to USD anywhere in the admin panel, not just inside the settings tab.
// Default 90,000 until Firebase responds; the settings tab's own
// "دولار" save (dollar-rate-save) keeps this in sync going forward.
window._dollarRate = 90000;
fbGet('settings/dollarRate').then(val => {
    const n = parseFloat(val);
    if (n && n > 0) window._dollarRate = n;
}).catch(() => {});

async function fbUpdate(path, data) {
    const r = await fetch(`${RTDB}/${path}.json`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`RTDB PATCH ${r.status}: ${path}`);
    if (path.startsWith('settings') || path.startsWith('adminUsers')) {
        if (typeof _secSilentRebaseline === 'function') _secSilentRebaseline();
    }
    return r.json();
}
async function fbPush(path, data) {
    const r = await fetch(`${RTDB}/${path}.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`RTDB POST ${r.status}: ${path}`);
    return r.json();
}

// ── Firestore helpers ─────────────────────────────────────────
// Converts a Firestore document fields object → plain JS object
function fsDocToObj(doc, isNested = false) {
    const obj = isNested ? {} : { _id: doc.name ? doc.name.split('/').pop() : '' };
    for (const [key, val] of Object.entries(doc.fields || {})) {
        const type = Object.keys(val)[0];
        switch (type) {
            case 'stringValue':    obj[key] = val.stringValue;              break;
            case 'integerValue':   obj[key] = parseInt(val.integerValue);   break;
            case 'doubleValue':    obj[key] = val.doubleValue;              break;
            case 'booleanValue':   obj[key] = val.booleanValue;             break;
            case 'timestampValue': obj[key] = new Date(val.timestampValue).getTime(); break;
            case 'nullValue':      obj[key] = null;                         break;
            case 'mapValue':       obj[key] = fsDocToObj({ name: '', fields: val.mapValue.fields || {} }, true); break;
            case 'arrayValue':     obj[key] = (val.arrayValue.values || []).map(v => { const t = Object.keys(v)[0]; return t === 'mapValue' ? fsDocToObj({name:'',fields:v.mapValue.fields||{}},true) : Object.values(v)[0]; }); break;
            case 'geoPointValue':  obj[key] = { lat: val.geoPointValue.latitude, lng: val.geoPointValue.longitude }; break;
            default:               obj[key] = Object.values(val)[0];
        }
    }
    return obj;
}

// Fetches all docs from a Firestore collection using Firebase SDK
async function fsGetCollection(collection) {
    // Use REST with fresh token — works regardless of Firestore SDK rules
    let allDocs = {};
    let pageToken = null;
    do {
        const token = await getFsToken();
        const url = `${FIRESTORE}/${collection}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!r.ok) throw new Error(`Firestore ${r.status}: ${collection}`);
        const data = await r.json();
        (data.documents || []).forEach(doc => {
            const obj = fsDocToObj(doc);
            allDocs[obj._id] = obj;
        });
        pageToken = data.nextPageToken || null;
    } while (pageToken);
    return allDocs;
}

// ── Login ─────────────────────────────────────────────────────
async function doLogin() {
    const username = document.getElementById('adm-user').value.trim().toLowerCase();
    const password = document.getElementById('adm-pass').value.trim();
    const errEl    = document.getElementById('adm-login-error');
    const btn      = document.getElementById('adm-login-btn');

    if (!username || !password) return;
    btn.disabled = true; btn.textContent = '…';
    errEl.textContent = '';

    try {
        // Try /adminUsers in RTDB (includes a possible super-admin override at __seed)
        const admins = await fbGet('adminUsers');
        const seedOverride = admins && admins.__seed;
        // If the super-admin changed their username/password from the app, that
        // override takes precedence over the hardcoded fallback below.
        const effectiveSeed = seedOverride ? { ...SEED_SUPERADMIN, ...seedOverride } : SEED_SUPERADMIN;

        if (username === effectiveSeed.username && password === effectiveSeed.password) {
            currentAdmin = { ...effectiveSeed, _key: '__seed' };
            startApp();
            return;
        }
        if (admins && typeof admins === 'object') {
            for (const [key, adm] of Object.entries(admins)) {
                if (key === '__seed') continue; // already checked above as the super-admin
                if (adm && adm.username === username && adm.password === password) {
                    currentAdmin = { ...adm, _key: key };
                    // Store-linked accounts (role 'company'/'store') used to be routed
                    // straight into the company portal from here. They now belong on
                    // store.html only — startApp() below rejects them with a message
                    // instead of launching anything on this page.
                    startApp();
                    return;
                }
            }
        }
        errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    } catch(e) {
        // Network fail — allow seed admin offline (hardcoded credentials only,
        // since we can't reach the DB to check for a saved override)
        if (username === SEED_SUPERADMIN.username && password === SEED_SUPERADMIN.password) {
            currentAdmin = { ...SEED_SUPERADMIN };
            startApp();
        } else {
            errEl.textContent = 'خطأ في الاتصال، تحقق من الإنترنت';
        }
    } finally {
        btn.disabled = false; btn.textContent = 'دخول';
    }
}

function hasPerm(perm) {
    if (!currentAdmin) return false;
    if (currentAdmin.role === 'superadmin') return true;
    return (currentAdmin.permissions || []).includes(perm);
}

function roleLabel(role) {
    const labels = {
        superadmin:  'Super Admin',
        admin:       'مدير',
        supervisor:  'مشرف',
        support:     'دعم فني',
        driver:      'سائق',
        store:       'متجر',
        company:     'مستخدم متجر',
    };
    return labels[role] || role || '—';
}

// ── Start app ─────────────────────────────────────────────────
const STORE_ONLY_ROLES = ['company', 'store']; // store-linked accounts — admin.html is not for them

function startApp() {
    // Store-linked accounts don't get the admin dashboard (or the company
    // portal) from this page anymore — they must sign in from store.html.
    // Covers both a fresh login and a restored localStorage session.
    if (currentAdmin && STORE_ONLY_ROLES.includes(currentAdmin.role)) {
        currentAdmin = null;
        window.currentAdmin = null;
        document.getElementById('app')?.classList.remove('visible');
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'flex';
        const errEl = document.getElementById('adm-login-error');
        if (errEl) errEl.textContent = 'حسابات المتاجر يجب تسجيل الدخول من صفحة المتجر (store.html)';
        return;
    }
    window.currentAdmin = currentAdmin; // exposed for admin-presence.js (role gating)
    loadSettings();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');

    // Topbar user info
    document.getElementById('topbar-uname').textContent = currentAdmin.fullname || currentAdmin.username;
    document.getElementById('topbar-urole').textContent = roleLabel(currentAdmin.role);
    document.getElementById('topbar-avatar').textContent = (currentAdmin.fullname || currentAdmin.username)[0].toUpperCase();
    _updateNotifBellUI();

    // "الزوار المتصلون الآن" (live site-visitor presence) is an admin-only
    // tool — store accounts share this same dashboard shell but shouldn't
    // see or be able to open it.
    const onlineChip = document.getElementById('admin-online-chip');
    if (onlineChip) onlineChip.style.display = (currentAdmin.role === 'store') ? 'none' : '';

    // Save session — localStorage (not sessionStorage) so the login
    // survives across tabs/windows too, e.g. when an employee opens the
    // admin link from a WhatsApp notification in a brand-new tab.
    localStorage.setItem('delivoAdmin', JSON.stringify(currentAdmin));

    // Push notifications for this employee/admin — works even with admin.html
    // fully closed. Fire-and-forget, same as the driver-side registration.
    if (window.DelivoPush) {
        const empKey = currentAdmin._key || currentAdmin.username;
        DelivoPush.register(empKey, 'employee', currentAdmin.fullname || currentAdmin.username);
    }

    buildSidebar();
    // Load data then do the initial render of the active panel
    loadAllData().then(() => {
        const ap = document.querySelector('.panel.active');
        if (!ap) return;
        const id = ap.id.replace('panel-', '');
        if (id === 'map')        renderMap();
        if (id === 'orders')     renderOrders();
        if (id === 'online-req') renderOnlineRequests();
        if (id === 'admin-order') renderAdminOrderPanel();
        if (id === 'drivers')    renderDrivers();
        if (id === 'customers')  renderCustomers();
        if (id === 'visitors')   renderVisitors();
        if (id === 'attendance') renderAttendanceSafe();
        if (id === 'stores')     renderStores();
        if (id === 'ext-stores') renderExtStores();
        if (id === 'employees')  renderEmployees();
        if (id === 'settings')   renderSettings();
        if (id === 'backup')     { renderBackupPanel(); renderSecurityLog(); }
        if (id === 'catalog')    renderCatalog();
        if (id === 'rewards')    renderRewards();
        if (id === 'promoflip') renderPromoFlipAdmin();
        if (id === 'herobg')    renderHeroBgAdmin();
        if (id === 'expenses')  renderExpenses();
        if (id === 'cashbox')   renderCashbox();
    });
    startAutoRefresh();
    _startFastDriverPoll();
}

function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = '';

    const sections = {
        'القائمة الرئيسية': NAV_ITEMS.filter(i => i.id !== 'settings' && i.id !== 'employees' && i.id !== 'backup'),
        'الإدارة':           NAV_ITEMS.filter(i => i.id === 'employees' || i.id === 'settings' || i.id === 'backup'),
    };

    let firstPanel = null;

    Object.entries(sections).forEach(([label, items]) => {
        const visible = items.filter(i => hasPerm(i.perm));
        if (!visible.length) return;

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'nav-section-label';
        sectionLabel.textContent = label;
        nav.appendChild(sectionLabel);

        visible.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.title = item.label;
            const badgeHtml = NAV_COUNT_IDS[item.id] ? `<span class="nav-badge" id="nav-badge-${item.id}" style="display:none;">0</span>` : '';
            btn.innerHTML = `${item.icon}<span class="nav-label">${item.label}</span>${badgeHtml}`;
            btn.dataset.panel = item.id;
            btn.addEventListener('click', () => switchPanel(item.id));
            nav.appendChild(btn);
            if (!firstPanel) firstPanel = item.id;
        });
    });

    // Logout at bottom
    const sysLabel = document.createElement('div');
    sysLabel.className = 'nav-section-label';
    sysLabel.style.marginTop = 'auto';
    sysLabel.textContent = 'النظام';
    nav.appendChild(sysLabel);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'nav-item';
    logoutBtn.title = 'تسجيل الخروج';
    logoutBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span class="nav-label">تسجيل الخروج</span>`;
    logoutBtn.addEventListener('click', doLogout);
    nav.appendChild(logoutBtn);

    if (firstPanel) switchPanel(firstPanel);
}

function switchPanel(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(`panel-${id}`);
    if (panel) panel.classList.add('active');
    const btn = document.querySelector(`[data-panel="${id}"]`);
    if (btn) btn.classList.add('active');

    const labels = { map:'الخريطة', orders:'الطلبات', 'online-req':'طلبات أونلاين', 'admin-order':'اطلب', drivers:'السائقون', customers:'العملاء', visitors:'الزوار', attendance:'الحضور', stores:'المتاجر', 'ext-stores':'متاجر خارجية', employees:'الموظفون', settings:'الإعدادات', catalog:'المنتجات', rewards:'نظام النقاط', sales:'عروض المتاجر', promoflip:'كروت العروض', herobg:'خلفيات الواجهة', expenses:'المصاريف اليومية', cashbox:'حركة الصندوق' };
    document.getElementById('topbar-panel-name').textContent = labels[id] || '';

    if (id === 'map' && adminMap) setTimeout(() => adminMap.invalidateSize(), 100);
    if (id === 'map')       renderMap();
    if (id === 'sales')     document.dispatchEvent(new CustomEvent('panelOpen', { detail: 'sales' }));
    if (id === 'orders')    renderOrders();
    if (id === 'online-req') renderOnlineRequests();
    if (id === 'admin-order') renderAdminOrderPanel();
    if (id === 'drivers')   renderDrivers();
    if (id === 'customers') renderCustomers();
    if (id === 'visitors')  renderVisitors();
    if (id === 'attendance') renderAttendanceSafe();
    if (id === 'stores')    renderStores();
    if (id === 'ext-stores') renderExtStores();
    if (id === 'employees') renderEmployees();
    if (id === 'settings')  renderSettings();
    if (id === 'backup')    { renderBackupPanel(); renderSecurityLog(); }
    if (id === 'catalog')   renderCatalog();
    if (id === 'rewards')   renderRewards();
    if (id === 'promoflip') renderPromoFlipAdmin();
    if (id === 'herobg')    renderHeroBgAdmin();
    if (id === 'expenses')  renderExpenses();
    if (id === 'cashbox')   renderCashbox();


}

/* ================================================================
   CATALOG — Store item management
   Firebase RTDB paths:
     pattern/{StoreType}           → store list (companyname, rank, soon)
     items/{companyname}/{itemID}  → items { name, price, sale, catmain, cat, catar, unitdesc, pngExist, ID }
   Images: ./items2/{ID}.webp  (served as static files)
================================================================ */

let _catCurrentStore  = null;  // { name, type }
let _catAllItems      = {};    // raw items from RTDB
let _catActiveFilter  = undefined;  // current catmain tab: undefined = not yet picked for this store, null = "الكل" (all), string = one catmain
let _catSearchQuery   = '';    // item-name search filter (catalog-search input)

// ── Entry point ───────────────────────────────────────────────
async function renderCatalog() {
    catalogBackToStores();   // always start at store picker
    const grid = document.getElementById('catalog-stores-grid');
    grid.innerHTML = _catSkeletonStores(8);
    try {
        const patternAll = await fbGet('pattern');
        if (!patternAll) { grid.innerHTML = `<div style="color:var(--gray);grid-column:1/-1;">لا توجد بيانات</div>`; return; }
        const stores = [];
        Object.entries(patternAll).forEach(([type, storesObj]) => {
            if (!storesObj || typeof storesObj !== 'object') return;
            Object.values(storesObj).forEach(s => {
                if (s && s.companyname) stores.push({ name: s.companyname, type, rank: s.rank });
            });
        });
        stores.sort((a,b) => a.name.localeCompare(b.name, 'ar'));
        grid.innerHTML = stores.map(s => `
            <div onclick="catalogOpenStore('${s.name.replace(/'/g,"\\'")}','${s.type}')"
                 style="background:var(--surface);border-radius:12px;padding:14px;cursor:pointer;
                        display:flex;flex-direction:column;align-items:center;gap:8px;
                        border:1.5px solid var(--surface3);transition:border-color .2s;"
                 onmouseover="this.style.borderColor='var(--orange)'"
                 onmouseout="this.style.borderColor='var(--surface3)'">
                <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:var(--surface3);flex-shrink:0;">
                    <img src="assets/${s.name.toLowerCase()}.png" alt="${s.name}"
                         style="width:100%;height:100%;object-fit:cover;"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                    ><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.4rem;">🏪</div>
                </div>
                <div style="font-size:0.78rem;font-weight:700;color:var(--white);text-align:center;line-height:1.3;">${s.name}</div>
                <div style="font-size:0.68rem;color:var(--gray);">${_catTypeLabel(s.type)}</div>
            </div>`).join('');
    } catch(e) {
        grid.innerHTML = `<div style="color:var(--red,#ef4444);grid-column:1/-1;">⚠️ ${e.message}</div>`;
    }
}

async function catalogOpenStore(storeName, storeType) {
    _catCurrentStore = { name: storeName, type: storeType };
    _catSearchQuery = '';
    _catActiveFilter = undefined; // fresh store — let _renderCatalogItems() pick the default tab once
    document.getElementById('catalog-stores-view').style.display = 'none';
    const itemsView = document.getElementById('catalog-items-view');
    itemsView.style.display = 'flex';
    document.getElementById('cat-add-item-btn').style.display = '';
    document.getElementById('cat-back-btn').style.display = '';
    const searchInp = document.getElementById('catalog-search');
    if (searchInp) { searchInp.style.display = ''; searchInp.value = ''; }
    document.getElementById('catalog-count-label').textContent = storeName;
    document.getElementById('catalog-items-grid').innerHTML = _catSkeletonItems(6);
    document.getElementById('catalog-cats-bar').innerHTML = '';
    try {
        const raw = await fbGet(`items/${storeName}`);
        _catAllItems = raw || {};
        _renderCatalogItems();
    } catch(e) {
        document.getElementById('catalog-items-grid').innerHTML = `<div style="color:var(--red,#ef4444);grid-column:1/-1;">⚠️ ${e.message}</div>`;
    }
}

function catalogBackToStores() {
    _catCurrentStore = null;
    _catAllItems = {};
    _catActiveFilter = undefined;
    _catSearchQuery = '';
    document.getElementById('catalog-stores-view').style.display = '';
    document.getElementById('catalog-items-view').style.display = 'none';
    document.getElementById('cat-add-item-btn').style.display = 'none';
    document.getElementById('cat-back-btn').style.display = 'none';
    const searchInp = document.getElementById('catalog-search');
    if (searchInp) { searchInp.style.display = 'none'; searchInp.value = ''; }
    document.getElementById('catalog-count-label').textContent = 'اختر متجراً';
}

function _renderCatalogItems() {
    const items = Object.values(_catAllItems).filter(Boolean);
    const grid  = document.getElementById('catalog-items-grid');
    const bar   = document.getElementById('catalog-cats-bar');

    if (!items.length) {
        bar.innerHTML = '';
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--gray);">
            <div style="font-size:2.5rem;margin-bottom:8px;">🛍️</div>
            <div style="font-weight:700;margin-bottom:4px;">لا توجد منتجات</div>
            <div style="font-size:0.75rem;">اضغط "إضافة منتج" لإضافة أول منتج لهذا المتجر</div>
        </div>`;
        return;
    }

    // Build catmain tabs
    const mains = [...new Set(items.map(i => i.catmain || 'عام'))].sort();
    // Only auto-pick a default tab the first time this store is opened
    // (undefined) or if the previously-picked catmain no longer exists in
    // this item set (stale). A deliberate "الكل" choice is stored as
    // `null`, which must NOT be treated as "unset" here — that was the
    // bug: every render silently snapped "الكل" back to the first tab,
    // so it could never stay selected.
    if (_catActiveFilter === undefined || (_catActiveFilter !== null && !mains.includes(_catActiveFilter))) {
        _catActiveFilter = mains[0];
    }

    bar.innerHTML = `
        <button onclick="_catSetFilter(null)"
                style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:0.72rem;font-weight:700;
                       background:${_catActiveFilter===null?'var(--orange)':'var(--surface3)'};
                       color:${_catActiveFilter===null?'#fff':'var(--gray-light)'};">
            الكل (${items.length})
        </button>
        ${mains.map(m => `
        <button onclick="_catSetFilter('${m.replace(/'/g,"\\'")}')"
                style="flex-shrink:0;padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:0.72rem;font-weight:700;
                       background:${ _catActiveFilter===m ? 'var(--orange)' : 'var(--surface3)' };
                       color:${ _catActiveFilter===m ? '#fff' : 'var(--gray-light)' };">
            ${m}
        </button>`).join('')}`;

    const filtered = _catActiveFilter ? items.filter(i => (i.catmain||'عام') === _catActiveFilter) : items;
    const searched = _catSearchQuery
        ? filtered.filter(i => (i.name||'').toLowerCase().includes(_catSearchQuery.toLowerCase()))
        : filtered;

    if (!searched.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--gray);">
            <div style="font-size:2.5rem;margin-bottom:8px;">🔍</div>
            <div style="font-weight:700;">لا توجد نتائج مطابقة للبحث</div>
        </div>`;
        return;
    }

    grid.innerHTML = searched.map(item => {
        const id      = item.ID || item.id || '';
        const price   = parseFloat(item.price) || 0;
        const sale    = parseFloat(item.sale)  || 0;
        const hasSale = sale > 0 && sale < price;
        const png     = item.pngExist === '1' || item.pngExist === 1;
        const imgSrc  = png
            ? (_cpiLocalImagePreview[id] || `items2/${String(id).toLowerCase()}.webp${item.imgUpdatedAt ? '?v=' + item.imgUpdatedAt : ''}`)
            : '';
        return `
        <div style="background:var(--surface);border-radius:12px;overflow:hidden;border:1.5px solid var(--surface3);display:flex;flex-direction:column;min-height:220px;">
            <!-- image -->
            <div style="height:120px;background:var(--surface3);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
                ${png
                    ? `<img src="${imgSrc}" alt="${item.name||''}"
                           style="width:100%;height:100%;object-fit:cover;"
                           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                       ><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:2rem;background:var(--surface3);">${_catTypeEmoji(_catCurrentStore?.type)}</div>`
                    : `<div style="font-size:2.5rem;">${_catTypeEmoji(_catCurrentStore?.type)}</div>`
                }
                ${hasSale ? `<div style="position:absolute;top:6px;right:6px;background:var(--orange);color:#fff;font-size:0.62rem;font-weight:900;padding:2px 6px;border-radius:8px;">خصم</div>` : ''}
                ${!png ? `<div style="position:absolute;bottom:4px;left:4px;background:rgba(239,68,68,0.85);color:#fff;font-size:0.58rem;padding:2px 5px;border-radius:6px;">بدون صورة</div>` : ''}
            </div>
            <!-- info -->
            <div style="padding:10px;flex:1;display:flex;flex-direction:column;gap:4px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--white);line-height:1.3;">${item.name||'—'}</div>
                <div style="font-size:0.65rem;color:var(--gray);">${item.catmain||''}${item.cat && item.cat!==item.catmain ? ' › '+item.cat : ''}</div>
                <div style="margin-top:auto;display:flex;align-items:center;gap:6px;">
                    <span style="font-size:0.78rem;font-weight:800;color:var(--orange);">${_catFmtPrice(hasSale?sale:price)}</span>
                    ${hasSale ? `<span style="font-size:0.68rem;color:var(--gray);text-decoration:line-through;">${_catFmtPrice(price)}</span>` : ''}
                </div>
                <div style="font-size:0.6rem;color:var(--gray);font-family:monospace;">ID: ${id}</div>
            </div>
            <!-- actions -->
            <div style="display:flex;gap:0;border-top:1px solid var(--surface3);">
                <button onclick="openCatalogItemModal(${JSON.stringify(item).replace(/"/g,'&quot;')})"
                        style="flex:1;padding:7px;background:none;border:none;cursor:pointer;color:var(--orange);font-size:0.72rem;font-weight:700;border-right:1px solid var(--surface3);">
                    ✏️ تعديل
                </button>
                <button onclick="deleteCatalogItem('${String(id)}')"
                        style="flex:1;padding:7px;background:none;border:none;cursor:pointer;color:#ef4444;font-size:0.72rem;font-weight:700;">
                    🗑️ حذف
                </button>
            </div>
        </div>`;
    }).join('');
}

function _catSetFilter(main) {
    _catActiveFilter = main;
    _renderCatalogItems();
}

function _catSetSearch(query) {
    _catSearchQuery = (query || '').trim();
    _renderCatalogItems();
}

// ── Category select helpers ───────────────────────────────────
function _cimGetCats(catmain) {
    return [...new Set(Object.values(_catAllItems).filter(Boolean)
        .filter(i => !catmain || i.catmain === catmain)
        .map(i=>i.cat).filter(Boolean))].sort();
}
function _cimCatOptions(catmain, selectedCat) {
    const cats = _cimGetCats(catmain);
    const opts = cats.map(c=>`<option value="${c}" ${selectedCat===c?'selected':''}>${c}</option>`).join('');
    return opts + `<option value="__new__">➕ إضافة جديد…</option>`;
}
function cimCatmainChanged() {
    const sel   = document.getElementById('cim-catmain-sel');
    const input = document.getElementById('cim-catmain');
    const catSel= document.getElementById('cim-cat-sel');
    if (sel.value === '__new__') {
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.style.display = 'none';
        input.value = sel.value;
        // Refresh cat options for the chosen catmain
        if (catSel) {
            catSel.innerHTML = _cimCatOptions(sel.value, '');
            document.getElementById('cim-cat').style.display = 'none';
            document.getElementById('cim-cat').value = '';
        }
    }
}
function cimCatChanged() {
    const sel   = document.getElementById('cim-cat-sel');
    const input = document.getElementById('cim-cat');
    if (sel.value === '__new__') {
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.style.display = 'none';
        input.value = sel.value;
    }
}

// ── Item modal ────────────────────────────────────────────────
function openCatalogItemModal(item) {
    // Remove old modal if any
    document.getElementById('cat-item-modal')?.remove();

    // Clear any stale staged image from a previous modal session (shared
    // with the "منتجاتي" company-portal upload flow — see cpiPreviewImage)
    _cpiPendingImageFile = null;
    _cpiPendingImageDataUrl = null;

    const isNew = !item;
    const id    = item ? (item.ID || item.id || '') : '';

    const modal = document.createElement('div');
    modal.id = 'cat-item-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;`;
    modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;">
        <div style="padding:16px 20px;border-bottom:1px solid var(--surface3);display:flex;align-items:center;gap:10px;">
            <span style="font-size:0.88rem;font-weight:800;color:var(--white);">${isNew?'إضافة منتج':'تعديل منتج'}</span>
            <button onclick="document.getElementById('cat-item-modal').remove()"
                    style="margin-right:auto;background:none;border:none;cursor:pointer;color:var(--gray);font-size:1.1rem;">✕</button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">

            <!-- Image preview + direct upload -->
            <div style="text-align:center;margin-bottom:4px;">
                <div onclick="document.getElementById('cim-img-file').click()"
                     style="width:90px;height:90px;border-radius:12px;overflow:hidden;background:var(--surface3);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px dashed var(--border);position:relative;transition:border-color .15s;"
                     onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'"
                     id="cat-modal-img-wrap">
                    ${(!isNew && (item.pngExist==='1'||item.pngExist===1))
                        ? `<img src="items2/${String(id).toLowerCase()}.webp?_t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;" id="cim-img-preview"
                               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div style="display:none;font-size:2rem;width:100%;height:100%;align-items:center;justify-content:center;" id="cim-img-placeholder">📷</div>`
                        : `<span style="font-size:2rem;" id="cim-img-placeholder">📷</span>
                           <img src="" style="width:100%;height:100%;object-fit:cover;display:none;" id="cim-img-preview">`
                    }
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.62rem;font-weight:700;padding:3px 0;text-align:center;">📤 رفع / تغيير</div>
                </div>
                <input type="file" id="cim-img-file" accept="image/*" style="display:none;" onchange="cpiPreviewImage(this)">
                <div style="font-size:0.68rem;color:var(--gray);line-height:1.5;">
                    اضغط على الصورة لرفع صورة المنتج مباشرة — سيتم حفظها كـ
                    <code style="color:var(--orange)" id="cat-modal-img-name">${id ? id.toLowerCase()+'.webp' : 'ID.webp'}</code>
                </div>
                <div id="cim-img-status" style="font-size:0.66rem;color:var(--gray);margin-top:2px;"></div>
            </div>

            <div class="modal-field">
                <label>اسم المنتج <span style="color:var(--orange)">*</span></label>
                <input type="text" id="cim-name" value="${item?.name||''}" placeholder="مثال: شاورما دجاج" style="width:100%;">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="modal-field">
                    <label>السعر (ل.ل أو $)</label>
                    <input type="number" id="cim-price" value="${item?.price||''}" placeholder="75000" step="any" style="width:100%;">
                </div>
                <div class="modal-field">
                    <label>سعر بعد الخصم</label>
                    <input type="number" id="cim-sale" value="${item?.sale||''}" placeholder="0 = بدون خصم" step="any" style="width:100%;">
                </div>
            </div>
            <div class="modal-field">
                <label>القسم الرئيسي (catmain) <span style="color:var(--orange)">*</span></label>
                <div style="display:flex;gap:6px;">
                    <select id="cim-catmain-sel" onchange="cimCatmainChanged()"
                            style="flex:1;background:var(--surface3);border:1px solid #3a3a3a;border-radius:8px;color:var(--white);padding:7px 10px;font-size:0.8rem;outline:none;cursor:pointer;">
                        ${[...new Set(Object.values(_catAllItems).filter(Boolean).map(i=>i.catmain).filter(Boolean))].sort()
                            .map(c=>`<option value="${c}" ${(item?.catmain||'')=== c ?'selected':''}>${c}</option>`).join('')}
                        <option value="__new__">➕ إضافة جديد…</option>
                    </select>
                </div>
                <input type="text" id="cim-catmain" value="${item?.catmain||''}"
                       placeholder="اكتب قسم رئيسي جديد…" style="width:100%;margin-top:6px;display:${
                           (!item?.catmain || Object.values(_catAllItems).filter(Boolean).some(i=>i.catmain===item?.catmain)) ? 'none' : 'block'
                       };">
            </div>
            <div class="modal-field">
                <label>القسم الفرعي (cat)</label>
                <div style="display:flex;gap:6px;">
                    <select id="cim-cat-sel" onchange="cimCatChanged()"
                            style="flex:1;background:var(--surface3);border:1px solid #3a3a3a;border-radius:8px;color:var(--white);padding:7px 10px;font-size:0.8rem;outline:none;cursor:pointer;">
                        ${_cimCatOptions(item?.catmain, item?.cat)}
                    </select>
                </div>
                <input type="text" id="cim-cat" value="${item?.cat||''}"
                       placeholder="اكتب قسم فرعي جديد…" style="width:100%;margin-top:6px;display:none;">
            </div>
            <div class="modal-field">
                <label>الوصف (unitdesc)</label>
                <textarea id="cim-desc" rows="2" placeholder="وصف اختياري للمنتج" style="width:100%;resize:vertical;">${item?.unitdesc||''}</textarea>
            </div>
            <div class="modal-field">
                <label>الـ ID <span style="color:var(--orange)">*</span> <small style="color:var(--gray)">(اسم ملف الصورة = ID.webp)</small></label>
                <input type="text" id="cim-id" value="${id}" placeholder="مثال: sha001" dir="ltr" style="width:100%;font-family:monospace;"
                       oninput="document.getElementById('cat-modal-img-name').textContent=(this.value.toLowerCase()||'id')+'.webp'">
            </div>
            <div style="display:flex;align-items:center;gap:10px;background:var(--surface3);padding:10px 12px;border-radius:8px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
                    <input type="checkbox" id="cim-pngexist" ${(item?.pngExist==='1'||item?.pngExist===1)?'checked':''}>
                    <span style="font-size:0.78rem;color:var(--gray-light);">صورة موجودة (pngExist = 1)</span>
                </label>
            </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--surface3);display:flex;gap:8px;">
            <button onclick="saveCatalogItem(${isNew})" id="cim-save-btn"
                    style="flex:1;padding:10px;background:var(--orange);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:0.82rem;font-weight:800;">
                ${isNew ? '✅ إضافة' : '💾 حفظ التغييرات'}
            </button>
            <button onclick="document.getElementById('cat-item-modal').remove()"
                    style="padding:10px 16px;background:var(--surface3);color:var(--gray-light);border:none;border-radius:10px;cursor:pointer;font-size:0.82rem;">
                إلغاء
            </button>
        </div>
    </div>`;

    // Store original item key for updates
    modal._itemKey = isNew ? null : (item._fbKey || id);
    modal._origItem = item;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('cim-name').focus();

    // Sync hidden text inputs with select initial values
    const cmSel = document.getElementById('cim-catmain-sel');
    const cSel  = document.getElementById('cim-cat-sel');
    const cmIn  = document.getElementById('cim-catmain');
    const cIn   = document.getElementById('cim-cat');
    if (cmSel && cmSel.value !== '__new__' && cmIn) cmIn.value = cmSel.value;
    if (cSel  && cSel.value  !== '__new__' && cIn)  cIn.value  = cSel.value;
}

async function saveCatalogItem(isNew) {
    if (!_catCurrentStore) return;
    const name     = document.getElementById('cim-name').value.trim();
    const price    = document.getElementById('cim-price').value.trim();
    const sale     = document.getElementById('cim-sale').value.trim();
    const catmain  = document.getElementById('cim-catmain').value.trim();
    const cat      = document.getElementById('cim-cat').value.trim();
    const desc     = document.getElementById('cim-desc').value.trim();
    const itemId   = document.getElementById('cim-id').value.trim();
    const pngExist = document.getElementById('cim-pngexist').checked ? '1' : '0';

    if (!name || !itemId) { showNotif('بيانات ناقصة', 'الاسم والـ ID إلزاميان', 'error'); return; }

    const payload = {
        ID:       itemId,
        name,
        price:    price || '0',
        sale:     sale  || '0',
        catmain:  catmain || 'عام',
        cat:      cat    || catmain || 'عام',
        unitdesc: desc,
        pngExist,
        companytype: _catCurrentStore.type,
    };

    const btn = document.getElementById('cim-save-btn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ…';

    try {
        const path = `items/${_catCurrentStore.name}/${itemId}`;
        await fbSet(path, payload);

        // Update local cache
        _catAllItems[itemId] = payload;

        // Upload staged image (if the admin selected one) to items2/{id}.webp
        if (_cpiPendingImageFile) {
            btn.textContent = '📤 جاري رفع الصورة…';
            try {
                await cpiUploadItemImage(_cpiPendingImageFile, itemId);
                // Reflect the new image immediately in the grid — don't make
                // the admin wait for GitHub → hosting propagation, and don't
                // let a stale browser cache keep showing the old file.
                if (_cpiPendingImageDataUrl) _cpiLocalImagePreview[itemId] = _cpiPendingImageDataUrl;
                _catAllItems[itemId].imgUpdatedAt = Date.now();
                await fbUpdate(path, { imgUpdatedAt: _catAllItems[itemId].imgUpdatedAt });
            } catch (imgErr) {
                showNotif('تم حفظ المنتج، لكن فشل رفع الصورة', imgErr.message, 'error');
            }
        }
        _cpiPendingImageFile = null;
        _cpiPendingImageDataUrl = null;

        showNotif(isNew ? 'تمت الإضافة' : 'تم الحفظ', name, 'success');
        document.getElementById('cat-item-modal').remove();
        _renderCatalogItems();
    } catch(e) {
        showNotif('خطأ في الحفظ', e.message, 'error');
        btn.disabled = false;
        btn.textContent = isNew ? '✅ إضافة' : '💾 حفظ التغييرات';
    }
}

async function deleteCatalogItem(itemId) {
    if (!_catCurrentStore) return;
    const item = _catAllItems[itemId];
    const name = item?.name || itemId;
    const confirmed = await showConfirm({
        title: 'حذف المنتج',
        msg: `هل تريد حذف "${name}" نهائياً؟`,
        type: 'error',
        okLabel: 'حذف',
        icon: '🗑️'
    });
    if (!confirmed) return;
    try {
        await fbSet(`items/${_catCurrentStore.name}/${itemId}`, null);
        delete _catAllItems[itemId];
        showNotif('تم الحذف', name, 'success');
        _renderCatalogItems();
    } catch(e) {
        showNotif('خطأ', e.message, 'error');
    }
}

// ── Catalog helpers ───────────────────────────────────────────
function _catFmtPrice(p) {
    const n = parseFloat(p);
    if (isNaN(n) || n === 0) return '—';
    if (n < 1000) return '$' + n.toFixed(n%1===0?0:2);
    if (n >= 1000000) return (n/1000000).toFixed(n%1000000===0?0:2).replace(/\.?0+$/,'') + ' مليون ل.ل';
    return (n/1000).toFixed(n%1000===0?0:1) + ' ألف ل.ل';
}
function _catTypeLabel(t) {
    return { Restaurants:'مطاعم', CoffeeShops:'قهوة', Markets:'سوبرماركت', SweetsShops:'حلويات',
             ButcherShops:'ملاحم', FishShops:'أسماك', BakeryShops:'أفران', ChickenShops:'دجاج',
             DairyShops:'ألبان', GroceryShops:'بقالة', FlowerShops:'زهور', Taxi:'تاكسي',
             TobaccoShops:'تبغ', ToysShops:'ألعاب' }[t] || t;
}
function _catTypeEmoji(t) {
    return { Restaurants:'🍔', CoffeeShops:'☕', Markets:'🛒', SweetsShops:'🍰',
             ButcherShops:'🥩', FishShops:'🐟', BakeryShops:'🥖', ChickenShops:'🍗',
             DairyShops:'🥛', GroceryShops:'🧺', FlowerShops:'💐', Taxi:'🚕',
             TobaccoShops:'🚬', ToysShops:'🧸' }[t] || '🏪';
}
function _catSkeletonStores(n) {
    return Array(n).fill(0).map(()=>`
        <div style="background:var(--surface);border-radius:12px;height:120px;animation:pulse 1.4s infinite;"></div>`).join('');
}
function _catSkeletonItems(n) {
    return Array(n).fill(0).map(()=>`
        <div style="background:var(--surface);border-radius:12px;height:200px;animation:pulse 1.4s infinite;grid-column:span 1;"></div>`).join('');
}


function doLogout() {
    localStorage.removeItem('delivoAdmin');
    currentAdmin = null;
    window.currentAdmin = null;
    clearInterval(refreshTimer);
    document.getElementById('app').classList.remove('visible');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('adm-user').value = '';
    document.getElementById('adm-pass').value = '';
}

// ── Load all data ─────────────────────────────────────────────
async function loadAllData() {
    try {
        const [orders, drivers, users, devices, pattern, admins, blacklist, storeStatusAll, assignMode, deviceLeads, extStoresRaw, customerActivity, guestCustomersRaw, expensesRaw, cashboxRaw] = await Promise.all([
            fbGet('requests'),
            fbGet('drivers'),
            fsGetCollection('users'),
            fsGetCollection('devices').catch(() => ({})),
            fbGet('pattern'),
            fbGet('adminUsers').catch(()  => null),
            fbGet('blacklist').catch(()   => null),
            fbGet('storeStatus').catch(() => null),
            fbGet('settings/orderAssignmentMode').catch(() => null),
            fbGet('deviceLeads').catch(() => null),
            fbGet('externalStores').catch(() => null),
            fbGet('customerActivity').catch(() => null),
            fbGet('guestCustomers').catch(() => null),
            fbGet('expenses').catch(() => null),
            fbGet('cashbox').catch(() => null),
        ]);

        allExpenses = expensesRaw || {};
        window.allExpenses = allExpenses; // exposed for admin-05's net-profit calc (see renderOrders)

        window.allCashbox = cashboxRaw || {}; // cashbox/{YYYY-MM-DD} → { opening, openingSetBy, openingSetByName, openingSetAt } — see admin-13-cashbox.js

        allExtStores = extStoresRaw || {};

        allGuestCustomers = guestCustomersRaw || {};
        window.allGuestCustomers = allGuestCustomers; // exposed for the "اطلب" search + any other panel that wants to look up an unregistered caller by phone

        allVisitors = deviceLeads || {};
        window.allVisitors = allVisitors; // exposed for admin-presence.js (matches guest sessions to unregistered name+phone leads)

        _assignmentMode = assignMode || 'both';

        allOrders    = orders    || {};
        allBlacklist = blacklist || {};
        _detectAndAlertNewOrders(allOrders, null);
        if (typeof _refreshClosePlatformBtn === 'function') _refreshClosePlatformBtn();

        if (drivers) {
            allDrivers = _parseDriversRaw(drivers);
            // Self-heal: a driver record with none of owner/username/phone/deviceUUID
            // is unusable junk (can't log in, can't be identified) — most likely a
            // leftover from a legacy array-rewrite. Drop it from the list and remove
            // it from Firebase so it doesn't keep resurfacing as a blank card.
            const _ghosts = allDrivers.filter(d => !(d.owner || d.username || d.phone || d.deviceUUID));
            if (_ghosts.length) {
                allDrivers = allDrivers.filter(d => d.owner || d.username || d.phone || d.deviceUUID);
                _ghosts.forEach(g => {
                    fetch(`${RTDB}/drivers/${g._key}.json`, { method: 'DELETE' }).catch(() => {});
                });
                console.warn('[Delivo] Removed', _ghosts.length, 'empty ghost driver record(s).');
            }
        } else {
            allDrivers = [];
        }


        allUsers   = users   || {};
        // Merge in each account's persisted lastActive (see presence.js's
        // _touchCustomerActivity) — a small parallel RTDB node rather than
        // a Firestore field, so the customers list can show/sort by real
        // last-seen time without touching Firestore security rules.
        if (customerActivity) {
            Object.entries(customerActivity).forEach(([uid, rec]) => {
                if (allUsers[uid] && rec && rec.lastActive) allUsers[uid].lastActive = rec.lastActive;
            });
        }
        window.allUsers = allUsers; // exposed for admin-presence.js (matches guest sessions to registered accounts)
        adminUsers = admins  || {};

        // ── Merge RTDB points into allUsers ───────────────────
        // Points are stored in RTDB /users/{uid}/points, not in Firestore.
        // Fetch all at once and merge so renderCustomers() shows correct values.
        try {
            const rtdbUsers = await fbGet('users').catch(() => null);
            if (rtdbUsers && typeof rtdbUsers === 'object') {
                Object.entries(rtdbUsers).forEach(([uid, data]) => {
                    if (allUsers[uid] && data && data.points !== undefined) {
                        allUsers[uid].points = data.points;
                    }
                });
            }
        } catch(_) {}

        allDeviceGroups = {};
        Object.entries(allUsers).forEach(([uid, u]) => {
            u.uid = uid; // tag each record with its key so downstream code (map popups) can reference it
            const uuid = u.deviceUUID;
            if (!uuid) return;
            if (!allDeviceGroups[uuid]) allDeviceGroups[uuid] = [];
            allDeviceGroups[uuid].push(u);
        });

        allStores = {};
        if (pattern) {
            Object.entries(pattern).forEach(([type, list]) => {
                const arr = Array.isArray(list) ? list : Object.values(list);
                arr.filter(s => s && s.companyname).forEach(s => {
                    const st = storeStatusAll && storeStatusAll[s.companyname];
                    const cl = st && (st.closed === true || st.closed === '1' || st.closed === 1);
                    const p  = (s.priority !== undefined && s.priority !== null && s.priority !== '')
                               ? parseInt(s.priority) : null;
                    if (allStores[s.companyname]) {
                        if (!allStores[s.companyname].allTypes.includes(type))
                            allStores[s.companyname].allTypes.push(type);
                        // Store per-type priority
                        if (p !== null) allStores[s.companyname].priorities[type] = p;
                    } else {
                        allStores[s.companyname] = {
                            ...s, type,
                            allTypes:      [type],
                            priorities:    p !== null ? { [type]: p } : {},
                            _closed:        cl || false,
                            _closedReason:  cl ? (st.reason  || '') : '',
                            _opensAt:       cl ? (st.opensAt || '') : '',
                        };
                    }
                });
            });
        }

        updateTopbarStats();
        updateNavBadge();
        // Run security checks on every data refresh
        runSecurityChecks().catch(()=>{});

    } catch(e) {
        console.error('[Admin] loadAllData:', e);
        const msg = e.message || '';
        if (msg.includes('TOO_MANY_ATTEMPTS') || msg.includes('too many failed')) {
            // Firebase locked out — stop the auto-refresh timer immediately to prevent more hammering
            _pauseAutoRefresh();
            _fsToken = null; _fsTokenExpiry = 0; _fsSignInFails = _FS_MAX_FAILS;
            const existing = document.getElementById('auth-lockout-banner');
            if (!existing) {
                const banner = document.createElement('div');
                banner.id = 'auth-lockout-banner';
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ef4444;color:#fff;text-align:center;padding:14px 20px;font-size:14px;font-weight:600;';
                banner.innerHTML = '⚠️ Firebase Auth مؤقتاً محظور بسبب محاولات تسجيل دخول متكررة. انتظر 5 دقائق ثم <a href="javascript:location.reload()" style="color:#fff;text-decoration:underline;">أعِد تحميل الصفحة</a>.';
                document.body.prepend(banner);
            }
            // Auto-retry after 5 minutes
            setTimeout(() => {
                _fsSignInFails = 0;
                _fsToken = null; _fsTokenExpiry = 0;
                const b = document.getElementById('auth-lockout-banner');
                if (b) b.innerHTML = '🔄 جاري إعادة المحاولة... <a href="javascript:location.reload()" style="color:#fff;text-decoration:underline;">أو أعِد تحميل الصفحة</a>';
                loadAllData();
            }, 5 * 60 * 1000);
        } else if (msg.includes('INVALID_LOGIN_CREDENTIALS')) {
            const existing = document.getElementById('auth-lockout-banner');
            if (!existing) {
                const banner = document.createElement('div');
                banner.id = 'auth-lockout-banner';
                banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:14px 20px;font-size:14px;font-weight:600;';
                banner.innerHTML = '⚠️ بيانات اعتماد Firebase Auth غير صحيحة (FS_ADMIN_EMAIL / FS_ADMIN_PASS). تحقق من admin.html.';
                document.body.prepend(banner);
            }
        } else {
            toast('خطأ في تحميل البيانات: ' + (msg || 'unknown'), true);
        }
    }
}

// ══════════════════════════════════════════════════════════════
//  SECURITY MONITOR — Hack Detection
//  Runs after every loadAllData() to detect tampering
// ══════════════════════════════════════════════════════════════

let _secBaseline = null;   // established on first load after login

function _secHash(obj) {
    // Simple deterministic hash of a JSON object for change detection
    const str = JSON.stringify(obj, Object.keys(obj||{}).sort());
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
}

async function runSecurityChecks() {
    try {
        const RTDB_B = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

        // ── Fetch current state ───────────────────────────────────
        const [settingsResp, adminsResp, usersPointsResp] = await Promise.all([
            fetch(`${RTDB_B}/settings.json`).then(r=>r.json()).catch(()=>undefined),
            fetch(`${RTDB_B}/adminUsers.json`).then(r=>r.json()).catch(()=>undefined),
            fetch(`${RTDB_B}/users.json`).then(r=>r.json()).catch(()=>undefined),
        ]);

        // A transient network hiccup, a rate-limited request, or a brief
        // Firebase blip returns `undefined` here (fetch threw). Treating
        // that as "0 admins" or "settings changed" produces false-positive
        // breach alerts that flip back on the next successful poll. Skip
        // this cycle entirely rather than compare against a broken read.
        if (settingsResp === undefined || adminsResp === undefined || usersPointsResp === undefined) {
            console.warn('[Security] Skipped this cycle — one or more reads failed (likely transient).');
            return;
        }

        const now = {
            settingsHash:  _secHash(settingsResp),
            adminCount:    Object.keys(adminsResp||{}).length,
            adminKeys:     Object.keys(adminsResp||{}).sort().join(','),
            userPoints:    {},
        };

        // Build points map
        if (usersPointsResp && typeof usersPointsResp === 'object') {
            Object.entries(usersPointsResp).forEach(([uid, data]) => {
                if (data?.points) now.userPoints[uid] = data.points;
            });
        }

        // ── First run: establish baseline ─────────────────────────
        if (!_secBaseline) {
            _secBaseline = { ...now };
            console.log('[Security] Baseline established. Admins:', now.adminCount, '| Settings hash:', now.settingsHash);
            return;
        }

        const alerts = [];

        // ── Check 1: Settings changed ─────────────────────────────
        if (now.settingsHash !== _secBaseline.settingsHash) {
            alerts.push({
                level: 'critical',
                icon:  '⚙️',
                title: 'تغيّرت إعدادات النظام',
                msg:   'تم تعديل settings في Firebase بشكل غير متوقع. قد يكون شخص ما غيّر الأسعار أو حالة المتاجر.',
                action: 'راجع Firestore → settings فوراً',
            });
            _secBaseline.settingsHash = now.settingsHash; // update to avoid repeated alerts
        }

        // ── Check 2: Admin accounts changed ──────────────────────
        if (now.adminCount !== _secBaseline.adminCount || now.adminKeys !== _secBaseline.adminKeys) {
            const added   = now.adminCount > _secBaseline.adminCount;
            const removed = now.adminCount < _secBaseline.adminCount;
            alerts.push({
                level: 'critical',
                icon:  '👤',
                title: added ? '⛔ تمت إضافة مدير جديد!' : '⚠️ تم حذف مدير!',
                msg:   added
                    ? `عدد المديرين تغيّر من ${_secBaseline.adminCount} إلى ${now.adminCount}. تحقق من adminUsers في RTDB فوراً.`
                    : `عدد المديرين تغيّر من ${_secBaseline.adminCount} إلى ${now.adminCount}.`,
                action: 'افتح RTDB → adminUsers وتحقق',
            });
            _secBaseline.adminCount = now.adminCount;
            _secBaseline.adminKeys  = now.adminKeys;
        }

        // ── Check 3: Suspicious points spike ─────────────────────
        Object.entries(now.userPoints).forEach(([uid, pts]) => {
            const prev = _secBaseline.userPoints[uid] || 0;
            const diff = pts - prev;
            if (diff > 100) {
                const user = allUsers[uid];
                const name = user?.displayName || user?.username || uid;
                alerts.push({
                    level: 'warning',
                    icon:  '⭐',
                    title: `نقاط مشبوهة — ${name}`,
                    msg:   `نقاط ${name} ارتفعت من ${prev} إلى ${pts} (+${diff}) دفعة واحدة. قد يكون تلاعب.`,
                    action: `افتح RTDB → users → ${uid} → points`,
                });
            }
        });
        _secBaseline.userPoints = { ...now.userPoints };

        // ── Show alerts ───────────────────────────────────────────
        alerts.forEach(alert => {
            const isCritical = alert.level === 'critical';
            console.error(`[Security ${alert.level.toUpperCase()}]`, alert.title, '|', alert.msg);

            // ── Archive to RTDB security log ──────────────────────────
            secLogWrite(alert);

            // Toast
            toast(`${alert.icon} ${alert.title}`, isCritical);

            // Persistent banner for critical alerts
            if (isCritical) {
                const bannerId = 'sec-alert-' + Math.random().toString(36).slice(2,7);
                const banner   = document.createElement('div');
                banner.id      = bannerId;
                banner.style.cssText = `position:fixed;top:${48 + document.querySelectorAll('[id^="sec-alert-"]').length * 72}px;left:50%;transform:translateX(-50%);
                    z-index:99998;background:#1a0a0a;border:2px solid #ef4444;border-radius:12px;
                    padding:14px 18px;max-width:480px;width:calc(100% - 32px);
                    box-shadow:0 8px 32px rgba(239,68,68,.3);animation:slideDown .3s ease;`;
                banner.innerHTML = `
                    <div style="display:flex;align-items:flex-start;gap:12px;">
                        <span style="font-size:24px;flex-shrink:0;">${alert.icon}</span>
                        <div style="flex:1;">
                            <div style="color:#ef4444;font-weight:800;font-size:14px;margin-bottom:4px;">${alert.title}</div>
                            <div style="color:#fca5a5;font-size:12.5px;line-height:1.5;">${alert.msg}</div>
                            <div style="color:#f87171;font-size:11.5px;margin-top:6px;font-weight:700;">🔍 ${alert.action}</div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                            <button onclick="document.getElementById('${bannerId}').remove()"
                                style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:700;">✕ إخفاء</button>
                            <button onclick="bkQuickBackup()"
                                style="background:rgba(239,68,68,.2);color:#ef4444;border:1px solid rgba(239,68,68,.4);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:700;">💾 Backup</button>
                            <button onclick="switchPanel('backup')"
                                style="background:rgba(239,68,68,.1);color:#fca5a5;border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:700;">📋 السجل</button>
                        </div>
                    </div>`;
                document.body.appendChild(banner);
                // Auto-dismiss so banners don't stack up forever if left unattended
                setTimeout(() => {
                    const b = document.getElementById(bannerId);
                    if (b) b.remove();
                }, 30000);
            }
        });

    } catch(e) {
        console.warn('[Security] Check failed:', e.message);
    }
}

// ── Security Log — persisted in RTDB ─────────────────────────
const SEC_LOG_PATH = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com/securityLog';
const SEC_LOG_MAX  = 200; // keep last 200 entries

async function secLogWrite(alert) {
    try {
        const entry = {
            ts:      new Date().toISOString(),
            level:   alert.level,
            icon:    alert.icon,
            title:   alert.title,
            msg:     alert.msg,
            action:  alert.action || '',
            admin:   currentAdmin?.username || 'admin',
            read:    false,
        };
        await fetch(`${SEC_LOG_PATH}.json`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(entry),
        });
    } catch(e) {
        console.warn('[SecLog] write failed:', e.message);
    }
}

async function secLogLoad() {
    try {
        const r    = await fetch(`${SEC_LOG_PATH}.json`);
        const data = r.ok ? await r.json() : null;
        if (!data) return [];
        return Object.entries(data)
            .map(([k, v]) => ({ _key: k, ...v }))
            .sort((a, b) => new Date(b.ts) - new Date(a.ts))
            .slice(0, SEC_LOG_MAX);
    } catch(e) { return []; }
}

async function secLogMarkRead(key) {
    try {
        await fetch(`${SEC_LOG_PATH}/${key}/read.json`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    'true',
        });
    } catch(_) {}
}

async function secLogClear() {
    const confirmed = await showConfirm({
        title: '🗑 مسح سجل الأمان',
        msg:   'هل تريد مسح كل سجلات التنبيهات الأمنية؟',
        okLabel: '🗑 مسح', cancelLabel: 'إلغاء', danger: true,
    });
    if (!confirmed) return;
    try {
        await fetch(`${SEC_LOG_PATH}.json`, { method: 'DELETE' });
        toast('✅ تم مسح سجل الأمان');
        renderSecurityLog();
    } catch(e) { toast('❌ فشل المسح: ' + e.message, true); }
}

async function renderSecurityLog() {
    const el = document.getElementById('sec-log-content');
    if (!el) return;
    el.innerHTML = `<div style="color:var(--gray);font-size:13px;text-align:center;padding:20px;">⏳ جاري التحميل...</div>`;

    const entries = await secLogLoad();

    if (!entries.length) {
        el.innerHTML = `<div style="color:var(--gray);font-size:13px;text-align:center;padding:30px;">
            ✅ لا توجد تنبيهات أمنية مسجلة</div>`;
        return;
    }

    // Mark unread count
    const unread = entries.filter(e => !e.read).length;
    const badge  = document.getElementById('sec-log-badge');
    if (badge) badge.textContent = unread ? `${unread} جديد` : '';

    el.innerHTML = entries.map(e => {
        const isCritical = e.level === 'critical';
        const isWarning  = e.level === 'warning';
        const col  = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#9ca3af';
        const bg   = isCritical ? 'rgba(239,68,68,.06)' : isWarning ? 'rgba(245,158,11,.06)' : 'rgba(255,255,255,.03)';
        const date = new Date(e.ts);
        const dateStr = date.toLocaleDateString('ar-LB', { year:'numeric', month:'short', day:'numeric' });
        const timeStr = date.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

        return `<div onclick="secLogMarkRead('${e._key}')" style="
            background:${bg};border:1px solid ${col}33;border-radius:10px;
            padding:12px 14px;margin-bottom:8px;cursor:pointer;
            ${!e.read ? `border-right:3px solid ${col};` : 'opacity:0.7;'}
            transition:opacity .15s;">
            <div style="display:flex;align-items:flex-start;gap:10px;">
                <span style="font-size:20px;flex-shrink:0;">${e.icon}</span>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                        <span style="font-size:13px;font-weight:800;color:${col};">${e.title}</span>
                        ${!e.read ? `<span style="font-size:10px;font-weight:800;color:${col};background:${col}22;border:1px solid ${col}44;border-radius:4px;padding:1px 6px;">جديد</span>` : ''}
                        <span style="font-size:10px;font-weight:700;color:var(--gray);background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:4px;padding:1px 6px;text-transform:uppercase;">${e.level}</span>
                    </div>
                    <div style="font-size:12px;color:var(--gray-light);line-height:1.5;margin-bottom:4px;">${e.msg}</div>
                    ${e.action ? `<div style="font-size:11px;color:${col};font-weight:700;">🔍 ${e.action}</div>` : ''}
                    <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap;">
                        <span style="font-size:10.5px;color:var(--gray);font-family:var(--mono);">📅 ${dateStr}</span>
                        <span style="font-size:10.5px;color:var(--gray);font-family:var(--mono);">🕐 ${timeStr}</span>
                        <span style="font-size:10.5px;color:var(--gray);">👤 ${e.admin || 'admin'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Quick backup triggered from security alert
async function bkQuickBackup() {
    toast('💾 جاري عمل backup سريع...', false);
    await bkExport('all');
}

// Reset baseline (call after intentional settings changes)
function secResetBaseline() {
    _secBaseline = null;
    toast('🔄 Security baseline reset — سيتم إعادة الضبط عند التحديث التالي');
}

// Same effect, no toast — used internally right after fbSet/fbUpdate writes
// to settings/adminUsers so a legitimate save doesn't trip the next security poll.
function _secSilentRebaseline() {
    _secBaseline = null;
}

function updateTopbarStats() {
    const newOrders    = Object.values(allOrders).filter(o => (o.state || '0') === '0').length;
    const onlineDrivers= allDrivers.filter(d => d && d.status === 'online').length;
    const userCount    = Object.keys(allUsers).length;
    document.getElementById('stat-orders').textContent  = newOrders;
    document.getElementById('stat-drivers').textContent = onlineDrivers;
    document.getElementById('stat-users').textContent   = userCount;
}

function updateNavBadge() {
    _setNavBadge('orders',     Object.values(allOrders).filter(o => (o.vault||'0') != 1).length);
    // Same criteria as the "طلبات جديدة" topbar chip (state === new) — this
    // badge previously also required o.read !== '1', which made it drift
    // out of sync with that chip (and with every other nav badge, which
    // are all plain counts with no extra "seen" filter) the moment an
    // order got opened/viewed but hadn't moved past state 0 yet.
    _setNavBadge('online-req', Object.values(allOrders).filter(o => (o.state||'0') === '0').length);
    _setNavBadge('drivers',    (allDrivers || []).filter(d => d).length);
    _setNavBadge('customers',  Object.keys(allUsers || {}).length);
    _setNavBadge('visitors',   Object.values(allVisitors || {}).filter(v => !_isVisitorConverted(v)).length);
    _setNavBadge('stores',     Object.keys(allStores || {}).length);
    _setNavBadge('employees',  Object.keys(adminUsers || {}).length + 1); // +1 for seed super-admin
}

function _setNavBadge(id, count) {
    const badge = document.getElementById(`nav-badge-${id}`);
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

function startAutoRefresh() {

    // ── Real-time driver listener — uses REST polling (db SDK not available) ──

    // Visitors panel gets its own faster, lightweight refresh loop (see
    // _refreshVisitorsLive) — independent of the 12s full-data cycle below,
    // and independent of admin-presence.js's presence-triggered re-render.
    _startVisitorsLiveRefresh();

    // ── Polling interval — full data refresh every 12s ────────
    refreshTimer = setInterval(async () => {
        if (_refreshPaused || _tabHidden || _fsSignInFails >= _FS_MAX_FAILS) return;
        await loadAllData();
        updateTopbarStats();
        updateNavBadge();

        const activePanel = document.querySelector('.panel.active');
        if (!activePanel) return;
        const id = activePanel.id.replace('panel-', '');

        // ── Map ──────────────────────────────────────────────
        if (id === 'map') {
            const lu = document.getElementById('map-last-update');
            if (lu) lu.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar');

            // Snapshot any open popup position BEFORE wiping markers
            let openLat = null, openLng = null, openOrderId = null;
            if (adminMap) {
                adminMap.eachLayer(layer => {
                    if (layer.getPopup && layer.getPopup() && layer.isPopupOpen()) {
                        const ll = layer.getLatLng ? layer.getLatLng() : null;
                        if (ll) { openLat = ll.lat; openLng = ll.lng; }
                        // Also grab single-order ID if present
                        const el = layer.getPopup().getElement();
                        if (el) {
                            const pd = el.querySelector('[data-order-popup-id]');
                            if (pd) openOrderId = pd.dataset.orderPopupId;
                        }
                    }
                });
            }

            renderMap();

            // Re-open the popup on the nearest marker to where it was
            if (openLat !== null) {
                setTimeout(() => {
                    let best = null, bestDist = Infinity;
                    for (const m of [...mapMarkers.orders, ...mapMarkers.drivers, ...mapMarkers.stores]) {
                        if (!m.getLatLng) continue;
                        const ll   = m.getLatLng();
                        const dist = Math.hypot(ll.lat - openLat, ll.lng - openLng);
                        if (dist < bestDist) { bestDist = dist; best = m; }
                    }
                    // Only re-open if the marker is very close (same position)
                    if (best && bestDist < 0.0001) best.openPopup();
                }, 120);
            }

        // ── Orders ───────────────────────────────────────────
        } else if (id === 'orders') {
            const list      = document.getElementById('orders-list');
            const scrollTop = list ? list.scrollTop : 0;
            renderOrders(); // smart diff — preserves expanded state internally
            if (list) requestAnimationFrame(() => { list.scrollTop = scrollTop; });

        // ── Online requests ──────────────────────────────────
        } else if (id === 'online-req') {
            const wrap      = document.getElementById('or-table-wrap');
            const scrollTop = wrap ? wrap.scrollTop : 0;
            await renderOnlineRequests();
            if (wrap) requestAnimationFrame(() => { wrap.scrollTop = scrollTop; });

        // ── Drivers ──────────────────────────────────────────
        } else if (id === 'drivers') {
            _refreshDrivers();

        // ── Customers ────────────────────────────────────────
        } else if (id === 'customers') {
            const wrap      = document.querySelector('.users-table-wrap');
            const scrollTop = wrap ? wrap.scrollTop : 0;
            // Snapshot expanded UUID groups
            const expandedUUIDs = new Set(
                [...document.querySelectorAll('tr[data-sub]')]
                    .filter(r => r.style.display !== 'none')
                    .map(r => r.dataset.sub)
            );
            renderCustomers();
            // Restore expanded groups
            expandedUUIDs.forEach(uuid => {
                document.querySelectorAll(`tr[data-sub="${uuid}"]`).forEach(r => r.style.display = '');
            });
            if (wrap) requestAnimationFrame(() => { wrap.scrollTop = scrollTop; });

        // ── Stores ───────────────────────────────────────────
        } else if (id === 'stores') {
            const grid      = document.getElementById('stores-grid');
            const scrollTop = grid ? grid.scrollTop : 0;

            // If the user is actively typing in any input inside the grid, skip the
            // re-render entirely this cycle — it will run again in 12s once they're done
            const active = document.activeElement;
            if (active && grid && grid.contains(active) &&
                (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                return; // skip this cycle — user is editing
            }

            // Snapshot all input values keyed by store name so they survive the re-render
            const inputSnapshot = {};
            if (grid) {
                grid.querySelectorAll('.store-card-admin').forEach(card => {
                    const storeName = card.querySelector('.sc-name')?.textContent?.trim();
                    if (!storeName) return;
                    inputSnapshot[storeName] = {};

                    // Arabic name field
                    const nameArInput = card.querySelector('.sc-namear-input');
                    if (nameArInput) inputSnapshot[storeName].nameAr = nameArInput.value;

                    // Priority inputs (one per type)
                    card.querySelectorAll('.sc-priority-input').forEach(inp => {
                        inputSnapshot[storeName][`priority_${inp.dataset.ptype}`] = inp.value;
                    });

                    // Meal checkboxes
                    const mealState = {};
                    card.querySelectorAll('.sc-meal-cb').forEach(cb => {
                        mealState[cb.dataset.meal] = cb.checked;
                    });
                    if (Object.keys(mealState).length) inputSnapshot[storeName].meals = mealState;
                });
            }

            await _refreshStoresData();

            // Restore all snapshotted values after re-render
            if (grid && Object.keys(inputSnapshot).length) {
                grid.querySelectorAll('.store-card-admin').forEach(card => {
                    const storeName = card.querySelector('.sc-name')?.textContent?.trim();
                    const snap = storeName && inputSnapshot[storeName];
                    if (!snap) return;

                    if (snap.nameAr !== undefined) {
                        const inp = card.querySelector('.sc-namear-input');
                        if (inp && document.activeElement !== inp) inp.value = snap.nameAr;
                    }
                    card.querySelectorAll('.sc-priority-input').forEach(inp => {
                        const key = `priority_${inp.dataset.ptype}`;
                        if (snap[key] !== undefined && document.activeElement !== inp) inp.value = snap[key];
                    });
                    if (snap.meals) {
                        card.querySelectorAll('.sc-meal-cb').forEach(cb => {
                            if (snap.meals[cb.dataset.meal] !== undefined) cb.checked = snap.meals[cb.dataset.meal];
                        });
                    }
                });
            }

            if (grid) requestAnimationFrame(() => { grid.scrollTop = scrollTop; });
        }

    }, 12000);

    // ── Real-time storeStatus SSE listener (admin) ────────────
    _startAdminStoreStatusSSE();
}

// ── Admin SSE listener for storeStatus — updates cards without polling ──
function _startAdminStoreStatusSSE() {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    let _lastStatus = {};
    let _sse = null;
    let _retryMs = 2000;

    function _applyAdminPatch(storeName, newSt) {
        // Find this store's card in the admin stores-grid
        const grid = document.getElementById('stores-grid');
        if (!grid) return;

        const card = [...grid.querySelectorAll('.store-card-admin')].find(c => {
            const nameEl = c.querySelector('.sc-name');
            return nameEl && nameEl.textContent.trim() === storeName;
        });
        if (!card) return;

        const isClosed = newSt && (newSt.closed === true || newSt.closed === '1' || newSt.closed === 1);
        const closedReason = isClosed ? (newSt.reason || '') : '';
        const opensAt      = isClosed ? (newSt.opensAt || '') : '';

        // Update card class
        card.classList.toggle('sc-closed', isClosed);

        // Update thumb overlay
        const thumb = card.querySelector('.sc-thumb');
        let overlay = card.querySelector('.sc-closed-overlay');
        if (isClosed && !overlay && thumb) {
            overlay = document.createElement('div');
            overlay.className = 'sc-closed-overlay';
            overlay.innerHTML = '<span>🔒</span><span class="sc-closed-lbl">مغلق</span>';
            thumb.appendChild(overlay);
        } else if (!isClosed && overlay) {
            overlay.remove();
        }

        // Update reason and opens-at in body
        const body = card.querySelector('.sc-body');
        if (body) {
            let reasonEl = body.querySelector('.sc-closed-reason');
            let opensEl  = body.querySelector('.sc-opens-at');
            if (isClosed) {
                if (!reasonEl) {
                    reasonEl = document.createElement('div');
                    reasonEl.className = 'sc-closed-reason';
                    body.appendChild(reasonEl);
                }
                reasonEl.textContent = closedReason || 'مغلق مؤقتاً';
                if (opensAt) {
                    if (!opensEl) {
                        opensEl = document.createElement('div');
                        opensEl.className = 'sc-opens-at';
                        body.appendChild(opensEl);
                    }
                    opensEl.innerHTML = _fmtOpensAt(opensAt);
                } else if (opensEl) opensEl.remove();
            } else {
                reasonEl?.remove();
                opensEl?.remove();
            }
        }

        // Update action button
        const btn = card.querySelector('.sc-status-btn');
        if (btn) {
            btn.className = `sc-status-btn ${isClosed ? 'sc-status-btn--open' : 'sc-status-btn--close'}`;
            btn.innerHTML = isClosed
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> فتح المتجر`
                : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إغلاق المتجر`;
            // Re-wire click with new state
            btn.onclick = (e) => {
                e.stopPropagation();
                openCloseStoreModal(storeName, isClosed, closedReason, opensAt);
            };
        }

        // Also update allStores cache
        if (allStores[storeName]) {
            allStores[storeName]._closed        = isClosed;
            allStores[storeName]._closedReason  = closedReason;
            allStores[storeName]._opensAt       = opensAt;
        }
    }

    function _processSnapshot(newStatus) {
        newStatus = newStatus || {};
        const allNames = new Set([...Object.keys(_lastStatus), ...Object.keys(newStatus)]);
        allNames.forEach(name => {
            const oldSt = _lastStatus[name] || null;
            const newSt = newStatus[name]   || null;
            const changed = JSON.stringify(oldSt) !== JSON.stringify(newSt);
            if (changed) _applyAdminPatch(name, newSt);
        });
        _lastStatus = newStatus;
    }

    function _connect() {
        if (_sse) { try { _sse.close(); } catch(_) {} }
        _sse = new EventSource(`${RTDB}/storeStatus.json?accept=text/event-stream`);
        _sse.addEventListener('put', e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.path === '/') {
                    _processSnapshot(msg.data);
                } else {
                    const name = msg.path.replace(/^\//, '');
                    const next = { ..._lastStatus };
                    msg.data === null ? delete next[name] : (next[name] = msg.data);
                    _processSnapshot(next);
                }
                _retryMs = 2000;
            } catch(_) {}
        });
        _sse.onerror = () => {
            _sse.close();
            setTimeout(_connect, _retryMs);
            _retryMs = Math.min(_retryMs * 2, 30000);
        };
    }

    // Fetch initial snapshot then open stream
    fetch(`${RTDB}/storeStatus.json`)
        .then(r => r.json()).then(d => { _lastStatus = d || {}; }).catch(() => {})
        .finally(() => _connect());
}

// Smart drivers refresh — skips re-render if a modal is open to avoid
// closing the edit form mid-edit; otherwise renders and restores scroll
function _refreshDrivers() {
    if (document.querySelector('.modal-overlay.open')) return;
    const grid = document.getElementById('drivers-grid');
    const scrollTop = grid ? grid.scrollTop : 0;
    renderDrivers();
    if (grid) grid.scrollTop = scrollTop;
}




// ── Shared driver-record parser ─────────────────────────────────
// Used by both the full 12s admin refresh (loadAllData) and the
// lightweight 1s marker-only poll below, so both stay in sync with
// the exact same record shape.