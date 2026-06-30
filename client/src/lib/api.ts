export interface SimulateResponse {
  ok: boolean;
  stage: string;
  vcd?: string | null;
  log: string;
  hasWaveform?: boolean;
  // Files the testbench wrote at runtime ($fopen/$fwrite/$writememh, …).
  outputs?: { name: string; content: string }[];
}

export interface SynthStats {
  cells: number;
  ffs: number;
  byType: Record<string, number>;
  depth?: number;
  // Liberty-mapped gate-level synthesis only:
  area?: number; // total chip area in liberty area units
  delay?: number; // abc arrival-time estimate (liberty delay units)
}

export interface CellSrc {
  file: string;
  line: number;
}

export interface SynthesizeResponse {
  ok: boolean;
  stage: string;
  netlist?: string;
  svg?: string | null;
  renderError?: string | null;
  stats?: SynthStats | null;
  srcMap?: Record<string, CellSrc> | null;
  log: string;
}

export interface FsmResponse {
  ok: boolean;
  fsm?: import("./fsm").FsmData | null;
  log: string;
}

export interface HealthResponse {
  ok: boolean;
  tools: {
    iverilog: string | null;
    vvp: string | null;
    yosys: string | null;
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export interface VerifyResponse {
  ok: boolean;
  log: string;
}

export interface SourceFile {
  name: string;
  content: string;
}

export type LintLevel = "basic" | "strict";
export type SynthMode = "rtl" | "gate";

export function verify(files: SourceFile[], level: LintLevel = "basic", top = "") {
  return postJson<VerifyResponse>("/api/verify", { files, level, top });
}

export function simulate(files: SourceFile[], data: SourceFile[] = []) {
  return postJson<SimulateResponse>("/api/simulate", { files, data });
}

export function synthesize(files: SourceFile[], top: string, flatten: boolean, mode: SynthMode = "rtl", lib?: string) {
  return postJson<SynthesizeResponse>("/api/synthesize", { files, top, flatten, mode, lib });
}

export function extractFsm(files: SourceFile[], top: string) {
  return postJson<FsmResponse>("/api/fsm", { files, top });
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  return (await res.json()) as HealthResponse;
}
