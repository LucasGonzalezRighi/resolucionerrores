// Bump CACHE_VERSION to force a clean re-cache (e.g. when the asset list below
// changes). Routine edits to index.html / reader.js / styles.css do NOT require
// a bump — the stale-while-revalidate fetch handler refreshes them automatically
// the next time the device is online, and they show on the following launch.
// Keep this in sync with APP_VERSION in js/reader.js (shown in the main menu).
const CACHE_VERSION = "v6";
const CACHE = "benasu-stock-" + CACHE_VERSION;

// Rutas relativas al propio sw.js: andan en cualquier subcarpeta de GitHub
// Pages sin editarlas. Antes apuntaban a /stock-counter/ y en la carpeta
// /resolucionerrores/ daban 404; como cache.addAll falla entero si una sola
// falla, el pre-cacheo no se hacía nunca y la app jamás quedaba offline.
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles/styles.css",
  "./styles/bootstrap.min.css",
  "./styles/bootstrap-icons.min.css",
  "./styles/fonts/bootstrap-icons.woff2",
  "./js/reader.js",
  "./js/bootstrap.bundle.min.js",
  "./js/sweetalert2.min.js",
  "./js/papaparse.min.js",
  "./icon/icon.png",
];

// Pre-cache the app shell, then take over immediately so the next launch is
// guaranteed to run this worker.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// Drop caches from previous versions and claim open pages.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// Stale-while-revalidate: serve the cached copy instantly (works fully offline),
// and when online, quietly fetch a fresh copy into the cache for the next launch.
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        const network = fetch(event.request)
          .then(function (response) {
            if (response && response.status === 200 && response.type === "basic") {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(function () {
            return cached;
          });

        // Cached first for speed/offline; fall back to the network when missing.
        return cached || network;
      });
    })
  );
});
