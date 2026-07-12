/* ══════════════════════════════════════════════════════════
   functions/notifyneworders.js — "new order" WhatsApp notifications
   ══════════════════════════════════════════════════════════
   WHY THIS EXISTS (read before touching admin.html again):
   This used to live entirely in admin.html's _detectAndAlertNewOrders(),
   fired from the client's 12s polling loop. That meant EVERY open
   admin.html tab/device independently decided "this order is new to
   me" and sent its own WhatsApp message — so if 3 tabs/devices had
   the dashboard open, the store/employees got 3 identical messages.

   This function fixes that by moving the WhatsApp-sending part
   server-side: it triggers exactly once per order, no matter how
   many admin sessions are open (or none at all).

   admin.html's _detectAndAlertNewOrders() still runs client-side for
   the in-app toast + sound + browser Notification — those are local
   UI feedback, harmless to fire per-tab. Only the two WhatsApp calls
   (_notifyStoreWhatsapp, _notifyEmployeesWhatsapp) were removed from
   it and re-implemented here.

   ── One-time setup ──────────────────────────────────────────
   Nothing extra beyond what adminResetPassword/sendQueuedPush already
   need — same firebase-admin dependency, same RTDB. Just deploy:
     firebase deploy --only functions:notifyNewOrder
══════════════════════════════════════════════════════════ */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const db = admin.database();

// Same phone-formatting / GREEN-API call as admin.html's _sendWhatsappMessage,
// just server-side. Kept standalone (no shared import) so this file can be
// copy-pasted/deployed independently, same convention as the other functions
// in this folder.
async function _sendWhatsapp(instance, token, phone, message) {
    const digits = String(phone || '').replace(/\D/g, '').replace(/^961/, '').replace(/^0/, '');
    if (!digits) throw new Error('invalid phone');
    const chatId    = '961' + digits + '@c.us';
    const gaServer  = String(instance).slice(0, 4);
    const url       = `https://${gaServer}.api.greenapi.com/waInstance${instance}/sendMessage/${token}`;
    const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chatId, message }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) throw new Error(data.error || `GREEN-API HTTP ${resp.status}`);
    return true;
}

exports.notifyNewOrder = functions.database
    .ref('/requests/{orderId}')
    .onCreate(async (snapshot, context) => {
        const order = snapshot.val();
        const orderId = context.params.orderId;
        if (!order) return null;

        const orderNum = String(orderId || '').replace(/^id_/, '');

        // ── Load GREEN-API credentials + everything needed to resolve
        // recipients, in parallel ──────────────────────────────────
        const [instance, token, pattern, adminUsers] = await Promise.all([
            db.ref('settings/greenApiInstance').once('value').then(s => s.val()),
            db.ref('settings/greenApiToken').once('value').then(s => s.val()),
            db.ref('pattern').once('value').then(s => s.val()),
            db.ref('adminUsers').once('value').then(s => s.val()),
        ]);

        if (!instance || !token) {
            console.warn('[notifyNewOrder] GREEN-API not configured (settings/greenApiInstance|greenApiToken) — skipping WhatsApp notifications for order', orderId);
            return null;
        }

        const sends = [];

        // ── 1. Notify the store itself (if it has WhatsApp active) ──
        // Stores live under pattern/{type}/[...] grouped by category, each
        // entry keyed by companyname — same shape admin.html builds
        // `allStores` from in loadAllData().
        if (order.store && pattern) {
            let storeRec = null;
            for (const type of Object.keys(pattern)) {
                const list = pattern[type];
                const arr = Array.isArray(list) ? list : Object.values(list || {});
                const match = arr.find(s => s && s.companyname === order.store);
                if (match) { storeRec = match; break; }
            }
            if (storeRec && storeRec.whatsappActive && storeRec.whatsapp) {
                const msg =
                    `🔔 طلب جديد رقم #${orderNum} وصل إلى متجرك على Delivo!\n` +
                    `الرجاء فتح لوحة التحكم للاطلاع على تفاصيل الطلب وتجهيزه:\n` +
                    `https://delivolb.com/admin`;
                sends.push(
                    _sendWhatsapp(instance, token, storeRec.whatsapp, msg)
                        .catch(e => console.warn('[notifyNewOrder] store WhatsApp failed:', e.message))
                );
            }
        }

        // ── 2. Notify opted-in employees ────────────────────────────
        // Same role logic as the old client-side _notifyEmployeesWhatsapp:
        //   - non-'company' role → notified for every order, platform-wide
        //   - 'company' role     → notified only for their own linked store
        if (adminUsers) {
            const employees = Object.values(adminUsers);
            for (const emp of employees) {
                if (!emp || !emp.notifyNewOrders || !emp.notifyPhone) continue;
                if (emp.role === 'company' && emp.linkedStore !== order.store) continue;
                const msg =
                    `🔔 طلب جديد رقم #${orderNum}` +
                    (order.store ? ` من متجر ${order.store}` : '') + ` وصل على Delivo!\n` +
                    `الرجاء فتح لوحة التحكم للاطلاع على تفاصيل الطلب:\n` +
                    `https://delivolb.com/admin`;
                sends.push(
                    _sendWhatsapp(instance, token, emp.notifyPhone, msg)
                        .catch(e => console.warn('[notifyNewOrder] employee WhatsApp failed:', e.message))
                );
            }
        }

        await Promise.all(sends);
        console.log(`[notifyNewOrder] Order ${orderId}: sent ${sends.length} WhatsApp notification(s).`);
        return null;
    });