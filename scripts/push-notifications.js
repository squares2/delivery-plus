/* ============================================================
   scripts/push-notifications.js
   Web Push (Firebase Cloud Messaging) registration for
   drivers & employees. Delivers real OS-level notifications
   even when driver.html / admin.html is fully closed.

   Include AFTER firebase-app-compat.js + firebase-messaging-compat.js
   on any page that should be able to receive push (currently
   driver.html and admin.html).

   ⚠️ ONE-TIME SETUP REQUIRED BEFORE THIS WORKS:
   Firebase Console → Project Settings → Cloud Messaging →
   "Web configuration" → Web Push certificates → generate a
   key pair → paste the PUBLIC key into DELIVO_VAPID_KEY below.
   ============================================================ */

const DELIVO_VAPID_KEY = 'BIt4N3I_UDKD4T8WbGwtUAlwVNnMmxkxMdAKrVxmirYvgbom3FrO5ePlamBzUu3J4BcjwFHHkBbGya1XtR6qxtE';

// Dedicated Firebase app instance, isolated from whatever named app
// each host page (admin.html uses a named 'admin' app, driver.html
// uses the default app) already set up for Auth/Firestore/RTDB — so
// this always talks to the correct messagingSenderId regardless of
// what the host page's own config looks like.
const _FCM_CONFIG = {
    apiKey:            'AIzaSyCSTThgge2nSFlEQXjS1ta2tZXvVgNAnZ0',
    authDomain:        'deliveryonline-300f7.firebaseapp.com',
    databaseURL:       'https://deliveryonline-300f7-default-rtdb.firebaseio.com',
    projectId:         'deliveryonline-300f7',
    storageBucket:     'deliveryonline-300f7.firebasestorage.app',
    messagingSenderId: '360058447266',
    appId:             '1:360058447266:web:5ac25e3ad30f636bdd3efb',
};

const RTDB_PUSH = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

function _fcmApp() {
    const existing = firebase.apps.find(a => a.name === 'delivo-fcm');
    return existing || firebase.initializeApp(_FCM_CONFIG, 'delivo-fcm');
}

async function _saveToken(identityKey, role, name, token) {
    await fetch(`${RTDB_PUSH}/fcmTokens/${identityKey}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token, role, name: name || '',
            updatedAt: Date.now(),
            ua: navigator.userAgent,
        }),
    });
}

window.DelivoPush = {
    // Call once, right after login/session start.
    //   identityKey — stable id: driverData.id for drivers, currentAdmin._key (or username) for employees
    //   role        — 'driver' | 'employee'
    //   name        — display name, stored alongside the token for admin's own reference
    async register(identityKey, role, name) {
        if (!identityKey) return { ok: false, reason: 'no-identity' };
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            return { ok: false, reason: 'unsupported' };
        }
        if (!DELIVO_VAPID_KEY || DELIVO_VAPID_KEY.startsWith('PASTE_')) {
            console.warn('[DelivoPush] VAPID key not configured yet — skipping push registration. ' +
                          'See scripts/push-notifications.js for setup instructions.');
            return { ok: false, reason: 'no-vapid-key' };
        }

        try {
            let permission = Notification.permission;
            if (permission === 'default') permission = await Notification.requestPermission();
            if (permission !== 'granted') return { ok: false, reason: 'denied' };

            const app = _fcmApp();
            if (!firebase.messaging.isSupported()) return { ok: false, reason: 'unsupported' };
            const messaging = firebase.messaging(app);

            const reg = await navigator.serviceWorker.ready;
            const token = await messaging.getToken({
                vapidKey: DELIVO_VAPID_KEY,
                serviceWorkerRegistration: reg,
            });
            if (!token) return { ok: false, reason: 'no-token' };

            await _saveToken(identityKey, role, name, token);

            // FCM tokens can rotate — keep the stored one fresh.
            if (messaging.onTokenRefresh) {
                messaging.onTokenRefresh(async () => {
                    try {
                        const fresh = await messaging.getToken({ vapidKey: DELIVO_VAPID_KEY, serviceWorkerRegistration: reg });
                        if (fresh) await _saveToken(identityKey, role, name, fresh);
                    } catch (_) {}
                });
            }

            // Foreground messages (tab actually open) aren't auto-displayed by
            // FCM — only background ones are (handled in sw.js). Show them
            // manually here so behavior is consistent either way.
            if (messaging.onMessage) {
                messaging.onMessage(payload => {
                    const title = payload.notification?.title || payload.data?.title || 'Delivo';
                    const body  = payload.notification?.body  || payload.data?.body  || '';
                    reg.showNotification(title, {
                        body,
                        icon: './assets/logo.png',
                        data: payload.data || {},
                    });
                });
            }

            console.log('[DelivoPush] Registered ✓', role, identityKey);
            return { ok: true, token };
        } catch (e) {
            console.warn('[DelivoPush] register failed:', e.message);
            return { ok: false, reason: e.message };
        }
    },
};
