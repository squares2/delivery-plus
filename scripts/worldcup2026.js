/* ══════════════════════════════════════════════════════════════
   WORLD CUP 2026 PROMO — "اختر منتخبك واربح 100$"
   ------------------------------------------------------------
   Time-boxed marketing feature, fully self-contained and driven
   entirely by settings/worldcup2026 in Firebase. The admin panel can
   switch it off instantly, and it auto-expires on its own after the
   configured window (default 14 days) even if nobody remembers to
   turn it off — see admin.html, section "🏆 حملة كأس العالم 2026".

   TO RETIRE THIS CAMPAIGN LATER, remove:
     - this file + its <script> tag in index.html
     - styles/worldcup2026.css + its <link> tag in index.html
     - the two HTML blocks marked "WORLD CUP 2026 PROMO" in index.html
     - the "🏆 حملة كأس العالم 2026" section in admin.html
   Nothing else in the app depends on any of this.
   ══════════════════════════════════════════════════════════════ */
(function () {
    const WC_RTDB     = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const WC_CFG_PATH = 'settings/worldcup2026';
    const WC_ENTRIES  = 'worldcup2026Entries';
    const WC_SEEN_KEY = 'wc2026_last_autoshow';

    let _cfg           = null;
    let _selectedTeam  = null;

    function _fetchJson(path) {
        return fetch(`${WC_RTDB}/${path}.json`).then(r => r.json()).catch(() => null);
    }

    function _isLive(cfg) {
        return !!cfg && cfg.active === true && (!cfg.expiresAt || Date.now() <= cfg.expiresAt);
    }

    /* ── Tiny self-contained toast ──────────────────────────────── */
    let _toastTimer = null;
    function _wcToast(msg, type) {
        let t = document.getElementById('wc2026-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wc2026-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'wc2026-toast wc2026-toast--' + (type || 'success') + ' wc2026-toast--visible';
        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => t.classList.remove('wc2026-toast--visible'), 3200);
    }

    /* ── Banner ──────────────────────────────────────────────────── */
    function _renderBanner() {
        const banner = document.getElementById('wc2026-banner');
        if (!banner) return;
        banner.style.display = 'flex';
        banner.addEventListener('click', openWc2026Modal);
    }

    /* ── Team grid (picker) ─────────────────────────────────────── */
    function _teamTile(code, team, selected) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wc-team-tile' + (selected ? ' wc-team-tile--selected' : '');
        btn.dataset.code = code;
        btn.innerHTML = `
            <img src="https://flagcdn.com/48x36/${team.iso2}.png" alt="${team.nameAr}" loading="lazy">
            <span>${team.nameAr}</span>
        `;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wc-team-tile--selected').forEach(el => el.classList.remove('wc-team-tile--selected'));
            btn.classList.add('wc-team-tile--selected');
            _selectedTeam = code;
            const submitBtn = document.getElementById('wc2026-submit-btn');
            if (submitBtn) submitBtn.disabled = false;
        });
        return btn;
    }

    function _renderTeamGrid(teams, filter) {
        const grid = document.getElementById('wc2026-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const q = (filter || '').trim();

        Object.keys(teams)
            .filter(code => !teams[code].eliminated)
            .filter(code => !q || teams[code].nameAr.includes(q) || teams[code].name.toLowerCase().includes(q.toLowerCase()))
            .sort((a, b) => teams[a].nameAr.localeCompare(teams[b].nameAr, 'ar'))
            .forEach(code => grid.appendChild(_teamTile(code, teams[code], code === _selectedTeam)));

        if (!grid.children.length) {
            grid.innerHTML = '<div class="wc-empty">لا توجد نتائج مطابقة</div>';
        }
    }

    /* ── Modal state switching ──────────────────────────────────── */
    function _showPickerState() {
        const picker = document.getElementById('wc2026-picker-view');
        const reg    = document.getElementById('wc2026-registered-view');
        if (picker) picker.style.display = 'block';
        if (reg)    reg.style.display    = 'none';
    }

    function _showRegisteredState(entry, teams) {
        const picker = document.getElementById('wc2026-picker-view');
        const reg    = document.getElementById('wc2026-registered-view');
        if (picker) picker.style.display = 'none';
        if (!reg) return;
        reg.style.display = 'block';

        const team = teams[entry.team] || {};
        const eliminated = !!team.eliminated;
        reg.innerHTML = `
            <div class="wc-reg-flag"><img src="https://flagcdn.com/96x72/${team.iso2 || 'un'}.png" alt=""></div>
            <div class="wc-reg-title">أنت مسجّل مع ${team.nameAr || entry.team} 🎉</div>
            <div class="wc-reg-sub">${eliminated
                ? 'للأسف، هذا المنتخب خرج من البطولة — نتمنى لك حظاً أوفر في القرعة القادمة!'
                : `بالتوفيق! إذا فاز ${team.nameAr || entry.team} بكأس العالم 2026 سنتواصل معك مباشرة للفوز بجائزة $${(_cfg && _cfg.prizeUSD) || 100}.`
            }</div>
        `;
    }

    async function _refreshModalState() {
        const teams = (_cfg && _cfg.teams) || {};
        const user  = window.DelivoUser;

        if (!user || !user.uid) {
            _showPickerState();
            _renderTeamGrid(teams);
            return;
        }

        const entry = await _fetchJson(`${WC_ENTRIES}/${user.uid}`);
        if (entry && entry.team) {
            _showRegisteredState(entry, teams);
        } else {
            _showPickerState();
            _renderTeamGrid(teams);
        }
    }

    async function openWc2026Modal() {
        if (!_isLive(_cfg)) return;
        const modal = document.getElementById('wc2026-modal');
        if (!modal) return;
        const errorEl = document.getElementById('wc2026-error');
        if (errorEl) errorEl.style.display = 'none';
        modal.style.display = 'flex';
        await _refreshModalState();
    }
    window.openWc2026Modal = openWc2026Modal;

    function closeWc2026Modal() {
        const modal = document.getElementById('wc2026-modal');
        if (modal) modal.style.display = 'none';
    }
    window.closeWc2026Modal = closeWc2026Modal;

    async function _submitEntry() {
        if (!_selectedTeam || !_cfg) return;
        const errorEl = document.getElementById('wc2026-error');
        if (errorEl) errorEl.style.display = 'none';

        const user = window.DelivoUser;
        if (!user || !user.uid) {
            closeWc2026Modal();
            setTimeout(() => { if (typeof openModal === 'function') openModal('modal-login'); }, 200);
            return;
        }

        const rawPhone = user.phone || '';
        if (!rawPhone) {
            closeWc2026Modal();
            setTimeout(() => {
                _wcToast('⚠️ أضف رقم هاتفك أولاً للتسجيل في السحب', 'error');
                if (typeof openModal === 'function') openModal('modal-account');
            }, 200);
            return;
        }
        const phone = rawPhone.startsWith('+961') ? rawPhone : '+961' + rawPhone;

        const submitBtn = document.getElementById('wc2026-submit-btn');
        const originalHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span>جاري التسجيل…</span>'; }

        try {
            const entry = {
                team:        _selectedTeam,
                displayName: user.displayName || user.username || '',
                username:    user.username || '',
                phone:       phone,
                ts:          new Date().toISOString(),
            };
            const resp = await fetch(`${WC_RTDB}/${WC_ENTRIES}/${user.uid}.json`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(entry),
            });
            if (!resp.ok) throw new Error('network');

            _showRegisteredState(entry, _cfg.teams || {});
            _wcToast('🎉 تم تسجيلك بنجاح — بالتوفيق!', 'success');
        } catch (e) {
            if (errorEl) { errorEl.textContent = 'تعذّر إتمام التسجيل، تحقق من الاتصال وحاول مجدداً'; errorEl.style.display = 'block'; }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
        }
    }

    /* ── Auto-show once a day (skips if another modal is already open) ── */
    function _tryAutoShow() {
        if (document.getElementById('ob-overlay') || document.querySelector('.modal-overlay.active')) {
            setTimeout(_tryAutoShow, 1200);
            return;
        }
        const today = new Date().toDateString();
        if (localStorage.getItem(WC_SEEN_KEY) === today) return;
        localStorage.setItem(WC_SEEN_KEY, today);
        openWc2026Modal();
    }

    async function _init() {
        _cfg = await _fetchJson(WC_CFG_PATH);
        if (!_isLive(_cfg)) return; // campaign inactive/expired — render nothing at all

        _renderBanner();

        const searchInput = document.getElementById('wc2026-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => _renderTeamGrid(_cfg.teams || {}, searchInput.value));
        }
        const closeBtn = document.getElementById('wc2026-close');
        if (closeBtn) closeBtn.addEventListener('click', closeWc2026Modal);

        const overlay = document.getElementById('wc2026-modal');
        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWc2026Modal(); });

        const submitBtn = document.getElementById('wc2026-submit-btn');
        if (submitBtn) submitBtn.addEventListener('click', _submitEntry);

        setTimeout(_tryAutoShow, 2200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }
})();