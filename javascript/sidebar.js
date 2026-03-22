var deliveryMenu = [];
/*[
    {
        main: "Fruits",
        sectionId: "fruits-section",
        subs: ["Fresh Fruits", "Dried Fruits", "Vegetables", "Leafy Greens", "Organic", "Exotic", "Berries"]
    },
    {
        main: "Dairy & Bakery",
        sectionId: "dairy-section",
        subs: ["Milk", "Bread", "Cheese", "Labneh"]
    },
    {
        main: "Meat & Chicken",
        sectionId: "meat-section",
        subs: ["Meat", "Chicken"]
    }
];*/

let currentIndex = 0;

/**
 * Updates the UI elements based on the current main category index
 */
function updateCategoryUI() {
    const active = deliveryMenu[currentIndex];
    if (!active) return;
    
    // 1. Update Main Title
    document.getElementById('currentMainTitle').innerText = active.main;
    
    // 2. Update Sub-Category Chips (FIXED: Added # for same-page scrolling)
    const container = document.getElementById('subCategoryRow');
    container.innerHTML = active.subs.map(sub => 
        `<a href="#${encodeURIComponent(sub)}" class="sub-chip">${sub}</a>`
    ).join('');

    // 3. Reset scroll position to the start for new categories
    container.scrollLeft = 0;

    // 4. Smooth scroll to the corresponding py-5 section
    const targetSection = document.getElementById(active.sectionId);
    if(targetSection) {
        window.scrollTo({
            top: targetSection.offsetTop - 120,
            behavior: 'smooth'
        });
    }

    // 5. Update arrows after a tiny delay
    setTimeout(checkOverflow, 50);
}
/**
 * Flips to the next main category
 */
function nextCategory() {
    currentIndex = (currentIndex + 1) % deliveryMenu.length;
    updateCategoryUI();
}

/**
 * Flips to the previous main category
 */
function prevCategory() {
    currentIndex = (currentIndex - 1 + deliveryMenu.length) % deliveryMenu.length;
    updateCategoryUI();
}

/**
 * Handles horizontal scrolling for sub-category chips via arrows
 */
function scrollSub(amount) {
    const container = document.getElementById('subCategoryRow');
    container.scrollBy({ left: amount, behavior: 'smooth' });
}

/**
 * Detects if sub-categories are wider than the screen and toggles arrows
 */
function checkOverflow() {
    const container = document.getElementById('subCategoryRow');
    const leftBtn = document.querySelector('.nav-btn.left');
    const rightBtn = document.querySelector('.nav-btn.right');

    if (!container || !leftBtn || !rightBtn) return;

    // Show arrows ONLY if chips overflow the visible width
    if (container.scrollWidth > container.clientWidth) {
        leftBtn.classList.add('visible');
        rightBtn.classList.add('visible');
    } else {
        leftBtn.classList.remove('visible');
        rightBtn.classList.remove('visible');
    }
}

// LISTENERS
window.addEventListener('resize', checkOverflow);
//window.addEventListener('DOMContentLoaded', updateCategoryUI);
