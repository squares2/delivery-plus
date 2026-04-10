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

async function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 1. Show instant local preview
  const reader = new FileReader();
  reader.onload = (e) => document.getElementById('sidebar-pfp').src = e.target.result;
  reader.readAsDataURL(file);

  // 2. Prepare data for our backend
  const readerBase64 = new FileReader();
  readerBase64.readAsDataURL(file);
  readerBase64.onload = async () => {
    const base64Content = readerBase64.result.split(',')[1];
    const username = JSON.parse(localStorage.getItem('delivoUser')).username;

    // Call your new secure API link
    const response = await fetch('/api/upload', {
      method: "POST",
      body: JSON.stringify({
        fileName: `users/${username}.png`,
        content: base64Content
      })
    });

    if (response.ok) {
      console.log("Uploaded safely via backend!");
    }
  };
}