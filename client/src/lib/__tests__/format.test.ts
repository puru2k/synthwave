import { describe, it, expect } from "vitest";
import { formatVerilog } from "../format";

const messy = `module m(input a,input b,output y);
assign y=a&b;
always @(*) begin
if(a) y=1;
else y=0;
end
endmodule`;

describe("formatVerilog", () => {
  it("is idempotent (formatting twice changes nothing)", () => {
    const once = formatVerilog(messy);
    const twice = formatVerilog(once);
    expect(twice).toBe(once);
  });

  it("indents nested blocks", () => {
    const out = formatVerilog(messy);
    const lines = out.split("\n");
    const assignLine = lines.find((l) => l.includes("assign y"))!;
    expect(assignLine.startsWith("  ")).toBe(true);
  });

  it("preserves module/endmodule structure", () => {
    const out = formatVerilog(messy);
    expect(out).toContain("module m");
    expect(out.trim().endsWith("endmodule")).toBe(true);
  });
});
