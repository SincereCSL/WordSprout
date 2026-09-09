const CACHE = "ziya-v1";
const CORE = [
  "/", "/manifest.webmanifest", "/favicon.svg",
  "/hanzi-data/永.json", "/hanzi-data/日.json", "/hanzi-data/月.json", "/hanzi-data/山.json",
  "/hanzi-data/川.json", "/hanzi-data/天.json", "/hanzi-data/地.json", "/hanzi-data/人.json",
  "/hanzi-data/春.json", "/hanzi-data/风.json", "/hanzi-data/雨.json", "/hanzi-data/大.json",
  "/hanzi-data/小.json", "/hanzi-data/多.json", "/hanzi-data/少.json",
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("/"))));
});
