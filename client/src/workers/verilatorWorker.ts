// Runs Verilator (verilator_bin compiled to WebAssembly) for strict lint
// (`--lint-only -Wall`) entirely in the browser, off the main thread.
// verilator_bin is a single self-contained analyzer: no subprocess C++ compile,
// no dlopen. It needs two data files (verilated_std.sv + its waiver) under
// $VERILATOR_ROOT/include.

export {}; // ensure module scope (isolate top-level names from other workers)

const BASE = import.meta.env.BASE_URL + "wasm/verilator/";

type Factory = (opts: any) => Promise<any>;
let factory: Factory | null = null;
let std: { sv: string; waiver: string } | null = null;

async function load() {
  if (!factory) factory = (await import(/* @vite-ignore */ BASE + "verilator_bin.mjs")).default;
  if (!std) {
    const [sv, waiver] = await Promise.all([
      fetch(BASE + "include/verilated_std.sv").then((r) => r.text()),
      fetch(BASE + "include/verilated_std_waiver.vlt").then((r) => r.text()),
    ]);
    std = { sv, waiver };
  }
  return { factory: factory!, std: std! };
}

async function strictLint(
  files: { name: string; content: string }[],
  top?: string
): Promise<{ ok: boolean; log: string }> {
  const { factory, std } = await load();

  const names: string[] = [];
  files.forEach((file, i) => {
    const name = file.name && /\.s?v$/i.test(file.name) ? file.name : `src${i}.v`;
    names.push(name);
  });
  if (names.length === 0) return { ok: false, log: "No design files to lint." };

  const out: string[] = [];
  const err: string[] = [];
  let resolveExit: (c: number) => void;
  const exited = new Promise<number>((r) => (resolveExit = r));

  const Mod = await factory({
    noInitialRun: true,
    print: (s: string) => out.push(s),
    printErr: (s: string) => err.push(s),
    onExit: (c: number) => resolveExit(c),
    preRun: [
      (m: any) => {
        m.ENV.VERILATOR_ROOT = "/verilator";
        m.FS.mkdirTree("/verilator/include");
        m.FS.mkdirTree("/work");
        m.FS.writeFile("/verilator/include/verilated_std.sv", std.sv);
        m.FS.writeFile("/verilator/include/verilated_std_waiver.vlt", std.waiver);
        files.forEach((file, i) => {
          const path = "/work/" + names[i];
          const dir = path.slice(0, path.lastIndexOf("/"));
          if (dir) m.FS.mkdirTree(dir);
          m.FS.writeFile(path, file.content);
        });
        m.FS.chdir("/work");
      },
    ],
  });

  const args = ["--lint-only", "-Wall", "-Wno-DECLFILENAME"];
  if (top && top.trim()) args.push("--top-module", top.trim());
  args.push(...names);

  let code = 0;
  try {
    Mod.callMain(args);
  } catch (e: any) {
    if (e && e.name === "ExitStatus") resolveExit!(e.status);
    else {
      err.push("THROW: " + (e?.message || e));
      resolveExit!(-1);
    }
  }
  code = await exited;
  const log = [...out, ...err].join("\n").trim();
  // Verilator exits non-zero when it emits warnings/errors with -Wall; treat a
  // run that produced no %Error as "ok" (warnings are surfaced, not failures).
  const hadError = /%Error/.test(log) && !/Exiting due to .* warning/.test(log);
  return { ok: code === 0 || !hadError, log };
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, files, top } = ev.data as {
    id: number;
    files: { name: string; content: string }[];
    top?: string;
  };
  try {
    const res = await strictLint(files, top);
    (self as any).postMessage({ id, ok: res.ok, log: res.log });
  } catch (e: any) {
    (self as any).postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};
