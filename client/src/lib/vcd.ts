// Minimal but robust VCD (Value Change Dump) parser for digital waveforms.

export interface VcdSignal {
  id: string; // symbol identifier used in the dump
  name: string; // human readable name
  scope: string; // dotted hierarchy path
  width: number;
  changes: Array<{ time: number; value: string }>; // value as bit string ('1','0','x','z' or multi-bit)
}

export interface VcdData {
  timescale: string;
  endTime: number;
  signals: VcdSignal[];
}

export function parseVcd(text: string): VcdData {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let i = 0;

  const byId = new Map<string, VcdSignal>();
  const orderedIds: string[] = [];
  const scopeStack: string[] = [];
  let timescale = "1 ns";
  let currentTime = 0;
  let endTime = 0;

  const ensureSignal = (id: string, name: string, width: number) => {
    let sig = byId.get(id);
    const scope = scopeStack.join(".");
    if (!sig) {
      sig = { id, name, scope, width, changes: [] };
      byId.set(id, sig);
      orderedIds.push(id);
    }
    return sig;
  };

  const recordChange = (id: string, value: string) => {
    const sig = byId.get(id);
    if (!sig) return;
    sig.changes.push({ time: currentTime, value });
  };

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === "$timescale") {
      i++;
      const parts: string[] = [];
      while (i < tokens.length && tokens[i] !== "$end") parts.push(tokens[i++]);
      timescale = parts.join(" ");
      // skip $end
      if (tokens[i] === "$end") i++;
      continue;
    }

    if (tok === "$scope") {
      // $scope module name $end
      i++; // type
      i++; // skip module/type keyword
      const name = tokens[i++] ?? "";
      scopeStack.push(name);
      while (i < tokens.length && tokens[i] !== "$end") i++;
      if (tokens[i] === "$end") i++;
      continue;
    }

    if (tok === "$upscope") {
      scopeStack.pop();
      while (i < tokens.length && tokens[i] !== "$end") i++;
      if (tokens[i] === "$end") i++;
      continue;
    }

    if (tok === "$var") {
      // $var <type> <width> <id> <name> [bit-range] $end
      i++; // move past $var
      /* type */ i++;
      const width = parseInt(tokens[i++], 10) || 1;
      const id = tokens[i++];
      let name = tokens[i++] ?? "";
      // Possible bit range token like [7:0] or [3]
      const rest: string[] = [];
      while (i < tokens.length && tokens[i] !== "$end") rest.push(tokens[i++]);
      if (rest.length > 0) name = name + rest.join("");
      if (tokens[i] === "$end") i++;
      ensureSignal(id, name, width);
      continue;
    }

    if (tok.startsWith("$")) {
      // Other declaration commands ($version, $date, $comment, $dumpvars, $end, $enddefinitions...)
      // Skip until matching $end when it is a block command, else just advance.
      const blockCmds = new Set(["$comment", "$date", "$version", "$enddefinitions"]);
      if (blockCmds.has(tok)) {
        i++;
        while (i < tokens.length && tokens[i] !== "$end") i++;
        if (tokens[i] === "$end") i++;
      } else {
        i++;
      }
      continue;
    }

    // Time marker
    if (tok[0] === "#") {
      currentTime = parseInt(tok.slice(1), 10) || 0;
      if (currentTime > endTime) endTime = currentTime;
      i++;
      continue;
    }

    // Scalar value change: e.g. 1!, 0", x#, z$
    if (
      tok[0] === "0" ||
      tok[0] === "1" ||
      tok[0] === "x" ||
      tok[0] === "X" ||
      tok[0] === "z" ||
      tok[0] === "Z"
    ) {
      const value = tok[0].toLowerCase();
      const id = tok.slice(1);
      if (id) recordChange(id, value);
      i++;
      continue;
    }

    // Vector value change: b1010 <id>  or  r<real> <id>
    if (tok[0] === "b" || tok[0] === "B") {
      const value = tok.slice(1).toLowerCase();
      const id = tokens[i + 1];
      if (id) recordChange(id, value);
      i += 2;
      continue;
    }
    if (tok[0] === "r" || tok[0] === "R") {
      const value = tok.slice(1);
      const id = tokens[i + 1];
      if (id) recordChange(id, value);
      i += 2;
      continue;
    }

    // Unknown token, skip.
    i++;
  }

  const signals = orderedIds.map((id) => byId.get(id)!);
  // Ensure endTime covers last change.
  for (const s of signals) {
    const last = s.changes[s.changes.length - 1];
    if (last && last.time > endTime) endTime = last.time;
  }
  if (endTime === 0) endTime = 1;

  return { timescale, endTime, signals };
}

/** Return the signal value active at a given time. */
export function valueAtTime(sig: VcdSignal, time: number): string | null {
  let val: string | null = null;
  for (const c of sig.changes) {
    if (c.time <= time) val = c.value;
    else break;
  }
  return val;
}
