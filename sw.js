// Guarda los archivos de la app para abrirla rápido. Los precios NUNCA se guardan aquí: siempre se piden a tu base.
const V = 'profitgod-0.1', FILES = ['./', 'index.html', 'dashboard/styles.css?v=0.1', 'dashboard/app.js?v=0.1', 'data/store.js', 'data/api.js', 'data/freshness.js', 'data/items.js', 'markets/cities.js', 'settings/defaults.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).catch(() => {})));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;      // tu base y cualquier otro sitio van directo a la red
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
