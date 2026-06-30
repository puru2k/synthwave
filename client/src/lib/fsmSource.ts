// Source-level FSM extractor.
//
// Yosys' fsm_export gives us a correct *state-transition graph* but throws away
// the textbook Moore/Mealy distinction: its KISS2 `out` field bundles the real
// module output with unlabelled next-state control bits, so we cannot tell
// whether an output depends on the state alone (Moore) or on the state and the
// input (Mealy). To draw correct diagrams (Moore -> output inside the state
// bubble, Mealy -> output on the transition arrow) we parse the RTL directly.
//
// This is a focused parser for the conventional FSM idiom used in textbooks and
// our examples (a state register driven from a `case (state)` block, with
// outputs either continuously assigned from the state or set inside the case).
// When the design does not match, the extractor returns null and the caller
// falls back to the Yosys path.

import { parseModules } from "./ports";
import type { FsmData, FsmTransition } from "./fsm";

interface Tok {
  v: string;
}

type Stmt =
  | { k: "assign"; lhs: string; op: "=" | "<="; rhs: Tok[] }
  | { k: "if"; cond: Tok[]; then: Stmt[]; else_: Stmt[] }
  | { k: "case"; sel: Tok[]; items: { labels: Tok[][]; body: Stmt[] }[]; def: Stmt[] | null }
  | { k: "block"; body: Stmt[] };

const KW_ALWAYS = new Set(["always", "always_ff", "always_comb", "always_latch"]);

function stripComments(src: string): string {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const multi = ["===", "!==", "<<<", ">>>", "==", "!=", "<=", ">=", "&&", "||", "<<", ">>", "~^", "^~", "~&", "~|"];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Verilog sized/based number: 4'b10, 'd3, 2'h1, etc.
    const numMatch = src.slice(i).match(/^(\d+)?'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ_]+/);
    if (numMatch) {
      toks.push({ v: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = src.slice(i).match(/^[0-9_]+(\.[0-9_]+)?/)!;
      toks.push({ v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_$][\w$]*/)!;
      toks.push({ v: m[0] });
      i += m[0].length;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (multi.includes(three)) {
      toks.push({ v: three });
      i += 3;
      continue;
    }
    if (multi.includes(two)) {
      toks.push({ v: two });
      i += 2;
      continue;
    }
    toks.push({ v: c });
    i++;
  }
  return toks;
}

// ---- recursive-descent statement parser over a token stream --------------

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(): string | null {
    return this.i < this.toks.length ? this.toks[this.i].v : null;
  }
  next(): Tok {
    return this.toks[this.i++];
  }
  expect(v: string) {
    if (this.peek() === v) this.i++;
  }

  // Read a balanced (...) group; assumes current token is "(", consumes through ")".
  readParen(): Tok[] {
    const out: Tok[] = [];
    this.expect("(");
    let depth = 1;
    while (this.i < this.toks.length && depth > 0) {
      const t = this.next();
      if (t.v === "(") depth++;
      else if (t.v === ")") {
        depth--;
        if (depth === 0) break;
      }
      if (depth > 0) out.push(t);
    }
    return out;
  }

  // Read an expression until a top-level stop token (over (),{},[]).
  readExpr(stop: Set<string>): Tok[] {
    const out: Tok[] = [];
    let depth = 0;
    while (this.i < this.toks.length) {
      const v = this.peek()!;
      if (depth === 0 && stop.has(v)) break;
      if (v === "(" || v === "{" || v === "[") depth++;
      else if (v === ")" || v === "}" || v === "]") depth--;
      out.push(this.next());
    }
    return out;
  }

  parseStmt(): Stmt | null {
    const v = this.peek();
    if (v === null) return null;
    if (v === ";") {
      this.next();
      return { k: "block", body: [] };
    }
    if (v === "begin") {
      this.next();
      const body: Stmt[] = [];
      while (this.peek() !== null && this.peek() !== "end") {
        const s = this.parseStmt();
        if (s) body.push(s);
      }
      this.expect("end");
      // optional block name: begin : name
      return { k: "block", body };
    }
    if (v === "if") {
      this.next();
      const cond = this.readParen();
      const then = this.parseStmt();
      let else_: Stmt[] = [];
      if (this.peek() === "else") {
        this.next();
        const e = this.parseStmt();
        if (e) else_ = [e];
      }
      return { k: "if", cond, then: then ? [then] : [], else_ };
    }
    if (v === "case" || v === "casex" || v === "casez") {
      this.next();
      const sel = this.readParen();
      const items: { labels: Tok[][]; body: Stmt[] }[] = [];
      let def: Stmt[] | null = null;
      while (this.peek() !== null && this.peek() !== "endcase") {
        if (this.peek() === "default") {
          this.next();
          if (this.peek() === ":") this.next();
          const b = this.parseStmt();
          def = b ? [b] : [];
          continue;
        }
        // label list until ":"
        const labelToks = this.readExpr(new Set([":"]));
        this.expect(":");
        const labels = splitTopLevel(labelToks, ",");
        const b = this.parseStmt();
        items.push({ labels, body: b ? [b] : [] });
      }
      this.expect("endcase");
      return { k: "case", sel, items, def };
    }
    // assignment: lhs (= | <=) rhs ;
    const lhsToks = this.readExpr(new Set(["=", "<="]));
    const op = this.peek();
    if (op !== "=" && op !== "<=") {
      // not an assignment we understand; skip to ; to stay in sync
      this.readExpr(new Set([";"]));
      this.expect(";");
      return { k: "block", body: [] };
    }
    this.next();
    const rhs = this.readExpr(new Set([";"]));
    this.expect(";");
    const lhs = lhsToks.length ? lhsToks[0].v : "";
    return { k: "assign", lhs, op: op as "=" | "<=", rhs };
  }
}

function splitTopLevel(toks: Tok[], sep: string): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.v === "(" || t.v === "{" || t.v === "[") depth++;
    else if (t.v === ")" || t.v === "}" || t.v === "]") depth--;
    if (depth === 0 && t.v === sep) {
      out.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

function topLevelIndex(toks: Tok[], target: string): number {
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === "(" || v === "{" || v === "[") depth++;
    else if (v === ")" || v === "}" || v === "]") depth--;
    else if (depth === 0 && v === target) return i;
  }
  return -1;
}

function exprStr(toks: Tok[]): string {
  let s = "";
  for (let i = 0; i < toks.length; i++) {
    const v = toks[i].v;
    const prev = i > 0 ? toks[i - 1].v : "";
    const needSpace =
      s.length > 0 &&
      /[\w$]/.test(v[0]) &&
      /[\w$]/.test(prev[prev.length - 1]);
    s += (needSpace ? " " : "") + v;
  }
  return s.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")");
}

function negate(cond: string): string {
  const c = cond.trim();
  if (/^!?[\w$.]+$/.test(c)) return c.startsWith("!") ? c.slice(1) : "!" + c;
  return "!(" + c + ")";
}

function andCond(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a + " & " + b;
}

// Expand a ternary expression into condition/value pairs.
function expandTernary(toks: Tok[]): { cond: string | null; val: Tok[] }[] {
  const q = topLevelIndex(toks, "?");
  if (q < 0) return [{ cond: null, val: toks }];
  const condToks = toks.slice(0, q);
  const rest = toks.slice(q + 1);
  const c = topLevelIndex(rest, ":");
  if (c < 0) return [{ cond: null, val: toks }];
  const aToks = rest.slice(0, c);
  const bToks = rest.slice(c + 1);
  const condS = exprStr(condToks);
  const res: { cond: string | null; val: Tok[] }[] = [];
  for (const a of expandTernary(aToks)) res.push({ cond: andCond(condS, a.cond), val: a.val });
  for (const b of expandTernary(bToks)) res.push({ cond: andCond(negate(condS), b.cond), val: b.val });
  return res;
}

// ---- symbolic execution of a statement list -------------------------------

interface PathState {
  conds: string[];
  assign: Map<string, Tok[]>;
}

function clone(p: PathState): PathState {
  return { conds: [...p.conds], assign: new Map(p.assign) };
}

function execStmts(stmts: Stmt[], paths: PathState[]): PathState[] {
  let cur = paths;
  for (const s of stmts) cur = execStmt(s, cur);
  return cur;
}

function execStmt(s: Stmt, paths: PathState[]): PathState[] {
  switch (s.k) {
    case "block":
      return execStmts(s.body, paths);
    case "assign": {
      const exps = expandTernary(s.rhs);
      const out: PathState[] = [];
      for (const p of paths) {
        for (const e of exps) {
          const np = clone(p);
          if (e.cond) np.conds.push(e.cond);
          np.assign.set(s.lhs, e.val);
          out.push(np);
        }
      }
      return out;
    }
    case "if": {
      const out: PathState[] = [];
      const condS = exprStr(s.cond);
      for (const p of paths) {
        const pt = clone(p);
        pt.conds.push(condS);
        out.push(...execStmts(s.then, [pt]));
        const pe = clone(p);
        pe.conds.push(negate(condS));
        out.push(...execStmts(s.else_, [pe]));
      }
      return out;
    }
    case "case": {
      const out: PathState[] = [];
      const selS = exprStr(s.sel);
      for (const p of paths) {
        for (const it of s.items) {
          const c = it.labels.map((l) => `${selS}==${exprStr(l)}`).join(" | ");
          const pc = clone(p);
          pc.conds.push(c);
          out.push(...execStmts(it.body, [pc]));
        }
        if (s.def) out.push(...execStmts(s.def, [clone(p)]));
      }
      return out;
    }
  }
}

// ---- module-level scan: pull out always blocks + continuous assigns --------

interface AlwaysBlock {
  seq: boolean;
  body: Stmt[];
}
interface ContAssign {
  lhs: string;
  rhs: Tok[];
}

function scanModule(toks: Tok[]): { always: AlwaysBlock[]; cont: ContAssign[] } {
  const always: AlwaysBlock[] = [];
  const cont: ContAssign[] = [];
  let i = 0;
  while (i < toks.length) {
    const v = toks[i].v;
    if (KW_ALWAYS.has(v)) {
      const kw = v;
      i++;
      let seq = kw === "always_ff";
      // sensitivity list
      if (toks[i] && toks[i].v === "@") {
        i++;
        if (toks[i] && toks[i].v === "(") {
          let depth = 0;
          const start = i;
          do {
            if (toks[i].v === "(") depth++;
            else if (toks[i].v === ")") depth--;
            i++;
          } while (i < toks.length && depth > 0);
          const sens = toks.slice(start, i).map((t) => t.v);
          if (sens.includes("posedge") || sens.includes("negedge")) seq = true;
        } else if (toks[i] && toks[i].v === "*") {
          i++;
        }
      }
      const sub = new Parser(toks.slice(i));
      const stmt = sub.parseStmt();
      i += sub.i;
      const body = stmt ? (stmt.k === "block" ? stmt.body : [stmt]) : [];
      always.push({ seq, body });
      continue;
    }
    if (v === "assign") {
      i++;
      const sub = new Parser(toks.slice(i));
      const lhsToks = sub.readExpr(new Set(["=", "<="]));
      if (sub.peek() === "=" || sub.peek() === "<=") {
        sub.next();
        const rhs = sub.readExpr(new Set([";"]));
        sub.expect(";");
        cont.push({ lhs: lhsToks.length ? lhsToks[0].v : "", rhs });
      }
      i += sub.i;
      continue;
    }
    i++;
  }
  return { always, cont };
}

// Collect every `<=` / `=` assignment, with its path conditions.
function collectAssigns(stmts: Stmt[], conds: string[], acc: { lhs: string; rhs: Tok[]; op: string; conds: string[] }[]) {
  for (const s of stmts) {
    if (s.k === "assign") acc.push({ lhs: s.lhs, rhs: s.rhs, op: s.op, conds: [...conds] });
    else if (s.k === "block") collectAssigns(s.body, conds, acc);
    else if (s.k === "if") {
      const c = exprStr(s.cond);
      collectAssigns(s.then, [...conds, c], acc);
      collectAssigns(s.else_, [...conds, negate(c)], acc);
    } else if (s.k === "case") {
      for (const it of s.items) collectAssigns(it.body, conds, acc);
      if (s.def) collectAssigns(s.def, conds, acc);
    }
  }
}

// ---- parameter (state-name) map -------------------------------------------

function parseNum(s: string): number | null {
  const v = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = v.match(/'s?d\s*([0-9]+)/i))) return parseInt(m[1], 10);
  if ((m = v.match(/'s?b\s*([01_]+)/i))) return parseInt(m[1].replace(/_/g, ""), 2);
  if ((m = v.match(/'s?h\s*([0-9a-f_]+)/i))) return parseInt(m[1].replace(/_/g, ""), 16);
  if ((m = v.match(/^([0-9]+)$/))) return parseInt(m[1], 10);
  return null;
}

function paramMaps(body: string): { nameVal: Map<string, number>; valName: Map<number, string> } {
  const nameVal = new Map<string, number>();
  const valName = new Map<number, string>();
  const re = /\b(?:localparam|parameter)\b(?:\s*\[[^\]]*\])?\s*([\s\S]*?);/g;
  let block: RegExpExecArray | null;
  while ((block = re.exec(body)) !== null) {
    for (const part of splitTopLevel(tokenize(block[1]), ",").map((t) => exprStr(t))) {
      const m = part.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (!m) continue;
      const val = parseNum(m[2]);
      if (val == null) continue;
      nameVal.set(m[1], val);
      if (!valName.has(val)) valName.set(val, m[1]);
    }
  }
  return { nameVal, valName };
}

// ---- tiny boolean evaluator for Moore continuous outputs -------------------

// Evaluate a boolean expression of 0/1 literals and !,&&,||,&,|,^,(). Returns
// 0 or 1, or null if it cannot be reduced (e.g. references unknown signals).
function evalBool(s: string): number | null {
  let i = 0;
  const str = s;
  function skip() {
    while (i < str.length && /\s/.test(str[i])) i++;
  }
  function parsePrimary(): number | null {
    skip();
    if (str[i] === "!" || (str[i] === "~" && str[i + 1] !== "&" && str[i + 1] !== "|")) {
      i++;
      const v = parsePrimary();
      return v == null ? null : v ? 0 : 1;
    }
    if (str[i] === "(") {
      i++;
      const v = parseOr();
      skip();
      if (str[i] === ")") i++;
      return v;
    }
    const m = str.slice(i).match(/^(1'[bdh]?1|1'[bdh]?0|[01])/i);
    if (m) {
      i += m[0].length;
      return /1$/.test(m[0]) ? 1 : 0;
    }
    return null;
  }
  function parseAnd(): number | null {
    let v = parsePrimary();
    skip();
    while (str.startsWith("&&", i) || (str[i] === "&" && str[i + 1] !== "&")) {
      i += str.startsWith("&&", i) ? 2 : 1;
      const r = parsePrimary();
      if (v == null || r == null) return null;
      v = v && r ? 1 : 0;
      skip();
    }
    return v;
  }
  function parseOr(): number | null {
    let v = parseAnd();
    skip();
    while (str.startsWith("||", i) || (str[i] === "|" && str[i + 1] !== "|") || str[i] === "^") {
      const xor = str[i] === "^";
      i += str.startsWith("||", i) ? 2 : 1;
      const r = parseAnd();
      if (v == null || r == null) return null;
      v = xor ? (v ^ r ? 1 : 0) : v || r ? 1 : 0;
      skip();
    }
    return v;
  }
  const res = parseOr();
  skip();
  return i >= str.length ? res : null;
}

// ---- main extractor --------------------------------------------------------

function findModuleBody(src: string, top: string): { body: string; name: string } | null {
  const clean = stripComments(src);
  const re = /\bmodule\s+([A-Za-z_]\w*)[\s\S]*?(?:;)([\s\S]*?)\bendmodule\b/g;
  let m: RegExpExecArray | null;
  let first: { body: string; name: string } | null = null;
  while ((m = re.exec(clean)) !== null) {
    const entry = { name: m[1], body: m[2] };
    if (!first) first = entry;
    if (m[1] === top) return entry;
  }
  return first;
}

export function extractFsmFromSource(files: Array<{ name: string; content: string }>, top: string): FsmData | null {
  try {
    const combined = files.map((f) => f.content).join("\n");
    const mod = findModuleBody(combined, top);
    if (!mod) return null;

    const parsed = parseModules(files).find((p) => p.name === mod.name) || parseModules(files)[0];
    if (!parsed) return null;
    const dataInputs = parsed.ports.filter((p) => p.dir === "input" && !p.isClock && !p.isReset).map((p) => p.name);
    const outputs = parsed.ports.filter((p) => p.dir === "output").map((p) => p.name);

    const toks = tokenize(mod.body);
    const { always, cont } = scanModule(toks);

    const { nameVal, valName } = paramMaps(mod.body);
    const resolveState = (s: string): string => {
      const t = s.trim().replace(/[()]/g, "");
      if (nameVal.has(t)) return t;
      const num = parseNum(t);
      if (num != null) return valName.get(num) ?? t;
      return t;
    };
    const isStateLit = (s: string): boolean => {
      const t = s.trim();
      return nameVal.has(t) || parseNum(t) != null;
    };

    // 1. Find the state register + its next-state feed from a sequential block.
    let stateReg: string | null = null;
    let nextVar: string | null = null;
    let resetState: Tok[] | null = null;
    const resetPorts = parsed.ports.filter((p) => p.isReset);
    const resetNames = resetPorts.map((p) => p.name);
    // True only for the *asserted* reset condition ("!rst_n" or "rst"), not its
    // deassertion ("rst_n"), so a `... else <out> <= ...` is not mistaken for reset.
    const assertedReset = (c: string): boolean =>
      resetPorts.some((p) => c.trim() === (p.activeLow ? `!${p.name}` : p.name));

    for (const blk of always.filter((b) => b.seq)) {
      const acc: { lhs: string; rhs: Tok[]; op: string; conds: string[] }[] = [];
      collectAssigns(blk.body, [], acc);
      const nbAssigns = acc.filter((a) => a.op === "<=");
      if (!nbAssigns.length) continue;
      // The state register is the most-assigned <= target in this block.
      const counts = new Map<string, number>();
      for (const a of nbAssigns) counts.set(a.lhs, (counts.get(a.lhs) || 0) + 1);
      const cand = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
      stateReg = cand;
      for (const a of nbAssigns.filter((a) => a.lhs === cand)) {
        const refReset = a.conds.some(assertedReset);
        const rhsStr = exprStr(a.rhs);
        if (refReset && isStateLit(rhsStr)) resetState = a.rhs;
        // A clean identifier feed (state <= next) means a two-always machine.
        // A state literal (state <= S1) means transitions live in this block.
        else if (/^[A-Za-z_]\w*$/.test(rhsStr) && rhsStr !== cand && !isStateLit(rhsStr)) nextVar = rhsStr;
      }
      if (stateReg) break;
    }
    if (!stateReg) return null;

    const twoAlways = !!nextVar;
    if (!nextVar) nextVar = stateReg; // single-always: branches assign the state register

    // 2. Locate the case(state) whose branches drive the next state, and read
    //    the state set from its labels. (A design may have a second case(state)
    //    that only drives outputs -- the Traffic Light is like this.)
    const allBlocks = [...always.filter((b) => !b.seq), ...always.filter((b) => b.seq)];
    let caseStmt: Extract<Stmt, { k: "case" }> | null = null;
    for (const blk of allBlocks) {
      for (const c of findCasesOn(blk.body, stateReg)) {
        if (caseAssignsVar(c, nextVar)) {
          caseStmt = c;
          break;
        }
      }
      if (caseStmt) break;
    }
    if (!caseStmt) return null;

    const states: string[] = [];
    for (const it of caseStmt.items) {
      for (const l of it.labels) {
        const s = resolveState(exprStr(l));
        if (s !== "default" && !states.includes(s)) states.push(s);
      }
    }
    if (states.length < 2) return null;

    // 3. Registered outputs: `out <= proxy` in the sequential block means the
    //    combinational driver of `out` is `proxy` (Vending's disp_n/chg_n).
    const outAlias: Record<string, string> = {};
    for (const blk of always.filter((b) => b.seq)) {
      const acc: { lhs: string; rhs: Tok[]; op: string; conds: string[] }[] = [];
      collectAssigns(blk.body, [], acc);
      for (const a of acc) {
        if (a.op !== "<=" || !outputs.includes(a.lhs)) continue;
        const refReset = a.conds.some(assertedReset);
        const rhsStr = exprStr(a.rhs);
        if (!refReset && /^[A-Za-z_]\w*$/.test(rhsStr) && rhsStr !== a.lhs) outAlias[a.lhs] = rhsStr;
      }
    }

    // 4. Combinational logic to evaluate per state: every comb block, plus the
    //    sequential block for single-always designs (reset path is dropped),
    //    plus continuous assigns turned into statements.
    const logicStmts: Stmt[] = [];
    for (const blk of always.filter((b) => !b.seq)) logicStmts.push(...blk.body);
    if (!twoAlways) for (const blk of always.filter((b) => b.seq)) logicStmts.push(...blk.body);
    for (const ca of cont) logicStmts.push({ k: "assign", lhs: ca.lhs, op: "=", rhs: ca.rhs });

    const readOutVal = (toks: Tok[], from: string): string => {
      const s = exprStr(toks);
      if (new RegExp(`\\b${stateReg}\\b`).test(s)) {
        const reduced = reduceStateExpr(s, stateReg!, from, resolveState);
        const b = evalBool(reduced);
        if (b != null) return String(b);
        return simplifyExpr(reduced); // input-dependent within this state (Mealy)
      }
      const n = parseNum(s);
      return n != null ? String(n) : s;
    };
    const valRefsInput = (toks: Tok[]): boolean => {
      const s = exprStr(toks);
      return dataInputs.some((d) => new RegExp(`\\b${d}\\b`).test(s));
    };

    // 5. Symbolically execute the combinational logic once per state.
    const transitions: FsmTransition[] = [];
    const stateOut: Record<string, Record<string, Set<string>>> = {}; // state -> output -> distinct values
    let mealy = false;

    for (const from of states) {
      const spec = specializeForState(logicStmts, from, stateReg!, resetNames, resolveState);
      const paths = execStmts(spec, [{ conds: [], assign: new Map() }]);
      for (const p of paths) {
        const nv = p.assign.get(nextVar!);
        let to = from;
        if (nv) {
          const nvStr = exprStr(nv);
          to = nvStr === stateReg ? from : resolveState(nvStr);
        }
        const cond = cleanCond(p.conds.join(" & "));
        const outVals: Record<string, string> = {};
        for (const o of outputs) {
          const drv = p.assign.get(outAlias[o] ?? o);
          if (!drv) continue;
          if (valRefsInput(drv)) mealy = true;
          outVals[o] = readOutVal(drv, from);
        }
        for (const [o, v] of Object.entries(outVals)) {
          stateOut[from] = stateOut[from] || {};
          stateOut[from][o] = stateOut[from][o] || new Set();
          stateOut[from][o].add(v);
        }
        transitions.push({
          in: "",
          from,
          to,
          out: "",
          cond,
          edgeOut: Object.entries(outVals)
            .map(([o, v]) => `${o}=${v}`)
            .join(", "),
        });
      }
    }

    // 6. Classify: Mealy iff an output depends on the input (varies within a
    //    state, or is literally an input expression).
    for (const s of Object.keys(stateOut))
      for (const o of Object.keys(stateOut[s])) if (stateOut[s][o].size > 1) mealy = true;

    const stateOutputs: Record<string, string> = {};
    for (const s of states) {
      const parts: string[] = [];
      for (const o of outputs) {
        if (stateOut[s] && stateOut[s][o] && stateOut[s][o].size === 1) parts.push(`${o}=${[...stateOut[s][o]][0]}`);
      }
      if (parts.length) stateOutputs[s] = parts.join(", ");
    }

    const reset = resetState ? resolveState(exprStr(resetState)) : states[0];
    const merged = mergeTransitions(transitions, mealy);

    const data: FsmData = {
      inputs: dataInputs.length,
      outputs: outputs.length,
      numStates: states.length,
      reset,
      states,
      transitions: merged,
      kind: mealy ? "mealy" : "moore",
      stateOutputs: mealy ? undefined : stateOutputs,
      fromSource: true,
    };
    return data;
  } catch {
    return null;
  }
}

// Replace `state == LIT` comparisons with 1/0 for a fixed current state.
function reduceStateExpr(expr: string, stateReg: string, state: string, resolveState: (s: string) => string): string {
  const cmp = new RegExp(`${stateReg}\\s*===?\\s*([A-Za-z_0-9']+)|([A-Za-z_0-9']+)\\s*===?\\s*${stateReg}`, "g");
  return expr.replace(cmp, (_m, a, b) => {
    const lit = a ?? b;
    return resolveState(lit) === state ? "1" : "0";
  });
}

// Collect every `case (name)` in a statement tree.
function findCasesOn(stmts: Stmt[], name: string): Extract<Stmt, { k: "case" }>[] {
  const out: Extract<Stmt, { k: "case" }>[] = [];
  const walk = (ss: Stmt[]) => {
    for (const s of ss) {
      if (s.k === "case") {
        if (exprStr(s.sel).replace(/[()]/g, "") === name) out.push(s);
        for (const it of s.items) walk(it.body);
        if (s.def) walk(s.def);
      } else if (s.k === "block") walk(s.body);
      else if (s.k === "if") {
        walk(s.then);
        walk(s.else_);
      }
    }
  };
  walk(stmts);
  return out;
}

function caseAssignsVar(cs: Extract<Stmt, { k: "case" }>, v: string): boolean {
  const acc: { lhs: string; rhs: Tok[]; op: string; conds: string[] }[] = [];
  for (const it of cs.items) collectAssigns(it.body, [], acc);
  if (cs.def) collectAssigns(cs.def, [], acc);
  return acc.some((a) => a.lhs === v);
}

// Rewrite statements for a fixed current state: pick the matching branch of
// case(state), fold away state-only conditions, and drop reset branches. The
// result still branches on data inputs (the source of Mealy behaviour).
function specializeForState(
  stmts: Stmt[],
  from: string,
  stateReg: string,
  resetNames: string[],
  resolveState: (s: string) => string
): Stmt[] {
  const rec = (ss: Stmt[]) => specializeForState(ss, from, stateReg, resetNames, resolveState);
  const out: Stmt[] = [];
  for (const s of stmts) {
    if (s.k === "assign") out.push(s);
    else if (s.k === "block") out.push({ k: "block", body: rec(s.body) });
    else if (s.k === "case") {
      if (exprStr(s.sel).replace(/[()]/g, "") === stateReg) {
        let body: Stmt[] | null = null;
        for (const it of s.items) {
          if (it.labels.some((l) => resolveState(exprStr(l)) === from)) {
            body = it.body;
            break;
          }
        }
        out.push(...rec(body ?? s.def ?? []));
      } else {
        out.push({
          k: "case",
          sel: s.sel,
          items: s.items.map((it) => ({ labels: it.labels, body: rec(it.body) })),
          def: s.def ? rec(s.def) : null,
        });
      }
    } else if (s.k === "if") {
      const condS = exprStr(s.cond);
      if (resetNames.some((r) => new RegExp(`\\b${r}\\b`).test(condS))) {
        out.push(...rec(s.else_)); // assume reset inactive
        continue;
      }
      const reduced = reduceStateExpr(condS, stateReg, from, resolveState);
      if (!new RegExp(`\\b${stateReg}\\b`).test(reduced)) {
        const b = evalBool(reduced);
        if (b === 1) {
          out.push(...rec(s.then));
          continue;
        }
        if (b === 0) {
          out.push(...rec(s.else_));
          continue;
        }
      }
      out.push({ k: "if", cond: s.cond, then: rec(s.then), else_: rec(s.else_) });
    }
  }
  return out;
}

// Light constant-folding so a partially-reduced output expression reads cleanly,
// e.g. "(1)&~din" -> "~din", "(0)&~din" -> "0".
function simplifyExpr(s: string): string {
  let p = s;
  for (let k = 0; k < 6; k++) {
    const before = p;
    p = p.replace(/\(\s*([01])\s*\)/g, "$1");
    p = p.replace(/\b0\s*&&?\s*~?\(?[\w']+\)?/g, "0");
    p = p.replace(/~?\(?[\w']+\)?\s*&&?\s*0\b/g, "0");
    p = p.replace(/\b1\s*&&?\s*/g, "").replace(/\s*&&?\s*1\b/g, "");
    p = p.replace(/\b0\s*\|\|?\s*/g, "").replace(/\s*\|\|?\s*0\b/g, "");
    if (p === before) break;
  }
  return p.trim() || "0";
}

function cleanCond(cond: string): string {
  let c = cond.trim();
  if (!c) return "*";
  // tidy negations of bare identifiers: "!din" -> "din=0", bare "din" -> "din=1"
  c = c.replace(/\s+/g, " ");
  return c;
}

function mergeTransitions(transitions: FsmTransition[], mealy: boolean): FsmTransition[] {
  const map = new Map<string, FsmTransition>();
  for (const t of transitions) {
    const key = `${t.from}->${t.to}`;
    const existing = map.get(key);
    const label = mealy && t.edgeOut ? `${t.cond} / ${t.edgeOut}` : t.cond || "*";
    if (!existing) {
      map.set(key, { ...t, cond: label });
    } else {
      const parts = (existing.cond || "").split(", ");
      if (!parts.includes(label)) existing.cond = [...parts, label].join(", ");
    }
  }
  return [...map.values()];
}
