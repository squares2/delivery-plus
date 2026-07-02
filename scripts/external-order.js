/* ============================================================
   scripts/external-order.js
   "اطلب خارجي" — let customers order from any store not on
   Delivo. 4-step wizard: Store → Order → Delivery → Confirm.
   Submits to the same Firebase requests/ + historyRequests/
   paths so admin sees it in the dashboard like any other order.
   ============================================================ */

(function () {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    /* ── State ──────────────────────────────────────────────── */
    let _step = 1;
    let _data = {
        // Step 1 — Store
        storeName    : '',
        storeAddress : '',
        storeLat     : null,
        storeLng     : null,
        storePhone   : '',
        // Step 2 — Order
        orderItems   : [],   // { qty, name, note } objects
        orderNote    : '',
        approxTotal  : '',
        // Step 3 — Delivery
        destAddress  : '',
        destLat      : null,
        destLng      : null,
    };

    /* ── Map state ──────────────────────────────────────────── */
    let _mapInstance  = null;
    let _mapMarker    = null;
    let _mapTarget    = null;   // 'store' | 'dest'
    let _mapResolve   = null;

    /* ── Common categories for quick item chips ─────────────── */
    const QUICK_ITEMS = {
        'مطعم / وجبات': ['برغر', 'شاورما', 'بيتزا', 'مشاوي', 'فلافل', 'صندويش', 'فروج مشوي', 'سلطة'],
        'مخبز / حلويات': ['خبز', 'كعك', 'كنافة', 'بقلاوة', 'مناقيش', 'معجنات', 'كرواسون', 'بوظة'],
        'بقالة / سوبرماركت': ['ماء', 'عصير', 'حليب', 'بيض', 'خضار', 'فاكهة', 'مواد تنظيف', 'شيبس'],
        'دواء / صيدلية': ['مسكنات', 'فيتامينات', 'مضادات حيوية', 'كريم', 'شامبو', 'ضماد'],
        'أخرى': [],
    };

    /* ═══════════════════════════════════════════════════════
       OPEN / CLOSE
    ═══════════════════════════════════════════════════════ */
    function _openModal() {
        const user = window.DelivoUser;
        if (!user) {
            // Nudge login
            const loginEl = document.querySelector('[data-modal="modal-login"]') ||
                            document.getElementById('login-modal-trigger');
            if (loginEl) loginEl.click();
            else alert('يرجى تسجيل الدخول أولاً');
            return;
        }
        // Reset state
        _step = 1;
        _data = { storeName:'', storeAddress:'', storeLat:null, storeLng:null, storePhone:'',
                  orderItems:[], orderNote:'', approxTotal:'', destAddress:'', destLat:null, destLng:null };

        const overlay = document.getElementById('ext-order-overlay');
        overlay.style.display = 'flex';
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
        document.body.classList.add('modal-open');
        _renderStep();
    }

    function _closeModal() {
        const overlay = document.getElementById('ext-order-overlay');
        overlay.style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    /* ═══════════════════════════════════════════════════════
       STEP RENDERING
    ═══════════════════════════════════════════════════════ */
    function _renderStep() {
        _updateStepBar();
        const content = document.getElementById('ext-order-content');
        const backBtn = document.getElementById('ext-btn-back');
        const nextBtn = document.getElementById('ext-btn-next');

        backBtn.style.display = _step > 1 ? 'block' : 'none';

        switch (_step) {
            case 1: content.innerHTML = _tmplStep1(); _bindStep1(); nextBtn.textContent = 'التالي ›'; break;
            case 2: content.innerHTML = _tmplStep2(); _bindStep2(); nextBtn.textContent = 'التالي ›'; break;
            case 3: content.innerHTML = _tmplStep3(); _bindStep3(); nextBtn.textContent = 'التالي ›'; break;
            case 4: content.innerHTML = _tmplStep4(); nextBtn.textContent = '✔ تأكيد الطلب'; break;
        }
        content.scrollTop = 0;
    }

    function _updateStepBar() {
        for (let i = 1; i <= 4; i++) {
            const dot   = document.getElementById(`ext-dot-${i}`);
            const circle = dot?.querySelector('div');
            const label  = dot?.querySelector('span');
            const line   = document.getElementById(`ext-line-${i}`);
            const active = i === _step;
            const done   = i < _step;

            if (circle) {
                circle.style.background = active ? 'var(--orange,#ff5c00)' : done ? 'rgba(255,92,0,0.35)' : 'rgba(255,255,255,0.1)';
                circle.style.color      = (active || done) ? '#fff' : 'rgba(255,255,255,0.35)';
                circle.innerHTML        = done ? '✓' : String(i);
            }
            if (label) {
                label.style.color = active ? 'var(--orange,#ff5c00)' : done ? 'rgba(255,92,0,0.6)' : 'rgba(255,255,255,0.3)';
            }
            if (line) {
                line.style.background = done ? 'rgba(255,92,0,0.4)' : 'rgba(255,255,255,0.1)';
            }
        }
    }

    /* ═══════════════════════════════════════════════════════
       STEP 1 — Store info
    ═══════════════════════════════════════════════════════ */
    function _tmplStep1() {
        return `
        <div style="padding-top:6px;">
            <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:16px;line-height:1.6;">
                حدد المتجر الذي تريد الطلب منه — يمكنك تحديد موقعه على الخريطة أو كتابة عنوانه يدوياً.
            </p>

            <div class="ext-field">
                <label class="ext-label">🏪 اسم المتجر <span style="color:var(--orange)">*</span></label>
                <input id="ext-store-name" type="text" class="ext-input" placeholder="مثال: مطعم الشام، سوبرماركت الريف…" value="${_esc(_data.storeName)}">
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

            <div class="ext-field">
                <label class="ext-label">📞 رقم المتجر <span style="color:rgba(255,255,255,0.3);font-size:0.68rem;">(اختياري — للتأكيد معهم)</span></label>
                <input id="ext-store-phone" type="tel" class="ext-input" placeholder="07xxxxxxxx" value="${_esc(_data.storePhone)}">
            </div>
        </div>`;
    }

    function _bindStep1() {
        document.getElementById('ext-store-name')?.addEventListener('input', e => _data.storeName = e.target.value.trim());
        document.getElementById('ext-store-addr')?.addEventListener('input', e => _data.storeAddress = e.target.value.trim());
        document.getElementById('ext-store-phone')?.addEventListener('input', e => _data.storePhone = e.target.value.trim());
    }

    function _validateStep1() {
        _data.storeName    = document.getElementById('ext-store-name')?.value.trim() || '';
        _data.storeAddress = document.getElementById('ext-store-addr')?.value.trim() || '';
        if (!_data.storeName)    return _shake('ext-store-name',    'أدخل اسم المتجر');
        if (!_data.storeAddress && !_data.storeLat) return _shake('ext-store-addr', 'أدخل عنوان المتجر أو حدده على الخريطة');
        return true;
    }

    /* ═══════════════════════════════════════════════════════
       STEP 2 — Order details
    ═══════════════════════════════════════════════════════ */
    function _tmplStep2() {
        const cats = Object.keys(QUICK_ITEMS);
        return `
        <div style="padding-top:6px;">
            <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:14px;line-height:1.6;">
                اختر أو اكتب ما تريد طلبه. يمكنك إضافة أكثر من صنف.
            </p>

            <!-- Category quick-select -->
            <div class="ext-field">
                <label class="ext-label">📂 نوع المتجر</label>
                <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px;" id="ext-cat-chips">
                    ${cats.map(cat => `
                        <button class="ext-chip" onclick="_extSelectCat(this,'${_esc(cat)}')">${cat}</button>
                    `).join('')}
                </div>
            </div>

            <!-- Quick item chips -->
            <div id="ext-quick-items" style="display:none;" class="ext-field">
                <label class="ext-label">⚡ اختر بسرعة</label>
                <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px;" id="ext-quick-chips"></div>
            </div>

            <!-- Item rows -->
            <div class="ext-field">
                <label class="ext-label">🧾 قائمة الطلب <span style="color:var(--orange)">*</span></label>
                <div id="ext-item-rows">
                    ${_data.orderItems.length ? _data.orderItems.map((it, i) => _itemRowHTML(it, i)).join('') : _itemRowHTML({qty:1,name:'',note:''}, 0)}
                </div>
                <button onclick="_extAddItemRow()" style="margin-top:10px;width:100%;padding:9px;background:rgba(255,255,255,0.05);border:1.5px dashed rgba(255,255,255,0.15);border-radius:12px;color:rgba(255,255,255,0.5);font-family:inherit;font-size:0.82rem;cursor:pointer;">+ إضافة صنف آخر</button>
            </div>

            <div class="ext-field">
                <label class="ext-label">💬 ملاحظات للمتجر <span style="color:rgba(255,255,255,0.3);font-size:0.68rem;">(اختياري)</span></label>
                <textarea id="ext-order-note" class="ext-input" rows="2" placeholder="بدون بصل، إضافات خاصة…" style="resize:none;">${_esc(_data.orderNote)}</textarea>
            </div>

            <div class="ext-field">
                <label class="ext-label">💵 السعر التقريبي للطلب <span style="color:var(--orange)">*</span></label>
                <div style="display:flex;gap:6px;">
                    <input id="ext-approx-total" type="number" min="0" step="0.5" class="ext-input" style="flex:1;" placeholder="0.00" value="${_esc(_data.approxTotal)}">
                    <div style="display:flex;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);">
                        <button id="ext-curr-usd" onclick="_extSetCurr('USD')" style="padding:0 14px;background:var(--orange,#ff5c00);border:none;color:#fff;font-weight:800;cursor:pointer;font-size:0.82rem;">$</button>
                        <button id="ext-curr-lbp" onclick="_extSetCurr('LBP')" style="padding:0 14px;background:rgba(255,255,255,0.07);border:none;color:rgba(255,255,255,0.5);font-weight:800;cursor:pointer;font-size:0.82rem;">ل.ل</button>
                    </div>
                </div>
                <div id="ext-curr-indicator" style="font-size:0.68rem;color:rgba(255,255,255,0.3);margin-top:4px;">العملة: دولار أمريكي</div>
            </div>
        </div>`;
    }

    let _currency = 'USD';
    function _bindStep2() {
        document.getElementById('ext-order-note')?.addEventListener('input', e => _data.orderNote = e.target.value);
        document.getElementById('ext-approx-total')?.addEventListener('input', e => _data.approxTotal = e.target.value);
        // Restore currency button state
        _extSetCurr(_currency, true);
        // Restore cat selection if any
        if (_lastCat) {
            const chip = [...document.querySelectorAll('#ext-cat-chips .ext-chip')].find(c => c.textContent === _lastCat);
            if (chip) { chip.classList.add('active'); _showQuickItems(_lastCat); }
        }
    }

    let _lastCat = '';
    window._extSelectCat = function(btn, cat) {
        document.querySelectorAll('#ext-cat-chips .ext-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        _lastCat = cat;
        _showQuickItems(cat);
    };
    function _showQuickItems(cat) {
        const items = QUICK_ITEMS[cat] || [];
        const wrap  = document.getElementById('ext-quick-items');
        const chips = document.getElementById('ext-quick-chips');
        if (!wrap || !chips) return;
        if (!items.length) { wrap.style.display = 'none'; return; }
        chips.innerHTML = items.map(it => `<button class="ext-chip ext-chip--item" onclick="_extAddQuickItem('${_esc(it)}')">${it}</button>`).join('');
        wrap.style.display = 'block';
    }
    window._extAddQuickItem = function(name) {
        // Add to first empty row or append new
        const rows = document.querySelectorAll('#ext-item-rows .ext-item-name');
        for (const inp of rows) {
            if (!inp.value.trim()) { inp.value = name; inp.dispatchEvent(new Event('input')); return; }
        }
        _extAddItemRow(name);
    };

    function _itemRowHTML(item, idx) {
        return `
        <div class="ext-item-row" id="ext-row-${idx}" style="display:flex;gap:7px;align-items:center;margin-bottom:8px;">
            <input type="number" min="1" max="99" value="${item.qty || 1}" class="ext-input ext-qty" style="width:52px;text-align:center;flex-shrink:0;" oninput="_extSyncRows()">
            <input type="text" placeholder="اسم الصنف…" value="${_esc(item.name)}" class="ext-input ext-item-name" style="flex:1;" oninput="_extSyncRows()">
            <input type="text" placeholder="ملاحظة…" value="${_esc(item.note)}" class="ext-input ext-item-note" style="width:80px;font-size:0.75rem;" oninput="_extSyncRows()">
            <button onclick="_extRemoveRow(this)" style="background:rgba(255,80,80,0.12);border:1px solid rgba(255,80,80,0.2);color:rgba(255,120,120,0.8);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:1rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;">×</button>
        </div>`;
    }

    window._extSyncRows = function() {
        _data.orderItems = [];
        document.querySelectorAll('#ext-item-rows .ext-item-row').forEach(row => {
            const qty  = parseInt(row.querySelector('.ext-qty')?.value) || 1;
            const name = row.querySelector('.ext-item-name')?.value.trim() || '';
            const note = row.querySelector('.ext-item-note')?.value.trim() || '';
            _data.orderItems.push({ qty, name, note });
        });
    };

    window._extAddItemRow = function(prefillName = '') {
        _extSyncRows();
        const idx = document.querySelectorAll('#ext-item-rows .ext-item-row').length;
        const div = document.createElement('div');
        div.innerHTML = _itemRowHTML({ qty:1, name: prefillName, note:'' }, idx);
        document.getElementById('ext-item-rows').appendChild(div.firstElementChild);
    };

    window._extRemoveRow = function(btn) {
        const row = btn.closest('.ext-item-row');
        const container = document.getElementById('ext-item-rows');
        if (container.querySelectorAll('.ext-item-row').length <= 1) return; // keep at least 1
        row.remove();
        _extSyncRows();
    };

    window._extSetCurr = function(curr, silent = false) {
        _currency = curr;
        const usdBtn = document.getElementById('ext-curr-usd');
        const lbpBtn = document.getElementById('ext-curr-lbp');
        const ind    = document.getElementById('ext-curr-indicator');
        if (usdBtn) { usdBtn.style.background = curr === 'USD' ? 'var(--orange,#ff5c00)' : 'rgba(255,255,255,0.07)'; usdBtn.style.color = curr === 'USD' ? '#fff' : 'rgba(255,255,255,0.5)'; }
        if (lbpBtn) { lbpBtn.style.background = curr === 'LBP' ? 'var(--orange,#ff5c00)' : 'rgba(255,255,255,0.07)'; lbpBtn.style.color = curr === 'LBP' ? '#fff' : 'rgba(255,255,255,0.5)'; }
        if (ind)    ind.textContent = curr === 'USD' ? 'العملة: دولار أمريكي' : 'العملة: ليرة لبنانية';
    };

    function _validateStep2() {
        _extSyncRows();
        _data.orderNote    = document.getElementById('ext-order-note')?.value.trim() || '';
        _data.approxTotal  = document.getElementById('ext-approx-total')?.value.trim() || '';
        const hasItem = _data.orderItems.some(it => it.name);
        if (!hasItem) return _shake('ext-item-rows', 'أدخل صنفاً واحداً على الأقل');
        if (!_data.approxTotal || isNaN(parseFloat(_data.approxTotal))) return _shake('ext-approx-total', 'أدخل السعر التقريبي للطلب');
        return true;
    }

    /* ═══════════════════════════════════════════════════════
       STEP 3 — Delivery destination
    ═══════════════════════════════════════════════════════ */
    function _tmplStep3() {
        // Pre-fill from user profile if available
        const user = window.DelivoUser;
        if (!_data.destAddress && user?.street) _data.destAddress = user.street;

        return `
        <div style="padding-top:6px;">
            <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:14px;line-height:1.6;">
                أين تريد استلام طلبك؟ حدد موقعك على الخريطة أو اكتب عنوانك.
            </p>

            <div class="ext-field">
                <label class="ext-label">🏠 عنوان التوصيل <span style="color:var(--orange)">*</span></label>
                <div style="display:flex;gap:8px;align-items:stretch;">
                    <input id="ext-dest-addr" type="text" class="ext-input" style="flex:1;" placeholder="المنطقة، الشارع، رقم البناية…" value="${_esc(_data.destAddress)}">
                    <button onclick="_extPickMap('dest')" class="ext-map-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                        خريطة
                    </button>
                </div>
                ${_data.destLat ? `<div class="ext-coord-badge">📌 ${_data.destLat.toFixed(5)}, ${_data.destLng.toFixed(5)}</div>` : ''}
            </div>

            <!-- Quick address shortcuts -->
            <div class="ext-field">
                <label class="ext-label" style="margin-bottom:8px;">📌 مواقع سريعة</label>
                <div style="display:flex;flex-wrap:wrap;gap:7px;">
                    ${['بعلبك - وسط المدينة','شمسطار','تعلبايا','يونين','الهرمل','قب الياس'].map(loc =>
                        `<button class="ext-chip" onclick="document.getElementById('ext-dest-addr').value='${loc}';_data.destAddress='${loc}';">${loc}</button>`
                    ).join('')}
                </div>
            </div>

            <div class="ext-field" style="background:rgba(255,92,0,0.05);border:1px solid rgba(255,92,0,0.15);border-radius:14px;padding:12px 14px;">
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.5);line-height:1.7;">
                    💡 <strong style="color:rgba(255,255,255,0.7);">ملاحظة:</strong> رسوم التوصيل تُحسب بعد تأكيد الطلب بناءً على المسافة والمتجر. سيتواصل معك أحد موظفينا قبل التأكيد النهائي.
                </div>
            </div>
        </div>`;
    }

    function _bindStep3() {
        document.getElementById('ext-dest-addr')?.addEventListener('input', e => _data.destAddress = e.target.value.trim());
    }

    function _validateStep3() {
        _data.destAddress = document.getElementById('ext-dest-addr')?.value.trim() || '';
        if (!_data.destAddress && !_data.destLat) return _shake('ext-dest-addr', 'أدخل عنوان التوصيل أو حدده على الخريطة');
        return true;
    }

    /* ═══════════════════════════════════════════════════════
       STEP 4 — Confirm summary
    ═══════════════════════════════════════════════════════ */
    function _tmplStep4() {
        const user      = window.DelivoUser;
        const itemsList = _data.orderItems.filter(it => it.name)
            .map(it => `<li style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:var(--orange);font-weight:800;">${it.qty}×</span>
                <span style="margin-right:6px;">${_esc(it.name)}</span>
                ${it.note ? `<span style="color:rgba(255,255,255,0.35);font-size:0.72rem;">(${_esc(it.note)})</span>` : ''}
            </li>`).join('');

        return `
        <div style="padding-top:6px;">
            <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:14px;line-height:1.6;">
                راجع تفاصيل طلبك قبل الإرسال.
            </p>

            <div class="ext-summary-card">
                <div class="ext-summary-row">
                    <span class="ext-summary-icon">🏪</span>
                    <div>
                        <div class="ext-summary-label">المتجر</div>
                        <div class="ext-summary-val">${_esc(_data.storeName)}</div>
                        <div class="ext-summary-sub">${_esc(_data.storeAddress)}${_data.storeLat ? ` · 📍${_data.storeLat.toFixed(4)},${_data.storeLng.toFixed(4)}` : ''}</div>
                        ${_data.storePhone ? `<div class="ext-summary-sub">📞 ${_esc(_data.storePhone)}</div>` : ''}
                    </div>
                </div>

                <div class="ext-summary-row">
                    <span class="ext-summary-icon">🧾</span>
                    <div style="flex:1;">
                        <div class="ext-summary-label">الطلب</div>
                        <ul style="margin:6px 0 0;padding:0;list-style:none;">${itemsList}</ul>
                        ${_data.orderNote ? `<div class="ext-summary-sub" style="margin-top:6px;">💬 ${_esc(_data.orderNote)}</div>` : ''}
                    </div>
                </div>

                <div class="ext-summary-row">
                    <span class="ext-summary-icon">💵</span>
                    <div>
                        <div class="ext-summary-label">السعر التقريبي للطلب</div>
                        <div class="ext-summary-val">${_esc(_data.approxTotal)} ${_currency === 'USD' ? '$' : 'ل.ل'}</div>
                    </div>
                </div>

                <div class="ext-summary-row">
                    <span class="ext-summary-icon">🏠</span>
                    <div>
                        <div class="ext-summary-label">التوصيل إلى</div>
                        <div class="ext-summary-val">${_esc(_data.destAddress || '—')}</div>
                        ${_data.destLat ? `<div class="ext-summary-sub">📍 ${_data.destLat.toFixed(4)},${_data.destLng.toFixed(4)}</div>` : ''}
                    </div>
                </div>

                <div class="ext-summary-row">
                    <span class="ext-summary-icon">👤</span>
                    <div>
                        <div class="ext-summary-label">الحساب</div>
                        <div class="ext-summary-val">${_esc(user?.displayName || user?.username || '—')}</div>
                        <div class="ext-summary-sub">📞 ${_esc(user?.phone || '—')}</div>
                    </div>
                </div>
            </div>

            <div id="ext-submit-err" style="display:none;margin-top:10px;padding:10px 14px;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.25);border-radius:10px;font-size:0.78rem;color:#ff8080;font-weight:700;"></div>
        </div>`;
    }

    /* ═══════════════════════════════════════════════════════
       NAV — Next / Back
    ═══════════════════════════════════════════════════════ */
    async function _next() {
        const nextBtn = document.getElementById('ext-btn-next');

        if (_step === 1 && !_validateStep1()) return;
        if (_step === 2 && !_validateStep2()) return;
        if (_step === 3 && !_validateStep3()) return;

        if (_step === 4) {
            // Submit
            nextBtn.disabled    = true;
            nextBtn.textContent = '⏳ جاري الإرسال…';
            try {
                await _submitOrder();
                nextBtn.disabled    = false;
                nextBtn.textContent = '✔ تأكيد الطلب';
            } catch (e) {
                nextBtn.disabled    = false;
                nextBtn.textContent = '✔ تأكيد الطلب';
                const errEl = document.getElementById('ext-submit-err');
                if (errEl) { errEl.textContent = '❌ حدث خطأ أثناء الإرسال. يرجى المحاولة مجدداً.'; errEl.style.display = 'block'; }
            }
            return;
        }

        _step++;
        _renderStep();
    }

    function _back() {
        if (_step <= 1) return;
        _step--;
        _renderStep();
    }

    /* ═══════════════════════════════════════════════════════
       SUBMIT
    ═══════════════════════════════════════════════════════ */
    async function _submitOrder() {
        const user = window.DelivoUser;
        if (!user) throw new Error('not logged in');

        // Build cart string in qty:name:price:store:note format (matches admin parseCart)
        const cartLines = _data.orderItems.filter(it => it.name)
            .map(it => `${it.qty}:${it.name}:0:${_data.storeName}:${it.note || ''}`).join(',');
        // Append order note as a special sentinel item so admin sees it
        const noteEntry = _data.orderNote ? `,1:💬 ${_data.orderNote}:0::` : '';
        const cartStr   = cartLines + noteEntry;
        const totalStr  = `${_data.approxTotal} ${_currency}`;

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
            fullname      : user.displayName || user.username || user.email || '',
            lat           : _data.destLat   ? String(_data.destLat)  : '',
            lng           : _data.destLng   ? String(_data.destLng)  : '',
            phone         : user.phone || '',
            read          : '0',
            state         : '0',
            store         : _data.storeName,
            street        : _data.destAddress || '',
            total         : totalStr,
            trackorder    : '0',
            username      : user.username || user.email || '',
            vault         : '0',
            // Extra fields for external orders
            externalOrder : '1',
            storeAddress  : _data.storeAddress,
            storeLat      : _data.storeLat  ? String(_data.storeLat) : '',
            storeLng      : _data.storeLng  ? String(_data.storeLng) : '',
            storePhone    : _data.storePhone || '',
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
                    `🧾 ${cartLines}\n` +
                    `💵 السعر التقريبي: ${totalStr}\n` +
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
        const backBtn = document.getElementById('ext-btn-back');

        backBtn.style.display = 'none';
        nextBtn.textContent   = '✕ إغلاق';
        nextBtn.onclick       = _closeModal;

        content.innerHTML = `
        <div style="text-align:center;padding:30px 0 10px;">
            <div style="font-size:3.5rem;margin-bottom:14px;animation:extPop .4s cubic-bezier(.2,1.4,.5,1) both;">✅</div>
            <div style="font-size:1.15rem;font-weight:900;color:#fff;margin-bottom:8px;">تم إرسال طلبك!</div>
            <div style="font-size:0.8rem;color:rgba(255,255,255,0.45);line-height:1.7;max-width:280px;margin:0 auto;">
                رقم طلبك: <strong style="color:var(--orange,#ff5c00);">${requestKey.replace('id_','#')}</strong><br>
                سيتواصل معك فريق Delivo قريباً لتأكيد التفاصيل ورسوم التوصيل.
            </div>
            <div style="margin-top:20px;padding:14px 18px;background:rgba(255,92,0,0.08);border:1px solid rgba(255,92,0,0.2);border-radius:14px;text-align:right;">
                <div style="font-size:0.72rem;font-weight:800;color:rgba(255,255,255,0.5);margin-bottom:8px;">ملخص الطلب</div>
                <div style="font-size:0.82rem;color:rgba(255,255,255,0.75);">🏪 ${_esc(_data.storeName)}</div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-top:4px;">💵 ${_esc(_data.approxTotal)} ${_currency === 'USD' ? '$' : 'ل.ل'}</div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-top:4px;">🏠 ${_esc(_data.destAddress || '—')}</div>
            </div>
        </div>`;

        // Update step bar to all done
        _step = 5;
        _updateStepBar();
    }

    /* ═══════════════════════════════════════════════════════
       MAP PICKER
    ═══════════════════════════════════════════════════════ */
    function _pickMap(target) {
        _mapTarget  = target;
        const modal = document.getElementById('ext-map-modal');
        const title = document.getElementById('ext-map-title');
        title.textContent = target === 'store' ? '📍 موقع المتجر' : '🏠 موقع التوصيل';
        modal.style.display = 'flex';
        requestAnimationFrame(async () => {
            await _ensureLeafletLoaded();
            // Init or reuse map
            const mapEl = document.getElementById('ext-map-leaflet');
            const existingLat = target === 'store' ? (_data.storeLat || 33.8547) : (_data.destLat || 33.8547);
            const existingLng = target === 'store' ? (_data.storeLng || 36.2185) : (_data.destLng || 36.2185);

            if (!_mapInstance) {
                _mapInstance = L.map('ext-map-leaflet', { zoomControl: true }).setView([existingLat, existingLng], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19,
                }).addTo(_mapInstance);

                const icon = L.divIcon({
                    className: '',
                    html: '<div style="font-size:2rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">📍</div>',
                    iconSize: [36, 36], iconAnchor: [18, 36],
                });
                _mapMarker = L.marker([existingLat, existingLng], { draggable: true, icon }).addTo(_mapInstance);
                _mapInstance.on('click', e => _mapMarker.setLatLng(e.latlng));
            } else {
                _mapInstance.setView([existingLat, existingLng], 14);
                _mapMarker.setLatLng([existingLat, existingLng]);
                setTimeout(() => _mapInstance.invalidateSize(), 100);
            }
            setTimeout(() => _mapInstance.invalidateSize(), 200);
        });
    }

    function _mapConfirm() {
        const ll = _mapMarker.getLatLng();
        if (_mapTarget === 'store') {
            _data.storeLat = ll.lat;
            _data.storeLng = ll.lng;
            if (!_data.storeAddress) _data.storeAddress = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
        } else {
            _data.destLat = ll.lat;
            _data.destLng = ll.lng;
            if (!_data.destAddress) _data.destAddress = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
        }
        document.getElementById('ext-map-modal').style.display = 'none';
        _renderStep(); // re-render to show coordinate badge
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
    window._extNext       = _next;
    window._extBack       = _back;
    window._extPickMap    = _pickMap;
    window._extMapConfirm = _mapConfirm;
    window._extMapCancel  = _mapCancel;

    // Expose _data for inline onchange handlers
    window._data = _data;

})();