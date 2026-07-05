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

    /* ── Bracket shape (fixed tournament facts) ──────────────────────
       This encodes WHO PLAYED WHOM and WHEN, starting at the Round of
       32 — this never changes, so it's safe to hardcode. It does NOT
       encode which team is currently alive; that always comes live
       from _cfg.teams[code].eliminated (admin-controlled), so a team
       greys out here the instant the admin flips its toggle, with no
       edit to this file required.
       Order: 16 R32 matches, left draw (quadrants 1–4) then right
       draw (quadrants 5–8), matching the official bracket graphic.
       R32 results are final (Round of 32 is fully complete), so each
       match's "winner" is historical fact, not a live value. ───────── */
    const WC2026_R32 = [
        { date:'29 يونيو', teams:['BRA','JPN'], winner:'BRA' },
        { date:'30 يونيو', teams:['NOR','CIV'], winner:'NOR' },
        { date:'30 يونيو', teams:['MEX','ECU'], winner:'MEX' },
        { date:'1 يوليو',  teams:['ENG','COD'], winner:'ENG' },
        { date:'3 يوليو',  teams:['ARG','CPV'], winner:'ARG' },
        { date:'3 يوليو',  teams:['EGY','AUS'], winner:'EGY' },
        { date:'2 يوليو',  teams:['SUI','DZA'], winner:'SUI' },
        { date:'3 يوليو',  teams:['COL','GHA'], winner:'COL' },
        { date:'29 يونيو', teams:['PAR','GER'], winner:'PAR' },
        { date:'30 يونيو', teams:['FRA','SWE'], winner:'FRA' },
        { date:'2 يوليو',  teams:['ESP','AUT'], winner:'ESP' },
        { date:'2 يوليو',  teams:['POR','CRO'], winner:'POR' },
        { date:'1 يوليو',  teams:['USA','BIH'], winner:'USA' },
        { date:'1 يوليو',  teams:['BEL','SEN'], winner:'BEL' },
        { date:'28 يونيو', teams:['CAN','RSA'], winner:'CAN' },
        { date:'29 يونيو', teams:['MAR','NED'], winner:'MAR' },
    ];
    // One date per R16 match — pairs consecutive R32 matches (0-1, 2-3, …)
    const WC2026_R16_DATES = ['5 يوليو','6 يوليو','7 يوليو','7 يوليو','4 يوليو','6 يوليو','6 يوليو','4 يوليو'];
    // One date per QF — pairs consecutive R16 matches (0-1, 2-3, 4-5, 6-7)
    const WC2026_QF_DATES  = ['12 يوليو','12 يوليو','9 يوليو','9 يوليو'];
    // One date per SF — pairs consecutive QF (0-1, 2-3)
    const WC2026_SF_DATES  = ['15 يوليو','14 يوليو'];
    const WC2026_FINAL_DATE = '19 يوليو';

    /* ── Bracket rendering ────────────────────────────────────────── */
    function _wcTeamChip(code, teams, selectedCode) {
        const team = teams[code] || { nameAr: code, iso2: 'un' };
        const eliminated = !!team.eliminated;
        const selected   = code === selectedCode;
        const cls = ['wc-node-team'];
        if (eliminated) cls.push('wc-node-team--out');
        if (selected)   cls.push('wc-node-team--selected');
        return `
            <div class="${cls.join(' ')}" data-code="${eliminated ? '' : code}" data-teamcode="${code}">
                <img src="https://flagcdn.com/24x18/${team.iso2}.png" alt="" loading="lazy">
                <span>${team.nameAr}</span>
                ${eliminated ? '<em class="wc-node-out-badge">خرج</em>' : ''}
            </div>`;
    }

    function _wcMatchBox(date, codesOrNull, teams, selectedCode) {
        const body = codesOrNull
            ? codesOrNull.map(c => _wcTeamChip(c, teams, selectedCode)).join('')
            : '<div class="wc-node-tbd">لم يُحدَّد بعد</div>';
        return `<div class="wc-node"><div class="wc-node-date">${date}</div>${body}</div>`;
    }

    function _wcColumn(title, html) {
        return `<div class="wc-round"><div class="wc-round-title">${title}</div><div class="wc-round-body">${html}</div></div>`;
    }

    function _renderBracket(teams, selectedCode) {
        const host = document.getElementById('wc2026-bracket');
        if (!host) return;

        const r32Html = WC2026_R32.map(m => _wcMatchBox(m.date, m.teams, teams, selectedCode)).join('');

        const r16Html = WC2026_R16_DATES.map((date, i) => {
            const a = WC2026_R32[i * 2], b = WC2026_R32[i * 2 + 1];
            return _wcMatchBox(date, [a.winner, b.winner], teams, selectedCode);
        }).join('');

        const qfHtml = WC2026_QF_DATES.map(date => _wcMatchBox(date, null, teams, selectedCode)).join('');
        const sfHtml = WC2026_SF_DATES.map(date => _wcMatchBox(date, null, teams, selectedCode)).join('');
        const fHtml  = _wcMatchBox(WC2026_FINAL_DATE, null, teams, selectedCode);

        host.innerHTML = `
            ${_wcColumn('دور الـ32', r32Html)}
            ${_wcColumn('دور الـ16', r16Html)}
            ${_wcColumn('ربع النهائي', qfHtml)}
            ${_wcColumn('نصف النهائي', sfHtml)}
            ${_wcColumn('🏆 النهائي', fHtml)}
        `;

        host.querySelectorAll('.wc-node-team[data-code]:not([data-code=""])').forEach(el => {
            el.addEventListener('click', () => {
                const code = el.dataset.code;
                _selectedTeam = code;
                host.querySelectorAll('.wc-node-team').forEach(x => x.classList.remove('wc-node-team--selected'));
                host.querySelectorAll(`.wc-node-team[data-teamcode="${code}"]`).forEach(x => x.classList.add('wc-node-team--selected'));
                const submitBtn = document.getElementById('wc2026-submit-btn');
                if (submitBtn) submitBtn.disabled = false;
                const line = document.getElementById('wc2026-selected-line');
                if (line) line.textContent = `منتخبك المختار: ${(teams[code] || {}).nameAr || code}`;
            });
        });
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
            _renderBracket(teams, _selectedTeam);
            return;
        }

        const entry = await _fetchJson(`${WC_ENTRIES}/${user.uid}`);
        if (entry && entry.team) {
            _showRegisteredState(entry, teams);
        } else {
            _showPickerState();
            _renderBracket(teams, _selectedTeam);
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