/* ============================================================
   onboarding.js — First-launch walkthrough for Delivo
   Shows once, stored in localStorage as 'delivo_onboarded'
   Call initOnboarding() from loader.js after loadAll()
   ============================================================ */

(function () {
    'use strict';

    const STORAGE_KEY = 'delivo_onboarded_v1';

    const STEPS = [
        {
            icon: `<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="28" r="26" fill="rgba(255,92,0,0.12)" stroke="rgba(255,92,0,0.3)" stroke-width="1.5"/>
                <path d="M36 20H20a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V22a2 2 0 0 0-2-2z" stroke="#FF5C00" stroke-width="2" stroke-linecap="round"/>
                <path d="M28 20v16M20 28h16" stroke="#FF5C00" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="22" cy="24" r="1.5" fill="#FF5C00"/>
                <circle cx="28" cy="24" r="1.5" fill="#FF5C00"/>
                <circle cx="34" cy="24" r="1.5" fill="#FF5C00"/>
                <circle cx="22" cy="32" r="1.5" fill="#FF5C00"/>
                <circle cx="28" cy="32" r="1.5" fill="#FF5C00"/>
                <circle cx="34" cy="32" r="1.5" fill="#FF5C00"/>
            </svg>`,
            num: '01',
            title: 'اختر من أفضل المتاجر',
            subtitle: 'تصفّح عشرات المطاعم والمتاجر في بعلبك',
            body: 'مطاعم، سوبرماركت، ملاحم، مخابز، حلويات، كافيهات — كل شي بمكان واحد. رتّبة حسب الأكثر طلباً لتوصلك للأفضل بسرعة.',
            tags: ['🍔 مطاعم', '🛒 سوبرماركت', '🥩 ملاحم', '🍰 حلويات', '☕ كافيه'],
            img: 'assets/hero-mobile1.png',
            color: '#FF5C00',
        },
        {
            icon: `<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="28" r="26" fill="rgba(255,92,0,0.12)" stroke="rgba(255,92,0,0.3)" stroke-width="1.5"/>
                <path d="M18 22h2.5l1.8 8h11.4l2.3-5.5H22" stroke="#FF5C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="24" cy="33" r="2" stroke="#FF5C00" stroke-width="1.8"/>
                <circle cx="34" cy="33" r="2" stroke="#FF5C00" stroke-width="1.8"/>
                <path d="M30 26v-4M28 24h4" stroke="#FF5C00" stroke-width="1.8" stroke-linecap="round"/>
            </svg>`,
            num: '02',
            title: 'اطلب بخطوات بسيطة',
            subtitle: 'السلة الذكية تجمع طلباتك من عدة متاجر',
            body: 'اختر منتجاتك وأضفها للسلة. تقدر تطلب من أكثر من متجر بنفس الوقت. عند الإتمام اختر موقع التوصيل من الخريطة أو موقعك الحالي.',
            tags: ['📍 تحديد الموقع', '🗺️ خريطة', '🧾 تأكيد الطلب'],
            img: 'assets/hero-mobile2.png',
            color: '#e05500',
        },
        {
            icon: `<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="28" r="26" fill="rgba(255,92,0,0.12)" stroke="rgba(255,92,0,0.3)" stroke-width="1.5"/>
                <circle cx="28" cy="26" r="8" stroke="#FF5C00" stroke-width="2"/>
                <circle cx="28" cy="26" r="3" fill="#FF5C00"/>
                <circle cx="28" cy="26" r="14" stroke="rgba(255,92,0,0.25)" stroke-width="1.2" stroke-dasharray="3 3"/>
                <path d="M28 36v5M26 39h4" stroke="#FF5C00" stroke-width="2" stroke-linecap="round"/>
                <circle cx="40" cy="16" r="3.5" fill="#22c55e"/>
                <circle cx="40" cy="16" r="3.5" fill="#22c55e" opacity="0.4">
                    <animate attributeName="r" from="3.5" to="8" dur="1.4s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" from="0.4" to="0" dur="1.4s" repeatCount="indefinite"/>
                </circle>
            </svg>`,
            num: '03',
            title: 'تابع السائق مباشرة',
            subtitle: 'تتبع لحظي للطلب من المتجر لبابك',
            body: 'بعد تأكيد الطلب تقدر تشوف وين السائق بالضبط على الخريطة. اضغط "تتبع الطلب" من القائمة أو من حسابك لتشوف حالة كل طلب.',
            tags: ['🟢 مباشر', '🗺️ خريطة حية', '📦 حالة الطلب'],
            img: 'assets/hero-mobile3.png',
            color: '#cc4800',
        },
        {
            icon: `<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="28" cy="28" r="26" fill="rgba(255,92,0,0.12)" stroke="rgba(255,92,0,0.3)" stroke-width="1.5"/>
                <path d="M20 30l5 5 11-11" stroke="#FF5C00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M36 22a10 10 0 1 1-14.14 14.14" stroke="rgba(255,92,0,0.3)" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 3"/>
                <circle cx="28" cy="20" r="3" fill="rgba(255,92,0,0.2)" stroke="#FF5C00" stroke-width="1.5"/>
            </svg>`,
            num: '04',
            title: 'استلم واستمتع',
            subtitle: 'توصيل سريع خلال 20–40 دقيقة',
            body: 'طلبك يوصلك لباب البيت طازج وفي أسرع وقت. سجّل حساب الآن لتتابع سجل طلباتك وتستفيد من العروض الحصرية.',
            tags: ['⚡ 20–40 دقيقة', '🎁 عروض حصرية', '📋 سجل الطلبات'],
            img: 'assets/hero-mobile4.png',
            color: '#FF5C00',
        },
    ];

    /* ── Inject CSS ──────────────────────────────────────────── */
    function injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
        /* ── Overlay ── */
        #ob-overlay {
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(10,10,15,0.92);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            padding: 16px;
            animation: ob-fadein 0.5s ease both;
            font-family: 'Almarai', sans-serif;
            direction: rtl;
        }
        @keyframes ob-fadein { from { opacity:0 } to { opacity:1 } }

        /* ── Card ── */
        #ob-card {
            background: #ffffff;
            border-radius: 28px;
            width: 100%;
            max-width: 420px;
            max-height: 92vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
            position: relative;
        }

        /* ── Progress bar ── */
        #ob-progress-track {
            height: 3px;
            background: #f0f0f2;
            flex-shrink: 0;
        }
        #ob-progress-fill {
            height: 100%;
            background: #FF5C00;
            border-radius: 0 2px 2px 0;
            transition: width 0.45s cubic-bezier(0.4,0,0.2,1);
        }

        /* ── Header ── */
        #ob-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px 0;
            flex-shrink: 0;
        }
        .ob-logo {
            display: flex; align-items: center; gap: 7px;
        }
        .ob-logo img {
            width: 28px; height: 28px; object-fit: contain;
        }
        .ob-logo-name {
            font-size: 1rem; font-weight: 800; color: #FF5C00; letter-spacing: -0.3px;
        }
        #ob-skip {
            font-size: 0.72rem; font-weight: 700; color: #9898a6;
            background: #f0f0f2; border: none; border-radius: 50px;
            padding: 5px 14px; cursor: pointer;
            transition: background 0.2s, color 0.2s;
        }
        #ob-skip:hover { background: #e2e2e6; color: #555; }

        /* ── Step dots ── */
        #ob-dots {
            display: flex; align-items: center; justify-content: center;
            gap: 6px; padding: 14px 0 0;
            flex-shrink: 0;
        }
        .ob-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #e2e2e6;
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .ob-dot.active {
            width: 20px; border-radius: 3px; background: #FF5C00;
        }

        /* ── Slides container ── */
        #ob-slides-wrap {
            overflow: hidden;
            flex: 1;
            min-height: 0;
        }
        #ob-slides {
            display: flex;
            transition: transform 0.45s cubic-bezier(0.4,0,0.2,1);
            height: 100%;
        }

        /* ── Single slide ── */
        .ob-slide {
            flex: 0 0 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 0 24px 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        /* ── Icon circle ── */
        .ob-icon {
            width: 72px; height: 72px;
            flex-shrink: 0;
            margin-top: 20px;
            animation: ob-popIn 0.5s cubic-bezier(0.34,1.45,0.64,1) both;
        }
        .ob-icon svg { width: 72px; height: 72px; }
        @keyframes ob-popIn {
            from { transform: scale(0.6); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
        }

        /* ── Step number ── */
        .ob-num {
            font-size: 0.65rem; font-weight: 800; letter-spacing: 2px;
            color: #FF5C00; margin-top: 14px;
            text-transform: uppercase;
        }

        /* ── Title ── */
        .ob-title {
            font-size: 1.3rem; font-weight: 800;
            color: #0f0f0f; text-align: center;
            margin-top: 6px; line-height: 1.25;
        }

        /* ── Subtitle ── */
        .ob-subtitle {
            font-size: 0.8rem; font-weight: 700;
            color: #FF5C00; text-align: center;
            margin-top: 4px;
        }

        /* ── Body ── */
        .ob-body {
            font-size: 0.82rem; color: #555; line-height: 1.75;
            text-align: center; margin-top: 10px;
        }

        /* ── Tags ── */
        .ob-tags {
            display: flex; flex-wrap: wrap;
            justify-content: center; gap: 6px;
            margin-top: 12px;
        }
        .ob-tag {
            font-size: 0.7rem; font-weight: 700;
            background: #fff3ed; color: #FF5C00;
            border: 1px solid rgba(255,92,0,0.2);
            border-radius: 50px; padding: 4px 12px;
        }

        /* ── Phone image ── */
        .ob-phone-wrap {
            width: 120px;
            flex-shrink: 0;
            margin-top: 16px;
            margin-bottom: 8px;
        }
        .ob-phone-wrap img {
            width: 100%; height: auto; display: block;
            filter: drop-shadow(0 8px 20px rgba(0,0,0,0.18));
            animation: ob-floatUp 0.55s cubic-bezier(0.34,1.3,0.64,1) both 0.1s;
        }
        @keyframes ob-floatUp {
            from { transform: translateY(18px); opacity:0; }
            to   { transform: translateY(0);     opacity:1; }
        }

        /* ── Footer ── */
        #ob-footer {
            padding: 14px 20px 20px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #ob-next-btn {
            width: 100%;
            padding: 14px;
            background: #FF5C00;
            color: #fff;
            font-family: 'Almarai', sans-serif;
            font-size: 0.95rem;
            font-weight: 800;
            border: none;
            border-radius: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: background 0.2s, transform 0.15s;
            box-shadow: 0 4px 16px rgba(255,92,0,0.35);
        }
        #ob-next-btn:hover  { background: #cc4800; }
        #ob-next-btn:active { transform: scale(0.98); }
        .ob-next-arrow {
            display: inline-block;
            transition: transform 0.2s;
        }
        #ob-next-btn:hover .ob-next-arrow { transform: translateX(-4px); }

        /* ── Step counter ── */
        #ob-step-label {
            text-align: center;
            font-size: 0.68rem; font-weight: 700; color: #c0c0cc;
        }

        /* ── Safe area for phones ── */
        @media (max-height: 680px) {
            .ob-icon  { width: 56px; height: 56px; margin-top: 12px; }
            .ob-icon svg { width: 56px; height: 56px; }
            .ob-title { font-size: 1.1rem; }
            .ob-body  { font-size: 0.76rem; margin-top: 6px; }
            .ob-phone-wrap { width: 90px; margin-top: 10px; }
            .ob-tags { margin-top: 8px; }
        }
        `;
        document.head.appendChild(style);
    }

    /* ── Build HTML ──────────────────────────────────────────── */
    function buildHTML() {
        const overlay = document.createElement('div');
        overlay.id = 'ob-overlay';

        overlay.innerHTML = `
        <div id="ob-card" role="dialog" aria-modal="true" aria-label="مرحباً في Delivo">

            <!-- Progress bar -->
            <div id="ob-progress-track">
                <div id="ob-progress-fill" style="width:25%"></div>
            </div>

            <!-- Header -->
            <div id="ob-header">
                <div class="ob-logo">
                    <img src="assets/logo.png" alt="Delivo" onerror="this.style.display='none'">
                    <span class="ob-logo-name">Delivo</span>
                </div>
                <button id="ob-skip">تخطي</button>
            </div>

            <!-- Dots -->
            <div id="ob-dots">
                ${STEPS.map((_, i) => `<div class="ob-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}
            </div>

            <!-- Slides -->
            <div id="ob-slides-wrap">
                <div id="ob-slides">
                    ${STEPS.map((s, i) => `
                    <div class="ob-slide" data-step="${i}">
                        <div class="ob-icon">${s.icon}</div>
                        <div class="ob-num">الخطوة ${s.num}</div>
                        <div class="ob-title">${s.title}</div>
                        <div class="ob-subtitle">${s.subtitle}</div>
                        <div class="ob-body">${s.body}</div>
                        <div class="ob-tags">${s.tags.map(t => `<span class="ob-tag">${t}</span>`).join('')}</div>
                        <div class="ob-phone-wrap">
                            <img src="${s.img}" alt="${s.title}" loading="lazy">
                        </div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- Footer -->
            <div id="ob-footer">
                <button id="ob-next-btn">
                    التالي
                    <span class="ob-next-arrow">←</span>
                </button>
                <div id="ob-step-label">1 من ${STEPS.length}</div>
            </div>
        </div>`;

        document.body.appendChild(overlay);
    }

    /* ── Controller ──────────────────────────────────────────── */
    function init() {
        let current = 0;
        const total = STEPS.length;

        const slides     = document.getElementById('ob-slides');
        const progress   = document.getElementById('ob-progress-fill');
        const dotsEl     = document.getElementById('ob-dots');
        const nextBtn    = document.getElementById('ob-next-btn');
        const stepLabel  = document.getElementById('ob-step-label');
        const skipBtn    = document.getElementById('ob-skip');

        function goTo(idx) {
            current = idx;
            // Slide
            slides.style.transform = `translateX(${current * 100}%)`;  // RTL: positive = next
            // Progress
            progress.style.width = `${((current + 1) / total) * 100}%`;
            // Dots
            dotsEl.querySelectorAll('.ob-dot').forEach((d, i) => {
                d.classList.toggle('active', i === current);
            });
            // Button label
            const isLast = current === total - 1;
            nextBtn.innerHTML = isLast
                ? 'ابدأ الآن 🎉'
                : `التالي <span class="ob-next-arrow">←</span>`;
            // Step label
            stepLabel.textContent = `${current + 1} من ${total}`;

            // Re-trigger icon animation on new slide
            const activeSlide = document.querySelector(`.ob-slide[data-step="${current}"]`);
            if (activeSlide) {
                const icon = activeSlide.querySelector('.ob-icon');
                const img  = activeSlide.querySelector('.ob-phone-wrap img');
                if (icon) { icon.style.animation = 'none'; void icon.offsetWidth; icon.style.animation = ''; }
                if (img)  { img.style.animation  = 'none'; void img.offsetWidth;  img.style.animation  = ''; }
            }
        }

        function close() {
            const overlay = document.getElementById('ob-overlay');
            if (!overlay) return;
            overlay.style.transition = 'opacity 0.4s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 420);
            localStorage.setItem(STORAGE_KEY, '1');
            document.body.style.overflow = '';
        }

        nextBtn.addEventListener('click', () => {
            if (current < total - 1) goTo(current + 1);
            else close();
        });

        skipBtn.addEventListener('click', close);

        // Click outside card to skip
        document.getElementById('ob-overlay').addEventListener('click', e => {
            if (e.target.id === 'ob-overlay') close();
        });

        // Swipe support
        let touchStartX = 0;
        const card = document.getElementById('ob-card');
        card.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        card.addEventListener('touchend', e => {
            const dx = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(dx) > 50) {
                // RTL: swipe left = next, swipe right = prev
                if (dx > 0 && current < total - 1) goTo(current + 1);
                if (dx < 0 && current > 0)         goTo(current - 1);
            }
        }, { passive: true });

        // Keyboard
        document.addEventListener('keydown', e => {
            if (!document.getElementById('ob-overlay')) return;
            if (e.key === 'ArrowLeft'  && current < total - 1) goTo(current + 1);
            if (e.key === 'ArrowRight' && current > 0)         goTo(current - 1);
            if (e.key === 'Escape') close();
        });

        document.body.style.overflow = 'hidden';
        goTo(0);
    }

    /* ── Public entry point ──────────────────────────────────── */
    window.initOnboarding = function () {
        // Only show on first visit
        if (localStorage.getItem(STORAGE_KEY)) return;
        // Small delay so the splash finishes fading first
        setTimeout(() => {
            injectCSS();
            buildHTML();
            init();
        }, 600);
    };

    // Also expose a reset helper for testing (call in console: resetOnboarding())
    window.resetOnboarding = function () {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[Delivo] Onboarding reset — reload to see it again.');
    };

})();