// A conservative Verilog/SystemVerilog reindenter. It only ever rewrites the
// leading whitespace of each line (and trims trailing whitespace) based on
// block nesting — it never reflows or reorders tokens, so the worst case is a
// slightly odd indent, never broken code (and a single Ctrl-Z undoes it).

const OPEN_KW =
  /\b(begin|case|casex|casez|fork|generate|function|task|module|primitive|specify|covergroup|class|package|interface|clocking)\b/g;
const CLOSE_KW =
  /\b(endcase|endgenerate|endfunction|endtask|endmodule|endprimitive|endspecify|endgroup|endclass|endpackage|endinterface|endclocking|join_any|join_none|join|end)\b/g;

const LEAD_CLOSER = /^(endcase|endgenerate|endfunction|endtask|endmodule|endprimitive|endspecify|endgroup|endclass|endpackage|endinterface|endclocking|join_any|join_none|join|end|\}|\))/;

// Strip comments and string/char literals from a line for *counting* purposes.
// Tracks block-comment state across lines via the passed-in flag.
function stripForCount(line: string, state: { inBlock: boolean }): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    const n = line[i + 1];
    if (state.inBlock) {
      if (c === "*" && n === "/") {
        state.inBlock = false;
        i += 2;
      } else i++;
      continue;
    }
    if (c === "/" && n === "/") break; // line comment
    if (c === "/" && n === "*") {
      state.inBlock = true;
      i += 2;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\") i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function count(re: RegExp, s: string): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(s) !== null) n++;
  return n;
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

export function formatVerilog(text: string, indentUnit = "  "): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blockState = { inBlock: false };
  let depth = 0;
  const out: string[] = [];

  for (const raw of lines) {
    const wasInBlock = blockState.inBlock;
    const code = stripForCount(raw, blockState);
    const trimmed = raw.trim();

    if (trimmed === "") {
      out.push("");
      continue;
    }

    // Lines that continue a block comment keep their original text verbatim.
    if (wasInBlock) {
      out.push(raw.replace(/\s+$/, ""));
      continue;
    }

    const opens = count(OPEN_KW, code) + countChar(code, "{") + countChar(code, "(");
    const closes = count(CLOSE_KW, code) + countChar(code, "}") + countChar(code, ")");

    // A line that begins with a closer is dedented before being printed.
    const leadDedent = LEAD_CLOSER.test(trimmed) ? 1 : 0;
    const thisDepth = Math.max(0, depth - leadDedent);
    out.push(trimmed === "" ? "" : indentUnit.repeat(thisDepth) + trimmed);

    depth = Math.max(0, depth + opens - closes);
  }

  return out.join("\n");
}
