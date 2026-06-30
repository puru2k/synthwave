import { describe, it, expect } from "vitest";
import { parseModules, findModule } from "../ports";

describe("parseModules", () => {
  const src = `
    module counter #(parameter WIDTH = 8) (
      input wire clk,
      input wire rst_n,
      input wire en,
      output reg [WIDTH-1:0] count
    );
    endmodule
  `;
  const mods = parseModules([{ name: "counter.v", content: src }]);
  const counter = findModule(mods, "counter")!;

  it("finds the module and all ports", () => {
    expect(counter).toBeTruthy();
    expect(counter.ports.map((p) => p.name).sort()).toEqual(["clk", "count", "en", "rst_n"]);
  });

  it("classifies directions", () => {
    expect(counter.ports.find((p) => p.name === "clk")!.dir).toBe("input");
    expect(counter.ports.find((p) => p.name === "count")!.dir).toBe("output");
  });

  it("detects clock and active-low reset", () => {
    expect(counter.ports.find((p) => p.name === "clk")!.isClock).toBe(true);
    const rst = counter.ports.find((p) => p.name === "rst_n")!;
    expect(rst.isReset).toBe(true);
    expect(rst.activeLow).toBe(true);
  });

  it("resolves parameterized width from the default", () => {
    expect(counter.ports.find((p) => p.name === "count")!.width).toBe(8);
  });

  it("parses multiple modules across files", () => {
    const a = "module a(input x, output y); endmodule";
    const b = "module b(input p, output q); endmodule";
    const parsed = parseModules([
      { name: "a.v", content: a },
      { name: "b.v", content: b },
    ]);
    expect(parsed.map((m) => m.name).sort()).toEqual(["a", "b"]);
  });
});
