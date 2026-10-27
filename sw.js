/* Guarda uma cópia do sistema no aparelho para abrir sem internet.
   Com internet, sempre busca a versão mais nova e atualiza a cópia. */
const CACHE = 'souza-1.2.0';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/estilo.css?v=1.2.0',
  'js/config.js?v=1.2.0', 'js/nucleo.js?v=1.2.0', 'js/inicio.js?v=1.2.0', 'js/agenda.js?v=1.2.0',
  'js/clientes.js?v=1.2.0', 'js/orcamentos.js?v=1.2.0', 'js/renovacoes.js?v=1.2.0', 'js/obras.js?v=1.2.0', 'js/configuracoes.js?v=1.2.0',
  'img/logo.png?v=1.2.0', 'img/favicon.png', 'img/icone-192.png', 'img/icone-512.png', 'img/apple-touch-icon.png',
  'fonts/instrument-sans-latin-400-normal.woff2', 'fonts/instrument-sans-latin-500-normal.woff2', 'fonts/instrument-sans-latin-600-normal.woff2',
  'fonts/instrument-sans-latin-ext-400-normal.woff2', 'fonts/instrument-sans-latin-ext-500-normal.woff2', 'fonts/instrument-sans-latin-ext-600-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Internet lenta (obra, subsolo): se a rede não responder em 4 s, abre a cópia
   do aparelho e deixa a versão nova terminando de baixar para a próxima vez. */
const ESPERA = 4000;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const daRede = fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return res;
  });
  const doCache = () => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(new Promise((resolve) => {
    let feito = false;
    const entregar = (r) => { if (!feito && r) { feito = true; resolve(r); } };
    const timer = setTimeout(() => doCache().then(entregar), ESPERA);
    daRede.then((res) => { clearTimeout(timer); entregar(res); })
      .catch(() => { clearTimeout(timer); doCache().then((r) => entregar(r || Response.error())); });
  }));
  e.waitUntil(daRede.catch(() => {}));
});
