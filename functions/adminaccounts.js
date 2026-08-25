/* ══════════════════════════════════════════════════════════
   ADMIN: MANAGE EMPLOYEE ACCOUNTS (create / update / delete)
   ------------------------------------------------------------
   Replaces the old model where adminUsers/{key} held a plaintext
   password field that the browser compared directly. Now:
     - Every employee is a REAL Firebase Auth user (no shared
       account, no password ever stored in our own database).
     - Role + permissions live as CUSTOM CLAIMS on that user's
       token — set only here, via the Admin SDK, server-side.
       The browser can read claims but can never write them.
     - adminUsers/{uid} in RTDB becomes metadata-only (username,
       fullname, role, permissions mirror for the employees list
       UI) — no password field, ever again.

   Only an existing superadmin (checked via their own token's
   custom claim, not an email string) may call these.
══════════════════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin      = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const VALID_ROLES = ['superadmin', 'admin', 'supervisor', 'support', 'company', 'store'];

function emailForUsername(username) {
    return `${String(username).trim().toLowerCase()}@admin.delivo.internal`;
}

function setCors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Verifies the caller is a signed-in superadmin. Returns the decoded token,
// or null after already sending an error response.
async function requireSuperadmin(req, res) {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) { res.status(401).json({ error: 'مطلوب تسجيل دخول كمدير' }); return null; }

    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
        res.status(401).json({ error: 'جلسة المدير غير صالحة، سجّل الدخول من جديد' }); return null;
    }
    if (!decoded.admin || decoded.role !== 'superadmin') {
        res.status(403).json({ error: 'فقط المدير العام يمكنه إدارة الحسابات' }); return null;
    }
    return decoded;
}

exports.createAdminAccount = functions.https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        const decoded = await requireSuperadmin(req, res);
        if (!decoded) return;

        const { username, password, fullname, role, permissions } = req.body || {};
        if (!username || !/^[a-z0-9_.-]{3,32}$/i.test(username)) {
            res.status(400).json({ error: 'اسم مستخدم غير صالح' }); return;
        }
        if (!password || password.length < 8) {
            res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }); return;
        }
        if (!VALID_ROLES.includes(role)) {
            res.status(400).json({ error: 'دور غير صالح' }); return;
        }

        const email = emailForUsername(username);
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: fullname || username,
        });

        const claims = {
            admin: true,
            role,
            fullname: fullname || username,
            permissions: Array.isArray(permissions) ? permissions : [],
        };
        await admin.auth().setCustomUserClaims(userRecord.uid, claims);

        // Metadata mirror for the employees-list UI — NO password field.
        await admin.database().ref(`adminUsers/${userRecord.uid}`).set({
            username, fullname: fullname || username, role,
            permissions: claims.permissions,
            createdAt: new Date().toISOString(),
            createdBy: decoded.email,
        });

        await admin.database().ref('adminAuditLog').push({
            action: 'account_created', targetUid: userRecord.uid, username,
            byAdminUid: decoded.uid, byAdminEmail: decoded.email, at: new Date().toISOString(),
        });

        res.status(200).json({ success: true, uid: userRecord.uid });
    } catch (e) {
        console.error('[createAdminAccount] error:', e);
        const msg = e.code === 'auth/email-already-exists' ? 'اسم المستخدم مستخدم مسبقاً' : (e.message || 'فشل غير متوقع');
        res.status(500).json({ error: msg });
    }
});

exports.updateAdminAccount = functions.https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        const decoded = await requireSuperadmin(req, res);
        if (!decoded) return;

        const { uid, password, fullname, role, permissions } = req.body || {};
        if (!uid) { res.status(400).json({ error: 'uid مطلوب' }); return; }
        if (role && !VALID_ROLES.includes(role)) { res.status(400).json({ error: 'دور غير صالح' }); return; }
        if (password && password.length < 8) { res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }); return; }

        if (password) await admin.auth().updateUser(uid, { password });

        const existing = (await admin.auth().getUser(uid)).customClaims || {};
        const claims = {
            admin: true,
            role: role || existing.role,
            fullname: fullname || existing.fullname,
            permissions: Array.isArray(permissions) ? permissions : (existing.permissions || []),
        };
        await admin.auth().setCustomUserClaims(uid, claims);

        await admin.database().ref(`adminUsers/${uid}`).update({
            fullname: claims.fullname, role: claims.role, permissions: claims.permissions,
        });

        await admin.database().ref('adminAuditLog').push({
            action: 'account_updated', targetUid: uid,
            byAdminUid: decoded.uid, byAdminEmail: decoded.email, at: new Date().toISOString(),
        });

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('[updateAdminAccount] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});

exports.deleteAdminAccount = functions.https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        const decoded = await requireSuperadmin(req, res);
        if (!decoded) return;

        const { uid } = req.body || {};
        if (!uid) { res.status(400).json({ error: 'uid مطلوب' }); return; }
        if (uid === decoded.uid) { res.status(403).json({ error: 'لا يمكنك حذف حسابك الخاص' }); return; }

        await admin.auth().deleteUser(uid);
        await admin.database().ref(`adminUsers/${uid}`).remove();

        await admin.database().ref('adminAuditLog').push({
            action: 'account_deleted', targetUid: uid,
            byAdminUid: decoded.uid, byAdminEmail: decoded.email, at: new Date().toISOString(),
        });

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('[deleteAdminAccount] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});
