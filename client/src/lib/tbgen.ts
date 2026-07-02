// Generates a self-contained Verilog testbench for a module, optionally driven
// by a per-input stimulus spec (used by the interactive-stimulus dialog). The
// output dumps a VCD so it slots straight into the existing waveform viewer.

import type { ModulePort, ParsedModule } from "./ports";

export type StimKind = "clock" | "reset" | "const" | "steps";

export interface PortStim {
  name: string;
  kind: StimKind;
  periodNs?: number; // clock
  value?: string; // const value (e.g. "0", "8'hA5")
  activeLow?: boolean; // reset
  assertNs?: number; // reset assert duration
  steps?: Array<{ timeNs: number; value: string }>; // steps
}

export interface TbSpec {
  top: string;
  ports: ModulePort[];
  stim: Record<string, PortStim>; // by input port name
  simEndNs: number;
  timescale: string; // e.g. "1ns / 1ps"
  instName: string;
}

// Prefer the numeric (param-resolved) range so the testbench compiles even when
// the design's port width depends on a parameter (e.g. [W-1:0] -> [3:0]).
const declRange = (p: ModulePort) => p.resolvedRange ?? p.rangeText;
const decl = (kind: "reg" | "wire", p: ModulePort) => {
  const r = declRange(p);
  return `  ${kind} ${r ? r + " " : ""}${p.name};`;
};

// A sensible default stimulus: clocks toggle, resets pulse, everything else 0.
export function defaultStim(ports: ModulePort[]): Record<string, PortStim> {
  const stim: Record<string, PortStim> = {};
  for (const p of ports) {
    if (p.dir !== "input") continue;
    if (p.isClock) stim[p.name] = { name: p.name, kind: "clock", periodNs: 10 };
    else if (p.isReset)
      stim[p.name] = { name: p.name, kind: "reset", activeLow: p.activeLow, assertNs: 20 };
    else stim[p.name] = { name: p.name, kind: "const", value: "0" };
  }
  return stim;
}

export function generateTestbench(spec: TbSpec): string {
  const inputs = spec.ports.filter((p) => p.dir === "input");
  const others = spec.ports.filter((p) => p.dir !== "input"); // output / inout -> wire
  const L: string[] = [];

  L.push(`\`timescale ${spec.timescale}`);
  L.push("");
  L.push(`// Auto-generated testbench for ${spec.top}`);
  L.push(`module ${spec.top}_tb;`);

  // Declarations.
  for (const p of inputs) L.push(decl("reg", p));
  for (const p of others) L.push(decl("wire", p));
  L.push("");

  // DUT instance (named connections).
  if (spec.ports.length) {
    L.push(`  ${spec.top} ${spec.instName} (`);
    L.push(spec.ports.map((p) => `    .${p.name}(${p.name})`).join(",\n"));
    L.push(`  );`);
  } else {
    L.push(`  ${spec.top} ${spec.instName} ();`);
  }
  L.push("");

  // Clocks.
  const clocks = inputs.filter((p) => spec.stim[p.name]?.kind === "clock");
  for (const p of clocks) {
    const period = Math.max(2, spec.stim[p.name].periodNs || 10);
    L.push(`  // ${p.name}: ${period} ns clock`);
    L.push(`  initial ${p.name} = 1'b0;`);
    L.push(`  always #(${period / 2}) ${p.name} = ~${p.name};`);
  }
  if (clocks.length) L.push("");

  // Initial block: VCD dump setup, constant inputs, and reset assert/release.
  // Stepped inputs get their own concurrent initial block below.
  L.push(`  initial begin`);
  L.push(`    $dumpfile("dump.vcd");`);
  L.push(`    $dumpvars(0, ${spec.top}_tb);`);

  // Constants + reset asserted values applied at t=0.
  for (const p of inputs) {
    const s = spec.stim[p.name];
    if (!s) continue;
    if (s.kind === "const") L.push(`    ${p.name} = ${s.value ?? "0"};`);
    else if (s.kind === "reset") L.push(`    ${p.name} = ${s.activeLow ? "1'b0" : "1'b1"}; // asserted`);
  }

  // Reset release at an absolute time from t=0.
  const resets = inputs.filter((p) => spec.stim[p.name]?.kind === "reset");
  const maxAssert = resets.length ? Math.max(...resets.map((p) => spec.stim[p.name].assertNs || 20)) : 0;
  if (resets.length) {
    L.push("");
    L.push(`    #(${maxAssert});`);
    for (const p of resets) {
      const s = spec.stim[p.name];
      L.push(`    ${p.name} = ${s.activeLow ? "1'b1" : "1'b0"}; // released`);
    }
  }
  L.push(`  end`);

  // Stop the run at an absolute end time, so "Sim length" is the real end of the
  // simulation (and always lands after any reset release), decoupled from the
  // stimulus blocks. Kept in its own initial block for the same reason.
  const endNs = Math.max(spec.simEndNs, maxAssert + 1);
  L.push("");
  L.push(`  // End of simulation`);
  L.push(`  initial begin`);
  L.push(`    #(${endNs});`);
  L.push(`    $display("Simulation finished at %0t", $time);`);
  L.push(`    $finish;`);
  L.push(`  end`);

  // Stepped sequences. Each input gets its OWN initial block so all sequences
  // run concurrently on the same t=0 timeline — give two inputs the same time
  // and they change together (e.g. a "1:1" and b "1:1" both fire at t=1). The
  // #() delays are relative to the previous point in that input's sequence.
  const stepInputs = inputs.filter((p) => spec.stim[p.name]?.kind === "steps");
  for (const p of stepInputs) {
    const steps = (spec.stim[p.name].steps || []).slice().sort((a, b) => a.timeNs - b.timeNs);
    if (!steps.length) continue;
    L.push("");
    L.push(`  // ${p.name} sequence`);
    L.push(`  initial begin`);
    const zero = steps.find((st) => st.timeNs === 0);
    L.push(`    ${p.name} = ${zero ? zero.value : "0"}; // t=0`);
    let prev = 0;
    for (const st of steps) {
      if (st.timeNs === 0) continue; // already applied as the t=0 value
      const dt = Math.max(0, st.timeNs - prev);
      L.push(`    #(${dt}) ${p.name} = ${st.value}; // t=${st.timeNs}`);
      prev = st.timeNs;
    }
    L.push(`  end`);
  }

  L.push(`endmodule`);
  L.push("");
  return L.join("\n");
}

// Convenience: scaffold a default testbench straight from a parsed module.
export function scaffoldTestbench(mod: ParsedModule): string {
  const stim = defaultStim(mod.ports);
  const hasClock = mod.ports.some((p) => p.dir === "input" && p.isClock);
  return generateTestbench({
    top: mod.name,
    ports: mod.ports,
    stim,
    simEndNs: hasClock ? 200 : 100,
    timescale: "1ns / 1ps",
    instName: "dut",
  });
}
