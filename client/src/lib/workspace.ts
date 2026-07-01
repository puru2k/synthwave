import type { LintLevel, SynthMode } from "./api";

export type FileKind = "design" | "testbench";

export interface WsFile {
  id: string;
  name: string;
  content: string;
  kind: FileKind;
}

export interface WsProject {
  id: string;
  name: string;
  files: WsFile[];
  activeId: string;
  top: string;
  flatten: boolean;
  sampleName: string;
}

export type SynthEngine = "server" | "wasm";

export interface WsSettings {
  liveLint: boolean;
  lintLevel: LintLevel;
  synthMode: SynthMode;
  engine: SynthEngine;
  theme: string;
  splitPct: number;
  sidebarOpen: boolean;
  sidebarWidth: number;
  smartSuggestions: boolean;
}

export interface Workspace {
  version: 2;
  activeId: string;
  projects: WsProject[];
  settings: WsSettings;
}

const KEY = "synthwave.workspace.v2";
const LEGACY_KEY = "synthwave.project.v1";

export const defaultSettings = (): WsSettings => ({
  liveLint: true,
  lintLevel: "basic",
  synthMode: "rtl",
  // In-browser by default so the app works as a backend-free static site.
  engine: "wasm",
  // Follow the OS light/dark appearance out of the box.
  theme: "auto",
  splitPct: 50,
  sidebarOpen: true,
  sidebarWidth: 224,
  // Monaco autocomplete / IntelliSense popups as you type.
  smartSuggestions: true,
});

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw) as Workspace;
      if (ws && Array.isArray(ws.projects) && ws.projects.length) {
        ws.settings = { ...defaultSettings(), ...ws.settings };
        return ws;
      }
    }
    // One-time migration from the single-project (v1) format.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const p = JSON.parse(legacy);
      if (p && Array.isArray(p.files) && p.files.length) {
        const id = Math.random().toString(36).slice(2, 9);
        return {
          version: 2,
          activeId: id,
          projects: [
            {
              id,
              name: p.sampleName || "My Project",
              files: p.files,
              activeId: p.activeId,
              top: p.top ?? "",
              flatten: !!p.flatten,
              sampleName: p.sampleName ?? "",
            },
          ],
          settings: {
            ...defaultSettings(),
            liveLint: p.liveLint ?? true,
            lintLevel: p.lintLevel ?? "basic",
            synthMode: p.synthMode ?? "rtl",
            splitPct: p.splitPct ?? 50,
          },
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* quota / disabled storage — ignore */
  }
}
