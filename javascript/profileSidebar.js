  // Open and Close Sidebar
function openUserSidebar() 
{
	document.getElementById("userSidebar").classList.add("open");
	document.getElementById("sidebarOverlay").classList.add("show");
	document.body.style.overflow = "hidden"; // Locks background scroll
}
  
function closeUserSidebar() 
{
	document.getElementById("userSidebar").classList.remove("open");
	document.getElementById("sidebarOverlay").classList.remove("show");
	document.body.style.overflow = "auto"; // Unlocks scroll
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