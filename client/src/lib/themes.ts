// Theme registry. Each theme drives the whole UI through CSS custom properties
// and provides matching token colors for the Monaco editor.

export interface EditorColors {
  base: "vs" | "vs-dark";
  bg: string;
  fg: string;
  keyword: string;
  directive: string;
  type: string;
  number: string;
  string: string;
  comment: string;
}

export interface ThemeDef {
  id: string;
  label: string;
  dark: boolean;
  vars: {
    bg: string;
    bg2: string;
    bg3: string;
    panel: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accent2: string;
    green: string;
    red: string;
    yellow: string;
  };
  editor: EditorColors;
}

// SynthWave ships a single, brand-aligned light/dark pair. Both share the
// signature blue (accent) + teal (accent-2) so the UI reads as one product
// regardless of appearance. "Auto" follows the OS between the two.
export const THEMES: ThemeDef[] = [
  {
    id: "night",
    label: "Night",
    dark: true,
    // These mirror the :root fallbacks in styles.css — the canonical SynthWave look.
    vars: {
      bg: "#0d1117", bg2: "#131a24", bg3: "#1b232f", panel: "#11161f", border: "#283242",
      text: "#d7dee8", muted: "#7d8aa0", accent: "#4c8dff", accent2: "#36c2a8",
      green: "#3fb950", red: "#f85149", yellow: "#d6a13a",
    },
    editor: { base: "vs-dark", bg: "#0d1117", fg: "#d7dee8", keyword: "#4c8dff", directive: "#c586c0", type: "#36c2a8", number: "#a5d6ff", string: "#e0a06a", comment: "#6b7a90" },
  },
  {
    id: "day",
    label: "Day",
    dark: false,
    vars: {
      bg: "#ffffff", bg2: "#f4f6fa", bg3: "#e9edf3", panel: "#ffffff", border: "#d3dbe6",
      text: "#1b2430", muted: "#5c6875", accent: "#2f6fe0", accent2: "#0d8f7d",
      green: "#1a7f37", red: "#cf222e", yellow: "#9a6700",
    },
    editor: { base: "vs", bg: "#ffffff", fg: "#1b2430", keyword: "#2f6fe0", directive: "#8250df", type: "#0d8f7d", number: "#0a7d33", string: "#a3232b", comment: "#6a7686" },
  },
];

export const DEFAULT_THEME = "night";

// "auto" follows the OS appearance, mapping to these concrete themes.
export const AUTO_DARK_THEME = "night";
export const AUTO_LIGHT_THEME = "day";

// The only preferences the UI persists/offers.
export type ThemePref = "auto" | "day" | "night";

// Collapse any stored/legacy theme id (older builds had 7 named themes) onto the
// current auto/day/night set so upgrades never land on a missing theme.
export function normalizeThemePref(pref: string | null | undefined): ThemePref {
  if (pref === "auto" || pref === "day" || pref === "night") return pref;
  // The only historical light theme was "light-plus"; everything else was dark.
  return pref === "light-plus" ? "day" : pref ? "night" : "auto";
}

// Resolve a (possibly "auto") theme preference to a concrete theme id, given
// whether the system currently prefers a dark appearance.
export function resolveThemeId(pref: string, systemDark: boolean): string {
  const p = normalizeThemePref(pref);
  if (p === "auto") return systemDark ? AUTO_DARK_THEME : AUTO_LIGHT_THEME;
  return p;
}

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyThemeVars(theme: ThemeDef): void {
  const r = document.documentElement;
  const v = theme.vars;
  r.style.setProperty("--bg", v.bg);
  r.style.setProperty("--bg-2", v.bg2);
  r.style.setProperty("--bg-3", v.bg3);
  r.style.setProperty("--panel", v.panel);
  r.style.setProperty("--border", v.border);
  r.style.setProperty("--text", v.text);
  r.style.setProperty("--muted", v.muted);
  r.style.setProperty("--accent", v.accent);
  r.style.setProperty("--accent-2", v.accent2);
  r.style.setProperty("--green", v.green);
  r.style.setProperty("--red", v.red);
  r.style.setProperty("--yellow", v.yellow);
  r.dataset.theme = theme.id;
  r.dataset.dark = theme.dark ? "1" : "0";
}
