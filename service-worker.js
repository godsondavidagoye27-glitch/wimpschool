const CACHE_NAME = 'wimpschool-cache-v1';
const OFFLINE_URL = './offline.html';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './admin.html',
  './forgot-password.html',
  './invite.html',
  './school-admin-dashboard.html',
  './teacher-dashboard.html',
  './parent-portal.html',
  './student-management.html',
  './teacher-management.html',
  './announcements.html',
  './super-admin-panel.html',
  './timetable.html',
  './fee-management.html',
  './admin-settings.html',
  './results.html',
  './offline.html',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/auth.js',
  './js/backend.js',
  './js/invite.js',
  './js/payments.js',
  './js/dashboard.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  // Only cache http/https schemes
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isAssetRequest = /\.(js|css|html|json|png|jpg|jpeg|svg|webmanifest)$/i.test(requestUrl.pathname);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (isSameOrigin && isAssetRequest) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cachedResponse => cachedResponse || caches.match(OFFLINE_URL)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});
