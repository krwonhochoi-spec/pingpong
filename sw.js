/* 암사동 탁구사랑 클럽 — 서비스 워커 (오프라인 실행 / 홈 화면 앱) */
const CACHE = 'pp-cache-v4';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CDN = /(^|\.)cdn\.tailwindcss\.com$|(^|\.)cdn\.jsdelivr\.net$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/google\.com$|googleusercontent\.com$/.test(url.hostname)) return;      // 시트 API는 항상 네트워크
  if (url.origin === self.location.origin) {                                   // 앱 파일: 네트워크 우선 → 실패 시 캐시
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (CDN.test(url.hostname)) {                                                // CDN: 캐시 우선
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })));
  }
});
