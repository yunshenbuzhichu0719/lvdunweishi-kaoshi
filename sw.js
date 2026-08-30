/* 绿盾卫士培训考核系统 Service Worker —— 网络优先 + 离线回退，保证内容更新及时生效 */
const CACHE = 'lvdun-pwa-v1';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './assets/app.css', './assets/store.js', './assets/auth.js', './assets/engine.js',
  './assets/ui.js', './assets/admin.js', './assets/main.js',
  './assets/xlsx.full.min.js', './assets/html2canvas.min.js', './assets/jspdf.umd.min.js',
  './data/bank-keypost.js', './data/bank-daily.js', './data/docs-training.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(function () {
    return self.clients.matchAll().then(function (cls) {
      cls.forEach(function (c) { c.postMessage({ type: 'SW_UPDATED' }); });
    });
  }));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var cp = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, cp); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (h) { return h || fetch(req); });
    })
  );
});
