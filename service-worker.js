const CACHE_NAME = 'ck-family-songs-v7-3-5-live-nearest-scroll';
const APP_FILES = [
  './',
  './index.html',
  './news.json',
  './style.css',
  './app.js',
  './song-seed.js',
  './song-cleanup.js',
  './live-seed.js',
  './firebase-config.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // HTMLナビゲーションだけindex.htmlへ戻す。
        // CSS/JS/JSONにindex.htmlを返すとレイアウトが壊れるため返さない。
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        return Response.error();
      })
  );
});
