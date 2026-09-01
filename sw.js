// ═══ RUBENTRENA — Service Worker ═══
// Estrategias de cache, según el tipo de contenido:
//
// 1) HTML propio (index.html / navegación): "network-first" — siempre intenta traer la
//    version mas nueva de internet primero. Si hay conexion, la app SIEMPRE se ve actualizada
//    (nunca se queda pegada en una version vieja). Si no hay conexion, usa la ultima copia
//    guardada, para que la app igual abra.
//
// 2) Recursos externos que casi no cambian (fuentes, iconos, SDK de Firebase): "cache-first" —
//    se guardan una vez y se reusan, para no gastar datos de mas en algo que no cambia.
//
// 3) Fotos y GIFs de Cloudinary: "stale-while-revalidate" — se muestran al toque desde lo ya
//    guardado (rapido, y funciona sin internet si ya se vieron antes), y por atras se pide una
//    copia fresca para la proxima vez, sin que el alumno tenga que esperar nada.
//
// 4) Firebase/Firestore (sincronizacion de datos): nunca se toca, siempre va directo a internet.
//    El guardado de datos (localStorage) no depende de este archivo — eso ya funciona sin
//    conexion de por si.

const VERSION = 'v1';
const SHELL_CACHE = 'rt6-shell-' + VERSION;
const ASSETS_CACHE = 'rt6-assets-' + VERSION;
const IMG_CACHE = 'rt6-img-' + VERSION;
const CACHES_ACTUALES = [SHELL_CACHE, ASSETS_CACHE, IMG_CACHE];

const PRECACHE_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // si algo falla al instalar, no bloquea — se va cacheando igual con el uso normal
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((n) => n.startsWith('rt6-') && !CACHES_ACTUALES.includes(n))
          .map((n) => caches.delete(n)) // limpia versiones viejas de cache
      ))
      .then(() => self.clients.claim())
  );
});

function esFirebase(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|identitytoolkit|firebase\.googleapis\.com/.test(url);
}
function esImagenCloudinary(url) {
  return /res\.cloudinary\.com/.test(url);
}
function esRecursoEstatico(url) {
  return /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|gstatic\.com\/firebasejs/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  if (req.method !== 'GET') return; // no tocar guardados/sync, solo lecturas
  if (esFirebase(url)) return; // sync de datos: siempre directo a la red, sin cache

  // App propia (HTML) -> network-first con respaldo a cache
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Fotos/GIFs de Cloudinary -> se muestra lo guardado al toque, y se actualiza atras
  if (esImagenCloudinary(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cacheado) => {
          const buscarFresco = fetch(req)
            .then((res) => { cache.put(req, res.clone()); return res; })
            .catch(() => cacheado);
          return cacheado || buscarFresco;
        })
      )
    );
    return;
  }

  // Fuentes / iconos / SDK externos -> cache-first (casi no cambian)
  if (esRecursoEstatico(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then((cache) =>
        cache.match(req).then((cacheado) => cacheado || fetch(req).then((res) => {
          cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Cualquier otra cosa: red primero, cache como respaldo
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
