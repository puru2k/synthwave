// SynthWave service worker: makes the app installable/offline and serves the
// heavy WebAssembly toolchains cache-first so repeat visits load instantly.
//
// Cache-first targets:
//   - same-origin /wasm/**   (Icarus + Verilator toolchains)
//   - same-origin /assets/** (hashed build output — safe to cache forever)
//   - cdn.jsdelivr.net       (Yosys via @yowasp, and the Monaco editor)
// Navigations are network-first with an offline fallback to the cached shell.

const CACHE = "synthwave-cache-v2";

// The SW is served at "<base>sw.js", so this resolves to "/" at a root domain
// or "/<repo>/" under a GitHub Pages project subpath. All path checks below are
// relative to it, so cache-first works wherever the site is hosted.
const BASE = new URL("./", self.location).pathname;

function cacheFirstTarget(url) {
  const u = new URL(url);
  if (u.origin === self.location.origin) {
    return u.pathname.startsWith(BASE + "wasm/") || u.pathname.startsWith(BASE + "assets/");
  }
  return u.hostname === "cdn.jsdelivr.net";
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request)) || (await cache.match(BASE + "index.html")) || (await cache.match(BASE));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  if (cacheFirstTarget(req.url)) {
    event.respondWith(cacheFirst(req));
  }
});
