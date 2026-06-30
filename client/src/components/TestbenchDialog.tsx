import { useMemo, useState } from "react";
import type { ParsedModule } from "../lib/ports";
import { defaultStim, generateTestbench, type PortStim, type StimKind, type TbSpec } from "../lib/tbgen";
import { IconClose, IconPlay } from "./Icons";

interface Props {
  modules: ParsedModule[];
  defaultTop?: string;
  onClose: () => void;
  onApply: (fileName: string, content: string, run: boolean) => void;
}

// "0:0, 20:1, 40:0" <-> step list (time:value pairs).
function parseSteps(s: string): Array<{ timeNs: number; value: string }> {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [t, ...v] = p.split(":");
      return { timeNs: Number(t) || 0, value: (v.join(":") || "0").trim() };
    });
}
function stepsToStr(steps?: Array<{ timeNs: number; value: string }>): string {
  return (steps || []).map((s) => `${s.timeNs}:${s.value}`).join(", ");
}

export default function TestbenchDialog({ modules, defaultTop, onClose, onApply }: Props) {
  const initial =
    (defaultTop && modules.find((m) => m.name === defaultTop)) || modules.find((m) => m.ports.length) || modules[0];
  const [modName, setModName] = useState(initial?.name || "");
  const mod = modules.find((m) => m.name === modName) || initial;

  const inputs = useMemo(() => (mod ? mod.ports.filter((p) => p.dir === "input") : []), [mod]);
  const hasClock = inputs.some((p) => p.isClock);

  const [stim, setStim] = useState<Record<string, PortStim>>(() => (mod ? defaultStim(mod.ports) : {}));
  const [simEndNs, setSimEndNs] = useState(hasClock ? 200 : 100);
  const [timescale, setTimescale] = useState("1ns / 1ps");

  // Rebuild stim when the selected module changes.
  const switchModule = (name: string) => {
    setModName(name);
    const m = modules.find((x) => x.name === name);
    if (m) {
      setStim(defaultStim(m.ports));
      setSimEndNs(m.ports.some((p) => p.dir === "input" && p.isClock) ? 200 : 100);
    }
  };

  const update = (name: string, patch: Partial<PortStim>) =>
    setStim((s) => ({ ...s, [name]: { ...s[name], ...patch } }));

  const spec: TbSpec | null = mod
    ? { top: mod.name, ports: mod.ports, stim, simEndNs, timescale, instName: "dut" }
    : null;
  const preview = spec ? generateTestbench(spec) : "";
  const fileName = mod ? `${mod.name}_tb.v` : "testbench.v";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tb-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Testbench &amp; stimulus generator</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </div>

        {!mod ? (
          <div className="modal-body">
            <p className="muted">No modules found in the design files. Add a design module first.</p>
          </div>
        ) : (
          <div className="modal-body tb-grid">
            <div className="tb-config">
              <div className="tb-row">
                <label className="tb-field">
                  Module
                  <select value={modName} onChange={(e) => switchModule(e.target.value)}>
                    {modules.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tb-field">
                  Sim length (ns)
                  <input
                    type="number"
                    min={1}
                    value={simEndNs}
                    onChange={(e) => setSimEndNs(Math.max(1, Number(e.target.value) || 0))}
                  />
                </label>
                <label className="tb-field">
                  Timescale
                  <input value={timescale} onChange={(e) => setTimescale(e.target.value)} />
                </label>
              </div>

              {inputs.length === 0 ? (
                <p className="muted">This module has no inputs to drive.</p>
              ) : (
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th>Input</th>
                      <th>Drive as</th>
                      <th>Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inputs.map((p) => {
                      const s = stim[p.name] || { name: p.name, kind: "const" as StimKind };
                      return (
                        <tr key={p.name}>
                          <td className="mono">
                            {p.name}
                            {p.rangeText ? <span className="muted"> {p.rangeText}</span> : ""}
                          </td>
                          <td>
                            <select
                              value={s.kind}
                              onChange={(e) => update(p.name, { kind: e.target.value as StimKind })}
                            >
                              <option value="clock">Clock</option>
                              <option value="reset">Reset</option>
                              <option value="const">Constant</option>
                              <option value="steps">Sequence</option>
                            </select>
                          </td>
                          <td>
                            {s.kind === "clock" && (
                              <label className="tb-inline">
                                period
                                <input
                                  type="number"
                                  min={2}
                                  value={s.periodNs ?? 10}
                                  onChange={(e) => update(p.name, { periodNs: Math.max(2, Number(e.target.value) || 0) })}
                                />
                                ns
                              </label>
                            )}
                            {s.kind === "reset" && (
                              <span className="tb-inline-group">
                                <label className="tb-inline">
                                  <input
                                    type="checkbox"
                                    checked={!!s.activeLow}
                                    onChange={(e) => update(p.name, { activeLow: e.target.checked })}
                                  />
                                  active-low
                                </label>
                                <label className="tb-inline">
                                  assert
                                  <input
                                    type="number"
                                    min={0}
                                    value={s.assertNs ?? 20}
                                    onChange={(e) => update(p.name, { assertNs: Math.max(0, Number(e.target.value) || 0) })}
                                  />
                                  ns
                                </label>
                              </span>
                            )}
                            {s.kind === "const" && (
                              <label className="tb-inline">
                                value
                                <input
                                  className="mono"
                                  value={s.value ?? "0"}
                                  onChange={(e) => update(p.name, { value: e.target.value })}
                                  placeholder="0 / 8'hA5"
                                />
                              </label>
                            )}
                            {s.kind === "steps" && (
                              <label className="tb-inline tb-steps">
                                <input
                                  className="mono"
                                  value={stepsToStr(s.steps)}
                                  onChange={(e) => update(p.name, { steps: parseSteps(e.target.value) })}
                                  placeholder="time:value, e.g. 0:0, 20:1, 40:0"
                                />
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <p className="muted tb-hint">
                Times are in timescale units. “Sequence” applies values at the given times (relative to t=0).
              </p>
            </div>

            <div className="tb-preview">
              <div className="tb-preview-head">
                Preview · <span className="mono">{fileName}</span>
              </div>
              <pre className="console tb-preview-code">{preview}</pre>
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!mod} onClick={() => mod && onApply(fileName, preview, false)}>
            Insert as file
          </button>
          <button className="btn primary" disabled={!mod} onClick={() => mod && onApply(fileName, preview, true)}>
            <IconPlay size={15} /> Generate &amp; run
          </button>
        </div>
      </div>
    </div>
  );
}
