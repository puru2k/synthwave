// Tolerant subset parser for Liberty (.lib) files, so users can drop in a real
// standard-cell library and have the area / timing / power reports reflect it.
// We extract per-cell area, leakage, input-pin capacitance and a worst-case
// delay (from the timing arcs), normalizing to our model units: ps / fF / nW.
import type { CellModel } from "./liberty";

export interface ParsedLib {
  ok: boolean;
  name: string;
  cells: CellModel[];
  vdd: number;
}

const num = (m: RegExpMatchArray | null): number => (m ? parseFloat(m[1]) : 0);

// Pull out `key (args) { body }` blocks with correct brace matching.
function blocks(src: string, kw: string): Array<{ args: string; body: string }> {
  const out: Array<{ args: string; body: string }> = [];
  const re = new RegExp(kw + "\\s*\\(([^)]*)\\)\\s*\\{", "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    out.push({ args: (m[1] || "").trim(), body: src.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

// unit string (e.g. "ns", "pf", "nw") -> factor into ps / fF / nW.
function timeToPs(u: string): number {
  return { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6 }[u.toLowerCase()] ?? 1e3;
}
function capToFf(u: string): number {
  return { ff: 1, pf: 1e3, nf: 1e6 }[u.toLowerCase()] ?? 1;
}
function powToNw(u: string): number {
  return { fw: 1e-6, pw: 1e-3, nw: 1, uw: 1e3, mw: 1e6, w: 1e9 }[u.toLowerCase()] ?? 1;
}

export function parseLiberty(text: string): ParsedLib {
  try {
    const src = text.replace(/\/\*[\s\S]*?\*\//g, " ");

    const tu = src.match(/time_unit\s*:\s*"?\s*([\d.]*)\s*([a-zA-Z]+)"?/);
    const timeFactor = (tu ? parseFloat(tu[1] || "1") || 1 : 1) * timeToPs(tu ? tu[2] : "ns");
    const cu = src.match(/capacitive_load_unit\s*\(\s*([\d.]*)\s*,\s*([a-zA-Z]+)\s*\)/);
    const capFactor = (cu ? parseFloat(cu[1] || "1") || 1 : 1) * capToFf(cu ? cu[2] : "ff");
    const lu = src.match(/leakage_power_unit\s*:\s*"?\s*([\d.]*)\s*([a-zA-Z]+)"?/);
    const leakFactor = (lu ? parseFloat(lu[1] || "1") || 1 : 1) * powToNw(lu ? lu[2] : "nw");

    const vddM = src.match(/(?:nom_voltage|voltage)\s*:\s*([\d.]+)/);
    const vdd = vddM ? parseFloat(vddM[1]) : 1.0;

    const libName = (src.match(/library\s*\(([^)]*)\)/)?.[1] || "custom").trim();

    const cells: CellModel[] = [];
    for (const cell of blocks(src, "cell")) {
      const name = cell.args.replace(/["']/g, "").trim();
      if (!name) continue;
      const body = cell.body;
      const area = num(body.match(/\barea\s*:\s*([\d.]+)/));
      const leak = num(body.match(/cell_leakage_power\s*:\s*([\d.]+)/)) * leakFactor;
      const seq = /\b(?:ff|latch)\s*\(/.test(body);

      // Input-pin capacitance (averaged) from this cell's pins.
      let capSum = 0;
      let capN = 0;
      for (const pin of blocks(body, "pin")) {
        if (!/direction\s*:\s*input/.test(pin.body)) continue;
        const c = num(pin.body.match(/capacitance\s*:\s*([\d.]+)/));
        if (c > 0) {
          capSum += c;
          capN++;
        }
      }
      const inCapFf = capN ? (capSum / capN) * capFactor : 1.0;

      // Worst-case delay across all timing arcs (scalar or NLDM table values).
      let maxDelay = 0;
      for (const t of blocks(body, "timing")) {
        for (const mm of t.body.matchAll(/(?:cell_rise|cell_fall|intrinsic_rise|intrinsic_fall|rise_propagation|fall_propagation)\s*:\s*([\d.]+)/g)) {
          maxDelay = Math.max(maxDelay, parseFloat(mm[1]));
        }
        for (const tbl of blocks(t.body, "cell_rise").concat(blocks(t.body, "cell_fall"))) {
          for (const vals of tbl.body.matchAll(/values\s*\(([\s\S]*?)\)/g)) {
            for (const n of vals[1].matchAll(/[\d.]+/g)) maxDelay = Math.max(maxDelay, parseFloat(n[0]));
          }
        }
      }
      const delayPs = maxDelay * timeFactor;

      cells.push({
        name,
        area: area || 0,
        delayPs: seq ? 0 : delayPs || 50,
        clkToQPs: seq ? delayPs || 100 : undefined,
        inCapFf,
        leakNw: leak || 0,
        seq,
      });
    }

    return { ok: cells.length > 0, name: libName, cells, vdd };
  } catch {
    return { ok: false, name: "custom", cells: [], vdd: 1.0 };
  }
}
