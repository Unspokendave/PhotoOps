const CACHE = "PhotoOps-v3";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(found => found || fetch(event.request)));
});
