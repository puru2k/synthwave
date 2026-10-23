// Minimal line-style icons. They inherit color from the surrounding text
// (stroke="currentColor"), so they automatically follow the active theme.

import type React from "react";

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const base = (size: number, className?: string, style?: React.CSSProperties) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  style,
  "aria-hidden": true,
});

export function IconActivity({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}

export function IconMenu({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function IconPanelLeft({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  );
}

export function IconMaximize({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function IconMinimize({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 8h3V5" />
      <path d="M19 8h-3V5" />
      <path d="M19 16h-3v3" />
      <path d="M5 16h3v3" />
    </svg>
  );
}

export function IconDownload({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconUpload({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function IconShare({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  );
}

export function IconPlus({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconClose({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconChevron({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function IconFolder({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

// SynthWave brand mark: clean, cohesive digital clock & pulse waveform
export function Logo({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path
        d="M2 13h4.5l2.5-7 4 14 3.5-9 2 4h4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPlay({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

// Chip / synthesize icon.
export function IconCpu({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </svg>
  );
}

export function IconSearch({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// Sitemap / module-hierarchy icon: a parent node branching to two children.
export function IconHierarchy({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <rect x="3" y="17" width="6" height="4" rx="1" />
      <rect x="15" y="17" width="6" height="4" rx="1" />
      <path d="M12 7v4M6 17v-2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// Format / reindent code
export function IconAlignLeft({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <line x1="21" y1="6" x2="3" y2="6" />
      <line x1="15" y1="12" x2="3" y2="12" />
      <line x1="19" y1="18" x2="3" y2="18" />
    </svg>
  );
}

// Code / snippet template icon
export function IconCode({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

// Keyboard shortcuts icon
export function IconKeyboard({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      <line x1="6" y1="8" x2="6.01" y2="8" strokeWidth="2.4" />
      <line x1="10" y1="8" x2="10.01" y2="8" strokeWidth="2.4" />
      <line x1="14" y1="8" x2="14.01" y2="8" strokeWidth="2.4" />
      <line x1="18" y1="8" x2="18.01" y2="8" strokeWidth="2.4" />
      <line x1="6" y1="12" x2="6.01" y2="12" strokeWidth="2.4" />
      <line x1="10" y1="12" x2="10.01" y2="12" strokeWidth="2.4" />
      <line x1="14" y1="12" x2="14.01" y2="12" strokeWidth="2.4" />
      <line x1="18" y1="12" x2="18.01" y2="12" strokeWidth="2.4" />
      <line x1="7" y1="16" x2="17" y2="16" />
    </svg>
  );
}

// Help / question icon
export function IconHelpCircle({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.4" />
    </svg>
  );
}

// Clock / timing icon
export function IconClock({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Fast / WASM bolt icon
export function IconBolt({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// Warning triangle icon
export function IconAlertTriangle({ size = 15, className, style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.4" />
    </svg>
  );
}

// Layers / FSM state icon
export function IconLayers({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
