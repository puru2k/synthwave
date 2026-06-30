import { MORE_SAMPLES } from "./moreSamples";

export interface SampleFile {
  name: string;
  content: string;
  kind: "design" | "testbench";
}

export interface Sample {
  name: string;
  category: string;
  design: string;
  testbench: string;
  top: string;
  // Optional: a multi-file project. When present this overrides the single
  // design.v / testbench.v pair so examples can ship several modules in
  // separate files (to exercise multi-file, multi-module designs).
  files?: SampleFile[];
}

// Order in which example categories appear in the sidebar folder.
export const CATEGORY_ORDER: string[] = [
  "Featured",
  "Logic Gates",
  "Arithmetic",
  "Multiplexers & Decoders",
  "Shifters & Rotators",
  "Bit Manipulation",
  "Buses & Extension",
  "Flip-Flops & Latches",
  "Registers",
  "Counters",
  "Finite State Machines",
  "Memory & FIFO",
  "CDC & Timing",
  "Arbiters & Control",
  "Processor",
  "Misc",
];

const RCA_FULL_ADDER = `// 1-bit full adder — a leaf cell, defined in its own file.
module full_adder (
    input  wire a,
    input  wire b,
    input  wire cin,
    output wire sum,
    output wire cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule
`;

const RCA_TOP = `// 4-bit ripple-carry adder: a chain of four full_adder instances.
// This module lives in a SEPARATE file from full_adder.v to exercise
// multi-file, multi-module elaboration and the Hierarchy view.
module ripple_carry_adder_4bit (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       cin,
    output wire [3:0] sum,
    output wire       cout
);
    wire c1, c2, c3;
    full_adder fa0 (.a(a[0]), .b(b[0]), .cin(cin), .sum(sum[0]), .cout(c1));
    full_adder fa1 (.a(a[1]), .b(b[1]), .cin(c1),  .sum(sum[1]), .cout(c2));
    full_adder fa2 (.a(a[2]), .b(b[2]), .cin(c2),  .sum(sum[2]), .cout(c3));
    full_adder fa3 (.a(a[3]), .b(b[3]), .cin(c3),  .sum(sum[3]), .cout(cout));
endmodule
`;

const RCA_TB = `\`timescale 1ns / 1ps
// Self-checking testbench. Drives random vectors and compares {cout,sum}
// against the expected 5-bit sum. Prints PASS/FAIL so the badge lights up.
module tb_ripple_carry_adder;
    reg  [3:0] a, b;
    reg        cin;
    wire [3:0] sum;
    wire       cout;
    integer    i, errors;
    reg  [4:0] expected;

    ripple_carry_adder_4bit dut (
        .a(a), .b(b), .cin(cin), .sum(sum), .cout(cout)
    );

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_ripple_carry_adder);
        errors = 0;
        for (i = 0; i < 12; i = i + 1) begin
            a   = $random;
            b   = $random;
            cin = $random;
            #5;
            expected = a + b + cin;
            if ({cout, sum} !== expected) begin
                $display("FAIL: %0d + %0d + %0d = %0d (got %0d)", a, b, cin, expected, {cout, sum});
                errors = errors + 1;
            end else begin
                $display("ok: %0d + %0d + %0d = %0d", a, b, cin, {cout, sum});
            end
            #5;
        end
        if (errors == 0) $display("All tests passed");
        else             $display("%0d test(s) failed", errors);
        $finish;
    end
endmodule
`;

const BASE_SAMPLES: Sample[] = [
  {
    name: "Hierarchical Adder (multi-file)",
    category: "Featured",
    top: "ripple_carry_adder_4bit",
    design: RCA_FULL_ADDER + "\n" + RCA_TOP,
    testbench: RCA_TB,
    files: [
      { name: "full_adder.v", content: RCA_FULL_ADDER, kind: "design" },
      { name: "ripple_carry_adder_4bit.v", content: RCA_TOP, kind: "design" },
      { name: "tb_ripple_carry_adder.v", content: RCA_TB, kind: "testbench" },
    ],
  },
  {
    name: "4-bit Counter",
    category: "Counters",
    top: "counter",
    design: `// A simple synchronous 4-bit up-counter with async reset
module counter (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    output reg  [3:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            count <= 4'b0000;
        else if (en)
            count <= count + 1'b1;
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0;
    reg rst_n = 0;
    reg en = 0;
    wire [3:0] count;

    counter dut (.clk(clk), .rst_n(rst_n), .en(en), .count(count));

    always #5 clk = ~clk;          // 100 MHz clock

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);

        rst_n = 0; en = 0;
        #12 rst_n = 1;
        #8  en = 1;
        #200 en = 0;
        #20 $finish;
    end
endmodule
`,
  },
  {
    name: "Full Adder",
    category: "Arithmetic",
    top: "full_adder",
    design: `// 1-bit full adder
module full_adder (
    input  wire a,
    input  wire b,
    input  wire cin,
    output wire sum,
    output wire cout
);
    assign sum  = a ^ b ^ cin;
    assign cout = (a & b) | (b & cin) | (a & cin);
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg a, b, cin;
    wire sum, cout;

    full_adder dut (.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));

    integer i;
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        for (i = 0; i < 8; i = i + 1) begin
            {a, b, cin} = i[2:0];
            #10;
        end
        $finish;
    end
endmodule
`,
  },
  {
    name: "4:1 Mux",
    category: "Multiplexers & Decoders",
    top: "mux4",
    design: `// 4-to-1 multiplexer
module mux4 (
    input  wire [3:0] d,
    input  wire [1:0] sel,
    output reg        y
);
    always @(*) begin
        case (sel)
            2'b00: y = d[0];
            2'b01: y = d[1];
            2'b10: y = d[2];
            2'b11: y = d[3];
        endcase
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg  [3:0] d;
    reg  [1:0] sel;
    wire       y;

    mux4 dut (.d(d), .sel(sel), .y(y));

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        d = 4'b1010;
        sel = 2'b00; #10;
        sel = 2'b01; #10;
        sel = 2'b10; #10;
        sel = 2'b11; #10;
        d = 4'b0101;
        sel = 2'b00; #10;
        sel = 2'b01; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Debouncer",
    category: "CDC & Timing",
    top: "debouncer",
    design: `// Switch/button debouncer: output changes only after the input has
// been stable (all-1s or all-0s) for N consecutive clock samples.
module debouncer #(
    parameter N = 4
) (
    input  wire clk,
    input  wire rst_n,
    input  wire noisy,
    output reg  clean
);
    reg [N-1:0] shift;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            shift <= {N{1'b0}};
            clean <= 1'b0;
        end else begin
            shift <= {shift[N-2:0], noisy};
            if (&shift)        // N ones in a row
                clean <= 1'b1;
            else if (~|shift)  // N zeros in a row
                clean <= 1'b0;
        end
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, noisy = 0;
    wire clean;

    debouncer #(.N(4)) dut (.clk(clk), .rst_n(rst_n), .noisy(noisy), .clean(clean));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;

        // Bouncing edge, then settles high
        noisy = 1; #7 noisy = 0; #6 noisy = 1; #4 noisy = 0; #5 noisy = 1;
        #100;
        // Bouncing release, then settles low
        noisy = 0; #6 noisy = 1; #4 noisy = 0;
        #100 $finish;
    end
endmodule
`,
  },
  {
    name: "Handshake + Reset",
    category: "Arbiters & Control",
    top: "handshake",
    design: `// Simple req/ack handshake with an asynchronous active-low reset.
// IDLE -> (req) -> ACK (asserts ack/busy) -> (req low) -> IDLE
module handshake (
    input  wire clk,
    input  wire rst_n,
    input  wire req,
    output reg  ack,
    output reg  busy
);
    localparam IDLE = 1'b0, ACK = 1'b1;
    reg state;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= IDLE;
            ack   <= 1'b0;
            busy  <= 1'b0;
        end else begin
            case (state)
                IDLE: if (req) begin
                          state <= ACK;
                          ack   <= 1'b1;
                          busy  <= 1'b1;
                      end
                ACK:  if (!req) begin
                          state <= IDLE;
                          ack   <= 1'b0;
                          busy  <= 1'b0;
                      end
            endcase
        end
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, req = 0;
    wire ack, busy;

    handshake dut (.clk(clk), .rst_n(rst_n), .req(req), .ack(ack), .busy(busy));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;

        #10 req = 1;   // raise request
        #30 req = 0;   // release
        #20 req = 1;   // second transaction
        #20 req = 0;
        #30 $finish;
    end
endmodule
`,
  },
  {
    name: "Fibonacci Generator",
    category: "Misc",
    top: "fibonacci",
    design: `// Streams the Fibonacci sequence: emits a new term each enabled cycle.
module fibonacci (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        en,
    output reg  [31:0] value
);
    reg [31:0] prev;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            value <= 32'd1;
            prev  <= 32'd0;
        end else if (en) begin
            value <= value + prev;
            prev  <= value;
        end
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, en = 0;
    wire [31:0] value;

    fibonacci dut (.clk(clk), .rst_n(rst_n), .en(en), .value(value));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;
        #8  en = 1;
        #150 $finish;
    end
endmodule
`,
  },
  {
    name: "Clock Gating",
    category: "CDC & Timing",
    top: "clock_gating",
    design: `// Latch-based clock gating: the enable is captured on the low phase of
// the clock to avoid glitches, then ANDed to produce the gated clock that
// drives a counter. (RTL model of an integrated clock-gating cell.)
module clock_gating (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    output reg  [3:0] count
);
    reg en_latch;

    // Transparent-low latch keeps 'en' stable while clk is high.
    always @(*)
        if (~clk)
            en_latch = en;

    wire gclk = clk & en_latch;

    always @(posedge gclk or negedge rst_n) begin
        if (!rst_n)
            count <= 4'd0;
        else
            count <= count + 4'd1;
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, en = 0;
    wire [3:0] count;

    clock_gating dut (.clk(clk), .rst_n(rst_n), .en(en), .count(count));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;
        #10 en = 1;   // counter runs (clock passes)
        #60 en = 0;   // clock gated off -> counter holds
        #30 en = 1;   // resumes
        #60 $finish;
    end
endmodule
`,
  },
  {
    name: "Valid-Ready Pipeline",
    category: "Arbiters & Control",
    top: "valid_ready_stage",
    design: `// One register stage of a valid/ready (AXI-Stream style) pipeline.
// Accepts data when in_valid && in_ready; backpressures when the
// downstream is not ready (in_ready deasserts while holding data).
module valid_ready_stage #(
    parameter WIDTH = 8
) (
    input  wire             clk,
    input  wire             rst_n,
    // upstream
    input  wire [WIDTH-1:0] in_data,
    input  wire             in_valid,
    output wire             in_ready,
    // downstream
    output reg  [WIDTH-1:0] out_data,
    output reg              out_valid,
    input  wire             out_ready
);
    // Ready to take new data when our register is empty or being drained.
    assign in_ready = !out_valid || out_ready;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_valid <= 1'b0;
            out_data  <= {WIDTH{1'b0}};
        end else if (in_ready) begin
            out_valid <= in_valid;
            out_data  <= in_data;
        end
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg              clk = 0, rst_n = 0;
    reg  [7:0]       in_data = 0;
    reg              in_valid = 0, out_ready = 0;
    wire             in_ready, out_valid;
    wire [7:0]       out_data;

    valid_ready_stage #(.WIDTH(8)) dut (
        .clk(clk), .rst_n(rst_n),
        .in_data(in_data), .in_valid(in_valid), .in_ready(in_ready),
        .out_data(out_data), .out_valid(out_valid), .out_ready(out_ready)
    );

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;

        // Stream three items; downstream stalls in the middle.
        in_valid = 1; in_data = 8'hA1; out_ready = 1; #10;
        in_data = 8'hB2; #10;
        out_ready = 0; in_data = 8'hC3; #20;  // backpressure
        out_ready = 1; #10;
        in_valid = 0; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Edge Detector",
    category: "CDC & Timing",
    top: "edge_detector",
    design: `// Detects rising, falling, and any edges of a signal by comparing it
// with its registered (one-cycle-delayed) version.
module edge_detector (
    input  wire clk,
    input  wire rst_n,
    input  wire sig,
    output wire rising,
    output wire falling,
    output wire any_edge
);
    reg sig_d;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            sig_d <= 1'b0;
        else
            sig_d <= sig;
    end

    assign rising   =  sig & ~sig_d;
    assign falling  = ~sig &  sig_d;
    assign any_edge =  sig ^  sig_d;
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, sig = 0;
    wire rising, falling, any_edge;

    edge_detector dut (.clk(clk), .rst_n(rst_n), .sig(sig),
                       .rising(rising), .falling(falling), .any_edge(any_edge));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;
        #13 sig = 1;   // rising edge -> 1-cycle pulse on 'rising'
        #30 sig = 0;   // falling edge -> pulse on 'falling'
        #20 sig = 1;
        #10 sig = 0;
        #20 $finish;
    end
endmodule
`,
  },
  {
    name: "2-FF Synchronizer",
    category: "CDC & Timing",
    top: "synchronizer_2ff",
    design: `// Two-flop synchronizer: safely brings an asynchronous 1-bit signal into
// the clk domain, reducing the chance of propagating metastability.
module synchronizer_2ff (
    input  wire clk,
    input  wire rst_n,
    input  wire async_in,
    output wire sync_out
);
    reg ff1, ff2;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            ff1 <= 1'b0;
            ff2 <= 1'b0;
        end else begin
            ff1 <= async_in;  // may be metastable
            ff2 <= ff1;        // resolved, synchronized
        end
    end

    assign sync_out = ff2;
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, async_in = 0;
    wire sync_out;

    synchronizer_2ff dut (.clk(clk), .rst_n(rst_n), .async_in(async_in), .sync_out(sync_out));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; #12 rst_n = 1;
        // Change the async input off the clock edge; watch the 2-cycle delay.
        #8  async_in = 1;
        #23 async_in = 0;
        #17 async_in = 1;
        #40 $finish;
    end
endmodule
`,
  },
  {
    name: "1011 Detector (Moore)",
    category: "Finite State Machines",
    top: "seq_detector_1011_moore",
    design: `// Moore FSM detecting the overlapping sequence "1011" on 'din'.
// Output 'detected' is a function of state only (asserts the cycle the
// machine is in the accepting state S4).
module seq_detector_1011_moore (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output wire detected
);
    localparam S0 = 3'd0, // initial / no match
               S1 = 3'd1, // "1"
               S2 = 3'd2, // "10"
               S3 = 3'd3, // "101"
               S4 = 3'd4; // "1011" (accept)
    reg [2:0] state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        case (state)
            S0: next = din ? S1 : S0;
            S1: next = din ? S1 : S2;
            S2: next = din ? S3 : S0;
            S3: next = din ? S4 : S2;
            S4: next = din ? S1 : S2; // overlap: trailing '1' starts anew
            default: next = S0;
        endcase
    end

    assign detected = (state == S4);
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, din = 0;
    wire detected;
    integer i;
    reg [15:0] stream = 16'b1011_1011_0110_1100; // feeds MSB-first

    seq_detector_1011_moore dut (.clk(clk), .rst_n(rst_n), .din(din), .detected(detected));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; din = 0; #12 rst_n = 1;
        for (i = 15; i >= 0; i = i - 1) begin
            din = stream[i];
            #10;
        end
        #10 $finish;
    end
endmodule
`,
  },
  {
    name: "1010 Detector (Mealy)",
    category: "Finite State Machines",
    top: "seq_detector_1010_mealy",
    design: `// Mealy FSM detecting the overlapping sequence "1010" on 'din'.
// Output 'detected' depends on both state and the current input, so it
// asserts on the same cycle as the final bit.
module seq_detector_1010_mealy (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output reg  detected
);
    localparam S0 = 2'd0, // initial
               S1 = 2'd1, // "1"
               S2 = 2'd2, // "10"
               S3 = 2'd3; // "101"
    reg [1:0] state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        next = state;
        detected = 1'b0;
        case (state)
            S0: next = din ? S1 : S0;
            S1: next = din ? S1 : S2;
            S2: next = din ? S3 : S0;
            S3: begin
                    if (din) begin
                        next = S1;
                    end else begin
                        next = S2;          // overlap: "...10" remains
                        detected = 1'b1;     // completed "1010"
                    end
                end
        endcase
    end
endmodule
`,
    testbench: `\`timescale 1ns/1ps
module tb;
    reg clk = 0, rst_n = 0, din = 0;
    wire detected;
    integer i;
    reg [15:0] stream = 16'b1010_1010_0101_0100; // feeds MSB-first

    seq_detector_1010_mealy dut (.clk(clk), .rst_n(rst_n), .din(din), .detected(detected));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb);
        rst_n = 0; din = 0; #12 rst_n = 1;
        for (i = 15; i >= 0; i = i - 1) begin
            din = stream[i];
            #10;
        end
        #10 $finish;
    end
endmodule
`,
  },
];

export const SAMPLES: Sample[] = [...BASE_SAMPLES, ...MORE_SAMPLES];
