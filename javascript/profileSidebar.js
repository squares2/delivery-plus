  // Open and Close Sidebar
function openUserSidebar() {
    const sidebar = document.getElementById('userSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar && overlay) {
        sidebar.style.left = '0'; // Slides the sidebar in
        overlay.style.display = 'block'; // Shows the dark background
        overlay.style.opacity = '1'; // Ensures it's visible
    }
}

function closeUserSidebar() {
    const sidebar = document.getElementById('userSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar && overlay) {
        sidebar.style.left = '-300px'; // Slides the sidebar out (adjust to your CSS width)
        overlay.style.display = 'none'; // Hides the background
        overlay.style.opacity = '0';
    }
}

function triggerFileInput() 
{
	document.getElementById('profileInput').click();
}
function previewImage(event) 
{
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = function(e) 
  {
    const base64Image = e.target.result;
    document.getElementById('sidebar-pfp').src = base64Image;
    localStorage.setItem('userProfileImage', base64Image);
    console.log("Profile image saved locally to your browser!");
  };
  reader.readAsDataURL(file);
}
// Close Change Password Modal when clicking outside the content box
window.addEventListener('click', function(event) {
    const wrapper = document.getElementById("CP-Modal-Wrapper");
    
    // Check if the click was exactly on the dark wrapper (the background)
    // and not on the modal content itself
    if (event.target === wrapper) {
        hidePassModal();
    }
});