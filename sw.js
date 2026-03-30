self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // This allows the app to load the pages from the network 
    // even if it's running in standalone mode.
    event.respondWith(fetch(event.request));
});
