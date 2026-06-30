// Native (desktop) engine: bridges the UI to the Tauri Rust commands that run
// the real iverilog/vvp/yosys/verilator binaries. Only active when the app is
// running inside the Tauri shell; in a plain browser isTauri() is false and the
// web app keeps using the server or in-browser WASM engines.
//
// Synthesis post-processing (schematic render + stats) and FSM extraction are
// shared with the WASM path — the Rust side only runs the tools and returns raw
// text, the TypeScript side parses/renders exactly as it already does.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  HealthResponse,
  SimulateResponse,
  SourceFile,
  SynthesizeResponse,
  SynthMode,
  LintLevel,
  VerifyResponse,
  FsmResponse,
} from "./api";
import { finishSynthesis, extractFsmWasm } from "./clientSynth";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Match the native window chrome + vibrancy material to the active theme, so a
// light SynthWave theme gets a light frosted titlebar/sidebar instead of a dark
// macOS material bleeding through. No-op outside the desktop app.
export function setNativeAppearance(mode: "light" | "dark"): void {
  if (!isTauri()) return;
  getCurrentWindow()
    .setTheme(mode)
    .catch(() => {
      /* setTheme unsupported on this platform/version — ignore */
    });
}

export function nativeHealth(): Promise<HealthResponse> {
  return invoke<HealthResponse>("check_tools");
}

export function nativeSimulate(files: SourceFile[], data: SourceFile[] = []): Promise<SimulateResponse> {
  return invoke<SimulateResponse>("simulate", { files, data });
}

export function nativeVerify(files: SourceFile[], level: LintLevel, top: string): Promise<VerifyResponse> {
  return invoke<VerifyResponse>("lint", { files, level, top });
}

export async function nativeSynthesize(
  files: SourceFile[],
  top: string,
  flatten: boolean,
  mode: SynthMode,
  lib?: string
): Promise<SynthesizeResponse> {
  const res = await invoke<{ ok: boolean; stage: string; netlist?: string | null; log: string }>("synthesize", {
    files,
    top,
    flatten,
    mode,
    lib,
  });
  if (!res.ok || !res.netlist) {
    return { ok: false, stage: res.stage || "synthesize", log: res.log };
  }
  return finishSynthesis(res.netlist, res.log, mode);
}

// No dedicated native FSM command — reuse the locally-bundled Yosys WASM
// extractor (App still prefers the source-level extractor before this runs).
export function nativeExtractFsm(files: SourceFile[], top: string): Promise<FsmResponse> {
  return extractFsmWasm(files, top);
}
