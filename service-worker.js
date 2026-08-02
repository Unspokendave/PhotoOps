const CACHE = "denk-hub-v1";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(found => found || fetch(event.request)));
});
