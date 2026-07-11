/* ============================================================
   scripts/promo-flip.js
   Powers the "عروض ما بتتفوّت" flip-card promo section.
   - Click/tap a card → flips it (front image ↔ back details)
   - Works with keyboard (Enter/Space) since cards are tabbable
   - CTA buttons on the back open WhatsApp to settings/adminPhone
     with a pre-filled message about that specific offer
   - Plays a one-time "hint" flip shortly after load so people
     realize the cards are interactive, then settles down
   ============================================================ */

const RTDB_PROMO_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

function initPromoFlip() {
    const section = document.getElementById('promo-flip-section');
    if (!section) return;

    const cards = section.querySelectorAll('[data-promo-card]');
    if (!cards.length) return;

    /* ── Wire the WhatsApp CTA on every card's back face ──── */
    fetch(`${RTDB_PROMO_URL}/settings/adminPhone.json`)
        .then(r => r.ok ? r.json() : null)
        .then(raw => {
            const digits = raw ? String(raw).replace(/\D/g, '') : '';
            if (!digits) return; // keep the plain "#" href fallback already in the markup
            section.querySelectorAll('[data-promo-cta]').forEach(cta => {
                const text = cta.dataset.orderText || '';
                cta.href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
                cta.target = '_blank';
                cta.rel = 'noopener';
            });
        })
        .catch(() => { /* CTAs just stay inert "#" links — no crash either way */ });

    /* ── Flip toggle ────────────────────────────────────────
       A click anywhere on the card flips it, EXCEPT the CTA
       link itself — that one should just navigate normally. */
    function toggleFlip(card) {
        const flipped = card.classList.toggle('is-flipped');
        card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    }

    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-promo-cta]')) return; // let the CTA navigate
            toggleFlip(card);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.closest('[data-promo-cta]')) return;
                e.preventDefault();
                toggleFlip(card);
            }
        });
    });

    /* ── Auto-advancing carousel (mobile only) ───────────────
       Same pattern as the offers-carousel in stores.js: cycles
       through the cards on a timer, shows dots, pauses while
       the person is touching/dragging, resumes shortly after.
       This is what actually moves the strip from card 1 → 2 → 3
       on its own — the flip above is a separate, per-card thing. */
    const scroll = document.getElementById('promo-flip-scroll');
    const dotsEl = document.getElementById('promo-flip-dots');
    if (scroll && dotsEl) {
        const total = cards.length;
        let current = 0, autoTimer = null;
        const isPhone = () => window.innerWidth < 540;

        function buildDots() {
            dotsEl.innerHTML = '';
            if (!isPhone()) return;
            cards.forEach((_, i) => {
                const dot = document.createElement('span');
                dot.className = 'promo-flip__dot' + (i === current ? ' active' : '');
                dot.addEventListener('click', () => goTo(i));
                dotsEl.appendChild(dot);
            });
        }
        function updateDots() {
            dotsEl.querySelectorAll('.promo-flip__dot').forEach((d, i) => d.classList.toggle('active', i === current));
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
        scroll.addEventListener('touchend', () => setTimeout(startAuto, 4500), { passive: true });
        scroll.addEventListener('mouseup', () => setTimeout(startAuto, 4500));
        scroll.addEventListener('scrollend', () => {
            if (!isPhone()) return;
            const center = scroll.scrollLeft + scroll.clientWidth / 2;
            let closest = 0, minDist = Infinity;
            cards.forEach((c, i) => {
                const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
                if (dist < minDist) { minDist = dist; closest = i; }
            });
            current = closest;
            updateDots();
        });
        window.addEventListener('resize', () => { buildDots(); if (isPhone()) startAuto(); else stopAuto(); });

        buildDots();
        startAuto();
    }

    /* ── One-time hint: nudge the first card open briefly so
       first-time visitors realize these flip, then close it.
       IMPORTANT: this must be triggered by loader.js AFTER the
       splash screen actually hides — not on a fixed timer from
       here, since the splash holds the page covered for 2-2.8s
       and a fixed timer here would play (and finish) the whole
       hint completely out of sight behind it. See playPromoFlipHint(). */
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
    setTimeout(() => {
        card.classList.remove('is-flipped');
        card.setAttribute('aria-pressed', 'false');
    }, 1100);
}