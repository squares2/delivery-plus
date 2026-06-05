/* ============================================================
   scripts/modals.js
   Handles: open/close for login modal and subscribe modal.
   Called by loader.js after modals are injected.
   ============================================================ */

function initModals() {
    // Generic open/close wiring for any modal
    // Buttons with data-modal="modal-id" open that modal
    // Buttons with data-close inside a modal close it
    // Clicking the backdrop also closes

    document.addEventListener('click', (e) => {

        // Open trigger
        const openBtn = e.target.closest('[data-modal]');
        if (openBtn) {
            const targetId = openBtn.getAttribute('data-modal');
            openModal(targetId);
            return;
        }

        // Close button inside modal
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            const modal = closeBtn.closest('.modal-overlay');
            if (modal) closeModal(modal.id);
            return;
        }

        // Click on backdrop (the overlay itself, not the modal box)
        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target.id);
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active')
                .forEach(m => closeModal(m.id));
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('modal-open'); // prevents bg scroll
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
}
