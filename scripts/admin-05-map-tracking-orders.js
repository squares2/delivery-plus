function _parseDriversRaw(raw) {
    if (!raw) return [];
    const _raw = Array.isArray(raw)
        ? raw.reduce((acc, v, i) => { acc[String(i)] = v; return acc; }, {})
        : raw;
    return Object.entries(_raw)
        .map(([k, v]) => (v && typeof v === 'object') ? { ...v, _key: k, _isNumeric: /^\d+$/.test(k) } : null)
        .filter(Boolean);
}

// ── Fast driver-position poll (1s) ───────────────────────────────
// Separate from the main 12s startAutoRefresh() loop on purpose: that
// loop reloads ALL admin data (orders, stats, every map layer) and
// would be far too expensive to run every second. This poll only
// fetches the small `drivers` node and repositions driver markers via
// _refreshDriverMarkers() (which already only touches that one layer),
// so the map feels live without hammering Firebase for a full reload.
let _fastDriverPollTimer = null;

function _startFastDriverPoll() {
    if (_fastDriverPollTimer) return;
    // Was 1000ms — a full re-download of the whole `drivers` node every
    // single second is the single biggest RTDB bandwidth line item on
    // the bill (Outgoing Bandwidth from Firebase Realtime Database).
    // 3s still reads as "live" on a delivery map (GPS fixes themselves
    // don't arrive faster than a few seconds anyway) but cuts this
    // poll's bandwidth by ~66%.
    _fastDriverPollTimer = setInterval(async () => {
        // Skip the fetch entirely when nobody's looking at the map —
        // no point polling for marker positions that aren't rendered.
        if (!document.getElementById('panel-map')?.classList.contains('active')) return;
        if (_refreshPaused || (typeof _tabHidden !== 'undefined' && _tabHidden) || _fsSignInFails >= _FS_MAX_FAILS) return;
        try {
            const drivers = await fbGet('drivers');
            allDrivers = _parseDriversRaw(drivers);
            _refreshDriverMarkers();
        } catch (e) { /* silent — next tick retries */ }
    }, 3000);
}

// Shared marker-icon builder — was previously defined only inside
// renderMap(), which meant _refreshDriverMarkers() (a separate top-level
// function) crashed with "mkDiv is not defined" every time it ran on its
// own. That crash mid-loop, right after the old markers were already
// removed, is what caused driver icons to flicker on/off.
function mkDiv(html, size, anchor) {
    return L.divIcon({ html, iconSize: size, iconAnchor: anchor, className: '' });
}

// Shared driver vehicle-type → emoji lookup (VEHICLE_LABELS is declared
// further down in this same script, but by the time this is actually
// *called* — from event handlers / polling intervals — the whole script
// has already run top-to-bottom, so it's safely defined).
// Falls back to the motorcycle emoji for older driver records saved
// before vehicleType existed.
function vehicleEmojiFor(vehicleType) {
    const v = (typeof VEHICLE_LABELS !== 'undefined') && VEHICLE_LABELS[vehicleType];
    return v ? v.emoji : '🛵';
}

function initMap() {
    if (adminMap) return;
    adminMap = L.map('admin-map', { zoomControl: true }).setView([34.003, 36.212], 14);

    // Same standard/satellite pair used everywhere else on the site — the
    // toggle button itself lives in the panel header (#map-toggle-btn),
    // not as a floating map control, since the map's topright corner is
    // already taken by .map-filter-bar.
    const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
    _adminMapStandardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
    });
    _adminMapSatelliteLayer = L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
    );
    _adminMapStandardLayer.addTo(adminMap);
    _adminMapCurrentLayer = 'standard';
}

function toggleAdminMapLayer() {
    if (!adminMap) return;
    const btn = document.getElementById('map-toggle-btn');
    if (_adminMapCurrentLayer === 'standard') {
        adminMap.removeLayer(_adminMapStandardLayer);
        _adminMapSatelliteLayer.addTo(adminMap);
        _adminMapCurrentLayer = 'satellite';
        if (btn) btn.innerHTML = '🗺 خريطة';
    } else {
        adminMap.removeLayer(_adminMapSatelliteLayer);
        _adminMapStandardLayer.addTo(adminMap);
        _adminMapCurrentLayer = 'standard';
        if (btn) btn.innerHTML = '🛰 صورة جوية';
    }
}

// ── Live driver marker refresh (in-place, no flicker) ──────────
// Called by both the 1s fast poll and the 12s full renderMap() refresh —
// single source of truth for driver markers on the map. Keeps a registry
// keyed by driver record so existing markers are just *moved*
// (setLatLng) instead of removed and recreated every call. Removing +
// re-adding a Leaflet marker every single second is what was causing
// driver icons to flicker on/off ("sparking") — this avoids that.
window._driverMarkerRegistry = window._driverMarkerRegistry || {};

function _refreshDriverMarkers() {
    if (!adminMap) return;
    if (!document.getElementById('panel-map').classList.contains('active')) return;

    const registry = window._driverMarkerRegistry;

    // Driver layer toggled off — clear everything and stop.
    if (!mapLayers.drivers) {
        Object.values(registry).forEach(entry => adminMap.removeLayer(entry.marker));
        for (const k in registry) delete registry[k];
        mapMarkers.drivers = [];
        return;
    }

    const labelStyle = 'font-family:Almarai,sans-serif;font-size:11px;font-weight:800;' +
                       'text-align:center;white-space:nowrap;' +
                       'background:rgba(10,10,15,0.85);padding:2px 8px;border-radius:6px;' +
                       'margin-bottom:3px;box-shadow:0 1px 4px rgba(0,0,0,0.5);display:inline-block;';

    const buildIcon = (online, name, vehicleType) => {
        const bgColor = online ? '#22c55e' : '#4b5563';
        const shadow  = online ? 'rgba(34,197,94,0.5)' : 'rgba(0,0,0,0.4)';
        const emoji   = vehicleEmojiFor(vehicleType);
        return mkDiv(
            `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                <div style="${labelStyle}color:${online?'#86efac':'#d1d5db'};">@${name}</div>
                <div style="width:32px;height:32px;border-radius:50%;
                            background:${bgColor};
                            display:flex;align-items:center;justify-content:center;
                            font-size:14px;box-shadow:0 3px 12px ${shadow};
                            border:2.5px solid #fff;">${emoji}</div>
            </div>`,
            null, [16, 50]
        );
    };

    const seenKeys = new Set();

    allDrivers.forEach(d => {
        if (!d || !d.location?.lat || !d._key) return;
        seenKeys.add(d._key);

        const online = d.status === 'online';
        const name   = (online && d._activeUser) ? d._activeUser : (d.owner || d.username || '—');
        const lat    = d.location.lat;
        const lng    = d.location.lng;

        const vehicleType = d.vehicleType;
        const vehicleLabel = (VEHICLE_LABELS[vehicleType] || VEHICLE_LABELS.motorcycle).label;

        const existing = registry[d._key];
        if (existing) {
            // Just move it — cheap, smooth, no removal from the map.
            existing.marker.setLatLng([lat, lng]);
            // Only touch the icon/popup when something visible changed.
            if (existing.online !== online || existing.name !== name || existing.vehicleType !== vehicleType) {
                existing.marker.setIcon(buildIcon(online, name, vehicleType));
                existing.marker.setPopupContent(
                    `<b style="font-family:Almarai">${name}</b><br><small style="color:${online?'#22c55e':'#9ca3af'}">${online?'نشط':'غير نشط'} · ${vehicleEmojiFor(vehicleType)} ${vehicleLabel}</small>`
                );
                existing.online      = online;
                existing.name        = name;
                existing.vehicleType = vehicleType;
            }
        } else {
            // New driver on the map — create once.
            const marker = L.marker([lat, lng], { icon: buildIcon(online, name, vehicleType) })
                .bindPopup(`<b style="font-family:Almarai">${name}</b><br><small style="color:${online?'#22c55e':'#9ca3af'}">${online?'نشط':'غير نشط'} · ${vehicleEmojiFor(vehicleType)} ${vehicleLabel}</small>`)
                .addTo(adminMap);
            registry[d._key] = { marker, online, name, vehicleType };
        }
    });

    // Drop markers for drivers that disappeared (logged out, deleted, lost location).
    Object.keys(registry).forEach(key => {
        if (!seenKeys.has(key)) {
            adminMap.removeLayer(registry[key].marker);
            delete registry[key];
        }
    });

    mapMarkers.drivers = Object.values(registry).map(e => e.marker);
}

// Is this customer currently connected? Checks the live presence sessions
// exposed by admin-presence.js (RTDB /presence, one entry per open tab).
// Matches on uid or username when the session is logged in — but a
// session ALWAYS carries the device's UUID regardless of login state, so
// this also matches on deviceUUID (the account's registered device) to
// catch a customer who's on the site but whose auth state hasn't linked
// to this particular tab's session yet (or who's simply browsing signed
// out on their own registered device).
function _isCustomerOnline(uid, username, deviceUUID) {
    const sessions = window._delivoOnlineSessions;
    if (!sessions) return false;
    return Object.values(sessions).some(s =>
        (uid && s.uid === uid) || (username && s.username === username) || (deviceUUID && s.uuid === deviceUUID)
    );
}

// Most recent known activity for a registered customer — persisted via
// presence.js's _touchCustomerActivity (customerActivity/{uid}/lastActive
// in RTDB, merged into allUsers by loadAllData). Falls back to the
// account's createdAt/timestamp for accounts that have never been
// online since this field was added.
function _customerLastActiveTs(u) {
    if (u && u.lastActive) {
        const t = typeof u.lastActive === 'number' ? u.lastActive : new Date(u.lastActive).getTime();
        if (!isNaN(t)) return t;
    }
    return (u && (u.createdAt || u.timestamp)) || 0;
}

// The 3 most recently registered accounts across the whole platform — used
// to badge "✨ عضو جديد" on both الزوار and العملاء so the admin can spot
// brand-new sign-ups at a glance in either section. Same 3 uids everywhere,
// computed fresh from allUsers on each render (cheap — just a sort of the
// in-memory user list, no extra network call).
function _getTop3RegisteredUids() {
    return Object.entries(allUsers || {})
        .map(([uid, u]) => [uid, (u.createdAt || u.timestamp || 0)])
        .filter(([, ts]) => ts > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([uid]) => uid);
}

function _newRegBadgeHtml() {
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.6rem;font-weight:800;
        background:linear-gradient(135deg, rgba(255,92,0,0.18), rgba(255,184,0,0.18));color:var(--orange);
        border:1px solid rgba(255,92,0,0.35);border-radius:50px;padding:1px 7px;white-space:nowrap;"
        title="من آخر 3 حسابات انضمت إلى Delivo">✨ عضو جديد</span>`;
}

// Best-known "last active" moment for sorting — the live session's
// lastSeen while currently online; otherwise the admin-side cache
// admin-presence.js keeps of the last time each identifier was ever seen
// online during this admin session (survives the customer disconnecting,
// unlike the live session itself); otherwise the persisted lastActive
// (see _customerLastActiveTs). This is what keeps a customer who just
// disconnected ranked by how recently they were here instead of dropping
// straight back to their original signup date.
function _customerLastActive(uid, u, username, deviceUUID) {
    const sessions = window._delivoOnlineSessions || {};
    const session = Object.values(sessions).find(s => s &&
        ((uid && s.uid === uid) || (username && s.username === username) || (deviceUUID && s.uuid === deviceUUID)));
    if (session && session.lastSeen) return session.lastSeen;

    const cache = window._delivoLastSeenCache || {};
    const cached = [uid, username, deviceUUID].map(k => k && cache[k]).find(v => v);
    if (cached) return Math.max(cached, _customerLastActiveTs(u));

    return _customerLastActiveTs(u);
}

// ── Shared order-state colors + popup markup — used by both the main
// live map (renderMap) and the location-picker's "طلبات سابقة" layer,
// so an order's popup looks and behaves identically everywhere it's
// clicked from. ──
const STATE_CLR = {
    '0':{ bg:'#FF5C00', tx:'#fff', lbl:'جديد'      },
    '1':{ bg:'#22c55e', tx:'#fff', lbl:'وُصِّل'     },
    '2':{ bg:'#ef4444', tx:'#fff', lbl:'ملغي'       },
    '3':{ bg:'#f59e0b', tx:'#000', lbl:'متأخر'      },
};
function orderPopupHTML(key, o) {
    const idNum   = key.replace('id_','');
    const state   = o.state || '0';
    const clr     = STATE_CLR[state] || STATE_CLR['0'];
    const drvOpts = allDrivers.filter(d => d && (d.active === true || (o.driver && (d.owner||d.username) === o.driver))).map(d => {
        const name = d.owner || d.username || '';
        const sel  = o.driver === name ? 'selected' : '';
        const dot  = d.status === 'online' ? '🟢' : '⚫';
        const inactiveTag = d.active !== true ? ' (غير مفعّل)' : '';
        return `<option value="${name}" ${sel}>${dot} ${name}${inactiveTag}</option>`;
    }).join('');
    return `
    <div data-order-popup-id="${key}" style="font-family:Almarai;min-width:200px;direction:rtl;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="background:${clr.bg};color:${clr.tx};padding:2px 8px;border-radius:20px;font-size:0.7rem;font-weight:800;">${clr.lbl}</span>
            <b style="font-size:0.95rem">#${idNum}</b>
        </div>
        <div style="font-size:0.8rem;margin-bottom:2px;">🏪 ${o.store || '—'}</div>
        <div style="font-size:0.8rem;margin-bottom:2px;">👤 ${o.fullname || o.username || '—'}</div>
        <div style="font-size:0.8rem;margin-bottom:6px;">💰 <b style="color:#f59e0b">$${o.total || '0'}</b></div>
        <div style="font-size:0.75rem;color:#aaa;margin-bottom:8px;">📅 ${o.date || '—'}</div>
        <div style="border-top:1px solid #333;padding-top:8px;">
            <div style="font-size:0.72rem;color:#aaa;margin-bottom:4px;">تعيين سائق</div>
            <div style="display:flex;gap:4px;align-items:center;">
                <select id="map-drv-${key}" style="flex:1;background:#1a1a2e;border:1px solid #333;
                    border-radius:6px;padding:4px 6px;color:#fff;font-family:Almarai;font-size:0.72rem;">
                    <option value="">— اختر سائقاً —</option>
                    ${drvOpts}
                </select>
                <button onclick="mapAssignDriver('${key}')"
                    style="background:#FF5C00;border:none;color:#fff;padding:4px 10px;
                           border-radius:6px;cursor:pointer;font-family:Almarai;font-size:0.72rem;
                           font-weight:700;white-space:nowrap;">✔ تعيين</button>
            </div>
        </div>
    </div>`;
}

function renderMap() {
    if (!document.getElementById('panel-map').classList.contains('active')) return;
    if (!adminMap) { initMap(); setTimeout(renderMap, 400); return; }
    adminMap.invalidateSize();

    // Clear all layers except drivers — those are now owned entirely by
    // _refreshDriverMarkers() (called below), which updates marker
    // positions in place instead of tearing them down each time. That
    // keeps driver icons from flickering every time this full refresh runs.
    ['stores', 'customers', 'orders', 'center', 'extStores'].forEach(cat => {
        mapMarkers[cat].forEach(m => adminMap.removeLayer(m));
        mapMarkers[cat] = [];
    });

    // ── Shared label style ────────────────────────────────────
    const labelStyle = `
        font-family:'Almarai',sans-serif;font-size:10px;font-weight:800;
        white-space:nowrap;pointer-events:none;
        background:rgba(10,10,15,0.82);color:#f0f0f8;
        padding:2px 6px;border-radius:4px;
        box-shadow:0 1px 4px rgba(0,0,0,0.5);
        position:absolute;left:50%;transform:translateX(-50%);
        bottom:calc(100% + 4px);
    `;

    // ── Delivo Center (HQ) ───────────────────────────────────────
    if (mapLayers.center && deliveryCenterLoc) {
        const icon = mkDiv(
            `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                <div style="${labelStyle}">🏢 مركز Delivo</div>
                <div style="width:32px;height:32px;border-radius:8px;background:#8b5cf6;
                            display:flex;align-items:center;justify-content:center;
                            font-size:15px;box-shadow:0 3px 12px rgba(139,92,246,0.55);
                            border:2px solid rgba(255,255,255,0.4);">🏢</div>
            </div>`,
            null, [16, 46]
        );
        const m = L.marker([deliveryCenterLoc.lat, deliveryCenterLoc.lng], { icon, zIndexOffset: 500 })
            .bindPopup(`<b style="font-family:Almarai">🏢 مركز Delivo (المقر)</b><br><small style="color:#888">نطاق التغطية: ${deliveryRadiusKm} كم</small>`)
            .addTo(adminMap);
        mapMarkers.center.push(m);

        // ── Coverage-radius circle ── orders outside this circle are
        // rejected at checkout (see scripts/cart.js: _checkDeliveryRadius).
        const coverageCircle = L.circle([deliveryCenterLoc.lat, deliveryCenterLoc.lng], {
            radius: deliveryRadiusKm * 1000,
            color: '#8b5cf6',
            weight: 2,
            dashArray: '6,8',
            fillColor: '#8b5cf6',
            fillOpacity: 0.06,
        }).addTo(adminMap);
        mapMarkers.center.push(coverageCircle);
    }

    // ── Stores ────────────────────────────────────────────────
    if (mapLayers.stores) {
        Object.values(allStores).forEach(s => {
            if (!s.lat || !s.lng) return;
            if (s.showOnMap === false) return; // admin hid this store's pin via its "🗺 على الخريطة" toggle
            const icon = mkDiv(
                `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                    <div style="${labelStyle}">${s.companyname}</div>
                    <div style="width:28px;height:28px;border-radius:8px;background:#FF5C00;
                                display:flex;align-items:center;justify-content:center;
                                font-size:13px;box-shadow:0 3px 10px rgba(255,92,0,0.5);
                                border:2px solid rgba(255,255,255,0.3);">🏪</div>
                </div>`,
                null, [14, 42]
            );
            const m = L.marker([s.lat, s.lng], { icon })
                .bindPopup(`<b style="font-family:Almarai">${s.companyname}</b><br><small style="color:#888">${TYPE_LABELS[s.type]||s.type}</small>`)
                .addTo(adminMap);
            mapMarkers.stores.push(m);
        });
    }

    // ── External stores ("متاجر خارجية") ────────────────────────
    // Shown in a distinct blue pin so they're never confused with
    // contracted Delivo stores (orange). Active ones (offered as
    // quick-picks in both "اطلب" flows) are solid blue; inactive
    // ones are muted gray — same color coding as the "متاجر خارجية"
    // panel's own map view.
    if (mapLayers.extStores) {
        Object.entries(allExtStores || {}).forEach(([key, s]) => {
            if (!s || !s.lat || !s.lng) return;
            const t = (typeof esTypeInfo === 'function') ? esTypeInfo(s.type) : { emoji: '🌍' };
            const color = s.active ? '#0ea5e9' : '#6b6b82';
            const icon = mkDiv(
                `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                    <div style="${labelStyle}">${s.name || '—'}</div>
                    <div style="width:28px;height:28px;border-radius:8px;background:${color};
                                display:flex;align-items:center;justify-content:center;
                                font-size:13px;box-shadow:0 3px 10px rgba(14,165,233,0.5);
                                border:2px solid rgba(255,255,255,0.3);">${t.emoji}</div>
                </div>`,
                null, [14, 42]
            );
            const m = L.marker([parseFloat(s.lat), parseFloat(s.lng)], { icon })
                .bindPopup(`<b style="font-family:Almarai">${t.emoji} ${s.name || '—'}</b><br>
                            <small style="color:#888">${s.address || ''}</small><br>
                            <small style="color:${s.active ? '#22c55e' : '#ef4444'};font-weight:700;">${s.active ? '🟢 مفعّل في اطلب' : '⚫ غير مفعّل'}</small>`)
                .addTo(adminMap);
            mapMarkers.extStores.push(m);
        });
    }

    // ── Drivers ───────────────────────────────────────────────
    // Handled by _refreshDriverMarkers() (also driving the 1s fast poll)
    // instead of being rebuilt here, so there's a single source of truth
    // for driver markers and no flicker when this full refresh runs.
    _refreshDriverMarkers();

    // ── Customers (grouped by deviceUUID) ────────────────────
    if (mapLayers.customers) {
        // Render solo users (unique device) and grouped users (multi-account device) separately
        const renderedUUIDs = new Set();

        Object.entries(allUsers).forEach(([uid, u]) => {
            const loc = u.location;
            const lat = parseFloat(loc?.lat ?? loc?.latitude ?? u.lat ?? u.latitude ?? NaN);
            const lng = parseFloat(loc?.lng ?? loc?.longitude ?? u.lng ?? u.longitude ?? NaN);
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

            const uuid    = u.deviceUUID || u._id;
            const peers   = allDeviceGroups[uuid] || [u];
            const isMulti = peers.length > 1;

            // Only render the group once (keyed on uuid)
            if (uuid && renderedUUIDs.has(uuid)) return;
            if (uuid) renderedUUIDs.add(uuid);

            const label  = u.displayName || u.fullname || u.username || '—';
            const online = _isCustomerOnline(uid, u.username, u.deviceUUID);

            if (isMulti) {
                // ── Multi-account marker ──────────────────────────
                const names  = peers.map(p => p.displayName||p.fullname||p.username||'?').join(', ');
                const count  = peers.length;
                const icon = mkDiv(
                    `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                        <div style="${labelStyle}background:rgba(239,68,68,0.92);color:#fff;border:1px solid rgba(255,255,255,0.3);">
                            ⚠️ ${count} حسابات · ${label}
                        </div>
                        <div style="position:relative;width:28px;height:28px;">
                            <div style="width:28px;height:28px;border-radius:50%;background:#ef4444;
                                        display:flex;align-items:center;justify-content:center;
                                        font-size:13px;font-weight:800;color:#fff;
                                        box-shadow:0 0 0 3px rgba(239,68,68,0.35),0 3px 10px rgba(239,68,68,0.5);
                                        border:2px solid #fff;">${count}</div>
                            <div style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;
                                        border-radius:50%;background:#f59e0b;border:2px solid #0a0a0f;"></div>
                        </div>
                    </div>`,
                    null, [14, 52]
                );
                const popupRows = peers.map(p => {
                    const pName = p.displayName||p.fullname||p.username||'—';
                    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
                        <div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;flex-shrink:0;">${pName[0].toUpperCase()}</div>
                        <div>
                            <div style="font-weight:800;font-size:12px;">${pName} <span style="font-weight:600;color:#9ca3af;">@${p.username||'—'}</span></div>
                            <div style="font-size:10px;color:#9ca3af;word-break:break-all;">${p.uid||'—'} · ${p.phone?formatPhone(p.phone):'—'}</div>
                        </div>
                    </div>`;
                }).join('');
                const m = L.marker([lat, lng], { icon })
                    .bindPopup(`
                        <div style="font-family:Almarai;min-width:180px;">
                            <div style="font-size:11px;font-weight:800;color:#ef4444;margin-bottom:6px;">
                                ⚠️ ${count} حسابات على جهاز واحد
                            </div>
                            <div style="font-size:9px;color:#6b6b82;margin-bottom:6px;word-break:break-all;">
                                UUID: ${uuid?.slice(0,16)}…
                            </div>
                            ${popupRows}
                        </div>`, { maxWidth: 260 })
                    .addTo(adminMap);
                mapMarkers.customers.push(m);
            } else {
                // ── Solo marker ───────────────────────────────────
                const dotColor = online ? '#22c55e' : '#3b82f6';
                const icon = mkDiv(
                    `<div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;">
                        <div style="${labelStyle}">${label}</div>
                        <div style="width:22px;height:22px;border-radius:50%;background:${dotColor};
                                    border:2px solid #fff;box-shadow:0 2px 8px ${online ? 'rgba(34,197,94,0.5)' : 'rgba(59,130,246,0.4)'};"></div>
                    </div>`,
                    null, [11, 38]
                );
                const m = L.marker([lat, lng], { icon })
                    .bindPopup(`<b style="font-family:Almarai">${label}</b><br><small style="color:#888">@${u.username||'—'}</small><br><small style="color:${online ? '#22c55e' : '#888'}">${online ? '🟢 متصل الآن' : '⚪ غير متصل'}</small><br><small style="color:#888;word-break:break-all;">${uid} · ${u.phone?formatPhone(u.phone):'—'}</small>`)
                    .addTo(adminMap);
                mapMarkers.customers.push(m);
            }
        });
    }

    // ── Active orders — cluster stacked markers, spider spread ──
    if (mapLayers.orders) {
        // Collect valid active orders
        const activeOrders = [];
        Object.entries(allOrders).forEach(([key, o]) => {
            if (!o.lat || !o.lng) return;
            if (o.vault == 1) return;
            let lat = parseFloat(o.lat), lng = parseFloat(o.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            [lat, lng] = _fixSwappedLatLng(lat, lng);
            activeOrders.push({ key, o, lat, lng });
        });

        // Group by proximity — orders within ~60m radius are clustered
        const CLUSTER_RADIUS = 0.0006; // ~60m in degrees
        const assigned = new Set();
        const clusters = [];

        activeOrders.forEach((item, i) => {
            if (assigned.has(i)) return;
            const group = [item];
            assigned.add(i);
            activeOrders.forEach((other, j) => {
                if (assigned.has(j)) return;
                const dLat = Math.abs(item.lat - other.lat);
                const dLng = Math.abs(item.lng - other.lng);
                if (dLat < CLUSTER_RADIUS && dLng < CLUSTER_RADIUS) {
                    group.push(other);
                    assigned.add(j);
                }
            });
            clusters.push(group);
        });

        // ── State colors + popup markup now shared at module scope
        // (STATE_CLR / orderPopupHTML) — reused as-is here. ──

        clusters.forEach(group => {
            const centerLat = group.reduce((s, g) => s + g.lat, 0) / group.length;
            const centerLng = group.reduce((s, g) => s + g.lng, 0) / group.length;

            if (group.length === 1) {
                const { key, o, lat, lng } = group[0];
                const state = o.state || '0';
                const clr   = STATE_CLR[state] || STATE_CLR['0'];
                const idNum = key.replace('id_','');
                const icon  = mkDiv(
                    `<div style="background:${clr.bg};color:${clr.tx};font-weight:800;font-size:0.62rem;
                                 padding:3px 7px;border-radius:50px;white-space:nowrap;
                                 box-shadow:0 2px 8px ${clr.bg}88;font-family:Almarai;
                                 border:1.5px solid rgba(255,255,255,0.35);">#${idNum}</div>`,
                    null, [0, 0]
                );
                const m = L.marker([lat, lng], { icon })
                    .bindPopup(orderPopupHTML(key, o), { maxWidth: 240 })
                    .addTo(adminMap);
                mapMarkers.orders.push(m);

            } else {
                // Cluster badge — count with mixed-state color (use dominant state)
                const dominant = group.reduce((acc, {o}) => {
                    const s = o.state||'0'; acc[s] = (acc[s]||0)+1; return acc;
                }, {});
                const domState = Object.entries(dominant).sort((a,b)=>b[1]-a[1])[0][0];
                const clr = STATE_CLR[domState] || STATE_CLR['0'];

                const clusterIcon = mkDiv(
                    `<div style="background:${clr.bg};color:${clr.tx};font-weight:900;font-size:0.72rem;
                                 width:28px;height:28px;border-radius:50%;display:flex;
                                 align-items:center;justify-content:center;
                                 box-shadow:0 2px 12px ${clr.bg}99;font-family:Almarai;
                                 border:2px solid rgba(255,255,255,0.5);">${group.length}</div>`,
                    null, [14, 14]
                );
                const listHTML = group.map(({key, o}) => {
                    const s = o.state||'0';
                    const c = STATE_CLR[s]||STATE_CLR['0'];
                    return `<div style="border-bottom:1px solid #2a2a3a;padding:5px 0;font-size:0.78rem;">
                        <span style="background:${c.bg};color:${c.tx};padding:1px 6px;border-radius:10px;font-size:0.62rem;font-weight:800;margin-left:4px;">${c.lbl}</span>
                        <b>#${key.replace('id_','')}</b> · ${o.store}<br>
                        <small style="color:#aaa">${o.fullname} · <span style="color:#f59e0b">$${o.total}</span></small>
                    </div>`;
                }).join('');
                const cm = L.marker([centerLat, centerLng], { icon: clusterIcon })
                    .bindPopup(`<div style="font-family:Almarai;min-width:200px;max-height:240px;overflow-y:auto;direction:rtl;">
                        <b style="color:#f59e0b;font-size:0.82rem;">${group.length} طلبات في نفس الموقع</b>
                        ${listHTML}
                    </div>`, { maxWidth: 260 })
                    .addTo(adminMap);
                mapMarkers.orders.push(cm);

                // Spider: spread with state color per marker
                const SPREAD = 0.0008;
                group.forEach(({ key, o }, idx) => {
                    const angle = (2 * Math.PI * idx) / group.length - Math.PI / 2;
                    const sLat  = centerLat + SPREAD * Math.cos(angle);
                    const sLng  = centerLng + SPREAD * Math.sin(angle) * 1.5;
                    const state = o.state || '0';
                    const clr   = STATE_CLR[state] || STATE_CLR['0'];
                    const idNum = key.replace('id_','');
                    const icon  = mkDiv(
                        `<div style="background:${clr.bg};color:${clr.tx};font-weight:800;font-size:0.6rem;
                                     padding:2px 6px;border-radius:50px;white-space:nowrap;
                                     box-shadow:0 2px 6px ${clr.bg}88;font-family:Almarai;
                                     border:1px solid rgba(255,255,255,0.4);">#${idNum}</div>`,
                        null, [0, 0]
                    );
                    const m = L.marker([sLat, sLng], { icon })
                        .bindPopup(orderPopupHTML(key, o), { maxWidth: 240 })
                        .addTo(adminMap);
                    mapMarkers.orders.push(m);
                });
            }
        });
    }

    // ── Map: assign driver from popup ──────────────────────────
    window.mapAssignDriver = async function(orderId) {
        const sel = document.getElementById(`map-drv-${orderId}`);
        if (!sel || !sel.value) { showNotif('اختر سائقاً أولاً', '', 'warning'); return; }
        await assignDriver(orderId, sel.value);
        adminMap.closePopup();
        renderMap(); // refresh markers
    };

    // ── Driver ↔ Order connection lines ──────────────────────
    // Draw after all markers so lines sit below them visually.
    // Each online driver gets a unique color; lines pulse via CSS animation.

    // Remove any previous connection layers
    if (window._driverLines) {
        window._driverLines.forEach(l => adminMap.removeLayer(l));
    }
    window._driverLines = [];

    // Inject pulse keyframes once
    if (!document.getElementById('drv-line-style')) {
        const s = document.createElement('style');
        s.id = 'drv-line-style';
        s.textContent = `
            @keyframes drvPulse {
                0%,100% { opacity: 0.85; }
                50%      { opacity: 0.25; }
            }
            .drv-connection-line path {
                animation: drvPulse 1.6s ease-in-out infinite;
            }
            .drv-mid-badge {
                background: rgba(10,10,20,0.88);
                border-radius: 50px;
                padding: 2px 7px;
                font-size: 9px;
                font-weight: 800;
                white-space: nowrap;
                font-family: 'Almarai', sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                border: 1.5px solid;
                pointer-events: none;
            }
        `;
        document.head.appendChild(s);
    }

    // Palette — one distinct color per driver slot
    const LINE_PALETTE = [
        '#22c55e', '#3b82f6', '#a855f7', '#f59e0b',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316',
    ];

    // Build driver → location map (online only)
    const driverLocMap = {};
    allDrivers.forEach((d, idx) => {
        if (!d || !d.location?.lat || d.status !== 'online') return;
        const name = (d._activeUser) ? d._activeUser : (d.owner || d.username || '');
        if (!name) return;
        driverLocMap[name] = {
            lat:   d.location.lat,
            lng:   d.location.lng,
            color: LINE_PALETTE[idx % LINE_PALETTE.length],
            name,
            vehicleType: d.vehicleType,
        };
    });

    // Group active (non-vaulted, non-final) orders by assigned driver
    const driverOrders = {}; // driverName → [{ lat, lng, key, o }]
    Object.entries(allOrders).forEach(([key, o]) => {
        if (!o.driver || o.driver === '0') return;
        if (o.vault == 1) return;
        if (['1','2'].includes(o.state || '0')) return;
        if (!o.lat || !o.lng) return;
        const lat = parseFloat(o.lat), lng = parseFloat(o.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        if (!driverOrders[o.driver]) driverOrders[o.driver] = [];
        driverOrders[o.driver].push({ lat, lng, key, o });
    });

    // Draw lines
    Object.entries(driverOrders).forEach(([driverName, orders]) => {
        const drv = driverLocMap[driverName];
        if (!drv) return; // driver offline or no location

        orders.forEach(({ lat, lng, key, o }) => {
            // Dashed polyline driver → order
            const line = L.polyline(
                [[drv.lat, drv.lng], [lat, lng]],
                {
                    color:     drv.color,
                    weight:    2.5,
                    opacity:   0.85,
                    dashArray: '7, 7',
                    className: 'drv-connection-line',
                }
            ).addTo(adminMap);
            window._driverLines.push(line);

            // Midpoint badge: driver name + order id
            const midLat  = (drv.lat + lat) / 2;
            const midLng  = (drv.lng + lng) / 2;
            const badgeIcon = L.divIcon({
                className: '',
                html: `<div class="drv-mid-badge" style="color:${drv.color};border-color:${drv.color}33;">
                           ${vehicleEmojiFor(drv.vehicleType)} ${drv.name} → #${key.replace('id_','')}
                       </div>`,
                iconSize:   null,
                iconAnchor: [0, 10],
            });
            const badge = L.marker([midLat, midLng], { icon: badgeIcon, interactive: false })
                .addTo(adminMap);
            window._driverLines.push(badge);

            // Glowing dot at the order pin to match driver color
            const dotIcon = L.divIcon({
                className: '',
                html: `<div style="width:10px;height:10px;border-radius:50%;
                                   background:${drv.color};
                                   box-shadow:0 0 0 3px ${drv.color}44,0 0 8px ${drv.color}88;
                                   animation:drvPulse 1.6s ease-in-out infinite;">
                       </div>`,
                iconSize:   [10, 10],
                iconAnchor: [5, 5],
            });
            const dot = L.marker([lat, lng], { icon: dotIcon, interactive: false, zIndexOffset: -10 })
                .addTo(adminMap);
            window._driverLines.push(dot);
        });
    });

    // ── Delivery price-tier coverage rings (opt-in via the 💰 toggle) ──
    _renderPriceTierRings();
}

// ═══════════════════════════════════════════════════════════════
// DISTANCE MEASUREMENT TOOL — click two points on the map to see the
// road route between them (via OSRM) and its distance. Falls back to
// a straight-line geodesic distance if the routing service can't be
// reached (offline admin, blocked network, etc.) so it's still usable.
// ═══════════════════════════════════════════════════════════════
let _measureActive       = false;
let _measurePoints       = [];   // [{lat,lng}, {lat,lng}]
let _measureMarkers      = [];   // Leaflet markers for the two points
let _measureLine         = null; // Leaflet polyline (route or straight fallback)
let _measureClickHandler = null;

function toggleMeasureMode() {
    _measureActive ? _exitMeasureMode() : _enterMeasureMode();
}

function _enterMeasureMode() {
    if (!adminMap) return;
    _measureActive = true;
    _clearMeasure();
    const btn = document.getElementById('map-measure-btn');
    if (btn) btn.classList.add('ph-btn--primary');
    const panel = document.getElementById('map-measure-panel');
    if (panel) panel.style.display = 'flex';
    _setMeasureHint('📍 اضغط على الخريطة لتحديد نقطة الانطلاق');
    adminMap.getContainer().style.cursor = 'crosshair';
    _measureClickHandler = (e) => _onMeasureMapClick(e.latlng);
    adminMap.on('click', _measureClickHandler);
}

function _exitMeasureMode() {
    _measureActive = false;
    const btn = document.getElementById('map-measure-btn');
    if (btn) btn.classList.remove('ph-btn--primary');
    if (adminMap) {
        adminMap.getContainer().style.cursor = '';
        if (_measureClickHandler) adminMap.off('click', _measureClickHandler);
    }
    _measureClickHandler = null;
    const panel = document.getElementById('map-measure-panel');
    if (panel) panel.style.display = 'none';
    _clearMeasure();
}

function _clearMeasure() {
    _measureMarkers.forEach(m => adminMap.removeLayer(m));
    _measureMarkers = [];
    if (_measureLine) { adminMap.removeLayer(_measureLine); _measureLine = null; }
    _measurePoints = [];
    const resultEl = document.getElementById('map-measure-result');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
}

function _setMeasureHint(text) {
    const hint = document.getElementById('map-measure-hint');
    if (!hint) return;
    if (!text) { hint.style.display = 'none'; return; }
    hint.style.display = 'block';
    hint.textContent = text;
}

function _onMeasureMapClick(latlng) {
    // A completed measurement is already showing — a third click starts over.
    if (_measurePoints.length >= 2) {
        _clearMeasure();
        _setMeasureHint('📍 اضغط على الخريطة لتحديد نقطة الانطلاق');
    }

    const isFirst = _measurePoints.length === 0;
    _measurePoints.push({ lat: latlng.lat, lng: latlng.lng });

    const marker = L.marker(latlng, {
        draggable: true,
        icon: mkDiv(
            `<div style="width:26px;height:26px;border-radius:50%;background:${isFirst ? '#22c55e' : '#ef4444'};
                        display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:12px;
                        box-shadow:0 3px 10px rgba(0,0,0,0.4);border:2px solid #fff;">${isFirst ? 'A' : 'B'}</div>`,
            null, [13, 13]
        ),
    }).addTo(adminMap);

    marker.on('dragend', () => {
        const idx = _measureMarkers.indexOf(marker);
        if (idx === -1) return;
        const ll = marker.getLatLng();
        _measurePoints[idx] = { lat: ll.lat, lng: ll.lng };
        if (_measurePoints.length === 2) _computeMeasureRoute();
    });

    _measureMarkers.push(marker);

    if (isFirst) {
        _setMeasureHint('🎯 والآن اضغط لتحديد الوجهة');
    } else {
        _setMeasureHint('');
        _computeMeasureRoute();
    }
}

// Great-circle distance in km — used only as the fallback when the live
// routing service can't be reached.
function _haversineKm(a, b) {
    const R    = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s    = Math.sin(dLat / 2) ** 2
               + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function _computeMeasureRoute() {
    if (_measurePoints.length !== 2) return;
    const [a, b] = _measurePoints;
    if (_measureLine) { adminMap.removeLayer(_measureLine); _measureLine = null; }

    const resultEl = document.getElementById('map-measure-result');
    if (resultEl) { resultEl.style.display = 'block'; resultEl.innerHTML = '⏳ جارِ حساب المسار…'; }

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('routing failed');
        const data  = await res.json();
        const route = data && data.routes && data.routes[0];
        if (!route) throw new Error('no route');

        const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        _measureLine = L.polyline(latlngs, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(adminMap);
        adminMap.fitBounds(_measureLine.getBounds(), { padding: [70, 70] });

        const km  = (route.distance / 1000).toFixed(2);
        const min = Math.round(route.duration / 60);
        if (resultEl) resultEl.innerHTML = `🛣️ مسافة الطريق: <b>${km} كم</b> · ⏱ ${min} د تقريباً`;
    } catch (_) {
        // Routing service unreachable — straight geodesic line instead,
        // clearly labeled so it's never mistaken for an actual route.
        _measureLine = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: '#9ca3af', weight: 3, dashArray: '6,8', opacity: 0.9,
        }).addTo(adminMap);
        adminMap.fitBounds(_measureLine.getBounds(), { padding: [70, 70] });

        const km = _haversineKm(a, b).toFixed(2);
        if (resultEl) {
            resultEl.innerHTML = `📏 مسافة خط مستقيم: <b>${km} كم</b> <span style="color:var(--gray);">(تعذّر جلب مسار الطريق)</span>`;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// DELIVERY PRICE-TIER COVERAGE RINGS — visualizes settings/smartDelivery
// .centerTiers (distance-from-center pricing bands) directly on the map,
// toggled via the 💰 شرائح الأسعار switch in the panel header.
// ═══════════════════════════════════════════════════════════════
let _priceTiersData = null; // cached settings/smartDelivery.centerTiers
const _PRICE_TIER_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4'];

async function _loadPriceTiersData(force) {
    if (_priceTiersData && !force) return _priceTiersData;
    try {
        const cfg = await fbGet('settings/smartDelivery');
        _priceTiersData = (cfg && Array.isArray(cfg.centerTiers)) ? cfg.centerTiers : [];
    } catch (_) {
        _priceTiersData = [];
    }
    return _priceTiersData;
}

function _fmtLbp(n) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    return Math.round(num).toLocaleString('en-US') + ' ل.ل';
}

async function toggleMapPriceTiers(checked) {
    mapLayers.priceTiers = checked;
    if (checked) await _loadPriceTiersData();
    renderMap();
}

function _renderPriceTierRings() {
    if (!adminMap) return;
    mapMarkers.priceTiers.forEach(m => adminMap.removeLayer(m));
    mapMarkers.priceTiers = [];

    if (!mapLayers.priceTiers || !deliveryCenterLoc || !_priceTiersData || !_priceTiersData.length) return;

    const sorted = [..._priceTiersData].sort((a, b) => parseFloat(a.fromKm || 0) - parseFloat(b.fromKm || 0));

    // Draw the largest ring first so the smaller ones sit visually on top
    // (otherwise a big fill would cover the smaller rings entirely).
    [...sorted].reverse().forEach((t) => {
        const idx    = sorted.indexOf(t);
        const fromKm = parseFloat(t.fromKm || 0);
        const hasTo  = t.toKm !== undefined && t.toKm !== null && t.toKm !== '';
        // Last "and above" tier has no outer bound — draw it 2km past its
        // own start just so it's visible on the map as a dashed ring.
        const toKm   = hasTo ? parseFloat(t.toKm) : fromKm + 2;
        const color  = _PRICE_TIER_COLORS[idx % _PRICE_TIER_COLORS.length];

        const circle = L.circle([deliveryCenterLoc.lat, deliveryCenterLoc.lng], {
            radius: toKm * 1000,
            color, weight: 2, dashArray: '5,6',
            fillColor: color, fillOpacity: 0.05,
        }).addTo(adminMap);
        mapMarkers.priceTiers.push(circle);

        // Label anchored at the top edge of THIS ring (not dead-center,
        // where every ring's label would stack on top of each other).
        const labelLat = deliveryCenterLoc.lat + (toKm / 111.32);
        const rangeLabel = hasTo ? `${fromKm}–${toKm} كم` : `${fromKm}+ كم`;
        const labelIcon = L.divIcon({
            className: '', html: '', iconSize: [0, 0],
        });
        const labelMarker = L.marker([labelLat, deliveryCenterLoc.lng], { icon: labelIcon, interactive: false })
            .bindTooltip(`${rangeLabel} · ${_fmtLbp(t.fee)}`, {
                permanent: true, direction: 'top', className: 'price-tier-tooltip', offset: [0, 0],
            })
            .addTo(adminMap);
        mapMarkers.priceTiers.push(labelMarker);
    });
}

// ═══════════════════════════════════════════════════════════════
// ORDERS PANEL
// ═══════════════════════════════════════════════════════════════
const STATE_LABELS = { '0':'جديد','1':'وُصِّل','2':'ملغي','3':'متأخر','6':'استُلم','7':'قيد التحضير','8':'جاهز ✓' };

let _orderCardSnapshots = {}; // orderKey -> last-rendered JSON, avoids needless card rebuilds

// order.date is saved at checkout as "Y-M-D H:MM:SS" (no zero-padding —
// see scripts/cart.js's dateStr). Parsed into a real Date for the date
// filter's day-range comparisons below.
// Also handles the legacy "DD/MM/YYYY HH:MM:SS" format that the manual
// "اطلب" order tool used before it was aligned to the same format above —
// older manual orders already saved with slashes still need to filter.
function _parseOrderDate(order) {
    if (!order?.date) return null;
    const [datePart, timePart] = order.date.split(' ');
    if (!datePart) return null;

    let y, m, d;
    if (datePart.includes('/')) {
        // legacy manual-order format: DD/MM/YYYY
        [d, m, y] = datePart.split('/').map(Number);
    } else {
        [y, m, d] = datePart.split('-').map(Number);
    }
    if (!y || !m || !d) return null;

    let h = 0, mi = 0, s = 0;
    if (timePart) {
        const parts = timePart.split(':').map(Number);
        h = parts[0] || 0; mi = parts[1] || 0; s = parts[2] || 0;
    }
    const dt = new Date(y, m - 1, d, h, mi, s);
    return isNaN(dt.getTime()) ? null : dt;
}

// Does this order's date fall inside a given date-filter selection?
// Ranges are day-based (local time), anchored to Delivo's 4 AM
// business-day cutover (see bizDayStart() in admin-04) rather than
// midnight — so "اليوم" at 2 AM still means "yesterday's business
// day" the way the company itself would count it, not the literal
// calendar date. Shared by both the main "الطلبات" panel and the
// "طلبات أونلاين" panel, each with its own independent filter/from/to
// state.
function _dateFilterMatches(order, filterVal, fromVal, toVal) {
    if (filterVal === 'all') return true;
    const od = _parseOrderDate(order);
    if (!od) return false;

    const startOfToday = bizDayStart();

    switch (filterVal) {
        case 'today':
            return od >= startOfToday;
        case 'yesterday': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 1);
            return od >= start && od < startOfToday;
        }
        case '7d': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 6);
            return od >= start;
        }
        case '30d': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 29);
            return od >= start;
        }
        case 'month':
            return od >= new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1, BIZ_DAY_START_HOUR);
        case 'custom': {
            if (fromVal) {
                const from = new Date(fromVal + 'T00:00:00');
                if (od < from) return false;
            }
            if (toVal) {
                const to = new Date(toVal + 'T23:59:59');
                if (od > to) return false;
            }
            return true;
        }
        default:
            return true;
    }
}

function _orderMatchesDateFilter(order) {
    return _dateFilterMatches(order, orderDateFilter, orderDateFrom, orderDateTo);
}

function _onlineOrderMatchesDateFilter(order) {
    return _dateFilterMatches(order, onlineOrderDateFilter, onlineOrderDateFrom, onlineOrderDateTo);
}

// Bulk archive — archives every order currently matching the active
// filters (state pill, date range, search box) in one shot, so the
// admin doesn't have to press "📦 أرشفة" on each order individually.
// Deliberately scoped to whatever's currently filtered/visible rather
// than literally every order in the database — that lets the admin
// narrow to e.g. "🟢 وُصِّل" + a date range first, so new/pending
// orders are never swept up by accident. Already-archived orders are
// always excluded regardless of filter. Archiving is non-destructive —
// archived orders still count normally everywhere else in the app.
async function archiveAllFilteredOrders() {
    if (orderFilter === 'archived') {
        toast('هذه القائمة تعرض الطلبات المؤرشفة فعلاً');
        return;
    }

    const targets = Object.entries(allOrders).filter(([, o]) => {
        if (o.vault == 1) return false; // already archived
        if (orderFilter !== 'all' && (o.state||'0') !== orderFilter) return false;
        if (!_orderMatchesDateFilter(o)) return false;
        if (orderSearch) {
            const q = orderSearch.toLowerCase();
            if (!(o.fullname||'').toLowerCase().includes(q) &&
                !(o.store||'').toLowerCase().includes(q) &&
                !(o.username||'').toLowerCase().includes(q)) return false;
        }
        return true;
    });

    if (!targets.length) {
        toast('لا توجد طلبات لأرشفتها ضمن الفلتر الحالي');
        return;
    }

    const ok = await showConfirm({
        title: 'أرشفة جماعية',
        msg: `سيتم أرشفة <b>${targets.length}</b> طلب ضمن الفلتر الحالي (${orderFilter === 'all' ? 'كل الحالات' : 'الحالة المحددة'}). هذا لا يحذف أي بيانات ويمكن استعادة كل طلب لاحقاً من قائمة "📦 مؤرشف". متابعة؟`,
        type: 'danger',
        icon: '📦',
        okLabel: 'أرشفة الكل',
        cancelLabel: 'إلغاء',
    });
    if (!ok) return;

    try {
        const updates = {};
        targets.forEach(([key, order]) => {
            const uid = order?.delivryplusid;
            updates[`/requests/${key}/vault`] = '1';
            if (uid) updates[`/historyRequests/${uid}/${key}/vault`] = '1';
            order.vault = '1';
        });
        await fbUpdate('', updates);
        toast(`📦 تم أرشفة ${targets.length} طلب`);
        renderOrders();
        renderMap();
    } catch (e) {
        console.error('[Admin] archiveAllFilteredOrders failed:', e);
        toast('خطأ في الأرشفة الجماعية', true);
    }
}
const _archiveAllBtn = document.getElementById('archive-all-orders-btn');
if (_archiveAllBtn) _archiveAllBtn.addEventListener('click', archiveAllFilteredOrders);

function renderOrders() {
    fetchCompanyVars(); // fire-and-forget — populates the cached companyVars used below
    const list    = document.getElementById('orders-list');
    const emptyEl = document.getElementById('orders-empty');
    const countEl = document.getElementById('orders-count-label');

    const entries = Object.entries(allOrders)
        .sort(([a, oa], [b, ob]) => {
            if (orderSort === 'date') {
                const da = _parseOrderDate(oa)?.getTime() || 0;
                const db = _parseOrderDate(ob)?.getTime() || 0;
                if (db !== da) return db - da; // newest date first
                // Tie-break on order number so same-timestamp orders don't jitter
            }
            return (parseInt(b.replace('id_',''))||0) - (parseInt(a.replace('id_',''))||0);
        })
        .filter(([,o]) => {
            const isClosed = (o.vault == 1);
            if (orderFilter === 'archived') {
                if (!isClosed) return false;
            } else {
                if (isClosed) return false;
                if (orderFilter !== 'all' && (o.state||'0') !== orderFilter) return false;
            }
            if (!_orderMatchesDateFilter(o)) return false;
            if (orderSearch) {
                const q = orderSearch.toLowerCase();
                if (!(o.fullname||'').toLowerCase().includes(q) &&
                    !(o.store||'').toLowerCase().includes(q) &&
                    !(o.username||'').toLowerCase().includes(q)) return false;
            }
            return true;
        });

    countEl.textContent = `${entries.length} طلب`;
    const resultsCountEl = document.getElementById('orders-results-count');
    if (resultsCountEl) resultsCountEl.textContent = entries.length;
    emptyEl.style.display = entries.length === 0 ? 'flex' : 'none';

    // ── Totals for the currently filtered set — order-only, delivery-fee,
    // and driver-fee sums, all in USD, mirroring the same split shown on
    // each order card (manual deliveryFee/driverFee overrides if set,
    // else the estimated/default halves).
    let totalOrdersUSD = 0, totalDeliveryUSD = 0, totalDriverFeeUSD = 0, totalExtraUSD = 0;
    entries.forEach(([, o]) => {
        const deliveryProfit = getOrderDeliveryProfit(o, companyVars);
        const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : deliveryProfit;
        const deliveryUSD = _deliveryFeeToUSD(effectiveDeliveryRaw);
        const driverFeeUSD = _deliveryFeeToUSD(_getOrderDriverFeeRaw(o, effectiveDeliveryRaw));
        totalOrdersUSD    += _getOrderOnlyPrice(o, effectiveDeliveryRaw);
        totalDeliveryUSD  += deliveryUSD;
        totalDriverFeeUSD += driverFeeUSD;
        if (o.extraProfit != null && o.extraProfit !== '') totalExtraUSD += _toUSD(o.extraProfit);
    });
    // Delivo's own profit on delivery fees — the full total minus
    // whatever's going to drivers. Only a fixed half as long as nobody's
    // edited any order's driver-fee split; varies from there.
    const totalDeliveryProfitUSD = totalDeliveryUSD - totalDriverFeeUSD;
    const totOrdersEl    = document.getElementById('orders-total-orders');
    const totFeeEl       = document.getElementById('orders-total-fee');
    const totDriverFeeEl = document.getElementById('orders-total-driverfee');
    const totDeliveryEl  = document.getElementById('orders-total-delivery');
    const totExtraEl     = document.getElementById('orders-total-extra');
    if (totOrdersEl)    totOrdersEl.textContent    = '$' + totalOrdersUSD.toFixed(2);
    if (totFeeEl)        totFeeEl.textContent       = '$' + totalDeliveryUSD.toFixed(2);
    if (totDriverFeeEl)  totDriverFeeEl.textContent = '$' + totalDriverFeeUSD.toFixed(2);
    if (totDeliveryEl)   totDeliveryEl.textContent  = '$' + totalDeliveryProfitUSD.toFixed(2);
    if (totExtraEl)       totExtraEl.textContent     = '$' + totalExtraUSD.toFixed(2);

    // Daily expenses (see scripts/admin-12-expenses.js / "المصاريف اليومية")
    // that fall within this SAME date filter — matched by date only, not by
    // the order-state pill or search box, since an expense isn't tied to
    // any one order. Subtracted below so "net profit" reflects the real
    // bottom line for the period being viewed, not just delivery+extra
    // income.
    let totalExpensesUSD = 0;
    Object.values(window.allExpenses || {}).forEach(exp => {
        if (exp && _dateFilterMatches({ date: _expDateTimeStr(exp) }, orderDateFilter, orderDateFrom, orderDateTo)) {
            totalExpensesUSD += _expToUSD(exp.amount);
        }
    });
    const totExpensesEl = document.getElementById('orders-total-expenses');
    if (totExpensesEl) totExpensesEl.textContent = '$' + totalExpensesUSD.toFixed(2);

    // Net profit — Delivo's actual delivery-fee profit (total fee minus
    // whatever went to drivers, no longer a blind fixed half) plus the
    // full extra-profit total, minus daily expenses for the same period.
    // Simple on purpose: this is the one number meant to answer "how much
    // did I actually make?" without the admin having to do the math.
    const totNetEl = document.getElementById('orders-total-net');
    if (totNetEl) {
        const netProfit = totalDeliveryProfitUSD + totalExtraUSD - totalExpensesUSD;
        totNetEl.textContent = '$' + netProfit.toFixed(2);
        totNetEl.style.color = netProfit < 0 ? 'var(--red)' : '';
    }


    // ── Smart diff: preserve expanded state & scroll position, and
    // don't touch cards whose data hasn't changed or that the admin is
    // currently interacting with (typing a price, driver select focused)
    // — this refresh runs on a timer, so rebuilding every card every
    // tick was closing open dropdowns and resetting in-progress edits.
    const newKeys = new Set(entries.map(([k]) => k));

    // Remove cards that are no longer in the filtered list
    list.querySelectorAll('.order-card[data-id]').forEach(c => {
        if (!newKeys.has(c.dataset.id)) c.remove();
    });

    // If the admin just flipped the sort toggle, every card's on-screen
    // position may now be wrong even though its data hasn't changed —
    // the "skip if unchanged" optimization below would otherwise leave
    // it sitting at its old (now-incorrect) spot. Clearing here and
    // letting the loop below re-append everything in the freshly-sorted
    // `entries` order is simplest; it only runs on that one toggle click,
    // not on every periodic refresh.
    const sortJustChanged = _lastOrderSort !== null && _lastOrderSort !== orderSort;
    _lastOrderSort = orderSort;
    if (sortJustChanged) {
        list.querySelectorAll('.order-card[data-id]').forEach(c => c.remove());
        _orderCardSnapshots = {};
    }

    entries.forEach(([key, order], idx) => {
        const existing = list.querySelector(`.order-card[data-id="${key}"]`);
        const snapshot = JSON.stringify(order);

        if (existing && _orderCardSnapshots[key] === snapshot) return; // nothing changed — leave it alone
        if (existing && existing.contains(document.activeElement)) return; // admin is editing this card right now — defer

        const wasExpanded = existing ? existing.classList.contains('expanded') : false;

        const newCard = buildOrderCard(key, order);
        if (wasExpanded) newCard.classList.add('expanded');
        _orderCardSnapshots[key] = snapshot;

        if (existing) {
            // Replace in-place — keeps position and doesn't affect scroll
            existing.replaceWith(newCard);
        } else {
            // New card — insert at its position in the already-sorted
            // `entries` array (works for both sort-by-number and
            // sort-by-date, unlike comparing order numbers directly).
            const refNode = list.children[idx] || null;
            list.insertBefore(newCard, refNode);
        }
    });

    renderTopCustomers();
}

// Day-details modal — opened by clicking a bar in the daily delivered-
// orders chart. Lists every delivered order that landed on that day:
// customer, phone, store, and price, so the admin can see who ordered
// without leaving the chart to hunt through the full orders list.
function _openDayOrdersModal(dayLabel, dayOrders) {
    const overlay = document.createElement('div');
    overlay.id = 'day-orders-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

    // Newest order first within the day
    const sorted = [...dayOrders].sort(([a], [b]) => (parseInt(b.replace('id_',''))||0) - (parseInt(a.replace('id_',''))||0));

    const rows = sorted.map(([key, o]) => {
        const idNum = key.replace('id_', '');
        const name  = (o.fullname || o.username || 'زبون').replace(/</g, '&lt;');
        const phone = o.phone ? formatPhone(o.phone) : '—';
        const store = (o.store || '—').replace(/</g, '&lt;');
        const deliveryProfit = getOrderDeliveryProfit(o, companyVars);
        const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : deliveryProfit;
        const priceUSD = _getOrderOnlyPrice(o, effectiveDeliveryRaw) + _deliveryFeeToUSD(effectiveDeliveryRaw);
        return `
            <div class="do-row">
                <span class="do-row__id">#${idNum}</span>
                <span class="do-row__name">${name}</span>
                <span class="do-row__phone" dir="ltr">${phone}</span>
                <span class="do-row__store">${store}</span>
                <span class="do-row__price">$${priceUSD.toFixed(2)}</span>
            </div>`;
    }).join('');

    overlay.innerHTML = `
        <div style="background:var(--surface2);border-radius:16px;width:min(700px,95vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <div style="font-weight:800;color:var(--white);">📅 طلبات يوم ${dayLabel} — <span style="color:var(--green);">${dayOrders.length}</span> طلب مُسلَّم</div>
                <button id="do-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div class="do-list">
                <div class="do-row do-row--head">
                    <span class="do-row__id">#</span>
                    <span class="do-row__name">الزبون</span>
                    <span class="do-row__phone">الهاتف</span>
                    <span class="do-row__store">المتجر</span>
                    <span class="do-row__price">السعر</span>
                </div>
                ${rows}
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#do-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// Normalizes a stored phone value down to bare local-format digits so the
// same real customer's orders merge under one key regardless of how the
// phone happened to be saved on any given order — with/without a "+961"
// or "961" country code, with/without a leading "0", or with spacer
// characters. Returns '' when there's nothing usable. This is what makes
// registered-account orders and guest/unregistered orders from the same
// person count as one customer in renderTopCustomers() below.
function _normalizePhoneKey(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
    digits = digits.replace(/^0+/, '');
    return digits;
}

// ── Top customers by delivered-order count ──────────────────────────
// Ranks customers strictly by normalized phone number, merging
// registered-account orders and guest/unregistered orders placed under
// the same real phone into a single customer — a name or username is
// never used to group, only to display. Only meaningful — and only shown
// at all — when looking at the full, unfiltered order history ("الكل");
// any narrower date range makes "top customers" a near-meaningless
// one-off list, so the whole card is hidden rather than shown with
// misleading data, saving vertical space in the panel the rest of the
// time.
function renderTopCustomers() {
    const card  = document.getElementById('top-customers-card');
    const body  = document.getElementById('top-customers-body');
    const totEl = document.getElementById('top-customers-total');
    if (!card || !body) return;

    if (orderDateFilter !== 'all') {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const byCustomer = {};
    let noPhoneCount = 0;
    Object.values(allOrders).forEach(o => {
        if ((o.state || '0') !== '1') return; // only delivered orders
        if (!_orderMatchesDateFilter(o)) return;
        // Phone is the ONLY grouping key — this is what merges a
        // registered customer's account orders with any guest/unregistered
        // orders placed under the same real phone number. Orders with no
        // usable phone at all are counted in the totals but can't be
        // attributed to a specific customer, so they're excluded from the
        // ranked list (not silently merged into one fake "no phone" row).
        const idKey = _normalizePhoneKey(o.phone);
        if (!idKey) { noPhoneCount++; return; }
        if (!byCustomer[idKey]) {
            byCustomer[idKey] = { name: o.fullname || (o.username ? '@'+o.username : '') || 'زبون', phone: o.phone || '', count: 0, totalUSD: 0 };
        }
        byCustomer[idKey].count++;
        // Prefer a real name over a username over the generic fallback,
        // and keep the most complete raw phone seen for display.
        if (o.fullname && (!byCustomer[idKey].name || byCustomer[idKey].name === 'زبون' || byCustomer[idKey].name.startsWith('@'))) {
            byCustomer[idKey].name = o.fullname;
        }
        if (o.phone && !byCustomer[idKey].phone) byCustomer[idKey].phone = o.phone;
        const deliveryProfit = getOrderDeliveryProfit(o, companyVars);
        const effectiveDeliveryRaw = (o.deliveryFee != null && o.deliveryFee !== '') ? o.deliveryFee : deliveryProfit;
        byCustomer[idKey].totalUSD += _getOrderOnlyPrice(o, effectiveDeliveryRaw) + _deliveryFeeToUSD(effectiveDeliveryRaw);
    });

    const totalCustomerCount = Object.keys(byCustomer).length;
    const ranked = Object.values(byCustomer).sort((a, b) => b.count - a.count).slice(0, 10);

    // Spells out "shown / total" explicitly — if fewer than 10 unique
    // customers have ever had a delivered order, that's shown as e.g.
    // "أعلى 9 من 9 عملاء" rather than implying a 10th is missing.
    if (totEl) {
        const noPhoneNote = noPhoneCount ? ` <span style="opacity:.65">· ${noPhoneCount} طلب بلا رقم هاتف مستبعد</span>` : '';
        totEl.innerHTML = ranked.length
            ? ((totalCustomerCount > ranked.length
                ? `أعلى <b>${ranked.length}</b> من <b>${totalCustomerCount}</b> عميل`
                : `<b>${totalCustomerCount}</b> عميل (كل من لديهم طلبات مُسلَّمة)`) + noPhoneNote)
            : '';
    }

    if (!ranked.length) {
        body.innerHTML = `<div class="orders-chart-empty">لا توجد طلبات مُسلَّمة ضمن الفترة الحالية</div>`;
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    body.innerHTML = ranked.map((c, i) => `
        <div class="tc-row">
            <span class="tc-rank">${medals[i] || (i + 1)}</span>
            <span class="tc-name">${(c.name || 'زبون').replace(/</g, '&lt;')}</span>
            <span class="tc-phone" dir="ltr">${c.phone ? formatPhone(c.phone) : '—'}</span>
            <span class="tc-count">${c.count} <small>طلب</small></span>
            <span class="tc-total">$${c.totalUSD.toFixed(2)}</span>
        </div>`).join('');
}

function buildOrderCard(key, order) {
    const idNum = key.replace('id_','');
    const state = order.state || '0';
    const isUnread = order.read !== '1';

    const card = document.createElement('div');
    card.className = `order-card state-${state}${isUnread ? ' unread' : ''}`;
    card.dataset.id = key;

    const items = parseCart(order.cart);
    const driverAssigned = order.driver && order.driver !== '0';
    // Some historical orders have lat/lng saved backwards — see
    // _fixSwappedLatLng. Correct it once here for display/locate use;
    // doesn't touch the stored record until the admin actually edits
    // the location (which writes the corrected pair back).
    const hasOcLoc = order.lat && order.lat !== '0';
    const [ocLat, ocLng] = hasOcLoc ? _fixSwappedLatLng(parseFloat(order.lat), parseFloat(order.lng)) : [null, null];
    const deliveryProfit = getOrderDeliveryProfit(order, companyVars);
    // Effective delivery value shown in the fee chip below — the admin's
    // manual override if set, otherwise the estimated profit.
    const effectiveDeliveryRaw = (order.deliveryFee != null && order.deliveryFee !== '') ? order.deliveryFee : deliveryProfit;
    // Driver's cut of that delivery fee — half by default (same
    // currency/unit as the fee itself), or the admin's per-order override
    // once one exists (order.driverFee). Delivo's own profit on the
    // delivery fee is whatever's left over once the driver's cut is
    // subtracted — a fixed half only as long as nobody's edited it.
    const driverFeeRaw     = _getOrderDriverFeeRaw(order, effectiveDeliveryRaw);
    const deliveryProfitUSD = _deliveryFeeToUSD(effectiveDeliveryRaw) - _deliveryFeeToUSD(driverFeeRaw);
    // Order-only price shown in the header — reads the independent
    // order.orderprice field when present, only falling back to
    // splitting the old merged order.total for orders never edited yet.
    const orderOnlyPrice = _getOrderOnlyPrice(order, effectiveDeliveryRaw);

    // WhatsApp quick-call links — customer's own phone, and the order's
    // store phone (external stores carry their own storePhone; internal
    // stores only have one if that field happens to be set on the store
    // record). Both are '' (and simply don't render a chip) when there's
    // no usable number, or the number isn't a complete Lebanese mobile.
    const custWaLink  = (order.phone && _isCompleteLebanesePhone(order.phone)) ? _waLinkFromPhone(order.phone) : '';
    // Internal stores don't have a "phone" field — their WhatsApp number
    // is saved separately as .whatsapp (see the "متاجر" panel's own
    // WhatsApp save button, _storeSetField(name, type, 'whatsapp', ...)).
    // External stores keep using their own storePhone saved onto the order.
    const storePhoneRaw = order.storePhone || (allStores[order.store] && allStores[order.store].whatsapp) || '';
    const storeWaLink = (storePhoneRaw && _isCompleteLebanesePhone(storePhoneRaw)) ? _waLinkFromPhone(storePhoneRaw) : '';

    card.innerHTML = `
        <div class="oc-header">
            <span class="oc-id">#${idNum}</span>
            <span class="oc-store">${order.store || '—'}</span>
            <span class="oc-customer">
                <input type="text" class="oc-name-input" data-oid="${key}" value="${(order.fullname || '').replace(/"/g, '&quot;')}" placeholder="${order.username || 'اسم صاحب الطلب'}">
                <div class="oc-customer-sub">
                    ${order.username ? `<span class="oc-customer-un">@${order.username}</span>` : ''}
                    <input type="tel" class="oc-phone-input" data-oid="${key}" value="${(order.phone || '').replace(/"/g, '&quot;')}" placeholder="رقم الهاتف" dir="ltr">
                </div>
            </span>
            <div class="oc-field-group">
                <span class="oc-field-label">سعر الطلب</span>
                <span class="oc-total-edit" title="سعر الطلب بدون رسم التوصيل — اضغط للتعديل">
                    <span class="oc-total-cur">${_currencySymbol(orderOnlyPrice)}</span><input type="number" class="oc-total-input" data-oid="${key}" value="${orderOnlyPrice ? orderOnlyPrice.toFixed(2) : ''}" placeholder="0" step="0.01">
                </span>
            </div>
            <div class="oc-field-group">
                <span class="oc-field-label">رسم التوصيل</span>
                <span class="oc-fee-edit" title="رسم التوصيل — محسوب تلقائياً، يمكن تعديله يدوياً">
                    💵<span class="oc-fee-cur">${_currencySymbol(order.deliveryFee)}</span><input type="number" class="oc-fee-input" data-oid="${key}" value="${order.deliveryFee != null && order.deliveryFee !== '' ? order.deliveryFee : (deliveryProfit !== null ? deliveryProfit.toFixed(2) : '')}" placeholder="—" step="0.01">
                </span>
                <button type="button" class="oc-fee-auto-btn" data-fee-auto="${key}" title="احسب رسم التوصيل تلقائياً حسب المسافة (يتطلب تحديد موقع التوصيل)">🧮 تلقائي</button>
            </div>
            <div class="oc-field-group oc-field-group--split" title="تقسيم رسم التوصيل بين السائق وديليفو — نصف المبلغ للسائق افتراضياً">
                <span class="oc-field-label">أجرة السائق 🏍️ / 💰</span>
                <span class="oc-split-row">
                    <span class="oc-split-driver" title="أجرة السائق من رسم التوصيل — نصف المبلغ افتراضياً، قابل للتعديل">
                        🏍️<input type="number" class="oc-driverfee-input" data-oid="${key}" value="${driverFeeRaw}" placeholder="0" step="0.01">
                        <span class="oc-driverfee-cur">${_currencySymbol(driverFeeRaw)}</span>
                    </span>
                    <span class="oc-split-profit${deliveryProfitUSD < 0 ? ' oc-split-profit--neg' : ''}" title="ربح ديليفو من هذا الطلب = رسم التوصيل − أجرة السائق">
                        💰 <b class="oc-split-profit-val">$${deliveryProfitUSD.toFixed(2)}</b>
                    </span>
                </span>
            </div>
            <div class="oc-field-group">
                <span class="oc-field-label">ربح إضافي</span>
                <span class="oc-extra-edit" title="ربح إضافي — مبلغ إضافي يُضاف يدوياً لهذا الطلب، بمعزل عن سعر الطلب ورسم التوصيل">
                    ➕<span class="oc-extra-cur">${_currencySymbol(order.extraProfit)}</span><input type="number" class="oc-extra-input" data-oid="${key}" value="${order.extraProfit != null && order.extraProfit !== '' ? order.extraProfit : ''}" placeholder="0" step="0.01">
                </span>
            </div>
            <span class="oc-state state-badge-${state}">${STATE_LABELS[state] || state}</span>
            <span class="oc-toggle">▾</span>
        </div>
        <div class="oc-body">
          <div class="oc-body-inner">
            <div class="oc-body-inner-pad">
            <div class="oc-items-list">
                ${items.map((i, idx) => `
                    <div class="oc-item-row">
                        <span class="name">
                            ${i.editable
                                ? `<input type="text" class="oc-item-name-input" data-oid="${key}" data-item-idx="${idx}" value="${(i.name || '').replace(/"/g, '&quot;')}" placeholder="وصف الطلب">`
                                : (i.name || '')}
                            ${i.notes ? `<span class="oc-item-notes">📝 ${i.notes}</span>` : ''}
                        </span>
                        <span class="qty">×${i.qty}</span>
                        <span class="price">${i.price < 1000 ? '$'+i.price : (i.price/1000).toFixed(0)+'k ل.ل'}</span>
                    </div>`).join('')}
            </div>
            <div class="oc-meta-row">
                <span class="oc-meta-chip oc-date-edit" data-date-edit="${key}" style="cursor:pointer;" title="اضغط لتعديل تاريخ ووقت الطلب">
                    📅 ${order.date || '—'} ✏️
                </span>
                <span class="oc-meta-chip" style="direction:ltr;">📞 ${formatPhone(order.phone)}</span>
                ${custWaLink ? `<a class="oc-meta-chip oc-wa-btn" href="${custWaLink}" target="_blank" rel="noopener" title="مراسلة العميل على واتساب">💬 واتساب</a>` : ''}
                <span class="oc-meta-chip ${order.username ? 'oc-cust-registered' : 'oc-cust-standard'}" title="${order.username ? 'عميل مسجّل — لديه حساب وتم التحقق من رقمه برمز تأكيد' : 'عميل عادي — بيانات أولية فقط (اسم ورقم هاتف) بدون حساب'}">👤 ${order.username || '—'}</span>
                <span class="oc-meta-chip">🏙 ${order.city || '—'}</span>
                ${order.street ? `<span class="oc-meta-chip">🛣 ${order.street}</span>` : ''}
                ${storeWaLink ? `<a class="oc-meta-chip oc-wa-btn" href="${storeWaLink}" target="_blank" rel="noopener" title="مراسلة المتجر على واتساب">💬 واتساب المتجر</a>` : ''}
                <span class="oc-meta-chip oc-loc-edit" data-loc-edit="${key}" style="cursor:pointer;" title="اضغط لتعديل موقع التوصيل على الخريطة">
                    📍 تحديد الموقع ✏️
                </span>
                <span class="oc-meta-chip oc-store-edit" data-store-edit="${key}" style="cursor:pointer;" title="اضغط لتحديد أو تعديل متجر الطلب">
                    🏪 تحديد المتجر ✏️
                </span>
                <span class="oc-meta-chip ${driverAssigned ? 'has' : ''}" style="${driverAssigned ? 'border-color:rgba(34,197,94,0.3);color:var(--green);background:var(--green-glow);' : ''}">
                    🛵 ${driverAssigned ? order.driver : 'غير معين'}
                </span>
                ${order.claimStatus === 'claimed' ? `<span class="oc-meta-chip" style="color:#3b82f6;border-color:rgba(59,130,246,0.35);background:rgba(59,130,246,0.08);font-size:0.68rem;">🙋 استلم تلقائياً</span>` : ''}
                ${order.claimStatus === 'assigned' ? `<span class="oc-meta-chip" style="color:var(--orange);border-color:rgba(255,92,0,0.35);background:rgba(255,92,0,0.08);font-size:0.68rem;">👤 عيّنه الإدارة</span>` : ''}
                ${!driverAssigned && !order.claimStatus ? `<span class="oc-meta-chip" style="color:var(--red);border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.07);font-size:0.68rem;">⏳ بانتظار سائق</span>` : ''}
                ${order.vault && order.vault !== '0' ? `<span class="oc-meta-chip" style="color:var(--yellow);border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);">💰 دفع نقدي: $${order.vault}</span>` : ''}
                ${order.externalOrder === '1' ? `<span class="oc-meta-chip" style="color:#fb923c;border-color:rgba(251,146,60,0.35);background:rgba(251,146,60,0.1);font-size:0.72rem;">🛍️ طلب خارجي${order.storeAddress ? ' · ' + order.storeAddress : ''}</span>` : ''}
                ${order.guestOrder === '1' ? `<span class="oc-meta-chip" style="color:#22d3ee;border-color:rgba(34,211,238,0.35);background:rgba(34,211,238,0.08);font-size:0.72rem;" title="طلب من الموقع بدون حساب — رقم الهاتف فقط. يظهر في بحث «اطلب» كعميل غير مسجل">🙋 طلب ضيف — بدون حساب</span>` : ''}
                ${order.trackorder==1 ? `<span class="oc-meta-chip" style="color:var(--blue);">📡 تتبع نشط</span>` : ''}
                ${order.xnote ? `<span class="oc-meta-chip" style="flex-basis:100%;">💬 ${order.xnote}</span>` : ''}
            </div>
            <div class="oc-actions">
                ${(hasPerm('orders') && _assignmentMode !== 'driver_only') ? `
                <select class="driver-select" data-order="${key}">
                    <option value="">— تعيين سائق —</option>
                    ${allDrivers.filter(d => d && (d.active === true || (d.owner||d.username) === order.driver)).map((d,i) => `<option value="${d.owner||d.username}" ${order.driver === (d.owner||d.username) ? 'selected' : ''}>${d.owner || d.username} ${d.status==='online'?'🟢':'⚫'}${d.active !== true ? ' (غير مفعّل)' : ''}</option>`).join('')}
                </select>
                <button class="oc-action-btn primary" data-assign="${key}">✔ تعيين</button>
                ` : ''}
                ${(hasPerm('orders') && _assignmentMode === 'driver_only' && !driverAssigned) ? `
                <span class="oc-meta-chip" style="color:var(--gray);border-color:var(--border);">🛵 بانتظار استلام السائق بنفسه</span>
                ` : ''}
                <button class="oc-action-btn btn-new  ${state==='0'?'btn-new--active':''}"
                        data-state="${key}" data-val="0"
                        title="إعادة الطلب لحالة جديد">🔵 جديد</button>
                <button class="oc-action-btn btn-delivered ${state==='1'?'btn-delivered--active':''}"
                        data-state="${key}" data-val="1"
                        title="تم التوصيل">✅ وُصِّل</button>
                <button class="oc-action-btn btn-late ${state==='3'?'btn-late--active':''}"
                        data-state="${key}" data-val="3"
                        title="تأخير الطلب">⏳ متأخر</button>
                <button class="oc-action-btn btn-cancelled ${state==='2'?'btn-cancelled--active':''}"
                        data-state="${key}" data-val="2"
                        title="إلغاء الطلب">✕ ملغي</button>
                <button class="oc-action-btn btn-ready ${state==='8'?'btn-ready--active':''}"
                        data-state="${key}" data-val="8"
                        title="الطلب جاهز للتسليم للسائق">✅ جاهز</button>
                ${hasOcLoc ? `<button class="oc-action-btn" data-locate="${ocLat},${ocLng}">🗺 الخريطة</button>` : ''}
                ${ (['1','2'].includes(state))
                    ? `<button class="oc-action-btn btn-track" disabled title="الطلب منتهٍ — التتبع غير متاح" style="opacity:.4;cursor:not-allowed;">📡 التتبع</button>`
                    : (['6','7'].includes(state))
                    ? `<button class="oc-action-btn btn-track" disabled title="بانتظار المتجر" style="opacity:.4;cursor:not-allowed;">📡 التتبع</button>`
                    : `<button class="oc-action-btn btn-track ${order.trackorder==1?'btn-track--active':''}" data-trackorder="${key}">📡 ${order.trackorder==1?'إيقاف التتبع':'تفعيل التتبع'}</button>`
                }
                ${order.vault==1
                    ? `<button class="oc-action-btn" data-unarchive="${key}" style="border-color:rgba(156,163,175,0.4);color:#9ca3af;">↩ استعادة</button>`
                    : `<button class="oc-action-btn" data-archive="${key}" style="border-color:rgba(156,163,175,0.4);color:#9ca3af;">📦 أرشفة</button>`
                }
            </div>
            </div>
          </div>
        </div>`;

    // Toggle expand
    card.querySelector('.oc-header').addEventListener('click', () => {
        card.classList.toggle('expanded');
        if (card.classList.contains('expanded') && isUnread) markRead(key);
    });

    // Editable order price ("total") — lets admin fill in / correct the
    // price directly, e.g. for "طلب خارجي" orders placed without one.
    const totalInput = card.querySelector('.oc-total-input');
    if (totalInput) {
        totalInput.addEventListener('click', e => e.stopPropagation());
        const totalCur = card.querySelector('.oc-total-cur');
        totalInput.addEventListener('input', () => {
            const sym = _currencySymbol(totalInput.value);
            if (totalCur) totalCur.textContent = sym;
            totalInput.step = sym === 'ل.ل' ? '1000' : '0.01';
        });
        totalInput.addEventListener('change', async () => {
            const val = _normalizeMoneyValue(totalInput.value.trim());
            totalInput.value = val;
            if (totalCur) totalCur.textContent = _currencySymbol(val);
            // Order price and delivery fee are independent fields — this
            // only ever writes order.orderprice (a value the admin typed
            // in ل.ل is converted to USD first via _toUSD). order.total is
            // refreshed alongside it purely for other reports that still
            // read the merged figure; the delivery fee itself is never
            // touched here, so it can't shift as a side-effect.
            const orderOnlyUSD = _toUSD(val);
            const deliveryUSD = _deliveryFeeToUSD(effectiveDeliveryRaw);
            await updateOrderFields(key, {
                orderprice: orderOnlyUSD.toFixed(2),
                total: (orderOnlyUSD + deliveryUSD).toFixed(2)
            });
            toast('✅ تم تحديث سعر الطلب');
        });
    }

    // Editable delivery fee — admin override of the auto ("smart")
    // calculated fee, when the distance-based estimate needs adjusting.
    const feeInput = card.querySelector('.oc-fee-input');
    const driverFeeInput = card.querySelector('.oc-driverfee-input');

    // Shared by both the delivery-fee and driver-fee inputs — keeps the
    // little "💰 $X" profit readout beside the driver-fee box in sync
    // with whatever's currently typed in either field, live, before
    // either one is even saved.
    function _refreshOcSplitProfit() {
        const profitValEl  = card.querySelector('.oc-split-profit-val');
        const profitWrapEl = card.querySelector('.oc-split-profit');
        if (!profitValEl) return;
        const feeRawNow    = feeInput ? feeInput.value : effectiveDeliveryRaw;
        const driverRawNow = driverFeeInput ? driverFeeInput.value : driverFeeRaw;
        const profitNow    = _deliveryFeeToUSD(feeRawNow) - _deliveryFeeToUSD(driverRawNow);
        profitValEl.textContent = '$' + profitNow.toFixed(2);
        if (profitWrapEl) profitWrapEl.classList.toggle('oc-split-profit--neg', profitNow < 0);
    }

    if (feeInput) {
        feeInput.addEventListener('click', e => e.stopPropagation());
        const feeCur = card.querySelector('.oc-fee-cur');
        feeInput.addEventListener('input', () => {
            const sym = _currencySymbol(feeInput.value);
            if (feeCur) feeCur.textContent = sym;
            feeInput.step = sym === 'ل.ل' ? '1000' : '0.01';
            _refreshOcSplitProfit();
        });
        feeInput.addEventListener('change', async () => {
            const val = _normalizeMoneyValue(feeInput.value.trim());
            feeInput.value = val;
            if (feeCur) feeCur.textContent = _currencySymbol(val);
            // Lock in the order price exactly as currently displayed (as
            // an explicit order.orderprice field) so editing the delivery
            // fee never shifts it — order.total is refreshed alongside
            // for other reports, but the order-price input itself is
            // untouched.
            const newDeliveryUSD = _deliveryFeeToUSD(val);
            await updateOrderFields(key, {
                deliveryFee: val,
                orderprice: orderOnlyPrice.toFixed(2),
                total: (orderOnlyPrice + newDeliveryUSD).toFixed(2)
            });
            _refreshOcSplitProfit();
            renderOrders(); // refresh toolbar totals too
            toast('✅ تم تحديث رسم التوصيل');
        });
    }

    // Editable driver's cut of the delivery fee — defaults to half (see
    // _getOrderDriverFeeRaw), stored independently as order.driverFee
    // once the admin actually edits it for this order. Delivo's own
    // profit on the delivery fee (the little "💰 $X" beside it) is
    // recalculated live as either this or the delivery-fee input changes.
    if (driverFeeInput) {
        driverFeeInput.addEventListener('click', e => e.stopPropagation());
        const driverFeeCur = card.querySelector('.oc-driverfee-cur');
        driverFeeInput.addEventListener('input', () => {
            const sym = _currencySymbol(driverFeeInput.value);
            if (driverFeeCur) driverFeeCur.textContent = sym;
            driverFeeInput.step = sym === 'ل.ل' ? '1000' : '0.01';
            _refreshOcSplitProfit();
        });
        driverFeeInput.addEventListener('change', async () => {
            const val = _normalizeMoneyValue(driverFeeInput.value.trim());
            driverFeeInput.value = val;
            if (driverFeeCur) driverFeeCur.textContent = _currencySymbol(val);
            await updateOrderFields(key, { driverFee: val });
            _refreshOcSplitProfit();
            renderOrders(); // refresh toolbar totals too
            toast('✅ تم تحديث أجرة السائق');
        });
    }

    // "🧮 تلقائي" — recompute this order's delivery fee from the smart
    // (distance-based) engine on demand, using the order's saved
    // destination pin + its store's location.
    const feeAutoBtn = card.querySelector('[data-fee-auto]');
    if (feeAutoBtn) {
        feeAutoBtn.addEventListener('click', async e => {
            e.stopPropagation();
            feeAutoBtn.disabled = true;
            await _ocAutoCalcFee(key);
            renderOrders();
        });
    }

    // Editable extra profit — a manually-tracked bonus amount on top of
    // the order price and delivery fee (e.g. a markup or side commission
    // the admin wants to record against this order). Stored independently
    // as order.extraProfit; never folded into orderprice/total, so it
    // doesn't affect what the customer was charged.
    const extraInput = card.querySelector('.oc-extra-input');
    if (extraInput) {
        extraInput.addEventListener('click', e => e.stopPropagation());
        const extraCur = card.querySelector('.oc-extra-cur');
        extraInput.addEventListener('input', () => {
            const sym = _currencySymbol(extraInput.value);
            if (extraCur) extraCur.textContent = sym;
            extraInput.step = sym === 'ل.ل' ? '1000' : '0.01';
        });
        extraInput.addEventListener('change', async () => {
            const val = _normalizeMoneyValue(extraInput.value.trim());
            extraInput.value = val;
            if (extraCur) extraCur.textContent = _currencySymbol(val);
            await updateOrderFields(key, { extraProfit: val });
            toast('✅ تم تحديث الربح الإضافي');
        });
    }

    // Inline-editable name/phone — every order, internal or external.
    // Registered customers' orders start pre-filled from their account,
    // but admins can still correct a typo or update a changed number
    // directly here, no separate popup needed.
    const nameInput = card.querySelector('.oc-name-input');
    if (nameInput) {
        nameInput.addEventListener('click', e => e.stopPropagation());
        nameInput.addEventListener('change', async () => {
            const val = nameInput.value.trim();
            await updateOrderFields(key, { fullname: val });
            toast('✅ تم تحديث الاسم');
        });
    }
    const phoneInput = card.querySelector('.oc-phone-input');
    if (phoneInput) {
        phoneInput.addEventListener('click', e => e.stopPropagation());
        phoneInput.addEventListener('change', async () => {
            const val = phoneInput.value.trim();
            await updateOrderFields(key, { phone: val });
            toast('✅ تم تحديث رقم الهاتف');
        });
    }

    // Inline-editable order description — the item "name" segment written
    // into order.cart. Mainly useful for otlob orders left at the default
    // "طلب" placeholder, but works for any order using the standard cart
    // format (i.editable), one item at a time.
    card.querySelectorAll('.oc-item-name-input').forEach(inp => {
        inp.addEventListener('click', e => e.stopPropagation());
        inp.addEventListener('change', async () => {
            const idx = parseInt(inp.dataset.itemIdx, 10);
            const val = inp.value.trim() || 'طلب';
            inp.value = val;
            const newCart = _ocRebuildCartItemName(order.cart, idx, val);
            await updateOrderFields(key, { cart: newCart });
            toast('✅ تم تحديث وصف الطلب');
        });
    });

    // Editable delivery location — opens the same map picker used in
    // "اطلب", pre-filled with the order's current pin if it has one.
    const locEditBtn = card.querySelector('[data-loc-edit]');
    if (locEditBtn) {
        locEditBtn.addEventListener('click', e => {
            e.stopPropagation();
            _ocEditOrderLocation(key, order);
        });
    }

    // Editable order store — lets admin set/correct which store an order
    // belongs to (e.g. for "اطلب خارجي" orders, or fixing a mistake).
    const storeEditBtn = card.querySelector('[data-store-edit]');
    if (storeEditBtn) {
        storeEditBtn.addEventListener('click', e => {
            e.stopPropagation();
            _ocEditOrderStore(key, order);
        });
    }

    // Editable order date/time — mainly for backdating an order that
    // actually happened before this system tracked it (e.g. entering
    // historical WhatsApp/phone orders into the database).
    const dateEditBtn = card.querySelector('[data-date-edit]');
    if (dateEditBtn) {
        dateEditBtn.addEventListener('click', e => {
            e.stopPropagation();
            _ocEditOrderDate(key, order);
        });
    }

    // Assign driver
    const assignBtn = card.querySelector('[data-assign]');
    if (assignBtn) {
        assignBtn.addEventListener('click', async () => {
            const sel = card.querySelector('.driver-select');
            const driverName = sel ? sel.value : '';
            if (!driverName) { toast('اختر سائقاً أولاً', true); return; }
            await assignDriver(key, driverName);
        });
    }

    // State change
    card.querySelectorAll('[data-state]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await changeState(btn.dataset.state, btn.dataset.val);
        });
    });

    // Toggle trackorder — same state rules as driver app
    card.querySelectorAll('[data-trackorder]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const oid   = btn.dataset.trackorder;
            const order = allOrders[oid] || {};
            const st    = order.state || '0';
            if (['1','2'].includes(st)) { toast('الطلب منتهٍ — التتبع غير متاح', true); return; }
            if (['6','7'].includes(st))     { toast('بانتظار المتجر — التتبع غير متاح بعد', true); return; }
            const cur    = order.trackorder;
            const newVal = (cur == 1) ? '0' : '1';
            const uid    = order.delivryplusid;
            const updates = {};
            updates[`/requests/${oid}/trackorder`] = newVal;
            if (uid) updates[`/historyRequests/${uid}/${oid}/trackorder`] = newVal;
            await fbUpdate('', updates);
            allOrders[oid].trackorder = newVal;
            toast(newVal === '1' ? '📡 تم تفعيل التتبع' : '🔴 تم إيقاف التتبع');
            if (newVal === '1') _notifyCustomerTrackingWhatsapp(oid, allOrders[oid]);
            const card2 = document.querySelector(`.order-card[data-id="${oid}"]`);
            if (card2) { const expanded = card2.classList.contains('expanded'); card2.replaceWith(buildOrderCard(oid, allOrders[oid])); if (expanded) document.querySelector(`.order-card[data-id="${oid}"]`)?.classList.add('expanded'); }
        });
    });

    // Archive order
    card.querySelectorAll('[data-archive]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const oid = btn.dataset.archive;
            const uid = allOrders[oid]?.delivryplusid;
            const upd = {};
            upd[`/requests/${oid}/vault`] = '1';
            if (uid) upd[`/historyRequests/${uid}/${oid}/vault`] = '1';
            // Stop tracking if active
            if (allOrders[oid]?.trackorder == 1) {
                upd[`/requests/${oid}/trackorder`] = '0';
                upd[`/requests/${oid}/driverid`]   = null;
                if (uid) {
                    upd[`/historyRequests/${uid}/${oid}/trackorder`] = '0';
                    upd[`/historyRequests/${uid}/${oid}/driverid`]   = null;
                }
            }
            allOrders[oid].vault = '1';
            allOrders[oid].trackorder = '0';
            await fbUpdate('', upd);
            toast('📦 تم أرشفة الطلب');
            const c2 = document.querySelector(`.order-card[data-id="${oid}"]`);
            if (c2) c2.remove();
            renderMap();
        });
    });

    // Unarchive order
    card.querySelectorAll('[data-unarchive]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const oid = btn.dataset.unarchive;
            const uid = allOrders[oid]?.delivryplusid;
            const upd = {};
            upd[`/requests/${oid}/vault`] = '0';
            if (uid) upd[`/historyRequests/${uid}/${oid}/vault`] = '0';
            allOrders[oid].vault = '0';
            await fbUpdate('', upd);
            toast('✅ تمت استعادة الطلب');
            const c2 = document.querySelector(`.order-card[data-id="${oid}"]`);
            if (c2) c2.remove();
            renderMap();
        });
    });

    // Locate on map
    card.querySelectorAll('[data-locate]').forEach(btn => {
        btn.addEventListener('click', () => {
            const [lat, lng] = btn.dataset.locate.split(',').map(Number);
            if (adminMap) {
                switchPanel('map');
                setTimeout(() => adminMap.setView([lat, lng], 16), 150);
            }
        });
    });

    return card;
}

// Rebuilds a standard "qty:name:price:store:notes,..." cart string with
// just one item's name segment swapped — used by the editable order-
// description input on each order card. Leaves every other item and
// every other segment (qty, price, store, notes) untouched. Returns the
// original string unchanged if the cart isn't in the standard format
// (e.g. legacy "2× شاورما | ..." external-order carts aren't safely
// editable this way).
function _ocRebuildCartItemName(cartStr, itemIndex, newName) {
    const str = cartStr || '';
    if (!str.includes(':')) return str;
    const segs = str.split(',').filter(Boolean);
    if (!segs[itemIndex]) return str;
    const parts = segs[itemIndex].split(':');
    parts[1] = newName;
    while (parts.length < 3) parts.push('');
    segs[itemIndex] = parts.join(':');
    return segs.join(',');
}

function parseCart(cartStr) {
    const items = [];
    const str = cartStr || '';

    // Standard format: qty:name:price:store:notes,qty:name:price...
    if (str.includes(':')) {
        str.split(',').filter(Boolean).forEach(seg => {
            const p = seg.split(':');
            if (p.length >= 3) items.push({ qty: p[0], name: p[1], price: parseFloat(p[2]) || 0, notes: p[4] || '', editable: true });
        });
        return items;
    }

    // Legacy external-order format: "2× شاورما | 1× بيتزا || ملاحظة: ..."
    // Split on || first to separate note
    const [itemsPart, notePart] = str.split('||');
    itemsPart.split('|').filter(Boolean).forEach(seg => {
        const m = seg.trim().match(/^(\d+)[×x]\s*(.+)$/);
        if (m) items.push({ qty: m[1], name: m[2].trim(), price: 0, notes: '' });
    });
    if (notePart) items.push({ qty: '📝', name: notePart.replace('ملاحظة:', '').trim(), price: 0, notes: '' });
    return items;
}

async function assignDriver(orderId, driverName) {
    try {
        const uid = allOrders[orderId]?.delivryplusid;
        const driverObj = allDrivers.find(d => d && (d.owner === driverName || d.username === driverName));
        const driverId  = driverObj?._key || driverObj?.id || null;
        const updates = {};
        updates[`/requests/${orderId}/driver`]      = driverName;
        updates[`/requests/${orderId}/claimStatus`] = 'assigned';
        if (driverId) updates[`/requests/${orderId}/driverid`] = driverId;
        if (uid) {
            updates[`/historyRequests/${uid}/${orderId}/driver`]      = driverName;
            updates[`/historyRequests/${uid}/${orderId}/claimStatus`] = 'assigned';
            if (driverId) updates[`/historyRequests/${uid}/${orderId}/driverid`] = driverId;
        }
        await fbUpdate('', updates);
        allOrders[orderId].driver      = driverName;
        allOrders[orderId].claimStatus = 'assigned';
        if (driverId) allOrders[orderId].driverid = driverId;
        toast(`✅ تم تعيين ${driverName} للطلب #${orderId.replace('id_','')}`);
        renderOrders();
        notifyDriverAssigned(orderId, driverName, driverObj, allOrders[orderId]); // fire-and-forget
    } catch(e) { toast('خطأ في التعيين', true); }
}

async function changeState(orderId, newState) {
    try {
        const uid = allOrders[orderId]?.delivryplusid;
        const updates = {};
        const _prevState = allOrders[orderId]?.state || '0'; // capture BEFORE mutation
        updates[`/requests/${orderId}/state`] = newState;
        if (uid) updates[`/historyRequests/${uid}/${orderId}/state`] = newState;

        // Auto-disable tracking on final states (delivered/cancelled) — same
        // rule already applied by the driver app and the archive button, so
        // an order marked وُصِّل/ملغي from the admin side also stops showing
        // "📡 تتبع نشط" and drops the live-tracking driverid reference.
        const _stopTracking = ['1','2'].includes(newState) && (allOrders[orderId]?.trackorder == 1);
        if (_stopTracking) {
            updates[`/requests/${orderId}/trackorder`] = '0';
            updates[`/requests/${orderId}/driverid`]   = null;
            if (uid) {
                updates[`/historyRequests/${uid}/${orderId}/trackorder`] = '0';
                updates[`/historyRequests/${uid}/${orderId}/driverid`]   = null;
            }
        }

        allOrders[orderId].state = newState; // update local BEFORE await so any re-render is correct
        if (_stopTracking) allOrders[orderId].trackorder = '0';
        await fbUpdate('', updates);

        // Store order counter: keep storeOrderCounts/{store} in sync.
        // Uses /requests/{id}/storeCounted as an idempotency flag (same
        // pattern as pointsAwarded below) so the count only moves once per
        // delivery/revert, no matter how many times the button is pressed
        // or whether admin or driver made the change. This lets the
        // homepage read a tiny, constant-size node instead of scanning the
        // entire historyRequests tree to rank stores.
        try {
            const storeName    = allOrders[orderId]?.store || '';
            const wasDelivered = _prevState === '1';
            const nowDelivered = newState   === '1';
            if (storeName && (nowDelivered !== wasDelivered)) {
                const flagResp = await fetch(`${RTDB}/requests/${orderId}/storeCounted.json`);
                const wasCounted = await flagResp.json();
                const cKey = _countKey(storeName);
                if (nowDelivered && !wasCounted) {
                    const cUpd = {};
                    cUpd[`/storeOrderCounts/${cKey}`]         = { '.sv': { increment: 1 } };
                    cUpd[`/requests/${orderId}/storeCounted`] = true;
                    if (uid) cUpd[`/historyRequests/${uid}/${orderId}/storeCounted`] = true;
                    await fbUpdate('', cUpd);
                } else if (!nowDelivered && wasCounted) {
                    const cUpd = {};
                    cUpd[`/storeOrderCounts/${cKey}`]         = { '.sv': { increment: -1 } };
                    cUpd[`/requests/${orderId}/storeCounted`] = null;
                    if (uid) cUpd[`/historyRequests/${uid}/${orderId}/storeCounted`] = null;
                    await fbUpdate('', cUpd);
                }
            }
        } catch (cErr) {
            console.error('[Admin] Store counter update failed:', cErr);
        }

        // ── Points: award on delivery, subtract on revert ─────────
        // Uses /requests/{id}/pointsAwarded as an idempotency flag so that:
        //  • Pressing وُصِّل multiple times never double-awards
        //  • Reverting from وُصِّل back to any state subtracts the points
        //  • Both admin and driver share the same flag — whichever entity acts
        //    first sets the flag; the other entity's press is a no-op
        if (uid) {
            try {
                const prevState   = _prevState;   // state BEFORE this update (captured before mutation)
                const wasDelivered = prevState === '1';                    // were we already delivered?
                const nowDelivered = newState  === '1';

                if (nowDelivered && !wasDelivered) {
                    // Transition INTO delivered — award ONLY if flag not already set
                    const flagResp = await fetch(`${RTDB}/requests/${orderId}/pointsAwarded.json`);
                    const alreadyAwarded = await flagResp.json();
                    if (!alreadyAwarded) {
                        const ptsResp = await fetch(`${RTDB}/users/${uid}/points.json`);
                        const curPts  = parseInt(await ptsResp.json()) || 0;
                        const ptUpd   = {};
                        ptUpd[`/users/${uid}/points`]                     = curPts + 10;
                        ptUpd[`/requests/${orderId}/pointsAwarded`]       = true;
                        if (allOrders[orderId]?.delivryplusid)
                            ptUpd[`/historyRequests/${uid}/${orderId}/pointsAwarded`] = true;
                        await fbUpdate('', ptUpd);
                        allOrders[orderId].pointsAwarded = true;
                        // Update security baseline so +10 points from delivery doesn't false-alert
                        if (_secBaseline && _secBaseline.userPoints) {
                            _secBaseline.userPoints[uid] = (_secBaseline.userPoints[uid] || 0) + 10;
                        }
                        toast(`✅ تم توصيل الطلب #${orderId.replace('id_','')} — 10 نقاط أضيفت للعميل ⭐`);

                        // Process loyalty threshold rewards now that points changed
                        try {
                            if (typeof window._processLoyaltyThresholds === 'function') {
                                await window._processLoyaltyThresholds(uid, curPts, curPts + 10);
                            } else {
                                // Inline threshold check — reads rewards config from RTDB
                                const [rwResp, clResp, quResp] = await Promise.all([
                                    fetch(`${RTDB}/settings/loyaltyRewards.json`),
                                    fetch(`${RTDB}/users/${uid}/claimedTiers.json`),
                                    fetch(`${RTDB}/users/${uid}/rewardQueue.json`),
                                ]);
                                const rewards = await rwResp.json();
                                let claimed   = await clResp.json();
                                let queue     = await quResp.json();
                                claimed = Array.isArray(claimed) ? claimed : [];
                                queue   = Array.isArray(queue)   ? queue   : [];
                                if (Array.isArray(rewards) && rewards.length) {
                                    const newPts = curPts + 10;
                                    const crossed = rewards.filter(s => s.pts > curPts && s.pts <= newPts && !claimed.includes(s.pts));
                                    let creditAdd = 0;
                                    for (const step of crossed) {
                                        claimed.push(step.pts);
                                        if (step.type === 'account_credit') creditAdd += parseFloat(step.value) || 0;
                                        else queue.push({ pts: step.pts, icon: step.icon, reward: step.reward, type: step.type, value: step.value || 0 });
                                    }
                                    if (crossed.length) {
                                        const tw = [
                                            fetch(`${RTDB}/users/${uid}/claimedTiers.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(claimed) }),
                                            fetch(`${RTDB}/users/${uid}/rewardQueue.json`,  { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(queue)   }),
                                        ];
                                        if (creditAdd > 0) {
                                            const cr = await fetch(`${RTDB}/users/${uid}/credit.json`);
                                            const credNow = parseFloat((await cr.json()) || 0) || 0;
                                            tw.push(fetch(`${RTDB}/users/${uid}/credit.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(credNow + creditAdd) }));
                                        }
                                        await Promise.all(tw);
                                    }
                                }
                            }
                        } catch(_) {}
                    } else {
                        toast(`✅ تم توصيل الطلب #${orderId.replace('id_','')} — النقاط سبق احتسابها`);
                    }
                } else if (wasDelivered && !nowDelivered) {
                    // Transition OUT of delivered — subtract ONLY if flag was set
                    const flagResp = await fetch(`${RTDB}/requests/${orderId}/pointsAwarded.json`);
                    const wasAwarded = await flagResp.json();
                    if (wasAwarded) {
                        const ptsResp = await fetch(`${RTDB}/users/${uid}/points.json`);
                        const curPts  = parseInt(await ptsResp.json()) || 0;
                        const ptUpd   = {};
                        ptUpd[`/users/${uid}/points`]                     = Math.max(0, curPts - 10);
                        ptUpd[`/requests/${orderId}/pointsAwarded`]       = null;  // clear flag
                        if (allOrders[orderId]?.delivryplusid)
                            ptUpd[`/historyRequests/${uid}/${orderId}/pointsAwarded`] = null;
                        await fbUpdate('', ptUpd);
                        allOrders[orderId].pointsAwarded = false;
                        toast(`↩ تم إرجاع 10 نقاط من العميل (الطلب لم يعد موصَّلاً)`);
                    } else {
                        toast(`✅ تم تحديث حالة الطلب #${orderId.replace('id_','')}`);
                    }
                } else {
                    toast(`✅ تم تحديث حالة الطلب #${orderId.replace('id_','')}`);
                }
            } catch (e) {
                console.error('[Admin] Points update failed:', e);
                toast(`✅ تم تحديث حالة الطلب #${orderId.replace('id_','')}`);
            }
        } else {
            toast(`✅ تم تحديث حالة الطلب #${orderId.replace('id_','')}`);
        }
        // ─────────────────────────────────────────────────────

        // Update the card in-place without re-filtering
        // so it stays visible regardless of the active filter
        const card = document.querySelector(`.order-card[data-id="${orderId}"]`);
        if (card) {
            // Update state class
            card.className = card.className.replace(/state-\d+/g, '').trim();
            card.classList.add(`state-${newState}`);

            // Update state badge text + color
            const badge = card.querySelector('.oc-state');
            if (badge) {
                badge.className = `oc-state state-badge-${newState}`;
                badge.textContent = STATE_LABELS[newState] || newState;
            }

            // Rebuild action buttons (they change based on state)
            const actionsDiv = card.querySelector('.oc-actions');
            if (actionsDiv && hasPerm('orders')) {
                const order = allOrders[orderId];
                const key   = orderId;
                // Remove old state-change buttons, keep driver assign
                // Remove state, locate AND track buttons — rebuild all in correct fixed order
                actionsDiv.querySelectorAll('[data-state], [data-locate], [data-trackorder]').forEach(b => b.remove());

                // Rebuild all 4 state buttons matching the driver page
                const btnDefs = [
                    { val:'0', label:'🔵 جديد',        cls: ' btn-new'       + (newState==='0' ? ' btn-new--active' : ''), title:'إعادة الطلب لحالة جديد' },
                    { val:'1', label:'✅ وُصِّل',       cls: ' btn-delivered' + (newState==='1' ? ' btn-delivered--active' : ''), title:'تم التوصيل' },
                    { val:'3', label:'⏳ متأخر',        cls: ' btn-late'      + (newState==='3' ? ' btn-late--active' : ''), title:'تأخير الطلب' },
                    { val:'2', label:'✕ ملغي',         cls: ' btn-cancelled' + (newState==='2' ? ' btn-cancelled--active' : ''), title:'إلغاء الطلب' },
                    { val:'8', label:'✅ جاهز',         cls: ' btn-ready'     + (newState==='8' ? ' btn-ready--active' : ''), title:'الطلب جاهز للتسليم للسائق' },
                ];
                btnDefs.forEach(({ val, label, cls, title }) => {
                    const b = document.createElement('button');
                    b.className = `oc-action-btn${cls}`;
                    b.dataset.state = key;
                    b.dataset.val   = val;
                    b.textContent   = label;
                    if (title) b.title = title;
                    b.addEventListener('click', async () => await changeState(key, val));
                    actionsDiv.appendChild(b);
                });
                if (order.lat && order.lat !== '0') {
                    const [fLat, fLng] = _fixSwappedLatLng(parseFloat(order.lat), parseFloat(order.lng));
                    const b = document.createElement('button');
                    b.className       = 'oc-action-btn';
                    b.dataset.locate  = `${fLat},${fLng}`;
                    b.textContent     = '🗺 الخريطة';
                    b.addEventListener('click', () => {
                        const [lat, lng] = b.dataset.locate.split(',').map(Number);
                        if (adminMap) { switchPanel('map'); setTimeout(() => adminMap.setView([lat, lng], 16), 150); }
                    });
                    actionsDiv.appendChild(b);
                }

                // Track button — always last, fixed position
                const newSt   = allOrders[orderId]?.state || '0';
                const trackBtn = document.createElement('button');
                const isTracked = allOrders[orderId]?.trackorder == 1;
                const trackDisabled = ['1','2','6','7'].includes(newSt);
                trackBtn.className = 'oc-action-btn btn-track' + (isTracked && !trackDisabled ? ' btn-track--active' : '');
                trackBtn.textContent = '📡 ' + (isTracked && !trackDisabled ? 'إيقاف التتبع' : 'تفعيل التتبع');
                if (trackDisabled) {
                    trackBtn.disabled = true;
                    trackBtn.style.cssText = 'opacity:.4;cursor:not-allowed;';
                    trackBtn.title = ['1','2'].includes(newSt) ? 'الطلب منتهٍ' : 'بانتظار المتجر';
                } else {
                    trackBtn.dataset.trackorder = orderId;
                    trackBtn.addEventListener('click', async () => {
                        const cur    = allOrders[orderId]?.trackorder;
                        const curSt  = allOrders[orderId]?.state || '0';
                        if (['1','2'].includes(curSt)) { toast('الطلب منتهٍ', true); return; }
                        if (['6','7'].includes(curSt))     { toast('بانتظار المتجر', true); return; }
                        const newVal = (cur == 1) ? '0' : '1';
                        const uid2   = allOrders[orderId]?.delivryplusid;
                        const upd    = {};
                        upd[`/requests/${orderId}/trackorder`] = newVal;
                        if (uid2) upd[`/historyRequests/${uid2}/${orderId}/trackorder`] = newVal;
                        allOrders[orderId].trackorder = newVal;
                        await fbUpdate('', upd);
                        toast(newVal === '1' ? '📡 تم تفعيل التتبع' : '🔴 تم إيقاف التتبع');
                        if (newVal === '1') _notifyCustomerTrackingWhatsapp(orderId, allOrders[orderId]);
                        const c2 = document.querySelector(`.order-card[data-id="${orderId}"]`);
                        if (c2) { const exp = c2.classList.contains('expanded'); c2.replaceWith(buildOrderCard(orderId, allOrders[orderId])); if (exp) document.querySelector(`.order-card[data-id="${orderId}"]`)?.classList.add('expanded'); }
                    });
                }
                actionsDiv.appendChild(trackBtn);

                // Archive/Unarchive button — always last
                const archBtn = document.createElement('button');
                const isClosed2 = allOrders[orderId]?.vault == 1;
                archBtn.className = 'oc-action-btn';
                archBtn.style.cssText = 'border-color:rgba(156,163,175,0.4);color:#9ca3af;';
                archBtn.textContent = isClosed2 ? '↩ استعادة' : '📦 أرشفة';
                archBtn.dataset[isClosed2 ? 'unarchive' : 'archive'] = orderId;
                archBtn.addEventListener('click', async () => {
                    const newVault = isClosed2 ? '0' : '1';
                    const uid3 = allOrders[orderId]?.delivryplusid;
                    const upd3 = {};
                    upd3[`/requests/${orderId}/vault`] = newVault;
                    if (uid3) upd3[`/historyRequests/${uid3}/${orderId}/vault`] = newVault;
                    allOrders[orderId].vault = newVault;
                    await fbUpdate('', upd3);
                    toast(newVault === '1' ? '📦 تم أرشفة الطلب' : '✅ تمت استعادة الطلب');
                    const c3 = document.querySelector(`.order-card[data-id="${orderId}"]`);
                    if (c3) c3.remove();
                    renderMap();
                });
                actionsDiv.appendChild(archBtn);
            }
        } else {
            renderOrders();
        }
        updateTopbarStats();
        updateNavBadge();
    } catch(e) { toast('خطأ في تحديث الحالة', true); }
}

// Stop live tracking for every currently-delivered order in one shot —
// same auto-stop rule as changeState()/archive/driver-app, but as a manual
// sweep for orders that were already delivered before this fix existed
// (or any edge case where trackorder got left on).
async function stopAllDeliveredTracking() {
    const targets = Object.keys(allOrders).filter(id => {
        const o = allOrders[id];
        return o && (o.state === '1') && (o.trackorder == 1);
    });
    if (!targets.length) { toast('لا توجد طلبات موصّلة قيد التتبع'); return; }
    try {
        const updates = {};
        targets.forEach(id => {
            const uid = allOrders[id]?.delivryplusid;
            updates[`/requests/${id}/trackorder`] = '0';
            updates[`/requests/${id}/driverid`]   = null;
            if (uid) {
                updates[`/historyRequests/${uid}/${id}/trackorder`] = '0';
                updates[`/historyRequests/${uid}/${id}/driverid`]   = null;
            }
            allOrders[id].trackorder = '0';
        });
        await fbUpdate('', updates);
        toast(`🔴 تم إيقاف التتبع لـ ${targets.length} طلب موصّل`);
        targets.forEach(id => {
            const card = document.querySelector(`.order-card[data-id="${id}"]`);
            if (card) {
                const expanded = card.classList.contains('expanded');
                card.replaceWith(buildOrderCard(id, allOrders[id]));
                if (expanded) document.querySelector(`.order-card[data-id="${id}"]`)?.classList.add('expanded');
            }
        });
        renderMap();
    } catch (e) {
        console.error('[Admin] stopAllDeliveredTracking failed:', e);
        toast('خطأ في إيقاف التتبع الجماعي', true);
    }
}
const _stopAllTrackBtn = document.getElementById('stop-all-delivered-track-btn');
if (_stopAllTrackBtn) _stopAllTrackBtn.addEventListener('click', stopAllDeliveredTracking);

async function markRead(orderId) {
    try {
        await fbSet(`requests/${orderId}/read`, '1');
        if (allOrders[orderId]) allOrders[orderId].read = '1';
        updateNavBadge();
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DRIVERS PANEL
// ═══════════════════════════════════════════════════════════════
const VEHICLE_LABELS = {
    motorcycle: { emoji: '🛵', label: 'دراجة نارية' },
    car:        { emoji: '🚗', label: 'سيارة' },
    tuktuk:     { emoji: '🛺', label: 'توك توك' },
    bicycle:    { emoji: '🚲', label: 'دراجة هوائية' },
};

function renderDrivers() {
    const grid    = document.getElementById('drivers-grid');
    const countEl = document.getElementById('drivers-count-label');
    grid.innerHTML = '';

    let drivers = allDrivers.filter(d => d);

    // Filter by status
    if (driverFilter === 'pending') {
        drivers = drivers.filter(d => d.active !== true);
    } else {
        if (driverFilter !== 'all') {
            drivers = drivers.filter(d => (d.status || 'offline') === driverFilter);
        }
        // Inactive (not-yet-approved or deactivated) drivers are hidden
        // from the main list by default — the "قيد المراجعة" pill above
        // is the dedicated place to review them — unless the admin
        // flips the "إظهار السائقين غير المفعّلين" switch on.
        if (!showInactiveDrivers) {
            drivers = drivers.filter(d => d.active === true);
        }
    }
    // Search by name/username
    if (driverSearch) {
        const q = driverSearch.toLowerCase();
        drivers = drivers.filter(d =>
            (d.owner || '').toLowerCase().includes(q) ||
            (d.username || '').toLowerCase().includes(q) ||
            (d.deviceUUID || '').toLowerCase().includes(q)
        );
    }

    countEl.textContent = `${drivers.length} سائق`;

    if (!drivers.length) {
        grid.innerHTML = '<div class="empty-state" style="padding:60px;flex:1;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>لا يوجد سائقون</p></div>';
        return;
    }

    // Count orders per driver
    const driverOrders = {};
    Object.values(allOrders).forEach(o => {
        if (o.driver && o.driver !== '0') {
            driverOrders[o.driver] = (driverOrders[o.driver] || 0) + 1;
        }
    });

    drivers.forEach((d) => {
        const online   = d.status === 'online';
        const isActive = d.active === true;
        const isPending = !isActive;
        const name     = d.owner || d.username || '—';
        const ordCount = driverOrders[d.owner] || driverOrders[d.username] || 0;
        const hasLoc   = !!(d.location?.lat);
        const avatarLetter = name[0].toUpperCase();
        const lastSeen = d.location?.timestamp
            ? new Date(d.location.timestamp).toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'})
            : '—';
        const vehicle  = VEHICLE_LABELS[d.vehicleType] || null;
        const hasAddress = !!(d.address?.lat && d.address?.lng);

        const card = document.createElement('div');
        card.className = `driver-card${online ? ' online' : ''}${isPending ? ' pending-review' : ''}`;
        card.innerHTML = `
            ${isPending ? `<div class="dc-pending-tag">🆕 قيد المراجعة — لم يُفعَّل بعد</div>` : ''}
            <div class="dc-top">
                <div class="dc-avatar">
                    ${avatarLetter}
                    <div class="dc-online-dot${online ? ' on' : ''}"></div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div class="dc-name">${name}</div>
                    ${d.username ? `<div class="dc-sub">@${d.username}</div>` : ''}
                    ${d.phone ? `<div class="dc-phone" dir="ltr">📞 ${formatPhone(d.phone)}</div>` : ''}
                </div>
                <span style="font-size:0.62rem;padding:2px 8px;border-radius:50px;font-weight:800;
                    background:${online ? 'var(--green-glow)' : 'var(--surface3)'};
                    color:${online ? 'var(--green)' : 'var(--gray)'};">
                    ${online ? 'متصل' : 'غير متصل'}
                </span>
            </div>
            ${vehicle || hasAddress ? `
            <div class="dc-info-row">
                ${vehicle ? `<span class="dc-info-pill">${vehicle.emoji} ${vehicle.label}</span>` : ''}
                ${hasAddress ? `<span class="dc-info-pill dc-address-pill" data-lat="${d.address.lat}" data-lng="${d.address.lng}" style="cursor:pointer;">🏠 عنوان السائق</span>` : ''}
            </div>` : ''}
            <div class="dc-uuid-row">
                <span class="dc-uuid-label">UUID</span>
                ${d.deviceUUID
                    ? `<span class="dc-uuid-val" title="${d.deviceUUID}">${d.deviceUUID}</span>
                       <button class="dc-uuid-copy" title="نسخ UUID" data-uuid="${d.deviceUUID}">&#9112;</button>`
                    : '<span class="dc-uuid-none">غير مرتبط</span>'
                }
            </div>
            <div class="dc-stats">
                <div class="dc-stat">
                    <div class="dc-stat-val">${ordCount}</div>
                    <div class="dc-stat-label">طلبات معينة</div>
                </div>
                <div class="dc-stat">
                    <div class="dc-stat-val" style="font-size:0.75rem;">${hasLoc ? lastSeen : '—'}</div>
                    <div class="dc-stat-label">آخر موقع</div>
                </div>
            </div>
            ${hasLoc
                ? `<button class="dc-locate-btn" data-lat="${d.location.lat}" data-lng="${d.location.lng}">📍 عرض على الخريطة</button>`
                : '<div style="margin-top:8px;font-size:0.7rem;color:var(--gray);text-align:center;">لا يوجد موقع</div>'
            }
            ${(d.idImage || d.licenseImage) ? `
            <div class="dc-docs">
                ${d.idImage ? `
                <div class="dc-doc-thumb" data-src="${d.idImage}" title="صورة الهوية — اضغط للتكبير">
                    <img src="${d.idImage}" alt="ID">
                    <span class="dc-doc-label">🪪 الهوية</span>
                </div>` : `<div class="dc-doc-thumb dc-doc-thumb--empty">🪪 لا توجد صورة هوية</div>`}
                ${d.licenseImage ? `
                <div class="dc-doc-thumb" data-src="${d.licenseImage}" title="رخصة القيادة — اضغط للتكبير">
                    <img src="${d.licenseImage}" alt="License">
                    <span class="dc-doc-label">🚘 الرخصة</span>
                </div>` : `<div class="dc-doc-thumb dc-doc-thumb--empty">🚘 لا توجد صورة رخصة</div>`}
            </div>` : isPending ? `
            <div class="dc-docs">
                <div class="dc-doc-thumb dc-doc-thumb--empty">🪪 لا توجد صورة هوية</div>
                <div class="dc-doc-thumb dc-doc-thumb--empty">🚘 لا توجد صورة رخصة</div>
            </div>` : ''}
            ${isPending ? `
            <button class="dc-activate-btn" data-driver-key="${d._key}">
                ✅ تفعيل السائق — السماح باستلام الطلبات
            </button>` : ''}
            <div class="dc-actions">
                <button class="dc-edit-btn" data-driver-key="${d._key}">
                    ✏️ تعديل البيانات
                </button>
                <button class="dc-testpush-btn" data-driver-key="${d._key}" data-driver-name="${name}" title="إرسال إشعار تجريبي">🔔</button>
                ${isActive ? `<button class="dc-deactivate-btn" data-driver-key="${d._key}" title="إلغاء التفعيل">⏸ إلغاء التفعيل</button>` : ''}
                <button class="dc-delete-btn" data-driver-key="${d._key}" title="حذف السائق">🗑</button>
            </div>
        `;
        card.querySelector('.dc-testpush-btn').addEventListener('click', (e) => {
            const key = e.currentTarget.dataset.driverKey;
            sendTestPush(key, e.currentTarget.dataset.driverName);
        });
        if (hasLoc) {
            card.querySelector('.dc-locate-btn').addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.dataset.lat);
                const lng = parseFloat(e.currentTarget.dataset.lng);
                switchPanel('map');
                setTimeout(() => adminMap && adminMap.setView([lat, lng], 16), 150);
            });
        }
        const addrPill = card.querySelector('.dc-address-pill');
        if (addrPill) {
            addrPill.addEventListener('click', (e) => {
                const lat = parseFloat(e.currentTarget.dataset.lat);
                const lng = parseFloat(e.currentTarget.dataset.lng);
                switchPanel('map');
                setTimeout(() => adminMap && adminMap.setView([lat, lng], 16), 150);
            });
        }
        card.querySelectorAll('.dc-doc-thumb[data-src]').forEach(thumb => {
            thumb.addEventListener('click', () => openImagePreview(thumb.dataset.src));
        });
        const uuidCopyBtn = card.querySelector('.dc-uuid-copy');
        if (uuidCopyBtn) {
            uuidCopyBtn.addEventListener('click', () => {
                const uuid = uuidCopyBtn.dataset.uuid;
                if (!uuid) return;
                navigator.clipboard.writeText(uuid).then(() => {
                    const orig = uuidCopyBtn.textContent;
                    uuidCopyBtn.textContent = '✓';
                    uuidCopyBtn.style.color = 'var(--green)';
                    setTimeout(() => {
                        uuidCopyBtn.textContent = orig;
                        uuidCopyBtn.style.color = '';
                    }, 1500);
                }).catch(() => toast('فشل النسخ'));
            });
        }
        const activateBtn = card.querySelector('.dc-activate-btn');
        if (activateBtn) activateBtn.addEventListener('click', () => activateDriver(d));
        const deactivateBtn = card.querySelector('.dc-deactivate-btn');
        if (deactivateBtn) deactivateBtn.addEventListener('click', () => deactivateDriver(d));
        card.querySelector('.dc-edit-btn').addEventListener('click', () => openDriverEditModal(d));
        card.querySelector('.dc-delete-btn').addEventListener('click', () => deleteDriver(d));
        grid.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════════
// DRIVER EDIT / ADD / DELETE
// ═══════════════════════════════════════════════════════════════