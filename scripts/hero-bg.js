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

        const isLink = bg.linkType === 'stores' || ((bg.linkType === 'custom' || bg.linkType === 'whatsapp') && bg.linkValue);
        const cardTag = isLink ? 'a' : 'div';
        let hrefAttrs = '';
        if (bg.linkType === 'stores') {
            hrefAttrs = ' href="#stores-section"';
        } else if ((bg.linkType === 'custom' || bg.linkType === 'whatsapp') && bg.linkValue) {
            hrefAttrs = ' href="' + _heroEscapeHtml(bg.linkValue) + '" target="_blank" rel="noopener"';
        }

        const captionHtml = (bg.tag || bg.title)
            ? '<div class="hero__bg-card-caption">' +
                  (bg.tag ? '<span class="hero__bg-card-caption__tag">' + _heroEscapeHtml(bg.tag) + '</span>' : '') +
                  (bg.title ? '<span class="hero__bg-card-caption__title">' + _heroEscapeHtml(bg.title) + '</span>' : '') +
              '</div>'
            : '';

        return '<div class="hero__bg-layer' + (i === list.length - 1 ? ' active' : '') + '">' +
               '<img class="hero__bg-backdrop" src="' + src + '" alt="" aria-hidden="true" ' + lazy + '>' +
               '<' + cardTag + ' class="hero__bg-card' + (isLink ? ' hero__bg-card--link' : '') + '"' + hrefAttrs + '>' +
                   '<img class="hero__bg" src="' + src + '" alt="" ' + lazy + '>' +
                   captionHtml +
               '</' + cardTag + '>' +
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