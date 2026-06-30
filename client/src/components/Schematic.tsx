import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CellSrc } from "../lib/api";

interface Props {
  svg: string;
  srcMap?: Record<string, CellSrc> | null;
  onJump?: (file: string, line: number) => void;
}

const ZOOM_MIN = 0.02;
const ZOOM_MAX = 4;

export default function Schematic({ svg, srcMap, onJump }: Props) {
  const [zoom, setZoom] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag-to-pan + click-after-drag suppression bookkeeping.
  const dragRef = useRef({ active: false, startX: 0, startY: 0, sl: 0, st: 0, moved: false });
  // Anchor a wheel/button zoom around a point: stored in *content* coordinates
  // (pre-scale) together with the pointer's offset inside the viewport, applied
  // after the canvas re-renders at the new scale so that point stays put.
  const anchorRef = useRef<{ cx: number; cy: number; ox: number; oy: number } | null>(null);

  // Wire up schematic -> source cross-highlighting. netlistsvg tags every cell
  // group with class="cell_<name>"; we map that name back to its RTL src line.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !srcMap || !onJump) return;
    const cleanups: Array<() => void> = [];
    host.querySelectorAll('[class*="cell_"]').forEach((el) => {
      const cls = (el.getAttribute("class") || "").split(/\s+/).find((c) => c.startsWith("cell_"));
      if (!cls) return;
      const src = srcMap[cls.slice(5)];
      if (!src) return;
      el.classList.add("xref");
      const handler = () => onJump(src.file, src.line);
      el.addEventListener("click", handler);
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${src.file}:${src.line} — click to jump to source`;
      el.appendChild(title);
      cleanups.push(() => el.removeEventListener("click", handler));
    });
    return () => cleanups.forEach((f) => f());
  }, [svg, srcMap, onJump]);

  // After a zoom that specified an anchor, restore the scroll so the anchored
  // content point stays under the cursor (or viewport centre for buttons).
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    el.scrollLeft = a.cx * zoom - a.ox;
    el.scrollTop = a.cy * zoom - a.oy;
    anchorRef.current = null;
  }, [zoom]);

  // Natural (unscaled) size of the rendered netlist SVG. Prefer the explicit
  // width/height netlistsvg emits, then the viewBox, then a measured fallback.
  const naturalSize = (): { w: number; h: number } | null => {
    const svgEl = hostRef.current?.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return null;
    const wAttr = parseFloat(svgEl.getAttribute("width") || "");
    const hAttr = parseFloat(svgEl.getAttribute("height") || "");
    if (wAttr > 0 && hAttr > 0) return { w: wAttr, h: hAttr };
    const vb = svgEl.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
    const r = svgEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { w: r.width / zoom, h: r.height / zoom };
    return null;
  };

  // Scale the schematic so the whole netlist fits the viewport (never enlarging
  // past 100%), and snap the scroll back to the top-left. This is what makes
  // huge gate-level netlists visible — manual zoom alone can't go small enough.
  const fitToView = () => {
    const el = scrollRef.current;
    const size = naturalSize();
    if (!el || !size) return;
    // Skip if the panel isn't laid out yet (e.g. hidden tab) — fitting against a
    // zero-size viewport would wrongly collapse the zoom to the minimum.
    if (el.clientWidth < 2 || el.clientHeight < 2) return;
    const pad = 32;
    const availW = Math.max(1, el.clientWidth - pad);
    const availH = Math.max(1, el.clientHeight - pad);
    const fit = Math.min(1, availW / size.w, availH / size.h);
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
    // Reuse the anchor mechanism to land at the top-left after the re-render.
    anchorRef.current = { cx: 0, cy: 0, ox: 0, oy: 0 };
    setZoom(nz);
  };

  // Auto-fit whenever a new schematic is rendered, so an oversized result is
  // immediately visible instead of overflowing far beyond the viewport.
  useEffect(() => {
    if (!svg) return;
    const id = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg]);

  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    setZoom((z) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor));
      if (el) {
        const rect = el.getBoundingClientRect();
        // Default anchor = viewport centre (used by the +/- buttons).
        const ox = clientX != null ? clientX - rect.left : rect.width / 2;
        const oy = clientY != null ? clientY - rect.top : rect.height / 2;
        anchorRef.current = {
          cx: (el.scrollLeft + ox) / z,
          cy: (el.scrollTop + oy) / z,
          ox,
          oy,
        };
      }
      return nz;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      sl: el.scrollLeft,
      st: el.scrollTop,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (d.moved) {
      el.scrollLeft = d.sl - dx;
      el.scrollTop = d.st - dy;
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (el && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragRef.current.active = false;
  };

  // Swallow the click that follows a pan-drag so it doesn't trigger a cell jump.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.moved = false;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain wheel keeps native scroll/pan
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  };

  const xrefCount = srcMap ? Object.keys(srcMap).length : 0;

  return (
    <div className="schem-wrap">
      <div className="schem-toolbar">
        <span className="muted">
          synthesized netlist · drag to pan · ⌘/Ctrl-scroll to zoom
          {xrefCount > 0 ? " · click a cell to jump to its RTL" : ""}
        </span>
        <div className="spacer" />
        <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out">-</button>
        <span className="muted">{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
        <button onClick={fitToView} title="Fit the whole schematic to the view">Fit</button>
        <button onClick={() => setZoom(1)} title="Reset to 100%">100%</button>
      </div>
      <div
        className="schem-scroll"
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onWheel={onWheel}
      >
        <div
          className="schem-canvas"
          ref={hostRef}
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
