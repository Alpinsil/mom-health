const CACHE_NAME = "ruang-sehat-shell-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./config.js?v=8",
  "./app.js?v=8",
  "./manifest.webmanifest",
  "./icons/health.svg",
];
const APP_ASSETS = new Set(
  APP_SHELL.map((asset) => new URL(asset, self.registration.scope).pathname),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("ruang-sehat-shell-") && name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.endsWith("/api/health")
  ) {
    return;
  }

  const isNavigation = request.mode === "navigate";
  if (!isNavigation && !APP_ASSETS.has(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (isNavigation) {
          const offlinePage = await cache.match(
            new URL("./index.html", self.registration.scope).href,
          );
          if (offlinePage) return offlinePage;
        }
        throw error;
      }
    })(),
  );
});
