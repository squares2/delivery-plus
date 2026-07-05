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
        const fp = await getDeviceFingerprint();

        // Try localStorage first (fast path)
        const stored = localStorage.getItem('delivo_device_uuid');

        try {
            // Check Firestore for this fingerprint
            const fpDoc = await db.collection('device_fingerprints').doc(fp).get();

            if (fpDoc.exists) {
                // Fingerprint known — use its UUID (even if localStorage was cleared)
                const uuid = fpDoc.data().uuid;
                localStorage.setItem('delivo_device_uuid', uuid);
                return uuid;
            }

            // New fingerprint — generate UUID
            const uuid = stored || ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }));

            // Save fingerprint → UUID mapping in Firestore
            await db.collection('device_fingerprints').doc(fp).set({
                uuid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            localStorage.setItem('delivo_device_uuid', uuid);
            return uuid;

        } catch (e) {
            // Firestore unavailable — fall back to localStorage
            console.warn('[Delivo] Fingerprint check failed, using localStorage:', e.message);
            if (stored) return stored;
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
    });

    // ── window.DelivoAuth ─────────────────────────────────────
    window.DelivoAuth = {

        // ── Register with username + password ──────────────────
        async register({ username, displayName, password, phone, lat, lng, skipDeviceLimit = false }) {

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

            // Check device limit — enforced for standard registration, bypassed for OTP-verified
            const deviceCheck = await checkDeviceLimit();
            if (!skipDeviceLimit && !deviceCheck.allowed)
                return { error: true, message: deviceCheck.message };

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
                try {
                    const unSnap = await db.collection('usernames').doc(username).get();
                    if (unSnap.exists) {
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
                    const credErrors = ['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-email'];
                    if (email !== defaultEmail && credErrors.includes(firstErr.code)) {
                        try {
                            await auth.signInWithEmailAndPassword(defaultEmail, password);
                            return { success: true };
                        } catch (secondErr) {
                            throw secondErr;
                        }
                    }
                    throw firstErr;
                }
            } catch (e) {
                // Map to Arabic
                if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password')
                    return { error: true, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
                // Any other/unrecognized code falls through to the generic
                // message — log the raw code+message so it's diagnosable
                // from the console (e.g. API key domain restrictions show
                // up here as something other than a normal auth/* code).
                console.error('[Delivo] login failed — unrecognized error:', e.code, e.message);
                return { error: true, message: authMsg(e.code) };
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
                if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
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
                <a href="https://wa.me/96170714152">📞 +961 70 714 152</a>
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