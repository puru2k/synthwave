export interface Diagnostic {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

// Matches a "file.v:line" or "file.v:line:col" reference anywhere in a line:
//   Icarus/Yosys:  "design.v:12: syntax error"
//   Verilator:     "%Warning-WIDTH: design.v:5:10: Operator ..."
const LINE_RE = /([\w./-]+\.s?v):(\d+)(?::(\d+))?:\s*(.*)$/;

export function parseDiagnostics(log: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const raw of (log || "").split("\n")) {
    const m = LINE_RE.exec(raw);
    if (!m) continue;
    const message = m[4].trim();
    const lower = raw.toLowerCase();
    let severity: "error" | "warning" | null = null;
    // Verilator prefixes %Error/%Warning; Icarus/Yosys spell it out in the message.
    if (lower.includes("error")) severity = "error";
    else if (lower.includes("warning")) severity = "warning";
    else if (message.toLowerCase().includes("syntax")) severity = "error";
    // Skip benign informational lines like "$finish called at ...".
    if (!severity) continue;
    // Strip a trailing "../tmpdir/" path component if any leaked through.
    const file = m[1].split("/").pop() || m[1];
    out.push({ file, line: parseInt(m[2], 10) || 1, message, severity });
  }
  return out;
}
