// A compact generic standard-cell library for in-browser gate-level mapping.
// Based on the canonical Yosys `cmos_cells.lib` tutorial library (proven to
// work with `dfflibmap -liberty` + `abc -liberty`), extended with a few common
// combinational primitives so the mapped netlist reads more naturally.
//
// Areas are illustrative (relative), which is all that's needed for the rough
// gate/FF-count and area report. abc uses unit delays in the absence of timing
// tables and still emits a "Delay = N" arrival-time estimate.

export const CELLS_LIB = `library(synthwave) {
  cell(BUF) {
    area: 6;
    pin(A) { direction: input; }
    pin(Y) { direction: output; function: "A"; }
  }
  cell(NOT) {
    area: 3;
    pin(A) { direction: input; }
    pin(Y) { direction: output; function: "A'"; }
  }
  cell(NAND) {
    area: 4;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A*B)'"; }
  }
  cell(NOR) {
    area: 4;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A+B)'"; }
  }
  cell(AND) {
    area: 6;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A*B)"; }
  }
  cell(OR) {
    area: 6;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A+B)"; }
  }
  cell(XOR) {
    area: 8;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A^B)"; }
  }
  cell(XNOR) {
    area: 8;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(Y) { direction: output; function: "(A^B)'"; }
  }
  cell(MUX) {
    area: 10;
    pin(A) { direction: input; }
    pin(B) { direction: input; }
    pin(S) { direction: input; }
    pin(Y) { direction: output; function: "(A*S') + (B*S)"; }
  }
  cell(DFF) {
    area: 18;
    ff(IQ, IQN) { clocked_on: C; next_state: D; }
    pin(C) { direction: input; clock: true; }
    pin(D) { direction: input; }
    pin(Q) { direction: output; function: "IQ"; }
  }
  cell(DFFSR) {
    area: 20;
    ff(IQ, IQN) { clocked_on: C; next_state: D; preset: "S"; clear: "R"; }
    pin(C) { direction: input; clock: true; }
    pin(D) { direction: input; }
    pin(Q) { direction: output; function: "IQ"; }
    pin(S) { direction: input; }
    pin(R) { direction: input; }
  }
}
`;

// A compact SkyWater sky130 (high-density, typical-typical 1.80 V) flavoured
// library used for *gate-level synthesis*. Cell names match the real
// sky130_fd_sc_hd PDK and the areas/leakage/pin-caps approximate it, so the
// mapped netlist and reports read authentically. Timing tables are intentionally
// omitted: the Yosys-bundled ABC liberty reader rejects partial NLDM tables, so
// (exactly like the generic library) abc maps with unit delays here, and the
// real ~tt delays live in SKY130_CELLS below, which drives the timing report.
// Not the full sign-off library.
export const SKY130_SYNTH_LIB = `library(sky130_fd_sc_hd__tt_025C_1v80_compact) {
  time_unit : "1ns";
  voltage_unit : "1V";
  leakage_power_unit : "1nW";
  capacitive_load_unit (1, pf);
  nom_voltage : 1.80;
  cell(sky130_fd_sc_hd__buf_1) { area : 4.99; cell_leakage_power : 0.020;
    pin(A) { direction: input; capacitance: 0.0015; }
    pin(X) { direction: output; function: "A"; } }
  cell(sky130_fd_sc_hd__inv_1) { area : 3.75; cell_leakage_power : 0.014;
    pin(A) { direction: input; capacitance: 0.0015; }
    pin(Y) { direction: output; function: "A'"; } }
  cell(sky130_fd_sc_hd__nand2_1) { area : 3.75; cell_leakage_power : 0.021;
    pin(A) { direction: input; capacitance: 0.0020; }
    pin(B) { direction: input; capacitance: 0.0020; }
    pin(Y) { direction: output; function: "(A*B)'"; } }
  cell(sky130_fd_sc_hd__nor2_1) { area : 3.75; cell_leakage_power : 0.024;
    pin(A) { direction: input; capacitance: 0.0020; }
    pin(B) { direction: input; capacitance: 0.0020; }
    pin(Y) { direction: output; function: "(A+B)'"; } }
  cell(sky130_fd_sc_hd__and2_1) { area : 5.00; cell_leakage_power : 0.030;
    pin(A) { direction: input; capacitance: 0.0018; }
    pin(B) { direction: input; capacitance: 0.0018; }
    pin(X) { direction: output; function: "(A*B)"; } }
  cell(sky130_fd_sc_hd__or2_1) { area : 5.00; cell_leakage_power : 0.032;
    pin(A) { direction: input; capacitance: 0.0018; }
    pin(B) { direction: input; capacitance: 0.0018; }
    pin(X) { direction: output; function: "(A+B)"; } }
  cell(sky130_fd_sc_hd__xor2_1) { area : 8.76; cell_leakage_power : 0.052;
    pin(A) { direction: input; capacitance: 0.0025; }
    pin(B) { direction: input; capacitance: 0.0025; }
    pin(X) { direction: output; function: "(A^B)"; } }
  cell(sky130_fd_sc_hd__xnor2_1) { area : 8.76; cell_leakage_power : 0.052;
    pin(A) { direction: input; capacitance: 0.0025; }
    pin(B) { direction: input; capacitance: 0.0025; }
    pin(Y) { direction: output; function: "(A^B)'"; } }
  cell(sky130_fd_sc_hd__mux2_1) { area : 8.76; cell_leakage_power : 0.060;
    pin(A) { direction: input; capacitance: 0.0020; }
    pin(B) { direction: input; capacitance: 0.0020; }
    pin(S) { direction: input; capacitance: 0.0020; }
    pin(X) { direction: output; function: "(A*S') + (B*S)"; } }
  cell(sky130_fd_sc_hd__dfxtp_1) { area : 20.02; cell_leakage_power : 0.120;
    ff(IQ, IQN) { clocked_on: CLK; next_state: D; }
    pin(CLK) { direction: input; clock: true; capacitance: 0.0040; }
    pin(D) { direction: input; capacitance: 0.0020; }
    pin(Q) { direction: output; function: "IQ"; } }
  cell(sky130_fd_sc_hd__dfrtp_1) { area : 22.52; cell_leakage_power : 0.140;
    ff(IQ, IQN) { clocked_on: CLK; next_state: D; clear: "RESET_B'"; }
    pin(CLK) { direction: input; clock: true; capacitance: 0.0040; }
    pin(D) { direction: input; capacitance: 0.0020; }
    pin(RESET_B) { direction: input; capacitance: 0.0020; }
    pin(Q) { direction: output; function: "IQ"; } }
}
`;

// ---------------------------------------------------------------------------
// Structured characterization of the same cells, used for the client-side
// area / timing / power reports. Values are illustrative (a generic ~sub-micron
// standard-cell flavour), not a real PDK — they give explainable, relative
// numbers derived consistently from "the library we provide".
//   area    — same units as the Liberty `area:` above
//   delayPs — intrinsic propagation delay of a combinational cell (ps)
//   clkToQPs— clock→Q delay of a sequential cell (ps)
//   inCapFf — input pin load capacitance presented to a driver (fF)
//   leakNw  — static leakage power (nW)
// ---------------------------------------------------------------------------
export const VDD_V = 1.0; // supply voltage assumed for dynamic-power estimate

export interface CellModel {
  name: string;
  area: number;
  delayPs: number;
  clkToQPs?: number;
  inCapFf: number;
  leakNw: number;
  seq?: boolean;
}

export const CELLS: CellModel[] = [
  { name: "BUF", area: 6, delayPs: 30, inCapFf: 1.0, leakNw: 1.5 },
  { name: "NOT", area: 3, delayPs: 18, inCapFf: 0.9, leakNw: 1.0 },
  { name: "NAND", area: 4, delayPs: 24, inCapFf: 1.1, leakNw: 1.6 },
  { name: "NOR", area: 4, delayPs: 26, inCapFf: 1.1, leakNw: 1.7 },
  { name: "AND", area: 6, delayPs: 38, inCapFf: 1.1, leakNw: 2.2 },
  { name: "OR", area: 6, delayPs: 40, inCapFf: 1.1, leakNw: 2.3 },
  { name: "XOR", area: 8, delayPs: 58, inCapFf: 1.4, leakNw: 3.5 },
  { name: "XNOR", area: 8, delayPs: 60, inCapFf: 1.4, leakNw: 3.6 },
  { name: "MUX", area: 10, delayPs: 52, inCapFf: 1.3, leakNw: 4.0 },
  { name: "DFF", area: 18, delayPs: 0, clkToQPs: 80, inCapFf: 1.6, leakNw: 8.0, seq: true },
  { name: "DFFSR", area: 20, delayPs: 0, clkToQPs: 85, inCapFf: 1.7, leakNw: 9.5, seq: true },
];

export const CELL_BY_NAME: Map<string, CellModel> = new Map(CELLS.map((c) => [c.name, c]));

// Curated report model for the compact sky130 HD library. Names match
// SKY130_SYNTH_LIB so isGateLevel()/areaReport() recognise the mapped cells.
// Values approximate the sky130_fd_sc_hd tt_025C_1v80 corner:
//   area in µm², delay/clk-to-Q in ps, input cap in fF, leakage in nW.
export const SKY130_VDD_V = 1.8;

export const SKY130_CELLS: CellModel[] = [
  { name: "sky130_fd_sc_hd__buf_1", area: 4.99, delayPs: 120, inCapFf: 1.5, leakNw: 0.02 },
  { name: "sky130_fd_sc_hd__inv_1", area: 3.75, delayPs: 40, inCapFf: 1.5, leakNw: 0.014 },
  { name: "sky130_fd_sc_hd__nand2_1", area: 3.75, delayPs: 50, inCapFf: 2.0, leakNw: 0.021 },
  { name: "sky130_fd_sc_hd__nor2_1", area: 3.75, delayPs: 60, inCapFf: 2.0, leakNw: 0.024 },
  { name: "sky130_fd_sc_hd__and2_1", area: 5.0, delayPs: 100, inCapFf: 1.8, leakNw: 0.03 },
  { name: "sky130_fd_sc_hd__or2_1", area: 5.0, delayPs: 110, inCapFf: 1.8, leakNw: 0.032 },
  { name: "sky130_fd_sc_hd__xor2_1", area: 8.76, delayPs: 140, inCapFf: 2.5, leakNw: 0.052 },
  { name: "sky130_fd_sc_hd__xnor2_1", area: 8.76, delayPs: 140, inCapFf: 2.5, leakNw: 0.052 },
  { name: "sky130_fd_sc_hd__mux2_1", area: 8.76, delayPs: 130, inCapFf: 2.0, leakNw: 0.06 },
  { name: "sky130_fd_sc_hd__dfxtp_1", area: 20.02, delayPs: 0, clkToQPs: 300, inCapFf: 2.0, leakNw: 0.12, seq: true },
  { name: "sky130_fd_sc_hd__dfrtp_1", area: 22.52, delayPs: 0, clkToQPs: 320, inCapFf: 2.0, leakNw: 0.14, seq: true },
];

export const SKY130_BY_NAME: Map<string, CellModel> = new Map(SKY130_CELLS.map((c) => [c.name, c]));

// ---------------------------------------------------------------------------
// Built-in standard-cell libraries selectable in the UI. Each bundles the
// Liberty text used for gate-level synthesis (abc-safe) with the curated report
// model + supply voltage that drives the area/timing/power reports.
// ---------------------------------------------------------------------------
export interface StdLib {
  id: string;
  label: string;
  synthLib: string;
  cells: CellModel[];
  vdd: number;
}

export const GENERIC_STDLIB: StdLib = {
  id: "generic",
  label: "Generic (built-in)",
  synthLib: CELLS_LIB,
  cells: CELLS,
  vdd: VDD_V,
};

export const SKY130_STDLIB: StdLib = {
  id: "sky130",
  label: "SkyWater sky130 HD · tt (compact)",
  synthLib: SKY130_SYNTH_LIB,
  cells: SKY130_CELLS,
  vdd: SKY130_VDD_V,
};

export const BUILTIN_STDLIBS: StdLib[] = [GENERIC_STDLIB, SKY130_STDLIB];

export function builtinStdLib(id: string): StdLib | undefined {
  return BUILTIN_STDLIBS.find((l) => l.id === id);
}
