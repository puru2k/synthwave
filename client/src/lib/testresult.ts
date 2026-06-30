export type TestStatus = "pass" | "fail" | "none";

export interface TestResult {
  status: TestStatus;
  passes: number;
  fails: number;
}

// Heuristically classify a simulation log as pass/fail based on common
// self-checking-testbench conventions ($display/$error/$fatal output).
export function evaluateTestResult(log: string): TestResult {
  if (!log) return { status: "none", passes: 0, fails: 0 };

  const failRe = /\b(fail(?:ed|ure)?|mismatch|assertion\s+failed|errors?\b(?!\s+in\s+port))\b|\$error|\$fatal/gi;
  const passRe = /\b(pass(?:ed)?|all\s+tests?\s+passed|success(?:ful)?|ok)\b/gi;

  // Restrict pass/fail scanning to lines that look like testbench messages,
  // not tool banners, to reduce false positives.
  const lines = log.split("\n");
  let passes = 0;
  let fails = 0;
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    // skip obvious tool/info lines
    if (/^VCD info:/i.test(l) || /\$finish called/i.test(l)) continue;
    const fm = l.match(failRe);
    const pm = l.match(passRe);
    if (fm) fails += fm.length;
    else if (pm) passes += pm.length;
  }

  let status: TestStatus = "none";
  if (fails > 0) status = "fail";
  else if (passes > 0) status = "pass";
  return { status, passes, fails };
}
