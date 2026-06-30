import type { SynthStats, CellSrc } from "./api";
import type { FsmData } from "./fsm";

// --- mirror of the server's stat parser (yosys `stat` output) ---
export function parseStat(log: string): SynthStats {
  let stats: SynthStats = { cells: 0, ffs: 0, byType: {} };
  for (const line of log.split("\n")) {
    if (/Printing statistics/i.test(line)) {
      stats = { cells: 0, ffs: 0, byType: {} };
      continue;
    }
    // Plain `stat` prints "<count> cells"; `stat -liberty` adds an area column
    // ("<count> <area> cells"), hence the optional second number throughout.
    let m = line.match(/^\s*(\d+)(?:\s+\d+)?\s+cells\s*$/);
    if (m) {
      stats.cells += parseInt(m[1], 10);
      continue;
    }
    // Per-type counts: Yosys internal cells ($_AND_, $dff, ...) and, for
    // liberty-mapped gate-level synthesis, plain cell names (NAND, DFF, ...).
    m = line.match(/^\s*(\d+)(?:\s+\d+)?\s+(\$[\w$]+|[A-Za-z][\w$]*)\s*$/);
    if (m) {
      const name = m[2];
      // Skip the stat summary rows ("N wires", "N ports", ...).
      if (/^(wires?|ports?|processes|memories|bits|public)$/i.test(name)) continue;
      const count = parseInt(m[1], 10);
      stats.byType[name] = (stats.byType[name] || 0) + count;
      if (/dff|dlatch|latch|sr_|_ff/i.test(name)) stats.ffs += count;
    }
  }
  return stats;
}

export function buildSrcMap(netlistJsonText: string): Record<string, CellSrc> {
  const map: Record<string, CellSrc> = {};
  try {
    const net = JSON.parse(netlistJsonText);
    for (const mod of Object.values<any>(net.modules || {})) {
      for (const [cellName, cell] of Object.entries<any>(mod.cells || {})) {
        const src = cell.attributes && cell.attributes.src;
        if (!src) continue;
        const first = String(src).split("|")[0];
        const m = first.match(/([^:|]+):(\d+)/);
        if (m) map[cellName] = { file: m[1].split("/").pop() || m[1], line: parseInt(m[2], 10) };
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

export function criticalDepth(netlistJsonText: string): number {
  try {
    const net = JSON.parse(netlistJsonText);
    const mods = Object.values<any>(net.modules || {});
    // Prefer the synthesized top; skip liberty blackbox modules (no cells).
    const mod =
      mods.find((m) => m.attributes && m.attributes.top) ||
      mods.filter((m) => m.cells && Object.keys(m.cells).length).sort(
        (a, b) => Object.keys(b.cells).length - Object.keys(a.cells).length
      )[0] ||
      mods[0];
    if (!mod || !mod.cells) return 0;
    const cells = mod.cells as Record<string, any>;
    const isSeq = (t: string) => /dff|dffe|sdff|adff|dlatch|latch|sr_/i.test(t || "");

    const driver: Record<number, string> = {};
    for (const [name, c] of Object.entries(cells)) {
      const dir = c.port_directions || {};
      const conns = c.connections || {};
      for (const [port, bits] of Object.entries<any>(conns)) {
        if (dir[port] === "output") for (const b of bits) if (typeof b === "number") driver[b] = name;
      }
    }

    const memo: Record<string, number> = {};
    const visiting = new Set<string>();
    const depth = (name: string): number => {
      if (memo[name] != null) return memo[name];
      if (visiting.has(name)) return 0;
      visiting.add(name);
      const c = cells[name];
      if (isSeq(c.type)) {
        memo[name] = 0;
        visiting.delete(name);
        return 0;
      }
      const dir = c.port_directions || {};
      const conns = c.connections || {};
      let best = 0;
      for (const [port, bits] of Object.entries<any>(conns)) {
        if (dir[port] !== "input") continue;
        for (const b of bits) {
          const drv = typeof b === "number" ? driver[b] : undefined;
          if (drv && drv !== name) best = Math.max(best, depth(drv));
        }
      }
      memo[name] = best + 1;
      visiting.delete(name);
      return memo[name];
    };

    let max = 0;
    for (const name of Object.keys(cells)) max = Math.max(max, depth(name));
    return max;
  } catch {
    return 0;
  }
}

export function parseKiss2(text: string): FsmData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fsm: FsmData = { inputs: 0, outputs: 0, numStates: 0, reset: "", states: [], transitions: [] };
  const stateSet = new Set<string>();
  for (const line of lines) {
    if (line.startsWith(".i")) fsm.inputs = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".o")) fsm.outputs = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".s")) fsm.numStates = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".r")) fsm.reset = line.slice(2).trim();
    else if (line.startsWith(".p")) {
      /* ignore */
    } else if (line.startsWith(".e")) break;
    else if (!line.startsWith(".")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const [inPat, from, to, outPat = ""] = parts;
        fsm.transitions.push({ in: inPat, from, to, out: outPat });
        stateSet.add(from);
        stateSet.add(to);
      }
    }
  }
  if (fsm.reset) stateSet.add(fsm.reset);
  fsm.states = [...stateSet].sort((a, b) => parseInt(a, 2) - parseInt(b, 2));
  return fsm;
}
