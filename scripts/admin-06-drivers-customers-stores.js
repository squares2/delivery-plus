function openDriverEditModal(driver) {
    const isNew = !driver;
    document.getElementById('driver-modal-title').innerHTML = isNew
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة سائق جديد`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> تعديل بيانات السائق`;
    document.getElementById('driver-edit-save').textContent = isNew ? '➕ إضافة السائق' : '💾 حفظ التغييرات';

    document.getElementById('driver-edit-name').value     = driver?.owner || '';
    document.getElementById('driver-edit-username').value = driver?.username || '';
    document.getElementById('driver-edit-phone').value    = (driver?.phone || '').replace(/^\+?961/, '');
    document.getElementById('driver-edit-password').value = '';
    document.getElementById('driver-edit-password').type  = 'password';
    document.getElementById('driver-edit-key').value      = driver?._key ?? 'NEW';
    document.getElementById('driver-modal-error').style.display = 'none';
    // Show current password hint
    const pwdWrap = document.getElementById('driver-pwd-current-wrap');
    if (pwdWrap) {
        pwdWrap.innerHTML = driver?.password
            ? `— كلمة المرور الحالية: <code style="color:var(--orange);background:var(--surface3);padding:1px 5px;border-radius:4px;font-family:monospace;">${driver.password}</code>`
            : '';
    }

    // Pre-populate document images
    _admDrvIdFile  = null;
    _admDrvLicFile = null;
    _admDrvIdRemoved  = false;
    _admDrvLicRemoved = false;
    _admSetDocPreview('id',  driver?.idImage  || null);
    _admSetDocPreview('lic', driver?.licenseImage || null);
    document.getElementById('adm-drv-doc-status').style.display = 'none';
    // Wire file inputs (reset listeners by cloning)
    ['adm-drv-id-file', 'adm-drv-lic-file'].forEach(fid => {
        const old = document.getElementById(fid);
        const neo = old.cloneNode(true);
        old.parentNode.replaceChild(neo, old);
    });
    document.getElementById('adm-drv-id-file').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        _admDrvIdFile = f; _admDrvIdRemoved = false;
        _admSetDocPreview('id', URL.createObjectURL(f), true);
    });
    document.getElementById('adm-drv-lic-file').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        _admDrvLicFile = f; _admDrvLicRemoved = false;
        _admSetDocPreview('lic', URL.createObjectURL(f), true);
    });

    document.getElementById('modal-driver-edit').classList.add('open');
}

// State for admin doc editing
let _admDrvIdFile  = null, _admDrvLicFile  = null;
let _admDrvIdRemoved = false, _admDrvLicRemoved = false;
let _admDrvCurrentIdUrl = null, _admDrvCurrentLicUrl = null;

function _admSetDocPreview(type, url, isNew) {
    const prefix   = type === 'id' ? 'adm-drv-id' : 'adm-drv-lic';
    const preview  = document.getElementById(prefix + '-preview');
    const img      = document.getElementById(prefix + '-img');
    const label    = document.getElementById(prefix + '-label');
    const txtSpan  = document.getElementById(prefix + '-upload-text');
    const removeBtn = document.getElementById(prefix + '-remove');

    if (type === 'id')  _admDrvCurrentIdUrl  = url;
    else                _admDrvCurrentLicUrl = url;

    if (url) {
        if (img) { img.src = url; img.onclick = () => window.open(url, '_blank'); }
        if (preview) preview.style.display = 'block';
        if (label)   label.classList.add('has-file');
        if (txtSpan) txtSpan.textContent = isNew ? '✓ تم اختيار صورة جديدة' : '🔄 تغيير الصورة';
        if (removeBtn) removeBtn.onclick = () => {
            if (type === 'id')  { _admDrvIdFile = null;  _admDrvIdRemoved  = true; }
            else                { _admDrvLicFile = null;  _admDrvLicRemoved = true; }
            _admSetDocPreview(type, null);
        };
    } else {
        if (img) img.src = '';
        if (preview) preview.style.display = 'none';
        if (label)   label.classList.remove('has-file');
        if (txtSpan) txtSpan.textContent = type === 'id' ? '➕ رفع صورة هوية' : '➕ رفع رخصة قيادة';
    }
}

// Upload helper for admin panel — uses Firebase Storage REST API
// (admin.html has no Firebase SDK, everything goes through REST)
async function _admUploadDriverDoc(file, driverKey, docName) {
    const ext     = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path    = encodeURIComponent(`driverDocs/${driverKey}/${docName}.${ext}`);
    const bucket  = 'deliveryonline-300f7.firebasestorage.app';
    const token   = await getFsToken();   // reuse the Firestore auth token
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${path}`;
    const mimeType  = file.type || 'image/jpeg';

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': mimeType },
        body: file,
    });
    if (!res.ok) { const e = await res.text(); throw new Error('Storage upload failed: ' + e); }
    const data = await res.json();
    // Build the download URL with the media token
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${path}?alt=media&token=${data.downloadTokens}`;
}

document.getElementById('driver-edit-cancel').addEventListener('click', () => {
    document.getElementById('modal-driver-edit').classList.remove('open');
});
document.getElementById('modal-driver-edit').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// Password visibility toggle
document.getElementById('driver-pwd-toggle').addEventListener('click', () => {
    const inp = document.getElementById('driver-edit-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
});

document.getElementById('driver-edit-save').addEventListener('click', async () => {
    const saveBtn  = document.getElementById('driver-edit-save');
    const errorEl  = document.getElementById('driver-modal-error');
    const name     = document.getElementById('driver-edit-name').value.trim();
    const username = document.getElementById('driver-edit-username').value.trim().toLowerCase();
    const phone    = document.getElementById('driver-edit-phone').value.trim();
    const password = document.getElementById('driver-edit-password').value;
    const key      = document.getElementById('driver-edit-key').value;
    const isNew    = key === '' || key === 'NEW';

    errorEl.style.display = 'none';

    if (!name)     { errorEl.textContent = '⚠️ الاسم الظاهر مطلوب'; errorEl.style.display = 'block'; return; }
    if (!username) { errorEl.textContent = '⚠️ اسم المستخدم مطلوب'; errorEl.style.display = 'block'; return; }
    if (isNew && !password) { errorEl.textContent = '⚠️ كلمة المرور مطلوبة لسائق جديد'; errorEl.style.display = 'block'; return; }
    if (password && password.length < 8) { errorEl.textContent = '⚠️ كلمة المرور يجب أن تكون 8 أحرف على الأقل'; errorEl.style.display = 'block'; return; }

    // Check username uniqueness (skip self when editing)
    const duplicate = allDrivers.find(d => d && d.username === username && d._key !== key);
    if (duplicate) { errorEl.textContent = '⚠️ اسم المستخدم مستخدم من قبل سائق آخر'; errorEl.style.display = 'block'; return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'جاري الحفظ…';

    try {
        const phoneFormatted = phone ? '+961' + phone.replace(/^0/, '') : '';

        // Handle document image uploads/removals
        const docUpdates = {};
        const statusEl   = document.getElementById('adm-drv-doc-status');
        const hasDocs    = _admDrvIdFile || _admDrvLicFile || _admDrvIdRemoved || _admDrvLicRemoved;
        if (hasDocs && !isNew) {
            if (statusEl) { statusEl.textContent = 'جاري رفع الوثائق…'; statusEl.style.display = 'block'; }
            if (_admDrvIdFile) {
                try { docUpdates.idImage = await _admUploadDriverDoc(_admDrvIdFile, key, 'id'); }
                catch(e) { console.error('[Admin] ID upload failed:', e); }
            } else if (_admDrvIdRemoved) {
                docUpdates.idImage = null;
            }
            if (_admDrvLicFile) {
                try { docUpdates.licenseImage = await _admUploadDriverDoc(_admDrvLicFile, key, 'license'); }
                catch(e) { console.error('[Admin] License upload failed:', e); }
            } else if (_admDrvLicRemoved) {
                docUpdates.licenseImage = null;
            }
            if (statusEl) statusEl.style.display = 'none';
        }

        if (isNew) {
            const newDriver = {
                owner    : name,
                username : username,
                password : password,
                phone    : phoneFormatted,
                status   : 'offline',
            };
            // Always use a proper Firebase auto-key. Appending into a rebuilt
            // array here used to blow away every other driver's real key
            // whenever a legacy numeric-indexed driver existed — breaking
            // order.driverid links, driverNotifications, and login sessions.
            await fbPush('drivers', newDriver);
            toast('✅ تمت إضافة السائق بنجاح');
        } else {
            // Patch existing driver fields
            const updates = { owner: name, username: username, phone: phoneFormatted };
            if (password) updates.password = password;
            Object.assign(updates, docUpdates);
            await fbUpdate(`drivers/${key}`, updates);
            toast('✅ تم حفظ التغييرات بنجاح');
        }

        document.getElementById('modal-driver-edit').classList.remove('open');
        await loadAllData();
        renderDrivers();
    } catch (err) {
        errorEl.textContent = '❌ حدث خطأ أثناء الحفظ: ' + err.message;
        errorEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = key ? '💾 حفظ التغييرات' : '➕ إضافة السائق';
    }
});

async function deleteDriver(driver) {
    const name = driver.owner || driver.username || 'هذا السائق';
    const _confirmDrv = await showConfirm({
        title: `حذف السائق`,
        msg: `هل تريد حذف السائق <b>${name}</b> بشكل نهائي؟<br><span style="color:var(--red)">لا يمكن التراجع عن هذا الإجراء.</span>`,
        type: 'danger', icon: '🗑',
        okLabel: 'حذف السائق', cancelLabel: 'إلغاء'
    });
    if (!_confirmDrv) return;
    try {
        // Firebase REST DELETE works for both auto-keys and numeric array indices
        const r = await fetch(`${RTDB}/drivers/${driver._key}.json`, { method: 'DELETE' });
        if (!r.ok) throw new Error(`RTDB DELETE ${r.status}`);
        // Only compact into a fresh numeric array when EVERY remaining driver is
        // still numeric-keyed. If the collection has a mix of numeric and real
        // Firebase keys (push IDs), leave it alone — rewriting it as an array
        // would strip those drivers' real keys and break order.driverid links,
        // driverNotifications, and active login sessions for every other driver.
        if (driver._isNumeric) {
            const current = await fbGet('drivers');
            if (current) {
                const entries = Array.isArray(current)
                    ? current.map((v, i) => [String(i), v])
                    : Object.entries(current);
                const validEntries = entries.filter(([, v]) => v && typeof v === 'object');
                const allNumeric   = validEntries.every(([k]) => /^\d+$/.test(k));
                if (allNumeric) {
                    // Require at least one identifying field so stray empty
                    // objects never get "cleaned" into a permanent ghost driver.
                    const clean = validEntries
                        .map(([, v]) => v)
                        .filter(v => v.owner || v.username || v.phone || v.deviceUUID);
                    await fbSet('drivers', clean.length ? clean : null);
                }
            }
        }
        toast(`🗑 تم حذف السائق "${name}"`);
        await loadAllData();
        renderDrivers();
    } catch (err) {
        toast('❌ خطأ في الحذف: ' + err.message, true);
    }
}

// ── Activate / Deactivate driver ───────────────────────────────
async function activateDriver(driver) {
    const name = driver.owner || driver.username || 'هذا السائق';
    const _confirm = await showConfirm({
        title: `تفعيل السائق`,
        msg: `هل تريد تفعيل السائق <b>${name}</b>؟<br>سيصبح قادراً على استلام طلبات التوصيل من هذه اللحظة.`,
        type: 'success', icon: '✅',
        okLabel: 'تفعيل السائق', cancelLabel: 'إلغاء'
    });
    if (!_confirm) return;
    try {
        await fbUpdate(`drivers/${driver._key}`, { active: true, pendingApproval: false });
        toast(`✅ تم تفعيل السائق "${name}" — يمكنه الآن استلام الطلبات`);
        await loadAllData();
        renderDrivers();
    } catch (err) {
        toast('❌ فشل التفعيل: ' + err.message, true);
    }
}

async function deactivateDriver(driver) {
    const name = driver.owner || driver.username || 'هذا السائق';
    const _confirm = await showConfirm({
        title: `إلغاء تفعيل السائق`,
        msg: `هل تريد إلغاء تفعيل السائق <b>${name}</b>؟<br>لن يتمكن من استلام طلبات جديدة حتى تتم إعادة تفعيله.`,
        type: 'warning', icon: '⏸',
        okLabel: 'إلغاء التفعيل', cancelLabel: 'تراجع'
    });
    if (!_confirm) return;
    try {
        await fbUpdate(`drivers/${driver._key}`, { active: false });
        toast(`⏸ تم إلغاء تفعيل السائق "${name}"`);
        await loadAllData();
        renderDrivers();
    } catch (err) {
        toast('❌ فشل التحديث: ' + err.message, true);
    }
}

// ── Simple full-screen image preview (for ID/license docs) ─────
function openImagePreview(src) {
    const stale = document.getElementById('img-preview-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'img-preview-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
    overlay.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,0.6);">`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
}



document.getElementById('add-driver-btn').addEventListener('click', () => openDriverEditModal(null));

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS PANEL
// ═══════════════════════════════════════════════════════════════
// =================================================================
// BLACKLIST
// RTDB: /blacklist/{uid|uuid} = { reason, by, at, type }
// =================================================================

function handleBlacklistAction(btn) {
    const action = btn.dataset.action;
    const uid    = btn.dataset.uid;
    const uuid   = btn.dataset.uuid;
    const name   = btn.dataset.name || '';

    if (action === 'unblock-uid') {
        showConfirm({
            title: 'رفع الحظر عن المستخدم',
            msg: `هل تريد رفع الحظر عن <b>${name}</b>؟<br>سيتمكن من استخدام Delivo مجددا.`,
            type: 'info', icon: '✅',
            okLabel: 'رفع الحظر', cancelLabel: 'إلغاء'
        }).then(async ok => {
            if (!ok) return;
            await fbSet(`blacklist/${uid}`, null);
            delete allBlacklist[uid];
            showNotif('✅ تم رفع الحظر', `المستخدم ${name} مفعل مجددا`, 'success');
            renderCustomers();
        });
        return;
    }

    if (action === 'unblock-uuid') {
        showConfirm({
            title: 'رفع حظر الجهاز',
            msg: `هل تريد رفع الحظر عن هذا الجهاز (UUID)؟<br>جميع الحسابات عليه ستعود للعمل.`,
            type: 'info', icon: '✅',
            okLabel: 'رفع حظر الجهاز', cancelLabel: 'إلغاء'
        }).then(async ok => {
            if (!ok) return;
            await fbSet(`blacklist/${uuid}`, null);
            delete allBlacklist[uuid];
            showNotif('✅ تم رفع حظر الجهاز', 'مفعل مجددا', 'success');
            renderCustomers();
        });
        return;
    }

    // block-uid or block-uuid -> show reason modal
    showBlacklistReasonModal({ uid, uuid, name, action });
}

function showBlacklistReasonModal({ uid, uuid, name, action }) {
    const overlay = document.getElementById('bl-reason-overlay');
    const titleEl = document.getElementById('bl-reason-title');
    const subEl   = document.getElementById('bl-reason-sub');
    const input   = document.getElementById('bl-reason-input');
    const okBtn   = document.getElementById('bl-confirm-btn');
    const canBtn  = document.getElementById('bl-cancel-btn');

    titleEl.textContent = action === 'block-uuid'
        ? 'حظر الجهاز (UUID)'
        : `حظر المستخدم ${name}`;
    subEl.innerHTML = action === 'block-uuid'
        ? `جميع الحسابات على هذا الجهاز ستُحظر — <b style='color:var(--red)'>حظر كامل للجهاز</b>`
        : `سيتم حظر هذا الحساب ومنعه من الدخول إلى Delivo.`;
    input.value = '';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 100);

    const save = async () => {
        const reason = input.value.trim() || 'مخالفة سياسة الاستخدام';
        const entry  = { reason, by: currentAdmin?.username || 'admin', at: Date.now(), type: action === 'block-uuid' ? 'uuid' : 'uid' };
        const key    = action === 'block-uuid' ? uuid : uid;
        try {
            await fbSet(`blacklist/${key}`, entry);
            allBlacklist[key] = entry;
            cleanup();
            const label = action === 'block-uuid' ? 'الجهاز' : `مستخدم ${name}`;
            showNotif(`⛔ تم حظر ${label}`, reason, 'error');
            renderCustomers();
        } catch(e) {
            showNotif('خطأ في الحظر', e.message, 'error');
        }
    };
    const cleanup = () => {
        overlay.classList.remove('open');
        okBtn.removeEventListener('click', save);
        canBtn.removeEventListener('click', cleanup);
        overlay.removeEventListener('click', onBg);
    };
    const onBg = (e) => { if (e.target === overlay) cleanup(); };
    okBtn.addEventListener('click', save);
    canBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', onBg);
}

function renderCustomers() {
    // Preserve which UUID groups are currently expanded before wiping the table
    const _expandedUUIDs = new Set(
        [...document.querySelectorAll('tr[data-sub]')]
            .filter(r => r.style.display !== 'none')
            .map(r => r.dataset.sub)
    );

    const tbody   = document.getElementById('customers-tbody');
    const countEl = document.getElementById('customers-count-label');
    tbody.innerHTML = '';

    const bl = allBlacklist || {};  // { uid: {reason,by,at}, uuid: {...} }

    // Count orders per user
    const userOrders = {};
    Object.values(allOrders).forEach(o => {
        if (o.delivryplusid) userOrders[o.delivryplusid] = (userOrders[o.delivryplusid] || 0) + 1;
        else if (o.username) userOrders[o.username] = (userOrders[o.username] || 0) + 1;
    });

    const _top3NewUids = _getTop3RegisteredUids();

    let users = Object.entries(allUsers);
    const _allUserEntries = users; // unfiltered snapshot for the "متصل الآن" summary below

    if (customerFilter !== 'all') {
        if (customerFilter === 'blocked') {
            users = users.filter(([uid, u]) => bl[uid] || (u.deviceUUID && bl[u.deviceUUID]));
        } else if (customerFilter === 'active' || customerFilter === 'offline') {
            users = users.filter(([uid, u]) => {
                const isOnline = _isCustomerOnline(uid, u.username, u.deviceUUID);
                return customerFilter === 'active' ? isOnline : !isOnline;
            });
        } else {
            users = users.filter(([, u]) => (u.status || 'offline') === customerFilter);
        }
    }
    if (customerSearch) {
        const q = customerSearch.toLowerCase();
        users = users.filter(([, u]) =>
            (u.displayName || '').toLowerCase().includes(q) ||
            (u.fullname    || '').toLowerCase().includes(q) ||
            (u.username    || '').toLowerCase().includes(q) ||
            (u.phone       || '').includes(q) ||
            (u.deviceUUID  || '').toLowerCase().includes(q)
        );
    }

    const seenUUIDs = new Set();
    const rows = [];

    users.sort(([uidA, a], [uidB, b]) => {
        const onlineA = _isCustomerOnline(uidA, a.username, a.deviceUUID) ? 1 : 0;
        const onlineB = _isCustomerOnline(uidB, b.username, b.deviceUUID) ? 1 : 0;
        if (onlineA !== onlineB) return onlineB - onlineA; // online customers float to the top
        return _customerLastActive(uidB, b, b.username, b.deviceUUID) - _customerLastActive(uidA, a, a.username, a.deviceUUID);
    }).forEach(([uid, u]) => {
            const uuid  = u.deviceUUID;
            const peers = uuid ? (allDeviceGroups[uuid] || [u]) : [u];
            const key   = uuid || uid;
            if (seenUUIDs.has(key)) return;
            seenUUIDs.add(key);
            rows.push({ isGroup: peers.length > 1, uuid, users: peers, primary: u, uid });
         });

    countEl.textContent = `${rows.length} جهاز · ${users.length} حساب`;
    const onlineCustCount = _allUserEntries.filter(([uid, u]) => _isCustomerOnline(uid, u.username, u.deviceUUID)).length;
    const custSumOnlineEl = document.getElementById('cust-sum-online');
    if (custSumOnlineEl) custSumOnlineEl.textContent = onlineCustCount;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray);">\u0644\u0627 \u064a\u0648\u062c\u062f \u0639\u0645\u0644\u0627\u0621</td></tr>`;
        return;
    }

    rows.forEach(({ isGroup, uuid, users: peers, primary: u, uid }) => {
        const uuidBlocked = uuid && bl[uuid];
        const uidBlocked  = bl[uid];
        const anyBlocked  = uuidBlocked || uidBlocked || peers.some(p => bl[p._id]);

        if (isGroup) {
            const anyPeerOnline = peers.some(p => _isCustomerOnline(p._id, p.username, p.deviceUUID || uuid));
            const groupRow = document.createElement('tr');
            groupRow.className = 'ut-row--group-header' + (uuidBlocked ? ' blocked' : '') + (anyPeerOnline ? ' vis-row-online' : '');
            groupRow.style.cursor = 'pointer';
            groupRow.innerHTML = `
                <td colspan="9">
                    <div style="display:flex;align-items:center;gap:10px;padding:5px 2px;">
                        <div class="ut-group-count ${uuidBlocked?'blocked':''}">${peers.length}</div>
                        ${anyPeerOnline ? `<span class="vis-online-dot" title="أحد الحسابات على هذا الجهاز متصل الآن"></span>` : ''}
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <span class="ut-group-tag ${uuidBlocked?'blocked':''}">
                                    ${uuidBlocked?'🚫':'⚠️'} جهاز واحد · ${peers.length} حسابات
                                </span>
                                ${uuidBlocked ? `<span class="bl-uuid-badge">🛧 UUID محظور</span>` : ''}
                                ${peers.map(p => `<span style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);
                                    border-radius:50px;padding:1px 8px;font-size:0.65rem;font-weight:700;color:#f59e0b;">@${p.username||'—'}</span>`).join('')}
                            </div>
                            <div style="font-size:0.61rem;color:var(--gray);margin-top:3px;font-family:var(--mono);">
                                UUID: ${uuid ? uuid.slice(0,28)+'…' : '—'}
                            </div>
                            ${uuidBlocked ? `<div style="font-size:0.65rem;color:var(--red);margin-top:2px;">⛔ سبب: ${bl[uuid].reason||'—'}</div>` : ''}
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;">
                            ${uuid ? `<button class="uuid-bl-btn ${uuidBlocked?'unblock':''}"
                                data-uuid="${uuid}" data-action="${uuidBlocked?'unblock-uuid':'block-uuid'}">
                                ${uuidBlocked ? '✅ رفع الحظر' : '🛧 حظر UUID'}
                            </button>` : ''}
                            <span class="ut-group-arrow">▾ عرض</span>
                        </div>
                    </div>
                </td>`;

            const subRows = peers.map(p => {
                const pBlocked  = bl[p._id] || uuidBlocked;
                const initial   = (p.displayName||p.fullname||p.username||'?')[0].toUpperCase();
                const isActive  = _isCustomerOnline(p._id, p.username, p.deviceUUID || uuid);
                const _tsVal    = _customerLastActive(p._id, p, p.username, p.deviceUUID || uuid);
                const ts        = _tsVal ? new Date(_tsVal).toLocaleDateString('ar-LB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                const ordCount  = userOrders[p._id] || userOrders[p.username] || 0;
                const tr2       = document.createElement('tr');
                tr2.className   = 'ut-row--sub' + (pBlocked ? ' ut-row--blocked' : (isActive ? ' vis-row-online' : ''));
                tr2.style.display = 'none';
                tr2.dataset.sub = uuid;
                tr2.innerHTML = `
                    <td style="padding-right:24px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="ut-sub-dot ${pBlocked?'blocked':''}"></span>
                            <span class="ut-avatar-sm" style="background:rgba(251,191,36,0.1);color:#f59e0b;border-color:rgba(251,191,36,0.3);">${initial}</span>
                            <div>
                                <div class="ut-name" style="display:flex;align-items:center;gap:6px;">
                                    ${isActive ? `<span class="vis-online-dot" title="متصل الآن"></span>` : ''}
                                    ${p.displayName||p.fullname||'\u2014'}
                                    ${_top3NewUids.includes(p._id) ? _newRegBadgeHtml() : ''}
                                </div>
                                ${bl[p._id] ? `<div style="font-size:0.62rem;color:var(--red);">\u26d4 ${bl[p._id].reason||'\u0645\u062d\u0638\u0648\u0631'}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="font-family:var(--mono);color:var(--gray-light);">@${p.username||'\u2014'}</td>
                    <td class="ut-phone" dir="ltr">${formatPhone(p.phone)}</td>
                    <td class="ut-points" style="white-space:nowrap;">
                        <span>${p.points||0}</span>
                        <button class="cust-pts-btn" data-uid="${p._id}" data-pts="${p.points||0}" data-name="${p.displayName||p.username||''}"
                            title="\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0646\u0642\u0627\u0637"
                            style="background:none;border:none;cursor:pointer;color:var(--orange);font-size:0.75rem;margin-right:3px;opacity:0.7;padding:0 2px;">\u270f\ufe0f</button>
                    </td>
                    <td style="font-family:var(--mono);font-size:0.72rem;color:var(--gray-light);">${ordCount}</td>
                    <td><span class="ut-status ${pBlocked?'blocked':(isActive?'active':'offline')}">${pBlocked?'\u26d4 \u0645\u062d\u0638\u0648\u0631':(isActive?'\u0646\u0634\u0637':'\u063a\u064a\u0631 \u0646\u0634\u0637')}</span></td>
                    <td style="font-size:0.7rem;color:var(--gray);">${ts}</td>
                    <td>${(()=>{
                        const _loc2=p.location;
                        const _lat2=parseFloat(_loc2?.lat??_loc2?.latitude??p.lat??p.latitude??NaN);
                        const _lng2=parseFloat(_loc2?.lng??_loc2?.longitude??p.lng??p.longitude??NaN);
                        const _hasLoc2 = _lat2 && _lng2 && !isNaN(_lat2) && !isNaN(_lng2);
                        const _approx2 = _hasLoc2 && p.locationSource === 'auto-order';
                        const _ipApprox2 = _hasLoc2 && p.locationSource === 'ip-approx';
                        return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
                            ${_hasLoc2 ? `<button class="oc-action-btn cust-map-btn" style="font-size:0.68rem;padding:3px 8px;" data-lat="${_lat2}" data-lng="${_lng2}" data-cname="${p.displayName||p.username||''}">📍 خريطة</button>` : '<span style="font-size:0.7rem;color:var(--gray);">لا يوجد</span>'}
                            ${_approx2 ? `<span style="font-size:0.58rem;color:#f59e0b;white-space:nowrap;">🎯 تقريبي (طلب سابق)</span>` : ''}
                            ${_ipApprox2 ? `<span style="font-size:0.58rem;color:#3b82f6;white-space:nowrap;">📡 تقريبي (شبكة عند التسجيل)</span>` : ''}
                            <button class="cust-reposition-btn" style="font-size:0.6rem;padding:2px 7px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:6px;color:#3b82f6;cursor:pointer;font-family:inherit;white-space:nowrap;"
                                data-uid="${p._id}" data-name="${p.displayName||p.username||''}" data-lat="${_hasLoc2?_lat2:''}" data-lng="${_hasLoc2?_lng2:''}">
                                ${_hasLoc2 ? '✏️ تعديل' : '📍 تحديد'}
                            </button>
                        </div>`;
                    })()}</td>
                    <td>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            ${isGroup ? `<button class="cust-unmerge-btn"
                                data-uid="${p._id}" data-uuid="${uuid || ''}" data-name="${p.displayName||p.username||''}"
                                style="width:100%;padding:4px 8px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:var(--radius-sm);color:#a78bfa;font-family:inherit;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;"
                                title="إعطاء هذا الحساب معرّف جهاز جديد ومستقل">
                                🔓 فصل عن الجهاز
                            </button>` : ''}
                            <button class="uuid-bl-btn ${bl[p._id]?'unblock':''}"
                                data-uid="${p._id}" data-name="${p.displayName||p.username||''}"
                                data-action="${bl[p._id]?'unblock-uid':'block-uid'}" style="width:100%;">
                                ${bl[p._id] ? '\u2705 \u0631\u0641\u0639 \u0627\u0644\u062d\u0638\u0631' : '\ud83d\udea7 \u062d\u0638\u0631'}
                            </button>
                            ${p.registrationMethod !== 'phone-otp' ? `<button class="cust-resetpw-btn"
                                data-uid="${p._id}" data-username="${p.username||''}" data-name="${p.displayName||p.username||''}" data-phone="${p.phone||''}"
                                style="width:100%;padding:4px 8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:var(--radius-sm);color:#3b82f6;font-family:inherit;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                                🔑 إعادة تعيين كلمة المرور
                            </button>` : ''}
                            <button class="cust-delete-btn"
                                data-uid="${p._id}" data-username="${p.username||''}" data-name="${p.displayName||p.username||''}" data-phone="${p.phone||''}"
                                style="width:100%;padding:4px 8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:var(--red);font-family:inherit;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                                🗑 حذف الحساب
                            </button>
                        </div>
                    </td>`;
                tr2.querySelectorAll('.cust-map-btn').forEach(b => b.addEventListener('click', e => {
                    e.stopPropagation();
                    _flyToCustomer(parseFloat(b.dataset.lat), parseFloat(b.dataset.lng), b.dataset.cname);
                }));
                tr2.querySelector('.cust-reposition-btn')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    openCustomerLocationModal(btn.dataset.uid, btn.dataset.name, parseFloat(btn.dataset.lat)||null, parseFloat(btn.dataset.lng)||null);
                });
                tr2.querySelector('.cust-pts-btn')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    editUserPoints(btn.dataset.uid, parseInt(btn.dataset.pts)||0, btn.dataset.name);
                });
                tr2.querySelector('.cust-resetpw-btn')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    resetUserPassword(btn.dataset.uid, btn.dataset.username, btn.dataset.name, btn.dataset.phone);
                });
                tr2.querySelector('.cust-unmerge-btn')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    unmergeCustomerDevice(btn.dataset.uid, btn.dataset.uuid, btn.dataset.name);
                });
                return tr2;
            });

            // UUID block button
            groupRow.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); handleBlacklistAction(btn); });
            });

            // Restore expanded state if this UUID was open before the re-render
            let expanded = uuid ? _expandedUUIDs.has(uuid) : false;
            if (expanded) {
                subRows.forEach(r => r.style.display = '');
                const arrow = groupRow.querySelector('.ut-group-arrow');
                if (arrow) { arrow.textContent = '▴ إخفاء'; arrow.classList.add('expanded'); }
            }

            groupRow.addEventListener('click', () => {
                expanded = !expanded;
                subRows.forEach(r => r.style.display = expanded ? '' : 'none');
                const arrow = groupRow.querySelector('.ut-group-arrow');
                if (arrow) { arrow.textContent = expanded ? '▴ إخفاء' : '▾ عرض'; arrow.classList.toggle('expanded', expanded); }
            });

            subRows.forEach(r => {
                r.querySelectorAll('[data-action]').forEach(btn =>
                    btn.addEventListener('click', e => { e.stopPropagation(); handleBlacklistAction(btn); })
                );
                r.querySelectorAll('.cust-delete-btn').forEach(btn =>
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        deleteUserAccount(btn.dataset.uid, btn.dataset.username, btn.dataset.name, btn.dataset.phone);
                    })
                );
            });

            tbody.appendChild(groupRow);
            subRows.forEach(r => tbody.appendChild(r));

        } else {
            // Solo row
            const isBlocked = bl[uid] || (uuid && bl[uuid]);
            const initial   = (u.displayName||u.fullname||u.username||'?')[0].toUpperCase();
            const isActive  = _isCustomerOnline(uid, u.username, u.deviceUUID);
            const _tsVal    = _customerLastActive(uid, u, u.username, u.deviceUUID);
            const ts        = _tsVal ? new Date(_tsVal).toLocaleDateString('ar-LB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014';
            const ordCount  = userOrders[uid] || userOrders[u.username] || 0;
            const blEntry   = bl[uid] || (uuid && bl[uuid]);
            const tr        = document.createElement('tr');
            tr.className    = isBlocked ? 'ut-row--blocked' : (isActive ? 'vis-row-online' : '');
            tr.innerHTML = `
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="ut-avatar-sm" style="${isBlocked?'background:rgba(239,68,68,0.15);color:var(--red);border-color:rgba(239,68,68,0.3);':''}">${initial}</span>
                        <div>
                            <div class="ut-name" style="display:flex;align-items:center;gap:6px;">
                                ${isActive ? `<span class="vis-online-dot" title="متصل الآن"></span>` : ''}
                                ${u.displayName||u.fullname||'\u2014'}
                                ${_top3NewUids.includes(uid) ? _newRegBadgeHtml() : ''}
                            </div>
                            ${blEntry ? `<div style="font-size:0.62rem;color:var(--red);margin-top:1px;">\u26d4 ${blEntry.reason||'\u0645\u062d\u0638\u0648\u0631'}</div>` : ''}
                            <div style="font-size:0.6rem;color:var(--gray);margin-top:1px;font-family:var(--mono);display:flex;align-items:center;gap:3px;">
                                🔑 ${uuid ? `<span title="${uuid}">${uuid.slice(0,16)}…</span><button class="cust-uuid-copy" data-uuid="${uuid}" title="نسخ UUID" style="background:none;border:none;color:var(--gray);cursor:pointer;padding:0 2px;font-size:0.62rem;">&#9112;</button>` : '<span>—</span>'}
                            </div>
                        </div>
                    </div>
                </td>
                <td style="font-family:var(--mono);color:var(--gray-light);">@${u.username||'\u2014'}</td>
                <td class="ut-phone" dir="ltr">${formatPhone(u.phone)}</td>
                <td class="ut-points" style="white-space:nowrap;">
                    <span>${u.points||0}</span>
                    <button class="cust-pts-btn" data-uid="${uid}" data-pts="${u.points||0}" data-name="${u.displayName||u.username||''}"
                        title="\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0646\u0642\u0627\u0637"
                        style="background:none;border:none;cursor:pointer;color:var(--orange);font-size:0.75rem;margin-right:3px;opacity:0.7;padding:0 2px;">\u270f\ufe0f</button>
                </td>
                <td style="font-family:var(--mono);font-size:0.72rem;color:var(--gray-light);">${ordCount}</td>
                <td><span class="ut-status ${isBlocked?'blocked':(isActive?'active':'offline')}">${isBlocked?'\u26d4 \u0645\u062d\u0638\u0648\u0631':(isActive?'\u0646\u0634\u0637':'\u063a\u064a\u0631 \u0646\u0634\u0637')}</span></td>
                <td style="font-size:0.7rem;color:var(--gray);">${ts}</td>
                <td id="cust-loc-cell-${uid}">${(()=>{
                    const _loc=u.location;
                    const _lat=parseFloat(_loc?.lat??_loc?.latitude??u.lat??u.latitude??NaN);
                    const _lng=parseFloat(_loc?.lng??_loc?.longitude??u.lng??u.longitude??NaN);
                    const _hasLoc = _lat && _lng && !isNaN(_lat) && !isNaN(_lng);
                    const _approx = _hasLoc && u.locationSource === 'auto-order';
                    const _ipApprox = _hasLoc && u.locationSource === 'ip-approx';
                    return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;">
                        ${_hasLoc ? `<button class="oc-action-btn cust-map-btn" style="font-size:0.68rem;padding:3px 8px;" data-lat="${_lat}" data-lng="${_lng}" data-cname="${u.displayName||u.username||''}">📍 خريطة</button>` : '<span style="font-size:0.7rem;color:var(--gray);">لا يوجد</span>'}
                        ${_approx ? `<span style="font-size:0.58rem;color:#f59e0b;white-space:nowrap;">🎯 تقريبي (طلب سابق)</span>` : ''}
                        ${_ipApprox ? `<span style="font-size:0.58rem;color:#3b82f6;white-space:nowrap;">📡 تقريبي (شبكة عند التسجيل)</span>` : ''}
                        <button class="cust-reposition-btn" style="font-size:0.6rem;padding:2px 7px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:6px;color:#3b82f6;cursor:pointer;font-family:inherit;white-space:nowrap;"
                            data-uid="${uid}" data-name="${u.displayName||u.username||''}" data-lat="${_hasLoc?_lat:''}" data-lng="${_hasLoc?_lng:''}">
                            ${_hasLoc ? '✏️ تعديل' : '📍 تحديد'}
                        </button>
                    </div>`;
                })()}</td>
                <td>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <button class="uuid-bl-btn ${isBlocked?'unblock':''}"
                            data-uid="${uid}" data-name="${u.displayName||u.username||''}"
                            data-action="${isBlocked?'unblock-uid':'block-uid'}">
                            ${isBlocked ? '\u2705 \u0631\u0641\u0639 \u0627\u0644\u062d\u0638\u0631' : '\ud83d\udea7 \u062d\u0638\u0631'}
                        </button>
                        ${u.registrationMethod !== 'phone-otp' ? `<button class="cust-resetpw-btn"
                            data-uid="${uid}" data-username="${u.username||''}" data-name="${u.displayName||u.username||''}" data-phone="${u.phone||''}"
                            style="width:100%;padding:4px 8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:var(--radius-sm);color:#3b82f6;font-family:inherit;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                            🔑 إعادة تعيين كلمة المرور
                        </button>` : ''}
                        <button class="cust-delete-btn"
                            data-uid="${uid}" data-username="${u.username||''}" data-name="${u.displayName||u.username||''}" data-phone="${u.phone||''}"
                            style="width:100%;padding:4px 8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:var(--red);font-family:inherit;font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                            🗑 حذف الحساب
                        </button>
                    </div>
                </td>`;
            tr.querySelector('[data-action]').addEventListener('click', e => {
                e.stopPropagation();
                handleBlacklistAction(tr.querySelector('[data-action]'));
            });
            tr.querySelector('.cust-resetpw-btn')?.addEventListener('click', e => {
                e.stopPropagation();
                const btn = e.currentTarget;
                resetUserPassword(btn.dataset.uid, btn.dataset.username, btn.dataset.name, btn.dataset.phone);
            });
            tr.querySelector('.cust-delete-btn')?.addEventListener('click', e => {
                e.stopPropagation();
                const btn = e.currentTarget;
                deleteUserAccount(btn.dataset.uid, btn.dataset.username, btn.dataset.name, btn.dataset.phone);
            });
            tr.querySelector('.cust-pts-btn')?.addEventListener('click', e => {
                e.stopPropagation();
                const btn = e.currentTarget;
                editUserPoints(btn.dataset.uid, parseInt(btn.dataset.pts)||0, btn.dataset.name);
            });
            const _mapBtn = tr.querySelector('.cust-map-btn');
            if (_mapBtn) _mapBtn.addEventListener('click', e => {
                e.stopPropagation();
                _flyToCustomer(parseFloat(_mapBtn.dataset.lat), parseFloat(_mapBtn.dataset.lng), _mapBtn.dataset.cname);
            });
            tr.querySelector('.cust-reposition-btn')?.addEventListener('click', e => {
                e.stopPropagation();
                const btn = e.currentTarget;
                openCustomerLocationModal(btn.dataset.uid, btn.dataset.name, parseFloat(btn.dataset.lat)||null, parseFloat(btn.dataset.lng)||null);
            });
            tr.querySelector('.cust-uuid-copy')?.addEventListener('click', e => {
                e.stopPropagation();
                const btn = e.currentTarget;
                navigator.clipboard.writeText(btn.dataset.uuid).then(() => {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '✓';
                    setTimeout(() => { btn.innerHTML = orig; }, 1200);
                }).catch(() => toast('فشل النسخ'));
            });
            tbody.appendChild(tr);
        }
    });
}

// ── VISITORS — unregistered leads (settings/deviceLeads) ─────────────────
// Full name + phone captured by the first-launch modal before any real
// account exists. Lets admin see everyone who's ever landed on the site,
// contact them directly via WhatsApp, and track how many eventually
// convert into real customers (converted flips true in registerByPhone()).
// Safely resolves a visitor's createdAt into a comparable epoch number —
// handles the new server-timestamp epoch (number), older client-stamped
// ISO strings, and anything missing/malformed (falls back to 0 instead
// of NaN, which is what made sort() behave unpredictably for those rows).
function _visitorTimestamp(v) {
    if (!v || !v.createdAt) return 0;
    if (typeof v.createdAt === 'number') return v.createdAt;
    const t = new Date(v.createdAt).getTime();
    return isNaN(t) ? 0 : t;
}

// Most recent known visit — presence.js keeps deviceLeads/{uuid}/lastVisit
// fresh on every heartbeat while the visitor is on the site, so this is
// the true "last seen" moment and survives long after they disconnect
// (unlike the live presence session, which gets swept away ~45s after
// they leave). Falls back to createdAt (first-ever visit) for older
// records saved before this field existed.
function _visitorLastVisitTs(v) {
    if (v && v.lastVisit) {
        const t = typeof v.lastVisit === 'number' ? v.lastVisit : new Date(v.lastVisit).getTime();
        if (!isNaN(t)) return t;
    }
    return _visitorTimestamp(v);
}

// Cross-references a visitor's device UUID against the live presence
// sessions admin-presence.js keeps updated in window._delivoOnlineSessions
// (refreshed every ~8s via its own realtime listener/poll) to tell
// whether that visitor is on the site right now.
function _isVisitorOnline(uuid) {
    if (!uuid) return false;
    const sessions = window._delivoOnlineSessions || {};
    return Object.values(sessions).some(s => s && s.uuid === uuid);
}

// Best-known "last active" moment for sorting — the live session's
// lastSeen while the visitor is currently online (kept fresh by the 8s
// heartbeat), otherwise their persisted lastVisit (see _visitorLastVisitTs)
// so a visitor who just left still ranks by how recently they were here,
// not by when they first ever showed up.
function _visitorLastActive(uuid, v) {
    const sessions = window._delivoOnlineSessions || {};
    const session = Object.values(sessions).find(s => s && s.uuid === uuid);
    if (session && session.lastSeen) return session.lastSeen;
    return _visitorLastVisitTs(v);
}

function _visitorDeviceLabel(v) {
    // Records saved before device/OS capture was added have neither
    // field at all — showing those as "كمبيوتر" would be a guess
    // dressed up as data, so they get an explicit "unknown" instead.
    if (!v.device && !v.os) return '❔ غير معروف';
    const icon  = v.os === 'ios' ? '🍎' : v.os === 'android' ? '🤖' : (v.device === 'mobile' ? '📱' : '💻');
    const label = v.os === 'ios' ? 'iPhone' : v.os === 'android' ? 'أندرويد' : (v.device === 'mobile' ? 'موبايل' : 'كمبيوتر');
    return `${icon} ${label}`;
}

// A visitor's `converted` flag only ever gets set by registerByPhone()
// writing back to the SAME device UUID that recorded their original
// visit. If that UUID changed between visiting and signing up (cleared
// storage, a different browser/device, iOS Safari's storage clearing,
// etc.), the original lead is left behind forever showing "زائر فقط"
// even though that phone number now belongs to a real registered
// account. This cross-checks the visitor's phone against allUsers so
// the admin panel reflects reality regardless of which device/session
// they eventually registered from.
function _visitorMatchedPhone(v) {
    if (!v || !v.phone) return false;
    const digits = String(v.phone).replace(/\D/g, '');
    if (!digits) return false;
    return Object.values(allUsers || {}).some(u => u && String(u.phone || '').replace(/\D/g, '').endsWith(digits));
}
function _isVisitorConverted(v) {
    return !!(v && (v.converted || _visitorMatchedPhone(v)));
}

// Shared by renderVisitors() and exportVisitorsToExcel() so the exported
// file always matches exactly what's on screen — same active filter pill
// and search box, same sort order.
function _getFilteredVisitorEntries() {
    let entries = Object.entries(allVisitors || {});

    if (visitorFilter === 'pending')   entries = entries.filter(([, v]) => !_isVisitorConverted(v));
    if (visitorFilter === 'converted') entries = entries.filter(([, v]) => _isVisitorConverted(v));

    if (visitorSearch) {
        const q = visitorSearch.toLowerCase();
        entries = entries.filter(([uuid, v]) =>
            (v.fullName || '').toLowerCase().includes(q) ||
            (v.phone    || '').includes(q) ||
            uuid.toLowerCase().includes(q)
        );
    }

    // Online visitors always float to the top; within each group (online
    // / offline) the most recently active is shown first.
    entries.sort(([uuidA, a], [uuidB, b]) => {
        const onlineA = _isVisitorOnline(uuidA) ? 1 : 0;
        const onlineB = _isVisitorOnline(uuidB) ? 1 : 0;
        if (onlineA !== onlineB) return onlineB - onlineA;
        return _visitorLastActive(uuidB, b) - _visitorLastActive(uuidA, a);
    });
    return entries;
}

// Lightweight, dedicated auto-refresh for the Visitors panel — re-fetches
// only deviceLeads (small, single path) rather than the full loadAllData()
// sweep (orders/drivers/users/etc, which only reruns every 12s), so a
// visitor's updated lastVisit / converted status / a brand-new lead shows
// up here quickly and independently of the heavier main refresh cycle.
// No-ops entirely (no network call at all) unless the panel is actually open.
let _visitorsLiveTimer = null;
async function _refreshVisitorsLive() {
    if (!document.getElementById('panel-visitors')?.classList.contains('active')) return;
    try {
        const deviceLeads = await fbGet('deviceLeads').catch(() => null);
        allVisitors = deviceLeads || {};
        window.allVisitors = allVisitors;
    } catch (_) { /* keep showing the last known data on a failed fetch */ }
    renderVisitors();
}
function _startVisitorsLiveRefresh() {
    if (_visitorsLiveTimer) return;
    _visitorsLiveTimer = setInterval(_refreshVisitorsLive, 5000);
}

function renderVisitors() {
    const tbody   = document.getElementById('visitors-tbody');
    const countEl = document.getElementById('visitors-count-label');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allEntries = Object.entries(allVisitors || {});

    // Summary bar — always reflects the FULL set, regardless of active filter/search
    const total     = allEntries.length;
    const converted = allEntries.filter(([, v]) => _isVisitorConverted(v)).length;
    const pending   = total - converted;
    const online    = allEntries.filter(([uuid]) => _isVisitorOnline(uuid)).length;
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('vis-sum-total',     total);
    setTxt('vis-sum-pending',   pending);
    setTxt('vis-sum-converted', converted);
    setTxt('vis-sum-online',    online);

    const entries = _getFilteredVisitorEntries();
    const _top3NewUids = _getTop3RegisteredUids();

    if (countEl) countEl.textContent = `${entries.length} زائر`;

    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gray);">لا يوجد زوار</td></tr>`;
        return;
    }

    entries.forEach(([uuid, v]) => {
        const tr = document.createElement('tr');
        const waDigits = (v.phone || '').replace(/\D/g, '').replace(/^0/, '');
        const waLink   = waDigits ? `https://wa.me/961${waDigits}` : '';
        const ts       = _visitorLastVisitTs(v);
        const dateStr  = ts ? new Date(ts).toLocaleDateString('ar-LB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const isOnline = _isVisitorOnline(uuid);
        if (isOnline) tr.classList.add('vis-row-online');

        tr.innerHTML = `
            <td style="font-weight:700;">
                <span style="display:inline-flex;align-items:center;gap:7px;">
                    ${isOnline ? `<span class="vis-online-dot" title="متصل الآن"></span>` : ''}
                    ${v.fullName || '—'}
                    ${(v.converted && v.uid && _top3NewUids.includes(v.uid)) ? _newRegBadgeHtml() : ''}
                </span>
            </td>
            <td dir="ltr" style="text-align:left;">${formatPhone(v.phone)}</td>
            <td>${_visitorDeviceLabel(v)}</td>
            <td>
                <span class="vis-uuid-copy" data-uuid="${uuid}" title="نسخ UUID" style="cursor:pointer;font-family:var(--mono);font-size:0.7rem;color:var(--gray);background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 7px;white-space:nowrap;">
                    ${uuid.slice(0, 10)}… 📋
                </span>
            </td>
            <td style="font-size:0.78rem;color:var(--gray-light);white-space:nowrap;">${dateStr}</td>
            <td>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${isOnline ? `<span class="or-state-badge vis-online-badge">🟢 متصل الآن</span>` : ''}
                    ${_isVisitorConverted(v)
                        ? `<span class="or-state-badge" style="background:var(--green-glow);color:var(--green);">✅ عميل مسجّل</span>`
                        : `<span class="or-state-badge" style="background:rgba(245,158,11,0.15);color:var(--yellow);">⏳ زائر فقط</span>`}
                </div>
            </td>
            <td style="display:flex;gap:6px;">
                ${waLink ? `<a href="${waLink}" target="_blank" style="background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:800;text-decoration:none;white-space:nowrap;">💬 واتساب</a>` : ''}
                <button class="vis-delete-btn" title="حذف السجل نهائياً" style="background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:5px 8px;font-size:0.72rem;cursor:pointer;flex-shrink:0;">🗑</button>
            </td>
        `;

        tr.querySelector('.vis-uuid-copy')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            navigator.clipboard.writeText(uuid).then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '✓ تم النسخ';
                setTimeout(() => { btn.innerHTML = orig; }, 1200);
            }).catch(() => toast('فشل النسخ'));
        });

        tr.querySelector('.vis-delete-btn')?.addEventListener('click', async () => {
            const confirmed = await showConfirm({
                title: 'حذف سجل الزائر',
                msg: `هل تريد حذف بيانات <b>${v.fullName || 'هذا الزائر'}</b> نهائياً؟<br>لا يمكن التراجع عن هذا الإجراء.`,
                type: 'danger',
                icon: '🗑',
                okLabel: 'نعم، احذف',
                cancelLabel: 'إلغاء',
            });
            if (!confirmed) return;
            try {
                await fetch(`${RTDB}/deviceLeads/${uuid}.json`, { method: 'DELETE' });
                delete allVisitors[uuid];
                toast('🗑 تم حذف سجل الزائر');
                renderVisitors();
            } catch (e) { toast('فشل الحذف', true); }
        });

        tbody.appendChild(tr);
    });
}

// ── Export visitors table to a styled .xlsx file ─────────────────────────
// Exports exactly what's currently on screen (same filter pill + search box
// as _getFilteredVisitorEntries used by renderVisitors), not the full raw
// dataset, so what the admin sees is what they get in the file.
async function exportVisitorsToExcel() {
    const btn = document.getElementById('visitors-export-btn');
    if (!btn) return;
    const orig = btn.innerHTML;

    if (typeof ExcelJS === 'undefined') {
        toast('❌ مكتبة التصدير لم تُحمَّل بعد — تأكد من الاتصال بالإنترنت وحاول مجدداً', true);
        return;
    }

    const entries = _getFilteredVisitorEntries();
    if (!entries.length) { toast('لا يوجد بيانات لتصديرها', true); return; }

    btn.disabled = true;
    btn.innerHTML = '⏳ جاري التصدير...';

    try {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Delivo';
        wb.created = new Date();

        const ws = wb.addWorksheet('الزوار', {
            views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }],
        });

        ws.columns = [
            { width: 24 }, // الاسم الكامل
            { width: 18 }, // الهاتف
            { width: 14 }, // الجهاز
            { width: 24 }, // UUID
            { width: 20 }, // تاريخ الزيارة
            { width: 16 }, // الحالة
            { width: 14 }, // واتساب
        ];

        // ── Title band ──
        ws.mergeCells('A1:G1');
        const titleCell = ws.getCell('A1');
        titleCell.value = `تقرير الزوار — Delivo  (${entries.length} سجل)`;
        titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5C00' } };
        ws.getRow(1).height = 30;

        // ── Export-date subtitle ──
        ws.mergeCells('A2:G2');
        const dateCell = ws.getCell('A2');
        const filterLabel = visitorFilter === 'pending' ? 'لم يسجّلوا بعد' : visitorFilter === 'converted' ? 'أصبحوا عملاء' : 'الكل';
        dateCell.value = `تاريخ التصدير: ${new Date().toLocaleString('ar-LB')}   —   الفلتر: ${filterLabel}`;
        dateCell.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
        dateCell.alignment = { horizontal: 'center' };
        dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
        ws.getRow(2).height = 18;

        // ── Header row ──
        const headerRow = ws.getRow(3);
        headerRow.values = ['الاسم الكامل', 'الهاتف', 'الجهاز', 'UUID', 'آخر ظهور', 'الحالة', 'واتساب'];
        headerRow.eachCell(cell => {
            cell.font      = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1F2E' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border    = {
                top: { style: 'thin', color: { argb: 'FF444455' } }, left: { style: 'thin', color: { argb: 'FF444455' } },
                bottom: { style: 'thin', color: { argb: 'FF444455' } }, right: { style: 'thin', color: { argb: 'FF444455' } },
            };
        });
        headerRow.height = 22;

        // ── Data rows ──
        entries.forEach(([uuid, v], i) => {
            const ts       = _visitorLastVisitTs(v);
            const dateStr  = ts ? new Date(ts).toLocaleString('ar-LB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const waDigits = (v.phone || '').replace(/\D/g, '').replace(/^0/, '');
            const waLink   = waDigits ? `https://wa.me/961${waDigits}` : '';

            const row = ws.addRow([
                v.fullName || '—',
                formatPhone(v.phone) || '—',
                _visitorDeviceLabel(v),
                uuid,
                dateStr,
                _isVisitorConverted(v) ? '✅ عميل مسجّل' : '⏳ زائر فقط',
                '',
            ]);

            const zebra = i % 2 === 0 ? 'FFF7F7FA' : 'FFFFFFFF';
            row.eachCell((cell, col) => {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra } };
                cell.border    = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } }, left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }, right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                };
                if (col === 1) cell.font = { bold: true };
                if (col === 4) cell.font = { name: 'Consolas', size: 9, color: { argb: 'FF888888' } };
            });

            row.getCell(6).font = _isVisitorConverted(v)
                ? { bold: true, color: { argb: 'FF16A34A' } }
                : { bold: true, color: { argb: 'FFD97706' } };

            if (waLink) {
                const waCell = row.getCell(7);
                waCell.value = { text: '💬 واتساب', hyperlink: waLink };
                waCell.font  = { color: { argb: 'FF16A34A' }, underline: true, bold: true };
            }
        });

        ws.autoFilter = { from: 'A3', to: 'G3' };

        const buffer = await wb.xlsx.writeBuffer();
        const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href     = url;
        a.download = `Delivo-Visitors-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast(`✅ تم تصدير ${entries.length} سجل بنجاح`);
    } catch (e) {
        console.error(e);
        toast('❌ فشل التصدير', true);
    } finally {
        btn.disabled  = false;
        btn.innerHTML = orig;
    }
}


function _flyToCustomer(lat, lng, name) {
    switchPanel('map');
    setTimeout(() => {
        if (!adminMap) return;
        adminMap.invalidateSize();
        adminMap.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
    }, 320);
}

/* ══════════════════════════════════════════════════════════
   CUSTOMER LOCATION — reposition + Firestore write helper
   `location` lives on the Firestore users/{uid} doc (set at
   registration by scripts/firebase-init.js). We write it back
   the same way: Admin SDK when available, REST PATCH fallback
   otherwise — same pattern used by deleteUserAccount().
══════════════════════════════════════════════════════════ */
async function _updateUserLocation(uid, lat, lng, meta = {}) {
    if (window._adminDb) {
        await window._adminDb.collection('users').doc(uid).update({
            location: { lat: Number(lat), lng: Number(lng) },
            ...meta,
        });
        return;
    }
    // REST fallback — Firestore REST requires an explicit updateMask so the
    // PATCH only touches these fields and leaves the rest of the doc intact.
    const token  = await getFsToken();
    const fsAuth = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const fields = {
        location: { mapValue: { fields: {
            lat: { doubleValue: Number(lat) },
            lng: { doubleValue: Number(lng) },
        } } },
    };
    let mask = 'updateMask.fieldPaths=location';
    Object.entries(meta).forEach(([k, v]) => {
        fields[k] = typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
        mask += `&updateMask.fieldPaths=${encodeURIComponent(k)}`;
    });
    const url = `${FIRESTORE}/users/${uid}?${mask}`;
    const r   = await fetch(url, { method: 'PATCH', headers: fsAuth, body: JSON.stringify({ fields }) });
    if (!r.ok) throw new Error('Firestore PATCH failed: ' + r.status);
}

// Generate a v4-style random UUID, same format used client-side in
// firebase-init.js's getOrCreateDeviceUUID().
function _genDeviceUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/* ══════════════════════════════════════════════════════════
   DEVICE-COLLISION UN-MERGE (Option 1)
   The "⚠️ جهاز واحد" flag isn't a random UUID clash — it's two
   different phones (usually the identical model/OS/browser) hashing
   to the same fingerprint and getting assigned the same device UUID.
   This assigns the picked account a brand-new, independent UUID so it
   stops being grouped with its former "device-mates" — a one-click
   fix for a false-positive collision, without touching the detection
   logic that runs for everyone else.
══════════════════════════════════════════════════════════ */
async function unmergeCustomerDevice(uid, oldUuid, name) {
    const newUuid = _genDeviceUUID();

    const confirmed = await showConfirm({
        title: '🔓 فصل عن الجهاز المشترك',
        msg: `سيتم إعطاء <strong>${name || 'هذا الحساب'}</strong> معرّف جهاز جديد ومستقل،
              فيفصله عن باقي الحسابات المُصنَّفة على "نفس الجهاز".<br><br>
              استخدم هذا فقط إذا كنت متأكداً أن هذا فعلاً جهاز مختلف
              (غالباً هاتفان بنفس الموديل يعطيان نفس البصمة الرقمية بالخطأ).`,
        okLabel: '🔓 فصل الحساب', cancelLabel: 'إلغاء',
    });
    if (!confirmed) return;

    try {
        // 1. Assign the new UUID on the user's Firestore profile
        if (window._adminDb) {
            await window._adminDb.collection('users').doc(uid).update({ deviceUUID: newUuid });
        } else {
            const token  = await getFsToken();
            const fsAuth = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
            const fields = { deviceUUID: { stringValue: newUuid } };
            const url = `${FIRESTORE}/users/${uid}?updateMask.fieldPaths=deviceUUID`;
            const r = await fetch(url, { method: 'PATCH', headers: fsAuth, body: JSON.stringify({ fields }) });
            if (!r.ok) throw new Error('Firestore PATCH failed: ' + r.status);
        }

        // 2. Decrement the old shared device's RTDB account counter (floor 0)
        if (oldUuid) {
            try {
                const oldData = await fbGet(`devices/${oldUuid}`).catch(() => null);
                const oldCount = Math.max(0, (oldData?.accountCount || 1) - 1);
                await fbSet(`devices/${oldUuid}`, { accountCount: oldCount, lastUsed: oldData?.lastUsed || new Date().toISOString() });
            } catch (_) {}
        }

        // 3. Create a fresh RTDB device record for the new UUID
        await fbSet(`devices/${newUuid}`, { accountCount: 1, lastUsed: new Date().toISOString() });

        // 4. Reflect locally so the table updates without a full reload
        if (allUsers[uid]) allUsers[uid].deviceUUID = newUuid;

        toast(`✅ تم فصل ${name || 'الحساب'} عن الجهاز المشترك`);
        renderCustomers();
    } catch (e) {
        toast('فشل الفصل: ' + e.message, true);
    }
}

// Manual reposition modal — same Leaflet drag-pin pattern as
// openStoreLocationModal()/openCenterLocationModal(), scoped to one customer.
function openCustomerLocationModal(uid, name, initLat, initLng) {
    const stale = document.getElementById('ul-modal-overlay');
    if (stale) stale.remove();

    // Default center: current live-map focus (Baalbek)
    const DEFAULT_LAT = 34.003, DEFAULT_LNG = 36.212;
    const startLat = initLat || DEFAULT_LAT;
    const startLng = initLng || DEFAULT_LNG;

    const overlay = document.createElement('div');
    overlay.id = 'ul-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;padding:16px;';

    overlay.innerHTML = `
    <div id="ul-box" style="background:var(--surface);border:1px solid var(--border);border-radius:20px;width:100%;max-width:560px;font-family:var(--font);direction:rtl;display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div>
                <h3 style="font-size:1rem;font-weight:800;color:var(--white);margin:0 0 2px;">📍 تحديد موقع العميل</h3>
                <div style="font-size:0.75rem;color:var(--gray);">${name || '—'}</div>
            </div>
            <button id="ul-close-x" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
        </div>

        <div style="padding:14px 20px 10px;flex-shrink:0;">
            <div style="font-size:0.72rem;color:var(--gray);margin-bottom:8px;">اسحب الدبوس أو انقر على الخريطة لتحديد موقع العميل، أو أدخل الإحداثيات يدوياً</div>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;">
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط العرض (Lat)</label>
                    <input id="ul-lat" type="number" step="0.000001" placeholder="34.003000"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <div>
                    <label style="font-size:0.68rem;color:var(--gray);font-weight:700;display:block;margin-bottom:3px;">خط الطول (Lng)</label>
                    <input id="ul-lng" type="number" step="0.000001" placeholder="36.212000"
                        style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;box-sizing:border-box;"
                        onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                </div>
                <button id="ul-jump-btn" style="margin-top:16px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--white);font-size:0.78rem;font-family:inherit;cursor:pointer;white-space:nowrap;" title="انتقل إلى الإحداثيات">↗ انتقل</button>
            </div>
            ${initLat ? `<div id="ul-current-loc" style="margin-top:8px;font-size:0.7rem;color:var(--gray);">الموقع الحالي: <span style="color:var(--orange);font-family:var(--mono);">${initLat.toFixed(6)}, ${initLng.toFixed(6)}</span></div>` : '<div id="ul-current-loc" style="margin-top:8px;font-size:0.7rem;color:rgba(239,68,68,0.8);">⚠ لا يوجد موقع محدد لهذا العميل</div>'}
        </div>

        <div id="ul-map-container" style="flex:1;min-height:280px;position:relative;">
            <div id="ul-map" style="width:100%;height:100%;min-height:280px;"></div>
            <div id="ul-pin-hint" style="position:absolute;bottom:10px;right:50%;transform:translateX(50%);background:rgba(0,0,0,0.65);color:#fff;font-size:0.7rem;padding:5px 12px;border-radius:50px;pointer-events:none;z-index:999;white-space:nowrap;">${initLat ? '' : 'انقر لتحديد الموقع'}</div>
        </div>

        <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0;">
            <button id="ul-cancel-btn" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:10px;color:var(--white);font-family:inherit;font-size:0.88rem;font-weight:700;cursor:pointer;">إلغاء</button>
            <button id="ul-save-btn" style="flex:2;background:var(--orange);border:none;border-radius:12px;padding:10px;color:#fff;font-family:inherit;font-size:0.88rem;font-weight:800;cursor:pointer;">💾 حفظ الموقع</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    const ulMap = L.map('ul-map', { zoomControl: true }).setView([startLat, startLng], initLat ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    }).addTo(ulMap);

    const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:var(--orange,#FF5C00);border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
    });

    let ulMarker = null;
    let selectedLat = initLat;
    let selectedLng = initLng;

    if (initLat && initLng) {
        ulMarker = L.marker([initLat, initLng], { icon: pinIcon, draggable: true }).addTo(ulMap);
        _ulBindMarkerDrag(ulMarker);
        document.getElementById('ul-lat').value = initLat.toFixed(6);
        document.getElementById('ul-lng').value = initLng.toFixed(6);
    }

    function _ulBindMarkerDrag(marker) {
        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            selectedLat = pos.lat;
            selectedLng = pos.lng;
            document.getElementById('ul-lat').value = pos.lat.toFixed(6);
            document.getElementById('ul-lng').value = pos.lng.toFixed(6);
        });
    }

    function _ulSetMarker(lat, lng) {
        selectedLat = lat;
        selectedLng = lng;
        document.getElementById('ul-lat').value = lat.toFixed(6);
        document.getElementById('ul-lng').value = lng.toFixed(6);
        if (ulMarker) {
            ulMarker.setLatLng([lat, lng]);
        } else {
            ulMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(ulMap);
            _ulBindMarkerDrag(ulMarker);
        }
        const hint = document.getElementById('ul-pin-hint');
        if (hint) hint.style.display = 'none';
    }

    ulMap.on('click', (e) => { _ulSetMarker(e.latlng.lat, e.latlng.lng); });

    document.getElementById('ul-jump-btn').addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('ul-lat').value);
        const lng = parseFloat(document.getElementById('ul-lng').value);
        if (isNaN(lat) || isNaN(lng)) { toast('أدخل إحداثيات صحيحة', true); return; }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { toast('الإحداثيات خارج النطاق', true); return; }
        _ulSetMarker(lat, lng);
        ulMap.setView([lat, lng], 16);
    });

    const close = () => { ulMap.remove(); overlay.remove(); };
    document.getElementById('ul-close-x').addEventListener('click', close);
    document.getElementById('ul-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('ul-save-btn').addEventListener('click', async () => {
        if (selectedLat === null || selectedLng === null) {
            toast('انقر على الخريطة لتحديد الموقع أولاً', true); return;
        }
        const btn = document.getElementById('ul-save-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            const lat = parseFloat(selectedLat.toFixed(6));
            const lng = parseFloat(selectedLng.toFixed(6));
            // A location the admin sets by hand is authoritative — clear any
            // earlier "auto-order" approximation flag so the ~tag disappears.
            await _updateUserLocation(uid, lat, lng, { locationSource: 'admin-manual' });
            if (allUsers[uid]) {
                allUsers[uid].location       = { lat, lng };
                allUsers[uid].locationSource = 'admin-manual';
            }
            toast(`✅ تم حفظ موقع ${name || 'العميل'}`);
            close();
            renderCustomers();
        } catch(e) {
            toast('فشل الحفظ: ' + e.message, true);
            btn.disabled = false; btn.textContent = '💾 حفظ الموقع';
        }
    });

    setTimeout(() => ulMap.invalidateSize(), 120);
}

/* ══════════════════════════════════════════════════════════
   AUTO-LOCATE MISSING CUSTOMERS
   For customers with no saved location (GPS failed at signup, etc.),
   fall back to the delivery coordinates of their own most recent order
   — real data the customer already gave a driver, and far more reliable
   than guessing from IP or a town-center default. Only customers who
   actually have a geolocated past order get auto-set; everyone else is
   left for manual review via the ✏️/📍 button so we never silently
   plant a wrong pin.
══════════════════════════════════════════════════════════ */
// STORES PANEL
// ═══════════════════════════════════════════════════════════════
const TYPE_LABELS = { Restaurants:'مطعم', BakeryShops:'مخبز', ButcherShops:'ملحمة', Markets:'سوبرماركت', GroceryShops:'بقالة', SweetsShops:'حلويات', FishShops:'أسماك', CoffeeShops:'قهوة', ChickenShops:'دجاج', DairyShops:'ألبان', FlowerShops:'زهور', TobaccoShops:'تبغ', ToysShops:'ألعاب', Taxi:'تاكسي' };
const TYPE_EMOJI  = { Restaurants:'🍔', BakeryShops:'🥖', ButcherShops:'🥩', Markets:'🛒', GroceryShops:'🧺', SweetsShops:'🍰', FishShops:'🐟', CoffeeShops:'☕', ChickenShops:'🍗', DairyShops:'🥛', FlowerShops:'💐', TobaccoShops:'🚬', ToysShops:'🧸', Taxi:'🚕' };

// Same non-colliding fallback as scripts/stores.js's toSlug() — used only
// when a store has no imgSlug override set. Never falls back to a shared
// literal string, so two different Arabic-only store names can't end up
// pointing at the same image file.
function _scSlugHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
}
function _scSafeSlug(name) {
    const cleaned = String(name).toLowerCase()
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return cleaned || ('_noimg-' + _scSlugHash(name));
}

function renderStores() {
    renderAdminFilterBar();
    const grid    = document.getElementById('stores-grid');
    const countEl = document.getElementById('stores-count-label');
    grid.innerHTML = '';

    let stores = Object.entries(allStores);

    // Type filter
    if (storeFilter !== 'all') {
        stores = stores.filter(([, s]) => (s.allTypes || [s.type]).includes(storeFilter));
    }
    // Search
    if (storeSearch) {
        const q = storeSearch.toLowerCase();
        stores = stores.filter(([name]) => name.toLowerCase().includes(q));
    }
    // Hide disabled entirely, if the admin toggled that on
    const isStoreDisabled = s => s.disabled === true || s.disabled === '1' || s.disabled === 1;
    if (hideDisabledStores) {
        stores = stores.filter(([, s]) => !isStoreDisabled(s));
    }
    // Disabled stores always sink to the bottom of the list (stable sort —
    // relative order within each group is otherwise unchanged)
    stores = stores
        .map((entry, i) => ({ entry, i, disabled: isStoreDisabled(entry[1]) }))
        .sort((a, b) => (a.disabled === b.disabled) ? (a.i - b.i) : (a.disabled ? 1 : -1))
        .map(x => x.entry);

    countEl.textContent = `${stores.length} متجر`;

    if (!stores.length) {
        grid.innerHTML = '<div class="empty-state" style="padding:60px;flex:1;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><p>لا توجد متاجر</p></div>';
        return;
    }

    stores.forEach(([name, s]) => {
        const emoji     = TYPE_EMOJI[s.type] || '🏪';
        const typeLabel = TYPE_LABELS[s.type] || s.type;
        const imgSlug    = (s.imgSlug && s.imgSlug.trim()) ? s.imgSlug.trim().toLowerCase() : _scSafeSlug(name);
        const imgPicture = `<picture style="width:100%;height:100%;display:block;"><source srcset="assets/${imgSlug}.webp" type="image/webp"><img src="assets/${imgSlug}.png" alt="${name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.closest('picture').style.display='none';this.closest('picture').nextElementSibling.style.display='flex'"></picture>`;
        const ordCount  = Object.values(allOrders).filter(o => o.store === name).length;
        const newOrders = Object.values(allOrders).filter(o => o.store === name && (o.state||'0') === '0').length;

        const card = document.createElement('div');
        card.className = 'store-card-admin';
        card.style.cursor = 'pointer';
        const isClosed  = s._closed === true || s._closed === '1' || s._closed === 1;
        const closedReason = s._closedReason || '';
        const opensAt      = s._opensAt      || '';

        const isDisabled = s.disabled === true || s.disabled === '1' || s.disabled === 1;

        card.className = 'store-card-admin' + (isClosed ? ' sc-closed' : '') + (isDisabled ? ' sc-disabled' : '');
        card.style.cursor = 'default';
        card.innerHTML = `
            <div class="sc-thumb">
                ${imgPicture}
                <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:2rem;">${emoji}</div>
                <div class="sc-type-badge">${(s.allTypes||[s.type]).map(t=>TYPE_EMOJI[t]||'🏪').join(' ')}</div>
                ${newOrders > 0 ? `<div style="position:absolute;top:6px;left:6px;background:var(--orange);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:50px;">🔴 ${newOrders} جديد</div>` : ''}
                ${isClosed   ? `<div class="sc-closed-overlay"><span>🔒</span><span class="sc-closed-lbl">مغلق</span></div>` : ''}
                ${isDisabled && !isClosed ? `<div class="sc-closed-overlay" style="background:rgba(30,30,30,0.72);"><span>🚫</span><span class="sc-closed-lbl" style="background:rgba(120,120,120,0.8);">معطّل</span></div>` : ''}
            </div>
            <div class="sc-body">
                <div class="sc-name">${name}</div>
                <!-- Arabic name row -->
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <span style="font-size:0.6rem;color:var(--gray);flex-shrink:0;">🈶 عربي</span>
                    <input type="text" class="sc-namear-input" dir="rtl"
                           value="${s.nameAr || ''}"
                           placeholder="الاسم بالعربية"
                           style="flex:1;background:var(--surface3);border:1px solid var(--border);border-radius:6px;padding:4px 7px;color:var(--white);font-family:var(--font);font-size:0.75rem;outline:none;">
                    <button class="sc-namear-save" title="حفظ الاسم العربي"
                            style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:var(--green);padding:4px 8px;cursor:pointer;font-size:0.72rem;">✓</button>
                </div>
                <!-- Image slug row — controls which assets/{slug}.webp file this store's logo loads from.
                     Needed whenever the store's internal name has no English in it at all, since
                     otherwise there's no way to point it at a real, unique image file. -->
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <span style="font-size:0.6rem;color:var(--gray);flex-shrink:0;" title="اسم ملف الصورة: assets/{القيمة}.webp">🖼 صورة</span>
                    <input type="text" class="sc-imgslug-input" dir="ltr"
                           value="${s.imgSlug || ''}"
                           placeholder="${_scSafeSlug(name)}"
                           style="flex:1;background:var(--surface3);border:1px solid var(--border);border-radius:6px;padding:4px 7px;color:var(--white);font-family:var(--mono);font-size:0.72rem;outline:none;">
                    <button class="sc-imgslug-save" title="حفظ رمز الصورة"
                            style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:var(--green);padding:4px 8px;cursor:pointer;font-size:0.72rem;">✓</button>
                </div>
                <!-- WhatsApp order-notification row — number the store owner gets
                     WhatsApp alerts on when a new order comes in, with an on/off
                     switch so notifications can be enabled per store. -->
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <span style="font-size:0.6rem;color:var(--gray);flex-shrink:0;" title="رقم واتساب لإشعارات الطلبات">📱 واتساب</span>
                    <input type="tel" class="sc-whatsapp-input" dir="ltr"
                           value="${s.whatsapp || ''}"
                           placeholder="961XXXXXXXX"
                           style="flex:1;background:var(--surface3);border:1px solid var(--border);border-radius:6px;padding:4px 7px;color:var(--white);font-family:var(--mono);font-size:0.72rem;outline:none;">
                    <label class="toggle" style="transform:scale(0.72);flex-shrink:0;" title="${s.whatsappActive ? 'إشعارات واتساب مفعّلة' : 'إشعارات واتساب متوقفة'}">
                        <input type="checkbox" class="sc-whatsapp-toggle" ${s.whatsappActive ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="sc-whatsapp-save" title="حفظ رقم واتساب وحالة التفعيل"
                            style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:var(--green);padding:4px 8px;cursor:pointer;font-size:0.72rem;flex-shrink:0;">✓</button>
                </div>
                <!-- Show/hide this store's pin on the live map ("الخريطة
                     المباشرة"), independent of its open/closed or
                     enabled/disabled status — lets admin declutter the
                     map (e.g. for a store with no confirmed location yet,
                     or one being temporarily kept off the map) without
                     touching its actual availability to customers. -->
                <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                    <span style="font-size:0.6rem;color:var(--gray);flex-shrink:0;" title="إظهار/إخفاء دبوس المتجر على الخريطة المباشرة">🗺 على الخريطة</span>
                    <label class="toggle" style="transform:scale(0.72);margin-right:auto;" title="${s.showOnMap === false ? 'مخفي عن الخريطة الآن' : 'ظاهر على الخريطة الآن'}">
                        <input type="checkbox" class="sc-map-toggle" ${s.showOnMap === false ? '' : 'checked'}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <!-- Daily auto open/close hours — when enabled, the store
                     is automatically shown as closed to customers outside
                     this daily window (independent of, and overridden by,
                     the manual إغلاق المتجر button above). Handles an
                     overnight window (e.g. 18:00 → 02:00) correctly. -->
                <div class="sc-hours-row" style="display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap;">
                    <span style="font-size:0.6rem;color:var(--gray);flex-shrink:0;" title="فتح وإغلاق المتجر تلقائياً كل يوم حسب الوقت المحدد">⏰ دوام تلقائي</span>
                    <label class="toggle" style="transform:scale(0.72);" title="${s.autoHours?.enabled ? 'الدوام التلقائي مفعّل' : 'الدوام التلقائي متوقف'}">
                        <input type="checkbox" class="sc-hours-toggle" ${s.autoHours?.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <input type="time" class="sc-hours-open" value="${s.autoHours?.open || '09:00'}"
                           style="background:var(--surface3);border:1px solid var(--border);border-radius:6px;padding:3px 5px;color:var(--white);font-family:var(--mono);font-size:0.7rem;outline:none;">
                    <span style="font-size:0.62rem;color:var(--gray);">إلى</span>
                    <input type="time" class="sc-hours-close" value="${s.autoHours?.close || '23:00'}"
                           style="background:var(--surface3);border:1px solid var(--border);border-radius:6px;padding:3px 5px;color:var(--white);font-family:var(--mono);font-size:0.7rem;outline:none;">
                    <button class="sc-hours-save" title="حفظ ساعات الدوام"
                            style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:var(--green);padding:4px 8px;cursor:pointer;font-size:0.72rem;margin-right:auto;">✓</button>
                    ${s.autoHours?.enabled ? (
                        _autoHoursClosedInfo(s.autoHours)
                            ? `<span style="font-size:0.6rem;font-weight:800;color:#ef4444;background:rgba(239,68,68,0.12);border-radius:50px;padding:2px 7px;">🔴 خارج الدوام الآن</span>`
                            : `<span style="font-size:0.6rem;font-weight:800;color:#22c55e;background:rgba(34,197,94,0.12);border-radius:50px;padding:2px 7px;">🟢 ضمن الدوام الآن</span>`
                    ) : ''}
                </div>
                <div class="sc-meta">
                    <span class="sc-items">${ordCount} طلب إجمالي</span>
                    <span class="sc-rank">${s.rank ? '⭐ '+s.rank : ''}</span>
                </div>
                ${isClosed ? `<div class="sc-closed-reason">${closedReason || 'مغلق مؤقتاً'}</div>` : ''}
                ${isClosed && opensAt ? `<div class="sc-opens-at">${_fmtOpensAt(opensAt)}</div>` : ''}
                <!-- Priority row — one input per store type -->
                <div class="sc-priority-row" style="flex-direction:column;align-items:stretch;gap:5px;">
                    <span class="sc-priority-label" style="margin-bottom:2px;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        الأولوية
                    </span>
                    ${(s.allTypes || [s.type]).map(t => {
                        const tp = (s.priorities && s.priorities[t] !== undefined) ? s.priorities[t] : '';
                        return `<div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:0.72rem;color:var(--gray-light);min-width:20px;text-align:center;">${TYPE_EMOJI[t]||'🏪'}</span>
                            <input type="number" class="sc-priority-input" data-ptype="${t}"
                                   value="${tp}" min="1" max="99" placeholder="—"
                                   title="${TYPE_LABELS[t]||t} — 1 = الأعلى أولوية"
                                   style="flex:1;">
                            <button class="sc-priority-save" data-ptype="${t}" title="حفظ أولوية ${TYPE_LABELS[t]||t}">✓</button>
                        </div>`;
                    }).join('')}
                </div>
                <!-- Meal tags row -->
                <div class="sc-meal-row">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                        <span class="sc-priority-label" style="display:flex;">🍽 وجبات</span>
                    </div>
                    <div class="sc-meal-checks">
                        ${['breakfast','lunch','snack','dinner'].map(m => {
                            const mLabel = {breakfast:'فطور',lunch:'غداء',snack:'سناك',dinner:'عشاء'}[m];
                            const MEAL_FALLBACK = {
                                breakfast: ['BakeryShops','CoffeeShops','DairyShops','SweetsShops'],
                                lunch:     ['Restaurants','ButcherShops','FishShops','ChickenShops'],
                                snack:     ['CoffeeShops','SweetsShops','BakeryShops','GroceryShops'],
                                dinner:    ['Restaurants','ButcherShops','ChickenShops','FishShops'],
                            };
                            const hasExplicit = (s.mealTags || []).includes(m);
                            const hasFallback = !s.mealTags?.length && (MEAL_FALLBACK[m] || []).includes(s.type);
                            const checked     = hasExplicit || hasFallback ? 'checked' : '';
                            return `<label class="sc-meal-check">
                                <input type="checkbox" class="sc-meal-cb" data-meal="${m}" ${checked}>
                                <span>${mLabel}</span>
                            </label>`;
                        }).join('')}
                    </div>
                    <button class="sc-priority-save sc-meal-save" title="حفظ وجبات">✓</button>
                </div>
            </div>
            <div class="sc-close-actions" style="gap:5px;">
                <button class="sc-status-btn ${isClosed ? 'sc-status-btn--open' : 'sc-status-btn--close'}" style="flex:1.8;">
                    ${isClosed
                        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> فتح`
                        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إغلاق`
                    }
                </button>
                <button class="sc-disable-btn ${isDisabled ? 'sc-disable-btn--on' : ''}" style="flex:1.3;" title="${isDisabled ? 'إعادة التفعيل' : 'تعطيل المتجر'}">
                    ${isDisabled ? '✅ تفعيل' : '🚫 تعطيل'}
                </button>
                <button class="sc-type-edit-btn" style="flex:0.8;" title="تغيير نوع المتجر">
                    🏷
                </button>
                <button class="sc-rename-btn" style="flex:0.8;" title="إعادة تسمية المتجر">
                    ✏️
                </button>
                <button class="sc-catorder-btn" style="flex:0.8;" title="ترتيب الأقسام والأصناف الفرعية">
                    🗂
                </button>
                <button class="sc-locate-set-btn" style="flex:0.8;" title="تحديد موقع المتجر على الخريطة">
                    📍
                </button>
                <button class="sc-delete-btn" style="flex:0.7;" title="حذف المتجر">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
            </div>`;

        // Arabic name save
        card.querySelector('.sc-namear-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            const input = card.querySelector('.sc-namear-input');
            const val   = input.value.trim();
            // Save nameAr AND ensure imgSlug (English) is stored for image lookups
            await _storeSetField(name, s.type, 'nameAr', val || null);
            if (!s.imgSlug) {
                // Derive English slug from the companyname (before any Arabic rename)
                const enSlug = name.toLowerCase()
                    .replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '-')
                    .replace(/-+/g, '-').replace(/^-|-$/g, '');
                if (enSlug) await _storeSetField(name, s.type, 'imgSlug', enSlug);
            }
            toast(`✓ تم حفظ الاسم العربي: ${val || '(محذوف)'}`);
        });
        card.querySelector('.sc-namear-input').addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            const val = e.target.value.trim();
            await _storeSetField(name, s.type, 'nameAr', val || null);
            if (!s.imgSlug) {
                const enSlug = name.toLowerCase()
                    .replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '-')
                    .replace(/-+/g, '-').replace(/^-|-$/g, '');
                if (enSlug) await _storeSetField(name, s.type, 'imgSlug', enSlug);
            }
            toast(`✓ تم حفظ الاسم العربي: ${val || '(محذوف)'}`);
        });

        // Image slug override save — lets you point this store at a specific
        // assets/{slug}.webp file directly, regardless of what its internal
        // name is. Essential for stores whose name has no English in it.
        card.querySelector('.sc-imgslug-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            const input = card.querySelector('.sc-imgslug-input');
            const val = input.value.trim().toLowerCase().replace(/\s+/g, '-');
            input.value = val;
            await _storeSetField(name, s.type, 'imgSlug', val || null);
            toast(val ? `✓ تم ربط الصورة بـ: assets/${val}.webp` : '✓ تمت إزالة رمز الصورة المخصص');
            renderStores();
        });

        // WhatsApp order-notification number + on/off toggle. Saved across
        // EVERY type this store is listed under (s.allTypes), not just the
        // one type whose copy happens to back this card — a store listed
        // under more than one category has a separate pattern/{type} entry
        // per category, and only writing to one of them is what caused the
        // toggle to look "reset" after a refresh whenever the OTHER type's
        // copy (with no whatsappActive saved) was the one that ended up
        // feeding the admin's in-memory store record.
        card.querySelector('.sc-map-toggle').addEventListener('change', async (e) => {
            e.stopPropagation();
            const checked = e.target.checked;
            const types = (s.allTypes && s.allTypes.length) ? s.allTypes : [s.type];
            e.target.disabled = true;
            try {
                for (const t of types) {
                    await _storeSetField(name, t, 'showOnMap', checked ? null : false); // null = default (shown), matches "unset means visible"
                }
                s.showOnMap = checked ? undefined : false;
                toast(checked ? `🗺 ${name} ظاهر الآن على الخريطة المباشرة` : `🙈 تم إخفاء ${name} عن الخريطة المباشرة`);
                if (typeof renderMap === 'function' && document.getElementById('panel-map')?.classList.contains('active')) renderMap();
            } catch (err) {
                e.target.checked = !checked;
                toast('❌ فشل تحديث حالة الخريطة: ' + err.message, true);
            } finally {
                e.target.disabled = false;
            }
        });
        card.querySelector('.sc-whatsapp-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn    = card.querySelector('.sc-whatsapp-save');
            const input  = card.querySelector('.sc-whatsapp-input');
            const toggle = card.querySelector('.sc-whatsapp-toggle');
            const digits = input.value.trim().replace(/[^\d]/g, '');
            if (digits && digits.length < 8) { toast('رقم واتساب غير صحيح', true); return; }
            if (toggle.checked && !digits) { toast('أدخل رقم واتساب قبل تفعيل الإشعارات', true); toggle.checked = false; return; }
            input.value = digits;

            const types = (s.allTypes && s.allTypes.length) ? s.allTypes : [s.type];
            btn.disabled = true;
            try {
                for (const t of types) {
                    await _storeSetField(name, t, 'whatsapp', digits || null);
                    await _storeSetField(name, t, 'whatsappActive', toggle.checked || null);
                }
                s.whatsapp       = digits;
                s.whatsappActive = toggle.checked;
                toast(digits
                    ? `✓ تم حفظ واتساب ${name} — الإشعارات ${toggle.checked ? 'مفعّلة ✅' : 'متوقفة ⏸'}`
                    : '✓ تمت إزالة رقم واتساب المتجر');
                await _refreshStoresData(); // confirm against Firebase immediately, not just locally
            } catch (err) {
                toast('❌ فشل حفظ واتساب: ' + err.message, true);
            } finally {
                btn.disabled = false;
            }
        });

        // Daily auto open/close hours — saved across every type this
        // store is listed under, same reasoning as the WhatsApp field above.
        card.querySelector('.sc-hours-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn      = card.querySelector('.sc-hours-save');
            const toggle   = card.querySelector('.sc-hours-toggle');
            const openInp  = card.querySelector('.sc-hours-open');
            const closeInp = card.querySelector('.sc-hours-close');
            const enabled  = toggle.checked;
            const openVal  = openInp.value || '09:00';
            const closeVal = closeInp.value || '23:00';

            const types = (s.allTypes && s.allTypes.length) ? s.allTypes : [s.type];
            btn.disabled = true;
            try {
                const autoHours = { enabled, open: openVal, close: closeVal };
                for (const t of types) {
                    await _storeSetField(name, t, 'autoHours', autoHours);
                }
                s.autoHours = autoHours;
                toast(enabled
                    ? `⏰ دوام ${name} التلقائي: ${openVal} — ${closeVal}`
                    : `⏰ تم إيقاف الدوام التلقائي لـ ${name}`);
            } catch (err) {
                toast('❌ فشل حفظ ساعات الدوام: ' + err.message, true);
            } finally {
                btn.disabled = false;
            }
        });

        // Close/open button
        card.querySelector('.sc-status-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openCloseStoreModal(name, isClosed, closedReason, opensAt);
        });

        // Disable/enable button
        card.querySelector('.sc-disable-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await _storeSetField(name, s.type, 'disabled', isDisabled ? null : true);
            toast(isDisabled ? `✅ تم تفعيل ${name}` : `🚫 تم تعطيل ${name}`);
            await _refreshStoresData();
        });

        // Meal tags save
        card.querySelector('.sc-meal-save').addEventListener('click', async (e) => {
            e.stopPropagation();
            const checks = [...card.querySelectorAll('.sc-meal-cb')];
            const tags   = checks.filter(c => c.checked).map(c => c.dataset.meal);
            await _storeSetField(name, s.type, 'mealTags', tags.length ? tags : null);
            toast(`🍽 وجبات ${name}: ${tags.length ? tags.join('،') : 'لا شيء'}`);
        });

        // Priority save — one handler per type button
        card.querySelectorAll('.sc-priority-save[data-ptype]').forEach(btn => {
            const ptype = btn.dataset.ptype;
            const inp   = card.querySelector(`.sc-priority-input[data-ptype="${ptype}"]`);
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const val = inp.value === '' ? null : parseInt(inp.value);
                await _storeSetField(name, ptype, 'priority', val);
                toast(`📶 أولوية ${name} (${TYPE_LABELS[ptype]||ptype}): ${val ?? 'افتراضي'}`);
                await _refreshStoresData();
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btn.click();
            });
        });

        // Delete button
        card.querySelector('.sc-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`حذف متجر "${name}" نهائياً؟ لا يمكن التراجع.`)) return;
            await _storeDelete(name, s.type);
            toast(`🗑 تم حذف ${name}`);
            await _refreshStoresData();
        });

        // Location picker button
        card.querySelector('.sc-locate-set-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const currentLat = s.lat ? parseFloat(s.lat) : null;
            const currentLng = s.lng ? parseFloat(s.lng) : null;
            openStoreLocationModal(name, s.type, currentLat, currentLng);
        });

        // Type editor button
        card.querySelector('.sc-type-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openStoreTypeModal(name, s.allTypes || [s.type]);
        });

        // Rename button
        card.querySelector('.sc-rename-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openStoreRenameModal(name, s.allTypes || [s.type]);
        });

        // Category order editor button
        card.querySelector('.sc-catorder-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openCategoryOrderModal(name);
        });

        grid.appendChild(card);
    });
}

// ══ CLOSE-STORE MODAL ══════════════════════════════════════════
let _closeStoreModal = null;

// Reliable check for "is this an ISO-8601 timestamp we generated
// ourselves" (via new Date(...).toISOString()) vs arbitrary free text
// (e.g. Arabic text like "غداً صباحاً الساعة 9"). JS's Date constructor
// is unreliably lenient with non-standard strings — it can silently
// parse a stray digit out of free text into a bogus-but-"valid" date
// instead of returning Invalid Date, which previously caused Arabic
// opens-at text to vanish (misread as a real date) after reopening the
// modal. A strict format check avoids that entirely.
const _ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;
function _isIsoDateString(str) {
    return typeof str === 'string' && _ISO_DATE_RE.test(str);
}

function openCloseStoreModal(storeName, isCurrentlyClosed, reason, opensAt) {
    // Remove any stale overlay from a previous call
    const stale = document.getElementById('cs-modal-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cs-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:460px;font-family:var(--font);direction:rtl;';

    // Pre-fill opensAt into datetime-local format (local time, not UTC)
    let dtPreFill = '';
    if (_isIsoDateString(opensAt)) {
        const d = new Date(opensAt);
        dtPreFill = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const txtPreFill = (opensAt && !_isIsoDateString(opensAt)) ? opensAt : '';

    box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
            <h3 style="font-size:1.05rem;font-weight:800;color:var(--white);margin:0;">
                ${isCurrentlyClosed ? '⚙️ إدارة الإغلاق' : '🔴 إغلاق المتجر'}
            </h3>
            <button id="cs-close-x" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
        </div>
        <div style="font-size:0.82rem;color:var(--gray);margin-bottom:16px;">
            المتجر: <strong style="color:var(--white);">${storeName}</strong>
            ${isCurrentlyClosed ? '<span style="display:inline-block;margin-right:8px;font-size:0.68rem;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:50px;padding:2px 8px;font-weight:800;">🔒 مغلق الآن</span>' : ''}
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:0.78rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">سبب الإغلاق</label>
            <input id="cs-reason" type="text" maxlength="120"
                placeholder="مثال: عطلة رسمية، إجازة أسبوعية، تجديد…"
                value="${reason || ''}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;"
                onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border-bright)'">
        </div>

        <div style="margin-bottom:22px;">
            <label style="font-size:0.78rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">
                موعد الفتح
                <span style="font-weight:400;opacity:0.6;">(اختياري — تاريخ/وقت أو نص عربي)</span>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
                <input id="cs-opens-dt" type="datetime-local"
                    value="${dtPreFill}"
                    style="flex:1;min-width:160px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;"
                    onfocus="this.style.borderColor='var(--orange)';document.getElementById('cs-opens-txt').value='';"
                    onblur="this.style.borderColor='var(--border-bright)'">
                <input id="cs-opens-txt" type="text" placeholder="مثال: غداً صباحاً الساعة 9"
                    maxlength="60"
                    value="${txtPreFill}"
                    style="flex:1;min-width:140px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;"
                    onfocus="this.style.borderColor='var(--orange)';document.getElementById('cs-opens-dt').value='';"
                    onblur="this.style.borderColor='var(--border-bright)'">
            </div>
            <p style="font-size:0.68rem;color:var(--gray);margin-top:5px;">استخدم التاريخ/الوقت لحساب تلقائي، أو اكتب نصاً حراً بالعربية</p>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="cs-cancel" style="flex:1;min-width:100px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:12px;padding:11px;color:var(--white);font-family:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;">إلغاء</button>
            ${isCurrentlyClosed ? `
            <button id="cs-update" style="flex:1;min-width:120px;background:rgba(255,92,0,0.15);border:1.5px solid rgba(255,92,0,0.4);border-radius:12px;padding:11px;color:var(--orange);font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">💾 تحديث المعلومات</button>
            <button id="cs-confirm" style="flex:1;min-width:120px;background:var(--green);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">🟢 فتح المتجر</button>
            ` : `
            <button id="cs-confirm" style="flex:1;min-width:120px;background:var(--red);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">🔴 إغلاق المتجر</button>
            `}
        </div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); };
    document.getElementById('cs-close-x').onclick = close;
    document.getElementById('cs-cancel').onclick   = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Helper: read form values and write to Firebase
    async function _writeClosedStatus(keepClosed) {
        const reasonVal  = (document.getElementById('cs-reason')?.value || '').trim();
        const dtVal      = document.getElementById('cs-opens-dt')?.value;
        const txtVal     = (document.getElementById('cs-opens-txt')?.value || '').trim();
        const opensAtVal = dtVal ? new Date(dtVal).toISOString() : (txtVal || '');
        if (keepClosed) {
            // Update info while keeping store closed
            await fbSet(`storeStatus/${storeName}`, {
                closed:    true,
                reason:    reasonVal || 'مغلق مؤقتاً',
                opensAt:   opensAtVal,
                closedAt:  new Date().toISOString(),
                closedBy:  currentAdmin?.username || 'admin',
            });
            toast(`💾 تم تحديث معلومات ${storeName}`);
        } else if (isCurrentlyClosed) {
            // Open the store
            await fbSet(`storeStatus/${storeName}`, null);
            toast(`✅ تم فتح ${storeName}`);
        } else {
            // Close the store
            await fbSet(`storeStatus/${storeName}`, {
                closed:    true,
                reason:    reasonVal || 'مغلق مؤقتاً',
                opensAt:   opensAtVal,
                closedAt:  new Date().toISOString(),
                closedBy:  currentAdmin?.username || 'admin',
            });
            toast(`🔒 تم إغلاق ${storeName}`);
        }
    }

    // "Update info" button (only when already closed)
    document.getElementById('cs-update')?.addEventListener('click', async () => {
        const btn = document.getElementById('cs-update');
        btn.disabled = true; btn.textContent = '…';
        await _writeClosedStatus(true);
        close();
        await _refreshStoresData();
        if (typeof cpUpdateStoreToggleBtn === 'function') cpUpdateStoreToggleBtn();
    });

    document.getElementById('cs-confirm').onclick = async () => {
        const btn = document.getElementById('cs-confirm');
        btn.disabled = true; btn.textContent = '…';
        await _writeClosedStatus(false);

        close();
        await _refreshStoresData();
        if (typeof cpUpdateStoreToggleBtn === 'function') cpUpdateStoreToggleBtn();
    };
}

// ══ CLOSE-ENTIRE-PLATFORM MODAL ═══════════════════════════════
// Same idea as the single-store close modal above, but it shuts down
// the whole customer-facing site (settings/platformClosed) instead of
// one store — scripts/platform-status.js shows the matching full-
// screen "مغلق حالياً" takeover to every customer while this is on.
function openClosePlatformModal(isCurrentlyClosed, reason, opensAt, autoCloseAt, allowedUsernames) {
    const stale = document.getElementById('cp-modal-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cp-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:460px;font-family:var(--font);direction:rtl;';

    let dtPreFill = '';
    if (_isIsoDateString(opensAt)) {
        const d = new Date(opensAt);
        dtPreFill = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const txtPreFill = (opensAt && !_isIsoDateString(opensAt)) ? opensAt : '';

    let autoClosePreFill = '';
    if (_isIsoDateString(autoCloseAt)) {
        const d = new Date(autoCloseAt);
        autoClosePreFill = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const isPendingSchedule = !isCurrentlyClosed && _isIsoDateString(autoCloseAt) && new Date(autoCloseAt).getTime() > Date.now();

    box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h3 style="font-size:1.05rem;font-weight:800;color:var(--white);margin:0;">
                ${isCurrentlyClosed ? '⚙️ إدارة إغلاق التطبيق' : (isPendingSchedule ? '📅 إدارة الإغلاق المجدول' : '🔴 إغلاق كل التطبيق')}
            </h3>
            <button id="cp-close-x" style="background:none;border:none;color:var(--gray);font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
        </div>
        <div style="font-size:0.82rem;color:var(--gray);margin-bottom:14px;">
            ${isCurrentlyClosed ? '<span style="display:inline-block;font-size:0.68rem;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:50px;padding:2px 8px;font-weight:800;">🔒 التطبيق مغلق بالكامل الآن</span>' : ''}
            ${isPendingSchedule ? '<span style="display:inline-block;font-size:0.68rem;background:rgba(245,158,11,0.15);color:#f59e0b;border-radius:50px;padding:2px 8px;font-weight:800;">📅 يوجد إغلاق مجدول قادم</span>' : ''}
        </div>
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:0.76rem;color:#fca5a5;line-height:1.7;">
            ⚠️ هذا يُغلق <strong>كل الموقع</strong> أمام جميع العملاء (وليس متجراً واحداً فقط) — يظهر لهم شاشة "مغلق حالياً" بدل الصفحة الرئيسية، ولا يمكنهم تصفّح المتاجر أو الطلب حتى يُعاد الفتح.
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:0.78rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">سبب الإغلاق (يظهر للعملاء)</label>
            <input id="cp-reason" type="text" maxlength="120"
                placeholder="مثال: صيانة مؤقتة، عطلة رسمية…"
                value="${reason || ''}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;"
                onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border-bright)'">
        </div>

        <div style="margin-bottom:22px;">
            <label style="font-size:0.78rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">
                🔓 استثناء مستخدمين محددين <span style="font-weight:400;opacity:0.6;">(اختياري)</span>
            </label>
            <input id="cp-allowed-usernames" type="text" maxlength="300"
                placeholder="مثال: hosen, admin_test"
                value="${allowedUsernames || ''}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.85rem;outline:none;box-sizing:border-box;direction:ltr;text-align:right;"
                onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border-bright)'">
            <p style="font-size:0.66rem;color:var(--gray);margin-top:5px;line-height:1.6;">
                أسماء مستخدمين مفصولة بفاصلة، يستمرون برؤية الموقع الحقيقي وتصفّحه بشكل طبيعي حتى أثناء الإغلاق — مفيد لتجربة
                الموقع ليلاً بحساب اختبار خاص بك بينما يظهر للجميع أنه مغلق.
            </p>
        </div>

        <div style="margin:18px 0 6px;padding-top:14px;border-top:1px dashed var(--border-bright);">
            <div style="font-size:0.82rem;font-weight:800;color:var(--white);">⏰ الجدولة التلقائية <span style="font-weight:400;color:var(--gray);font-size:0.72rem;">(اختياري لكلا الحقلين)</span></div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="font-size:0.78rem;color:#fca5a5;font-weight:700;display:block;margin-bottom:6px;">
                🔴 يُغلق تلقائياً في
            </label>
            <input id="cp-autoclose-dt" type="datetime-local"
                value="${autoClosePreFill}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;"
                onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border-bright)'">
            <p style="font-size:0.66rem;color:var(--gray);margin-top:5px;line-height:1.6;">
                اتركه فارغاً لإغلاق الموقع <strong style="color:var(--gray-light);">فوراً</strong> عند الضغط أدناه. حدّد وقتاً مستقبلياً هنا بدلاً من ذلك ليُغلق الموقع
                تلقائياً في تلك اللحظة بالضبط، دون الحاجة لفتح لوحة الإدارة عندها.
            </p>
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:0.78rem;color:#86efac;font-weight:700;display:block;margin-bottom:6px;">
                🟢 يُفتح تلقائياً في
            </label>
            <input id="cp-opens-dt" type="datetime-local"
                value="${dtPreFill}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;"
                onfocus="this.style.borderColor='var(--orange)';document.getElementById('cp-opens-txt').value='';"
                onblur="this.style.borderColor='var(--border-bright)'">
            <p style="font-size:0.66rem;color:var(--gray);margin-top:5px;line-height:1.6;">
                اتركه فارغاً لإبقاء الموقع مغلقاً حتى تفتحه يدوياً. حدّد وقتاً هنا ليُعاد فتح الموقع <strong style="color:var(--gray-light);">تلقائياً</strong>
                في تلك اللحظة بالضبط — بالضبط نفس منطق حقل الإغلاق أعلاه، لكن بالاتجاه المعاكس.
            </p>
        </div>

        <div style="margin-bottom:22px;">
            <label style="font-size:0.74rem;color:var(--gray-light);font-weight:700;display:block;margin-bottom:6px;">
                💬 أو بدلاً من ذلك: نص وصفي فقط (بدون فتح تلقائي)
            </label>
            <input id="cp-opens-txt" type="text" placeholder="مثال: غداً صباحاً الساعة 9"
                maxlength="60"
                value="${txtPreFill}"
                style="width:100%;background:var(--surface2);border:1px solid var(--border-bright);border-radius:10px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;"
                onfocus="this.style.borderColor='var(--orange)';document.getElementById('cp-opens-dt').value='';"
                onblur="this.style.borderColor='var(--border-bright)'">
            <p style="font-size:0.66rem;color:var(--gray);margin-top:5px;line-height:1.6;">
                يظهر للعملاء كما هو مكتوب، لكنه <strong style="color:var(--gray-light);">لا</strong> يفتح الموقع تلقائياً — استخدمه فقط إن كنت تفضّل نصاً حراً
                (كـ"قريباً" أو "بعد العيد") بدل وقت محدد. يُلغي حقل "يُفتح تلقائياً في" أعلاه إن كُتب فيه شيء.
            </p>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="cp-cancel" style="flex:1;min-width:100px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:12px;padding:11px;color:var(--white);font-family:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;">إلغاء</button>
            ${(isCurrentlyClosed || isPendingSchedule) ? `
            <button id="cp-update" style="flex:1;min-width:120px;background:rgba(255,92,0,0.15);border:1.5px solid rgba(255,92,0,0.4);border-radius:12px;padding:11px;color:var(--orange);font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">💾 تحديث المعلومات</button>
            <button id="cp-confirm" style="flex:1;min-width:120px;background:var(--green);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">🟢 ${isCurrentlyClosed ? 'إعادة فتح الموقع' : 'إلغاء الجدولة والفتح'}</button>
            ` : `
            <button id="cp-confirm" style="flex:1;min-width:120px;background:var(--red);border:none;border-radius:12px;padding:11px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:800;cursor:pointer;">🔴 إغلاق الموقع بالكامل</button>
            `}
        </div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Swap the main button's label live depending on whether a future
    // auto-close time is set (schedule) or left blank (close right now).
    const autoCloseInput = document.getElementById('cp-autoclose-dt');
    const confirmBtnEl   = document.getElementById('cp-confirm');
    function _syncConfirmLabel() {
        if (isCurrentlyClosed || isPendingSchedule) return; // update/reopen buttons don't change
        const val = autoCloseInput?.value;
        const isFuture = val && new Date(val).getTime() > Date.now();
        confirmBtnEl.textContent = isFuture ? '📅 جدولة الإغلاق التلقائي' : '🔴 إغلاق الموقع بالكامل الآن';
    }
    autoCloseInput?.addEventListener('input', _syncConfirmLabel);

    const close = () => { overlay.remove(); };
    document.getElementById('cp-close-x').onclick = close;
    document.getElementById('cp-cancel').onclick   = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    async function _writePlatformStatus(action) {
        // action: 'update' (keep current closed/scheduled state, just edit info)
        //       | 'open'   (clear everything — fully reopen)
        //       | 'close'  (either close now, or schedule a future auto-close)
        const reasonVal     = (document.getElementById('cp-reason')?.value || '').trim();
        const dtVal         = document.getElementById('cp-opens-dt')?.value;
        const txtVal        = (document.getElementById('cp-opens-txt')?.value || '').trim();
        const opensAtVal    = dtVal ? new Date(dtVal).toISOString() : (txtVal || '');
        const autoCloseVal  = document.getElementById('cp-autoclose-dt')?.value;
        const autoCloseIso  = autoCloseVal ? new Date(autoCloseVal).toISOString() : '';
        const scheduledOnly = autoCloseIso && new Date(autoCloseIso).getTime() > Date.now();
        const allowedVal    = (document.getElementById('cp-allowed-usernames')?.value || '')
            .split(',').map(s => s.trim()).filter(Boolean);

        if (action === 'open') {
            await fbSet('settings/platformClosed', null);
            toast('✅ تم إعادة فتح الموقع لجميع العملاء');
            return;
        }

        const payload = {
            closed:          !scheduledOnly, // if scheduled for later, don't mark closed yet
            reason:          reasonVal || 'مغلق مؤقتاً',
            opensAt:         opensAtVal,
            autoCloseAt:     autoCloseIso || null,
            allowedUsernames: allowedVal.length ? allowedVal : null,
            closedAt:        new Date().toISOString(),
            closedBy:        currentAdmin?.username || 'admin',
        };
        await fbSet('settings/platformClosed', payload);

        if (action === 'update') {
            toast('💾 تم تحديث معلومات إغلاق التطبيق');
        } else if (scheduledOnly) {
            toast('📅 تمت جدولة الإغلاق التلقائي — سيُغلق الموقع تلقائياً في الموعد المحدد');
        } else {
            toast('🔒 تم إغلاق الموقع بالكامل أمام جميع العملاء');
        }
    }

    document.getElementById('cp-update')?.addEventListener('click', async () => {
        const btn = document.getElementById('cp-update');
        btn.disabled = true; btn.textContent = '…';
        await _writePlatformStatus('update');
        close();
        await _refreshClosePlatformBtn();
    });

    document.getElementById('cp-confirm').onclick = async () => {
        const btn = document.getElementById('cp-confirm');
        btn.disabled = true; btn.textContent = '…';
        await _writePlatformStatus((isCurrentlyClosed || isPendingSchedule) ? 'open' : 'close');
        close();
        await _refreshClosePlatformBtn();
    };
}

// Keeps the stores-panel button in sync with the current platform status —
// shows one of three states: open, closed right now (whether that's a
// manual close or a schedule that has already kicked in), or a future
// auto-close scheduled but not yet in effect.
async function _refreshClosePlatformBtn() {
    const btn = document.getElementById('close-platform-btn');
    if (!btn) return;
    let st = null;
    try { st = await fbGet('settings/platformClosed'); } catch (_) {}

    const now             = Date.now();
    const autoOpenDue      = _isIsoDateString(st?.opensAt)     && new Date(st.opensAt).getTime()     <= now;
    const autoCloseDue     = _isIsoDateString(st?.autoCloseAt) && new Date(st.autoCloseAt).getTime() <= now;
    // Effectively closed right now: manually closed, OR a scheduled auto-
    // close time has already arrived — in both cases unless a real auto-
    // open time has also already passed.
    const closedNow        = !!st && ((st.closed && !autoOpenDue) || (autoCloseDue && !autoOpenDue));
    const pendingSchedule  = !closedNow && !!(st && st.autoCloseAt) && !autoCloseDue;

    btn.dataset.closed      = closedNow ? '1' : '';
    btn.dataset.reason      = st?.reason      || '';
    btn.dataset.opensAt     = st?.opensAt     || '';
    btn.dataset.autoCloseAt = st?.autoCloseAt || '';
    btn.dataset.allowedUsernames = Array.isArray(st?.allowedUsernames) ? st.allowedUsernames.join(', ') : '';

    if (closedNow) {
        btn.innerHTML = '🟢 إعادة فتح الموقع';
        btn.style.background = 'rgba(34,197,94,0.12)'; btn.style.borderColor = 'rgba(34,197,94,0.35)'; btn.style.color = 'var(--green)';
    } else if (pendingSchedule) {
        const d = new Date(st.autoCloseAt);
        const label = d.toLocaleString('ar-LB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
        btn.innerHTML = `📅 إغلاق مجدول — ${label}`;
        btn.style.background = 'rgba(245,158,11,0.12)'; btn.style.borderColor = 'rgba(245,158,11,0.35)'; btn.style.color = '#f59e0b';
    } else {
        btn.innerHTML = '🔒 إغلاق كل التطبيق';
        btn.style.background = 'rgba(239,68,68,0.12)'; btn.style.borderColor = 'rgba(239,68,68,0.35)'; btn.style.color = '#ef4444';
    }
}

document.getElementById('close-platform-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('close-platform-btn');
    openClosePlatformModal(!!btn.dataset.closed, btn.dataset.reason, btn.dataset.opensAt, btn.dataset.autoCloseAt, btn.dataset.allowedUsernames);
});

// ══ STORE MANAGEMENT HELPERS ════════════════════════════════
// Find a store's Firebase key within its pattern type array
async function _storeGetKey(storeName, type) {
    const raw = await fbGet(`pattern/${type}`);
    if (!raw) return null;
    const entries = Object.entries(Array.isArray(raw) ? Object.fromEntries(raw.map((v,i)=>[i,v])) : raw);
    const match = entries.find(([, v]) => v && v.companyname === storeName);
    return match ? match[0] : null;
}

// Set a single field on a store's pattern entry
async function _storeSetField(storeName, type, field, value) {
    const key = await _storeGetKey(storeName, type);
    if (key === null) { toast('لم يُعثر على المتجر في قاعدة البيانات', true); return; }
    if (value === null) {
        await fbSet(`pattern/${type}/${key}/${field}`, null);
    } else {
        await fbSet(`pattern/${type}/${key}/${field}`, value);
    }
}

// Delete a store entirely from its pattern entry
async function _storeDelete(storeName, type) {
    const key = await _storeGetKey(storeName, type);
    if (key === null) { toast('لم يُعثر على المتجر', true); return; }
    await fbSet(`pattern/${type}/${key}`, null);
    delete allStores[storeName];
    await fbSet(`storeStatus/${storeName}`, null); // clean up status too
}

// ══ STORE LOCATION PICKER MODAL ════════════════════════════════
