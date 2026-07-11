/* ══════════════════════════════════════════════════════════
   ADMIN: UPLOAD IMAGE TO GITHUB REPO (items2 / promo cards / hero bgs)
   Why this has to be a Cloud Function:
   Before this, the GitHub token used to push item/promo/hero-background
   images lived as a plain string inside admin.html — visible to anyone
   who views-source the page. GitHub's own secret-scanning keeps finding
   and auto-revoking it, which is exactly what should happen to a token
   sitting in client-side code. The fix: the token now lives ONLY as a
   server-side environment variable on this function (see functions/.env,
   which is never committed), and the browser calls this endpoint instead
   of calling GitHub directly. Admin-gated the same way
   adminResetUserPassword is — Firebase Auth ID token + email allowlist.
══════════════════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin      = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// Keep this in sync with the admin-email allowlist already used elsewhere
// (see adminresetpassword.js's ADMIN_EMAILS).
const ADMIN_EMAILS = ['admin@delivivo.app', 'admin@delivo.app'];

const GH_OWNER  = 'squares2';
const GH_REPO   = 'delivery-plus';
const GH_BRANCH = 'main';

// Only these folders may ever be written to. This is the safety net that
// stops a bug (or a compromised admin session) from writing anywhere else
// in the repo — the folder always comes from the client, so it must be
// checked against a fixed allowlist, never trusted as-is.
const ALLOWED_FOLDERS = ['items2', 'assets/promos', 'assets/hero-bg'];

exports.adminUploadImage = functions.https.onRequest(async (req, res) => {
    // CORS for calls from delivolb.com / Firebase Hosting / local testing
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
            res.status(403).json({ error: 'هذا الحساب غير مخوّل برفع الصور' }); return;
        }

        // ── 2. Validate input ──────────────────────────────────────────────
        const { folder, filename, base64 } = req.body || {};
        if (!ALLOWED_FOLDERS.includes(folder)) {
            res.status(400).json({ error: 'مجلد غير مسموح' }); return;
        }
        if (!filename || !/^[a-z0-9_-]+\.webp$/i.test(filename)) {
            res.status(400).json({ error: 'اسم ملف غير صالح' }); return;
        }
        if (!base64 || typeof base64 !== 'string' || base64.length < 20) {
            res.status(400).json({ error: 'الصورة مطلوبة' }); return;
        }
        // Rough size guard — base64 runs ~4/3 the binary size, this caps
        // uploads around ~9MB of actual image data, plenty for a WebP photo.
        if (base64.length > 12 * 1024 * 1024) {
            res.status(400).json({ error: 'الصورة كبيرة جداً' }); return;
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            console.error('[adminUploadImage] GITHUB_TOKEN env var is not set');
            res.status(500).json({ error: 'إعداد الخادم غير مكتمل، تواصل مع المطوّر' }); return;
        }

        const path   = `${folder}/${filename}`;
        const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

        // ── 3. Get the existing file's sha, if any (needed to overwrite) ───
        let sha = null;
        try {
            const check = await fetch(apiUrl, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
            });
            if (check.ok) sha = (await check.json()).sha;
        } catch (_) { /* file just doesn't exist yet — that's fine, sha stays null */ }

        // ── 4. Upload ────────────────────────────────────────────────────
        const body = { message: `Update ${path} via admin panel`, content: base64, branch: GH_BRANCH };
        if (sha) body.sha = sha;

        const upload = await fetch(apiUrl, {
            method:  'PUT',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        if (!upload.ok) {
            const err = await upload.json().catch(() => ({}));
            throw new Error(err.message || `GitHub error ${upload.status}`);
        }

        // ── 5. Audit trail — who uploaded what, and when ────────────────────
        await admin.database().ref('adminAuditLog').push({
            action:       'image_upload',
            path,
            byAdminUid:   decoded.uid,
            byAdminEmail: decoded.email,
            at:           new Date().toISOString(),
        });

        res.status(200).json({ success: true, path });
    } catch (e) {
        console.error('[adminUploadImage] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});