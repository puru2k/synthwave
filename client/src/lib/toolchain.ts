// Toolchain loading: download-progress reporting + Cache API warming so the
// service worker (public/sw.js) can serve the big WebAssembly toolchains
// cache-first (instant on repeat visits, works offline).
//
// Our own wasm (iverilog ~10 MB, verilator ~7 MB) lives at /wasm/** and gives
// real byte progress. Yosys (~50 MB) is fetched from a CDN by @yowasp inside a
// worker, so we can only show an indeterminate state for it.

export interface ToolProgress {
  label: string;
  loaded: number; // bytes (determinate) or 0
  total: number; // bytes; 0 => indeterminate
  done: boolean;
}

const CACHE = "synthwave-cache-v1";

let current: ToolProgress | null = null;
const subs = new Set<(p: ToolProgress | null) => void>();

function emit(p: ToolProgress | null): void {
  current = p;
  for (const cb of subs) cb(p);
}

export function onToolchainProgress(cb: (p: ToolProgress | null) => void): () => void {
  subs.add(cb);
  cb(current);
  return () => subs.delete(cb);
}

async function openCache(): Promise<Cache | null> {
  try {
    return "caches" in self ? await caches.open(CACHE) : null;
  } catch {
    return null;
  }
}

// Stream a set of URLs, reporting cumulative bytes, and store each in the cache
// so the SW (and subsequent worker imports) can reuse them.
async function prefetch(urls: string[], onProgress: (loaded: number, total: number) => void): Promise<void> {
  const cache = await openCache();

  // Discover total size up front (HEAD) for a smooth percentage.
  let total = 0;
  const sizes = await Promise.all(
    urls.map(async (u) => {
      try {
        const h = await fetch(u, { method: "HEAD" });
        return Number(h.headers.get("content-length") || 0);
      } catch {
        return 0;
      }
    })
  );
  for (const s of sizes) total += s;

  let loaded = 0;
  for (const url of urls) {
    if (cache) {
      const hit = await cache.match(url);
      if (hit) {
        loaded += Number(hit.headers.get("content-length") || 0);
        onProgress(loaded, total);
        continue;
      }
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      const buf = await res.arrayBuffer();
      loaded += buf.byteLength;
      if (cache) await cache.put(url, new Response(buf, { headers: res.headers }));
      onProgress(loaded, total);
      continue;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total || loaded);
    }
    if (cache) {
      const blob = new Blob(chunks as BlobPart[]);
      await cache.put(url, new Response(blob, { headers: res.headers }));
    }
  }
}

function clearSoon(): void {
  setTimeout(() => {
    if (current?.done) emit(null);
  }, 700);
}

// Load (or confirm cached) a determinate toolchain with byte progress.
const loadedTools = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export function loadToolchain(label: string, urls: string[]): Promise<void> {
  if (loadedTools.has(label)) return Promise.resolve();
  const existing = inflight.get(label);
  if (existing) return existing;
  const p = (async () => {
    emit({ label, loaded: 0, total: 0, done: false });
    try {
      await prefetch(urls, (loaded, total) => emit({ label, loaded, total, done: false }));
    } catch {
      /* network/cache hiccup — the worker import will retry directly */
    }
    loadedTools.add(label);
    emit({ label, loaded: 1, total: 1, done: true });
    clearSoon();
  })();
  inflight.set(label, p);
  p.finally(() => inflight.delete(label));
  return p;
}

// Indeterminate state (e.g. the CDN-hosted Yosys whose inner wasm URL we don't
// control). Returns a finisher to call when the work completes.
export function beginIndeterminate(label: string): () => void {
  if (loadedTools.has(label)) return () => {};
  emit({ label, loaded: 0, total: 0, done: false });
  return () => {
    loadedTools.add(label);
    emit({ label, loaded: 1, total: 1, done: true });
    clearSoon();
  };
}

export function markLoaded(label: string): void {
  loadedTools.add(label);
}

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return; // dev server + SW caching don't mix well
  const base = import.meta.env.BASE_URL;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(base + "sw.js", { scope: base }).catch(() => {
      /* SW is an enhancement; ignore registration failures */
    });
  });
}
