// RSA Admin — Service Worker
// Network-first: always fetch fresh content, fall back to cache when offline.
const CACHE_NAME = 'rsa-admin-v3';

self.addEventListener('install', function(e) {
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
  // Never intercept API calls
  if (e.request.url.includes('script.google.com') || e.request.url.includes('maps.googleapis.com')) return;

  // Network-first: try network, cache the response, fall back to cache
  e.respondWith(
    fetch(e.request).then(function(resp) {
      var clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      return resp;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
