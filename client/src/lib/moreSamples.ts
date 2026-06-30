import type { Sample } from "./samples";

// Shared timescale prelude for testbenches. Kept in a plain string so the
// backtick directive does not collide with JS template literals below.
const TS = "`timescale 1ns/1ps\n";

export const MORE_SAMPLES: Sample[] = [
  // ===================== Logic Gates =====================
  {
    name: "Inverter (NOT)",
    category: "Logic Gates",
    top: "not_gate",
    design: `// Single-bit inverter
module not_gate (
    input  wire a,
    output wire y
);
    assign y = ~a;
endmodule
`,
    testbench: TS + `module tb;
    reg a; wire y;
    not_gate dut (.a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a = 0; #10; a = 1; #10; a = 0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "AND Gate",
    category: "Logic Gates",
    top: "and_gate",
    design: `module and_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = a & b;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    and_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "OR Gate",
    category: "Logic Gates",
    top: "or_gate",
    design: `module or_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = a | b;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    or_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "NAND Gate",
    category: "Logic Gates",
    top: "nand_gate",
    design: `module nand_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = ~(a & b);
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    nand_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "NOR Gate",
    category: "Logic Gates",
    top: "nor_gate",
    design: `module nor_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = ~(a | b);
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    nor_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "XOR Gate",
    category: "Logic Gates",
    top: "xor_gate",
    design: `module xor_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = a ^ b;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    xor_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "XNOR Gate",
    category: "Logic Gates",
    top: "xnor_gate",
    design: `module xnor_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = ~(a ^ b);
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire y;
    xnor_gate dut (.a(a), .b(b), .y(y));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Buffer",
    category: "Logic Gates",
    top: "buffer",
    design: `module buffer (
    input  wire a,
    output wire y
);
    assign y = a;
endmodule
`,
    testbench: TS + `module tb;
    reg a; wire y;
    buffer dut (.a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a = 0; #10; a = 1; #10; a = 0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Tri-state Buffer",
    category: "Logic Gates",
    top: "tristate_buffer",
    design: `// Drives the output when enabled, otherwise high-impedance (z).
module tristate_buffer (
    input  wire a,
    input  wire en,
    output wire y
);
    assign y = en ? a : 1'bz;
endmodule
`,
    testbench: TS + `module tb;
    reg a, en; wire y;
    tristate_buffer dut (.a(a), .en(en), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a = 1; en = 0; #10;   // hi-Z
        en = 1; #10;          // drives 1
        a = 0; #10;           // drives 0
        en = 0; #10;          // hi-Z
        $finish;
    end
endmodule
`,
  },

  // ===================== Arithmetic =====================
  {
    name: "Half Adder",
    category: "Arithmetic",
    top: "half_adder",
    design: `module half_adder (
    input  wire a,
    input  wire b,
    output wire sum,
    output wire carry
);
    assign sum   = a ^ b;
    assign carry = a & b;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire sum, carry;
    half_adder dut (.a(a), .b(b), .sum(sum), .carry(carry));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Half Subtractor",
    category: "Arithmetic",
    top: "half_subtractor",
    design: `module half_subtractor (
    input  wire a,
    input  wire b,
    output wire diff,
    output wire borrow
);
    assign diff   = a ^ b;
    assign borrow = ~a & b;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b; wire diff, borrow;
    half_subtractor dut (.a(a), .b(b), .diff(diff), .borrow(borrow));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 4; i = i + 1) begin {a, b} = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Full Subtractor",
    category: "Arithmetic",
    top: "full_subtractor",
    design: `module full_subtractor (
    input  wire a,
    input  wire b,
    input  wire bin,
    output wire diff,
    output wire bout
);
    assign diff = a ^ b ^ bin;
    assign bout = (~a & b) | (~(a ^ b) & bin);
endmodule
`,
    testbench: TS + `module tb;
    reg a, b, bin; wire diff, bout;
    full_subtractor dut (.a(a), .b(b), .bin(bin), .diff(diff), .bout(bout));
    integer i;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 8; i = i + 1) begin {a, b, bin} = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Ripple Carry Adder",
    category: "Arithmetic",
    top: "ripple_carry_adder",
    design: `// 4-bit ripple-carry adder built from a chain of full-adder slices.
module ripple_carry_adder (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       cin,
    output wire [3:0] sum,
    output wire       cout
);
    wire c1, c2, c3;
    assign {c1,   sum[0]} = a[0] + b[0] + cin;
    assign {c2,   sum[1]} = a[1] + b[1] + c1;
    assign {c3,   sum[2]} = a[2] + b[2] + c2;
    assign {cout, sum[3]} = a[3] + b[3] + c3;
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b; reg cin; wire [3:0] sum; wire cout;
    ripple_carry_adder dut (.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd3;  b=4'd4;  cin=0; #10;
        a=4'd9;  b=4'd7;  cin=0; #10;
        a=4'd15; b=4'd1;  cin=0; #10;
        a=4'd8;  b=4'd8;  cin=1; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Carry Lookahead Adder",
    category: "Arithmetic",
    top: "cla_adder",
    design: `// 4-bit carry-lookahead adder using generate/propagate terms.
module cla_adder (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       cin,
    output wire [3:0] sum,
    output wire       cout
);
    wire [3:0] g = a & b;   // generate
    wire [3:0] p = a ^ b;   // propagate
    wire [4:0] c;
    assign c[0] = cin;
    assign c[1] = g[0] | (p[0] & c[0]);
    assign c[2] = g[1] | (p[1] & c[1]);
    assign c[3] = g[2] | (p[2] & c[2]);
    assign c[4] = g[3] | (p[3] & c[3]);
    assign sum  = p ^ c[3:0];
    assign cout = c[4];
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b; reg cin; wire [3:0] sum; wire cout;
    cla_adder dut (.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd6; b=4'd5; cin=0; #10;
        a=4'd12; b=4'd9; cin=0; #10;
        a=4'd15; b=4'd15; cin=1; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Carry Select Adder",
    category: "Arithmetic",
    top: "carry_select_adder",
    design: `// 4-bit carry-select adder: high nibble is computed for both possible
// carry-ins and the correct result is selected by the low-nibble carry.
module carry_select_adder (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire       cin,
    output wire [3:0] sum,
    output wire       cout
);
    wire [2:0] low = a[1:0] + b[1:0] + cin;     // {carry, sum[1:0]}
    wire [2:0] hi0 = a[3:2] + b[3:2] + 1'b0;
    wire [2:0] hi1 = a[3:2] + b[3:2] + 1'b1;
    wire [2:0] hi  = low[2] ? hi1 : hi0;
    assign sum  = {hi[1:0], low[1:0]};
    assign cout = hi[2];
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b; reg cin; wire [3:0] sum; wire cout;
    carry_select_adder dut (.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd7; b=4'd8; cin=0; #10;
        a=4'd3; b=4'd3; cin=1; #10;
        a=4'd15; b=4'd2; cin=0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Carry Save Adder",
    category: "Arithmetic",
    top: "carry_save_adder",
    design: `// Carry-save adder: reduces 3 operands to a sum and carry vector.
// (A final adder would combine sum + (carry << 1) for the true result.)
module carry_save_adder #(
    parameter W = 4
) (
    input  wire [W-1:0] a,
    input  wire [W-1:0] b,
    input  wire [W-1:0] c,
    output wire [W-1:0] sum,
    output wire [W-1:0] carry
);
    assign sum   = a ^ b ^ c;
    assign carry = (a & b) | (b & c) | (a & c);
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b, c; wire [3:0] sum, carry;
    carry_save_adder #(.W(4)) dut (.a(a), .b(b), .c(c), .sum(sum), .carry(carry));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd5; b=4'd3; c=4'd6; #10;
        a=4'd1; b=4'd1; c=4'd1; #10;
        a=4'd15; b=4'd15; c=4'd15; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Incrementer",
    category: "Arithmetic",
    top: "incrementer",
    design: `module incrementer #(
    parameter W = 8
) (
    input  wire [W-1:0] a,
    output wire [W-1:0] y
);
    assign y = a + 1'b1;
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a; wire [7:0] y;
    incrementer #(.W(8)) dut (.a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'd0; #10; a=8'd41; #10; a=8'd254; #10; a=8'd255; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Decrementer",
    category: "Arithmetic",
    top: "decrementer",
    design: `module decrementer #(
    parameter W = 8
) (
    input  wire [W-1:0] a,
    output wire [W-1:0] y
);
    assign y = a - 1'b1;
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a; wire [7:0] y;
    decrementer #(.W(8)) dut (.a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'd5; #10; a=8'd1; #10; a=8'd0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Comparator",
    category: "Arithmetic",
    top: "comparator",
    design: `// Equality comparator
module comparator #(
    parameter W = 4
) (
    input  wire [W-1:0] a,
    input  wire [W-1:0] b,
    output wire         eq
);
    assign eq = (a == b);
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b; wire eq;
    comparator #(.W(4)) dut (.a(a), .b(b), .eq(eq));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd5; b=4'd5; #10;
        a=4'd5; b=4'd6; #10;
        a=4'd0; b=4'd0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Magnitude Comparator",
    category: "Arithmetic",
    top: "magnitude_comparator",
    design: `// Produces greater-than, equal, and less-than flags.
module magnitude_comparator #(
    parameter W = 4
) (
    input  wire [W-1:0] a,
    input  wire [W-1:0] b,
    output wire         gt,
    output wire         eq,
    output wire         lt
);
    assign gt = (a > b);
    assign eq = (a == b);
    assign lt = (a < b);
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] a, b; wire gt, eq, lt;
    magnitude_comparator #(.W(4)) dut (.a(a), .b(b), .gt(gt), .eq(eq), .lt(lt));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=4'd3; b=4'd7; #10;
        a=4'd9; b=4'd9; #10;
        a=4'd12; b=4'd4; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Absolute Difference",
    category: "Arithmetic",
    top: "abs_diff",
    design: `// Unsigned |a - b|
module abs_diff #(
    parameter W = 8
) (
    input  wire [W-1:0] a,
    input  wire [W-1:0] b,
    output wire [W-1:0] d
);
    assign d = (a >= b) ? (a - b) : (b - a);
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a, b; wire [7:0] d;
    abs_diff #(.W(8)) dut (.a(a), .b(b), .d(d));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'd10; b=8'd3;  #10;
        a=8'd3;  b=8'd10; #10;
        a=8'd50; b=8'd50; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Multiplier (Shift-and-Add)",
    category: "Arithmetic",
    top: "mult_shift_add",
    design: `// Sequential shift-and-add unsigned multiplier.
// Assert 'start' for one cycle; 'done' pulses when 'product' is valid.
module mult_shift_add #(
    parameter W = 4
) (
    input  wire           clk,
    input  wire           rst_n,
    input  wire           start,
    input  wire [W-1:0]   a,
    input  wire [W-1:0]   b,
    output reg  [2*W-1:0] product,
    output reg            done
);
    reg [2*W-1:0] acc;      // {partial product, remaining multiplier}
    reg [W-1:0]   mcand;
    reg [3:0]     cnt;
    reg           busy;

    // Add multiplicand into the high half when the LSB is set, then shift right.
    wire [2*W-1:0] addend = acc[0] ? {mcand, {W{1'b0}}} : {(2*W){1'b0}};
    wire [2*W-1:0] step   = (acc + addend) >> 1;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            busy <= 1'b0; done <= 1'b0; product <= 0; acc <= 0; cnt <= 0; mcand <= 0;
        end else begin
            done <= 1'b0;
            if (start && !busy) begin
                acc   <= {{W{1'b0}}, b};
                mcand <= a;
                cnt   <= 0;
                busy  <= 1'b1;
            end else if (busy) begin
                acc <= step;
                cnt <= cnt + 1'b1;
                if (cnt == W-1) begin
                    busy    <= 1'b0;
                    done    <= 1'b1;
                    product <= step;
                end
            end
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, start=0; reg [3:0] a, b; wire [7:0] product; wire done;
    mult_shift_add #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .start(start),
                                 .a(a), .b(b), .product(product), .done(done));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        a=4'd13; b=4'd11; start=1; #10 start=0;
        #80;
        a=4'd7; b=4'd6; start=1; #10 start=0;
        #80 $finish;
    end
endmodule
`,
  },
  {
    name: "Divider (Basic)",
    category: "Arithmetic",
    top: "divider_basic",
    design: `// Sequential restoring divider (unsigned).
// Assert 'start'; 'done' pulses when quotient/remainder are valid.
module divider_basic #(
    parameter W = 8
) (
    input  wire           clk,
    input  wire           rst_n,
    input  wire           start,
    input  wire [W-1:0]   dividend,
    input  wire [W-1:0]   divisor,
    output reg  [W-1:0]   quotient,
    output reg  [W-1:0]   remainder,
    output reg            done
);
    reg [2*W-1:0] rq;       // {remainder, quotient}
    reg [W-1:0]   divs;
    reg [3:0]     cnt;
    reg           busy;

    wire [2*W-1:0] shifted = rq << 1;
    wire [W-1:0]   top     = shifted[2*W-1:W];
    wire           ge      = (top >= divs);
    wire [2*W-1:0] nxt     = ge ? {top - divs, shifted[W-1:1], 1'b1} : shifted;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            busy<=0; done<=0; quotient<=0; remainder<=0; rq<=0; divs<=0; cnt<=0;
        end else begin
            done <= 1'b0;
            if (start && !busy) begin
                rq   <= {{W{1'b0}}, dividend};
                divs <= divisor;
                cnt  <= 0;
                busy <= 1'b1;
            end else if (busy) begin
                rq  <= nxt;
                cnt <= cnt + 1'b1;
                if (cnt == W-1) begin
                    busy      <= 1'b0;
                    done      <= 1'b1;
                    quotient  <= nxt[W-1:0];
                    remainder <= nxt[2*W-1:W];
                end
            end
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, start=0; reg [7:0] dividend, divisor;
    wire [7:0] quotient, remainder; wire done;
    divider_basic #(.W(8)) dut (.clk(clk), .rst_n(rst_n), .start(start),
        .dividend(dividend), .divisor(divisor),
        .quotient(quotient), .remainder(remainder), .done(done));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        dividend=8'd100; divisor=8'd7; start=1; #10 start=0;
        #120;
        dividend=8'd45; divisor=8'd5; start=1; #10 start=0;
        #120 $finish;
    end
endmodule
`,
  },

  // ===================== Multiplexers & Decoders =====================
  {
    name: "2:1 Multiplexer",
    category: "Multiplexers & Decoders",
    top: "mux2",
    design: `module mux2 (
    input  wire a,
    input  wire b,
    input  wire sel,
    output wire y
);
    assign y = sel ? b : a;
endmodule
`,
    testbench: TS + `module tb;
    reg a, b, sel; wire y;
    mux2 dut (.a(a), .b(b), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=0; b=1; sel=0; #10; sel=1; #10;
        a=1; b=0; sel=0; #10; sel=1; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "8:1 Multiplexer",
    category: "Multiplexers & Decoders",
    top: "mux8",
    design: `module mux8 (
    input  wire [7:0] d,
    input  wire [2:0] sel,
    output wire       y
);
    assign y = d[sel];
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] d; reg [2:0] sel; wire y; integer i;
    mux8 dut (.d(d), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d = 8'b1010_0110;
        for (i = 0; i < 8; i = i + 1) begin sel = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Parameterized Multiplexer",
    category: "Multiplexers & Decoders",
    top: "mux_param",
    design: `// N-input, W-bit multiplexer. Inputs are packed into one bus.
module mux_param #(
    parameter W = 8,
    parameter N = 4
) (
    input  wire [N*W-1:0]      data,
    input  wire [$clog2(N)-1:0] sel,
    output wire [W-1:0]        y
);
    assign y = data[sel*W +: W];
endmodule
`,
    testbench: TS + `module tb;
    reg [31:0] data; reg [1:0] sel; wire [7:0] y; integer i;
    mux_param #(.W(8), .N(4)) dut (.data(data), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data = {8'hDD, 8'hCC, 8'hBB, 8'hAA};   // index 0 = AA
        for (i = 0; i < 4; i = i + 1) begin sel = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "1:2 Demultiplexer",
    category: "Multiplexers & Decoders",
    top: "demux2",
    design: `module demux2 (
    input  wire d,
    input  wire sel,
    output wire y0,
    output wire y1
);
    assign y0 = sel ? 1'b0 : d;
    assign y1 = sel ? d    : 1'b0;
endmodule
`,
    testbench: TS + `module tb;
    reg d, sel; wire y0, y1;
    demux2 dut (.d(d), .sel(sel), .y0(y0), .y1(y1));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1; sel=0; #10; sel=1; #10; d=0; sel=0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "1:4 Demultiplexer",
    category: "Multiplexers & Decoders",
    top: "demux4",
    design: `module demux4 (
    input  wire       d,
    input  wire [1:0] sel,
    output reg  [3:0] y
);
    always @(*) begin
        y = 4'b0000;
        y[sel] = d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg d; reg [1:0] sel; wire [3:0] y; integer i;
    demux4 dut (.d(d), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1;
        for (i = 0; i < 4; i = i + 1) begin sel = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "1:8 Demultiplexer",
    category: "Multiplexers & Decoders",
    top: "demux8",
    design: `module demux8 (
    input  wire       d,
    input  wire [2:0] sel,
    output reg  [7:0] y
);
    always @(*) begin
        y = 8'b0;
        y[sel] = d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg d; reg [2:0] sel; wire [7:0] y; integer i;
    demux8 dut (.d(d), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1;
        for (i = 0; i < 8; i = i + 1) begin sel = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "2-to-4 Decoder",
    category: "Multiplexers & Decoders",
    top: "decoder2to4",
    design: `module decoder2to4 (
    input  wire       en,
    input  wire [1:0] a,
    output reg  [3:0] y
);
    always @(*) begin
        y = 4'b0000;
        if (en) y[a] = 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg en; reg [1:0] a; wire [3:0] y; integer i;
    decoder2to4 dut (.en(en), .a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        en=0; a=2'b10; #10; en=1;
        for (i = 0; i < 4; i = i + 1) begin a = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "3-to-8 Decoder",
    category: "Multiplexers & Decoders",
    top: "decoder3to8",
    design: `module decoder3to8 (
    input  wire       en,
    input  wire [2:0] a,
    output reg  [7:0] y
);
    always @(*) begin
        y = 8'b0;
        if (en) y[a] = 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg en; reg [2:0] a; wire [7:0] y; integer i;
    decoder3to8 dut (.en(en), .a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        en=1;
        for (i = 0; i < 8; i = i + 1) begin a = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "4-to-16 Decoder",
    category: "Multiplexers & Decoders",
    top: "decoder4to16",
    design: `module decoder4to16 (
    input  wire        en,
    input  wire [3:0]  a,
    output reg  [15:0] y
);
    always @(*) begin
        y = 16'b0;
        if (en) y[a] = 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg en; reg [3:0] a; wire [15:0] y; integer i;
    decoder4to16 dut (.en(en), .a(a), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        en=1;
        for (i = 0; i < 16; i = i + 1) begin a = i[3:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "8-to-3 Encoder",
    category: "Multiplexers & Decoders",
    top: "encoder8to3",
    design: `// Binary encoder for a one-hot input (assumes exactly one bit set).
module encoder8to3 (
    input  wire [7:0] a,
    output reg  [2:0] y,
    output wire       valid
);
    assign valid = |a;
    always @(*) begin
        case (a)
            8'b0000_0001: y = 3'd0;
            8'b0000_0010: y = 3'd1;
            8'b0000_0100: y = 3'd2;
            8'b0000_1000: y = 3'd3;
            8'b0001_0000: y = 3'd4;
            8'b0010_0000: y = 3'd5;
            8'b0100_0000: y = 3'd6;
            8'b1000_0000: y = 3'd7;
            default:      y = 3'd0;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a; wire [2:0] y; wire valid; integer i;
    encoder8to3 dut (.a(a), .y(y), .valid(valid));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'b0; #10;
        for (i = 0; i < 8; i = i + 1) begin a = (8'b1 << i); #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Priority Encoder",
    category: "Multiplexers & Decoders",
    top: "priority_encoder",
    design: `// Returns the index of the highest-priority (MSB) asserted input.
module priority_encoder (
    input  wire [7:0] a,
    output reg  [2:0] y,
    output wire       valid
);
    assign valid = |a;
    integer i;
    always @(*) begin
        y = 3'd0;
        for (i = 0; i < 8; i = i + 1)
            if (a[i]) y = i[2:0];   // last set bit wins -> highest index
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a; wire [2:0] y; wire valid;
    priority_encoder dut (.a(a), .y(y), .valid(valid));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'b0000_0000; #10;
        a=8'b0000_0101; #10;   // bits 0 and 2 -> 2
        a=8'b1001_0000; #10;   // -> 7
        a=8'b0000_1000; #10;   // -> 3
        $finish;
    end
endmodule
`,
  },
  {
    name: "One-Hot Encoder",
    category: "Multiplexers & Decoders",
    top: "onehot_encoder",
    design: `// Converts a binary index into a one-hot output.
module onehot_encoder #(
    parameter W = 3
) (
    input  wire [W-1:0]      bin,
    output wire [(1<<W)-1:0] onehot
);
    assign onehot = {{((1<<W)-1){1'b0}}, 1'b1} << bin;
endmodule
`,
    testbench: TS + `module tb;
    reg [2:0] bin; wire [7:0] onehot; integer i;
    onehot_encoder #(.W(3)) dut (.bin(bin), .onehot(onehot));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 8; i = i + 1) begin bin = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Binary-to-One-Hot Decoder",
    category: "Multiplexers & Decoders",
    top: "bin2onehot",
    design: `// Binary value to one-hot, gated by enable.
module bin2onehot #(
    parameter W = 3
) (
    input  wire              en,
    input  wire [W-1:0]      bin,
    output reg  [(1<<W)-1:0] onehot
);
    always @(*) begin
        onehot = {(1<<W){1'b0}};
        if (en) onehot[bin] = 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg en; reg [2:0] bin; wire [7:0] onehot; integer i;
    bin2onehot #(.W(3)) dut (.en(en), .bin(bin), .onehot(onehot));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        en=0; bin=3'd4; #10;         en=1;
        for (i = 0; i < 8; i = i + 1) begin bin = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },

  // ===================== Shifters & Rotators =====================
  {
    name: "Barrel Shifter",
    category: "Shifters & Rotators",
    top: "barrel_shifter",
    design: `// Combinational logarithmic barrel shifter (logical), left or right.
module barrel_shifter #(
    parameter W = 8
) (
    input  wire [W-1:0]          data,
    input  wire [$clog2(W)-1:0]  shamt,
    input  wire                  left,   // 1 = shift left, 0 = shift right
    output wire [W-1:0]          y
);
    assign y = left ? (data << shamt) : (data >> shamt);
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] data; reg [2:0] shamt; reg left; wire [7:0] y; integer i;
    barrel_shifter #(.W(8)) dut (.data(data), .shamt(shamt), .left(left), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=8'b0001_0110; left=1;
        for (i = 0; i < 5; i = i + 1) begin shamt = i[2:0]; #10; end
        left=0;
        for (i = 0; i < 5; i = i + 1) begin shamt = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Arithmetic Shifter",
    category: "Shifters & Rotators",
    top: "arith_shifter",
    design: `// Arithmetic shift (sign-preserving on right shift).
module arith_shifter #(
    parameter W = 8
) (
    input  wire signed [W-1:0]  data,
    input  wire [$clog2(W)-1:0] shamt,
    input  wire                 left,
    output wire signed [W-1:0]  y
);
    assign y = left ? (data <<< shamt) : (data >>> shamt);
endmodule
`,
    testbench: TS + `module tb;
    reg signed [7:0] data; reg [2:0] shamt; reg left; wire signed [7:0] y; integer i;
    arith_shifter #(.W(8)) dut (.data(data), .shamt(shamt), .left(left), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=-8'sd40; left=0;
        for (i = 0; i < 4; i = i + 1) begin shamt = i[2:0]; #10; end
        data=8'sd24; left=1;
        for (i = 0; i < 3; i = i + 1) begin shamt = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Logical Shifter",
    category: "Shifters & Rotators",
    top: "logical_shifter",
    design: `// Logical shift (zero fill) in both directions.
module logical_shifter #(
    parameter W = 8
) (
    input  wire [W-1:0]          data,
    input  wire [$clog2(W)-1:0]  shamt,
    input  wire                  left,
    output wire [W-1:0]          y
);
    assign y = left ? (data << shamt) : (data >> shamt);
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] data; reg [2:0] shamt; reg left; wire [7:0] y; integer i;
    logical_shifter #(.W(8)) dut (.data(data), .shamt(shamt), .left(left), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=8'b1100_0011; left=0;
        for (i = 0; i < 4; i = i + 1) begin shamt = i[2:0]; #10; end
        left=1;
        for (i = 0; i < 4; i = i + 1) begin shamt = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Rotator",
    category: "Shifters & Rotators",
    top: "rotator",
    design: `// Barrel rotator: rotate left or right by shamt positions.
module rotator #(
    parameter W = 8
) (
    input  wire [W-1:0]          data,
    input  wire [$clog2(W)-1:0]  shamt,
    input  wire                  left,
    output wire [W-1:0]          y
);
    wire [2*W-1:0] doubled = {data, data};
    // Right-rotate by shamt; left-rotate is a right-rotate by (W - shamt).
    wire [$clog2(W):0] r = left ? (W - shamt) : shamt;
    assign y = doubled[r +: W];
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] data; reg [2:0] shamt; reg left; wire [7:0] y; integer i;
    rotator #(.W(8)) dut (.data(data), .shamt(shamt), .left(left), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=8'b1000_0001; left=0;
        for (i = 0; i < 8; i = i + 1) begin shamt = i[2:0]; #10; end
        left=1;
        for (i = 0; i < 8; i = i + 1) begin shamt = i[2:0]; #10; end
        $finish;
    end
endmodule
`,
  },

  // ===================== Bit Manipulation =====================
  {
    name: "Leading Zero Detector (LZD)",
    category: "Bit Manipulation",
    top: "lzd",
    design: `// Counts leading zeros of an 8-bit value (8 means all-zero input).
module lzd (
    input  wire [7:0] in,
    output reg  [3:0] lzc
);
    always @(*) begin
        casez (in)
            8'b1???????: lzc = 4'd0;
            8'b01??????: lzc = 4'd1;
            8'b001?????: lzc = 4'd2;
            8'b0001????: lzc = 4'd3;
            8'b00001???: lzc = 4'd4;
            8'b000001??: lzc = 4'd5;
            8'b0000001?: lzc = 4'd6;
            8'b00000001: lzc = 4'd7;
            default:     lzc = 4'd8;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] in; wire [3:0] lzc;
    lzd dut (.in(in), .lzc(lzc));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        in=8'b1000_0000; #10;
        in=8'b0010_0110; #10;
        in=8'b0000_0001; #10;
        in=8'b0000_0000; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Population Counter (Popcount)",
    category: "Bit Manipulation",
    top: "popcount",
    design: `// Counts the number of set bits in an 8-bit word.
module popcount (
    input  wire [7:0] in,
    output wire [3:0] count
);
    assign count = in[0] + in[1] + in[2] + in[3]
                 + in[4] + in[5] + in[6] + in[7];
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] in; wire [3:0] count;
    popcount dut (.in(in), .count(count));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        in=8'b0000_0000; #10;
        in=8'b1010_1010; #10;
        in=8'b1111_0001; #10;
        in=8'b1111_1111; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Binary-to-Gray Converter",
    category: "Bit Manipulation",
    top: "bin2gray",
    design: `module bin2gray #(
    parameter W = 4
) (
    input  wire [W-1:0] bin,
    output wire [W-1:0] gray
);
    assign gray = bin ^ (bin >> 1);
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] bin; wire [3:0] gray; integer i;
    bin2gray #(.W(4)) dut (.bin(bin), .gray(gray));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 16; i = i + 1) begin bin = i[3:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Gray-to-Binary Converter",
    category: "Bit Manipulation",
    top: "gray2bin",
    design: `module gray2bin #(
    parameter W = 4
) (
    input  wire [W-1:0] gray,
    output reg  [W-1:0] bin
);
    integer i;
    always @(*) begin
        bin[W-1] = gray[W-1];
        for (i = W-2; i >= 0; i = i - 1)
            bin[i] = bin[i+1] ^ gray[i];
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] gray; wire [3:0] bin; integer i;
    gray2bin #(.W(4)) dut (.gray(gray), .bin(bin));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 16; i = i + 1) begin gray = i ^ (i >> 1); #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Parity Generator",
    category: "Bit Manipulation",
    top: "parity_generator",
    design: `// Generates even and odd parity bits for a data word.
module parity_generator #(
    parameter W = 8
) (
    input  wire [W-1:0] data,
    output wire         even_parity,
    output wire         odd_parity
);
    assign even_parity = ^data;     // 1 if odd number of ones
    assign odd_parity  = ~(^data);
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] data; wire even_parity, odd_parity;
    parity_generator #(.W(8)) dut (.data(data), .even_parity(even_parity), .odd_parity(odd_parity));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=8'b0000_0000; #10;
        data=8'b0000_0001; #10;
        data=8'b1100_0011; #10;
        data=8'b1110_0000; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Parity Checker",
    category: "Bit Manipulation",
    top: "parity_checker",
    design: `// Checks received data + parity bit for an even-parity error.
module parity_checker #(
    parameter W = 8
) (
    input  wire [W-1:0] data,
    input  wire         parity_in,
    output wire         error
);
    assign error = (^data) ^ parity_in;
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] data; reg parity_in; wire error;
    parity_checker #(.W(8)) dut (.data(data), .parity_in(parity_in), .error(error));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        data=8'b1100_0011; parity_in=1'b0; #10;   // even ones -> no error
        data=8'b1100_0011; parity_in=1'b1; #10;   // error
        data=8'b1110_0000; parity_in=1'b1; #10;   // odd ones -> ok
        $finish;
    end
endmodule
`,
  },
  {
    name: "CRC Generator (Basic)",
    category: "Bit Manipulation",
    top: "crc8",
    design: `// Serial CRC-8 generator (polynomial x^8 + x^2 + x + 1, 0x07).
module crc8 (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    input  wire       din,
    output reg  [7:0] crc
);
    wire fb = crc[7] ^ din;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            crc <= 8'h00;
        else if (en)
            crc <= {crc[6:0], 1'b0} ^ (fb ? 8'h07 : 8'h00);
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0, din=0; wire [7:0] crc;
    reg [7:0] msg = 8'b1011_0010; integer i;
    crc8 dut (.clk(clk), .rst_n(rst_n), .en(en), .din(din), .crc(crc));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; en=1;
        for (i = 7; i >= 0; i = i - 1) begin din = msg[i]; #10; end
        en=0; #20 $finish;
    end
endmodule
`,
  },
  {
    name: "Bit Reversal Circuit",
    category: "Bit Manipulation",
    top: "bit_reverse",
    design: `module bit_reverse #(
    parameter W = 8
) (
    input  wire [W-1:0] in,
    output wire [W-1:0] out
);
    genvar i;
    generate
        for (i = 0; i < W; i = i + 1) begin : rev
            assign out[i] = in[W-1-i];
        end
    endgenerate
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] in; wire [7:0] out;
    bit_reverse #(.W(8)) dut (.in(in), .out(out));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        in=8'b0000_0001; #10;
        in=8'b1010_0000; #10;
        in=8'b1100_1010; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Bit Counter",
    category: "Bit Manipulation",
    top: "bit_counter",
    design: `// Counts the number of 1s seen on a serial input over time.
module bit_counter (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    input  wire       din,
    output reg  [7:0] ones
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            ones <= 8'd0;
        else if (en && din)
            ones <= ones + 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0, din=0; wire [7:0] ones;
    reg [11:0] stream = 12'b1011_0110_1110; integer i;
    bit_counter dut (.clk(clk), .rst_n(rst_n), .en(en), .din(din), .ones(ones));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; en=1;
        for (i = 11; i >= 0; i = i - 1) begin din = stream[i]; #10; end
        en=0; #20 $finish;
    end
endmodule
`,
  },
  {
    name: "Sticky Bit Generator",
    category: "Bit Manipulation",
    top: "sticky_bit",
    design: `// Latches high on the first cycle any input bit is set; clears on reset.
module sticky_bit (
    input  wire       clk,
    input  wire       rst_n,
    input  wire [7:0] in,
    output reg        sticky
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            sticky <= 1'b0;
        else if (|in)
            sticky <= 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; reg [7:0] in=0; wire sticky;
    sticky_bit dut (.clk(clk), .rst_n(rst_n), .in(in), .sticky(sticky));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        in=8'h00; #20;
        in=8'h04; #10;     // sets sticky
        in=8'h00; #30;     // stays set
        $finish;
    end
endmodule
`,
  },
  {
    name: "One-Hot to Binary Converter",
    category: "Bit Manipulation",
    top: "onehot2bin",
    design: `module onehot2bin (
    input  wire [7:0] onehot,
    output reg  [2:0] bin,
    output reg        valid
);
    integer i;
    always @(*) begin
        bin   = 3'd0;
        valid = 1'b0;
        for (i = 0; i < 8; i = i + 1)
            if (onehot[i]) begin
                bin   = i[2:0];
                valid = 1'b1;
            end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] onehot; wire [2:0] bin; wire valid; integer i;
    onehot2bin dut (.onehot(onehot), .bin(bin), .valid(valid));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        onehot=8'b0; #10;
        for (i = 0; i < 8; i = i + 1) begin onehot = (8'b1 << i); #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Binary to BCD Converter",
    category: "Bit Manipulation",
    top: "bin2bcd",
    design: `// Double-dabble: converts an 8-bit binary value (0-255) to 3 BCD digits.
module bin2bcd (
    input  wire [7:0]  bin,
    output reg  [11:0] bcd   // {hundreds, tens, ones}
);
    integer i;
    always @(*) begin
        bcd = 12'd0;
        for (i = 7; i >= 0; i = i - 1) begin
            if (bcd[3:0]   >= 5) bcd[3:0]   = bcd[3:0]   + 3;
            if (bcd[7:4]   >= 5) bcd[7:4]   = bcd[7:4]   + 3;
            if (bcd[11:8]  >= 5) bcd[11:8]  = bcd[11:8]  + 3;
            bcd = {bcd[10:0], bin[i]};
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] bin; wire [11:0] bcd;
    bin2bcd dut (.bin(bin), .bcd(bcd));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        bin=8'd0;   #10;
        bin=8'd9;   #10;
        bin=8'd42;  #10;
        bin=8'd199; #10;
        bin=8'd255; #10;
        $finish;
    end
endmodule
`,
  },

  // ===================== Buses & Extension =====================
  {
    name: "Bus Multiplexer",
    category: "Buses & Extension",
    top: "bus_mux",
    design: `// Selects one of four 8-bit buses.
module bus_mux (
    input  wire [7:0] a,
    input  wire [7:0] b,
    input  wire [7:0] c,
    input  wire [7:0] d,
    input  wire [1:0] sel,
    output reg  [7:0] y
);
    always @(*) begin
        case (sel)
            2'd0: y = a;
            2'd1: y = b;
            2'd2: y = c;
            2'd3: y = d;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a, b, c, d; reg [1:0] sel; wire [7:0] y; integer i;
    bus_mux dut (.a(a), .b(b), .c(c), .d(d), .sel(sel), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'hA0; b=8'hB1; c=8'hC2; d=8'hD3;
        for (i = 0; i < 4; i = i + 1) begin sel = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Bus Demultiplexer",
    category: "Buses & Extension",
    top: "bus_demux",
    design: `// Routes an 8-bit bus to one of four outputs (others held at 0).
module bus_demux (
    input  wire [7:0] din,
    input  wire [1:0] sel,
    output reg  [7:0] y0,
    output reg  [7:0] y1,
    output reg  [7:0] y2,
    output reg  [7:0] y3
);
    always @(*) begin
        {y0, y1, y2, y3} = 32'b0;
        case (sel)
            2'd0: y0 = din;
            2'd1: y1 = din;
            2'd2: y2 = din;
            2'd3: y3 = din;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] din; reg [1:0] sel; wire [7:0] y0, y1, y2, y3; integer i;
    bus_demux dut (.din(din), .sel(sel), .y0(y0), .y1(y1), .y2(y2), .y3(y3));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        din=8'h5A;
        for (i = 0; i < 4; i = i + 1) begin sel = i[1:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Bus Splitter",
    category: "Buses & Extension",
    top: "bus_splitter",
    design: `// Splits a 16-bit bus into high and low bytes.
module bus_splitter (
    input  wire [15:0] bus,
    output wire [7:0]  hi,
    output wire [7:0]  lo
);
    assign hi = bus[15:8];
    assign lo = bus[7:0];
endmodule
`,
    testbench: TS + `module tb;
    reg [15:0] bus; wire [7:0] hi, lo;
    bus_splitter dut (.bus(bus), .hi(hi), .lo(lo));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        bus=16'hDEAD; #10; bus=16'hBEEF; #10; bus=16'h1234; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Bus Concatenation",
    category: "Buses & Extension",
    top: "bus_concat",
    design: `// Joins two bytes into a 16-bit bus.
module bus_concat (
    input  wire [7:0]  hi,
    input  wire [7:0]  lo,
    output wire [15:0] bus
);
    assign bus = {hi, lo};
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] hi, lo; wire [15:0] bus;
    bus_concat dut (.hi(hi), .lo(lo), .bus(bus));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        hi=8'hDE; lo=8'hAD; #10;
        hi=8'h12; lo=8'h34; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Sign Extension",
    category: "Buses & Extension",
    top: "sign_extend",
    design: `// Sign-extends an 8-bit value to 16 bits.
module sign_extend (
    input  wire [7:0]  in,
    output wire [15:0] out
);
    assign out = {{8{in[7]}}, in};
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] in; wire [15:0] out;
    sign_extend dut (.in(in), .out(out));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        in=8'h7F; #10;   // +127
        in=8'h80; #10;   // -128
        in=8'hFF; #10;   // -1
        $finish;
    end
endmodule
`,
  },
  {
    name: "Zero Extension",
    category: "Buses & Extension",
    top: "zero_extend",
    design: `// Zero-extends an 8-bit value to 16 bits.
module zero_extend (
    input  wire [7:0]  in,
    output wire [15:0] out
);
    assign out = {8'b0, in};
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] in; wire [15:0] out;
    zero_extend dut (.in(in), .out(out));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        in=8'h7F; #10; in=8'h80; #10; in=8'hFF; #10;
        $finish;
    end
endmodule
`,
  },

  // ===================== Flip-Flops & Latches =====================
  {
    name: "SR Latch",
    category: "Flip-Flops & Latches",
    top: "sr_latch",
    design: `// Set-reset latch (set dominant avoided; illegal s=r=1 holds).
module sr_latch (
    input  wire s,
    input  wire r,
    output reg  q,
    output wire qn
);
    always @(*) begin
        if (s & ~r)      q = 1'b1;
        else if (~s & r) q = 1'b0;
    end
    assign qn = ~q;
endmodule
`,
    testbench: TS + `module tb;
    reg s, r; wire q, qn;
    sr_latch dut (.s(s), .r(r), .q(q), .qn(qn));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        s=1; r=0; #10;   // set
        s=0; r=0; #10;   // hold
        s=0; r=1; #10;   // reset
        s=0; r=0; #10;   // hold
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Latch",
    category: "Flip-Flops & Latches",
    top: "d_latch",
    design: `// Level-sensitive D latch (transparent while en is high).
module d_latch (
    input  wire d,
    input  wire en,
    output reg  q
);
    always @(*)
        if (en) q = d;
endmodule
`,
    testbench: TS + `module tb;
    reg d, en; wire q;
    d_latch dut (.d(d), .en(en), .q(q));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        en=1; d=1; #10; d=0; #10;
        en=0; d=1; #10;   // holds 0
        en=1;       #10;  // becomes 1
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Flip-Flop",
    category: "Flip-Flops & Latches",
    top: "d_ff",
    design: `module d_ff (
    input  wire clk,
    input  wire d,
    output reg  q
);
    always @(posedge clk)
        q <= d;
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, d=0; wire q;
    d_ff dut (.clk(clk), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1; #10; d=0; #10; d=1; #20; d=0; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "JK Flip-Flop",
    category: "Flip-Flops & Latches",
    top: "jk_ff",
    design: `module jk_ff (
    input  wire clk,
    input  wire rst_n,
    input  wire j,
    input  wire k,
    output reg  q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= 1'b0;
        else case ({j, k})
            2'b00: q <= q;
            2'b01: q <= 1'b0;
            2'b10: q <= 1'b1;
            2'b11: q <= ~q;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, j=0, k=0; wire q;
    jk_ff dut (.clk(clk), .rst_n(rst_n), .j(j), .k(k), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        j=1; k=0; #10;   // set
        j=0; k=0; #10;   // hold
        j=1; k=1; #20;   // toggle
        j=0; k=1; #10;   // reset
        $finish;
    end
endmodule
`,
  },
  {
    name: "T Flip-Flop",
    category: "Flip-Flops & Latches",
    top: "t_ff",
    design: `module t_ff (
    input  wire clk,
    input  wire rst_n,
    input  wire t,
    output reg  q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= 1'b0;
        else if (t) q <= ~q;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, t=0; wire q;
    t_ff dut (.clk(clk), .rst_n(rst_n), .t(t), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        t=1; #40;   // toggles each clock
        t=0; #20;   // holds
        t=1; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Flip-Flop with Enable",
    category: "Flip-Flops & Latches",
    top: "dff_en",
    design: `module dff_en (
    input  wire clk,
    input  wire rst_n,
    input  wire en,
    input  wire d,
    output reg  q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)   q <= 1'b0;
        else if (en)  q <= d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0, d=0; wire q;
    dff_en dut (.clk(clk), .rst_n(rst_n), .en(en), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        d=1; en=0; #20;   // ignored
        en=1; #10;        // captures 1
        d=0; en=0; #20;   // holds 1
        en=1; #10;        // captures 0
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Flip-Flop with Synchronous Reset",
    category: "Flip-Flops & Latches",
    top: "dff_sync_rst",
    design: `module dff_sync_rst (
    input  wire clk,
    input  wire rst,
    input  wire d,
    output reg  q
);
    always @(posedge clk) begin
        if (rst) q <= 1'b0;
        else     q <= d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst=1, d=0; wire q;
    dff_sync_rst dut (.clk(clk), .rst(rst), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1; #12 rst=0; #20;
        rst=1; #10;       // sync clear on next edge
        rst=0; d=0; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Flip-Flop with Asynchronous Reset",
    category: "Flip-Flops & Latches",
    top: "dff_async_rst",
    design: `module dff_async_rst (
    input  wire clk,
    input  wire rst_n,
    input  wire d,
    output reg  q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= 1'b0;
        else        q <= d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=1, d=0; wire q;
    dff_async_rst dut (.clk(clk), .rst_n(rst_n), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        d=1; #13 rst_n=0; #7 rst_n=1;   // async clear mid-cycle
        #20 d=0; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "D Flip-Flop with Set/Reset",
    category: "Flip-Flops & Latches",
    top: "dff_set_reset",
    design: `// Synchronous set and reset (reset takes priority).
module dff_set_reset (
    input  wire clk,
    input  wire set,
    input  wire rst,
    input  wire d,
    output reg  q
);
    always @(posedge clk) begin
        if (rst)      q <= 1'b0;
        else if (set) q <= 1'b1;
        else          q <= d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, set=0, rst=0, d=0; wire q;
    dff_set_reset dut (.clk(clk), .set(set), .rst(rst), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        set=1; #10 set=0;     // set
        d=0;  #10;
        rst=1; #10 rst=0;     // reset
        d=1;  #20;
        $finish;
    end
endmodule
`,
  },

  // ===================== Registers =====================
  {
    name: "Register",
    category: "Registers",
    top: "reg_n",
    design: `// Parallel-load register with enable and async reset.
module reg_n #(
    parameter W = 8
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         ld,
    input  wire [W-1:0] d,
    output reg  [W-1:0] q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)  q <= {W{1'b0}};
        else if (ld) q <= d;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, ld=0; reg [7:0] d; wire [7:0] q;
    reg_n #(.W(8)) dut (.clk(clk), .rst_n(rst_n), .ld(ld), .d(d), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        d=8'hA5; ld=1; #10 ld=0;
        d=8'h3C; #20;
        ld=1; #10 ld=0; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Shift Register",
    category: "Registers",
    top: "shift_reg",
    design: `// Serial-in, parallel-out left shift register.
module shift_reg #(
    parameter W = 8
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         sin,
    output reg  [W-1:0] q,
    output wire         sout
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= {W{1'b0}};
        else        q <= {q[W-2:0], sin};
    end
    assign sout = q[W-1];
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, sin=0; wire [7:0] q; wire sout;
    reg [7:0] pattern = 8'b1011_0010; integer i;
    shift_reg #(.W(8)) dut (.clk(clk), .rst_n(rst_n), .sin(sin), .q(q), .sout(sout));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 7; i >= 0; i = i - 1) begin sin = pattern[i]; #10; end
        sin=0; #40 $finish;
    end
endmodule
`,
  },
  {
    name: "Universal Shift Register",
    category: "Registers",
    top: "univ_shift_reg",
    design: `// 74194-style register: hold, shift right, shift left, or parallel load.
module univ_shift_reg #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire [1:0]   mode,   // 00=hold 01=shift-right 10=shift-left 11=load
    input  wire         sr_in,  // serial-in for right shift (enters MSB)
    input  wire         sl_in,  // serial-in for left shift  (enters LSB)
    input  wire [W-1:0] pin,
    output reg  [W-1:0] q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= {W{1'b0}};
        else case (mode)
            2'b00: q <= q;
            2'b01: q <= {sr_in, q[W-1:1]};
            2'b10: q <= {q[W-2:0], sl_in};
            2'b11: q <= pin;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; reg [1:0] mode; reg sr_in, sl_in; reg [3:0] pin; wire [3:0] q;
    univ_shift_reg #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .mode(mode),
        .sr_in(sr_in), .sl_in(sl_in), .pin(pin), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; sr_in=1; sl_in=1; pin=4'b1001; #12 rst_n=1;
        mode=2'b11; #10;   // load 1001
        mode=2'b01; #20;   // shift right
        mode=2'b10; #20;   // shift left
        mode=2'b00; #10;   // hold
        $finish;
    end
endmodule
`,
  },

  // ===================== Counters =====================
  {
    name: "Up Counter",
    category: "Counters",
    top: "up_counter",
    design: `module up_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         en,
    output reg  [W-1:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)  count <= {W{1'b0}};
        else if (en) count <= count + 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0; wire [3:0] count;
    up_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .en(en), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #8 en=1; #200 $finish;
    end
endmodule
`,
  },
  {
    name: "Down Counter",
    category: "Counters",
    top: "down_counter",
    design: `module down_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         en,
    output reg  [W-1:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)  count <= {W{1'b1}};
        else if (en) count <= count - 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0; wire [3:0] count;
    down_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .en(en), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #8 en=1; #200 $finish;
    end
endmodule
`,
  },
  {
    name: "Up/Down Counter",
    category: "Counters",
    top: "updown_counter",
    design: `module updown_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         en,
    input  wire         up,    // 1 = count up, 0 = count down
    output reg  [W-1:0] count
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)       count <= {W{1'b0}};
        else if (en)      count <= up ? count + 1'b1 : count - 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0, up=1; wire [3:0] count;
    updown_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .en(en), .up(up), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; en=1; up=1; #100;
        up=0; #100 $finish;
    end
endmodule
`,
  },
  {
    name: "Mod-N Counter",
    category: "Counters",
    top: "mod_n_counter",
    design: `// Counts 0..N-1 then wraps.
module mod_n_counter #(
    parameter N = 10
) (
    input  wire                    clk,
    input  wire                    rst_n,
    output reg  [$clog2(N)-1:0]    count,
    output wire                    tick
);
    assign tick = (count == N-1);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)   count <= 0;
        else          count <= tick ? 0 : count + 1'b1;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire [3:0] count; wire tick;
    mod_n_counter #(.N(10)) dut (.clk(clk), .rst_n(rst_n), .count(count), .tick(tick));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #250 $finish;
    end
endmodule
`,
  },
  {
    name: "Ring Counter",
    category: "Counters",
    top: "ring_counter",
    design: `// Circulating single '1' (one-hot ring).
module ring_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    output reg  [W-1:0] q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= {{(W-1){1'b0}}, 1'b1};
        else        q <= {q[W-2:0], q[W-1]};
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire [3:0] q;
    ring_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #100 $finish;
    end
endmodule
`,
  },
  {
    name: "Johnson Counter",
    category: "Counters",
    top: "johnson_counter",
    design: `// Twisted-ring (Johnson) counter.
module johnson_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    output reg  [W-1:0] q
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) q <= {W{1'b0}};
        else        q <= {~q[0], q[W-1:1]};
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire [3:0] q;
    johnson_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .q(q));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #120 $finish;
    end
endmodule
`,
  },
  {
    name: "Gray Counter",
    category: "Counters",
    top: "gray_counter",
    design: `// Counts in Gray code (one bit changes per step).
module gray_counter #(
    parameter W = 4
) (
    input  wire         clk,
    input  wire         rst_n,
    input  wire         en,
    output reg  [W-1:0] gray
);
    reg [W-1:0] bin;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bin  <= {W{1'b0}};
            gray <= {W{1'b0}};
        end else if (en) begin
            bin  <= bin + 1'b1;
            gray <= (bin + 1'b1) ^ ((bin + 1'b1) >> 1);
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0; wire [3:0] gray;
    gray_counter #(.W(4)) dut (.clk(clk), .rst_n(rst_n), .en(en), .gray(gray));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; en=1; #200 $finish;
    end
endmodule
`,
  },
  {
    name: "LFSR",
    category: "Counters",
    top: "lfsr",
    design: `// 8-bit maximal-length Fibonacci LFSR (taps 8,6,5,4).
module lfsr (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    output reg  [7:0] lfsr
);
    wire fb = lfsr[7] ^ lfsr[5] ^ lfsr[4] ^ lfsr[3];
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)   lfsr <= 8'h01;     // non-zero seed
        else if (en)  lfsr <= {lfsr[6:0], fb};
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, en=0; wire [7:0] lfsr;
    lfsr dut (.clk(clk), .rst_n(rst_n), .en(en), .lfsr(lfsr));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; en=1; #300 $finish;
    end
endmodule
`,
  },
  {
    name: "Clock Divider",
    category: "Counters",
    top: "clock_divider",
    design: `// Divides the input clock frequency by DIV (DIV must be even).
module clock_divider #(
    parameter DIV = 4
) (
    input  wire clk,
    input  wire rst_n,
    output reg  clk_out
);
    reg [$clog2(DIV)-1:0] cnt;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cnt     <= 0;
            clk_out <= 1'b0;
        end else if (cnt == (DIV/2 - 1)) begin
            cnt     <= 0;
            clk_out <= ~clk_out;
        end else begin
            cnt <= cnt + 1'b1;
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire clk_out;
    clock_divider #(.DIV(4)) dut (.clk(clk), .rst_n(rst_n), .clk_out(clk_out));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #200 $finish;
    end
endmodule
`,
  },

  // ===================== Finite State Machines =====================
  {
    name: "Moore FSM",
    category: "Finite State Machines",
    top: "moore_fsm",
    design: `// Moore machine: asserts 'y' while in the accepting state reached after
// seeing two consecutive 1s ("11"). Output depends only on state.
module moore_fsm (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output reg  y
);
    localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;
    reg [1:0] state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        case (state)
            S0: next = din ? S1 : S0;
            S1: next = din ? S2 : S0;
            S2: next = din ? S2 : S0;
            default: next = S0;
        endcase
    end

    always @(*) y = (state == S2);
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, din=0; wire y;
    reg [11:0] stream = 12'b0110_1110_0011; integer i;
    moore_fsm dut (.clk(clk), .rst_n(rst_n), .din(din), .y(y));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 11; i >= 0; i = i - 1) begin din = stream[i]; #10; end
        #10 $finish;
    end
endmodule
`,
  },
  {
    name: "Mealy FSM",
    category: "Finite State Machines",
    top: "mealy_fsm",
    design: `// Mealy machine: 'y' asserts on the input that completes "11" (output is a
// function of state and current input, so it fires one cycle earlier).
module mealy_fsm (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output reg  y
);
    localparam S0 = 1'b0, S1 = 1'b1;
    reg state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        y = 1'b0;
        case (state)
            S0: next = din ? S1 : S0;
            S1: begin next = din ? S1 : S0; y = din; end
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, din=0; wire y;
    reg [11:0] stream = 12'b0110_1110_0011; integer i;
    mealy_fsm dut (.clk(clk), .rst_n(rst_n), .din(din), .y(y));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 11; i >= 0; i = i - 1) begin din = stream[i]; #10; end
        #10 $finish;
    end
endmodule
`,
  },
  {
    name: "Sequence Detector (Overlapping)",
    category: "Finite State Machines",
    top: "seq_overlap",
    design: `// Detects "110" with overlap allowed (the trailing context is reused).
module seq_overlap (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output wire detected
);
    localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;  // "", "1", "11"
    reg [1:0] state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        case (state)
            S0: next = din ? S1 : S0;
            S1: next = din ? S2 : S0;
            S2: next = din ? S2 : S0;   // on '0' -> detect, then back to S0
            default: next = S0;
        endcase
    end

    assign detected = (state == S2) & ~din;
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, din=0; wire detected;
    reg [11:0] stream = 12'b1101_1011_0110; integer i;
    seq_overlap dut (.clk(clk), .rst_n(rst_n), .din(din), .detected(detected));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 11; i >= 0; i = i - 1) begin din = stream[i]; #10; end
        #10 $finish;
    end
endmodule
`,
  },
  {
    name: "Sequence Detector (Non-overlapping)",
    category: "Finite State Machines",
    top: "seq_nonoverlap",
    design: `// Detects "110" without overlap: after a hit the machine restarts at S0.
module seq_nonoverlap (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output reg  detected
);
    localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;
    reg [1:0] state, next;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= S0;
        else        state <= next;
    end

    always @(*) begin
        detected = 1'b0;
        case (state)
            S0: next = din ? S1 : S0;
            S1: next = din ? S2 : S0;
            S2: begin
                    if (din) next = S2;
                    else begin next = S0; detected = 1'b1; end
                end
            default: next = S0;
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, din=0; wire detected;
    reg [11:0] stream = 12'b1101_1011_0110; integer i;
    seq_nonoverlap dut (.clk(clk), .rst_n(rst_n), .din(din), .detected(detected));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 11; i >= 0; i = i - 1) begin din = stream[i]; #10; end
        #10 $finish;
    end
endmodule
`,
  },
  {
    name: "Traffic Light Controller",
    category: "Finite State Machines",
    top: "traffic_light",
    design: `// Two-road traffic light with timed phases.
// Light encoding: 0=RED, 1=GREEN, 2=YELLOW.
module traffic_light (
    input  wire       clk,
    input  wire       rst_n,
    output reg  [1:0] ns,
    output reg  [1:0] ew
);
    localparam RED = 2'd0, GREEN = 2'd1, YELLOW = 2'd2;
    localparam S_NS_GREEN = 2'd0, S_NS_YELLOW = 2'd1,
               S_EW_GREEN = 2'd2, S_EW_YELLOW = 2'd3;
    localparam T_GREEN = 4'd6, T_YELLOW = 4'd2;

    reg [1:0] state;
    reg [3:0] timer;

    wire [3:0] dur = (state == S_NS_GREEN || state == S_EW_GREEN) ? T_GREEN : T_YELLOW;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= S_NS_GREEN;
            timer <= 4'd0;
        end else if (timer == dur - 1) begin
            timer <= 4'd0;
            case (state)
                S_NS_GREEN:  state <= S_NS_YELLOW;
                S_NS_YELLOW: state <= S_EW_GREEN;
                S_EW_GREEN:  state <= S_EW_YELLOW;
                S_EW_YELLOW: state <= S_NS_GREEN;
            endcase
        end else begin
            timer <= timer + 1'b1;
        end
    end

    always @(*) begin
        case (state)
            S_NS_GREEN:  begin ns = GREEN;  ew = RED;    end
            S_NS_YELLOW: begin ns = YELLOW; ew = RED;    end
            S_EW_GREEN:  begin ns = RED;    ew = GREEN;  end
            S_EW_YELLOW: begin ns = RED;    ew = YELLOW; end
            default:     begin ns = RED;    ew = RED;    end
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire [1:0] ns, ew;
    traffic_light dut (.clk(clk), .rst_n(rst_n), .ns(ns), .ew(ew));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #340 $finish;
    end
endmodule
`,
  },
  {
    name: "Vending Machine FSM",
    category: "Finite State Machines",
    top: "vending_machine",
    design: `// Accepts nickels (5) and dimes (10); dispenses at 15 and returns change.
module vending_machine (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       nickel,
    input  wire       dime,
    output reg        dispense,
    output reg        change      // returns 5 cents change
);
    localparam S0 = 2'd0, S5 = 2'd1, S10 = 2'd2;
    reg [1:0] state, next;
    reg disp_n, chg_n;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state    <= S0;
            dispense <= 1'b0;
            change   <= 1'b0;
        end else begin
            state    <= next;
            dispense <= disp_n;
            change   <= chg_n;
        end
    end

    always @(*) begin
        next   = state;
        disp_n = 1'b0;
        chg_n  = 1'b0;
        case (state)
            S0: begin
                if (nickel)    next = S5;
                else if (dime) next = S10;
            end
            S5: begin
                if (nickel)    next = S10;
                else if (dime) begin next = S0; disp_n = 1'b1; end  // 15
            end
            S10: begin
                if (nickel)    begin next = S0; disp_n = 1'b1; end  // 15
                else if (dime) begin next = S0; disp_n = 1'b1; chg_n = 1'b1; end // 20 -> change
            end
        endcase
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, nickel=0, dime=0; wire dispense, change;
    vending_machine dut (.clk(clk), .rst_n(rst_n), .nickel(nickel), .dime(dime),
                         .dispense(dispense), .change(change));
    always #5 clk = ~clk;
    task coin(input n, input d);
        begin nickel=n; dime=d; #10; nickel=0; dime=0; #10; end
    endtask
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        coin(1,0); coin(1,0); coin(1,0);   // 5+5+5 = 15 -> dispense
        coin(0,1); coin(1,0);              // 10+5 = 15 -> dispense
        coin(0,1); coin(0,1);              // 10+10 = 20 -> dispense + change
        #20 $finish;
    end
endmodule
`,
  },

  // ===================== Memory & FIFO =====================
  {
    name: "ROM",
    category: "Memory & FIFO",
    top: "rom",
    design: `// Combinational read-only memory initialized with a simple pattern.
module rom #(
    parameter AW = 4,
    parameter DW = 8
) (
    input  wire [AW-1:0] addr,
    output wire [DW-1:0] data
);
    reg [DW-1:0] mem [0:(1<<AW)-1];
    integer i;
    initial
        for (i = 0; i < (1<<AW); i = i + 1)
            mem[i] = i * 3;
    assign data = mem[addr];
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] addr; wire [7:0] data; integer i;
    rom #(.AW(4), .DW(8)) dut (.addr(addr), .data(data));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 16; i = i + 1) begin addr = i[3:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Single-Port RAM",
    category: "Memory & FIFO",
    top: "spram",
    design: `// Synchronous single-port RAM (read-first style).
module spram #(
    parameter AW = 4,
    parameter DW = 8
) (
    input  wire          clk,
    input  wire          we,
    input  wire [AW-1:0] addr,
    input  wire [DW-1:0] din,
    output reg  [DW-1:0] dout
);
    reg [DW-1:0] mem [0:(1<<AW)-1];
    always @(posedge clk) begin
        if (we) mem[addr] <= din;
        dout <= mem[addr];
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, we=0; reg [3:0] addr; reg [7:0] din; wire [7:0] dout;
    spram #(.AW(4), .DW(8)) dut (.clk(clk), .we(we), .addr(addr), .din(din), .dout(dout));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        we=1; addr=4'd1; din=8'hAA; #10;
        addr=4'd2; din=8'h55; #10;
        we=0; addr=4'd1; #10;
        addr=4'd2; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Dual-Port RAM",
    category: "Memory & FIFO",
    top: "dpram",
    design: `// One write/read port (A) plus an independent read port (B).
module dpram #(
    parameter AW = 4,
    parameter DW = 8
) (
    input  wire          clk,
    input  wire          we_a,
    input  wire [AW-1:0] addr_a,
    input  wire [DW-1:0] din_a,
    output reg  [DW-1:0] dout_a,
    input  wire [AW-1:0] addr_b,
    output reg  [DW-1:0] dout_b
);
    reg [DW-1:0] mem [0:(1<<AW)-1];
    always @(posedge clk) begin
        if (we_a) mem[addr_a] <= din_a;
        dout_a <= mem[addr_a];
        dout_b <= mem[addr_b];
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, we_a=0; reg [3:0] addr_a, addr_b; reg [7:0] din_a;
    wire [7:0] dout_a, dout_b;
    dpram #(.AW(4), .DW(8)) dut (.clk(clk), .we_a(we_a), .addr_a(addr_a),
        .din_a(din_a), .dout_a(dout_a), .addr_b(addr_b), .dout_b(dout_b));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        we_a=1; addr_a=4'd3; din_a=8'h3C; #10;
        addr_a=4'd7; din_a=8'h7E; #10;
        we_a=0; addr_a=4'd3; addr_b=4'd7; #10;
        addr_b=4'd3; addr_a=4'd7; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Simple FIFO",
    category: "Memory & FIFO",
    top: "simple_fifo",
    design: `// Minimal synchronous FIFO with full/empty flags.
module simple_fifo #(
    parameter DW    = 8,
    parameter DEPTH = 8
) (
    input  wire          clk,
    input  wire          rst_n,
    input  wire          wr_en,
    input  wire [DW-1:0] din,
    input  wire          rd_en,
    output reg  [DW-1:0] dout,
    output wire          full,
    output wire          empty
);
    localparam AW = $clog2(DEPTH);
    reg [DW-1:0] mem [0:DEPTH-1];
    reg [AW:0]   count;
    reg [AW-1:0] wptr, rptr;

    assign full  = (count == DEPTH);
    assign empty = (count == 0);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            wptr <= 0; rptr <= 0; count <= 0; dout <= 0;
        end else begin
            if (wr_en && !full) begin
                mem[wptr] <= din;
                wptr      <= wptr + 1'b1;
            end
            if (rd_en && !empty) begin
                dout <= mem[rptr];
                rptr <= rptr + 1'b1;
            end
            case ({wr_en && !full, rd_en && !empty})
                2'b10: count <= count + 1'b1;
                2'b01: count <= count - 1'b1;
                default: count <= count;
            endcase
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, wr_en=0, rd_en=0; reg [7:0] din;
    wire [7:0] dout; wire full, empty; integer i;
    simple_fifo #(.DW(8), .DEPTH(8)) dut (.clk(clk), .rst_n(rst_n),
        .wr_en(wr_en), .din(din), .rd_en(rd_en), .dout(dout), .full(full), .empty(empty));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        // push four items
        for (i = 0; i < 4; i = i + 1) begin wr_en=1; din=8'h10+i[7:0]; #10; end
        wr_en=0;
        // pop them back
        for (i = 0; i < 4; i = i + 1) begin rd_en=1; #10; end
        rd_en=0; #20 $finish;
    end
endmodule
`,
  },
  {
    name: "Synchronous FIFO",
    category: "Memory & FIFO",
    top: "sync_fifo",
    design: `// Single-clock FIFO with full/empty/almost flags and an occupancy count.
module sync_fifo #(
    parameter DW    = 8,
    parameter DEPTH = 8
) (
    input  wire          clk,
    input  wire          rst_n,
    input  wire          wr_en,
    input  wire [DW-1:0] din,
    input  wire          rd_en,
    output reg  [DW-1:0] dout,
    output wire          full,
    output wire          empty,
    output wire          almost_full,
    output wire          almost_empty,
    output wire [$clog2(DEPTH):0] level
);
    localparam AW = $clog2(DEPTH);
    reg [DW-1:0] mem [0:DEPTH-1];
    reg [AW:0]   count;
    reg [AW-1:0] wptr, rptr;

    assign full         = (count == DEPTH);
    assign empty        = (count == 0);
    assign almost_full  = (count >= DEPTH-1);
    assign almost_empty = (count <= 1);
    assign level        = count;

    wire do_wr = wr_en && !full;
    wire do_rd = rd_en && !empty;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            wptr <= 0; rptr <= 0; count <= 0; dout <= 0;
        end else begin
            if (do_wr) begin mem[wptr] <= din; wptr <= wptr + 1'b1; end
            if (do_rd) begin dout <= mem[rptr]; rptr <= rptr + 1'b1; end
            case ({do_wr, do_rd})
                2'b10: count <= count + 1'b1;
                2'b01: count <= count - 1'b1;
                default: count <= count;
            endcase
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0, wr_en=0, rd_en=0; reg [7:0] din;
    wire [7:0] dout; wire full, empty, almost_full, almost_empty;
    wire [3:0] level; integer i;
    sync_fifo #(.DW(8), .DEPTH(8)) dut (.clk(clk), .rst_n(rst_n),
        .wr_en(wr_en), .din(din), .rd_en(rd_en), .dout(dout),
        .full(full), .empty(empty), .almost_full(almost_full),
        .almost_empty(almost_empty), .level(level));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        for (i = 0; i < 8; i = i + 1) begin wr_en=1; din=8'hA0+i[7:0]; #10; end
        wr_en=0;
        // simultaneous read+write
        wr_en=1; rd_en=1; din=8'hFF; #10; wr_en=0;
        for (i = 0; i < 8; i = i + 1) begin rd_en=1; #10; end
        rd_en=0; #20 $finish;
    end
endmodule
`,
  },
  {
    name: "Asynchronous FIFO",
    category: "Memory & FIFO",
    top: "async_fifo",
    design: `// Dual-clock FIFO using Gray-coded pointers synchronized across domains.
module async_fifo #(
    parameter DW = 8,
    parameter AW = 3        // depth = 2^AW
) (
    input  wire          wclk,
    input  wire          wrst_n,
    input  wire          wr_en,
    input  wire [DW-1:0] din,
    output wire          wfull,

    input  wire          rclk,
    input  wire          rrst_n,
    input  wire          rd_en,
    output reg  [DW-1:0] dout,
    output wire          rempty
);
    localparam DEPTH = (1 << AW);
    reg [DW-1:0] mem [0:DEPTH-1];

    // Binary and Gray pointers (one extra bit for full/empty detection)
    reg [AW:0] wbin, wgray, rbin, rgray;
    reg [AW:0] wq1, wq2;   // read gray synced into write domain
    reg [AW:0] rq1, rq2;   // write gray synced into read domain

    function [AW:0] bin2gray(input [AW:0] b); bin2gray = b ^ (b >> 1); endfunction

    // ---- Write domain ----
    wire [AW:0] wbin_next  = wbin + (wr_en & ~wfull);
    wire [AW:0] wgray_next = bin2gray(wbin_next);
    assign wfull = (wgray_next == {~wq2[AW:AW-1], wq2[AW-2:0]});

    always @(posedge wclk or negedge wrst_n) begin
        if (!wrst_n) begin wbin <= 0; wgray <= 0; end
        else begin
            if (wr_en && !wfull) mem[wbin[AW-1:0]] <= din;
            wbin  <= wbin_next;
            wgray <= wgray_next;
        end
    end
    always @(posedge wclk or negedge wrst_n)
        if (!wrst_n) {wq2, wq1} <= 0;
        else         {wq2, wq1} <= {wq1, rgray};

    // ---- Read domain ----
    wire [AW:0] rbin_next  = rbin + (rd_en & ~rempty);
    wire [AW:0] rgray_next = bin2gray(rbin_next);
    assign rempty = (rgray == rq2);

    always @(posedge rclk or negedge rrst_n) begin
        if (!rrst_n) begin rbin <= 0; rgray <= 0; dout <= 0; end
        else begin
            if (rd_en && !rempty) dout <= mem[rbin[AW-1:0]];
            rbin  <= rbin_next;
            rgray <= rgray_next;
        end
    end
    always @(posedge rclk or negedge rrst_n)
        if (!rrst_n) {rq2, rq1} <= 0;
        else         {rq2, rq1} <= {rq1, wgray};
endmodule
`,
    testbench: TS + `module tb;
    reg wclk=0, rclk=0, wrst_n=0, rrst_n=0, wr_en=0, rd_en=0; reg [7:0] din;
    wire wfull, rempty; wire [7:0] dout; integer i;
    async_fifo #(.DW(8), .AW(3)) dut (
        .wclk(wclk), .wrst_n(wrst_n), .wr_en(wr_en), .din(din), .wfull(wfull),
        .rclk(rclk), .rrst_n(rrst_n), .rd_en(rd_en), .dout(dout), .rempty(rempty));
    always #5  wclk = ~wclk;    // 100 MHz write clock
    always #7  rclk = ~rclk;    // ~71 MHz read clock
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        wrst_n=0; rrst_n=0; #20 wrst_n=1; rrst_n=1;
        // write a few words
        for (i = 0; i < 6; i = i + 1) begin
            @(posedge wclk); wr_en <= 1; din <= 8'h20 + i[7:0];
        end
        @(posedge wclk); wr_en <= 0;
        // read them out
        for (i = 0; i < 6; i = i + 1) begin
            @(posedge rclk); rd_en <= 1;
        end
        @(posedge rclk); rd_en <= 0;
        #50 $finish;
    end
endmodule
`,
  },
  {
    name: "Register File",
    category: "Memory & FIFO",
    top: "register_file",
    design: `// Two read ports, one write port; register 0 reads as zero (RISC-style).
module register_file #(
    parameter AW = 5,
    parameter DW = 32
) (
    input  wire          clk,
    input  wire          we,
    input  wire [AW-1:0] waddr,
    input  wire [DW-1:0] wdata,
    input  wire [AW-1:0] raddr1,
    input  wire [AW-1:0] raddr2,
    output wire [DW-1:0] rdata1,
    output wire [DW-1:0] rdata2
);
    reg [DW-1:0] regs [0:(1<<AW)-1];
    always @(posedge clk)
        if (we && waddr != 0) regs[waddr] <= wdata;
    assign rdata1 = (raddr1 == 0) ? {DW{1'b0}} : regs[raddr1];
    assign rdata2 = (raddr2 == 0) ? {DW{1'b0}} : regs[raddr2];
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, we=0; reg [4:0] waddr, raddr1, raddr2; reg [31:0] wdata;
    wire [31:0] rdata1, rdata2;
    register_file #(.AW(5), .DW(32)) dut (.clk(clk), .we(we), .waddr(waddr),
        .wdata(wdata), .raddr1(raddr1), .raddr2(raddr2), .rdata1(rdata1), .rdata2(rdata2));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        we=1; waddr=5'd1; wdata=32'hDEADBEEF; #10;
        waddr=5'd2; wdata=32'h12345678; #10;
        we=0; raddr1=5'd1; raddr2=5'd2; #10;
        raddr1=5'd0; raddr2=5'd1; #10;     // port1 reads 0
        $finish;
    end
endmodule
`,
  },

  // ===================== CDC & Timing =====================
  {
    name: "Pulse Synchronizer",
    category: "CDC & Timing",
    top: "pulse_sync",
    design: `// Safely transfers a single-cycle pulse from one clock domain to another
// using a toggle, a 2-flop synchronizer, and an edge detector.
module pulse_sync (
    input  wire src_clk,
    input  wire src_rst_n,
    input  wire src_pulse,

    input  wire dst_clk,
    input  wire dst_rst_n,
    output wire dst_pulse
);
    reg toggle;
    always @(posedge src_clk or negedge src_rst_n) begin
        if (!src_rst_n) toggle <= 1'b0;
        else if (src_pulse) toggle <= ~toggle;
    end

    reg s1, s2, s3;
    always @(posedge dst_clk or negedge dst_rst_n) begin
        if (!dst_rst_n) {s1, s2, s3} <= 3'b0;
        else            {s1, s2, s3} <= {toggle, s1, s2};
    end

    assign dst_pulse = s2 ^ s3;
endmodule
`,
    testbench: TS + `module tb;
    reg src_clk=0, src_rst_n=0, src_pulse=0, dst_clk=0, dst_rst_n=0;
    wire dst_pulse;
    pulse_sync dut (.src_clk(src_clk), .src_rst_n(src_rst_n), .src_pulse(src_pulse),
                    .dst_clk(dst_clk), .dst_rst_n(dst_rst_n), .dst_pulse(dst_pulse));
    always #5  src_clk = ~src_clk;
    always #8  dst_clk = ~dst_clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        src_rst_n=0; dst_rst_n=0; #20 src_rst_n=1; dst_rst_n=1;
        @(posedge src_clk); src_pulse <= 1; @(posedge src_clk); src_pulse <= 0;
        #80;
        @(posedge src_clk); src_pulse <= 1; @(posedge src_clk); src_pulse <= 0;
        #100 $finish;
    end
endmodule
`,
  },
  {
    name: "Pulse Generator",
    category: "CDC & Timing",
    top: "pulse_generator",
    design: `// Emits a one-cycle pulse every PERIOD clocks.
module pulse_generator #(
    parameter PERIOD = 8
) (
    input  wire clk,
    input  wire rst_n,
    output reg  pulse
);
    reg [$clog2(PERIOD)-1:0] cnt;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cnt   <= 0;
            pulse <= 1'b0;
        end else if (cnt == PERIOD-1) begin
            cnt   <= 0;
            pulse <= 1'b1;
        end else begin
            cnt   <= cnt + 1'b1;
            pulse <= 1'b0;
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire pulse;
    pulse_generator #(.PERIOD(8)) dut (.clk(clk), .rst_n(rst_n), .pulse(pulse));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #250 $finish;
    end
endmodule
`,
  },

  // ===================== Arbiters & Control =====================
  {
    name: "Priority Arbiter",
    category: "Arbiters & Control",
    top: "priority_arbiter",
    design: `// Combinational fixed-priority arbiter (lowest index = highest priority).
// Outputs both a one-hot grant and the granted index.
module priority_arbiter #(
    parameter N = 4
) (
    input  wire [N-1:0]          req,
    output reg  [N-1:0]          grant,
    output reg  [$clog2(N)-1:0]  gnt_idx,
    output reg                   valid
);
    integer i;
    always @(*) begin
        grant   = {N{1'b0}};
        gnt_idx = 0;
        valid   = 1'b0;
        for (i = N-1; i >= 0; i = i - 1)
            if (req[i]) begin
                grant   = {N{1'b0}};
                grant[i]= 1'b1;
                gnt_idx = i[$clog2(N)-1:0];
                valid   = 1'b1;
            end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] req; wire [3:0] grant; wire [1:0] gnt_idx; wire valid;
    priority_arbiter #(.N(4)) dut (.req(req), .grant(grant), .gnt_idx(gnt_idx), .valid(valid));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        req=4'b0000; #10;
        req=4'b1010; #10;   // grant index 1
        req=4'b1100; #10;   // grant index 2
        req=4'b1000; #10;   // grant index 3
        $finish;
    end
endmodule
`,
  },
  {
    name: "Arbiter (Fixed Priority)",
    category: "Arbiters & Control",
    top: "fixed_priority_arbiter",
    design: `// One-hot fixed-priority arbiter: grants the lowest-index requester.
module fixed_priority_arbiter #(
    parameter N = 4
) (
    input  wire [N-1:0] req,
    output reg  [N-1:0] grant
);
    integer i;
    reg found;
    always @(*) begin
        grant = {N{1'b0}};
        found = 1'b0;
        for (i = 0; i < N; i = i + 1)
            if (!found && req[i]) begin
                grant[i] = 1'b1;
                found    = 1'b1;
            end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg [3:0] req; wire [3:0] grant;
    fixed_priority_arbiter #(.N(4)) dut (.req(req), .grant(grant));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        req=4'b0000; #10;
        req=4'b0110; #10;   // grant bit 1
        req=4'b1001; #10;   // grant bit 0
        req=4'b1000; #10;   // grant bit 3
        $finish;
    end
endmodule
`,
  },
  {
    name: "Round-Robin Arbiter",
    category: "Arbiters & Control",
    top: "round_robin_arbiter",
    design: `// Round-robin arbiter: rotates priority so requesters are served fairly.
module round_robin_arbiter #(
    parameter N = 4
) (
    input  wire             clk,
    input  wire             rst_n,
    input  wire [N-1:0]     req,
    output reg  [N-1:0]     grant
);
    reg  [$clog2(N)-1:0] ptr;
    integer i;
    reg     found;
    integer idx;

    always @(*) begin
        grant = {N{1'b0}};
        found = 1'b0;
        for (i = 0; i < N; i = i + 1) begin
            idx = (ptr + i) % N;
            if (!found && req[idx]) begin
                grant[idx] = 1'b1;
                found      = 1'b1;
            end
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) ptr <= 0;
        else for (i = 0; i < N; i = i + 1)
            if (grant[i]) ptr <= (i + 1) % N;
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; reg [3:0] req; wire [3:0] grant;
    round_robin_arbiter #(.N(4)) dut (.clk(clk), .rst_n(rst_n), .req(req), .grant(grant));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1;
        req=4'b1111; #80;   // grants rotate 0,1,2,3,...
        req=4'b1010; #40;
        req=4'b0000; #20;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Priority Resolver",
    category: "Arbiters & Control",
    top: "priority_resolver",
    design: `// Isolates the lowest set bit of the request vector (one-hot output).
module priority_resolver #(
    parameter N = 8
) (
    input  wire [N-1:0] req,
    output wire [N-1:0] grant
);
    assign grant = req & (~req + 1'b1);
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] req; wire [7:0] grant;
    priority_resolver #(.N(8)) dut (.req(req), .grant(grant));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        req=8'b0000_0000; #10;
        req=8'b0011_0100; #10;   // lowest set = bit 2
        req=8'b1010_0000; #10;   // lowest set = bit 5
        req=8'b1000_0000; #10;
        $finish;
    end
endmodule
`,
  },

  // ===================== Processor =====================
  {
    name: "ALU",
    category: "Processor",
    top: "alu",
    design: `// 8-bit ALU with common operations selected by 'op'.
module alu #(
    parameter W = 8
) (
    input  wire [W-1:0] a,
    input  wire [W-1:0] b,
    input  wire [2:0]   op,
    output reg  [W-1:0] y,
    output reg          carry,
    output wire         zero
);
    always @(*) begin
        carry = 1'b0;
        case (op)
            3'd0: {carry, y} = a + b;
            3'd1: {carry, y} = a - b;
            3'd2: y = a & b;
            3'd3: y = a | b;
            3'd4: y = a ^ b;
            3'd5: y = ~a;
            3'd6: y = a << 1;
            3'd7: y = a >> 1;
            default: y = {W{1'b0}};
        endcase
    end
    assign zero = (y == {W{1'b0}});
endmodule
`,
    testbench: TS + `module tb;
    reg [7:0] a, b; reg [2:0] op; wire [7:0] y; wire carry, zero; integer i;
    alu #(.W(8)) dut (.a(a), .b(b), .op(op), .y(y), .carry(carry), .zero(zero));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        a=8'd200; b=8'd100;
        for (i = 0; i < 8; i = i + 1) begin op = i[2:0]; #10; end
        a=8'd5; b=8'd5; op=3'd1; #10;   // 0 -> zero flag
        $finish;
    end
endmodule
`,
  },
  {
    name: "Instruction Memory",
    category: "Processor",
    top: "instruction_memory",
    design: `// Word-addressed instruction ROM preloaded with a small program.
module instruction_memory #(
    parameter AW = 6,
    parameter DW = 32
) (
    input  wire [AW-1:0] addr,
    output wire [DW-1:0] instr
);
    reg [DW-1:0] mem [0:(1<<AW)-1];
    integer i;
    initial begin
        for (i = 0; i < (1<<AW); i = i + 1) mem[i] = 32'h0000_0013; // NOP (addi x0)
        mem[0] = 32'h0000_0093;   // addi x1, x0, 0
        mem[1] = 32'h0010_8113;   // addi x2, x1, 1
        mem[2] = 32'h0020_81B3;   // add  x3, x1, x2
        mem[3] = 32'h0031_0233;   // add  x4, x2, x3
    end
    assign instr = mem[addr];
endmodule
`,
    testbench: TS + `module tb;
    reg [5:0] addr; wire [31:0] instr; integer i;
    instruction_memory #(.AW(6), .DW(32)) dut (.addr(addr), .instr(instr));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        for (i = 0; i < 6; i = i + 1) begin addr = i[5:0]; #10; end
        $finish;
    end
endmodule
`,
  },
  {
    name: "Data Memory",
    category: "Processor",
    top: "data_memory",
    design: `// Synchronous-write, asynchronous-read data memory.
module data_memory #(
    parameter AW = 6,
    parameter DW = 32
) (
    input  wire          clk,
    input  wire          we,
    input  wire [AW-1:0] addr,
    input  wire [DW-1:0] wdata,
    output wire [DW-1:0] rdata
);
    reg [DW-1:0] mem [0:(1<<AW)-1];
    always @(posedge clk)
        if (we) mem[addr] <= wdata;
    assign rdata = mem[addr];
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, we=0; reg [5:0] addr; reg [31:0] wdata; wire [31:0] rdata;
    data_memory #(.AW(6), .DW(32)) dut (.clk(clk), .we(we), .addr(addr), .wdata(wdata), .rdata(rdata));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        we=1; addr=6'd4;  wdata=32'hCAFEBABE; #10;
        addr=6'd8;  wdata=32'h0BADF00D; #10;
        we=0; addr=6'd4; #10;
        addr=6'd8; #10;
        $finish;
    end
endmodule
`,
  },
  {
    name: "Simple CPU Datapath",
    category: "Processor",
    top: "simple_cpu",
    design: `// Tiny accumulator CPU with an internal program ROM.
// Instruction: [7:4]=opcode, [3:0]=immediate.
//   1=LOADI  2=ADDI  3=SUBI  4=SHL  5=JMP  (others=NOP)
module simple_cpu (
    input  wire       clk,
    input  wire       rst_n,
    output reg  [7:0] acc,
    output reg  [3:0] pc
);
    reg [7:0] imem [0:15];
    integer i;
    initial begin
        for (i = 0; i < 16; i = i + 1) imem[i] = 8'h00;
        imem[0] = 8'h13;   // LOADI 3   -> acc = 3
        imem[1] = 8'h24;   // ADDI  4   -> acc = 7
        imem[2] = 8'h21;   // ADDI  1   -> acc = 8
        imem[3] = 8'h31;   // SUBI  1   -> acc = 7
        imem[4] = 8'h40;   // SHL       -> acc = 14
        imem[5] = 8'h55;   // JMP   5   -> halt (loop on self)
    end

    wire [7:0] instr = imem[pc];
    wire [3:0] op    = instr[7:4];
    wire [3:0] imm   = instr[3:0];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            pc  <= 4'd0;
            acc <= 8'd0;
        end else begin
            case (op)
                4'd1: begin acc <= imm;          pc <= pc + 1'b1; end
                4'd2: begin acc <= acc + imm;    pc <= pc + 1'b1; end
                4'd3: begin acc <= acc - imm;    pc <= pc + 1'b1; end
                4'd4: begin acc <= acc << 1;     pc <= pc + 1'b1; end
                4'd5: pc <= imm;
                default: pc <= pc + 1'b1;
            endcase
        end
    end
endmodule
`,
    testbench: TS + `module tb;
    reg clk=0, rst_n=0; wire [7:0] acc; wire [3:0] pc;
    simple_cpu dut (.clk(clk), .rst_n(rst_n), .acc(acc), .pc(pc));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb);
        rst_n=0; #12 rst_n=1; #120 $finish;
    end
endmodule
`,
  },
];
