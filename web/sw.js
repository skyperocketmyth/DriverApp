// RSA Admin — Service Worker
// Caches the app shell so it loads offline; never caches GAS API calls.
const CACHE_NAME = 'rsa-admin-v1';
const SHELL = ['./'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Never intercept GAS API calls — they must always go to the network
  if (e.request.url.includes('script.google.com') || e.request.url.includes('maps.googleapis.com')) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
