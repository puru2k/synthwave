import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN_TIMEOUT_MS = 20000;

/**
 * Run a command, capturing stdout/stderr, with a hard timeout.
 * Resolves with { code, stdout, stderr, timedOut }.
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeout ?? RUN_TIMEOUT_MS);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + "\n" + err.message, timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "vstudio-"));
  try {
    return await fn(dir);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Sanitize a user-supplied filename to a safe basename ending in .v/.sv. */
function safeName(name, fallback) {
  let n = String(name || "").split(/[\\/]/).pop() || "";
  n = n.replace(/[^A-Za-z0-9_.\-]/g, "_");
  if (!n || n === "." || n === "..") n = fallback;
  if (!/\.s?v$/i.test(n)) n += ".v";
  return n;
}

/** Sanitize a data filename to a safe RELATIVE path (subdirectories allowed). */
function safeDataName(name, fallback) {
  const segs = String(name || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[^A-Za-z0-9_.\-]/g, "_"))
    .filter((s) => s && s !== "." && s !== "..");
  return segs.length ? segs.join("/") : fallback;
}

/**
 * Write non-HDL data files (for $readmemh/$readmemb/$fopen) into dir under
 * their original names, so testbenches can reference them by name.
 */
async function writeDataFiles(dir, data) {
  const written = [];
  if (!Array.isArray(data)) return written;
  const { mkdir } = await import("node:fs/promises");
  for (let i = 0; i < data.length; i++) {
    const f = data[i];
    if (!f || typeof f.content !== "string") continue;
    const n = safeDataName(f.name, `data${i + 1}.dat`);
    if (n.includes("/")) await mkdir(join(dir, n, ".."), { recursive: true });
    await writeFile(join(dir, n), f.content);
    written.push(n);
  }
  return written;
}

/** Collect files the simulation wrote (excluding inputs + known artifacts). */
async function collectOutputs(dir, known) {
  const { readdir, stat } = await import("node:fs/promises");
  const outputs = [];
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return outputs;
  }
  for (const name of entries) {
    if (known.has(name)) continue;
    try {
      const st = await stat(join(dir, name));
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue; // skip dirs / huge files
      outputs.push({ name, content: await readFile(join(dir, name), "utf8") });
    } catch {
      /* skip unreadable */
    }
  }
  return outputs;
}

/** Write an array of { name, content } files into dir; returns unique names. */
async function writeFiles(dir, files) {
  const used = new Set();
  const written = [];
  for (let i = 0; i < files.length; i++) {
    let n = safeName(files[i]?.name, `file${i + 1}.v`);
    let base = n;
    let k = 1;
    while (used.has(n)) {
      n = base.replace(/(\.s?v)$/i, `_${k}$1`);
      k++;
    }
    used.add(n);
    await writeFile(join(dir, n), files[i]?.content ?? "");
    written.push(n);
  }
  return written;
}

/** Accept either the new { files: [...] } shape or the legacy design/testbench. */
function normalizeFiles({ files, design, testbench }) {
  if (Array.isArray(files) && files.length) {
    return files.filter((f) => f && typeof f.content === "string");
  }
  const out = [];
  if (typeof design === "string") out.push({ name: "design.v", content: design });
  if (typeof testbench === "string") out.push({ name: "testbench.v", content: testbench });
  return out;
}

/**
 * Compile + run a Verilog design and testbench with Icarus Verilog,
 * returning the generated VCD waveform text plus simulation logs.
 */
export async function simulate(input) {
  const files = normalizeFiles(input);
  return withTempDir(async (dir) => {
    if (files.length === 0) {
      return { ok: false, stage: "compile", log: "No source files to simulate." };
    }
    const names = await writeFiles(dir, files);
    const dataNames = await writeDataFiles(dir, input?.data);
    const outPath = join(dir, "sim.out");

    // Compile all files together. Use relative names (cwd is the temp dir)
    // so diagnostics read cleanly as "design.v:N:" rather than a temp path.
    const compile = await run(
      "iverilog",
      ["-g2012", "-o", "sim.out", ...names],
      { cwd: dir }
    );

    if (compile.timedOut) {
      return { ok: false, stage: "compile", log: "Compilation timed out." };
    }
    if (compile.code !== 0) {
      return {
        ok: false,
        stage: "compile",
        log: (compile.stdout + compile.stderr).trim() || "Compilation failed.",
      };
    }

    // Run the simulation. The testbench is expected to $dumpfile/$dumpvars.
    const sim = await run("vvp", [outPath], { cwd: dir });

    if (sim.timedOut) {
      return {
        ok: false,
        stage: "simulate",
        log:
          (compile.stdout + compile.stderr + sim.stdout + sim.stderr).trim() +
          "\nSimulation timed out (possible infinite loop / missing $finish).",
      };
    }

    // Look for a VCD file. We try the conventional name first, then scan.
    let vcd = null;
    let vcdName = null;
    const candidates = ["dump.vcd", "wave.vcd", "test.vcd", "tb.vcd", "waveform.vcd"];
    for (const name of candidates) {
      try {
        vcd = await readFile(join(dir, name), "utf8");
        vcdName = name;
        break;
      } catch {
        /* keep looking */
      }
    }
    if (vcd == null) {
      // Scan the dir for any .vcd file produced by $dumpfile.
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      vcdName = files.find((f) => f.endsWith(".vcd")) || null;
      if (vcdName) vcd = await readFile(join(dir, vcdName), "utf8");
    }

    const log = (compile.stdout + compile.stderr + sim.stdout + sim.stderr).trim();

    // Surface any files the testbench wrote ($fopen/$fwrite/$writememh, …).
    const known = new Set([...names, ...dataNames, "sim.out"]);
    for (const c of candidates) known.add(c);
    if (vcdName) known.add(vcdName);
    const outputs = await collectOutputs(dir, known);

    return {
      ok: true,
      stage: "done",
      vcd,
      log: log || "Simulation finished.",
      hasWaveform: vcd != null,
      outputs,
    };
  });
}

/**
 * Syntax / elaboration check using Icarus Verilog's null target.
 * Works on the design alone (no testbench required) so users can validate
 * their own code before simulating or synthesizing.
 */
export async function verify(input) {
  const { level, top } = input;
  const files = normalizeFiles(input).filter((f) => f.content.trim());
  return withTempDir(async (dir) => {
    if (files.length === 0) {
      return { ok: false, log: "Nothing to verify — write some Verilog first." };
    }
    const names = await writeFiles(dir, files);

    if (level === "strict") {
      const args = ["--lint-only", "-Wall", "-Wno-DECLFILENAME"];
      if (top && top.trim()) args.push("--top-module", top.trim());
      args.push(...names);
      const r = await run("verilator", args, { cwd: dir });

      // Verilator not installed -> fall back to the basic linter.
      const missing = r.code === -1 && /ENOENT|not found/i.test(r.stderr);
      if (!missing) {
        if (r.timedOut) return { ok: false, log: "Strict lint timed out." };
        const log = (r.stdout + r.stderr).trim();
        // Verilator exits non-zero even for warning-only runs and prints a summary
        // line like "%Error: Exiting due to N warning(s)" — judge by real %Error lines.
        const hasError = log
          .split("\n")
          .some((l) => /%Error/i.test(l) && !/Exiting due to/i.test(l));
        if (!hasError) {
          return {
            ok: true,
            log: log
              ? "Verilator lint finished with warnings:\n\n" + log
              : "✓ No errors or warnings. Verilator strict lint is clean.",
          };
        }
        return { ok: false, log: log || "Strict lint failed." };
      }
      // else fall through to basic with a note below
      const r2 = await run("iverilog", ["-Wall", "-t", "null", "-g2012", ...names], { cwd: dir });
      const log = (r2.stdout + r2.stderr).trim();
      const note = "[Verilator not installed — used basic lint. Run `brew install verilator` for strict mode.]\n\n";
      if (r2.code === 0) {
        return { ok: true, log: note + (log || "✓ No errors or warnings (basic lint).") };
      }
      return { ok: false, log: note + (log || "Verification failed.") };
    }

    // basic: Icarus -Wall enables lint-style warnings on top of syntax checks.
    const r = await run("iverilog", ["-Wall", "-t", "null", "-g2012", ...names], { cwd: dir });
    if (r.timedOut) return { ok: false, log: "Verification timed out." };

    const log = (r.stdout + r.stderr).trim();
    if (r.code === 0) {
      return {
        ok: true,
        log: log
          ? "✓ Elaborated successfully, with lint warnings:\n\n" + log
          : "✓ No errors or warnings. The code parses, elaborates, and lints clean.",
      };
    }
    return { ok: false, log: log || "Verification failed." };
  });
}

/**
 * Synthesize a Verilog design with Yosys and render the resulting netlist
 * to an SVG schematic with netlistsvg. Also returns Yosys statistics.
 */
// Build a { cellName: { file, line } } map from a Yosys JSON netlist using the
// `src` attribute Yosys attaches to each cell (e.g. "design.v:15.5-18.8").
function buildSrcMap(netlistJsonText) {
  const map = {};
  try {
    const net = JSON.parse(netlistJsonText);
    for (const mod of Object.values(net.modules || {})) {
      for (const [cellName, cell] of Object.entries(mod.cells || {})) {
        const src = cell.attributes && cell.attributes.src;
        if (!src) continue;
        const first = String(src).split("|")[0];
        const m = first.match(/([^:|]+):(\d+)/);
        if (m) map[cellName] = { file: m[1].split("/").pop(), line: parseInt(m[2], 10) };
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

// Rough, technology-independent critical-path estimate: the longest chain of
// combinational cells between flip-flops / primary I/O, measured in logic levels.
function criticalDepth(netlistJsonText) {
  try {
    const net = JSON.parse(netlistJsonText);
    const mod = Object.values(net.modules || {})[0];
    if (!mod || !mod.cells) return 0;
    const cells = mod.cells;
    const isSeq = (type) => /dff|dffe|sdff|adff|dlatch|latch|sr_/i.test(type || "");

    // Map each net bit to the cell that drives it.
    const driver = {};
    for (const [name, c] of Object.entries(cells)) {
      const dir = c.port_directions || {};
      const conns = c.connections || {};
      for (const [port, bits] of Object.entries(conns)) {
        if (dir[port] === "output") for (const b of bits) if (typeof b === "number") driver[b] = name;
      }
    }

    const memo = {};
    const visiting = new Set();
    const depth = (name) => {
      if (memo[name] != null) return memo[name];
      if (visiting.has(name)) return 0; // break combinational loops defensively
      visiting.add(name);
      const c = cells[name];
      if (isSeq(c.type)) {
        memo[name] = 0; // FF output is a fresh start point
        visiting.delete(name);
        return 0;
      }
      const dir = c.port_directions || {};
      const conns = c.connections || {};
      let best = 0;
      for (const [port, bits] of Object.entries(conns)) {
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

function parseStat(log) {
  // Yosys `stat` prints, per module:
  //        10 cells
  //         2   $_AND_
  //         4   $_SDFF_PP0_
  let stats = { cells: 0, ffs: 0, byType: {} };
  for (const line of log.split("\n")) {
    // A run may contain several `stat` passes (synth prints its own); keep the last.
    if (/Printing statistics/i.test(line)) {
      stats = { cells: 0, ffs: 0, byType: {} };
      continue;
    }
    let m = line.match(/^\s*(\d+)\s+cells\s*$/);
    if (m) {
      stats.cells += parseInt(m[1], 10);
      continue;
    }
    m = line.match(/^\s*(\d+)\s+(\$[\w$]+)\s*$/);
    if (m) {
      const count = parseInt(m[1], 10);
      const name = m[2];
      stats.byType[name] = (stats.byType[name] || 0) + count;
      if (/dff|dlatch|latch|sr_|_ff/i.test(name)) stats.ffs += count;
    }
  }
  return stats;
}

export async function synthesize(input) {
  const { top, flatten, mode, lib } = input;
  const files = normalizeFiles(input).filter((f) => f.content.trim());
  return withTempDir(async (dir) => {
    if (files.length === 0) {
      return { ok: false, stage: "synthesize", log: "No design files to synthesize." };
    }
    const names = await writeFiles(dir, files);
    const jsonPath = join(dir, "netlist.json");

    const topArg = top && top.trim() ? `-top ${top.trim()}` : "-auto-top";
    const flattenArg = flatten ? "; flatten" : "";

    let script;
    if (mode === "gate" && typeof lib === "string" && lib.trim()) {
      // Liberty-mapped gate-level synthesis — matches the in-browser flow so
      // the cell types line up with the area/timing/power reports.
      await writeFile(join(dir, "cells.lib"), lib);
      script = [
        `read_liberty -lib cells.lib`,
        `read_verilog -sv ${names.join(" ")}`,
        `synth ${topArg}${flattenArg}`,
        `dfflibmap -liberty cells.lib`,
        `abc -liberty cells.lib`,
        `opt_clean`,
        `stat -liberty cells.lib`,
        `write_json netlist.json`,
      ].join("; ");
    } else if (mode === "gate") {
      // Fallback: generic logic gates + flip-flops (no liberty supplied).
      script = [
        `read_verilog -sv ${names.join(" ")}`,
        `synth ${topArg}${flattenArg}`,
        `abc -g AND,OR,XOR,MUX`,
        `opt_clean`,
        `stat`,
        `write_json netlist.json`,
      ].join("; ");
    } else {
      // A readable RTL-level netlist for visualization, plus stats.
      script = [
        `read_verilog -sv ${names.join(" ")}`,
        `hierarchy ${topArg}`,
        `proc`,
        `opt`,
        `memory -nomap`,
        `opt`,
        `wreduce`,
        `opt -full${flattenArg}`,
        `stat`,
        `write_json netlist.json`,
      ].join("; ");
    }

    const ys = await run("yosys", ["-p", script], { cwd: dir });

    if (ys.timedOut) {
      return { ok: false, stage: "synthesize", log: "Synthesis timed out." };
    }
    if (ys.code !== 0) {
      return {
        ok: false,
        stage: "synthesize",
        log: (ys.stdout + ys.stderr).trim() || "Synthesis failed.",
      };
    }

    let netlist = null;
    try {
      netlist = await readFile(jsonPath, "utf8");
    } catch {
      return {
        ok: false,
        stage: "synthesize",
        log: "Yosys produced no netlist.\n\n" + (ys.stdout + ys.stderr).trim(),
      };
    }

    // Render schematic with netlistsvg (programmatic API).
    let svg = null;
    let renderError = null;
    try {
      svg = await renderNetlistSvg(netlist);
    } catch (e) {
      renderError = e?.message || String(e);
    }

    return {
      ok: true,
      stage: "done",
      netlist,
      svg,
      renderError,
      stats: { ...parseStat(ys.stdout || ys.stderr || ""), depth: criticalDepth(netlist) },
      srcMap: buildSrcMap(netlist),
      log: ys.stdout || ys.stderr || "Synthesis finished.",
    };
  });
}

function parseKiss2(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fsm = { inputs: 0, outputs: 0, numStates: 0, reset: "", states: [], transitions: [] };
  const stateSet = new Set();
  for (const line of lines) {
    if (line.startsWith(".i")) fsm.inputs = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".o")) fsm.outputs = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".s")) fsm.numStates = parseInt(line.slice(2), 10) || 0;
    else if (line.startsWith(".r")) fsm.reset = line.slice(2).trim();
    else if (line.startsWith(".p")) {
      /* product count — ignore */
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

// Identify likely state registers: identifiers that are BOTH switched on in a
// case() AND assigned with a non-blocking <= (i.e. registered). Used to force
// FSM extraction on machines Yosys' fsm_detect heuristic misses (1-bit state,
// or state held via a clock-enable, e.g. `next = state` defaults).
function stateRegNames(text) {
  const caseVars = new Set();
  const re1 = /\bcase[xz]?\s*\(\s*([A-Za-z_]\w*)\s*\)/g;
  let m;
  while ((m = re1.exec(text)) !== null) caseVars.add(m[1]);
  const regs = new Set();
  const re2 = /\b([A-Za-z_]\w*)\s*<=/g;
  while ((m = re2.exec(text)) !== null) regs.add(m[1]);
  return [...caseVars].filter((v) => regs.has(v));
}

function fsmScript(names, topArg, stateRegs) {
  const normal = [
    `read_verilog -sv ${names.join(" ")}`,
    `hierarchy ${topArg}`,
    `proc`,
    `opt`,
    `fsm_detect`,
    `fsm_extract`,
    `fsm_export -origenc -o fsm.kiss2`,
  ].join("; ");
  // Forced flow: avoid opt_dff (which factors a held state into a clock-enable
  // and breaks fsm_extract) and explicitly mark the parsed state register(s).
  const forced = stateRegs.length
    ? [
        `read_verilog -sv ${names.join(" ")}`,
        `hierarchy ${topArg}`,
        `proc`,
        `opt_expr`,
        `opt_clean`,
        `setattr -set fsm_encoding "auto" ${stateRegs.map((r) => "w:" + r).join(" ")}`,
        `fsm_extract`,
        `fsm_opt`,
        `opt_clean`,
        `fsm_export -origenc -o fsm.kiss2`,
      ].join("; ")
    : null;
  return { normal, forced };
}

export async function extractFsm(input) {
  const { top } = input;
  const files = normalizeFiles(input).filter((f) => f.content.trim() && f.kind !== "testbench");
  return withTempDir(async (dir) => {
    if (files.length === 0) {
      return { ok: false, fsm: null, log: "No design files to analyze for an FSM." };
    }
    const names = await writeFiles(dir, files);
    const topArg = top && top.trim() ? `-top ${top.trim()}` : "-auto-top";
    const stateRegs = stateRegNames(files.map((f) => f.content).join("\n"));
    const { normal, forced } = fsmScript(names, topArg, stateRegs);

    const readKiss = async () => {
      try {
        const txt = await readFile(join(dir, "fsm.kiss2"), "utf8");
        const fsm = parseKiss2(txt);
        return fsm.transitions.length ? fsm : null;
      } catch {
        return null;
      }
    };

    let ys = await run("yosys", ["-p", normal], { cwd: dir });
    if (ys.timedOut) return { ok: false, fsm: null, log: "FSM extraction timed out." };
    let fsm = ys.code === 0 ? await readKiss() : null;

    // Retry with the forced flow for FSMs that fsm_detect misses.
    if (!fsm && forced) {
      await rm(join(dir, "fsm.kiss2"), { force: true }).catch(() => {});
      ys = await run("yosys", ["-p", forced], { cwd: dir });
      if (ys.timedOut) return { ok: false, fsm: null, log: "FSM extraction timed out." };
      fsm = ys.code === 0 ? await readKiss() : null;
    }

    if (!fsm) {
      return {
        ok: true,
        fsm: null,
        log: "No finite-state machine was detected in this design. Yosys infers an FSM from a state register driven by a case/if on its own value.",
      };
    }
    return { ok: true, fsm, log: ys.stdout || "FSM extracted." };
  });
}

async function renderNetlistSvg(netlistJsonText) {
  const mod = await import("netlistsvg");
  const netlistsvg = mod.default ?? mod;
  // netlistsvg ships default skins. Load the built-in default skin.
  const { readFile: rf } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  let skinPath;
  try {
    skinPath = require.resolve("netlistsvg/lib/default.svg");
  } catch {
    skinPath = require.resolve("netlistsvg/built/default.svg");
  }
  const skin = await rf(skinPath, "utf8");
  const netlist = JSON.parse(netlistJsonText);
  const render = netlistsvg.render ?? netlistsvg;
  return await render(skin, netlist);
}
