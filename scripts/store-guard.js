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

// Full replacement for doLogin — real Firebase Auth sign-in (same pattern as
// admin.html's own doLogin in admin-04-core-auth-data.js), gated to
// store-linked roles only via the account's custom claims.
window.doLogin = async function() {
    const username = document.getElementById('adm-user').value.trim().toLowerCase();
    const password = document.getElementById('adm-pass').value.trim();
    const errEl    = document.getElementById('adm-login-error');
    const btn      = document.getElementById('adm-login-btn');

    if (!username || !password) return;
    btn.disabled = true; btn.textContent = '…';
    errEl.textContent = '';

    try {
        const email = _adminEmailForUsername(username);
        const cred  = await window._adminAuth.signInWithEmailAndPassword(email, password);
        const tokenResult = await cred.user.getIdTokenResult();
        const claims = tokenResult.claims || {};

        if (!claims.admin || !STORE_PORTAL_ROLES.includes(claims.role)) {
            await window._adminAuth.signOut();
            errEl.textContent = 'هذا الحساب ليس حساب متجر — الرجاء التواصل مع الإدارة';
            return;
        }

        currentAdmin = {
            _key:        cred.user.uid,
            username,
            fullname:    claims.fullname || username,
            role:        claims.role,
            permissions: claims.permissions || [],
        };
        startCompanyPortal();
    } catch (e) {
        console.error('[Store login] failed:', e.code, e.message);
        errEl.textContent = e.code === 'auth/network-request-failed'
            ? 'خطأ في الاتصال، تحقق من الإنترنت'
            : 'اسم المستخدم أو كلمة المرور غير صحيحة';
    } finally {
        btn.disabled = false; btn.textContent = 'دخول';
    }
};