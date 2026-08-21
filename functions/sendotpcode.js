/* ══════════════════════════════════════════════════════════
   functions/sendotpcode.js — WhatsApp OTP send, server-side only
   ══════════════════════════════════════════════════════════
   WHY THIS EXISTS (read before touching modal-auth.js again):
   _sendOtpWhatsapp() used to call GREEN-API's sendMessage endpoint
   directly from the browser, using settings/greenApiInstance and
   settings/greenApiToken fetched straight out of the public RTDB
   `settings` node. That meant:
     1. Anyone who opened DevTools on the public site could read the
        live GREEN-API instance ID + token out of the network tab —
        no login required — and then call GREEN-API directly with
        those credentials, completely outside this app, to send
        WhatsApp messages to ANY number using Delivo's identity.
     2. There was zero rate limiting on OTP sends beyond a 30s UI
        button cooldown, which only slows down one browser tab, not
        a script hitting the registration/login form or GREEN-API
        directly.

   This function fixes both:
     - The GREEN-API token is read here, server-side, and never sent
       back to the client in any response.
     - Every send is counted per-device AND per-phone against
       settings/otpMaxAttemptsPerDay (default 3/day each), so no
       single device or phone number can trigger unlimited sends.
     - The WhatsApp message itself is built here from a fixed
       template using only the numeric code — the client cannot pass
       arbitrary text, so this can never become a generic
       "send any message to any number" relay.

   The OTP code is still GENERATED and COMPARED client-side (same
   trust model as functions/customerphonelogin.js already documents
   for the registration/login flow) — this function only relays the
   already-chosen 4-digit code to GREEN-API. It does not verify
   the code itself; it verifies the SEND is allowed and hides the
   credentials.

   ── One-time setup ──────────────────────────────────────────
   Same firebase-admin dependency already used elsewhere. Deploy:
     firebase deploy --only functions:sendOtpCode
══════════════════════════════════════════════════════════ */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const db = admin.database();

const DEFAULT_MAX_PER_DAY = 3;

// Same phone normalization used across the rest of the app (see
// modal-auth.js's _toIntlPhone / notifyneworders.js's _sendWhatsapp):
// strip everything but digits, drop a leading 961 or a leading 0.
function _normalizePhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('961')) digits = digits.slice(3);
    digits = digits.replace(/^0/, '');
    return digits;
}

// Today's date as a stable bucket key (UTC — doesn't matter which
// timezone as long as it's consistent, since this only needs to
// roughly reset once a day, not at an exact local midnight).
function _todayKey() {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Atomically increments a daily counter and reports whether the
// caller was already at/over the limit BEFORE this attempt (so a
// request that would push it over the top is rejected, not counted).
async function _checkAndIncrement(ref, limit) {
    let allowed = true;
    await ref.transaction(current => {
        const count = current || 0;
        if (count >= limit) {
            allowed = false;
            return count; // no change — don't count a rejected attempt
        }
        return count + 1;
    });
    return allowed;
}

async function _sendWhatsapp(instance, token, phone, message) {
    const digits   = _normalizePhone(phone);
    if (!digits) throw new Error('invalid phone');
    const chatId   = '961' + digits + '@c.us';
    const gaServer = String(instance).slice(0, 4);
    const url      = `https://${gaServer}.api.greenapi.com/waInstance${instance}/sendMessage/${token}`;
    const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chatId, message }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) throw new Error(data.error || `GREEN-API HTTP ${resp.status}`);
    return true;
}

exports.sendOtpCode = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        const { phone, deviceUUID, code } = req.body || {};

        const digits = _normalizePhone(phone);
        if (!digits || digits.length < 7 || digits.length > 8) {
            res.status(400).json({ error: 'رقم هاتف غير صالح' }); return;
        }
        if (!deviceUUID || typeof deviceUUID !== 'string') {
            res.status(400).json({ error: 'deviceUUID مطلوب' }); return;
        }
        // Only ever accept a bare 4-digit code — never free text. This is
        // what keeps this endpoint from becoming a generic message relay.
        if (typeof code !== 'string' || !/^\d{4}$/.test(code)) {
            res.status(400).json({ error: 'كود غير صالح' }); return;
        }

        const [instance, token, maxPerDaySetting] = await Promise.all([
            db.ref('settings/greenApiInstance').once('value').then(s => s.val()),
            db.ref('settings/greenApiToken').once('value').then(s => s.val()),
            db.ref('settings/otpMaxAttemptsPerDay').once('value').then(s => s.val()),
        ]);

        if (!instance || !token) {
            res.status(503).json({ error: 'GREEN-API غير مهيأ من لوحة الإدارة' }); return;
        }

        const limit = parseInt(maxPerDaySetting, 10) > 0 ? parseInt(maxPerDaySetting, 10) : DEFAULT_MAX_PER_DAY;
        const today = _todayKey();

        // Two independent buckets: this stops both (a) one device cycling
        // through many different phone numbers, and (b) many devices all
        // targeting the same phone number — either alone is enough to
        // reproduce the "unsolicited bulk send" pattern WhatsApp flags.
        const deviceRef = db.ref(`otpRateLimit/${today}/devices/${deviceUUID}`);
        const phoneRef  = db.ref(`otpRateLimit/${today}/phones/${digits}`);

        const deviceOk = await _checkAndIncrement(deviceRef, limit);
        if (!deviceOk) {
            res.status(429).json({ error: `تم الوصول للحد الأقصى (${limit}) لعدد محاولات الإرسال اليوم من هذا الجهاز` });
            return;
        }
        const phoneOk = await _checkAndIncrement(phoneRef, limit);
        if (!phoneOk) {
            // Roll back the device counter we just took, since this attempt
            // is being rejected on the phone-side limit instead.
            await deviceRef.transaction(c => Math.max(0, (c || 1) - 1));
            res.status(429).json({ error: `تم الوصول للحد الأقصى (${limit}) لعدد محاولات الإرسال اليوم لهذا الرقم` });
            return;
        }

        const message =
            `🔐 كود تفعيل حسابك في Delivo:\n\n*${code}*\n\nصالح لمدة 5 دقائق. لا تشاركه مع أحد.`;

        await _sendWhatsapp(instance, token, digits, message);

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('[sendOtpCode] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});
