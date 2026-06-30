// Runs YoWASP Yosys (Yosys compiled to WebAssembly) off the main thread.
// We import the prebuilt bundle from the CDN at runtime so the ~50 MB wasm is
// never bundled into our app; the browser fetches and caches it on first use.

const CDN = "https://cdn.jsdelivr.net/npm/@yowasp/yosys/gen/bundle.js";

type RunYosys = (
  args: string[],
  files?: Record<string, string | Uint8Array>,
  options?: { stdout?: (b: Uint8Array | string | null) => void; stderr?: (b: Uint8Array | string | null) => void }
) => Promise<Record<string, string | Uint8Array>>;

let runYosysPromise: Promise<RunYosys> | null = null;
async function getRunYosys(): Promise<RunYosys> {
  if (!runYosysPromise) {
    runYosysPromise = import(/* @vite-ignore */ CDN).then((m: any) => m.runYosys as RunYosys);
  }
  return runYosysPromise;
}

const decode = (b: Uint8Array | string | null): string => {
  if (b == null) return "";
  return typeof b === "string" ? b : new TextDecoder().decode(b);
};

self.onmessage = async (ev: MessageEvent) => {
  const { id, args, files } = ev.data as { id: number; args: string[]; files: Record<string, string> };
  let log = "";
  const sink = (b: Uint8Array | string | null) => {
    log += decode(b);
  };
  try {
    const runYosys = await getRunYosys();
    const out = await runYosys(args, files, { stdout: sink, stderr: sink });
    const norm: Record<string, string> = {};
    for (const [k, v] of Object.entries(out)) {
      // YoWASP returns a tree: files are string | Uint8Array, but directories
      // (e.g. the abc temp dir created during gate-level mapping) come back as
      // nested objects. Decode only real files and skip everything else, or
      // TextDecoder throws "parameter 1 is not of type 'ArrayBuffer'".
      const val = v as unknown;
      if (typeof val === "string") norm[k] = val;
      else if (val instanceof Uint8Array || val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
        norm[k] = decode(val as Uint8Array);
      }
    }
    (self as any).postMessage({ id, files: norm, log });
  } catch (e: any) {
    (self as any).postMessage({ id, error: String(e?.message || e), log });
  }
};
