// Area / timing / power reports derived from a Yosys gate-level netlist plus a
// standard-cell model (the built-in generic library or a user-supplied .lib).
// Everything is a transparent estimate "based on the library we provide":
// area = Σ cell areas, timing = longest delay-weighted path between sequential
// elements / I/O, power = lib leakage + switched-cap dynamic.
import { type CellModel } from "./liberty";

export type CellMap = Map<string, CellModel>;

interface NlCell {
  type: string;
  port_directions?: Record<string, string>;
  connections?: Record<string, Array<number | string>>;
}

const seqRe = /dff|dffe|sdff|adff|dlatch|latch|sr_/i;
const isSeq = (type: string, m?: CellModel): boolean => (m ? !!m.seq : seqRe.test(type || ""));

function pickModule(net: any): any {
  const mods = Object.values<any>(net.modules || {});
  return (
    mods.find((m) => m.attributes && m.attributes.top) ||
    mods
      .filter((m) => m.cells && Object.keys(m.cells).length)
      .sort((a, b) => Object.keys(b.cells).length - Object.keys(a.cells).length)[0] ||
    mods[0]
  );
}

function parseModule(netText: string): { cells: Record<string, NlCell> } | null {
  let net: any;
  try {
    net = JSON.parse(netText);
  } catch {
    return null;
  }
  const mod = pickModule(net);
  if (!mod || !mod.cells || !Object.keys(mod.cells).length) return null;
  return { cells: mod.cells as Record<string, NlCell> };
}

/** True when the netlist is mapped to the active standard-cell library. */
export function isGateLevel(netText: string, cellMap: CellMap): boolean {
  const mod = parseModule(netText);
  if (!mod) return false;
  for (const c of Object.values(mod.cells)) if (cellMap.has(c.type)) return true;
  return false;
}

// ---------------- Area ----------------
export interface AreaRow {
  type: string;
  count: number;
  areaEach: number;
  area: number;
  pct: number;
}
export interface AreaReport {
  total: number;
  rows: AreaRow[];
  cellCount: number;
}

export function areaReport(netText: string, cellMap: CellMap): AreaReport | null {
  const mod = parseModule(netText);
  if (!mod) return null;
  const counts: Record<string, number> = {};
  let cellCount = 0;
  for (const c of Object.values(mod.cells)) {
    counts[c.type] = (counts[c.type] || 0) + 1;
    cellCount++;
  }
  const rows: AreaRow[] = [];
  let total = 0;
  for (const [type, count] of Object.entries(counts)) {
    const m = cellMap.get(type);
    const areaEach = m ? m.area : 0;
    const area = areaEach * count;
    total += area;
    rows.push({ type, count, areaEach, area, pct: 0 });
  }
  for (const r of rows) r.pct = total ? (100 * r.area) / total : 0;
  rows.sort((a, b) => b.area - a.area);
  return { total, rows, cellCount };
}

// ---------------- Timing (critical path) ----------------
export interface TimingStage {
  cell: string;
  type: string;
  stageDelayPs: number;
  arrivalPs: number;
}
export interface TimingReport {
  delayPs: number;
  fmaxMHz: number;
  logicDepth: number;
  startKind: string; // "register" | "input"
  combinational: boolean; // no flip-flops anywhere → F_max is undefined
  path: TimingStage[];
}

export function timingReport(netText: string, cellMap: CellMap): TimingReport | null {
  const mod = parseModule(netText);
  if (!mod) return null;
  const cells = mod.cells;

  // bit (net) -> driving cell name
  const driver: Record<number, string> = {};
  for (const [name, c] of Object.entries(cells)) {
    const dir = c.port_directions || {};
    const conns = c.connections || {};
    for (const [port, bits] of Object.entries(conns)) {
      if (dir[port] === "output") for (const b of bits) if (typeof b === "number") driver[b] = name;
    }
  }

  const arr: Record<string, number> = {};
  const pred: Record<string, string | null> = {};
  const startedAtReg: Record<string, boolean> = {};
  const visiting = new Set<string>();

  const arrival = (name: string): number => {
    if (arr[name] != null) return arr[name];
    if (visiting.has(name)) return 0; // break combinational loops defensively
    visiting.add(name);
    const c = cells[name];
    const m = cellMap.get(c.type);
    if (isSeq(c.type, m)) {
      arr[name] = m?.clkToQPs ?? 80; // launch delay (clock → Q)
      pred[name] = null;
      startedAtReg[name] = true;
      visiting.delete(name);
      return arr[name];
    }
    const dir = c.port_directions || {};
    const conns = c.connections || {};
    let best = 0;
    let bestDrv: string | null = null;
    let bestFromReg = false;
    for (const [port, bits] of Object.entries(conns)) {
      if (dir[port] !== "input") continue;
      for (const b of bits) {
        const drv = typeof b === "number" ? driver[b] : undefined;
        if (drv && drv !== name) {
          const a = arrival(drv);
          if (a > best) {
            best = a;
            bestDrv = drv;
            bestFromReg = !!startedAtReg[drv];
          }
        }
      }
    }
    const d = m ? m.delayPs : 30;
    arr[name] = best + d;
    pred[name] = bestDrv;
    startedAtReg[name] = bestDrv ? bestFromReg : false; // false => path starts at a primary input
    visiting.delete(name);
    return arr[name];
  };

  let endName: string | null = null;
  let endArr = 0;
  for (const name of Object.keys(cells)) {
    const a = arrival(name);
    if (a > endArr) {
      endArr = a;
      endName = name;
    }
  }
  if (!endName) return null;

  const path: TimingStage[] = [];
  let cur: string | null = endName;
  while (cur) {
    const c = cells[cur];
    const m = cellMap.get(c.type);
    const stageDelayPs = isSeq(c.type, m) ? m?.clkToQPs ?? 80 : m ? m.delayPs : 30;
    path.push({ cell: cur, type: c.type, stageDelayPs, arrivalPs: arr[cur] });
    cur = pred[cur];
  }
  path.reverse();

  const logicDepth = path.filter((p) => !isSeq(p.type, cellMap.get(p.type))).length;
  // F_max only makes sense when there are flip-flops to clock; a purely
  // combinational design has no clock, so we report propagation delay instead.
  const combinational = !Object.values(cells).some((c) => isSeq(c.type, cellMap.get(c.type)));
  const fmaxMHz = !combinational && endArr > 0 ? 1e6 / endArr : 0;
  return {
    delayPs: Math.round(endArr),
    fmaxMHz,
    logicDepth,
    startKind: startedAtReg[endName] ? "register" : "input",
    combinational,
    path,
  };
}

// ---------------- Power ----------------
export interface PowerReport {
  leakageUW: number;
  dynamicUW: number;
  totalUW: number;
  freqMHz: number;
  activity: number;
  vdd: number;
  totalCapFf: number;
  combinational: boolean; // no flip-flops → f is a data/switching rate, not a clock
}

export function powerReport(
  netText: string,
  cellMap: CellMap,
  freqMHz: number,
  activity: number,
  vdd: number
): PowerReport | null {
  const mod = parseModule(netText);
  if (!mod) return null;
  const cells = mod.cells;

  let leakNw = 0;
  let anySeq = false;
  // Accumulate load capacitance per net from the input pins it drives.
  const capByNet: Record<number, number> = {};
  for (const c of Object.values(cells)) {
    const m = cellMap.get(c.type);
    leakNw += m ? m.leakNw : 0;
    if (isSeq(c.type, m)) anySeq = true;
    const dir = c.port_directions || {};
    const conns = c.connections || {};
    const inCap = m ? m.inCapFf : 1.0;
    for (const [port, bits] of Object.entries(conns)) {
      if (dir[port] !== "input") continue;
      for (const b of bits) if (typeof b === "number") capByNet[b] = (capByNet[b] || 0) + inCap;
    }
  }
  let totalCapFf = 0;
  for (const b in capByNet) totalCapFf += capByNet[b];

  const f = Math.max(0, freqMHz) * 1e6; // Hz
  const C = totalCapFf * 1e-15; // fF -> F
  const dynW = 0.5 * activity * f * vdd * vdd * C;
  const dynamicUW = dynW * 1e6;
  const leakageUW = leakNw / 1000;
  return {
    leakageUW,
    dynamicUW,
    totalUW: leakageUW + dynamicUW,
    freqMHz,
    activity,
    vdd,
    totalCapFf,
    combinational: !anySeq,
  };
}
