/* ============================================================
   scripts/external-order.js
   "اطلب خارجي" — let customers order from any store not on
   Delivo. Single-screen form: store info + order description +
   delivery destination, all visible at once, one submit button.
   Submits to the same Firebase requests/ + historyRequests/
   paths so admin sees it in the dashboard like any other order.
   ============================================================ */

(function () {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    /* ── Quick-item picker data ────────────────────────────────
       Category chip → sub-items shown in the popup once tapped.
       Editable by the admin at settings/otlobFastItems (Admin →
       الإعدادات → 🍽 أصناف اطلب السريعة); these are just the
       fallback used until that loads, or if it's never configured. */
    let _quickItemCategories = {
        '🍔 برغر':    ['برغر لحم', 'برغر دجاج', 'برغر مشوي', 'دبل برغر'],
        '🍕 بيتزا':   ['بيتزا مارغريتا', 'بيتزا خضار', 'بيتزا دجاج', 'بيتزا لحمة'],
        '🍗 دجاج':    ['دجاج مشوي', 'بروست', 'تشيكن ونجز', 'شاورما دجاج'],
        '🌯 ساندويش': ['شاورما لحمة', 'صاندويش فلافل', 'صاندويش تونا', 'مناقيش'],
        '🍟 مقبلات':  ['بطاطا مقلية', 'بطاطا ويدجز', 'حلقات بصل', 'ناغتس'],
        '🥗 سلطة':    ['فتوش', 'تبولة', 'سلطة سيزر', 'سلطة خضار'],
        '🥤 مشروبات': ['مشروب غازي', 'عصير طازج', 'مويا', 'آيس تي'],
        '☕ حلويات':  ['قهوة', 'نسكافيه', 'كنافة', 'مهلبية'],
    };
    let _quickItemsLoaded = false;

    // Renders just the category chip row's inner HTML — kept separate
    // from the fetch so it can be called both on first render (with
    // whatever's cached/default) and again once the admin-configured
    // categories arrive, without touching anything else the customer
    // may already be typing.
    function _renderCategoryChips() {
        return Object.keys(_quickItemCategories).map(cat =>
            `<button type="button" class="ext-chip ext-cat-chip" data-cat="${cat}" onclick="_extOpenItemPopup('${cat}')">${cat}</button>`
        ).join('');
    }

    // Fire-and-forget: pulls the admin-configured categories once per
    // page load and swaps them in without disrupting the open form —
    // only the chip row itself is replaced, not the whole modal.
    async function _loadQuickItemCategories() {
        if (_quickItemsLoaded) return;
        _quickItemsLoaded = true;
        try {
            const res  = await fetch(`${RTDB}/settings/otlobFastItems.json`);
            const data = await res.json();
            if (Array.isArray(data) && data.length) {
                const next = {};
                data.forEach(c => {
                    if (c && c.label && Array.isArray(c.items) && c.items.length) next[c.label] = c.items;
                });
                if (Object.keys(next).length) {
                    _quickItemCategories = next;
                    const chipsEl = document.getElementById('ext-cat-chips');
                    if (chipsEl) chipsEl.innerHTML = _renderCategoryChips();
                }
            }
        } catch (_) { /* keep defaults on any failure */ }
    }

    /* ── State ──────────────────────────────────────────────── */
    let _data = {
        storeName        : '',
        storeAddress     : '',
        storeLat         : null,
        storeLng         : null,
        storePhone       : '',
        orderDescription : '',
        approxTotal      : '',
        destAddress      : '',
        destLat          : null,
        destLng          : null,
        smartFee         : null,  // auto-calculated once both locations are known
    };
    let _currency = 'USD';

    /* ── Map state ──────────────────────────────────────────── */
    let _mapInstance = null;
    let _mapMarker   = null;
    let _mapTarget   = null;   // 'store' | 'dest'

    /* ── "موقعي الحالي" — GPS button on the map picker ─────────
       Bound once at load (the modal markup is static, only its
       content re-renders), moves the existing pin + re-centers
       the map on success; shows an inline error and leaves the
       pin untouched on failure/denial. ────────────────────── */
    (function _initExtMapGps() {
        const btn = document.getElementById('ext-map-gps-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const statusEl = document.getElementById('ext-map-gps-status');
            if (statusEl) statusEl.style.display = 'none';

            if (!navigator.geolocation) {
                if (statusEl) { statusEl.textContent = 'تعذّر تحديد موقعك — جهازك لا يدعم تحديد المواقع'; statusEl.style.display = 'block'; }
                return;
            }
            const orig = btn.innerHTML;
            btn.disabled  = true;
            btn.innerHTML = '⏳ جاري التحديد...';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    btn.disabled  = false;
                    btn.innerHTML = orig;
                    if (_mapMarker && _mapInstance) {
                        _mapMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
                        _mapInstance.setView([pos.coords.latitude, pos.coords.longitude], 16);
                    }
                },
                () => {
                    btn.disabled  = false;
                    btn.innerHTML = orig;
                    if (statusEl) { statusEl.textContent = 'تعذّر تحديد موقعك'; statusEl.style.display = 'block'; }
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    })();

    /* ═══════════════════════════════════════════════════════
       OPEN / CLOSE
    ═══════════════════════════════════════════════════════ */
    function _openModal() {
        const user = window.DelivoUser;
        if (!user) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal();
            else alert('يرجى تسجيل الدخول أولاً');
            return;
        }
        // Reset state
        _data = { storeName:'', storeAddress:'', storeLat:null, storeLng:null, storePhone:'',
                  orderDescription:'', approxTotal:'', destAddress:'', destLat:null, destLng:null, smartFee:null };
        _currency = 'USD';

        const overlay = document.getElementById('ext-order-overlay');
        const sheet   = document.getElementById('ext-order-sheet');
        overlay.style.display = 'flex';
        sheet?.classList.remove('ext-sheet-visible');
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            requestAnimationFrame(() => sheet?.classList.add('ext-sheet-visible'));
        });
        document.body.classList.add('modal-open');
        _render();
        _loadQuickItemCategories();
    }

    function _closeModal() {
        const overlay = document.getElementById('ext-order-overlay');
        const sheet   = document.getElementById('ext-order-sheet');
        overlay.style.display = 'none';
        overlay.style.opacity = '';                     // revert to CSS default (0) for next open
        sheet?.classList.remove('ext-sheet-visible');    // same — re-arm the slide-up animation
        document.body.classList.remove('modal-open');
    }

    /* ═══════════════════════════════════════════════════════
       SINGLE-SCREEN FORM
    ═══════════════════════════════════════════════════════ */
    function _render() {
        const content = document.getElementById('ext-order-content');
        content.innerHTML = _tmplForm();
        content.scrollTop = 0;
        _bindForm();
    }

    function _tmplForm() {
        // Pre-fill destination from user profile if available and not yet set
        const user = window.DelivoUser;
        if (!_data.destAddress && user?.street) _data.destAddress = user.street;

        return `
        <div style="padding-top:6px;">

            <!-- Store ─────────────────────────────────────── -->
            <div style="background:var(--clr-orange-light);border:1px solid rgba(255,92,0,0.18);border-radius:14px;padding:14px 14px 4px;">
                <div class="ext-section-title"><span class="ext-section-icon ext-section-icon--store">🏪</span> معلومات المتجر</div>

                <div class="ext-field">
                    <label class="ext-label">اسم المتجر <span style="color:var(--orange)">*</span></label>
                    <input id="ext-store-name" type="text" class="ext-input" placeholder="مثال: مطعم قصر بعلبك، سوبرماركت الجميّل…" value="${_esc(_data.storeName)}">
                </div>

                <div class="ext-field">
                    <label class="ext-label">📍 موقع المتجر <span style="color:var(--orange)">*</span></label>
                    <div style="display:flex;gap:8px;align-items:stretch;">
                        <input id="ext-store-addr" type="text" class="ext-input" style="flex:1;" placeholder="المنطقة، الشارع، البناية…" value="${_esc(_data.storeAddress)}">
                        <button onclick="_extPickMap('store')" class="ext-map-btn" title="حدد على الخريطة">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                            خريطة
                        </button>
                    </div>
                    ${_data.storeLat ? `<div class="ext-coord-badge">📌 ${_data.storeLat.toFixed(5)}, ${_data.storeLng.toFixed(5)}</div>` : ''}
                </div>
            </div>

            <!-- Order ─────────────────────────────────────── -->
            <div class="ext-section-title" style="margin-top:22px;"><span class="ext-section-icon ext-section-icon--order">🧾</span> تفاصيل الطلب</div>

            <div class="ext-field">
                <label class="ext-label">صف طلبك بالتفصيل <span style="color:var(--orange)">*</span></label>
                <textarea id="ext-order-desc" class="ext-input" rows="4" style="resize:vertical;" placeholder="مثال: برغر دجاج حار بدون بصل، طلبين بطاطا وسط، عصير ليمون كبير…">${_esc(_data.orderDescription)}</textarea>
                <div id="ext-cat-chips" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px;">
                    ${_renderCategoryChips()}
                </div>
            </div>

            <!-- Delivery ──────────────────────────────────── -->
            <div style="background:rgba(22,163,74,0.06);border:1px solid rgba(22,163,74,0.18);border-radius:14px;padding:14px 14px 4px;margin-top:22px;">
                <div class="ext-section-title" style="margin-top:0;"><span class="ext-section-icon ext-section-icon--dest">🏠</span> عنوان التوصيل</div>

                <div class="ext-field">
                    <label class="ext-label">عنوان التوصيل <span style="color:var(--orange)">*</span></label>
                    <div style="display:flex;gap:8px;align-items:stretch;">
                        <input id="ext-dest-addr" type="text" class="ext-input" style="flex:1;" placeholder="المنطقة، الشارع، رقم البناية…" value="${_esc(_data.destAddress)}">
                        <button onclick="_extPickMap('dest')" class="ext-map-btn">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                            خريطة
                        </button>
                    </div>
                    ${_data.destLat ? `<div class="ext-coord-badge">📌 ${_data.destLat.toFixed(5)}, ${_data.destLng.toFixed(5)}</div>` : ''}
                </div>

                <!-- Quick address shortcuts — verified close to Baalbek itself,
                     not just plausible-sounding names. Each carries real
                     coordinates and still passes through the same coverage
                     check as a manual map pin. -->
                <div class="ext-field">
                    <label class="ext-label" style="margin-bottom:8px;">📌 مواقع سريعة</label>
                    <div style="display:flex;flex-wrap:wrap;gap:7px;">
                        ${[
                            { name: 'بعلبك - وسط المدينة', lat: 34.0058, lng: 36.2181 },
                            { name: 'دورس',                 lat: 33.9833, lng: 36.1833 },
                            { name: 'إيعات',                 lat: 34.0597, lng: 36.1526 },
                        ].map(loc =>
                            `<button class="ext-chip" onclick="_extQuickDest('${loc.name}', ${loc.lat}, ${loc.lng})">${loc.name}</button>`
                        ).join('')}
                    </div>
                </div>
            </div>

            <!-- Live delivery-fee estimate — updates once both the store
                 and destination locations are known, no separate step
                 needed to see it. -->
            <div class="ext-field" id="ext-fee-estimate-wrap" style="background:var(--clr-orange-light);border:1px solid rgba(255,92,0,0.18);border-radius:14px;padding:12px 14px;">
                <div id="ext-fee-estimate" style="font-size:0.78rem;color:var(--clr-gray-500);line-height:1.7;">
                    💡 <strong style="color:var(--clr-black);">رسوم التوصيل:</strong> ${_feeEstimateText()}
                </div>
            </div>

            <div id="ext-submit-err" style="display:none;margin-top:10px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:0.78rem;color:#dc2626;font-weight:700;"></div>
        </div>`;
    }

    function _feeEstimateText() {
        if (_data.smartFee != null) {
            const feeStr = typeof _formatDeliveryFee === 'function'
                ? _formatDeliveryFee(_data.smartFee)
                : `$${_data.smartFee.toFixed(2)}`;
            return `<span style="color:var(--clr-black);">${feeStr}</span> تقديرياً حسب المسافة — قد تتغيّر قليلاً بعد تأكيد الموظف.`;
        }
        return 'حدّد موقع المتجر وموقع التوصيل لعرض تقدير الرسوم — الرسوم النهائية يحدّدها فريق Delivo بعد التأكيد.';
    }

    async function _refreshFeeEstimate() {
        await _computeSmartFee();
        const el = document.getElementById('ext-fee-estimate');
        if (el) el.innerHTML = `💡 <strong style="color:var(--clr-black);">رسوم التوصيل:</strong> ${_feeEstimateText()}`;
    }

    function _bindForm() {
        document.getElementById('ext-store-name')?.addEventListener('input', e => _data.storeName = e.target.value.trim());
        document.getElementById('ext-store-addr')?.addEventListener('input', e => _data.storeAddress = e.target.value.trim());
        document.getElementById('ext-order-desc')?.addEventListener('input', e => _data.orderDescription = e.target.value.trim());
        document.getElementById('ext-dest-addr')?.addEventListener('input', e => _data.destAddress = e.target.value.trim());
        _refreshFeeEstimate();
    }

    function _validateForm() {
        _data.storeName        = document.getElementById('ext-store-name')?.value.trim() || '';
        _data.storeAddress     = document.getElementById('ext-store-addr')?.value.trim() || '';
        _data.orderDescription = document.getElementById('ext-order-desc')?.value.trim() || '';
        _data.destAddress      = document.getElementById('ext-dest-addr')?.value.trim() || '';

        if (!_data.storeName)    return _shake('ext-store-name', 'أدخل اسم المتجر');
        if (!_data.storeAddress && !_data.storeLat) return _shake('ext-store-addr', 'أدخل عنوان المتجر أو حدده على الخريطة');
        if (!_data.orderDescription) return _shake('ext-order-desc', 'صف طلبك بالتفصيل');
        if (!_data.destAddress && !_data.destLat) return _shake('ext-dest-addr', 'أدخل عنوان التوصيل أو حدده على الخريطة');
        return true;
    }

    // Uses the exact same settings/smartDelivery config and formula as
    // regular checkout (_calcSmartFee in cart.js) — just computes distance
    // directly from this order's own store/destination pins instead of
    // looking a store up by name, since external stores aren't part of
    // the registered `pattern` collection that lookup relies on.
    async function _computeSmartFee() {
        if (!_data.storeLat || !_data.destLat) { _data.smartFee = null; return; }
        try {
            const cfg = typeof _loadSmartCfg === 'function' ? await _loadSmartCfg() : null;
            if (!cfg || !cfg.enabled) { _data.smartFee = null; return; }

            const baseFee   = parseFloat(cfg.baseFee   ?? 1.5);
            const ratePerKm = parseFloat(cfg.ratePerKm ?? 0.3);
            const minFee    = parseFloat(cfg.minFee    ?? 0.5);
            const maxFee    = parseFloat(cfg.maxFee    ?? 5.0);

            const km = _haversineKm(_data.storeLat, _data.storeLng, _data.destLat, _data.destLng);
            const distFee = baseFee + km * ratePerKm;
            const rawFee = Math.min(maxFee, Math.max(minFee, distFee));
            // Reuses cart.js's global helper so LBP-scale fees round to
            // the nearest 10,000 the same way regular checkout does.
            _data.smartFee = typeof _normalizeDeliveryFee === 'function' ? _normalizeDeliveryFee(rawFee) : rawFee;
        } catch (_) { _data.smartFee = null; }
    }

    async function _extQuickDest(name, lat, lng) {
        const addrInput = document.getElementById('ext-dest-addr');

        const applyIt = async (finalLat, finalLng) => {
            _data.destAddress = name;
            _data.destLat = finalLat;
            _data.destLng = finalLng;
            if (addrInput) addrInput.value = name;
            const badgeHost = addrInput?.closest('.ext-field');
            if (badgeHost) {
                let badge = badgeHost.querySelector('.ext-coord-badge');
                if (!badge) { badge = document.createElement('div'); badge.className = 'ext-coord-badge'; badgeHost.appendChild(badge); }
                badge.textContent = `📌 ${finalLat.toFixed(5)}, ${finalLng.toFixed(5)}`;
            }
            await _refreshFeeEstimate();
        };

        if (typeof _checkCoverageOrWarn === 'function') {
            const ok = await _checkCoverageOrWarn(lat, lng, null, (fixedLat, fixedLng) => applyIt(fixedLat, fixedLng));
            if (!ok) return; // outside coverage — warning modal is already showing
        }
        applyIt(lat, lng);
    }

    // Category chip tap — opens a popup in front of the whole form (same
    // pattern as admin's "الزوار المتصلون" presence panel: fixed overlay,
    // centered card, click-outside or ✕ to close) instead of pushing an
    // inline panel into the form's flow. Since the description textarea
    // sits behind this popup and isn't visible while it's open, a live
    // "tray" of what's been added so far sits between the header and the
    // item pills — so tapping an item shows immediate, visible proof it
    // landed in the description, without needing to see the textarea.
    function _extEnsureItemPopup() {
        if (document.getElementById('ext-item-popup-overlay')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="ext-item-popup-overlay" class="ext-item-popup-overlay" style="display:none;" onclick="if(event.target===this)_extCloseItemPopup()">
            <div class="ext-item-popup">
                <div class="ext-item-popup__header">
                    <span id="ext-item-popup-title">—</span>
                    <button type="button" class="ext-item-popup__close" onclick="_extCloseItemPopup()">✕</button>
                </div>
                <div id="ext-item-popup-tray" class="ext-item-popup__tray"></div>
                <div id="ext-item-popup-body" class="ext-item-popup__body"></div>
            </div>
        </div>`);
    }

    function _extOpenItemPopup(cat) {
        _extEnsureItemPopup();
        const overlay = document.getElementById('ext-item-popup-overlay');
        const titleEl  = document.getElementById('ext-item-popup-title');
        const bodyEl   = document.getElementById('ext-item-popup-body');
        if (!overlay || !bodyEl) return;

        document.querySelectorAll('.ext-cat-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));

        const items = _quickItemCategories[cat] || [];
        if (titleEl) titleEl.textContent = cat;
        bodyEl.innerHTML = items.map(item =>
            `<button type="button" class="ext-item-popup__pill" onclick="_extQuickItem('${item.replace(/'/g, "\\'")}', this)">${item}</button>`
        ).join('');
        _extRenderTray();
        overlay.style.display = 'flex';
    }

    function _extCloseItemPopup() {
        const overlay = document.getElementById('ext-item-popup-overlay');
        if (overlay) overlay.style.display = 'none';
        document.querySelectorAll('.ext-cat-chip').forEach(b => b.classList.remove('active'));
    }

    // Renders the "أُضيف إلى طلبك" tray from the current description —
    // always reflects real state (works whether items came from the
    // popup or were hand-typed), and each tag can be removed directly.
    function _extRenderTray() {
        const tray = document.getElementById('ext-item-popup-tray');
        if (!tray) return;
        const parts = _data.orderDescription ? _data.orderDescription.split('،').map(s => s.trim()).filter(Boolean) : [];

        if (!parts.length) {
            tray.innerHTML = `<span class="ext-item-popup__tray-empty">بعدك ما ضفت شي، نرجو تحديد أصنافك 👇</span>`;
            return;
        }
        tray.innerHTML = `
            <span class="ext-item-popup__tray-label">✓ مُضاف لطلبك:</span>
            <div class="ext-item-popup__tray-list">
                ${parts.map((p, i) => `
                    <span class="ext-item-popup__tray-tag">
                        ${_esc(p)}
                        <button type="button" class="ext-item-popup__tray-x" onclick="_extRemoveItem(${i})" title="إزالة">✕</button>
                    </span>
                `).join('')}
            </div>`;
    }

    function _extRemoveItem(index) {
        const parts = (_data.orderDescription || '').split('،').map(s => s.trim()).filter(Boolean);
        parts.splice(index, 1);
        _data.orderDescription = parts.join('، ');
        const el = document.getElementById('ext-order-desc');
        if (el) el.value = _data.orderDescription;
        _extRenderTray();
    }

    // Appends a quick-pick item label into the order description —
    // doesn't replace what the customer already typed, just adds to it
    // (comma-separated). Popup stays open so multiple items from the
    // same category can be added in one go. Since the textarea is
    // hidden behind this popup, the tapped pill itself flashes a quick
    // "✓ أُضيف" confirmation and the tray above pulses, so the transfer
    // is visibly obvious without needing to peek at the description.
    function _extQuickItem(label, btnEl) {
        const el = document.getElementById('ext-order-desc');
        if (!el) return;
        const current = el.value.trim();
        el.value = current ? `${current}، ${label}` : label;
        _data.orderDescription = el.value.trim();
        _extRenderTray();

        if (btnEl) {
            const original = btnEl.textContent;
            btnEl.classList.add('ext-item-popup__pill--added');
            btnEl.disabled = true;
            btnEl.textContent = '✓ أُضيف';
            setTimeout(() => {
                btnEl.classList.remove('ext-item-popup__pill--added');
                btnEl.textContent = original;
                btnEl.disabled = false;
            }, 600);
        }

        const tray = document.getElementById('ext-item-popup-tray');
        if (tray) {
            tray.classList.add('ext-item-popup__tray--flash');
            setTimeout(() => tray.classList.remove('ext-item-popup__tray--flash'), 500);
        }
    }

    /* ═══════════════════════════════════════════════════════
       SUBMIT
    ═══════════════════════════════════════════════════════ */
    async function _submit() {
        if (!_validateForm()) return;

        const submitBtn = document.getElementById('ext-btn-next');
        submitBtn.disabled    = true;
        submitBtn.textContent = '⏳ جاري الإرسال…';
        try {
            await _computeSmartFee();
            await _submitOrder();
        } catch (e) {
            submitBtn.disabled    = false;
            submitBtn.textContent = '✔ إرسال الطلب';
            const errEl = document.getElementById('ext-submit-err');
            if (errEl) { errEl.textContent = '❌ حدث خطأ أثناء الإرسال. يرجى المحاولة مجدداً.'; errEl.style.display = 'block'; }
        }
    }

    async function _submitOrder() {
        const user = window.DelivoUser;
        if (!user) throw new Error('not logged in');

        // Single free-text description line (matches admin's parseCart
        // format: qty:name:price:store:note) instead of itemized rows.
        const cartStr  = `1:${_data.orderDescription}:0:${_data.storeName}:`;
        const totalStr = ''; // price is no longer collected from the customer — admin fills it in from the dashboard

        // Counter
        const counterResp = await fetch(`${RTDB}/globalCounter.json`);
        const counter     = await counterResp.json();
        let nextId        = (counter?.requestId || 0) + 1;
        const requestKey  = `id_${nextId}`;
        const now = new Date();
        const dateStr = now.toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).replace(',','');

        const requestObj = {
            cart          : cartStr,
            city          : 'Baalbeck',
            date          : dateStr,
            delivryplusid : user.uid || '',
            driver        : '0',
            rewardApplied : '',
            fullname      : user.displayName || user.username || (user.email || '').split('@')[0] || '',
            lat           : _data.destLat   ? String(_data.destLat)  : '',
            lng           : _data.destLng   ? String(_data.destLng)  : '',
            phone         : user.phone || '',
            read          : '0',
            state         : '0',
            store         : _data.storeName,
            street        : _data.destAddress || '',
            total         : totalStr,
            trackorder    : '0',
            username      : user.username || (user.email || '').split('@')[0] || '',
            vault         : '0',
            // Extra fields for external orders
            externalOrder : '1',
            storeAddress  : _data.storeAddress,
            storeLat      : _data.storeLat  ? String(_data.storeLat) : '',
            storeLng      : _data.storeLng  ? String(_data.storeLng) : '',
            storePhone    : _data.storePhone || '',
            deliveryFee   : _data.smartFee != null ? (_data.smartFee > 1000 ? String(_data.smartFee) : _data.smartFee.toFixed(2)) : '',
        };

        await Promise.all([
            fetch(`${RTDB}/requests/${requestKey}.json`,                          { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(requestObj) }),
            fetch(`${RTDB}/historyRequests/${user.uid}/${requestKey}.json`,       { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...requestObj, trackorder:'0' }) }),
            fetch(`${RTDB}/globalCounter/requestId.json`,                         { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(nextId) }),
        ]);

        // WhatsApp notification to admin
        try {
            const adminResp = await fetch(`${RTDB}/settings/adminPhone.json`);
            const adminPhone = await adminResp.json();
            if (adminPhone) {
                const name    = requestObj.fullname || 'مجهول';
                const phone   = (user.phone || '').replace(/\D/g,'');
                const waMsg   = encodeURIComponent(
                    `🛍️ طلب خارجي جديد #${nextId}\n` +
                    `👤 ${name} | 📞 +961${phone}\n` +
                    `🏪 المتجر: ${_data.storeName} (${_data.storeAddress})\n` +
                    `🧾 ${_data.orderDescription}\n` +
                    `🏠 التوصيل إلى: ${_data.destAddress}`
                );
                const waLink = `https://wa.me/${adminPhone}?text=${waMsg}`;
                fetch(`${RTDB}/pendingWaNotifications.json`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ waLink, orderTime: new Date().toISOString(), customer: name, phone: '+961'+phone, stores: _data.storeName, read: false, externalOrder: true })
                }).catch(() => {});
            }
        } catch(_) {}

        // Request notification permission after order placed
        if (typeof window._onOrderPlaced === 'function') window._onOrderPlaced();
        // Success screen
        _showSuccess(requestKey);
    }

    function _showSuccess(requestKey) {
        const content = document.getElementById('ext-order-content');
        const nextBtn = document.getElementById('ext-btn-next');

        nextBtn.disabled     = false;
        nextBtn.textContent  = '✕ إغلاق';
        nextBtn.onclick      = _closeModal;

        content.innerHTML = `
        <div style="text-align:center;padding:30px 0 10px;">
            <div style="font-size:3.5rem;margin-bottom:14px;animation:extPop .4s cubic-bezier(.2,1.4,.5,1) both;">✅</div>
            <div style="font-size:1.15rem;font-weight:900;color:var(--clr-black);margin-bottom:8px;">تم إرسال طلبك!</div>
            <div style="font-size:0.82rem;color:var(--clr-gray-500);line-height:1.7;max-width:280px;margin:0 auto;">
                رقم طلبك: <strong style="color:var(--clr-orange);">${requestKey.replace('id_','#')}</strong><br>
                سيتواصل معك فريق Delivo قريباً لتأكيد التفاصيل ورسوم التوصيل.
            </div>
            <div style="margin-top:20px;padding:14px 18px;background:var(--clr-orange-light);border:1px solid rgba(255,92,0,0.18);border-radius:14px;text-align:right;">
                <div style="font-size:0.72rem;font-weight:800;color:var(--clr-gray-500);margin-bottom:8px;">ملخص الطلب</div>
                <div style="font-size:0.82rem;color:var(--clr-black);">🏪 ${_esc(_data.storeName)}</div>
                <div style="font-size:0.78rem;color:var(--clr-gray-500);margin-top:4px;">🏠 ${_esc(_data.destAddress || '—')}</div>
            </div>
        </div>`;
    }

    /* ═══════════════════════════════════════════════════════
       MAP PICKER
    ═══════════════════════════════════════════════════════ */
    // Real Baalbek city coordinates — used only if the admin hasn't
    // configured settings/deliveryCenter yet.
    const BAALBEK_FALLBACK = { lat: 34.0058, lng: 36.2181, radiusKm: 7 };

    let _mapCoverageCenter = null; // resolved once per modal-open, reused by both store/dest pickers

    function _pickMap(target) {
        _mapTarget  = target;
        const modal = document.getElementById('ext-map-modal');
        const title = document.getElementById('ext-map-title');
        title.textContent = target === 'store' ? '📍 موقع المتجر' : '🏠 موقع التوصيل';

        // "موقعي الحالي" only makes sense for the delivery destination —
        // a customer's own GPS position is never the store's location.
        const gpsBtn = document.getElementById('ext-map-gps-btn');
        const gpsStatus = document.getElementById('ext-map-gps-status');
        if (gpsBtn) gpsBtn.style.display = target === 'store' ? 'none' : '';
        if (gpsStatus) gpsStatus.style.display = 'none';
        modal.style.display = 'flex';
        requestAnimationFrame(async () => {
            await _ensureLeafletLoaded();

            if (!_mapCoverageCenter) {
                try { _mapCoverageCenter = (typeof _getDeliveryCenter === 'function' ? await _getDeliveryCenter() : null) || BAALBEK_FALLBACK; }
                catch (_) { _mapCoverageCenter = BAALBEK_FALLBACK; }
            }
            const center = _mapCoverageCenter;

            const mapEl = document.getElementById('ext-map-leaflet');
            const existingLat = target === 'store' ? (_data.storeLat || center.lat) : (_data.destLat || center.lat);
            const existingLng = target === 'store' ? (_data.storeLng || center.lng) : (_data.destLng || center.lng);

            if (_mapInstance) { _mapInstance.remove(); _mapInstance = null; }
            mapEl.innerHTML = '';

            _mapInstance = L.map('ext-map-leaflet', { zoomControl: true }).setView([existingLat, existingLng], 14);

            // ── Tile layers: standard (OSM) + satellite (Google), same
            // toggle pattern used on the registration map and the
            // coverage-warning map elsewhere in the app.
            const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';
            const standardLayer  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap', maxZoom: 19,
            });
            const satelliteLayer = L.tileLayer(
                `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
                { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
            );
            standardLayer.addTo(_mapInstance);
            let _extMapLayer = 'standard';

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
                    if (_extMapLayer === 'standard') {
                        _mapInstance.removeLayer(standardLayer);
                        satelliteLayer.addTo(_mapInstance);
                        _extMapLayer = 'satellite';
                        btn.innerHTML = '🗺 خريطة';
                    } else {
                        _mapInstance.removeLayer(satelliteLayer);
                        standardLayer.addTo(_mapInstance);
                        _extMapLayer = 'standard';
                        btn.innerHTML = '🛰 صورة جوية';
                    }
                });
                return btn;
            };
            toggleCtrl.addTo(_mapInstance);

            // ── Coverage circle — same visual language as the rest of
            // the app, so the customer can see the boundary directly
            // instead of only finding out after picking a point.
            if (center) {
                L.circle([center.lat, center.lng], {
                    radius: (center.radiusKm || 7) * 1000,
                    color: '#FF5C00', weight: 2, dashArray: '6,8',
                    fillColor: '#FF5C00', fillOpacity: 0.07,
                }).addTo(_mapInstance);
            }

            const icon = L.divIcon({
                className: '',
                html: '<div style="font-size:2rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">📍</div>',
                iconSize: [36, 36], iconAnchor: [18, 36],
            });
            _mapMarker = L.marker([existingLat, existingLng], { draggable: true, icon }).addTo(_mapInstance);
            _mapInstance.on('click', e => _mapMarker.setLatLng(e.latlng));

            setTimeout(() => _mapInstance.invalidateSize(), 200);
        });
    }

    async function _mapConfirm() {
        const ll = _mapMarker.getLatLng();

        // Reject picks outside the delivery coverage circle — same check
        // used everywhere else a customer sets a location. If outside,
        // _checkCoverageOrWarn shows its own interactive fix-it map and
        // this confirm is aborted; the customer can just reopen this
        // picker once they've adjusted, or use that warning map directly.
        if (typeof _checkCoverageOrWarn === 'function') {
            const ok = await _checkCoverageOrWarn(ll.lat, ll.lng, null, (fixedLat, fixedLng) => {
                _applyMapPick(fixedLat, fixedLng);
                document.getElementById('ext-map-modal').style.display = 'none';
                _render();
            });
            if (!ok) return; // warning shown — do not close this modal's picker state below
        }

        _applyMapPick(ll.lat, ll.lng);
        document.getElementById('ext-map-modal').style.display = 'none';
        _render(); // re-render to show coordinate badge + refresh fee estimate
    }

    function _applyMapPick(lat, lng) {
        if (_mapTarget === 'store') {
            _data.storeLat = lat;
            _data.storeLng = lng;
            if (!_data.storeAddress) _data.storeAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        } else {
            _data.destLat = lat;
            _data.destLng = lng;
            if (!_data.destAddress) _data.destAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
    }

    function _mapCancel() {
        document.getElementById('ext-map-modal').style.display = 'none';
    }

    /* ═══════════════════════════════════════════════════════
       HELPERS
    ═══════════════════════════════════════════════════════ */
    function _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function _shake(elId, msg) {
        const el = document.getElementById(elId);
        if (el) {
            el.style.animation = 'extShake .35s ease';
            el.addEventListener('animationend', () => el.style.animation = '', { once: true });
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // toast-style inline error
        let errEl = document.getElementById('ext-inline-err');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.id = 'ext-inline-err';
            errEl.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:9px 18px;border-radius:10px;font-size:0.8rem;font-weight:700;z-index:10200;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.4);border:1px solid rgba(255,80,80,0.3);';
            document.body.appendChild(errEl);
        }
        errEl.textContent = '⚠️ ' + msg;
        errEl.style.display = 'block';
        clearTimeout(errEl._t);
        errEl._t = setTimeout(() => { if(errEl) errEl.style.display = 'none'; }, 3000);
        return false;
    }

    /* ═══════════════════════════════════════════════════════
       EXPOSE GLOBALS
    ═══════════════════════════════════════════════════════ */
    window._extOpenModal  = _openModal;
    window._extCloseModal = _closeModal;
    window._extSubmit     = _submit;
    window._extPickMap    = _pickMap;
    window._extMapConfirm = _mapConfirm;
    window._extMapCancel  = _mapCancel;
    window._extQuickDest      = _extQuickDest;
    window._extQuickItem      = _extQuickItem;
    window._extOpenItemPopup  = _extOpenItemPopup;
    window._extCloseItemPopup = _extCloseItemPopup;
    window._extRemoveItem     = _extRemoveItem;

    // Expose _data for inline onchange handlers
    window._data = _data;

})();