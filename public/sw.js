const CACHE_VERSION = "v4";
const APP_SHELL_CACHE = `nostr-reddit-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nostr-reddit-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `nostr-reddit-images-${CACHE_VERSION}`;

const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.endsWith("/") ? SCOPE_URL.pathname : `${SCOPE_URL.pathname}/`;
const withBase = (assetPath) => new URL(assetPath, SCOPE_URL).pathname;

const APP_SHELL_INDEX = withBase("index.html");
const APP_SHELL_ASSETS = [
  withBase("./"),
  APP_SHELL_INDEX,
  withBase("manifest.json"),
  withBase("icon-192.png"),
  withBase("icon-512.png"),
  withBase("icon-192.svg"),
  withBase("icon-512.svg"),
];

const CACHES_TO_KEEP = [APP_SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE];

const shouldHandleRequest = (request) =>
  request.method === "GET" && request.url.startsWith("http");

const isNavigationRequest = (request) => request.mode === "navigate";
const isStaticAssetRequest = (request) =>
  ["script", "style", "font", "worker"].includes(request.destination);

const isImageRequest = (request, url) =>
  request.destination === "image" ||
  /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(url.pathname) ||
  url.hostname.includes("nostr.build") ||
  url.hostname.includes("imgur.com") ||
  url.hostname.includes("pbs.twimg.com");

const putInCache = async (cacheName, request, response) => {
  if (!response || (!response.ok && response.type !== "opaque")) {
    return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      void putInCache(cacheName, request, response);
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise || new Response("Offline", { status: 503 });
};

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    void putInCache(cacheName, request, response);
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
};

const networkFirstNavigation = async (request) => {
  try {
    const response = await fetch(request);
    void putInCache(RUNTIME_CACHE, request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    const fallback = await caches.match(APP_SHELL_INDEX);
    if (fallback) {
      return fallback;
    }
    return new Response("Offline", { status: 503 });
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => !CACHES_TO_KEEP.includes(cacheName))
          .map((cacheName) => caches.delete(cacheName))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldHandleRequest(request)) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith(`${BASE_PATH}api/`) || url.pathname.startsWith("/api/")) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (url.origin === self.location.origin && isStaticAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
