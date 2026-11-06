// Service worker do Radar: guarda a "casca" do app para abrir rápido (e sem internet).
// Os dados (/api) sempre vêm da rede: nunca ficam guardados aqui.
const VERSAO = 'radar-v1';
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
  // arquivos do app: responde na hora com o guardado e atualiza por trás
  e.respondWith(caches.open(VERSAO).then(async c => {
    const guardado = await c.match(req, { ignoreSearch: true });
    const rede = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => guardado);
    return guardado || rede;
  }));
});
