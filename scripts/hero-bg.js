/* ============================================================
   scripts/hero-bg.js
   Dynamic hero background rotation — configured from
   لوحة الإدارة → خلفيات الواجهة (settings/heroBackgrounds/*).

   Zero-config safe: if nothing's configured, the single static
   <img class="hero__bg-layer active"> already in the markup just
   stays put and nothing here does anything.
   ============================================================ */

const RTDB_HEROBG_URL = 'https://deliveryonline-300f7-default-rtdb.firebaseio.com';

function _heroEscapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
}

async function initHeroBg() {
    const stack    = document.getElementById('hero-bg-stack');
    const progress = document.getElementById('hero-bg-progress');
    const captionEl = document.getElementById('hero-bg-caption');
    if (!stack || !progress) return;

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

    // Nothing configured — leave the single static background exactly as it
    // already is in the markup and do nothing further.
    if (!list.length) return;

    // Build one <img> layer per background (first one active immediately)
    stack.innerHTML = list.map(function (bg, i) {
        return '<img class="hero__bg-layer' + (i === 0 ? ' active' : '') + '" ' +
               'src="' + _heroEscapeHtml(bg.image) + '" alt="" ' + (i === 0 ? '' : 'loading="lazy"') + '>';
    }).join('');
    const layers = stack.querySelectorAll('.hero__bg-layer');

    // Build one progress segment per background (hidden entirely if only 1)
    progress.innerHTML = list.length > 1 ? list.map(function (_, i) {
        return '<div class="hero__bg-progress__seg" data-idx="' + i + '"><i></i></div>';
    }).join('') : '';
    const segs = progress.querySelectorAll('.hero__bg-progress__seg');

    let current = -1;
    let timer = null;
    let paused = false;

    function showCaption(bg) {
        if (!captionEl) return;
        const tagEl   = document.getElementById('hero-bg-caption-tag');
        const titleEl = document.getElementById('hero-bg-caption-title');
        if (!bg.tag && !bg.title) { captionEl.classList.remove('show'); return; }
        if (tagEl)   tagEl.textContent   = bg.tag   || '';
        if (tagEl)   tagEl.style.display = bg.tag   ? '' : 'none';
        if (titleEl) titleEl.textContent = bg.title || '';

        // Click-through target
        if (bg.linkType === 'stores') {
            captionEl.href = '#stores-section';
        } else if (bg.linkType === 'custom' && bg.linkValue) {
            captionEl.href = bg.linkValue;
            captionEl.target = '_blank';
            captionEl.rel = 'noopener';
        } else {
            captionEl.removeAttribute('href');
            captionEl.href = '#';
        }
        captionEl.classList.remove('show');
        // Restart the slide-in animation on every switch
        void captionEl.offsetWidth;
        setTimeout(function () { captionEl.classList.add('show'); }, 260);
    }

    function goTo(index) {
        if (timer) clearTimeout(timer);
        current = (index + list.length) % list.length;
        const bg = list[current];
        const durMs = Math.max(2, parseFloat(bg.durationSec) || 5) * 1000;

        layers.forEach(function (l, i) { l.classList.toggle('active', i === current); });

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

        showCaption(bg);

        // Preload the next image so its crossfade-in doesn't pop/flash
        const nextIdx = (current + 1) % list.length;
        if (layers[nextIdx] && layers[nextIdx].loading === 'lazy') layers[nextIdx].removeAttribute('loading');

        if (!paused) timer = setTimeout(function () { goTo(current + 1); }, durMs);
    }

    segs.forEach(function (s) {
        s.addEventListener('click', function () { goTo(parseInt(s.dataset.idx, 10)); });
    });

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