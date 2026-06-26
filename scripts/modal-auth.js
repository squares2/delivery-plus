/* ============================================================
   scripts/modal-auth.js
   Wires login, register, and account modals.
   Username + Password auth. SMS ready to re-enable later.
   ============================================================ */

function initModalAuth() {
    window.__renderAccountModal = renderAccountModal;

    // ── Login ───────────────────────────────────────────────
    const loginBtn = document.getElementById('login-submit');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const username = document.getElementById('login-username')?.value || '';
            const password = document.getElementById('login-password')?.value || '';
            const errorEl  = document.getElementById('login-error');
            setLoading(loginBtn, true, 'جاري الدخول...');
            hideError(errorEl);
            const result = await window.DelivoAuth.login({ username, password });
            setLoading(loginBtn, false, 'دخول');
            if (result.error) showError(errorEl, result.message);
            else {
                closeModal('modal-login');
                clearFields(['login-username', 'login-password']);
            }
        });
    }

    // ── Register ────────────────────────────────────────────
    const regBtn = document.getElementById('reg-submit');
    if (regBtn) {
        regBtn.addEventListener('click', async () => {
            const username    = document.getElementById('reg-username')?.value    || '';
            const displayName = document.getElementById('reg-displayname')?.value || '';
            const password    = document.getElementById('reg-password')?.value    || '';
            const phoneRaw    = document.getElementById('reg-phone')?.value       || '';
            const lat         = document.getElementById('reg-lat')?.value         || null;
            const lng         = document.getElementById('reg-lng')?.value         || null;
            const errorEl     = document.getElementById('reg-error');

            // Client-side Lebanese phone validation
            const phoneDigits = phoneRaw.replace(/[\s\-]/g, '');
            if (!phoneDigits) {
                showError(errorEl, 'رقم الهاتف مطلوب. أدخل رقمك اللبناني.');
                document.getElementById('reg-phone')?.focus();
                return;
            }
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits)) {
                showError(errorEl, 'رقم الهاتف غير صحيح. مثال: 03 123 456 أو 71 123 456');
                document.getElementById('reg-phone')?.focus();
                return;
            }

            setLoading(regBtn, true, 'جاري الإنشاء...');
            hideError(errorEl);

            const result = await window.DelivoAuth.register({
                username, displayName, password, phone: phoneDigits, lat, lng
            });

            setLoading(regBtn, false, 'إنشاء الحساب');
            if (result.error) {
                showError(errorEl, result.message);
            } else {
                closeModal('modal-subscribe');
                clearFields(['reg-username','reg-displayname','reg-password','reg-phone']);
                resetLocationBtn();
            }
        });
    }

    // ── Location: GPS button ────────────────────────────────
    const gpsBtn = document.getElementById('reg-location-gps');
    if (gpsBtn) {
        gpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setLocationStatus('error', 'جهازك لا يدعم تحديد الموقع.');
                return;
            }
            setLocationStatus('loading', 'جاري تحديد موقعك...');
            gpsBtn.disabled = true;

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    document.getElementById('reg-lat').value = lat;
                    document.getElementById('reg-lng').value = lng;
                    setLocationStatus('success', '✓ تم تحديد موقعك بنجاح');
                    gpsBtn.disabled = false;
                    gpsBtn.classList.add('location-opt-btn--active');
                    // Hide map if open
                    document.getElementById('reg-map-wrap').style.display = 'none';
                    // If map already initialized, update its marker too
                    if (window._regMap) {
                        window._regMap.setView([lat, lng], 16);
                        window._regMarker.setLatLng([lat, lng]);
                    }
                },
                (err) => {
                    gpsBtn.disabled = false;
                    const msgs = {
                        1: 'رفضت الإذن. يرجى السماح بالوصول للموقع.',
                        2: 'تعذّر تحديد الموقع. حاول مرة أخرى.',
                        3: 'انتهت المهلة. حاول مرة أخرى.',
                    };
                    setLocationStatus('error', msgs[err.code] || 'تعذّر تحديد الموقع.');
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    }

    // ── Location: Map picker button ──────────────────────────
    const mapBtn = document.getElementById('reg-location-map');
    if (mapBtn) {
        mapBtn.addEventListener('click', () => {
            const mapWrap = document.getElementById('reg-map-wrap');
            mapWrap.style.display = 'block';
            mapBtn.classList.add('location-opt-btn--active');

            // Initialize Leaflet map once
            if (!window._regMap) {
                const defaultLat = 34.0040;
                const defaultLng = 36.2100;
                const savedLat   = parseFloat(document.getElementById('reg-lat').value) || defaultLat;
                const savedLng   = parseFloat(document.getElementById('reg-lng').value) || defaultLng;

                // ── Google Maps API key ───────────────────────────
                const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';

                // ── Tile layers ───────────────────────────────────
                window._tileLayers = {
                    satellite: L.tileLayer(
                        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
                        { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
                    ),
                    standard: L.tileLayer(
                        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        { attribution: '© OpenStreetMap', maxZoom: 19 }
                    ),
                };

                // Default = satellite
                window._currentLayer = 'satellite';

                window._regMap = L.map('reg-map', {
                    zoomControl: true,
                    attributionControl: true,
                }).setView([savedLat, savedLng], 17);

                window._tileLayers.satellite.addTo(window._regMap);

                // ── Toggle control (satellite ↔ standard) ─────────
                const toggleCtrl = L.control({ position: 'topright' });
                toggleCtrl.onAdd = function() {
                    const btn = L.DomUtil.create('button', 'map-toggle-btn');
                    btn.innerHTML = '🗺 خريطة';
                    btn.title     = 'تبديل نوع الخريطة';
                    btn.style.cssText = `
                        background:#fff; border:2px solid #FF5C00;
                        border-radius:6px; padding:5px 9px;
                        font-size:12px; font-weight:700;
                        cursor:pointer; color:#FF5C00;
                        box-shadow:0 1px 5px rgba(0,0,0,0.3);
                        white-space:nowrap;
                    `;
                    L.DomEvent.on(btn, 'click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (window._currentLayer === 'satellite') {
                            window._regMap.removeLayer(window._tileLayers.satellite);
                            window._tileLayers.standard.addTo(window._regMap);
                            window._currentLayer = 'standard';
                            btn.innerHTML = '🛰 صورة جوية';
                        } else {
                            window._regMap.removeLayer(window._tileLayers.standard);
                            window._tileLayers.satellite.addTo(window._regMap);
                            window._currentLayer = 'satellite';
                            btn.innerHTML = '🗺 خريطة';
                        }
                    });
                    return btn;
                };
                toggleCtrl.addTo(window._regMap);

                // ── Orange draggable marker ───────────────────────
                const orangeIcon = L.divIcon({
                    className: '',
                    html: `<div style="
                        width:30px;height:30px;
                        background:#FF5C00;
                        border:3px solid #fff;
                        border-radius:50% 50% 50% 0;
                        transform:rotate(-45deg);
                        box-shadow:0 2px 8px rgba(0,0,0,0.4);
                    "></div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                });

                window._regMarker = L.marker([savedLat, savedLng], {
                    icon: orangeIcon,
                    draggable: true,
                }).addTo(window._regMap);

                // Drag marker
                window._regMarker.on('dragend', (e) => {
                    const pos = e.target.getLatLng();
                    document.getElementById('reg-lat').value = pos.lat.toFixed(6);
                    document.getElementById('reg-lng').value = pos.lng.toFixed(6);
                    setLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });

                // Click anywhere on map
                window._regMap.on('click', (e) => {
                    window._regMarker.setLatLng(e.latlng);
                    document.getElementById('reg-lat').value = e.latlng.lat.toFixed(6);
                    document.getElementById('reg-lng').value = e.latlng.lng.toFixed(6);
                    setLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });

                document.getElementById('reg-lat').value = savedLat.toFixed(6);
                document.getElementById('reg-lng').value = savedLng.toFixed(6);

            } else {
                setTimeout(() => window._regMap.invalidateSize(), 100);
            }

            setLocationStatus('info', 'اسحب الدبوس أو انقر على الخريطة لتحديد موقعك');
        });
    }

    // ── Password show/hide toggle ───────────────────────────
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.password-toggle');
        if (!toggle) return;
        const targetId = toggle.dataset.target;
        const input    = document.getElementById(targetId);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        // Swap icon
        const svg = toggle.querySelector('svg');
        if (svg) svg.style.opacity = input.type === 'text' ? '0.5' : '1';
    });

    // ── Username live validation hint ───────────────────────
    const usernameInput = document.getElementById('reg-username');
    if (usernameInput) {
        usernameInput.addEventListener('input', () => {
            const val   = usernameInput.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            usernameInput.value = val;
        });
    }

    // ── Edit profile modal — open ───────────────────────────
    document.addEventListener('click', (e) => {
        // Both the edit chip and Personal Information row open it
        if (e.target.closest('#acct-edit-btn') || e.target.closest('#acct-profile-btn')) {
            closeModal('modal-account');
            populateEditForm();
            setTimeout(() => openModal('modal-edit-profile'), 180);
        }
        // Change Password row also opens edit modal (scrolled to password section)
        if (e.target.closest('#acct-password-btn')) {
            closeModal('modal-account');
            populateEditForm();
            setTimeout(() => {
                openModal('modal-edit-profile');
                // Scroll to password section
                setTimeout(() => {
                    const pwdField = document.getElementById('edit-current-password');
                    if (pwdField) pwdField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }, 180);
        }
    });

    // ── Edit profile — GPS button ────────────────────────────
    const editGpsBtn = document.getElementById('edit-location-gps');
    if (editGpsBtn) {
        editGpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                setEditLocationStatus('error', 'جهازك لا يدعم تحديد الموقع.');
                return;
            }
            setEditLocationStatus('loading', 'جاري تحديد موقعك...');
            editGpsBtn.disabled = true;
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    document.getElementById('edit-lat').value = lat;
                    document.getElementById('edit-lng').value = lng;
                    setEditLocationStatus('success', '✓ تم تحديد موقعك بنجاح');
                    editGpsBtn.disabled = false;
                    editGpsBtn.classList.add('location-opt-btn--active');
                    document.getElementById('edit-map-wrap').style.display = 'none';
                    if (window._editMap) {
                        window._editMap.setView([lat, lng], 16);
                        window._editMarker.setLatLng([lat, lng]);
                    }
                },
                (err) => {
                    editGpsBtn.disabled = false;
                    const msgs = { 1: 'رفضت الإذن.', 2: 'تعذّر تحديد الموقع.', 3: 'انتهت المهلة.' };
                    setEditLocationStatus('error', msgs[err.code] || 'تعذّر تحديد الموقع.');
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    }

    // ── Edit profile — Map button ─────────────────────────────
    const editMapBtn = document.getElementById('edit-location-map');
    if (editMapBtn) {
        editMapBtn.addEventListener('click', () => {
            const mapWrap = document.getElementById('edit-map-wrap');
            mapWrap.style.display = 'block';
            editMapBtn.classList.add('location-opt-btn--active');

            if (!window._editMap) {
                const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';

                // Use saved location if exists, else Baalbek default
                const savedLat = parseFloat(document.getElementById('edit-lat').value) || 34.0040;
                const savedLng = parseFloat(document.getElementById('edit-lng').value) || 36.2100;

                window._editTileLayers = {
                    satellite: L.tileLayer(
                        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
                        { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
                    ),
                    standard: L.tileLayer(
                        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        { attribution: '© OpenStreetMap', maxZoom: 19 }
                    ),
                };
                window._editCurrentLayer = 'satellite';

                window._editMap = L.map('edit-map', { zoomControl: true })
                    .setView([savedLat, savedLng], 17);
                window._editTileLayers.satellite.addTo(window._editMap);

                // Toggle control
                const toggleCtrl = L.control({ position: 'topright' });
                toggleCtrl.onAdd = function() {
                    const btn = L.DomUtil.create('button', '');
                    btn.innerHTML = '🗺 خريطة';
                    btn.style.cssText = `
                        background:#fff; border:2px solid #FF5C00;
                        border-radius:6px; padding:5px 9px;
                        font-size:12px; font-weight:700;
                        cursor:pointer; color:#FF5C00;
                        box-shadow:0 1px 5px rgba(0,0,0,0.3);
                        white-space:nowrap;
                    `;
                    L.DomEvent.on(btn, 'click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        if (window._editCurrentLayer === 'satellite') {
                            window._editMap.removeLayer(window._editTileLayers.satellite);
                            window._editTileLayers.standard.addTo(window._editMap);
                            window._editCurrentLayer = 'standard';
                            btn.innerHTML = '🛰 صورة جوية';
                        } else {
                            window._editMap.removeLayer(window._editTileLayers.standard);
                            window._editTileLayers.satellite.addTo(window._editMap);
                            window._editCurrentLayer = 'satellite';
                            btn.innerHTML = '🗺 خريطة';
                        }
                    });
                    return btn;
                };
                toggleCtrl.addTo(window._editMap);

                // Orange marker
                const orangeIcon = L.divIcon({
                    className: '',
                    html: `<div style="width:30px;height:30px;background:#FF5C00;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                });
                window._editMarker = L.marker([savedLat, savedLng], {
                    icon: orangeIcon, draggable: true,
                }).addTo(window._editMap);

                window._editMarker.on('dragend', (e) => {
                    const pos = e.target.getLatLng();
                    document.getElementById('edit-lat').value = pos.lat.toFixed(6);
                    document.getElementById('edit-lng').value = pos.lng.toFixed(6);
                    setEditLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });
                window._editMap.on('click', (e) => {
                    window._editMarker.setLatLng(e.latlng);
                    document.getElementById('edit-lat').value = e.latlng.lat.toFixed(6);
                    document.getElementById('edit-lng').value = e.latlng.lng.toFixed(6);
                    setEditLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });

                document.getElementById('edit-lat').value = savedLat.toFixed(6);
                document.getElementById('edit-lng').value = savedLng.toFixed(6);

            } else {
                setTimeout(() => window._editMap.invalidateSize(), 100);
            }
            setEditLocationStatus('info', 'اسحب الدبوس أو انقر على الخريطة لتحديد موقعك');
        });
    }

    // ── Edit profile — save display name + phone ─────────────
    const editSubmit = document.getElementById('edit-submit');
    if (editSubmit) {
        editSubmit.addEventListener('click', async () => {
            const displayName = document.getElementById('edit-displayname')?.value || '';
            const phone       = document.getElementById('edit-phone')?.value        || '';
            const lat         = document.getElementById('edit-lat')?.value          || null;
            const lng         = document.getElementById('edit-lng')?.value          || null;
            const errorEl     = document.getElementById('edit-error');
            const successEl   = document.getElementById('edit-success');

            setLoading(editSubmit, true, 'جاري الحفظ...');
            hideError(errorEl);
            hideSuccess(successEl);

            const result = await window.DelivoAuth.updateProfile({ displayName, phone, lat, lng });

            setLoading(editSubmit, false, 'حفظ التغييرات');

            if (result.error) {
                showError(errorEl, result.message);
            } else {
                showSuccess(successEl, '✓ تم حفظ التغييرات بنجاح');
                // Update account modal with new name
                renderAccountModal();
            }
        });
    }

    // ── Edit profile — change password ───────────────────────
    const editPasswordSubmit = document.getElementById('edit-password-submit');
    if (editPasswordSubmit) {
        editPasswordSubmit.addEventListener('click', async () => {
            const currentPwd = document.getElementById('edit-current-password')?.value || '';
            const newPwd     = document.getElementById('edit-new-password')?.value     || '';
            const errorEl    = document.getElementById('edit-error');
            const successEl  = document.getElementById('edit-success');

            setLoading(editPasswordSubmit, true, 'جاري التغيير...');
            hideError(errorEl);
            hideSuccess(successEl);

            const result = await window.DelivoAuth.changePassword({
                currentPassword: currentPwd,
                newPassword:     newPwd,
            });

            setLoading(editPasswordSubmit, false, 'تغيير كلمة المرور');

            if (result.error) {
                showError(errorEl, result.message);
            } else {
                showSuccess(successEl, '✓ تم تغيير كلمة المرور بنجاح');
                clearFields(['edit-current-password', 'edit-new-password']);
            }
        });
    }

    // ── Navbar account button ────────────────────────────────
    const accountBtn = document.getElementById('account-btn');
    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            renderAccountModal();
            openModal('modal-account');
        });
    }

    // ── Mobile menu Sign In ──────────────────────────────────
    const mobileSigninBtn = document.getElementById('mobile-signin-btn');
    if (mobileSigninBtn) {
        mobileSigninBtn.addEventListener('click', () => {
            document.getElementById('mobile-menu')?.classList.remove('open');
            renderAccountModal();
            openModal('modal-account');
        });
    }

    // ── Account modal delegated clicks ───────────────────────
    document.addEventListener('click', async (e) => {
        if (e.target.closest('#acct-signout-btn')) {
            // Close modal immediately, then sign out
            // onAuthStateChanged will re-render everything cleanly
            closeModal('modal-account');
            try { await window.DelivoAuth.logout(); } catch(_) {}
            return;
        }
        if (e.target.closest('.acct-btn-signin')) {
            closeModal('modal-account');
            setTimeout(() => openModal('modal-login'), 180);
            return;
        }
        if (e.target.closest('.acct-btn-register')) {
            closeModal('modal-account');
            setTimeout(() => openModal('modal-subscribe'), 180);
            return;
        }
    });

    // ── Enter key ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const active = document.querySelector('.modal-overlay.active');
        if (!active) return;
        if (active.id === 'modal-login')     loginBtn?.click();
        if (active.id === 'modal-subscribe') regBtn?.click();
    });
}

// ── Render account modal ──────────────────────────────────────
function renderAccountModal() {
    const user    = window.DelivoUser;
    const guestEl = document.getElementById('acct-guest');
    const userEl  = document.getElementById('acct-user');
    const acctBtn = document.getElementById('account-btn');
    if (!guestEl || !userEl) return;

    if (user) {
        guestEl.style.display = 'none';
        userEl.style.display  = '';
        const initial  = (user.displayName || user.username || 'U').charAt(0).toUpperCase();
        const avatarEl = document.getElementById('acct-avatar');
        const nameEl   = document.getElementById('acct-name');
        const emailEl  = document.getElementById('acct-email');
        if (avatarEl) avatarEl.textContent = initial;
        if (nameEl)   nameEl.textContent   = user.displayName || user.username || 'User';
        if (emailEl)  emailEl.textContent  = user.username ? '@' + user.username : '';
        if (acctBtn)  acctBtn.classList.add('logged-in');
        // sync bottom bar
        const bbBtn = document.getElementById('bb-account-btn');
        if (bbBtn) bbBtn.classList.add('logged-in');
        // Update presence with user identity
        window._delivoAuthUser = { uid: user.uid, username: user.username || null };
        if (window._delivoPresence?.linkUser) {
            window._delivoPresence.linkUser(user.uid, user.username || null);
        }
    } else {
        guestEl.style.display = '';
        userEl.style.display  = 'none';
        if (acctBtn) acctBtn.classList.remove('logged-in');
        // sync bottom bar
        const bbBtn = document.getElementById('bb-account-btn');
        if (bbBtn) bbBtn.classList.remove('logged-in');
    }
}

// ── Location status display ──────────────────────────────────
function setLocationStatus(type, message) {
    const el = document.getElementById('reg-location-status');
    if (!el) return;
    el.style.display = 'block';
    el.textContent   = message;
    el.className     = 'location-status location-status--' + type;
}

// ── Location reset ────────────────────────────────────────────
function resetLocationBtn() {
    const statusEl = document.getElementById('reg-location-status');
    if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }

    const mapWrap = document.getElementById('reg-map-wrap');
    if (mapWrap) mapWrap.style.display = 'none';

    // Reset map instance so it re-initializes fresh next time
    if (window._regMap) {
        window._regMap.remove();
        window._regMap      = null;
        window._regMarker   = null;
        window._tileLayers  = null;
        window._currentLayer = null;
    }

    // Reset option buttons
    document.querySelectorAll('.location-opt-btn').forEach(b => {
        b.classList.remove('location-opt-btn--active');
        b.disabled = false;
    });

    const lat = document.getElementById('reg-lat');
    const lng = document.getElementById('reg-lng');
    if (lat) lat.value = '';
    if (lng) lng.value = '';
}

// ── Helpers ───────────────────────────────────────────────────
// ── Populate edit form with current user data ────────────────
function populateEditForm() {
    const user = window.DelivoUser;
    if (!user) return;
    const nameEl  = document.getElementById('edit-displayname');
    const phoneEl = document.getElementById('edit-phone');
    const latEl   = document.getElementById('edit-lat');
    const lngEl   = document.getElementById('edit-lng');
    if (nameEl)  nameEl.value  = user.displayName || '';
    if (phoneEl) phoneEl.value = (user.phone || '').replace('+961', '').replace(/\s/g, '');

    // Pre-fill existing location coords
    if (latEl && user.location?.lat) latEl.value = user.location.lat;
    if (lngEl && user.location?.lng) lngEl.value = user.location.lng;

    // Reset map instance so it recenters on existing location next open
    if (window._editMap) {
        window._editMap.remove();
        window._editMap         = null;
        window._editMarker      = null;
        window._editTileLayers  = null;
        window._editCurrentLayer = null;
    }
    document.getElementById('edit-map-wrap').style.display = 'none';

    // Show existing location status if saved
    const statusEl = document.getElementById('edit-location-status');
    if (statusEl) {
        if (user.location?.lat) {
            statusEl.style.display = 'block';
            statusEl.textContent   = '✓ يوجد موقع محفوظ — يمكنك تحديثه';
            statusEl.className     = 'location-status location-status--success';
        } else {
            statusEl.style.display = 'none';
        }
    }

    // Reset opt buttons
    document.querySelectorAll('#modal-edit-profile .location-opt-btn').forEach(b => {
        b.classList.remove('location-opt-btn--active');
        b.disabled = false;
    });

    // Clear messages
    const errEl = document.getElementById('edit-error');
    const sucEl = document.getElementById('edit-success');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (sucEl) { sucEl.style.display = 'none'; sucEl.textContent = ''; }
    clearFields(['edit-current-password', 'edit-new-password']);
}

function setEditLocationStatus(type, message) {
    const el = document.getElementById('edit-location-status');
    if (!el) return;
    el.style.display = 'block';
    el.textContent   = message;
    el.className     = 'location-status location-status--' + type;
}

function showSuccess(el, message) {
    if (!el) return;
    el.textContent       = message;
    el.style.display     = 'block';
    el.style.background  = '#edfaf3';
    el.style.borderColor = '#86efac';
    el.style.color       = '#15803d';
}
function hideSuccess(el) {
    if (!el) return;
    el.textContent   = '';
    el.style.display = 'none';
}

function setLoading(btn, loading, label) {
    btn.disabled    = loading;
    btn.textContent = label;
}
function showError(el, message) {
    if (!el) return;
    el.textContent       = message;
    el.style.display     = 'block';
    el.style.background  = '#fff1f1';
    el.style.borderColor = '#fca5a5';
    el.style.color       = '#b91c1c';
}
function hideError(el) {
    if (!el) return;
    el.textContent   = '';
    el.style.display = 'none';
}
function clearFields(ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}
function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('active');
    document.body.classList.add('modal-open');
    document.dispatchEvent(new CustomEvent('modalOpen', { detail: id }));
}
function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('active');
    document.body.classList.remove('modal-open');
}
/* ════════════════════════════════════════════════════════════
   Orders History — Customer order list from historyRequests
════════════════════════════════════════════════════════════ */

const OH_RTDB_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

const OH_STATE = {
    "0": { label: "جديد",       badge: "oh-badge--0" },
    "1": { label: "تم التوصيل", badge: "oh-badge--1" },
    "2": { label: "ملغي",       badge: "oh-badge--2" },
    "3": { label: "متأخر",      badge: "oh-badge--3" },
    "5": { label: "ملغي/مدفوع", badge: "oh-badge--5" },
};

let _ohFilter   = 'all';
let _ohOrders   = {};
let _ohListener = null;

// ── Open orders modal ─────────────────────────────────────────
function openOrdersModal() {
    const sheet   = document.getElementById('orders-sheet');
    const overlay = document.getElementById('orders-sheet-overlay');
    if (!sheet || !overlay) return;
    sheet.classList.add('active');
    overlay.classList.add('active');
    document.body.classList.add('modal-open');
    _loadOrders();
    // Auto-refresh active orders every 15 s while sheet is open
    if (!window._ordersRefreshTimer) {
        window._ordersRefreshTimer = setInterval(() => {
            const s = document.getElementById('orders-sheet');
            if (s && s.classList.contains('active')) _loadOrders();
        }, 15000);
    }
}

function closeOrdersModal() {
    const sheet   = document.getElementById('orders-sheet');
    const overlay = document.getElementById('orders-sheet-overlay');
    if (!sheet || !overlay) return;
    sheet.classList.remove('active');
    overlay.classList.remove('active');
    document.body.classList.remove('modal-open');
    clearInterval(window._ordersRefreshTimer);
    window._ordersRefreshTimer = null;
}

// ── Load orders from historyRequests/{uid} ────────────────────
async function _loadOrders() {
    const user = window.DelivoUser;
    if (!user) return;

    const listEl    = document.getElementById('orders-list');
    const loadingEl = document.getElementById('orders-loading');
    const emptyEl   = document.getElementById('orders-empty');

    // Only show spinner on first load — background refreshes are silent
    const isFirstLoad = listEl.querySelectorAll('.oh-card').length === 0;
    if (isFirstLoad) {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl)   emptyEl.style.display   = 'none';
    }

    try {
        const resp = await fetch(`${OH_RTDB_URL}/historyRequests/${user.uid}.json`);
        const data = await resp.json();

        if (loadingEl) loadingEl.style.display = 'none';

        if (!data || typeof data !== 'object') {
            if (isFirstLoad && emptyEl) emptyEl.style.display = 'block';
            return;
        }

        _ohOrders = data;
        _renderOrders();

    } catch(e) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (isFirstLoad && emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'خطأ في تحميل الطلبات';
        }
    }
}

// ── Render with current filter ────────────────────────────────
function _renderOrders() {
    const listEl  = document.getElementById('orders-list');
    const emptyEl = document.getElementById('orders-empty');
    if (!listEl) return;

    // Remember which card is currently expanded so we can restore it after re-render
    const expandedCard = listEl.querySelector('.oh-card.expanded');
    const expandedId   = expandedCard ? expandedCard.dataset.id : null;

    listEl.querySelectorAll('.oh-card').forEach(c => c.remove());

    const sorted = Object.entries(_ohOrders)
        .sort(([a], [b]) => {
            const na = parseInt(a.replace('id_','')) || 0;
            const nb = parseInt(b.replace('id_','')) || 0;
            return nb - na;
        })
        .filter(([, o]) => _ohFilter === 'all' || (o.state || '0') === _ohFilter);

    if (sorted.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    sorted.forEach(([key, order]) => {
        const card = _buildOrderCard(key, order);
        // Restore expanded state without animation to avoid visual jump
        if (key === expandedId) card.classList.add('expanded');
        listEl.appendChild(card);
    });
}


// ── Build single order card ───────────────────────────────────
function _buildOrderCard(key, order) {
    const state     = order.state || '0';
    const stateInfo = OH_STATE[state] || OH_STATE["0"];
    const trackable = order.trackorder === '1' || order.trackorder === 1;
    const idNum     = key.replace('id_','');

    // Format price with commas (handles both USD like 12.00 and LBP like 650000)
    function fmt(val) {
        const n = parseFloat(val) || 0;
        return n % 1 === 0
            ? n.toLocaleString('en-US')           // integer → 650,000
            : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // decimal → 12.00
    }

    // Parse cart: "qty:name:price:store:notes,..."
    const items = [];
    (order.cart || '').split(',').filter(Boolean).forEach(seg => {
        const p = seg.split(':');
        if (p.length >= 3) items.push({ qty: p[0], name: p[1], price: p[2], store: p[3] || '', notes: p[4] || '' });
    });

    const storeName = order.store || items[0]?.store || '—';

    const card = document.createElement('div');
    card.className = 'oh-card';
    card.dataset.id = key;

    card.innerHTML = `
        <div class="oh-card__summary">
            <div class="oh-card__toggle">+</div>
            <span class="oh-card__id">#${idNum}</span>
            <span class="oh-card__store">${storeName}</span>
            <span class="oh-card__total">${fmt(order.total)}$</span>
            <span class="oh-badge ${stateInfo.badge}">${stateInfo.label}</span>
        </div>
        <div class="oh-card__detail">
            <span class="oh-card__date">📅 ${order.date || '—'}</span>

            ${items.length > 0 ? `
            <div class="oh-items">
                <div class="oh-items__title">🛍 المنتجات</div>
                ${items.map(i => `
                    <div class="oh-item-row">
                        <span class="oh-item-row__name">
                            ${i.name}
                            ${i.notes ? `<span class="oh-item-row__notes">📝 ${i.notes}</span>` : ''}
                        </span>
                        <span class="oh-item-row__qty">×${i.qty}</span>
                        <span class="oh-item-row__price">${fmt(i.price)}$</span>
                    </div>
                `).join('')}
                <div style="display:flex;justify-content:space-between;padding-top:6px;font-size:0.75rem;font-weight:800;color:var(--clr-black);">
                    <span>الإجمالي</span>
                    <span style="color:var(--clr-orange)">${fmt(order.total)}$</span>
                </div>
            </div>` : ''}

            ${order.xnote ? `
            <div style="background:var(--clr-gray-50);border-radius:8px;padding:8px 10px;font-size:0.74rem;color:var(--clr-gray-500);">
                <span style="font-weight:800;color:var(--clr-gray-400);">ملاحظة: </span>${order.xnote}
            </div>` : ''}

            ${trackable ? `
            <button class="oh-track-btn" onclick="_openTrackModal('${key}','${order.delivryplusid || ''}')">
                🛵 تتبع طلبك الآن
            </button>` : `
            <div style="text-align:center;font-size:0.72rem;color:var(--clr-gray-400);padding:4px 0;">
                ⏳ التتبع المباشر غير متاح بعد
            </div>`}


        </div>
    `;

    // Toggle expand
    card.querySelector('.oh-card__summary').addEventListener('click', () => {
        const wasOpen = card.classList.contains('expanded');
        document.querySelectorAll('.oh-card.expanded').forEach(c => c.classList.remove('expanded'));
        if (!wasOpen) card.classList.add('expanded');
    });



    return card;
}



// ── Live Tracking Modal ───────────────────────────────────────
// • SVG motorcycle marker with real-time bearing/rotation
// • Smooth animation between GPS updates (lerp over 5 s)
// • Professional SVG destination pin with pulse ring
// • OSRM route polyline + ETA
// • No auto-pan after first fit

let _trackMap         = null;
let _trackDriverMark  = null;
let _trackDestMark    = null;
let _trackRouteLine   = null;
let _trackInterval    = null;   // REST polling interval
let _trackOrderRef    = null;   // reserved (RTDB SDK not loaded on this page)
let _trackLocRef      = null;   // reserved (RTDB SDK not loaded on this page)
let _trackOrderId     = null;
let _trackFitted      = false;

// Animation state
let _animFrom         = null;   // { lat, lng } start of current lerp
let _animTo           = null;   // { lat, lng } target of current lerp
let _animBearing      = 0;      // degrees, 0 = north
let _animPrevBearing  = 0;
let _animStart        = null;   // timestamp when lerp began
let _animRAF          = null;   // requestAnimationFrame handle
const ANIM_DURATION   = 4800;   // ms — slightly under poll interval so it settles cleanly

// ── Bearing helper (degrees, 0 = north, clockwise) ────────────
function _calcBearing(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const dLng  = toRad(lng2 - lng1);
    const rlat1 = toRad(lat1);
    const rlat2 = toRad(lat2);
    const x = Math.sin(dLng) * Math.cos(rlat2);
    const y = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLng);
    return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
}

// ── Lerp between two numbers ──────────────────────────────────
function _lerp(a, b, t) { return a + (b - a) * t; }

// ── Short-angle lerp for bearing (avoids spinning 350→10 the long way) ──
function _lerpAngle(a, b, t) {
    let diff = ((b - a + 540) % 360) - 180;
    return a + diff * t;
}

// ── Build motorcycle SVG icon (rotation applied via CSS transform) ─
function _motoIcon(bearing) {
    // SVG motorcycle viewed from above, pointing north (up).
    // We rotate the whole element by `bearing` degrees.
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
      <defs>
        <filter id="moto-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.45)"/>
        </filter>
      </defs>
      <!-- Glow ring -->
      <circle cx="24" cy="24" r="20" fill="rgba(255,92,0,0.18)" />
      <!-- Body circle -->
      <circle cx="24" cy="24" r="16" fill="#FF5C00" filter="url(#moto-shadow)"/>
      <!-- Motorcycle silhouette (top-down arrow shape pointing up = north) -->
      <!-- Arrow head (front of moto) -->
      <polygon points="24,8 19,20 24,17 29,20" fill="#fff" opacity="0.95"/>
      <!-- Body -->
      <rect x="21" y="17" width="6" height="12" rx="2" fill="#fff" opacity="0.95"/>
      <!-- Rear -->
      <rect x="20" y="29" width="8" height="5" rx="2" fill="#fff" opacity="0.8"/>
      <!-- Left wheel -->
      <ellipse cx="19" cy="24" rx="2.5" ry="4" fill="#fff" opacity="0.5"/>
      <!-- Right wheel -->
      <ellipse cx="29" cy="24" rx="2.5" ry="4" fill="#fff" opacity="0.5"/>
    </svg>`;

    return L.divIcon({
        html: `<div style="
            width:48px;height:48px;
            transform:rotate(${bearing}deg);
            transform-origin:center center;
            transition:transform 0.4s ease-out;
            will-change:transform;
        ">${svg}</div>`,
        iconSize:   [48, 48],
        iconAnchor: [24, 24],
        className:  '',
    });
}

// ── Build destination pin SVG ─────────────────────────────────
function _destIcon() {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="40" height="52">
      <defs>
        <filter id="pin-shadow" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
        <radialGradient id="pin-grad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#ff8c42"/>
          <stop offset="100%" stop-color="#e63000"/>
        </radialGradient>
      </defs>
      <!-- Pin drop shape -->
      <path d="M20 2 C10.6 2 3 9.6 3 19 C3 31 20 50 20 50 C20 50 37 31 37 19 C37 9.6 29.4 2 20 2 Z"
            fill="url(#pin-grad)" filter="url(#pin-shadow)"/>
      <!-- Inner white circle -->
      <circle cx="20" cy="19" r="8" fill="#fff" opacity="0.95"/>
      <!-- House icon inside pin -->
      <g transform="translate(20,19)" fill="#e63000">
        <polygon points="0,-5.5 -5.5,0 -4,0 -4,5 4,5 4,0 5.5,0" />
        <rect x="-1.5" y="1.5" width="3" height="3.5" fill="#fff"/>
      </g>
    </svg>`;

    return L.divIcon({
        html: `<div style="width:40px;height:52px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));">${svg}</div>`,
        iconSize:   [40, 52],
        iconAnchor: [20, 52],   // tip of pin at marker position
        className:  '',
    });
}

// ── Destination pulse ring (separate layer for animation) ─────
let _trackPulseCircle = null;
function _ensurePulse(lat, lng) {
    if (_trackPulseCircle) return;
    _trackPulseCircle = L.circle([lat, lng], {
        radius:      40,
        color:       '#e63000',
        weight:      2,
        opacity:     0.6,
        fillColor:   '#e63000',
        fillOpacity: 0.08,
        className:   'track-pulse-ring',
    }).addTo(_trackMap);
    // CSS pulse animation injected once
    if (!document.getElementById('track-pulse-style')) {
        const s = document.createElement('style');
        s.id = 'track-pulse-style';
        s.textContent = `
            @keyframes trackPulse {
                0%   { opacity: 0.6; transform: scale(1);   }
                70%  { opacity: 0;   transform: scale(2.2); }
                100% { opacity: 0;   transform: scale(2.2); }
            }
            .track-pulse-ring {
                animation: trackPulse 2.2s ease-out infinite;
                transform-origin: center center;
            }
        `;
        document.head.appendChild(s);
    }
}

// ── Smooth animation loop ─────────────────────────────────────
function _animateDriver() {
    if (!_trackDriverMark || !_animFrom || !_animTo) return;

    const now      = performance.now();
    const elapsed  = now - _animStart;
    const t        = Math.min(elapsed / ANIM_DURATION, 1);
    const ease     = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;   // ease-in-out quad

    const lat = _lerp(_animFrom.lat, _animTo.lat, ease);
    const lng = _lerp(_animFrom.lng, _animTo.lng, ease);
    const bearing = _lerpAngle(_animPrevBearing, _animBearing, ease);

    _trackDriverMark.setLatLng([lat, lng]);

    // Update icon rotation by replacing the inner div's transform
    const el = _trackDriverMark.getElement();
    if (el) {
        const rotDiv = el.querySelector('div');
        if (rotDiv) rotDiv.style.transform = `rotate(${bearing}deg)`;
    }

    if (t < 1) {
        _animRAF = requestAnimationFrame(_animateDriver);
    } else {
        _animRAF = null;
    }
}

// ── Start a new lerp to a new GPS position ────────────────────
function _moveTo(lat, lng, bearing) {
    if (_animRAF) cancelAnimationFrame(_animRAF);

    // Current visual position as start (from marker if exists, else target)
    if (_trackDriverMark) {
        const cur = _trackDriverMark.getLatLng();
        _animFrom = { lat: cur.lat, lng: cur.lng };
    } else {
        _animFrom = { lat, lng };
    }

    _animTo          = { lat, lng };
    _animPrevBearing = _animBearing;
    _animBearing     = bearing;
    _animStart       = performance.now();
    _animRAF         = requestAnimationFrame(_animateDriver);
}

// ── Open tracking modal ───────────────────────────────────────
window._openTrackModal = function(orderId, uid, fromList) {
    _trackOrderId = orderId;
    _trackFitted  = false;
    _animBearing  = 0;
    _animPrevBearing = 0;
    _ensureTrackModal();

    const modal   = document.getElementById('track-modal');
    const backBtn = document.getElementById('track-back-btn');
    if (backBtn) {
        if (fromList) {
            backBtn.style.display = 'block';
            backBtn.onclick = () => {
                // Close map, reopen the list sheet
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                if (typeof _openTrackSheet === 'function') _openTrackSheet();
            };
        } else {
            backBtn.style.display = 'none';
        }
    }

    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    _setTrackStatus('جاري تحميل بيانات التتبع…', 'loading');

    // Show request ID in header
    const titleEl = document.getElementById('track-header-title');
    if (titleEl) {
        const reqNum = (orderId || '').replace('id_', '#');
        titleEl.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="#FF5C00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            تتبع طلبك
            <span style="font-size:0.75rem;font-weight:800;color:#FF5C00;background:rgba(255,92,0,0.1);
                         border:1px solid rgba(255,92,0,0.25);border-radius:50px;padding:2px 10px;margin-right:6px;">
                ${reqNum}
            </span>`;
    }

    setTimeout(() => {
        if (!_trackMap) {
            _trackMap = L.map('track-map', { zoomControl: true })
                .setView([34.004, 36.210], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19,
            }).addTo(_trackMap);
        } else {
            // Clean up previous session layers
            if (_trackDriverMark) { _trackMap.removeLayer(_trackDriverMark); _trackDriverMark = null; }
            if (_trackDestMark)   { _trackMap.removeLayer(_trackDestMark);   _trackDestMark   = null; }
            if (_trackRouteLine)  { _trackMap.removeLayer(_trackRouteLine);  _trackRouteLine  = null; }
            if (_trackPulseCircle){ _trackMap.removeLayer(_trackPulseCircle);_trackPulseCircle= null; }
            _animFrom = null; _animTo = null;
            _trackMap.invalidateSize();
        }
        _startTrackPolling(orderId, uid);
    }, 200);
};

function _ensureTrackModal() {
    if (document.getElementById('track-modal')) return;

    // ── Inject styles once ────────────────────────────────────
    if (!document.getElementById('track-modal-style')) {
        const s = document.createElement('style');
        s.id = 'track-modal-style';
        s.textContent = `
        /* ── Track modal sheet ── */
        #track-modal-sheet {
            width:100%;max-width:520px;
            background:#fff;
            border-radius:20px 20px 0 0;
            overflow:hidden;
            display:flex;flex-direction:column;
            max-height:92vh;
        }
        /* ── Drag handle ── */
        #track-drag-handle {
            width:36px;height:4px;background:#e0e0e0;
            border-radius:2px;margin:10px auto 0;flex-shrink:0;
        }
        /* ── Header row ── */
        #track-header {
            display:flex;align-items:center;justify-content:space-between;
            padding:10px 16px 10px;border-bottom:1px solid #f2f2f2;flex-shrink:0;
        }
        #track-header-title {
            font-size:1rem;font-weight:800;color:#111;display:flex;align-items:center;gap:6px;
        }
        #track-close-btn {
            background:none;border:none;width:30px;height:30px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;color:#888;font-size:1.1rem;
            transition:background 0.15s;
        }
        #track-close-btn:hover { background:#f5f5f5; }

        /* ── Driver card ── */
        #track-driver-card {
            display:flex;align-items:center;gap:12px;
            padding:10px 16px 10px;
            background:linear-gradient(135deg,#fff8f4 0%,#fff3ed 100%);
            border-bottom:1px solid #fde8d8;
            flex-shrink:0;
        }
        #track-driver-avatar {
            width:46px;height:46px;border-radius:50%;flex-shrink:0;
            background:linear-gradient(135deg,#FF5C00,#e64a00);
            display:flex;align-items:center;justify-content:center;
            font-size:1.2rem;font-weight:800;color:#fff;
            box-shadow:0 3px 10px rgba(255,92,0,0.35);
            position:relative;
        }
        #track-driver-online-dot {
            position:absolute;bottom:1px;right:1px;
            width:11px;height:11px;border-radius:50%;
            background:#22c55e;border:2px solid #fff;
            box-shadow:0 0 0 2px rgba(34,197,94,0.3);
            animation:trackOnlinePulse 2s infinite;
        }
        @keyframes trackOnlinePulse {
            0%,100%{box-shadow:0 0 0 2px rgba(34,197,94,0.3);}
            50%    {box-shadow:0 0 0 5px rgba(34,197,94,0.1);}
        }
        #track-driver-info { flex:1;min-width:0; }
        #track-driver-name {
            font-size:0.9rem;font-weight:800;color:#1a1a1a;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        #track-driver-role {
            font-size:0.72rem;color:#888;font-weight:600;margin-top:1px;
        }
        #track-delivo-badge {
            display:flex;align-items:center;gap:5px;
            background:#fff;
            border:1.5px solid #FF5C00;
            border-radius:50px;
            padding:4px 10px 4px 8px;
            flex-shrink:0;
        }
        #track-delivo-badge svg { flex-shrink:0; }
        #track-delivo-badge span {
            font-size:0.72rem;font-weight:800;
            color:#FF5C00;letter-spacing:0.3px;
        }

        /* ── ETA bar ── */
        #track-status-bar {
            display:flex;align-items:center;justify-content:center;gap:8px;
            padding:7px 16px;font-size:0.82rem;font-weight:700;
            color:#FF5C00;flex-shrink:0;min-height:34px;
            border-bottom:1px solid #f5f5f5;
        }

        /* ── Footer ── */
        #track-footer {
            padding:10px 16px 16px;flex-shrink:0;display:flex;gap:8px;
        }
        #track-fit-btn {
            flex:1;background:#f5f5f5;color:#333;border:none;border-radius:12px;
            padding:11px;font-size:0.82rem;font-weight:800;cursor:pointer;
            font-family:inherit;transition:background 0.15s;
        }
        #track-fit-btn:hover { background:#ebebeb; }
        #track-open-gmaps {
            flex:2;background:#4285f4;color:#fff;border:none;border-radius:12px;
            padding:11px;font-size:0.82rem;font-weight:800;cursor:pointer;
            font-family:inherit;transition:opacity 0.15s;
        }
        #track-open-gmaps:hover { opacity:0.88; }
        #track-driver-contact a:hover { opacity:0.85; }
        `;
        document.head.appendChild(s);
    }

    const el = document.createElement('div');
    el.id = 'track-modal';
    el.style.cssText = `
        display:none;position:fixed;inset:0;z-index:10000;
        background:rgba(0,0,0,0.65);align-items:flex-end;justify-content:center;
        font-family:'Almarai',sans-serif;
    `;
    el.innerHTML = `
        <div id="track-modal-sheet">

            <!-- Drag handle -->
            <div id="track-drag-handle"></div>

            <!-- Header -->
            <div id="track-header">
                <button id="track-back-btn" aria-label="رجوع" style="display:none;background:none;border:none;cursor:pointer;padding:4px 8px;font-size:1.3rem;color:#FF5C00;font-weight:900;">‹</button>
                <div id="track-header-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="#FF5C00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    تتبع طلبك
                </div>
                <button id="track-close-btn" aria-label="إغلاق">✕</button>
            </div>

            <!-- Driver card -->
            <div id="track-driver-card">
                <!-- Avatar with initial -->
                <div id="track-driver-avatar">
                    <span id="track-driver-initial">؟</span>
                    <div id="track-driver-online-dot"></div>
                </div>
                <!-- Name + role -->
                <div id="track-driver-info">
                    <div id="track-driver-name">جاري التحميل…</div>
                    <div id="track-driver-role">سائق توصيل</div>
                </div>
                <!-- Delivo verified badge -->
                <div id="track-delivo-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                              fill="#FF5C00" opacity="0.15" stroke="#FF5C00" stroke-width="1.8"
                              stroke-linejoin="round"/>
                        <polyline points="9 12 11 14 15 10" stroke="#FF5C00" stroke-width="2"
                                  stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Delivo</span>
                </div>
            </div>

            <!-- Driver contact buttons (call + WhatsApp) — shown only when phone is known -->
            <div id="track-driver-contact"
                 style="display:none;gap:8px;padding:8px 14px;border-bottom:1px solid #fde8d8;flex-shrink:0;">
            </div>

            <!-- ETA / status bar -->
            <div id="track-status-bar">جاري التحميل…</div>

            <!-- Map -->
            <div id="track-map" style="width:100%;flex:1;min-height:300px;"></div>

            <!-- Footer -->
            <div id="track-footer">
                <button id="track-fit-btn">🗺 عرض المسار</button>
                <button id="track-open-gmaps">📌 فتح في خرائط غوغل</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);

    document.getElementById('track-close-btn').addEventListener('click', _closeTrackModal);
    el.addEventListener('click', (e) => { if (e.target === el) _closeTrackModal(); });

    document.getElementById('track-fit-btn').addEventListener('click', _fitTrackBounds);

    document.getElementById('track-open-gmaps').addEventListener('click', () => {
        let url = 'https://www.google.com/maps?q=34.004,36.210';
        if (_trackDriverMark && _trackDestMark) {
            const d = _trackDriverMark.getLatLng();
            const t = _trackDestMark.getLatLng();
            url = `https://www.google.com/maps/dir/${d.lat},${d.lng}/${t.lat},${t.lng}`;
        } else if (_trackDriverMark) {
            const d = _trackDriverMark.getLatLng();
            url = `https://www.google.com/maps?q=${d.lat},${d.lng}`;
        }
        window.open(url, '_blank');
    });
}

function _closeTrackModal() {
    // Detach RTDB listeners
    if (_trackOrderRef) { _trackOrderRef.off(); _trackOrderRef = null; }
    if (_trackLocRef)   { _trackLocRef.off();   _trackLocRef   = null; }
    clearInterval(_trackInterval); _trackInterval = null; // safety
    if (_animRAF) { cancelAnimationFrame(_animRAF); _animRAF = null; }
    const modal = document.getElementById('track-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

function _setTrackStatus(msg, type) {
    const bar = document.getElementById('track-status-bar');
    if (!bar) return;
    const colors = { loading: '#FF5C00', ok: '#22c55e', warn: '#f59e0b', error: '#ef4444' };
    bar.textContent = msg;
    bar.style.color = colors[type] || '#FF5C00';
}

function _fitTrackBounds() {
    if (!_trackMap) return;
    const points = [];
    if (_trackDriverMark) points.push(_trackDriverMark.getLatLng());
    if (_trackDestMark)   points.push(_trackDestMark.getLatLng());
    if (points.length === 2) {
        _trackMap.fitBounds(L.latLngBounds(points), { padding: [56, 56] });
    } else if (points.length === 1) {
        _trackMap.setView(points[0], 15);
    }
}

// ── OSRM route polyline + ETA ─────────────────────────────────
async function _updateRoute(driverLat, driverLng, destLat, destLng) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/` +
                    `${driverLng},${driverLat};${destLng},${destLat}` +
                    `?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data || data.code !== 'Ok' || !data.routes?.[0]) return null;

        const route  = data.routes[0];
        const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

        if (_trackRouteLine) {
            _trackRouteLine.setLatLngs(coords);
        } else {
            _trackRouteLine = L.polyline(coords, {
                color:    '#FF5C00',
                weight:   5,
                opacity:  0.80,
                lineJoin: 'round',
                lineCap:  'round',
            }).addTo(_trackMap);
            _trackRouteLine.bringToBack();
        }

        return { duration: route.duration, distance: route.distance };
    } catch(e) {
        console.warn('[Track] OSRM failed', e);
        return null;
    }
}

// ── Polling (REST-based — RTDB SDK not loaded on this page) ──
function _startTrackPolling(orderId, uid) {
    // Detach any stale refs (safety — these are null without the DB SDK)
    if (_trackOrderRef) { try { _trackOrderRef.off(); } catch(e){} _trackOrderRef = null; }
    if (_trackLocRef)   { try { _trackLocRef.off();   } catch(e){} _trackLocRef   = null; }
    clearInterval(_trackInterval); _trackInterval = null;

    // Kick off immediately then repeat every 4s
    _fetchAndUpdateTrack(orderId, uid);
    _trackInterval = setInterval(() => _fetchAndUpdateTrack(orderId, uid), 4000);
}

async function _fetchAndUpdateTrack(orderId, uid) {
    try {
        // Fetch order state
        let order = null;
        const orderResp = await fetch(`${OH_RTDB_URL}/requests/${orderId}.json`);
        order = await orderResp.json();
        if (!order && uid) {
            const histResp = await fetch(`${OH_RTDB_URL}/historyRequests/${uid}/${orderId}.json`);
            order = await histResp.json();
        }
        if (!order) { _setTrackStatus('⚠️ لم يتم العثور على الطلب', 'warn'); return; }

        // Resolve driver ID — prefer stored driverid, fall back to name lookup
        let driverId = order.driverid || null;
        if (!driverId && order.driver && order.driver !== '0') {
            try {
                const driversResp = await fetch(`${OH_RTDB_URL}/drivers.json`);
                const driversData = await driversResp.json();
                if (driversData && typeof driversData === 'object') {
                    for (const [key, d] of Object.entries(driversData)) {
                        if (d && d.owner === order.driver) { driverId = key; break; }
                    }
                }
            } catch(e) { console.warn('[Track] driver resolve failed', e); }
        }

        // Fetch driver location + phone simultaneously
        let loc = null;
        let driverPhone = null;
        if (driverId) {
            try {
                const [locResp, phoneResp] = await Promise.all([
                    fetch(`${OH_RTDB_URL}/drivers/${driverId}/location.json`),
                    fetch(`${OH_RTDB_URL}/drivers/${driverId}/phone.json`),
                ]);
                loc = await locResp.json();
                driverPhone = await phoneResp.json();
            } catch(e) {}
        }
        // Also try order.driverPhone if RTDB lookup returned nothing
        if (!driverPhone && order.driverPhone) driverPhone = order.driverPhone;

        await _applyTrackUpdate(order, loc, driverPhone);

    } catch(e) {
        _setTrackStatus('⚠️ تعذّر تحميل بيانات التتبع', 'warn');
        console.error('[Track]', e);
    }
}

async function _applyTrackUpdate(order, loc, driverPhone) {
    try {

        // ── Populate driver card from order data ──────────────
        const driverOwner = (order.driver && order.driver !== '0') ? order.driver : null;
        const nameEl    = document.getElementById('track-driver-name');
        const initialEl = document.getElementById('track-driver-initial');
        if (nameEl && driverOwner) {
            nameEl.textContent = driverOwner;
            if (initialEl) initialEl.textContent = driverOwner.charAt(0).toUpperCase();
        } else if (nameEl) {
            nameEl.textContent = 'سائق Delivo';
            if (initialEl) initialEl.textContent = 'D';
        }

        // ── Contact buttons (call + WhatsApp) ─────────────────
        // Only shown when we have a driver phone number
        const contactRow = document.getElementById('track-driver-contact');
        if (contactRow) {
            const phone = (driverPhone || '').toString().replace(/[^\d+]/g, '');
            if (phone && phone.length >= 7) {
                // Normalise: ensure international format for WhatsApp
                const waPhone = phone.startsWith('+') ? phone.slice(1) : phone;
                contactRow.innerHTML = `
                    <a href="tel:${phone}" id="track-call-btn"
                       onclick="event.stopPropagation()"
                       style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
                              padding:9px 12px;border-radius:12px;font-size:0.8rem;font-weight:800;
                              background:#22c55e;color:#fff;text-decoration:none;
                              box-shadow:0 2px 8px rgba(34,197,94,0.3);transition:opacity 0.15s;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.3" stroke-linecap="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19
                                     a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 3.09 4.18
                                     2 2 0 0 1 5.07 2h3a2 2 0 0 1 2 1.72
                                     c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 9.91
                                     a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45
                                     c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 17z"/>
                        </svg>
                        اتصال
                    </a>
                    <a href="https://wa.me/${waPhone}" target="_blank" id="track-wa-btn"
                       onclick="event.stopPropagation()"
                       style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
                              padding:9px 12px;border-radius:12px;font-size:0.8rem;font-weight:800;
                              background:#25D366;color:#fff;text-decoration:none;
                              box-shadow:0 2px 8px rgba(37,211,102,0.3);transition:opacity 0.15s;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148
                                     -.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075
                                     -.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059
                                     -.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174
                                     .198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612
                                     -.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01
                                     a1.093 1.093 0 0 0-.792.372c-.272.297-1.04 1.016-1.04 2.479
                                     0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487
                                     .709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118
                                     .571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413
                                     -.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004
                                     a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648
                                     -.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884
                                     9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1
                                     2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/>
                        </svg>
                        واتسآب
                    </a>`;
                contactRow.style.display = 'flex';
            } else {
                contactRow.style.display = 'none';
            }
        }

        const state = order.state || '0';
        if (state === '1') { _setTrackStatus('✅ تم توصيل طلبك!', 'ok'); return; }
        if (state === '2' || state === '5') { _setTrackStatus('❌ الطلب ملغي', 'error'); return; }

        const trackable = order.trackorder === '1' || order.trackorder === 1;
        if (!trackable) { _setTrackStatus('⏳ في انتظار تفعيل التتبع من السائق…', 'warn'); return; }

        if (!loc?.lat || !loc?.lng) { _setTrackStatus('⏳ في انتظار موقع السائق…', 'warn'); return; }

        const dLat = parseFloat(loc.lat);
        const dLng = parseFloat(loc.lng);
        if (isNaN(dLat) || isNaN(dLng)) { _setTrackStatus('⚠️ بيانات موقع غير صالحة', 'warn'); return; }

        const destLat = parseFloat(order.lat);
        const destLng = parseFloat(order.lng);
        const hasDestination = !isNaN(destLat) && !isNaN(destLng) && destLat !== 0 && destLng !== 0;

        if (_trackMap) {
            // ── Compute bearing from previous position ────────
            let newBearing = _animBearing;
            if (_animTo) {
                const moved = Math.abs(dLat - _animTo.lat) + Math.abs(dLng - _animTo.lng);
                if (moved > 0.000005) {   // only rotate if moved meaningfully (~0.5m)
                    newBearing = _calcBearing(_animTo.lat, _animTo.lng, dLat, dLng);
                }
            }

            // ── Driver marker (create or animate) ────────────
            if (!_trackDriverMark) {
                _trackDriverMark = L.marker([dLat, dLng], {
                    icon: _motoIcon(newBearing),
                    zIndexOffset: 1000,
                }).addTo(_trackMap);
                _animFrom    = { lat: dLat, lng: dLng };
                _animTo      = { lat: dLat, lng: dLng };
                _animBearing = newBearing;
            } else {
                _moveTo(dLat, dLng, newBearing);
            }

            // ── Destination marker + pulse ────────────────────
            if (hasDestination) {
                if (!_trackDestMark) {
                    _trackDestMark = L.marker([destLat, destLng], {
                        icon: _destIcon(),
                        zIndexOffset: 900,
                    }).bindTooltip('موقع التوصيل', {
                        permanent:  false,
                        direction:  'top',
                        className:  'track-dest-tip',
                    }).addTo(_trackMap);
                    _ensurePulse(destLat, destLng);
                    // Inject tooltip style once
                    if (!document.getElementById('track-tip-style')) {
                        const s = document.createElement('style');
                        s.id = 'track-tip-style';
                        s.textContent = `.track-dest-tip{background:#e63000;color:#fff;border:none;
                            border-radius:8px;font-weight:800;font-size:0.75rem;padding:4px 10px;
                            font-family:'Almarai',sans-serif;}
                            .track-dest-tip::before{border-top-color:#e63000;}`;
                        document.head.appendChild(s);
                    }
                }
            }

            // ── First load: fit bounds ────────────────────────
            if (!_trackFitted) {
                _trackFitted = true;
                if (hasDestination) {
                    _trackMap.fitBounds(
                        L.latLngBounds([[dLat, dLng], [destLat, destLng]]),
                        { padding: [60, 60] }
                    );
                } else {
                    _trackMap.setView([dLat, dLng], 15);
                }
            }

            // ── Route + ETA ───────────────────────────────────
            const age    = loc.timestamp ? Math.round((Date.now() - loc.timestamp) / 1000) : null;
            const ageStr = age !== null
                ? (age < 60 ? ` · ${age}ث` : ` · ${Math.round(age/60)}د`)
                : '';

            if (hasDestination) {
                const routeInfo = await _updateRoute(dLat, dLng, destLat, destLng);
                if (routeInfo) {
                    const mins = Math.ceil(routeInfo.duration / 60);
                    const km   = (routeInfo.distance / 1000).toFixed(1);
                    _setTrackStatus(`وقت الوصول المتوقع: ${mins} دقيقة  •  ${km} كم${ageStr}`, 'ok');
                } else {
                    _setTrackStatus(`🛵 السائق في الطريق إليك${ageStr}`, 'ok');
                }
            } else {
                _setTrackStatus(`🛵 السائق في الطريق إليك${ageStr}`, 'ok');
            }
        }

    } catch(e) {
        _setTrackStatus('⚠️ تعذّر تحميل بيانات التتبع', 'warn');
        console.error('[Track]', e);
    }
}

// ── Wire up filters ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Orders button in account modal
    const ordersBtn = document.getElementById('acct-orders-btn');
    if (ordersBtn) {
        ordersBtn.addEventListener('click', () => {
            closeModal('modal-account');
            setTimeout(openOrdersModal, 180);
        });
    }

    // Close & back buttons
    const closeBtn = document.getElementById('orders-close-btn');
    const backBtn  = document.getElementById('orders-back-btn');
    const overlay  = document.getElementById('orders-sheet-overlay');

    if (closeBtn) closeBtn.addEventListener('click', closeOrdersModal);
    if (overlay)  overlay.addEventListener('click', closeOrdersModal);
    if (backBtn)  backBtn.addEventListener('click', () => {
        closeOrdersModal();
        setTimeout(() => openModal('modal-account'), 300);
    });

    // Swipe down on handle/header to dismiss
    const sheet = document.getElementById('orders-sheet');
    if (sheet) {
        let _startY = 0;
        sheet.addEventListener('touchstart', e => {
            _startY = e.touches[0].clientY;
        }, { passive: true });
        sheet.addEventListener('touchend', e => {
            const dy = e.changedTouches[0].clientY - _startY;
            if (dy > 80) closeOrdersModal(); // swipe down >80px closes
        }, { passive: true });
    }

    // Filter pills
    document.querySelectorAll('.oh-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.oh-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _ohFilter = btn.dataset.filter;
            _renderOrders();
        });
    });

    // Update orders badge count when account modal opens
    document.addEventListener('modalOpen', (e) => {
        if (e.detail === 'modal-account') _updateOrdersBadge();
    });
});

async function _updateOrdersBadge() {
    const user = window.DelivoUser;
    if (!user) return;
    try {
        const resp = await fetch(`${OH_RTDB_URL}/historyRequests/${user.uid}.json?shallow=true`);
        const data = await resp.json();
        const count = data ? Object.keys(data).length : 0;
        const badge = document.getElementById('acct-orders-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    } catch(e) {}
}