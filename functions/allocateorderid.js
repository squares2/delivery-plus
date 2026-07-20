/* ══════════════════════════════════════════════════════════
   ALLOCATE ORDER ID(S) — atomic globalCounter/requestId increment
   Why this has to be a Cloud Function:
   Three different client flows (customer checkout in cart.js, the
   external-order flow, and the admin "create order manually" panel)
   all used to hand out order numbers themselves: read
   globalCounter/requestId over plain REST, add 1 in JS, then PUT it
   back. That's two separate network round-trips with nothing in
   between stopping two flows from reading the SAME current value at
   the same time — whichever write lands last quietly overwrites the
   other, so the counter can jump backwards or two orders can collide
   on the same id_N key. Worse, if that initial GET ever came back
   null/empty (a transient read hiccup), external-order.js and
   admin.html both fell back to `(0) + 1`, i.e. silently restarting
   the whole sequence at 1 — which is exactly the "was 81, next order
   was 1" bug.
   This function is the single place that ever changes the counter.
   It uses a Realtime Database *transaction*, which Firebase guarantees
   is atomic even under concurrent calls — the server itself rejects
   and retries any transaction that raced against another write, so
   two simultaneous orders can never receive the same number and the
   counter can never be silently treated as empty. Every client call
   site should call this instead of touching globalCounter directly.
══════════════════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin      = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// If the counter has genuinely never been initialized (fresh project),
// start here — matches the historical starting point used across the
// app. This only ever applies once, the very first time this function
// runs against an empty database; after that the transaction always
// works off the real stored value, never a re-derived guess.
const FIRST_EVER_ORDER_ID = 200;

exports.allocateOrderId = functions.https.onRequest(async (req, res) => {
    // CORS for calls from delivolb.com / Firebase Hosting
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).json({ error: 'يُسمح فقط بـ POST' }); return; }

    try {
        // How many sequential ids to reserve in one go — cart.js needs
        // more than one when a single checkout spans multiple stores.
        let count = parseInt(req.body?.count, 10);
        if (!Number.isFinite(count) || count < 1) count = 1;
        if (count > 20) count = 20; // sanity cap — no legitimate checkout needs more than this

        const counterRef = admin.database().ref('globalCounter/requestId');

        const result = await counterRef.transaction((current) => {
            // `current` is whatever is really stored right now — Firebase
            // re-runs this callback itself if another write raced in
            // between reading and committing, so there is no window for
            // two callers to both see the same stale value.
            const base = (typeof current === 'number' && current > 0) ? current : (FIRST_EVER_ORDER_ID - 1);
            return base + count;
        });

        if (!result.committed) {
            res.status(503).json({ error: 'تعذّر حجز رقم الطلب، حاول مجدداً' });
            return;
        }

        const newValue = result.snapshot.val();       // e.g. 283
        const firstId  = newValue - count + 1;         // e.g. 282 if count=2 → ids 282,283

        res.status(200).json({ firstId, lastId: newValue, count });
    } catch (e) {
        console.error('[allocateOrderId] error:', e);
        res.status(500).json({ error: e.message || 'فشل غير متوقع' });
    }
});