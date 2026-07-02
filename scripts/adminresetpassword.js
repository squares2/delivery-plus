/* ══════════════════════════════════════════════════════════
   ADMIN: RESET CUSTOMER PASSWORD
   Why this has to be a Cloud Function:
   Firebase Auth never exposes a user's real password to anyone — not the
   client SDK, not the Admin SDK, not even Google. That's true of any
   properly-built auth system (passwords are hashed one-way on purpose).
   What we CAN do is set a NEW password for a user via the Admin SDK,
   which requires a trusted server environment — a browser can't hold
   Admin SDK credentials safely. Hence: HTTPS function, admin-gated.
══════════════════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin      = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// Keep this in sync with the admin-email allowlist already used in admin.html
// (see deleteUserAccount's _ADMIN_EMAILS guard).
const ADMIN_EMAILS = ['admin@delivivo.app', 'admin@delivo.app'];

exports.adminResetUserPassword = functions.https.onRequest(async (req, res) => {
    // CORS for calls from delivolb.com / Firebase Hosting
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        // ── 1. Verify the caller is the admin (their Firebase Auth ID token) ──
        const authHeader = req.headers.authorization || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!idToken) { res.status(401).json({ error: 'مطلوب تسجيل دخول كمدير' }); return; }

        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            res.status(401).json({ error: 'جلسة المدير غير صالحة، سجّل الدخول من جديد' }); return;
        }

        if (!ADMIN_EMAILS.includes(decoded.email)) {
            res.status(403).json({ error: 'هذا الحساب غير مخوّل بإعادة تعيين كلمات المرور' }); return;
        }

        // ── 2. Validate input ──────────────────────────────────────────────
        const { uid, newPassword } = req.body || {};
        if (!uid || typeof uid !== 'string') { res.status(400).json({ error: 'uid مطلوب' }); return; }
        if (!newPassword || newPassword.length < 8) { res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }); return; }
        if (uid === decoded.uid) { res.status(403).json({ error: 'لا يمكن استخدام هذه الوظيفة لحساب المدير نفسه' }); return; }

        // ── 3. Set the new password ─────────────────────────────────────────
        await admin.auth().updateUser(uid, { password: newPassword });

        // ── 4. Audit trail — who reset whose password, and when ────────────
        await admin.database().ref(`adminAuditLog`).push({
            action:      'password_reset',
            targetUid:   uid,
            byAdminUid:  decoded.uid,
            byAdminEmail: decoded.email,
            at:          new Date().toISOString(),
        });

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('[adminResetUserPassword] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});