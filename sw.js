const CACHE_NAME = 'mazza-food-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css?v=11',
  '/js/app.js?v=11',
  '/css/social.css',
  '/manifest.json',
  'https://cdn-icons-png.flaticon.com/512/3075/3075929.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.error('SW cache addAll failed:', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== location.origin && !url.hostname.includes('flaticon') && !url.hostname.includes('gstatic')) {
    return;
  }

  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return networkRes;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        }).catch(() => cached);
        return cached || fetchPromise;
      });
    })
  );
});
