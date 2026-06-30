import { runYosys } from "@yowasp/yosys";

const design = "module inv(input a, output o); assign o = ~a; endmodule\n";
const script = "read_verilog -sv design.v; hierarchy -auto-top; proc; opt; stat; write_json netlist.json";
let log = "";
const sink = (b) => {
  if (b == null) return;
  log += typeof b === "string" ? b : new TextDecoder().decode(b);
};
const out = await runYosys(["-p", script], { "design.v": design }, { stdout: sink, stderr: sink });
console.log("OUTPUT FILES:", Object.keys(out));
const nl = out["netlist.json"];
console.log("netlist type:", typeof nl, "len:", (typeof nl === "string" ? nl.length : nl?.byteLength));
const text = typeof nl === "string" ? nl : new TextDecoder().decode(nl);
const j = JSON.parse(text);
console.log("modules:", Object.keys(j.modules || {}));
