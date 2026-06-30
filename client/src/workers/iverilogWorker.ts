// Runs the Icarus Verilog toolchain (ivlpp -> ivl -> vvp) compiled to
// WebAssembly, entirely in the browser, off the main thread.
//
// The three stages are separate Emscripten MAIN_MODULEs; ivl dlopen()s
// vvp.tgt and vvp dlopen()s system.vpi from the in-memory filesystem. This
// mirrors the validated Node harness in wasm-build/out/test_run.mjs.

export {}; // ensure module scope (isolate top-level names from other workers)

const BASE = import.meta.env.BASE_URL + "wasm/iverilog/";

// Static ivl config. `module:` makes ivl load system.vpi at compile time so it
// learns the $system task/function signatures; `out:` is the compiled vvp file.
// `warnings:` is the set of enabled warning classes (see below).
const iconfig = (warnings: string) => `basedir:/ivl/lib/ivl
module:/ivl/lib/ivl/system.vpi
generation:2005
generation:no-specify
generation:no-interconnect
generation:assertions
generation:xtypes
generation:io-range-error
generation:no-strict-ca-eval
generation:no-strict-expr-width
generation:shared-loop-index
generation:no-verilog-ams
generation:icarus-misc
warnings:${warnings}
ignore_missing_modules:false
out:/work/out.vvp
iwidth:32
widthcap:65536
ivlpp:/ivl/lib/ivl/ivlpp -L
`;

// Simulation keeps Icarus' default warnings; linting mirrors `iverilog -Wall`,
// whose flag letters (from the driver's process_warning_switch) are:
// n=anachronisms i=implicit d=implicit-dimensions R=macro-replacement
// p=portbind s=select-range t=timescale a=sensitivity-entire-array.
const ICONFIG = iconfig("n");
const ICONFIG_LINT = iconfig("nidRpsta");

type Factory = (opts: any) => Promise<any>;

// Module factories + the side-module/config bytes are fetched once and reused.
let factories: { ivlpp: Factory; ivl: Factory; vvp: Factory } | null = null;
let assets: { vvpConf: string; vvpTgt: Uint8Array; systemVpi: Uint8Array } | null = null;

async function loadFactories() {
  if (factories) return factories;
  const [ivlpp, ivl, vvp] = await Promise.all([
    import(/* @vite-ignore */ BASE + "ivlpp.mjs"),
    import(/* @vite-ignore */ BASE + "ivl.mjs"),
    import(/* @vite-ignore */ BASE + "vvp.mjs"),
  ]);
  factories = { ivlpp: ivlpp.default, ivl: ivl.default, vvp: vvp.default };
  return factories;
}

async function loadAssets() {
  if (assets) return assets;
  const [vvpConf, vvpTgt, systemVpi] = await Promise.all([
    fetch(BASE + "vvp.conf").then((r) => r.text()),
    fetch(BASE + "vvp.tgt").then((r) => r.arrayBuffer()),
    fetch(BASE + "system.vpi").then((r) => r.arrayBuffer()),
  ]);
  assets = { vvpConf, vvpTgt: new Uint8Array(vvpTgt), systemVpi: new Uint8Array(systemVpi) };
  return assets;
}

interface RunResult {
  code: number;
  out: string[];
  err: string[];
  FS: any;
}

// Instantiate a fresh module, lay out its MEMFS, run main(), and wait for exit.
// ASYNCIFY means callMain may unwind before the program finishes; onExit gives
// us the real completion signal.
async function run(
  factory: Factory,
  args: string[],
  files: Record<string, string | Uint8Array>,
  opts: { cwd?: string; stdin?: string; setup?: (FS: any) => void } = {}
): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  let resolveExit: (c: number) => void;
  const exited = new Promise<number>((r) => (resolveExit = r));
  const stdinBuf = opts.stdin ? new TextEncoder().encode(opts.stdin) : null;
  let stdinPos = 0;

  const Mod = await factory({
    noInitialRun: true,
    print: (s: string) => out.push(s),
    printErr: (s: string) => err.push(s),
    onExit: (c: number) => resolveExit(c),
    stdin: stdinBuf ? () => (stdinPos < stdinBuf.length ? stdinBuf[stdinPos++] : null) : undefined,
  });

  const FS = Mod.FS;
  opts.setup?.(FS);
  for (const [path, data] of Object.entries(files)) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) FS.mkdirTree(dir);
    FS.writeFile(path, data);
  }
  if (opts.cwd) FS.chdir(opts.cwd);

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
  return { code: code ?? 0, out, err, FS };
}

// Drop internal debug noise that leaked into the WASM builds (e.g. a stray
// `VVPTGT_DEBUG ...` line the vvp code generator prints) so a clean design
// reports cleanly instead of looking like an error.
function cleanLog(lines: string[]): string {
  return lines
    .filter((l) => !/^\s*VVPTGT_DEBUG\b/.test(l))
    .join("\n")
    .trim();
}

function readFileMaybe(FS: any, candidates: string[]): string | undefined {
  for (const p of candidates) {
    try {
      return FS.readFile(p, { encoding: "utf8" }) as string;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

// Preprocess (ivlpp) + compile/elaborate (ivl). Shared by simulate and lint.
// `config` selects the warning set. Returns the compiled vvp bytecode (or null
// if elaboration failed) plus the diagnostic text (warnings + errors).
async function compile(
  inFiles: { name: string; content: string }[],
  config: string
): Promise<{ ok: boolean; vvpText: string | null; log: string }> {
  const f = await loadFactories();
  const a = await loadAssets();

  // ---- normalize source file names ----
  const sources: Record<string, string> = {};
  const names: string[] = [];
  inFiles.forEach((file, i) => {
    const name = file.name && /\.s?v$/i.test(file.name) ? file.name : `src${i}.v`;
    sources["/work/" + name] = file.content;
    names.push("/work/" + name);
  });
  if (names.length === 0) return { ok: false, vvpText: null, log: "No source files." };

  // ---- Stage 1: preprocess (ivlpp) ----
  const s1 = await run(f.ivlpp, ["-L", "-F/work/defines.txt", "-f/work/sources.txt"], {
    ...sources,
    "/work/defines.txt": "",
    "/work/sources.txt": names.join("\n") + "\n",
  });
  if (s1.code !== 0) {
    return { ok: false, vvpText: null, log: "Preprocessing failed:\n" + s1.err.join("\n") };
  }
  const preprocessed = s1.out.join("\n") + "\n";

  // ---- Stage 2: compile to vvp bytecode (ivl, loads vvp.tgt) ----
  const mkIvlTree = (FS: any) => {
    FS.mkdirTree("/ivl/lib/ivl");
    FS.mkdirTree("/work");
    FS.writeFile("/ivl/lib/ivl/vvp.conf", a.vvpConf);
    FS.writeFile("/ivl/lib/ivl/vvp.tgt", a.vvpTgt);
    FS.writeFile("/ivl/lib/ivl/system.vpi", a.systemVpi);
  };
  const s2 = await run(
    f.ivl,
    ["-C/work/iconfig.txt", "-C/ivl/lib/ivl/vvp.conf", "--", "-"],
    { "/work/iconfig.txt": config },
    { setup: mkIvlTree, stdin: preprocessed }
  );
  const vvpText = readFileMaybe(s2.FS, ["/work/out.vvp"]) ?? null;
  const log = cleanLog([...s2.err, ...s2.out]);
  return { ok: vvpText !== null, vvpText, log };
}

// Basic lint = elaborate with `-Wall`-equivalent warnings, no simulation.
async function lint(
  inFiles: { name: string; content: string }[]
): Promise<{ ok: boolean; log: string }> {
  const { ok, log } = await compile(inFiles, ICONFIG_LINT);
  return { ok, log: log || (ok ? "No problems found." : "Elaboration failed.") };
}

// Turn a user filename into a safe RELATIVE path (subdirectories allowed, so
// $readmemh("rom/init.hex") resolves), stripping leading slashes and "..".
function dataBasename(name: string, fallback: string): string {
  const segs = (name || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[^A-Za-z0-9_.\-]/g, "_"))
    .filter((s) => s && s !== "." && s !== "..");
  return segs.length ? segs.join("/") : fallback;
}

// List regular files under a MEMFS directory (recursively), relative to it.
function listFiles(FS: any, dir: string, prefix = ""): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = FS.readdir(dir).filter((n: string) => n !== "." && n !== "..");
  } catch {
    return out;
  }
  for (const n of entries) {
    const p = dir + "/" + n;
    try {
      const st = FS.stat(p);
      if (FS.isDir(st.mode)) out.push(...listFiles(FS, p, prefix + n + "/"));
      else out.push(prefix + n);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function compileAndSimulate(
  inFiles: { name: string; content: string }[],
  dataFiles: { name: string; content: string }[] = []
): Promise<{ ok: boolean; vcd: string | null; log: string; outputs: { name: string; content: string }[] }> {
  const f = await loadFactories();
  const a = await loadAssets();

  const c = await compile(inFiles, ICONFIG);
  const vvpText = c.vvpText;
  if (vvpText === null) {
    return { ok: false, vcd: null, log: c.log || "Compilation failed (ivl produced no output).", outputs: [] };
  }

  // Data files ($readmemh/$readmemb/$fopen targets) live alongside the design
  // in the simulation cwd, keyed by their original (relative) names.
  const simFiles: Record<string, string> = { "/work/out.vvp": vvpText };
  const inputNames = new Set<string>(["out.vvp", "dump.vcd"]);
  inFiles.forEach((file, i) => {
    const name = file.name && /\.s?v$/i.test(file.name) ? file.name : `src${i}.v`;
    inputNames.add(name);
  });
  dataFiles.forEach((d, i) => {
    const rel = dataBasename(d.name, `data${i + 1}.dat`);
    simFiles["/work/" + rel] = d.content;
    inputNames.add(rel);
  });

  // ---- Stage 3: simulate (vvp, loads system.vpi) ----
  const s3 = await run(
    f.vvp,
    ["/work/out.vvp"],
    simFiles,
    {
      cwd: "/work",
      setup: (FS: any) => {
        FS.mkdirTree("/ivl/lib/ivl");
        FS.mkdirTree("/work");
        FS.writeFile("/ivl/lib/ivl/system.vpi", a.systemVpi);
      },
    }
  );

  const simLog = cleanLog([...s3.out, ...s3.err]);
  const vcd = readFileMaybe(s3.FS, ["/work/dump.vcd", "/dump.vcd"]) ?? null;

  // Anything the testbench wrote into /work that wasn't one of our inputs is a
  // user output file ($fopen/$fwrite/$writememh/$writememb, custom $dumpfile…).
  const outputs: { name: string; content: string }[] = [];
  for (const rel of listFiles(s3.FS, "/work")) {
    if (inputNames.has(rel) || rel === "out.vvp") continue;
    if (rel.endsWith(".profraw")) continue; // LLVM instrumentation artifact, not user output
    const content = readFileMaybe(s3.FS, ["/work/" + rel]);
    if (content !== undefined) outputs.push({ name: rel, content });
  }

  return { ok: true, vcd, log: simLog, outputs };
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, mode, files, data } = ev.data as {
    id: number;
    mode?: "sim" | "lint";
    files: { name: string; content: string }[];
    data?: { name: string; content: string }[];
  };
  try {
    if (mode === "lint") {
      const res = await lint(files);
      (self as any).postMessage({ id, ok: res.ok, log: res.log });
    } else {
      const res = await compileAndSimulate(files, data || []);
      (self as any).postMessage({ id, ok: res.ok, vcd: res.vcd, log: res.log, outputs: res.outputs });
    }
  } catch (e: any) {
    (self as any).postMessage({ id, ok: false, vcd: null, error: String(e?.message || e) });
  }
};
