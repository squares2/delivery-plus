self.addEventListener('fetch', (event) => {
  // Add this line to ignore Netlify functions
  if (event.request.url.includes('/.netlify/functions/')) {
    return; // Let the browser handle the request normally
  }
  
  // ... rest of your service worker code
});
