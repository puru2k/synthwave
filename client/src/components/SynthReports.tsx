import { useMemo, useState } from "react";
import {
  areaReport,
  timingReport,
  powerReport,
  isGateLevel,
  type CellMap,
  type AreaReport,
  type TimingReport,
  type PowerReport,
} from "../lib/reports";
import { CELL_BY_NAME, VDD_V, SKY130_BY_NAME, SKY130_VDD_V } from "../lib/liberty";
import { parseLiberty } from "../lib/libertyParse";
import { downloadText } from "../lib/download";

export interface ActiveLib {
  id: "generic" | "sky130" | "custom";
  name: string;
  content: string;
}

interface Props {
  netlistJson: string | null;
  library: ActiveLib;
  onRunGate?: () => void;
}

const fmtUW = (uw: number) => (uw >= 1000 ? (uw / 1000).toFixed(3) + " mW" : uw.toFixed(2) + " µW");
const fmtNs = (ps: number) => (ps >= 1000 ? (ps / 1000).toFixed(2) + " ns" : ps + " ps");
const fmtFreq = (mhz: number) => (mhz >= 1000 ? (mhz / 1000).toFixed(2) + " GHz" : mhz.toFixed(0) + " MHz");

interface ReportData {
  libName: string;
  vdd: number;
  area: AreaReport | null;
  timing: TimingReport | null;
  power: PowerReport | null;
}

function buildMarkdown(d: ReportData): string {
  const L: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  L.push(`# Synthesis report`);
  L.push("");
  L.push(`- Generated: ${now}`);
  L.push(`- Standard-cell library: **${d.libName}**`);
  L.push(`- Supply voltage (Vdd): ${d.vdd} V`);
  L.push(`- Note: transparent estimates for comparing designs — not sign-off numbers.`);
  L.push("");

  L.push(`## Summary`);
  L.push("");
  L.push(`| Metric | Value |`);
  L.push(`| --- | --- |`);
  if (d.area) {
    L.push(`| Cells | ${d.area.cellCount} |`);
    L.push(`| Total area | ${d.area.total.toFixed(2)} |`);
  }
  if (d.timing) {
    if (d.timing.combinational) {
      L.push(`| Design type | combinational (no flip-flops) |`);
      L.push(`| Propagation delay | ${fmtNs(d.timing.delayPs)} |`);
    } else {
      L.push(`| F_max | ${fmtFreq(d.timing.fmaxMHz)} |`);
      L.push(`| Critical path | ${fmtNs(d.timing.delayPs)} |`);
      L.push(`| Path start | ${d.timing.startKind === "register" ? "register" : "primary input"} |`);
    }
    L.push(`| Logic levels | ${d.timing.logicDepth} |`);
  }
  if (d.power) {
    L.push(`| Total power | ${fmtUW(d.power.totalUW)} |`);
    L.push(`| Dynamic power | ${fmtUW(d.power.dynamicUW)} |`);
    L.push(`| Leakage power | ${fmtUW(d.power.leakageUW)} |`);
  }
  L.push("");

  if (d.area) {
    L.push(`## Area breakdown`);
    L.push("");
    L.push(`| Cell | Count | Area each | Area | % |`);
    L.push(`| --- | ---: | ---: | ---: | ---: |`);
    for (const r of d.area.rows) {
      L.push(`| ${r.type} | ${r.count} | ${r.areaEach} | ${r.area.toFixed(2)} | ${r.pct.toFixed(1)}% |`);
    }
    L.push(`| **Total** | **${d.area.cellCount}** | | **${d.area.total.toFixed(2)}** | **100%** |`);
    L.push("");
  }

  if (d.timing) {
    L.push(d.timing.combinational ? `## Timing — propagation path` : `## Timing — critical path`);
    L.push("");
    L.push(
      d.timing.combinational
        ? `Combinational design (no flip-flops, F_max undefined). Input → output path, ${d.timing.logicDepth} logic levels, total delay ${d.timing.delayPs} ps:`
        : `Longest path (starts at ${
            d.timing.startKind === "register" ? "a register" : "a primary input"
          }), ${d.timing.logicDepth} logic levels, arrival ${d.timing.delayPs} ps:`
    );
    L.push("");
    L.push(`| # | Instance | Cell type | Stage delay (ps) | Arrival (ps) |`);
    L.push(`| ---: | --- | --- | ---: | ---: |`);
    d.timing.path.forEach((s, i) => {
      L.push(`| ${i} | ${s.cell} | ${s.type} | ${s.stageDelayPs} | ${s.arrivalPs} |`);
    });
    L.push("");
  }

  if (d.power) {
    L.push(`## Power`);
    L.push("");
    L.push(`Model: P = P_leak + ½·α·C·V²·f`);
    if (d.power.combinational)
      L.push(`Combinational design: f is an assumed input switching rate (no clock); dynamic power is data-dependent.`);
    L.push("");
    L.push(`| Parameter | Value |`);
    L.push(`| --- | --- |`);
    L.push(`| ${d.power.combinational ? "Data / switching rate" : "Clock frequency"} | ${d.power.freqMHz} MHz |`);
    L.push(`| Switching activity (α) | ${d.power.activity} |`);
    L.push(`| Supply voltage (V) | ${d.power.vdd} V |`);
    L.push(`| Switched capacitance (C) | ${d.power.totalCapFf.toFixed(2)} fF |`);
    L.push(`| Dynamic power | ${fmtUW(d.power.dynamicUW)} |`);
    L.push(`| Leakage power | ${fmtUW(d.power.leakageUW)} |`);
    L.push(`| **Total power** | **${fmtUW(d.power.totalUW)}** |`);
    L.push("");
  }

  return L.join("\n");
}

export default function SynthReports({ netlistJson, library, onRunGate }: Props) {
  const [freqMHz, setFreqMHz] = useState(100);
  const [activity, setActivity] = useState(0.15);

  // Active standard-cell model: built-in curated models, or a parsed user .lib.
  const { cellMap, vdd, libName, libOk } = useMemo(() => {
    if (library.id === "sky130")
      return { cellMap: SKY130_BY_NAME as CellMap, vdd: SKY130_VDD_V, libName: library.name, libOk: true };
    if (library.id === "custom" && library.content.trim()) {
      const p = parseLiberty(library.content);
      if (p.ok) {
        const m: CellMap = new Map(p.cells.map((c) => [c.name, c]));
        return { cellMap: m, vdd: p.vdd, libName: library.name, libOk: true };
      }
      return { cellMap: CELL_BY_NAME as CellMap, vdd: VDD_V, libName: library.name, libOk: false };
    }
    return { cellMap: CELL_BY_NAME as CellMap, vdd: VDD_V, libName: library.name || "Generic (built-in)", libOk: true };
  }, [library]);

  const isCustom = library.id === "custom";
  const gate = !!netlistJson && isGateLevel(netlistJson, cellMap);
  const area = useMemo(() => (gate ? areaReport(netlistJson!, cellMap) : null), [netlistJson, gate, cellMap]);
  const timing = useMemo(() => (gate ? timingReport(netlistJson!, cellMap) : null), [netlistJson, gate, cellMap]);
  const power = useMemo(
    () => (gate ? powerReport(netlistJson!, cellMap, freqMHz, activity, vdd) : null),
    [netlistJson, gate, cellMap, freqMHz, activity, vdd]
  );

  if (!gate) {
    return (
      <div className="empty reports-empty">
        <span>
          Run <b>gate-level</b> synthesis (Synthesis view → “Gate-level”) to see area, timing and power. The design is
          mapped to the active standard-cell library — currently <b>{libName}</b>.
          {isCustom && !libOk && " (couldn't parse the uploaded .lib — using the built-in library)."}
        </span>
        {onRunGate && (
          <button className="btn" onClick={onRunGate}>
            Run gate-level synthesis
          </button>
        )}
      </div>
    );
  }

  const exportReport = (fmt: "md" | "json") => {
    const data: ReportData = { libName, vdd, area, timing, power };
    if (fmt === "json") {
      downloadText(
        "synthesis-report.json",
        JSON.stringify({ library: libName, vdd, area, timing, power }, null, 2),
        "application/json"
      );
    } else {
      downloadText("synthesis-report.md", buildMarkdown(data), "text/markdown");
    }
  };

  return (
    <div className="reports">
      <div className="reports-header">
        <div className="reports-note">
          Library: <b>{libName}</b>
          {isCustom && !libOk && " (parse failed — using built-in)"} — estimates for comparing designs, not sign-off
          numbers.
        </div>
        <div className="reports-actions">
          <button className="report-export-btn" title="Download a detailed Markdown report" onClick={() => exportReport("md")}>
            Export report (.md)
          </button>
          <button className="report-export-btn" title="Download the raw report data as JSON" onClick={() => exportReport("json")}>
            .json
          </button>
        </div>
      </div>

      <div className="report-cards">
        {/* Timing */}
        <section className="report-card">
          <h3>Timing</h3>
          {timing ? (
            <>
              <div className="report-bignums">
                {timing.combinational ? (
                  <div className="bignum">
                    <b>{fmtNs(timing.delayPs)}</b>
                    <span>propagation delay</span>
                  </div>
                ) : (
                  <>
                    <div className="bignum">
                      <b>{fmtFreq(timing.fmaxMHz)}</b>
                      <span>F_max</span>
                    </div>
                    <div className="bignum">
                      <b>{fmtNs(timing.delayPs)}</b>
                      <span>critical path</span>
                    </div>
                  </>
                )}
                <div className="bignum">
                  <b>{timing.logicDepth}</b>
                  <span>logic levels</span>
                </div>
              </div>
              <div className="report-sub">
                {timing.combinational
                  ? "Combinational design (no flip-flops) — input → output propagation path:"
                  : `Longest path (starts at ${
                      timing.startKind === "register" ? "a register" : "a primary input"
                    }):`}
              </div>
              <div className="timing-path">
                {timing.path.map((s, i) => (
                  <span key={i} className="path-stage" title={`${s.cell} — arrival ${s.arrivalPs} ps`}>
                    {i > 0 && <span className="path-arrow">→</span>}
                    <span className="path-cell">{s.type}</span>
                    <span className="path-delay">{s.stageDelayPs}ps</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">No timing path found.</p>
          )}
        </section>

        {/* Area */}
        <section className="report-card">
          <h3>Area</h3>
          {area ? (
            <>
              <div className="report-bignums">
                <div className="bignum">
                  <b>{area.total}</b>
                  <span>total area</span>
                </div>
                <div className="bignum">
                  <b>{area.cellCount}</b>
                  <span>cells</span>
                </div>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>cell</th>
                    <th>count</th>
                    <th>area</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {area.rows.map((r) => (
                    <tr key={r.type}>
                      <td className="mono">{r.type}</td>
                      <td>{r.count}</td>
                      <td>{r.area}</td>
                      <td className="bar-cell">
                        <span className="bar" style={{ width: r.pct + "%" }} />
                        <span className="bar-pct">{r.pct.toFixed(0)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No cells.</p>
          )}
        </section>

        {/* Power */}
        <section className="report-card">
          <h3>Power</h3>
          {power ? (
            <>
              <div className="power-controls">
                <label
                  title={
                    power.combinational
                      ? "No clock in this design — average rate at which inputs/nets switch"
                      : "Clock frequency"
                  }
                >
                  {power.combinational ? "Data rate" : "Clock"}
                  <input
                    type="number"
                    min={1}
                    value={freqMHz}
                    onChange={(e) => setFreqMHz(Math.max(1, Number(e.target.value) || 0))}
                  />
                  MHz
                </label>
                <label
                  title={
                    power.combinational
                      ? "Average fraction of nets that toggle per switching event"
                      : "Average fraction of nets that toggle per clock cycle"
                  }
                >
                  Activity α
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={activity}
                    onChange={(e) => setActivity(Math.min(1, Math.max(0, Number(e.target.value) || 0)))}
                  />
                </label>
              </div>
              <div className="report-bignums">
                <div className="bignum">
                  <b>{fmtUW(power.totalUW)}</b>
                  <span>total</span>
                </div>
                <div className="bignum">
                  <b>{fmtUW(power.dynamicUW)}</b>
                  <span>dynamic</span>
                </div>
                <div className="bignum">
                  <b>{fmtUW(power.leakageUW)}</b>
                  <span>leakage</span>
                </div>
              </div>
              <div className="power-split">
                <span
                  className="power-split-dyn"
                  style={{ width: (power.totalUW ? (100 * power.dynamicUW) / power.totalUW : 0) + "%" }}
                  title="Dynamic"
                />
                <span className="power-split-leak" title="Leakage" />
              </div>
              <div className="report-sub muted">
                P = P_leak + ½·α·C·V²·f &nbsp;•&nbsp; C ≈ {power.totalCapFf.toFixed(1)} fF, V = {power.vdd} V
                {power.combinational && (
                  <>
                    <br />
                    Combinational design: f is an assumed input switching rate (no clock), so dynamic power is
                    data-dependent.
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="muted">No power data.</p>
          )}
        </section>
      </div>
    </div>
  );
}
