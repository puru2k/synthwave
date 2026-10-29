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
