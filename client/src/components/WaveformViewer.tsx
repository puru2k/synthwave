import { useEffect, useMemo, useRef, useState } from "react";
import type { VcdData, VcdSignal } from "../lib/vcd";
import { valueAtTime } from "../lib/vcd";

const ROW_H = 28;
const WAVE_H = 16;
const LABEL_W = 240;
const TOP_PAD = 24;

type Radix = "hex" | "dec" | "bin";
type ViewMode = "digital" | "analog" | "bits";

export interface RunRef {
  id: string;
  label: string;
}

interface Props {
  data: VcdData;
  runs?: RunRef[];
  onLoadRun?: (id: string) => void;
  seek?: { t: number; n: number } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const keyOf = (s: VcdSignal) => `${s.scope}::${s.name}`;

function fitZoom(endTime: number, targetWidth = 1000): number {
  return clamp(targetWidth / Math.max(1, endTime), 0.00005, 60);
}

function busToBigInt(value: string): bigint | null {
  if (value.includes("x") || value.includes("z")) return null;
  let n = 0n;
  for (const ch of value) n = (n << 1n) | (ch === "1" ? 1n : 0n);
  return n;
}

function formatBus(value: string, width: number, radix: Radix): string {
  if (value.includes("x")) return "x";
  if (value.includes("z")) return "z";
  if (radix === "bin") return value.padStart(width, "0");
  const n = busToBigInt(value);
  if (n == null) return value;
  if (radix === "dec") return n.toString(10);
  return n.toString(16).toUpperCase();
}

const nextRadix = (r: Radix): Radix => (r === "hex" ? "dec" : r === "dec" ? "bin" : "hex");

// Derive a single bit's change list from a bus signal (MSB-first values).
function bitChanges(sig: VcdSignal, bit: number): Array<{ time: number; value: string }> {
  return sig.changes.map((c) => {
    if (c.value.includes("x") || c.value.includes("z")) return { time: c.time, value: "x" };
    const padded = c.value.padStart(sig.width, "0");
    const idx = sig.width - 1 - bit; // bit 0 is LSB
    return { time: c.time, value: padded[idx] ?? "0" };
  });
}

export default function WaveformViewer({ data, runs = [], onLoadRun, seek }: Props) {
  const [pxPerUnit, setPxPerUnit] = useState(() => fitZoom(data.endTime));
  const [cursor, setCursor] = useState<number | null>(null);
  const [markers, setMarkers] = useState<number[]>([]);
  const [radix, setRadix] = useState<Radix>("hex");
  const [perRadix, setPerRadix] = useState<Record<string, Radix>>({});
  const [viewMode, setViewMode] = useState<Record<string, ViewMode>>({});
  // GTKWave-style: only the signals the user has added are drawn (ordered).
  const [shown, setShown] = useState<string[]>(() => data.signals.map(keyOf));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickFilter, setPickFilter] = useState("");
  const [searchKey, setSearchKey] = useState<string>("");
  const [searchVal, setSearchVal] = useState<string>("");
  const [edgeType, setEdgeType] = useState<"any" | "rise" | "fall">("any");
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const dragKey = useRef<string | null>(null);

  const sigByKey = useMemo(() => {
    const m = new Map<string, VcdSignal>();
    for (const s of data.signals) m.set(keyOf(s), s);
    return m;
  }, [data]);

  // On a new dataset, show everything by default (removable from the picker).
  useEffect(() => {
    setPxPerUnit(fitZoom(data.endTime));
    setCursor(null);
    setMarkers([]);
    setShown(data.signals.map(keyOf));
  }, [data]);

  // Close the signal picker on an outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  const scrollToTime = (t: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const x = t * pxPerUnit;
    sc.scrollLeft = clamp(x - sc.clientWidth / 2 + LABEL_W, 0, sc.scrollWidth);
  };

  // External seek (from $display log clicks).
  useEffect(() => {
    if (!seek) return;
    const t = clamp(seek.t, 0, data.endTime);
    setCursor(t);
    setMarkers((m) => (m.length >= 2 ? [t] : [...m, t]));
    scrollToTime(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek]);

  const visible = shown.map((k) => sigByKey.get(k)).filter((s): s is VcdSignal => !!s);

  const rowCount = visible.reduce((n, s) => n + (viewMode[keyOf(s)] === "bits" && s.width > 1 ? s.width : 1), 0);
  const width = Math.max(400, data.endTime * pxPerUnit);
  const totalHeight = TOP_PAD + rowCount * ROW_H;
  const unit = data.timescale.replace(/^[\d\s]+/, "");
  const multiScope = useMemo(() => new Set(data.signals.map((s) => s.scope)).size > 1, [data.signals]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const rough = data.endTime / 10 || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = Math.max(1, Math.round(rough / mag) * mag);
    for (let t = 0; t <= data.endTime; t += step) out.push(t);
    return out;
  }, [data.endTime]);

  const timeAt = (clientX: number): number => {
    const el = canvasRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return clamp(Math.round((clientX - rect.left) / pxPerUnit), 0, data.endTime);
  };

  const probe = cursor != null ? cursor : markers.length ? markers[markers.length - 1] : null;
  const effRadix = (s: VcdSignal): Radix => perRadix[keyOf(s)] ?? radix;
  const delta = markers.length === 2 ? Math.abs(markers[1] - markers[0]) : null;

  const onClick = (e: React.MouseEvent) => {
    const t = timeAt(e.clientX);
    setMarkers((m) => (m.length >= 2 ? [t] : [...m, t]));
  };

  const cycleSigRadix = (s: VcdSignal) => {
    const k = keyOf(s);
    setPerRadix((p) => ({ ...p, [k]: nextRadix(p[k] ?? radix) }));
  };

  const cycleView = (s: VcdSignal) => {
    const k = keyOf(s);
    setViewMode((p) => {
      const cur = p[k] ?? "digital";
      const next: ViewMode = cur === "digital" ? "analog" : cur === "analog" ? "bits" : "digital";
      return { ...p, [k]: next };
    });
  };

  const removeSignal = (k: string) => setShown((prev) => prev.filter((x) => x !== k));
  const toggleSignal = (k: string) =>
    setShown((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const onDrop = (toKey: string) => {
    const from = dragKey.current;
    dragKey.current = null;
    if (!from || from === toKey) return;
    setShown((prev) => {
      const arr = prev.filter((k) => k !== from);
      const idx = arr.indexOf(toKey);
      arr.splice(idx < 0 ? arr.length : idx, 0, from);
      return arr;
    });
  };

  // Jump-to-edge / value search. Fall back to the first visible signal if the
  // chosen one was removed from the view.
  const searchSig = visible.find((s) => keyOf(s) === searchKey) || visible[0];
  const findEdge = (dir: 1 | -1) => {
    const s = searchSig;
    if (!s) return;
    const from = cursor ?? 0;
    let times = s.changes.map((c) => c.time);
    if (searchVal.trim() && s.width > 1) {
      const want = searchVal.trim().toLowerCase();
      times = s.changes
        .filter((c) => {
          const n = busToBigInt(c.value);
          if (n == null) return false;
          return n.toString(10) === want || n.toString(16) === want.replace(/^0x/, "");
        })
        .map((c) => c.time);
    } else if (s.width === 1 && edgeType !== "any") {
      const want = edgeType === "rise" ? "1" : "0";
      times = s.changes.filter((c) => c.value === want).map((c) => c.time);
    }
    const target = dir > 0 ? times.find((t) => t > from) : [...times].reverse().find((t) => t < from);
    if (target != null) {
      setCursor(target);
      scrollToTime(target);
    }
  };

  let rowY = TOP_PAD;

  return (
    <div className="wave-wrap">
      <div className="wave-toolbar">
        <div className="wave-picker-wrap" ref={pickerRef}>
          <button
            className={pickerOpen ? "wave-add active" : "wave-add"}
            onClick={() => setPickerOpen((o) => !o)}
            title="Add or remove signals"
          >
            Signals <span className="muted">{visible.length}/{data.signals.length}</span> ▾
          </button>
          {pickerOpen && (
            <SignalPicker
              signals={data.signals}
              shown={new Set(shown)}
              multiScope={multiScope}
              filter={pickFilter}
              onFilter={setPickFilter}
              onToggle={toggleSignal}
              onAll={() => setShown(data.signals.map(keyOf))}
              onNone={() => setShown([])}
            />
          )}
        </div>

        <div className="wave-divider" />

        {/* Jump to next/previous edge of a signal (value match for buses). */}
        <div className="wave-search" title="Find next/previous edge (or bus value)">
          <select value={searchSig ? keyOf(searchSig) : ""} onChange={(e) => setSearchKey(e.target.value)}>
            {visible.map((s) => (
              <option key={keyOf(s)} value={keyOf(s)}>
                {s.name}
              </option>
            ))}
          </select>
          {searchSig && searchSig.width > 1 ? (
            <input
              className="wave-search-val"
              placeholder="= val"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              title="Bus value to find (decimal or hex)"
            />
          ) : (
            <select value={edgeType} onChange={(e) => setEdgeType(e.target.value as "any" | "rise" | "fall")}>
              <option value="any">any</option>
              <option value="rise">↑ rise</option>
              <option value="fall">↓ fall</option>
            </select>
          )}
          <button onClick={() => findEdge(-1)} title="Previous">‹</button>
          <button onClick={() => findEdge(1)} title="Next">›</button>
        </div>

        <div className="spacer" />

        <span className="cursor-time">
          {delta != null ? `Δ ${delta} ${unit}` : cursor != null ? `t ${cursor} ${unit}` : `${data.endTime} ${unit}`}
        </span>
        {markers.length > 0 && (
          <button className="ghost-btn" onClick={() => setMarkers([])} title="Clear markers">
            clear
          </button>
        )}

        <div className="wave-divider" />

        <select value={radix} onChange={(e) => setRadix(e.target.value as Radix)} title="Default bus radix">
          <option value="hex">hex</option>
          <option value="dec">dec</option>
          <option value="bin">bin</option>
        </select>
        <button onClick={() => setPxPerUnit((p) => clamp(p / 1.6, 0.00005, 60))} title="Zoom out">−</button>
        <button onClick={() => setPxPerUnit((p) => clamp(p * 1.6, 0.00005, 60))} title="Zoom in">+</button>
        <button onClick={() => setPxPerUnit(fitZoom(data.endTime))} title="Zoom to fit">Fit</button>

        {runs.length > 1 && (
          <select
            className="wave-runs"
            value=""
            onChange={(e) => e.target.value && onLoadRun?.(e.target.value)}
            title="Load a previous simulation run"
          >
            <option value="">history…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="wave-empty">
          <p>No signals shown.</p>
          <button className="wave-add" onClick={() => setPickerOpen(true)}>
            Add signals
          </button>
        </div>
      ) : (
        <div className="wave-scroll" ref={scrollRef} onMouseLeave={() => setCursor(null)}>
          <div className="wave-grid" style={{ height: totalHeight }}>
            <div className="wave-names" style={{ width: LABEL_W }}>
              <div className="wave-names-head" style={{ height: TOP_PAD }}>
                <span className="muted">signal</span>
              </div>
              {visible.map((s) => {
                const k = keyOf(s);
                const mode = viewMode[k] ?? "digital";
                const expanded = mode === "bits" && s.width > 1;
                const rows = expanded ? s.width : 1;
                const v = probe != null ? valueAtTime(s, probe) : null;
                const shownVal = v == null ? null : s.width > 1 ? formatBus(v, s.width, effRadix(s)) : v;
                return (
                  <div
                    key={k}
                    className="wave-name"
                    style={{ height: ROW_H * rows }}
                    draggable
                    onDragStart={() => (dragKey.current = k)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(k)}
                    title={`${s.scope}.${s.name}`}
                  >
                    <span className="sig">
                      {multiScope && <span className="scope">{s.scope}.</span>}
                      {s.name}
                      {s.width > 1 && <span className="muted">[{s.width - 1}:0]</span>}
                    </span>
                    <span className="row-controls">
                      {s.width > 1 && (
                        <button className="row-tag" title="View: digital → analog → bits" onClick={() => cycleView(s)}>
                          {mode === "analog" ? "∿" : mode === "bits" ? "bits" : "bus"}
                        </button>
                      )}
                      {s.width > 1 && (
                        <button className="row-tag" title="Radix for this signal" onClick={() => cycleSigRadix(s)}>
                          {effRadix(s)}
                        </button>
                      )}
                      <button className="row-x" title="Remove signal" onClick={() => removeSignal(k)}>
                        ×
                      </button>
                    </span>
                    {!expanded && shownVal != null && <span className="rowval">{shownVal}</span>}
                  </div>
                );
              })}
            </div>

            <div
              className="wave-canvas"
              ref={canvasRef}
              style={{ width }}
              onMouseMove={(e) => setCursor(timeAt(e.clientX))}
              onClick={onClick}
            >
              <svg width={width} height={totalHeight} shapeRendering="crispEdges">
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={t * pxPerUnit} y1={TOP_PAD} x2={t * pxPerUnit} y2={totalHeight} className="grid" />
                    <text x={t * pxPerUnit + 3} y={15} className="tick">
                      {t}
                    </text>
                  </g>
                ))}

                {visible.map((s) => {
                  const k = keyOf(s);
                  const mode = viewMode[k] ?? "digital";
                  if (mode === "bits" && s.width > 1) {
                    const group: JSX.Element[] = [];
                    for (let b = s.width - 1; b >= 0; b--) {
                      const y = rowY;
                      rowY += ROW_H;
                      group.push(
                        <g key={`${k}:${b}`}>
                          <ScalarWaveAt changes={bitChanges(s, b)} y={y} pxPerUnit={pxPerUnit} endTime={data.endTime} />
                          <text x={4} y={y + ROW_H / 2 + 3} className="bit-label">
                            [{b}]
                          </text>
                        </g>
                      );
                    }
                    return <g key={k}>{group}</g>;
                  }
                  const y = rowY;
                  rowY += ROW_H;
                  return (
                    <g key={k}>
                      <SignalRow sig={s} y={y} pxPerUnit={pxPerUnit} endTime={data.endTime} radix={effRadix(s)} mode={mode} />
                    </g>
                  );
                })}

                {markers.map((t, i) => (
                  <g key={i}>
                    <line x1={t * pxPerUnit} y1={0} x2={t * pxPerUnit} y2={totalHeight} className="marker" />
                    <text x={t * pxPerUnit + 3} y={totalHeight - 4} className="marker-label">
                      {i === 0 ? "A" : "B"}
                    </text>
                  </g>
                ))}
                {cursor != null && (
                  <line x1={cursor * pxPerUnit} y1={0} x2={cursor * pxPerUnit} y2={totalHeight} className="cursor" />
                )}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalPicker({
  signals,
  shown,
  multiScope,
  filter,
  onFilter,
  onToggle,
  onAll,
  onNone,
}: {
  signals: VcdSignal[];
  shown: Set<string>;
  multiScope: boolean;
  filter: string;
  onFilter: (v: string) => void;
  onToggle: (k: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const q = filter.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, VcdSignal[]>();
    for (const s of signals) {
      if (q && !s.name.toLowerCase().includes(q) && !s.scope.toLowerCase().includes(q)) continue;
      const arr = m.get(s.scope) ?? [];
      arr.push(s);
      m.set(s.scope, arr);
    }
    return [...m.entries()];
  }, [signals, q]);

  return (
    <div className="wave-picker">
      <div className="wave-picker-top">
        <input autoFocus placeholder="Filter signals…" value={filter} onChange={(e) => onFilter(e.target.value)} />
        <button onClick={onAll} title="Show all signals">all</button>
        <button onClick={onNone} title="Remove all signals">none</button>
      </div>
      <div className="wave-picker-list">
        {groups.length === 0 && <div className="wave-picker-empty">No matches</div>}
        {groups.map(([scope, sigs]) => (
          <div key={scope} className="wave-picker-group">
            {multiScope && <div className="wave-picker-scope">{scope}</div>}
            {sigs.map((s) => {
              const k = keyOf(s);
              const on = shown.has(k);
              return (
                <label key={k} className={on ? "wave-picker-item on" : "wave-picker-item"}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(k)} />
                  <span className="wave-picker-name">{s.name}</span>
                  {s.width > 1 && <span className="muted">[{s.width - 1}:0]</span>}
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalRow({ sig, y, pxPerUnit, endTime, radix, mode }: { sig: VcdSignal; y: number; pxPerUnit: number; endTime: number; radix: Radix; mode: ViewMode }) {
  const top = y + (ROW_H - WAVE_H) / 2;
  const bottom = top + WAVE_H;
  const mid = (top + bottom) / 2;

  return (
    <>
      <line x1={0} y1={bottom + (ROW_H - WAVE_H) / 2} x2={endTime * pxPerUnit} y2={bottom + (ROW_H - WAVE_H) / 2} className="rowsep" />
      {sig.width === 1 ? (
        <ScalarWave changes={sig.changes} top={top} bottom={bottom} mid={mid} pxPerUnit={pxPerUnit} endTime={endTime} />
      ) : mode === "analog" ? (
        <AnalogWave sig={sig} top={top} bottom={bottom} pxPerUnit={pxPerUnit} endTime={endTime} />
      ) : (
        <BusWave sig={sig} top={top} bottom={bottom} mid={mid} pxPerUnit={pxPerUnit} endTime={endTime} radix={radix} />
      )}
    </>
  );
}

function ScalarWaveAt({ changes, y, pxPerUnit, endTime }: { changes: VcdSignal["changes"]; y: number; pxPerUnit: number; endTime: number }) {
  const top = y + (ROW_H - WAVE_H) / 2;
  const bottom = top + WAVE_H;
  const mid = (top + bottom) / 2;
  return (
    <>
      <line x1={0} y1={bottom + (ROW_H - WAVE_H) / 2} x2={endTime * pxPerUnit} y2={bottom + (ROW_H - WAVE_H) / 2} className="rowsep" />
      <ScalarWave changes={changes} top={top} bottom={bottom} mid={mid} pxPerUnit={pxPerUnit} endTime={endTime} />
    </>
  );
}

// Scalar waveform with slewed (slightly tilted) edges, plus distinct rendering
// for x (don't-care, red box) and z (high-impedance, mid-level amber line).
function ScalarWave({ changes, top, bottom, mid, pxPerUnit, endTime }: { changes: VcdSignal["changes"]; top: number; bottom: number; mid: number; pxPerUnit: number; endTime: number }) {
  const segs = changes.length ? changes.map((c) => ({ t: c.time, v: c.value })) : [{ t: 0, v: "x" }];
  if (segs[0].t > 0) segs.unshift({ t: 0, v: "x" });

  const yFor = (v: string) => (v === "1" ? top : v === "0" ? bottom : mid); // z → mid
  const SLEW = 3.5; // px of horizontal slope on each transition (the "tilt")

  let d = "";
  let penY: number | null = null; // current pen height; null after an x gap
  const xBoxes: Array<{ x: number; w: number }> = [];
  const zLines: Array<{ x0: number; x1: number }> = [];

  for (let i = 0; i < segs.length; i++) {
    const x0 = segs[i].t * pxPerUnit;
    const x1 = (i + 1 < segs.length ? segs[i + 1].t : endTime) * pxPerUnit;
    if (x1 < x0) continue;
    const v = segs[i].v;

    if (v === "x") {
      xBoxes.push({ x: x0, w: Math.max(0, x1 - x0) });
      penY = null;
      continue;
    }

    const y = yFor(v);
    const slew = Math.min(SLEW, (x1 - x0) / 2);
    if (penY === null) {
      d += `M ${x0} ${y} L ${x1} ${y} `;
    } else if (penY !== y) {
      d += `L ${(x0 + slew).toFixed(2)} ${y} L ${x1} ${y} `; // slope then hold
    } else {
      d += `L ${x1} ${y} `;
    }
    if (v === "z") zLines.push({ x0, x1 });
    penY = y;
  }

  return (
    <g>
      {xBoxes.map((b, i) => (
        <rect key={`x${i}`} x={b.x} y={top} width={b.w} height={bottom - top} className="wave-x-box" />
      ))}
      <path d={d} className="wave-line" fill="none" />
      {zLines.map((z, i) => (
        <line key={`z${i}`} x1={z.x0} y1={mid} x2={z.x1} y2={mid} className="wave-z" />
      ))}
    </g>
  );
}

function AnalogWave({ sig, top, bottom, pxPerUnit, endTime }: { sig: VcdSignal; top: number; bottom: number; pxPerUnit: number; endTime: number }) {
  const max = (1n << BigInt(sig.width)) - 1n || 1n;
  const span = bottom - top;
  const yFor = (n: bigint) => bottom - (span * Number(n)) / Number(max);
  const changes = sig.changes.length ? sig.changes : [{ time: 0, value: "0" }];
  const pts: string[] = [];
  for (let i = 0; i < changes.length; i++) {
    const n = busToBigInt(changes[i].value);
    if (n == null) continue;
    const x0 = changes[i].time * pxPerUnit;
    const x1 = (i + 1 < changes.length ? changes[i + 1].time : endTime) * pxPerUnit;
    const yv = yFor(n);
    pts.push(`${x0},${yv} ${x1},${yv}`);
  }
  return <polyline points={pts.join(" ")} className="analog-line" fill="none" />;
}

function BusWave({ sig, top, bottom, mid, pxPerUnit, endTime, radix }: { sig: VcdSignal; top: number; bottom: number; mid: number; pxPerUnit: number; endTime: number; radix: Radix }) {
  const changes = sig.changes.length ? sig.changes : [{ time: 0, value: "x" }];
  const out: JSX.Element[] = [];
  const slant = Math.min(4, Math.max(1, pxPerUnit * 0.6));

  for (let i = 0; i < changes.length; i++) {
    const t0 = changes[i].time;
    const t1 = i + 1 < changes.length ? changes[i + 1].time : endTime;
    const x0 = t0 * pxPerUnit;
    const x1 = t1 * pxPerUnit;
    if (x1 <= x0) continue;
    const val = changes[i].value;
    const isX = val.includes("x") || val.includes("z");
    const label = formatBus(val, sig.width, radix);

    out.push(
      <g key={i}>
        <polygon
          points={`${x0},${mid} ${x0 + slant},${top} ${x1 - slant},${top} ${x1},${mid} ${x1 - slant},${bottom} ${x0 + slant},${bottom}`}
          className={isX ? "bus-x" : "bus"}
        />
        {x1 - x0 > 22 && (
          <text x={(x0 + x1) / 2} y={mid + 3.5} textAnchor="middle" className="bus-label">
            {label}
          </text>
        )}
      </g>
    );
  }
  return <g>{out}</g>;
}
