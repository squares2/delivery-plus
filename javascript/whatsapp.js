// Add this to your main page script (e.g., startup.js or a script tag in index.html)
document.addEventListener('click', function(event) {
    // Check if the clicked element (or its parent) is the WhatsApp button
    const whatsbutton = event.target.closest('#whatsapp-btn');
    
    if (whatsbutton) {
        event.preventDefault(); // Stop the default # link behavior

        // Use international format without '+' or spaces
        const phoneNumber = "96176884643"; 
        const message = encodeURIComponent("Hello Delivo!"); 

        // Standard API link for mobile and web
		const url = "https://wa.me/"+phoneNumber+"?text="+message;

        window.open(url, '_blank');
    }
});