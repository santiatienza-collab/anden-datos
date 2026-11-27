// Service worker de Andén: hace la web app instalable (iPhone, iPad, Mac, Android) y la abre aunque no haya conexión.
// Solo guarda la "carcasa" de la página (HTML, CSS, JS, iconos y fuentes). Los DATOS (api/…, health.json) NUNCA se guardan:
// siempre se piden a la red, para no mostrar nunca retrasos o alertas antiguas como si fueran actuales.
const CACHE = 'anden-shell-v1';
const SHELL = ['./', 'index.html', 'app.js', 'voz.js', 'style.css', 'icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/inter-latin-wght-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo GET del propio sitio y nunca los datos
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/health.json')) return;
  // Primero la red (así siempre se ve la última versión); si no hay conexión, lo guardado
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
