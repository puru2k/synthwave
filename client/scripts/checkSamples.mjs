// Compiles every sample (design + testbench) with iverilog to catch syntax
// or elaboration errors. Run with: node scripts/checkSamples.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = await build({
  entryPoints: ["src/lib/samples.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "node",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const { SAMPLES } = await import(dataUrl);

let fail = 0;
for (const s of SAMPLES) {
  const dir = mkdtempSync(join(tmpdir(), "vchk-"));
  try {
    writeFileSync(join(dir, "design.v"), s.design);
    writeFileSync(join(dir, "tb.v"), s.testbench);
    execFileSync("iverilog", ["-g2012", "-o", join(dir, "a.out"), "design.v", "tb.v"], {
      cwd: dir,
      stdio: ["ignore", "ignore", "pipe"],
    });
    process.stdout.write(`ok   ${s.name}\n`);
  } catch (e) {
    fail++;
    const msg = (e.stderr ? e.stderr.toString() : e.message).trim();
    process.stdout.write(`FAIL ${s.name}\n${msg}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.stdout.write(`\n${SAMPLES.length - fail}/${SAMPLES.length} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
