import { describe, it, expect } from "vitest";
import { parseVcd, valueAtTime } from "../vcd";

const VCD = `
$timescale 1ns $end
$scope module tb $end
$var wire 1 ! clk $end
$var wire 4 # count $end
$upscope $end
$enddefinitions $end
#0
0!
b0000 #
#5
1!
b0001 #
#10
0!
$end
`;

describe("parseVcd", () => {
  const data = parseVcd(VCD);

  it("reads the timescale and signals", () => {
    expect(data.timescale).toContain("ns");
    expect(data.signals.map((s) => s.name).sort()).toEqual(["clk", "count"]);
  });

  it("records signal widths", () => {
    expect(data.signals.find((s) => s.name === "count")!.width).toBe(4);
  });

  it("tracks the end time", () => {
    expect(data.endTime).toBe(10);
  });

  it("returns the value held at a given time", () => {
    const clk = data.signals.find((s) => s.name === "clk")!;
    expect(valueAtTime(clk, 0)).toBe("0");
    expect(valueAtTime(clk, 6)).toBe("1");
    expect(valueAtTime(clk, 10)).toBe("0");
  });
});
