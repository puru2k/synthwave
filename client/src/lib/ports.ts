// Tolerant Verilog/SystemVerilog module + port extractor used by the testbench
// generator, the interactive-stimulus dialog and the hierarchy view. It handles
// both ANSI headers (`module m(input [3:0] a, output b)`) and classic style
// (`module m(a, b); input [3:0] a; output b;`). It is regex/heuristic based, not
// a full parser, but is robust for typical RTL.

export type Dir = "input" | "output" | "inout";

export interface ModulePort {
  name: string;
  dir: Dir;
  rangeText?: string; // e.g. "[7:0]" or "[WIDTH-1:0]" (verbatim, params allowed)
  resolvedRange?: string; // numeric form e.g. "[3:0]" once params are resolved
  width: number | null; // resolved bit width when the range is numeric, else null
  isClock: boolean;
  isReset: boolean;
  activeLow: boolean; // for resets: asserted low (rst_n / resetn / nreset)
}

export interface ParsedModule {
  name: string;
  ports: ModulePort[];
}

const PORT_KW = new Set([
  "input",
  "output",
  "inout",
  "wire",
  "reg",
  "logic",
  "signed",
  "unsigned",
  "bit",
  "byte",
  "integer",
]);

const IDENT = /[A-Za-z_]\w*/g;

export type ParamMap = Record<string, number>;

// Evaluate a small integer expression (numbers, + - * / % << >> ( ), and
// known parameter identifiers). Returns null if anything is unresolved.
function evalIntExpr(expr: string, params: ParamMap): number | null {
  let s = expr.trim();
  // Strip Verilog sized constants like 4'd8 / 8'hFF -> their decimal value.
  s = s.replace(/\b\d*'[sS]?([bodh])([0-9a-fA-F_]+)/g, (_m, base, digits) => {
    const d = digits.replace(/_/g, "");
    const radix = base === "b" ? 2 : base === "o" ? 8 : base === "h" ? 16 : 10;
    const v = parseInt(d, radix);
    return Number.isNaN(v) ? "NaN" : String(v);
  });
  // Substitute identifiers with known params.
  let unresolved = false;
  s = s.replace(/[A-Za-z_]\w*/g, (id) => {
    if (id in params) return String(params[id]);
    unresolved = true;
    return id;
  });
  if (unresolved || !/^[\d+\-*/%<>() .]+$/.test(s)) return null;
  try {
     
    const v = Function(`"use strict";return (${s});`)();
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  } catch {
    return null;
  }
}

// Collect parameter / localparam defaults from a module block, evaluated in
// declaration order so later params may reference earlier ones.
function parseParams(block: string): ParamMap {
  const params: ParamMap = {};
  const re = /\b(?:parameter|localparam)\b\s*(?:integer\s+|signed\s+)?(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*)\s*=\s*([^,;)\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = evalIntExpr(m[2], params);
    if (v != null) params[m[1]] = v;
  }
  return params;
}

// Resolve a range to a numeric form ("[3:0]") and bit width, using params.
function resolveRange(range: string | undefined, params: ParamMap): { width: number | null; resolved?: string } {
  if (!range) return { width: 1 };
  const m = range.match(/\[\s*([^:\]]+)\s*:\s*([^:\]]+)\s*\]/);
  if (!m) return { width: null };
  const a = evalIntExpr(m[1], params);
  const b = evalIntExpr(m[2], params);
  if (a == null || b == null) return { width: null };
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return { width: hi - lo + 1, resolved: `[${hi}:${lo}]` };
}

function classifyClock(name: string): boolean {
  return /^(clk|clock|clki|clk_i|sysclk|mclk|pclk|hclk|aclk|gclk)\b/i.test(name) || /clk|clock/i.test(name);
}

function classifyReset(name: string): { isReset: boolean; activeLow: boolean } {
  const isReset = /(reset|rst|^clr$|clear)/i.test(name);
  if (!isReset) return { isReset: false, activeLow: false };
  const activeLow = /(_n$|n$|_b$|resetn|rst_n|nrst|nreset|arstn|rstn)/i.test(name) || /^n(rst|reset)/i.test(name);
  return { isReset: true, activeLow };
}

function enrich(p: { name: string; dir: Dir; rangeText?: string }, params: ParamMap): ModulePort {
  const { isReset, activeLow } = classifyReset(p.name);
  // A signal that's both "clk"-ish and "reset"-ish shouldn't happen; reset wins
  // only when it isn't clearly a clock.
  const isClock = classifyClock(p.name) && !isReset;
  const { width, resolved } = resolveRange(p.rangeText, params);
  return {
    name: p.name,
    dir: p.dir,
    rangeText: p.rangeText,
    resolvedRange: resolved,
    width,
    isClock,
    isReset: isReset && !isClock,
    activeLow,
  };
}

// Split a header port list on commas that are not nested inside [] or ().
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function lastIdentifier(seg: string): string | undefined {
  const ids = seg.match(IDENT) || [];
  return [...ids].reverse().find((t) => !PORT_KW.has(t) && !/^\d/.test(t));
}

// Find the matching ')' for the '(' at `open`, or -1.
function matchParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Extract the balanced (...) port-list group starting at/after `from`, skipping
// a leading `#( ... )` parameter list if present.
function headerParen(text: string, from: number): { inner: string; end: number } | null {
  let i = from;
  // Skip whitespace/comments lightly.
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] === "#") {
    const pOpen = text.indexOf("(", i);
    if (pOpen >= 0) {
      const pClose = matchParen(text, pOpen);
      if (pClose >= 0) i = pClose + 1;
    }
  }
  const start = text.indexOf("(", i);
  if (start < 0) return null;
  const end = matchParen(text, start);
  if (end < 0) return null;
  return { inner: text.slice(start + 1, end), end };
}

export function parseModules(files: Array<{ name: string; content: string }>): ParsedModule[] {
  const mods: ParsedModule[] = [];
  for (const f of files) {
    const text = f.content;
    const re = /\bmodule\s+([A-Za-z_]\w*)/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text)) !== null) {
      const name = mm[1];
      const endIdx = text.indexOf("endmodule", mm.index);
      const block = endIdx > mm.index ? text.slice(mm.index, endIdx) : text.slice(mm.index);

      const paren = headerParen(block, mm[0].length);
      const orderedNames: string[] = [];
      const byName = new Map<string, { name: string; dir?: Dir; rangeText?: string }>();

      if (paren) {
        let lastDir: Dir | undefined;
        let lastRange: string | undefined;
        let sawDir = false;
        for (const rawSeg of splitTopLevel(paren.inner)) {
          const seg = rawSeg.replace(/\/\/.*$/gm, "").trim();
          if (!seg) continue;
          const dirM = seg.match(/\b(input|output|inout)\b/);
          const rangeM = seg.match(/\[[^\]]*\]/);
          const nm = lastIdentifier(seg);
          if (!nm) continue;
          if (dirM) {
            sawDir = true;
            lastDir = dirM[1] as Dir;
            lastRange = rangeM?.[0]; // a new dir resets the carried range
          } else if (rangeM) {
            lastRange = rangeM[0];
          }
          orderedNames.push(nm);
          byName.set(nm, { name: nm, dir: dirM ? (dirM[1] as Dir) : lastDir, rangeText: rangeM?.[0] ?? lastRange });
        }
        // Classic style: fill directions/ranges from body declarations.
        if (!sawDir) {
          const body = block.slice(paren.end + 1);
          const declRe = /\b(input|output|inout)\b\s*(?:wire|reg|logic|signed|unsigned)?\s*(\[[^\]]*\])?\s*([^;]+);/g;
          let dm: RegExpExecArray | null;
          while ((dm = declRe.exec(body)) !== null) {
            const dir = dm[1] as Dir;
            const range = dm[2];
            for (const seg of splitTopLevel(dm[3])) {
              const id = (seg.trim().match(/^([A-Za-z_]\w*)/) || [])[1];
              if (id && byName.has(id)) byName.set(id, { name: id, dir, rangeText: range });
            }
          }
        }
      }

      const params = parseParams(block);
      const ports: ModulePort[] = [];
      for (const nm of orderedNames) {
        const p = byName.get(nm);
        if (!p || !p.dir) continue; // skip ports we couldn't resolve a direction for
        ports.push(enrich({ name: p.name, dir: p.dir, rangeText: p.rangeText }, params));
      }
      mods.push({ name, ports });
    }
  }
  return mods;
}

export function findModule(mods: ParsedModule[], name: string): ParsedModule | undefined {
  return mods.find((m) => m.name === name);
}
