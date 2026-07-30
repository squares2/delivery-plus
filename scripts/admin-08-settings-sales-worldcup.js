function renderSettings() {
    const el = document.getElementById('settings-content');
    el.innerHTML = `
        <div class="settings-section">
            <div class="settings-section-title">💱 سعر صرف الدولار (ل.ل)</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">كم ليرة لبنانية = 1 دولار</div>
                    <div class="setting-sub">يُستخدم لمقارنة الأسعار في نتائج البحث — المبالغ ≥ 1000 تُعدّ بالليرة</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;">
                <input type="number" id="dollar-rate-input" placeholder="90000" min="1000" step="1000"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <button id="dollar-rate-save"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="dollar-rate-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🧑‍🤝‍🧑 عداد الزوار المباشر (Live Visitors)</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">مجال رقم إضافي عشوائي يُضاف على العدد الحقيقي</div>
                    <div class="setting-sub">
                        العداد أعلى يمين الصفحة الرئيسية يعرض عدد الزوار المتصلين فعلياً + رقم عشوائي بين الحدّين أدناه،
                        يتغيّر تلقائياً كل دقيقتين ليبدو طبيعياً بدل رقم ثابت. اجعل الحدّين 0 لعرض العدد الحقيقي فقط.
                    </div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;">
                <input type="number" id="presence-boost-min-input" placeholder="الحد الأدنى" min="0" step="1"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <input type="number" id="presence-boost-max-input" placeholder="الحد الأعلى" min="0" step="1"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <button id="presence-boost-save"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="presence-boost-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">📱 حدود التسجيل</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">الحد الأقصى للحسابات بنفس رقم الهاتف</div>
                    <div class="setting-sub">عدد الحسابات المسموح بها لكل رقم هاتف لبناني (الافتراضي: 1)</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;">
                <input type="number" id="max-accounts-phone-input" placeholder="1" min="1" max="10" step="1"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <button id="max-accounts-phone-save"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="max-accounts-phone-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
            <div class="setting-row" style="margin-top:14px;">
                <div>
                    <div class="setting-label">الحد الأقصى للحسابات بنفس الجهاز</div>
                    <div class="setting-sub">عدد الحسابات المسموح بها لكل جهاز (الافتراضي: 3)</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;">
                <input type="number" id="max-accounts-device-input" placeholder="3" min="1" max="20" step="1"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <button id="max-accounts-device-save"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="max-accounts-device-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">📞 رقم تواصل الإدارة (واتساب / اتصال)</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">رقم واتساب / هاتف الإدارة</div>
                    <div class="setting-sub">يظهر للعميل في سلّة الشراء — بالصيغة الدولية بدون + (مثال: 96176884643)</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;">
                <input type="tel" id="admin-phone-input" placeholder="96176884643"
                       style="flex:1;background:var(--surface2);border:1px solid var(--border);
                              border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);
                              font-family:var(--mono);font-size:0.85rem;direction:ltr;">
                <button id="admin-phone-save"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="admin-phone-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">📍 موقع مركز Delivo</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">الموقع الرئيسي (المقر)</div>
                    <div class="setting-sub">يظهر كنقطة ثابتة على الخريطة المباشرة كمرجع لموقع المركز</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;align-items:center;">
                <div id="center-loc-current" style="flex:1;font-family:var(--mono);font-size:0.8rem;color:var(--gray);">جارِ التحميل...</div>
                <button id="center-loc-change-btn"
                        style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    🗺 تغيير الموقع
                </button>
            </div>
            <div class="setting-row" style="gap:10px;align-items:center;border-top:1px solid var(--border);margin-top:10px;padding-top:12px;">
                <div>
                    <div class="setting-label">نطاق تغطية التوصيل (كم)</div>
                    <div class="setting-sub">الطلبات التي تقع خارج هذا النطاق من مركز Delivo تُرفض تلقائياً عند إتمام الطلب</div>
                </div>
            </div>
            <div class="setting-row" style="gap:10px;align-items:center;">
                <input id="coverage-radius-input" type="number" step="0.5" min="0.5" value="7"
                       style="width:110px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                              padding:8px 10px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;text-align:center;"
                       onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                <span style="font-size:0.78rem;color:var(--gray);">كم</span>
                <button id="coverage-radius-save-btn"
                        style="margin-right:auto;background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ النطاق
                </button>
            </div>
            <div id="coverage-radius-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🛵 آلية تعيين الطلبات للسائقين</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">من يستطيع تعيين السائق للطلب؟</div>
                    <div class="setting-sub">تحكّم بما إذا كان السائقون يستطيعون استلام الطلبات بأنفسهم من قائمة الطلبات المتاحة، أو أن الإدارة فقط من تُعيّن السائق، أو كلا الخيارين معاً</div>
                </div>
            </div>
            <div class="setting-row" style="gap:8px;flex-wrap:wrap;">
                <label class="assign-mode-opt" style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:8px 14px;cursor:pointer;flex:1;min-width:150px;">
                    <input type="radio" name="assign-mode" value="both" style="accent-color:var(--orange);">
                    <span style="font-size:0.8rem;font-weight:700;">🤝 كلاهما</span>
                </label>
                <label class="assign-mode-opt" style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:8px 14px;cursor:pointer;flex:1;min-width:150px;">
                    <input type="radio" name="assign-mode" value="driver_only" style="accent-color:var(--orange);">
                    <span style="font-size:0.8rem;font-weight:700;">🛵 السائق يستلم بنفسه فقط</span>
                </label>
                <label class="assign-mode-opt" style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:8px 14px;cursor:pointer;flex:1;min-width:150px;">
                    <input type="radio" name="assign-mode" value="admin_only" style="accent-color:var(--orange);">
                    <span style="font-size:0.8rem;font-weight:700;">👤 الإدارة فقط</span>
                </label>
            </div>
            <div class="setting-row" style="margin-top:8px;">
                <button id="assign-mode-save"
                        style="margin-right:auto;background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                               padding:8px 18px;font-weight:800;cursor:pointer;white-space:nowrap;">
                    💾 حفظ
                </button>
            </div>
            <div id="assign-mode-status" style="font-size:0.72rem;color:var(--green);display:none;margin-top:4px;"></div>
        </div>

        <!-- ═══════════════════════════════════════════════════════
             WORLD CUP 2026 PROMO — START
             Time-boxed marketing campaign, fully isolated. To retire
             it later, delete this whole <div id="wc2026-admin-section">
             block plus the wc2026Admin JS block further down (also
             clearly marked), and the matching customer-side files:
             scripts/worldcup2026.js, styles/worldcup2026.css, and the
             two HTML blocks marked "WORLD CUP 2026 PROMO" in index.html.
             Nothing else in the app depends on any of this.
        ═══════════════════════════════════════════════════════ -->
        <div class="settings-section" id="wc2026-admin-section">
            <div class="settings-section-title" id="wc2026-toggle-header"
                 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
                <span>🏆 حملة كأس العالم 2026 — اختر منتخبك واربح 100$</span>
                <span id="wc2026-toggle-chevron" style="transition:transform 0.2s;font-size:0.9rem;">▸</span>
            </div>

            <div id="wc2026-admin-body" style="display:none;padding:0 16px 16px;">
                <div id="wc2026-admin-loading" style="font-size:0.8rem;color:var(--gray);padding:10px 0 6px;">جارِ التحميل...</div>

                <!-- Shown only before the campaign has ever been launched -->
                <div id="wc2026-launch-row" style="display:none;">
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">لم يتم تفعيل الحملة بعد</div>
                            <div class="setting-sub">
                                يعرض التطبيق للعملاء أعلام وأسماء المنتخبات المتبقية في كأس العالم 2026، ويدعوهم لاختيار
                                منتخبهم والتسجيل للفوز بـ 100$ إذا فاز هذا المنتخب بالبطولة. تُفعَّل الحملة تلقائياً لمدة
                                14 يوماً من لحظة الضغط أدناه (يمكن تمديدها أو إيقافها يدوياً في أي وقت). تم تمييز بعض
                                المنتخبات كـ"خارج المنافسة" تلقائياً بناءً على آخر نتائج معروفة لدور الـ32 — يُنصح بمراجعة
                                القائمة والتأكد من تحديث بقية المنتخبات المستبعدة يدوياً.
                            </div>
                        </div>
                    </div>
                    <button id="wc2026-launch-btn"
                            style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                                   padding:9px 20px;font-weight:800;cursor:pointer;white-space:nowrap;">
                        🚀 تفعيل الحملة الآن
                    </button>
                </div>

                <!-- Shown once a config exists -->
                <div id="wc2026-config-row" style="display:none;">

                    <div class="setting-row" style="gap:14px;align-items:center;flex-wrap:wrap;">
                        <label class="toggle">
                            <input type="checkbox" id="wc2026-active-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                        <div>
                            <div class="setting-label" style="margin:0;">الحملة مفعّلة</div>
                            <div class="setting-sub" id="wc2026-expiry-text" style="margin:0;">—</div>
                        </div>
                        <button id="wc2026-extend-btn"
                                style="margin-right:auto;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);
                                       padding:7px 14px;color:var(--white);font-family:inherit;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                            🔄 تمديد أسبوعين
                        </button>
                    </div>

                    <div class="setting-row" style="gap:10px;align-items:center;">
                        <div class="setting-label" style="margin:0;">قيمة الجائزة</div>
                        <span style="color:var(--gray);">$</span>
                        <input id="wc2026-prize-input" type="number" min="1" step="1"
                               style="width:90px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                                      padding:7px 10px;color:var(--white);font-family:var(--mono);font-size:0.85rem;outline:none;text-align:center;">
                        <button id="wc2026-prize-save-btn"
                                style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                                       padding:7px 16px;font-weight:800;cursor:pointer;white-space:nowrap;">
                            💾 حفظ
                        </button>
                        <div style="margin-right:auto;font-size:0.8rem;color:var(--gray);">
                            إجمالي المسجّلين: <b id="wc2026-total-entries" style="color:var(--white);">0</b>
                        </div>
                    </div>

                    <div class="setting-row">
                        <input id="wc2026-team-search" type="text" placeholder="🔍 ابحث عن منتخب أو اسم مستخدم أو هاتف..."
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                                      padding:8px 12px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;box-sizing:border-box;">
                    </div>

                    <div class="setting-sub" style="padding:0 0 8px;">
                        فعّل مفتاح "خرج" فور خسارة المنتخب وخروجه من البطولة — يختفي فوراً من قائمة الاختيار لدى العملاء الجدد،
                        بينما يبقى العملاء المسجَّلون مسبقاً معه ضمن السحب (لأنهم اختاروه قبل خروجه، بحسب قواعد اللعبة).
                    </div>

                    <div id="wc2026-teams-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;max-height:420px;overflow-y:auto;padding-bottom:6px;"></div>

                    <!-- Winner draw tool ─────────────────────────────── -->
                    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
                        <div class="setting-label" style="margin-bottom:8px;">🎲 سحب الفائز (بعد تتويج البطل)</div>
                        <div class="setting-row" style="gap:10px;">
                            <select id="wc2026-draw-team-select"
                                    style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                                           padding:8px 10px;color:var(--white);font-family:inherit;font-size:0.82rem;outline:none;">
                                <option value="">اختر المنتخب البطل...</option>
                            </select>
                            <button id="wc2026-draw-btn"
                                    style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);
                                           padding:8px 16px;font-weight:800;cursor:pointer;white-space:nowrap;">
                                🎲 اختيار فائز عشوائي
                            </button>
                        </div>
                        <div id="wc2026-draw-result" style="display:none;margin-top:10px;padding:10px 14px;background:var(--surface2);border:1px solid rgba(255,92,0,0.3);border-radius:var(--radius-md);font-size:0.85rem;color:var(--white);"></div>
                    </div>
                </div>
            </div>
        </div>
        <!-- ═══════════════════════════════════════════════════════
             WORLD CUP 2026 PROMO — END (HTML)
        ═══════════════════════════════════════════════════════ -->

        <!-- ═══════════ REGISTRATION TYPE ═══════════ -->
        <div class="settings-section">
            <div class="settings-section-title">📝 نوع التسجيل</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">طريقة تفعيل الحساب</div>
                    <div class="setting-sub">اختر كيف يتحقق النظام من هوية العميل عند إنشاء الحساب</div>
                </div>
            </div>
            <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:10px;padding:12px 16px;">
                <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface2);border-radius:12px;border:2px solid transparent;cursor:pointer;transition:border-color .15s;" id="reg-type-direct-label">
                    <input type="radio" name="reg-type" id="reg-type-direct" value="direct" onchange="setRegType('direct')" style="accent-color:var(--orange);width:16px;height:16px;flex-shrink:0;">
                    <div>
                        <div style="font-weight:800;font-size:0.85rem;">✅ التسجيل المباشر (الحالي)</div>
                        <div style="font-size:0.7rem;color:var(--gray);margin-top:2px;">العميل يملأ البيانات ويسجل مباشرة بدون تحقق</div>
                    </div>
                </label>
                <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface2);border-radius:12px;border:2px solid transparent;cursor:pointer;transition:border-color .15s;" id="reg-type-otp-label">
                    <input type="radio" name="reg-type" id="reg-type-otp" value="otp" onchange="setRegType('otp')" style="accent-color:var(--orange);width:16px;height:16px;flex-shrink:0;">
                    <div>
                        <div style="font-weight:800;font-size:0.85rem;">🔐 تفعيل بـ OTP عبر واتساب</div>
                        <div style="font-size:0.7rem;color:var(--gray);margin-top:2px;">يرسل كود تحقق للعميل على واتساب عبر GREEN-API قبل إنشاء الحساب</div>
                    </div>
                </label>
            </div>

            <!-- GREEN-API credentials — shown only when OTP selected -->
            <div id="ultramsg-section" style="display:none;border-top:1px solid var(--border);padding:14px 16px;">
                <div style="font-size:0.72rem;font-weight:800;color:var(--gray);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">⚙️ إعدادات GREEN-API</div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    <div>
                        <label style="font-size:0.72rem;font-weight:800;color:var(--gray);display:block;margin-bottom:4px;">Instance ID</label>
                        <input type="text" id="ultramsg-instance" placeholder="مثال: 7187016677771" dir="ltr"
                               style="width:100%;padding:8px 12px;background:var(--surface);border:1px solid var(--border-bright);border-radius:10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;">
                    </div>
                    <div>
                        <label style="font-size:0.72rem;font-weight:800;color:var(--gray);display:block;margin-bottom:4px;">Token</label>
                        <input type="text" id="ultramsg-token" placeholder="الـ apiTokenInstance من لوحة GREEN-API" dir="ltr"
                               style="width:100%;padding:8px 12px;background:var(--surface);border:1px solid var(--border-bright);border-radius:10px;color:var(--white);font-family:var(--mono);font-size:0.82rem;outline:none;">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button onclick="saveUltraMsgConfig()" style="flex:1;padding:9px;background:var(--orange);border:none;border-radius:10px;color:#fff;font-family:inherit;font-weight:800;font-size:0.82rem;cursor:pointer;">💾 حفظ الإعدادات</button>
                        <button onclick="testUltraMsg()" style="flex:1;padding:9px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);border-radius:10px;color:#25d366;font-family:inherit;font-weight:800;font-size:0.82rem;cursor:pointer;">🧪 اختبار الإرسال</button>
                    </div>
                    <div id="ultramsg-status" style="display:none;font-size:0.75rem;font-weight:700;padding:8px 12px;border-radius:8px;"></div>
                    <div style="font-size:0.68rem;color:var(--gray);line-height:1.6;">
                        🔗 احصل على Instance ID و Token من <a href="https://app.green-api.com" target="_blank" style="color:var(--orange);">app.green-api.com</a>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══════════ DRIVER ASSIGNMENT NOTIFICATION METHOD ═══════════ -->
        <div class="settings-section">
            <div class="settings-section-title">🔔 تنبيه السائق عند تعيين طلب</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">طريقة إبلاغ السائق بطلب جديد مُعيَّن له</div>
                    <div class="setting-sub">يُطبَّق عند تعيين سائق لطلب من لوحة الطلبات أو الخريطة</div>
                </div>
            </div>
            <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:10px;padding:12px 16px;">
                <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface2);border-radius:12px;border:2px solid transparent;cursor:pointer;transition:border-color .15s;" id="drv-notify-app-label">
                    <input type="radio" name="drv-notify-method" id="drv-notify-app" value="app" onchange="setDriverAssignNotifyMethod('app')" style="accent-color:var(--orange);width:16px;height:16px;flex-shrink:0;">
                    <div>
                        <div style="font-weight:800;font-size:0.85rem;">📱 تنبيه داخل تطبيق السائق (الافتراضي)</div>
                        <div style="font-size:0.7rem;color:var(--gray);margin-top:2px;">يظهر إشعار فوري للسائق إذا كان قد فتح صفحته</div>
                    </div>
                </label>
                <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface2);border-radius:12px;border:2px solid transparent;cursor:pointer;transition:border-color .15s;" id="drv-notify-whatsapp-label">
                    <input type="radio" name="drv-notify-method" id="drv-notify-whatsapp" value="whatsapp" onchange="setDriverAssignNotifyMethod('whatsapp')" style="accent-color:var(--orange);width:16px;height:16px;flex-shrink:0;">
                    <div>
                        <div style="font-weight:800;font-size:0.85rem;">💬 رسالة واتساب عبر GREEN-API</div>
                        <div style="font-size:0.7rem;color:var(--gray);margin-top:2px;">يُرسل للسائق على واتساب فوراً — يستخدم نفس إعدادات GREEN-API أعلاه</div>
                    </div>
                </label>
            </div>
            <div id="drv-notify-status" style="font-size:0.72rem;color:var(--green);display:none;margin:0 16px 12px;"></div>
        </div>

        <div class="settings-section">
            <div class="settings-section-title">🧪 وضع التجربة</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label" style="display:flex;align-items:center;gap:8px;">
                        تفعيل وضع التجربة
                        <span id="test-mode-badge" style="display:none;font-size:0.62rem;font-weight:800;background:rgba(234,179,8,0.15);color:#eab308;border-radius:50px;padding:2px 8px;">مفعّل</span>
                    </div>
                    <div class="setting-sub">يعرض للعملاء شريطاً تنبيهياً يوضح أن الموقع في طور التجربة وليس جاهزاً للخدمة الفعلية بعد</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-test-mode" onchange="setTestMode(this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div id="test-mode-preview" style="display:none;margin:0 16px 14px;border-radius:10px;overflow:hidden;border:1px solid rgba(234,179,8,0.3);">
                <div style="background:linear-gradient(90deg,#78350f,#92400e);padding:10px 14px;display:flex;align-items:center;gap:10px;">
                    <span style="font-size:1.1rem;">🧪</span>
                    <div>
                        <div style="font-size:0.78rem;font-weight:800;color:#fef3c7;">هذا الموقع قيد التجربة حالياً</div>
                        <div style="font-size:0.68rem;color:#fde68a;margin-top:2px;">لا يتم قبول طلبات حقيقية في الوقت الحالي — سيُعلَن عن الإطلاق الرسمي قريباً</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">وضع الصيانة</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">تفعيل وضع الصيانة</div>
                    <div class="setting-sub">يوقف الموقع عن العملاء ويعرض رسالة صيانة</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-maintenance" onchange="setMaintenance(this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">⭐ إظهار نظام النقاط والمكافآت</div>
                    <div class="setting-sub">عند الإخفاء تستمر النقاط بالتجمع لكن العميل لا يراها. عند الإظهار تعود جميع النقاط والمكافآت المتراكمة</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-loyalty" onchange="setLoyaltyVisible(this.checked)" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">🏪 إظهار قسم "المتاجر الأكثر طلباً"</div>
                    <div class="setting-sub">يخفي هذا القسم بالكامل من الصفحة الرئيسية للعملاء</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-top-stores" onchange="setTopStoresVisible(this.checked)" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">👋 تفعيل شاشة التعريف بالتطبيق (Onboarding)</div>
                    <div class="setting-sub">تُعرض تلقائياً لأول زيارة فقط لكل مستخدم جديد. عند التعطيل لا تظهر إطلاقاً حتى للزوار الجدد</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-intro" onchange="setIntroEnabled(this.checked)" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">📍 إلزامية تحديد موقع التوصيل</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">إلزام العميل بتحديد الموقع (موقعي الحالي أو تحديد يدوي) قبل إرسال الطلب</div>
                    <div class="setting-sub">عند التفعيل (الافتراضي) لا يمكن الضغط على "إرسال الطلب" بدون موقع محدد. عند التعطيل يُسمح بالإرسال بدون موقع بعد تحذير العميل بأن طلبه سيصل بدون موقع دقيق</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-require-location" onchange="setRequireLocation(this.checked)" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        <div class="settings-section" id="delivery-settings-section">
            <div class="settings-section-title">🛵 رسوم التوصيل</div>

            <!-- Flat fee row -->
            <div class="setting-row">
                <div>
                    <div class="setting-label">الرسوم الثابتة لكل متجر ($)</div>
                    <div class="setting-sub">تُطبَّق عندما يكون الوضع الذكي غير مفعّل</div>
                </div>
                <input type="number" id="delivery-fee-input" value="2" min="0" step="0.5"
                       style="width:70px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:6px 10px;color:var(--white);font-family:var(--mono);outline:none;text-align:center;"
                       onchange="setDeliveryFee(this.value)">
            </div>

            <!-- Smart delivery toggle -->
            <div class="setting-row" style="border-top:1px solid var(--border);">
                <div>
                    <div class="setting-label" style="display:flex;align-items:center;gap:8px;">
                        ✨ التوصيل الذكي
                        <span id="smart-mode-badge" style="display:none;font-size:0.62rem;font-weight:800;background:rgba(255,92,0,0.15);color:var(--orange);border-radius:50px;padding:2px 8px;">مفعّل</span>
                    </div>
                    <div class="setting-sub">يحسب الرسوم تلقائياً بناءً على المسافة وإجمالي الطلب</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-smart-delivery" onchange="toggleSmartDelivery(this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <!-- Smart delivery config (shown only when enabled) -->
            <div id="smart-delivery-config" style="display:none;border-top:1px solid var(--border);padding:16px;">

                <!-- Mode switch -->
                <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:4px;">
                    <button type="button" id="sd-mode-btn-formula" onclick="sdSwitchMode('formula')"
                            style="flex:1;padding:9px 8px;border:none;border-radius:9px;font-family:var(--font);font-weight:800;font-size:0.76rem;cursor:pointer;transition:all 0.15s;background:var(--orange);color:#fff;">
                        🧮 معادلة حسابية
                    </button>
                    <button type="button" id="sd-mode-btn-centerTiers" onclick="sdSwitchMode('centerTiers')"
                            style="flex:1;padding:9px 8px;border:none;border-radius:9px;font-family:var(--font);font-weight:800;font-size:0.76rem;cursor:pointer;transition:all 0.15s;background:transparent;color:var(--gray-light);">
                        📍 شرائح المسافة من المركز
                    </button>
                </div>

                <!-- ═══ FORMULA MODE ═══ -->
                <div id="sd-mode-formula-fields">

                <!-- Formula preview -->
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:0.72rem;color:var(--gray-light);">
                    <div style="color:var(--orange);font-weight:800;margin-bottom:4px;">📐 الصيغة الحسابية</div>
                    <code>رسوم = max(حد_أدنى, رسوم_أساسية + كم × معدل_كم) − خصم_الشريحة</code>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">الرسوم الأساسية ($)</label>
                        <input type="number" id="sd-base-fee" value="1.5" min="0" step="0.25"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                        <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">تُضاف لكل متجر بغض النظر عن المسافة</div>
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">معدل المسافة ($/كم)</label>
                        <input type="number" id="sd-rate-km" value="0.3" min="0" step="0.05"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                        <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">تُضرب في المسافة بالكيلومتر</div>
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">الحد الأدنى ($)</label>
                        <input type="number" id="sd-min-fee" value="0.5" min="0" step="0.25"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">الحد الأقصى ($)</label>
                        <input type="number" id="sd-max-fee" value="5.0" min="0" step="0.5"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='var(--orange)'" onblur="this.style.borderColor='var(--border)'">
                    </div>
                </div>

                </div>
                <!-- ═══ END FORMULA MODE ═══ -->

                <!-- ═══ CENTER-TIERS MODE ═══ -->
                <div id="sd-mode-centertiers-fields" style="display:none;">

                    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:0.72rem;color:var(--gray-light);line-height:1.7;">
                        <div style="color:var(--orange);font-weight:800;margin-bottom:4px;">📍 كيف تعمل؟</div>
                        تُقاس المسافة من <b style="color:var(--white);">موقع مركز ديليفو</b> (المحدَّد في "الخريطة المباشرة") إلى موقع الزبون، ثم يُطبَّق سعر الشريحة التي تقع ضمنها هذه المسافة — بدل صيغة حسابية.
                    </div>

                    <div style="margin-bottom:14px;">
                        <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
                            <span>📐 شرائح المسافة والسعر</span>
                            <button onclick="sdAddCenterTier()" style="background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:8px;padding:4px 10px;font-family:var(--font);font-size:0.7rem;font-weight:800;cursor:pointer;">+ شريحة مسافة</button>
                        </div>
                        <div style="font-size:0.65rem;color:var(--gray);margin-bottom:8px;">مثال: من 0 إلى 2 كم = 50,000 ل.ل، من 2 إلى 3 كم = 75,000 ل.ل، ثم اترك "إلى" فارغة بآخر شريحة لتعني "وما فوق"</div>
                        <div id="sd-centertiers-list" style="display:flex;flex-direction:column;gap:8px;"></div>
                    </div>

                    <!-- Live preview (center-tiers mode) -->
                    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
                        <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:10px;">🧪 اختبار مباشر</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                            <div>
                                <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">المسافة من المركز (كم)</label>
                                <input type="number" id="sd-ct-test-km" value="3" min="0" step="0.5"
                                       style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">الرسوم المطابقة</label>
                                <div id="sd-ct-test-result" style="background:rgba(255,92,0,0.1);border:1px solid rgba(255,92,0,0.3);border-radius:8px;padding:7px 8px;font-family:var(--mono);font-size:0.88rem;font-weight:800;color:var(--orange);text-align:center;">—</div>
                            </div>
                        </div>
                        <button onclick="sdRunCenterTierPreview()" style="width:100%;padding:8px;background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:8px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.8rem;">▶ احسب</button>
                    </div>

                </div>
                <!-- ═══ END CENTER-TIERS MODE ═══ -->

                <!-- Discount tiers (shared across both modes) -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
                        <span>🏷 شرائح خصم الإجمالي</span>
                        <button onclick="sdAddTier()" style="background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:8px;padding:4px 10px;font-family:var(--font);font-size:0.7rem;font-weight:800;cursor:pointer;">+ شريحة</button>
                    </div>
                    <div style="font-size:0.65rem;color:var(--gray);margin-bottom:8px;">إذا بلغ إجمالي المتجر الحد المحدد، يُخصم المبلغ من رسوم التوصيل</div>
                    <div id="sd-tiers-list" style="display:flex;flex-direction:column;gap:8px;"></div>
                </div>

                <!-- Live preview (formula mode) -->
                <div id="sd-mode-formula-preview" style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
                    <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:10px;">🧪 اختبار مباشر</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">إجمالي المتجر ($)</label>
                            <input type="number" id="sd-test-total" value="10" min="0" step="1"
                                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">المسافة (كم)</label>
                            <input type="number" id="sd-test-km" value="3" min="0" step="0.5"
                                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">الرسوم المحسوبة</label>
                            <div id="sd-test-result" style="background:rgba(255,92,0,0.1);border:1px solid rgba(255,92,0,0.3);border-radius:8px;padding:7px 8px;font-family:var(--mono);font-size:0.88rem;font-weight:800;color:var(--orange);text-align:center;">—</div>
                        </div>
                    </div>
                    <button onclick="sdRunPreview()" style="width:100%;padding:8px;background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:8px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.8rem;">▶ احسب</button>
                </div>

                <button onclick="sdSave()" style="width:100%;padding:11px;background:var(--green);color:#fff;border:none;border-radius:10px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.88rem;">
                    💾 حفظ إعدادات التوصيل الذكي
                </button>
            </div>

            <!-- Night delivery surcharge -->
            <div class="setting-row" style="border-top:1px solid var(--border);">
                <div>
                    <div class="setting-label" style="display:flex;align-items:center;gap:8px;">
                        🌙 التوصيل الليلي
                        <span id="night-mode-badge" style="display:none;font-size:0.62rem;font-weight:800;background:rgba(129,140,248,0.15);color:#818cf8;border-radius:50px;padding:2px 8px;">مفعّل</span>
                    </div>
                    <div class="setting-sub">إضافة ثابتة بالليرة اللبنانية طوال الفترة الليلية بالكامل، فوق أي رسوم توصيل عادية أو ذكية</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-night-delivery" onchange="toggleNightDelivery(this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div id="night-delivery-config" style="display:none;border-top:1px solid var(--border);padding:16px;">

                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:0.72rem;color:var(--gray-light);line-height:1.7;">
                    <div style="color:#818cf8;font-weight:800;margin-bottom:4px;">🌙 كيف تعمل؟</div>
                    رسم ثابت يُضاف بنفس القيمة طوال الفترة الليلية بالكامل — من لحظة البداية حتى لحظة النهاية دون أي تدرّج، فوق الرسوم العادية (ثابتة كانت أو ذكية). القيم تُدخل بالليرة اللبنانية (ل.ل).
                    <br><code>الإضافة = الرسم_الثابت (ل.ل) + كم × الرسم_لكل_كم (ل.ل)</code> — تُطبّق بالكامل طوال فترة الليل، صفر خارجها
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">بداية الفترة الليلية</label>
                        <input type="number" id="nd-start-hour" value="22" min="0" max="23" step="1"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='var(--border)'">
                        <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">بتوقيت بيروت (0–23)</div>
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">نهاية الفترة الليلية</label>
                        <input type="number" id="nd-end-hour" value="6" min="0" max="23" step="1"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='var(--border)'">
                        <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">يمكن أن تمتد بعد منتصف الليل</div>
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">الإضافة الليلية الثابتة (ل.ل)</label>
                        <input type="number" id="nd-flat-fee" value="90000" min="0" step="5000"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='var(--border)'">
                    </div>
                    <div>
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;display:block;margin-bottom:5px;">إضافة لكل كم (ل.ل)</label>
                        <input type="number" id="nd-per-km" value="0" min="0" step="1000"
                               style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--white);font-family:var(--mono);outline:none;box-sizing:border-box;"
                               onfocus="this.style.borderColor='#818cf8'" onblur="this.style.borderColor='var(--border)'">
                        <div style="font-size:0.65rem;color:var(--gray);margin-top:3px;">اختياري — اتركه 0 لتجاهل المسافة</div>
                    </div>
                </div>

                <!-- 24h intensity curve preview -->
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;">
                    <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
                        <span>📊 الفترة الليلية الفعّالة خلال 24 ساعة</span>
                        <span id="nd-now-label" style="color:#818cf8;font-family:var(--mono);"></span>
                    </div>
                    <div id="nd-curve-wrap"></div>
                </div>

                <!-- Live test calculator -->
                <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:14px;">
                    <div style="font-size:0.72rem;color:var(--gray);font-weight:800;margin-bottom:10px;">🧪 اختبار مباشر</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">الساعة (0-23)</label>
                            <input type="number" id="nd-test-hour" value="23" min="0" max="23" step="1"
                                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">المسافة (كم)</label>
                            <input type="number" id="nd-test-km" value="3" min="0" step="0.5"
                                   style="width:100%;background:var(--surface3,#1a1a2a);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--white);font-family:var(--mono);font-size:0.8rem;outline:none;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;color:var(--gray);display:block;margin-bottom:4px;">الإضافة الليلية</label>
                            <div id="nd-test-result" style="background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.35);border-radius:8px;padding:7px 8px;font-family:var(--mono);font-size:0.88rem;font-weight:800;color:#818cf8;text-align:center;">—</div>
                        </div>
                    </div>
                </div>

                <button onclick="ndSave()" style="width:100%;padding:11px;background:var(--green);color:#fff;border:none;border-radius:10px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.88rem;">
                    💾 حفظ إعدادات التوصيل الليلي
                </button>
            </div>
        </div>
        <div class="settings-section" id="otlob-fast-items-section">
            <div class="settings-section-title" id="ofi-toggle-header"
                 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
                <span>🍽 أصناف اطلب السريعة</span>
                <div style="display:flex;align-items:center;gap:12px;">
                    <label class="toggle" style="transform:scale(0.8);" title="إظهار/إخفاء أزرار الفئات السريعة للعميل"
                           onclick="event.stopPropagation();">
                        <input type="checkbox" id="ofi-enabled-toggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                    <span id="ofi-toggle-chevron" style="transition:transform 0.2s;font-size:0.9rem;">▸</span>
                </div>
            </div>
            <div id="ofi-admin-body" style="display:none;padding:16px;">
                <div style="font-size:0.72rem;color:var(--gray);margin-bottom:14px;line-height:1.6;">
                    الفئات والأصناف التي تظهر كأزرار سريعة للعميل عند وصف طلبه في نموذج "اطلب خارجي" — كل فئة (مثل 🍔 برغر) تفتح قائمة منبثقة بأصنافها الفرعية.
                </div>
                <div id="ofi-categories-list" style="display:flex;flex-direction:column;gap:10px;"></div>
                <button onclick="ofiAddCategory()" style="margin-top:12px;width:100%;padding:9px;background:rgba(255,92,0,0.12);color:var(--orange);border:1px solid rgba(255,92,0,0.3);border-radius:8px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.8rem;">+ فئة جديدة</button>
                <button onclick="ofiSave()" style="margin-top:14px;width:100%;padding:11px;background:var(--green);color:#fff;border:none;border-radius:10px;font-family:var(--font);font-weight:800;cursor:pointer;font-size:0.88rem;">
                    💾 حفظ الأصناف السريعة
                </button>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">الحد اليومي للطلبات</div>
            <div class="setting-row">
                <div>
                    <div class="setting-label">أقصى طلبات يومية للعميل</div>
                    <div class="setting-sub">يُقرأ من /settings/orders/maxPerDay</div>
                </div>
                <input type="number" id="max-orders-input" value="3" min="1" max="20"
                       style="width:70px;background:var(--surface2);border:1.5px solid var(--border);
                              border-radius:var(--radius-md);padding:6px 10px;color:var(--white);
                              font-family:var(--mono);outline:none;text-align:center;"
                       onchange="setMaxOrders(this.value)">
            </div>
        </div>
        <div class="settings-section">
            <!-- Collapsible header — starts closed, + expands to show all store keyword editors -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;user-select:none;"
                 onclick="(function(btn,body){
                     const open = body.style.display !== 'none';
                     body.style.display = open ? 'none' : 'block';
                     btn.textContent = open ? '+' : '−';
                     btn.style.transform = open ? 'rotate(0deg)' : 'rotate(0deg)';
                 })(this.querySelector('.kw-toggle-btn'), document.getElementById('kw-body'))">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.72rem;font-weight:800;color:var(--gray);letter-spacing:1px;text-transform:uppercase;">📝 خصائص الطلبات — Keywords</span>
                    <span style="font-size:0.65rem;color:var(--gray);font-weight:600;">(اضغط لعرض / إخفاء)</span>
                </div>
                <button class="kw-toggle-btn"
                        style="width:26px;height:26px;border-radius:50%;background:var(--orange);color:#fff;
                               border:none;font-size:1.1rem;font-weight:900;cursor:pointer;line-height:1;
                               display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
            </div>
            <!-- Collapsible body — hidden by default -->
            <div id="kw-body" style="display:none;border-top:1px solid var(--border);">
            <div class="setting-row setting-row--col" style="padding:14px 16px;">
                <div>
                    <div class="setting-label">خصائص المطاعم</div>
                    <div class="setting-sub">تظهر للعميل عند الطلب من مطعم (مثال: بدون ثوم، إضافي صوص)</div>
                </div>
                <div style="width:100%;">
                    <div id="kw-restaurants-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:28px;"></div>
                    <div style="display:flex;gap:8px;">
                        <input id="kw-restaurants-input" type="text" placeholder="اكتب خاصية واضغط Enter…"
                               style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-md);
                                      padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.82rem;outline:none;direction:rtl;"
                               onkeydown="if(event.key==='Enter'){event.preventDefault();kwAddChip('Restaurants');}">
                        <button onclick="kwAddChip('Restaurants')"
                                style="padding:8px 16px;background:var(--orange);color:#fff;border:none;border-radius:var(--radius-md);
                                       font-family:'Almarai',sans-serif;font-weight:700;cursor:pointer;font-size:0.82rem;flex-shrink:0;">+ إضافة</button>
                    </div>
                    <button onclick="kwSave('Restaurants')"
                            style="margin-top:10px;width:100%;padding:9px;background:rgba(34,197,94,0.12);color:#22c55e;
                                   border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-md);font-family:'Almarai',sans-serif;
                                   font-weight:700;cursor:pointer;font-size:0.82rem;">💾 حفظ خصائص المطاعم</button>
                </div>
            </div>
            <div class="setting-row setting-row--col" style="padding:14px 16px;border-top:1px solid var(--border);">
                <div>
                    <div class="setting-label">خصائص الأفران</div>
                    <div class="setting-sub">تظهر للعميل عند الطلب من مخبز (مثال: بدون سكر، مشوي إضافي)</div>
                </div>
                <div style="width:100%;">
                    <div id="kw-bakery-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:28px;"></div>
                    <div style="display:flex;gap:8px;">
                        <input id="kw-bakery-input" type="text" placeholder="اكتب خاصية واضغط Enter…"
                               style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-md);
                                      padding:8px 12px;color:var(--white);font-family:'Almarai',sans-serif;font-size:0.82rem;outline:none;direction:rtl;"
                               onkeydown="if(event.key==='Enter'){event.preventDefault();kwAddChip('BakeryShops');}">
                        <button onclick="kwAddChip('BakeryShops')"
                                style="padding:8px 16px;background:var(--orange);color:#fff;border:none;border-radius:var(--radius-md);
                                       font-family:'Almarai',sans-serif;font-weight:700;cursor:pointer;font-size:0.82rem;flex-shrink:0;">+ إضافة</button>
                    </div>
                    <button onclick="kwSave('BakeryShops')"
                            style="margin-top:10px;width:100%;padding:9px;background:rgba(34,197,94,0.12);color:#22c55e;
                                   border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-md);font-family:'Almarai',sans-serif;
                                   font-weight:700;cursor:pointer;font-size:0.82rem;">💾 حفظ خصائص الأفران</button>
                </div>
            </div>
            </div><!-- /kw-body -->
        </div>
        <div class="settings-section">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;user-select:none;"
                 onclick="(function(btn,body){
                     const open = body.style.display !== 'none';
                     body.style.display = open ? 'none' : 'block';
                     btn.textContent = open ? '+' : '−';
                 })(this.querySelector('.typeorder-toggle-btn'), document.getElementById('typeorder-body'))">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.72rem;font-weight:800;color:var(--gray);letter-spacing:1px;text-transform:uppercase;">🏷️ ترتيب أقسام المتاجر</span>
                    <span style="font-size:0.65rem;color:var(--gray);font-weight:600;">(اضغط لعرض / إخفاء)</span>
                </div>
                <button class="typeorder-toggle-btn"
                        style="width:26px;height:26px;border-radius:50%;background:var(--orange);color:#fff;
                               border:none;font-size:1.1rem;font-weight:900;cursor:pointer;line-height:1;
                               display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
            </div>
            <div id="typeorder-body" style="display:none;border-top:1px solid var(--border);padding:14px 16px;">
                <div>
                    <div class="setting-label">اسحب وأفلت لإعادة ترتيب الأقسام</div>
                    <div class="setting-sub">يؤثر على شريط الفلتر في لوحة الإدارة وأيقونات الأقسام في التطبيق</div>
                </div>
                <div id="typeorder-list" style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:12px;"></div>
                <button onclick="saveTypeOrder()" class="ph-btn ph-btn--primary" style="margin-top:12px;width:100%;justify-content:center;">
                    💾 حفظ الترتيب
                </button>
            </div>
        </div>
        <div class="settings-section">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;user-select:none;"
                 onclick="(function(btn,body){
                     const open = body.style.display !== 'none';
                     body.style.display = open ? 'none' : 'block';
                     btn.textContent = open ? '+' : '−';
                 })(this.querySelector('.mealtime-toggle-btn'), document.getElementById('mealtime-body'))">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.72rem;font-weight:800;color:var(--gray);letter-spacing:1px;text-transform:uppercase;">🍽️ أوقات الوجبات</span>
                    <span style="font-size:0.65rem;color:var(--gray);font-weight:600;">(اضغط لعرض / إخفاء)</span>
                </div>
                <button class="mealtime-toggle-btn"
                        style="width:26px;height:26px;border-radius:50%;background:var(--orange);color:#fff;
                               border:none;font-size:1.1rem;font-weight:900;cursor:pointer;line-height:1;
                               display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
            </div>
            <div id="mealtime-body" style="display:none;border-top:1px solid var(--border);padding:14px 16px;">
                <div class="setting-sub" style="margin-bottom:14px;">
                    حدّد الساعات التي يظهر فيها كل قسم وجبة في التطبيق. الساعات بصيغة 24h (0–23). كل وجبة تظهر من ساعة البداية حتى ساعة قبل ساعة النهاية.
                </div>

                <!-- Breakfast -->
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:1.4rem;width:32px;text-align:center;">🍳</span>
                    <div style="flex:1;">
                        <div class="setting-label">الفطور</div>
                        <div class="setting-sub">وقت الفطور</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">من</label>
                        <input type="number" id="mt-breakfast-from" min="0" max="23" value="6"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">إلى</label>
                        <input type="number" id="mt-breakfast-to" min="1" max="24" value="11"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                    </div>
                </div>

                <!-- Lunch -->
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:1.4rem;width:32px;text-align:center;">🍽</span>
                    <div style="flex:1;">
                        <div class="setting-label">الغداء</div>
                        <div class="setting-sub">وقت الغداء</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">من</label>
                        <input type="number" id="mt-lunch-from" min="0" max="23" value="11"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">إلى</label>
                        <input type="number" id="mt-lunch-to" min="1" max="24" value="16"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                    </div>
                </div>

                <!-- Snack -->
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:1.4rem;width:32px;text-align:center;">☕</span>
                    <div style="flex:1;">
                        <div class="setting-label">السناك</div>
                        <div class="setting-sub">وقت الاستراحة</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">من</label>
                        <input type="number" id="mt-snack-from" min="0" max="23" value="16"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">إلى</label>
                        <input type="number" id="mt-snack-to" min="1" max="24" value="19"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                    </div>
                </div>

                <!-- Dinner -->
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:1.4rem;width:32px;text-align:center;">🌙</span>
                    <div style="flex:1;">
                        <div class="setting-label">العشاء</div>
                        <div class="setting-sub">وقت العشاء</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">من</label>
                        <input type="number" id="mt-dinner-from" min="0" max="23" value="19"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                        <label style="font-size:0.72rem;color:var(--gray);font-weight:700;">إلى</label>
                        <input type="number" id="mt-dinner-to" min="1" max="24" value="24"
                               style="width:52px;padding:5px 6px;background:var(--surface2);border:1px solid var(--border-bright);
                                      border-radius:var(--radius-sm);color:var(--white);font-size:0.85rem;text-align:center;
                                      font-family:var(--mono);outline:none;">
                    </div>
                </div>

                <div id="mealtime-status" style="display:none;font-size:0.78rem;font-weight:700;margin-top:10px;"></div>
                <button onclick="saveMealTimes()"
                        style="margin-top:12px;width:100%;padding:9px;background:rgba(255,92,0,0.12);color:var(--orange);
                               border:1px solid rgba(255,92,0,0.3);border-radius:var(--radius-md);font-family:'Almarai',sans-serif;
                               font-weight:700;cursor:pointer;font-size:0.85rem;">💾 حفظ أوقات الوجبات</button>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">معلومات النظام</div>
            <div class="setting-row">
                <div><div class="setting-label">Firebase Project</div><div class="setting-sub" style="font-family:var(--mono);">deliveryonline-300f7</div></div>
            </div>
            <div class="setting-row">
                <div><div class="setting-label">آخر تحديث للبيانات</div></div>
                <span style="font-size:0.72rem;color:var(--gray);font-family:var(--mono);" id="last-refresh-time">${new Date().toLocaleTimeString('ar')}</span>
            </div>
        </div>
    `;
    // Load registration type
    Promise.all([
        fbGet('settings/regType'),
        fbGet('settings/greenApiInstance'),
        fbGet('settings/greenApiToken'),
        fbGet('settings/driverAssignNotifyMethod'),
    ]).then(([regType, uInst, uToken, drvNotifyMethod]) => {
        _syncRegTypeUI(regType || 'direct');
        const instEl = document.getElementById('ultramsg-instance');
        const tokEl  = document.getElementById('ultramsg-token');
        if (instEl && uInst) instEl.value = uInst;
        if (tokEl  && uToken) tokEl.value = uToken;
        // Make available to modal-auth.js for OTP sending
        window._greenApiInstance = uInst  || '';
        window._greenApiToken    = uToken || '';
        // Driver assignment notification method (app | whatsapp)
        window._driverAssignNotifyMethod = drvNotifyMethod || 'app';
        _syncDriverNotifyUI(window._driverAssignNotifyMethod);
    });

    // Load loyalty visibility state
    fbGet('settings/loyaltyVisible').then(val => {
        const toggle = document.getElementById('toggle-loyalty');
        if (toggle) toggle.checked = (val === null || val === undefined || val === true || val === 'true');
    });
    // Load current "top stores" section visibility state
    fbGet('settings/topStoresVisible').then(val => {
        const toggle = document.getElementById('toggle-top-stores');
        if (toggle) toggle.checked = (val === null || val === undefined || val === true || val === 'true');
    });
    // Load current onboarding-intro enabled state
    fbGet('settings/introEnabled').then(val => {
        const toggle = document.getElementById('toggle-intro');
        if (toggle) toggle.checked = (val === null || val === undefined || val === true || val === 'true');
    });
    // Load current maintenance state — reads from settings/maintenance (same path setMaintenance writes to)
    fbGet('settings/maintenance').then(val => {
        const isOn = val === true || val === 'true';
        const toggle = document.getElementById('toggle-maintenance');
        if (toggle) toggle.checked = isOn;
    }).catch(() => {});
    // Load test mode state  ← FIX: was never loaded after DOM injection
    renderTypeOrderList();
    renderAdminFilterBar();
    // Load dollarRate
    fbGet('settings/dollarRate').then(val => {
        const inp = document.getElementById('dollar-rate-input');
        if (inp && val) inp.value = val;
    }).catch(() => {});

    document.getElementById('dollar-rate-save')?.addEventListener('click', async () => {
        const inp    = document.getElementById('dollar-rate-input');
        const status = document.getElementById('dollar-rate-status');
        const rate   = parseFloat(inp?.value || '');
        if (!rate || rate < 1000) {
            if (status) { status.textContent = '⚠️ أدخل سعراً صحيحاً (أكثر من 1000)'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        try {
            await fbSet('settings/dollarRate', rate);
            window._dollarRate = rate;
            if (status) { status.textContent = `✅ تم حفظ — 1$ = ${rate.toLocaleString('ar')} ل.ل`; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    // Load orderAssignmentMode (default 'both' preserves existing behaviour)
    fbGet('settings/orderAssignmentMode').then(val => {
        const mode = val || 'both';
        const radio = document.querySelector(`input[name="assign-mode"][value="${mode}"]`);
        if (radio) radio.checked = true;
    }).catch(() => {
        const radio = document.querySelector(`input[name="assign-mode"][value="both"]`);
        if (radio) radio.checked = true;
    });

    document.getElementById('assign-mode-save')?.addEventListener('click', async () => {
        const status = document.getElementById('assign-mode-status');
        const checked = document.querySelector('input[name="assign-mode"]:checked');
        const mode = checked ? checked.value : 'both';
        try {
            await fbSet('settings/orderAssignmentMode', mode);
            _assignmentMode = mode; // update local cache immediately
            renderOrders(); renderOnlineRequests();
            const labels = { both: 'كلاهما', driver_only: 'السائق يستلم بنفسه فقط', admin_only: 'الإدارة فقط' };
            if (status) { status.textContent = `✅ تم الحفظ — ${labels[mode]}`; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    // Load presenceBoost (supports the old single-number format too)
    fbGet('settings/presenceBoost').then(val => {
        const minInp = document.getElementById('presence-boost-min-input');
        const maxInp = document.getElementById('presence-boost-max-input');
        let min = 0, max = 0;
        if (val && typeof val === 'object') {
            min = (typeof val.min === 'number' && val.min > 0) ? val.min : 0;
            max = (typeof val.max === 'number' && val.max > 0) ? val.max : 0;
        } else if (typeof val === 'number' && val > 0) {
            min = max = val; // legacy static value — show as a fixed range
        }
        if (minInp) minInp.value = min;
        if (maxInp) maxInp.value = max;
    }).catch(() => {});

    document.getElementById('presence-boost-save')?.addEventListener('click', async () => {
        const minInp = document.getElementById('presence-boost-min-input');
        const maxInp = document.getElementById('presence-boost-max-input');
        const status = document.getElementById('presence-boost-status');
        const min = parseInt(minInp?.value);
        const max = parseInt(maxInp?.value);
        if (isNaN(min) || isNaN(max) || min < 0 || max < 0) {
            if (status) { status.textContent = '⚠️ أدخل رقمين صحيحين (0 أو أكثر)'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        if (max < min) {
            if (status) { status.textContent = '⚠️ الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        try {
            await fbSet('settings/presenceBoost', { min, max });
            if (status) {
                status.textContent = (max > 0)
                    ? `✅ تم الحفظ — سيُضاف رقم عشوائي بين ${min} و${max} إلى العدد الحقيقي، ويتغيّر كل دقيقتين`
                    : '✅ تم الحفظ — العداد سيعرض العدد الحقيقي فقط';
                status.style.color = 'var(--green)'; status.style.display = 'block';
            }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    // Load registration limits
    fbGet('settings/maxAccountsPerPhone').then(val => {
        const inp = document.getElementById('max-accounts-phone-input');
        if (inp && val !== null && val !== undefined) inp.value = parseInt(val) || 1;
    }).catch(() => {});
    fbGet('settings/maxAccountsPerDevice').then(val => {
        const inp = document.getElementById('max-accounts-device-input');
        if (inp && val !== null && val !== undefined) inp.value = parseInt(val) || 3;
    }).catch(() => {});

    document.getElementById('max-accounts-phone-save')?.addEventListener('click', async () => {
        const inp    = document.getElementById('max-accounts-phone-input');
        const status = document.getElementById('max-accounts-phone-status');
        const val    = parseInt(inp?.value || '');
        if (!val || val < 1 || val > 10) {
            if (status) { status.textContent = '⚠️ أدخل رقماً بين 1 و 10'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        try {
            await fbSet('settings/maxAccountsPerPhone', val);
            if (status) { status.textContent = `✅ تم الحفظ — الحد: ${val} حساب لكل رقم`; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    document.getElementById('max-accounts-device-save')?.addEventListener('click', async () => {
        const inp    = document.getElementById('max-accounts-device-input');
        const status = document.getElementById('max-accounts-device-status');
        const val    = parseInt(inp?.value || '');
        if (!val || val < 1 || val > 20) {
            if (status) { status.textContent = '⚠️ أدخل رقماً بين 1 و 20'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        try {
            await fbSet('settings/maxAccountsPerDevice', val);
            if (status) { status.textContent = `✅ تم الحفظ — الحد: ${val} حساب لكل جهاز`; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    // Load adminPhone
    fbGet('settings/adminPhone').then(val => {
        const inp = document.getElementById('admin-phone-input');
        if (inp && val) inp.value = val;
    }).catch(() => {});

    // Delivo Center location
    _updateCenterLocDisplay();
    document.getElementById('center-loc-change-btn')?.addEventListener('click', () => {
        openCenterLocationModal(deliveryCenterLoc?.lat, deliveryCenterLoc?.lng);
    });

    // Delivery coverage radius — quick standalone control (no need to
    // open the full map modal just to tweak the number).
    document.getElementById('coverage-radius-save-btn')?.addEventListener('click', async () => {
        const input  = document.getElementById('coverage-radius-input');
        const status = document.getElementById('coverage-radius-status');
        const v = parseFloat(input?.value);
        if (isNaN(v) || v <= 0) {
            if (status) { status.textContent = '❌ أدخل رقماً صحيحاً أكبر من صفر'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        if (!deliveryCenterLoc) {
            if (status) { status.textContent = '⚠ حدد موقع مركز Delivo أولاً (زر "تغيير الموقع" أعلاه)'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        const btn = document.getElementById('coverage-radius-save-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            deliveryCenterLoc = { ...deliveryCenterLoc, radiusKm: v };
            deliveryRadiusKm  = v;
            await fbSet('settings/deliveryCenter', deliveryCenterLoc);
            _updateCenterLocDisplay();
            if (adminMap) renderMap();
            if (status) { status.textContent = `✅ تم تحديث نطاق التغطية إلى ${v} كم`; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 4000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ: ' + e.message; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        } finally {
            btn.disabled = false; btn.textContent = '💾 حفظ النطاق';
        }
    });

    // World Cup 2026 promo (self-contained — see _wc2026AdminInit definition
    // further down, clearly marked "WORLD CUP 2026 PROMO", for easy removal)
    if (typeof _wc2026AdminInit === 'function') _wc2026AdminInit();

    document.getElementById('admin-phone-save')?.addEventListener('click', async () => {
        const inp    = document.getElementById('admin-phone-input');
        const status = document.getElementById('admin-phone-status');
        const phone  = (inp?.value || '').replace(/[^0-9]/g, '');
        if (!phone || phone.length < 7) {
            if (status) { status.textContent = '⚠️ رقم غير صحيح'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
            return;
        }
        try {
            await fbSet('settings/adminPhone', phone);
            if (status) { status.textContent = '✅ تم الحفظ'; status.style.color = 'var(--green)'; status.style.display = 'block'; }
            setTimeout(() => { if (status) status.style.display = 'none'; }, 3000);
        } catch(e) {
            if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
        }
    });

    fbGet('settings/testMode').then(val => {
        const isTest  = val === true || val === 'true';
        const toggle  = document.getElementById('toggle-test-mode');
        const badge   = document.getElementById('test-mode-badge');
        const preview = document.getElementById('test-mode-preview');
        if (toggle)  toggle.checked        = isTest;
        if (badge)   badge.style.display   = isTest ? 'inline-block' : 'none';
        if (preview) preview.style.display = isTest ? 'block' : 'none';
    }).catch(() => {});
    // Load max orders
    fbGet('settings/orders/maxPerDay').then(val => {
        const inp = document.getElementById('max-orders-input');
        if (inp && val) inp.value = val;
    }).catch(() => {});
    // Load flat delivery fee
    fbGet('settings/deliveryFee').then(val => {
        const inp = document.getElementById('delivery-fee-input');
        if (inp && val !== null) inp.value = val;
    }).catch(() => {});
    // Load smart delivery config
    sdLoad();
    // Load night delivery surcharge config
    ndLoad();
    // Load otlob fast-item categories
    ofiLoad();
    _ofiBindToggle();
    _ofiBindEnableToggle();
    // Load keyword chips
    kwLoad();
    // Load mealtime boundaries
    mtLoad();
}


/* ═══════════════════════════════════════════════════════
   KEYWORDS MANAGEMENT
   Firebase path: /customization_keywords/{storeType}
═══════════════════════════════════════════════════════ */
const _kwState = { Restaurants: [], BakeryShops: [] };

async function kwLoad() {
    for (const type of ['Restaurants', 'BakeryShops']) {
        try {
            const data = await fbGet('customization_keywords/' + type);
            _kwState[type] = Array.isArray(data)
                ? data.filter(Boolean)
                : (data && typeof data === 'object') ? Object.values(data).filter(Boolean) : [];
        } catch (_) { _kwState[type] = []; }
        kwRenderChips(type);
    }
}

function kwRenderChips(type) {
    const id = type === 'Restaurants' ? 'kw-restaurants-chips' : 'kw-bakery-chips';
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = _kwState[type].map((kw, i) => `
        <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px 4px 6px;
                     background:rgba(255,92,0,0.1);border:1px solid rgba(255,92,0,0.3);
                     border-radius:50px;font-size:0.75rem;font-weight:700;color:var(--orange);">
            ${kw}
            <button onclick="kwRemoveChip('${type}',${i})"
                    style="background:none;border:none;cursor:pointer;color:var(--orange);
                           font-size:0.95rem;line-height:1;padding:0;opacity:0.7;font-family:inherit;">×</button>
        </span>`).join('');
}

function kwAddChip(type) {
    const inputId = type === 'Restaurants' ? 'kw-restaurants-input' : 'kw-bakery-input';
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const val = inp.value.trim();
    if (!val) return;
    if (_kwState[type].includes(val)) { toast('الكلمة موجودة مسبقاً', true); return; }
    _kwState[type].push(val);
    inp.value = '';
    inp.focus();
    kwRenderChips(type);
}

function kwRemoveChip(type, index) {
    _kwState[type].splice(index, 1);
    kwRenderChips(type);
}

async function kwSave(type) {
    try {
        await fbSet('customization_keywords/' + type, _kwState[type]);
        toast('✅ تم حفظ خصائص ' + (type === 'Restaurants' ? 'المطاعم' : 'الأفران'));
    } catch(e) { toast('خطأ في الحفظ', true); }
}

window.kwAddChip    = kwAddChip;
window.kwRemoveChip = kwRemoveChip;
window.kwSave       = kwSave;

/* ═══════════════════════════════════════════════════════
   MEAL TIME BOUNDARIES
   Firebase path: settings/mealTimes
   Structure: { breakfast:[6,11], lunch:[11,16], snack:[16,19], dinner:[19,24] }
═══════════════════════════════════════════════════════ */
async function mtLoad() {
    try {
        const data = await fbGet('settings/mealTimes');
        if (!data || typeof data !== 'object') return;
        const meals = ['breakfast','lunch','snack','dinner'];
        meals.forEach(key => {
            const hours = data[key];
            if (!Array.isArray(hours) || hours.length < 2) return;
            const fromEl = document.getElementById(`mt-${key}-from`);
            const toEl   = document.getElementById(`mt-${key}-to`);
            if (fromEl) fromEl.value = hours[0];
            if (toEl)   toEl.value   = hours[1];
        });
    } catch(_) {}
}

/* ═══════════════════════════════════════════════════════
   SALES MANAGEMENT — عروض المتاجر
   Firebase path: sales/{companyname}/{saleId}
   Each sale: { title, items:[{name}], origPrice, salePrice, currency, image, active }
═══════════════════════════════════════════════════════ */

let _salesCurrentStore = '';

// Populate store dropdown when panel opens
async function salesPanelInit() {
    const sel = document.getElementById('sales-store-select');
    if (!sel || sel.dataset.loaded) return;
    try {
        const res  = await fetch(`${RTDB}/pattern.json`);
        const data = await res.json();
        if (!data) return;
        // Collect stores with rank for sorting (same approach as catalog panel)
        const stores = [];
        Object.entries(data).forEach(([type, storesObj]) => {
            const arr = Array.isArray(storesObj) ? storesObj : Object.values(storesObj || {});
            arr.forEach(s => {
                if (s && s.companyname) {
                    stores.push({ name: s.companyname.trim(), nameAr: s.nameAr || s.companyname.trim(), rank: s.rank ?? 999 });
                }
            });
        });
        // Sort by rank then alpha, deduplicate
        const seen = new Set();
        stores.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name))
              .forEach(s => {
                  if (seen.has(s.name)) return;
                  seen.add(s.name);
                  const opt = document.createElement('option');
                  opt.value = s.name;
                  opt.textContent = s.nameAr !== s.name ? `${s.nameAr} (${s.name})` : s.name;
                  sel.appendChild(opt);
              });
        sel.dataset.loaded = '1';
    } catch(e) { console.error('[Sales panel]', e); }
}

document.addEventListener('panelOpen', async (e) => {
    if (e.detail === 'sales') {
        await salesPanelInit();
        document.getElementById('sales-add-btn').style.display = 'none';
    }
});

document.getElementById('sales-store-select')?.addEventListener('change', function() {
    _salesCurrentStore = this.value;
    document.getElementById('sales-add-btn').style.display = this.value ? 'flex' : 'none';
    if (this.value) loadStoreSales(this.value);
    else document.getElementById('sales-admin-grid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);font-size:0.85rem;">اختر متجراً لعرض عروضه</div>';
});

async function loadStoreSales(store) {
    const grid  = document.getElementById('sales-admin-grid');
    const count = document.getElementById('sales-admin-count');
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--gray);">⏳ جاري التحميل…</div>';
    try {
        const res  = await fetch(`${RTDB}/sales/${encodeURIComponent(store)}.json`);
        const data = await res.json();
        if (!data || typeof data !== 'object') {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);">لا توجد عروض بعد. اضغط إضافة عرض.</div>';
            count.textContent = '0 عروض';
            return;
        }
        const sales = Object.entries(data).map(([id, s]) => ({ id, ...s }));
        count.textContent = `${sales.length} عرض`;
        grid.innerHTML = sales.map(s => {
            const saleP = parseFloat(s.salePrice) || 0;
            const origP = parseFloat(s.origPrice) || 0;
            const curr  = s.currency === 'LBP' ? 'ل.ل' : '$';
            const pct   = origP > saleP && origP > 0 ? Math.round((1 - saleP/origP)*100) : 0;
            const itemsStr = Array.isArray(s.items) ? s.items.map(i => { const q=parseInt(i.qty)||1; return i.name ? (q>1?`${q}× ${i.name}`:i.name) : ''; }).filter(Boolean).join(' + ') : '';
            return `
            <div style="background:var(--surface2);border:1px solid var(--border-bright);border-radius:14px;overflow:hidden;">
                ${s.image ? `<img src="${s.image}" style="width:100%;height:120px;object-fit:cover;" onerror="this.style.display='none'">` : ''}
                <div style="padding:12px 14px;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span style="font-size:0.88rem;font-weight:900;flex:1;">${s.title || 'عرض'}</span>
                        <span style="font-size:0.65rem;padding:2px 7px;border-radius:50px;font-weight:800;background:${s.active===false?'rgba(239,68,68,0.15)':'rgba(74,222,128,0.12)'};color:${s.active===false?'var(--red)':'#4ade80'};">${s.active===false?'متوقف':'نشط'}</span>
                    </div>
                    ${itemsStr ? `<div style="font-size:0.68rem;color:var(--gray);margin-bottom:8px;">${itemsStr}</div>` : ''}
                    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
                        <span style="font-size:1rem;font-weight:900;color:var(--orange);">${saleP}${curr}</span>
                        ${origP > saleP ? `<span style="font-size:0.72rem;color:var(--gray);text-decoration:line-through;">${origP}${curr}</span>` : ''}
                        ${pct > 0 ? `<span style="font-size:0.7rem;font-weight:800;color:#4ade80;">خصم ${pct}%</span>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button onclick='editSale(${JSON.stringify(s)})' style="flex:1;padding:7px;background:rgba(255,92,0,0.1);border:1px solid rgba(255,92,0,0.25);border-radius:9px;color:var(--orange);font-family:inherit;font-size:0.78rem;font-weight:700;cursor:pointer;">✏️ تعديل</button>
                        <button onclick="deleteSale('${s.id}')" style="flex:1;padding:7px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:9px;color:var(--red);font-family:inherit;font-size:0.78rem;font-weight:700;cursor:pointer;">🗑 حذف</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red);">حدث خطأ في التحميل</div>';
    }
}

// Sale item rows helpers
function _saleItemRowHTML(item) {
    return `
    <div class="sale-item-row" style="display:grid;grid-template-columns:52px 1fr 80px 28px;gap:6px;align-items:center;margin-bottom:6px;">
        <input type="number" min="1" max="99" value="${item.qty||1}" placeholder="1"
               class="sir-qty"
               style="padding:7px 4px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:9px;color:var(--white);font-family:inherit;font-size:0.82rem;text-align:center;width:100%;"
               oninput="_saleRecalc()">
        <input type="text" value="${item.name||''}" placeholder="اسم الصنف…"
               class="sir-name"
               style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:9px;color:var(--white);font-family:inherit;font-size:0.82rem;width:100%;">
        <input type="number" min="0" step="0.01" value="${item.unitPrice||''}" placeholder="0.00"
               class="sir-price"
               style="padding:7px 6px;background:var(--surface2);border:1px solid var(--border-bright);border-radius:9px;color:var(--white);font-family:inherit;font-size:0.82rem;text-align:center;width:100%;"
               oninput="_saleRecalc()">
        <button onclick="this.closest('.sale-item-row').remove();_saleRecalc();"
                style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:var(--red);border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">×</button>
    </div>`;
}

function _renderSaleItemRows(items) {
    const wrap = document.getElementById('sale-items-rows');
    if (!wrap) return;
    wrap.innerHTML = (items.length ? items : [{}]).map(i => _saleItemRowHTML(i)).join('');
    _saleRecalc();
}

window.addSaleItemRow = function() {
    const wrap = document.getElementById('sale-items-rows');
    if (!wrap) return;
    wrap.insertAdjacentHTML('beforeend', _saleItemRowHTML({}));
};

// Live recalc — sums qty×unitPrice, updates orig price field + discount preview
window._saleRecalc = function() {
    const rows   = document.querySelectorAll('#sale-items-rows .sale-item-row');
    let total = 0;
    rows.forEach(row => {
        const qty   = parseFloat(row.querySelector('.sir-qty')?.value)   || 0;
        const price = parseFloat(row.querySelector('.sir-price')?.value) || 0;
        total += qty * price;
    });

    // Show subtotal
    const subRow = document.getElementById('sale-subtotal-row');
    const subVal = document.getElementById('sale-subtotal-val');
    const curr   = document.getElementById('sale-currency')?.value || 'USD';
    const sym    = curr === 'LBP' ? ' ل.ل' : '$';
    if (subRow && subVal) {
        subRow.style.display = total > 0 ? 'flex' : 'none';
        subVal.textContent   = total < 1000 ? sym + total.toFixed(2) : (total/1000).toFixed(0) + 'k' + sym;
    }

    // Auto-fill orig price if empty
    const origEl = document.getElementById('sale-orig-price');
    if (origEl && (!origEl.value || origEl.dataset.autoFilled === '1') && total > 0) {
        origEl.value = total.toFixed(2);
        origEl.dataset.autoFilled = '1';
    }

    // Discount preview
    const saleEl = document.getElementById('sale-sale-price');
    const discEl = document.getElementById('sale-discount-preview');
    if (saleEl && discEl) {
        const saleP = parseFloat(saleEl.value) || 0;
        const origP = parseFloat(origEl?.value) || 0;
        if (saleP > 0 && origP > saleP) {
            const pct = Math.round((1 - saleP/origP)*100);
            discEl.textContent = `✅ توفير ${pct}% عن السعر الأصلي`;
        } else {
            discEl.textContent = '';
        }
    }
};

window.openSaleModal = function() {
    document.getElementById('sale-modal-title').textContent = 'إضافة عرض جديد';
    document.getElementById('sale-edit-id').value   = '';
    document.getElementById('sale-title').value     = '';
    document.getElementById('sale-orig-price').value = '';
    document.getElementById('sale-sale-price').value = '';
    document.getElementById('sale-currency').value  = 'USD';
    document.getElementById('sale-image').value     = '';
    document.getElementById('sale-active').checked  = true;
    document.getElementById('sale-modal-err').style.display = 'none';
    _renderSaleItemRows([]);
    const _origEl = document.getElementById('sale-orig-price'); if (_origEl) _origEl.dataset.autoFilled = '';
    document.getElementById('sale-modal-overlay').style.display = 'flex';
};

window.closeSaleModal = function() {
    document.getElementById('sale-modal-overlay').style.display = 'none';
};

window.editSale = function(s) {
    document.getElementById('sale-modal-title').textContent = 'تعديل العرض';
    document.getElementById('sale-edit-id').value    = s.id;
    document.getElementById('sale-title').value      = s.title || '';
    document.getElementById('sale-orig-price').value = s.origPrice || '';
    document.getElementById('sale-sale-price').value = s.salePrice || '';
    document.getElementById('sale-currency').value   = s.currency || 'USD';
    document.getElementById('sale-image').value      = s.image || '';
    document.getElementById('sale-active').checked   = s.active !== false;
    document.getElementById('sale-modal-err').style.display = 'none';
    const _oEl = document.getElementById('sale-orig-price'); if (_oEl) _oEl.dataset.autoFilled = '';
    _renderSaleItemRows(Array.isArray(s.items) ? s.items : []);
    document.getElementById('sale-modal-overlay').style.display = 'flex';
};

// ── Sale image upload helpers ──────────────────────────────────
window._saleUploadImage = async function(input) {
    const file = input.files[0];
    if (!file) return;
    const prog  = document.getElementById('sale-upload-progress');
    const label = document.getElementById('sale-upload-label-text');
    if (prog)  prog.style.display = 'block';
    if (label) label.textContent  = 'جاري الرفع…';
    try {
        const token = await getFsToken();
        const ext   = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path  = encodeURIComponent(`saleImages/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
        const bucket = 'deliveryonline-300f7.firebasestorage.app';
        const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${path}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'image/jpeg' },
            body: file,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const url  = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${path}?alt=media&token=${data.downloadTokens}`;
        const imgEl = document.getElementById('sale-image');
        if (imgEl) imgEl.value = url;
        _saleShowPreview(url);
        if (label) label.textContent = '✅ تم الرفع';
    } catch(e) {
        console.error('[SaleUpload]', e);
        if (label) label.textContent = '❌ فشل الرفع';
        toast('❌ فشل رفع الصورة');
    }
    if (prog) prog.style.display = 'none';
    input.value = '';
};

window._saleImageUrlChanged = function(url) {
    if (url && url.startsWith('http')) _saleShowPreview(url);
    else _saleClearImagePreview();
};

window._saleShowPreview = function(url) {
    const wrap = document.getElementById('sale-image-preview');
    const img  = document.getElementById('sale-image-preview-img');
    if (!wrap || !img) return;
    img.src = url;
    img.onerror = () => { wrap.style.display = 'none'; };
    wrap.style.display = 'block';
};

window._saleClearImage = function() {
    const imgEl = document.getElementById('sale-image');
    if (imgEl) imgEl.value = '';
    _saleClearImagePreview();
    const label = document.getElementById('sale-upload-label-text');
    if (label) label.textContent = 'رفع صورة';
};

function _saleClearImagePreview() {
    const wrap = document.getElementById('sale-image-preview');
    if (wrap) wrap.style.display = 'none';
}

// Reset image field when modal opens
const _origOpenSaleModal = window.openSaleModal;
window.openSaleModal = function() {
    _origOpenSaleModal();
    _saleClearImagePreview();
    const label = document.getElementById('sale-upload-label-text');
    if (label) label.textContent = 'رفع صورة';
};

const _origEditSale = window.editSale;
window.editSale = function(s) {
    _origEditSale(s);
    if (s.image) _saleShowPreview(s.image);
    else _saleClearImagePreview();
};

window.saveSale = async function() {
    const errEl   = document.getElementById('sale-modal-err');
    const saveBtn = document.getElementById('sale-save-btn');
    const title   = document.getElementById('sale-title').value.trim();
    const saleP   = document.getElementById('sale-sale-price').value.trim();
    const origP   = document.getElementById('sale-orig-price').value.trim();
    const curr    = document.getElementById('sale-currency').value;
    const image   = document.getElementById('sale-image').value.trim();
    const active  = document.getElementById('sale-active').checked;
    const editId  = document.getElementById('sale-edit-id').value;

    if (!title)  { errEl.textContent = 'أدخل عنوان العرض'; errEl.style.display='block'; return; }
    if (!saleP)  { errEl.textContent = 'أدخل سعر العرض'; errEl.style.display='block'; return; }
    if (!_salesCurrentStore) { errEl.textContent = 'اختر متجراً أولاً'; errEl.style.display='block'; return; }

    // Collect item rows with qty + name + unitPrice
    const items = [...document.querySelectorAll('#sale-items-rows .sale-item-row')].map(row => ({
        qty      : parseInt(row.querySelector('.sir-qty')?.value)   || 1,
        name     : row.querySelector('.sir-name')?.value.trim()     || '',
        unitPrice: parseFloat(row.querySelector('.sir-price')?.value) || 0,
    })).filter(i => i.name);

    const payload = { title, items, origPrice: origP || '0', salePrice: saleP, currency: curr, active };
    if (image) payload.image = image;

    saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ…';
    try {
        const store   = encodeURIComponent(_salesCurrentStore);
        const saleId  = editId || `sale_${Date.now()}`;
        await fetch(`${RTDB}/sales/${store}/${saleId}.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        toast('✅ تم حفظ العرض');
        closeSaleModal();
        loadStoreSales(_salesCurrentStore);
    } catch(e) {
        errEl.textContent = '❌ فشل الحفظ، حاول مجدداً';
        errEl.style.display = 'block';
    }
    saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ العرض';
};

window.deleteSale = async function(saleId) {
    if (!confirm('هل تريد حذف هذا العرض نهائياً؟')) return;
    try {
        const store = encodeURIComponent(_salesCurrentStore);
        await fetch(`${RTDB}/sales/${store}/${saleId}.json`, { method: 'DELETE' });
        toast('🗑 تم حذف العرض');
        loadStoreSales(_salesCurrentStore);
    } catch(e) {
        toast('❌ فشل الحذف');
    }
};

window.saveMealTimes = async function() {
    const status = document.getElementById('mealtime-status');
    const meals  = ['breakfast','lunch','snack','dinner'];

    const payload = {};
    for (const key of meals) {
        const from = parseInt(document.getElementById(`mt-${key}-from`)?.value ?? '');
        const to   = parseInt(document.getElementById(`mt-${key}-to`)?.value ?? '');
        if (isNaN(from) || isNaN(to) || from < 0 || to > 24 || from >= to) {
            if (status) {
                status.textContent = `⚠️ قيم غير صحيحة في ${key === 'breakfast' ? 'الفطور' : key === 'lunch' ? 'الغداء' : key === 'snack' ? 'السناك' : 'العشاء'} — تأكد أن البداية < النهاية`;
                status.style.color   = 'var(--red)';
                status.style.display = 'block';
            }
            return;
        }
        payload[key] = [from, to];
    }

    try {
        await fbSet('settings/mealTimes', payload);
        if (status) {
            status.textContent   = '✅ تم حفظ أوقات الوجبات';
            status.style.color   = 'var(--green)';
            status.style.display = 'block';
            setTimeout(() => { status.style.display = 'none'; }, 3500);
        }
        toast('✅ أوقات الوجبات محدّثة');
    } catch(e) {
        if (status) { status.textContent = '❌ فشل الحفظ'; status.style.color = 'var(--red)'; status.style.display = 'block'; }
    }
};

window.setDeliveryFee = async function(val) {
    try {
        await fbSet('settings/deliveryFee', parseFloat(val) || 2);
        toast('✅ تم حفظ رسوم التوصيل');
    } catch(e) { toast('خطأ', true); }
};

window.setMaxOrders = async function(val) {
    try {
        await fbSet('settings/orders/maxPerDay', parseInt(val) || 3);
        toast('✅ تم حفظ الحد اليومي');
    } catch(e) { toast('خطأ', true); }
};

// ═══════════════════════════════════════════════════════════════
// WIRING
// ═══════════════════════════════════════════════════════════════

// Login

/* ══════════════════════════════════════════════════════════
   SETTINGS FUNCTIONS
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   WORLD CUP 2026 PROMO — START (admin logic)
   Time-boxed marketing campaign. To retire the whole feature later,
   delete this entire block (down to the matching "END" marker) plus
   the HTML section #wc2026-admin-section above, and the customer-side
   files: scripts/worldcup2026.js, styles/worldcup2026.css, and the two
   blocks marked "WORLD CUP 2026 PROMO" in index.html.
══════════════════════════════════════════════════════════ */

// Seed roster used only the first time the campaign is launched.
// Flags/names for all 48 World Cup 2026 teams. Elimination status
// reflects confirmed results through the Round of 16 as of the last
// time this file was reviewed (France and Morocco have already won
// their R16 matches; Brazil/Norway, Mexico/England, Spain/Portugal,
// Belgium/USA, Egypt/Argentina and Switzerland/Colombia are the
// remaining R16 fixtures) — only these 14 teams are still alive:
// Mexico, Switzerland, Brazil, Morocco, USA, Egypt, Spain, France,
// Norway, Argentina, Colombia, Portugal, England, Belgium.
// Update the "❌ خرج" toggle in the grid below as each new result
// comes in — this seed only matters the moment "تفعيل الحملة" is
// first pressed; after that, the toggles are the source of truth.
const WC2026_TEAM_SEED = {
    MEX: { name:'Mexico',                 nameAr:'المكسيك',              iso2:'mx' },
    RSA: { name:'South Africa',           nameAr:'جنوب أفريقيا',         iso2:'za', eliminated:true },
    KOR: { name:'Korea Republic',         nameAr:'كوريا الجنوبية',       iso2:'kr', eliminated:true },
    CZE: { name:'Czechia',                nameAr:'التشيك',               iso2:'cz', eliminated:true },
    SUI: { name:'Switzerland',            nameAr:'سويسرا',               iso2:'ch' },
    CAN: { name:'Canada',                 nameAr:'كندا',                  iso2:'ca', eliminated:true },
    BIH: { name:'Bosnia and Herzegovina', nameAr:'البوسنة والهرسك',       iso2:'ba', eliminated:true },
    QAT: { name:'Qatar',                  nameAr:'قطر',                   iso2:'qa', eliminated:true },
    BRA: { name:'Brazil',                 nameAr:'البرازيل',              iso2:'br' },
    MAR: { name:'Morocco',                nameAr:'المغرب',                iso2:'ma' },
    SCO: { name:'Scotland',               nameAr:'اسكتلندا',              iso2:'gb-sct', eliminated:true },
    HTI: { name:'Haiti',                  nameAr:'هايتي',                 iso2:'ht', eliminated:true },
    USA: { name:'USA',                    nameAr:'الولايات المتحدة',      iso2:'us' },
    AUS: { name:'Australia',              nameAr:'أستراليا',              iso2:'au', eliminated:true },
    PAR: { name:'Paraguay',               nameAr:'باراغواي',              iso2:'py', eliminated:true },
    TUR: { name:'Turkiye',                nameAr:'تركيا',                 iso2:'tr', eliminated:true },
    GER: { name:'Germany',                nameAr:'ألمانيا',               iso2:'de', eliminated:true },
    CIV: { name:'Ivory Coast',            nameAr:'ساحل العاج',            iso2:'ci', eliminated:true },
    ECU: { name:'Ecuador',                nameAr:'الإكوادور',             iso2:'ec', eliminated:true },
    CUW: { name:'Curacao',                nameAr:'كوراساو',               iso2:'cw', eliminated:true },
    NED: { name:'Netherlands',            nameAr:'هولندا',                iso2:'nl', eliminated:true },
    JPN: { name:'Japan',                  nameAr:'اليابان',               iso2:'jp', eliminated:true },
    SWE: { name:'Sweden',                 nameAr:'السويد',                iso2:'se', eliminated:true },
    TUN: { name:'Tunisia',                nameAr:'تونس',                  iso2:'tn', eliminated:true },
    BEL: { name:'Belgium',                nameAr:'بلجيكا',                iso2:'be' },
    EGY: { name:'Egypt',                  nameAr:'مصر',                   iso2:'eg' },
    IRN: { name:'IR Iran',                nameAr:'إيران',                 iso2:'ir', eliminated:true },
    NZL: { name:'New Zealand',            nameAr:'نيوزيلندا',             iso2:'nz', eliminated:true },
    ESP: { name:'Spain',                  nameAr:'إسبانيا',               iso2:'es' },
    CPV: { name:'Cape Verde',             nameAr:'الرأس الأخضر',          iso2:'cv', eliminated:true },
    URU: { name:'Uruguay',                nameAr:'أوروغواي',              iso2:'uy', eliminated:true },
    KSA: { name:'Saudi Arabia',           nameAr:'السعودية',              iso2:'sa', eliminated:true },
    FRA: { name:'France',                 nameAr:'فرنسا',                 iso2:'fr' },
    NOR: { name:'Norway',                 nameAr:'النرويج',               iso2:'no' },
    SEN: { name:'Senegal',                nameAr:'السنغال',               iso2:'sn', eliminated:true },
    IRQ: { name:'Iraq',                   nameAr:'العراق',                iso2:'iq', eliminated:true },
    ARG: { name:'Argentina',              nameAr:'الأرجنتين',             iso2:'ar' },
    AUT: { name:'Austria',                nameAr:'النمسا',                iso2:'at', eliminated:true },
    DZA: { name:'Algeria',                nameAr:'الجزائر',               iso2:'dz', eliminated:true },
    JOR: { name:'Jordan',                 nameAr:'الأردن',                iso2:'jo', eliminated:true },
    COL: { name:'Colombia',               nameAr:'كولومبيا',              iso2:'co' },
    POR: { name:'Portugal',               nameAr:'البرتغال',              iso2:'pt' },
    COD: { name:'Congo DR',               nameAr:'الكونغو الديمقراطية',   iso2:'cd', eliminated:true },
    UZB: { name:'Uzbekistan',             nameAr:'أوزبكستان',             iso2:'uz', eliminated:true },
    ENG: { name:'England',                nameAr:'إنجلترا',               iso2:'gb-eng' },
    CRO: { name:'Croatia',                nameAr:'كرواتيا',               iso2:'hr', eliminated:true },
    GHA: { name:'Ghana',                  nameAr:'غانا',                  iso2:'gh', eliminated:true },
    PAN: { name:'Panama',                 nameAr:'بنما',                  iso2:'pa', eliminated:true },
};

let _wc2026Cfg           = null;
let _wc2026EntriesByTeam = {}; // teamCode → [{ uid, displayName, username, phone, ts }]

function _wc2026AdminInit() {
    _wc2026BindOnce();
    _wc2026AdminLoadAndRender();
}

async function _wc2026AdminLoadAndRender() {
    const loading   = document.getElementById('wc2026-admin-loading');
    const launchRow = document.getElementById('wc2026-launch-row');
    const configRow = document.getElementById('wc2026-config-row');
    if (!loading) return; // section not in DOM (already removed) — no-op

    loading.style.display = 'block';
    if (launchRow) launchRow.style.display = 'none';
    if (configRow) configRow.style.display = 'none';

    try {
        const [cfg, entries] = await Promise.all([
            fbGet('settings/worldcup2026'),
            fbGet('worldcup2026Entries'),
        ]);
        _wc2026Cfg = cfg || null;

        _wc2026EntriesByTeam = {};
        if (entries && typeof entries === 'object') {
            Object.keys(entries).forEach(uid => {
                const e = entries[uid];
                if (!e || !e.team) return;
                (_wc2026EntriesByTeam[e.team] = _wc2026EntriesByTeam[e.team] || []).push({ uid, ...e });
            });
        }

        loading.style.display = 'none';

        if (!_wc2026Cfg) {
            if (launchRow) launchRow.style.display = 'block';
            return;
        }
        if (configRow) configRow.style.display = 'block';
        _wc2026RenderConfig();
    } catch (e) {
        loading.textContent = '❌ تعذّر تحميل بيانات الحملة: ' + e.message;
    }
}

function _wc2026RenderConfig() {
    const cfg = _wc2026Cfg;
    if (!cfg) return;

    const activeToggle = document.getElementById('wc2026-active-toggle');
    if (activeToggle) activeToggle.checked = cfg.active === true;

    const expiryText = document.getElementById('wc2026-expiry-text');
    if (expiryText) {
        const expiresAt = cfg.expiresAt || 0;
        const remaining = expiresAt - Date.now();
        if (!cfg.active) {
            expiryText.textContent = 'الحملة موقوفة يدوياً حالياً';
        } else if (remaining <= 0) {
            expiryText.textContent = 'انتهت مدة الحملة تلقائياً — لن تظهر للعملاء بعد الآن';
        } else {
            const days    = Math.max(1, Math.ceil(remaining / (24*60*60*1000)));
            const dateStr = new Date(expiresAt).toLocaleDateString('ar-LB', { day:'numeric', month:'long', year:'numeric' });
            expiryText.textContent = `تنتهي تلقائياً خلال ${days} يوماً — بتاريخ ${dateStr}`;
        }
    }

    const prizeInput = document.getElementById('wc2026-prize-input');
    if (prizeInput) prizeInput.value = cfg.prizeUSD || 100;

    const totalEntriesEl = document.getElementById('wc2026-total-entries');
    const totalCount = Object.values(_wc2026EntriesByTeam).reduce((s, arr) => s + arr.length, 0);
    if (totalEntriesEl) totalEntriesEl.textContent = totalCount;

    _wc2026RenderTeamsGrid();
    _wc2026RenderDrawSelect();
}

function _wc2026RenderTeamsGrid(filter) {
    const grid = document.getElementById('wc2026-teams-grid');
    if (!grid || !_wc2026Cfg) return;
    const teams = _wc2026Cfg.teams || {};
    const q = (filter !== undefined ? filter : (document.getElementById('wc2026-team-search')?.value || '')).trim();
    const qLower = q.toLowerCase();

    // Search matches either a team name OR a participant's name/username/phone —
    // in the latter case the matching team is shown pre-expanded so the admin
    // can immediately see who they're looking for and what they picked.
    function _entryMatches(entry) {
        if (!q) return false;
        return (entry.displayName || '').toLowerCase().includes(qLower)
            || (entry.username    || '').toLowerCase().includes(qLower)
            || (entry.phone       || '').includes(q);
    }

    grid.innerHTML = '';
    Object.keys(teams)
        .filter(code => {
            if (!q) return true;
            if (teams[code].nameAr.includes(q) || teams[code].name.toLowerCase().includes(qLower) || code.toLowerCase().includes(qLower)) return true;
            return (_wc2026EntriesByTeam[code] || []).some(_entryMatches);
        })
        .sort((a, b) => teams[a].nameAr.localeCompare(teams[b].nameAr, 'ar'))
        .forEach(code => {
            const team    = teams[code];
            const entries = _wc2026EntriesByTeam[code] || [];
            const count   = entries.length;
            const matchedByEntry = q && !teams[code].nameAr.includes(q) && !teams[code].name.toLowerCase().includes(qLower);
            const wrap = document.createElement('div');
            wrap.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;';
            wrap.innerHTML = `
                <div class="wc2026-team-row" data-code="${code}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:${count ? 'pointer' : 'default'};">
                    <img src="https://flagcdn.com/32x24/${team.iso2}.png" style="border-radius:3px;flex-shrink:0;" alt="">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${team.nameAr}</div>
                        <div style="font-size:0.65rem;color:var(--gray);">${count} مسجّل ${count ? '· اضغط لعرض الأسماء ▾' : ''}</div>
                    </div>
                    <label class="toggle" style="flex-shrink:0;" title="خرج من البطولة" onclick="event.stopPropagation()">
                        <input type="checkbox" data-code="${code}" class="wc2026-elim-toggle" ${team.eliminated ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="wc2026-team-entries" data-code="${code}" style="display:${matchedByEntry ? 'block' : 'none'};padding:0 10px 10px;border-top:1px solid var(--border);">
                    ${entries.length ? entries.map(e => `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);${_entryMatches(e) && q ? 'background:rgba(255,92,0,0.08);border-radius:6px;padding:6px 8px;' : ''}">
                            <div style="min-width:0;">
                                <div style="font-size:0.76rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.displayName || e.username || '—'}</div>
                                <div style="font-size:0.66rem;color:var(--gray);font-family:var(--mono);">@${e.username || '—'}</div>
                            </div>
                            <div style="font-size:0.7rem;color:var(--gray-light);font-family:var(--mono);white-space:nowrap;">${e.phone ? formatPhone(e.phone) : '—'}</div>
                        </div>
                    `).join('') : '<div style="font-size:0.72rem;color:var(--gray);padding:6px 0;">لا يوجد مسجّلون بعد</div>'}
                </div>
            `;
            grid.appendChild(wrap);
        });

    if (!grid.children.length) {
        grid.innerHTML = '<div style="color:var(--gray);font-size:0.8rem;padding:10px;">لا توجد نتائج مطابقة</div>';
    }

    grid.querySelectorAll('.wc2026-team-row').forEach(row => {
        row.addEventListener('click', () => {
            const code = row.dataset.code;
            const entriesBox = grid.querySelector(`.wc2026-team-entries[data-code="${code}"]`);
            if (!entriesBox || !(_wc2026EntriesByTeam[code] || []).length) return;
            entriesBox.style.display = entriesBox.style.display === 'none' ? 'block' : 'none';
        });
    });

    grid.querySelectorAll('.wc2026-elim-toggle').forEach(inp => {
        inp.addEventListener('change', async () => {
            const code = inp.dataset.code;
            inp.disabled = true;
            try {
                await fbSet(`settings/worldcup2026/teams/${code}/eliminated`, inp.checked);
                _wc2026Cfg.teams[code].eliminated = inp.checked;
                toast(`${inp.checked ? '❌ تم إخراج' : '✅ تمت إعادة'} ${_wc2026Cfg.teams[code].nameAr} ${inp.checked ? 'من البطولة' : 'إلى المنافسة'}`);
            } catch (e) {
                inp.checked = !inp.checked;
                toast('فشل التحديث: ' + e.message, true);
            } finally {
                inp.disabled = false;
            }
        });
    });
}

function _wc2026RenderDrawSelect() {
    const select = document.getElementById('wc2026-draw-team-select');
    if (!select || !_wc2026Cfg) return;
    const teams   = _wc2026Cfg.teams || {};
    const current = select.value;

    select.innerHTML = '<option value="">اختر المنتخب البطل...</option>';
    Object.keys(_wc2026EntriesByTeam)
        .filter(code => teams[code])
        .sort((a, b) => _wc2026EntriesByTeam[b].length - _wc2026EntriesByTeam[a].length)
        .forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = `${teams[code].nameAr} — ${_wc2026EntriesByTeam[code].length} مسجّل`;
            select.appendChild(opt);
        });
    if (current) select.value = current;
}

function _wc2026BindOnce() {
    if (window._wc2026AdminBound) return;
    window._wc2026AdminBound = true;

    // Collapsed by default — expands on click, chevron rotates to indicate state.
    document.getElementById('wc2026-toggle-header')?.addEventListener('click', () => {
        const body    = document.getElementById('wc2026-admin-body');
        const chevron = document.getElementById('wc2026-toggle-chevron');
        if (!body) return;
        const expanded = body.style.display !== 'none';
        body.style.display = expanded ? 'none' : 'block';
        if (chevron) chevron.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
    });

    document.getElementById('wc2026-launch-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('wc2026-launch-btn');
        btn.disabled = true; btn.textContent = '…';
        try {
            const now   = Date.now();
            const teams = {};
            Object.keys(WC2026_TEAM_SEED).forEach(code => {
                teams[code] = { ...WC2026_TEAM_SEED[code], eliminated: !!WC2026_TEAM_SEED[code].eliminated };
            });
            const cfg = {
                active:    true,
                createdAt: now,
                expiresAt: now + 14 * 24 * 60 * 60 * 1000,
                prizeUSD:  100,
                teams,
            };
            await fbSet('settings/worldcup2026', cfg);
            toast('🚀 تم تفعيل حملة كأس العالم 2026 لمدة 14 يوماً');
            await _wc2026AdminLoadAndRender();
        } catch (e) {
            toast('فشل التفعيل: ' + e.message, true);
        } finally {
            btn.disabled = false; btn.textContent = '🚀 تفعيل الحملة الآن';
        }
    });

    document.getElementById('wc2026-active-toggle')?.addEventListener('change', async (e) => {
        if (!_wc2026Cfg) return;
        const checked = e.target.checked;
        e.target.disabled = true;
        try {
            await fbSet('settings/worldcup2026/active', checked);
            _wc2026Cfg.active = checked;
            _wc2026RenderConfig();
            toast(checked ? '✅ تم تفعيل الحملة' : '⏸ تم إيقاف الحملة يدوياً');
        } catch (err) {
            e.target.checked = !checked;
            toast('فشل التحديث: ' + err.message, true);
        } finally {
            e.target.disabled = false;
        }
    });

    document.getElementById('wc2026-extend-btn')?.addEventListener('click', async () => {
        if (!_wc2026Cfg) return;
        const btn = document.getElementById('wc2026-extend-btn');
        btn.disabled = true;
        try {
            const base      = Math.max(_wc2026Cfg.expiresAt || 0, Date.now());
            const newExpiry = base + 7 * 24 * 60 * 60 * 1000;
            await fbSet('settings/worldcup2026/expiresAt', newExpiry);
            _wc2026Cfg.expiresAt = newExpiry;
            _wc2026RenderConfig();
            toast('🔄 تم تمديد الحملة أسبوعاً إضافياً');
        } catch (e) {
            toast('فشل التمديد: ' + e.message, true);
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('wc2026-prize-save-btn')?.addEventListener('click', async () => {
        if (!_wc2026Cfg) return;
        const input = document.getElementById('wc2026-prize-input');
        const v = parseFloat(input?.value);
        if (isNaN(v) || v <= 0) { toast('أدخل قيمة صحيحة للجائزة', true); return; }
        try {
            await fbSet('settings/worldcup2026/prizeUSD', v);
            _wc2026Cfg.prizeUSD = v;
            toast(`💾 تم تحديث قيمة الجائزة إلى $${v}`);
        } catch (e) {
            toast('فشل الحفظ: ' + e.message, true);
        }
    });

    document.getElementById('wc2026-team-search')?.addEventListener('input', (e) => {
        _wc2026RenderTeamsGrid(e.target.value);
    });

    document.getElementById('wc2026-draw-btn')?.addEventListener('click', () => {
        const select    = document.getElementById('wc2026-draw-team-select');
        const resultBox = document.getElementById('wc2026-draw-result');
        const code      = select?.value;
        if (!code) { toast('اختر المنتخب البطل أولاً', true); return; }
        const pool = _wc2026EntriesByTeam[code] || [];
        if (!pool.length) { toast('لا يوجد مسجّلون مع هذا المنتخب', true); return; }
        const winner   = pool[Math.floor(Math.random() * pool.length)];
        const teamName = (_wc2026Cfg.teams[code] || {}).nameAr || code;
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            🎉 <b>الفائز بجائزة $${_wc2026Cfg.prizeUSD || 100}</b><br>
            المنتخب البطل: ${teamName}<br>
            الاسم: ${winner.displayName || winner.username || '—'}<br>
            الهاتف: <span style="direction:ltr;display:inline-block;font-family:var(--mono);">${winner.phone || '—'}</span>
            <div style="font-size:0.68rem;color:var(--gray);margin-top:4px;">تم الاختيار عشوائياً من أصل ${pool.length} مسجّل مع هذا المنتخب</div>
        `;
    });
}
/* ══════════════════════════════════════════════════════════
   WORLD CUP 2026 PROMO — END (admin logic)
══════════════════════════════════════════════════════════ */

function _updateCenterLocDisplay() {
    const el = document.getElementById('center-loc-current');
    const radiusInput = document.getElementById('coverage-radius-input');
    if (radiusInput && document.activeElement !== radiusInput) radiusInput.value = deliveryRadiusKm || 7;
    if (!el) return;
    if (deliveryCenterLoc) {
        el.textContent = `${deliveryCenterLoc.lat.toFixed(6)}, ${deliveryCenterLoc.lng.toFixed(6)}  ·  نطاق التغطية: ${deliveryRadiusKm} كم`;
        el.style.color = 'var(--white)';
    } else {
        el.textContent = '⚠ لم يتم تحديد الموقع بعد';
        el.style.color = 'rgba(239,68,68,0.8)';
    }
}

async function loadSettings() {
    try {
        const s = await fbGet('settings');
        if (!s) return;
        deliveryCenterLoc = (s.deliveryCenter
            && typeof s.deliveryCenter.lat === 'number'
            && typeof s.deliveryCenter.lng === 'number')
            ? s.deliveryCenter : null;
        deliveryRadiusKm = (deliveryCenterLoc && typeof deliveryCenterLoc.radiusKm === 'number' && deliveryCenterLoc.radiusKm > 0)
            ? deliveryCenterLoc.radiusKm : 7;
        _updateCenterLocDisplay();
        const maint = document.getElementById('toggle-maintenance');
        if (maint) maint.checked = s.maintenance === true || s.maintenance === 'true';
        const loyTog = document.getElementById('toggle-loyalty');
        if (loyTog) loyTog.checked = (s.loyaltyVisible === null || s.loyaltyVisible === undefined || s.loyaltyVisible === true || s.loyaltyVisible === 'true');
        const topStoresTog = document.getElementById('toggle-top-stores');
        if (topStoresTog) topStoresTog.checked = (s.topStoresVisible === null || s.topStoresVisible === undefined || s.topStoresVisible === true || s.topStoresVisible === 'true');
        const introTog = document.getElementById('toggle-intro');
        if (introTog) introTog.checked = (s.introEnabled === null || s.introEnabled === undefined || s.introEnabled === true || s.introEnabled === 'true');
        const reqLocTog = document.getElementById('toggle-require-location');
        if (reqLocTog) reqLocTog.checked = (s.requireLocation === null || s.requireLocation === undefined || s.requireLocation === true || s.requireLocation === 'true');
        // Test mode
        const testToggle = document.getElementById('toggle-test-mode');
        const testBadge  = document.getElementById('test-mode-badge');
        const testPreview= document.getElementById('test-mode-preview');
        const isTest     = s.testMode === true || s.testMode === 'true';
        if (testToggle)  testToggle.checked       = isTest;
        if (testBadge)   testBadge.style.display  = isTest ? 'inline-block' : 'none';
        if (testPreview) testPreview.style.display = isTest ? 'block' : 'none';
        const fee = document.getElementById('delivery-fee-input');
        if (fee && s.deliveryFee) fee.value = s.deliveryFee;
        const max = document.getElementById('max-orders-input');
        if (max && s.orders?.maxPerDay) max.value = s.orders.maxPerDay;
    } catch(e) {}
}

async function setMaintenance(val) {
    try {
        await fbSet('settings/maintenance', val);
        toast(val ? '🔧 وضع الصيانة مفعّل' : '✅ الموقع يعمل بشكل طبيعي');
    } catch(e) { toast('فشل تحديث وضع الصيانة', true); }
}

async function setRequireLocation(val) {
    try {
        await fbSet('settings/requireLocation', val);
        toast(val ? '📍 إلزامية الموقع مفعّلة — لا يمكن الطلب بدون موقع' : '⚠️ إلزامية الموقع معطّلة — يمكن الطلب بدون موقع بعد تحذير العميل');
    } catch(e) { toast('فشل تحديث إعداد إلزامية الموقع', true); }
}

/* ══════════════════════════════════════════════════════════
   REGISTRATION TYPE — direct | otp
══════════════════════════════════════════════════════════ */
function _syncRegTypeUI(type) {
    const directLabel  = document.getElementById('reg-type-direct-label');
    const otpLabel     = document.getElementById('reg-type-otp-label');
    const ultraSection = document.getElementById('ultramsg-section');
    const directRadio  = document.getElementById('reg-type-direct');
    const otpRadio     = document.getElementById('reg-type-otp');
    const isOtp = type === 'otp';

    if (directRadio) directRadio.checked = !isOtp;
    if (otpRadio)    otpRadio.checked    =  isOtp;
    if (directLabel) directLabel.style.borderColor = isOtp ? 'transparent' : 'var(--orange)';
    if (otpLabel)    otpLabel.style.borderColor    = isOtp ? 'var(--orange)' : 'transparent';
    if (ultraSection) ultraSection.style.display   = isOtp ? 'block' : 'none';
}

window.setRegType = async function(type) {
    try {
        await fbSet('settings/regType', type);
        _syncRegTypeUI(type);
        toast(type === 'otp' ? '🔐 تم التحويل لتسجيل OTP عبر واتساب' : '✅ تم التحويل للتسجيل المباشر');
    } catch(e) { toast('❌ فشل الحفظ', true); }
};

/* ══════════════════════════════════════════════════════════
   DRIVER ASSIGNMENT NOTIFICATION METHOD — app | whatsapp
══════════════════════════════════════════════════════════ */
function _syncDriverNotifyUI(method) {
    const appLabel = document.getElementById('drv-notify-app-label');
    const waLabel  = document.getElementById('drv-notify-whatsapp-label');
    const appRadio = document.getElementById('drv-notify-app');
    const waRadio  = document.getElementById('drv-notify-whatsapp');
    const isWa = method === 'whatsapp';

    if (appRadio) appRadio.checked = !isWa;
    if (waRadio)  waRadio.checked  =  isWa;
    if (appLabel) appLabel.style.borderColor = isWa ? 'transparent' : 'var(--orange)';
    if (waLabel)  waLabel.style.borderColor  = isWa ? 'var(--orange)' : 'transparent';
}

window.setDriverAssignNotifyMethod = async function(method) {
    const statusEl = document.getElementById('drv-notify-status');
    try {
        await fbSet('settings/driverAssignNotifyMethod', method);
        window._driverAssignNotifyMethod = method;
        _syncDriverNotifyUI(method);
        toast(method === 'whatsapp' ? '💬 سيتم إبلاغ السائقين عبر واتساب' : '📱 سيتم إبلاغ السائقين داخل التطبيق');
        if (statusEl) { statusEl.textContent = '✅ تم الحفظ'; statusEl.style.display = 'block'; setTimeout(() => statusEl.style.display = 'none', 2500); }
    } catch(e) { toast('❌ فشل الحفظ', true); }
};

window.saveUltraMsgConfig = async function() {
    const instance = document.getElementById('ultramsg-instance')?.value.trim();
    const token    = document.getElementById('ultramsg-token')?.value.trim();
    const statusEl = document.getElementById('ultramsg-status');
    if (!instance || !token) {
        if (statusEl) { statusEl.textContent = '⚠️ أدخل Instance ID والـ Token'; statusEl.style.background = 'rgba(239,68,68,0.1)'; statusEl.style.color = 'var(--red)'; statusEl.style.display = 'block'; }
        return;
    }
    try {
        await fbSet('settings/greenApiInstance', instance);
        await fbSet('settings/greenApiToken', token);
        window._greenApiInstance = instance;
        window._greenApiToken    = token;
        if (statusEl) { statusEl.textContent = '✅ تم الحفظ'; statusEl.style.background = 'rgba(74,222,128,0.1)'; statusEl.style.color = '#4ade80'; statusEl.style.display = 'block'; setTimeout(() => statusEl.style.display = 'none', 3000); }
        toast('✅ إعدادات GREEN-API محفوظة');
    } catch(e) { toast('❌ فشل الحفظ', true); }
};

window.testUltraMsg = async function() {
    const instance = document.getElementById('ultramsg-instance')?.value.trim() || await fbGet('settings/greenApiInstance');
    const token    = document.getElementById('ultramsg-token')?.value.trim()    || await fbGet('settings/greenApiToken');
    const phone    = (document.getElementById('admin-phone-input')?.value.trim()
                   || await fbGet('settings/adminPhone').catch(() => '') || '').replace(/[^0-9]/g, '');
    const statusEl = document.getElementById('ultramsg-status');
    if (!instance || !token) {
        if (statusEl) { statusEl.textContent = '⚠️ أدخل الإعدادات أولاً'; statusEl.style.color='var(--red)'; statusEl.style.display = 'block'; }
        return;
    }
    if (!phone) {
        if (statusEl) { statusEl.textContent = '⚠️ أدخل رقم هاتف الإدارة أولاً'; statusEl.style.color='var(--red)'; statusEl.style.display = 'block'; }
        return;
    }
    const chatId = phone + '@c.us';
    if (statusEl) { statusEl.textContent = '⏳ جاري الإرسال…'; statusEl.style.color='var(--text)'; statusEl.style.background=''; statusEl.style.display = 'block'; }
    try {
        const _gaServer = String(instance).slice(0, 4);
        const url  = `https://${_gaServer}.api.greenapi.com/waInstance${instance}/sendMessage/${token}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: '✅ اختبار Delivo OTP — GREEN-API يعمل بشكل صحيح 🎉' }),
        });
        const data = await resp.json();
        console.log('[GreenAPI test] status:', resp.status, 'response:', data);
        if (resp.ok && data.idMessage) {
            if (statusEl) { statusEl.textContent = '✅ أُرسلت رسالة اختبار على واتساب'; statusEl.style.background='rgba(74,222,128,0.1)'; statusEl.style.color='#4ade80'; }
        } else {
            if (statusEl) { statusEl.textContent = '❌ فشل: ' + JSON.stringify(data); statusEl.style.background='rgba(239,68,68,0.1)'; statusEl.style.color='var(--red)'; }
        }
    } catch(e) {
        if (statusEl) { statusEl.textContent = '❌ خطأ: ' + e.message; statusEl.style.background='rgba(239,68,68,0.1)'; statusEl.style.color='var(--red)'; }
    }
};

/* ══════════════════════════════════════════════════════════
   DELETE USER ACCOUNT — full cleanup including Firebase Auth
   Removes:
     • Firebase Auth account (Identity Toolkit REST)
     • Firestore users/{uid}
     • Firestore usernames/{username}  → username becomes free immediately
     • RTDB phoneIndex/{phone}
     • RTDB historyRequests/{uid}
     • RTDB blacklist/{uid}
     • RTDB devices/{deviceUUID} accountCount decremented
     • All RTDB cleanup markers
══════════════════════════════════════════════════════════ */
