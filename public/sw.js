/* SplitSchatzi Service Worker
   App-Dateien: network-first (immer aktuell, wenn online) mit Cache-Fallback -> App startet auch offline.
   Die Daten selbst laufen über die Firebase-Websocket-Verbindung und werden hier nicht angefasst. */
const CACHE = 'splitschatzi-v3';
const FONTS = 'splitschatzi-fonts';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const FIREBASE = ['/__/firebase/10.14.0/firebase-app-compat.js', '/__/firebase/10.14.0/firebase-database-compat.js', '/__/firebase/init.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL).then(() => Promise.all(FIREBASE.map(u => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/__dev/')) return;
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? '/index.html' : req;
  const hit = await cache.match(key, { ignoreSearch: true });
  const net = fetch(req).then(res => {
    if (res.ok && !res.redirected) cache.put(key, res.clone());
    return res;
  });
  // Nur wenn eine gespeicherte Kopie da ist, bei langsamem Netz nach 4 s darauf ausweichen –
  // sonst geduldig auf das Netz warten (langsames LTE darf nie zu einer Fehlerseite führen).
  if (!hit) return net.catch(() => fetch(req));
  return Promise.race([net, new Promise(r => setTimeout(() => r(hit), 4000))]).catch(() => hit);
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
