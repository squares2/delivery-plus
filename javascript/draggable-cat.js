/**
 * Draggable Category Slider - FINAL VERSION WITH CLICK PREVENTION
 */

const initDraggableCategory = () => {
    const slider = document.getElementById('subCategoryRow');
    
    if (!slider) return;

    let isDown = false;
    let startX;
    let scrollLeft;
    let dragThreshold = 5; // Pixels moved before we consider it a "drag" and block clicks
    let isDragging = false;

    // --- Dynamic Topbar Height Logic ---
    const updateTopbarHeight = () => {
        const topbar = document.querySelector('.navbar') || 
                       document.querySelector('.dynamic-nav') || 
                       document.querySelector('#topcompany2');

        if (topbar) {
            document.documentElement.style.setProperty('--topbar-height', topbar.offsetHeight + 'px');
        } else {
            document.documentElement.style.setProperty('--topbar-height', '0px');
        }
    };

    window.addEventListener('resize', updateTopbarHeight);
    updateTopbarHeight();

    // --- Drag Logic ---
    const startDragging = (e) => {
        isDown = true;
        isDragging = false; // Reset dragging state on new click
        slider.style.scrollBehavior = 'auto'; 
        
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        startX = pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        slider.style.cursor = 'grabbing';
    };

    const stopDragging = () => {
        isDown = false;
        slider.style.cursor = 'grab';
        // Delay restoring smooth scroll slightly to let the 'click' event pass
        setTimeout(() => {
            slider.style.scrollBehavior = 'smooth';
        }, 50);
    };

    const move = (e) => {
        if (!isDown) return;
        
        const pageX = e.pageX || (e.touches && e.touches[0].pageX);
        const x = pageX - slider.offsetLeft;
        const walk = (x - startX) * 2; 

        // If we move more than the threshold, mark as dragging
        if (Math.abs(x - (startX + slider.offsetLeft)) > dragThreshold) {
            isDragging = true;
        }

        if (isDragging) {
            if (e.cancelable) e.preventDefault(); 
            slider.scrollLeft = scrollLeft - walk;
        }
    };

    // --- CLICK PREVENTION LOGIC ---
    // This intercepts any click events on the chips
    const preventClickOnDrag = (e) => {
        if (isDragging) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
        isDragging = false; // Reset for next interaction
    };

    // Mouse Events
    slider.addEventListener('mousedown', startDragging);
    slider.addEventListener('mousemove', move);
    slider.addEventListener('mouseup', stopDragging);
    slider.addEventListener('mouseleave', stopDragging);
    
    // The "capture" phase (true) is critical to stop the chip's internal click
    slider.addEventListener('click', preventClickOnDrag, true);

    // Touch Events
    slider.addEventListener('touchstart', startDragging, { passive: true });
    slider.addEventListener('touchmove', move, { passive: false });
    slider.addEventListener('touchend', stopDragging);

    // --- Global Arrow Navigation ---
    window.scrollSub = function(distance) {
        slider.style.scrollBehavior = 'smooth';
        slider.scrollBy({ left: distance, behavior: 'smooth' });
    };
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDraggableCategory);
} else {
    initDraggableCategory();
}
