import { describe, it, expect } from "vitest";
import { parseModules, findModule } from "../ports";
import { generateTestbench, defaultStim, type TbSpec } from "../tbgen";

const build = (src: string, name: string, overrides?: Partial<TbSpec>): string => {
  const mod = findModule(parseModules([{ name: `${name}.v`, content: src }]), name)!;
  const base = defaultStim(mod.ports);
  const { stim: stimOverride, ...rest } = overrides ?? {};
  return generateTestbench({
    top: mod.name,
    ports: mod.ports,
    simEndNs: 100,
    timescale: "1ns / 1ps",
    instName: "dut",
    ...rest,
    stim: { ...base, ...(stimOverride ?? {}) },
  });
};

describe("generateTestbench — combinational", () => {
  const src = "module addr(input [3:0] a, input [3:0] b, output [4:0] sum); endmodule";

  it("declares reg inputs, wire outputs and instantiates by name", () => {
    const tb = build(src, "addr");
    expect(tb).toContain("reg [3:0] a;");
    expect(tb).toContain("reg [3:0] b;");
    expect(tb).toContain("wire [4:0] sum;");
    expect(tb).toContain(".a(a)");
    expect(tb).toContain(".sum(sum)");
  });

  it("has no clock and stops at the sim length", () => {
    const tb = build(src, "addr", { simEndNs: 80 });
    expect(tb).not.toContain("always #");
    expect(tb).toContain("#(80);");
    expect(tb).toContain("$finish;");
  });

  it("drives two sequences in separate concurrent initial blocks", () => {
    const tb = build(src, "addr", {
      stim: {
        a: { name: "a", kind: "steps", steps: [{ timeNs: 1, value: "1" }, { timeNs: 2, value: "2" }] },
        b: { name: "b", kind: "steps", steps: [{ timeNs: 1, value: "3" }] },
      },
    });
    // One initial block per stepped input (plus dump + finish blocks).
    expect(tb.match(/initial begin/g)!.length).toBeGreaterThanOrEqual(4);
    expect(tb).toContain("// a sequence");
    expect(tb).toContain("// b sequence");
    // Both first steps are relative to t=0, so both fire at t=1 concurrently.
    expect(tb).toContain("#(1) a = 1;");
    expect(tb).toContain("#(1) b = 3;");
  });
});

describe("generateTestbench — sequential", () => {
  const src = `
    module counter(input clk, input rst_n, input en, output reg [3:0] count);
    endmodule
  `;

  it("generates a free-running clock", () => {
    const tb = build(src, "counter", { simEndNs: 200 });
    expect(tb).toContain("initial clk = 1'b0;");
    expect(tb).toContain("always #(5) clk = ~clk;");
  });

  it("asserts then releases an active-low reset", () => {
    const tb = build(src, "counter", { simEndNs: 200 });
    expect(tb).toContain("rst_n = 1'b0; // asserted");
    expect(tb).toContain("rst_n = 1'b1; // released");
  });

  it("ends after the reset release even if sim length is short", () => {
    // assert defaults to 20ns; a 5ns sim length is bumped to maxAssert + 1 = 21.
    const tb = build(src, "counter", { simEndNs: 5 });
    expect(tb).toContain("#(21);");
  });
});
