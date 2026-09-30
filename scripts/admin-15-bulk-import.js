/* ============================================================
   scripts/admin-15-bulk-import.js
   "📥 استيراد جماعي" — bulk tools for the currently-open store in
   Admin → المنتجات. Two tabs inside one modal:

   1) 📊 المنتجات من Excel
      • Reads .xlsx (ExcelJS, already loaded by admin.html) or .csv
      • Header row is auto-detected (Arabic or English column names)
      • Every row is classified BEFORE anything is written:
          جديد / تحديث / بدون تغيير / مكرر / خطأ
      • Existing items are matched by ID column, else by product name
        (Arabic-normalised: hamza/ya/ta-marbuta/tashkeel-insensitive)
      • Updates only touch the cells that are filled in the sheet —
        an empty cell never wipes an existing value
      • New items with no ID get the next numeric ID after the highest
        one in Firebase across ALL stores (same rule as the single
        "إضافة منتج" form — images live in one shared items2/ folder)
      • Respects an active "سعر إضافي": a new price goes to basePrice
        and price = basePrice + extraPrice, same as catApplyExtraPrice
      • Downloadable blank template + export of the store's current
        items in the same format (edit → re-import round trip)

   2) 🖼 صور المنتجات
      • Accepts a whole folder (picker or drag & drop, sub-folders
        included) or individual image files
      • Matches each file name to a product: exact ID → exact
        normalised name → close/fuzzy name (flagged for review)
      • Each match can be reassigned manually or excluded
      • Resizes (default max 1200px, EXIF-orientation aware), converts
        to WebP, and uploads to GitHub as items2/{id}.webp through the
        existing adminUploadImage Cloud Function (_adminUploadImage)
      • Uploads run ONE at a time — every upload is a GitHub commit on
        the same branch, and parallel commits collide (409) — with
        automatic retries, live progress/ETA, cancel, and "retry failed"
      • On success sets pngExist = "1" + imgUpdatedAt on that item so
        the storefront shows the new image straight away

   Depends on globals from admin-04 / admin-10:
     _catCurrentStore, _catAllItems, _renderCatalogItems, fbGet,
     fbUpdate, showNotif, showConfirm, _adminUploadImage,
     ITEM_GH_FOLDER, _cpiLocalImagePreview
   ============================================================ */
(function () {
    'use strict';

    const EXCELJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    const IMG_EXT     = /\.(jpe?g|jfif|png|webp|gif|bmp|avif)$/i;
    const HEIC_EXT    = /\.(heic|heif)$/i;
    const SAFE_ID     = /^[A-Za-z0-9_-]+$/;   // must match adminUploadImage's filename rule
    const WRITE_CHUNK = 400;                  // rows per multi-path PATCH
    const MAX_IMG_MB  = 30;

    /* ── Column definitions (order = template order) ───────────── */
    const FIELDS = [
        { key: 'name',     label: 'اسم المنتج',    width: 32, required: true },
        { key: 'price',    label: 'السعر',          width: 14 },
        { key: 'sale',     label: 'سعر بعد الخصم', width: 16 },
        { key: 'catmain',  label: 'القسم الرئيسي', width: 22 },
        { key: 'cat',      label: 'القسم الفرعي',  width: 22 },
        { key: 'unitdesc', label: 'الوصف',          width: 36 },
        { key: 'id',       label: 'ID',             width: 12 },
    ];

    // Header aliases — compared after _normName(). Exact match wins first.
    // Otherwise the header is matched by "contains", and the LONGEST alias
    // found anywhere wins — so "item price" → price, "offer price" → sale,
    // "sub category" → cat. Generic words (item/product/name…) only ever
    // count as an exact match, never inside a longer header.
    const HEADER_ALIASES = {
        id:       ['id', 'ال id', 'رقم المنتج', 'الرقم', 'الكود', 'كود', 'code', 'sku', 'item id', 'product id'],
        sale:     ['سعر بعد الخصم', 'سعر الخصم', 'الخصم', 'خصم', 'سعر العرض', 'العرض', 'sale', 'sale price', 'discount', 'discount price', 'discounted price', 'price after discount', 'offer', 'offer price', 'item offer price', 'special price'],
        cat:      ['القسم الفرعي', 'الفئه الفرعيه', 'التصنيف الفرعي', 'cat', 'subcat', 'subcategory', 'sub category', 'sub cat', 'category sub'],
        catmain:  ['القسم الرئيسي', 'القسم', 'الفئه', 'التصنيف', 'catmain', 'category', 'main category', 'category main', 'main cat'],
        name:     ['اسم المنتج', 'الاسم', 'اسم', 'المنتج', 'اسم الصنف', 'الصنف', 'name', 'item', 'item name', 'product', 'product name', 'title'],
        price:    ['السعر', 'سعر', 'السعر الاصلي', 'price', 'item price', 'product price', 'unit price', 'original price', 'cost'],
        unitdesc: ['الوصف', 'وصف', 'التفاصيل', 'unitdesc', 'description', 'desc', 'details'],
    };

    /* ── State ─────────────────────────────────────────────────── */
    const S = {
        tab: 'excel',
        storeName: '',
        excel: { fileName: '', rows: [], mode: 'upsert', allowDupNames: false, filter: 'all', busy: false, done: null, error: '' },
        img:   { entries: [], filter: 'all', busy: false, cancel: false, maxDim: 1200, skipExisting: false,
                 progress: null, done: null },
    };
    let _global = null;          // { idToStore: Map(lowerId → store), maxNum }
    let _itemOptIndex = new Map(); // datalist option text → item key

    /* ══════════════════════════════════════════════════════════
       TEXT HELPERS
    ══════════════════════════════════════════════════════════ */
    function _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _latinDigits(s) {
        return String(s ?? '')
            .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
            .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
    }
    // Arabic-aware name normaliser used for ALL matching (headers,
    // Excel rows ↔ items, image files ↔ items).
    function _normName(s) {
        return _latinDigits(s).toLowerCase()
            .replace(/[ً-ٰٟـ]/g, '')   // tashkeel + tatweel
            .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
            .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    // File name → candidate product name: drop extension and the usual
    // copy/duplicate suffixes Windows & phones add.
    function _fileBase(name) {
        return String(name).replace(/\.[^.]+$/, '')
            .replace(/\s*-\s*(copy|نسخة)(\s*\(\d+\))?$/i, '')
            .replace(/\s*\(\d+\)$/, '')
            .replace(/\s+copy$/i, '')
            .trim();
    }
    // Sørensen–Dice on character bigrams (spaces removed) — robust to
    // small typos / word-order noise, cheap enough for thousands of pairs.
    function _bigrams(s) {
        const t = s.replace(/\s+/g, '');
        const m = new Map();
        for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
        return { m, n: Math.max(t.length - 1, 0) };
    }
    function _dice(a, b) {
        if (!a.n || !b.n) return 0;
        let hit = 0;
        for (const [g, c] of a.m) { const o = b.m.get(g); if (o) hit += Math.min(c, o); }
        return (2 * hit) / (a.n + b.n);
    }
    // "75,000" / "٧٥٠٠٠" / "$ 3.5" / "75000 ل.ل" → number | null (empty) | NaN (bad)
    function _parseNum(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return isFinite(v) ? v : NaN;
        let s = _latinDigits(v).trim();
        if (!s) return null;
        s = s.replace(/٫/g, '.').replace(/[٬,\s]/g, '').replace(/(ل\.?ل\.?|lbp|ll|usd|\$)/gi, '');
        if (!s) return null;
        const n = Number(s);
        return isFinite(n) ? n : NaN;
    }
    function _num0(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function _clean(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
    function _hasBase(it) { return it && it.basePrice !== undefined && it.basePrice !== null && it.basePrice !== ''; }
    function _fmtNum(n) { return (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('en-US'); }
    function _itemId(key, it) { return String((it && (it.ID ?? it.id)) || key || ''); }

    /* ══════════════════════════════════════════════════════════
       DATA ACCESS
    ══════════════════════════════════════════════════════════ */
    function _storeItems() {
        return Object.entries(typeof _catAllItems === 'object' && _catAllItems ? _catAllItems : {})
            .filter(([, it]) => it && typeof it === 'object');
    }

    // Every ID across every store (items2/ is one shared folder) + the
    // highest purely-numeric one, so new IDs continue after it.
    async function _loadGlobal(force) {
        if (_global && !force) return _global;
        const all = await fbGet('items').catch(() => null) || {};
        const idToStore = new Map();
        let maxNum = 0;
        for (const [store, items] of Object.entries(all)) {
            if (!items || typeof items !== 'object') continue;
            for (const [key, it] of Object.entries(items)) {
                const ids = [key, it && typeof it === 'object' ? (it.ID ?? it.id) : null]
                    .filter(v => v !== null && v !== undefined && v !== '').map(v => String(v).trim());
                for (const id of ids) {
                    const low = id.toLowerCase();
                    if (!idToStore.has(low)) idToStore.set(low, store);
                    if (/^\d+$/.test(id)) maxNum = Math.max(maxNum, parseInt(id, 10));
                }
            }
        }
        _global = { idToStore, maxNum };
        return _global;
    }

    // name / id → store item lookups for the open store
    function _storeIndex() {
        const byId = new Map(), byName = new Map();
        for (const [key, it] of _storeItems()) {
            byId.set(String(key).toLowerCase(), key);
            const id = _itemId(key, it).toLowerCase();
            if (id) byId.set(id, key);
            const nn = _normName(it.name);
            if (nn) { if (!byName.has(nn)) byName.set(nn, []); byName.get(nn).push(key); }
        }
        return { byId, byName };
    }

    async function _ensureExcelJS() {
        if (typeof ExcelJS !== 'undefined') return;
        await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = EXCELJS_CDN; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل مكتبة Excel'));
            document.head.appendChild(s);
        });
    }

    /* ══════════════════════════════════════════════════════════
       MODAL SHELL
    ══════════════════════════════════════════════════════════ */
    function openBulkImport(tab) {
        if (typeof _catCurrentStore === 'undefined' || !_catCurrentStore) {
            showNotif('اختر متجراً أولاً', 'افتح منتجات متجر ثم استخدم الاستيراد الجماعي', 'error');
            return;
        }
        if (S.storeName !== _catCurrentStore.name) _resetState();
        S.storeName = _catCurrentStore.name;
        if (tab) S.tab = tab;

        document.getElementById('bi-overlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'bi-overlay';
        ov.className = 'bi-overlay';
        ov.innerHTML = `
        <div class="bi-modal" role="dialog" aria-modal="true" aria-labelledby="bi-title">
            <div class="bi-head">
                <div class="bi-head__icon">📥</div>
                <div class="bi-head__text">
                    <div class="bi-head__title" id="bi-title">استيراد جماعي</div>
                    <div class="bi-head__sub">${_esc(S.storeName)} · <span id="bi-head-count">${_storeItems().length}</span> منتج</div>
                </div>
                <button type="button" class="bi-iconbtn" data-act="close" title="إغلاق">✕</button>
            </div>
            <div class="bi-tabs" role="tablist">
                <button type="button" class="bi-tab" data-tab="excel" role="tab">📊 المنتجات من Excel</button>
                <button type="button" class="bi-tab" data-tab="images" role="tab">🖼 صور المنتجات</button>
            </div>
            <div class="bi-body" id="bi-body"></div>
            <div class="bi-foot" id="bi-foot"></div>
        </div>
        <input type="file" id="bi-excel-input" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
        <input type="file" id="bi-folder-input" webkitdirectory directory multiple hidden>
        <input type="file" id="bi-files-input" accept="image/*,.heic,.heif" multiple hidden>`;
        document.body.appendChild(ov);

        ov.addEventListener('click', _onClick);
        ov.addEventListener('change', _onChange);
        ov.addEventListener('input', _onInput);
        ov.addEventListener('dragover', _onDragOver);
        ov.addEventListener('dragleave', _onDragLeave);
        ov.addEventListener('drop', _onDrop);
        document.addEventListener('keydown', _onKey);
        _render();
    }

    function _resetState() {
        _revokeThumbs();
        S.excel = { fileName: '', rows: [], mode: 'upsert', allowDupNames: false, filter: 'all', busy: false, done: null, error: '' };
        S.img   = { entries: [], filter: 'all', busy: false, cancel: false, maxDim: 1200, skipExisting: false, progress: null, done: null };
        _global = null;
    }

    async function _close() {
        if (S.excel.busy || S.img.busy) {
            const ok = await showConfirm({ title: 'العملية قيد التنفيذ', msg: 'سيتم إيقاف العملية بعد العنصر الحالي. هل تريد الإغلاق؟', type: 'warning', okLabel: 'إيقاف وإغلاق', icon: '⏸' });
            if (!ok) return;
            S.img.cancel = true;
        }
        document.getElementById('bi-overlay')?.remove();
        document.removeEventListener('keydown', _onKey);
    }

    function _onKey(e) {
        if (e.key === 'Escape' && document.getElementById('bi-overlay') && !document.getElementById('confirm-overlay')?.classList.contains('open')) _close();
    }

    function _render() {
        const ov = document.getElementById('bi-overlay');
        if (!ov) return;
        ov.querySelectorAll('.bi-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.tab));
        const cnt = document.getElementById('bi-head-count');
        if (cnt) cnt.textContent = _storeItems().length;
        const body = document.getElementById('bi-body');
        const foot = document.getElementById('bi-foot');
        const keepScroll = body.querySelector('.bi-tablewrap')?.scrollTop || 0;
        if (S.tab === 'excel') { body.innerHTML = _excelBody(); foot.innerHTML = _excelFoot(); }
        else                   { body.innerHTML = _imgBody();   foot.innerHTML = _imgFoot(); }
        const tw = body.querySelector('.bi-tablewrap');
        if (tw && keepScroll) tw.scrollTop = keepScroll;
    }

    /* ── Event delegation ──────────────────────────────────────── */
    function _onClick(e) {
        const ov = e.currentTarget;
        if (e.target === ov) { _close(); return; }
        const tabBtn = e.target.closest('.bi-tab');
        if (tabBtn) {
            if (S.excel.busy || S.img.busy) { showNotif('انتظر انتهاء العملية الحالية', '', 'error'); return; }
            S.tab = tabBtn.dataset.tab; _render(); return;
        }
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled) return;
        const act = el.dataset.act;
        switch (act) {
            case 'close':          _close(); break;
            case 'pick-excel':     document.getElementById('bi-excel-input').click(); break;
            case 'template':       _downloadTemplate(false); break;
            case 'export':         _downloadTemplate(true); break;
            case 'excel-reset':    S.excel.rows = []; S.excel.fileName = ''; S.excel.header = null; S.excel.done = null; S.excel.error = ''; _render(); break;
            case 'excel-filter':   S.excel.filter = el.dataset.f; _render(); break;
            case 'excel-import':   _excelCommit(); break;
            case 'goto-images':    S.tab = 'images'; _render(); break;
            case 'goto-excel':     S.tab = 'excel'; _render(); break;
            case 'pick-folder':    document.getElementById('bi-folder-input').click(); break;
            case 'pick-files':     document.getElementById('bi-files-input').click(); break;
            case 'img-reset':      _revokeThumbs(); S.img.entries = []; S.img.done = null; S.img.progress = null; _render(); break;
            case 'img-filter':     S.img.filter = el.dataset.f; _render(); break;
            case 'img-select-all': S.img.entries.forEach(en => { if (_canInclude(en)) en.include = true; }); _render(); break;
            case 'img-select-none':S.img.entries.forEach(en => en.include = false); _render(); break;
            case 'img-upload':     _imgUpload(false); break;
            case 'img-retry':      _imgUpload(true); break;
            case 'img-cancel':     S.img.cancel = true; el.disabled = true; el.textContent = '⏳ جاري الإيقاف…'; break;
            case 'img-unassign': {
                const en = S.img.entries[+el.dataset.i]; if (!en) break;
                _assign(en, null, 'manual-none'); _resolveConflicts(); _render(); break;
            }
        }
    }

    function _onChange(e) {
        const t = e.target;
        if (t.id === 'bi-excel-input') { const f = t.files[0]; t.value = ''; if (f) _excelLoadFile(f); return; }
        if (t.id === 'bi-folder-input' || t.id === 'bi-files-input') {
            const files = [...t.files]; t.value = '';
            _imgAddFiles(files.map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
            return;
        }
        if (t.name === 'bi-mode') { S.excel.mode = t.value; if (S.excel.rows.length) _excelClassify(); _render(); return; }
        if (t.id === 'bi-allow-dup') { S.excel.allowDupNames = t.checked; if (S.excel.rows.length) _excelClassify(); _render(); return; }
        if (t.id === 'bi-maxdim') { S.img.maxDim = t.value === 'orig' ? 0 : +t.value; return; }
        if (t.id === 'bi-skip-existing') {
            S.img.skipExisting = t.checked;
            S.img.entries.forEach(en => { if (en.itemKey) en.include = _defaultInclude(en); });
            _render(); return;
        }
        if (t.classList.contains('bi-inc')) { const en = S.img.entries[+t.dataset.i]; if (en) en.include = t.checked && _canInclude(en); _renderImgCounters(); return; }
        if (t.classList.contains('bi-assign')) {
            const en = S.img.entries[+t.dataset.i]; if (!en) return;
            const v = t.value.trim();
            if (!v) { _assign(en, null, 'manual-none'); }
            else if (_itemOptIndex.has(v)) { _assign(en, _itemOptIndex.get(v), 'manual'); }
            else { showNotif('منتج غير موجود', 'اختر منتجاً من القائمة المقترحة', 'error'); t.value = en.itemKey ? _optText(en.itemKey) : ''; return; }
            _resolveConflicts(); _render();
        }
    }
    function _onInput() { /* reserved — datalist commits on change */ }

    function _onDragOver(e) {
        const dz = e.target.closest('.bi-drop, .bi-drop--table');
        if (!dz) return;
        e.preventDefault(); dz.classList.add('bi-drop--over');
    }
    function _onDragLeave(e) { e.target.closest('.bi-drop, .bi-drop--table')?.classList.remove('bi-drop--over'); }
    async function _onDrop(e) {
        const dz = e.target.closest('.bi-drop, .bi-drop--table');
        if (!dz) return;
        e.preventDefault(); dz.classList.remove('bi-drop--over');
        if (S.excel.busy || S.img.busy) return;
        if (dz.dataset.kind === 'excel') {
            const f = e.dataTransfer.files[0]; if (f) _excelLoadFile(f);
        } else {
            const list = await _collectDropped(e.dataTransfer);
            _imgAddFiles(list);
        }
    }
    // Walks dropped folders recursively (Chrome/Edge/Firefox entries API)
    async function _collectDropped(dt) {
        const out = [];
        const items = [...(dt.items || [])];
        const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        if (!entries.length) return [...dt.files].map(f => ({ file: f, path: f.name }));
        const walk = async (entry, prefix) => {
            if (entry.isFile) {
                const f = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null);
                if (f) out.push({ file: f, path: prefix + f.name });
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                let batch;
                do {
                    batch = await new Promise(res => reader.readEntries(res, () => res([])));
                    for (const ch of batch) await walk(ch, prefix + entry.name + '/');
                } while (batch.length);
            }
        };
        for (const en of entries) await walk(en, '');
        return out;
    }

    /* ══════════════════════════════════════════════════════════
       TAB 1 — EXCEL
    ══════════════════════════════════════════════════════════ */
    function _excelBody() {
        const X = S.excel;
        if (X.done) return _excelDoneView();
        if (!X.rows.length) {
            return `
            <div class="bi-grid2">
                <div class="bi-drop" data-kind="excel" data-act="pick-excel" tabindex="0">
                    <div class="bi-drop__icon">📊</div>
                    <div class="bi-drop__title">اسحب ملف Excel هنا أو اضغط للاختيار</div>
                    <div class="bi-drop__hint">.xlsx أو .csv — الصف الأول يحتوي أسماء الأعمدة</div>
                    ${X.error ? `<div class="bi-alert bi-alert--err">${_esc(X.error)}</div>` : ''}
                </div>
                <div class="bi-side">
                    <div class="bi-card">
                        <div class="bi-card__title">📄 الأعمدة المدعومة</div>
                        <div class="bi-cols">
                            ${FIELDS.map(f => `<span class="bi-colchip${f.required ? ' bi-colchip--req' : ''}">${f.label}${f.required ? ' *' : ''}</span>`).join('')}
                        </div>
                        <div class="bi-muted">الأسماء بالعربية أو الإنجليزية (name, price, sale, catmain, cat, unitdesc, id) — ترتيب الأعمدة غير مهم.</div>
                        <div class="bi-row">
                            <button type="button" class="bi-btn bi-btn--ghost" data-act="template">⬇ قالب فارغ</button>
                            <button type="button" class="bi-btn bi-btn--ghost" data-act="export" ${_storeItems().length ? '' : 'disabled'}>⬇ تصدير منتجات المتجر</button>
                        </div>
                    </div>
                    <div class="bi-card">
                        <div class="bi-card__title">⚙️ طريقة الاستيراد</div>
                        ${_modeRadios()}
                        ${_dupNameOpt()}
                    </div>
                    <div class="bi-card bi-card--info">
                        <ul class="bi-rules">
                            <li>يُطابَق المنتج الموجود عبر عمود <b>ID</b>، وإن لم يوجد فعبر <b>اسم المنتج</b>.</li>
                            <li>عند التحديث تُستبدل فقط الخانات المعبّأة — الخانة الفارغة لا تمسح أي قيمة.</li>
                            <li>المنتج الجديد بدون ID يأخذ رقماً تلقائياً بعد آخر رقم في النظام.</li>
                            <li>لا يُكتب أي شيء قبل مراجعة المعاينة والضغط على «استيراد».</li>
                        </ul>
                    </div>
                </div>
            </div>`;
        }

        const counts = _excelCounts();
        const rows = X.rows.filter(r => X.filter === 'all' || r.status === X.filter);
        const LIMIT = 1500;
        return `
        <div class="bi-toolbar">
            <div class="bi-file">📄 <b>${_esc(X.fileName)}</b> <span class="bi-muted">· ${X.rows.length} صف</span></div>
            <div class="bi-modebar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${_modeRadios(true)}${_dupNameOpt(true)}</div>
        </div>
        ${_detectedColsHtml()}
        <div class="bi-chips">
            ${_chip('excel-filter', 'all',    'الكل',        X.rows.length, X.filter)}
            ${_chip('excel-filter', 'new',    'جديد',        counts.new,    X.filter, 'green')}
            ${_chip('excel-filter', 'update', 'تحديث',       counts.update, X.filter, 'blue')}
            ${_chip('excel-filter', 'same',   'بدون تغيير', counts.same,   X.filter, 'gray')}
            ${_chip('excel-filter', 'skip',   'متجاهل',      counts.skip,   X.filter, 'gray')}
            ${_chip('excel-filter', 'dup',    'مكرر',        counts.dup,    X.filter, 'yellow')}
            ${_chip('excel-filter', 'error',  'أخطاء',       counts.error,  X.filter, 'red')}
        </div>
        <div class="bi-tablewrap">
            <table class="bi-table">
                <thead><tr>
                    <th>صف</th><th>الحالة</th><th>اسم المنتج</th><th>السعر</th><th>الخصم</th>
                    <th>القسم الرئيسي</th><th>القسم الفرعي</th><th>الوصف</th><th>ID</th><th>ملاحظات</th>
                </tr></thead>
                <tbody>
                ${rows.slice(0, LIMIT).map(_excelRowHtml).join('') ||
                    `<tr><td colspan="10" class="bi-empty">لا توجد صفوف بهذا التصنيف</td></tr>`}
                </tbody>
            </table>
            ${rows.length > LIMIT ? `<div class="bi-muted bi-pad">يتم عرض أول ${LIMIT} صف فقط — سيتم استيراد الجميع.</div>` : ''}
        </div>`;
    }

    // "Which sheet column went where" — makes a mis-named header obvious
    // at a glance instead of silently leaving a field empty.
    function _detectedColsHtml() {
        const h = S.excel.header;
        if (!h) return '';
        const chips = FIELDS.map(f => {
            const lbl = h.labels[f.key];
            return lbl
                ? `<span class="bi-colchip bi-colchip--ok" title="عمود في الملف: ${_esc(lbl)}">✓ ${f.label} ← <bdi>${_esc(lbl)}</bdi></span>`
                : `<span class="bi-colchip bi-colchip--miss">✕ ${f.label}</span>`;
        }).join('');
        const ign = h.ignored.length
            ? `<div class="bi-small bi-warn">⚠️ أعمدة لم يتم التعرّف عليها وتم تجاهلها: ${h.ignored.map(t => `<bdi>«${_esc(t)}»</bdi>`).join('، ')}</div>` : '';
        return `<div class="bi-detected"><span class="bi-muted">الأعمدة المكتشفة:</span> ${chips}${ign}</div>`;
    }

    function _modeRadios(compact) {
        const m = S.excel.mode;
        return `
        <div class="bi-seg${compact ? ' bi-seg--sm' : ''}">
            <label><input type="radio" name="bi-mode" value="upsert" ${m === 'upsert' ? 'checked' : ''}><span>إضافة الجديد + تحديث الموجود</span></label>
            <label><input type="radio" name="bi-mode" value="new"    ${m === 'new' ? 'checked' : ''}><span>إضافة الجديد فقط</span></label>
        </div>`;
    }

    // Same product name allowed in different categories (e.g. «قالب 20 سنتم»
    // under two sub-categories). Rows are then told apart by name + category.
    function _dupNameOpt(compact) {
        return `<label class="bi-opt bi-opt--dup" style="${compact ? '' : 'margin-top:10px;'}" title="نفس الاسم يُعتبر منتجاً مختلفاً إذا اختلف القسم الرئيسي أو الفرعي">
            <input type="checkbox" id="bi-allow-dup" ${S.excel.allowDupNames ? 'checked' : ''}> السماح بتكرار اسم المنتج في أقسام مختلفة</label>`;
    }

    function _chip(act, f, label, n, cur, color) {
        if (f !== 'all' && !n) return '';
        return `<button type="button" class="bi-chip${cur === f ? ' active' : ''}${color ? ' bi-chip--' + color : ''}" data-act="${act}" data-f="${f}">${label} <b>${n}</b></button>`;
    }

    const EXCEL_BADGE = {
        new: ['جديد', 'green'], update: ['تحديث', 'blue'], same: ['بدون تغيير', 'gray'],
        skip: ['متجاهل', 'gray'], dup: ['مكرر', 'yellow'], error: ['خطأ', 'red'],
    };
    function _excelRowHtml(r) {
        const [bl, bc] = EXCEL_BADGE[r.status] || ['—', 'gray'];
        const cell = (f, val) => {
            const changed = r.status === 'update' && r.changes && Object.prototype.hasOwnProperty.call(r.changes, f);
            const old = changed ? r.oldVals[f] : null;
            return `<td class="${changed ? 'bi-chg' : ''}" ${changed ? `title="القيمة الحالية: ${_esc(old === '' || old == null ? '—' : old)}"` : ''}>${val}</td>`;
        };
        const idCell = r.status === 'new'
            ? `<span class="bi-mono">${_esc(r.targetId)}</span>${r.autoId ? ' <span class="bi-tag">تلقائي</span>' : ''}`
            : `<span class="bi-mono">${_esc(r.targetId || r.id || '')}</span>`;
        return `<tr class="bi-tr--${r.status}">
            <td class="bi-muted">${r.rowNum}</td>
            <td><span class="bi-badge bi-badge--${bc}">${bl}</span></td>
            ${cell('name', _esc(r.name) || '<span class="bi-muted">—</span>')}
            ${cell('price', r.price === null ? '' : (isNaN(r.price) ? `<span class="bi-err">${_esc(r.rawPrice)}</span>` : _fmtNum(r.price)))}
            ${cell('sale', r.sale === null ? '' : (isNaN(r.sale) ? `<span class="bi-err">${_esc(r.rawSale)}</span>` : _fmtNum(r.sale)))}
            ${cell('catmain', _esc(r.catmain))}
            ${cell('cat', _esc(r.cat))}
            ${cell('unitdesc', r.unitdesc ? `<div class="bi-desc" title="${_esc(r.unitdesc)}">${_esc(r.unitdesc)}</div>` : '')}
            <td>${idCell}</td>
            <td class="bi-note">${_esc(r.note || '')}</td>
        </tr>`;
    }

    function _excelFoot() {
        const X = S.excel;
        if (X.done) {
            return `<div class="bi-foot__spacer"></div>
                <button type="button" class="bi-btn bi-btn--ghost" data-act="excel-reset">📄 استيراد ملف آخر</button>
                <button type="button" class="bi-btn bi-btn--primary" data-act="goto-images">🖼 رفع صور المنتجات ←</button>`;
        }
        if (!X.rows.length) return `<div class="bi-foot__spacer"></div><button type="button" class="bi-btn bi-btn--ghost" data-act="close">إغلاق</button>`;
        const c = _excelCounts();
        const n = c.new + c.update;
        return `
            <button type="button" class="bi-btn bi-btn--ghost" data-act="excel-reset" ${X.busy ? 'disabled' : ''}>↺ تغيير الملف</button>
            <div class="bi-foot__spacer"></div>
            ${c.error ? `<span class="bi-foot__warn">⚠️ ${c.error} صف فيه أخطاء لن يُستورد</span>` : ''}
            <button type="button" class="bi-btn bi-btn--primary" data-act="excel-import" id="bi-excel-go" ${!n || X.busy ? 'disabled' : ''}>
                ${X.busy ? '⏳ جاري الاستيراد…' : `✅ استيراد ${n} منتج`}
            </button>`;
    }

    (function _injectDescStyle() {
        if (document.getElementById('bi-desc-style')) return;
        const st = document.createElement('style');
        st.id = 'bi-desc-style';
        st.textContent = '.bi-desc{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}';
        document.head.appendChild(st);
    })();

    function _excelDoneView() {
        const d = S.excel.done;
        return `
        <div class="bi-result">
            <div class="bi-result__icon">✅</div>
            <div class="bi-result__title">تم الاستيراد بنجاح</div>
            <div class="bi-stats">
                <div class="bi-stat bi-stat--green"><b>${d.added}</b><span>منتج جديد</span></div>
                <div class="bi-stat bi-stat--blue"><b>${d.updated}</b><span>منتج محدّث</span></div>
                <div class="bi-stat"><b>${d.skipped}</b><span>لم يتغيّر / متجاهل</span></div>
                ${d.errors ? `<div class="bi-stat bi-stat--red"><b>${d.errors}</b><span>صف فيه أخطاء</span></div>` : ''}
            </div>
            ${d.idRange ? `<div class="bi-muted">أرقام المنتجات الجديدة: <b>${d.idRange}</b></div>` : ''}
            <div class="bi-muted">الخطوة التالية: ارفع مجلد صور المنتجات ليتم ربطها تلقائياً بالأسماء.</div>
        </div>`;
    }

    function _excelCounts() {
        const c = { new: 0, update: 0, same: 0, skip: 0, dup: 0, error: 0 };
        S.excel.rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
        return c;
    }

    /* ── Reading the file ───────────────────────────────────────── */
    async function _excelLoadFile(file) {
        const X = S.excel;
        X.error = ''; X.done = null;
        const name = file.name || 'file';
        if (/\.xls$/i.test(name)) { X.error = 'صيغة ‎.xls‎ القديمة غير مدعومة — افتح الملف في Excel واحفظه بصيغة ‎.xlsx‎'; _render(); return; }
        if (!/\.(xlsx|csv)$/i.test(name)) { X.error = 'يُقبل فقط ملف ‎.xlsx‎ أو ‎.csv‎'; _render(); return; }

        const body = document.getElementById('bi-body');
        if (body) body.innerHTML = `<div class="bi-loading"><div class="bi-spin"></div>جاري قراءة الملف والتحقق من المنتجات…</div>`;
        try {
            const matrix = /\.csv$/i.test(name) ? await _readCsv(file) : await _readXlsx(file);
            const parsed = _matrixToRows(matrix);
            if (parsed.error) { X.error = parsed.error; X.rows = []; _render(); return; }
            if (!parsed.rows.length) { X.error = 'لم يتم العثور على أي صف بيانات تحت صف العناوين'; _render(); return; }
            await _loadGlobal(true);
            X.fileName = name;
            X.header = parsed.header;
            X.rows = parsed.rows;
            X.filter = 'all';
            _excelClassify();
            _render();
        } catch (e) {
            console.error('[bulk-import] excel read', e);
            X.error = 'تعذّرت قراءة الملف: ' + (e.message || e);
            X.rows = [];
            _render();
        }
    }

    async function _readXlsx(file) {
        await _ensureExcelJS();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        // First visible sheet whose header row can be recognised
        const sheets = wb.worksheets.filter(ws => ws.state !== 'hidden' && ws.state !== 'veryHidden');
        let fallback = null;
        for (const ws of sheets) {
            const m = [];
            ws.eachRow({ includeEmpty: true }, (row, n) => {
                const vals = [];
                row.eachCell({ includeEmpty: true }, (cell, c) => { vals[c - 1] = _cellStr(cell.value); });
                m[n - 1] = vals;
            });
            const mm = Array.from(m, r => r || []);
            if (!fallback) fallback = mm;
            if (_findHeader(mm)) return mm;
        }
        return fallback || [];
    }
    function _cellStr(v) {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'object') {
            if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
            if ('result' in v) return _cellStr(v.result);
            if ('text' in v) return _cellStr(v.text);
            return '';
        }
        return typeof v === 'number' ? v : String(v).trim();
    }

    async function _readCsv(file) {
        const buf = await file.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buf);
        // Arabic CSVs saved by older Excel are often Windows-1256
        if ((text.match(/�/g) || []).length > 3) {
            try { text = new TextDecoder('windows-1256').decode(buf); } catch (_) { /* keep utf-8 */ }
        }
        text = text.replace(/^﻿/, '');
        const first = text.split(/\r?\n/, 1)[0] || '';
        const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const rows = []; let row = [], cur = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) {
                if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
                else cur += ch;
            } else if (ch === '"') q = true;
            else if (ch === delim) { row.push(cur.trim()); cur = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(cur.trim()); rows.push(row); row = []; cur = '';
            } else cur += ch;
        }
        if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row); }
        return rows;
    }

    const GENERIC_ALIASES = new Set(['item', 'product', 'name', 'title', 'اسم', 'المنتج', 'الصنف', 'cat', 'cost']);
    function _headerField(txt) {
        const n = _normName(txt);
        if (!n) return null;
        for (const [f, al] of Object.entries(HEADER_ALIASES)) if (al.some(a => _normName(a) === n)) return f;
        // Whole-word containment, longest alias wins
        const padded = ` ${n} `;
        let best = null, bestLen = 0;
        for (const [f, al] of Object.entries(HEADER_ALIASES)) {
            for (const a of al) {
                const na = _normName(a);
                if (na.length < 3 || GENERIC_ALIASES.has(na)) continue;
                if (padded.includes(` ${na} `) && na.length > bestLen) { best = f; bestLen = na.length; }
            }
        }
        return best;
    }
    function _findHeader(m) {
        for (let r = 0; r < Math.min(m.length, 10); r++) {
            const cols = {};
            const ignored = [];
            (m[r] || []).forEach((v, c) => {
                const txt = String(v ?? '').trim();
                if (!txt) return;
                const f = _headerField(txt);
                if (f && cols[f] === undefined) cols[f] = c; else ignored.push(txt);
            });
            if (cols.name !== undefined) {
                const labels = {};
                Object.entries(cols).forEach(([f, c]) => { labels[f] = String(m[r][c] ?? '').trim(); });
                return { row: r, cols, labels, ignored };
            }
        }
        return null;
    }
    function _matrixToRows(m) {
        const h = _findHeader(m);
        if (!h) return { error: 'لم يتم العثور على عمود «اسم المنتج» في أول 10 صفوف — استخدم القالب أو سمِّ العمود "اسم المنتج" أو "name"' };
        const rows = [];
        for (let r = h.row + 1; r < m.length; r++) {
            const src = m[r] || [];
            const get = f => h.cols[f] === undefined ? '' : src[h.cols[f]];
            const str = f => String(get(f) ?? '').replace(/\s+/g, ' ').trim();
            const rec = {
                rowNum: r + 1,
                name: str('name'), catmain: str('catmain'), cat: str('cat'),
                unitdesc: String(get('unitdesc') ?? '').trim(),
                id: _latinDigits(str('id')).replace(/\.0+$/, ''),
                rawPrice: str('price'), rawSale: str('sale'),
            };
            rec.price = _parseNum(get('price'));
            rec.sale  = _parseNum(get('sale'));
            if (!rec.name && !rec.id && !rec.rawPrice && !rec.catmain && !rec.cat && !rec.unitdesc) continue; // blank row
            rows.push(rec);
        }
        return { rows, header: h };
    }

    /* ── Classification (pure — no writes) ─────────────────────── */
    function _excelClassify() {
        const X = S.excel;
        const allowDup = !!X.allowDupNames;
        const { byId, byName } = _storeIndex();
        const items = _catAllItems || {};
        const G = _global || { idToStore: new Map(), maxNum: 0 };
        const seenKeys = new Set(), seenNames = new Set(), usedNewIds = new Set();
        let nextNum = G.maxNum;
        const nextAuto = () => {
            let id;
            do { id = String(++nextNum); } while (G.idToStore.has(id) || usedNewIds.has(id));
            return id;
        };

        for (const r of X.rows) {
            r.status = ''; r.note = ''; r.targetKey = null; r.targetId = ''; r.autoId = false; r.changes = null; r.oldVals = {};

            // Field-level validation
            if (!r.name && !r.id) { r.status = 'error'; r.note = 'اسم المنتج فارغ'; continue; }
            if (r.price !== null && isNaN(r.price)) { r.status = 'error'; r.note = 'السعر ليس رقماً'; continue; }
            if (r.sale  !== null && isNaN(r.sale))  { r.status = 'error'; r.note = 'سعر الخصم ليس رقماً'; continue; }
            if (r.price !== null && r.price < 0)    { r.status = 'error'; r.note = 'السعر سالب'; continue; }
            if (r.id && !SAFE_ID.test(r.id))        { r.status = 'error'; r.note = 'ID يقبل أحرف إنجليزية وأرقام و - _ فقط'; continue; }

            // Find existing item: ID first, then name
            let key = null;
            if (r.id) key = byId.get(r.id.toLowerCase()) || null;
            if (!key && r.name) {
                let hits = byName.get(_normName(r.name)) || [];
                // Duplicate names allowed: only an item in the same category
                // (the category cells filled in this row) counts as "the same product".
                if (allowDup && (r.catmain || r.cat)) hits = hits.filter(k => _sameCats(r, items[k]));
                if (hits.length > 1 && !r.id) { r.status = 'error'; r.note = `الاسم مكرر ${hits.length} مرات في المتجر — أضف عمود ID للتحديد`; continue; }
                if (hits.length === 1 && !r.id) key = hits[0];
                if (hits.length && r.id && !key) {
                    const existingId = _itemId(hits[0], items[hits[0]]);
                    r.status = 'error'; r.note = `الاسم موجود مسبقاً بـ ID ${existingId} — صحّح الـ ID أو احذفه`; continue;
                }
            }

            if (key) {
                if (seenKeys.has(key)) { r.status = 'dup'; r.note = 'نفس المنتج مذكور في صف سابق'; continue; }
                seenKeys.add(key);
                const it = items[key] || {};
                r.targetKey = key; r.targetId = _itemId(key, it);
                if (S.excel.mode === 'new') { r.status = 'skip'; r.note = 'موجود — وضع «إضافة الجديد فقط»'; continue; }
                const ch = {};
                const base = _hasBase(it) ? it.basePrice : it.price;
                if (r.name && r.name !== _clean(it.name)) { ch.name = r.name; r.oldVals.name = it.name || ''; }
                if (r.price !== null && _num0(base) !== r.price) { ch.price = r.price; r.oldVals.price = base ?? ''; }
                if (r.sale  !== null && _num0(it.sale) !== r.sale) { ch.sale = r.sale; r.oldVals.sale = it.sale ?? ''; }
                ['catmain', 'cat'].forEach(f => { if (r[f] && r[f] !== _clean(it[f])) { ch[f] = r[f]; r.oldVals[f] = it[f] || ''; } });
                if (r.unitdesc && r.unitdesc !== String(it.unitdesc ?? '').trim()) { ch.unitdesc = r.unitdesc; r.oldVals.unitdesc = it.unitdesc || ''; }
                if (!Object.keys(ch).length) { r.status = 'same'; r.note = 'مطابق للبيانات الحالية'; continue; }
                r.status = 'update'; r.changes = ch;
                r.note = 'سيتغيّر: ' + Object.keys(ch).map(f => ({ name: 'الاسم', price: 'السعر', sale: 'الخصم', catmain: 'القسم', cat: 'الفرعي', unitdesc: 'الوصف' }[f])).join('، ');
                if (ch.price !== undefined && _hasBase(it)) r.note += ' (+ سعر إضافي ' + _fmtNum(it.extraPrice) + ')';
                continue;
            }

            // New item
            if (!r.name) { r.status = 'error'; r.note = 'ID غير موجود في هذا المتجر ولا يوجد اسم لإنشاء منتج جديد'; continue; }
            const nn = allowDup
                ? [_normName(r.name), _normName(r.catmain || 'عام'), _normName(r.cat || r.catmain || 'عام')].join('|')
                : _normName(r.name);
            if (seenNames.has(nn)) { r.status = 'dup'; r.note = allowDup ? 'الاسم مكرر في الملف بنفس القسم' : 'الاسم مكرر في الملف'; continue; }
            if (r.id) {
                const low = r.id.toLowerCase();
                const owner = G.idToStore.get(low);
                if (owner) { r.status = 'error'; r.note = `ID مستخدم في متجر «${owner}»`; continue; }
                if (usedNewIds.has(low)) { r.status = 'dup'; r.note = 'ID مكرر في الملف'; continue; }
                usedNewIds.add(low); r.targetId = r.id;
            } else {
                r.targetId = nextAuto(); r.autoId = true; usedNewIds.add(r.targetId);
            }
            seenNames.add(nn);
            r.status = 'new';
        }
    }

    // Row's filled category cells match the store item's categories
    function _sameCats(r, it) {
        it = it || {};
        const cm = _clean(it.catmain) || 'عام', c = _clean(it.cat) || cm;
        if (r.catmain && _normName(r.catmain) !== _normName(cm)) return false;
        if (r.cat && _normName(r.cat) !== _normName(c)) return false;
        return true;
    }

    /* ── Writing ───────────────────────────────────────────────── */
    async function _excelCommit() {
        const X = S.excel;
        if (X.busy) return;
        const store = S.storeName;
        const before = _excelCounts();
        const ok = await showConfirm({
            title: 'تأكيد الاستيراد',
            msg: `سيتم في متجر <b>${_esc(store)}</b>:<br>• إضافة <b>${before.new}</b> منتج جديد<br>• تحديث <b>${before.update}</b> منتج موجود` +
                 (before.error ? `<br><span style="color:var(--red)">• تجاهل ${before.error} صف فيه أخطاء</span>` : ''),
            type: 'warning', okLabel: 'استيراد', icon: '📥',
        });
        if (!ok) return;

        X.busy = true; _render();
        try {
            // Re-check against live data right before writing — another admin
            // may have added items (and taken IDs) since the preview was built.
            _catAllItems = (await fbGet(`items/${store}`)) || {};
            await _loadGlobal(true);
            _excelClassify();
            const after = _excelCounts();
            if (after.error > before.error || after.new !== before.new || after.update !== before.update) {
                X.busy = false; _render();
                showNotif('تغيّرت البيانات منذ المعاينة', 'تم تحديث المعاينة — راجعها ثم اضغط استيراد مجدداً', 'error', 6000);
                return;
            }

            const ctype = _catCurrentStore?.type || '';
            const ops = [];
            const newIds = [];
            for (const r of X.rows) {
                if (r.status === 'new') {
                    const catmain = r.catmain || 'عام';
                    ops.push([r.targetId, {
                        ID: r.targetId, name: r.name,
                        price: String(r.price ?? 0), sale: String(r.sale ?? 0),
                        catmain, cat: r.cat || catmain, unitdesc: r.unitdesc || '',
                        pngExist: '0', companytype: ctype,
                    }]);
                    newIds.push(r.targetId);
                } else if (r.status === 'update') {
                    const it = _catAllItems[r.targetKey] || {};
                    for (const [f, v] of Object.entries(r.changes)) {
                        if (f === 'price' && _hasBase(it)) {
                            const extra = parseFloat(it.extraPrice) || 0;
                            ops.push([`${r.targetKey}/basePrice`, v]);
                            ops.push([`${r.targetKey}/price`, v + extra]);
                        } else if (f === 'price' || f === 'sale') {
                            ops.push([`${r.targetKey}/${f}`, String(v)]);
                        } else {
                            ops.push([`${r.targetKey}/${f}`, v]);
                        }
                    }
                }
            }

            const btn = document.getElementById('bi-excel-go');
            for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
                const chunk = Object.fromEntries(ops.slice(i, i + WRITE_CHUNK));
                await fbUpdate(`items/${store}`, chunk);
                if (btn) btn.textContent = `⏳ ${Math.min(i + WRITE_CHUNK, ops.length)} / ${ops.length}`;
            }

            _catAllItems = (await fbGet(`items/${store}`)) || {};
            _global = null;
            if (typeof _renderCatalogItems === 'function') _renderCatalogItems();

            const numeric = newIds.filter(id => /^\d+$/.test(id)).map(Number).sort((a, b) => a - b);
            X.done = {
                added: after.new, updated: after.update,
                skipped: after.same + after.skip + after.dup, errors: after.error,
                idRange: numeric.length ? (numeric.length === 1 ? String(numeric[0]) : `من ${numeric[0]} إلى ${numeric[numeric.length - 1]}`) : '',
            };
            X.busy = false;
            showNotif('✅ تم الاستيراد', `${after.new} جديد · ${after.update} محدّث`, 'success');
            _render();
        } catch (e) {
            console.error('[bulk-import] excel commit', e);
            X.busy = false; _render();
            showNotif('فشل الاستيراد', e.message || String(e), 'error', 7000);
        }
    }

    /* ── Template / export ─────────────────────────────────────── */
    async function _downloadTemplate(withItems) {
        try {
            await _ensureExcelJS();
            const wb = new ExcelJS.Workbook();
            wb.creator = 'Delivo Admin';
            const ws = wb.addWorksheet('المنتجات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
            ws.columns = FIELDS.map(f => ({ header: f.label + (f.required ? ' *' : ''), key: f.key, width: f.width }));
            const hr = ws.getRow(1);
            hr.height = 24;
            hr.eachCell(c => {
                c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5C00' } };
                c.alignment = { vertical: 'middle', horizontal: 'center' };
            });
            ws.getColumn('price').numFmt = '#,##0.##';
            ws.getColumn('sale').numFmt  = '#,##0.##';
            ws.getColumn('id').alignment = { horizontal: 'center' };

            if (withItems) {
                _storeItems()
                    .sort(([, a], [, b]) => String(a.catmain || '').localeCompare(String(b.catmain || ''), 'ar') || String(a.name || '').localeCompare(String(b.name || ''), 'ar'))
                    .forEach(([key, it]) => {
                        const price = parseFloat(_hasBase(it) ? it.basePrice : it.price);
                        const sale  = parseFloat(it.sale);
                        ws.addRow({
                            name: it.name || '', price: isNaN(price) ? '' : price, sale: sale > 0 ? sale : '',
                            catmain: it.catmain || '', cat: it.cat || '', unitdesc: it.unitdesc || '', id: _itemId(key, it),
                        });
                    });
            }

            const help = wb.addWorksheet('تعليمات', { views: [{ rightToLeft: true }] });
            help.columns = [{ width: 24 }, { width: 80 }];
            [
                ['العمود', 'الشرح'],
                ['اسم المنتج *', 'إلزامي. يُستخدم أيضاً لمطابقة الصور: سمِّ ملف الصورة بنفس اسم المنتج.'],
                ['السعر', 'رقم فقط (ل.ل أو $). يمكن كتابة 75,000 أو ٧٥٠٠٠.'],
                ['سعر بعد الخصم', 'اتركه فارغاً أو 0 إذا لا يوجد خصم.'],
                ['القسم الرئيسي', 'إذا تُرك فارغاً للمنتج الجديد يصبح «عام».'],
                ['القسم الفرعي', 'إذا تُرك فارغاً يأخذ نفس القسم الرئيسي.'],
                ['الوصف', 'اختياري.'],
                ['ID', 'اتركه فارغاً للمنتجات الجديدة ليُعطى رقم تلقائي. اكتبه لتحديث منتج موجود بدقة.'],
                ['', ''],
                ['التحديث', 'المنتج الموجود يُطابق بالـ ID ثم بالاسم. الخانات الفارغة لا تمسح القيم الحالية.'],
            ].forEach((r, i) => {
                const row = help.addRow(r);
                row.alignment = { wrapText: true, vertical: 'top' };
                if (i === 0) row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333340' } }; });
            });

            const buf  = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const safe = String(S.storeName).replace(/[\\/:*?"<>|]+/g, '_');
            const d = new Date();
            const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = withItems ? `${safe}-products-${stamp}.xlsx` : `delivo-products-template.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        } catch (e) {
            showNotif('تعذّر إنشاء الملف', e.message || String(e), 'error');
        }
    }

    /* ══════════════════════════════════════════════════════════
       TAB 2 — IMAGES
    ══════════════════════════════════════════════════════════ */
    const IMG_BADGE = {
        id:          ['مطابق بالـ ID', 'green'],
        exact:       ['مطابق', 'green'],
        fuzzy:       ['تقريبي — راجع', 'yellow'],
        manual:      ['يدوي', 'blue'],
        ambiguous:   ['أكثر من منتج', 'yellow'],
        unmatched:   ['غير مطابق', 'red'],
        'manual-none': ['مستبعد', 'gray'],
        dup:         ['صورة مكررة', 'yellow'],
        unsupported: ['صيغة غير مدعومة', 'red'],
        toolarge:    ['حجم كبير', 'red'],
        badid:       ['ID غير صالح', 'red'],
    };

    function _imgBody() {
        const I = S.img;
        if (!_storeItems().length) {
            return `<div class="bi-result"><div class="bi-result__icon">📭</div><div class="bi-result__title">لا توجد منتجات في هذا المتجر بعد</div>
                <div class="bi-muted">استورد المنتجات من Excel أولاً، ثم ارفع صورها هنا.</div>
                <button type="button" class="bi-btn bi-btn--primary" data-act="goto-excel">📊 الانتقال إلى Excel</button></div>`;
        }
        const noImg = _storeItems().filter(([, it]) => !(it.pngExist === '1' || it.pngExist === 1)).length;
        if (!I.entries.length) {
            return `
            <div class="bi-grid2">
                <div class="bi-drop" data-kind="images" tabindex="0">
                    <div class="bi-drop__icon">🗂</div>
                    <div class="bi-drop__title">اسحب مجلد الصور هنا</div>
                    <div class="bi-drop__hint">أو اختر مجلداً / صوراً — تُقرأ المجلدات الفرعية أيضاً</div>
                    <div class="bi-row bi-row--center">
                        <button type="button" class="bi-btn bi-btn--primary" data-act="pick-folder">📁 اختيار مجلد</button>
                        <button type="button" class="bi-btn bi-btn--ghost" data-act="pick-files">🖼 اختيار صور</button>
                    </div>
                </div>
                <div class="bi-side">
                    <div class="bi-card">
                        <div class="bi-card__title">📊 حالة صور المتجر</div>
                        <div class="bi-stats bi-stats--sm">
                            <div class="bi-stat"><b>${_storeItems().length}</b><span>منتج</span></div>
                            <div class="bi-stat bi-stat--green"><b>${_storeItems().length - noImg}</b><span>لديه صورة</span></div>
                            <div class="bi-stat bi-stat--red"><b>${noImg}</b><span>بدون صورة</span></div>
                        </div>
                    </div>
                    <div class="bi-card bi-card--info">
                        <ul class="bi-rules">
                            <li>سمِّ كل صورة <b>باسم المنتج</b> كما هو في النظام (مثال: <span class="bi-mono">شاورما دجاج.jpg</span>) أو <b>برقم الـ ID</b> (مثال: <span class="bi-mono">3077.png</span>).</li>
                            <li>المطابقة لا تتأثر بالهمزات والتشكيل والتاء المربوطة، واللاحقات مثل <span class="bi-mono">(1)</span> و <span class="bi-mono">- Copy</span>.</li>
                            <li>تُحوَّل كل صورة إلى WebP وتُصغَّر، ثم تُرفع إلى <span class="bi-mono">items2/ID.webp</span>.</li>
                            <li>الصيغ: JPG · PNG · WebP · GIF · BMP · AVIF — (HEIC من الآيفون غير مدعوم في المتصفح).</li>
                        </ul>
                    </div>
                </div>
            </div>`;
        }

        const c = _imgCounts();
        const list = I.entries.map((en, i) => ({ en, i })).filter(({ en }) => {
            switch (I.filter) {
                case 'ok':     return ['id', 'exact', 'manual'].includes(en.status);
                case 'review': return ['fuzzy', 'ambiguous', 'dup'].includes(en.status);
                case 'bad':    return ['unmatched', 'unsupported', 'toolarge', 'badid', 'manual-none'].includes(en.status);
                case 'failed': return en.up === 'error';
                default:       return true;
            }
        });

        return `
        ${_itemsDatalist()}
        ${I.progress ? _progressHtml() : ''}
        ${I.done && !I.busy ? _imgDoneBanner() : ''}
        <div class="bi-toolbar">
            <div class="bi-file">🗂 <b>${I.entries.length}</b> ملف <span class="bi-muted">· ${c.matchedItems} منتج سيحصل على صورة</span></div>
            <div class="bi-row">
                <button type="button" class="bi-btn bi-btn--sm bi-btn--ghost" data-act="pick-folder" ${I.busy ? 'disabled' : ''}>＋ مجلد</button>
                <button type="button" class="bi-btn bi-btn--sm bi-btn--ghost" data-act="pick-files" ${I.busy ? 'disabled' : ''}>＋ صور</button>
                <button type="button" class="bi-btn bi-btn--sm bi-btn--ghost" data-act="img-select-all" ${I.busy ? 'disabled' : ''}>☑ تحديد المطابق</button>
                <button type="button" class="bi-btn bi-btn--sm bi-btn--ghost" data-act="img-select-none" ${I.busy ? 'disabled' : ''}>☐ إلغاء التحديد</button>
            </div>
        </div>
        <div class="bi-chips">
            ${_chip('img-filter', 'all',    'الكل',          I.entries.length, I.filter)}
            ${_chip('img-filter', 'ok',     'مطابقة',        c.ok,     I.filter, 'green')}
            ${_chip('img-filter', 'review', 'تحتاج مراجعة', c.review, I.filter, 'yellow')}
            ${_chip('img-filter', 'bad',    'غير مطابقة',    c.bad,    I.filter, 'red')}
            ${_chip('img-filter', 'failed', 'فشل الرفع',     c.failed, I.filter, 'red')}
        </div>
        <div class="bi-tablewrap bi-drop--table" data-kind="images">
            <table class="bi-table bi-table--img">
                <thead><tr><th class="bi-th-inc"></th><th>الصورة</th><th>اسم الملف</th><th>المنتج المطابق</th><th>الحالة</th><th>الرفع</th></tr></thead>
                <tbody>${list.map(({ en, i }) => _imgRowHtml(en, i)).join('') || `<tr><td colspan="6" class="bi-empty">لا توجد ملفات بهذا التصنيف</td></tr>`}</tbody>
            </table>
        </div>`;
    }

    function _imgRowHtml(en, i) {
        const [bl, bc] = IMG_BADGE[en.status] || ['—', 'gray'];
        const it = en.itemKey ? (_catAllItems[en.itemKey] || {}) : null;
        const hasImg = it && (it.pngExist === '1' || it.pngExist === 1);
        const disabled = S.img.busy || en.up === 'done' || !_canAssign(en);
        const up = {
            pending: '<span class="bi-muted">—</span>', queued: '<span class="bi-muted">بالانتظار</span>',
            working: '<span class="bi-up bi-up--work"><span class="bi-spin bi-spin--sm"></span> جاري…</span>',
            done: '<span class="bi-up bi-up--ok">✔ تم</span>',
            error: `<span class="bi-up bi-up--err" title="${_esc(en.err || '')}">✖ فشل</span>`,
        }[en.up || 'pending'];
        return `<tr class="${en.include ? '' : 'bi-tr--off'}">
            <td class="bi-th-inc"><input type="checkbox" class="bi-inc" data-i="${i}" ${en.include ? 'checked' : ''} ${disabled || !_canInclude(en) ? 'disabled' : ''}></td>
            <td><div class="bi-thumb">${en.thumb ? `<img src="${en.thumb}" loading="lazy" alt="">` : '🖼'}</div></td>
            <td><div class="bi-fname" title="${_esc(en.path)}"><bdi>${_esc(en.file.name)}</bdi></div>
                <div class="bi-muted bi-small"><bdi>${(en.file.size / 1024 / 1024).toFixed(en.file.size > 1048576 ? 1 : 2)} MB</bdi>${en.path.includes('/') ? ' · 📁 <bdi>' + _esc(en.path.split('/').slice(0, -1).join('/')) + '</bdi>' : ''}</div></td>
            <td>
                <div class="bi-assignwrap">
                    <input type="text" class="bi-assign" data-i="${i}" list="bi-items-dl" placeholder="ابحث عن منتج…"
                           value="${en.itemKey ? _esc(_optText(en.itemKey)) : ''}" ${disabled ? 'disabled' : ''}>
                    ${en.itemKey && !disabled ? `<button type="button" class="bi-iconbtn bi-iconbtn--sm" data-act="img-unassign" data-i="${i}" title="إلغاء الربط">✕</button>` : ''}
                </div>
                ${en.itemKey ? `<div class="bi-muted bi-small">→ <span class="bi-mono">items2/${_esc(String(_itemId(en.itemKey, it)).toLowerCase())}.webp</span>${hasImg && en.up !== 'done' ? ' · <span class="bi-warn">ستُستبدل الصورة الحالية</span>' : ''}</div>` : ''}
                ${en.note ? `<div class="bi-small bi-note">${_esc(en.note)}</div>` : ''}
            </td>
            <td><span class="bi-badge bi-badge--${bc}">${bl}${en.status === 'fuzzy' ? ` ${Math.round(en.score * 100)}%` : ''}</span></td>
            <td>${up}</td>
        </tr>`;
    }

    function _itemsDatalist() {
        _itemOptIndex = new Map();
        const opts = _storeItems()
            .sort(([, a], [, b]) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'))
            .map(([key, it]) => { const t = _optText(key); _itemOptIndex.set(t, key); return `<option value="${_esc(t)}"></option>`; })
            .join('');
        return `<datalist id="bi-items-dl">${opts}</datalist>`;
    }
    function _optText(key) {
        const it = _catAllItems[key] || {};
        return `${it.name || '(بدون اسم)'} · #${_itemId(key, it)}`;
    }

    function _imgCounts() {
        const c = { ok: 0, review: 0, bad: 0, failed: 0, selected: 0, matchedItems: 0 };
        const items = new Set();
        S.img.entries.forEach(en => {
            if (['id', 'exact', 'manual'].includes(en.status)) c.ok++;
            else if (['fuzzy', 'ambiguous', 'dup'].includes(en.status)) c.review++;
            else c.bad++;
            if (en.up === 'error') c.failed++;
            if (en.include && en.itemKey && en.up !== 'done') { c.selected++; items.add(en.itemKey); }
        });
        c.matchedItems = items.size;
        return c;
    }
    function _renderImgCounters() {
        const foot = document.getElementById('bi-foot');
        if (foot && S.tab === 'images') foot.innerHTML = _imgFoot();
    }

    function _imgFoot() {
        const I = S.img;
        if (!I.entries.length) return `<div class="bi-foot__spacer"></div><button type="button" class="bi-btn bi-btn--ghost" data-act="close">إغلاق</button>`;
        const c = _imgCounts();
        if (I.busy) {
            return `<div class="bi-foot__spacer"></div>
                <button type="button" class="bi-btn bi-btn--danger" data-act="img-cancel" ${I.cancel ? 'disabled' : ''}>${I.cancel ? '⏳ جاري الإيقاف…' : '⏸ إيقاف'}</button>`;
        }
        return `
            <button type="button" class="bi-btn bi-btn--ghost" data-act="img-reset">↺ مسح القائمة</button>
            <div class="bi-opts">
                <label class="bi-opt">الحجم الأقصى
                    <select id="bi-maxdim">
                        ${[[800, '800px'], [1200, '1200px (مُوصى)'], [1600, '1600px'], ['orig', 'الحجم الأصلي']].map(([v, l]) =>
                            `<option value="${v}" ${(I.maxDim || 'orig') == v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </label>
                <label class="bi-opt"><input type="checkbox" id="bi-skip-existing" ${I.skipExisting ? 'checked' : ''}> تخطّي المنتجات التي لديها صورة</label>
            </div>
            <div class="bi-foot__spacer"></div>
            ${c.failed ? `<button type="button" class="bi-btn bi-btn--ghost" data-act="img-retry">↻ إعادة الفاشلة (${c.failed})</button>` : ''}
            <button type="button" class="bi-btn bi-btn--primary" data-act="img-upload" ${c.selected ? '' : 'disabled'}>⬆ رفع ${c.selected} صورة</button>`;
    }

    function _progressHtml() {
        const p = S.img.progress;
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        let eta = '';
        if (p.done > 0 && p.done < p.total) {
            const per = (Date.now() - p.start) / p.done;
            const s = Math.round((per * (p.total - p.done)) / 1000);
            eta = s >= 60 ? `~${Math.ceil(s / 60)} دقيقة متبقية` : `~${s} ثانية متبقية`;
        }
        return `
        <div class="bi-progress" id="bi-progress">
            <div class="bi-progress__top">
                <span><b>${p.done}</b> / ${p.total} ${p.failed ? `· <span class="bi-err">${p.failed} فشل</span>` : ''}</span>
                <span class="bi-muted">${_esc(p.current || '')} ${eta ? '· ' + eta : ''}</span>
            </div>
            <div class="bi-progress__bar"><div style="width:${pct}%"></div></div>
        </div>`;
    }
    function _imgDoneBanner() {
        const d = S.img.done;
        return `<div class="bi-alert ${d.failed ? 'bi-alert--warn' : 'bi-alert--ok'}">
            ${d.cancelled ? '⏸ تم الإيقاف — ' : ''}✔ تم رفع <b>${d.ok}</b> صورة${d.failed ? ` · ✖ فشل <b>${d.failed}</b> (يمكنك إعادة المحاولة)` : ''}.
            قد تستغرق الصور دقيقة أو دقيقتين لتظهر للزبائن بعد تحديث GitHub.
        </div>`;
    }

    /* ── Adding files & matching ───────────────────────────────── */
    function _imgAddFiles(list) {
        const I = S.img;
        if (I.busy) return;
        I.done = null;
        const existing = new Set(I.entries.map(en => en.path + '|' + en.file.size));
        let added = 0, ignored = 0;
        for (const { file, path } of list) {
            const nm = file.name || '';
            if (nm.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(nm)) continue;
            const sig = path + '|' + file.size;
            if (existing.has(sig)) continue;
            const isImg = IMG_EXT.test(nm) || (file.type && file.type.startsWith('image/') && !HEIC_EXT.test(nm));
            if (!isImg && !HEIC_EXT.test(nm)) { ignored++; continue; }
            existing.add(sig);
            const en = { file, path, base: _fileBase(nm), include: false, up: 'pending', err: '', note: '', thumb: '' };
            if (HEIC_EXT.test(nm)) { en.status = 'unsupported'; en.note = 'حوّل الصورة إلى JPG أو PNG أولاً'; }
            else if (file.size > MAX_IMG_MB * 1024 * 1024) { en.status = 'toolarge'; en.note = `الحد الأقصى ${MAX_IMG_MB}MB`; }
            else { en.thumb = URL.createObjectURL(file); _matchEntry(en); }
            I.entries.push(en);
            added++;
        }
        _resolveConflicts();
        // Good matches first, then things needing attention
        const order = { id: 0, exact: 0, manual: 0, fuzzy: 1, ambiguous: 2, dup: 3, unmatched: 4, 'manual-none': 5, badid: 6, toolarge: 7, unsupported: 8 };
        I.entries.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.file.name.localeCompare(b.file.name, 'ar'));
        if (!added) showNotif('لم تتم إضافة صور', ignored ? `${ignored} ملف ليس صورة` : 'الملفات مضافة مسبقاً', 'error');
        else if (ignored) showNotif(`تمت إضافة ${added} صورة`, `تم تجاهل ${ignored} ملف ليس صورة`, 'success');
        _render();
    }

    let _matchCache = null; // per render-cycle item fingerprints
    function _itemFingerprints() {
        if (_matchCache && _matchCache.src === _catAllItems) return _matchCache.list;
        const list = _storeItems().map(([key, it]) => {
            const n = _normName(it.name);
            return { key, n, bg: _bigrams(n), id: _itemId(key, it).toLowerCase() };
        }).filter(x => x.n || x.id);
        _matchCache = { src: _catAllItems, list };
        return list;
    }

    function _matchEntry(en) {
        const items = _itemFingerprints();
        const raw = en.base.trim();
        const lowRaw = _latinDigits(raw).toLowerCase();
        en.score = 0; en.note = '';

        // 1) File named after the ID
        const byId = items.find(x => x.id && (x.id === lowRaw || String(x.key).toLowerCase() === lowRaw));
        if (byId) return _assign(en, byId.key, 'id', 1);

        // 2) Exact normalised name (also try without a leading "12 - " index)
        const cands = [_normName(raw)];
        const stripped = _normName(raw.replace(/^\s*\d+\s*[-_.)]\s*/, ''));
        if (stripped && stripped !== cands[0]) cands.push(stripped);
        for (const c of cands) {
            const hits = items.filter(x => x.n === c);
            if (hits.length === 1) return _assign(en, hits[0].key, 'exact', 1);
            if (hits.length > 1) {
                en.status = 'ambiguous'; en.itemKey = null; en.include = false;
                en.note = `يوجد ${hits.length} منتجات بنفس الاسم — اختر المنتج يدوياً أو سمِّ الصورة بالـ ID`;
                return;
            }
        }

        // 3) Fuzzy — bigram similarity, plus whole-name containment
        const fn = cands[cands.length - 1];
        const fbg = _bigrams(fn);
        let best = null, second = 0;
        for (const x of items) {
            if (!x.n) continue;
            let s = _dice(fbg, x.bg);
            if (fn.length >= 4 && x.n.length >= 4 && (fn.includes(x.n) || x.n.includes(fn))) s = Math.max(s, 0.86);
            if (!best || s > best.s) { second = best ? best.s : second; best = { key: x.key, s }; }
            else if (s > second) second = s;
        }
        if (best && best.s >= 0.72 && best.s - second >= 0.04) {
            _assign(en, best.key, 'fuzzy', best.s);
            en.include = best.s >= 0.88 && _defaultInclude(en);
            en.note = en.include ? 'مطابقة قريبة جداً — تأكّد منها' : 'مطابقة غير مؤكدة — حدّدها يدوياً إذا كانت صحيحة';
            return;
        }
        en.status = 'unmatched'; en.itemKey = null; en.include = false;
        en.note = best && best.s >= 0.5 ? `أقرب منتج: ${(_catAllItems[best.key] || {}).name || ''}` : 'لا يوجد منتج بهذا الاسم';
    }

    function _assign(en, key, status, score) {
        en.itemKey = key; en.status = status; en.score = score ?? (key ? 1 : 0); en.note = '';
        if (key) {
            const id = _itemId(key, _catAllItems[key]);
            if (!SAFE_ID.test(id)) { en.status = 'badid'; en.include = false; en.note = `ID «${id}» لا يصلح كاسم ملف (أحرف إنجليزية وأرقام فقط)`; return; }
        }
        en.include = !!key && _defaultInclude(en);
        if (key && en.up === 'error') en.up = 'pending';
    }
    function _defaultInclude(en) {
        if (!en.itemKey || en.up === 'done') return false;
        if (!['id', 'exact', 'manual', 'fuzzy'].includes(en.status)) return false;
        if (en.status === 'fuzzy' && en.score < 0.88) return false;
        if (S.img.skipExisting) {
            const it = _catAllItems[en.itemKey] || {};
            if (it.pngExist === '1' || it.pngExist === 1) return false;
        }
        return true;
    }
    function _canInclude(en) { return !!en.itemKey && ['id', 'exact', 'manual', 'fuzzy'].includes(en.status) && en.up !== 'done'; }
    function _canAssign(en) { return !['unsupported', 'toolarge'].includes(en.status); }

    // Two files matched to the same product → keep the strongest match,
    // mark the rest as duplicates (never upload twice to one items2/ID).
    function _resolveConflicts() {
        const rank = en => ({ manual: 4, id: 3, exact: 2, fuzzy: 1 }[en.status] || 0) + (en.score || 0) / 10;
        const byItem = new Map();
        S.img.entries.forEach(en => {
            if (en.status === 'dup') { _matchEntryKeepManual(en); }
        });
        S.img.entries.forEach(en => {
            if (!en.itemKey || !['id', 'exact', 'manual', 'fuzzy'].includes(en.status)) return;
            if (!byItem.has(en.itemKey)) byItem.set(en.itemKey, []);
            byItem.get(en.itemKey).push(en);
        });
        for (const group of byItem.values()) {
            if (group.length < 2) continue;
            group.sort((a, b) => rank(b) - rank(a));
            group.slice(1).forEach(en => {
                en._dupOf = en.itemKey; en._dupStatus = en.status;
                en.status = 'dup'; en.include = false;
                en.note = `المنتج نفسه مربوط بصورة أخرى: ${group[0].file.name}`;
            });
        }
    }
    // A former duplicate gets re-evaluated when its rival is reassigned
    function _matchEntryKeepManual(en) {
        const key = en._dupOf, st = en._dupStatus;
        delete en._dupOf; delete en._dupStatus;
        if (key) {
            _assign(en, key, st || 'exact', en.score);
            if (st === 'fuzzy') en.include = en.score >= 0.88 && _defaultInclude(en);
        }
    }

    function _revokeThumbs() {
        (S.img.entries || []).forEach(en => { if (en.thumb) try { URL.revokeObjectURL(en.thumb); } catch (_) {} });
    }

    /* ── Convert & upload ──────────────────────────────────────── */
    async function _toWebp(file, maxDim, quality = 0.85) {
        let src, w, h, cleanup = () => {};
        try {
            src = await createImageBitmap(file, { imageOrientation: 'from-image' });
            w = src.width; h = src.height; cleanup = () => src.close && src.close();
        } catch (_) {
            src = await new Promise((res, rej) => {
                const img = new Image(), url = URL.createObjectURL(file);
                img.onload = () => { URL.revokeObjectURL(url); res(img); };
                img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('تعذّر قراءة الصورة (ملف تالف أو صيغة غير مدعومة)')); };
                img.src = url;
            });
            w = src.naturalWidth; h = src.naturalHeight;
        }
        const scale = maxDim && Math.max(w, h) > maxDim ? maxDim / Math.max(w, h) : 1;
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, cw, ch);
        cleanup();
        const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('تعذّر التحويل إلى WebP')), 'image/webp', quality));
        if (blob.type !== 'image/webp') throw new Error('المتصفح لا يدعم التحويل إلى WebP — استخدم Chrome أو Edge');
        // Small preview for the admin grid (avoids waiting for GitHub → CDN)
        const t = document.createElement('canvas');
        const ts = Math.min(1, 320 / Math.max(cw, ch));
        t.width = Math.round(cw * ts); t.height = Math.round(ch * ts);
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        return { blob, preview: t.toDataURL('image/webp', 0.7) };
    }

    const _sleep = ms => new Promise(r => setTimeout(r, ms));
    function _isFatal(msg) { return /جلسة|غير مخوّل|غير مسموح|اسم ملف غير صالح|401|403/.test(msg || ''); }

    async function _imgUpload(retryFailed) {
        const I = S.img;
        if (I.busy) return;
        const queue = I.entries.filter(en => retryFailed
            ? (en.up === 'error' && en.itemKey)
            : (en.include && en.itemKey && en.up !== 'done'));
        if (!queue.length) return;

        const replacing = queue.filter(en => { const it = _catAllItems[en.itemKey] || {}; return it.pngExist === '1' || it.pngExist === 1; }).length;
        const fuzzy = queue.filter(en => en.status === 'fuzzy').length;
        const ok = await showConfirm({
            title: 'تأكيد رفع الصور',
            msg: `سيتم رفع <b>${queue.length}</b> صورة إلى <span style="font-family:monospace">items2/</span>` +
                 (replacing ? `<br>• منها <b>${replacing}</b> ستستبدل صوراً موجودة` : '') +
                 (fuzzy ? `<br>• <b>${fuzzy}</b> مطابقة تقريبية — تأكّد أنها صحيحة` : ''),
            type: 'warning', okLabel: 'رفع', icon: '⬆',
        });
        if (!ok) return;

        I.busy = true; I.cancel = false; I.done = null;
        queue.forEach(en => { en.up = 'queued'; en.err = ''; });
        I.progress = { total: queue.length, done: 0, failed: 0, start: Date.now(), current: '' };
        window.addEventListener('beforeunload', _beforeUnload);
        _render();

        const store = S.storeName;
        let okN = 0, failN = 0;
        for (const en of queue) {
            if (I.cancel) { en.up = 'pending'; continue; }
            const it = _catAllItems[en.itemKey] || {};
            const id = _itemId(en.itemKey, it);
            en.up = 'working';
            I.progress.current = `${it.name || id} ← ${en.file.name}`;
            _render();
            try {
                const { blob, preview } = await _toWebp(en.file, I.maxDim);
                const webpFile = new File([blob], `${id.toLowerCase()}.webp`, { type: 'image/webp' });
                let lastErr = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await _adminUploadImage(webpFile, ITEM_GH_FOLDER, `${id.toLowerCase()}.webp`);
                        lastErr = null; break;
                    } catch (e) {
                        lastErr = e;
                        if (_isFatal(e.message) || attempt === 3) break;
                        await _sleep(attempt * 2000); // GitHub 409 (concurrent commit) / network blip
                    }
                }
                if (lastErr) throw lastErr;

                const ts = Date.now();
                await fbUpdate(`items/${store}/${en.itemKey}`, { pngExist: '1', imgUpdatedAt: ts });
                if (_catAllItems[en.itemKey]) { _catAllItems[en.itemKey].pngExist = '1'; _catAllItems[en.itemKey].imgUpdatedAt = ts; }
                if (typeof _cpiLocalImagePreview === 'object') _cpiLocalImagePreview[id] = preview;
                en.up = 'done'; en.include = false; okN++;
            } catch (e) {
                console.warn('[bulk-import] upload failed', en.file.name, e);
                en.up = 'error'; en.err = e.message || String(e); failN++;
                I.progress.failed++;
                if (_isFatal(en.err)) {
                    I.cancel = true;
                    showNotif('توقّف الرفع', en.err, 'error', 8000);
                }
            }
            I.progress.done++;
            _render();
        }
        queue.forEach(en => { if (en.up === 'queued') en.up = 'pending'; });

        I.busy = false;
        I.done = { ok: okN, failed: failN, cancelled: I.cancel };
        I.cancel = false;
        I.progress = null;
        window.removeEventListener('beforeunload', _beforeUnload);
        if (typeof _renderCatalogItems === 'function' && _catCurrentStore && _catCurrentStore.name === store) _renderCatalogItems();
        showNotif(failN ? 'انتهى الرفع مع أخطاء' : '✅ تم رفع الصور', `${okN} ناجحة${failN ? ` · ${failN} فشلت` : ''}`, failN ? 'error' : 'success', 5000);
        _render();
    }
    function _beforeUnload(e) { e.preventDefault(); e.returnValue = ''; }

    /* ── Expose ────────────────────────────────────────────────── */
    window.openBulkImport = openBulkImport;
    // test hooks (no side effects)
    window._biInternals = { _normName, _parseNum, _headerField, _fileBase, _dice, _bigrams, S };
})();