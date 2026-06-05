/* ============================================================
   scripts/mealtime.js  — Meal-time smart store recommendations
   Shows a contextual section based on current time of day.
   Stores are tagged in Firebase: pattern/{type}/{key}/mealTags
   e.g. mealTags: ['breakfast','lunch','dinner']
   ============================================================ */

(function () {
    const RTDB = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

    /* ── Meal periods ──────────────────────────────────────── */
    /* ══════════════════════════════════════════════════════════
       TODO — RAMADAN UPDATE (add later):
       sohoor: {
           label:    'وقت السحور',
           title:    'السحور على أبوابك 🌙✨',
           sub:      'وجباتك قبل الفجر بوقت كافٍ',
           icon:     '🌙',
           modifier: 'mt-banner--dinner',
           hours:    [1, 4],   // 1:00 AM → 3:59 AM
       }
       + Add 'sohoor' to MEAL_FALLBACK_TYPES:
           sohoor: ['BakeryShops','Restaurants','SweetsShops','CoffeeShops'],
       + Add Ramadan date-range check so sohoor only shows during Ramadan.
    ══════════════════════════════════════════════════════════ */

    const MEALS = {
        breakfast: {
            label:    'وقت الفطور',
            title:    'صباحك يبدأ من هنا ☀️',
            sub:      'اختر فطورك الآن ويوصلك طازجاً',
            icon:     '🍳',
            modifier: 'mt-banner--breakfast',
            hours:    [6, 11],    // 06:00 → 10:59
        },
        lunch: {
            label:    'وقت الغداء',
            title:    'جوعان؟ غداءك بالطريق 🍱',
            sub:      'أسرع المطاعم والوجبات لوقت الغداء',
            icon:     '🍽',
            modifier: 'mt-banner--lunch',
            hours:    [11, 16],   // 11:00 → 15:59
        },
        snack: {
            label:    'وقت السناك',
            title:    'استراحة وكمالة 🧁',
            sub:      'مشروبات • حلويات • وجبات خفيفة',
            icon:     '☕',
            modifier: 'mt-banner--snack',
            hours:    [16, 19],   // 16:00 → 18:59
        },
        dinner: {
            label:    'وقت العشاء',
            title:    'أحلى عشاء مع أهلك 🌙',
            sub:      'خيارات متنوعة لعشاء دافئ في البيت',
            icon:     '🌙',
            modifier: 'mt-banner--dinner',
            hours:    [19, 24],   // 19:00 → 23:59
        },
    };

    /* ── Detect current meal period ────────────────────────── */
    function _currentMeal() {
        const h = new Date().getHours();
        for (const [key, m] of Object.entries(MEALS)) {
            if (h >= m.hours[0] && h < m.hours[1]) return { key, ...m };
        }
        return null; // e.g. midnight → 05:59: no section
    }

    /* ── Format clock ──────────────────────────────────────── */
    function _clockStr() {
        return new Date().toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    /* ── Category fallbacks when no mealTags are set ──────── */
    // These category types naturally fit each meal period
    const MEAL_FALLBACK_TYPES = {
        breakfast: ['BakeryShops', 'CoffeeShops', 'DairyShops', 'SweetsShops'],
        lunch:     ['Restaurants', 'ButcherShops', 'FishShops', 'ChickenShops'],
        snack:     ['CoffeeShops', 'SweetsShops', 'BakeryShops', 'GroceryShops'],
        dinner:    ['Restaurants', 'ButcherShops', 'ChickenShops', 'FishShops'],
    };

    /* ── Fetch all stores from Firebase pattern ────────────── */
    async function _fetchTaggedStores(mealKey) {
        try {
            const r = await fetch(`${RTDB}/pattern.json`);
            if (!r.ok) return { stores: [], isFallback: true };
            const pattern = await r.json();
            if (!pattern) return { stores: [], isFallback: true };

            // Also fetch storeStatus to filter closed/disabled
            const sr = await fetch(`${RTDB}/storeStatus.json`).catch(() => null);
            const statuses = sr && sr.ok ? await sr.json().catch(() => null) : null;

            const allStores = [];
            const tagged    = [];

            Object.entries(pattern).forEach(([type, list]) => {
                const arr = Array.isArray(list) ? list : Object.values(list);
                arr.forEach(s => {
                    if (!s || !s.companyname) return;
                    if (s.disabled === true || s.disabled === '1' || s.disabled === 1) return;
                    const st = statuses && statuses[s.companyname];
                    if (st && (st.closed === true || st.closed === '1' || st.closed === 1)) return;
                    const store = { ...s, _type: type };
                    allStores.push(store);
                    const tags = s.mealTags || s.mealtags || [];
                    if (Array.isArray(tags) && tags.includes(mealKey)) tagged.push(store);
                });
            });

            const _sort = arr => arr.sort((a, b) => {
                const pa = a.priority !== undefined ? parseInt(a.priority) : 9999;
                const pb = b.priority !== undefined ? parseInt(b.priority) : 9999;
                if (pa !== pb) return pa - pb;
                return (parseFloat(b.rank) || 0) - (parseFloat(a.rank) || 0);
            });

            // If explicit tags exist → use them
            if (tagged.length) return { stores: _sort(tagged), isFallback: false };

            // Fallback: pick stores from relevant category types
            const fallbackTypes = MEAL_FALLBACK_TYPES[mealKey] || [];
            const fallback = allStores.filter(s => fallbackTypes.includes(s._type));
            return { stores: _sort(fallback), isFallback: true };

        } catch (_) { return { stores: [], isFallback: true }; }
    }

    /* ── Build store card HTML ─────────────────────────────── */
    function _cardHTML(store, mealLabel) {
        const name  = store.companyname;
        const img   = `assets/${name.toLowerCase()}.png`;
        const tags  = store.tags || store.storeType || '';
        const typeMap = {
            Restaurants:'مطعم', BakeryShops:'مخبز', ButcherShops:'ملحمة',
            Markets:'سوبرماركت', GroceryShops:'بقالة', SweetsShops:'حلويات',
            FishShops:'أسماك', CoffeeShops:'قهوة', ChickenShops:'دجاج',
            DairyShops:'ألبان', FlowerShops:'زهور', TobaccoShops:'تبغ',
            ToysShops:'ألعاب', Taxi:'تاكسي',
        };
        const emojiMap = {
            Restaurants:'🍔', BakeryShops:'🥖', ButcherShops:'🥩',
            Markets:'🛒', GroceryShops:'🧺', SweetsShops:'🍰',
            FishShops:'🐟', CoffeeShops:'☕', ChickenShops:'🍗',
            DairyShops:'🥛', FlowerShops:'💐', TobaccoShops:'🚬',
            ToysShops:'🧸', Taxi:'🚕',
        };
        const typeLabel = tags || typeMap[store._type] || '';
        const emoji     = emojiMap[store._type] || '🏪';

        return `
        <div class="mt-card"
             data-store-name="${name}"
             data-store-type="${store._type}">
            <div class="mt-card__thumb">
                <img src="${img}" alt="${name}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div style="display:none;width:100%;height:100%;align-items:center;
                            justify-content:center;font-size:2rem;">${emoji}</div>
                <span class="mt-card__meal-tag">${mealLabel}</span>
            </div>
            <div class="mt-card__body">
                <div class="mt-card__name">${name}</div>
                <div class="mt-card__tags">${typeLabel}</div>
            </div>
        </div>`;
    }

    /* ── Wire drag-scroll ──────────────────────────────────── */
    function _initDrag(el) {
        let isDown = false, startX, scrollLeft;
        el.addEventListener('mousedown', e => {
            isDown = true; el.classList.add('dragging');
            startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft;
        });
        el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
        el.addEventListener('mouseup',    () => { isDown = false; el.classList.remove('dragging'); });
        el.addEventListener('mousemove',  e => {
            if (!isDown) return; e.preventDefault();
            el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX);
        });
    }

    /* ── Main init ─────────────────────────────────────────── */
    async function init() {
        const section = document.getElementById('mealtime-section');
        if (!section) return;

        const meal = _currentMeal();
        if (!meal) return; // off-hours — keep hidden

        const { stores, isFallback } = await _fetchTaggedStores(meal.key);
        if (!stores.length) return; // nothing to show — keep hidden

        const subText = isFallback
            ? 'مقترحات لهذا الوقت من المتاجر المتاحة'
            : meal.sub;

        // Build section HTML
        section.innerHTML = `
        <div class="mt-banner ${meal.modifier}">
            <span class="mt-banner__icon">${meal.icon}</span>
            <div class="mt-banner__text">
                <div class="mt-banner__label">${meal.label}</div>
                <div class="mt-banner__title">${meal.title}</div>
                <div class="mt-banner__sub">${subText}</div>
            </div>
            <div class="mt-banner__time">🕐 ${_clockStr()}</div>
        </div>
        <div class="mt-scroll hide-scrollbar" id="mt-scroll">
            ${stores.map(s => _cardHTML(s, isFallback ? '' : meal.label)).join('')}
        </div>`;

        // Wire store clicks
        section.querySelectorAll('.mt-card').forEach(card => {
            card.addEventListener('click', () => {
                const name = card.dataset.storeName;
                const type = card.dataset.storeType;
                // Build a slug id matching stores.js convention
                const id   = name.toLowerCase().replace(/\s+/g, '-');
                if (typeof openStorePanel === 'function') {
                    openStorePanel(id, name, type);
                }
            });
        });

        _initDrag(document.getElementById('mt-scroll'));

        // Show section with a smooth fade-in
        section.style.display = 'block';
        section.style.opacity = '0';
        requestAnimationFrame(() => {
            section.style.transition = 'opacity 0.4s';
            section.style.opacity = '1';
        });
    }

    // Run after page is interactive
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose so admin can call it for live preview
    window.initMealtime = init;
})();