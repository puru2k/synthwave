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

// Brand-aligned and neon theme options.
export const THEMES: ThemeDef[] = [
  {
    id: "night",
    label: "Night",
    dark: true,
    vars: {
      bg: "#0d1117",
      bg2: "#131a24",
      bg3: "#1b232f",
      panel: "#11161f",
      border: "#283242",
      text: "#d7dee8",
      muted: "#7d8aa0",
      accent: "#4c8dff",
      accent2: "#36c2a8",
      green: "#3fb950",
      red: "#f85149",
      yellow: "#d6a13a",
    },
    editor: {
      base: "vs-dark",
      bg: "#0d1117",
      fg: "#d7dee8",
      keyword: "#4c8dff",
      directive: "#c586c0",
      type: "#36c2a8",
      number: "#a5d6ff",
      string: "#e0a06a",
      comment: "#6b7a90",
    },
  },
  {
    id: "day",
    label: "Day",
    dark: false,
    vars: {
      bg: "#ffffff",
      bg2: "#f1f5f9",
      bg3: "#e2e8f0",
      panel: "#ffffff",
      border: "#cbd5e1",
      text: "#0f172a",
      muted: "#475569",
      accent: "#0969da",
      accent2: "#0f766e",
      green: "#15803d",
      red: "#dc2626",
      yellow: "#b45309",
    },
    editor: {
      base: "vs",
      bg: "#ffffff",
      fg: "#0f172a",
      keyword: "#0969da",
      directive: "#6f42c1",
      type: "#0f766e",
      number: "#15803d",
      string: "#a40e26",
      comment: "#475569",
    },
  },
  {
    id: "synthwave",
    label: "SynthWave (Neon)",
    dark: true,
    vars: {
      bg: "#130924",
      bg2: "#1d1035",
      bg3: "#281748",
      panel: "#160b29",
      border: "#3f2268",
      text: "#f2e9ff",
      muted: "#9b84c7",
      accent: "#ff2a85",
      accent2: "#00f0ff",
      green: "#05ffa1",
      red: "#ff3366",
      yellow: "#ffe600",
    },
    editor: {
      base: "vs-dark",
      bg: "#130924",
      fg: "#f2e9ff",
      keyword: "#ff2a85",
      directive: "#d946ef",
      type: "#00f0ff",
      number: "#ffe600",
      string: "#05ffa1",
      comment: "#7e699b",
    },
  },
  {
    id: "cyber",
    label: "Cyberpunk",
    dark: true,
    vars: {
      bg: "#080e0c",
      bg2: "#0e1a15",
      bg3: "#152720",
      panel: "#0b1411",
      border: "#1d382d",
      text: "#d2f5e3",
      muted: "#639780",
      accent: "#00ff66",
      accent2: "#00e5ff",
      green: "#00ff66",
      red: "#ff3b56",
      yellow: "#ffb700",
    },
    editor: {
      base: "vs-dark",
      bg: "#080e0c",
      fg: "#d2f5e3",
      keyword: "#00ff66",
      directive: "#ffb700",
      type: "#00e5ff",
      number: "#ffdd44",
      string: "#73f7a8",
      comment: "#4e7362",
    },
  },
];

export const DEFAULT_THEME = "night";

export const AUTO_DARK_THEME = "night";
export const AUTO_LIGHT_THEME = "day";

export type ThemePref = "auto" | "day" | "night" | "synthwave" | "cyber";

export function normalizeThemePref(pref: string | null | undefined): ThemePref {
  if (pref === "auto" || pref === "day" || pref === "night" || pref === "synthwave" || pref === "cyber") {
    return pref;
  }
  return pref === "light-plus" ? "day" : pref ? "night" : "auto";
}

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
