/* ============================================================
   functions_push_notifications.js
   STANDALONE — merge this into your existing functions/index.js.

   Copy the `require`s you don't already have, and add the
   `exports.sendQueuedPush = ...` block alongside your existing
   exports (e.g. next to adminResetPassword).

   ── What this does ──────────────────────────────────────────
   Watches /pushQueue in Realtime Database. Any time a new entry
   is written there — by admin.html's notifyDriverAssigned() on
   order assignment, by the 🔔 test-push buttons, or by any future
   automatic event you wire up the same way — this function:
     1. Reads /fcmTokens/{identityKey} to find that driver's or
        employee's stored push token.
     2. Sends a real Web Push notification via Firebase Cloud
        Messaging — delivered even if driver.html/admin.html is
        fully closed.
     3. Cleans up the queue entry (and the token, if it turned out
        to be dead/expired).

   ── One-time setup required before this works ──────────────────
   1. Firebase Console → Project Settings → Cloud Messaging →
      "Web configuration" → Web Push certificates → generate a
      key pair. Paste the PUBLIC key into
      scripts/push-notifications.js (DELIVO_VAPID_KEY constant).
   2. firebase-admin must be a dependency in functions/package.json
      (it already is if adminResetPassword.js works, since that
      also needs the Admin SDK).
   3. Deploy: firebase deploy --only functions:sendQueuedPush
   ============================================================ */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

// If your functions/index.js already calls admin.initializeApp(),
// remove this line when merging — you only want to call it once
// per functions deployment.
if (!admin.apps.length) admin.initializeApp();

const db = admin.database();

exports.sendQueuedPush = functions.database
    .ref('/pushQueue/{pushId}')
    .onCreate(async (snapshot, context) => {
        const job = snapshot.val();

        if (!job || !job.to) {
            await snapshot.ref.remove().catch(() => {});
            return null;
        }

        try {
            const tokenSnap = await db.ref(`/fcmTokens/${job.to}`).once('value');
            const tokenData = tokenSnap.val();

            if (!tokenData || !tokenData.token) {
                console.warn(`[sendQueuedPush] No FCM token stored for "${job.to}" — skipping (they may not have opened the app since push was enabled).`);
                return null;
            }

            // Data payload must be all strings — FCM requirement.
            const dataPayload = {};
            Object.entries(job.data || {}).forEach(([k, v]) => { dataPayload[k] = String(v); });

            const message = {
                token: tokenData.token,
                notification: {
                    title: job.title || 'Delivo',
                    body:  job.body  || '',
                },
                data: dataPayload,
                webpush: {
                    fcmOptions: {
                        link: (job.data && job.data.url) || '/',
                    },
                },
            };

            await admin.messaging().send(message);
            console.log(`[sendQueuedPush] Sent to "${job.to}" (${tokenData.role || 'unknown role'})`);

        } catch (err) {
            console.error(`[sendQueuedPush] Failed for "${job.to}":`, err.message);

            // Token is no longer valid (uninstalled, cleared browser data,
            // permission revoked, etc.) — remove it so future sends don't
            // keep failing on the same dead token.
            if (err.code === 'messaging/registration-token-not-registered' ||
                err.code === 'messaging/invalid-registration-token') {
                await db.ref(`/fcmTokens/${job.to}`).remove().catch(() => {});
            }
        } finally {
            // The queue is transient — always clear the processed entry
            // regardless of success/failure, so it doesn't pile up.
            await snapshot.ref.remove().catch(() => {});
        }

        return null;
    });

/* ── If your functions run on the Cloud Functions v2 SDK instead ──
   (i.e. you `require('firebase-functions/v2/...')` elsewhere in
   your index.js), use this form instead of the exports block above:

   const { onValueCreated } = require('firebase-functions/v2/database');

   exports.sendQueuedPush = onValueCreated('/pushQueue/{pushId}', async (event) => {
       const job = event.data.val();
       // ...same body as above, using event.data.ref instead of snapshot.ref...
   });
*/
