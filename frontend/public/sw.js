const OFFLINE_CACHE = "dus-pwa-offline-v1";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_PAGE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("dus-pwa-") && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (
    request.method !== "GET"
    || requestUrl.origin !== self.location.origin
    || request.mode !== "navigate"
  ) {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const offlineCache = await caches.open(OFFLINE_CACHE);
      const offlinePage = await offlineCache.match(OFFLINE_PAGE);
      return offlinePage || new Response("Sem conexão. Conecte-se para continuar.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })
  );
});
