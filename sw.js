// Service worker do Radar: guarda a "casca" do app para abrir rápido (e sem internet).
// Os dados (/api) sempre vêm da rede: nunca ficam guardados aqui.
const VERSAO = 'radar-v3';
const CASCA = ['/', '/index.html', '/app.js', '/estilo.css', '/manifest.webmanifest',
  '/lib/margem.js', '/lib/frete.js', '/lib/precoideal.js', '/lib/calendario.js', '/lib/recomendacao.js', '/lib/palavras.js',
  '/icones/icone-192.png', '/icones/icone-512.png', '/icones/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // telas: rede primeiro (pega a versão nova), cai para a guardada se estiver sem internet
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put('/index.html', c)); return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  // arquivos do app: rede primeiro (sempre a versão nova, página e estilo juntos); sem internet usa o guardado
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSAO).then(x => x.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true })));
});

// 🔔 avisos no celular
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { texto: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || '📡 Radar Marketplace', {
    body: d.texto || '', icon: '/icones/icone-192.png', badge: '/icones/icone-192.png', tag: d.tag || 'radar', renotify: true, data: { url: d.url || '/#vigiadas' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ls => {
    const aberto = ls.find(c => new URL(c.url).origin === location.origin);
    if (aberto) { aberto.focus(); return aberto.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  }));
});
