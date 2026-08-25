function openStoreLocationModal(storeName, storeType, initLat, initLng) {
    const stale = document.getElementById('sl-modal-overlay');
    if (stale) stale.remove();

    // Default center: Zahlé, Lebanon
    const DEFAULT_LAT = 33.8469;
    const DEFAULT_LNG = 35.9017;
    // A store's saved location only counts if BOTH coordinates are real
    // numbers — treating one present coordinate as "has a location" (the
    // old `initLat ? ... : ...` checks below did this) crashed here
    // whenever a store had only lat or only lng saved (e.g. from a
    // partial/interrupted edit), and would silently center the map on a
    // mismatched lat/lng pair even when it didn't crash.
    const hasLoc  = typeof initLat === 'number' && typeof initLng === 'number' && !isNaN(initLat) && !isNaN(initLng);
    const startLat = hasLoc ? initLat : DEFAULT_LAT;
    const startLng = hasLoc ? initLng : DEFAULT_LNG;

    // Larger map on PC screens, but capped to what the actual window can
    // fit — a bare fixed height here was pushing the whole box past its
    // own max-height:90vh on shorter/unmaximized windows, and since the
    // box clips overflow, the save/cancel/clear button row was getting
    // pushed off the bottom with no scrollbar to reach it. Reserve room
    // for the header + coordinate inputs + footer (all fixed-height)
    // plus the overlay's own padding, and never let the map claim more
    // than what's left over.
    const _slDesktop      = window.innerWidth >= 900;
    const _slBoxMaxWidth  = _slDesktop ? '920px' : '560px';
    const _slReservedChrome = 260; // header + lat/lng row + footer + overlay padding
    const _slMapTarget    = _slDesktop ? 560 : 280;
    const _slMapMinHeight = Math.max(180, Math.min(_slMapTarget, window.innerHeight - _slReservedChrome));

    const overlay = document.createElement('div');
    overlay.id = 'sl-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML = `
    <div id="sl-box" style="background:var(--surface);border:1px solid var(--border);border-radius:20px;width:100%;max-width:${_slBoxMaxWidth};font-family:var(--font);direction:rtl;display:flex;flex-direction:column;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div>
                <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0 0 2px;">📍 تحديد موقع المتجر</h3>
                <div style="font-size:0.75rem;color:var(--gray);">${storeName}</div>
            </div>
            <button id="sl-close-x" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
        </div>

        <div style="padding:14px 20px 10px;flex-shrink:0;">
            <div style="font-size:0.72rem;color:var(--gray);margin-bottom:8px;">انقر على الخريطة لتحديد الموقع، أو أدخل الإحداثيات يدوياً</div>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;">
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط العرض (Lat)</label>
                    <input id="sl-lat" type="number" step="0.000001" placeholder="33.846900"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط الطول (Lng)</label>
                    <input id="sl-lng" type="number" step="0.000001" placeholder="35.901700"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <button id="sl-jump-btn" style="margin-top:16px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--white);font-size:0.78rem;font-family:inherit;cursor:pointer;white-space:nowrap;" title="انتقل إلى الإحداثيات">↗ انتقل</button>
            </div>
            ${hasLoc ? `<div id="sl-current-loc" style="margin-top:8px;font-size:0.7rem;color:var(--gray);">الموقع الحالي: <span style="color:var(--orange);font-family:var(--mono);">${initLat.toFixed(6)}, ${initLng.toFixed(6)}</span></div>` : '<div id="sl-current-loc" style="margin-top:8px;font-size:0.7rem;color:rgba(239,68,68,0.8);">⚠ لا يوجد موقع محدد لهذا المتجر</div>'}
        </div>

        <div id="sl-map-container" style="flex:1;min-height:${_slMapMinHeight}px;position:relative;">
            <div id="sl-map" style="width:100%;height:100%;min-height:${_slMapMinHeight}px;"></div>
            <div id="sl-pin-hint" style="position:absolute;bottom:10px;right:50%;transform:translateX(50%);background:rgba(0,0,0,0.65);color:#fff;font-size:0.7rem;padding:5px 12px;border-radius:50px;pointer-events:none;z-index:999;white-space:nowrap;">انقر لتحديد الموقع</div>
        </div>

        <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0;">
            <button id="sl-clear-btn" style="background:var(--surface2);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:10px 14px;color:#ef4444;font-family:inherit;font-size:0.82rem;font-weight:700;cursor:pointer;">🗑 مسح الموقع</button>
            <button id="sl-cancel-btn" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:10px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="sl-save-btn" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:10px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">💾 حفظ الموقع</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // ── Init Leaflet map ───────────────────────────────────────
    const slMap = L.map('sl-map', { zoomControl: true }).setView([startLat, startLng], hasLoc ? 16 : 13);

    // Same standard/satellite pair used everywhere else on the site (e.g.
    // the customer address picker in cart.js) — satellite makes it much
    // easier to line the pin up with the actual store building, with a
    // one-tap toggle back to the street map for road/landmark names.
    const SL_GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
    const slStandardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    });
    const slSatelliteLayer = L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${SL_GOOGLE_KEY}`,
        { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
    );
    let _slCurrentLayer = 'satellite';
    slSatelliteLayer.addTo(slMap);

    const slToggleCtrl = L.control({ position: 'topright' });
    slToggleCtrl.onAdd = function() {
        const btn = L.DomUtil.create('button', '');
        btn.innerHTML = '🗺 خريطة';
        btn.style.cssText = 'background:#fff;border:2px solid #FF5C00;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;color:#FF5C00;box-shadow:0 1px 5px rgba(0,0,0,0.3);white-space:nowrap;';
        L.DomEvent.on(btn, 'click', function(e) {
            L.DomEvent.stopPropagation(e);
            if (_slCurrentLayer === 'satellite') {
                slMap.removeLayer(slSatelliteLayer);
                slStandardLayer.addTo(slMap);
                _slCurrentLayer = 'standard';
                btn.innerHTML = '🛰 صورة جوية';
            } else {
                slMap.removeLayer(slStandardLayer);
                slSatelliteLayer.addTo(slMap);
                _slCurrentLayer = 'satellite';
                btn.innerHTML = '🗺 خريطة';
            }
        });
        return btn;
    };
    slToggleCtrl.addTo(slMap);

    // Custom orange pin icon
    const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:var(--orange,#FF5C00);border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
    });

    let slMarker = null;
    let selectedLat = initLat;
    let selectedLng = initLng;

    // Place initial marker if coordinates exist
    if (hasLoc) {
        slMarker = L.marker([initLat, initLng], { icon: pinIcon, draggable: true }).addTo(slMap);
        _slBindMarkerDrag(slMarker);
        document.getElementById('sl-lat').value = initLat.toFixed(6);
        document.getElementById('sl-lng').value = initLng.toFixed(6);
    }

    function _slBindMarkerDrag(marker) {
        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            selectedLat = pos.lat;
            selectedLng = pos.lng;
            document.getElementById('sl-lat').value = pos.lat.toFixed(6);
            document.getElementById('sl-lng').value = pos.lng.toFixed(6);
        });
    }

    function _slSetMarker(lat, lng) {
        selectedLat = lat;
        selectedLng = lng;
        document.getElementById('sl-lat').value = lat.toFixed(6);
        document.getElementById('sl-lng').value = lng.toFixed(6);
        if (slMarker) {
            slMarker.setLatLng([lat, lng]);
        } else {
            slMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(slMap);
            _slBindMarkerDrag(slMarker);
        }
        document.getElementById('sl-pin-hint').style.display = 'none';
    }

    // Click on map → place/move marker
    slMap.on('click', (e) => {
        _slSetMarker(e.latlng.lat, e.latlng.lng);
    });

    // Jump button — pan map to manually typed coords
    document.getElementById('sl-jump-btn').addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('sl-lat').value);
        const lng = parseFloat(document.getElementById('sl-lng').value);
        if (isNaN(lat) || isNaN(lng)) { toast('أدخل إحداثيات صحيحة', true); return; }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { toast('الإحداثيات خارج النطاق', true); return; }
        _slSetMarker(lat, lng);
        slMap.setView([lat, lng], 16);
    });

    // Close helpers
    const _slOnResize = () => {
        const box = document.getElementById('sl-box');
        const container = document.getElementById('sl-map-container');
        const mapDiv = document.getElementById('sl-map');
        if (!box || !container || !mapDiv) return;
        const desktop = window.innerWidth >= 900;
        box.style.maxWidth = desktop ? '920px' : '560px';
        const target = desktop ? 560 : 280;
        const h = Math.max(180, Math.min(target, window.innerHeight - 260)) + 'px';
        container.style.minHeight = h;
        mapDiv.style.minHeight = h;
        slMap.invalidateSize();
    };
    window.addEventListener('resize', _slOnResize);
    const close = () => { window.removeEventListener('resize', _slOnResize); slMap.remove(); overlay.remove(); };
    document.getElementById('sl-close-x').addEventListener('click', close);
    document.getElementById('sl-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Clear location
    document.getElementById('sl-clear-btn').addEventListener('click', async () => {
        if (!confirm(`مسح موقع "${storeName}" من قاعدة البيانات؟`)) return;
        const btn = document.getElementById('sl-clear-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            await _storeSetField(storeName, storeType, 'lat', null);
            await _storeSetField(storeName, storeType, 'lng', null);
            toast(`🗑 تم مسح موقع ${storeName}`);
            await _refreshStoresData();
            close();
        } catch(e) {
            toast('فشل المسح: ' + e.message, true);
            btn.disabled = false; btn.textContent = '🗑 مسح الموقع';
        }
    });

    // Save location
    document.getElementById('sl-save-btn').addEventListener('click', async () => {
        if (selectedLat === null || selectedLng === null) {
            toast('انقر على الخريطة لتحديد الموقع أولاً', true); return;
        }
        const btn = document.getElementById('sl-save-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            await _storeSetField(storeName, storeType, 'lat', parseFloat(selectedLat.toFixed(6)));
            await _storeSetField(storeName, storeType, 'lng', parseFloat(selectedLng.toFixed(6)));
            toast(`✅ تم حفظ موقع ${storeName}`);
            await _refreshStoresData();
            close();
        } catch(e) {
            toast('فشل الحفظ: ' + e.message, true);
            btn.disabled = false; btn.textContent = '💾 حفظ الموقع';
        }
    });

    // Fix Leaflet tile sizing after modal animation
    setTimeout(() => slMap.invalidateSize(), 120);
}

// ══ DELIVO CENTER (HQ) LOCATION MODAL ══════════════════════════
// Same pattern as openStoreLocationModal, but for the single fixed
// settings/deliveryCenter = { lat, lng } record shown on the live map.
function openCenterLocationModal(initLat, initLng) {
    const stale = document.getElementById('cl-modal-overlay');
    if (stale) stale.remove();

    const DEFAULT_LAT = 33.8469;
    const DEFAULT_LNG = 35.9017;
    const startLat = initLat || DEFAULT_LAT;
    const startLng = initLng || DEFAULT_LNG;

    const overlay = document.createElement('div');
    overlay.id = 'cl-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML = `
    <div id="cl-box" style="background:var(--surface);border:1px solid var(--border);border-radius:20px;width:100%;max-width:560px;font-family:var(--font);direction:rtl;display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div>
                <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0 0 2px;">🏢 تحديد موقع مركز Delivo</h3>
                <div style="font-size:0.75rem;color:var(--gray);">المقر الرئيسي — يظهر على الخريطة المباشرة</div>
            </div>
            <button id="cl-close-x" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
        </div>

        <div style="padding:14px 20px 10px;flex-shrink:0;">
            <div style="font-size:0.72rem;color:var(--gray);margin-bottom:8px;">انقر على الخريطة لتحديد الموقع، أو أدخل الإحداثيات يدوياً</div>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;">
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط العرض (Lat)</label>
                    <input id="cl-lat" type="number" step="0.000001" placeholder="33.846900"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط الطول (Lng)</label>
                    <input id="cl-lng" type="number" step="0.000001" placeholder="35.901700"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <button id="cl-jump-btn" style="margin-top:16px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--white);font-size:0.78rem;font-family:inherit;cursor:pointer;white-space:nowrap;" title="انتقل إلى الإحداثيات">↗ انتقل</button>
            </div>
            ${initLat ? `<div id="cl-current-loc" style="margin-top:8px;font-size:0.7rem;color:var(--gray);">الموقع الحالي: <span style="color:var(--orange);font-family:var(--mono);">${initLat.toFixed(6)}, ${initLng.toFixed(6)}</span></div>` : '<div id="cl-current-loc" style="margin-top:8px;font-size:0.7rem;color:rgba(239,68,68,0.8);">⚠ لا يوجد موقع محدد لمركز Delivo بعد</div>'}

            <div style="margin-top:12px;display:flex;align-items:center;gap:10px;">
                <div style="flex:1;">
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">نطاق التغطية (كم) — خارجه تُرفض الطلبات تلقائياً</label>
                    <input id="cl-radius" type="number" step="0.5" min="0.5" value="${deliveryRadiusKm || 7}"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
            </div>
        </div>

        <div id="cl-map-container" style="flex:1;min-height:280px;position:relative;">
            <div id="cl-map" style="width:100%;height:100%;min-height:280px;"></div>
            <div id="cl-pin-hint" style="position:absolute;bottom:10px;right:50%;transform:translateX(50%);background:rgba(0,0,0,0.65);color:#fff;font-size:0.7rem;padding:5px 12px;border-radius:50px;pointer-events:none;z-index:999;white-space:nowrap;">انقر لتحديد الموقع</div>
        </div>

        <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0;">
            <button id="cl-clear-btn" style="background:var(--surface2);border:1px solid rgba(239,68,68,0.4);border-radius:12px;padding:10px 14px;color:#ef4444;font-family:inherit;font-size:0.82rem;font-weight:700;cursor:pointer;">🗑 مسح الموقع</button>
            <button id="cl-cancel-btn" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:10px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="cl-save-btn" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:10px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">💾 حفظ الموقع</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // ── Init Leaflet map ───────────────────────────────────────
    const clMap = L.map('cl-map', { zoomControl: true }).setView([startLat, startLng], initLat ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    }).addTo(clMap);

    // Custom purple building pin — distinct from the orange store pin
    const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#8b5cf6;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
                   <span style="transform:rotate(45deg);font-size:14px;">🏢</span>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
    });

    let clMarker = null;
    let clCircle = null;
    let selectedLat = initLat;
    let selectedLng = initLng;

    function _clRadiusKm() {
        const v = parseFloat(document.getElementById('cl-radius')?.value);
        return (!isNaN(v) && v > 0) ? v : 7;
    }

    function _clRefreshCircle(lat, lng) {
        const radiusM = _clRadiusKm() * 1000;
        if (clCircle) {
            clCircle.setLatLng([lat, lng]);
            clCircle.setRadius(radiusM);
        } else {
            clCircle = L.circle([lat, lng], {
                radius: radiusM, color: '#8b5cf6', weight: 2,
                dashArray: '6,8', fillColor: '#8b5cf6', fillOpacity: 0.06,
            }).addTo(clMap);
        }
    }

    // Place initial marker + coverage circle preview if coordinates exist
    if (initLat && initLng) {
        clMarker = L.marker([initLat, initLng], { icon: pinIcon, draggable: true }).addTo(clMap);
        _clBindMarkerDrag(clMarker);
        document.getElementById('cl-lat').value = initLat.toFixed(6);
        document.getElementById('cl-lng').value = initLng.toFixed(6);
        _clRefreshCircle(initLat, initLng);
    }

    const clRadiusInput = document.getElementById('cl-radius');
    if (clRadiusInput) {
        clRadiusInput.addEventListener('input', () => {
            if (selectedLat != null && selectedLng != null) _clRefreshCircle(selectedLat, selectedLng);
        });
    }

    function _clBindMarkerDrag(marker) {
        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            selectedLat = pos.lat;
            selectedLng = pos.lng;
            document.getElementById('cl-lat').value = pos.lat.toFixed(6);
            document.getElementById('cl-lng').value = pos.lng.toFixed(6);
            _clRefreshCircle(pos.lat, pos.lng);
        });
    }

    function _clSetMarker(lat, lng) {
        selectedLat = lat;
        selectedLng = lng;
        document.getElementById('cl-lat').value = lat.toFixed(6);
        document.getElementById('cl-lng').value = lng.toFixed(6);
        if (clMarker) {
            clMarker.setLatLng([lat, lng]);
        } else {
            clMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(clMap);
            _clBindMarkerDrag(clMarker);
        }
        _clRefreshCircle(lat, lng);
        document.getElementById('cl-pin-hint').style.display = 'none';
    }

    // Click on map → place/move marker
    clMap.on('click', (e) => {
        _clSetMarker(e.latlng.lat, e.latlng.lng);
    });

    // Jump button — pan map to manually typed coords
    document.getElementById('cl-jump-btn').addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('cl-lat').value);
        const lng = parseFloat(document.getElementById('cl-lng').value);
        if (isNaN(lat) || isNaN(lng)) { toast('أدخل إحداثيات صحيحة', true); return; }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { toast('الإحداثيات خارج النطاق', true); return; }
        _clSetMarker(lat, lng);
        clMap.setView([lat, lng], 16);
    });

    // Close helpers
    const close = () => { clMap.remove(); overlay.remove(); };
    document.getElementById('cl-close-x').addEventListener('click', close);
    document.getElementById('cl-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Clear location
    document.getElementById('cl-clear-btn').addEventListener('click', async () => {
        if (!confirm('مسح موقع مركز Delivo من قاعدة البيانات؟')) return;
        const btn = document.getElementById('cl-clear-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            await fbSet('settings/deliveryCenter', null);
            deliveryCenterLoc = null;
            deliveryRadiusKm  = 7;
            _updateCenterLocDisplay();
            if (adminMap) renderMap();
            toast('🗑 تم مسح موقع مركز Delivo');
            close();
        } catch(e) {
            toast('فشل المسح: ' + e.message, true);
            btn.disabled = false; btn.textContent = '🗑 مسح الموقع';
        }
    });

    // Save location
    document.getElementById('cl-save-btn').addEventListener('click', async () => {
        if (selectedLat === null || selectedLat === undefined || selectedLng === null || selectedLng === undefined) {
            toast('انقر على الخريطة لتحديد الموقع أولاً', true); return;
        }
        const btn = document.getElementById('cl-save-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            const lat      = parseFloat(selectedLat.toFixed(6));
            const lng      = parseFloat(selectedLng.toFixed(6));
            const radiusKm = _clRadiusKm();
            await fbSet('settings/deliveryCenter', { lat, lng, radiusKm });
            deliveryCenterLoc = { lat, lng, radiusKm };
            deliveryRadiusKm  = radiusKm;
            _updateCenterLocDisplay();
            if (adminMap) renderMap();
            toast('✅ تم حفظ موقع ونطاق تغطية مركز Delivo');
            close();
        } catch(e) {
            toast('فشل الحفظ: ' + e.message, true);
            btn.disabled = false; btn.textContent = '💾 حفظ الموقع';
        }
    });

    // Fix Leaflet tile sizing after modal animation
    setTimeout(() => clMap.invalidateSize(), 120);
}

// ══ STORE TYPE EDITOR MODAL ════════════════════════════════════
async function openStoreTypeModal(storeName, currentTypes) {
    const stale = document.getElementById('stype-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'stype-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;';

    const ALL_T = [
        { key:'Restaurants',  label:'مطعم',       emoji:'🍔' },
        { key:'ButcherShops', label:'ملحمة',       emoji:'🥩' },
        { key:'BakeryShops',  label:'مخبز',        emoji:'🥖' },
        { key:'Markets',      label:'سوبرماركت',   emoji:'🛒' },
        { key:'GroceryShops', label:'بقالة',       emoji:'🧺' },
        { key:'SweetsShops',  label:'حلويات',      emoji:'🍰' },
        { key:'FishShops',    label:'أسماك',       emoji:'🐟' },
        { key:'CoffeeShops',  label:'قهوة',        emoji:'☕' },
        { key:'ChickenShops', label:'دجاج',        emoji:'🍗' },
        { key:'DairyShops',   label:'ألبان',       emoji:'🥛' },
        { key:'FlowerShops',  label:'زهور',        emoji:'💐' },
        { key:'TobaccoShops', label:'تبغ',         emoji:'🚬' },
        { key:'ToysShops',    label:'ألعاب',       emoji:'🧸' },
        { key:'Taxi',         label:'تاكسي',       emoji:'🚕' },
    ];

    const checkboxes = ALL_T.map(t => {
        const checked = currentTypes.includes(t.key) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;background:${checked?'rgba(255,92,0,0.1)':'transparent'};border:1.5px solid ${checked?'var(--orange)':'var(--border)'};transition:all .15s;" class="stype-lbl">
            <input type="checkbox" class="stype-cb" data-key="${t.key}" ${checked} style="accent-color:var(--orange);width:16px;height:16px;cursor:pointer;">
            <span style="font-size:1.1rem;">${t.emoji}</span>
            <span style="font-size:0.85rem;font-weight:700;color:var(--white);">${t.label}</span>
        </label>`;
    }).join('');

    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:440px;font-family:var(--font);direction:rtl;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0;">🏷 نوع المتجر — ${storeName}</h3>
            <button id="stype-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <p style="font-size:0.75rem;color:var(--gray);margin-bottom:16px;">اختر نوعاً واحداً أو أكثر — المتجر سيظهر في كل قسم محدد</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;" id="stype-grid">
            ${checkboxes}
        </div>
        <div id="stype-err" style="color:var(--red);font-size:0.78rem;margin-bottom:10px;display:none;">يجب اختيار نوع واحد على الأقل</div>
        <div style="display:flex;gap:10px;">
            <button id="stype-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:11px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="stype-save" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">💾 حفظ الأنواع</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    // Live highlight checkboxes
    overlay.querySelectorAll('.stype-lbl').forEach(lbl => {
        lbl.querySelector('input').addEventListener('change', function() {
            lbl.style.background = this.checked ? 'rgba(255,92,0,0.1)' : 'transparent';
            lbl.style.borderColor = this.checked ? 'var(--orange)' : 'var(--border)';
        });
    });

    const close = () => overlay.remove();
    document.getElementById('stype-close').onclick  = close;
    document.getElementById('stype-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('stype-save').onclick = async () => {
        const btn = document.getElementById('stype-save');
        const errEl = document.getElementById('stype-err');
        const selected = [...overlay.querySelectorAll('.stype-cb:checked')].map(cb => cb.dataset.key);

        if (!selected.length) { errEl.style.display='block'; return; }
        errEl.style.display = 'none';
        btn.disabled = true; btn.textContent = '…';

        try {
            // Fetch current full pattern once
            const pattern = await fbGet('pattern') || {};

            // Normalize to objects keyed by index
            const normalized = {};
            Object.entries(pattern).forEach(([type, list]) => {
                const arr = Array.isArray(list) ? list : Object.values(list);
                normalized[type] = arr.filter(Boolean);
            });

            // Get the store's current data from any of its existing types
            let storeData = null;
            const typesToRemove = [];
            Object.entries(normalized).forEach(([type, arr]) => {
                const idx = arr.findIndex(s => s && s.companyname === storeName);
                if (idx !== -1) {
                    if (!storeData) storeData = { ...arr[idx] };
                    if (!selected.includes(type)) typesToRemove.push({ type, idx });
                }
            });

            if (!storeData) { toast('لم يُعثر على بيانات المتجر', true); return; }

            const writes = [];

            // Remove from unselected types
            typesToRemove.forEach(({ type, idx }) => {
                const arr = normalized[type].filter((_, i) => i !== idx);
                const obj = Object.fromEntries(arr.map((v, i) => [i, v]));
                writes.push(fbSet(`pattern/${type}`, arr.length ? obj : null));
            });

            // Add to newly selected types (if not already there)
            selected.forEach(type => {
                const existing = normalized[type] || [];
                const alreadyIn = existing.some(s => s && s.companyname === storeName);
                if (!alreadyIn) {
                    const newArr = [...existing, { ...storeData }];
                    const obj = Object.fromEntries(newArr.map((v, i) => [i, v]));
                    writes.push(fbSet(`pattern/${type}`, obj));
                }
            });

            await Promise.all(writes);
            toast(`✅ تم تحديث أنواع ${storeName}`);
            close();
            await _refreshStoresData();
        } catch(e) {
            toast('فشل الحفظ: ' + e.message, true);
            btn.disabled = false; btn.textContent = '💾 حفظ الأنواع';
        }
    };
}

// ── Category / Sub-category Order Modal ────────────────────────
// Lets admin drag-reorder a store's main categories (catmain) and,
// per main category, its sub-categories (cat). Saved to
// settings/categoryOrder/{storeName} = { main: [...], sub: { mainName: [...] } }
let _coState = { mains: [], subsByMain: {}, activeMain: null, storeName: null };

async function openCategoryOrderModal(storeName) {
    const stale = document.getElementById('catorder-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'catorder-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:480px;font-family:var(--font);direction:rtl;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0;">🗂 ترتيب الأقسام — ${storeName}</h3>
            <button id="co-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <p style="font-size:0.75rem;color:var(--gray);margin-bottom:14px;">اسحب لإعادة ترتيب الأقسام كما تظهر للعميل في صفحة المتجر</p>
        <div id="co-body">
            <div style="text-align:center;color:var(--gray);font-size:0.8rem;padding:30px;">جارٍ التحميل…</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="co-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:11px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="co-save" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">💾 حفظ الترتيب</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('co-close').onclick  = close;
    document.getElementById('co-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Load items + saved order
    try {
        let items = await fbGet(`items/${storeName}`).catch(() => null);
        if (!items) items = await fbGet(`items/${storeName.toLowerCase()}`).catch(() => null);
        const savedOrder = await fbGet(`settings/categoryOrder/${storeName}`).catch(() => null);

        const tree = {};
        Object.values(items || {}).forEach(item => {
            if (!item || !item.name) return;
            const main = (item.catmain || 'عام').trim();
            const sub  = (item.cat    || 'عام').trim();
            if (!tree[main]) tree[main] = new Set();
            tree[main].add(sub);
        });

        if (!Object.keys(tree).length) {
            document.getElementById('co-body').innerHTML = `
                <div style="text-align:center;color:var(--gray);font-size:0.8rem;padding:30px;">لا توجد منتجات بعد لهذا المتجر — أضف منتجات أولاً لترتيب أقسامها</div>`;
            document.getElementById('co-save').style.display = 'none';
            return;
        }

        _coState.storeName = storeName;
        _coState.mains = _coSortByOrder(Object.keys(tree), savedOrder?.main);
        _coState.subsByMain = {};
        Object.entries(tree).forEach(([main, subSet]) => {
            _coState.subsByMain[main] = _coSortByOrder([...subSet], savedOrder?.sub?.[main]);
        });
        _coState.activeMain = _coState.mains[0];

        coRenderBody();
    } catch (e) {
        document.getElementById('co-body').innerHTML = `<div style="text-align:center;color:var(--red);font-size:0.8rem;padding:30px;">فشل تحميل البيانات</div>`;
    }

    document.getElementById('co-save').onclick = async () => {
        const btn = document.getElementById('co-save');
        coSyncFromDOM();
        const payload = { main: _coState.mains, sub: _coState.subsByMain };
        btn.disabled = true; btn.textContent = '…';
        try {
            await fbSet(`settings/categoryOrder/${storeName}`, payload);
            toast(`💾 تم حفظ ترتيب أقسام ${storeName}`);
            close();
        } catch (e) {
            toast('فشل الحفظ', true);
            btn.disabled = false; btn.textContent = '💾 حفظ الترتيب';
        }
    };
}

function _coSortByOrder(keys, orderList) {
    if (!Array.isArray(orderList) || !orderList.length) return [...keys].sort();
    const known   = orderList.filter(k => keys.includes(k));
    const unknown = keys.filter(k => !orderList.includes(k)).sort();
    return [...known, ...unknown];
}

/* Read current drag order from the DOM back into _coState */
function coSyncFromDOM() {
    const mainList = document.getElementById('co-main-list');
    if (mainList) {
        _coState.mains = [...mainList.querySelectorAll('.co-row')].map(r => r.dataset.name);
    }
    const subList = document.getElementById('co-sub-list');
    if (subList && _coState.activeMain) {
        _coState.subsByMain[_coState.activeMain] = [...subList.querySelectorAll('.co-row')].map(r => r.dataset.name);
    }
}

function coRowHTML(name, badge) {
    return `
    <div class="co-row" draggable="true" data-name="${name.replace(/"/g,'&quot;')}"
         style="display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:9px 12px;cursor:grab;">
        <span style="color:var(--gray);font-size:1rem;line-height:1;">⠿</span>
        <span style="flex:1;font-size:0.85rem;font-weight:700;color:var(--white);">${name}</span>
        ${badge || ''}
    </div>`;
}

function coRenderBody() {
    const body = document.getElementById('co-body');
    if (!body) return;

    const mainsHTML = _coState.mains.map(m => coRowHTML(m)).join('');
    const subs = _coState.subsByMain[_coState.activeMain] || [];
    const multiSub = subs.length > 1;
    const subsHTML = multiSub
        ? subs.map(s => coRowHTML(s)).join('')
        : `<div style="text-align:center;color:var(--gray);font-size:0.76rem;padding:14px;">هذا القسم لا يحتوي أقسام فرعية متعددة</div>`;

    const mainTabsHTML = _coState.mains.map(m => `
        <button class="co-main-tab ${m === _coState.activeMain ? 'active' : ''}" data-main="${m.replace(/"/g,'&quot;')}"
                style="padding:5px 12px;border-radius:50px;font-size:0.74rem;font-weight:700;cursor:pointer;border:1px solid ${m === _coState.activeMain ? 'var(--orange)' : 'var(--border)'};background:${m === _coState.activeMain ? 'rgba(255,92,0,0.12)' : 'var(--surface2)'};color:${m === _coState.activeMain ? 'var(--orange)' : 'var(--gray-light)'};white-space:nowrap;">
            ${m}
        </button>`).join('');

    body.innerHTML = `
        <div style="margin-bottom:18px;">
            <div style="font-size:0.72rem;color:var(--gray);font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">📂 الأقسام الرئيسية</div>
            <div id="co-main-list" style="display:flex;flex-direction:column;gap:6px;">${mainsHTML}</div>
        </div>
        <div>
            <div style="font-size:0.72rem;color:var(--gray);font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">📁 الأقسام الفرعية — اختر القسم الرئيسي:</div>
            <div id="co-main-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${mainTabsHTML}</div>
            <div id="co-sub-list" style="display:flex;flex-direction:column;gap:6px;">${subsHTML}</div>
        </div>`;

    coWireDragReorder('co-main-list');
    if (multiSub) coWireDragReorder('co-sub-list');

    // Wire main-category tab switching (syncs sub order before switching)
    body.querySelectorAll('.co-main-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            coSyncFromDOM();
            _coState.activeMain = btn.dataset.main;
            coRenderBody();
        });
    });
}

let _coDragEl = null;
function coWireDragReorder(listId) {
    const list = document.getElementById(listId);
    if (!list) return;

    list.querySelectorAll('.co-row').forEach(row => {
        row.addEventListener('dragstart', () => {
            _coDragEl = row;
            row.style.opacity = '0.4';
        });
        row.addEventListener('dragend', () => {
            row.style.opacity = '';
            _coDragEl = null;
        });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            if (!_coDragEl || _coDragEl === row || row.parentElement !== list || _coDragEl.parentElement !== list) return;
            // Live reorder as the dragged row passes over another row in this list
            const rows = [...list.children];
            const fromIdx = rows.indexOf(_coDragEl);
            const toIdx   = rows.indexOf(row);
            if (fromIdx === -1 || toIdx === -1) return;
            if (fromIdx < toIdx) {
                row.after(_coDragEl);
            } else {
                row.before(_coDragEl);
            }
        });
        row.addEventListener('drop', e => {
            e.preventDefault();
        });
    });
}

// ── Store Rename Modal ─────────────────────────────────────────
// Renames a store across ALL Firebase paths that use the store name as a key:
//   pattern/{type}[i].companyname  → updated in-place (name is a field, not a key)
//   items/{oldName}                → copied to items/{newName}, old deleted
//   storeStatus/{oldName}          → copied to storeStatus/{newName}, old deleted
//   settings/categoryOrder/{old}   → copied to settings/categoryOrder/{new}, old deleted
//   settings/loyaltyRewards        → N/A (not store-keyed)
async function openStoreRenameModal(oldName, storeTypes) {
    const stale = document.getElementById('store-rename-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'store-rename-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:26px;width:100%;max-width:420px;font-family:var(--font);direction:rtl;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
            <span style="font-size:1.3rem;">✏️</span>
            <div>
                <div style="font-size:1rem;font-weight:800;color:var(--white);">إعادة تسمية المتجر</div>
                <div style="font-size:0.72rem;color:var(--gray);margin-top:2px;">الاسم الحالي: <span style="color:var(--orange);font-weight:800;">${oldName}</span></div>
            </div>
            <button id="srm-close" style="margin-right:auto;background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:0.74rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">الاسم الجديد</label>
            <input type="text" id="srm-input" value="${oldName}" dir="ltr"
                   style="width:100%;box-sizing:border-box;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--white);font-family:inherit;font-size:0.9rem;outline:none;"
                   onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
            <div id="srm-check-status" style="font-size:0.66rem;margin-top:5px;min-height:14px;"></div>
        </div>

        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:0.72rem;color:#fca5a5;line-height:1.6;">
            ⚠️ سيتم تحديث اسم المتجر في جميع الأقسام:<br>
            <strong>قائمة المتاجر · منتجات المتجر · حالة المتجر · ترتيب الأقسام</strong><br>
            التصنيف الوظيفي للموظفين المرتبطين بهذا المتجر سيحتاج تحديث يدوي.
        </div>

        <div style="display:flex;gap:10px;">
            <button id="srm-cancel" style="flex:1;padding:11px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="srm-save" style="flex:2;padding:11px;background:var(--blue);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">✏️ تغيير الاسم</button>
        </div>
        <div id="srm-progress" style="display:none;margin-top:12px;font-size:0.72rem;color:var(--gray);text-align:center;"></div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('srm-close').onclick  = close;
    document.getElementById('srm-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Input validation + duplicate check
    const input  = document.getElementById('srm-input');
    const status = document.getElementById('srm-check-status');
    let _renameValid = false;

    async function validateNewName() {
        const val = input.value.trim();
        status.style.color = '';
        if (!val) { status.textContent = ''; _renameValid = false; return; }
        if (val === oldName) { status.textContent = ''; _renameValid = false; return; }
        if (!/^[a-zA-Z0-9\u0600-\u06FF\s\-_.]+$/.test(val)) {
            status.textContent = '✗ اسم غير صالح — يُسمح بالحروف والأرقام والشرطة والنقطة فقط';
            status.style.color = 'var(--red)'; _renameValid = false; return;
        }
        // Check if name already exists in allStores
        if (allStores[val]) {
            status.textContent = `✗ يوجد متجر باسم "${val}" بالفعل`;
            status.style.color = 'var(--red)'; _renameValid = false; return;
        }
        status.textContent = '✓ الاسم متاح';
        status.style.color = 'var(--green)';
        _renameValid = true;
    }

    input.addEventListener('input', validateNewName);
    input.select();

    document.getElementById('srm-save').onclick = async () => {
        const newName = input.value.trim();
        if (!newName || newName === oldName) { status.textContent = 'أدخل اسماً مختلفاً'; status.style.color = 'var(--red)'; return; }
        if (!_renameValid) { status.textContent = 'الاسم غير صالح أو مستخدم'; status.style.color = 'var(--red)'; return; }

        const saveBtn = document.getElementById('srm-save');
        const cancelBtn = document.getElementById('srm-cancel');
        const progress  = document.getElementById('srm-progress');
        saveBtn.disabled = cancelBtn.disabled = true;
        saveBtn.textContent = '…';
        progress.style.display = 'block';

        const setProgress = (msg) => { progress.textContent = msg; };

        try {
            // ① Update companyname in pattern/{type} for each store type
            setProgress('جارٍ تحديث قائمة المتاجر…');
            for (const type of storeTypes) {
                const rawType = await fbGet(`pattern/${type}`).catch(() => null);
                if (!rawType) continue;
                const entries = typeof rawType === 'object' ? Object.entries(rawType) : [];
                for (const [key, val] of entries) {
                    if (val && val.companyname === oldName) {
                        await fbSet(`pattern/${type}/${key}/companyname`, newName);
                    }
                }
            }

            // ② Copy items/{oldName} → items/{newName}, delete old
            setProgress('جارٍ نقل المنتجات…');
            const items = await fbGet(`items/${oldName}`).catch(() => null);
            if (items) {
                await fbSet(`items/${newName}`, items);
                await fbSet(`items/${oldName}`, null);
            }

            // ③ Copy storeStatus/{oldName} → storeStatus/{newName}, delete old
            setProgress('جارٍ نقل حالة المتجر…');
            const status_ = await fbGet(`storeStatus/${oldName}`).catch(() => null);
            if (status_) {
                await fbSet(`storeStatus/${newName}`, status_);
                await fbSet(`storeStatus/${oldName}`, null);
            }

            // ④ Copy settings/categoryOrder/{oldName} → /{newName}, delete old
            setProgress('جارٍ نقل ترتيب الأقسام…');
            const catOrder = await fbGet(`settings/categoryOrder/${oldName}`).catch(() => null);
            if (catOrder) {
                await fbSet(`settings/categoryOrder/${newName}`, catOrder);
                await fbSet(`settings/categoryOrder/${oldName}`, null);
            }

            setProgress('✅ تم تغيير الاسم بنجاح!');
            toast(`✏️ تمت إعادة التسمية: "${oldName}" ← "${newName}"`);
            close();
            await _refreshStoresData();

        } catch (e) {
            progress.textContent = `❌ فشل: ${e.message}`;
            saveBtn.disabled = cancelBtn.disabled = false;
            saveBtn.textContent = '✏️ تغيير الاسم';
        }
    };
}


function openAddStoreModal() {
    const stale = document.getElementById('add-store-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-store-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;';

    const typeOptions = ALL_TYPES.map(t =>
        `<option value="${t.key}">${t.emoji} ${t.label}</option>`
    ).join('');

    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:420px;font-family:var(--font);direction:rtl;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0;">🏪 إضافة متجر جديد</h3>
            <button id="as-close" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:12px;">
            <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">اسم المتجر <span style="color:var(--red)">*</span></label>
            <input id="as-name" type="text" placeholder="e.g. Classic-Food" maxlength="60"
                   style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.88rem;outline:none;box-sizing:border-box;"
                   onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
            <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">استخدم حروف إنجليزية وشرطة — بدون مسافات</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">النوع <span style="color:var(--red)">*</span></label>
                <select id="as-type" style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:9px 10px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;cursor:pointer;">
                    ${typeOptions}
                </select>
            </div>
            <div>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">التقييم (اختياري)</label>
                <input id="as-rank" type="number" placeholder="4.5" min="1" max="5" step="0.1"
                       style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--white);font-family:var(--mono);font-size:0.88rem;outline:none;box-sizing:border-box;"
                       onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
            <div>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">الأولوية</label>
                <input id="as-priority" type="number" placeholder="1" min="1" max="99"
                       style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--white);font-family:var(--mono);font-size:0.88rem;outline:none;box-sizing:border-box;"
                       onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">1 = الأعلى ظهوراً</div>
            </div>
            <div>
                <label style="font-size:0.75rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">وقت التوصيل (دقيقة)</label>
                <input id="as-delivery" type="number" placeholder="30" min="5" max="120"
                       style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--white);font-family:var(--mono);font-size:0.88rem;outline:none;box-sizing:border-box;"
                       onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
            </div>
        </div>

        <div style="display:flex;gap:10px;">
            <button id="as-cancel" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:11px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="as-confirm" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">إضافة المتجر</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    document.getElementById('as-name').focus();

    const close = () => overlay.remove();
    document.getElementById('as-close').onclick  = close;
    document.getElementById('as-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('as-confirm').onclick = async () => {
        const btn      = document.getElementById('as-confirm');
        const nameVal  = (document.getElementById('as-name')?.value || '').trim();
        const typeVal  = document.getElementById('as-type')?.value;
        const rankVal  = document.getElementById('as-rank')?.value;
        const prioVal  = document.getElementById('as-priority')?.value;
        const delivVal = document.getElementById('as-delivery')?.value;

        if (!nameVal)  { toast('أدخل اسم المتجر', true); return; }
        if (!typeVal)  { toast('اختر نوع المتجر', true); return; }
        if (allStores[nameVal]) { toast('المتجر موجود مسبقاً', true); return; }

        btn.disabled = true; btn.textContent = '…';

        const entry = {
            companyname: nameVal,
            ...(rankVal  ? { rank: rankVal }         : {}),
            ...(prioVal  ? { priority: parseInt(prioVal) } : {}),
            ...(delivVal ? { deliveryTime: parseInt(delivVal) } : {}),
        };

        try {
            // Push new store entry into pattern/{type}
            const raw  = await fbGet(`pattern/${typeVal}`).catch(() => null) || {};
            const list = Array.isArray(raw) ? raw : Object.values(raw);
            list.push(entry);
            // Write back as object (keyed 0..n)
            const asObj = Object.fromEntries(list.map((v, i) => [i, v]));
            await fbSet(`pattern/${typeVal}`, asObj);
            toast(`✅ تم إضافة ${nameVal}`);
            close();
            await _refreshStoresData();
        } catch(e) {
            toast('فشل الإضافة: ' + e.message, true);
            btn.disabled = false; btn.textContent = 'إضافة المتجر';
        }
    };
}

// ── Format opensAt ISO string → human Arabic label for admin cards ──
function _fmtOpensAt(raw) {
    if (!raw) return '';
    const dt = new Date(raw);
    if (isNaN(dt)) return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;opacity:0.7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${raw}`;
    const now     = new Date();
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dtDate  = new Date(dt.getFullYear(),  dt.getMonth(),  dt.getDate());
    const dayDiff = Math.round((dtDate - nowDate) / 86400000);
    const t       = dt.toLocaleTimeString('ar-LB', { hour:'2-digit', minute:'2-digit', hour12:true });
    const days    = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    let label;
    if (dayDiff <= 0)      label = 'اليوم الساعة ' + t;
    else if (dayDiff === 1) label = 'غداً الساعة ' + t;
    else if (dayDiff < 7)   label = days[dt.getDay()] + ' الساعة ' + t;
    else {
        const mn = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
        const sameYr = dt.getFullYear() === now.getFullYear();
        const dp = sameYr ? `${dt.getDate()} ${mn[dt.getMonth()]}` : `${dt.getDate()} ${mn[dt.getMonth()]} ${dt.getFullYear()}`;
        label = `${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][dt.getDay()]} ${dp} الساعة ${t}`;
    }
    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;opacity:0.7"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> يفتح ${label}`;
}

// Shared helper — re-fetch pattern + storeStatus and re-render the stores grid
async function _refreshStoresData() {
    const [pattern, storeStatusAll] = await Promise.all([
        fbGet('pattern'),
        fbGet('storeStatus').catch(() => null),
    ]);
    if (pattern) {
        allStores = {};
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
                    if (p !== null) allStores[s.companyname].priorities[type] = p;
                } else {
                    allStores[s.companyname] = {
                        ...s, type,
                        allTypes:      [type],
                        priorities:    p !== null ? { [type]: p } : {},
                        _closed:       cl || false,
                        _closedReason: cl ? (st.reason  || '') : '',
                        _opensAt:      cl ? (st.opensAt || '') : '',
                    };
                }
            });
        });
    }
    if (typeof renderStores === 'function') renderStores();
    _refreshClosePlatformBtn();
}

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES PANEL
// ═══════════════════════════════════════════════════════════════
const ROLE_COLORS = { superadmin:'role-superadmin', dispatcher:'role-dispatcher', viewer:'role-viewer', store:'role-store', company:'role-company' };
const AVATAR_COLORS = ['#FF5C00','#3b82f6','#22c55e','#a855f7','#f59e0b','#ef4444'];
const ALL_PERMS = ['map','orders','drivers','customers','stores','employees','settings','expenses'];
const PERM_LABELS = { map:'🗺 خريطة', orders:'📦 طلبات', drivers:'🛵 سائقون', customers:'👤 عملاء', stores:'🏪 متاجر', employees:'🔐 موظفون', settings:'⚙️ إعدادات', expenses:'💸 مصاريف' };

let empFilter = localStorage.getItem('delivo_admin_emp_filter') || 'all';

function renderEmployees() {
    if (!hasPerm('employees')) return;
    const grid = document.getElementById('emp-grid');
    grid.innerHTML = '';

    // Every admin — including the super-admin — is now a real Firebase Auth
    // account and appears here uniformly, keyed by its uid (no more special
    // '__seed' entry merged with a hardcoded fallback).
    const allEmps = Object.entries(adminUsers).map(([k, v]) => ({ ...v, _key: k })).filter(emp => {
        if (empFilter === 'all') return true;
        const isStoreUser = STORE_ONLY_ROLES.includes(emp.role);
        return empFilter === 'store' ? isStoreUser : !isStoreUser;
    });

    allEmps.forEach((emp, idx) => {
        const color     = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        const initial   = (emp.fullname || emp.username || '?')[0].toUpperCase();
        const roleClass = ROLE_COLORS[emp.role] || 'role-viewer';
        const isSelf    = currentAdmin.username === emp.username;

        const card = document.createElement('div');
        card.className = 'emp-card';
        card.innerHTML = `
            <div class="ec-top">
                <div class="ec-avatar" style="background:${color};">${initial}</div>
                <div>
                    <div class="ec-name">${emp.fullname || emp.username}</div>
                    <div class="ec-username">@${emp.username}</div>
                </div>
                <span class="ec-role-badge ${roleClass}">${roleLabel(emp.role)}</span>
            </div>
            <div class="ec-perms">
                ${ALL_PERMS.map(p => {
                    const has = emp.role === 'superadmin' || (emp.permissions||[]).includes(p);
                    return `<span class="ec-perm${has?' has':''}">${PERM_LABELS[p]}</span>`;
                }).join('')}
            </div>
            ${emp.notifyNewOrders && emp.notifyPhone ? `
            <div class="ec-perms" style="margin-top:4px;">
                <span class="ec-perm has" style="color:#25D366;border-color:rgba(37,211,102,0.35);background:rgba(37,211,102,0.08);">
                    💬 ${emp.role === 'company' ? 'إشعار واتساب — طلبات متجره' : 'إشعار واتساب — كل الطلبات'}
                </span>
            </div>` : ''}
            ${(() => {
                // No one can edit/delete their own account here — that's done
                // through the profile/password-change flow instead — but any
                // superadmin can manage everyone else's, including another
                // superadmin's (the Cloud Function itself also blocks
                // self-deletion server-side as a second guard).
                const canEdit   = !isSelf;
                const canDelete = !isSelf;
                const pushId    = emp._key;
                if (canEdit) {
                    return `
            <div class="ec-actions-row">
                <button class="ec-btn" data-edit="${emp._key}">✏️ تعديل</button>
                ${canDelete ? `<button class="ec-btn danger" data-delete="${emp._key}">🗑 حذف</button>` : ''}
                <button class="ec-btn" data-testpush="${pushId}" data-testpush-name="${emp.fullname || emp.username}" title="إرسال إشعار تجريبي">🔔</button>
            </div>`;
                }
                return `
            <div class="ec-actions-row">
                <button class="ec-btn" data-testpush="${pushId}" data-testpush-name="${emp.fullname || emp.username}" title="إرسال إشعار تجريبي">🔔 اختبار الإشعار</button>
            </div>`;
            })()}`;

        card.querySelectorAll('[data-testpush]').forEach(btn => {
            btn.addEventListener('click', () => sendTestPush(btn.dataset.testpush, btn.dataset.testpushName));
        });

        card.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', () => openEmpModal(emp));
        });
        card.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const _confirmEmp = await showConfirm({
                    title: 'حذف الموظف',
                    msg: `هل تريد حذف <b>${emp.fullname||emp.username}</b>؟<br><span style="color:var(--red)">لا يمكن التراجع عن هذا الإجراء.</span>`,
                    type: 'danger', icon: '🗑',
                    okLabel: 'حذف', cancelLabel: 'إلغاء'
                });
                if (!_confirmEmp) return;
                try {
                    const idToken = await window._adminAuth?.currentUser?.getIdToken();
                    const res = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/deleteAdminAccount', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ uid: btn.dataset.delete }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || data.error) throw new Error(data.error || `فشل (${res.status})`);
                    toast('✅ تم حذف الموظف');
                } catch (e) {
                    toast('⚠️ خطأ: ' + e.message, true);
                }
                await loadAllData();
                renderEmployees();
            });
        });
        grid.appendChild(card);
    });
}

// ── Employee modal open helper ────────────────────────────────
function openEmpModal(emp) {
    const isNew  = !emp;
    document.getElementById('emp-edit-key').value  = emp?._key || '';
    document.getElementById('emp-modal-title').lastChild.textContent = isNew ? ' إضافة موظف جديد' : ' تعديل بيانات الموظف';
    document.getElementById('emp-save-btn').textContent = isNew ? 'إضافة الموظف' : '💾 حفظ التغييرات';
    document.getElementById('emp-pass-hint').style.display = isNew ? 'none' : 'inline';
    document.getElementById('emp-modal-error').style.display = 'none';

    document.getElementById('emp-fullname').value = emp?.fullname || '';
    document.getElementById('emp-username').value = emp?.username || '';
    document.getElementById('emp-username').disabled = !isNew; // username can't change after account creation (it's baked into the Auth email)
    document.getElementById('emp-password').value = '';
    document.getElementById('emp-password').type  = 'password';

    // Passwords are never stored anywhere readable anymore — nothing to show
    // here. Leaving the password field blank on edit just means "no change";
    // typing a new one resets it via updateAdminAccount.
    const passLabel = document.getElementById('emp-password-label');
    const existingHint = passLabel.querySelector('.emp-existing-pwd');
    if (existingHint) existingHint.remove();

    const role = emp?.role || 'dispatcher';
    document.getElementById('emp-role').value    = role;
    document.getElementById('emp-role').disabled = false;

    // Permissions
    const perms = emp?.permissions || [];
    document.querySelectorAll('#perm-checks input').forEach(c => {
        c.checked  = role === 'superadmin' || perms.includes(c.value);
        c.disabled = false;
    });

    // Store row
    const storeRow = document.getElementById('emp-store-row');
    const permRow  = storeRow?.nextElementSibling;
    if (role === 'company') {
        storeRow.style.display = 'block';
        if (permRow) permRow.style.display = 'none';
        const sel = document.getElementById('emp-linked-store');
        sel.innerHTML = '<option value="">— اختر متجراً —</option>';
        Object.keys(allStores).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            if (emp?.linkedStore === name) opt.selected = true;
            sel.appendChild(opt);
        });
    } else {
        storeRow.style.display = 'none';
        if (permRow) permRow.style.display = 'block';
    }

    // WhatsApp new-order notification (phone + on/off), label adapts to role
    document.getElementById('emp-notify-phone').value  = emp?.notifyPhone || '';
    document.getElementById('emp-notify-active').checked = !!emp?.notifyNewOrders;
    _updateEmpNotifyLabel(role, emp?.linkedStore);

    document.getElementById('modal-emp').classList.add('open');
}

// The notification means something different depending on the employee's
// role: an admin-type employee gets pinged for every new order platform-wide,
// while a store-linked (company) user only cares about their own store's orders.
function _updateEmpNotifyLabel(role, linkedStore) {
    const label = document.getElementById('emp-notify-label');
    const sub   = document.getElementById('emp-notify-sub');
    if (!label || !sub) return;
    if (role === 'company') {
        label.textContent = '🔔 إشعار واتساب بطلبات متجره';
        sub.textContent = linkedStore
            ? `يصل إشعار واتساب لهذا المستخدم فقط عند وصول طلب جديد لمتجر "${linkedStore}"`
            : 'يصل إشعار واتساب لهذا المستخدم فقط عند وصول طلب جديد لمتجره المرتبط';
    } else {
        label.textContent = '🔔 إشعار واتساب بكل الطلبات الجديدة';
        sub.textContent = 'يصل إشعار واتساب لهذا الموظف عند وصول أي طلب جديد من أي متجر';
    }
}

// ── Add button ────────────────────────────────────────────────
document.getElementById('add-emp-btn').addEventListener('click', () => openEmpModal(null));
document.getElementById('emp-cancel-btn').addEventListener('click', () => document.getElementById('modal-emp').classList.remove('open'));

// ── Store-user / staff filter ────────────────────────────────
document.querySelectorAll('[data-emp-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        empFilter = btn.dataset.empFilter;
        localStorage.setItem('delivo_admin_emp_filter', empFilter);
        document.querySelectorAll('[data-emp-filter]').forEach(b => b.classList.toggle('active', b.dataset.empFilter === empFilter));
        renderEmployees();
    });
});
document.querySelectorAll('[data-emp-filter]').forEach(b => b.classList.toggle('active', b.dataset.empFilter === empFilter));

// ── Password toggle ───────────────────────────────────────────
document.getElementById('emp-pwd-toggle').addEventListener('click', () => {
    const inp = document.getElementById('emp-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ── Save (add + edit) ─────────────────────────────────────────
document.getElementById('emp-save-btn').addEventListener('click', async () => {
    const key      = document.getElementById('emp-edit-key').value.trim();
    const isNew    = !key;
    const fullname = document.getElementById('emp-fullname').value.trim();
    const username = document.getElementById('emp-username').value.trim().toLowerCase();
    const password = document.getElementById('emp-password').value.trim();
    const role     = document.getElementById('emp-role').value;
    const perms    = [...document.querySelectorAll('#perm-checks input:checked')].map(c => c.value);
    const linkedStore = document.getElementById('emp-linked-store')?.value || '';
    const notifyPhoneRaw = document.getElementById('emp-notify-phone').value.trim();
    const notifyPhone    = notifyPhoneRaw.replace(/[^\d]/g, ''); // digits only, matches store whatsapp format
    const notifyNewOrders = document.getElementById('emp-notify-active').checked;
    const errorEl  = document.getElementById('emp-modal-error');

    errorEl.style.display = 'none';
    if (!username)              { errorEl.textContent = '⚠️ اسم المستخدم مطلوب';              errorEl.style.display = 'block'; return; }
    if (isNew && !password)     { errorEl.textContent = '⚠️ كلمة المرور مطلوبة';              errorEl.style.display = 'block'; return; }
    if (password && password.length < 6) { errorEl.textContent = '⚠️ كلمة المرور قصيرة جداً'; errorEl.style.display = 'block'; return; }
    if (role === 'company' && !linkedStore) { errorEl.textContent = '⚠️ اختر متجراً لهذا المستخدم'; errorEl.style.display = 'block'; return; }
    if (notifyNewOrders && !notifyPhone) { errorEl.textContent = '⚠️ أدخل رقم واتساب لتفعيل الإشعار'; errorEl.style.display = 'block'; return; }

    const FN_BASE = 'https://us-central1-deliveryonline-300f7.cloudfunctions.net';

    try {
        const idToken = await window._adminAuth?.currentUser?.getIdToken();
        if (!idToken) throw new Error('جلسة المدير غير صالحة، سجّل الدخول من جديد');

        // notifyPhone/notifyNewOrders/linkedStore are non-secret metadata —
        // still fine to write straight to RTDB (only real credentials moved
        // server-side). Cloud Functions own the account itself (Auth user +
        // custom claims + the adminUsers/{uid} mirror's core fields).
        const extra = { notifyPhone: notifyPhone || null, notifyNewOrders };
        if (linkedStore) extra.linkedStore = linkedStore;

        if (isNew) {
            const res = await fetch(`${FN_BASE}/createAdminAccount`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ username, password, fullname, role, permissions: perms }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) throw new Error(data.error || `فشل (${res.status})`);
            await fbUpdate(`adminUsers/${data.uid}`, extra);
            toast('✅ تم إضافة الموظف');
        } else {
            const body = { uid: key, fullname, role, permissions: perms };
            if (password) body.password = password;
            const res = await fetch(`${FN_BASE}/updateAdminAccount`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) throw new Error(data.error || `فشل (${res.status})`);
            await fbUpdate(`adminUsers/${key}`, extra);
            toast('✅ تم حفظ التغييرات');
        }
        document.getElementById('modal-emp').classList.remove('open');
        await loadAllData();
        renderEmployees();
    } catch(e) { errorEl.textContent = '⚠️ خطأ: ' + e.message; errorEl.style.display = 'block'; }
});

// Auto-select permissions by role
document.getElementById('emp-role').addEventListener('change', function() {
    const presets = {
        superadmin: ALL_PERMS,
        dispatcher: ['map','orders','drivers'],
        viewer:     ['map','orders'],
        store:      ['orders','stores'],
        company:    [],
    };
    const preset = presets[this.value] || [];
    document.querySelectorAll('#perm-checks input').forEach(c => { c.checked = preset.includes(c.value); });
    // Show/hide store link row
    const storeRow = document.getElementById('emp-store-row');
    const permRow  = storeRow?.nextElementSibling;
    if (this.value === 'company') {
        storeRow.style.display = 'block';
        if (permRow) permRow.style.display = 'none';
        // Populate store dropdown from allStores
        const sel = document.getElementById('emp-linked-store');
        sel.innerHTML = '<option value="">— اختر متجراً —</option>';
        Object.keys(allStores).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            sel.appendChild(opt);
        });
    } else {
        storeRow.style.display = 'none';
        if (permRow) permRow.style.display = 'block';
    }
    _updateEmpNotifyLabel(this.value, document.getElementById('emp-linked-store')?.value);
});

document.getElementById('emp-linked-store')?.addEventListener('change', function() {
    _updateEmpNotifyLabel(document.getElementById('emp-role').value, this.value);
});

// ═══════════════════════════════════════════════════════════════
// PROMO FLIP CARDS PANEL — كروت العروض بالصفحة الرئيسية
// Firebase RTDB path: promoFlipCards/{key}
//   { order, active, image, badgeText, badgeStyle('hot'|'food'|'custom'),
//     badgeColor, storeName, title, backStyle('items'|'tags'|'plain'),
//     description, itemsRaw, tagsRaw, priceText, footerNote, ctaText, orderText }
// Images are uploaded the same way item photos are (GitHub Contents API,
// converted to WebP) — see PROMO_GH_FOLDER + _cpiConvertToWebp/_cpiBlobToBase64.
// ═══════════════════════════════════════════════════════════════
let _promoFlipCards = {}; // { key: cardObj }
let _pfPendingImageFile = null;
let _pfPendingImageDataUrl = null;

const PF_BACKSTYLE_LABELS = { items: '📋 قائمة أسعار', tags: '🏷️ وصف وأيقونات', plain: '📝 نص بسيط' };
const PF_BADGE_PRESETS = {
    hot:    { label: '🔥 ناري (برتقالي)', color: null },
    food:   { label: '🍽 أكل (أخضر)',     color: null },
    custom: { label: '🎨 لون مخصص',       color: null },
};

/* The 3 promos that used to be hardcoded — seeded into Firebase the first
   time this panel is opened with no cards yet, so they show up here and
   can be edited/hidden/deleted like any other card. Fixed keys (seed_1/2/3)
   keep this idempotent — opening the panel twice won't create duplicates. */
const PROMO_FLIP_DEFAULTS = {
    seed_1: {
        order: 1, active: true,
        image: 'assets/promos/promo-megasale.jpg',
        badgeText: '🔥 عرض ناري', badgeStyle: 'hot', badgeColor: null,
        storeName: 'SUPER DOKAN', title: 'ميغا سيل بمناسبة المونديال ⚽',
        backStyle: 'items', description: '',
        itemsRaw: "Persil جل غسيل لافندر 4.8ل = 10.69$\nجنرال منظف أرضيات 3ل = 2.94$\nLet's Clean جل غسيل 1ل = 2.39$\nمناديل Good Care 8+2 = 3.79$",
        tagsRaw: '', priceText: '',
        footerNote: '⏳ ساري من 8 لغاية 14 تموز',
        ctaText: '🛒 اطلب الآن', orderText: 'مرحباً، بدي إطلب من عرض ميغا سيل سوبر دوكان 🛒',
    },
    seed_2: {
        order: 2, active: true,
        image: 'assets/promos/promo-baytna.jpg',
        badgeText: '🍽 طبق اليوم', badgeStyle: 'food', badgeColor: null,
        storeName: 'مطعم بيتنا', title: 'سندويش كوردون بلو مع تشيز 🧀',
        backStyle: 'tags',
        description: 'دجاج طري ومقرمش، تشيز ذائبة، ومكوّنات طازجة بتحضير يومي.',
        itemsRaw: '', tagsRaw: '🧀 تشيز ذائبة, 🍗 دجاج طري ومقرمش, 🥬 مكوّنات طازجة',
        priceText: '450,000 ل.ل', footerNote: '',
        ctaText: '🥪 اطلب الآن', orderText: 'مرحباً، بدي إطلب سندويش كوردون بلو (طبق اليوم) من مطعم بيتنا 🥪',
    },
    seed_3: {
        order: 3, active: true,
        image: 'assets/promos/promo-delivo-breakfast.jpg',
        badgeText: '🥣 ترويقة الصبح', badgeStyle: 'hot', badgeColor: null,
        storeName: 'Delivo', title: 'بدك احلى ترويقة؟ 🍳 فول وفتة عالطاولة بلمح البصر',
        backStyle: 'plain',
        description: 'أطيب فول وفتة من مطاعمك المفضلة، بتوصلك سخنة وطازجة لحد باب البيت.',
        itemsRaw: '', tagsRaw: '⚡ توصيل سريع, 🍽 أكل طازج ونظيف, 🛵 من مطاعمك المفضلة',
        priceText: '', footerNote: '📍 بعلبك ومحيطها',
        ctaText: '🥣 اطلب الآن', orderText: 'مرحباً، بدي إطلب ترويقة (فول / فتة) عبر ديليفو 🥣',
    },
};

async function _pfSeedDefaultsIfEmpty() {
    await Promise.all(
        Object.entries(PROMO_FLIP_DEFAULTS).map(([key, card]) => fbSet(`promoFlipCards/${key}`, card))
    );
    await fbSet('settings/promoFlipSeeded', true);
}

async function renderPromoFlipAdmin() {
    const grid = document.getElementById('promoflip-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">⏳ جاري التحميل…</div>`;

    let data = null;
    try { data = await fbGet('promoFlipCards'); } catch (e) { /* fall through to empty state */ }

    if (!data || typeof data !== 'object' || !Object.keys(data).length) {
        try {
            const alreadySeeded = await fbGet('settings/promoFlipSeeded').catch(() => false);
            if (!alreadySeeded) {
                await _pfSeedDefaultsIfEmpty();
                data = await fbGet('promoFlipCards');
            }
        } catch (e) { /* seeding failed (offline?) — fall through, grid will just show empty state */ }
    }

    _promoFlipCards = data && typeof data === 'object' ? data : {};

    const entries = Object.entries(_promoFlipCards).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

    if (!entries.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">لا يوجد عروض بعد — اضغط "إضافة عرض" لإنشاء أول كرت 🎡</div>`;
        return;
    }

    grid.innerHTML = entries.map(([key, card], idx) => _pfCardHtml(key, card, idx, entries.length)).join('');

    grid.querySelectorAll('[data-pf-edit]').forEach(btn => {
        btn.addEventListener('click', () => openPromoFlipModal({ ..._promoFlipCards[btn.dataset.pfEdit], _key: btn.dataset.pfEdit }));
    });
    grid.querySelectorAll('[data-pf-delete]').forEach(btn => {
        btn.addEventListener('click', () => deletePromoFlipCardConfirm(btn.dataset.pfDelete));
    });
    grid.querySelectorAll('[data-pf-toggle]').forEach(cb => {
        cb.addEventListener('change', () => togglePromoFlipActive(cb.dataset.pfToggle, cb.checked));
    });
    grid.querySelectorAll('[data-pf-up]').forEach(btn => {
        btn.addEventListener('click', () => movePromoFlipCard(btn.dataset.pfUp, -1));
    });
    grid.querySelectorAll('[data-pf-down]').forEach(btn => {
        btn.addEventListener('click', () => movePromoFlipCard(btn.dataset.pfDown, 1));
    });
}

function _pfCardHtml(key, card, idx, total) {
    const styleTag = PF_BACKSTYLE_LABELS[card.backStyle] || PF_BACKSTYLE_LABELS.plain;
    const isActive = card.active !== false;
    return `
    <div class="pf-card${isActive ? '' : ' inactive'}">
        <div class="pf-card__img-wrap">
            <img src="${card.image || ''}" alt="" onerror="this.style.opacity=0.15">
            <span class="pf-card__order-badge">#${card.order ?? (idx + 1)}</span>
        </div>
        <div class="pf-card__body">
            ${card.storeName ? `<div class="pf-card__store">${card.storeName}</div>` : ''}
            <div class="pf-card__title">${card.title || '(بدون عنوان)'}</div>
            <div class="pf-card__meta">
                <span class="pf-card__style-tag">${styleTag}</span>
                <label class="pf-card__active-toggle">
                    <input type="checkbox" data-pf-toggle="${key}" ${isActive ? 'checked' : ''}>
                    ${isActive ? 'مفعّل' : 'مخفي'}
                </label>
            </div>
            <div class="pf-card__row" style="margin-top:12px;">
                <div class="pf-card__reorder">
                    <button data-pf-up="${key}" ${idx === 0 ? 'disabled' : ''} title="تحريك لأعلى">▲</button>
                    <button data-pf-down="${key}" ${idx === total - 1 ? 'disabled' : ''} title="تحريك لأسفل">▼</button>
                </div>
                <div class="pf-card__actions" style="flex:1;">
                    <button class="ec-btn" data-pf-edit="${key}">✏️ تعديل</button>
                    <button class="ec-btn danger" data-pf-delete="${key}">🗑 حذف</button>
                </div>
            </div>
        </div>
    </div>`;
}

async function togglePromoFlipActive(key, active) {
    try {
        await fbUpdate(`promoFlipCards/${key}`, { active });
        toast(active ? '✅ الكرت مفعّل الآن' : '👁️‍🗨️ الكرت مخفي عن الزوار');
        if (_promoFlipCards[key]) _promoFlipCards[key].active = active;
    } catch (e) { toast('⚠️ تعذّر الحفظ: ' + e.message, true); renderPromoFlipAdmin(); }
}

async function movePromoFlipCard(key, direction) {
    const entries = Object.entries(_promoFlipCards).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const i = entries.findIndex(([k]) => k === key);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= entries.length) return;

    const [keyA, cardA] = entries[i];
    const [keyB, cardB] = entries[j];
    const orderA = cardA.order ?? (i + 1);
    const orderB = cardB.order ?? (j + 1);

    try {
        await Promise.all([
            fbUpdate(`promoFlipCards/${keyA}`, { order: orderB }),
            fbUpdate(`promoFlipCards/${keyB}`, { order: orderA }),
        ]);
        await renderPromoFlipAdmin();
    } catch (e) { toast('⚠️ تعذّر تغيير الترتيب: ' + e.message, true); }
}

async function deletePromoFlipCardConfirm(key) {
    const card = _promoFlipCards[key];
    const ok = await showConfirm({
        title: 'حذف العرض',
        msg: `هل تريد حذف <b>${card?.title || 'هذا العرض'}</b>؟<br><span style="color:var(--red)">لا يمكن التراجع عن هذا الإجراء.</span>`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف', cancelLabel: 'إلغاء',
    });
    if (!ok) return;
    try {
        await fbSet(`promoFlipCards/${key}`, null);
        toast('✅ تم حذف العرض');
        await renderPromoFlipAdmin();
    } catch (e) { toast('⚠️ تعذّر الحذف: ' + e.message, true); }
}

// ── Modal ────────────────────────────────────────────────────
function openPromoFlipModal(card) {
    document.getElementById('pf-modal')?.remove();
    _pfPendingImageFile = null;
    _pfPendingImageDataUrl = null;

    const isNew = !card;
    const backStyle = card?.backStyle || 'items';

    const modal = document.createElement('div');
    modal.id = 'pf-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;`;
    modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;">
        <div style="padding:16px 20px;border-bottom:1px solid var(--surface3);display:flex;align-items:center;gap:10px;">
            <span style="font-size:0.88rem;font-weight:800;color:var(--white);">${isNew ? '🎡 إضافة عرض جديد' : '✏️ تعديل العرض'}</span>
            <button onclick="document.getElementById('pf-modal').remove()"
                    style="margin-right:auto;background:none;border:none;cursor:pointer;color:var(--gray);font-size:1.1rem;">✕</button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">

            <input type="hidden" id="pf-key" value="${card?._key || ''}">

            <!-- Image -->
            <div style="text-align:center;">
                <div onclick="document.getElementById('pf-img-file').click()"
                     style="width:100%;height:130px;border-radius:12px;overflow:hidden;background:var(--surface3);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px dashed var(--border);position:relative;"
                     onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'">
                    ${card?.image
                        ? `<img src="${card.image}" style="width:100%;height:100%;object-fit:cover;" id="pf-img-preview">`
                        : `<span style="font-size:2rem;" id="pf-img-placeholder">📷</span>
                           <img src="" style="width:100%;height:100%;object-fit:cover;display:none;" id="pf-img-preview">`
                    }
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.62rem;font-weight:700;padding:3px 0;text-align:center;">📤 رفع / تغيير الصورة</div>
                </div>
                <input type="file" id="pf-img-file" accept="image/*" style="display:none;" onchange="_pfPreviewImage(this)">
                <div style="font-size:0.66rem;color:var(--gray);" id="pf-img-status">${isNew ? 'اختر صورة العرض (تُحفظ تلقائياً بصيغة WebP)' : ''}</div>
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🏷️ نص الشارة (Badge)</label>
                <input type="text" id="pf-badge-text" value="${card?.badgeText || ''}" placeholder="🔥 عرض ناري"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div style="display:flex;gap:10px;">
                <div style="flex:1;">
                    <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">لون الشارة</label>
                    <select id="pf-badge-style" style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
                        <option value="hot" ${(!card || card.badgeStyle === 'hot') ? 'selected' : ''}>🔥 ناري (برتقالي)</option>
                        <option value="food" ${card?.badgeStyle === 'food' ? 'selected' : ''}>🍽 أكل (أخضر)</option>
                        <option value="custom" ${card?.badgeStyle === 'custom' ? 'selected' : ''}>🎨 لون مخصص</option>
                    </select>
                </div>
                <div style="flex:0 0 90px;display:${card?.badgeStyle === 'custom' ? 'block' : 'none'};" id="pf-badge-color-row">
                    <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">اللون</label>
                    <input type="color" id="pf-badge-color" value="${card?.badgeColor || '#FF5C00'}"
                           style="width:100%;height:36px;border:1px solid var(--border-bright);border-radius:var(--radius-md);background:var(--surface2);cursor:pointer;">
                </div>
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🏪 اسم المتجر (اختياري)</label>
                <input type="text" id="pf-store-name" value="${card?.storeName || ''}" placeholder="مثال: SUPER DOKAN"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">📌 عنوان العرض</label>
                <textarea id="pf-title" rows="2" placeholder="مثال: ميغا سيل بمناسبة المونديال ⚽"
                          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;resize:vertical;">${card?.title || ''}</textarea>
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🎴 شكل تفاصيل الكرت (بعد القلب)</label>
                <select id="pf-backstyle" style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
                    <option value="items" ${backStyle === 'items' ? 'selected' : ''}>📋 قائمة أسعار (سوبرماركت)</option>
                    <option value="tags"  ${backStyle === 'tags'  ? 'selected' : ''}>🏷️ وصف وأيقونات (مطعم)</option>
                    <option value="plain" ${backStyle === 'plain' ? 'selected' : ''}>📝 نص بسيط</option>
                </select>
            </div>

            <!-- backStyle = items -->
            <div id="pf-group-items" style="display:${backStyle === 'items' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">📋 قائمة الأسعار — سطر لكل منتج، بالشكل: الاسم = السعر</label>
                <textarea id="pf-items-raw" rows="4" placeholder="Persil جل غسيل لافندر 4.8ل = 10.69$&#10;جنرال منظف أرضيات 3ل = 2.94$"
                          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.78rem;resize:vertical;">${card?.itemsRaw || ''}</textarea>
            </div>

            <!-- backStyle = tags/plain -->
            <div id="pf-group-desc" style="display:${backStyle !== 'items' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">📝 وصف قصير</label>
                <textarea id="pf-description" rows="2" placeholder="دجاج طري ومقرمش، تشيز ذائبة..."
                          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;resize:vertical;">${card?.description || ''}</textarea>
            </div>
            <div id="pf-group-tags" style="display:${backStyle !== 'items' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🏷️ أيقونات / مزايا (افصل بينها بفاصلة ,)</label>
                <input type="text" id="pf-tags-raw" value="${card?.tagsRaw || ''}" placeholder="🧀 تشيز ذائبة, 🍗 دجاج طري ومقرمش"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>
            <div id="pf-group-price" style="display:${backStyle !== 'items' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">💰 السعر المعروض (اختياري)</label>
                <input type="text" id="pf-price-text" value="${card?.priceText || ''}" placeholder="450,000 ل.ل"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">📌 ملاحظة أسفل الكرت (مثال: مدة العرض أو المنطقة)</label>
                <input type="text" id="pf-footer-note" value="${card?.footerNote || ''}" placeholder="⏳ ساري من 8 لغاية 14 تموز"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🛒 نص زر الطلب</label>
                <input type="text" id="pf-cta-text" value="${card?.ctaText || '🛒 اطلب الآن'}"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">💬 رسالة واتساب عند الضغط على زر الطلب</label>
                <textarea id="pf-order-text" rows="2" placeholder="مرحباً، بدي إطلب من عرض..."
                          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;resize:vertical;">${card?.orderText || ''}</textarea>
            </div>

            <div style="display:flex;align-items:center;gap:10px;padding-top:4px;border-top:1px solid var(--surface3);">
                <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--gray-light);cursor:pointer;">
                    <input type="checkbox" id="pf-active" ${(!card || card.active !== false) ? 'checked' : ''}> مفعّل (ظاهر للزوار)
                </label>
            </div>

            <p id="pf-modal-error" style="display:none;color:var(--red);font-size:0.76rem;"></p>

            <div style="display:flex;gap:8px;margin-top:4px;">
                <button class="ph-btn ph-btn--primary" id="pf-save-btn" style="flex:1;" onclick="savePromoFlipCard()">${isNew ? 'إضافة العرض' : '💾 حفظ التغييرات'}</button>
                <button class="ph-btn" onclick="document.getElementById('pf-modal').remove()">إلغاء</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('pf-badge-style').addEventListener('change', function () {
        document.getElementById('pf-badge-color-row').style.display = this.value === 'custom' ? 'block' : 'none';
    });
    document.getElementById('pf-backstyle').addEventListener('change', function () {
        const isItems = this.value === 'items';
        document.getElementById('pf-group-items').style.display = isItems ? 'block' : 'none';
        document.getElementById('pf-group-desc').style.display  = isItems ? 'none' : 'block';
        document.getElementById('pf-group-tags').style.display  = isItems ? 'none' : 'block';
        document.getElementById('pf-group-price').style.display = isItems ? 'none' : 'block';
    });
}

function _pfPreviewImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
        toast('⚠️ الملف كبير جداً — الحد الأقصى 6MB', true);
        input.value = '';
        return;
    }
    _pfPendingImageFile = file;

    const preview     = document.getElementById('pf-img-preview');
    const placeholder = document.getElementById('pf-img-placeholder');
    const status       = document.getElementById('pf-img-status');
    const reader = new FileReader();
    reader.onload = (e) => {
        _pfPendingImageDataUrl = e.target.result;
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    if (status) status.innerHTML = `<span style="color:var(--orange);">📤 سيتم رفع "${file.name}" عند الحفظ</span>`;
}

/* Upload (or replace) a promo card's image as assets/promos/{id}.webp,
   via the adminUploadImage Cloud Function (see _adminUploadImage above). */
async function _pfUploadImage(file, promoId) {
    const targetName = promoId.toLowerCase() + '.webp';
    return await _adminUploadImage(file, PROMO_GH_FOLDER, targetName);
}

async function savePromoFlipCard() {
    const errorEl = document.getElementById('pf-modal-error');
    errorEl.style.display = 'none';

    const existingKey = document.getElementById('pf-key').value.trim();
    const isNew        = !existingKey;
    const title        = document.getElementById('pf-title').value.trim();
    const backStyle    = document.getElementById('pf-backstyle').value;
    const badgeStyle   = document.getElementById('pf-badge-style').value;

    if (!title) { errorEl.textContent = '⚠️ عنوان العرض مطلوب'; errorEl.style.display = 'block'; return; }
    if (isNew && !_pfPendingImageFile) { errorEl.textContent = '⚠️ الصورة مطلوبة'; errorEl.style.display = 'block'; return; }

    const btn = document.getElementById('pf-save-btn');
    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';

    try {
        const key = existingKey || ('promo_' + Date.now());

        let imagePath = _promoFlipCards[existingKey]?.image || '';
        if (_pfPendingImageFile) {
            imagePath = await _pfUploadImage(_pfPendingImageFile, key);
        }

        const existingOrder = _promoFlipCards[existingKey]?.order;
        const maxOrder = Object.values(_promoFlipCards).reduce((m, c) => Math.max(m, c.order || 0), 0);

        const payload = {
            order: existingOrder ?? (maxOrder + 1),
            active: document.getElementById('pf-active').checked,
            image: imagePath,
            badgeText: document.getElementById('pf-badge-text').value.trim(),
            badgeStyle,
            badgeColor: badgeStyle === 'custom' ? document.getElementById('pf-badge-color').value : null,
            storeName: document.getElementById('pf-store-name').value.trim(),
            title,
            backStyle,
            description: document.getElementById('pf-description').value.trim(),
            itemsRaw: document.getElementById('pf-items-raw').value,
            tagsRaw: document.getElementById('pf-tags-raw').value.trim(),
            priceText: document.getElementById('pf-price-text').value.trim(),
            footerNote: document.getElementById('pf-footer-note').value.trim(),
            ctaText: document.getElementById('pf-cta-text').value.trim() || '🛒 اطلب الآن',
            orderText: document.getElementById('pf-order-text').value.trim(),
        };

        await fbSet(`promoFlipCards/${key}`, payload);
        toast(isNew ? '✅ تمت إضافة العرض' : '✅ تم حفظ التغييرات');
        document.getElementById('pf-modal').remove();
        await renderPromoFlipAdmin();
    } catch (e) {
        errorEl.textContent = '⚠️ خطأ: ' + e.message;
        errorEl.style.display = 'block';
        btn.disabled = false; btn.textContent = existingKey ? '💾 حفظ التغييرات' : 'إضافة العرض';
    }
}


// ═══════════════════════════════════════════════════════════════
// HERO BACKGROUNDS PANEL — خلفيات الواجهة الرئيسية
// Firebase RTDB path: settings/heroBackgrounds/{key}
//   { order, active, image, title, tag, durationSec,
//     linkType('none'|'stores'|'custom'), linkValue }
// Images upload the same way promo/item images do (GitHub Contents
// API, converted to WebP) — see HEROBG_GH_FOLDER.
// ═══════════════════════════════════════════════════════════════
let _heroBgCards = {};
let _hbPendingImageFile = null;
// Images live on GitHub Pages (assets/hero-bg/…), which takes a few
// minutes to build + propagate through its CDN after a push — so the
// remote URL for a just-uploaded image can stay stale/blank for a while.
// That's fine for eventual public visitors, but the admin who JUST
// uploaded it shouldn't have to wait: keep the local data-URL preview
// here, keyed by background id, and prefer it over the remote URL for
// the rest of this session.
let _hbLocalPreviewOverrides = {};

async function renderHeroBgAdmin() {
    const grid = document.getElementById('herobg-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">⏳ جاري التحميل…</div>`;

    let data = null;
    try { data = await fbGet('settings/heroBackgrounds'); } catch (e) {}
    _heroBgCards = data && typeof data === 'object' ? data : {};

    const entries = Object.entries(_heroBgCards).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

    if (!entries.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">لا يوجد خلفيات بعد — اضغط "إضافة خلفية" لإضافة أول واحدة 🖼️<br><span style="font-size:0.72rem;">وبدون أي خلفية، تبقى الصورة الثابتة الحالية كما هي</span></div>`;
        return;
    }

    const visibleEntries = hideInactiveHeroBg ? entries.filter(([, bg]) => bg.active !== false) : entries;

    if (!visibleEntries.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">كل الخلفيات مخفية حالياً 🙈<br><span style="font-size:0.72rem;">أطفئ "إخفاء غير المفعّلة" في الأعلى لرؤيتها</span></div>`;
        return;
    }

    grid.innerHTML = visibleEntries.map(([key, bg], idx) => _hbCardHtml(key, bg, idx, visibleEntries.length)).join('');

    grid.querySelectorAll('[data-hb-edit]').forEach(btn => {
        btn.addEventListener('click', () => openHeroBgModal({ ..._heroBgCards[btn.dataset.hbEdit], _key: btn.dataset.hbEdit }));
    });
    grid.querySelectorAll('[data-hb-delete]').forEach(btn => {
        btn.addEventListener('click', () => deleteHeroBgConfirm(btn.dataset.hbDelete));
    });
    grid.querySelectorAll('[data-hb-toggle]').forEach(cb => {
        cb.addEventListener('change', () => toggleHeroBgActive(cb.dataset.hbToggle, cb.checked));
    });
    grid.querySelectorAll('[data-hb-up]').forEach(btn => {
        btn.addEventListener('click', () => moveHeroBg(btn.dataset.hbUp, -1));
    });
    grid.querySelectorAll('[data-hb-down]').forEach(btn => {
        btn.addEventListener('click', () => moveHeroBg(btn.dataset.hbDown, 1));
    });
    _hbAttachDragReorder(grid);
}

const HB_LINK_LABELS = { none: '🚫 بدون رابط', stores: '🏪 قسم المتاجر', whatsapp: '📱 واتساب الإدارة', custom: '🔗 رابط مخصص' };

function _hbCardHtml(key, bg, idx, total) {
    const isActive = bg.active !== false;
    // Prefer this session's local preview of a just-uploaded image (see
    // _hbLocalPreviewOverrides above) — falls back to the remote GitHub
    // Pages URL, cache-busted with its own update time so at least the
    // browser's own cache doesn't also hold onto a stale copy.
    const imgSrc = _hbLocalPreviewOverrides[key] || (bg.image ? `${bg.image}?v=${bg.updatedAt || 0}` : '');
    const durSec = parseFloat(bg.durationSec) || 5;
    return `
    <div class="hb-card${isActive ? '' : ' inactive'}" draggable="true" data-hb-key="${key}">
        <div class="hb-card__poster">
            <img class="hb-card__img" src="${imgSrc}" alt="" draggable="false" ondragstart="return false;" onerror="this.style.opacity=0.15">
            <div class="hb-card__scrim"></div>

            <div class="hb-card__top-row">
                <span class="hb-card__grip" title="اسحب لإعادة الترتيب">⠿</span>
                <span class="hb-card__order" title="ترتيب العرض">#${bg.order ?? (idx + 1)}</span>
                <span class="hb-card__duration" title="مدة العرض">⏱ ${durSec}ث</span>
                ${_hbLocalPreviewOverrides[key] ? `<span class="hb-card__pending">⏳ قيد النشر</span>` : ''}
            </div>

            <label class="hb-card__switch" title="${isActive ? 'إخفاء' : 'تفعيل'}">
                <input type="checkbox" data-hb-toggle="${key}" ${isActive ? 'checked' : ''}>
                <span class="hb-card__switch-track"><span class="hb-card__switch-thumb"></span></span>
            </label>

            <!-- Live preview of the caption chip exactly as visitors see it on the site -->
            ${(bg.tag || bg.title) ? `
            <div class="hb-card__caption-preview">
                ${bg.tag ? `<span class="hb-card__caption-tag">${bg.tag}</span>` : ''}
                <span class="hb-card__caption-title">${bg.title || '(بدون عنوان)'}</span>
            </div>` : `<div class="hb-card__caption-preview hb-card__caption-preview--empty">(بدون عنوان أو وسم)</div>`}
        </div>

        <div class="hb-card__body">
            <div class="hb-card__meta">
                <span class="hb-card__link-tag">${HB_LINK_LABELS[bg.linkType] || HB_LINK_LABELS.none}</span>
                <span class="hb-card__status ${isActive ? 'is-on' : 'is-off'}">
                    <i></i>${isActive ? 'مفعّلة' : 'مخفية'}
                </span>
            </div>
            <div class="hb-card__row">
                <div class="hb-card__reorder">
                    <button data-hb-up="${key}" ${idx === 0 ? 'disabled' : ''} title="تحريك لأعلى">▲</button>
                    <button data-hb-down="${key}" ${idx === total - 1 ? 'disabled' : ''} title="تحريك لأسفل">▼</button>
                </div>
                <div class="hb-card__actions">
                    <button class="ec-btn" data-hb-edit="${key}">✏️ تعديل</button>
                    <button class="ec-btn danger" data-hb-delete="${key}">🗑 حذف</button>
                </div>
            </div>
        </div>
    </div>`;
}

async function toggleHeroBgActive(key, active) {
    try {
        await fbUpdate(`settings/heroBackgrounds/${key}`, { active });
        toast(active ? '✅ الخلفية مفعّلة الآن' : '👁️‍🗨️ الخلفية مخفية عن الزوار');
        if (_heroBgCards[key]) _heroBgCards[key].active = active;
        if (hideInactiveHeroBg) renderHeroBgAdmin();
    } catch (e) { toast('⚠️ تعذّر الحفظ: ' + e.message, true); renderHeroBgAdmin(); }
}

async function moveHeroBg(key, direction) {
    const entries = Object.entries(_heroBgCards).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const i = entries.findIndex(([k]) => k === key);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= entries.length) return;

    const [keyA, bgA] = entries[i];
    const [keyB, bgB] = entries[j];
    const orderA = bgA.order ?? (i + 1);
    const orderB = bgB.order ?? (j + 1);

    try {
        await Promise.all([
            fbUpdate(`settings/heroBackgrounds/${keyA}`, { order: orderB }),
            fbUpdate(`settings/heroBackgrounds/${keyB}`, { order: orderA }),
        ]);
        await renderHeroBgAdmin();
    } catch (e) { toast('⚠️ تعذّر تغيير الترتيب: ' + e.message, true); }
}

// ── Drag-and-drop reorder — grab any card (the ⠿ handle or the card
// itself) and drop it where you want it. Recomputes order 1..N for
// every card, not just the two swapped, so a card dragged from #7 to
// #1 correctly shifts everything in between rather than just swapping
// with its immediate neighbor (unlike the ▲▼ buttons, kept alongside
// this for accessibility/keyboard use).
let _hbDragKey = null;

function _hbAttachDragReorder(grid) {
    grid.querySelectorAll('.hb-card').forEach(card => {
        card.addEventListener('dragstart', () => {
            _hbDragKey = card.dataset.hbKey;
            // Deferred so the browser's drag-ghost still captures the
            // full-opacity card before it visually dims.
            setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            grid.querySelectorAll('.hb-card.drag-over').forEach(c => c.classList.remove('drag-over'));
            _hbDragKey = null;
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (card.dataset.hbKey !== _hbDragKey) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const targetKey = card.dataset.hbKey;
            if (!_hbDragKey || _hbDragKey === targetKey) return;
            await _hbReorderByDrag(_hbDragKey, targetKey);
        });
    });
}

async function _hbReorderByDrag(draggedKey, targetKey) {
    const keys = Object.entries(_heroBgCards)
        .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
        .map(([k]) => k);
    const from = keys.indexOf(draggedKey);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);

    try {
        await Promise.all(keys.map((k, i) => fbUpdate(`settings/heroBackgrounds/${k}`, { order: i + 1 })));
        await renderHeroBgAdmin();
        toast('↕️ تم تحديث الترتيب');
    } catch (e) { toast('⚠️ تعذّر تغيير الترتيب: ' + e.message, true); }
}

async function deleteHeroBgConfirm(key) {
    const bg = _heroBgCards[key];
    const ok = await showConfirm({
        title: 'حذف الخلفية',
        msg: `هل تريد حذف <b>${bg?.title || 'هذه الخلفية'}</b>؟<br><span style="color:var(--red)">لا يمكن التراجع عن هذا الإجراء.</span>`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف', cancelLabel: 'إلغاء',
    });
    if (!ok) return;
    try {
        await fbSet(`settings/heroBackgrounds/${key}`, null);
        delete _hbLocalPreviewOverrides[key];
        toast('✅ تم حذف الخلفية');
        await renderHeroBgAdmin();
    } catch (e) { toast('⚠️ تعذّر الحذف: ' + e.message, true); }
}

function openHeroBgModal(bg) {
    document.getElementById('hb-modal')?.remove();
    _hbPendingImageFile = null;

    const isNew = !bg;
    const linkType = bg?.linkType || 'none';

    const modal = document.createElement('div');
    modal.id = 'hb-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;`;
    modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;">
        <div style="padding:16px 20px;border-bottom:1px solid var(--surface3);display:flex;align-items:center;gap:10px;">
            <span style="font-size:0.88rem;font-weight:800;color:var(--white);">${isNew ? '🖼️ إضافة خلفية جديدة' : '✏️ تعديل الخلفية'}</span>
            <button onclick="document.getElementById('hb-modal').remove()"
                    style="margin-right:auto;background:none;border:none;cursor:pointer;color:var(--gray);font-size:1.1rem;">✕</button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">

            <input type="hidden" id="hb-key" value="${bg?._key || ''}">

            <!-- Image -->
            <div style="text-align:center;">
                <div onclick="document.getElementById('hb-img-file').click()"
                     style="width:100%;height:150px;border-radius:12px;overflow:hidden;background:var(--surface3);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px dashed var(--border);position:relative;"
                     onmouseover="this.style.borderColor='var(--orange)'" onmouseout="this.style.borderColor='var(--border)'">
                    ${bg?.image
                        ? `<img src="${bg.image}" style="width:100%;height:100%;object-fit:cover;" id="hb-img-preview">`
                        : `<span style="font-size:2rem;" id="hb-img-placeholder">🖼️</span>
                           <img src="" style="width:100%;height:100%;object-fit:cover;display:none;" id="hb-img-preview">`
                    }
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:#fff;font-size:0.62rem;font-weight:700;padding:3px 0;text-align:center;">📤 رفع / تغيير الصورة</div>
                </div>
                <input type="file" id="hb-img-file" accept="image/*" style="display:none;" onchange="_hbPreviewImage(this)">
                <div style="font-size:0.66rem;color:var(--gray);">يفضّل صورة عريضة (Landscape) بجودة عالية — تُحفظ تلقائياً بصيغة WebP</div>
                <div id="hb-res-warning" style="display:none;font-size:0.68rem;color:var(--yellow);font-weight:700;margin-top:4px;"></div>
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">📌 عنوان الخلفية (يظهر بالشريط السفلي، اختياري)</label>
                <input type="text" id="hb-title" value="${bg?.title || ''}" placeholder="مثال: برجر هاوس"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🏷️ وسم صغير (اختياري)</label>
                <input type="text" id="hb-tag" value="${bg?.tag || ''}" placeholder="مثال: 🏪 متجر مميز / 🔥 عرض اليوم"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">⏱️ مدة العرض (بالثواني)</label>
                <input type="number" id="hb-duration" value="${bg?.durationSec || 5}" min="2" max="30" step="1"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:var(--mono);font-size:0.82rem;">
            </div>

            <div>
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">🔗 عند الضغط على الخلفية</label>
                <select id="hb-linktype" onchange="
                    document.getElementById('hb-linkvalue-row').style.display = this.value === 'custom' ? 'block' : 'none';
                    document.getElementById('hb-wa-msg-row').style.display   = this.value === 'whatsapp' ? 'block' : 'none';
                "
                        style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
                    <option value="none"     ${linkType === 'none'     ? 'selected' : ''}>🚫 بدون رابط (زخرفة فقط)</option>
                    <option value="stores"   ${linkType === 'stores'   ? 'selected' : ''}>🏪 انتقال لقسم المتاجر</option>
                    <option value="whatsapp" ${linkType === 'whatsapp' ? 'selected' : ''}>📱 واتساب الإدارة (برسالة جاهزة)</option>
                    <option value="custom"   ${linkType === 'custom'   ? 'selected' : ''}>🔗 رابط مخصص</option>
                </select>
            </div>
            <div id="hb-linkvalue-row" style="display:${linkType === 'custom' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">الرابط</label>
                <input type="text" id="hb-linkvalue" value="${bg?.linkValue || ''}" placeholder="https://wa.me/..."
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;">
            </div>
            <div id="hb-wa-msg-row" style="display:${linkType === 'whatsapp' ? 'block' : 'none'};">
                <label style="font-size:0.72rem;color:var(--gray-light);display:block;margin-bottom:4px;">💬 رسالة الواتساب (تُرسَل جاهزة لرقم الإدارة)</label>
                <textarea id="hb-wa-msg" rows="3" placeholder="مثال: مرحباً، بدي أطلب من هاي الخلفية 🙌"
                       style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:var(--radius-md);color:var(--white);font-family:inherit;font-size:0.82rem;resize:vertical;">${bg?.whatsappMsg || ''}</textarea>
                <div style="font-size:0.64rem;color:var(--gray);margin-top:4px;">سيُفتح واتساب على رقم الإدارة المحفوظ بالإعدادات (⚙️ الإعدادات ← رقم هاتف الإدارة) مع هذه الرسالة معبّأة تلقائياً.</div>
            </div>

            <div style="display:flex;align-items:center;gap:10px;padding-top:4px;border-top:1px solid var(--surface3);">
                <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--gray-light);cursor:pointer;">
                    <input type="checkbox" id="hb-active" ${(!bg || bg.active !== false) ? 'checked' : ''}> مفعّلة (ظاهرة للزوار)
                </label>
            </div>

            <p id="hb-modal-error" style="display:none;color:var(--red);font-size:0.76rem;"></p>

            <div style="display:flex;gap:8px;margin-top:4px;">
                <button class="ph-btn ph-btn--primary" id="hb-save-btn" style="flex:1;" onclick="saveHeroBg()">${isNew ? 'إضافة الخلفية' : '💾 حفظ التغييرات'}</button>
                <button class="ph-btn" onclick="document.getElementById('hb-modal').remove()">إلغاء</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function _hbPreviewImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
        toast('⚠️ الملف كبير جداً — الحد الأقصى 8MB', true);
        input.value = '';
        return;
    }
    _hbPendingImageFile = file;

    const preview     = document.getElementById('hb-img-preview');
    const placeholder = document.getElementById('hb-img-placeholder');
    const warningEl    = document.getElementById('hb-res-warning');
    const reader = new FileReader();
    reader.onload = (e) => {
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';

        // This banner is shown full-bleed, edge-to-edge, at up to ~780px
        // tall and the full viewport width (well over 1920px on a wide
        // desktop monitor). A source photo smaller than that gets
        // upscaled by the browser to fill the space — which is what
        // actually causes the blurry look, not anything in the upload
        // pipeline itself (nothing here downscales or over-compresses
        // the image). No CSS can restore detail a source photo doesn't
        // have, so flag it here instead, before it goes live.
        if (warningEl) {
            const probe = new Image();
            probe.onload = () => {
                const w = probe.naturalWidth, h = probe.naturalHeight;
                if (w < 1920 || h < 900) {
                    warningEl.textContent = `⚠️ دقة الصورة ${w}×${h} — قد تظهر غير واضحة على الشاشات الكبيرة. يُفضّل صورة بدقة 1920×1080 أو أعلى (landscape).`;
                    warningEl.style.display = 'block';
                } else {
                    warningEl.style.display = 'none';
                }
            };
            probe.src = e.target.result;
        }
    };
    reader.readAsDataURL(file);
}

/* Upload a hero background image as assets/hero-bg/{id}.webp, via the
   adminUploadImage Cloud Function (see _adminUploadImage above).
   Higher quality (0.97 vs the default 0.92) than item/promo photos —
   this is shown full-bleed across the whole hero banner, so compression
   softness is far more visible here than on a small item thumbnail. */
async function _hbUploadImage(file, id) {
    const targetName = id.toLowerCase() + '.webp';
    return await _adminUploadImage(file, HEROBG_GH_FOLDER, targetName, 0.97);
}

async function saveHeroBg() {
    const errorEl = document.getElementById('hb-modal-error');
    errorEl.style.display = 'none';

    const existingKey = document.getElementById('hb-key').value.trim();
    const isNew       = !existingKey;
    const linkType    = document.getElementById('hb-linktype').value;

    if (isNew && !_hbPendingImageFile) { errorEl.textContent = '⚠️ الصورة مطلوبة'; errorEl.style.display = 'block'; return; }

    // WhatsApp-with-message needs the admin phone number saved under
    // ⚙️ الإعدادات first — build the wa.me link the same way the rest of
    // the app does (see rewards-queue / testGreenApi): normalize to a
    // 961-prefixed number, then attach the message as ?text=.
    let waMsg = '';
    if (linkType === 'whatsapp') {
        waMsg = (document.getElementById('hb-wa-msg')?.value || '').trim();
        if (!waMsg) { errorEl.textContent = '⚠️ اكتب رسالة الواتساب أولاً'; errorEl.style.display = 'block'; return; }
        const adminPhoneRaw = (await fbGet('settings/adminPhone').catch(() => '')) || '';
        const ph = adminPhoneRaw.replace(/[^0-9]/g, '');
        if (!ph) {
            errorEl.textContent = '⚠️ لم يتم حفظ رقم هاتف الإدارة بعد — أضفه من ⚙️ الإعدادات أولاً';
            errorEl.style.display = 'block';
            return;
        }
    }

    const btn = document.getElementById('hb-save-btn');
    btn.disabled = true; btn.textContent = '⏳ جاري الحفظ…';

    try {
        const key = existingKey || ('herobg_' + Date.now());

        let imagePath = _heroBgCards[existingKey]?.image || '';
        if (_hbPendingImageFile) {
            imagePath = await _hbUploadImage(_hbPendingImageFile, key);
            // Reuse the data-URL already generated for the modal's own
            // preview (see _hbPreviewImage) so the grid card shows it
            // instantly too, instead of the remote URL that's still
            // propagating through GitHub Pages' CDN.
            const modalPreviewImg = document.getElementById('hb-img-preview');
            if (modalPreviewImg && modalPreviewImg.src) _hbLocalPreviewOverrides[key] = modalPreviewImg.src;
        }

        const existingOrder = _heroBgCards[existingKey]?.order;
        const maxOrder = Object.values(_heroBgCards).reduce((m, c) => Math.max(m, c.order || 0), 0);

        let linkValue = '';
        if (linkType === 'custom') {
            linkValue = document.getElementById('hb-linkvalue').value.trim();
        }
        // Note: linkType 'whatsapp' no longer bakes a wa.me/<number> link
        // here — that froze the slide onto whatever number was set at save
        // time. hero-bg.js now builds the wa.me link itself at render time
        // from the LIVE settings/adminPhone, using whatsappMsg (below) as
        // the message. So linkValue stays empty for this type.

        const payload = {
            order: existingOrder ?? (maxOrder + 1),
            active: document.getElementById('hb-active').checked,
            image: imagePath,
            updatedAt: Date.now(),
            title: document.getElementById('hb-title').value.trim(),
            tag: document.getElementById('hb-tag').value.trim(),
            durationSec: parseFloat(document.getElementById('hb-duration').value) || 5,
            linkType,
            linkValue,
            whatsappMsg: linkType === 'whatsapp' ? waMsg : '',
        };

        await fbSet(`settings/heroBackgrounds/${key}`, payload);
        toast(isNew ? '✅ تمت إضافة الخلفية' : '✅ تم حفظ التغييرات');
        document.getElementById('hb-modal').remove();
        await renderHeroBgAdmin();
    } catch (e) {
        errorEl.textContent = '⚠️ خطأ: ' + e.message;
        errorEl.style.display = 'block';
        btn.disabled = false; btn.textContent = existingKey ? '💾 حفظ التغييرات' : 'إضافة الخلفية';
    }
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════════════════════