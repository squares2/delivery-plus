async function deleteUserAccount(uid, username, displayName, phone) {
    if (!uid) return;

    // ── Hard guard: never delete the Firebase admin Auth account ─────────
    // Get the UID of the currently signed-in admin SDK user
    const _adminSdkUid = window._adminAuth?.currentUser?.uid;
    // Also guard against known admin emails
    const _ADMIN_EMAILS = ['admin@delivivo.app', 'admin@delivo.app'];
    const _authEmail = (username || '') + '@delivo.internal';
    if (
        (_adminSdkUid && uid === _adminSdkUid) ||
        _ADMIN_EMAILS.includes(_authEmail) ||
        _ADMIN_EMAILS.includes(username || '')
    ) {
        toast('⛔ لا يمكن حذف حساب المدير', true);
        console.error('[deleteUser] Blocked attempt to delete admin account. UID:', uid);
        return;
    }

    const confirmed = await showConfirm({
        title: `🗑 حذف حساب ${displayName || username}`,
        msg:   `هل أنت متأكد من حذف هذا الحساب نهائياً؟<br><br>
                <strong style="color:var(--red);">سيتم حذف كل شيء نهائياً:</strong><br>
                • حساب Firebase Auth<br>
                • بيانات المستخدم من Firestore<br>
                • اسم المستخدم (يصبح متاحاً فوراً للتسجيل)<br>
                • رقم الهاتف من الفهرس<br>
                • سجل الطلبات`,
        okLabel: '🗑 حذف نهائياً', cancelLabel: 'إلغاء', danger: true,
    });
    if (!confirmed) return;

    const RTDB_B   = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const FS_B     = 'https://firestore.googleapis.com/v1/projects/deliveryonline-300f7/databases/(default)/documents';
    try {
        // ── 0. Block immediately — kicks user out in real-time ────────────
        await Promise.all([
            fbSet(`blacklist/${uid}`, { reason: 'تم حذف الحساب من الأدمن', deletedAt: new Date().toISOString(), deleted: true }),
            fbSet(`settings/deletedUsers/${uid}`, new Date().toISOString()),
        ]);

        // ── 1. Get admin Firestore token (needed for Auth delete) ────────
        let token  = null;
        let fsAuth = {};
        try {
            token  = await getFsToken();
            fsAuth = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        } catch(_) {
            // Token locked out — proceed with SDK-based operations
        }

        // ── 2. Look up authEmail from Firestore ───────────────────────────
        let authEmail = `${username}@delivo.internal`;
        let deviceUUID = null;
        // SDK first (no REST auth needed)
        if (window._adminDb) {
            try {
                const doc = await window._adminDb.collection('users').doc(uid).get();
                if (doc.exists) {
                    authEmail  = doc.data().authEmail  || authEmail;
                    deviceUUID = doc.data().deviceUUID || null;
                }
            } catch(_) {}
        } else if (token) {
            try {
                const docResp = await fetch(`${FS_B}/users/${uid}`, { headers: fsAuth });
                if (docResp.ok) {
                    const doc = await docResp.json();
                    authEmail  = doc?.fields?.authEmail?.stringValue  || authEmail;
                    deviceUUID = doc?.fields?.deviceUUID?.stringValue || null;
                }
            } catch(_) {}
        }
        if (!deviceUUID && allUsers[uid]) deviceUUID = allUsers[uid].deviceUUID || null;

        // ── 3. Firebase Auth account ──────────────────────────────────────
        // accounts:delete with { localId, idToken } is designed for SELF-deletion
        // only — passing another user's localId invalidates the admin's own token
        // and causes INVALID_LOGIN_CREDENTIALS on the next request.
        // Instead: the username slot-recycling in firebase-init.js handles
        // re-registration of deleted usernames safely (username~1, ~2, etc.).
        // The Auth ghost is harmless — Firestore + RTDB cleanup below is enough.
        const authDeleted = false;
        console.log('[deleteUser] Skipping Auth delete (client-side delete breaks admin session). Username recycling handles re-registration.');

        // ── 4. Delete Firestore user profile ──────────────────────────────
        try {
            const r = await fetch(`${FS_B}/users/${uid}`, { method: 'DELETE', headers: fsAuth });
            if (!r.ok && r.status !== 404) console.warn('[deleteUser] Firestore users/', r.status);
        } catch(_) {}

        // ── 5. Delete Firestore username reservation ──────────────────────
        if (username) {
            try {
                const r = await fetch(`${FS_B}/usernames/${encodeURIComponent(username)}`, { method: 'DELETE', headers: fsAuth });
                if (!r.ok && r.status !== 404) console.warn('[deleteUser] Firestore usernames/', r.status);
            } catch(_) {}
        }

        // ── 6. RTDB full cleanup — all parallel ───────────────────────────
        const cleanups = [
            fetch(`${RTDB_B}/historyRequests/${uid}.json`,             { method: 'DELETE' }),
            fetch(`${RTDB_B}/blacklist/${uid}.json`,                   { method: 'DELETE' }),
            fetch(`${RTDB_B}/settings/deletedUsers/${uid}.json`,       { method: 'DELETE' }),
            fetch(`${RTDB_B}/pendingAuthDeletion/${uid}.json`,         { method: 'DELETE' }),
        ];
        if (username) {
            // Remove deletedUsernames marker — username is now truly free
            cleanups.push(fetch(`${RTDB_B}/deletedUsernames/${encodeURIComponent(username)}.json`, { method: 'DELETE' }));
        }
        if (phone) {
            const digits = phone.replace(/\D/g, '').replace(/^961/, '');
            if (digits) cleanups.push(fetch(`${RTDB_B}/phoneIndex/${digits}.json`, { method: 'DELETE' }));
        }
        await Promise.allSettled(cleanups);

        // ── 7. Decrement device account count ─────────────────────────────
        if (deviceUUID) {
            try {
                const devResp = await fetch(`${RTDB_B}/devices/${deviceUUID}.json`);
                if (devResp.ok) {
                    const devData = await devResp.json();
                    const newCount = Math.max(0, (devData?.accountCount || 1) - 1);
                    if (newCount === 0) {
                        await fetch(`${RTDB_B}/devices/${deviceUUID}.json`, { method: 'DELETE' });
                    } else {
                        await fetch(`${RTDB_B}/devices/${deviceUUID}.json`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accountCount: newCount }),
                        });
                    }
                }
            } catch(_) {}
        }

        toast(`✅ تم حذف حساب ${displayName || username} بالكامل`);
        showNotif('🗑 حذف كامل', `حساب ${displayName || username} وجميع بياناته حُذفت نهائياً — اسم المستخدم متاح الآن`, 'success');

        await loadAllData();
        renderCustomers();

    } catch(e) {
        console.error('[deleteUser]', e);
        toast('❌ فشل الحذف: ' + e.message, true);
    }
}

// ══════════════════════════════════════════════════════════════
//  BACKUP & RESTORE — Full Firebase/Firestore import/export
// ══════════════════════════════════════════════════════════════

const BACKUP_COLLECTIONS = ['users','usernames','orders','stores','categories','offers','settings','devices'];
const BACKUP_RTDB_PATHS  = ['requests','historyRequests','guestCustomers','drivers','pattern','settings','phoneIndex','devices','blacklist','adminUsers','globalCounter','users','deletedUsernames'];

function renderBackupPanel() {
    const el = document.getElementById('backup-content');
    if (!el) return;
    el.innerHTML = `
    <style>
        .bk-section { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:16px; }
        .bk-title   { font-size:0.72rem; font-weight:800; color:var(--gray); text-transform:uppercase; letter-spacing:.06em; margin-bottom:14px; }
        .bk-row     { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
        .bk-btn     { display:inline-flex; align-items:center; gap:7px; padding:9px 18px; border-radius:9px; border:1.5px solid; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; background:transparent; }
        .bk-btn-export { border-color:rgba(34,197,94,.4);  color:#22c55e; }
        .bk-btn-export:hover { background:rgba(34,197,94,.1); }
        .bk-btn-import { border-color:rgba(251,146,60,.4); color:#fb923c; }
        .bk-btn-import:hover { background:rgba(251,146,60,.1); }
        .bk-btn-danger { border-color:rgba(239,68,68,.4);  color:#ef4444; }
        .bk-btn-danger:hover { background:rgba(239,68,68,.1); }
        .bk-btn:disabled { opacity:.4; cursor:not-allowed; }
        .bk-log { background:#0d0d14; border:1px solid rgba(255,255,255,.06); border-radius:8px; padding:12px 14px; font-family:var(--mono); font-size:11.5px; line-height:1.7; max-height:220px; overflow-y:auto; margin-top:12px; }
        .bk-ok   { color:#22c55e; } .bk-warn { color:#f59e0b; } .bk-err { color:#ef4444; } .bk-info { color:#9ca3af; }
        .bk-collections { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
        .bk-col-chip { padding:4px 10px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:20px; font-size:11px; color:var(--gray-light); cursor:pointer; user-select:none; transition:all .15s; }
        .bk-col-chip.selected { background:rgba(251,146,60,.15); border-color:rgba(251,146,60,.4); color:#fb923c; font-weight:700; }
        .bk-progress { height:3px; background:var(--surface2); border-radius:2px; margin-top:10px; overflow:hidden; }
        .bk-progress-bar { height:100%; background:#22c55e; border-radius:2px; width:0; transition:width .3s; }
        .bk-badge { display:inline-block; padding:2px 8px; border-radius:5px; font-size:10px; font-weight:800; background:rgba(34,197,94,.12); color:#22c55e; border:1px solid rgba(34,197,94,.25); margin-right:6px; }
        .bk-schedule-row { display:flex; align-items:center; gap:10px; margin-top:8px; }
        .bk-schedule-row select { background:var(--surface2); border:1px solid var(--border); color:var(--white); border-radius:7px; padding:6px 10px; font-size:13px; }
    </style>

    <!-- ── Security Log ──────────────────────────────────────── -->
    <div class="bk-section" style="border-color:rgba(239,68,68,.2);">
        <div class="bk-title" style="display:flex;align-items:center;gap:8px;">
            🛡 سجل التنبيهات الأمنية
            <span id="sec-log-badge" style="font-size:10px;font-weight:800;color:#ef4444;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:20px;padding:2px 8px;"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
            <button class="bk-btn" style="border-color:rgba(99,102,241,.4);color:#818cf8;font-size:12px;" onclick="renderSecurityLog()">
                🔄 تحديث السجل
            </button>
            <button class="bk-btn bk-btn-danger" style="font-size:12px;" onclick="secLogClear()">
                🗑 مسح السجل
            </button>
            <span style="font-size:11.5px;color:var(--gray);align-self:center;">اضغط على أي تنبيه لتحديده كـ "مقروء"</span>
        </div>
        <div id="sec-log-content" style="max-height:420px;overflow-y:auto;">
            <div style="color:var(--gray);font-size:13px;text-align:center;padding:20px;">
                اضغط "تحديث السجل" لعرض التنبيهات
            </div>
        </div>
    </div>

    <!-- ── Export ─────────────────────────────────────────── -->
    <div class="bk-section">
        <div class="bk-title">📤 تصدير — Export Backup</div>
        <p style="font-size:13px;color:var(--gray-light);margin-bottom:14px;">
            حدد ما تريد تصديره ثم اضغط Export. يُحفظ كملف <code style="color:#fb923c;">.json</code> على جهازك.
        </p>
        <div class="bk-collections" id="bk-export-chips"></div>
        <div class="bk-row">
            <button class="bk-btn bk-btn-export" id="bk-export-all-btn" onclick="bkExport('all')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export All Data
            </button>
            <button class="bk-btn bk-btn-export" onclick="bkExport('selected')">
                Export Selected
            </button>
            <button class="bk-btn bk-btn-export" onclick="bkExport('rtdb')">
                Export RTDB Only
            </button>
            <button class="bk-btn bk-btn-export" onclick="bkExport('firestore')">
                Export Firestore Only
            </button>
        </div>
        <div class="bk-progress"><div class="bk-progress-bar" id="bk-exp-prog"></div></div>
        <div class="bk-log" id="bk-export-log"><span class="bk-info">جاهز للتصدير...</span></div>
    </div>

    <!-- ── Import ─────────────────────────────────────────── -->
    <div class="bk-section">
        <div class="bk-title">📥 استيراد — Import / Restore</div>
        <p style="font-size:13px;color:var(--gray-light);margin-bottom:14px;">
            استيراد ملف <code style="color:#fb923c;">.json</code> تم تصديره من هنا.
        </p>

        <!-- Import mode selector -->
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="font-size:11px;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">وضع الاستيراد</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(34,197,94,.3);background:rgba(34,197,94,.06);">
                    <input type="radio" name="bk-mode" value="skip" checked style="margin-top:2px;accent-color:#22c55e;">
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#22c55e;">✅ دمج آمن — تخطي الموجود (موصى به)</div>
                        <div style="font-size:11.5px;color:var(--gray);margin-top:2px;">يضيف فقط الـ docs غير الموجودة. لا يمس البيانات الحالية. آمن 100% على المشاريع الحية.</div>
                    </div>
                </label>
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(251,146,60,.3);background:rgba(251,146,60,.06);">
                    <input type="radio" name="bk-mode" value="overwrite" style="margin-top:2px;accent-color:#fb923c;">
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#fb923c;">⚠️ دمج مع استبدال</div>
                        <div style="font-size:11.5px;color:var(--gray);margin-top:2px;">يضيف كل شيء. إذا وجد نفس الـ ID (مثلاً نفس رقم الطلب) يستبدله بنسخة الـ backup. البيانات الجديدة بعد الـ backup تبقى.</div>
                    </div>
                </label>
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);">
                    <input type="radio" name="bk-mode" value="full" style="margin-top:2px;accent-color:#ef4444;">
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#ef4444;">💣 استعادة كاملة (خطر)</div>
                        <div style="font-size:11.5px;color:var(--gray);margin-top:2px;">يحذف كل البيانات الموجودة أولاً ثم يعيد الـ backup بالكامل. كل ما حدث بعد الـ backup يُفقد نهائياً.</div>
                    </div>
                </label>
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(168,85,247,.3);background:rgba(168,85,247,.06);">
                    <input type="radio" name="bk-mode" value="selective" style="margin-top:2px;accent-color:#a855f7;">
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#a855f7;">🎯 استعادة انتقائية — Anti-Hack (موصى به عند الاختراق)</div>
                        <div style="font-size:11.5px;color:var(--gray);margin-top:2px;">تختار بالضبط أي collections تُعيد من الـ backup. الطلبات والمستخدمين تبقى كما هي — فقط ما اخترته يُستعاد.</div>
                    </div>
                </label>
            </div>
        </div>

        <!-- Selective collection picker — shown only when selective mode chosen -->
        <div id="bk-selective-picker" style="display:none;background:rgba(168,85,247,.06);border:1.5px solid rgba(168,85,247,.25);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="font-size:11px;font-weight:800;color:#a855f7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">🎯 اختر ما تريد استعادته من الـ backup</div>
            <div id="bk-selective-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"></div>
            <div style="font-size:11px;color:var(--gray);padding:8px;background:rgba(0,0,0,.2);border-radius:6px;">
                💡 <strong style="color:#a855f7;">نصيحة عند الاختراق:</strong> عادةً أعد فقط: <code>settings</code> + <code>adminUsers</code> + <code>blacklist</code>. اترك <code>orders</code> و<code>users</code> و<code>requests</code> كما هي.
            </div>
        </div>

        <div class="bk-row">
            <label class="bk-btn bk-btn-import" style="cursor:pointer;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                اختر ملف .json
                <input type="file" accept=".json" style="display:none" onchange="bkLoadFile(this)">
            </label>
            <button class="bk-btn bk-btn-import" id="bk-import-btn" onclick="bkImport()" disabled>
                🚀 Start Import
            </button>
        </div>
        <div id="bk-import-preview" style="font-size:12px;color:var(--gray);margin-top:8px;"></div>
        <div class="bk-progress"><div class="bk-progress-bar" id="bk-imp-prog"></div></div>
        <div class="bk-log" id="bk-import-log"><span class="bk-info">اختر ملف للبدء...</span></div>
    </div>

    <!-- ── Security Status ───────────────────────────────── -->
    <div class="bk-section">
        <div class="bk-title">🛡 مراقبة الأمان — Security Monitor</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
            <div style="background:var(--surface2);border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:22px;">⚙️</div>
                <div style="font-size:11px;color:var(--gray);margin-top:4px;">Settings</div>
                <div id="sec-settings-status" style="font-size:12px;font-weight:700;color:#22c55e;margin-top:2px;">مراقَب ✓</div>
            </div>
            <div style="background:var(--surface2);border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:22px;">👤</div>
                <div style="font-size:11px;color:var(--gray);margin-top:4px;">Admin Accounts</div>
                <div id="sec-admin-status" style="font-size:12px;font-weight:700;color:#22c55e;margin-top:2px;">مراقَب ✓</div>
            </div>
            <div style="background:var(--surface2);border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:22px;">⭐</div>
                <div style="font-size:11px;color:var(--gray);margin-top:4px;">Points Spikes</div>
                <div id="sec-points-status" style="font-size:12px;font-weight:700;color:#22c55e;margin-top:2px;">مراقَب ✓</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="bk-btn" style="border-color:rgba(168,85,247,.4);color:#a855f7;font-size:12px;" onclick="secResetBaseline()">
                🔄 إعادة ضبط Baseline
            </button>
            <button class="bk-btn bk-btn-export" style="font-size:12px;" onclick="bkQuickBackup()">
                💾 Quick Backup الآن
            </button>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.2);border-radius:8px;font-size:12px;color:#d8b4fe;line-height:1.6;">
            🛡 <strong>كيف يعمل؟</strong> عند كل تحديث تلقائي (كل 12 ثانية) يتحقق النظام من:<br>
            • hash لإعدادات النظام — أي تغيير يُنبّهك فوراً<br>
            • عدد حسابات المديرين — إذا أُضيف مدير غير معروف تظهر تنبيه أحمر<br>
            • نقاط العملاء — أي ارتفاع +100 نقطة دفعة واحدة يُعتبر مشبوهاً
        </div>
    </div>

    <!-- ── Info ───────────────────────────────────────────── -->
    <div class="bk-section">
        <div class="bk-title">ℹ️ ماذا يشمل الـ Backup؟</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12.5px;color:var(--gray-light);">
            <div>
                <div style="color:#fb923c;font-weight:700;margin-bottom:6px;">🔥 Firestore Collections</div>
                ${BACKUP_COLLECTIONS.map(c => `<div style="padding:2px 0;">• ${c}</div>`).join('')}
            </div>
            <div>
                <div style="color:#fb923c;font-weight:700;margin-bottom:6px;">⚡ Realtime Database Paths</div>
                ${BACKUP_RTDB_PATHS.map(p => `<div style="padding:2px 0;">• ${p}</div>`).join('')}
            </div>
        </div>
        <div style="margin-top:14px;padding:10px 14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;font-size:12px;color:#86efac;">
            💡 <strong>نصيحة:</strong> اعمل Export يومياً أو قبل أي تعديلات كبيرة. احفظ الملف في Google Drive أو مكان آمن.
        </div>
    </div>

    <!-- ── Reset Counter Only (non-destructive) ─────────────── -->
    <div class="bk-section" style="border-color:rgba(251,146,60,.3);">
        <div class="bk-title" style="color:#fb923c;">🔢 إعادة ضبط عداد الطلبات فقط</div>
        <p style="font-size:13px;color:var(--gray-light);margin-bottom:10px;line-height:1.6;">
            يغيّر <code>globalCounter/requestId</code> فقط — رقم الطلب التالي الذي سيُعطى لأي طلب جديد.
            لا يحذف أو يمسّ أي طلبات أو مستخدمين أو بيانات أخرى إطلاقاً.
        </p>
        <div style="background:rgba(251,146,60,.06);border:1px solid rgba(251,146,60,.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#fdba74;line-height:1.7;">
            ⚠️ <strong>مهم:</strong> إن كانت هناك طلبات حالية بأرقام تساوي أو تلي القيمة التي ستضعها، فسيصطدم أول طلب
            جديد بنفس المعرّف (<code>id_1</code> مثلاً) ويستبدل ذلك الطلب القديم. استخدم هذا فقط بعد حذف/أرشفة كل
            الطلبات، أو تأكد أن القيمة أعلى من أي رقم طلب موجود حالياً.
        </div>
        <div class="bk-row" style="align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:12.5px;color:var(--gray);">القيمة الحالية:</span>
            <b id="counter-current-val" style="color:var(--white);font-family:var(--mono);">جارِ التحميل...</b>
            <input id="counter-reset-input" type="number" min="1" step="1" value="1"
                   style="width:100px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                          padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;text-align:center;">
            <button class="bk-btn" style="background:#fb923c;color:#1a1200;" onclick="resetGlobalCounterOnly()">
                🔢 إعادة ضبط العداد فقط
            </button>
        </div>
    </div>

    <!-- ── Reset Project ────────────────────────────────────── -->
    <div class="bk-section" style="border-color:rgba(239,68,68,.25);">
        <div class="bk-title" style="color:#ef4444;">💣 إعادة ضبط المشروع — Reset Project</div>
        <p style="font-size:13px;color:var(--gray-light);margin-bottom:14px;line-height:1.6;">
            يحذف كل بيانات الاختبار ويبدأ المشروع من الصفر. يحتفظ بـ:
            <strong style="color:#22c55e;">المتاجر، المنتجات، الفئات، العروض، الإعدادات، المديرين.</strong>
        </p>
        <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#fca5a5;line-height:1.7;">
            <strong>🗑 ما سيُحذف:</strong><br>
            • كل حسابات العملاء (Firestore users + usernames)<br>
            • كل الطلبات (RTDB requests + historyRequests + Firestore orders)<br>
            • نقاط وكريدت ومكافآت العملاء (RTDB users)<br>
            • فهرس الهواتف (phoneIndex)<br>
            • بيانات الأجهزة (devices + driverDevices + device_fingerprints)<br>
            • القائمة السوداء (blacklist)<br>
            • العداد العالمي → يُعاد إلى 1<br>
            • السائقون المسجلون (drivers)<br>
            • deletedUsernames + pendingAuthDeletion
        </div>
        <div class="bk-progress"><div class="bk-progress-bar" id="rst-prog" style="background:#ef4444;"></div></div>
        <div class="bk-log" id="rst-log" style="margin-top:10px;display:none;"><span class="bk-info">جاري الحذف...</span></div>
        <div class="bk-row" style="margin-top:14px;">
            <button class="bk-btn bk-btn-danger" onclick="resetProject()">
                💣 إعادة ضبط كاملة
            </button>
            <span style="font-size:11.5px;color:var(--gray);">⚠️ هذا الإجراء لا يمكن التراجع عنه — تأكد من عمل Export أولاً</span>
        </div>
    </div>`;

    // Render collection chips
    const chipsEl = document.getElementById('bk-export-chips');
    if (chipsEl) {
        [...BACKUP_COLLECTIONS.map(c => ({ type:'fs', name:c })),
         ...BACKUP_RTDB_PATHS.map(p => ({ type:'rtdb', name:p }))
        ].forEach(({ type, name }) => {
            const chip = document.createElement('span');
            chip.className = 'bk-col-chip selected';
            chip.textContent = (type === 'rtdb' ? '⚡ ' : '🔥 ') + name;
            chip.dataset.col = name;
            chip.dataset.type = type;
            chip.addEventListener('click', () => chip.classList.toggle('selected'));
            chipsEl.appendChild(chip);
        });
    }

    // Show the current order-counter value
    fetch(`${RTDB}/globalCounter/requestId.json`)
        .then(r => r.json())
        .then(v => {
            const el = document.getElementById('counter-current-val');
            if (el) el.textContent = (v === null || v === undefined) ? '— (لم يُستخدم بعد)' : v;
        })
        .catch(() => {
            const el = document.getElementById('counter-current-val');
            if (el) el.textContent = '⚠️ تعذّر التحميل';
        });
}

// ── Export ─────────────────────────────────────────────────────
async function bkExport(mode) {
    const logEl  = document.getElementById('bk-export-log');
    const progEl = document.getElementById('bk-exp-prog');
    const label  = document.getElementById('backup-status-label');
    const bkLog  = (msg, cls='bk-info') => {
        const d = document.createElement('div');
        d.className = cls; d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    };
    logEl.innerHTML = '';
    progEl.style.width = '0';
    label.textContent = '⏳ جاري التصدير...';

    const backup = { exportedAt: new Date().toISOString(), version: 2, firestore: {}, rtdb: {} };
    const token  = await getFsToken().catch(() => null);

    // Determine what to export
    let fsCols  = BACKUP_COLLECTIONS;
    let rtdbPaths = BACKUP_RTDB_PATHS;
    if (mode === 'selected') {
        const chips = document.querySelectorAll('#bk-export-chips .bk-col-chip.selected');
        fsCols    = [...chips].filter(c => c.dataset.type === 'fs').map(c => c.dataset.col);
        rtdbPaths = [...chips].filter(c => c.dataset.type === 'rtdb').map(c => c.dataset.col);
    } else if (mode === 'rtdb') {
        fsCols = [];
    } else if (mode === 'firestore') {
        rtdbPaths = [];
    }

    const total = fsCols.length + rtdbPaths.length;
    let done = 0;

    // Firestore export
    for (const col of fsCols) {
        try {
            bkLog(`Firestore → ${col}...`);
            const data = await fsGetCollection(col).catch(() => null);
            if (data) {
                backup.firestore[col] = data;
                const count = Object.keys(data).length;
                bkLog(`✅ ${col} — ${count} docs`, 'bk-ok');
            } else {
                bkLog(`⚠️ ${col} — empty or permission denied`, 'bk-warn');
            }
        } catch(e) {
            bkLog(`❌ ${col} — ${e.message}`, 'bk-err');
        }
        done++;
        progEl.style.width = (done / total * 100) + '%';
    }

    // RTDB export
    for (const path of rtdbPaths) {
        try {
            bkLog(`RTDB → ${path}...`);
            const r    = await fetch(`${RTDB}/${path}.json`);
            const data = r.ok ? await r.json() : null;
            if (data !== null) {
                backup.rtdb[path] = data;
                const count = typeof data === 'object' ? Object.keys(data).length : 1;
                bkLog(`✅ ${path} — ${count} entries`, 'bk-ok');
            } else {
                bkLog(`⚠️ ${path} — empty`, 'bk-warn');
            }
        } catch(e) {
            bkLog(`❌ ${path} — ${e.message}`, 'bk-err');
        }
        done++;
        progEl.style.width = (done / total * 100) + '%';
    }

    // Download
    const ts       = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const filename = `delivo-backup-${ts}.json`;
    const blob     = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);

    const fsCount   = Object.values(backup.firestore).reduce((s, v) => s + Object.keys(v||{}).length, 0);
    const rtdbCount = Object.keys(backup.rtdb).length;
    bkLog(`🎉 Export complete! File: ${filename}`, 'bk-ok');
    bkLog(`   Firestore: ${fsCount} total docs | RTDB: ${rtdbCount} paths`, 'bk-ok');
    label.textContent = `✅ آخر export: ${new Date().toLocaleTimeString()}`;
    progEl.style.width = '100%';
}

// ── Load file ──────────────────────────────────────────────────
let _bkData = null;
function bkLoadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            _bkData = JSON.parse(e.target.result);
            const fsCols    = Object.keys(_bkData.firestore || {});
            const rtdbPaths = Object.keys(_bkData.rtdb || {});
            const fsCount   = Object.values(_bkData.firestore || {}).reduce((s,v) => s + Object.keys(v||{}).length, 0);
            document.getElementById('bk-import-preview').innerHTML =
                `<span style="color:#22c55e;">✅ ملف صالح</span> — 
                 تاريخ: <strong>${new Date(_bkData.exportedAt).toLocaleString('ar')}</strong><br>
                 Firestore: <strong>${fsCols.join(', ')}</strong> (${fsCount} docs)<br>
                 RTDB: <strong>${rtdbPaths.join(', ')}</strong>`;
            document.getElementById('bk-import-btn').disabled = false;
            document.getElementById('bk-import-log').innerHTML = '<span class="bk-info">ملف جاهز — اضغط Start Import</span>';

            // Populate selective chips
            const chipsEl = document.getElementById('bk-selective-chips');
            if (chipsEl) {
                chipsEl.innerHTML = '';
                // Safe defaults for anti-hack — orders/users/requests NOT selected by default
                const safeDefaults = ['settings','adminUsers','blacklist','categories','offers','stores'];
                const unsafeDefaults = ['orders','users','usernames','requests','historyRequests','guestCustomers','phoneIndex','devices','drivers','pattern','globalCounter'];
                [...fsCols.map(c=>({type:'fs',name:c})), ...rtdbPaths.map(p=>({type:'rtdb',name:p}))]
                    .forEach(({type, name}) => {
                        const isSafe = safeDefaults.includes(name);
                        const chip = document.createElement('span');
                        chip.className = 'bk-col-chip' + (isSafe ? ' selected' : '');
                        chip.style.cssText = isSafe
                            ? 'background:rgba(168,85,247,.15);border-color:rgba(168,85,247,.4);color:#a855f7;'
                            : '';
                        chip.textContent = (type==='rtdb'?'⚡ ':'🔥 ') + name;
                        chip.dataset.col  = name;
                        chip.dataset.type = type;
                        chip.title = unsafeDefaults.includes(name) ? '⚠️ لا تُعِد هذا إلا إذا كان متأثراً بالاختراق' : '✅ آمن للاستعادة';
                        chip.addEventListener('click', () => {
                            chip.classList.toggle('selected');
                            chip.style.cssText = chip.classList.contains('selected')
                                ? 'background:rgba(168,85,247,.15);border-color:rgba(168,85,247,.4);color:#a855f7;'
                                : '';
                        });
                        chipsEl.appendChild(chip);
                    });
            }
        } catch(err) {
            document.getElementById('bk-import-preview').innerHTML = '<span style="color:#ef4444;">❌ ملف غير صالح</span>';
            _bkData = null;
        }
    };
    reader.readAsText(file);
}

// Show/hide selective picker when mode changes
document.addEventListener('change', e => {
    if (e.target.name === 'bk-mode') {
        const picker = document.getElementById('bk-selective-picker');
        if (picker) picker.style.display = e.target.value === 'selective' ? 'block' : 'none';
    }
});

// ── Import ──────────────────────────────────────────────────────
async function bkImport() {
    if (!_bkData) return;
    const logEl  = document.getElementById('bk-import-log');
    const progEl = document.getElementById('bk-imp-prog');
    const label  = document.getElementById('backup-status-label');
    const mode   = document.querySelector('input[name="bk-mode"]:checked')?.value || 'skip';
    const bkLog  = (msg, cls='bk-info') => {
        const d = document.createElement('div');
        d.className = cls; d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    };

    const modeLabels = {
        skip:      'دمج آمن — تخطي الموجود',
        overwrite: 'دمج مع استبدال',
        full:      '💣 استعادة كاملة (سيحذف كل البيانات أولاً)',
        selective: '🎯 استعادة انتقائية — Anti-Hack',
    };

    // For selective mode: filter to only chosen collections
    if (mode === 'selective') {
        const selectedChips = [...document.querySelectorAll('#bk-selective-chips .bk-col-chip.selected')];
        const selFs   = new Set(selectedChips.filter(c=>c.dataset.type==='fs').map(c=>c.dataset.col));
        const selRtdb = new Set(selectedChips.filter(c=>c.dataset.type==='rtdb').map(c=>c.dataset.col));
        if (!selFs.size && !selRtdb.size) {
            toast('⚠️ لم تختر أي collection للاستعادة', true);
            return;
        }
        // Filter _bkData to selected only
        _bkData = {
            ..._bkData,
            firestore: Object.fromEntries(Object.entries(_bkData.firestore||{}).filter(([k])=>selFs.has(k))),
            rtdb:      Object.fromEntries(Object.entries(_bkData.rtdb||{}).filter(([k])=>selRtdb.has(k))),
        };
        bkLog(`🎯 استعادة انتقائية: Firestore[${[...selFs].join(', ')}] | RTDB[${[...selRtdb].join(', ')}]`, 'bk-warn');
    }
    const modeColors = { skip:'#22c55e', overwrite:'#fb923c', full:'#ef4444' };

    const confirmed = await showConfirm({
        title: '📥 تأكيد الاستيراد',
        msg:   `وضع: <strong style="color:${modeColors[mode]};">${modeLabels[mode]}</strong><br><br>
                ${mode === 'skip'      ? 'سيُضاف فقط ما لا يوجد في Firebase. البيانات الحالية لا تُمس.' : ''}
                ${mode === 'overwrite' ? '⚠️ الـ docs بنفس الـ ID ستُستبدل بنسخة الـ backup.' : ''}
                ${mode === 'full'      ? '⛔ <strong>تحذير:</strong> كل البيانات الحالية ستُحذف أولاً ثم يُعاد الـ backup. هذا لا يمكن التراجع عنه!' : ''}
                <br>هل تريد المتابعة؟`,
        okLabel: '🚀 نعم، استورد', cancelLabel: 'إلغاء', danger: mode === 'full',
    });
    if (!confirmed) return;

    logEl.innerHTML = '';
    progEl.style.width = '0';
    label.textContent = '⏳ جاري الاستيراد...';
    // Pause security monitor during import to avoid false alerts
    const _prevBaseline = _secBaseline;
    _secBaseline = null;
    bkLog(`وضع: ${modeLabels[mode]}`, mode === 'full' ? 'bk-err' : mode === 'overwrite' ? 'bk-warn' : 'bk-ok');

    const token  = await getFsToken().catch(() => null);
    const fsAuth = token ? { 'Content-Type':'application/json', Authorization:`Bearer ${token}` } : {};
    const FS_B   = 'https://firestore.googleapis.com/v1/projects/deliveryonline-300f7/databases/(default)/documents';

    const fsCols    = Object.entries(_bkData.firestore || {});
    const rtdbPaths = Object.entries(_bkData.rtdb || {});
    const total     = fsCols.reduce((s,[,v]) => s + Object.keys(v||{}).length, 0) + rtdbPaths.length;
    let done = 0;

    // ── Full restore: delete existing collections first ───────────────
    if (mode === 'full') {
        bkLog('💣 حذف البيانات الموجودة...', 'bk-err');
        for (const [col] of fsCols) {
            try {
                // Use REST to list and delete — respects admin token permissions
                let pageToken = null, deleted = 0;
                do {
                    const url = `${FS_B}/${col}?pageSize=300${pageToken?'&pageToken='+pageToken:''}`;
                    const r   = await fetch(url, { headers: fsAuth });
                    const d   = await r.json();
                    const docs = d.documents || [];
                    await Promise.allSettled(docs.map(doc =>
                        fetch(doc.name, { method: 'DELETE', headers: fsAuth })
                    ));
                    deleted += docs.length;
                    pageToken = d.nextPageToken || null;
                } while (pageToken);
                bkLog(`🗑 Firestore ${col} cleared (${deleted} docs)`, 'bk-warn');
            } catch(e) { bkLog(`⚠️ Could not clear ${col}: ${e.message}`, 'bk-warn'); }
        }
        for (const [path] of rtdbPaths) {
            try {
                await fetch(`${RTDB}/${path}.json`, { method: 'DELETE' });
                bkLog(`🗑 RTDB ${path} cleared`, 'bk-warn');
            } catch(e) {}
        }
        bkLog('✅ Cleared. Now restoring backup...', 'bk-ok');
    }

    // ── Restore Firestore via REST (admin token bypasses security rules) ──
    // IMPORTANT: We always use REST + admin idToken here, NOT the SDK.
    // The SDK uses anonymous auth which is blocked by Firestore rules for
    // sensitive collections like usernames/users. The admin REST token has
    // full access regardless of rules.
    if (!token) {
        bkLog('❌ لا يوجد admin token — لا يمكن كتابة Firestore. تأكد من تسجيل الدخول.', 'bk-err');
    } else {
        // Helper: convert JS value to Firestore REST field value
        function toFsField(v) {
            if (v === null || v === undefined) return { nullValue: null };
            if (typeof v === 'boolean')  return { booleanValue: v };
            if (typeof v === 'number')   return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
            if (typeof v === 'string')   return { stringValue: v };
            if (Array.isArray(v))        return { arrayValue: { values: v.map(toFsField) } };
            if (typeof v === 'object')   return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,val]) => [k, toFsField(val)])) } };
            return { stringValue: String(v) };
        }

        for (const [col, docs] of fsCols) {
            bkLog(`Firestore → ${col} (${Object.keys(docs).length} docs)...`);
            let skipped = 0, written = 0, errors = 0;

            for (const [docId, data] of Object.entries(docs)) {
                try {
                    // Skip check for 'skip' mode
                    if (mode === 'skip') {
                        const chk = await fetch(`${FS_B}/${col}/${encodeURIComponent(docId)}`, { headers: fsAuth });
                        if (chk.ok) { skipped++; done++; progEl.style.width = (done/total*100)+'%'; continue; }
                    }

                    // Build Firestore REST fields object with proper type mapping
                    const clean = { ...data }; delete clean._id;
                    const fields = {};
                    Object.entries(clean).forEach(([k, v]) => { fields[k] = toFsField(v); });

                    const resp = await fetch(`${FS_B}/${col}/${encodeURIComponent(docId)}`, {
                        method:  'PATCH',
                        headers: fsAuth,
                        body:    JSON.stringify({ fields }),
                    });

                    if (resp.ok) {
                        written++;
                    } else {
                        const err = await resp.json().catch(() => ({}));
                        bkLog(`  ⚠️ ${col}/${docId} — ${err?.error?.message || resp.status}`, 'bk-warn');
                        errors++;
                    }
                } catch(e) {
                    bkLog(`  ⚠️ ${col}/${docId} — ${e.message}`, 'bk-warn');
                    errors++;
                }
                done++;
                progEl.style.width = (done / total * 100) + '%';
            }
            const summary = `${written} written${skipped ? ', ' + skipped + ' skipped' : ''}${errors ? ', ' + errors + ' errors' : ''}`;
            bkLog(`${errors ? '⚠️' : '✅'} ${col} — ${summary}`, errors ? 'bk-warn' : 'bk-ok');
        }
    }

    // ── Restore RTDB ──────────────────────────────────────────────────
    for (const [path, data] of rtdbPaths) {
        try {
            bkLog(`RTDB → ${path}...`);
            if (mode === 'skip') {
                // Only write keys that don't exist
                const existing = await fetch(`${RTDB}/${path}.json`).then(r => r.json()).catch(() => null);
                if (existing && typeof data === 'object') {
                    const newKeys = {};
                    let skipped = 0;
                    Object.entries(data).forEach(([k, v]) => {
                        if (existing[k] !== undefined) { skipped++; }
                        else { newKeys[k] = v; }
                    });
                    if (Object.keys(newKeys).length) {
                        await fetch(`${RTDB}/${path}.json`, {
                            method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(newKeys),
                        });
                    }
                    bkLog(`✅ ${path} — ${Object.keys(newKeys).length} added, ${skipped} skipped`, 'bk-ok');
                } else {
                    if (!existing) {
                        await fetch(`${RTDB}/${path}.json`, {
                            method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(data),
                        });
                    }
                    bkLog(`✅ ${path} restored`, 'bk-ok');
                }
            } else {
                await fetch(`${RTDB}/${path}.json`, {
                    method: mode === 'full' ? 'PUT' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                bkLog(`✅ ${path} restored`, 'bk-ok');
            }
        } catch(e) {
            bkLog(`❌ ${path} — ${e.message}`, 'bk-err');
        }
        done++;
        progEl.style.width = (done / total * 100) + '%';
    }

    bkLog('🎉 Import complete!', 'bk-ok');
    label.textContent = `✅ آخر import: ${new Date().toLocaleTimeString()}`;
    progEl.style.width = '100%';
    await loadAllData();
}

// ══════════════════════════════════════════════════════════════
//  EDIT USER POINTS — direct RTDB write
// ══════════════════════════════════════════════════════════════
async function editUserPoints(uid, currentPts, displayName) {
    const RTDB_B = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    // Build inline modal
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;
        display:flex;align-items:center;justify-content:center;padding:16px;`;

    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;
                padding:24px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
            <span style="font-size:22px;">⭐</span>
            <div>
                <div style="font-size:15px;font-weight:800;color:var(--white);">تعديل النقاط</div>
                <div style="font-size:12px;color:var(--gray);">${displayName}</div>
            </div>
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px;">النقاط الحالية</label>
            <div style="font-size:28px;font-weight:800;color:var(--orange);font-family:var(--mono);">${currentPts}</div>
        </div>

        <div style="margin-bottom:8px;">
            <label style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px;">النقاط الجديدة</label>
            <input id="pts-input" type="number" min="0" max="99999" value="${currentPts}"
                style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:9px;
                       padding:10px 14px;color:var(--white);font-size:18px;font-weight:700;font-family:var(--mono);
                       outline:none;text-align:center;">
        </div>

        <!-- Quick adjust buttons -->
        <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
            ${['+10','+50','+100','-10','-50','-100'].map(v => {
                const n = parseInt(v);
                const col = n > 0 ? '#22c55e' : '#ef4444';
                return `<button onclick="document.getElementById('pts-input').value=Math.max(0,parseInt(document.getElementById('pts-input').value||0)+${n})"
                    style="flex:1;padding:5px;border:1px solid ${col}33;border-radius:7px;
                           background:${col}11;color:${col};font-size:12px;font-weight:700;cursor:pointer;">${v}</button>`;
            }).join('')}
        </div>

        <div style="display:flex;gap:8px;">
            <button id="pts-cancel"
                style="flex:1;padding:10px;border:1px solid var(--border);border-radius:9px;
                       background:transparent;color:var(--gray-light);font-size:13px;font-weight:700;cursor:pointer;">
                إلغاء
            </button>
            <button id="pts-save"
                style="flex:2;padding:10px;border:none;border-radius:9px;
                       background:var(--orange);color:#fff;font-size:13px;font-weight:800;cursor:pointer;">
                ✅ حفظ النقاط
            </button>
        </div>
        <div id="pts-error" style="color:#ef4444;font-size:12px;margin-top:8px;text-align:center;display:none;"></div>
    </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#pts-input');
    input.focus(); input.select();

    const close = () => overlay.remove();

    overlay.querySelector('#pts-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });

    async function save() {
        const newPts = parseInt(input.value);
        if (isNaN(newPts) || newPts < 0) {
            const errEl = overlay.querySelector('#pts-error');
            errEl.textContent = 'أدخل رقماً صحيحاً أكبر من أو يساوي 0';
            errEl.style.display = 'block';
            return;
        }

        const saveBtn = overlay.querySelector('#pts-save');
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ جاري الحفظ...';

        try {
            // Write to RTDB /users/{uid}/points
            const r = await fetch(`${RTDB_B}/users/${uid}/points.json`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(newPts),
            });
            if (!r.ok) throw new Error('RTDB write failed: ' + r.status);

            // Update local allUsers so re-render shows correct value
            if (allUsers[uid]) allUsers[uid].points = newPts;

            // Update security baseline so monitor doesn't false-alert on this intentional change
            if (_secBaseline && _secBaseline.userPoints) {
                _secBaseline.userPoints[uid] = newPts;
            }

            toast(`✅ نقاط ${displayName} → ${newPts} ⭐`);
            close();
            renderCustomers();
        } catch(e) {
            const errEl = overlay.querySelector('#pts-error');
            errEl.textContent = 'فشل الحفظ: ' + e.message;
            errEl.style.display = 'block';
            saveBtn.disabled = false;
            saveBtn.textContent = '✅ حفظ النقاط';
        }
    }

    overlay.querySelector('#pts-save').addEventListener('click', save);
}

/* ══════════════════════════════════════════════════════════
   RESET CUSTOMER PASSWORD
   Customer passwords live in Firebase Auth and are never retrievable —
   not by us, not by anyone. This resets to a NEW password instead,
   via a Cloud Function (Admin SDK is required server-side to touch
   another user's Auth record). Admin picks how the new password
   reaches the customer: WhatsApp, shown on-screen to relay manually,
   or both.
══════════════════════════════════════════════════════════ */
function _generateStrongPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

async function _sendWhatsappMessage(phone, message) {
    const instance = window._greenApiInstance || await fbGet('settings/greenApiInstance');
    const token    = window._greenApiToken    || await fbGet('settings/greenApiToken');
    if (!instance || !token) throw new Error('GREEN-API غير مهيأ من إعدادات الأدمن');
    // Strip a country-code prefix if present, then a leading local "0" (Lebanese
    // "03" numbers keep the 0 in local format only — international drops it).
    const digits = String(phone || '').replace(/\D/g, '').replace(/^961/, '').replace(/^0/, '');
    if (!digits) throw new Error('رقم هاتف غير صالح');
    const chatId = '961' + digits + '@c.us';
    const _gaServer = String(instance).slice(0, 4);
    const url  = `https://${_gaServer}.api.greenapi.com/waInstance${instance}/sendMessage/${token}`;
    const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chatId, message }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || `فشل إرسال واتساب (${resp.status})`);
    return true;
}

async function resetUserPassword(uid, username, displayName, phone) {
    if (!uid) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;
        display:flex;align-items:center;justify-content:center;padding:16px;`;

    overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;
                padding:24px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
            <span style="font-size:22px;">🔑</span>
            <div>
                <div style="font-size:15px;font-weight:800;color:var(--white);">إعادة تعيين كلمة المرور</div>
                <div style="font-size:12px;color:var(--gray);">${displayName || username}</div>
            </div>
        </div>

        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:9px;
                     padding:8px 10px;margin-bottom:14px;font-size:11px;color:#93c5fd;line-height:1.5;">
            ℹ️ لا يمكن عرض كلمة المرور الحالية لأنها غير مخزّنة كنص عادي (لأسباب أمان). يمكنك تعيين كلمة جديدة فقط.
        </div>

        <div style="margin-bottom:10px;">
            <label style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:6px;">كلمة المرور الجديدة</label>
            <div style="display:flex;gap:6px;">
                <input id="rpw-input" type="text" minlength="8" value="${_generateStrongPassword()}"
                    style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:9px;
                           padding:10px 14px;color:var(--white);font-size:15px;font-weight:700;font-family:var(--mono);
                           outline:none;text-align:center;">
                <button id="rpw-regen" title="توليد كلمة أخرى"
                    style="padding:0 12px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);
                           color:var(--gray-light);font-size:16px;cursor:pointer;">🎲</button>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:8px;">طريقة التسليم</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--gray-light);margin-bottom:6px;cursor:pointer;">
                <input id="rpw-whatsapp" type="checkbox" ${phone ? 'checked' : 'disabled'}>
                📱 إرسال عبر واتساب${phone ? ` (961${phone})` : ' — لا يوجد رقم هاتف'}
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--gray-light);cursor:pointer;">
                <input id="rpw-show" type="checkbox" ${phone ? '' : 'checked'}>
                👁 عرضها لي فقط (لإرسالها يدوياً)
            </label>
        </div>

        <div style="display:flex;gap:8px;">
            <button id="rpw-cancel"
                style="flex:1;padding:10px;border:1px solid var(--border);border-radius:9px;
                       background:transparent;color:var(--gray-light);font-size:13px;font-weight:700;cursor:pointer;">
                إلغاء
            </button>
            <button id="rpw-save"
                style="flex:2;padding:10px;border:none;border-radius:9px;
                       background:#3b82f6;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">
                ✅ تعيين كلمة المرور
            </button>
        </div>
        <div id="rpw-error"  style="color:#ef4444;font-size:12px;margin-top:8px;text-align:center;display:none;"></div>
        <div id="rpw-result" style="display:none;margin-top:12px;padding:10px;background:var(--surface2);border-radius:9px;text-align:center;">
            <div style="font-size:11px;color:var(--gray);margin-bottom:4px;">كلمة المرور الجديدة</div>
            <code id="rpw-result-code" style="font-size:16px;color:#3b82f6;font-weight:800;user-select:all;"></code>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#rpw-input');
    input.focus(); input.select();

    const close = () => overlay.remove();
    overlay.querySelector('#rpw-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#rpw-regen').addEventListener('click', () => { input.value = _generateStrongPassword(); input.select(); });

    overlay.querySelector('#rpw-save').addEventListener('click', async () => {
        const newPassword = input.value.trim();
        const errEl = overlay.querySelector('#rpw-error');
        errEl.style.display = 'none';

        if (newPassword.length < 8) { errEl.textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'; errEl.style.display = 'block'; return; }

        const wantsWhatsapp = overlay.querySelector('#rpw-whatsapp').checked;
        const wantsShow     = overlay.querySelector('#rpw-show').checked;
        if (!wantsWhatsapp && !wantsShow) { errEl.textContent = 'اختر طريقة تسليم واحدة على الأقل'; errEl.style.display = 'block'; return; }

        const saveBtn = overlay.querySelector('#rpw-save');
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ جاري التعيين...';

        try {
            const idToken = await window._adminAuth?.currentUser?.getIdToken();
            if (!idToken) throw new Error('جلسة المدير غير صالحة، سجّل الدخول من جديد');

            const resp = await fetch('https://us-central1-deliveryonline-300f7.cloudfunctions.net/adminResetUserPassword', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body:    JSON.stringify({ uid, newPassword }),
            });
            const data = await resp.json();
            if (!resp.ok || data.error) throw new Error(data.error || 'فشل تعيين كلمة المرور');

            if (wantsWhatsapp) {
                const msg = `🔑 مرحباً ${displayName || username}،\n\nتم تعيين كلمة مرور جديدة لحسابك في Delivo:\n\n*${newPassword}*\n\nيمكنك تسجيل الدخول بها الآن. ننصحك بتغييرها من إعدادات حسابك.`;
                try { await _sendWhatsappMessage(phone, msg); }
                catch(e) { toast('⚠️ تم تعيين كلمة المرور لكن فشل إرسال واتساب: ' + e.message, true); }
            }

            toast(`✅ تم تعيين كلمة مرور جديدة لـ ${displayName || username}`);

            if (wantsShow) {
                overlay.querySelector('#rpw-result-code').textContent = newPassword;
                overlay.querySelector('#rpw-result').style.display = 'block';
                saveBtn.style.display = 'none';
                overlay.querySelector('#rpw-cancel').textContent = 'إغلاق';
            } else {
                close();
            }
        } catch(e) {
            errEl.textContent = 'فشل: ' + e.message;
            errEl.style.display = 'block';
            saveBtn.disabled = false;
            saveBtn.textContent = '✅ تعيين كلمة المرور';
        }
    });
}

// ── Reset ONLY the order-ID counter — no other data touched ────────
async function resetGlobalCounterOnly() {
    const input = document.getElementById('counter-reset-input');
    const val   = parseInt(input?.value);
    if (isNaN(val) || val < 1) { toast('أدخل رقماً صحيحاً أكبر من صفر', true); return; }

    const ok = await showConfirm({
        title: '🔢 إعادة ضبط العداد فقط',
        msg:   `سيتم تعيين <code>globalCounter/requestId</code> إلى <strong>${val}</strong>.<br>` +
               `لن يُحذف أو يتأثر أي طلب أو مستخدم أو بيانات أخرى.<br><br>` +
               `<strong style="color:#fb923c;">تأكد أن هذه القيمة أعلى من أي رقم طلب موجود حالياً لتفادي التصادم.</strong>`,
        okLabel: '🔢 تأكيد', cancelLabel: 'إلغاء',
    });
    if (!ok) return;

    try {
        await fetch(`${RTDB}/globalCounter/requestId.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(val),
        });
        const el = document.getElementById('counter-current-val');
        if (el) el.textContent = val;
        toast(`✅ تم ضبط العداد إلى ${val}`);
    } catch (e) {
        toast('فشل ضبط العداد: ' + e.message, true);
    }
}

async function resetProject() {
    const RTDB_B = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';
    const FS_B   = 'https://firestore.googleapis.com/v1/projects/deliveryonline-300f7/databases/(default)/documents';

    // Pause security monitor during reset to avoid false alerts
    _secBaseline = null;
    const _secPaused = true;

    // Step 1 — triple confirmation
    const c1 = await showConfirm({
        title: '💣 إعادة ضبط المشروع',
        msg:   'هذا سيحذف <strong>كل بيانات العملاء والطلبات</strong> نهائياً.<br><br>تأكد من عمل Export أولاً!<br><br>هل أنت متأكد؟',
        okLabel: 'نعم، متأكد', cancelLabel: 'إلغاء', danger: true,
    });
    if (!c1) return;

    const c2 = await showConfirm({
        title: '⚠️ تأكيد أخير',
        msg:   'لا يمكن التراجع عن هذا الإجراء.<br>كل الطلبات والمستخدمين ستُحذف.<br><br><strong style="color:#ef4444;">هل تريد المتابعة؟</strong>',
        okLabel: '💣 نعم، احذف كل شيء', cancelLabel: 'إلغاء', danger: true,
    });
    if (!c2) return;

    const logEl  = document.getElementById('rst-log');
    const progEl = document.getElementById('rst-prog');
    logEl.style.display = 'block';
    logEl.innerHTML = '';
    const log = (msg, cls='bk-info') => {
        const d = document.createElement('div');
        d.className = cls;
        d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    };
    const label = document.getElementById('backup-status-label');
    label.textContent = '⏳ جاري إعادة الضبط...';

    // What to delete from RTDB
    const rtdbDelete = [
        'requests', 'historyRequests', 'guestCustomers', 'users', 'phoneIndex',
        'devices', 'blacklist', 'deletedUsernames', 'pendingAuthDeletion',
        'drivers', 'driverDevices', 'device_fingerprints',
    ];

    // What to delete from Firestore
    const fsDelete = ['users', 'usernames', 'orders', 'devices',
                      'driverDevices', 'device_fingerprints', 'whitelisted_devices'];

    const total = rtdbDelete.length + fsDelete.length + 2; // +2 for counter + auth cleanup
    let done = 0;
    const tick = () => { done++; progEl.style.width = (done/total*100)+'%'; };

    // ── 1. Delete RTDB paths ──────────────────────────────────────────
    log('🗑 حذف RTDB...');
    await Promise.allSettled(rtdbDelete.map(async path => {
        try {
            await fetch(`${RTDB_B}/${path}.json`, { method: 'DELETE' });
            log(`  ✅ RTDB/${path} حُذف`, 'bk-ok');
        } catch(e) {
            log(`  ⚠️ RTDB/${path}: ${e.message}`, 'bk-warn');
        }
        tick();
    }));

    // ── 2. Reset global counter to 1 ─────────────────────────────────
    try {
        await fetch(`${RTDB_B}/globalCounter/requestId.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(1),
        });
        log('✅ العداد العالمي → 1', 'bk-ok');
    } catch(e) {
        log(`⚠️ العداد: ${e.message}`, 'bk-warn');
    }
    tick();

    // ── 3. Delete Firestore collections ───────────────────────────────
    log('🗑 حذف Firestore collections...');
    const token  = await getFsToken().catch(() => null);
    const fsAuth = token ? { 'Content-Type':'application/json', Authorization:`Bearer ${token}` } : {};

    for (const col of fsDelete) {
        try {
            // Use SDK batch delete if available
            if (window._adminDb) {
                const snap = await window._adminDb.collection(col).get();
                if (!snap.empty) {
                    // Batch in groups of 500
                    const chunks = [];
                    let batch = window._adminDb.batch();
                    let count = 0;
                    snap.docs.forEach(doc => {
                        batch.delete(doc.ref);
                        count++;
                        if (count === 500) { chunks.push(batch.commit()); batch = window._adminDb.batch(); count = 0; }
                    });
                    if (count > 0) chunks.push(batch.commit());
                    await Promise.all(chunks);
                    log(`  ✅ Firestore/${col} — ${snap.size} docs حُذفت`, 'bk-ok');
                } else {
                    log(`  ✅ Firestore/${col} — فارغ`, 'bk-ok');
                }
            } else if (token) {
                // REST fallback — page and delete one by one
                let pageToken = null;
                let deleted = 0;
                do {
                    const url = `${FS_B}/${col}?pageSize=300${pageToken?'&pageToken='+pageToken:''}`;
                    const r   = await fetch(url, { headers: fsAuth });
                    const d   = await r.json();
                    const docs = d.documents || [];
                    await Promise.allSettled(docs.map(doc =>
                        fetch(doc.name.replace('https://firestore.googleapis.com/v1/','https://firestore.googleapis.com/v1/'), { method:'DELETE', headers:fsAuth })
                    ));
                    deleted += docs.length;
                    pageToken = d.nextPageToken || null;
                } while (pageToken);
                log(`  ✅ Firestore/${col} — ${deleted} docs حُذفت`, 'bk-ok');
            }
        } catch(e) {
            log(`  ⚠️ Firestore/${col}: ${e.message}`, 'bk-warn');
        }
        tick();
    }

    // ── 4. Clean up Firebase Auth ghost accounts ──────────────────────
    // We can't delete Auth accounts client-side, but we write a marker
    // so firebase-init.js slot-recycling handles re-registration cleanly
    log('ℹ️ Firebase Auth accounts: تبقى محذوفة من RTDB/Firestore — إعادة التسجيل تعمل تلقائياً عبر slot-recycling', 'bk-info');
    tick();

    // ── 5. Reset security baseline ────────────────────────────────────
    _secBaseline = null;

    // ── 6. Reload data ────────────────────────────────────────────────
    allUsers = {}; allOrders = {}; allBlacklist = {};
    window.allUsers = allUsers;
    await loadAllData().catch(()=>{});

    log('', 'bk-info');
    log('🎉 تمت إعادة الضبط بنجاح!', 'bk-ok');
    log('   العملاء: 0 | الطلبات: 0 | العداد: 1', 'bk-ok');
    log('   المتاجر والمنتجات والإعدادات: محفوظة ✓', 'bk-ok');
    progEl.style.width = '100%';
    label.textContent = `✅ Reset مكتمل: ${new Date().toLocaleTimeString()}`;
    toast('✅ تمت إعادة ضبط المشروع — جاهز للإطلاق الحقيقي!');
}

async function setLoyaltyVisible(checked) {
    try {
        await fbSet('settings/loyaltyVisible', checked);
        toast(checked ? '⭐ نظام النقاط مُفعَّل للعملاء' : '🙈 نظام النقاط مخفي عن العملاء');
    } catch(e) { toast('فشل تحديث إعداد النقاط', true); }
}

async function setTopStoresVisible(checked) {
    try {
        await fbSet('settings/topStoresVisible', checked);
        toast(checked ? '🏪 قسم "المتاجر الأكثر طلباً" ظاهر للعملاء' : '🙈 قسم "المتاجر الأكثر طلباً" مخفي عن العملاء');
    } catch(e) { toast('فشل تحديث الإعداد', true); }
}

async function setIntroEnabled(checked) {
    try {
        await fbSet('settings/introEnabled', checked);
        toast(checked ? '👋 شاشة التعريف مُفعَّلة لأول زيارة' : '🙈 شاشة التعريف مُعطَّلة للزوار الجدد');
    } catch(e) { toast('فشل تحديث إعداد شاشة التعريف', true); }
}

async function setTestMode(val) {
    try {
        await fbSet('settings/testMode', val);
        const badge   = document.getElementById('test-mode-badge');
        const preview = document.getElementById('test-mode-preview');
        if (badge)   badge.style.display   = val ? 'inline-block' : 'none';
        if (preview) preview.style.display = val ? 'block' : 'none';
        toast(val ? '🧪 وضع التجربة مفعّل — العملاء يرون الشريط التنبيهي' : '✅ وضع التجربة أُوقف — الموقع جاهز للخدمة');
    } catch(e) { toast('فشل تحديث وضع التجربة', true); }
}

async function setDeliveryFee(val) {
    const fee = parseFloat(val);
    if (isNaN(fee) || fee < 0) { toast('قيمة غير صالحة', true); return; }
    try {
        await fbSet('settings/deliveryFee', fee);
        toast(`✅ تم تحديث رسوم التوصيل: $${fee}`);
    } catch(e) { toast('فشل تحديث رسوم التوصيل', true); }
}

/* ═══════════════════════════════════════════════════════════════
   SMART DELIVERY — admin settings functions
═══════════════════════════════════════════════════════════════ */

// Toggle smart delivery on/off
async function toggleSmartDelivery(enabled) {
    const config    = await fbGet('settings/smartDelivery').catch(() => null) || {};
    const badge     = document.getElementById('smart-mode-badge');
    const configDiv = document.getElementById('smart-delivery-config');
    config.enabled  = enabled;
    try {
        await fbSet('settings/smartDelivery', config);
        if (badge)     badge.style.display     = enabled ? 'inline-block' : 'none';
        if (configDiv) configDiv.style.display = enabled ? 'block' : 'none';
        toast(enabled ? '✨ التوصيل الذكي مفعّل' : '↩ تم التبديل إلى الرسوم الثابتة');
    } catch(e) { toast('فشل تحديث الإعداد', true); }
}

// ── Mode switch: formula (per-store distance) vs centerTiers (distance
// from Delivo HQ matched against admin-defined price boundaries) ────────
let _sdCurrentMode = 'formula';
function sdSwitchMode(mode) {
    _sdCurrentMode = mode;
    const isFormula = mode === 'formula';

    const btnFormula = document.getElementById('sd-mode-btn-formula');
    const btnCenter  = document.getElementById('sd-mode-btn-centerTiers');
    if (btnFormula) { btnFormula.style.background = isFormula ? 'var(--orange)' : 'transparent'; btnFormula.style.color = isFormula ? '#fff' : 'var(--gray-light)'; }
    if (btnCenter)  { btnCenter.style.background  = isFormula ? 'transparent' : 'var(--orange)';  btnCenter.style.color  = isFormula ? 'var(--gray-light)' : '#fff'; }

    const formulaFields  = document.getElementById('sd-mode-formula-fields');
    const formulaPreview = document.getElementById('sd-mode-formula-preview');
    const centerFields   = document.getElementById('sd-mode-centertiers-fields');
    if (formulaFields)  formulaFields.style.display  = isFormula ? 'block' : 'none';
    if (formulaPreview) formulaPreview.style.display = isFormula ? 'block' : 'none';
    if (centerFields)   centerFields.style.display   = isFormula ? 'none' : 'block';

    if (!isFormula) {
        const list = document.getElementById('sd-centertiers-list');
        if (list && !list.children.length) {
            sdAddCenterTier(0, 2, 50000);
            sdAddCenterTier(2, 3, 75000);
            sdAddCenterTier(3, '', 100000);
        }
        sdRunCenterTierPreview();
    }
}

// Add a new distance-boundary row (center-tiers mode)
let _sdCenterTierIdx = 0;
function sdAddCenterTier(fromKm = '', toKm = '', fee = '') {
    const list = document.getElementById('sd-centertiers-list');
    if (!list) return;
    const idx = _sdCenterTierIdx++;
    const row = document.createElement('div');
    row.id = `sd-ctier-${idx}`;
    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;';
    row.innerHTML = `
        <div style="flex:1;">
            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:3px;">من (كم)</label>
            <input type="number" class="sd-ctier-from" value="${fromKm}" min="0" step="0.5" placeholder="0"
                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
        </div>
        <div style="flex:1;">
            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:3px;">إلى (كم)</label>
            <input type="number" class="sd-ctier-to" value="${toKm}" min="0" step="0.5" placeholder="وما فوق"
                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
        </div>
        <div style="flex:1;">
            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:3px;">السعر (ل.ل)</label>
            <input type="number" class="sd-ctier-fee" value="${fee}" min="0" step="1000" placeholder="e.g. 30000"
                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
        </div>
        <button onclick="this.closest('[id^=sd-ctier-]').remove()"
                style="background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.8rem;flex-shrink:0;align-self:flex-end;">✕</button>`;
    list.appendChild(row);
}

// Read current center-tiers from DOM (sorted by fromKm)
function sdReadCenterTiers() {
    return [...document.querySelectorAll('#sd-centertiers-list > div')].map(row => {
        const toRaw = row.querySelector('.sd-ctier-to')?.value;
        return {
            fromKm: parseFloat(row.querySelector('.sd-ctier-from')?.value || 0) || 0,
            toKm:   (toRaw === '' || toRaw === undefined) ? null : parseFloat(toRaw),
            fee:    parseFloat(row.querySelector('.sd-ctier-fee')?.value || 0) || 0,
        };
    }).sort((a, b) => a.fromKm - b.fromKm);
}

// Same boundary-lookup as scripts/cart.js's _calcCenterTierFee
function _sdCalcCenterTierFee(distanceKm, centerTiers) {
    if (!centerTiers || !centerTiers.length) return null;
    for (const t of centerTiers) {
        const to = (t.toKm === null) ? Infinity : t.toKm;
        if (distanceKm >= t.fromKm && distanceKm < to) return t.fee;
    }
    return centerTiers[centerTiers.length - 1].fee;
}

function sdRunCenterTierPreview() {
    const testKm   = parseFloat(document.getElementById('sd-ct-test-km')?.value) || 0;
    const tiers    = sdReadCenterTiers();
    const resultEl = document.getElementById('sd-ct-test-result');
    if (!resultEl) return;
    const fee = _sdCalcCenterTierFee(testKm, tiers);
    resultEl.textContent = fee === null ? 'لا توجد شرائح بعد' : `${fee.toLocaleString('en-US')} ل.ل`;
}

// Add a new discount tier row
let _sdTierIdx = 0;
function sdAddTier(minTotal = '', discount = '') {
    const list = document.getElementById('sd-tiers-list');
    if (!list) return;
    const idx = _sdTierIdx++;
    const row = document.createElement('div');
    row.id = `sd-tier-${idx}`;
    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:8px 10px;';
    row.innerHTML = `
        <div style="flex:1;">
            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:3px;">إجمالي متجر ≥ ($)</label>
            <input type="number" class="sd-tier-min" value="${minTotal}" min="0" step="1" placeholder="e.g. 15"
                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
        </div>
        <div style="flex:1;">
            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:3px;">خصم التوصيل ($)</label>
            <input type="number" class="sd-tier-disc" value="${discount}" min="0" step="0.25" placeholder="e.g. 0.5"
                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
        </div>
        <button onclick="this.closest('[id^=sd-tier-]').remove()"
                style="background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.8rem;flex-shrink:0;">✕</button>`;
    list.appendChild(row);
}

// Read current tiers from DOM
function sdReadTiers() {
    return [...document.querySelectorAll('#sd-tiers-list > div')].map(row => ({
        minTotal: parseFloat(row.querySelector('.sd-tier-min')?.value || 0) || 0,
        discount: parseFloat(row.querySelector('.sd-tier-disc')?.value || 0) || 0,
    })).filter(t => t.minTotal > 0);
}

// Live preview calculator
function sdRunPreview() {
    const baseFee   = parseFloat(document.getElementById('sd-base-fee')?.value) || 1.5;
    const ratePerKm = parseFloat(document.getElementById('sd-rate-km')?.value)  || 0.3;
    const minFee    = parseFloat(document.getElementById('sd-min-fee')?.value)  || 0.5;
    const maxFee    = parseFloat(document.getElementById('sd-max-fee')?.value)  || 5.0;
    const testTotal = parseFloat(document.getElementById('sd-test-total')?.value) || 0;
    const testKm    = parseFloat(document.getElementById('sd-test-km')?.value)   || 0;
    const tiers     = sdReadTiers();
    const resultEl  = document.getElementById('sd-test-result');

    const distFee = baseFee + testKm * ratePerKm;

    // Find best tier discount
    const sorted   = [...tiers].sort((a,b) => b.minTotal - a.minTotal);
    let discount   = 0;
    for (const tier of sorted) {
        if (testTotal >= tier.minTotal) { discount = tier.discount; break; }
    }

    const fee = Math.min(maxFee, Math.max(minFee, distFee - discount));
    if (resultEl) {
        resultEl.textContent = `$${fee.toFixed(2)}`;
        resultEl.title = `${baseFee} + ${testKm}×${ratePerKm} = ${distFee.toFixed(2)} − ${discount} → clamp(${minFee}, ${fee.toFixed(2)}, ${maxFee})`;
    }
}

// Wire live preview on input change
document.addEventListener('input', e => {
    if (['sd-base-fee','sd-rate-km','sd-min-fee','sd-max-fee','sd-test-total','sd-test-km'].includes(e.target.id)
        || e.target.classList.contains('sd-tier-min')
        || e.target.classList.contains('sd-tier-disc')) {
        sdRunPreview();
    }
    if (e.target.id === 'sd-ct-test-km'
        || e.target.classList.contains('sd-ctier-from')
        || e.target.classList.contains('sd-ctier-to')
        || e.target.classList.contains('sd-ctier-fee')) {
        sdRunCenterTierPreview();
    }
    if (['nd-start-hour','nd-end-hour','nd-flat-fee','nd-per-km','nd-test-hour','nd-test-km'].includes(e.target.id)) {
        ndRunPreview();
    }
    if (e.target.classList.contains('rw-pts') || e.target.classList.contains('rw-icon')
        || e.target.classList.contains('rw-reward') || e.target.classList.contains('rw-desc')
        || e.target.classList.contains('rw-value')) {
        rwRenderPreview();
    }
});

// Save all smart delivery settings to Firebase
async function sdSave() {
    const baseFee   = parseFloat(document.getElementById('sd-base-fee')?.value);
    const ratePerKm = parseFloat(document.getElementById('sd-rate-km')?.value);
    const minFee    = parseFloat(document.getElementById('sd-min-fee')?.value);
    const maxFee    = parseFloat(document.getElementById('sd-max-fee')?.value);
    const enabled   = document.getElementById('toggle-smart-delivery')?.checked ?? false;
    const tiers     = sdReadTiers();
    const centerTiers = sdReadCenterTiers();

    if ([baseFee, ratePerKm, minFee, maxFee].some(isNaN)) {
        toast('تحقق من القيم المدخلة', true); return;
    }
    if (_sdCurrentMode === 'centerTiers' && !centerTiers.length) {
        toast('⚠️ أضف شريحة مسافة واحدة على الأقل', true); return;
    }

    const payload = { enabled, mode: _sdCurrentMode, baseFee, ratePerKm, minFee, maxFee, tiers, centerTiers };
    try {
        await fbSet('settings/smartDelivery', payload);
        toast('💾 تم حفظ إعدادات التوصيل الذكي');
    } catch(e) { toast('فشل الحفظ', true); }
}

// Load smart delivery settings into the UI
async function sdLoad() {
    const cfg = await fbGet('settings/smartDelivery').catch(() => null);
    if (!cfg) return;

    const toggle    = document.getElementById('toggle-smart-delivery');
    const configDiv = document.getElementById('smart-delivery-config');
    const badge     = document.getElementById('smart-mode-badge');

    if (toggle)    toggle.checked             = !!cfg.enabled;
    if (configDiv) configDiv.style.display    = cfg.enabled ? 'block' : 'none';
    if (badge)     badge.style.display        = cfg.enabled ? 'inline-block' : 'none';

    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
    set('sd-base-fee',  cfg.baseFee);
    set('sd-rate-km',   cfg.ratePerKm);
    set('sd-min-fee',   cfg.minFee);
    set('sd-max-fee',   cfg.maxFee);

    // Render tiers
    const list = document.getElementById('sd-tiers-list');
    if (list && cfg.tiers) {
        list.innerHTML = '';
        _sdTierIdx = 0;
        cfg.tiers.forEach(t => sdAddTier(t.minTotal, t.discount));
    }

    // Render center-tiers
    const ctierList = document.getElementById('sd-centertiers-list');
    if (ctierList) {
        ctierList.innerHTML = '';
        _sdCenterTierIdx = 0;
        (cfg.centerTiers || []).forEach(t => sdAddCenterTier(t.fromKm, t.toKm ?? '', t.fee));
    }

    sdSwitchMode(cfg.mode === 'centerTiers' ? 'centerTiers' : 'formula');
    sdRunPreview();
    sdRunCenterTierPreview();
}

/* ═══════════════════════════════════════════════════════════════
   NIGHT DELIVERY — admin settings functions
   Same static on/off window as scripts/cart.js's _isNightActive():
   full fee for the entire configured window, no ramp — snaps on at
   startHour and off at endHour. flatFee/perKm are entered here in
   Lebanese Lira (large numbers are auto-detected as ل.ل, same
   >1000-is-LBP convention used everywhere else — see _toUSD).
═══════════════════════════════════════════════════════════════ */

function _ndActiveAt(hourFrac, startHour, endHour) {
    let duration = endHour - startHour;
    if (duration <= 0) duration += 24;
    let elapsed = hourFrac - startHour;
    if (elapsed < 0) elapsed += 24;
    return elapsed <= duration ? 1 : 0;
}

function _ndBeirutHourFrac() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Beirut', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const h = parseFloat(parts.find(p => p.type === 'hour').value);
    const m = parseFloat(parts.find(p => p.type === 'minute').value);
    return h + m / 60;
}

// Draws the 24h active window as inline SVG — a flat-topped rectangle for
// the whole night period (no ramp), with a live dot marking "right now"
// in Beirut time.
function ndRenderCurve() {
    const wrap = document.getElementById('nd-curve-wrap');
    if (!wrap) return;
    const startHour = parseFloat(document.getElementById('nd-start-hour')?.value) || 0;
    const endHour   = parseFloat(document.getElementById('nd-end-hour')?.value)   || 0;

    const W = 600, H = 140, pad = 8;
    const pts = [];
    for (let h = 0; h <= 24; h += 0.5) {
        const active = _ndActiveAt(h, startHour, endHour);
        const x = pad + (h / 24) * (W - pad * 2);
        const y = H - pad - active * (H - pad * 2);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const linePath = 'M' + pts.join(' L');
    const areaPath = linePath + ` L${(W - pad).toFixed(1)},${(H - pad).toFixed(1)} L${pad.toFixed(1)},${(H - pad).toFixed(1)} Z`;

    const nowFrac = _ndBeirutHourFrac();
    const nowX = pad + (nowFrac / 24) * (W - pad * 2);
    const nowY = H - pad - _ndActiveAt(nowFrac, startHour, endHour) * (H - pad * 2);

    const nowLabel = document.getElementById('nd-now-label');
    if (nowLabel) {
        const hh = String(Math.floor(nowFrac)).padStart(2, '0');
        const mm = String(Math.round((nowFrac % 1) * 60)).padStart(2, '0');
        nowLabel.textContent = `الآن: ${hh}:${mm}`;
    }

    wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:120px;overflow:visible;">
        <defs>
            <linearGradient id="nd-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#818cf8" stop-opacity=".4"/>
                <stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>
            </linearGradient>
        </defs>
        ${[0, 6, 12, 18, 24].map(h => {
            const x = pad + (h / 24) * (W - pad * 2);
            return `<line x1="${x}" y1="${pad}" x2="${x}" y2="${H - pad}" stroke="rgba(255,255,255,.06)"/>
                    <text x="${x}" y="${H - 1}" font-size="9" fill="var(--gray)" text-anchor="middle">${h}</text>`;
        }).join('')}
        <path d="${areaPath}" fill="url(#nd-grad)"/>
        <path d="${linePath}" fill="none" stroke="#818cf8" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="${nowX.toFixed(1)}" cy="${nowY.toFixed(1)}" r="4.5" fill="#818cf8"/>
        <circle cx="${nowX.toFixed(1)}" cy="${nowY.toFixed(1)}" r="8" fill="#818cf8" opacity=".25"/>
    </svg>`;
}

function ndRunPreview() {
    const startHour = parseFloat(document.getElementById('nd-start-hour')?.value) || 0;
    const endHour   = parseFloat(document.getElementById('nd-end-hour')?.value)   || 0;
    const flatFee   = parseFloat(document.getElementById('nd-flat-fee')?.value)   || 0;
    const perKm     = parseFloat(document.getElementById('nd-per-km')?.value)     || 0;
    const testHour  = parseFloat(document.getElementById('nd-test-hour')?.value)  || 0;
    const testKm    = parseFloat(document.getElementById('nd-test-km')?.value)    || 0;
    const resultEl  = document.getElementById('nd-test-result');

    const active       = _ndActiveAt(testHour, startHour, endHour);
    const surchargeLBP = active ? (flatFee + perKm * testKm) : 0;
    if (resultEl) {
        resultEl.textContent = active
            ? `+ ${Math.round(surchargeLBP).toLocaleString('en-US')} ل.ل`
            : 'لا توجد إضافة (نهار)';
        resultEl.title = active ? 'ضمن الفترة الليلية' : 'خارج الفترة الليلية';
    }
    ndRenderCurve();
}

async function toggleNightDelivery(enabled) {
    const config    = await fbGet('settings/nightDelivery').catch(() => null) || {};
    const badge     = document.getElementById('night-mode-badge');
    const configDiv = document.getElementById('night-delivery-config');
    config.enabled  = enabled;
    try {
        await fbSet('settings/nightDelivery', config);
        if (badge)     badge.style.display     = enabled ? 'inline-block' : 'none';
        if (configDiv) configDiv.style.display = enabled ? 'block' : 'none';
        if (enabled) { ndRenderCurve(); ndRunPreview(); }
        toast(enabled ? '🌙 التوصيل الليلي مفعّل' : '↩ تم إيقاف التوصيل الليلي');
    } catch (e) { toast('فشل تحديث الإعداد', true); }
}

async function ndSave() {
    const startHour = parseFloat(document.getElementById('nd-start-hour')?.value);
    const endHour   = parseFloat(document.getElementById('nd-end-hour')?.value);
    const flatFee   = parseFloat(document.getElementById('nd-flat-fee')?.value);
    const perKm     = parseFloat(document.getElementById('nd-per-km')?.value);
    const enabled   = document.getElementById('toggle-night-delivery')?.checked ?? false;

    if ([startHour, endHour, flatFee, perKm].some(isNaN)) { toast('تحقق من القيم المدخلة', true); return; }
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) { toast('الساعات يجب أن تكون بين 0 و 23', true); return; }

    const payload = { enabled, startHour, endHour, flatFee, perKm };
    try {
        await fbSet('settings/nightDelivery', payload);
        toast('💾 تم حفظ إعدادات التوصيل الليلي');
    } catch (e) { toast('فشل الحفظ', true); }
}

async function ndLoad() {
    const cfg = await fbGet('settings/nightDelivery').catch(() => null);
    const toggle    = document.getElementById('toggle-night-delivery');
    const configDiv = document.getElementById('night-delivery-config');
    const badge     = document.getElementById('night-mode-badge');

    if (cfg) {
        if (toggle)    toggle.checked          = !!cfg.enabled;
        if (configDiv) configDiv.style.display = cfg.enabled ? 'block' : 'none';
        if (badge)     badge.style.display     = cfg.enabled ? 'inline-block' : 'none';

        const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
        set('nd-start-hour', cfg.startHour);
        set('nd-end-hour',   cfg.endHour);
        set('nd-flat-fee',   cfg.flatFee);
        set('nd-per-km',     cfg.perKm);
    }
    ndRenderCurve();
    ndRunPreview();
}

/* ═══════════════════════════════════════════════════════════════
   OTLOB FAST ITEMS — admin editor for the "اطلب خارجي" quick-item
   category popup. Firebase path: /settings/otlobFastItems
   Shape: [ { label: "🍔 برغر", items: ["برغر لحم", ...] }, ... ]
   Read by scripts/external-order.js on the customer side; falls
   back to DEFAULT_OTLOB_FAST_ITEMS below if nothing is saved yet.
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_OTLOB_FAST_ITEMS = [
    { label: '🍔 برغر',    items: ['برغر لحم', 'برغر دجاج', 'برغر مشوي', 'دبل برغر'] },
    { label: '🍕 بيتزا',   items: ['بيتزا مارغريتا', 'بيتزا خضار', 'بيتزا دجاج', 'بيتزا لحمة'] },
    { label: '🍗 دجاج',    items: ['دجاج مشوي', 'بروست', 'تشيكن ونجز', 'شاورما دجاج'] },
    { label: '🌯 ساندويش', items: ['شاورما لحمة', 'صاندويش فلافل', 'صاندويش تونا', 'مناقيش'] },
    { label: '🍟 مقبلات',  items: ['بطاطا مقلية', 'بطاطا ويدجز', 'حلقات بصل', 'ناغتس'] },
    { label: '🥗 سلطة',    items: ['فتوش', 'تبولة', 'سلطة سيزر', 'سلطة خضار'] },
    { label: '🥤 مشروبات', items: ['مشروب غازي', 'عصير طازج', 'مويا', 'آيس تي'] },
    { label: '☕ حلويات',  items: ['قهوة', 'نسكافيه', 'كنافة', 'مهلبية'] },
];

let _ofiCatIdx = 0;

// Add one category row (with its sub-item pills) to the editor
function ofiAddCategory(label = '', items = []) {
    const list = document.getElementById('ofi-categories-list');
    if (!list) return;
    const idx = _ofiCatIdx++;
    const row = document.createElement('div');
    row.id = `ofi-cat-${idx}`;
    row.className = 'ofi-cat-row';
    row.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;';
    row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input type="text" class="ofi-cat-label" value="${label.replace(/"/g,'&quot;')}" placeholder="🍔 اسم الفئة (مع إيموجي)"
                   style="flex:1;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--font);outline:none;box-sizing:border-box;">
            <button onclick="this.closest('.ofi-cat-row').remove()" title="حذف الفئة"
                    style="background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;width:32px;height:32px;flex-shrink:0;cursor:pointer;">🗑</button>
        </div>
        <div class="ofi-items-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
        <button onclick="ofiAddItem(${idx})" style="font-size:0.72rem;background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:5px 10px;cursor:pointer;">+ صنف</button>`;
    list.appendChild(row);
    (items.length ? items : ['']).forEach(item => ofiAddItem(idx, item));
    if (!items.length) {
        // Freshly-added empty category — drop the one blank placeholder
        // pill it just got, so it starts clean instead of with an
        // empty input.
        const pills = row.querySelectorAll('.ofi-item-pill');
        if (pills.length === 1 && !pills[0].querySelector('input').value) pills[0].remove();
    }
}

// Add one sub-item pill (editable text + remove ✕) inside a category row
function ofiAddItem(catIdx, value = '') {
    const row = document.getElementById(`ofi-cat-${catIdx}`);
    const itemsList = row?.querySelector('.ofi-items-list');
    if (!itemsList) return;
    const pill = document.createElement('span');
    pill.className = 'ofi-item-pill';
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:50px;padding:4px 4px 4px 10px;';
    pill.innerHTML = `
        <input type="text" class="ofi-item-input" value="${value.replace(/"/g,'&quot;')}" placeholder="اسم الصنف"
               style="background:none;border:none;color:var(--white);font-size:0.78rem;outline:none;width:90px;font-family:var(--font);">
        <button onclick="this.closest('.ofi-item-pill').remove()"
                style="background:rgba(239,68,68,0.15);color:var(--red);border:none;border-radius:50%;width:18px;height:18px;font-size:0.6rem;cursor:pointer;flex-shrink:0;">✕</button>`;
    itemsList.appendChild(pill);
}

// Read the full editor state from the DOM — categories with an empty
// label, and items with empty text, are dropped rather than saved.
function ofiReadCategories() {
    return [...document.querySelectorAll('#ofi-categories-list > .ofi-cat-row')].map(row => {
        const label = row.querySelector('.ofi-cat-label')?.value.trim() || '';
        const items = [...row.querySelectorAll('.ofi-item-input')]
            .map(inp => inp.value.trim())
            .filter(Boolean);
        return { label, items };
    }).filter(c => c.label && c.items.length);
}

async function ofiSave() {
    const categories = ofiReadCategories();
    if (!categories.length) { toast('أضف فئة واحدة على الأقل بصنف واحد', true); return; }
    try {
        await fbSet('settings/otlobFastItems', categories);
        toast('💾 تم حفظ الأصناف السريعة');
    } catch (e) { toast('فشل الحفظ', true); }
}

async function ofiLoad() {
    const list = document.getElementById('ofi-categories-list');
    if (!list) return;
    let categories = await fbGet('settings/otlobFastItems').catch(() => null);
    if (!Array.isArray(categories) || !categories.length) categories = DEFAULT_OTLOB_FAST_ITEMS;
    list.innerHTML = '';
    _ofiCatIdx = 0;
    categories.forEach(c => ofiAddCategory(c.label, c.items || []));

    const enabledToggle = document.getElementById('ofi-enabled-toggle');
    if (enabledToggle) {
        const enabled = await fbGet('settings/otlobFastItemsEnabled').catch(() => null);
        enabledToggle.checked = enabled !== false; // default ON when never configured
    }
}

// Enable/disable — controls whether the quick-category chips show up
// for the customer under the description box in "اطلب خارجي" (index page).
// Saves immediately on toggle rather than waiting for ofiSave().
function _ofiBindEnableToggle() {
    if (window._ofiEnableToggleBound) return;
    window._ofiEnableToggleBound = true;
    document.getElementById('ofi-enabled-toggle')?.addEventListener('change', async (e) => {
        const checked = e.target.checked;
        e.target.disabled = true;
        try {
            await fbSet('settings/otlobFastItemsEnabled', checked);
            toast(checked ? '✅ تم تفعيل أزرار الفئات السريعة' : '⏸ تم إخفاء أزرار الفئات السريعة عن العميل');
        } catch (err) {
            e.target.checked = !checked;
            toast('فشل التحديث: ' + err.message, true);
        } finally {
            e.target.disabled = false;
        }
    });
}

// Collapsed by default — expands on click, chevron rotates to indicate state.
function _ofiBindToggle() {
    if (window._ofiToggleBound) return;
    window._ofiToggleBound = true;
    document.getElementById('ofi-toggle-header')?.addEventListener('click', () => {
        const body    = document.getElementById('ofi-admin-body');
        const chevron = document.getElementById('ofi-toggle-chevron');
        if (!body) return;
        const expanded = body.style.display !== 'none';
        body.style.display = expanded ? 'none' : 'block';
        if (chevron) chevron.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
    });
}

/* ═══════════════════════════════════════════════════════════════
   REWARDS / LOYALTY LADDER  —  admin editor
   Firebase path: /settings/loyaltyRewards   (array, sorted asc by pts)
   Each step: { pts, icon, reward, desc, type, value }
   type ∈ free_delivery | discount_fixed | discount_percent | account_credit | manual

   Auto-apply system (see scripts/cart.js):
     /users/{uid}/claimedTiers  → array of pts thresholds already queued
     /users/{uid}/rewardQueue   → FIFO array of pending one-time rewards
   ═══════════════════════════════════════════════════════════════ */

const REWARD_TYPES = [
    { id: 'free_delivery',    label: '🛵 توصيل مجاني',         hasValue: false, unit: '' },
    { id: 'discount_fixed',   label: '💵 خصم مبلغ ثابت',       hasValue: true,  unit: '$' },
    { id: 'discount_percent', label: '🏷️ خصم نسبة %',          hasValue: true,  unit: '%' },
    { id: 'account_credit',   label: '💳 رصيد دائم في الحساب', hasValue: true,  unit: '$' },
    { id: 'manual',           label: '🎁 مكافأة يدوية (هدية/عضوية/وجبة)', hasValue: false, unit: '' },
];
const REWARD_TYPE_LABELS = Object.fromEntries(REWARD_TYPES.map(t => [t.id, t.label]));

// Default ladder — used only if /settings/loyaltyRewards is empty (first run)
const DEFAULT_LOYALTY_REWARDS = [
    { pts: 50,   icon: '☕', reward: 'قهوة مجانية',          desc: 'قهوة إسبريسو من متجر شريك',        type: 'manual',           value: 0 },
    { pts: 100,  icon: '🍕', reward: 'خصم $1 على طلبك',      desc: 'خصم دولار واحد على أي طلب',        type: 'discount_fixed',   value: 1 },
    { pts: 150,  icon: '🛵', reward: 'توصيل مجاني',          desc: 'طلب واحد بتوصيل مجاني',            type: 'free_delivery',    value: 0 },
    { pts: 200,  icon: '🎁', reward: 'هدية مفاجئة',          desc: 'هدية خاصة من Delivo',               type: 'manual',           value: 0 },
    { pts: 300,  icon: '🍔', reward: 'وجبة مجانية',          desc: 'وجبة مجانية من متجر مختار',        type: 'manual',           value: 0 },
    { pts: 400,  icon: '💳', reward: 'رصيد $5 في حسابك',     desc: 'رصيد دائم قابل للاستخدام',         type: 'account_credit',   value: 5 },
    { pts: 500,  icon: '🏅', reward: 'عضوية VIP شهر',        desc: 'تخفيضات وأولوية دائمة لمدة شهر',   type: 'manual',           value: 0 },
    { pts: 700,  icon: '🎟️', reward: 'خصم 10% لمدة أسبوع',  desc: 'على جميع طلباتك لمدة 7 أيام',      type: 'discount_percent', value: 10 },
    { pts: 1000, icon: '👑', reward: 'عضوية Gold سنة كاملة', desc: 'أعلى مرتبة — مزايا حصرية للأبد',   type: 'manual',           value: 0 },
];

let _rwSteps   = [];   // working copy of the ladder, edited in-memory
let _rwStepIdx = 0;    // unique row counter

async function renderRewards() {
    const el = document.getElementById('rewards-content');
    if (!el) return;

    el.innerHTML = `
        <div class="settings-section">
            <div class="settings-section-title">🪜 سلم نقاط الولاء</div>
            <div class="setting-row setting-row--col" style="padding:14px 16px;">
                <div>
                    <div class="setting-label">درجات السلم</div>
                    <div class="setting-sub">كل درجة = عتبة نقاط ومكافأتها. عند بلوغ العميل العتبة، تُمنح المكافأة تلقائياً لطلبه التالي مرة واحدة.</div>
                </div>
                <div style="width:100%;display:flex;flex-direction:column;gap:10px;margin-top:6px;" id="rw-steps-list"></div>
                <button onclick="rwAddStep()"
                        style="margin-top:12px;width:100%;padding:10px;background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:var(--radius-md);font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.85rem;">
                    + إضافة درجة جديدة
                </button>
            </div>
            <div class="setting-row" style="border-top:1px solid var(--border);">
                <div>
                    <div class="setting-label">حفظ السلم</div>
                    <div class="setting-sub">يحفظ كل الدرجات ويرتبها تلقائياً حسب النقاط</div>
                </div>
                <button onclick="rwSave()"
                        style="padding:10px 24px;background:var(--green);color:#fff;border:none;border-radius:var(--radius-md);font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.85rem;">
                    💾 حفظ السلم
                </button>
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">👁 معاينة — كما يراها العميل</div>
            <div id="rw-preview" style="padding:16px;display:flex;flex-direction:column;gap:10px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">📬 صندوق المكافآت اليدوية</div>
            <div class="setting-row setting-row--col" style="padding:14px 16px;">
                <div>
                    <div class="setting-label">طلبات تحتاج تنفيذ يدوي</div>
                    <div class="setting-sub">عملاء بلغوا عتبة "مكافأة يدوية" (هدية، وجبة، عضوية...) — نفّذ المكافأة ثم اضغط "تم التنفيذ"</div>
                </div>
                <div id="rw-inbox-list" style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:6px;">
                    <div style="text-align:center;color:var(--gray);font-size:0.78rem;padding:14px;">جارٍ التحميل…</div>
                </div>
            </div>
        </div>
    `;

    await rwLoad();
    await rwLoadInbox();
}

/* ── Build one editable step row ─────────────────────────────── */
function rwStepRowHTML(step, idx) {
    const typeOpts = REWARD_TYPES.map(t =>
        `<option value="${t.id}" ${step.type === t.id ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    const typeMeta = REWARD_TYPES.find(t => t.id === step.type) || REWARD_TYPES[0];
    const valueDisplay = typeMeta.hasValue ? '' : 'display:none;';

    return `
    <div class="rw-step" id="rw-step-${idx}" draggable="true"
         style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px;position:relative;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="cursor:grab;color:var(--gray);font-size:1.1rem;line-height:1;padding-top:6px;flex-shrink:0;" title="اسحب لإعادة الترتيب">⠿</div>

            <div style="display:grid;grid-template-columns:90px 64px 1fr;gap:8px;flex:1;">
                <div>
                    <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">النقاط المطلوبة</label>
                    <input type="number" class="rw-pts" value="${step.pts}" min="1" step="10"
                           style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;box-sizing:border-box;text-align:center;">
                </div>
                <div>
                    <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">أيقونة</label>
                    <input type="text" class="rw-icon" value="${step.icon || ''}" maxlength="4"
                           style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-size:1.1rem;outline:none;box-sizing:border-box;text-align:center;">
                </div>
                <div>
                    <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">عنوان المكافأة</label>
                    <input type="text" class="rw-reward" value="${(step.reward || '').replace(/"/g,'&quot;')}" placeholder="مثال: توصيل مجاني"
                           style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-family:var(--font);font-size:0.85rem;outline:none;box-sizing:border-box;direction:rtl;">
                </div>
            </div>

            <button onclick="rwRemoveStep(${idx})"
                    style="background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.8rem;flex-shrink:0;">✕</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 200px 110px;gap:8px;margin-top:10px;">
            <div>
                <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">الوصف (يظهر للعميل)</label>
                <input type="text" class="rw-desc" value="${(step.desc || '').replace(/"/g,'&quot;')}" placeholder="مثال: طلب واحد بتوصيل مجاني"
                       style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-family:var(--font);font-size:0.78rem;outline:none;box-sizing:border-box;direction:rtl;">
            </div>
            <div>
                <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">نوع المكافأة (التطبيق التلقائي)</label>
                <select class="rw-type" onchange="rwTypeChanged(${idx})"
                        style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-family:var(--font);font-size:0.78rem;outline:none;box-sizing:border-box;direction:rtl;">
                    ${typeOpts}
                </select>
            </div>
            <div class="rw-value-wrap" style="${valueDisplay}">
                <label style="font-size:0.62rem;color:var(--gray);display:block;margin-bottom:3px;">القيمة (${typeMeta.unit})</label>
                <input type="number" class="rw-value" value="${step.value || 0}" min="0" step="${typeMeta.unit === '%' ? 1 : 0.5}"
                       style="width:100%;background:var(--surface3,#1e1e28);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;box-sizing:border-box;text-align:center;">
            </div>
        </div>
    </div>`;
}

function rwTypeChanged(idx) {
    const row = document.getElementById(`rw-step-${idx}`);
    if (!row) return;
    const typeId = row.querySelector('.rw-type').value;
    const meta    = REWARD_TYPES.find(t => t.id === typeId) || REWARD_TYPES[0];
    const wrap    = row.querySelector('.rw-value-wrap');
    const label   = wrap.querySelector('label');
    const input   = wrap.querySelector('.rw-value');
    if (meta.hasValue) {
        wrap.style.display = '';
        label.textContent  = `القيمة (${meta.unit})`;
        input.step = meta.unit === '%' ? 1 : 0.5;
    } else {
        wrap.style.display = 'none';
    }
    rwRenderPreview();
}

function rwAddStep() {
    const maxPts = _rwSteps.length ? Math.max(..._rwSteps.map(s => s.pts)) : 0;
    _rwSteps.push({ pts: maxPts + 100, icon: '🎁', reward: 'مكافأة جديدة', desc: '', type: 'manual', value: 0 });
    rwRenderList();
}

function rwRemoveStep(idx) {
    _rwSteps.splice(idx, 1);
    rwRenderList();
}

/* Read current values from the DOM back into _rwSteps */
function rwSyncFromDOM() {
    const rows = [...document.querySelectorAll('#rw-steps-list .rw-step')];
    _rwSteps = rows.map(row => ({
        pts:    parseInt(row.querySelector('.rw-pts').value)   || 0,
        icon:   row.querySelector('.rw-icon').value.trim()     || '🎁',
        reward: row.querySelector('.rw-reward').value.trim()   || 'مكافأة',
        desc:   row.querySelector('.rw-desc').value.trim(),
        type:   row.querySelector('.rw-type').value,
        value:  parseFloat(row.querySelector('.rw-value')?.value) || 0,
    }));
}

function rwRenderList() {
    const list = document.getElementById('rw-steps-list');
    if (!list) return;
    if (!_rwSteps.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--gray);font-size:0.8rem;padding:20px;">لا توجد درجات — اضغط "إضافة درجة جديدة"</div>`;
    } else {
        list.innerHTML = _rwSteps.map((s, i) => rwStepRowHTML(s, i)).join('');
    }
    rwWireDragReorder();
    rwRenderPreview();
}

/* ── Drag-and-drop reordering of ladder steps ──────────────── */
let _rwDragEl = null;
function rwWireDragReorder() {
    const list = document.getElementById('rw-steps-list');
    if (!list) return;
    list.querySelectorAll('.rw-step').forEach(row => {
        row.addEventListener('dragstart', () => {
            _rwDragEl = row;
            row.style.opacity = '0.4';
        });
        row.addEventListener('dragend', () => {
            row.style.opacity = '';
            _rwDragEl = null;
            // Persist the new DOM order and refresh the live preview
            rwRenderPreview();
        });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            if (!_rwDragEl || _rwDragEl === row || row.parentElement !== list || _rwDragEl.parentElement !== list) return;
            const rows   = [...list.children];
            const fromIdx = rows.indexOf(_rwDragEl);
            const toIdx   = rows.indexOf(row);
            if (fromIdx === -1 || toIdx === -1) return;
            if (fromIdx < toIdx) {
                row.after(_rwDragEl);
            } else {
                row.before(_rwDragEl);
            }
        });
        row.addEventListener('drop', e => e.preventDefault());
    });
}

/* ── Live preview matching the customer-facing loyalty ladder ── */
function rwRenderPreview() {
    rwSyncFromDOM();
    const wrap = document.getElementById('rw-preview');
    if (!wrap) return;
    if (!_rwSteps.length) {
        wrap.innerHTML = `<div style="text-align:center;color:var(--gray);font-size:0.8rem;">أضف درجات للسلم لمعاينتها</div>`;
        return;
    }
    const sorted = [...rwSyncedSteps()].sort((a,b) => a.pts - b.pts);
    wrap.innerHTML = sorted.slice().reverse().map(s => `
        <div style="display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
            <div style="text-align:center;min-width:42px;">
                <div style="font-family:var(--mono);font-weight:800;color:var(--orange);font-size:0.95rem;">${s.pts}</div>
                <div style="font-size:0.58rem;color:var(--gray);">نقطة</div>
            </div>
            <div style="font-size:1.6rem;line-height:1;">${s.icon}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:700;color:var(--white);">${s.reward}</div>
                <div style="font-size:0.7rem;color:var(--gray-light);margin-top:2px;">${s.desc || ''}</div>
            </div>
            <div style="font-size:0.65rem;font-weight:800;color:var(--gray-light);background:var(--surface3,#1e1e28);border-radius:50px;padding:3px 10px;flex-shrink:0;">${REWARD_TYPE_LABELS[s.type] || s.type}</div>
        </div>
    `).join('');
}

function rwSyncedSteps() {
    rwSyncFromDOM();
    return _rwSteps;
}

/* ── Save / Load ────────────────────────────────────────────── */
async function rwSave() {
    rwSyncFromDOM();
    if (!_rwSteps.length) { toast('أضف درجة واحدة على الأقل', true); return; }
    for (const s of _rwSteps) {
        if (!s.pts || s.pts <= 0) { toast('تحقق من قيم النقاط — يجب أن تكون أكبر من صفر', true); return; }
        if (!s.reward) { toast('كل درجة تحتاج عنوان مكافأة', true); return; }
    }
    // Sort by points ascending, dedupe identical thresholds
    const sorted = [...new Map(_rwSteps.sort((a,b)=>a.pts-b.pts).map(s => [s.pts, s])).values()];
    try {
        await fbSet('settings/loyaltyRewards', sorted);
        _rwSteps = sorted;
        rwRenderList();
        toast('💾 تم حفظ سلم المكافآت بنجاح');
    } catch (e) { toast('فشل الحفظ', true); }
}

async function rwLoad() {
    let rewards = await fbGet('settings/loyaltyRewards').catch(() => null);
    if (!Array.isArray(rewards) || !rewards.length) {
        rewards = DEFAULT_LOYALTY_REWARDS;
    }
    _rwSteps = rewards.map(r => ({
        pts: r.pts, icon: r.icon || '🎁', reward: r.reward || '',
        desc: r.desc || '', type: r.type || 'manual', value: r.value || 0,
    })).sort((a,b) => a.pts - b.pts);
    rwRenderList();
}

/* ── Manual rewards inbox ──────────────────────────────────────
   Scans /users/{uid}/rewardQueue for entries with type === 'manual'.
   Admin marks them fulfilled, which removes them from the queue. ── */
async function rwLoadInbox() {
    const box = document.getElementById('rw-inbox-list');
    if (!box) return;
    try {
        const users = await fbGet('users').catch(() => null);
        if (!users) { box.innerHTML = `<div style="text-align:center;color:var(--gray);font-size:0.78rem;padding:14px;">لا يوجد عملاء</div>`; return; }

        const entries = [];
        Object.entries(users).forEach(([uid, u]) => {
            const queue = Array.isArray(u?.rewardQueue) ? u.rewardQueue : [];
            queue.forEach((item, idx) => {
                if (item && item.type === 'manual') {
                    entries.push({ uid, idx, item, userName: u.displayName || u.username || u.phone || uid.slice(0,8), userPhone: u.phone || u.mobile || '' });
                }
            });
        });

        if (!entries.length) {
            box.innerHTML = `<div style="text-align:center;color:var(--gray);font-size:0.78rem;padding:14px;">لا توجد مكافآت يدوية معلّقة 🎉</div>`;
            return;
        }

        box.innerHTML = entries.map(function(e) {
            var ph = (e.userPhone||'').replace(/[^0-9]/g,'');
            var waPh = ph?(ph.indexOf('961')===0?ph:'961'+ph.replace(/^0/,'')): '';
            var waTxt = 'مرحبا ' + e.userName
                + '!\nلديك مكافأة: ' + (e.item.reward||'مكافأة')
                + '\n' + (e.item.desc?'تفاصيل: '+e.item.desc+'\n':'')
                + 'سيتواصل معك فريقنا قريبا';
            var waLink = waPh?'https://wa.me/'+waPh+'?text='+encodeURIComponent(waTxt):'';
            var html = '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;">';
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
            html += '<span style="font-size:1.8rem;">'+(e.item.icon||'🎁')+'</span>';
            html += '<div style="flex:1;"><div style="font-size:0.88rem;font-weight:800;color:var(--white);">'+(e.item.reward||'مكافأة')+'</div>';
            if(e.item.desc) html += '<div style="font-size:0.7rem;color:var(--gray);margin-top:2px;">'+e.item.desc+'</div>';
            html += '</div><span style="font-size:0.65rem;font-weight:800;color:var(--orange);background:rgba(255,92,0,0.1);padding:3px 8px;border-radius:20px;">'+e.item.pts+' نقطة</span></div>';
            html += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:0.75rem;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">';
            html += '<span style="font-weight:800;color:var(--white);">&#128100; '+e.userName+'</span>';
            html += e.userPhone ? '<span style="color:var(--gray);font-family:var(--mono);">&#128222; '+e.userPhone+'</span>' : '<span style="color:var(--red);">&#9888; لا يوجد رقم</span>';
            html += '</div>';
            html += '<div style="display:flex;gap:8px;">';
            html += waLink ? '<a href="'+waLink+'" target="_blank" rel="noopener" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;padding:8px;font-size:0.75rem;font-weight:800;">&#128172; تواصل</a>' : '<div style="flex:1;text-align:center;padding:8px;font-size:0.72rem;color:var(--gray);background:var(--surface);border:1px solid var(--border);border-radius:8px;">لا يوجد رقم</div>';
            html += '<button onclick="rwFulfill(\'' + e.uid + '\', ' + e.idx + ')" style="flex:1;padding:8px;background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.3);border-radius:8px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.75rem;">✓ تم التنفيذ</button>';
            html += '</div></div>';
            return html;
        }).join('');
    } catch (e) {
        box.innerHTML = `<div style="text-align:center;color:var(--red);font-size:0.78rem;padding:14px;">فشل تحميل الصندوق</div>`;
    }
}

async function rwFulfill(uid, idx) {
    try {
        const queue = await fbGet(`users/${uid}/rewardQueue`).catch(() => null);
        if (!Array.isArray(queue)) { toast('تعذر العثور على المكافأة', true); return; }
        queue.splice(idx, 1);
        await fbSet(`users/${uid}/rewardQueue`, queue);
        toast('✓ تم تعليم المكافأة كمنفّذة');
        rwLoadInbox();
    } catch (e) { toast('فشل التحديث', true); }
}

async function setMaxOrders(val) {
    const max = parseInt(val);
    if (isNaN(max) || max < 1) { toast('قيمة غير صالحة', true); return; }
    try {
        await fbSet('settings/orders/maxPerDay', max);
        toast(`✅ تم تحديث الحد اليومي: ${max} طلبات`);
    } catch(e) { toast('فشل تحديث الحد اليومي', true); }
}

document.getElementById('adm-login-btn').addEventListener('click', doLogin);
document.getElementById('adm-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('adm-user').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// Topbar user button → logout confirm
document.getElementById('topbar-user-btn').addEventListener('click', () => {
    showConfirm({
        title: 'تسجيل الخروج',
        msg: `هل تريد تسجيل الخروج من حساب <b>${currentAdmin?.username}</b>؟`,
        type: 'warning', icon: '🚪',
        okLabel: 'خروج', cancelLabel: 'إلغاء'
    }).then(ok => { if (ok) doLogout(); });
});

// Drivers refresh
document.getElementById('drivers-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderDrivers(); toast('✅ تم تحديث السائقين');
});

// Driver filter pills
document.querySelectorAll('[data-driver-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-driver-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        driverFilter = btn.dataset.driverFilter;
        renderDrivers();
    });
});

// Show/hide inactive drivers switch
document.getElementById('toggle-show-inactive-drivers')?.addEventListener('change', (e) => {
    showInactiveDrivers = e.target.checked;
    renderDrivers();
});

// Driver search
document.getElementById('drivers-search').addEventListener('input', e => {
    driverSearch = e.target.value.trim();
    renderDrivers();
});

// Customers refresh
document.getElementById('customers-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderCustomers(); toast('✅ تم تحديث العملاء');
});

// Customer filter pills
document.querySelectorAll('[data-cust-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-cust-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        customerFilter = btn.dataset.custFilter;
        renderCustomers();
    });
});

// Customer search
document.getElementById('customers-search').addEventListener('input', e => {
    customerSearch = e.target.value.trim();
    renderCustomers();
});

// Visitors refresh
document.getElementById('visitors-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderVisitors(); toast('✅ تم تحديث الزوار');
});

// Visitors export to Excel
document.getElementById('visitors-export-btn').addEventListener('click', exportVisitorsToExcel);

// Visitors filter pills
document.querySelectorAll('[data-vis-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-vis-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        visitorFilter = btn.dataset.visFilter;
        renderVisitors();
    });
});

// Visitors search
document.getElementById('visitors-search').addEventListener('input', e => {
    visitorSearch = e.target.value.trim();
    renderVisitors();
});

// Stores refresh
document.getElementById('stores-refresh-btn').addEventListener('click', async () => {
    await loadAllData(); renderStores(); toast('✅ تم تحديث المتاجر');
});

// Stores filter pills — handled dynamically by renderAdminFilterBar()

// Stores search
document.getElementById('stores-search').addEventListener('input', e => {
    storeSearch = e.target.value.trim();
    renderStores();
});

// Hide disabled stores toggle
const storesHideDisabledToggle = document.getElementById('stores-hide-disabled-toggle');
storesHideDisabledToggle.checked = hideDisabledStores;
storesHideDisabledToggle.addEventListener('change', e => {
    hideDisabledStores = e.target.checked;
    localStorage.setItem('delivo_hide_disabled_stores', hideDisabledStores ? '1' : '0');
    renderStores();
});

// Hide inactive hero backgrounds toggle (checkbox shows the OPPOSITE
// of hideInactiveHeroBg — checked means "hide them")
const herobgHideInactiveToggle = document.getElementById('herobg-hide-inactive-toggle');
herobgHideInactiveToggle.checked = hideInactiveHeroBg;
herobgHideInactiveToggle.addEventListener('change', e => {
    hideInactiveHeroBg = e.target.checked;
    localStorage.setItem('delivo_show_inactive_herobg', hideInactiveHeroBg ? '0' : '1');
    renderHeroBgAdmin();
});

// Map refresh
