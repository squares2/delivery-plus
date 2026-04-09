const whatsbutton=document.getElementById('whatsapp-btn');

if(whatsbutton)whatsbutton.addEventListener('click', function() 
{
	
	// Use international format without '+' or spaces
	const phoneNumber = "00961884643"; 
	const message = "Hello! I'm reaching out from your website.";
	event.preventDefault();

	// Standard API link for mobile and web
	const url = "https://wa.me/"+phoneNumber+"?text="+message;

	window.open(url, '_blank');
});