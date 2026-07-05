/* ============================================================
   scripts/store-status-listener.js
   Single SSE stream on storeStatus — pushes live updates to:
     • Top-5 stores section  (stores.js)
     • Categories dropdown   (categories.js)
     • Open store panel      (store-panel.js)
   No page refresh needed. Reconnects automatically.
   ============================================================ */

(function () {
    const RTDB  = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const PATH  = `${RTDB}/storeStatus.json`;

    let _latestStatus = {};   // storeName → { closed, reason, opensAt }
    let _sse          = null;
    let _retryMs      = 2000;
    const MAX_RETRY   = 30000;

    /* ── Public accessor used by other scripts ─────────────── */
    window.getStoreStatus = function (storeName) {
        return _latestStatus[storeName] || null;
    };
    window.getAllStoreStatuses = function () {
        return _latestStatus;
    };

    /* ── Helpers ───────────────────────────────────────────── */
    function _isClosed(st) {
        return st && (st.closed === true || st.closed === '1' || st.closed === 1);
    }

    const _ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

    function _calendarDateLabel(isoOrText) {
        if (!isoOrText) return null;
        // JS's Date constructor is unreliably lenient with non-standard
        // strings (it can parse a stray digit out of Arabic free text
        // into a bogus-but-"valid" date instead of failing outright), so
        // only treat it as a real date if it matches the strict ISO
        // format we ourselves generate — anything else is shown as-is.
        if (!_ISO_DATE_RE.test(isoOrText)) return isoOrText;
        const dt = new Date(isoOrText);
        if (isNaN(dt)) return isoOrText;          // plain Arabic text — return as-is
        const now      = new Date();
        if (dt <= now) return null;               // past — treat as open
        const nowDate  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dtDate   = new Date(dt.getFullYear(),  dt.getMonth(),  dt.getDate());
        const dayDiff  = Math.round((dtDate - nowDate) / 86400000);
        const t        = dt.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: true });
        const days   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const months = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
        if (dayDiff === 0) return `اليوم الساعة ${t}`;
        if (dayDiff === 1) return `غداً الساعة ${t}`;
        if (dayDiff < 7)   return `${days[dt.getDay()]} الساعة ${t}`;
        const sameYear = dt.getFullYear() === now.getFullYear();
        const datePart = sameYear
            ? `${dt.getDate()} ${months[dt.getMonth()]}`
            : `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
        return `${days[dt.getDay()]} ${datePart} الساعة ${t}`;
    }

    /* ── Apply update to the TOP-5 stores section ─────────── */
    function _patchStoresSection(storeName, st) {
        const closed = _isClosed(st);
        // Find the card in the stores horizontal scroll
        document.querySelectorAll(`.store-card[data-store-id]`).forEach(card => {
            // match by data-store-id (lowercased store name with dashes)
            const cardId   = card.dataset.storeId || '';
            const cardName = (card.dataset.storeName || '').toLowerCase();
            const matchId  = storeName.toLowerCase().replace(/\s+/g, '-');
            if (cardId !== matchId && cardName !== storeName.toLowerCase()) return;

            const thumb   = card.querySelector('.store-card__thumb, .store-thumb');
            let   badge   = card.querySelector('.store-card__closed-badge');
            let   chip    = card.querySelector('.store-card__opens-chip');
            let   reason  = card.querySelector('.store-card__closed-reason');

            if (closed) {
                card.classList.add('store-card--closed');
                card.style.pointerEvents = 'none';
                card.style.cursor        = 'not-allowed';

                // Closed badge on thumb
                if (!badge && thumb) {
                    badge = document.createElement('div');
                    badge.className = 'store-card__closed-badge';
                    badge.innerHTML = `<span class="store-card__closed-badge__icon">🔒</span>
                                       <span class="store-card__closed-badge__label">مغلق الآن</span>`;
                    thumb.appendChild(badge);
                }

                // Reason text
                const body = card.querySelector('.store-card__body');
                if (body) {
                    if (!reason && st.reason) {
                        reason = document.createElement('p');
                        reason.className = 'store-card__closed-reason';
                        body.appendChild(reason);
                    }
                    if (reason) reason.textContent = st.reason || '';

                    // Opens-chip
                    const label = _calendarDateLabel(st.opensAt);
                    const footer = card.querySelector('.store-card__footer');
                    if (footer) {
                        if (!chip && label) {
                            chip = document.createElement('div');
                            chip.className = 'store-card__opens-chip';
                            footer.innerHTML = '';
                            footer.appendChild(chip);
                        }
                        if (chip && label) {
                            chip.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> يفتح ${label}`;
                        } else if (chip && !label) {
                            chip.remove();
                        }
                    }
                }

            } else {
                // Open: remove closed state
                card.classList.remove('store-card--closed');
                card.style.pointerEvents = '';
                card.style.cursor        = '';
                badge?.remove();
                chip?.remove();
                reason?.remove();
                // Restore footer label
                const footer = card.querySelector('.store-card__footer');
                if (footer && !footer.querySelector('.store-card__min-label')) {
                    footer.innerHTML = '<span class="store-card__min-label">اضغط للطلب</span>';
                }
            }
        });
    }

    /* ── Apply update to categories dropdown cards ─────────── */
    function _patchCategoriesDropdown(storeName, st) {
        const closed  = _isClosed(st);
        const matchId = storeName.toLowerCase().replace(/\s+/g, '-');

        document.querySelectorAll(`.store-card[data-store-id="${matchId}"], .store-card[data-store-name="${storeName}"]`).forEach(card => {
            const thumb  = card.querySelector('.store-card__thumb');
            let   badge  = card.querySelector('.store-card__closed-badge');
            let   chip   = card.querySelector('.store-card__opens-chip');
            let   reason = card.querySelector('.store-card__closed-reason');

            if (closed) {
                card.classList.add('store-card--closed');
                card.style.pointerEvents = 'none';
                card.style.cursor        = 'not-allowed';

                if (!badge && thumb) {
                    badge = document.createElement('div');
                    badge.className = 'store-card__closed-badge';
                    badge.innerHTML = `<span class="store-card__closed-badge__icon">🔒</span>
                                       <span class="store-card__closed-badge__label">مغلق الآن</span>`;
                    thumb.style.position = 'relative';
                    thumb.appendChild(badge);
                }

                const body = card.querySelector('.store-card__body');
                if (body) {
                    if (!reason && st.reason) {
                        reason = document.createElement('p');
                        reason.className = 'store-card__closed-reason';
                        const nameEl = body.querySelector('.store-card__name');
                        nameEl ? nameEl.after(reason) : body.appendChild(reason);
                    }
                    if (reason) reason.textContent = st.reason || '';

                    const label  = _calendarDateLabel(st.opensAt);
                    const footer = card.querySelector('.store-card__footer');
                    if (footer) {
                        if (!chip && label) {
                            chip = document.createElement('div');
                            chip.className = 'store-card__opens-chip';
                        }
                        if (chip && label) {
                            chip.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> يفتح ${label}`;
                            footer.innerHTML = '';
                            footer.appendChild(chip);
                        } else if (!label) {
                            footer.innerHTML = '<span class="store-card__min-label">مغلق مؤقتاً</span>';
                        }
                    }
                }

                // Invalidate categories cache so next open re-fetches
                if (typeof window._invalidateCategoriesCache === 'function') {
                    window._invalidateCategoriesCache();
                }

            } else {
                card.classList.remove('store-card--closed');
                card.style.pointerEvents = '';
                card.style.cursor        = 'pointer';
                badge?.remove();
                chip?.remove();
                reason?.remove();
                const footer = card.querySelector('.store-card__footer');
                if (footer) footer.innerHTML = '<span class="store-card__min-label">اضغط للطلب</span>';
                if (typeof window._invalidateCategoriesCache === 'function') {
                    window._invalidateCategoriesCache();
                }
            }
        });
    }

    /* ── Apply update to open store panel ──────────────────── */
    function _patchStorePanel(storeName, st) {
        // Only act if this store's panel is currently open
        if (!window._currentStore || window._currentStore.name !== storeName) return;

        const closed  = _isClosed(st);
        const body    = document.getElementById('sp-body');
        const metaEl  = document.getElementById('sp-hero-meta');
        if (!body) return;

        if (closed) {
            const reason  = st.reason  || 'المتجر مغلق مؤقتاً';
            const opensAt = _calendarDateLabel(st.opensAt);

            if (metaEl) {
                const existing = metaEl.innerHTML;
                if (!existing.includes('مغلق الآن')) {
                    metaEl.insertAdjacentHTML('beforeend',
                        `<span class="sp-hero__badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3);">🔴 مغلق الآن</span>`
                    );
                }
            }

            // Replace body with closed screen
            body.innerHTML = `
            <div class="sp-closed">
                <div class="sp-closed__shutter">
                    <span class="sp-closed__shutter-icon">🔒</span>
                    <span class="sp-closed__shutter-dot"></span>
                </div>
                <div class="sp-closed__title">المتجر مغلق الآن</div>
                <div class="sp-closed__reason">${reason}</div>
                ${opensAt ? `
                <div class="sp-closed__opens">
                    <span class="sp-closed__opens-icon">🕐</span>
                    <div class="sp-closed__opens-text">
                        <div class="sp-closed__opens-label">موعد الفتح</div>
                        <div class="sp-closed__opens-time">${opensAt}</div>
                    </div>
                </div>` : ''}
                <div class="sp-closed__divider"></div>
                <p class="sp-closed__cta">تفضّل بزيارتنا لاحقاً —<br><strong>سنكون بخدمتك قريباً!</strong></p>
            </div>`;

            document.getElementById('sp-tabs-inner').innerHTML = '';
            const subcatWrap = document.getElementById('sp-subcat-wrap');
            if (subcatWrap) { subcatWrap.style.display = 'none'; subcatWrap.innerHTML = ''; }
            document.getElementById('sp-cart-bar')?.classList.remove('visible');

        } else {
            // Store re-opened while panel is showing — reload the panel content
            if (typeof openStorePanel === 'function' && window._currentStore) {
                const { id, name, type } = window._currentStore;
                // Clear panel cache so it re-fetches items
                if (window._spCache) delete window._spCache[`pattern_${type}`];
                openStorePanel(id, name, type);
            }
        }
    }

    /* ── Process an incoming snapshot ─────────────────────── */
    function _applySnapshot(newStatus) {
        const prev = _latestStatus;
        _latestStatus = newStatus || {};

        // Find what changed
        const allNames = new Set([...Object.keys(prev), ...Object.keys(_latestStatus)]);
        allNames.forEach(name => {
            const oldSt  = prev[name]         || null;
            const newSt  = _latestStatus[name] || null;
            const oldClosed = _isClosed(oldSt);
            const newClosed = _isClosed(newSt);
            const oldReason = oldSt?.reason  || '';
            const newReason = newSt?.reason  || '';
            const oldOpens  = oldSt?.opensAt || '';
            const newOpens  = newSt?.opensAt || '';

            const changed = oldClosed !== newClosed
                         || oldReason !== newReason
                         || oldOpens  !== newOpens;

            if (!changed) return;

            _patchStoresSection(name, newSt);
            _patchCategoriesDropdown(name, newSt);
            _patchStorePanel(name, newSt);
        });
    }

    /* ── SSE connection ────────────────────────────────────── */
    function _connect() {
        if (_sse) { try { _sse.close(); } catch (_) {} }

        _sse = new EventSource(`${PATH}?accept=text/event-stream`);

        _sse.addEventListener('put', e => {
            try {
                const msg = JSON.parse(e.data);
                // Root path — full snapshot
                if (msg.path === '/') {
                    _applySnapshot(msg.data);
                } else {
                    // Partial update: msg.path = "/StoreName"
                    const name = msg.path.replace(/^\//, '');
                    const next = { ..._latestStatus };
                    if (msg.data === null) {
                        delete next[name];
                    } else {
                        next[name] = msg.data;
                    }
                    _applySnapshot(next);
                }
                _retryMs = 2000; // reset back-off on success
            } catch (_) {}
        });

        _sse.addEventListener('patch', e => {
            try {
                const msg  = JSON.parse(e.data);
                const next = { ..._latestStatus, ...msg.data };
                _applySnapshot(next);
            } catch (_) {}
        });

        _sse.onerror = () => {
            _sse.close();
            setTimeout(_connect, _retryMs);
            _retryMs = Math.min(_retryMs * 2, MAX_RETRY);
        };
    }

    /* ── Boot ──────────────────────────────────────────────── */
    // Fetch initial snapshot first (avoid flicker from empty state)
    fetch(`${PATH}`)
        .then(r => r.json())
        .then(data => { _latestStatus = data || {}; })
        .catch(() => {})
        .finally(() => { _connect(); });

})();