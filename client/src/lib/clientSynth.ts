import type { SourceFile, SynthesizeResponse, FsmResponse, SynthMode } from "./api";
import { parseStat, buildSrcMap, criticalDepth, parseKiss2 } from "./netlist";
import { CELLS_LIB } from "./liberty";
import { beginIndeterminate, markLoaded } from "./toolchain";
// netlistsvg + its default skin, rendered fully client-side. netlistsvg pulls
// in elkjs (~1 MB), so it's lazy-loaded only when a schematic is rendered.
import skin from "netlistsvg/lib/default.svg?raw";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/yosysWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { id, files, log, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error + (log ? "\n\n" + log : "")));
      else p.resolve({ files, log });
    };
    worker.onerror = (e) => {
      const msg = e.message || "Web Worker failed to start";
      for (const [, p] of pending) p.reject(new Error(msg));
      pending.clear();
    };
  }
  return worker;
}

let yosysReady = false;

async function runYosysWasm(args: string[], files: Record<string, string>): Promise<{ files: Record<string, string>; log: string }> {
  // Yosys' wasm is fetched from the CDN inside the worker; we can't track its
  // bytes, so show an indeterminate "loading" state until the first run returns.
  const finish = yosysReady ? () => {} : beginIndeterminate("Yosys");
  const id = ++seq;
  const w = getWorker();
  try {
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, args, files });
    });
  } finally {
    yosysReady = true;
    markLoaded("Yosys");
    finish();
  }
}

function filesObj(files: SourceFile[]): { obj: Record<string, string>; names: string[] } {
  const obj: Record<string, string> = {};
  const names: string[] = [];
  files.forEach((f, i) => {
    const name = f.name && /\.s?v$/i.test(f.name) ? f.name : `src${i}.v`;
    obj[name] = f.content;
    names.push(name);
  });
  return { obj, names };
}

async function renderSchematic(netlistText: string): Promise<string> {
  const ns: any = await import("netlistsvg");
  const render = ns.render ?? ns.default?.render ?? ns.default ?? ns;
  return await render(skin, JSON.parse(netlistText));
}

// Turn a raw Yosys netlist + log into the full SynthesizeResponse the UI wants:
// render the schematic (netlistsvg) and compute stats/critical-path/srcMap.
// Shared by the in-browser (WASM) and native (desktop) synthesis paths so the
// post-processing is identical regardless of which engine produced the netlist.
export async function finishSynthesis(
  netlist: string,
  log: string,
  mode: SynthMode
): Promise<SynthesizeResponse> {
  let svg: string | null = null;
  let renderError: string | null = null;
  try {
    svg = await renderSchematic(netlist);
  } catch (e: any) {
    renderError = e?.message || String(e);
  }
  return {
    ok: true,
    stage: "done",
    netlist,
    svg,
    renderError,
    stats: {
      ...parseStat(log),
      depth: criticalDepth(netlist),
      ...(mode === "gate" ? parseLibertyMetrics(log) : {}),
    },
    srcMap: buildSrcMap(netlist),
    log: log || "Synthesis finished.",
  };
}

export async function synthesizeWasm(
  files: SourceFile[],
  top: string,
  flatten: boolean,
  mode: SynthMode,
  lib?: string
): Promise<SynthesizeResponse> {
  const { obj, names } = filesObj(files);
  if (names.length === 0) return { ok: false, stage: "synthesize", log: "No design files to synthesize." };
  const topArg = top && top.trim() ? `-top ${top.trim()}` : "-auto-top";
  const flattenArg = flatten ? "; flatten" : "";

  // Gate-level: full synth, then technology-map flip-flops + combinational logic
  // onto a standard-cell liberty (a user-supplied .lib, or the built-in generic
  // one) so we get real gate/FF counts, area and an abc arrival-time estimate.
  if (mode === "gate") obj["cells.lib"] = lib && lib.trim() ? lib : CELLS_LIB;

  const script =
    mode === "gate"
      ? [
          // read_liberty -lib defines the cells as blackbox modules so the JSON
          // netlist carries their pin directions (needed for the schematic and
          // the critical-path estimate).
          `read_liberty -lib cells.lib`,
          `read_verilog -sv ${names.join(" ")}`,
          `synth ${topArg}${flattenArg}`,
          `dfflibmap -liberty cells.lib`,
          `abc -liberty cells.lib`,
          `opt_clean`,
          `stat -liberty cells.lib`,
          `write_json netlist.json`,
        ].join("; ")
      : [
          `read_verilog -sv ${names.join(" ")}`,
          `hierarchy ${topArg}`,
          `proc`,
          `opt`,
          `memory -nomap`,
          `opt`,
          `wreduce`,
          `opt -full${flattenArg}`,
          `stat`,
          `write_json netlist.json`,
        ].join("; ");

  let res: { files: Record<string, string>; log: string };
  try {
    res = await runYosysWasm(["-p", script], obj);
  } catch (e: any) {
    return { ok: false, stage: "synthesize", log: "In-browser Yosys failed:\n\n" + (e?.message || String(e)) };
  }
  const netlist = res.files["netlist.json"];
  if (!netlist) {
    return { ok: false, stage: "synthesize", log: "Yosys produced no netlist.\n\n" + res.log };
  }

  let svg: string | null = null;
  let renderError: string | null = null;
  try {
    svg = await renderSchematic(netlist);
  } catch (e: any) {
    renderError = e?.message || String(e);
  }

  return {
    ok: true,
    stage: "done",
    netlist,
    svg,
    renderError,
    stats: {
      ...parseStat(res.log),
      depth: criticalDepth(netlist),
      ...(mode === "gate" ? parseLibertyMetrics(res.log) : {}),
    },
    srcMap: buildSrcMap(netlist),
    log: res.log || "Synthesis finished (in-browser).",
  };
}

// Pull the chip area (yosys `stat -liberty`) and the arrival-time estimate
// (abc's "Delay = N") out of the Yosys log.
function parseLibertyMetrics(log: string): { area?: number; delay?: number } {
  const out: { area?: number; delay?: number } = {};
  const area = log.match(/Chip area for(?: top)? module[^:]*:\s*([\d.]+)/i);
  if (area) out.area = Math.round(parseFloat(area[1]));
  // abc prints lines like: "Delay      =  3.00 ps" or "Path =  ... Delay = 3.00"
  let best = 0;
  for (const m of log.matchAll(/Delay\s*=\s*([\d.]+)/gi)) {
    const v = parseFloat(m[1]);
    if (v > best) best = v;
  }
  if (best > 0) out.delay = Math.round(best * 100) / 100;
  return out;
}

// Likely state registers: identifiers switched on in a case() AND assigned with
// a non-blocking <=. Used to force FSM extraction on machines fsm_detect misses.
function stateRegNames(text: string): string[] {
  const caseVars = new Set<string>();
  const re1 = /\bcase[xz]?\s*\(\s*([A-Za-z_]\w*)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) caseVars.add(m[1]);
  const regs = new Set<string>();
  const re2 = /\b([A-Za-z_]\w*)\s*<=/g;
  while ((m = re2.exec(text)) !== null) regs.add(m[1]);
  return [...caseVars].filter((v) => regs.has(v));
}

export async function extractFsmWasm(files: SourceFile[], top: string): Promise<FsmResponse> {
  const { obj, names } = filesObj(files);
  if (names.length === 0) return { ok: false, fsm: null, log: "No design files to analyze for an FSM." };
  const topArg = top && top.trim() ? `-top ${top.trim()}` : "-auto-top";
  const stateRegs = stateRegNames(files.map((f) => f.content).join("\n"));

  const normal = [
    `read_verilog -sv ${names.join(" ")}`,
    `hierarchy ${topArg}`,
    `proc`,
    `opt`,
    `fsm_detect`,
    `fsm_extract`,
    `fsm_export -origenc -o fsm.kiss2`,
  ].join("; ");
  // Forced flow: skip opt_dff (which factors a held state into a clock-enable and
  // breaks fsm_extract) and explicitly mark the parsed state register(s).
  const forced = stateRegs.length
    ? [
        `read_verilog -sv ${names.join(" ")}`,
        `hierarchy ${topArg}`,
        `proc`,
        `opt_expr`,
        `opt_clean`,
        `setattr -set fsm_encoding "auto" ${stateRegs.map((r) => "w:" + r).join(" ")}`,
        `fsm_extract`,
        `fsm_opt`,
        `opt_clean`,
        `fsm_export -origenc -o fsm.kiss2`,
      ].join("; ")
    : null;

  const tryRun = async (script: string) => {
    const res = await runYosysWasm(["-p", script], obj);
    const kiss2 = res.files["fsm.kiss2"];
    if (!kiss2) return { fsm: null as FsmResponse["fsm"], log: res.log };
    const fsm = parseKiss2(kiss2);
    return { fsm: fsm.transitions.length ? fsm : null, log: res.log };
  };

  try {
    let { fsm, log } = await tryRun(normal);
    if (!fsm && forced) ({ fsm, log } = await tryRun(forced));
    if (!fsm) return { ok: true, fsm: null, log: "No finite-state machine was detected in this design." };
    return { ok: true, fsm, log: log || "FSM extracted (in-browser)." };
  } catch (e: any) {
    return { ok: false, fsm: null, log: "In-browser Yosys failed:\n\n" + (e?.message || String(e)) };
  }
}

// Trigger the worker + wasm download ahead of first use.
export function warmupWasm(): void {
  getWorker();
}
