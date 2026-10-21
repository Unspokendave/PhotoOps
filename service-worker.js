const CACHE = "PhotoOps-scheduling-v21-4";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./sync.js", "./planner.js", "./storage.js", "./manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("fetch", event => {
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(found => found || fetch(event.request)));
});
