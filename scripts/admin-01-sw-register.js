// admin.html previously never registered a service worker, so push
// notifications (and any offline support) had nothing to attach to.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(reg => reg.update().catch(() => {}))
        .catch(err => console.warn('[Admin] SW registration failed:', err));

    // Same reasoning as driver.html: an admin tab left open indefinitely
    // was stuck on whatever JS loaded at session start. 'controllerchange'
    // is the ONE actual reload trigger — it fires exactly once when
    // clients.claim() in sw.js's activate handler hands control to the new
    // worker. The SW also separately posts an SW_UPDATED message around the
    // same moment; that used to ALSO reload, which raced with this one and
    // caused the panel to visibly reload twice on every deploy. Now the
    // message just shows the toast — reload is handled below, once.
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SW_UPDATED') {
            if (typeof toast === 'function') toast('🔄 تحديث جديد — جاري إعادة تحميل اللوحة');
        }
    });

    let _admRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_admRefreshing) return;
        _admRefreshing = true;
        console.log('[Admin] New version detected — reloading for fresh files');
        setTimeout(() => window.location.reload(), 800);
    });
}
