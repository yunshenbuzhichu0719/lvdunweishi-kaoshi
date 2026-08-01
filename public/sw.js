/* 绿盾卫士云版 Service Worker —— 基础离线缓存，使 PWA 可“添加到主屏幕” */
const CACHE = 'lvdun-cloud-v1';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './assets/app.css', './assets/engine.js', './assets/store.js',
  './assets/cloud.js', './assets/main.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
