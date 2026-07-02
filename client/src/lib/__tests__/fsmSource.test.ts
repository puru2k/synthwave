import { describe, it, expect } from "vitest";
import { extractFsmFromSource } from "../fsmSource";

// Textbook Moore detector: output is a pure function of state (asserted in S3).
const moore = `
module moore_1011 (
  input clk, input rst, input din,
  output reg y
);
  localparam S0 = 3'd0, S1 = 3'd1, S2 = 3'd2, S3 = 3'd3;
  reg [2:0] state, next;
  always @(posedge clk) if (rst) state <= S0; else state <= next;
  always @(*) begin
    next = state;
    case (state)
      S0: next = din ? S1 : S0;
      S1: next = din ? S1 : S2;
      S2: next = din ? S3 : S0;
      S3: next = din ? S1 : S2;
    endcase
  end
  always @(*) begin
    y = 1'b0;
    if (state == S3) y = 1'b1;
  end
endmodule
`;

// Textbook Mealy detector: output depends on state AND input (on the transition).
const mealy = `
module mealy_1010 (
  input clk, input rst, input din,
  output reg y
);
  localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2, S3 = 2'd3;
  reg [1:0] state, next;
  always @(posedge clk) if (rst) state <= S0; else state <= next;
  always @(*) begin
    next = state; y = 1'b0;
    case (state)
      S0: next = din ? S1 : S0;
      S1: next = din ? S1 : S2;
      S2: begin next = din ? S3 : S0; end
      S3: begin next = din ? S1 : S2; y = din ? 1'b0 : 1'b1; end
    endcase
  end
endmodule
`;

describe("extractFsmFromSource", () => {
  it("classifies a state-dependent output FSM as Moore", () => {
    const fsm = extractFsmFromSource([{ name: "m.v", content: moore }], "moore_1011");
    expect(fsm).toBeTruthy();
    expect(fsm!.kind).toBe("moore");
    expect(fsm!.numStates).toBe(4);
  });

  it("classifies an input-dependent output FSM as Mealy", () => {
    const fsm = extractFsmFromSource([{ name: "m.v", content: mealy }], "mealy_1010");
    expect(fsm).toBeTruthy();
    expect(fsm!.kind).toBe("mealy");
  });

  it("extracts correct guarded transitions for the overlapping 1011 Moore detector", () => {
    const fsm = extractFsmFromSource([{ name: "m.v", content: moore }], "moore_1011")!;
    const edge = (from: string, to: string) => fsm.transitions.find((t) => t.from === from && t.to === to);
    // S2 branches: din -> S3, else -> S0 (the transition the diagram flagged).
    expect(edge("S2", "S3")?.cond).toBe("din");
    expect(edge("S2", "S0")?.cond).toBe("!din");
    // S2<->S3 is a genuine bidirectional pair (S3 -> S2 on !din).
    expect(edge("S3", "S2")?.cond).toBe("!din");
    // Moore: detected/output lives in the accepting state, not on edges.
    expect(fsm.stateOutputs?.S3).toContain("y=1");
  });

  it("returns null for a non-FSM module", () => {
    const fsm = extractFsmFromSource(
      [{ name: "x.v", content: "module add(input [3:0] a, b, output [3:0] s); assign s = a + b; endmodule" }],
      "add"
    );
    expect(fsm).toBeNull();
  });
});
