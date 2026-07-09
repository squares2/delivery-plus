/* ============================================================
   scripts/firebase-init.js
   Firebase init — plain script, no ES modules.
   Exposes:
     window.DelivoAuth   — auth methods
     window.DelivoDB     — Firestore helpers
     window.DelivoUser   — current user or null
   ============================================================ */

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0",
    authDomain:        "deliveryonline-300f7.firebaseapp.com",
    databaseURL:       "https://deliveryonline-300f7-default-rtdb.firebaseio.com",
    projectId:         "deliveryonline-300f7",
    storageBucket:     "deliveryonline-300f7.firebasestorage.app",
    messagingSenderId: "360058447266",
    appId:             "1:360058447266:web:5ac25e3ad30f636bdd3efb"
};

const _configReady = !Object.values(FIREBASE_CONFIG).some(v => v.startsWith('YOUR_'));
if (!_configReady) {
    console.warn('[Delivo] Firebase config not set.');
}

(function loadFirebase() {
    if (!_configReady) return;
    const scripts = [
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
    ];
    let loaded = 0;
    scripts.forEach(src => {
        const s  = document.createElement('script');
        s.src    = src;
        s.async  = false;
        s.onload = () => { if (++loaded === scripts.length) onFirebaseReady(); };
        s.onerror = () => console.error('[Delivo] Failed to load Firebase SDK:', src);
        document.head.appendChild(s);
    });
})();

function onFirebaseReady() {
    try { firebase.initializeApp(FIREBASE_CONFIG); }
    catch (e) { if (e.code !== 'app/duplicate-app') throw e; }

    const auth = firebase.auth();
    const db   = firebase.firestore();

    // ── Sanitizer ────────────────────────────────────────────
    function sanitize(val) {
        if (typeof val !== 'string') return val;
        return val.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').trim().slice(0, 500);
    }

    // ── Rate limiter ─────────────────────────────────────────
    const _limits = {};
    function rateLimit(key, max, windowMs) {
        const now = Date.now();
        if (!_limits[key]) _limits[key] = [];
        _limits[key] = _limits[key].filter(t => now - t < windowMs);
        if (_limits[key].length >= max) return false;
        _limits[key].push(now);
        return true;
    }

    // ── Error messages ────────────────────────────────────────
    function authMsg(code) {
        const map = {
            'auth/user-not-found':          'No account found with this email.',
            'auth/wrong-password':          'Incorrect password.',
            'auth/invalid-credential':      'Incorrect email or password.',
            'auth/invalid-login-credentials': 'Incorrect email or password.',
            'auth/invalid-email':           'Invalid email address.',
            'auth/email-already-in-use':    'This email is already registered.',
            'auth/weak-password':           'Password must be at least 8 characters.',
            'auth/too-many-requests':       'Too many attempts. Please wait and try again.',
            'auth/network-request-failed':  'No internet connection.',
            'auth/user-disabled':           'This account has been disabled.',
            'auth/invalid-phone-number':    'Invalid phone number. Use format: 03XXXXXX',
            'auth/missing-phone-number':    'Please enter your phone number.',
            'auth/quota-exceeded':          'SMS quota exceeded. Try again later.',
            'auth/invalid-verification-code': 'Incorrect code. Please try again.',
            'auth/code-expired':            'Code expired. Please request a new one.',
            'auth/session-expired':         'Session expired. Please request a new code.',
            'auth/error-code:-39':          'SMS service temporarily unavailable. Please try again later.',
        };
        return map[code] || 'Something went wrong. Please try again.';
    }

    // ── Device Fingerprint + UUID ─────────────────────────────
    // Two-layer device identification:
    //
    // Layer 1 — Browser fingerprint (survives localStorage clear)
    //   Built from: screen, timezone, language, platform, canvas
    //   Stored in Firestore as the document ID
    //
    // Layer 2 — localStorage UUID (fast lookup)
    //   Stored locally AND in Firestore alongside the fingerprint
    //   If localStorage is cleared, fingerprint recovers the UUID
    //
    // Together they make it very hard to bypass the 3-account limit.

    const MAX_ACCOUNTS_PER_DEVICE = 3; // fallback if Firebase setting not loaded yet
    // Loaded from settings/maxAccountsPerPhone — default 1 (one account per phone number)
    let   _maxAccountsPerPhone    = 1;
    // Loaded from settings/maxAccountsPerDevice — overrides the hardcoded constant
    let   _maxAccountsPerDevice   = MAX_ACCOUNTS_PER_DEVICE;

    // Read both limits from Firebase on init
    (function _loadAccountLimits() {
        const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
        fetch(`${RTDB}/settings/maxAccountsPerPhone.json`)
            .then(r => r.ok ? r.json() : null)
            .then(v => { const n = parseInt(v); if (n > 0) _maxAccountsPerPhone = n; })
            .catch(() => {});
        fetch(`${RTDB}/settings/maxAccountsPerDevice.json`)
            .then(r => r.ok ? r.json() : null)
            .then(v => { const n = parseInt(v); if (n > 0) _maxAccountsPerDevice = n; })
            .catch(() => {});
    })();

    // ── Dev bypass — run in console to skip device limit ──────
    // To disable limit:  localStorage.setItem('delivo_dev_bypass', '1')
    // To re-enable:      localStorage.removeItem('delivo_dev_bypass')
    function isDevBypass() {
        return localStorage.getItem('delivo_dev_bypass') === '1';
    }

    // Build a stable fingerprint from device characteristics
    async function getDeviceFingerprint() {
        const components = [
            navigator.language        || '',
            navigator.languages?.join(',') || '',
            navigator.platform        || '',
            navigator.hardwareConcurrency || '',
            screen.width + 'x' + screen.height,
            screen.colorDepth         || '',
            Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            navigator.userAgent       || '',
            // ── Extra entropy — none of the above differ much between two
            // people using the same phone model/OS/browser version, which
            // is exactly the collision problem on a small, homogeneous user
            // base. These add real per-device variation on top:
            window.devicePixelRatio   || '',
            navigator.maxTouchPoints  || '',
        ];

        // Add canvas fingerprint (unique per GPU/driver/browser combo)
        try {
            const canvas  = document.createElement('canvas');
            const ctx     = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font      = '14px Arial';
            ctx.fillStyle = '#FF5C00';
            ctx.fillText('Delivo🇱🇧', 2, 2);
            components.push(canvas.toDataURL());
        } catch (_) {}

        // Add WebGL renderer/vendor strings — identifies the actual GPU
        // (e.g. "Adreno 610" vs "Mali-G57"), which varies far more between
        // individual devices than the generic 2D canvas hash above, since
        // it reflects the exact chipset rather than just the OS/browser's
        // rendering stack.
        try {
            const glCanvas = document.createElement('canvas');
            const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    components.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
                    components.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
                }
            }
        } catch (_) {}

        // Add an audio-stack fingerprint — rendering a short signal through
        // an OfflineAudioContext produces tiny, consistent-per-device
        // floating-point differences driven by the actual audio hardware/
        // driver stack, independent of screen/canvas/GPU signals above.
        try {
            const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx(1, 5000, 44100);
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = 10000;
                const compressor = ctx.createDynamicsCompressor();
                osc.connect(compressor);
                compressor.connect(ctx.destination);
                osc.start(0);
                const rendered = await ctx.startRendering();
                let sum = 0;
                const data = rendered.getChannelData(0);
                for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
                components.push(sum.toString());
            }
        } catch (_) {}

        // Hash all components into a short stable ID
        const raw    = components.join('|');
        const hash   = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(raw)
        );
        const hex = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        // Use first 32 chars as fingerprint ID
        return 'fp_' + hex.slice(0, 32);
    }

    // Get or create a UUID, cross-referencing fingerprint in Firestore
    async function getOrCreateDeviceUUID() {
        // Try localStorage first (fast path) — and if this device already has
        // its own UUID, that always wins, full stop. We deliberately do NOT
        // consult the fingerprint collection at all in this case.
        //
        // Why: Apple's anti-fingerprinting means identical iPhone models on
        // the same iOS version/region render IDENTICAL canvas/WebGL/audio
        // fingerprints — there's no missing entropy source to fix that with,
        // it's by design on Apple's end. The old code let a fingerprint
        // match silently overwrite an already-established device's own
        // stored UUID with some other unrelated device's UUID just because
        // they share an iPhone model, permanently merging two different
        // real customers' device history. Now the fingerprint lookup is
        // used ONLY as a last-resort recovery when there's truly no local
        // UUID yet (first visit, or storage was cleared) — never to
        // override a device that already knows who it is.
        const stored = localStorage.getItem('delivo_device_uuid');
        if (stored) return stored;

        const fp = await getDeviceFingerprint();

        try {
            // Check Firestore for this fingerprint — best-effort recovery only.
            // Note: this can still collide on iPhones (two different devices,
            // both with empty local storage, recovering the same UUID) — that
            // residual case has no real fix on iOS, but it's now limited to
            // the "storage was empty" scenario instead of overriding a device
            // that already had its own identity.
            const fpDoc = await db.collection('device_fingerprints').doc(fp).get();

            if (fpDoc.exists) {
                const uuid = fpDoc.data().uuid;
                localStorage.setItem('delivo_device_uuid', uuid);
                return uuid;
            }

            // Brand new fingerprint — generate a fresh UUID
            const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });

            // Save fingerprint → UUID mapping in Firestore
            await db.collection('device_fingerprints').doc(fp).set({
                uuid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            localStorage.setItem('delivo_device_uuid', uuid);
            return uuid;

        } catch (e) {
            // Firestore unavailable — generate a fresh local UUID
            console.warn('[Delivo] Fingerprint check failed, generating local UUID:', e.message);
            const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            localStorage.setItem('delivo_device_uuid', uuid);
            return uuid;
        }
    }

    // Device limit uses RTDB (no Firestore auth rules issues for new users)
    const _RTDB_DEVICES = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com/devices';

    async function checkDeviceLimit() {
        if (isDevBypass()) return { allowed: true, count: 0, uuid: 'dev-bypass' };
        try {
            const uuid = await getOrCreateDeviceUUID();
            const r    = await fetch(`${_RTDB_DEVICES}/${uuid}.json`);
            const data = r.ok ? await r.json() : null;
            if (!data) return { allowed: true, count: 0, uuid };
            const count = data.accountCount || 0;
            const limit = _maxAccountsPerDevice;
            if (count >= limit) {
                return {
                    allowed: false,
                    count,
                    uuid,
                    message: `لا يمكن إنشاء أكثر من ${limit} حسابات من نفس الجهاز.`,
                };
            }
            return { allowed: true, count, uuid };
        } catch (e) {
            console.error('[Delivo] checkDeviceLimit failed:', e.message);
            return {
                allowed: false,
                count:   _maxAccountsPerDevice,
                uuid:    'unknown',
                message: 'تعذّر التحقق من الجهاز. حاول مجدداً.',
            };
        }
    }

    async function incrementDeviceCount(uuid) {
        if (!uuid || uuid === 'unknown') return;
        try {
            // Read current count, increment, write back
            const r     = await fetch(`${_RTDB_DEVICES}/${uuid}.json`);
            const data  = r.ok ? await r.json() : null;
            const count = (data?.accountCount || 0) + 1;
            await fetch(`${_RTDB_DEVICES}/${uuid}.json`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ accountCount: count, lastUsed: new Date().toISOString() }),
            });
        } catch (e) {
            console.error('[Delivo] incrementDeviceCount:', e.message);
        }
    }

    // ── Username validation ───────────────────────────────────
    // Only lowercase letters, numbers, underscores. 3-30 chars.
    function validateUsername(username) {
        return /^[a-z0-9_]{3,30}$/.test(username);
    }

    // Username is stored as username@delivo.internal in Firebase Auth
    // (Firebase requires email format for email/password auth)
    function usernameToEmail(username) {
        return username.toLowerCase().trim() + '@delivo.internal';
    }

    // ── Auth state observer ──────────────────────────────────
    // _registering: set true during register() so the observer doesn't
    // overwrite DelivoUser with incomplete Firestore data mid-write.
    let _registering = false;

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // During registration the Firestore doc may not exist yet —
            // register() will set DelivoUser manually after the write.
            if (_registering) return;
            window.DelivoUser = {
                uid:         user.uid,
                displayName: user.displayName || '',
                email:       user.email || '',
            };
            try {
                const snap = await db.collection('users').doc(user.uid).get();
                if (snap.exists) {
                    window.DelivoUser = { ...window.DelivoUser, ...snap.data() };
                }
            } catch (_) {}

            // ── Blacklist check ───────────────────────────────
            try {
                const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                const uid       = user.uid;
                const uuid      = window.DelivoUser?.deviceUUID || null;

                // Fetch both uid-based and uuid-based blacklist entries in parallel
                const checks = [fetch(`${RTDB_BASE}/blacklist/${uid}.json`).then(r => r.json())];
                if (uuid) checks.push(fetch(`${RTDB_BASE}/blacklist/${uuid}.json`).then(r => r.json()));

                const results   = await Promise.all(checks);
                const blEntry   = results.find(r => r && r.reason);

                if (blEntry) {
                    // Sign out silently then show blocked screen
                    await auth.signOut();
                    window.DelivoUser = null;
                    _showBlockedScreen(blEntry.reason || 'مخالفة سياسة الاستخدام');
                    return;
                }
            } catch (_) {}
            // ─────────────────────────────────────────────────
        } else {
            window.DelivoUser = null;
        }

        // Sync old navbar button (hidden but kept for compatibility)
        const acctBtn = document.getElementById('account-btn');
        if (acctBtn) {
            if (window.DelivoUser) acctBtn.classList.add('logged-in');
            else                   acctBtn.classList.remove('logged-in');
        }

        // Sync bottom bar account button
        const bbBtn = document.getElementById('bb-account-btn');
        if (bbBtn) {
            if (window.DelivoUser) bbBtn.classList.add('logged-in');
            else                   bbBtn.classList.remove('logged-in');
        }

        if (typeof window.__renderAccountModal === 'function') {
            window.__renderAccountModal();
        }

        // Trigger bottom bar logo state update
        if (window.DelivoUser) {
            if (typeof window.refreshActiveOrders === 'function') window.refreshActiveOrders();
            // Trigger reward reminder (once per session, 8s delay, defined in index.html)
            if (typeof window._checkRewardReminder === 'function') window._checkRewardReminder();
        } else {
            if (typeof window._resetLogoToDefault === 'function') window._resetLogoToDefault();
        }

        console.log('[Delivo Auth] User:', window.DelivoUser
            ? (window.DelivoUser.phone || window.DelivoUser.email || window.DelivoUser.uid)
            : 'none');

        // Platform-wide closed overlay may allowlist specific usernames —
        // re-check it now that we know who's logged in (or logged out).
        if (typeof window._checkPlatformStatus === 'function') window._checkPlatformStatus();

        // One-time signal for anything that needs to wait until Firebase's
        // own (async) auth check has actually resolved at least once —
        // e.g. deciding whether to show the launch modal, which must never
        // flash for an already-logged-in returning user just because this
        // callback hadn't fired yet.
        if (!window._authStateReady) {
            window._authStateReady = true;
            document.dispatchEvent(new CustomEvent('delivoAuthReady'));
        }
    });

    // ── window.DelivoAuth ─────────────────────────────────────
    window.DelivoAuth = {

        // ── Register with username + password ──────────────────
        async register({ username, displayName, password, phone, lat, lng, locationSource = null, skipDeviceLimit = false }) {

            // Validate username
            username = (username || '').toLowerCase().trim();
            if (!validateUsername(username))
                return { error: true, message: 'اسم المستخدم: 3-30 حرف إنجليزي، أرقام أو _  فقط.' };

            // Validate display name
            if (!displayName || displayName.trim().length < 2)
                return { error: true, message: 'أدخل اسمك الظاهر (حرفان على الأقل).' };

            // Validate password
            if (!password || password.length < 8)
                return { error: true, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' };

            // Validate Lebanese phone (required)
            const phoneDigits = (phone || '').replace(/[\s\-]/g, '');
            if (!phoneDigits)
                return { error: true, message: 'رقم الهاتف مطلوب.' };
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits))
                return { error: true, message: 'رقم الهاتف غير صحيح. أدخل رقماً لبنانياً صحيحاً.' };
            const safePhone = '+961' + phoneDigits;

            // Rate limit
            if (!rateLimit('register', 3, 60_000))
                return { error: true, message: 'حاولت كثيراً. انتظر دقيقة.' };

            // ── Check per-phone account limit ─────────────────────────
            // phoneIndex stores { uid1: true, uid2: true, ... } or just a uid string
            // for backwards compat. Count how many accounts already use this number.
            if (_maxAccountsPerPhone > 0) {
                try {
                    const RTDB_BASE_PH = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                    const phResp  = await fetch(`${RTDB_BASE_PH}/phoneIndex/${phoneDigits}.json`);
                    const phData  = await phResp.json();
                    if (phData !== null) {
                        // Legacy: stored as a single uid string → count = 1
                        // New:    stored as { uid1: true, uid2: true } → count = keys
                        const phCount = (typeof phData === 'object' && !Array.isArray(phData))
                            ? Object.keys(phData).length
                            : 1;
                        if (phCount >= _maxAccountsPerPhone) {
                            return {
                                error: true,
                                message: `لا يمكن إنشاء أكثر من ${_maxAccountsPerPhone} حساب بنفس رقم الهاتف.`,
                            };
                        }
                    }
                } catch (_) { /* fail open — don't block if check fails */ }
            }

            // Device fingerprint/UUID is informational only from here on —
            // it's known to produce false positives: two different physical
            // phones of the identical model/OS/browser version can hash to
            // the exact same fingerprint and get merged onto one UUID (see
            // admin panel "⚠️ جهاز واحد" flags). The phone-number limit above
            // is the real anti-abuse gate and stays fully enforced. We still
            // compute the device UUID here — it's still recorded against the
            // account (for the admin panel's same-device flag, reviewed
            // manually) and still checked against the blacklist just below —
            // it just no longer blocks a legitimate signup on its own.
            const deviceCheck = await checkDeviceLimit();

            // Check if device UUID is blacklisted (always enforced, even for OTP)
            if (deviceCheck.uuid) {
                try {
                    const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                    const blResp = await fetch(`${RTDB_BASE}/blacklist/${deviceCheck.uuid}.json`);
                    const blData = await blResp.json();
                    if (blData && blData.reason) {
                        _showBlockedScreen(blData.reason);
                        return { error: true, message: 'هذا الجهاز محظور من استخدام Delivo.' };
                    }
                } catch (_) {}
            }

            // ── Check Firestore username reservation ──────────────────
            const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
            try {
                const taken = await db.collection('usernames').doc(username).get();
                if (taken.exists)
                    return { error: true, message: 'اسم المستخدم محجوز. اختر اسماً آخر.' };
            } catch (e) {}

            // ── Find a free Firebase Auth email slot and create account ──
            // Even when Firestore shows the username as free, the old Auth account
            // (username@delivo.internal) may still exist if it was never fully deleted.
            // Strategy: attempt createUserWithEmailAndPassword on each slot in order.
            // If auth/email-already-in-use -> try the next slot. First success wins.
            //   slot 0 -> username@delivo.internal
            //   slot 1 -> username~1@delivo.internal ... up to slot 19
            // Signal to onAuthStateChanged to hold off during account creation
            _registering = true;
            let _cred = null;
            let _email = null;
            const _slots = [
                username + '@delivo.internal',
                ...Array.from({ length: 19 }, (_, i) => username + '~' + (i + 1) + '@delivo.internal'),
            ];
            for (const _slot of _slots) {
                try {
                    _cred  = await auth.createUserWithEmailAndPassword(_slot, password);
                    _email = _slot;
                    break;
                } catch (_slotErr) {
                    if (_slotErr.code === 'auth/email-already-in-use') continue;
                    console.error('[Delivo] register:', _slotErr.code, _slotErr.message);
                    _registering = false;
                    return { error: true, message: authMsg(_slotErr.code) };
                }
            }
            if (!_cred || !_email) {
                try {
                    _email = username + '~' + Date.now() + '@delivo.internal';
                    _cred  = await auth.createUserWithEmailAndPassword(_email, password);
                } catch(_fb) {
                    _registering = false;
                    return { error: true, message: authMsg(_fb.code) };
                }
            }

            try {
                const email = _email;
                const cred  = _cred;
                const user  = cred.user;

                // Set display name in Auth
                await user.updateProfile({ displayName: sanitize(displayName.trim()) });

                // Save user profile to Firestore
                const userData = {
                    username:           username,
                    displayName:        sanitize(displayName.trim()),
                    phone:              safePhone,
                    deviceUUID:         deviceCheck.uuid,
                    authEmail:          email,   // stored so admin can delete the Auth account later
                    registrationMethod: skipDeviceLimit ? 'otp' : 'standard',
                    createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (lat && lng) {
                    userData.location = { lat: Number(lat), lng: Number(lng) };
                    // Tags how this pin was obtained ('gps' | 'map' | 'ip-approx') so the
                    // admin panel can flag network-approximated pins for later review —
                    // same pattern as the admin's own auto-locate-from-orders tool.
                    if (locationSource) userData.locationSource = locationSource;
                }
                await db.collection('users').doc(user.uid).set(userData);

                // Reserve username in Firestore
                await db.collection('usernames').doc(username).set({
                    uid:       user.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

                // Always clean up any leftover deletedUsernames marker
                try {
                    await fetch(`${RTDB_BASE}/deletedUsernames/${encodeURIComponent(username)}.json`, { method: 'DELETE' });
                } catch(_) {}

                // Index phone for per-phone account limit checks (RTDB fast REST lookup).
                // Stored as { uid: true } map — PATCH so multiple accounts can share a number
                // when the admin allows it (maxAccountsPerPhone > 1).
                try {
                    await fetch(`${RTDB_BASE}/phoneIndex/${phoneDigits}/${user.uid}.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(true),
                    });
                } catch(_) {}

                // Increment device account count
                await incrementDeviceCount(deviceCheck.uuid);

                // ── Immediately populate DelivoUser with full profile ─────
                // onAuthStateChanged fires as soon as createUserWithEmailAndPassword
                // completes — BEFORE the Firestore write above. So DelivoUser ends up
                // with partial/empty data. We overwrite it now with the real values.
                window.DelivoUser = {
                    uid:                user.uid,
                    username:           username,
                    displayName:        sanitize(displayName.trim()),
                    phone:              safePhone,
                    deviceUUID:         deviceCheck.uuid,
                    authEmail:          email,
                    registrationMethod: skipDeviceLimit ? 'otp' : 'standard',
                };
                if (lat && lng) {
                    window.DelivoUser.location = { lat: Number(lat), lng: Number(lng) };
                    if (locationSource) window.DelivoUser.locationSource = locationSource;
                }

                // Re-render account modal and navbar with the correct data
                if (typeof window.__renderAccountModal === 'function') {
                    window.__renderAccountModal();
                }
                const bbBtn2  = document.getElementById('bb-account-btn');
                const acctBtn2 = document.getElementById('account-btn');
                if (bbBtn2)   bbBtn2.classList.add('logged-in');
                if (acctBtn2) acctBtn2.classList.add('logged-in');

                // Allow onAuthStateChanged to run normally from here on
                _registering = false;

                // Platform-wide closed overlay may allowlist specific
                // usernames — re-check now that we know who just registered.
                if (typeof window._checkPlatformStatus === 'function') window._checkPlatformStatus();

                return { success: true };
            } catch (e) {
                _registering = false; // always clear on failure too
                console.error('[Delivo] register:', e.code, e.message);
                return { error: true, message: authMsg(e.code) };
            }
        },

        // ── Login with username + password ─────────────────────
        async login({ username, password }) {
            username = (username || '').toLowerCase().trim();
            if (!username || !password)
                return { error: true, message: 'أدخل اسم المستخدم وكلمة المرور.' };

            if (!rateLimit('login', 5, 600_000))
                return { error: true, message: 'محاولات كثيرة. انتظر 10 دقائق.' };

            try {
                // ── Look up the real authEmail from Firestore first ──────────
                // Registration may create username~N@delivo.internal slots when the
                // base slot is occupied. signInWithEmailAndPassword must use the exact
                // email that was used during createUserWithEmailAndPassword, so we
                // read authEmail from the usernames collection.
                const defaultEmail = usernameToEmail(username); // default / fast path
                let email = defaultEmail;
                let hasMapping = false; // true once we find a real usernames/{username} doc
                try {
                    const unSnap = await db.collection('usernames').doc(username).get();
                    if (unSnap.exists) {
                        hasMapping = true;
                        const uid = unSnap.data().uid;
                        if (uid) {
                            const userSnap = await db.collection('users').doc(uid).get();
                            if (userSnap.exists && userSnap.data().authEmail) {
                                email = userSnap.data().authEmail;
                            }
                        }
                    }
                } catch (_) { /* network hiccup — fall back to default email */ }

                try {
                    await auth.signInWithEmailAndPassword(email, password);
                    return { success: true };
                } catch (firstErr) {
                    // Fallback: if the Firestore-derived email doesn't match any
                    // real Auth account (e.g. the username/users docs were left
                    // stale after a user was deleted+recreated directly in the
                    // Firebase Console instead of through the app's own delete
                    // flow), retry once with the plain default email before
                    // giving up — covers the most common recycling case.
                    const credErrors = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/invalid-email'];
                    if (email !== defaultEmail && credErrors.includes(firstErr.code)) {
                        try {
                            await auth.signInWithEmailAndPassword(defaultEmail, password);
                            return { success: true };
                        } catch (secondErr) {
                            secondErr._noMapping = !hasMapping;
                            throw secondErr;
                        }
                    }
                    firstErr._noMapping = !hasMapping;
                    throw firstErr;
                }
            } catch (e) {
                const isCredError = e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential'
                    || e.code === 'auth/invalid-login-credentials' || e.code === 'auth/wrong-password';
                if (isCredError) {
                    // No usernames/{username} doc at all is the signature of an
                    // account that was created directly in the Firebase Console
                    // rather than through this app's own registration flow — the
                    // Console only creates the Auth credential, never the matching
                    // Firestore profile, so this app has no way to know which
                    // internal email that account actually uses. A plain wrong-
                    // password message would be misleading here, so say so plainly.
                    if (e._noMapping) {
                        return {
                            error: true,
                            message: 'لا يوجد حساب مسجّل بهذا الاسم عبر التطبيق. إذا تم إنشاء هذا الحساب مباشرة من Firebase Console، يجب حذفه والتسجيل من جديد عبر التطبيق نفسه.',
                        };
                    }
                    return { error: true, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
                }
                // Any other/unrecognized code falls through to the generic
                // message — log the raw code+message so it's diagnosable
                // from the console (e.g. API key domain restrictions show
                // up here as something other than a normal auth/* code).
                console.error('[Delivo] login failed — unrecognized error:', e.code, e.message);
                return { error: true, message: authMsg(e.code) };
            }
        },

        // ══════════════════════════════════════════════════════
        // PHONE-FIRST FLOW (new, simplified — no password, ever)
        // Everything below is purely additive: it never touches an
        // existing account's stored fields except deviceUUID (updated
        // only at the moment that account itself signs in via this
        // flow — see finishPhoneLogin), and the old username/password
        // register()/login() above are completely untouched.
        // ══════════════════════════════════════════════════════

        // ── Save a "lead" — full name + phone captured on first launch,
        // before any real account exists. Keyed by this device's UUID
        // (the one getOrCreateDeviceUUID resolves — collision-safe as of
        // the fingerprint fix). Visible to the admin panel as a lead, not
        // a real user, until registerByPhone() converts it.
        // ── Silently patch device/OS info onto an EXISTING lead that
        // predates this field — the launch modal only ever fires once
        // per device (getDeviceLead() short-circuits it forever after),
        // so a lead saved before this detection was added would
        // otherwise stay "unknown" forever with no way to re-trigger
        // saveDeviceLead(). Runs on every page load, fire-and-forget;
        // does nothing once a lead already has both fields, and does
        // nothing at all if this device has no lead yet.
        async backfillDeviceLeadInfo() {
            try {
                const uuid = await getOrCreateDeviceUUID();
                const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                const r = await fetch(`${RTDB_BASE}/deviceLeads/${uuid}.json`);
                const lead = r.ok ? await r.json() : null;
                if (!lead || (lead.device && lead.os)) return;

                const ua = navigator.userAgent;
                let os = 'other';
                if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
                else if (/Android/i.test(ua))     os = 'android';
                const device = /Mobi/i.test(ua) ? 'mobile' : 'desktop';

                await fetch(`${RTDB_BASE}/deviceLeads/${uuid}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device, os }),
                });
            } catch (_) { /* silent — non-critical, next visit will retry */ }
        },

        async saveDeviceLead({ fullName, phone }) {
            const phoneDigits = (phone || '').replace(/[\s\-]/g, '');
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits))
                return { error: true, message: 'رقم الهاتف غير صحيح.' };
            if (!fullName || fullName.trim().length < 2)
                return { error: true, message: 'أدخل الاسم الكامل (حرفان على الأقل).' };

            try {
                const uuid = await getOrCreateDeviceUUID();
                const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                // Same device/OS detection as scripts/presence.js, so the
                // admin panel's "الزوار" list matches the icons/labels
                // already used for the live-presence view.
                const ua = navigator.userAgent;
                let os = 'other';
                if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
                else if (/Android/i.test(ua))     os = 'android';
                const device = /Mobi/i.test(ua) ? 'mobile' : 'desktop';

                await fetch(`${RTDB_BASE}/deviceLeads/${uuid}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fullName:  sanitize(fullName.trim()),
                        phone:     phoneDigits,
                        createdAt: new Date().toISOString(),
                        converted: false,
                        device,
                        os,
                    }),
                });
                return { success: true };
            } catch (e) {
                return { error: true, message: 'تعذر حفظ البيانات. تحقق من اتصالك.' };
            }
        },

        // ── Read back this device's lead (if any) — used on page load to
        // decide whether to show the launch modal at all.
        async getDeviceLead() {
            try {
                const uuid = await getOrCreateDeviceUUID();
                const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                const r = await fetch(`${RTDB_BASE}/deviceLeads/${uuid}.json`);
                return r.ok ? await r.json() : null;
            } catch (_) { return null; }
        },

        // ── Register with phone + full name only — no username, no
        // password, no location required. Mirrors register() above for
        // everything it needs to share (device/blacklist checks, slot
        // retry, Firestore/RTDB writes), just without those three fields.
        async registerByPhone({ fullName, phone, lat, lng, locationSource = null }) {
            if (!fullName || fullName.trim().length < 2)
                return { error: true, message: 'أدخل الاسم الكامل (حرفان على الأقل).' };

            const phoneDigits = (phone || '').replace(/[\s\-]/g, '');
            if (!phoneDigits)
                return { error: true, message: 'رقم الهاتف مطلوب.' };
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits))
                return { error: true, message: 'رقم الهاتف غير صحيح. أدخل رقماً لبنانياً صحيحاً.' };
            const safePhone = '+961' + phoneDigits;

            if (!rateLimit('registerByPhone', 3, 60_000))
                return { error: true, message: 'حاولت كثيراً. انتظر دقيقة.' };

            // Guard: this function assumes a brand-new phone. If it's
            // already registered, point the caller at the login flow
            // instead of silently creating a duplicate account.
            try {
                const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                const phResp = await fetch(`${RTDB_BASE}/phoneIndex/${phoneDigits}.json`);
                const phData = await phResp.json();
                if (phData !== null) {
                    return { error: true, alreadyRegistered: true, message: 'هذا الرقم مسجّل مسبقاً. سجّل الدخول برقم هاتفك.' };
                }
            } catch (_) { /* fail open — same posture as register()'s own phone-limit check */ }

            const deviceCheck = await checkDeviceLimit();

            if (deviceCheck.uuid) {
                try {
                    const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
                    const blResp = await fetch(`${RTDB_BASE}/blacklist/${deviceCheck.uuid}.json`);
                    const blData = await blResp.json();
                    if (blData && blData.reason) {
                        _showBlockedScreen(blData.reason);
                        return { error: true, message: 'هذا الجهاز محظور من استخدام Delivo.' };
                    }
                } catch (_) {}
            }

            // Auto-generate username from the phone digits — deterministic,
            // effectively collision-free since phone numbers are already
            // gated unique above. Slot-retry kept anyway, same safety net
            // register() uses for its Auth-email slots.
            const baseUsername = 'p' + phoneDigits;
            const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

            // Auto-generate a throwaway password — Firebase's email/password
            // provider requires SOME value at creation time, but nothing
            // ever signs in with it again after this moment. All future
            // logins for this account go through the phone+device/OTP flow
            // below, which mints a real Auth token server-side instead.
            const throwawayPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
                .map(b => b.toString(16).padStart(2, '0')).join('');

            _registering = true;
            let _cred = null, _email = null, _username = baseUsername;
            const _slots = [
                baseUsername + '@delivo.internal',
                ...Array.from({ length: 19 }, (_, i) => baseUsername + '~' + (i + 1) + '@delivo.internal'),
            ];
            let slotIdx = 0;
            for (const _slot of _slots) {
                try {
                    _cred  = await auth.createUserWithEmailAndPassword(_slot, throwawayPassword);
                    _email = _slot;
                    _username = slotIdx === 0 ? baseUsername : (baseUsername + '~' + slotIdx);
                    break;
                } catch (_slotErr) {
                    if (_slotErr.code === 'auth/email-already-in-use') { slotIdx++; continue; }
                    console.error('[Delivo] registerByPhone:', _slotErr.code, _slotErr.message);
                    _registering = false;
                    return { error: true, message: authMsg(_slotErr.code) };
                }
            }
            if (!_cred || !_email) {
                try {
                    _email = baseUsername + '~' + Date.now() + '@delivo.internal';
                    _username = _email.split('@')[0];
                    _cred  = await auth.createUserWithEmailAndPassword(_email, throwawayPassword);
                } catch (_fb) {
                    _registering = false;
                    return { error: true, message: authMsg(_fb.code) };
                }
            }

            try {
                const email = _email;
                const cred  = _cred;
                const user  = cred.user;
                const safeFullName = sanitize(fullName.trim());

                await user.updateProfile({ displayName: safeFullName });

                const userData = {
                    username:           _username,
                    displayName:        safeFullName,
                    phone:              safePhone,
                    deviceUUID:         deviceCheck.uuid,
                    authEmail:          email,
                    registrationMethod: 'phone-otp',
                    createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (lat && lng) {
                    userData.location = { lat: Number(lat), lng: Number(lng) };
                    if (locationSource) userData.locationSource = locationSource;
                }
                await db.collection('users').doc(user.uid).set(userData);

                await db.collection('usernames').doc(_username).set({
                    uid:       user.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

                try {
                    await fetch(`${RTDB_BASE}/deletedUsernames/${encodeURIComponent(_username)}.json`, { method: 'DELETE' });
                } catch(_) {}

                try {
                    await fetch(`${RTDB_BASE}/phoneIndex/${phoneDigits}/${user.uid}.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(true),
                    });
                } catch(_) {}

                await incrementDeviceCount(deviceCheck.uuid);

                // Mark this device's lead as converted, keeping the record
                // for admin visibility rather than deleting it.
                try {
                    const uuid = deviceCheck.uuid;
                    if (uuid) {
                        await fetch(`${RTDB_BASE}/deviceLeads/${uuid}/converted.json`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(true),
                        });
                        await fetch(`${RTDB_BASE}/deviceLeads/${uuid}/uid.json`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(user.uid),
                        });
                    }
                } catch(_) {}

                window.DelivoUser = {
                    uid: user.uid, username: _username, displayName: safeFullName,
                    phone: safePhone, deviceUUID: deviceCheck.uuid, authEmail: email,
                    registrationMethod: 'phone-otp',
                };
                if (lat && lng) {
                    window.DelivoUser.location = { lat: Number(lat), lng: Number(lng) };
                    if (locationSource) window.DelivoUser.locationSource = locationSource;
                }

                if (typeof window.__renderAccountModal === 'function') window.__renderAccountModal();
                const bbBtn2 = document.getElementById('bb-account-btn');
                const acctBtn2 = document.getElementById('account-btn');
                if (bbBtn2) bbBtn2.classList.add('logged-in');
                if (acctBtn2) acctBtn2.classList.add('logged-in');

                _registering = false;
                if (typeof window._checkPlatformStatus === 'function') window._checkPlatformStatus();

                return { success: true };
            } catch (e) {
                _registering = false;
                console.error('[Delivo] registerByPhone:', e.code, e.message);
                return { error: true, message: authMsg(e.code) };
            }
        },

        // ── Step 1 of returning login — given a phone number, find the
        // account and decide whether this device already matches (instant
        // login) or an OTP is required (new/different device).
        async resolvePhoneLogin({ phone }) {
            const phoneDigits = (phone || '').replace(/[\s\-]/g, '');
            if (!/^(03|70|71|76|78|79|81|82|83|86)\d{6}$/.test(phoneDigits))
                return { error: true, message: 'رقم الهاتف غير صحيح.' };

            if (!rateLimit('resolvePhoneLogin', 8, 300_000))
                return { error: true, message: 'محاولات كثيرة. انتظر قليلاً.' };

            const RTDB_BASE = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
            try {
                const phResp = await fetch(`${RTDB_BASE}/phoneIndex/${phoneDigits}.json`);
                const phData = await phResp.json();
                if (!phData) return { error: true, notFound: true, message: 'لا يوجد حساب بهذا الرقم. سجّل حساباً جديداً.' };

                // phData is normally { uid: true }; take the first uid.
                // (Multiple accounts sharing one phone is an admin-enabled
                // edge case — this picks the first, same posture register()
                // already takes toward that setting.)
                const uid = (typeof phData === 'object' && !Array.isArray(phData))
                    ? Object.keys(phData)[0]
                    : null;
                if (!uid) return { error: true, notFound: true, message: 'لا يوجد حساب بهذا الرقم. سجّل حساباً جديداً.' };

                const thisDeviceUuid = await getOrCreateDeviceUUID();

                return { success: true, uid, phone: phoneDigits, deviceUUID: thisDeviceUuid };
            } catch (e) {
                return { error: true, message: 'تعذر التحقق. تحقق من اتصالك.' };
            }
        },

        // ── Step 2 of returning login — calls the Cloud Function. If the
        // device already matches, this signs in immediately with no OTP.
        // Otherwise pass otpVerified: true only after the caller has
        // already checked the WhatsApp code client-side (same trust
        // boundary the registration OTP already uses).
        async finishPhoneLogin({ uid, phone, deviceUUID, otpVerified = false }) {
            if (!rateLimit('finishPhoneLogin', 8, 300_000))
                return { error: true, message: 'محاولات كثيرة. انتظر قليلاً.' };
            try {
                const resp = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/customerPhoneLogin', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ uid, phone, deviceUUID, otpVerified }),
                });
                const data = await resp.json();
                if (!resp.ok || data.error) return { error: true, message: data.error || 'تعذر تسجيل الدخول' };
                if (data.requiresOtp) return { requiresOtp: true };

                _registering = true;
                await auth.signInWithCustomToken(data.token);
                // onAuthStateChanged will populate window.DelivoUser from
                // Firestore normally — but do it here too so the caller's
                // very next line (closing the modal, redirecting, etc.)
                // already has a populated DelivoUser to work with.
                const snap = await db.collection('users').doc(uid).get();
                window.DelivoUser = { uid, ...(snap.exists ? snap.data() : {}) };
                _registering = false;

                if (typeof window.__renderAccountModal === 'function') window.__renderAccountModal();
                const bbBtn2 = document.getElementById('bb-account-btn');
                const acctBtn2 = document.getElementById('account-btn');
                if (bbBtn2) bbBtn2.classList.add('logged-in');
                if (acctBtn2) acctBtn2.classList.add('logged-in');
                if (typeof window._checkPlatformStatus === 'function') window._checkPlatformStatus();

                return { success: true };
            } catch (e) {
                _registering = false;
                return { error: true, message: 'تعذر تسجيل الدخول. تحقق من اتصالك وحاول مجدداً.' };
            }
        },

        // ── Update profile (display name + phone + location) ────
        async updateProfile({ displayName, phone, lat, lng }) {
            const user = auth.currentUser;
            if (!user) return { error: true, message: 'يجب تسجيل الدخول أولاً.' };

            if (!displayName || displayName.trim().length < 2)
                return { error: true, message: 'أدخل الاسم الظاهر (حرفان على الأقل).' };

            try {
                const safeName  = sanitize(displayName.trim());
                const safePhone = sanitize((phone || '').trim());

                // Update Firebase Auth display name
                await user.updateProfile({ displayName: safeName });

                // Build Firestore update
                const updateData = {
                    displayName: safeName,
                    updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
                };
                if (safePhone) updateData.phone = safePhone;

                // Save location if provided
                if (lat && lng) {
                    updateData.location = {
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                    };
                }

                await db.collection('users').doc(user.uid).update(updateData);

                // Update local DelivoUser
                if (window.DelivoUser) {
                    window.DelivoUser.displayName = safeName;
                    if (safePhone) window.DelivoUser.phone = safePhone;
                    if (lat && lng) window.DelivoUser.location = {
                        lat: parseFloat(lat),
                        lng: parseFloat(lng),
                    };
                }

                return { success: true };
            } catch (e) {
                console.error('[Delivo] updateProfile:', e);
                return { error: true, message: authMsg(e.code) };
            }
        },

        // ── Change password ────────────────────────────────────
        async changePassword({ currentPassword, newPassword }) {
            const user = auth.currentUser;
            if (!user) return { error: true, message: 'يجب تسجيل الدخول أولاً.' };

            if (!currentPassword)
                return { error: true, message: 'أدخل كلمة المرور الحالية.' };
            if (!newPassword || newPassword.length < 8)
                return { error: true, message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.' };
            if (currentPassword === newPassword)
                return { error: true, message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.' };

            try {
                // Re-authenticate first (required by Firebase before password change)
                const email      = user.email;
                const credential = firebase.auth.EmailAuthProvider.credential(email, currentPassword);
                await user.reauthenticateWithCredential(credential);

                // Change password
                await user.updatePassword(newPassword);
                return { success: true };
            } catch (e) {
                console.error('[Delivo] changePassword:', e);
                if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential' ||
                    e.code === 'auth/invalid-login-credentials')
                    return { error: true, message: 'كلمة المرور الحالية غير صحيحة.' };
                return { error: true, message: authMsg(e.code) };
            }
        },

        async logout() {
            try {
                await auth.signOut();
                return { success: true };
            } catch (e) {
                return { error: true, message: authMsg(e.code) };
            }
        },

        // ── SMS methods (kept, ready to re-enable later) ───────
        // When SMS is fixed, just wire these back to the UI.
        async sendOTP({ name, phone }) {
            return { error: true, message: 'SMS verification coming soon.' };
        },
        async verifyOTP({ code }) {
            return { error: true, message: 'SMS verification coming soon.' };
        },
        async resendOTP() {
            return { error: true, message: 'SMS verification coming soon.' };
        },
    };

    // ── window.DelivoDB ───────────────────────────────────────
    window.DelivoDB = {

        async getStores(category = 'all') {
            try {
                let ref = db.collection('stores').where('active', '==', true).orderBy('order');
                if (category !== 'all') ref = ref.where('category', '==', category);
                const snap = await ref.get();
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) { console.error('[DB] getStores:', e); return []; }
        },

        async getCategories() {
            try {
                const snap = await db.collection('categories')
                    .where('active', '==', true).orderBy('order').get();
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) { console.error('[DB] getCategories:', e); return []; }
        },

        async getOffers() {
            try {
                const snap = await db.collection('offers')
                    .where('active', '==', true).orderBy('order').get();
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) { console.error('[DB] getOffers:', e); return []; }
        },

        // ── Check if user is blocked ───────────────────────────
        // Call this before showing the order flow.
        // You block a user by setting blocked:true in their
        // Firestore document from Firebase Console.
        async isUserBlocked(uid) {
            if (!uid) return false;
            try {
                const snap = await db.collection('users').doc(uid).get();
                if (!snap.exists) return false;
                return snap.data().blocked === true;
            } catch (e) {
                console.error('[DB] isUserBlocked:', e);
                return false;
            }
        },

        // ── Check daily order limit ────────────────────────────
        // Returns { allowed: true } or { allowed: false, message, count, limit }
        // MAX_DAILY_ORDERS is read from /settings/orders doc so
        // you can change it anytime from Firebase Console without
        // touching code. Defaults to 3 if not set.
        async checkDailyLimit(uid) {
            if (!uid) return { allowed: false, message: 'يجب تسجيل الدخول أولاً.' };

            try {
                // Get limit from settings (you can change this in Firestore Console)
                let maxOrders = 3; // default
                try {
                    const settingsSnap = await db.collection('settings').doc('orders').get();
                    if (settingsSnap.exists && settingsSnap.data().maxPerDay) {
                        maxOrders = settingsSnap.data().maxPerDay;
                    }
                } catch (_) {}

                // Count today's orders for this user
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);

                const snap = await db.collection('orders')
                    .where('userId', '==', uid)
                    .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
                    .get();

                const count = snap.size;

                if (count >= maxOrders) {
                    return {
                        allowed:  false,
                        message:  `لقد وصلت للحد الأقصى من الطلبات اليومية (${maxOrders} طلبات). حاول غداً.`,
                        count,
                        limit:    maxOrders,
                    };
                }

                return { allowed: true, count, limit: maxOrders, remaining: maxOrders - count };
            } catch (e) {
                console.error('[DB] checkDailyLimit:', e);
                // Fail open — don't block user if check fails
                return { allowed: true };
            }
        },

        // ── Place an order (with limit + block check built in) ─
        async placeOrder(uid, { storeId, items, total, address, notes }) {
            if (!uid) return { error: true, message: 'يجب تسجيل الدخول لإتمام الطلب.' };

            // 1. Check if user is blocked
            const blocked = await window.DelivoDB.isUserBlocked(uid);
            if (blocked) {
                return {
                    error:   true,
                    message: 'حسابك موقوف. تواصل مع الدعم للمزيد من المعلومات.',
                    blocked: true,
                };
            }

            // 2. Check daily order limit
            const limitCheck = await window.DelivoDB.checkDailyLimit(uid);
            if (!limitCheck.allowed) {
                return { error: true, message: limitCheck.message, limitReached: true };
            }

            // 3. Validate order data
            if (!items || items.length === 0)
                return { error: true, message: 'السلة فارغة.' };
            if (!total || total <= 0)
                return { error: true, message: 'المبلغ غير صحيح.' };
            if (!storeId)
                return { error: true, message: 'لم يتم تحديد المتجر.' };

            // 4. Place the order
            try {
                const ref = await db.collection('orders').add({
                    userId:    uid,
                    storeId:   sanitize(String(storeId)),
                    items:     items.map(i => ({
                        id:    sanitize(String(i.id)),
                        name:  sanitize(String(i.name)),
                        price: Number(i.price),
                        qty:   Math.max(1, Math.floor(Number(i.qty))),
                    })),
                    total:     Number(total),
                    address:   sanitize(String(address || '')),
                    notes:     sanitize(String(notes   || '')).slice(0, 200),
                    status:    'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                return { success: true, orderId: ref.id };
            } catch (e) {
                console.error('[DB] placeOrder:', e);
                return { error: true, message: 'فشل إرسال الطلب. حاول مجدداً.' };
            }
        },
    };

    console.log('[Delivo] Firebase ready ✓');
}
// ── Blocked screen ────────────────────────────────────────────
function _showBlockedScreen(reason) {
    // Remove splash so blocked screen is visible
    const splash = document.getElementById('delivo-splash');
    if (splash) splash.classList.add('hidden');

    // Inject blocked screen if not already there
    if (document.getElementById('delivo-blocked')) return;

    // Local-number formatter — strips a leading 961 country code (kept in
    // the wa.me link itself, just not shown to the customer) and groups
    // the remaining digits for readability.
    function _formatLocalPhone(raw) {
        let digits = String(raw || '').replace(/[^\d]/g, '');
        if (digits.startsWith('961')) digits = digits.slice(3);
        if (digits.length === 8) return digits.slice(0, 2) + ' ' + digits.slice(2, 5) + ' ' + digits.slice(5);
        return digits;
    }

    // Fallback used only if settings/adminPhone hasn't been configured yet
    // or the fetch fails — same number this screen always showed before.
    const FALLBACK_PHONE = '96170714152';

    const el = document.createElement('div');
    el.id = 'delivo-blocked';
    el.innerHTML = `
        <div class="blk-card">
            <div class="blk-icon">🚫</div>
            <h1 class="blk-title">تم حظرك من Delivo</h1>
            <p class="blk-msg">
                لقد تم حظر حسابك من منصة Delivo من قِبل الإدارة.
            </p>
            <div class="blk-reason">
                <span class="blk-reason-label">سبب الحظر</span>
                <span class="blk-reason-val">${reason}</span>
            </div>
            <p class="blk-contact">
                إذا كنت تعتقد أن هذا خطأ، تواصل معنا عبر واتساب
                <a id="blk-contact-link" href="https://wa.me/${FALLBACK_PHONE}">📞 <span dir="ltr">${_formatLocalPhone(FALLBACK_PHONE)}</span></a>
            </p>
        </div>
    `;

    // Inline styles so this works even if CSS fails to load
    const style = document.createElement('style');
    style.textContent = `
        #delivo-blocked {
            position: fixed; inset: 0; z-index: 99999;
            background: #0a0a0f;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Almarai', 'Segoe UI', sans-serif;
            direction: rtl; padding: 24px;
        }
        .blk-card {
            background: #111118; border: 1px solid rgba(239,68,68,0.25);
            border-radius: 24px; padding: 40px 32px;
            max-width: 420px; width: 100%; text-align: center;
            box-shadow: 0 0 0 1px rgba(239,68,68,0.08), 0 24px 80px rgba(0,0,0,0.7);
        }
        .blk-icon { font-size: 3.5rem; margin-bottom: 20px; display: block; }
        .blk-title {
            font-size: 1.5rem; font-weight: 800; color: #f0f0f8;
            margin: 0 0 12px;
        }
        .blk-msg {
            font-size: 0.92rem; color: #9898a6; line-height: 1.7; margin: 0 0 20px;
        }
        .blk-reason {
            background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
            border-radius: 14px; padding: 14px 18px; margin-bottom: 20px;
            display: flex; flex-direction: column; gap: 5px;
        }
        .blk-reason-label {
            font-size: 0.68rem; font-weight: 800; color: #ef4444;
            letter-spacing: 1px; text-transform: uppercase;
        }
        .blk-reason-val {
            font-size: 0.9rem; color: #f0f0f8; font-weight: 700; line-height: 1.5;
        }
        .blk-contact {
            font-size: 0.8rem; color: #6b6b82; line-height: 1.7; margin: 0;
        }
        .blk-contact a {
            color: #FF5C00; text-decoration: none; font-weight: 700;
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);

    // Show the fallback number instantly (no network wait for something
    // this important), then swap in the admin's actual configured number
    // — same settings/adminPhone value cart.js already reads elsewhere —
    // once it arrives. If nothing's configured, the fallback simply stays.
    fetch('https://deliveryonline-300f7-default-rtdb.firebaseio.com/settings/adminPhone.json')
        .then(r => r.ok ? r.json() : null)
        .then(phone => {
            if (!phone) return;
            const link = document.getElementById('blk-contact-link');
            if (!link) return;
            const digits = String(phone).replace(/[^\d]/g, '');
            link.href = `https://wa.me/${digits}`;
            link.innerHTML = `📞 <span dir="ltr">${_formatLocalPhone(digits)}</span>`;
        })
        .catch(() => {}); // fallback number already showing — fail silent

    // Also block all interaction
    document.body.style.overflow = 'hidden';
}
// ── Firebase init failure guard ───────────────────────────────
// If Firebase fails to load (network error, SDK quota, etc.),
// DelivoAuth and DelivoDB won't be defined. This stub prevents
// ── Dollar/LBP exchange rate — loaded from /settings/dollarRate ──────────
// Default 90,000 until Firebase responds. All scripts read window._LBP_RATE.
window._LBP_RATE         = 90000;
window._greenApiInstance = '';
window._greenApiToken    = '';
(function _initSettings() {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    // Dollar rate
    fetch(`${RTDB}/settings/dollarRate.json`)
        .then(r => r.ok ? r.json() : null)
        .then(val => { const n = parseFloat(val); if (n && n > 0) window._LBP_RATE = n; })
        .catch(() => {});
    // GREEN-API credentials for OTP
    fetch(`${RTDB}/settings.json`)
        .then(r => r.ok ? r.json() : null)
        .then(s => {
            if (!s) return;
            if (s.greenApiInstance) window._greenApiInstance = s.greenApiInstance;
            if (s.greenApiToken)    window._greenApiToken    = s.greenApiToken;
        })
        .catch(() => {});
})();

// JS exceptions and shows a friendly error instead.
(function installFailsafeStub() {
    const STUB_MSG = 'الخدمة غير متاحة حالياً. تحقق من اتصالك وأعد المحاولة.';

    function stubFn() {
        return Promise.resolve({ error: true, message: STUB_MSG });
    }

    // Wait 8s — if Firebase still hasn't initialised, install stubs
    setTimeout(() => {
        if (!window.DelivoAuth) {
            console.warn('[Delivo] Firebase did not initialise — installing stubs');
            window.DelivoAuth = {
                register: stubFn, login: stubFn, logout: stubFn,
                updateProfile: stubFn, changePassword: stubFn,
                sendOTP: stubFn, verifyOTP: stubFn, resendOTP: stubFn,
            };
        }
        if (!window.DelivoDB) {
            window.DelivoDB = {
                getStores: () => Promise.resolve([]),
                getCategories: () => Promise.resolve([]),
                getOffers: () => Promise.resolve([]),
                isUserBlocked: () => Promise.resolve(false),
                checkDailyLimit: () => Promise.resolve({ allowed: false, message: STUB_MSG }),
                placeOrder: stubFn,
            };
        }
    }, 8000);
})();