function toggleCard(row) {
  // Only toggle if we are in mobile view (screen width < 850px)
  if (window.innerWidth <= 850) {
    row.classList.toggle('expanded');
    
    // Change the + to - sign
    const icon = row.querySelector('.toggle-icon');
    if (row.classList.contains('expanded')) {
      icon.textContent = '−';
    } else {
      icon.textContent = '+';
    }
  }
}