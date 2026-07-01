import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CodeEditor from "./components/CodeEditor";
import WaveformViewer from "./components/WaveformViewer";
import Schematic from "./components/Schematic";
import SynthReports from "./components/SynthReports";
import { parseVcd, type VcdData } from "./lib/vcd";
import {
  getHealth,
  simulate,
  synthesize,
  verify,
  extractFsm,
  type HealthResponse,
  type SourceFile,
  type SynthStats,
  type LintLevel,
  type SynthMode,
  type CellSrc,
} from "./lib/api";
import { SAMPLES, CATEGORY_ORDER, type Sample } from "./lib/samples";
import { downloadText, downloadBlob } from "./lib/download";
import { createZip } from "./lib/zip";
import { parseDiagnostics, type Diagnostic } from "./lib/diagnostics";
import { encodeProject, decodeProject } from "./lib/share";
import { svgToPngBlob } from "./lib/png";
import { evaluateTestResult, type TestResult } from "./lib/testresult";
import {
  loadWorkspace,
  saveWorkspace,
  defaultSettings,
  type Workspace,
  type WsProject,
  type WsFile,
  type FileKind,
  type SynthEngine,
} from "./lib/workspace";
import { stateLabelMap, type FsmData } from "./lib/fsm";
import { extractFsmFromSource } from "./lib/fsmSource";
import { isTauri, setNativeAppearance } from "./lib/native";
import { GENERIC_STDLIB, SKY130_STDLIB } from "./lib/liberty";
import { synthesizeWasm, extractFsmWasm, warmupWasm } from "./lib/clientSynth";
import { simulateWasm, lintWasm, strictLintWasm, warmupSim, warmupStrictLint } from "./lib/clientSim";
import { buildIndex } from "./lib/verilogIndex";
import { parseModules } from "./lib/ports";
import { buildHierarchy, type HierNode } from "./lib/hierarchy";
import { formatVerilog } from "./lib/format";
import TestbenchDialog from "./components/TestbenchDialog";
import { isHdl, monacoLanguage, sanitizeName, splitExt } from "./lib/filetypes";
import { onToolchainProgress, type ToolProgress } from "./lib/toolchain";
import { THEMES, getTheme, applyThemeVars, resolveThemeId } from "./lib/themes";
import {
  Logo,
  IconActivity,
  IconMenu,
  IconPanelLeft,
  IconMaximize,
  IconMinimize,
  IconDownload,
  IconUpload,
  IconShare,
  IconPlus,
  IconClose,
  IconChevron,
  IconFolder,
  IconHierarchy,
  IconPlay,
  IconCheck,
  IconCpu,
  IconSearch,
} from "./components/Icons";
import FSMDiagram from "./components/FSMDiagram";

export interface WaveRun {
  id: string;
  label: string;
  vcd: string;
  at: number;
}

type OutputTab = "waveform" | "schematic" | "reports" | "fsm" | "log";
type VFile = WsFile;

interface SharedProject {
  files: Array<{ name: string; content: string; kind: FileKind }>;
  top?: string;
  flatten?: boolean;
}

const makeId = () => Math.random().toString(36).slice(2, 9);

function filesFromSample(s: Sample): VFile[] {
  if (s.files && s.files.length) {
    return s.files.map((f) => ({ id: makeId(), name: f.name, content: f.content, kind: f.kind }));
  }
  return [
    { id: makeId(), name: "design.v", content: s.design, kind: "design" },
    { id: makeId(), name: "testbench.v", content: s.testbench, kind: "testbench" },
  ];
}


// Restore the workspace from localStorage (migrating the old single-project
// format), or seed a fresh one-project workspace from the first sample.
function bootWorkspace(): Workspace {
  const ws = loadWorkspace();
  if (ws) return ws;
  // First-time visitors get a blank project (empty design + testbench) rather
  // than a preloaded example — examples are one click away in the sidebar.
  const files: WsFile[] = [
    { id: makeId(), name: "design.v", content: "", kind: "design" },
    { id: makeId(), name: "testbench.v", content: "", kind: "testbench" },
  ];
  const id = makeId();
  return {
    version: 2,
    activeId: id,
    projects: [
      { id, name: "My Project", files, activeId: files[0].id, top: "", flatten: false, sampleName: "" },
    ],
    settings: defaultSettings(),
  };
}

function HierTree({ nodes, depth, onPick }: { nodes: HierNode[]; depth: number; onPick: (m: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => (
        <div key={`${n.module}-${n.instance || "root"}-${i}`} className="hier-node">
          <button
            className="hier-row"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onPick(n.module)}
            title={n.external ? `${n.module} (not defined in open files)` : `Go to module ${n.module}`}
          >
            {n.instance && <span className="hier-inst">{n.instance}</span>}
            <span className={n.external ? "hier-mod ext" : "hier-mod"}>{n.module}</span>
          </button>
          {n.children.length > 0 && <HierTree nodes={n.children} depth={depth + 1} onPick={onPick} />}
        </div>
      ))}
    </>
  );
}

export default function App() {
  const bootWs = useMemo(bootWorkspace, []);
  const initialProject = bootWs.projects.find((p) => p.id === bootWs.activeId) ?? bootWs.projects[0];

  // Workspace (multi-project) state.
  const [projects, setProjects] = useState<WsProject[]>(bootWs.projects);
  const [activeProjectId, setActiveProjectId] = useState<string>(initialProject.id);
  const [renamingProject, setRenamingProject] = useState<{ id: string; value: string } | null>(null);

  // Live working state = the active project's files/settings.
  const [files, setFiles] = useState<VFile[]>(initialProject.files);
  const [activeId, setActiveId] = useState<string>(initialProject.activeId);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [top, setTop] = useState(initialProject.top);
  const [flatten, setFlatten] = useState(initialProject.flatten);
  const [sampleName, setSampleName] = useState(initialProject.sampleName);

  // Global settings.
  const [liveLint, setLiveLint] = useState(bootWs.settings.liveLint);
  const [lintLevel, setLintLevel] = useState<LintLevel>(bootWs.settings.lintLevel);
  const [synthMode, setSynthMode] = useState<SynthMode>(bootWs.settings.synthMode);
  // In the desktop (Tauri) build, default to the native CLI toolchain; in the
  // browser, honor the saved engine (wasm for static deploys, server locally).
  const [engine, setEngine] = useState<SynthEngine>(isTauri() ? "server" : bootWs.settings.engine);
  const [theme, setTheme] = useState<string>(bootWs.settings.theme ?? "dark-plus");
  const [smartSuggestions, setSmartSuggestions] = useState(bootWs.settings.smartSuggestions ?? true);
  // On phones the sidebar is a slide-over drawer; start it closed so it doesn't
  // cover the editor on first load.
  const [sidebarOpen, setSidebarOpen] = useState(
    bootWs.settings.sidebarOpen && (typeof window === "undefined" || window.innerWidth > 820)
  );
  const [sidebarWidth, setSidebarWidth] = useState(bootWs.settings.sidebarWidth);
  const sidebarDragRef = useRef(false);
  const [hierOpen, setHierOpen] = useState(true);
  const [tbOpen, setTbOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"projects" | "examples">("projects");
  const [exampleQuery, setExampleQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [outputTab, setOutputTab] = useState<OutputTab>("waveform");

  // Waveform run history (for save/compare).
  const [waveRuns, setWaveRuns] = useState<WaveRun[]>([]);
  const [seek, setSeek] = useState<{ t: number; n: number } | null>(null);

  const [vcdText, setVcdText] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [netlistJson, setNetlistJson] = useState<string | null>(null);
  const [srcMap, setSrcMap] = useState<Record<string, CellSrc> | null>(null);
  const [stats, setStats] = useState<SynthStats | null>(null);
  const [resultEngine, setResultEngine] = useState<SynthEngine | null>(null);
  const [fsm, setFsm] = useState<FsmData | null>(null);
  const [fsmLog, setFsmLog] = useState<string>("");
  const [testResult, setTestResult] = useState<TestResult>({ status: "none", passes: 0, fails: 0 });
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [log, setLog] = useState<string>("Ready. Lint, simulate, or synthesize your design.");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [busy, setBusy] = useState<"verify" | "sim" | "synth" | "fsm" | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [openMenu, setOpenMenu] = useState<"settings" | "export" | null>(null);
  // In-app confirm dialog. window.confirm() is a no-op in Tauri's WKWebView, so
  // we use our own promise-based modal that works in both the web and desktop apps.
  const [confirmState, setConfirmState] = useState<{
    message: string;
    confirmLabel: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const askConfirm = (message: string, confirmLabel = "OK") =>
    new Promise<boolean>((resolve) => setConfirmState({ message, confirmLabel, resolve }));
  const [toolProgress, setToolProgress] = useState<ToolProgress | null>(null);
  useEffect(() => onToolchainProgress(setToolProgress), []);
  const [simOutputs, setSimOutputs] = useState<{ name: string; content: string }[]>([]);

  // Split / maximize layout state.
  const [splitPct, setSplitPct] = useState(bootWs.settings.splitPct);
  const [maximized, setMaximized] = useState<"editor" | "output" | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const editorApiRef = useRef<{ editor: any; monaco: any } | null>(null);
  const liveReqRef = useRef(0);
  const uploadRef = useRef<HTMLInputElement>(null);
  const libUploadRef = useRef<HTMLInputElement>(null);
  const [customLib, setCustomLib] = useState<{ name: string; content: string } | null>(null);
  // Active standard-cell library for gate-level synthesis + reports.
  const [libId, setLibId] = useState<"generic" | "sky130" | "custom">("generic");
  const activeLib = useMemo(() => {
    if (libId === "custom" && customLib)
      return { id: "custom" as const, name: customLib.name, content: customLib.content };
    if (libId === "sky130")
      return { id: "sky130" as const, name: SKY130_STDLIB.label, content: SKY130_STDLIB.synthLib };
    return { id: "generic" as const, name: GENERIC_STDLIB.label, content: GENERIC_STDLIB.synthLib };
  }, [libId, customLib]);

  const activeFile = files.find((f) => f.id === activeId) ?? files[0];
  const designFiles = files.filter((f) => f.kind === "design");
  // The /api backend is reachable only when getHealth() succeeded. On a static
  // deploy it never will, so the Server engine is hidden and we stay in-browser.
  const serverAvailable = health != null;

  // Tag the document so CSS can opt into native-desktop chrome (overlay
  // titlebar inset, vibrancy) only inside the Tauri app, never on the web.
  useEffect(() => {
    const root = document.documentElement;
    if (isTauri()) root.classList.add("is-tauri");
    if (/Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)) {
      root.classList.add("is-mac");
    } else if (/Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent)) {
      root.classList.add("is-windows");
    } else if (/Linux/i.test(navigator.platform) || /Linux/i.test(navigator.userAgent)) {
      root.classList.add("is-linux");
    }
  }, []);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => {
        setHealth(null);
        // No backend reachable (e.g. a static deploy) — fall back to the
        // fully in-browser engine so everything keeps working.
        if (bootWs.settings.engine === "server") {
          setEngine("wasm");
          warmupWasm();
          warmupSim();
        }
      });
    // Prefetch the in-browser toolchains if the workspace booted on the wasm
    // engine — but never in the desktop build, where native tools are used.
    if (!isTauri() && bootWs.settings.engine === "wasm") {
      warmupWasm();
      warmupSim();
      if (bootWs.settings.lintLevel === "strict") warmupStrictLint();
    }
    // Runs once on mount; bootWs is the immutable boot snapshot, so reading its
    // settings here does not need to re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a shared project from the URL hash (#p=...), once on mount.
  useEffect(() => {
    const m = window.location.hash.match(/[#&]p=([^&]+)/);
    if (!m) return;
    decodeProject<SharedProject>(m[1])
      .then((proj) => {
        if (!proj?.files?.length) return;
        const vf: VFile[] = proj.files.map((f) => ({
          id: makeId(),
          name: f.name,
          content: f.content,
          kind: f.kind === "testbench" ? "testbench" : "design",
        }));
        setFiles(vf);
        setActiveId(vf[0].id);
        setTop(proj.top ?? "");
        setFlatten(!!proj.flatten);
        setSampleName("(shared link)");
        setLog("Opened a shared project from the URL.");
      })
      .catch(() => setLog("Could not decode the shared link — it may be corrupted."))
      .finally(() => {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      });
  }, []);

  // Persist the whole workspace (debounced). The active project's snapshot is
  // synced from the live working state on every save.
  useEffect(() => {
    const t = setTimeout(() => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === activeProjectId ? { ...p, files, activeId, top, flatten, sampleName } : p
        );
        saveWorkspace({
          version: 2,
          activeId: activeProjectId,
          projects: next,
          settings: { liveLint, lintLevel, synthMode, engine, theme, splitPct, sidebarOpen, sidebarWidth, smartSuggestions },
        });
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [files, activeId, top, flatten, sampleName, activeProjectId, liveLint, lintLevel, synthMode, engine, theme, splitPct, sidebarOpen, sidebarWidth, smartSuggestions]);

  // Track the OS light/dark preference so the "Auto" theme can follow it live.
  const [systemDark, setSystemDark] = useState<boolean>(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // The concrete theme to render: "auto" resolves to a light/dark theme based on
  // the OS appearance; any explicit choice is used as-is.
  const resolvedTheme = resolveThemeId(theme, systemDark);

  // Apply the resolved theme's CSS variables to the whole UI, and match the
  // native window chrome/vibrancy to it (so light themes get a light material).
  useEffect(() => {
    const t = getTheme(resolvedTheme);
    applyThemeVars(t);
    setNativeAppearance(t.dark ? "dark" : "light");
  }, [resolvedTheme]);

  // Keyboard support for the in-app confirm dialog: Enter confirms, Esc cancels.
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        confirmState.resolve(false);
        setConfirmState(null);
      } else if (e.key === "Enter") {
        confirmState.resolve(true);
        setConfirmState(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState]);

  // Build the symbol index across all files (powers completion / hover / go-to-def).
  const vindex = useMemo(
    () =>
      buildIndex(
        files.filter((f) => isHdl(f.name)).map((f) => ({ name: f.name, content: f.content }))
      ),
    [files]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (sidebarDragRef.current) {
        // Sidebar is the first child of .body; measure from the viewport left.
        setSidebarWidth(Math.max(170, Math.min(440, e.clientX)));
        return;
      }
      if (!draggingRef.current || !mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(18, Math.min(82, pct)));
    };
    const onUp = () => {
      if (draggingRef.current || sidebarDragRef.current) {
        draggingRef.current = false;
        sidebarDragRef.current = false;
        document.body.classList.remove("dragging-col");
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = () => {
    if (maximized) return;
    draggingRef.current = true;
    document.body.classList.add("dragging-col");
  };

  const startSidebarDrag = () => {
    sidebarDragRef.current = true;
    document.body.classList.add("dragging-col");
  };

  const toggleMax = (which: "editor" | "output") =>
    setMaximized((m) => (m === which ? null : which));

  const editorStyle =
    maximized === "editor"
      ? { flex: "1 1 100%" }
      : maximized === "output"
      ? { display: "none" }
      : { flex: `0 0 ${splitPct}%` };

  const outputStyle =
    maximized === "output"
      ? { flex: "1 1 100%" }
      : maximized === "editor"
      ? { display: "none" }
      : { flex: "1 1 0%" };

  const vcd: VcdData | null = useMemo(() => {
    if (!vcdText) return null;
    try {
      return parseVcd(vcdText);
    } catch {
      return null;
    }
  }, [vcdText]);

  const loadRun = (id: string) => {
    const run = waveRuns.find((r) => r.id === id);
    if (run) {
      setVcdText(run.vcd);
      setOutputTab("waveform");
    }
  };

  // Click a $display/log line that carries a simulation time → move the cursor there.
  const seekToTime = (t: number) => {
    setSeek({ t, n: Date.now() });
    setOutputTab("waveform");
  };

  // Modules declared across all DESIGN files (populates the top-module picker).
  const modules = useMemo(() => {
    const found: string[] = [];
    const re = /\bmodule\s+([A-Za-z_]\w*)/g;
    const src = designFiles.filter((f) => isHdl(f.name)).map((f) => f.content).join("\n");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (!found.includes(m[1])) found.push(m[1]);
    }
    return found;
  }, [designFiles]);

  useEffect(() => {
    if (top && !modules.includes(top)) setTop("");
  }, [modules, top]);

  // Full port parse (directions + widths) for the testbench/stimulus dialog.
  const designHdl = useMemo(
    () => designFiles.filter((f) => isHdl(f.name)).map((f) => ({ name: f.name, content: f.content })),
    [designFiles]
  );
  const parsedModules = useMemo(() => parseModules(designHdl), [designHdl]);
  // Show the design's natural roots (modules nothing instantiates), independent
  // of the synthesis `top` setting — so a stale/leaf top can't hide the tree.
  const hierarchy = useMemo<HierNode[]>(() => buildHierarchy(designHdl), [designHdl]);

  // Group examples by category, following the preferred category order.
  const sampleGroups = useMemo(() => {
    const byCat = new Map<string, Sample[]>();
    for (const s of SAMPLES) {
      const cat = s.category || "Misc";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(s);
    }
    const ordered: { category: string; items: Sample[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = byCat.get(cat);
      if (items) {
        ordered.push({ category: cat, items });
        byCat.delete(cat);
      }
    }
    for (const [category, items] of byCat) ordered.push({ category, items });
    return ordered;
  }, []);

  // Examples filtered by the sidebar search box.
  const exampleQ = exampleQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!exampleQ) return sampleGroups;
    return sampleGroups
      .map((g) => ({
        category: g.category,
        items: g.items.filter(
          (s) => s.name.toLowerCase().includes(exampleQ) || g.category.toLowerCase().includes(exampleQ)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [sampleGroups, exampleQ]);

  const toggleCat = (cat: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  // Live linting: re-check shortly after the user stops typing.
  const filesKey = useMemo(
    () => files.map((f) => `${f.kind}:${f.name}:${f.content}`).join("\u0000"),
    [files]
  );
  useEffect(() => {
    if (!liveLint) return;
    if (!files.some((f) => f.content.trim())) {
      setDiagnostics([]);
      return;
    }
    const id = ++liveReqRef.current;
    const timer = setTimeout(async () => {
      try {
        // Strict (Verilator) lints design files only; testbench timing constructs would add noise.
        const src =
          lintLevel === "strict"
            ? files
                .filter((f) => f.kind === "design" && isHdl(f.name))
                .map((f) => ({ name: f.name, content: f.content }))
            : files.filter((f) => isHdl(f.name)).map((f) => ({ name: f.name, content: f.content }));
        let res;
        if (engine === "wasm")
          res = lintLevel === "strict" ? await strictLintWasm(src, top) : await lintWasm(src);
        else res = await verify(src, lintLevel, top);
        if (id === liveReqRef.current) setDiagnostics(parseDiagnostics(res.log || ""));
      } catch {
        /* ignore transient live-lint errors */
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, liveLint, lintLevel, top, engine]);

  // ---------- File management ----------
  const updateActiveContent = (content: string) => {
    setFiles((fs) => fs.map((f) => (f.id === activeId ? { ...f, content } : f)));
  };

  // Make a filename unique among the given taken set, preserving its extension
  // (or defaulting to .v when none was given, e.g. the "new file" flow).
  const dedupeName = (base: string, taken: Set<string>): string => {
    let name = sanitizeName(base);
    if (!name.includes(".")) name += ".v";
    if (!taken.has(name.toLowerCase())) return name;
    const { stem, ext } = splitExt(name);
    let i = 2;
    while (taken.has(`${stem}${i}${ext}`.toLowerCase())) i++;
    return `${stem}${i}${ext}`;
  };

  const uniqueName = (base: string, ignoreId?: string): string => {
    const taken = new Set(files.filter((f) => f.id !== ignoreId).map((f) => f.name.toLowerCase()));
    return dedupeName(base, taken);
  };

  const addFile = () => {
    const name = uniqueName("module.v");
    const nf: VFile = { id: makeId(), name, content: "", kind: "design" };
    setFiles((fs) => [...fs, nf]);
    setActiveId(nf.id);
    // Drop straight into renaming so you can name the file yourself.
    setRenaming({ id: nf.id, value: name });
  };

  // Reorder tabs by drag-and-drop: drop `sourceId` at `targetId`'s position.
  const moveFile = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setFiles((fs) => {
      const from = fs.findIndex((f) => f.id === sourceId);
      const to = fs.findIndex((f) => f.id === targetId);
      if (from < 0 || to < 0) return fs;
      const next = [...fs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const formatActiveFile = () => {
    if (!activeFile || !isHdl(activeFile.name)) return;
    const formatted = formatVerilog(activeFile.content);
    if (formatted !== activeFile.content) {
      setFiles((fs) => fs.map((f) => (f.id === activeFile.id ? { ...f, content: formatted } : f)));
      setLog(`Formatted ${activeFile.name}.`);
    } else {
      setLog(`${activeFile.name} already formatted.`);
    }
  };

  // Insert a generated testbench as a new file; optionally simulate it right
  // away against the design (without other testbenches, to avoid top clashes).
  const applyTestbench = (fileName: string, content: string, run: boolean) => {
    const name = uniqueName(fileName);
    const nf: VFile = { id: makeId(), name, content, kind: "testbench" };
    setFiles((fs) => [...fs, nf]);
    setActiveId(nf.id);
    setTbOpen(false);
    if (run) {
      const sources: SourceFile[] = [...designSources(), { name, content }];
      runSimulation(sources);
    }
  };

  const onUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || !list.length) return;
    const taken = new Set(files.map((f) => f.name.toLowerCase()));
    const added: VFile[] = [];
    for (const file of Array.from(list)) {
      let content = "";
      try {
        content = await file.text();
      } catch {
        continue;
      }
      // Preserve the uploaded file's own extension (.txt, .md, .mem, …); only
      // append a default when it truly has none.
      const name = dedupeName(file.name, taken);
      taken.add(name.toLowerCase());
      const kind: FileKind = /(_tb|tb_|^tb|testbench|_test)/i.test(file.name) ? "testbench" : "design";
      added.push({ id: makeId(), name, content, kind });
    }
    if (added.length) {
      setFiles((fs) => [...fs, ...added]);
      setActiveId(added[0].id);
      setLog(`Uploaded ${added.length} file${added.length > 1 ? "s" : ""}.`);
    }
    e.target.value = "";
  };

  const onUploadLib = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const content = await file.text();
      setCustomLib({ name: file.name, content });
      setLibId("custom");
      setLog(`Loaded standard-cell library "${file.name}". Run gate-level synthesis to use it.`);
    } catch {
      setLog("Could not read the .lib file.");
    }
  };

  const deleteFile = async (id: string) => {
    if (files.length <= 1) return;
    const f = files.find((x) => x.id === id);
    if (f && f.content.trim() && !(await askConfirm(`Delete "${f.name}"? Its contents will be lost.`, "Delete"))) {
      return;
    }
    setFiles((fs) => {
      const next = fs.filter((x) => x.id !== id);
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const closeAllFiles = async () => {
    setOpenMenu(null);
    if (
      (files.length || projects.length > 1) &&
      !(await askConfirm(
        "Close all files and reset the workspace? Every project and its files will be cleared and cannot be recovered.",
        "Reset workspace"
      ))
    )
      return;
    // Wipe the whole workspace back to a single, empty project so both the editor
    // and the project pane are cleared.
    const fresh: WsProject = {
      id: makeId(),
      name: "My Project",
      files: [],
      activeId: "",
      top: "",
      flatten: false,
      sampleName: "",
    };
    setProjects([fresh]);
    setActiveProjectId(fresh.id);
    setFiles([]);
    setActiveId("");
    setTop("");
    setFlatten(false);
    setSampleName("");
    clearOutputs();
  };

  const jumpTo = (file: string, line: number) => {
    const f = files.find((x) => x.name === file);
    if (f) setActiveId(f.id);
    setMaximized((m) => (m === "output" ? null : m));
    setTimeout(() => {
      const ed = editorApiRef.current?.editor;
      if (ed) {
        ed.revealLineInCenter(line);
        ed.setPosition({ lineNumber: line, column: 1 });
        ed.focus();
      }
    }, 80);
  };

  // Jump to a module's definition (used by the hierarchy panel).
  const jumpToModule = (name: string) => {
    const def = vindex.modules.find((m) => m.name === name);
    if (def) jumpTo(def.file, def.line);
  };

  const toggleKind = (id: string) => {
    // Design/testbench only applies to HDL sources; text files have no role.
    setFiles((fs) =>
      fs.map((f) =>
        f.id === id && isHdl(f.name) ? { ...f, kind: f.kind === "design" ? "testbench" : "design" } : f
      )
    );
  };

  const commitRename = () => {
    if (!renaming) return;
    const finalName = uniqueName(renaming.value || "untitled.v", renaming.id);
    setFiles((fs) => fs.map((f) => (f.id === renaming.id ? { ...f, name: finalName } : f)));
    setRenaming(null);
  };

  // ---------- Run actions ----------
  // Only real HDL files are handed to the Verilog toolchain; plain text files
  // (notes, .mem, .json, …) stay editable but are never compiled.
  const allSources = (): SourceFile[] =>
    files.filter((f) => isHdl(f.name)).map((f) => ({ name: f.name, content: f.content }));
  const designSources = (): SourceFile[] =>
    designFiles.filter((f) => isHdl(f.name)).map((f) => ({ name: f.name, content: f.content }));
  // Non-HDL files are shipped to the simulator's filesystem (not compiled) so
  // testbenches can $readmemh/$readmemb (or $fopen) data files by name.
  const dataSources = (): SourceFile[] =>
    files.filter((f) => !isHdl(f.name)).map((f) => ({ name: f.name, content: f.content }));

  const showLog = (text: string) => {
    setLog(text);
    setDiagnostics(parseDiagnostics(text));
  };

  const runVerify = async () => {
    const wasm = engine === "wasm";
    setBusy("verify");
    setOutputTab("log");
    setLog(
      lintLevel === "strict"
        ? wasm
          ? "Linting in-browser with Verilator (WebAssembly)...\nFirst run downloads the ~7 MB toolchain; it is cached afterward."
          : "Linting with Verilator..."
        : wasm
        ? "Linting in-browser (Icarus · WebAssembly)..."
        : "Linting..."
    );
    setDiagnostics([]);
    try {
      const src = lintLevel === "strict" ? designSources() : allSources();
      if (src.length === 0) {
        showLog("No Verilog/SystemVerilog source files to lint.");
        return;
      }
      let res;
      if (wasm) res = lintLevel === "strict" ? await strictLintWasm(src, top) : await lintWasm(src);
      else res = await verify(src, lintLevel, top);
      showLog(res.log || (res.ok ? "OK" : "Verification failed."));
    } catch (e: any) {
      showLog("Request failed: " + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  const runSimulation = async (override?: SourceFile[]) => {
    const sources = override ?? allSources();
    if (sources.length === 0) {
      setOutputTab("log");
      showLog("No Verilog/SystemVerilog source files to simulate.");
      return;
    }
    const wasm = engine === "wasm";
    setBusy("sim");
    setLog(
      wasm
        ? "Compiling and simulating in-browser (Icarus Verilog · WebAssembly)...\nFirst run downloads the ~10 MB toolchain; it is cached afterward."
        : "Compiling and simulating..."
    );
    setDiagnostics([]);
    setTestResult({ status: "none", passes: 0, fails: 0 });
    setSimOutputs([]);
    try {
      const data = dataSources();
      const res = wasm ? await simulateWasm(sources, data) : await simulate(sources, data);
      setTestResult(evaluateTestResult(res.log || ""));
      const outs = res.outputs || [];
      setSimOutputs(outs);
      const note = outs.length
        ? `\n\nTestbench wrote ${outs.length} file${outs.length > 1 ? "s" : ""}: ${outs
            .map((o) => o.name)
            .join(", ")}\n(download from the Export panel).`
        : "";
      if (res.ok && res.vcd) {
        showLog((res.log || "") + note);
        setVcdText(res.vcd);
        const vcd = res.vcd;
        setWaveRuns((prev) => {
          const eng = wasm ? " · ⚡in-browser" : "";
          const label = new Date().toLocaleTimeString() + (sampleName ? ` · ${sampleName}` : "") + eng;
          const run: WaveRun = { id: makeId(), label, vcd, at: Date.now() };
          return [run, ...prev].slice(0, 8);
        });
        setOutputTab("waveform");
      } else if (res.ok && !res.vcd) {
        setOutputTab("log");
        showLog((res.log || "") + "\n\nNo VCD produced. Make sure a testbench calls $dumpfile and $dumpvars." + note);
      } else {
        setOutputTab("log");
        showLog((res.log || "") + note);
      }
    } catch (e: any) {
      showLog("Request failed: " + (e?.message || String(e)));
      setOutputTab("log");
    } finally {
      setBusy(null);
    }
  };

  const runSynthesis = async (modeOverride?: SynthMode, focusTab?: OutputTab) => {
    if (designSources().length === 0) {
      setOutputTab("log");
      showLog(
        "No Verilog/SystemVerilog design files. Mark a .v/.sv file as Design (its D/TB badge) first."
      );
      return;
    }
    const mode = modeOverride ?? synthMode;
    const wasm = engine === "wasm";
    setBusy("synth");
    setLog(
      (wasm ? "Synthesizing in-browser (YoWASP Yosys)" : "Synthesizing with Yosys") +
        (mode === "gate" ? " to gates..." : "...") +
        (wasm ? "\nFirst run downloads the ~50 MB WebAssembly toolchain; it is cached afterward." : "")
    );
    setDiagnostics([]);
    try {
      const lib = mode === "gate" ? activeLib.content : undefined;
      const res = wasm
        ? await synthesizeWasm(designSources(), top, flatten, mode, lib)
        : await synthesize(designSources(), top, flatten, mode, lib);
      setNetlistJson(res.netlist ?? null);
      setStats(res.stats ?? null);
      setSrcMap(res.srcMap ?? null);
      if (res.ok) {
        showLog(res.log || "");
        setSvg(res.svg ?? null);
        setResultEngine(engine);
        // Land on the tab the run was launched for (e.g. Reports when the user
        // clicked "Run gate-level synthesis" there); otherwise show the schematic
        // if we have one, falling back to the log.
        setOutputTab(focusTab ?? (res.svg ? "schematic" : "log"));
        if (res.renderError) showLog((res.log || "") + "\n\n[schematic render warning] " + res.renderError);
      } else {
        setSvg(null);
        setOutputTab("log");
        showLog(res.log || "Synthesis failed.");
      }
    } catch (e: any) {
      showLog("Request failed: " + (e?.message || String(e)));
      setOutputTab("log");
    } finally {
      setBusy(null);
    }
  };

  const runFsm = async () => {
    if (designSources().length === 0) {
      setOutputTab("fsm");
      setFsm(null);
      setFsmLog("No Verilog/SystemVerilog design files. Mark a .v/.sv file as Design first.");
      return;
    }
    const wasm = engine === "wasm";
    setBusy("fsm");
    setOutputTab("fsm");
    setFsmLog(
      wasm
        ? "Extracting FSM in-browser (YoWASP Yosys)...\nFirst run downloads the ~50 MB WebAssembly toolchain; it is cached afterward."
        : "Extracting FSM with Yosys..."
    );
    try {
      // Prefer source-level extraction: it preserves the textbook Moore/Mealy
      // distinction (output in state vs. on transition) that Yosys discards.
      const fromSrc = extractFsmFromSource(designSources(), top);
      if (fromSrc) {
        setFsm(fromSrc);
        setFsmLog("");
        return;
      }
      const res = wasm ? await extractFsmWasm(designSources(), top) : await extractFsm(designSources(), top);
      if (res.ok && res.fsm) {
        setFsm(res.fsm);
        setFsmLog("");
      } else {
        setFsm(null);
        setFsmLog(res.log || "No finite-state machine detected.");
      }
    } catch (e: any) {
      setFsm(null);
      setFsmLog("Request failed: " + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  const clearOutputs = () => {
    setVcdText(null);
    setSvg(null);
    setNetlistJson(null);
    setSrcMap(null);
    setStats(null);
    setResultEngine(null);
    setFsm(null);
    setFsmLog("");
    setTestResult({ status: "none", passes: 0, fails: 0 });
    setDiagnostics([]);
  };

  // Open an example in a brand-new project, preserving the current one.
  const loadSampleAsProject = (name: string) => {
    const s = SAMPLES.find((x) => x.name === name);
    if (!s) return;
    const snapped = snapshotInto(projects);
    const f = filesFromSample(s);
    const np: WsProject = {
      id: makeId(),
      name: uniqueProjectName(s.name),
      files: f,
      activeId: f[0].id,
      top: "",
      flatten: false,
      sampleName: s.name,
    };
    setProjects([...snapped, np]);
    setActiveProjectId(np.id);
    loadProjectState(np);
    setSidebarView("projects");
    setExampleQuery("");
    setLog(`Opened example "${s.name}" as a new project.`);
  };

  const changeSynthMode = (m: SynthMode) => {
    setSynthMode(m);
    if (svg || netlistJson) runSynthesis(m);
  };

  const changeEngine = (e: SynthEngine) => {
    if (e === "server" && !serverAvailable) {
      // No backend on this origin (static deploy) — the Server engine would fail
      // every action, so refuse the switch and explain why.
      setLog(
        "The Server engine needs a backend (Icarus/Yosys CLI), which isn't available on this hosted site. " +
          "Everything runs in-browser instead."
      );
      return;
    }
    setEngine(e);
    if (e === "wasm") {
      warmupWasm();
      warmupSim();
      if (lintLevel === "strict") warmupStrictLint();
    }
  };

  // ---------- Project (workspace) management ----------
  const snapshotInto = (list: WsProject[]): WsProject[] =>
    list.map((p) => (p.id === activeProjectId ? { ...p, files, activeId, top, flatten, sampleName } : p));

  const loadProjectState = (p: WsProject) => {
    setFiles(p.files);
    setActiveId(p.activeId);
    setTop(p.top);
    setFlatten(p.flatten);
    setSampleName(p.sampleName);
    clearOutputs();
  };

  const uniqueProjectName = (base: string): string => {
    const taken = new Set(projects.map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`.toLowerCase())) i++;
    return `${base} ${i}`;
  };

  const switchProject = (id: string) => {
    if (id === activeProjectId) return;
    const snapped = snapshotInto(projects);
    const target = snapped.find((p) => p.id === id);
    setProjects(snapped);
    setActiveProjectId(id);
    if (target) loadProjectState(target);
    setLog(`Switched to project "${target?.name ?? ""}".`);
  };

  const newProject = () => {
    const snapped = snapshotInto(projects);
    const f: VFile[] = [{ id: makeId(), name: "design.v", content: "", kind: "design" }];
    const np: WsProject = {
      id: makeId(),
      name: uniqueProjectName("New Project"),
      files: f,
      activeId: f[0].id,
      top: "",
      flatten: false,
      sampleName: "",
    };
    setProjects([...snapped, np]);
    setActiveProjectId(np.id);
    loadProjectState(np);
    setRenamingProject({ id: np.id, value: np.name });
    setLog("Created a new project.");
  };

  const deleteProject = async (id: string) => {
    if (projects.length <= 1) return;
    const p = projects.find((x) => x.id === id);
    if (p && !(await askConfirm(`Delete project "${p.name}"? Its files will be lost.`, "Delete"))) return;
    const remaining = projects.filter((x) => x.id !== id);
    setProjects(remaining);
    if (id === activeProjectId) {
      const t = remaining[0];
      setActiveProjectId(t.id);
      loadProjectState(t);
    }
  };

  const commitProjectRename = () => {
    if (!renamingProject) return;
    const name = renamingProject.value.trim() || "Untitled";
    setProjects((prev) => prev.map((p) => (p.id === renamingProject.id ? { ...p, name } : p)));
    setRenamingProject(null);
  };

  const fsmLabels = useMemo(
    () => stateLabelMap(designFiles.map((f) => f.content).join("\n")),
    [designFiles]
  );

  const shareLink = async () => {
    try {
      const proj: SharedProject = {
        files: files.map((f) => ({ name: f.name, content: f.content, kind: f.kind })),
        top,
        flatten,
      };
      const code = await encodeProject(proj);
      const url = `${window.location.origin}${window.location.pathname}#p=${code}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied to clipboard");
      } catch {
        setShareMsg(url);
      }
      setTimeout(() => setShareMsg(null), 4000);
    } catch {
      setShareMsg("Could not create share link");
      setTimeout(() => setShareMsg(null), 4000);
    }
    setOpenMenu(null);
  };

  const exportSchematicPng = async () => {
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob("schematic.png", blob);
    } catch (e: any) {
      setLog("PNG export failed: " + (e?.message || String(e)));
    }
    setOpenMenu(null);
  };

  const activeDiagnostics = activeFile
    ? diagnostics
        .filter((d) => d.file === activeFile.name)
        .map((d) => ({ line: d.line, message: d.message, severity: d.severity }))
    : [];

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;

  const missingTools =
    health && (!health.tools.iverilog || !health.tools.vvp || !health.tools.yosys);

  const artifacts = [
    ...files.map((f) => ({ name: f.name, content: f.content, mime: "text/plain", available: !!f.content.trim() })),
    { name: "dump.vcd", content: vcdText ?? "", mime: "text/plain", available: !!vcdText },
    // Files the testbench wrote at runtime ($fopen/$fwrite/$writememh, …).
    ...simOutputs.map((o) => ({ name: o.name, content: o.content, mime: "text/plain", available: true })),
    { name: "netlist.json", content: netlistJson ?? "", mime: "application/json", available: !!netlistJson },
    { name: "schematic.svg", content: svg ?? "", mime: "image/svg+xml", available: !!svg },
    { name: "console.log", content: log ?? "", mime: "text/plain", available: !!log.trim() },
  ];
  const hasAnyArtifact = artifacts.some((a) => a.available);

  const exportAllZip = () => {
    const out = artifacts.filter((a) => a.available).map((a) => ({ name: a.name, content: a.content }));
    if (out.length === 0) return;
    downloadBlob("synthwave-export.zip", createZip(out));
    setOpenMenu(null);
  };

  return (
    <div className="app">
      <header className="topbar" data-tauri-drag-region>
        <div className="brand">
          <span className="logo"><Logo size={26} /></span>
          <span className="brand-text">Synth<span className="brand-acc">Wave</span></span>
        </div>
        <div className="toolset">
          <button
            className={sidebarOpen ? "icon-btn active" : "icon-btn"}
            title={sidebarOpen ? "Hide projects" : "Show projects"}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <IconPanelLeft />
          </button>
          <div className="menu-wrap">
            <button
              className={openMenu === "settings" ? "icon-btn active" : "icon-btn"}
              title="Options"
              onClick={() => setOpenMenu((m) => (m === "settings" ? null : "settings"))}
            >
              <IconMenu />
            </button>
            {openMenu === "settings" && (
              <div className="menu">
                <div className="menu-section">
                  <span className="menu-label">Top module (synthesis)</span>
                  <select value={top} onChange={(e) => setTop(e.target.value)}>
                    <option value="">Auto-detect</option>
                    {modules.map((mod) => (
                      <option key={mod} value={mod}>
                        {mod}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="menu-section">
                  <span className="menu-label">Lint level</span>
                  <select
                    value={lintLevel}
                    onChange={(e) => {
                      const lvl = e.target.value as LintLevel;
                      setLintLevel(lvl);
                      if (lvl === "strict" && engine === "wasm") warmupStrictLint();
                    }}
                  >
                    <option value="basic">Basic (Icarus -Wall)</option>
                    <option value="strict">Strict (Verilator)</option>
                  </select>
                </div>
                <div className="menu-section">
                  <span className="menu-label">Synthesis view</span>
                  <select value={synthMode} onChange={(e) => changeSynthMode(e.target.value as SynthMode)}>
                    <option value="rtl">RTL (blocks)</option>
                    <option value="gate">Gate-level (AND/OR/FF)</option>
                  </select>
                </div>
                <div className="menu-section">
                  <span className="menu-label">Standard-cell library (gate-level)</span>
                  <select
                    value={libId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "upload") libUploadRef.current?.click();
                      else setLibId(v as "generic" | "sky130" | "custom");
                    }}
                  >
                    <option value="generic">{GENERIC_STDLIB.label}</option>
                    <option value="sky130">{SKY130_STDLIB.label}</option>
                    {customLib && <option value="custom">{customLib.name}</option>}
                    <option value="upload">Upload .lib…</option>
                  </select>
                  <input
                    ref={libUploadRef}
                    type="file"
                    accept=".lib,.txt"
                    style={{ display: "none" }}
                    onChange={onUploadLib}
                  />
                  {customLib && (
                    <button
                      className="menu-mini"
                      onClick={() => {
                        setCustomLib(null);
                        if (libId === "custom") setLibId("generic");
                      }}
                      title="Discard the uploaded library"
                    >
                      Remove “{customLib.name}”
                    </button>
                  )}
                </div>
                {!isTauri() && (
                  <div className="menu-section">
                    <span className="menu-label">Compute engine (simulate + synthesize)</span>
                    <select value={engine} onChange={(e) => changeEngine(e.target.value as SynthEngine)}>
                      <option value="wasm">In-browser (WebAssembly)</option>
                      {serverAvailable && <option value="server">Server (Icarus + Yosys CLI)</option>}
                    </select>
                    {!serverAvailable && (
                      <span className="menu-hint">In-browser only — no backend on this host.</span>
                    )}
                  </div>
                )}
                <div className="menu-section">
                  <span className="menu-label">Theme</span>
                  <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                    <option value="auto">Auto (match system)</option>
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <label className="menu-check">
                  <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
                  Flatten hierarchy (synthesis)
                </label>
                <label className="menu-check">
                  <input type="checkbox" checked={liveLint} onChange={(e) => setLiveLint(e.target.checked)} />
                  Live lint as you type
                </label>
                <label className="menu-check" title="Autocomplete / IntelliSense popups in the editor (Ctrl+Space still works on demand)">
                  <input type="checkbox" checked={smartSuggestions} onChange={(e) => setSmartSuggestions(e.target.checked)} />
                  Smart suggestions (editor autocomplete)
                </label>
                <div className="menu-divider" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    setTbOpen(true);
                  }}
                  disabled={parsedModules.length === 0}
                  title="Generate a testbench and drive inputs (clock/reset/constant/sequence)"
                >
                  Generate testbench / stimulus…
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    formatActiveFile();
                  }}
                  disabled={!activeFile || !isHdl(activeFile.name)}
                  title="Reindent the active Verilog file"
                >
                  Format Verilog (reindent)
                </button>
                <div className="menu-divider" />
                <button className="menu-item" onClick={closeAllFiles}>
                  Close all files
                </button>
              </div>
            )}
          </div>

          <button className="btn" disabled={busy !== null} onClick={runVerify} title="Lint: syntax, elaboration & warnings (no testbench needed)">
            <IconCheck size={15} />
            {busy === "verify" ? "Linting…" : "Lint"}
            {(errorCount > 0 || warnCount > 0) && (
              <span className={errorCount > 0 ? "count-badge err" : "count-badge warn"}>
                {errorCount > 0 ? errorCount : warnCount}
              </span>
            )}
          </button>
          <button className="btn primary" disabled={busy !== null} onClick={() => runSimulation()} title="Compile & simulate the testbench">
            <IconPlay size={15} />
            {busy === "sim" ? "Running…" : "Simulate"}
            {testResult.status !== "none" && (
              <span className={testResult.status === "pass" ? "count-badge pass" : "count-badge err"}>
                {testResult.status === "pass" ? "PASS" : "FAIL"}
              </span>
            )}
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => runSynthesis()} title="Synthesize the design to a circuit">
            <IconCpu size={15} />
            {busy === "synth" ? "Synthesizing…" : "Synthesize"}
          </button>
        </div>
      </header>

      {openMenu && <div className="menu-backdrop" onClick={() => setOpenMenu(null)} />}

      {tbOpen && (
        <TestbenchDialog
          modules={parsedModules}
          defaultTop={top || undefined}
          onClose={() => setTbOpen(false)}
          onApply={applyTestbench}
        />
      )}

      {confirmState && (
        <div
          className="modal-backdrop"
          onClick={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        >
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Confirm</h2>
            </div>
            <div className="modal-body">{confirmState.message}</div>
            <div className="modal-foot">
              <button
                className="btn"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareMsg && <div className="toast">{shareMsg}</div>}

      {missingTools && (
        <div className="warn-banner">
          {isTauri() ? "These tools weren't found on your system:" : "Some tools were not found on the server:"}
          {!health?.tools.iverilog && " iverilog"}
          {!health?.tools.vvp && " vvp"}
          {!health?.tools.yosys && " yosys"}
          {isTauri()
            ? " — install them (e.g. `brew install icarus-verilog yosys`) and reopen the app."
            : " — install them and restart the server."}
        </div>
      )}

      <div className="body">
        {sidebarOpen && (
          <aside className="sidebar" style={{ flexBasis: sidebarWidth, width: sidebarWidth }}>
            <div className="sidebar-head">
              <div className="side-seg">
                <button
                  className={sidebarView === "projects" ? "seg active" : "seg"}
                  onClick={() => setSidebarView("projects")}
                >
                  Projects
                </button>
                <button
                  className={sidebarView === "examples" ? "seg active" : "seg"}
                  onClick={() => setSidebarView("examples")}
                >
                  Examples
                </button>
              </div>
              {sidebarView === "projects" && (
                <button className="ftab-add" title="New project" onClick={newProject}>
                  +
                </button>
              )}
            </div>

            {sidebarView === "projects" ? (
              <>
            <div className="proj-list">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={p.id === activeProjectId ? "proj active" : "proj"}
                  onClick={() => switchProject(p.id)}
                >
                  {renamingProject?.id === p.id ? (
                    <input
                      className="proj-rename"
                      autoFocus
                      value={renamingProject.value}
                      onChange={(e) => setRenamingProject({ id: p.id, value: e.target.value })}
                      onBlur={commitProjectRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitProjectRename();
                        if (e.key === "Escape") setRenamingProject(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="proj-name"
                      title="Double-click to rename"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenamingProject({ id: p.id, value: p.name });
                      }}
                    >
                      {p.name}
                    </span>
                  )}
                  <span className="proj-meta">{p.files.length}</span>
                  {projects.length > 1 && (
                    <button
                      className="ftab-close"
                      title="Delete project"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                    >
                      <IconClose />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="examples-section">
              <button
                className="side-folder"
                onClick={() => setHierOpen((o) => !o)}
                title="Module instantiation hierarchy of the design"
              >
                <span className={hierOpen ? "folder-chevron open" : "folder-chevron"}>
                  <IconChevron />
                </span>
                <IconHierarchy />
                <span className="folder-label">Hierarchy</span>
                <span className="proj-meta">{parsedModules.length}</span>
              </button>
              {hierOpen &&
                (hierarchy.length ? (
                  <div className="hier-tree">
                    <HierTree nodes={hierarchy} depth={0} onPick={jumpToModule} />
                  </div>
                ) : (
                  <div className="hier-empty muted">No modules found.</div>
                ))}
            </div>
              </>
            ) : (
              <div className="examples-pane">
                <div className="side-search-wrap">
                  <IconSearch />
                  <input
                    className="side-search"
                    placeholder="Search examples…"
                    value={exampleQuery}
                    onChange={(e) => setExampleQuery(e.target.value)}
                  />
                </div>
                <div className="example-list examples-pane-list">
                  {filteredGroups.map((group) => {
                    const open = !!exampleQ || openCats.has(group.category);
                    return (
                      <div key={group.category} className="example-cat">
                        <button
                          className="example-cat-head"
                          onClick={() => toggleCat(group.category)}
                          title={`${group.items.length} example${group.items.length === 1 ? "" : "s"}`}
                        >
                          <span className={open ? "folder-chevron open" : "folder-chevron"}>
                            <IconChevron size={12} />
                          </span>
                          <span className="example-cat-name">{group.category}</span>
                          <span className="proj-meta">{group.items.length}</span>
                        </button>
                        {open &&
                          group.items.map((s) => (
                            <button
                              key={s.name}
                              className={sampleName === s.name ? "example-item active" : "example-item"}
                              title={`Open "${s.name}" as a new project`}
                              onClick={() => loadSampleAsProject(s.name)}
                            >
                              {s.name}
                            </button>
                          ))}
                      </div>
                    );
                  })}
                  {filteredGroups.length === 0 && (
                    <div className="hier-empty muted">No examples match “{exampleQuery}”.</div>
                  )}
                </div>
              </div>
            )}

            <div className="sidebar-foot">
              {!isTauri() && (
                <button className="side-btn" onClick={shareLink} title="Copy a shareable link to this project">
                  <IconShare /> Share link
                </button>
              )}
              <div className="menu-wrap">
                <button
                  className="side-btn"
                  disabled={!hasAnyArtifact}
                  onClick={() => setOpenMenu((m) => (m === "export" ? null : "export"))}
                >
                  <IconDownload /> Export
                </button>
                {openMenu === "export" && (
                  <div className="menu menu-up">
                    <span className="menu-label">Download</span>
                    {artifacts.map((a) => (
                      <button
                        key={a.name}
                        className="menu-item"
                        disabled={!a.available}
                        onClick={() => {
                          downloadText(a.name, a.content, a.mime);
                          setOpenMenu(null);
                        }}
                      >
                        {a.name}
                      </button>
                    ))}
                    <button className="menu-item" disabled={!svg} onClick={exportSchematicPng}>
                      schematic.png
                    </button>
                    <div className="menu-divider" />
                    <button className="menu-item strong" disabled={!hasAnyArtifact} onClick={exportAllZip}>
                      All files (.zip)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
        {sidebarOpen && (
          <div
            className="sidebar-resizer"
            onMouseDown={startSidebarDrag}
            onDoubleClick={() => setSidebarWidth(224)}
            title="Drag to resize · double-click to reset"
          />
        )}
        {sidebarOpen && (
          <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="main" ref={mainRef}>
        <section className="pane editor-pane" style={editorStyle}>
          <div className="tabs file-tabs">
            {files.map((f) => (
              <div
                key={f.id}
                className={
                  "ftab" +
                  (f.id === activeId ? " active" : "") +
                  (f.id === dragId ? " dragging" : "") +
                  (f.id === dragOverId ? " drag-over" : "")
                }
                onClick={() => setActiveId(f.id)}
                draggable={renaming?.id !== f.id}
                onDragStart={(e) => {
                  setDragId(f.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", f.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === f.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== f.id) setDragOverId(f.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === f.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveFile(dragId, f.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
              >
                {isHdl(f.name) ? (
                  <span
                    className={f.kind === "design" ? "kind-dot kind-design" : "kind-dot kind-tb"}
                    title={f.kind === "design" ? "Design file — click to mark as Testbench" : "Testbench — click to mark as Design"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleKind(f.id);
                    }}
                  >
                    {f.kind === "design" ? "D" : "TB"}
                  </span>
                ) : (
                  <span className="kind-dot kind-text" title="Text file — not compiled">
                    TXT
                  </span>
                )}
                {renaming?.id === f.id ? (
                  <input
                    className="ftab-rename"
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ id: f.id, value: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="ftab-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenaming({ id: f.id, value: f.name });
                    }}
                    title="Double-click to rename"
                  >
                    {f.name}
                  </span>
                )}
                {files.length > 1 && (
                  <button
                    className="ftab-close"
                    title="Delete file"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFile(f.id);
                    }}
                  >
                    <IconClose />
                  </button>
                )}
              </div>
            ))}
            <button className="ftab-add" title="New file" onClick={addFile}>
              <IconPlus />
            </button>
            <button className="ftab-add" title="Upload files from your computer" onClick={() => uploadRef.current?.click()}>
              <IconUpload />
            </button>
            <input
              ref={uploadRef}
              type="file"
              accept=".v,.sv,.svh,.vh,.vhd,.txt,.md,.json,.csv,.log,.mem,.hex,.dat,.tcl,.do,.sdc,.xdc,.f,.yml,.yaml,text/*"
              multiple
              style={{ display: "none" }}
              onChange={onUploadFiles}
            />
            <div className="spacer" />
            <button
              className="max-btn"
              title={maximized === "editor" ? "Restore split view" : "Maximize editor"}
              onClick={() => toggleMax("editor")}
            >
              {maximized === "editor" ? <IconMinimize /> : <IconMaximize />}
            </button>
          </div>
          <div className="editor-host">
            {activeFile ? (
              <CodeEditor
                path={activeFile.name}
                language={monacoLanguage(activeFile.name)}
                value={activeFile.content}
                onChange={updateActiveContent}
                markers={activeDiagnostics}
                index={vindex}
                themeId={resolvedTheme}
                smartSuggestions={smartSuggestions}
                onJump={jumpTo}
                onReady={(editor, monaco) => (editorApiRef.current = { editor, monaco })}
              />
            ) : (
              <Empty
                icon={<IconFolder size={30} />}
                title="No files open"
                hint="Create a file to start writing Verilog, or open an example from the sidebar."
                action={
                  <button className="btn primary" onClick={addFile}>
                    <IconPlus size={15} /> New file
                  </button>
                }
              />
            )}
          </div>
        </section>

        {!maximized && (
          <div
            className="gutter"
            onMouseDown={startDrag}
            onDoubleClick={() => setSplitPct(50)}
            title="Drag to resize · double-click to reset"
          >
            <div className="gutter-grip" />
          </div>
        )}

        <section className="pane output-pane" style={outputStyle}>
          <div className="tabs">
            <button className={outputTab === "waveform" ? "tab active" : "tab"} onClick={() => setOutputTab("waveform")}>
              Waveform
            </button>
            <button className={outputTab === "schematic" ? "tab active" : "tab"} onClick={() => setOutputTab("schematic")}>
              Synthesis
            </button>
            <button className={outputTab === "reports" ? "tab active" : "tab"} onClick={() => setOutputTab("reports")}>
              Reports
            </button>
            <button className={outputTab === "fsm" ? "tab active" : "tab"} onClick={() => setOutputTab("fsm")}>
              FSM
            </button>
            <button className={outputTab === "log" ? "tab active" : "tab"} onClick={() => setOutputTab("log")}>
              Console
            </button>
            <div className="spacer" />
            <button
              className="max-btn"
              title={maximized === "output" ? "Restore split view" : "Maximize output"}
              onClick={() => toggleMax("output")}
            >
              {maximized === "output" ? <IconMinimize /> : <IconMaximize />}
            </button>
          </div>
          <div className="output-host">
            {outputTab === "waveform" &&
              (vcd ? (
                <WaveformViewer
                  data={vcd}
                  runs={waveRuns.map((r) => ({ id: r.id, label: r.label }))}
                  onLoadRun={loadRun}
                  seek={seek}
                />
              ) : (
                <Empty
                  icon={<IconActivity size={30} />}
                  title="No waveform yet"
                  hint="Run a simulation with a testbench to capture and view signal activity."
                  action={
                    <button className="btn primary" disabled={busy !== null} onClick={() => runSimulation()}>
                      <IconPlay size={15} /> Simulate
                    </button>
                  }
                />
              ))}
            {outputTab === "schematic" &&
              (svg ? (
                <div className="schem-host">
                  <div className="synth-bar">
                    <div className="seg">
                      <button className={synthMode === "rtl" ? "seg-btn active" : "seg-btn"} onClick={() => changeSynthMode("rtl")}>
                        RTL
                      </button>
                      <button
                        className={synthMode === "gate" ? "seg-btn active" : "seg-btn"}
                        title="Gate-level synthesis (techmap + abc)"
                        onClick={() => changeSynthMode("gate")}
                      >
                        Gate-level
                      </button>
                    </div>
                    {!isTauri() && resultEngine && (
                      <span
                        className={resultEngine === "wasm" ? "engine-badge wasm" : "engine-badge"}
                        title={
                          resultEngine === "wasm"
                            ? "Synthesized in-browser with YoWASP Yosys (WebAssembly)"
                            : "Synthesized on the server with the Yosys CLI"
                        }
                      >
                        {resultEngine === "wasm" ? "⚡ in-browser" : "server"}
                      </span>
                    )}
                    {stats && (
                      <div className="stats">
                        <span className="stat"><b>{stats.cells}</b> cells</span>
                        <span className="stat"><b>{stats.ffs}</b> FFs</span>
                        {stats.depth ? (
                          <span className="stat" title="Rough critical path: longest chain of combinational cells between flip-flops / I/O">
                            ⏱ ~<b>{stats.depth}</b> levels
                          </span>
                        ) : null}
                        {stats.area ? (
                          <span className="stat" title="Total standard-cell area (liberty area units)">
                            <b>{stats.area}</b> area
                          </span>
                        ) : null}
                        {stats.delay ? (
                          <span className="stat" title="abc arrival-time estimate along the critical path (liberty delay units)">
                            <b>{stats.delay}</b> delay
                          </span>
                        ) : null}
                        {Object.entries(stats.byType)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 6)
                          .map(([k, v]) => (
                            <span key={k} className="stat chip">{k.replace(/^\$_?|_$/g, "")} ×{v}</span>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="schem-body">
                    <Schematic svg={svg} srcMap={srcMap} onJump={jumpTo} />
                  </div>
                </div>
              ) : (
                <Empty
                  icon={<IconCpu size={30} />}
                  title="No circuit yet"
                  hint="Synthesize the design to view its gate/RTL schematic and resource stats."
                  action={
                    <button className="btn primary" disabled={busy !== null} onClick={() => runSynthesis()}>
                      <IconCpu size={15} /> Synthesize
                    </button>
                  }
                />
              ))}
            {outputTab === "reports" && (
              <SynthReports
                netlistJson={netlistJson}
                library={activeLib}
                onRunGate={() => {
                  setSynthMode("gate");
                  runSynthesis("gate", "reports");
                }}
              />
            )}
            {outputTab === "fsm" &&
              (fsm ? (
                <FSMDiagram fsm={fsm} labels={fsmLabels} />
              ) : (
                <div className="empty fsm-empty">
                  {fsmLog ? (
                    <pre className="console fsm-msg">{fsmLog}</pre>
                  ) : (
                    <span>Extract a finite-state machine from your design and view it as a bubble diagram.</span>
                  )}
                  <button className="btn" disabled={busy !== null} onClick={runFsm}>
                    {busy === "fsm" ? "Extracting..." : "Extract FSM"}
                  </button>
                </div>
              ))}
            {outputTab === "log" && (
              <div className="console-wrap">
                {diagnostics.length > 0 && (
                  <div className="diag-list">
                    {diagnostics.map((d, i) => (
                      <button key={i} className={`diag diag-${d.severity}`} onClick={() => jumpTo(d.file, d.line)}>
                        <span className="diag-badge">{d.severity === "error" ? "ERR" : "WARN"}</span>
                        <span className="diag-loc">{d.file}:{d.line}</span>
                        <span className="diag-msg">{d.message}</span>
                      </button>
                    ))}
                  </div>
                )}
                <LogView text={log} onSeek={vcd ? seekToTime : undefined} />
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
      <ToolchainBanner p={toolProgress} />
    </div>
  );
}

function ToolchainBanner({ p }: { p: ToolProgress | null }) {
  if (!p) return null;
  const pct = p.total > 0 ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : null;
  const mb = (n: number) => (n / 1048576).toFixed(1);
  const label = p.done
    ? `${p.label} ready`
    : pct !== null
    ? `Downloading ${p.label} — ${pct}% (${mb(p.loaded)} / ${mb(p.total)} MB)`
    : `Loading ${p.label}…`;
  return (
    <div className={"toolchain-banner" + (p.done ? " done" : "")} role="status" aria-live="polite">
      <span className="tb-label">{label}</span>
      <div className="tb-bar">
        <div
          className={"tb-fill" + (pct === null && !p.done ? " indeterminate" : "")}
          style={pct !== null ? { width: pct + "%" } : undefined}
        />
      </div>
    </div>
  );
}

function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {action}
    </div>
  );
}

function extractTime(line: string): number | null {
  let m = line.match(/^\s*#\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  m = line.match(/\b(?:time|@|t)\s*[:=]?\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = line.match(/(\d+)\s*(?:fs|ps|ns|us|ms)\b/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function LogView({ text, onSeek }: { text: string; onSeek?: (t: number) => void }) {
  const lines = text.split("\n");
  return (
    <pre className="console">
      {lines.map((line, i) => {
        const t = onSeek ? extractTime(line) : null;
        if (t == null) return <div key={i} className="log-line">{line || "\u00a0"}</div>;
        return (
          <div
            key={i}
            className="log-line seekable"
            title={`Jump waveform cursor to t = ${t}`}
            onClick={() => onSeek?.(t)}
          >
            <span className="seek-tick">⏱</span>
            {line || "\u00a0"}
          </div>
        );
      })}
    </pre>
  );
}
