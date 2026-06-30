export interface FsmTransition {
  in: string; // input pattern, e.g. "1-"
  from: string; // current state name (binary string from -origenc)
  to: string; // next state name
  out: string; // output pattern
  cond?: string; // human-readable input condition (source-extracted FSMs)
  edgeOut?: string; // Mealy: output asserted on this transition (source-extracted)
}

export interface FsmData {
  inputs: number;
  outputs: number;
  numStates: number;
  reset: string;
  states: string[];
  transitions: FsmTransition[];
  // Populated only when the FSM is extracted directly from the RTL, which lets
  // us preserve the textbook Moore/Mealy distinction that Yosys discards.
  kind?: "moore" | "mealy";
  stateOutputs?: Record<string, string>; // Moore: per-state output label (output is f(state))
  fromSource?: boolean;
}

function parseVerilogNum(s: string): number | null {
  const v = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = v.match(/'s?d\s*(\d+)/i))) return parseInt(m[1], 10);
  if ((m = v.match(/'s?b\s*([01_]+)/i))) return parseInt(m[1].replace(/_/g, ""), 2);
  if ((m = v.match(/'s?h\s*([0-9a-f_]+)/i))) return parseInt(m[1].replace(/_/g, ""), 16);
  if ((m = v.match(/^(\d+)$/))) return parseInt(m[1], 10);
  return null;
}

// Map a state's numeric value -> the localparam/parameter name in the RTL,
// so the diagram can show "S2" instead of "010".
export function stateLabelMap(source: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /\b(?:localparam|parameter)\b(?:\s*\[[^\]]*\])?\s*([\s\S]*?);/g;
  let block: RegExpExecArray | null;
  while ((block = re.exec(source)) !== null) {
    for (const part of block[1].split(",")) {
      const m = part.match(/([A-Za-z_]\w*)\s*=\s*(.+)/);
      if (!m) continue;
      const val = parseVerilogNum(m[2]);
      if (val != null && map[val] === undefined) map[val] = m[1];
    }
  }
  return map;
}

export function stateLabel(name: string, labels: Record<number, string>): string {
  const dec = parseInt(name, 2);
  if (!Number.isNaN(dec) && labels[dec]) return labels[dec];
  return name;
}

// Clean an input pattern for display: drop don't-care bits, "*" if all care-free.
export function inputLabel(pat: string): string {
  const kept = pat.replace(/-/g, "");
  return kept.length ? kept : "*";
}
