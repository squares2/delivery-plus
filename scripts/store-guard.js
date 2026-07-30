/* ═══════════════════════════════════════════════════════════════
   STORE PORTAL — login/session guard (store.html only)
   ------------------------------------------------------------------
   store.html reuses the exact same markup + scripts as admin.html
   (full dashboard shell + company-portal view + every modal), so all
   the existing company-portal logic in admin-10-company-portal-
   requests.js works unmodified. The only thing this file changes is
   WHO is allowed in: only employees whose adminUsers role is 'company'
   (the store-linked role created from the "الموظفون" panel with a
   متجر مرتبط) or the legacy 'store' role — never the super-admin seed
   account, and never admin-type roles (superadmin/dispatcher/viewer/
   admin/supervisor/support/driver/etc.).

   This must load AFTER admin-04-core-auth-data.js (which defines
   doLogin/startApp/fbGet/currentAdmin/toast/SEED_SUPERADMIN) and
   BEFORE admin-09-backup-accounts-rewards.js (which binds the login
   button's click handler, and the username/password fields' Enter-key
   handlers, to whatever `doLogin` currently points to) and BEFORE
   admin-10-company-portal-requests.js (whose session-restore code at
   the bottom of the file calls `startApp()` for any non-'company'
   role — that call must reach the guarded version below, not the
   original admin dashboard).
═══════════════════════════════════════════════════════════════ */

const STORE_PORTAL_ROLES = ['company', 'store'];

function _storeRejectToLogin(message) {
    // Never touch localStorage here — admin.html on the same browser may
    // have its own session saved under the same 'delivoAdmin' key, and a
    // rejection on this page must not log that session out elsewhere.
    currentAdmin = null;
    window.currentAdmin = null;
    if (typeof clearInterval === 'function') {
        clearInterval(refreshTimer);
        clearInterval(cpRefreshTimer);
    }
    document.getElementById('app')?.classList.remove('visible');
    document.getElementById('company-portal')?.classList.remove('visible');
    document.getElementById('login-screen').style.display = 'flex';
    const errEl = document.getElementById('adm-login-error');
    if (errEl) errEl.textContent = message;
}

// Overrides the dashboard entry point: on this page, only a store-linked
// account may ever see a rendered view — anything else bounces straight
// back to the login screen with an explanatory message instead of
// building the full admin sidebar/dashboard.
window.startApp = function() {
    if (currentAdmin && STORE_PORTAL_ROLES.includes(currentAdmin.role)) {
        startCompanyPortal();
        return;
    }
    _storeRejectToLogin('هذه الصفحة مخصصة لحسابات المتاجر فقط — الرجاء الدخول من لوحة الإدارة');
};

// Full replacement for doLogin — same adminUsers/RTDB lookup as
// admin.html's original, but gated to store-linked roles only.
window.doLogin = async function() {
    const username = document.getElementById('adm-user').value.trim().toLowerCase();
    const password = document.getElementById('adm-pass').value.trim();
    const errEl    = document.getElementById('adm-login-error');
    const btn      = document.getElementById('adm-login-btn');

    if (!username || !password) return;
    btn.disabled = true; btn.textContent = '…';
    errEl.textContent = '';

    try {
        const admins = await fbGet('adminUsers');
        const seedOverride  = admins && admins.__seed;
        const effectiveSeed = seedOverride ? { ...SEED_SUPERADMIN, ...seedOverride } : SEED_SUPERADMIN;

        // The super-admin account exists, but it never belongs on this page.
        if (username === effectiveSeed.username && password === effectiveSeed.password) {
            errEl.textContent = 'هذا الحساب مخصص للوحة الإدارة — الرجاء الدخول من admin.html';
            return;
        }

        if (admins && typeof admins === 'object') {
            for (const [key, adm] of Object.entries(admins)) {
                if (key === '__seed') continue;
                if (adm && adm.username === username && adm.password === password) {
                    if (!STORE_PORTAL_ROLES.includes(adm.role)) {
                        errEl.textContent = 'هذا الحساب ليس حساب متجر — الرجاء التواصل مع الإدارة';
                        return;
                    }
                    currentAdmin = { ...adm, _key: key };
                    startCompanyPortal();
                    return;
                }
            }
        }
        errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    } catch (e) {
        errEl.textContent = 'خطأ في الاتصال، تحقق من الإنترنت';
    } finally {
        btn.disabled = false; btn.textContent = 'دخول';
    }
};