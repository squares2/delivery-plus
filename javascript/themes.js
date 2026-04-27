themeList = [
  { name: 'light',    icon: 'fa-sun' },
  { name: 'dark',     icon: 'fa-moon' },
  { name: 'midnight', icon: 'fa-user-astronaut' },
  { name: 'forest',   icon: 'fa-tree' },
  { name: 'purple',   icon: 'fa-bolt' }
];

function cycleTheme() {
  const root = document.documentElement;
  const btn = document.getElementById('theme-toggle-btn');
  
  let currentName = root.getAttribute('data-theme') || 'light';
  let currentIndex = themeList.findIndex(t => t.name === currentName);
  let nextIndex = (currentIndex + 1) % themeList.length;
  let nextTheme = themeList[nextIndex];

  // Apply jump animation to the button container to avoid SVG issues
  btn.classList.add('icon-jump');

  setTimeout(() => {
    root.setAttribute('data-theme', nextTheme.name);
    localStorage.setItem('preferred-theme', nextTheme.name);
    
    // Replace the existing icon (i or svg) with a fresh <i> tag
    // FontAwesome will then see this <i> and convert it back to the correct SVG
    btn.innerHTML = `<i class="fa-solid ${nextTheme.icon}"></i>`;
    
    // CRITICAL: Tell FontAwesome to search the button for the new <i> tag
    if (window.FontAwesome) {
      window.FontAwesome.dom.i2svg({ node: btn });
    }
    
    btn.classList.remove('icon-jump');
  }, 250);
}
// Persist on refresh
(function() {
  const saved = localStorage.getItem('preferred-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle-btn');
    const icon = btn ? btn.querySelector('i, svg') : null;
    // themeList is now available here too
    const active = themeList.find(t => t.name === saved);
    if(icon && active) {
        icon.setAttribute('class', `fa-solid ${active.icon}`);
    }
  });
})();