/* ============================================================
   scripts/hero-bg.js
   Dynamic hero background rotation — configured from
   لوحة الإدارة → خلفيات الواجهة (settings/heroBackgrounds/*).

   Layers sit in a horizontal track (#hero-bg-stack) that SLIDES via
   translateX — same mechanic as the mobile "4-step" phone carousel —
   with a segmented story-style progress bar and swipe support.

   Zero-config safe: if nothing's configured, the single static
   <div class="hero__bg-layer active"><img class="hero__bg">...</div>
   already in the markup just stays put (translateX(0)) and nothing
   here does anything.
   ============================================================ */

const RTDB_HEROBG_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

// Same settings/adminPhone value cart.js / navbar.js already read — fetched
// once here so the WhatsApp CTA works out of the box on every promo slide,
// instead of depending on each slide's admin-configured linkType/linkValue
// (which requires extra setup steps and is easy to leave unconfigured).
const _HEROBG_FALLBACK_PHONE = '96170714152';
let _heroBgAdminPhoneDigits = null;
async function _heroBgLoadAdminPhone() {
    try {
        const cached = localStorage.getItem('delivo_admin_phone');
        if (cached) _heroBgAdminPhoneDigits = String(cached).replace(/[^0-9]/g, '');
    } catch (_) {}
    try {
        const res = await fetch(RTDB_HEROBG_URL + '/settings/adminPhone.json');
        if (res.ok) {
            const fresh = await res.json();
            if (fresh) {
                _heroBgAdminPhoneDigits = String(fresh).replace(/[^0-9]/g, '');
                try { localStorage.setItem('delivo_admin_phone', String(fresh)); } catch (_) {}
            }
        }
    } catch (_) { /* keep whatever we already had (cache or fallback) */ }
    if (!_heroBgAdminPhoneDigits) _heroBgAdminPhoneDigits = _HEROBG_FALLBACK_PHONE;
}

function _heroEscapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
}

/* ── Mobile letterbox color, matched to whichever photo is showing ──
   Kept for any spot where --hero-mobile-bg is still referenced (e.g.
   custom overrides); samples a tiny (24×24) downscaled draw of the
   image and averages its pixels — cheap, and plenty for a matching tone. */
function _heroSampleColor(imgEl) {
    return new Promise(function (resolve) {
        try {
            const SZ = 24;
            const c = document.createElement('canvas');
            c.width = SZ; c.height = SZ;
            const ctx = c.getContext('2d');
            ctx.drawImage(imgEl, 0, 0, SZ, SZ);
            const data = ctx.getImageData(0, 0, SZ, SZ).data;
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; n++; }
            resolve(n ? 'rgb(' + Math.round(r/n) + ',' + Math.round(g/n) + ',' + Math.round(b/n) + ')' : null);
        } catch (e) {
            resolve(null); // cross-origin/tainted canvas — CSS just keeps its fallback color
        }
    });
}

function _heroApplyBgColor(imgEl) {
    if (!imgEl) return;
    const heroEl = imgEl.closest('.hero') || document.querySelector('.hero');
    if (!heroEl) return;
    const run = function () {
        _heroSampleColor(imgEl).then(function (color) {
            if (color) heroEl.style.setProperty('--hero-mobile-bg', color);
        });
    };
    if (imgEl.complete && imgEl.naturalWidth) run();
    else imgEl.addEventListener('load', run, { once: true });
}

async function initHeroBg() {
    const viewport  = document.getElementById('hero-bg-viewport');
    const stack     = document.getElementById('hero-bg-stack');
    const progress  = document.getElementById('hero-bg-progress');
    const carousel  = document.getElementById('hero-carousel');
    if (!viewport || !stack || !progress) return;

    // Color the letterbox var for whatever's already on screen (the static
    // markup image) right away — don't wait on the fetch below, which
    // may find nothing configured and never touch the DOM at all.
    _heroApplyBgColor(stack.querySelector('.hero__bg-layer.active .hero__bg'));

    // Kick off in parallel — the WhatsApp CTA needs this, but there's no
    // reason to make the backgrounds list wait on it (or vice versa).
    const adminPhonePromise = _heroBgLoadAdminPhone();

    let list;
    try {
        const res = await fetch(RTDB_HEROBG_URL + '/settings/heroBackgrounds.json');
        const data = res.ok ? await res.json() : null;
        list = data && typeof data === 'object'
            ? Object.values(data).filter(function (b) { return b && b.active !== false && b.image; })
            : [];
        list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    } catch (_) {
        list = [];
    }

    // Nothing configured — leave the single static background AND the
    // "how it works" phone carousel exactly as they already are, untouched.
    if (!list.length) return;

    // Needed below for the default WhatsApp CTA — resolves instantly if
    // the cached phone number was already found in localStorage.
    await adminPhonePromise;

    // Custom backgrounds are active — the rotating backgrounds are the show
    // now, so the step-by-step phone carousel would just compete with them.
    if (carousel) carousel.style.display = 'none';

    // Build one backdrop+card slide per background — but in REVERSE physical
    // order. The track always moves by translateX(-pos * 100%), and a flex
    // row lays child N further to the right as pos increases; put logical
    // slide 0 last in the DOM (rightmost) and the last logical slide first
    // (leftmost) so that advancing logical order (0→1→2…) moves the track
    // from a *smaller* pos to a *larger* one in the other direction —
    // net effect: new content slides in from the left, old content exits
    // to the right (previously it was the reverse). Admin's order field,
    // the progress segments, and everything else all still map by LOGICAL
    // index (`current`) — only the physical DOM position differs, via
    // _physPos() below.
    stack.innerHTML = list.slice().reverse().map(function (bg, i) {
        const src  = _heroEscapeHtml(bg.image);
        const lazy = i === list.length - 1 ? '' : 'loading="lazy"'; // logical slide 0 is last in this reversed array

        // Any slide without ANY linkType saved at all (legacy data, from
        // before the "no link" option existed) defaults to a WhatsApp
        // order button — guaranteed to work with zero admin setup.
        // But once a slide has an explicit linkType — including 'none'
        // ("بدون رابط / زخرفة فقط") — that choice is respected as-is and
        // never falls back to the WhatsApp button.
        const isConfigured = !!bg.linkType;
        const hasExplicitLink = bg.linkType === 'stores' || (bg.linkType === 'custom' && bg.linkValue);
        const isWhatsApp = bg.linkType === 'whatsapp' ? true : (!isConfigured && !hasExplicitLink);
        const isLink = hasExplicitLink || isWhatsApp;

        let hrefAttrs = '';
        if (bg.linkType === 'stores') {
            hrefAttrs = ' href="#stores-section"';
        } else if (bg.linkType === 'custom' && bg.linkValue) {
            hrefAttrs = ' href="' + _heroEscapeHtml(bg.linkValue) + '" target="_blank" rel="noopener"';
        } else if (isWhatsApp) {
            // Always rebuilt from the LIVE settings/adminPhone value (never
            // from a previously-saved bg.linkValue) so that if the admin
            // number is changed later in ⚙️ الإعدادات, every slide's "اطلب"
            // button — old or new — picks it up automatically instead of
            // staying frozen on whatever number was current when the slide
            // was saved. The admin-authored message (bg.whatsappMsg) is
            // still respected when present.
            const waMsg = (bg.linkType === 'whatsapp' && bg.whatsappMsg)
                ? bg.whatsappMsg
                : (bg.title
                    ? 'مرحباً 👋، حابب اطلب "' + bg.title + '"'
                    : 'مرحباً 👋، بدي اطلب من هالعرض');
            const waHref = 'https://wa.me/' + _heroBgAdminPhoneDigits + '?text=' + encodeURIComponent(waMsg);
            hrefAttrs = ' href="' + _heroEscapeHtml(waHref) + '" target="_blank" rel="noopener"';
        }

        const captionHtml = (bg.tag || bg.title)
            ? '<div class="hero__bg-card-caption">' +
                  (bg.tag ? '<span class="hero__bg-card-caption__tag">' + _heroEscapeHtml(bg.tag) + '</span>' : '') +
                  (bg.title ? '<span class="hero__bg-card-caption__title">' + _heroEscapeHtml(bg.title) + '</span>' : '') +
              '</div>'
            : '';

        // Explicit CTA button — the actual click target when this card
        // links somewhere, instead of the whole photo being tappable (a
        // real button reads as an intentional action, not an accident).
        // WhatsApp CTAs (whether explicitly configured or the default
        // fallback above) get their own branded treatment (green,
        // WhatsApp glyph, subtle pulse ring) instead of the generic arrow,
        // since that's a distinct action people recognize at a glance.
        const ctaIcon = isWhatsApp
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.48-.15-.68.15-.2.3-.78.97-.96 1.17-.18.2-.35.22-.65.07-.3-.15-1.28-.47-2.43-1.5-.9-.8-1.5-1.79-1.68-2.09-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.24-.24-.58-.49-.5-.68-.51-.18-.01-.38-.01-.58-.01-.2 0-.53.07-.8.38-.28.3-1.05 1.02-1.05 2.49s1.08 2.88 1.23 3.08c.15.2 2.13 3.25 5.16 4.56.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.13-.27-.2-.57-.35z"/><path d="M12.02 2C6.5 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.08-1.33A9.96 9.96 0 0 0 12.02 22C17.53 22 22 17.52 22 12S17.53 2 12.02 2zm0 18.06c-1.7 0-3.28-.5-4.6-1.36l-.33-.2-3.02.79.8-2.94-.21-.3A8.06 8.06 0 0 1 3.96 12c0-4.44 3.62-8.06 8.06-8.06 4.44 0 8.06 3.62 8.06 8.06 0 4.44-3.62 8.06-8.06 8.06z"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
        const ctaHtml = isLink
            ? '<a class="hero__bg-card-cta' + (isWhatsApp ? ' hero__bg-card-cta--whatsapp' : '') + '"' + hrefAttrs + '>' +
                  (isWhatsApp ? '<span class="hero__bg-card-cta__pulse"></span>' : '') +
                  '<span>اطلب</span>' +
                  ctaIcon +
              '</a>'
            : '';

        return '<div class="hero__bg-layer' + (i === list.length - 1 ? ' active' : '') + '">' +
               '<img class="hero__bg-backdrop" src="' + src + '" alt="" aria-hidden="true" ' + lazy + '>' +
               '<div class="hero__bg-card">' +
                   '<img class="hero__bg" src="' + src + '" alt="" ' + lazy + '>' +
                   captionHtml +
                   ctaHtml +
               '</div>' +
               '</div>';
    }).join('');
    const layers = stack.querySelectorAll('.hero__bg-layer');

    // Logical index (matches list[], admin order, progress segments) →
    // physical DOM position (matches layers[], the reversed build above).
    function _physPos(logicalIdx) { return list.length - 1 - logicalIdx; }

    // Build one progress segment per background (hidden entirely if only 1)
    progress.innerHTML = list.length > 1 ? list.map(function (_, i) {
        return '<div class="hero__bg-progress__seg" data-idx="' + i + '"><i></i></div>';
    }).join('') : '';
    const segs = progress.querySelectorAll('.hero__bg-progress__seg');

    let current = -1;
    let timer = null;
    let paused = false;

    function goTo(index) {
        if (timer) clearTimeout(timer);
        current = (index + list.length) % list.length;
        const bg = list[current];
        const durMs = Math.max(2, parseFloat(bg.durationSec) || 5) * 1000;
        const pos = _physPos(current);

        // Slide the track — same mechanic as the 4-step phone carousel
        // (LTR-forced track, translateX by whole viewport widths), just
        // walking physical position in the opposite direction of before.
        stack.style.transform = 'translateX(-' + (pos * 100) + '%)';

        layers.forEach(function (l, i) { l.classList.toggle('active', i === pos); });
        _heroApplyBgColor(layers[pos].querySelector('.hero__bg'));

        if (segs.length) {
            segs.forEach(function (s, i) {
                s.classList.remove('active');
                s.querySelector('i').style.transition = 'none';
                s.querySelector('i').style.width = i < current ? '100%' : '0%';
                s.classList.toggle('done', i < current);
            });
            const activeSeg = segs[current];
            activeSeg.classList.add('active');
            const bar = activeSeg.querySelector('i');
            void bar.offsetWidth; // force reflow so the transition actually plays
            bar.style.transition = `width ${durMs}ms linear`;
            bar.style.width = '100%';
        }

        // Preload the next slide's images so its slide-in doesn't pop/flash
        const nextIdx = (current + 1) % list.length;
        const nextLayer = layers[_physPos(nextIdx)];
        if (nextLayer) {
            nextLayer.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
                img.removeAttribute('loading');
            });
        }

        if (!paused) timer = setTimeout(function () { goTo(current + 1); }, durMs);
    }

    segs.forEach(function (s) {
        s.addEventListener('click', function () { goTo(parseInt(s.dataset.idx, 10)); });
    });

    // Swipe support — same threshold as the 4-step phone carousel, direction
    // flipped to match the new motion (content now follows a rightward
    // drag to advance, since "next" now enters from the left).
    if (list.length > 1) {
        let tx = 0;
        viewport.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
        viewport.addEventListener('touchend', function (e) {
            const d = tx - e.changedTouches[0].clientX;
            if (Math.abs(d) > 40) goTo(d > 0 ? current - 1 : current + 1);
        });
    }

    // Pause the cycle while the tab isn't visible (saves cycles, and avoids
    // several backgrounds silently flipping by while nobody's looking)
    document.addEventListener('visibilitychange', function () {
        paused = document.hidden;
        if (!paused && current !== -1) {
            // Resume from a fresh full duration on the current slide rather
            // than trying to reconstruct exactly where the bar left off.
            goTo(current);
        } else if (timer) {
            clearTimeout(timer);
        }
    });

    goTo(0);
}