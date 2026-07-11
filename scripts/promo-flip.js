/* ============================================================
   scripts/promo-flip.js
   Powers the "عروض ما بتتفوّت" flip-card promo section.

   Cards now come from Firebase (promoFlipCards/*), managed from
   the admin panel (لوحة الإدارة → كروت العروض) — add/edit/remove/
   reorder/enable-disable, all without a code deploy.

   - Click/tap a card → flips it (front image ↔ back details)
   - Works with keyboard (Enter/Space) since cards are tabbable
   - Auto-advancing carousel + dots on mobile, same pattern as
     the offers carousel in stores.js
   - CTA buttons on the back open WhatsApp with the admin-set
     order message for that specific card
   - Plays a one-time "hint" flip after the splash hides so
     people realize the cards are interactive
   ============================================================ */

const RTDB_PROMO_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

function _escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
}

/* "name = price" per line -> [{label, value}] */
function _parseItemsRaw(raw) {
    return String(raw || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split('=');
        const label = (parts[0] || '').trim();
        const value = (parts[1] || '').trim();
        return { label: label, value: value };
    });
}
/* comma-separated -> [tag, tag, ...] */
function _parseTagsRaw(raw) {
    return String(raw || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function _badgeClass(style) {
    if (style === 'food') return 'promo-flip-card__badge--food';
    if (style === 'custom') return '';
    return 'promo-flip-card__badge--hot';
}

function _renderBackInner(card) {
    const storeRow = card.storeName ? (
        '<div class="promo-flip-card__store">' +
            '<span class="promo-flip-card__store-name">' + _escapeHtml(card.storeName) + '</span>' +
            '<span class="promo-flip-card__x">×</span>' +
            '<span class="promo-flip-card__brand">Delivo</span>' +
        '</div>'
    ) : (
        '<div class="promo-flip-card__store"><span class="promo-flip-card__brand">Delivo</span></div>'
    );

    const title = card.title ? ('<div class="promo-flip-card__title">' + _escapeHtml(card.title) + '</div>') : '';

    let middle = '';
    if (card.backStyle === 'items') {
        const items = _parseItemsRaw(card.itemsRaw);
        if (items.length) {
            middle = '<ul class="promo-flip-card__items">' + items.map(function (it) {
                return '<li><span>' + _escapeHtml(it.label) + '</span><b>' + _escapeHtml(it.value) + '</b></li>';
            }).join('') + '</ul>';
        }
    } else {
        if (card.description) middle += '<p class="promo-flip-card__desc">' + _escapeHtml(card.description) + '</p>';
        const tags = _parseTagsRaw(card.tagsRaw);
        if (tags.length) {
            middle += '<div class="promo-flip-card__tags">' + tags.map(function (t) {
                return '<span>' + _escapeHtml(t) + '</span>';
            }).join('') + '</div>';
        }
    }

    const footerLeft = (card.backStyle !== 'items' && card.priceText)
        ? ('<span class="promo-flip-card__price">' + _escapeHtml(card.priceText) + '</span>')
        : (card.footerNote ? ('<span class="promo-flip-card__valid">' + _escapeHtml(card.footerNote) + '</span>') : '<span></span>');

    const ctaText = card.ctaText || '🛒 اطلب الآن';
    const orderText = card.orderText || '';

    return storeRow + title + middle +
        '<div class="promo-flip-card__footer">' + footerLeft +
        '<a href="#" class="promo-flip-card__cta" data-promo-cta data-order-text="' + _escapeHtml(orderText) + '">' + _escapeHtml(ctaText) + '</a>' +
        '</div>';
}

function _renderCard(card, idx) {
    const badgeStyleAttr = (card.badgeStyle === 'custom' && card.badgeColor)
        ? (' style="background:' + _escapeHtml(card.badgeColor) + ';box-shadow:0 4px 14px ' + _escapeHtml(card.badgeColor) + '66;"')
        : '';
    const backAltClass = (idx % 2 === 1) ? ' promo-flip-card__face--back-alt' : '';
    const badgeHtml = card.badgeText
        ? ('<span class="promo-flip-card__badge ' + _badgeClass(card.badgeStyle) + '"' + badgeStyleAttr + '>' + _escapeHtml(card.badgeText) + '</span>')
        : '';
    const label = _escapeHtml(card.title || card.storeName || 'عرض');

    return (
        '<div class="promo-flip-card" data-promo-card tabindex="0" role="button" aria-pressed="false" ' +
             'aria-label="' + label + '، إضغط لتشوف التفاصيل">' +
            '<div class="promo-flip-card__inner">' +
                '<div class="promo-flip-card__face promo-flip-card__face--front">' +
                    '<img src="' + _escapeHtml(card.image) + '" alt="' + _escapeHtml(card.storeName || card.title || 'عرض') + '" loading="lazy">' +
                    '<div class="promo-flip-card__scrim"></div>' +
                    badgeHtml +
                    '<span class="promo-flip-card__flip-icon" aria-hidden="true">↻</span>' +
                    '<span class="promo-flip-card__hint">إضغط لتشوف العرض</span>' +
                '</div>' +
                '<div class="promo-flip-card__face promo-flip-card__face--back' + backAltClass + '">' +
                    '<div class="promo-flip-card__back-content">' + _renderBackInner(card) + '</div>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
}

async function _fetchPromoCards() {
    try {
        const res = await fetch(RTDB_PROMO_URL + '/promoFlipCards.json');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!data || typeof data !== 'object') return [];

        const list = Object.values(data).filter(function (c) { return c && c.active !== false; });
        list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        return list;
    } catch (_) {
        return [];
    }
}

async function initPromoFlip() {
    const section = document.getElementById('promo-flip-section');
    const track   = document.getElementById('promo-flip-track');
    if (!section || !track) return;

    const cardsData = await _fetchPromoCards();
    if (!cardsData.length) { section.style.display = 'none'; return; }

    track.innerHTML = cardsData.map(_renderCard).join('');

    const cards = section.querySelectorAll('[data-promo-card]');
    if (!cards.length) return;

    /* Wire the WhatsApp CTA on every card's back face */
    fetch(RTDB_PROMO_URL + '/settings/adminPhone.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (raw) {
            const digits = raw ? String(raw).replace(/\D/g, '') : '';
            if (!digits) return;
            section.querySelectorAll('[data-promo-cta]').forEach(function (cta) {
                const text = cta.dataset.orderText || '';
                cta.href = 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
                cta.target = '_blank';
                cta.rel = 'noopener';
            });
        })
        .catch(function () {});

    /* Flip toggle — click anywhere on the card flips it, except the CTA link */
    function toggleFlip(card) {
        const flipped = card.classList.toggle('is-flipped');
        card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    }

    cards.forEach(function (card) {
        card.addEventListener('click', function (e) {
            if (e.target.closest('[data-promo-cta]')) return;
            toggleFlip(card);
        });
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.closest('[data-promo-cta]')) return;
                e.preventDefault();
                toggleFlip(card);
            }
        });
    });

    /* Auto-advancing carousel (mobile only) + dots — same pattern as
       the offers carousel in stores.js */
    const scroll = document.getElementById('promo-flip-scroll');
    const dotsEl = document.getElementById('promo-flip-dots');
    if (scroll && dotsEl) {
        const total = cards.length;
        let current = 0, autoTimer = null;
        const isPhone = function () { return window.innerWidth < 540; };

        function buildDots() {
            dotsEl.innerHTML = '';
            if (!isPhone()) return;
            cards.forEach(function (_, i) {
                const dot = document.createElement('span');
                dot.className = 'promo-flip__dot' + (i === current ? ' active' : '');
                dot.addEventListener('click', function () { goTo(i); });
                dotsEl.appendChild(dot);
            });
        }
        function updateDots() {
            dotsEl.querySelectorAll('.promo-flip__dot').forEach(function (d, i) { d.classList.toggle('active', i === current); });
        }
        function goTo(index) {
            if (!isPhone()) return;
            current = (index + total) % total;
            const card = cards[current];
            const padLeft = parseInt(getComputedStyle(scroll).paddingLeft) || 0;
            scroll.scrollTo({ left: card.offsetLeft - padLeft, behavior: 'smooth' });
            updateDots();
        }
        function next() { goTo(current + 1); }
        function startAuto() { stopAuto(); if (!isPhone()) return; autoTimer = setInterval(next, 4000); }
        function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

        scroll.addEventListener('touchstart', stopAuto, { passive: true });
        scroll.addEventListener('mousedown', stopAuto);
        scroll.addEventListener('touchend', function () { setTimeout(startAuto, 4500); }, { passive: true });
        scroll.addEventListener('mouseup', function () { setTimeout(startAuto, 4500); });
        scroll.addEventListener('scrollend', function () {
            if (!isPhone()) return;
            const center = scroll.scrollLeft + scroll.clientWidth / 2;
            let closest = 0, minDist = Infinity;
            cards.forEach(function (c, i) {
                const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
                if (dist < minDist) { minDist = dist; closest = i; }
            });
            current = closest;
            updateDots();
        });
        window.addEventListener('resize', function () { buildDots(); if (isPhone()) startAuto(); else stopAuto(); });

        buildDots();
        startAuto();
    }

    /* One-time hint flip — triggered by loader.js AFTER the splash hides
       (see playPromoFlipHint), not on a fixed timer from here, since the
       splash covers the page for 2-2.8s and a timer here would finish
       completely out of sight behind it. */
    window._promoFlipCards = cards;
}

function playPromoFlipHint() {
    const cards = window._promoFlipCards;
    if (!cards || !cards.length) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const card = cards[0];
    card.classList.add('is-flipped');
    card.setAttribute('aria-pressed', 'true');
    setTimeout(function () {
        card.classList.remove('is-flipped');
        card.setAttribute('aria-pressed', 'false');
    }, 1100);
}