// Runs YoWASP Yosys (Yosys compiled to WebAssembly) off the main thread.
//
// The ~50 MB bundle is vendored under public/wasm/yosys and served same-origin
// (base-path aware), NOT pulled from a CDN. A cross-origin dynamic import()
// proved unreliable on deploys — jsdelivr can be slow/blocked, and a service
// worker can't legally replay a cross-origin module response — so synthesis
// would fail with "Failed to fetch dynamically imported module". Hosting it
// ourselves makes Yosys as dependable (and cacheable/offline) as the Icarus
// and Verilator toolchains. bundle.js locates its cores via import.meta.url,
// so the sibling .wasm/.tar files resolve next to it automatically.
const BUNDLE = import.meta.env.BASE_URL + "wasm/yosys/bundle.js";

type RunYosys = (
  args: string[],
  files?: Record<string, string | Uint8Array>,
  options?: { stdout?: (b: Uint8Array | string | null) => void; stderr?: (b: Uint8Array | string | null) => void }
) => Promise<Record<string, string | Uint8Array>>;

let runYosysPromise: Promise<RunYosys> | null = null;
async function getRunYosys(): Promise<RunYosys> {
  if (!runYosysPromise) {
    runYosysPromise = import(/* @vite-ignore */ BUNDLE).then((m: any) => m.runYosys as RunYosys);
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
