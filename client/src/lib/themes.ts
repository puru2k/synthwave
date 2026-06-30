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

export const THEMES: ThemeDef[] = [
  {
    id: "dark-plus",
    label: "Dark+ (default)",
    dark: true,
    vars: {
      bg: "#1e1e1e", bg2: "#252526", bg3: "#2d2d30", panel: "#1e1e1e", border: "#3c3c3c",
      text: "#d4d4d4", muted: "#858585", accent: "#569cd6", accent2: "#4ec9b0",
      green: "#6a9955", red: "#f44747", yellow: "#d7ba7d",
    },
    editor: { base: "vs-dark", bg: "#1e1e1e", fg: "#d4d4d4", keyword: "#569cd6", directive: "#c586c0", type: "#4ec9b0", number: "#b5cea8", string: "#ce9178", comment: "#6a9955" },
  },
  {
    id: "light-plus",
    label: "Light+",
    dark: false,
    vars: {
      bg: "#ffffff", bg2: "#f3f3f3", bg3: "#e9e9ec", panel: "#ffffff", border: "#d4d4d4",
      text: "#1f1f1f", muted: "#6b6b6b", accent: "#005fb8", accent2: "#267f99",
      green: "#098658", red: "#cd3131", yellow: "#b58900",
    },
    editor: { base: "vs", bg: "#ffffff", fg: "#1f1f1f", keyword: "#0000ff", directive: "#af00db", type: "#267f99", number: "#098658", string: "#a31515", comment: "#008000" },
  },
  {
    id: "monokai",
    label: "Monokai",
    dark: true,
    vars: {
      bg: "#272822", bg2: "#2d2e28", bg3: "#3e3d32", panel: "#272822", border: "#49483e",
      text: "#f8f8f2", muted: "#a59f93", accent: "#66d9ef", accent2: "#fd971f",
      green: "#a6e22e", red: "#f92672", yellow: "#e6db74",
    },
    editor: { base: "vs-dark", bg: "#272822", fg: "#f8f8f2", keyword: "#f92672", directive: "#ae81ff", type: "#66d9ef", number: "#ae81ff", string: "#e6db74", comment: "#75715e" },
  },
  {
    id: "dracula",
    label: "Dracula",
    dark: true,
    vars: {
      bg: "#282a36", bg2: "#2d2f3b", bg3: "#343746", panel: "#282a36", border: "#44475a",
      text: "#f8f8f2", muted: "#6272a4", accent: "#bd93f9", accent2: "#ff79c6",
      green: "#50fa7b", red: "#ff5555", yellow: "#f1fa8c",
    },
    editor: { base: "vs-dark", bg: "#282a36", fg: "#f8f8f2", keyword: "#ff79c6", directive: "#bd93f9", type: "#8be9fd", number: "#bd93f9", string: "#f1fa8c", comment: "#6272a4" },
  },
  {
    id: "ember",
    label: "Ember (red)",
    dark: true,
    vars: {
      bg: "#1d1718", bg2: "#241c1d", bg3: "#2e2324", panel: "#1d1718", border: "#46343a",
      text: "#f1e3e3", muted: "#a68a8a", accent: "#ff5d5d", accent2: "#ffa24c",
      green: "#7fc97f", red: "#ff5d5d", yellow: "#f5c95b",
    },
    editor: { base: "vs-dark", bg: "#1d1718", fg: "#f1e3e3", keyword: "#ff6b6b", directive: "#ff9f43", type: "#ffb86c", number: "#ffd29a", string: "#f5c95b", comment: "#8a6d6d" },
  },
  {
    id: "solar",
    label: "Solar (amber)",
    dark: true,
    vars: {
      bg: "#1c1a12", bg2: "#232017", bg3: "#2c281b", panel: "#1c1a12", border: "#46402a",
      text: "#efe9d6", muted: "#a89e7e", accent: "#f5c211", accent2: "#ff7a45",
      green: "#a7c454", red: "#ef6a4f", yellow: "#f5c211",
    },
    editor: { base: "vs-dark", bg: "#1c1a12", fg: "#efe9d6", keyword: "#f5c211", directive: "#ff7a45", type: "#ffcf5c", number: "#ffd98a", string: "#d4b15a", comment: "#847a5a" },
  },
  {
    id: "forest",
    label: "Forest (green)",
    dark: true,
    vars: {
      bg: "#131d17", bg2: "#18231c", bg3: "#1e2c24", panel: "#131d17", border: "#2c4a39",
      text: "#dcefe2", muted: "#7fa590", accent: "#3fd07f", accent2: "#aee05a",
      green: "#3fd07f", red: "#f0685a", yellow: "#d9cf5a",
    },
    editor: { base: "vs-dark", bg: "#131d17", fg: "#dcefe2", keyword: "#3fd07f", directive: "#aee05a", type: "#5fd9b0", number: "#a7e07a", string: "#cfe09a", comment: "#6d8a78" },
  },
];

export const DEFAULT_THEME = "dark-plus";

// "auto" follows the OS appearance, mapping to these concrete themes. Forest is
// SynthWave's signature dark look; Light+ is the clean light counterpart.
export const AUTO_DARK_THEME = "forest";
export const AUTO_LIGHT_THEME = "light-plus";

// Resolve a (possibly "auto") theme preference to a concrete theme id, given
// whether the system currently prefers a dark appearance.
export function resolveThemeId(pref: string, systemDark: boolean): string {
  if (pref === "auto") return systemDark ? AUTO_DARK_THEME : AUTO_LIGHT_THEME;
  return pref;
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
