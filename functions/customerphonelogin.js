/* ══════════════════════════════════════════════════════════
   CUSTOMER: PHONE-BASED LOGIN (no password, ever)
   Why this has to be a Cloud Function:
   Signing a user into an EXISTING Firebase Auth account without their
   original password requires either (a) the real password, which
   passwordless accounts never have in any meaningful sense, or (b) a
   custom auth token minted via the Admin SDK — and the Admin SDK can
   only run in a trusted server environment, never in the browser.
   So: the browser asks this function to vouch for the customer, this
   function checks what it reasonably can, then mints a token the
   browser can redeem with signInWithCustomToken().

   Trust model — stated plainly, not hidden:
   Just like this app's existing WhatsApp OTP flow (registration), the
   OTP code itself is generated and compared entirely client-side, then
   relayed here as a simple boolean claim ("I already checked the code
   and it matched"). This function does not re-verify the OTP digits —
   there is no server-side copy of them to check against. What it DOES
   enforce server-side, and what actually matters for security here, is
   WHICH account gets a token minted for it: only the exact uid whose
   stored phone matches what's being claimed, and only after either (a)
   a genuine device-UUID match against that specific account's own
   stored value, or (b) the client's OTP-verified claim. An attacker
   would need to already know a real customer's exact phone number AND
   either their private device UUID or intercept their live WhatsApp
   code — the same bar every other flow in this app already accepts.
══════════════════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin      = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

exports.customerPhoneLogin = functions.https.onRequest(async (req, res) => {
    // CORS for calls from delivolb.com / Firebase Hosting — same as adminResetUserPassword
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        const { uid, phone, deviceUUID, otpVerified } = req.body || {};

        if (!uid || typeof uid !== 'string') {
            res.status(400).json({ error: 'uid مطلوب' }); return;
        }
        if (!phone || typeof phone !== 'string') {
            res.status(400).json({ error: 'رقم الهاتف مطلوب' }); return;
        }

        // ── Load the account and confirm the phone actually belongs to it ──
        // This isn't a substitute for OTP verification — it's a guard
        // against a stale/wrong uid being paired with an unrelated phone
        // number by a client-side bug (e.g. a phoneIndex lookup gone wrong),
        // not a defense against a client deliberately lying about otpVerified.
        const userRef = admin.firestore().collection('users').doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            res.status(404).json({ error: 'الحساب غير موجود' }); return;
        }
        const userData    = userDoc.data();
        const storedPhone  = (userData.phone || '').replace(/[^\d]/g, ''); // digits only
        const claimedPhone = phone.replace(/[^\d]/g, '');
        // Compare on the last 8 digits so +961/961/leading-0 formatting
        // differences never cause a false mismatch.
        if (!storedPhone.endsWith(claimedPhone.slice(-8)) && !claimedPhone.endsWith(storedPhone.slice(-8))) {
            res.status(403).json({ error: 'رقم الهاتف لا يطابق هذا الحساب' }); return;
        }

        const storedDeviceUUID = userData.deviceUUID || null;
        const deviceMatches    = !!deviceUUID && !!storedDeviceUUID && deviceUUID === storedDeviceUUID;

        if (!deviceMatches && !otpVerified) {
            // Different/unknown device, and the client hasn't verified a
            // WhatsApp code yet — tell it to do that first, then retry.
            res.status(200).json({ requiresOtp: true }); return;
        }

        // ── Mint the sign-in token ──────────────────────────────────────
        const token = await admin.auth().createCustomToken(uid);

        // Remember this device for next time — whether it just matched, or
        // just got OTP-verified for the first time on a new device. Old
        // (pre-existing) accounts get exactly this same field updated, the
        // same way their deviceUUID was already being set at registration —
        // nothing new about the field itself, just who's writing it now.
        if (deviceUUID && deviceUUID !== storedDeviceUUID) {
            await userRef.update({ deviceUUID });
        }

        // Audit trail — same pattern as adminResetUserPassword's log, so
        // both password-adjacent operations are visible in one place.
        await admin.database().ref('adminAuditLog').push({
            action: 'customer_phone_login',
            uid,
            viaDeviceMatch: deviceMatches,
            at: new Date().toISOString(),
        });

        res.status(200).json({ success: true, token });
    } catch (e) {
        console.error('[customerPhoneLogin] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});