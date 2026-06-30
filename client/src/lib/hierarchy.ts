// Builds a module instantiation tree (top → submodule instances) from the design
// sources. Regex/heuristic based; tolerant of params (`#(...)`) and arrays.

export interface HierNode {
  module: string;
  instance?: string; // undefined for a root
  children: HierNode[];
  external?: boolean; // instantiated but not defined in the open files
}

interface ModBlock {
  name: string;
  body: string;
}

function moduleBlocks(files: Array<{ name: string; content: string }>): ModBlock[] {
  const blocks: ModBlock[] = [];
  for (const f of files) {
    const text = f.content;
    const re = /\bmodule\s+([A-Za-z_]\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const end = text.indexOf("endmodule", m.index);
      const semi = text.indexOf(";", m.index);
      const bodyStart = semi > m.index ? semi + 1 : m.index;
      const body = text.slice(bodyStart, end > bodyStart ? end : text.length);
      blocks.push({ name: m[1], body });
    }
  }
  return blocks;
}

interface InstEdge {
  instance: string;
  module: string;
}

function findInstances(body: string, known: Set<string>): InstEdge[] {
  const edges: InstEdge[] = [];
  // <ModuleName> [#(...)] <instName> ( ...
  const re = /\b([A-Za-z_]\w*)\b\s*(?:#\s*\([\s\S]*?\))?\s*([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  const KW = new Set([
    "if",
    "for",
    "while",
    "case",
    "casez",
    "casex",
    "begin",
    "module",
    "function",
    "task",
    "always",
    "always_ff",
    "always_comb",
    "always_latch",
    "initial",
    "assign",
    "generate",
    "repeat",
    "forever",
  ]);
  while ((m = re.exec(body)) !== null) {
    const modName = m[1];
    const inst = m[2];
    if (KW.has(modName) || KW.has(inst)) continue;
    // Only treat as an instance if the type is a module we know, or it isn't a
    // common keyword — but to avoid false positives we require a known module.
    if (!known.has(modName)) continue;
    edges.push({ instance: inst, module: modName });
  }
  return edges;
}

export function buildHierarchy(files: Array<{ name: string; content: string }>, topName?: string): HierNode[] {
  const blocks = moduleBlocks(files);
  const known = new Set(blocks.map((b) => b.name));
  const childrenOf = new Map<string, InstEdge[]>();
  const instantiated = new Set<string>();
  for (const b of blocks) {
    const edges = findInstances(b.body, known);
    childrenOf.set(b.name, edges);
    for (const e of edges) instantiated.add(e.module);
  }

  const build = (module: string, instance: string | undefined, path: Set<string>): HierNode => {
    if (!known.has(module)) return { module, instance, children: [], external: true };
    if (path.has(module)) return { module, instance, children: [] }; // break cycles
    const next = new Set(path);
    next.add(module);
    const children = (childrenOf.get(module) || []).map((e) => build(e.module, e.instance, next));
    return { module, instance, children };
  };

  let roots: string[];
  if (topName && known.has(topName)) roots = [topName];
  else {
    roots = blocks.map((b) => b.name).filter((n) => !instantiated.has(n));
    if (roots.length === 0) roots = blocks.map((b) => b.name); // all cyclic / none top
  }
  // De-dup roots preserving order.
  roots = [...new Set(roots)];
  return roots.map((r) => build(r, undefined, new Set()));
}
