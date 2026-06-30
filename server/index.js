import express from "express";
import cors from "cors";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { simulate, synthesize, verify, extractFsm } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function toolVersion(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000 });
    if (r.status === 0 || r.stdout || r.stderr) {
      return (r.stdout || r.stderr || "").split("\n")[0].trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    tools: {
      iverilog: toolVersion("iverilog", ["-V"]),
      vvp: toolVersion("vvp", ["-V"]),
      yosys: toolVersion("yosys", ["-V"]),
    },
  });
});

app.post("/api/simulate", async (req, res) => {
  try {
    const { files, design, testbench } = req.body ?? {};
    const result = await simulate({ files, design, testbench });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, log: "Server error: " + (e?.message || String(e)) });
  }
});

app.post("/api/verify", async (req, res) => {
  try {
    const { files, design, testbench, level, top } = req.body ?? {};
    const result = await verify({ files, design, testbench, level, top });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, log: "Server error: " + (e?.message || String(e)) });
  }
});

app.post("/api/synthesize", async (req, res) => {
  try {
    const { files, design, top, flatten, mode, lib } = req.body ?? {};
    const result = await synthesize({ files, design, top, flatten, mode, lib });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, log: "Server error: " + (e?.message || String(e)) });
  }
});

app.post("/api/fsm", async (req, res) => {
  try {
    const { files, design, top } = req.body ?? {};
    const result = await extractFsm({ files, design, top });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, fsm: null, log: "Server error: " + (e?.message || String(e)) });
  }
});

// Serve the built frontend in production, if present.
const clientDist = join(__dirname, "..", "client", "dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`SynthWave API listening on http://localhost:${PORT}`);
});
