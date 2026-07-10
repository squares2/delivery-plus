/* ============================================================
   scripts/modal-auth.js
   Wires login, register, and account modals.
   Username + Password auth. SMS ready to re-enable later.
   ============================================================ */

// ── "روح لواتساب وشوف كود التحقق" button ──────────────────────
// Many users don't realize the OTP arrives as a WhatsApp message (not
// SMS, not in-app) and never think to check. This resolves the actual
// number Delivo sends from (settings/adminPhone — the same number
// already used for admin WhatsApp contact/notifications elsewhere) and
// points the button straight at that chat thread, so tapping it opens
// WhatsApp exactly where the code is sitting instead of just the app.
let _cachedWaAdminPhone = null;
async function _getWaAdminPhone() {
    if (_cachedWaAdminPhone) return _cachedWaAdminPhone;
    try {
        const r = await fetch('https://deliveryonline-300f7-default-rtdb.firebaseio.com/settings/adminPhone.json');
        const val = await r.json();
        if (val) _cachedWaAdminPhone = String(val).replace(/\D/g, '');
    } catch (_) { /* keep the generic wa.me fallback already in the href */ }
    return _cachedWaAdminPhone;
}
async function _wireOtpWaButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const phone = await _getWaAdminPhone();
    if (phone) btn.href = `https://wa.me/${phone}`;
}

// ── Leaflet: lazy-loaded on first actual use ────────────────
// Used by the registration/edit-address map pickers and the live order
// tracking map. Loading it eagerly on every homepage visit costs every
// visitor a third-party round-trip (unpkg.com) + payload for a feature
// most sessions never touch. This loads it once, on demand, and caches
// the same promise so concurrent callers don't trigger duplicate loads.
let _leafletLoadPromise = null;
function _ensureLeafletLoaded() {
    if (window.L) return Promise.resolve();
    if (_leafletLoadPromise) return _leafletLoadPromise;

    _leafletLoadPromise = new Promise((resolve, reject) => {
        let cssReady = false;
        let jsReady  = false;
        let failed   = false;
        const maybeResolve = () => { if (cssReady && jsReady && !failed) resolve(); };
        const onFail = (what) => {
            if (failed) return;
            failed = true;
            _leafletLoadPromise = null;
            reject(new Error(`Failed to load Leaflet ${what}`));
        };

        const cssLink = document.createElement('link');
        cssLink.rel    = 'stylesheet';
        cssLink.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        cssLink.onload = () => { cssReady = true; maybeResolve(); };
        cssLink.onerror = () => onFail('CSS');
        document.head.appendChild(cssLink);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload  = () => { jsReady = true; maybeResolve(); };
        script.onerror = () => onFail('JS');
        document.head.appendChild(script);
    });

    return _leafletLoadPromise;
}

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
    // OTP state — persisted in sessionStorage to survive page refreshes
    const OTP_SS_KEY  = 'delivo_otp_state';
    const OTP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    function _saveOtpState(state) { sessionStorage.setItem(OTP_SS_KEY, JSON.stringify(state)); }
    function _loadOtpState()      { try { return JSON.parse(sessionStorage.getItem(OTP_SS_KEY)||'null'); } catch(_){ return null; } }
    function _clearOtpState()     { sessionStorage.removeItem(OTP_SS_KEY); }

    let _otpResendTimer = null;
    let _otpExpireTimer = null;
    let _otpSendInFlight = false;      // guards against double-fire while a send request is still in the air
    const OTP_SEND_TIMEOUT   = 20000;  // ms — hard cap so a bad connection can't hang the request forever
    const OTP_RETRY_COOLDOWN = 30;     // seconds — forced wait after ANY send attempt (success OR failure) so a
                                        // flaky connection can't be used to spam repeated real WhatsApp sends

    function _generateOtp() { return Math.floor(1000 + Math.random() * 9000).toString(); }

    // Disables a button and shows a countdown, regardless of whether the last attempt succeeded or failed.
    function _lockButtonWithCooldown(btn, seconds, restoreLabel) {
        if (!btn) return;
        btn.disabled = true;
        let rem = seconds;
        const tick = () => {
            btn.textContent = `⏳ انتظر ${rem} ثانية...`;
            rem--;
            if (rem < 0) { btn.disabled = false; btn.textContent = restoreLabel; }
            else setTimeout(tick, 1000);
        };
        tick();
    }

    function _startOtpCountdown(seconds) {
        const timerEl   = document.getElementById('otp-timer');
        const resendBtn = document.getElementById('otp-resend-btn');
        if (resendBtn) resendBtn.disabled = true;
        clearInterval(_otpResendTimer);
        let rem = seconds;
        _otpResendTimer = setInterval(() => {
            rem--;
            if (timerEl) timerEl.textContent = `إعادة الإرسال متاحة بعد ${rem} ثانية`;
            if (rem <= 0) { clearInterval(_otpResendTimer); if(timerEl)timerEl.textContent=''; if(resendBtn)resendBtn.disabled=false; }
        }, 1000);
    }

    function _startExpireCountdown(expiresAt) {
        clearTimeout(_otpExpireTimer);
        const _tick = () => {
            const left = expiresAt - Date.now();
            if (left <= 0) { _cancelOtpStep(); return; }
            const timerEl = document.getElementById('otp-timer');
            const resendRunning = document.getElementById('otp-resend-btn')?.disabled;
            if (timerEl && !resendRunning) {
                const m = Math.floor(left/60000), s = Math.floor((left%60000)/1000);
                timerEl.textContent = `⏰ ينتهي الكود بعد ${m}:${s.toString().padStart(2,"0")}`;
            }
            _otpExpireTimer = setTimeout(_tick, 1000);
        };
        _otpExpireTimer = setTimeout(_tick, 1000);
        // Hard cancel when expired
        setTimeout(_cancelOtpStep, Math.max(0, expiresAt - Date.now()));
    }

    function _cancelOtpStep() {
        clearInterval(_otpResendTimer); clearTimeout(_otpExpireTimer); _clearOtpState();
        const otpStep   = document.getElementById('otp-step');
        const regBtn    = document.getElementById('reg-submit');
        const cancelBtn = document.getElementById('otp-cancel-btn');
        const timerEl   = document.getElementById('otp-timer');
        if (otpStep)   otpStep.style.display   = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (regBtn)    regBtn.textContent       = 'إرسال كود التحقق';
        if (timerEl)   timerEl.textContent      = '';
        const errorEl = document.getElementById('reg-error');
        showError(errorEl, '⌛ انتهت صلاحية كود التحقق. يمكنك إرسال كود جديد.');
    }

    // Lebanese local numbers starting with "03" carry a leading 0 that is NOT part
    // of the international number (e.g. local 03 123 456 -> intl 961 3 123 456).
    // Other prefixes (70/71/76/78/79/81/82/83/86) have no leading 0 to strip.
    function _toIntlPhone(phone) {
        return String(phone || '').replace(/^0/, '');
    }

    async function _sendOtpWhatsapp(phone) {
        // Try window vars first (set by firebase-init.js on load)
        let idInstance = window._greenApiInstance || '';
        let apiToken   = window._greenApiToken    || '';
        // If not loaded yet, fetch directly from RTDB
        if (!idInstance || !apiToken) {
            try {
                const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                const r = await fetch(`${RTDB}/settings.json`);
                const s = r.ok ? await r.json() : null;
                if (s?.greenApiInstance) idInstance = window._greenApiInstance = s.greenApiInstance;
                if (s?.greenApiToken)    apiToken   = window._greenApiToken    = s.greenApiToken;
            } catch(_) {}
        }
        if (!idInstance || !apiToken) throw new Error('GREEN-API غير مهيأ. تحقق من إعدادات الأدمن.');
        const code    = _generateOtp();
        const chatId  = '961' + _toIntlPhone(phone) + '@c.us';
        const message = `🔐 كود تفعيل حسابك في Delivo:

*${code}*

صالح لمدة 5 دقائق. لا تشاركه مع أحد.`;
        // GREEN-API endpoint: server prefix = first 4 digits of instance ID
        const _gaServer = String(idInstance).slice(0, 4);
        const apiUrl  = `https://${_gaServer}.api.greenapi.com/waInstance${idInstance}/sendMessage/${apiToken}`;
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), OTP_SEND_TIMEOUT);
        let resp;
        try {
            resp = await fetch(apiUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ chatId, message }),
                signal:  controller.signal,
            });
        } catch (err) {
            // On a bad connection the request may still have reached Green-API even though we never got
            // a response — don't imply the user should just try again right away.
            if (err.name === 'AbortError') throw new Error('⏳ الاتصال بطيء جداً. قد يكون الكود قد أُرسل بالفعل — تحقق من واتساب قبل طلب كود جديد.');
            throw new Error('تعذر الاتصال بالخادم. تحقق من شبكتك — قد يكون الكود قد وصل، تحقق من واتساب أولاً.');
        } finally {
            clearTimeout(timeoutId);
        }
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || `فشل إرسال كود OTP (${resp.status})`);
        return code;
    }

    // ── Real-time username availability check ───────────────────
    const FS_BASE = 'https://firestore.googleapis.com/v1/projects/deliveryonline-300f7/databases/(default)/documents';
    const RTDB_CHECK = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    let _usernameCheckTimer   = null;
    let _usernameAvailable    = null;  // null=unchecked, true=available, false=taken
    let _usernameCheckedVal   = null;  // the exact value _usernameAvailable currently reflects
    let _usernameCheckPromise = null;  // in-flight check, so submit can await it instead of racing it
    let _phoneAvailable       = true;

    const regUsernameEl = document.getElementById('reg-username');

    // Does the actual availability lookup for `val` and updates state/UI.
    // Shared by both the debounced typing check and the submit-time
    // re-verification, so there's only one source of truth for the result.
    async function _checkUsernameNow(val) {
        const hint = regUsernameEl?.closest('.modal-field')?.querySelector('.field-hint');
        try {
            // Step 1: RTDB deletedUsernames — admin-deleted usernames are always re-available
            try {
                const delResp = await fetch(`${RTDB_CHECK}/deletedUsernames/${encodeURIComponent(val)}.json`);
                const delData = delResp.ok ? await delResp.json() : null;
                if (delData && delData.deletedAt) {
                    _usernameAvailable = true; _usernameCheckedVal = val;
                    _setFieldState(regUsernameEl, 'success', hint, '✅ اسم المستخدم متاح');
                    return true;
                }
            } catch(_) {}

            // Step 2: Firestore usernames collection
            const resp = await fetch(`${FS_BASE}/usernames/${encodeURIComponent(val)}`).catch(() => ({ status: 0 }));
            if (resp.status === 404 || resp.status === 0) {
                _usernameAvailable = true; _usernameCheckedVal = val;
                _setFieldState(regUsernameEl, 'success', hint, '✅ اسم المستخدم متاح');
                return true;
            } else if (resp.status === 200) {
                _usernameAvailable = false; _usernameCheckedVal = val;
                _setFieldState(regUsernameEl, 'error', hint, '❌ اسم المستخدم محجوز، اختر اسماً آخر');
                return false;
            } else {
                // Ambiguous network response (e.g. transient error) — don't
                // claim it's taken, just leave it unresolved so submit knows
                // to re-try rather than trusting a false negative.
                _usernameAvailable = null; _usernameCheckedVal = null;
                _setFieldState(regUsernameEl, 'idle', hint, 'أحرف إنجليزية، أرقام، _ فقط');
                return null;
            }
        } catch (_) {
            _usernameAvailable = null; _usernameCheckedVal = null;
            _setFieldState(regUsernameEl, 'idle', hint, 'أحرف إنجليزية، أرقام، _ فقط');
            return null;
        }
    }

    // Called right before submit. If the field's current value already
    // matches what _usernameAvailable reflects (and nothing is mid-flight),
    // the cached result is trustworthy and we return instantly. Otherwise
    // (user typed fast and hit submit before the debounce fired, or the
    // last check was inconclusive) we run one immediate, un-debounced check
    // against the CURRENT value before letting the form proceed or block.
    async function _ensureUsernameChecked() {
        if (!regUsernameEl) return _usernameAvailable;
        const val = regUsernameEl.value.trim().toLowerCase();
        if (!val || val.length < 3 || !/^[a-z0-9_]{3,30}$/.test(val)) {
            _usernameAvailable = false; _usernameCheckedVal = val;
            return false;
        }
        if (_usernameCheckedVal === val && _usernameAvailable !== null && !_usernameCheckPromise) {
            return _usernameAvailable; // already verified against this exact value
        }
        clearTimeout(_usernameCheckTimer);
        if (_usernameCheckPromise) { await _usernameCheckPromise; }
        if (_usernameCheckedVal === val) return _usernameAvailable; // the in-flight check we awaited already covered it
        const hint = regUsernameEl.closest('.modal-field')?.querySelector('.field-hint');
        _setFieldState(regUsernameEl, 'loading', hint, '⏳ جاري التحقق…');
        _usernameCheckPromise = _checkUsernameNow(val);
        const result = await _usernameCheckPromise;
        _usernameCheckPromise = null;
        return result;
    }

    if (regUsernameEl) {
        regUsernameEl.addEventListener('input', () => {
            clearTimeout(_usernameCheckTimer);
            const val = regUsernameEl.value.trim().toLowerCase();
            const hint = regUsernameEl.closest('.modal-field')?.querySelector('.field-hint');

            if (!val || val.length < 3) {
                _usernameAvailable = false; _usernameCheckedVal = val;
                _setFieldState(regUsernameEl, 'idle', hint, 'أحرف إنجليزية، أرقام، _ فقط');
                return;
            }
            if (!/^[a-z0-9_]{3,30}$/.test(val)) {
                _usernameAvailable = false; _usernameCheckedVal = val;
                _setFieldState(regUsernameEl, 'error', hint, 'أحرف إنجليزية صغيرة، أرقام، _ فقط (3-30 حرف)');
                return;
            }

            _setFieldState(regUsernameEl, 'loading', hint, '⏳ جاري التحقق…');
            _usernameCheckTimer = setTimeout(() => {
                _usernameCheckPromise = _checkUsernameNow(val);
                _usernameCheckPromise.finally(() => { _usernameCheckPromise = null; });
            }, 500);
        });  // end regUsernameEl.addEventListener
    }  // end if (regUsernameEl)

    // ── Real-time phone uniqueness check ─────────────────────────
    let _phoneCheckTimer = null;
    const regPhoneEl = document.getElementById('reg-phone');
    if (regPhoneEl) {
        regPhoneEl.addEventListener('input', () => {
            clearTimeout(_phoneCheckTimer);
            const digits = regPhoneEl.value.replace(/[\s\-]/g, '');
            const hint   = regPhoneEl.closest('.modal-field')?.querySelector('.field-hint');

            if (!digits || digits.length < 7) {
                _phoneAvailable = true;
                _setFieldState(regPhoneEl, 'idle', hint, 'مثال: 03 123 456 أو 71 123 456');
                return;
            }
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(digits)) {
                _phoneAvailable = false;
                _setFieldState(regPhoneEl, 'error', hint, 'رقم لبناني غير صحيح. مثال: 71 123 456');
                return;
            }

            _setFieldState(regPhoneEl, 'loading', hint, '⏳ جاري التحقق…');
            _phoneCheckTimer = setTimeout(async () => {
                try {
                    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                    const [phResp, limitResp] = await Promise.all([
                        fetch(`${RTDB}/phoneIndex/${digits}.json`),
                        fetch(`${RTDB}/settings/maxAccountsPerPhone.json`),
                    ]);
                    const data  = await phResp.json();
                    const limit = Math.max(1, parseInt(await limitResp.json()) || 1);
                    // Count existing accounts on this number
                    let phCount = 0;
                    if (data !== null) {
                        phCount = (typeof data === 'object' && !Array.isArray(data))
                            ? Object.keys(data).length : 1;
                    }
                    if (phCount >= limit) {
                        _phoneAvailable = false;
                        _setFieldState(regPhoneEl, 'error', hint, '❌ هذا الرقم مسجّل مسبقاً. استخدم رقماً آخر أو سجّل دخولك');
                    } else {
                        _phoneAvailable = true;
                        _setFieldState(regPhoneEl, 'success', hint, '✅ الرقم متاح');
                    }
                } catch (_) {
                    _phoneAvailable = true;
                    _setFieldState(regPhoneEl, 'idle', hint, 'مثال: 03 123 456 أو 71 123 456');
                }
            }, 600);
        });
    }

    function _setFieldState(inputEl, state, hintEl, msg) {
        inputEl.style.borderColor = state === 'success' ? '#22c55e'
                                  : state === 'error'   ? '#ef4444'
                                  : state === 'loading' ? 'rgba(255,255,255,0.25)'
                                  : '';
        if (hintEl) {
            hintEl.textContent = msg;
            hintEl.style.color = state === 'success' ? '#22c55e'
                               : state === 'error'   ? '#ef4444'
                               : state === 'loading' ? 'rgba(255,255,255,0.45)'
                               : '';
        }
    }

    // ── Restore OTP state after refresh ──────────────────────
    function _restoreOtpState() {
        const state = _loadOtpState();
        if (!state || Date.now() > state.expiresAt) { _clearOtpState(); return; }

        // Registration is phone-first only now — a restored session (from
        // before this change, or from any legacy save shape) is always
        // treated as 'fresh' phone-first mode on restore, never the old
        // username+password flow. This is what makes reg-submit's confirm
        // step call _handlePhoneFirstRegSubmit() instead of falling
        // through to legacy account creation (window._phoneFirstMode was
        // never set here before, so it defaulted to falsy = legacy).
        window._phoneFirstMode      = 'fresh';
        window._phoneFirstLead      = null;
        window._phoneFirstOnSuccess = null;

        // Re-fill fields — supports both the current save shape
        // ({fullName, phone, lat, lng}) and any older one still sitting
        // in a visitor's sessionStorage ({displayName, phone, lat, lng}).
        const fillField = (id, val) => { const el=document.getElementById(id); if(el&&val) el.value=val; };
        fillField('reg-displayname', state.fullName || state.displayName);
        fillField('reg-phone',       state.phone);
        fillField('reg-lat',         state.lat);
        fillField('reg-lng',         state.lng);
        _phoneAvailable = true;

        // Username/password fields must stay hidden here too, exactly
        // like startFreshRegistration()/startPhoneFirstRegistration()
        // already do when opening this modal directly. Without this,
        // refreshing mid-OTP (page reload wipes the inline styles those
        // functions had set) brought back the old-looking full form with
        // those fields visible again, even though nothing can actually
        // be created through them anymore.
        const usernameField = document.getElementById('reg-username-field');
        const passwordField = document.getElementById('reg-password-field');
        const displaynameField = document.getElementById('reg-displayname-field');
        if (usernameField) usernameField.style.display = 'none';
        if (passwordField) passwordField.style.display = 'none';
        if (displaynameField) {
            displaynameField.style.display = '';
            const label = displaynameField.querySelector('label');
            if (label) label.textContent = 'الاسم الكامل';
        }

        // Open modal and show OTP step
        document.getElementById('modal-subscribe')?.classList.add('active');
        const otpStep = document.getElementById('otp-step');
        if (otpStep) {
            otpStep.style.display = 'block';
            const hint = document.getElementById('otp-hint');
            if (hint) hint.textContent = `تم إرسال كود إلى واتساب رقم 961${_toIntlPhone(state.phone)} — أدخله أدناه`;
            _wireOtpWaButton('otp-open-wa-btn');
        }
        const regBtn = document.getElementById('reg-submit');
        if (regBtn) regBtn.textContent = 'تأكيد الكود وإنشاء الحساب';
        const cancelBtn = document.getElementById('otp-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'flex';

        const remainSec = Math.floor((state.expiresAt - Date.now()) / 1000);
        _startOtpCountdown(Math.min(60, remainSec));
        _startExpireCountdown(state.expiresAt);
    }
    setTimeout(_restoreOtpState, 650);

    const regBtn    = document.getElementById('reg-submit');
    const resendBtn = document.getElementById('otp-resend-btn');
    const cancelBtn = document.getElementById('otp-cancel-btn');

    if (cancelBtn) cancelBtn.addEventListener('click', _cancelOtpStep);

    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            if (_otpSendInFlight) return; // ignore extra taps while a send is already in the air
            const state   = _loadOtpState();
            const phone   = state?.phone || document.getElementById('reg-phone')?.value.replace(/[\s\-]/g,'') || '';
            const errorEl = document.getElementById('reg-error');
            _otpSendInFlight = true;
            setLoading(resendBtn, true, '⏳');
            try {
                const code      = await _sendOtpWhatsapp(phone);
                const expiresAt = Date.now() + OTP_TIMEOUT;
                _saveOtpState({ ...(state||{}), code, expiresAt });
                _startOtpCountdown(60); _startExpireCountdown(expiresAt);
                const hint = document.getElementById('otp-hint');
                if (hint) hint.textContent = `✅ أُعيد إرسال الكود إلى واتساب رقم 961${_toIntlPhone(phone)}`;
            } catch(e) {
                showError(errorEl, e.message);
                // Force a cooldown even on failure — a flaky connection must not be able to trigger repeated
                // real sends just by getting the user to keep tapping "resend".
                _lockButtonWithCooldown(resendBtn, OTP_RETRY_COOLDOWN, 'إعادة الإرسال');
                _otpSendInFlight = false;
                return;
            }
            _otpSendInFlight = false;
        });
    }

    if (regBtn) {
        regBtn.addEventListener('click', async () => {
            // ══ Phone-first mode — this modal is being reused from checkout
            // to complete a lead's registration. Handled entirely separately
            // below so the existing username/password paths are untouched. ══
            if (window._phoneFirstMode) { await _handlePhoneFirstRegSubmit(); return; }

            const username    = document.getElementById('reg-username')?.value    || '';
            const displayName = document.getElementById('reg-displayname')?.value || '';
            const password    = document.getElementById('reg-password')?.value    || '';
            const phoneRaw    = document.getElementById('reg-phone')?.value       || '';
            const lat         = document.getElementById('reg-lat')?.value         || null;
            const lng         = document.getElementById('reg-lng')?.value         || null;
            const errorEl     = document.getElementById('reg-error');

            const phoneDigits = phoneRaw.replace(/[\s\-]/g, '');
            if (!phoneDigits) { showError(errorEl, 'رقم الهاتف مطلوب. أدخل رقمك اللبناني.'); return; }
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits)) {
                showError(errorEl, 'رقم الهاتف غير صحيح. مثال: 03 123 456 أو 71 123 456'); return;
            }

            const isOtpMode        = window._regType === 'otp';
            const otpStep          = document.getElementById('otp-step');
            const saved            = _loadOtpState();
            // On the OTP confirm step, the location was already validated
            // and saved before the code was sent — no need to re-check it.
            const isOtpConfirmStep = isOtpMode && saved && otpStep?.style.display !== 'none';

            if (!isOtpConfirmStep && !_requireRegLocation()) {
                showError(errorEl, '📍 يجب تحديد موقعك لإتمام إنشاء الحساب');
                return;
            }

            // Restrict registration to the admin-configured delivery coverage
            // circle (settings/deliveryCenter). Only runs once — the OTP
            // confirm step reuses the location already validated when the
            // code was first sent, same as the required-location check above.
            if (!isOtpConfirmStep) {
                const regLat = parseFloat(document.getElementById('reg-lat')?.value);
                const regLng = parseFloat(document.getElementById('reg-lng')?.value);
                if (typeof window._checkCoverageOrWarn === 'function') {
                    const insideCoverage = await window._checkCoverageOrWarn(regLat, regLng, () => {
                        // "Change location" from the coverage popup — scroll back
                        // to the registration location picker so the customer can
                        // pick a point inside the circle.
                        document.getElementById('reg-location-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        document.getElementById('reg-location-map')?.click();
                    }, (lat, lng) => {
                        // Confirmed directly on the coverage-warning map (drag,
                        // click, or GPS there) — write it straight back into the
                        // registration form's own fields, same as the reg map does.
                        document.getElementById('reg-lat').value = lat;
                        document.getElementById('reg-lng').value = lng;
                        window._regLocationSource = 'map';
                        setLocationStatus('success', '✓ تم تحديث موقعك — تابع التسجيل الآن');
                        // The reg map picker (if it was already opened earlier
                        // with the old, out-of-range pin) is likely hidden right
                        // now (reg-map-wrap is display:none unless the customer
                        // has that picker open). Leaflet can't reliably reposition
                        // itself on a hidden 0×0 container, so instead of trying
                        // to live-update it, just tear it down — it fully
                        // reinitializes centered on the corrected reg-lat/reg-lng
                        // the next time "اختر على الخريطة" is opened.
                        if (window._regMap) {
                            window._regMap.remove();
                            window._regMap    = null;
                            window._regMarker = null;
                        }
                        const regMapWrap = document.getElementById('reg-map-wrap');
                        if (regMapWrap) regMapWrap.style.display = 'none';
                        document.getElementById('reg-location-map')?.classList.remove('location-opt-btn--active');
                    });
                    if (!insideCoverage) return;
                }
            }

            hideError(errorEl);

            if (isOtpMode) {
                // Step 1 — send OTP
                if (!saved || otpStep?.style.display === 'none') {
                    if (_otpSendInFlight) return; // ignore extra taps while a send is already in the air
                    if (!username)           { showError(errorEl, 'اسم المستخدم مطلوب'); return; }
                    setLoading(regBtn, true, '⏳ جاري التحقق من اسم المستخدم...');
                    const _uAvail = await _ensureUsernameChecked();
                    setLoading(regBtn, false, 'إرسال كود التحقق');
                    if (_uAvail === false) { showError(errorEl, 'اسم المستخدم محجوز أو غير صحيح. اختر اسماً آخر'); document.getElementById('reg-username')?.focus(); return; }
                    if (!displayName)        { showError(errorEl, 'الاسم الظاهر مطلوب'); return; }
                    if (password.length < 8) { showError(errorEl, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
                    if (!_phoneAvailable)    { showError(errorEl, 'هذا الرقم مسجّل مسبقاً. استخدم رقماً آخر أو سجّل دخولك'); document.getElementById('reg-phone')?.focus(); return; }

                    _otpSendInFlight = true;
                    setLoading(regBtn, true, '⏳ جاري الإرسال...');
                    try {
                        const code      = await _sendOtpWhatsapp(phoneDigits);
                        const expiresAt = Date.now() + OTP_TIMEOUT;
                        _saveOtpState({ username, displayName, password, phone: phoneDigits, lat, lng, locationSource: window._regLocationSource || null, code, expiresAt });
                        if (otpStep) { otpStep.style.display = 'block'; document.getElementById('otp-hint').textContent = `تم إرسال كود إلى واتساب رقم 961${_toIntlPhone(phoneDigits)}`; _wireOtpWaButton('otp-open-wa-btn'); }
                        if (cancelBtn) cancelBtn.style.display = 'flex';
                        regBtn.disabled = false;
                        regBtn.textContent = 'تأكيد الكود وإنشاء الحساب';
                        _startOtpCountdown(60); _startExpireCountdown(expiresAt);
                        document.getElementById('reg-otp')?.focus();
                    } catch(e) {
                        showError(errorEl, e.message);
                        // Force a cooldown even on failure — otherwise a shaky connection lets the user
                        // mash the button and fire multiple real OTP sends before ever reaching step 2.
                        _lockButtonWithCooldown(regBtn, OTP_RETRY_COOLDOWN, 'إرسال كود التحقق');
                        _otpSendInFlight = false;
                        return;
                    }
                    _otpSendInFlight = false;
                    return;
                }

                // Step 2 — verify code
                const entered = document.getElementById('reg-otp')?.value.trim() || '';
                if (!entered)      { showError(errorEl, 'أدخل كود التحقق المُرسَل على واتساب'); return; }
                if (!saved?.code)  { showError(errorEl, 'انتهت صلاحية الكود. اضغط إعادة الإرسال'); return; }
                if (Date.now() > saved.expiresAt) { _cancelOtpStep(); return; }
                if (entered !== saved.code) { showError(errorEl, '❌ الكود غير صحيح. تحقق من واتساب وحاول مجدداً'); document.getElementById('reg-otp')?.select(); return; }

                if (_otpSendInFlight) return; // extra tap while account creation is already in flight
                _otpSendInFlight = true;
                setLoading(regBtn, true, '⏳ جاري إنشاء الحساب...');
                // NOTE: don't clear the OTP state (or stop its timers) until we KNOW registration succeeded.
                // Clearing it up-front meant that a failed/timed-out register() call on bad network left the
                // OTP screen showing but the saved code gone — so the next "confirm" tap fell through to the
                // "no saved state" branch and silently fired a brand-new WhatsApp code instead of retrying.
                let result;
                try {
                    result = await window.DelivoAuth.register({ username: saved.username, displayName: saved.displayName, password: saved.password, phone: saved.phone, lat: saved.lat, lng: saved.lng, locationSource: saved.locationSource, skipDeviceLimit: true });
                } catch (e) {
                    result = { error: true, message: e?.message || 'تعذر الاتصال بالخادم. تحقق من شبكتك وحاول مجدداً' };
                }
                _otpSendInFlight = false;
                setLoading(regBtn, false, 'تأكيد الكود وإنشاء الحساب');
                if (result.error) {
                    showError(errorEl, result.message + ' — الكود ما زال صالحاً، اضغط "تأكيد" مجدداً بدون طلب كود جديد.');
                }
                else {
                    _clearOtpState(); clearInterval(_otpResendTimer); clearTimeout(_otpExpireTimer);
                    closeModal('modal-subscribe');
                    clearFields(['reg-username','reg-displayname','reg-password','reg-phone','reg-otp']);
                    resetLocationBtn();
                    if (otpStep)   otpStep.style.display   = 'none';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    regBtn.textContent = 'إرسال كود التحقق';
                }
                return;
            }

            // ── Direct mode ───────────────────────────────────
            setLoading(regBtn, true, '⏳ جاري التحقق من اسم المستخدم...');
            const _uAvailDirect = await _ensureUsernameChecked();
            if (_uAvailDirect === false) { setLoading(regBtn, false, 'إنشاء الحساب'); showError(errorEl, 'اسم المستخدم محجوز أو غير صحيح. اختر اسماً آخر'); document.getElementById('reg-username')?.focus(); return; }
            if (!_phoneAvailable)    { setLoading(regBtn, false, 'إنشاء الحساب'); showError(errorEl, 'هذا الرقم مسجّل مسبقاً. استخدم رقماً آخر أو سجّل دخولك'); document.getElementById('reg-phone')?.focus(); return; }
            setLoading(regBtn, true, 'جاري الإنشاء...');
            const result = await window.DelivoAuth.register({ username, displayName, password, phone: phoneDigits, lat, lng, locationSource: window._regLocationSource || null });
            setLoading(regBtn, false, 'إنشاء الحساب');
            if (result.error) { showError(errorEl, result.message); }
            else {
                closeModal('modal-subscribe');
                clearFields(['reg-username','reg-displayname','reg-password','reg-phone']);
                resetLocationBtn();
            }
        });
    }

    // ══════════════════════════════════════════════════════
    // PHONE-FIRST REGISTRATION (reuses modal-subscribe's own
    // location picker + OTP machinery) — two distinct modes:
    //   'checkout' — triggered from cart checkout for a guest who
    //                already gave name+phone at launch. Phone is
    //                locked (already known), location is required
    //                (an order needs a delivery address).
    //   'fresh'    — triggered by the explicit "إنشاء حساب مجاني"
    //                button. Name+phone are typed fresh right here,
    //                location is optional (can be set later at
    //                first order instead).
    // ══════════════════════════════════════════════════════

    window.startPhoneFirstRegistration = function(fullName, phone, onSuccess) {
        window._phoneFirstMode      = 'checkout';
        window._phoneFirstLead      = { fullName, phone };
        window._phoneFirstOnSuccess = onSuccess;

        document.getElementById('reg-username-field').style.display    = 'none';
        document.getElementById('reg-displayname-field').style.display = 'none';
        document.getElementById('reg-password-field').style.display    = 'none';

        const info = document.getElementById('phonefirst-info');
        if (info) {
            info.style.display = 'block';
            document.getElementById('phonefirst-name').textContent  = fullName;
            document.getElementById('phonefirst-phone').textContent = '+961 ' + phone;
        }

        // Phone field stays visible but locked — customer can SEE their
        // number before the OTP goes out, just can't accidentally change it
        // and desync it from the lead record.
        const phoneInput = document.getElementById('reg-phone');
        if (phoneInput) { phoneInput.value = phone; phoneInput.readOnly = true; }

        const regBtnEl = document.getElementById('reg-submit');
        if (regBtnEl) regBtnEl.textContent = 'تأكيد الموقع وإرسال كود التحقق';
        document.querySelector('#modal-subscribe .modal-title').textContent = 'خطوة أخيرة لإرسال طلبك';
        document.querySelector('#modal-subscribe .modal-subtitle')?.remove();

        if (typeof openModal === 'function') openModal('modal-subscribe');
    };

    // Explicit "create a new account" entry point — no existing lead
    // needed. Name + phone are typed here directly; location is entirely
    // optional (a small skip-friendly hint replaces the "required" one),
    // since there's no order in progress that needs a delivery address yet.
    window.startFreshRegistration = function(onSuccess) {
        window._phoneFirstMode      = 'fresh';
        window._phoneFirstLead      = null;
        window._phoneFirstOnSuccess = onSuccess;

        document.getElementById('reg-username-field').style.display    = 'none';
        document.getElementById('reg-password-field').style.display    = 'none';
        const dnField = document.getElementById('reg-displayname-field');
        if (dnField) {
            dnField.style.display = '';
            const label = dnField.querySelector('label');
            if (label) label.textContent = 'الاسم الكامل';
        }

        const info = document.getElementById('phonefirst-info');
        if (info) info.style.display = 'none';

        const phoneInput = document.getElementById('reg-phone');
        if (phoneInput) { phoneInput.value = ''; phoneInput.readOnly = false; }
        clearFields(['reg-displayname']);

        // Location becomes optional — swap the "required" copy for a
        // friendlier one and drop the required-asterisk visually. Uses a
        // dedicated ID so the phone field's own required-mark (which
        // shares the same CSS class) is never touched.
        const locRequiredMark = document.getElementById('reg-location-required');
        if (locRequiredMark) locRequiredMark.style.display = 'none';
        const locInfoP = document.querySelector('#modal-subscribe .location-status--info');
        if (locInfoP) locInfoP.innerHTML = 'يمكنك تحديد موقعك الآن، أو تركه وتحديده لاحقاً عند أول طلب.';

        const regBtnEl = document.getElementById('reg-submit');
        if (regBtnEl) regBtnEl.textContent = 'إنشاء الحساب';
        document.querySelector('#modal-subscribe .modal-title').textContent = 'إنشاء حساب جديد';

        if (typeof openModal === 'function') openModal('modal-subscribe');
    };

    // Reverses everything either mode above changed, so the classic
    // registration modal goes back to its normal appearance the next
    // time something opens it directly (defensive — nothing does anymore).
    function _resetPhoneFirstMode() {
        window._phoneFirstMode      = false;
        window._phoneFirstLead      = null;
        window._phoneFirstOnSuccess = null;

        const uf = document.getElementById('reg-username-field');
        const df = document.getElementById('reg-displayname-field');
        const pf = document.getElementById('reg-password-field');
        if (uf) uf.style.display = '';
        if (df) { df.style.display = ''; const l = df.querySelector('label'); if (l) l.textContent = 'الاسم الظاهر'; }
        if (pf) pf.style.display = '';

        const info = document.getElementById('phonefirst-info');
        if (info) info.style.display = 'none';

        const phoneInput = document.getElementById('reg-phone');
        if (phoneInput) phoneInput.readOnly = false;

        const locRequiredMark = document.getElementById('reg-location-required');
        if (locRequiredMark) locRequiredMark.style.display = '';

        const regBtnEl = document.getElementById('reg-submit');
        if (regBtnEl) regBtnEl.textContent = 'إنشاء الحساب';
        const titleEl = document.querySelector('#modal-subscribe .modal-title');
        if (titleEl) titleEl.textContent = 'إنشاء حساب';
    }

    async function _handlePhoneFirstRegSubmit() {
        const regBtnEl = document.getElementById('reg-submit');
        const errorEl  = document.getElementById('reg-error');
        const mode     = window._phoneFirstMode;
        const isFresh  = mode === 'fresh';

        // 'checkout' mode already knows fullName+phone from the lead;
        // 'fresh' mode reads them live from the (now-editable) fields.
        let fullName, phone;
        if (isFresh) {
            fullName = document.getElementById('reg-displayname')?.value?.trim() || '';
            const phoneRaw = document.getElementById('reg-phone')?.value || '';
            phone = phoneRaw.replace(/[\s\-]/g, '');
            if (fullName.length < 2) { showError(errorEl, 'أدخل اسمك الكامل (حرفان على الأقل)'); return; }
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phone)) { showError(errorEl, 'رقم الهاتف غير صحيح'); return; }
        } else {
            const lead = window._phoneFirstLead;
            if (!lead) return;
            fullName = lead.fullName; phone = lead.phone;
        }

        const lat = document.getElementById('reg-lat')?.value || null;
        const lng = document.getElementById('reg-lng')?.value || null;

        const otpStepEl = document.getElementById('otp-step');
        const saved      = _loadOtpState();
        const isConfirmStep = saved && otpStepEl?.style.display !== 'none';

        if (!isConfirmStep) {
            // Step 1 — validate location (required in checkout mode,
            // optional-but-validated-if-attempted in fresh mode), send OTP
            const hasAnyLocationInput = !!(lat && lng);
            if (!isFresh) {
                if (!_requireRegLocation()) {
                    showError(errorEl, '📍 يجب تحديد موقعك لإتمام الطلب');
                    return;
                }
            } else if (hasAnyLocationInput && !_requireRegLocation()) {
                // They started picking a location but it didn't validate —
                // don't silently drop it, ask them to fix or clear it.
                showError(errorEl, '📍 تعذّر تأكيد الموقع الذي حددته. عدّله أو تخطَّه.');
                return;
            }

            if (hasAnyLocationInput) {
                const regLat = parseFloat(document.getElementById('reg-lat')?.value);
                const regLng = parseFloat(document.getElementById('reg-lng')?.value);
                if (typeof window._checkCoverageOrWarn === 'function') {
                    const insideCoverage = await window._checkCoverageOrWarn(regLat, regLng, () => {
                        document.getElementById('reg-location-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        document.getElementById('reg-location-map')?.click();
                    }, (mLat, mLng) => {
                        document.getElementById('reg-lat').value = mLat;
                        document.getElementById('reg-lng').value = mLng;
                        window._regLocationSource = 'map';
                        setLocationStatus('success', '✓ تم تحديث موقعك — تابع الآن');
                    });
                    if (!insideCoverage) return;
                }
            }
            hideError(errorEl);

            if (_otpSendInFlight) return;
            _otpSendInFlight = true;
            setLoading(regBtnEl, true, '⏳ جاري الإرسال...');
            try {
                const code      = await _sendOtpWhatsapp(phone);
                const expiresAt = Date.now() + OTP_TIMEOUT;
                _saveOtpState({ fullName, phone, lat, lng, locationSource: window._regLocationSource || null, code, expiresAt });
                if (otpStepEl) { otpStepEl.style.display = 'block'; document.getElementById('otp-hint').textContent = `تم إرسال كود إلى واتساب رقم 961${_toIntlPhone(phone)}`; _wireOtpWaButton('otp-open-wa-btn'); }
                regBtnEl.disabled = false;
                regBtnEl.textContent = isFresh ? 'تأكيد الكود وإنشاء الحساب' : 'تأكيد الكود وإرسال الطلب';
                _startOtpCountdown(60); _startExpireCountdown(expiresAt);
                document.getElementById('reg-otp')?.focus();
            } catch (e) {
                showError(errorEl, e.message);
                _lockButtonWithCooldown(regBtnEl, OTP_RETRY_COOLDOWN, isFresh ? 'إنشاء الحساب' : 'تأكيد الموقع وإرسال كود التحقق');
                _otpSendInFlight = false;
                return;
            }
            _otpSendInFlight = false;
            return;
        }

        // Step 2 — verify code, create the real account
        const entered = document.getElementById('reg-otp')?.value.trim() || '';
        if (!entered)      { showError(errorEl, 'أدخل كود التحقق المُرسَل على واتساب'); return; }
        if (!saved?.code)  { showError(errorEl, 'انتهت صلاحية الكود. اضغط إعادة الإرسال'); return; }
        if (Date.now() > saved.expiresAt) { _cancelOtpStep(); return; }
        if (entered !== saved.code) { showError(errorEl, '❌ الكود غير صحيح. تحقق من واتساب وحاول مجدداً'); document.getElementById('reg-otp')?.select(); return; }

        if (_otpSendInFlight) return;
        _otpSendInFlight = true;
        setLoading(regBtnEl, true, '⏳ جاري إنشاء الحساب...');
        let result;
        try {
            result = await window.DelivoAuth.registerByPhone({ fullName: saved.fullName, phone: saved.phone, lat: saved.lat, lng: saved.lng, locationSource: saved.locationSource });
        } catch (e) {
            result = { error: true, message: e?.message || 'تعذر الاتصال بالخادم. حاول مجدداً' };
        }
        _otpSendInFlight = false;
        setLoading(regBtnEl, false, isFresh ? 'تأكيد الكود وإنشاء الحساب' : 'تأكيد الكود وإرسال الطلب');
        if (result.error) {
            showError(errorEl, result.message + ' — الكود ما زال صالحاً، اضغط "تأكيد" مجدداً بدون طلب كود جديد.');
            return;
        }

        _clearOtpState(); clearInterval(_otpResendTimer); clearTimeout(_otpExpireTimer);
        closeModal('modal-subscribe');
        const onSuccess = window._phoneFirstOnSuccess;
        _resetPhoneFirstMode();
        if (otpStepEl) otpStepEl.style.display = 'none';
        resetLocationBtn();
        clearFields(['reg-displayname', 'reg-phone', 'reg-otp']);
        if (typeof onSuccess === 'function') onSuccess();
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
                    window._regLocationSource = 'gps';
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
                    // GPS failed — do NOT silently substitute an approximate,
                    // network-based location as if it were a confirmed pin.
                    // An IP-based estimate can easily be off by a whole
                    // neighborhood, and the customer would have no idea their
                    // "location" isn't actually precise. Registration must be
                    // satisfied by either a successful GPS fix or an explicit,
                    // deliberate pin placement on the map — nothing else.
                    setLocationStatus('error', (msgs[err.code] || 'تعذّر تحديد الموقع.') + ' الرجاء الضغط على "اختر على الخريطة" وتحديد موقعك يدوياً.');
                    document.querySelectorAll('.location-opt-btn').forEach(b => {
                        if (b.id === 'reg-location-map') {
                            b.classList.add('location-opt-btn--required-pulse');
                            setTimeout(() => b.classList.remove('location-opt-btn--required-pulse'), 1200);
                        }
                    });
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    }

    // ── Location: Map picker button ──────────────────────────
    const mapBtn = document.getElementById('reg-location-map');
    if (mapBtn) {
        mapBtn.addEventListener('click', async () => {
            const mapWrap = document.getElementById('reg-map-wrap');
            mapWrap.style.display = 'block';
            mapBtn.classList.add('location-opt-btn--active');

            await _ensureLeafletLoaded();

            // Initialize Leaflet map once
            if (!window._regMap) {
                // Default center = the admin-configured Delivo center
                // (settings/deliveryCenter) so a customer with no location
                // yet opens the map already centered on the actual coverage
                // area, instead of a generic hardcoded Zahle point. Falls
                // back to that old hardcoded point only if no center has
                // been configured in admin settings at all.
                let defaultLat = 34.0040;
                let defaultLng = 36.2100;
                if (typeof window._getDeliveryCenter === 'function') {
                    try {
                        const dc = await window._getDeliveryCenter();
                        if (dc) { defaultLat = dc.lat; defaultLng = dc.lng; }
                    } catch (_) {}
                }

                // IMPORTANT: remember whether a real location was already set
                // (GPS or a previous IP-approx fallback) BEFORE we fall back to
                // the generic town-center default below. Only a real, prior
                // value should end up written into reg-lat/reg-lng — opening
                // the map picker itself must never silently satisfy the
                // required-location field with a hardcoded default. That gap
                // is exactly what used to let customers submit registration
                // with everyone pinned at the same generic spot whenever their
                // first "my location" attempt failed and they never actually
                // touched the map afterward.
                const hadPriorLat = document.getElementById('reg-lat').value;
                const hadPriorLng = document.getElementById('reg-lng').value;
                const hadPriorLocation = !!(hadPriorLat && hadPriorLng);

                let centerLat = parseFloat(hadPriorLat) || defaultLat;
                let centerLng = parseFloat(hadPriorLng) || defaultLng;

                // No location yet at all? The map now simply opens centered
                // on the Delivo coverage center (set above) instead of
                // guessing at an IP-based estimate — consistent with no
                // longer using network-approximate positions anywhere in
                // registration. The customer still must confirm a real pin
                // themselves; this only affects where the map starts.

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
                }).setView([centerLat, centerLng], hadPriorLocation ? 17 : 13);

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

                window._regMarker = L.marker([centerLat, centerLng], {
                    icon: orangeIcon,
                    draggable: true,
                }).addTo(window._regMap);

                // Drag marker — this is genuine, explicit user interaction,
                // so this (and click, below) are the only two places allowed
                // to actually populate reg-lat/reg-lng from the map.
                window._regMarker.on('dragend', (e) => {
                    const pos = e.target.getLatLng();
                    document.getElementById('reg-lat').value = pos.lat.toFixed(6);
                    document.getElementById('reg-lng').value = pos.lng.toFixed(6);
                    window._regLocationSource = 'map';
                    setLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });

                // Click anywhere on map
                window._regMap.on('click', (e) => {
                    window._regMarker.setLatLng(e.latlng);
                    document.getElementById('reg-lat').value = e.latlng.lat.toFixed(6);
                    document.getElementById('reg-lng').value = e.latlng.lng.toFixed(6);
                    window._regLocationSource = 'map';
                    setLocationStatus('success', '✓ تم تحديد الموقع على الخريطة');
                });

                // Only re-write the fields here if a real location already
                // existed before this map opened (e.g. GPS ran first) — never
                // from the plain default/IP-approx-for-centering fallback.
                if (hadPriorLocation) {
                    document.getElementById('reg-lat').value = centerLat.toFixed(6);
                    document.getElementById('reg-lng').value = centerLng.toFixed(6);
                }

            } else {
                setTimeout(() => window._regMap.invalidateSize(), 100);
            }

            const stillUnset = !document.getElementById('reg-lat').value;
            setLocationStatus(
                stillUnset ? 'error' : 'info',
                stillUnset
                    ? '⚠ الدبوس البرتقالي مجرد اقتراح — اسحبه أو انقر على مكانك الفعلي لتأكيد موقعك، وإلا لن يتم قبول التسجيل'
                    : 'اسحب الدبوس أو انقر على الخريطة لتعديل موقعك'
            );
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
                    // Same reasoning as registration: no silent IP-approximate
                    // substitution. GPS failing must send the customer to the
                    // map picker for a deliberate, precise pin — not an
                    // auto-filled estimate they'd have no reason to doubt.
                    setEditLocationStatus('error', (msgs[err.code] || 'تعذّر تحديد الموقع.') + ' الرجاء الضغط على "اختر على الخريطة" وتحديد موقعك يدوياً.');
                    const editMapBtnRef = document.getElementById('edit-location-map');
                    if (editMapBtnRef) {
                        editMapBtnRef.classList.add('location-opt-btn--required-pulse');
                        setTimeout(() => editMapBtnRef.classList.remove('location-opt-btn--required-pulse'), 1200);
                    }
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    }

    // ── Edit profile — Map button ─────────────────────────────
    const editMapBtn = document.getElementById('edit-location-map');
    if (editMapBtn) {
        editMapBtn.addEventListener('click', async () => {
            const mapWrap = document.getElementById('edit-map-wrap');
            mapWrap.style.display = 'block';
            editMapBtn.classList.add('location-opt-btn--active');

            await _ensureLeafletLoaded();

            if (!window._editMap) {
                const GOOGLE_KEY = 'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0';

                // Same fix as the registration map picker: remember whether a
                // real location already existed BEFORE falling back to the
                // generic town-center default, and only ever write that prior,
                // real value back into the fields — never the plain fallback.
                // Otherwise a customer with no location yet who opens this map
                // just to look, then saves without touching the pin, would
                // silently get planted at the generic default point.
                const hadPriorLat = document.getElementById('edit-lat').value;
                const hadPriorLng = document.getElementById('edit-lng').value;
                const hadPriorLocation = !!(hadPriorLat && hadPriorLng);

                // Default center = the admin-configured Delivo center when
                // this customer has no prior location at all (same fix as
                // the registration map picker above).
                let fallbackLat = 34.0040;
                let fallbackLng = 36.2100;
                if (!hadPriorLocation && typeof window._getDeliveryCenter === 'function') {
                    try {
                        const dc = await window._getDeliveryCenter();
                        if (dc) { fallbackLat = dc.lat; fallbackLng = dc.lng; }
                    } catch (_) {}
                }

                const savedLat = parseFloat(hadPriorLat) || fallbackLat;
                const savedLng = parseFloat(hadPriorLng) || fallbackLng;

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
                    .setView([savedLat, savedLng], hadPriorLocation ? 17 : 13);
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

                // Only re-write the fields here if a real location already
                // existed before this map opened — never from the plain
                // fallback default.
                if (hadPriorLocation) {
                    document.getElementById('edit-lat').value = savedLat.toFixed(6);
                    document.getElementById('edit-lng').value = savedLng.toFixed(6);
                }

            } else {
                setTimeout(() => window._editMap.invalidateSize(), 100);
            }
            const stillUnset = !document.getElementById('edit-lat').value;
            setEditLocationStatus(
                stillUnset ? 'error' : 'info',
                stillUnset
                    ? '⚠ الدبوس البرتقالي مجرد اقتراح — اسحبه أو انقر على مكانك الفعلي لتأكيد موقعك'
                    : 'اسحب الدبوس أو انقر على الخريطة لتعديل موقعك'
            );
        });
    }

    // ── Edit profile — save display name + phone ─────────────
    const editSubmit = document.getElementById('edit-submit');
    if (editSubmit) {
        editSubmit.addEventListener('click', async () => {
            const displayName = document.getElementById('edit-displayname')?.value || '';
            const phoneEl2    = document.getElementById('edit-phone');
            // If phone field is locked (readonly), don't send it — keep existing value
            const phone       = (phoneEl2?.readOnly) ? null : (phoneEl2?.value || '');
            const lat         = document.getElementById('edit-lat')?.value          || null;
            const lng         = document.getElementById('edit-lng')?.value          || null;
            const errorEl     = document.getElementById('edit-error');
            const successEl   = document.getElementById('edit-success');

            hideError(errorEl);
            hideSuccess(successEl);

            // Restrict any location set/changed here to the admin-configured
            // delivery coverage circle, same rule as registration and checkout.
            if (lat && lng && typeof window._checkCoverageOrWarn === 'function') {
                setLoading(editSubmit, true, '⏳ جاري التحقق من الموقع...');
                const insideCoverage = await window._checkCoverageOrWarn(parseFloat(lat), parseFloat(lng), () => {
                    // "Change location" from the coverage popup — reopen this
                    // profile's own map picker so the customer can pick a
                    // point inside the circle, instead of the cart's.
                    document.getElementById('edit-location-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.getElementById('edit-location-map')?.click();
                }, (newLat, newLng) => {
                    // Confirmed directly on the coverage-warning map — write
                    // back into this profile's own fields, same as its map does.
                    document.getElementById('edit-lat').value = newLat;
                    document.getElementById('edit-lng').value = newLng;
                    if (typeof setEditLocationStatus === 'function') {
                        setEditLocationStatus('success', '✓ تم تحديث موقعك — اضغط "حفظ التغييرات" مجدداً للمتابعة');
                    }
                    // Same reasoning as registration: don't try to live-update
                    // a Leaflet map that may currently be hidden (0×0 container)
                    // — destroy it so it reinitializes cleanly, centered on the
                    // corrected point, the next time the picker is opened.
                    if (window._editMap) {
                        window._editMap.remove();
                        window._editMap    = null;
                        window._editMarker = null;
                    }
                    const editMapWrap = document.getElementById('edit-map-wrap');
                    if (editMapWrap) editMapWrap.style.display = 'none';
                    document.getElementById('edit-location-map')?.classList.remove('location-opt-btn--active');
                });
                setLoading(editSubmit, false, 'حفظ التغييرات');
                if (!insideCoverage) return;
            }

            setLoading(editSubmit, true, 'جاري الحفظ...');

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
            setTimeout(() => window.openAuthModal(), 180);
            return;
        }
        if (e.target.closest('.acct-btn-register')) {
            closeModal('modal-account');
            setTimeout(() => { if (typeof window.startFreshRegistration === 'function') window.startFreshRegistration(); }, 180);
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
// ── Single entry point for every "guest needs to sign in" moment in the
// app (track-order link, World Cup entry, account modal buttons, external
// order nudge, etc.) — decides between the launch modal (genuinely new
// device) and the phone-login modal (device already has a lead or a real
// account), so nothing anywhere shows the wrong one of the two.
window.openAuthModal = async function() {
    if (typeof openModal !== 'function') return;
    let lead = null;
    try { lead = await window.DelivoAuth.getDeviceLead(); } catch (_) {}
    openModal(lead ? 'modal-login' : 'modal-launch');
};

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

        // Phone-first accounts never had a real password — there's nothing
        // to "change" — so hide that row for them. Every legacy username/
        // password account keeps seeing it exactly as before.
        const pwBtn = document.getElementById('acct-password-btn');
        if (pwBtn) pwBtn.style.display = (user.registrationMethod === 'phone-otp') ? 'none' : '';
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


// ── Location: obligatory-field guard ──────────────────────────
// Registration cannot proceed without a delivery pin — an unresolved
// location leads to missed/misdelivered orders later. This blocks
// submission, surfaces a clear error inline, and nudges the customer
// toward the two ways of setting it (GPS or map).
function _requireRegLocation() {
    const lat = document.getElementById('reg-lat')?.value;
    const lng = document.getElementById('reg-lng')?.value;
    if (lat && lng) return true;

    setLocationStatus('error', '⚠ تحديد موقعك مطلوب لإتمام التسجيل — اضغط "موقعي الحالي" أو "اختر على الخريطة" أعلاه');

    document.getElementById('reg-location-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.querySelectorAll('.location-opt-btn').forEach(b => {
        b.classList.add('location-opt-btn--required-pulse');
        setTimeout(() => b.classList.remove('location-opt-btn--required-pulse'), 1000);
    });

    return false;
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
    window._regLocationSource = null;
}

// ── Helpers ───────────────────────────────────────────────────
// ── Populate edit form with current user data ────────────────
function populateEditForm() {
    const user = window.DelivoUser;
    if (!user) return;

    // Same rule as the account menu row — no real password exists for
    // phone-otp accounts, so there's nothing here to change.
    const pwSection = document.getElementById('edit-password-section');
    if (pwSection) pwSection.style.display = (user.registrationMethod === 'phone-otp') ? 'none' : '';

    const nameEl  = document.getElementById('edit-displayname');
    const phoneEl = document.getElementById('edit-phone');
    const latEl   = document.getElementById('edit-lat');
    const lngEl   = document.getElementById('edit-lng');
    if (nameEl)  nameEl.value  = user.displayName || '';
    if (phoneEl) {
        const digits = (user.phone || '').replace('+961', '').replace(/\s/g, '');
        phoneEl.value = digits;
        if (digits) {
            // Phone is tied to the account via OTP — lock it
            phoneEl.readOnly = true;
            phoneEl.style.opacity      = '0.6';
            phoneEl.style.cursor       = 'not-allowed';
            phoneEl.style.background   = 'var(--surface3, #2a2a2a)';
            phoneEl.title              = 'رقم الهاتف مرتبط بحسابك ولا يمكن تغييره';
            // Show a small hint under the field if not already there
            const hint = phoneEl.closest('.modal-field')?.querySelector('.field-hint');
            if (hint) { hint.textContent = '🔒 رقم الهاتف مرتبط بحسابك ولا يمكن تغييره'; hint.style.color = 'var(--orange)'; }
        } else {
            phoneEl.readOnly = false;
            phoneEl.style.opacity    = '';
            phoneEl.style.cursor     = '';
            phoneEl.style.background = '';
            phoneEl.title            = '';
            const hint = phoneEl.closest('.modal-field')?.querySelector('.field-hint');
            if (hint) { hint.textContent = 'مثال: 03 123 456 أو 71 123 456'; hint.style.color = ''; }
        }
    }

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
    // The registration error is a centered popup, not an inline banner —
    // auto-dismiss it after a few seconds so it doesn't linger over the form.
    if (el.id === 'reg-error') {
        clearTimeout(el._autoHideTimer);
        el._autoHideTimer = setTimeout(() => hideError(el), 4500);
    }
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

let _ohFilter      = 'all';
let _ohOrders       = {};
let _ohListener     = null;
let _ohRenderLimit  = 20;     // how many cards to render at once
const OH_PAGE_SIZE  = 20;
const OH_FINAL_STATES = ['1', '2', '5']; // delivered / cancelled / cancelled-paid — no further changes expected

// ── Open orders modal ─────────────────────────────────────────
function openOrdersModal() {
    const sheet   = document.getElementById('orders-sheet');
    const overlay = document.getElementById('orders-sheet-overlay');
    if (!sheet || !overlay) return;
    sheet.classList.add('active');
    overlay.classList.add('active');
    document.body.classList.add('modal-open');
    _loadOrders();
    // Refresh only active (non-final) orders every 15 s while sheet is open.
    // No network call at all once every visible order is delivered/cancelled —
    // avoids re-downloading the customer's whole order history on a timer.
    if (!window._ordersRefreshTimer) {
        window._ordersRefreshTimer = setInterval(() => {
            const s = document.getElementById('orders-sheet');
            if (s && s.classList.contains('active')) _refreshActiveOrders();
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

// ── Load orders from historyRequests/{uid} (full fetch — once per open) ──
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

        _ohOrders      = data;
        _ohRenderLimit = OH_PAGE_SIZE; // reset pagination on a fresh full load
        _renderOrders();

    } catch(e) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (isFirstLoad && emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'خطأ في تحميل الطلبات';
        }
    }
}

// ── Lightweight refresh: re-check only orders still in progress ──
// Instead of re-downloading the customer's entire order history every
// 15 s, this fetches just the handful of orders that are still active
// (not yet delivered/cancelled). If everything on screen is already in
// a final state, it makes no network call at all.
async function _refreshActiveOrders() {
    const user = window.DelivoUser;
    if (!user) return;

    const activeKeys = Object.entries(_ohOrders)
        .filter(([, o]) => !OH_FINAL_STATES.includes(String(o.state || '0')))
        .map(([key]) => key);

    if (activeKeys.length === 0) return; // nothing in progress — skip entirely

    try {
        const results = await Promise.all(activeKeys.map(key =>
            fetch(`${OH_RTDB_URL}/historyRequests/${user.uid}/${key}.json`)
                .then(r => r.ok ? r.json() : null)
                .then(val => [key, val])
                .catch(() => [key, null])
        ));

        let changed = false;
        results.forEach(([key, val]) => {
            if (!val) return; // order was deleted or fetch failed — leave last known state
            if (JSON.stringify(val) !== JSON.stringify(_ohOrders[key])) {
                _ohOrders[key] = val;
                changed = true;
            }
        });

        if (changed) _renderOrders();
    } catch (e) { /* silent — will retry on next tick */ }
}

// ── Render with current filter (paginated) ─────────────────────
function _renderOrders() {
    const listEl  = document.getElementById('orders-list');
    const emptyEl = document.getElementById('orders-empty');
    if (!listEl) return;

    // Remember which card is currently expanded so we can restore it after re-render
    const expandedCard = listEl.querySelector('.oh-card.expanded');
    const expandedId   = expandedCard ? expandedCard.dataset.id : null;

    listEl.querySelectorAll('.oh-card').forEach(c => c.remove());
    listEl.querySelectorAll('.oh-load-more-btn').forEach(b => b.remove());

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

    // Only render/build DOM cards up to the current page limit — keeps the
    // sheet fast to open even for customers with a long order history.
    const visible = sorted.slice(0, _ohRenderLimit);

    visible.forEach(([key, order]) => {
        const card = _buildOrderCard(key, order);
        // Restore expanded state without animation to avoid visual jump
        if (key === expandedId) card.classList.add('expanded');
        listEl.appendChild(card);
    });

    if (sorted.length > visible.length) {
        const remaining = sorted.length - visible.length;
        const moreBtn = document.createElement('button');
        moreBtn.className = 'oh-load-more-btn';
        moreBtn.textContent = `⬇ عرض المزيد (${remaining})`;
        moreBtn.addEventListener('click', () => {
            _ohRenderLimit += OH_PAGE_SIZE;
            _renderOrders();
        });
        listEl.appendChild(moreBtn);
    }
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
let _trackDriverRotEl = null;   // cached rotation <div> — avoids querySelector every animation frame
let _trackDestMark    = null;
let _proximityNotifSent = {};  // orderId → true when 500m notif already fired this session
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

    // Update icon rotation using the cached inner-div reference (avoids a
    // DOM query on every single animation frame, up to 60x/second).
    if (_trackDriverRotEl) {
        _trackDriverRotEl.style.transform = `rotate(${bearing}deg)`;
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

    setTimeout(async () => {
        await _ensureLeafletLoaded();
        if (!_trackMap) {
            _trackMap = L.map('track-map', { zoomControl: true })
                .setView([34.004, 36.210], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19,
            }).addTo(_trackMap);
        } else {
            // Clean up previous session layers
            if (_trackDriverMark) { _trackMap.removeLayer(_trackDriverMark); _trackDriverMark = null; _trackDriverRotEl = null; }
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
        #track-driver-contact { background: #fff8f4; }
        #track-driver-contact a:hover { opacity:0.85; }
        #track-call-btn, #track-wa-btn {
            flex:1;display:flex;align-items:center;justify-content:center;gap:7px;
            padding:11px 14px;border-radius:14px;font-size:0.88rem;font-weight:800;
            text-decoration:none;transition:opacity 0.15s;letter-spacing:0.01em;
        }
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

        // Last resort: re-scan drivers matching by username field too
        if (!driverPhone && order.driver && order.driver !== '0') {
            try {
                const driversResp2 = await fetch(`${OH_RTDB_URL}/drivers.json`);
                const driversData2 = await driversResp2.json();
                if (driversData2 && typeof driversData2 === 'object') {
                    for (const [key, d] of Object.entries(driversData2)) {
                        if (d && (d.owner === order.driver || d.username === order.driver || d.fullname === order.driver)) {
                            driverPhone = d.phone || null;
                            if (!driverId) driverId = key;
                            break;
                        }
                    }
                }
            } catch(e) {}
        }

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
        // Show contact buttons when driver phone is known; hide when not assigned
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
            } else if (order.driver && order.driver !== '0') {
                // Driver assigned but phone unavailable — show driver name with admin contact hint
                contactRow.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;width:100%;">
                        <span style="font-size:0.78rem;color:#888;flex:1;">🛵 السائق: <strong style="color:#FF5C00;">${order.driver}</strong> — رقم الهاتف غير متاح حالياً</span>
                    </div>`;
                contactRow.style.display = 'flex';
            } else {
                contactRow.style.display = 'none';
            }
        }

        const state = order.state || '0';
        if (state === '1') {
            _setTrackStatus('✅ تم توصيل طلبك!', 'ok');
            // Stop polling — nothing left to track — then close the
            // tracking modal shortly after so the success message is
            // still visible for a moment before it disappears.
            clearInterval(_trackInterval); _trackInterval = null;
            setTimeout(() => { if (document.getElementById('track-modal')?.style.display !== 'none') _closeTrackModal(); }, 2000);
            return;
        }
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
                _trackDriverRotEl = _trackDriverMark.getElement()?.querySelector('div') || null;
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

                // ── Case 3: Proximity notification (< 500 m from destination) ──
                const _haversine = (lat1, lng1, lat2, lng2) => {
                    const R = 6371000; // metres
                    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
                    const Δφ = (lat2 - lat1) * Math.PI / 180;
                    const Δλ = (lng2 - lng1) * Math.PI / 180;
                    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
                    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                };
                const distMetres = _haversine(dLat, dLng, destLat, destLng);
                if (distMetres < 500 && !_proximityNotifSent[_trackOrderId]) {
                    _proximityNotifSent[_trackOrderId] = true;
                    const reqNum = (_trackOrderId || '').replace('id_', '#');
                    const store  = order.store || 'متجرك';
                    if (typeof window._sendDelivoNotif === 'function') {
                        window._sendDelivoNotif(
                            '🛵 السائق على وشك الوصول!',
                            `طلبك ${reqNum} من ${store} على بُعد أقل من 500 متر منك`,
                            `proximity-${_trackOrderId}`
                        );
                    }
                    if (typeof window._showOrderBanner === 'function') {
                        window._showOrderBanner(
                            '📍',
                            'السائق على وشك الوصول!',
                            `أقل من 500 متر — طلب ${reqNum} من ${store}`,
                            _trackOrderId, order.delivryplusid || ''
                        );
                    }
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

    // The registration error now pops up centered over the modal instead
    // of sitting inline above the fields — let a tap dismiss it early.
    const regErrorEl = document.getElementById('reg-error');
    if (regErrorEl) regErrorEl.addEventListener('click', () => hideError(regErrorEl));

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
            _ohRenderLimit = OH_PAGE_SIZE; // start fresh page count for the new filter
            _renderOrders();
        });
    });

    // Update orders badge count when account modal opens
    document.addEventListener('modalOpen', (e) => {
        if (e.detail === 'modal-account') _updateOrdersBadge();
    });

    // ══════════════════════════════════════════════════════
    // LAUNCH MODAL — shown once per device, only to a genuinely
    // brand-new visitor (no lead saved yet, not already logged in)
    // ══════════════════════════════════════════════════════
    async function _showLaunchModalIfNeeded() {
        if (window.DelivoUser) return; // already a real logged-in account
        try {
            const lead = await window.DelivoAuth.getDeviceLead();
            if (lead) return; // this device already has a lead on file
        } catch (_) { return; } // fail closed — never show on a network hiccup
        if (typeof openModal === 'function') openModal('modal-launch');
    }
    if (window._authStateReady) {
        _showLaunchModalIfNeeded();
        window.DelivoAuth?.backfillDeviceLeadInfo?.();
    } else {
        document.addEventListener('delivoAuthReady', () => {
            _showLaunchModalIfNeeded();
            window.DelivoAuth?.backfillDeviceLeadInfo?.();
        }, { once: true });
    }

    const launchBtn = document.getElementById('launch-submit');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            const fullName = document.getElementById('launch-fullname')?.value || '';
            const phoneRaw = document.getElementById('launch-phone')?.value    || '';
            const phoneDigits = phoneRaw.replace(/[\s\-]/g, '');
            const errorEl = document.getElementById('launch-error');

            if (fullName.trim().length < 2) { showError(errorEl, 'أدخل اسمك الكامل (حرفان على الأقل)'); return; }
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits)) {
                showError(errorEl, 'رقم الهاتف غير صحيح. مثال: 03 123 456'); return;
            }
            hideError(errorEl);
            setLoading(launchBtn, true, '⏳');
            const result = await window.DelivoAuth.saveDeviceLead({ fullName, phone: phoneDigits });
            setLoading(launchBtn, false, 'متابعة التصفح');
            if (result.error) { showError(errorEl, result.message); return; }
            closeModal('modal-launch');
            const onSuccess = window._launchModalOnSuccess;
            window._launchModalOnSuccess = null;
            if (typeof onSuccess === 'function') onSuccess();
        });
    }

    // ── "لديك حساب مسبقاً؟ سجّل الدخول" — the escape hatch inside the
    // mandatory launch modal for a returning customer whose device UUID
    // got reset (cleared storage, new browser/device, etc.) and so looks
    // like a brand-new visitor. Lets them log into their real account
    // instead of being forced through name+phone capture again.
    const launchGotoLogin = document.getElementById('launch-goto-login');
    if (launchGotoLogin) {
        launchGotoLogin.addEventListener('click', (e) => {
            e.preventDefault();
            window._launchModalPendingReturn = true;
            closeModal('modal-launch');
            openModal('modal-login');
        });
    }

    // If that login attempt gets abandoned (closed via its own ✕, the
    // backdrop, or Escape) without actually signing in, the visitor is
    // right back to having neither an account nor a saved lead — bring
    // the mandatory launch modal back rather than leaving the site
    // fully unblocked. _showLaunchModalIfNeeded() re-checks the real
    // state itself, so a genuinely successful login is a no-op here.
    document.addEventListener('modalClose', (e) => {
        if (e.detail !== 'modal-login' || !window._launchModalPendingReturn) return;
        window._launchModalPendingReturn = false;
        setTimeout(() => { _showLaunchModalIfNeeded(); }, 400);
    });

    // ══════════════════════════════════════════════════════
    // PHONE-FIRST LOGIN — the new default content of modal-login
    // ══════════════════════════════════════════════════════
    const legacyToggle = document.getElementById('login-legacy-toggle');
    const phoneToggle   = document.getElementById('login-phone-toggle');
    if (legacyToggle) {
        legacyToggle.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('phone-login-fields').style.display  = 'none';
            document.getElementById('legacy-login-fields').style.display = 'block';
        });
    }
    if (phoneToggle) {
        phoneToggle.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('legacy-login-fields').style.display = 'none';
            document.getElementById('phone-login-fields').style.display  = 'block';
        });
    }

    let _loginPhoneState = null; // { uid, phone, deviceUUID } once resolved

    const loginPhoneBtn = document.getElementById('login-phone-submit');
    if (loginPhoneBtn) {
        loginPhoneBtn.addEventListener('click', async () => {
            const errorEl  = document.getElementById('login-error');
            const otpStepEl = document.getElementById('login-otp-step');
            const isConfirmStep = _loginPhoneState && otpStepEl?.style.display !== 'none';

            if (!isConfirmStep) {
                const phoneRaw = document.getElementById('login-phone')?.value || '';
                const phoneDigits = phoneRaw.replace(/[\s\-]/g, '');
                if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits)) {
                    showError(errorEl, 'رقم الهاتف غير صحيح'); return;
                }
                hideError(errorEl);
                setLoading(loginPhoneBtn, true, '⏳');
                const resolved = await window.DelivoAuth.resolvePhoneLogin({ phone: phoneDigits });
                if (resolved.error) {
                    setLoading(loginPhoneBtn, false, 'متابعة');
                    if (resolved.notFound) {
                        errorEl.innerHTML = `
                            لا يوجد حساب بهذا الرقم.
                            <a href="#" id="login-notfound-register" style="color:#b91c1c;text-decoration:underline;font-weight:800;">سجّل حساباً جديداً بهذا الرقم</a>
                            — أو إذا كان لديك حساب قديم،
                            <a href="#" id="login-notfound-legacy" style="color:#b91c1c;text-decoration:underline;font-weight:800;">سجّل الدخول باسم المستخدم وكلمة المرور</a>
                        `;
                        errorEl.style.display     = 'block';
                        errorEl.style.background  = '#fff1f1';
                        errorEl.style.borderColor = '#fca5a5';
                        errorEl.style.color       = '#b91c1c';

                        document.getElementById('login-notfound-register')?.addEventListener('click', (e) => {
                            e.preventDefault();
                            closeModal('modal-login');
                            setTimeout(() => {
                                if (typeof window.startFreshRegistration === 'function') {
                                    window.startFreshRegistration();
                                    // Carry over the phone they already typed —
                                    // no reason to make them retype it.
                                    const phoneInput = document.getElementById('reg-phone');
                                    if (phoneInput) phoneInput.value = phoneDigits;
                                }
                            }, 180);
                        });
                        document.getElementById('login-notfound-legacy')?.addEventListener('click', (e) => {
                            e.preventDefault();
                            document.getElementById('phone-login-fields').style.display  = 'none';
                            document.getElementById('legacy-login-fields').style.display = 'block';
                            hideError(errorEl);
                        });
                    } else {
                        showError(errorEl, resolved.message);
                    }
                    return;
                }
                _loginPhoneState = resolved;

                // Try the instant path first — no OTP required if this
                // device already matches the account's stored deviceUUID.
                const finish = await window.DelivoAuth.finishPhoneLogin({
                    uid: resolved.uid, phone: resolved.phone, deviceUUID: resolved.deviceUUID, otpVerified: false,
                });
                if (finish.success) {
                    setLoading(loginPhoneBtn, false, 'متابعة');
                    closeModal('modal-login');
                    clearFields(['login-phone']);
                    _loginPhoneState = null;
                    return;
                }
                if (finish.error) {
                    setLoading(loginPhoneBtn, false, 'متابعة');
                    showError(errorEl, finish.message);
                    return;
                }
                // finish.requiresOtp — send the WhatsApp code and reveal the OTP step
                try {
                    const code      = await _sendOtpWhatsapp(resolved.phone);
                    const expiresAt = Date.now() + OTP_TIMEOUT;
                    _loginPhoneState = { ...resolved, code, expiresAt };
                    if (otpStepEl) { otpStepEl.style.display = 'block'; document.getElementById('login-otp-hint').textContent = `تم إرسال كود إلى واتساب رقم 961${_toIntlPhone(resolved.phone)}`; _wireOtpWaButton('login-otp-open-wa-btn'); }
                    setLoading(loginPhoneBtn, false, 'تأكيد الكود والدخول');
                    document.getElementById('login-otp')?.focus();
                } catch (e) {
                    setLoading(loginPhoneBtn, false, 'متابعة');
                    showError(errorEl, e.message);
                    _loginPhoneState = null;
                }
                return;
            }

            // Confirm step — verify the code, then finish via the Cloud Function
            const entered = document.getElementById('login-otp')?.value.trim() || '';
            if (!entered) { showError(errorEl, 'أدخل كود التحقق'); return; }
            if (Date.now() > _loginPhoneState.expiresAt) { showError(errorEl, 'انتهت صلاحية الكود. أعد المحاولة'); _loginPhoneState = null; otpStepEl.style.display = 'none'; return; }
            if (entered !== _loginPhoneState.code) { showError(errorEl, '❌ الكود غير صحيح'); document.getElementById('login-otp')?.select(); return; }

            setLoading(loginPhoneBtn, true, '⏳ جاري الدخول...');
            const finish = await window.DelivoAuth.finishPhoneLogin({
                uid: _loginPhoneState.uid, phone: _loginPhoneState.phone,
                deviceUUID: _loginPhoneState.deviceUUID, otpVerified: true,
            });
            setLoading(loginPhoneBtn, false, 'تأكيد الكود والدخول');
            if (finish.error) { showError(errorEl, finish.message); return; }

            closeModal('modal-login');
            clearFields(['login-phone', 'login-otp']);
            if (otpStepEl) otpStepEl.style.display = 'none';
            _loginPhoneState = null;
        });
    }

    const loginOtpResendBtn = document.getElementById('login-otp-resend-btn');
    if (loginOtpResendBtn) {
        loginOtpResendBtn.addEventListener('click', async () => {
            if (!_loginPhoneState) return;
            const errorEl = document.getElementById('login-error');
            setLoading(loginOtpResendBtn, true, '⏳');
            try {
                const code      = await _sendOtpWhatsapp(_loginPhoneState.phone);
                const expiresAt = Date.now() + OTP_TIMEOUT;
                _loginPhoneState = { ..._loginPhoneState, code, expiresAt };
                document.getElementById('login-otp-hint').textContent = `✅ أُعيد إرسال الكود إلى واتساب رقم 961${_toIntlPhone(_loginPhoneState.phone)}`;
            } catch (e) {
                showError(errorEl, e.message);
            }
            setLoading(loginOtpResendBtn, false, 'إعادة الإرسال');
        });
    }
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