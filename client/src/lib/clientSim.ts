import type { SimulateResponse, SourceFile, VerifyResponse } from "./api";
import { loadToolchain } from "./toolchain";

// BASE_URL is "/" at a root domain or "/<repo>/" under a GitHub Pages subpath,
// so the toolchain assets resolve correctly wherever the site is hosted.
const IV = import.meta.env.BASE_URL + "wasm/iverilog/";
const IVERILOG_ASSETS = [
  IV + "ivlpp.wasm",
  IV + "ivl.wasm",
  IV + "vvp.wasm",
  IV + "vvp.tgt",
  IV + "system.vpi",
  IV + "vvp.conf",
  IV + "ivlpp.mjs",
  IV + "ivl.mjs",
  IV + "vvp.mjs",
];
const VL = import.meta.env.BASE_URL + "wasm/verilator/";
const VERILATOR_ASSETS = [
  VL + "verilator_bin.wasm",
  VL + "verilator_bin.mjs",
  VL + "include/verilated_std.sv",
  VL + "include/verilated_std_waiver.vlt",
];

// Warm the Cache (with progress) before the worker imports the modules, so the
// download is shown once and reused. Idempotent + cheap once cached.
const warmIverilog = () => loadToolchain("Icarus Verilog", IVERILOG_ASSETS);
const warmVerilator = () => loadToolchain("Verilator", VERILATOR_ASSETS);

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/iverilogWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, vcd, log, error, outputs } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve({ ok, vcd, log, outputs });
    };
    worker.onerror = (e) => {
      const msg = e.message || "In-browser simulator failed to start";
      for (const [, p] of pending) p.reject(new Error(msg));
      pending.clear();
    };
  }
  return worker;
}

export async function lintWasm(files: SourceFile[]): Promise<VerifyResponse> {
  await warmIverilog();
  const id = ++seq;
  const w = getWorker();
  try {
    const { ok, log } = await new Promise<{ ok: boolean; log: string }>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, mode: "lint", files });
    });
    return { ok, log: log || (ok ? "No problems found." : "Elaboration failed.") };
  } catch (e: any) {
    return { ok: false, log: "In-browser lint failed:\n\n" + (e?.message || String(e)) };
  }
}

export async function simulateWasm(files: SourceFile[], data: SourceFile[] = []): Promise<SimulateResponse> {
  await warmIverilog();
  const id = ++seq;
  const w = getWorker();
  try {
    const { ok, vcd, log, outputs } = await new Promise<{
      ok: boolean;
      vcd: string | null;
      log: string;
      outputs?: { name: string; content: string }[];
    }>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, mode: "sim", files, data });
    });
    return {
      ok,
      stage: ok ? "done" : "compile",
      vcd,
      log: log || (ok ? "Simulation finished (in-browser)." : "Simulation failed."),
      hasWaveform: !!vcd,
      outputs: outputs || [],
    };
  } catch (e: any) {
    return {
      ok: false,
      stage: "simulate",
      vcd: null,
      log: "In-browser simulation failed:\n\n" + (e?.message || String(e)),
      hasWaveform: false,
    };
  }
}

// Kick off the worker + wasm fetch ahead of first use.
export function warmupSim(): void {
  warmIverilog();
  getWorker();
}

// ---- Strict lint via Verilator (separate, larger wasm module) ----
let vlWorker: Worker | null = null;
let vlSeq = 0;
const vlPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function getVlWorker(): Worker {
  if (!vlWorker) {
    vlWorker = new Worker(new URL("../workers/verilatorWorker.ts", import.meta.url), { type: "module" });
    vlWorker.onmessage = (e: MessageEvent) => {
      const { id, ok, log, error } = e.data;
      const p = vlPending.get(id);
      if (!p) return;
      vlPending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve({ ok, log });
    };
    vlWorker.onerror = (e) => {
      const msg = e.message || "In-browser Verilator failed to start";
      for (const [, p] of vlPending) p.reject(new Error(msg));
      vlPending.clear();
    };
  }
  return vlWorker;
}

export async function strictLintWasm(files: SourceFile[], top = ""): Promise<VerifyResponse> {
  await warmVerilator();
  const id = ++vlSeq;
  const w = getVlWorker();
  try {
    const { ok, log } = await new Promise<{ ok: boolean; log: string }>((resolve, reject) => {
      vlPending.set(id, { resolve, reject });
      w.postMessage({ id, files, top });
    });
    return {
      ok,
      log: log || (ok ? "✓ No errors or warnings. Verilator strict lint is clean." : "Strict lint failed."),
    };
  } catch (e: any) {
    return { ok: false, log: "In-browser Verilator lint failed:\n\n" + (e?.message || String(e)) };
  }
}

export function warmupStrictLint(): void {
  warmVerilator();
  getVlWorker();
}
