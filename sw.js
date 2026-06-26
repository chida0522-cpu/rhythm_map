/* 리듬맵 서비스워커
   전략:
   - 앱 핵심 파일(HTML/매니페스트/아이콘): 설치 시 미리 캐시 → 오프라인에서 항상 열림
   - Leaflet 라이브러리(CDN): 처음 온라인 접속 때 자동 캐시 → 이후 오프라인 가능
   - 지도 타일: 한 번 본 영역만 캐시 → 봤던 곳은 오프라인에서도 보임
   - 주소검색(Nominatim): 캐시하지 않음(매번 새 결과 필요, 오프라인이면 앱이 막음)
*/
const VERSION = 'rhythmmap-v1';
const CORE = `${VERSION}-core`;
const RUNTIME = `${VERSION}-runtime`;

// 앱 자체 파일 — 상대경로(어느 폴더에 올려도 동작)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CORE).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 주소검색은 그냥 네트워크로 (캐시 안 함)
  if (url.hostname.includes('nominatim')) return;

  // 지도 타일 + CDN 라이브러리: 캐시 우선, 없으면 네트워크 후 캐시에 저장
  const isTile = url.hostname.includes('tile.openstreetmap.org');
  const isCDN  = url.hostname.includes('cdnjs.cloudflare.com');
  if (isTile || isCDN) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
          return res;
        }).catch(() => hit); // 오프라인이고 캐시도 없으면 그대로 실패(타일은 회색)
      })
    );
    return;
  }

  // 그 외(앱 파일): 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // 같은 출처 파일은 런타임 캐시에도 보관
      if (url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(RUNTIME).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
