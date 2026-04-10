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

async function previewImage(event) 
{
    const file = event.target.files[0];
    if (!file) return;

    // 2. Prepare for GitHub Upload
    const GITHUB_TOKEN = "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";
    const REPO_OWNER = "squares2";
    const REPO_NAME = "delivery-plus";
	
	const storedData = localStorage.getItem('delivoUser');
    const username = storedData ? JSON.parse(storedData).username : "unknown";

    const filePath = `users/${username}.png`;
    
    // 1. MUST use api.github.com
	const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        // Remove the data URI header (e.g., "data:image/png;base64,")
        const base64Content = reader.result.split(',')[1];

        try {
            // A. Check if the file exists to get the current 'sha' (required for updates)
            const checkFile = await fetch(apiUrl, {
                headers: { "Authorization": `token ${GITHUB_TOKEN}` }
            });
            let sha = null;
            if (checkFile.ok) {
                const existingFile = await checkFile.json();
                sha = existingFile.sha;
            }

            // B. Perform the upload/update
            const response = await fetch(apiUrl, {
                method: "PUT",
                headers: {
                    "Authorization": `token ${GITHUB_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `Updating profile picture: ${filePath}`,
                    content: base64Content,
                    sha: sha // include if the file already exists
                })
            });

            if (response.ok) {
                console.log("Success! Image saved to GitHub.");
            } else {
                const error = await response.json();
                console.error("GitHub API Error:", error.message);
            }
        } catch (err) {
            console.error("CORS or Network Error:", err);
        }
    };
}