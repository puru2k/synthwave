// Lightweight, regex-based Verilog/SystemVerilog symbol index used to power
// editor completion, go-to-definition and hover. It is intentionally tolerant
// rather than a full parser.

export interface PortDecl {
  name: string;
  dir?: "input" | "output" | "inout";
  range?: string;
}

export interface ModuleDef {
  name: string;
  file: string;
  line: number;
  ports: PortDecl[];
}

export interface SignalDef {
  name: string;
  file: string;
  line: number;
  type: string; // wire / reg / logic / input / ...
  range?: string;
}

export interface VIndex {
  modules: ModuleDef[];
  signals: SignalDef[];
}

const DECL_RE =
  /\b(input|output|inout|wire|reg|logic|integer|genvar)\b\s*(signed|unsigned)?\s*(\[[^\]]*\])?\s*([^;]*?);/g;
const IDENT_RE = /[A-Za-z_]\w*/g;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

// Pull the comma-separated port names out of a module header parenthesis group.
function parsePortNames(header: string): PortDecl[] {
  const start = header.indexOf("(");
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < header.length; i++) {
    if (header[i] === "(") depth++;
    else if (header[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  const inner = header.slice(start + 1, end);
  if (!inner.trim()) return [];
  const ports: PortDecl[] = [];
  for (let raw of inner.split(",")) {
    raw = raw.replace(/\/\/.*$/gm, "").trim();
    if (!raw) continue;
    const dirM = raw.match(/\b(input|output|inout)\b/);
    const rangeM = raw.match(/\[[^\]]*\]/);
    // Last identifier on the segment is the port name.
    const ids = raw.match(IDENT_RE) || [];
    const KW = new Set(["input", "output", "inout", "wire", "reg", "logic", "signed", "unsigned"]);
    const name = [...ids].reverse().find((t) => !KW.has(t));
    if (!name) continue;
    ports.push({
      name,
      dir: (dirM?.[1] as PortDecl["dir"]) || undefined,
      range: rangeM?.[0],
    });
  }
  return ports;
}

export function buildIndex(files: Array<{ name: string; content: string }>): VIndex {
  const modules: ModuleDef[] = [];
  const signals: SignalDef[] = [];

  for (const f of files) {
    const text = f.content;

    const modRe = /\bmodule\s+([A-Za-z_]\w*)/g;
    let mm: RegExpExecArray | null;
    while ((mm = modRe.exec(text)) !== null) {
      const name = mm[1];
      const line = lineOf(text, mm.index);
      // Grab the header up to the first ';' to read the ANSI port list.
      const semi = text.indexOf(";", mm.index);
      const header = semi > mm.index ? text.slice(mm.index, semi + 1) : text.slice(mm.index, mm.index + 400);
      const ports = parsePortNames(header);
      modules.push({ name, file: f.name, line, ports });
    }

    DECL_RE.lastIndex = 0;
    let dm: RegExpExecArray | null;
    while ((dm = DECL_RE.exec(text)) !== null) {
      const type = dm[1];
      const range = dm[3];
      const namesPart = dm[4] || "";
      const line = lineOf(text, dm.index);
      // names may include assignments: split on comma, take leading identifier
      for (const seg of namesPart.split(",")) {
        const idM = seg.trim().match(/^([A-Za-z_]\w*)/);
        if (idM) signals.push({ name: idM[1], file: f.name, line, type, range });
      }
    }
  }

  return { modules, signals };
}

export function moduleSignature(m: ModuleDef): string {
  const ports = m.ports.map((p) => `${p.dir ? p.dir + " " : ""}${p.range ? p.range + " " : ""}${p.name}`);
  return `module ${m.name} (${ports.join(", ")})`;
}

// Snippet body that instantiates a module with named port connections.
export function instantiationSnippet(m: ModuleDef): string {
  if (!m.ports.length) return `${m.name} u_${m.name} ();`;
  const conns = m.ports.map((p, i) => `  .${p.name}(\${${i + 1}:${p.name}})`);
  return `${m.name} u_${m.name} (\n${conns.join(",\n")}\n);`;
}
