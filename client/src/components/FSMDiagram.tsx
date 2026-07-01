import { useMemo } from "react";
import type { FsmData } from "../lib/fsm";
import { stateLabel, inputLabel } from "../lib/fsm";

interface Props {
  fsm: FsmData;
  labels: Record<number, string>;
}

const NODE_R = 30;

export default function FSMDiagram({ fsm, labels }: Props) {
  const { states } = fsm;
  const N = states.length;
  const isMoore = fsm.kind === "moore";

  const { W, H, pos } = useMemo(() => {
    const radius = Math.max(130, 46 * N);
    const W = radius * 2 + 200;
    const H = radius * 2 + 200;
    const cx = W / 2;
    const cy = H / 2;
    const pos: Record<string, { x: number; y: number; a: number }> = {};
    states.forEach((s, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      pos[s] = { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), a };
    });
    return { W, H, cx, cy, pos };
  }, [states, N]);

  // Group transitions by from->to. For source-extracted FSMs the label is the
  // pre-built condition (Mealy edges already carry "cond / output"); for Yosys
  // FSMs we synthesise it from the input pattern.
  const edges = useMemo(() => {
    const grouped = new Map<string, { from: string; to: string; labels: string[] }>();
    for (const t of fsm.transitions) {
      const key = `${t.from}->${t.to}`;
      if (!grouped.has(key)) grouped.set(key, { from: t.from, to: t.to, labels: [] });
      const lbl = fsm.fromSource ? t.cond ?? "" : inputLabel(t.in);
      const g = grouped.get(key)!;
      if (lbl && !g.labels.includes(lbl)) g.labels.push(lbl);
    }
    const keys = new Set(grouped.keys());
    return [...grouped.values()].map((e) => ({
      ...e,
      bidir: e.from !== e.to && keys.has(`${e.to}->${e.from}`),
    }));
  }, [fsm.transitions, fsm.fromSource]);

  const idx = (s: string) => states.indexOf(s);

  return (
    <div className="fsm-wrap">
      <div className="fsm-toolbar">
        <span className="muted">
          {fsm.kind && (
            <span className={`fsm-kind fsm-kind-${fsm.kind}`} title={kindHint(fsm.kind)}>
              {fsm.kind === "moore" ? "Moore" : "Mealy"}
            </span>
          )}
          {N} states · {fsm.transitions.length} transitions · reset =
          <b className="fsm-reset-label"> {stateLabel(fsm.reset, labels)}</b>
        </span>
        {fsm.kind && (
          <span className="fsm-legend muted">
            {isMoore ? "output shown in state (output = f(state))" : "label = input / output (output = f(state, input))"}
          </span>
        )}
      </div>
      <div className="fsm-scroll">
        <svg width={W} height={H} className="fsm-svg">
          <defs>
            <marker id="fsm-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L8,3 L0,6 Z" className="fsm-arrowhead" />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const label = e.labels.join(", ");
            if (e.from === e.to) {
              const p = pos[e.from];
              const a = p.a;
              const a1 = a - 0.45;
              const a2 = a + 0.45;
              const s = { x: p.x + NODE_R * Math.cos(a1), y: p.y + NODE_R * Math.sin(a1) };
              const en = { x: p.x + NODE_R * Math.cos(a2), y: p.y + NODE_R * Math.sin(a2) };
              const c1 = { x: p.x + (NODE_R + 52) * Math.cos(a1 - 0.25), y: p.y + (NODE_R + 52) * Math.sin(a1 - 0.25) };
              const c2 = { x: p.x + (NODE_R + 52) * Math.cos(a2 + 0.25), y: p.y + (NODE_R + 52) * Math.sin(a2 + 0.25) };
              const lp = { x: p.x + (NODE_R + 64) * Math.cos(a), y: p.y + (NODE_R + 64) * Math.sin(a) };
              return (
                <g key={i}>
                  <path d={`M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${en.x} ${en.y}`} className="fsm-edge" markerEnd="url(#fsm-arrow)" />
                  <text x={lp.x} y={lp.y} className="fsm-edge-label" textAnchor="middle">{label}</text>
                </g>
              );
            }
            const from = pos[e.from];
            const to = pos[e.to];
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;
            const sign = idx(e.from) < idx(e.to) ? 1 : -1;
            const off = e.bidir ? 30 * sign : 0;
            const s = { x: from.x + ux * NODE_R, y: from.y + uy * NODE_R };
            const en = { x: to.x - ux * NODE_R, y: to.y - uy * NODE_R };
            const mid = { x: (s.x + en.x) / 2 + px * off, y: (s.y + en.y) / 2 + py * off };
            const lp = { x: mid.x + px * 12 * (off >= 0 ? 1 : -1), y: mid.y + py * 12 * (off >= 0 ? 1 : -1) };
            return (
              <g key={i}>
                <path d={`M ${s.x} ${s.y} Q ${mid.x} ${mid.y} ${en.x} ${en.y}`} className="fsm-edge" markerEnd="url(#fsm-arrow)" />
                <text x={lp.x} y={lp.y} className="fsm-edge-label" textAnchor="middle">{label}</text>
              </g>
            );
          })}

          {states.map((s) => {
            const p = pos[s];
            const isReset = s === fsm.reset;
            const out = isMoore ? fsm.stateOutputs?.[s] : undefined;
            return (
              <g key={s}>
                {isReset && <circle cx={p.x} cy={p.y} r={NODE_R + 5} className="fsm-reset-ring" />}
                <circle cx={p.x} cy={p.y} r={NODE_R} className={isReset ? "fsm-node fsm-node-reset" : "fsm-node"} />
                <text x={p.x} y={out ? p.y - 2 : p.y + 4} textAnchor="middle" className="fsm-node-label">
                  {stateLabel(s, labels)}
                </text>
                {out && (
                  <text x={p.x} y={p.y + 12} textAnchor="middle" className="fsm-node-output">
                    {out}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function kindHint(kind: "moore" | "mealy"): string {
  return kind === "moore"
    ? "Moore machine: outputs depend only on the current state, so they are written inside the state bubbles."
    : "Mealy machine: outputs depend on the state and the current input, so they are written on the transitions as input / output.";
}
