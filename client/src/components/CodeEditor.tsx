import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { VIndex } from "../lib/verilogIndex";
import { moduleSignature, instantiationSnippet } from "../lib/verilogIndex";
import { THEMES, getTheme } from "../lib/themes";
import { formatVerilog } from "../lib/format";

const monacoName = (id: string) => "sw-" + id;

function defineThemes(monaco: any) {
  // Define (or redefine) every theme. defineTheme is idempotent, and avoiding a
  // one-time guard means newly added themes register correctly even when the
  // Monaco singleton persists across hot reloads / editor remounts.
  const hex = (c: string) => c.replace("#", "");
  for (const t of THEMES) {
    const e = t.editor;
    const isDark = t.dark;
    monaco.editor.defineTheme(monacoName(t.id), {
      base: e.base,
      inherit: true,
      rules: [
        { token: "keyword", foreground: hex(e.keyword), fontStyle: "bold" },
        { token: "keyword.directive", foreground: hex(e.directive) },
        { token: "type", foreground: hex(e.type) },
        { token: "type.identifier", foreground: hex(e.type) },
        { token: "identifier", foreground: hex(e.fg) },
        { token: "delimiter", foreground: hex(isDark ? "#8b949e" : "#334155") },
        { token: "operator", foreground: hex(isDark ? "#79c0ff" : "#0969da") },
        { token: "number", foreground: hex(e.number) },
        { token: "number.hex", foreground: hex(e.number) },
        { token: "number.float", foreground: hex(e.number) },
        { token: "string", foreground: hex(e.string) },
        { token: "comment", foreground: hex(e.comment), fontStyle: "italic" },
      ],
      colors: {
        "editor.background": e.bg,
        "editor.foreground": e.fg,
        "editorLineNumber.foreground": isDark ? "#484f58" : "#94a3b8",
        "editorLineNumber.activeForeground": isDark ? "#c9d1d9" : "#0f172a",
        "editorGutter.background": e.bg,
        "editor.lineHighlightBackground": isDark ? "#161b2280" : "#f1f5f9",
        "editor.selectionBackground": isDark ? "#264f7880" : "#bae6fd80",
        "editorCursor.foreground": isDark ? "#58a6ff" : "#0969da",
      },
    });
  }
}

export interface Marker {
  line: number;
  message: string;
  severity: "error" | "warning";
}

// Shared refs so the (globally-registered) Monaco providers always read the
// latest project index and jump handler.
const indexRef: { current: VIndex } = { current: { modules: [], signals: [] } };
const jumpRef: { current: ((file: string, line: number) => void) | null } = { current: null };
const fileRef: { current: string } = { current: "" };

const VERILOG_KEYWORDS = [
  "module", "endmodule", "input", "output", "inout", "wire", "reg", "logic",
  "assign", "always", "always_ff", "always_comb", "always_latch", "initial",
  "begin", "end", "if", "else", "case", "casex", "casez", "endcase", "default",
  "for", "while", "repeat", "forever", "posedge", "negedge", "or", "and", "not",
  "nand", "nor", "xor", "xnor", "buf", "parameter", "localparam", "integer",
  "genvar", "generate", "endgenerate", "function", "endfunction", "task",
  "endtask", "default", "signed", "unsigned", "wait", "fork", "join",
  "timescale", "define", "include", "ifdef", "ifndef", "endif",
];

function registerVerilog(monaco: any) {
  if (monaco.__verilogRegistered) return;
  monaco.__verilogRegistered = true;

  monaco.languages.register({ id: "verilog" });

  monaco.languages.setMonarchTokensProvider("verilog", {
    keywords: VERILOG_KEYWORDS,
    operators: ["=", "<=", "==", "!=", "&&", "||", "&", "|", "^", "~", "+", "-", "*", "/", "%", "<", ">", "<<", ">>", "?", ":"],
    tokenizer: {
      root: [
        [/`[a-zA-Z_]\w*/, "keyword.directive"],
        [/\$[a-zA-Z_]\w*/, "type.identifier"],
        [/[0-9]+'[bBoOdDhH][0-9a-fA-FxXzZ_]+/, "number.hex"],
        [/\d+\.\d+/, "number.float"],
        [/\d+/, "number"],
        [
          /[a-zA-Z_]\w*/,
          { cases: { "@keywords": "keyword", "@default": "identifier" } },
        ],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"/, "string", "@string"],
        [/[{}()[\]]/, "@brackets"],
        [/[;,.]/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration("verilog", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });

  // Native document formatting provider (Alt+Shift+F / Format Document)
  monaco.languages.registerDocumentFormattingEditProvider("verilog", {
    provideDocumentFormattingEdits(model: any) {
      const formatted = formatVerilog(model.getValue());
      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    },
  });

  registerProviders(monaco);
}

export interface SnippetDef {
  label: string;
  detail: string;
  body: string;
  category?: string;
}

export const SNIPPETS: SnippetDef[] = [
  {
    label: "always_ff",
    detail: "Clocked always block (sync reset)",
    category: "Sequential",
    body: "always_ff @(posedge ${1:clk}) begin\n\tif (${2:rst}) begin\n\t\t${3:q} <= '0;\n\tend else begin\n\t\t${3:q} <= ${4:d};\n\tend\nend",
  },
  {
    label: "always_ff_async",
    detail: "Clocked always block (async reset)",
    category: "Sequential",
    body: "always_ff @(posedge ${1:clk} or posedge ${2:rst}) begin\n\tif (${2:rst}) begin\n\t\t${3:q} <= '0;\n\tend else begin\n\t\t${3:q} <= ${4:d};\n\tend\nend",
  },
  {
    label: "always_comb",
    detail: "Combinational always block",
    category: "Combinational",
    body: "always_comb begin\n\t${1:y} = ${2:expr};\nend",
  },
  {
    label: "always",
    detail: "Generic clocked always block (Verilog-2001)",
    category: "Sequential",
    body: "always @(posedge ${1:clk} or posedge ${2:rst}) begin\n\tif (${2:rst})\n\t\t${3:q} <= 0;\n\telse\n\t\t${3:q} <= ${4:d};\nend",
  },
  {
    label: "case",
    detail: "Case statement with default",
    category: "Combinational",
    body: "case (${1:sel})\n\t${2:2'b00}: ${3:out} = ${4:a};\n\t${5:2'b01}: ${3:out} = ${6:b};\n\tdefault: ${3:out} = '0;\nendcase",
  },
  {
    label: "module",
    detail: "Module skeleton with ports",
    category: "Structural",
    body: "module ${1:name} #(\n\tparameter DATA_WIDTH = 8\n) (\n\tinput  wire                  ${2:clk},\n\tinput  wire                  ${3:rst},\n\tinput  wire [DATA_WIDTH-1:0] ${4:d_in},\n\toutput reg  [DATA_WIDTH-1:0] ${5:d_out}\n);\n\n\t$0\n\nendmodule",
  },
  {
    label: "fsm",
    detail: "FSM template (enum states, 2-always style)",
    category: "State Machine",
    body:
      "typedef enum logic [1:0] { ${1:IDLE}, ${2:RUN}, ${3:DONE} } state_t;\nstate_t state, next_state;\n\n" +
      "// State register\nalways_ff @(posedge ${4:clk}) begin\n\tif (${5:rst}) state <= ${1:IDLE};\n\telse state <= next_state;\nend\n\n" +
      "// Next-state & output logic\nalways_comb begin\n\tnext_state = state;\n\tcase (state)\n\t\t${1:IDLE}: if (${6:start}) next_state = ${2:RUN};\n\t\t${2:RUN}:  if (${7:ready}) next_state = ${3:DONE};\n\t\t${3:DONE}: next_state = ${1:IDLE};\n\t\tdefault:   next_state = ${1:IDLE};\n\tendcase\nend",
  },
  {
    label: "tb",
    detail: "Self-checking testbench skeleton",
    category: "Verification",
    body:
      "`timescale 1ns/1ps\nmodule ${1:dut}_tb;\n\treg clk = 0;\n\treg rst = 1;\n\talways #5 clk = ~clk; // 100 MHz\n\n\t// DUT Instantiation\n\t${1:dut} dut (\n\t\t.clk(clk),\n\t\t.rst(rst)\n\t);\n\n\tinitial begin\n\t\t$dumpfile(\"dump.vcd\");\n\t\t$dumpvars(0, ${1:dut}_tb);\n\t\t#20 rst = 0;\n\t\t$0\n\t\t#100 $finish;\n\tend\nendmodule",
  },
  {
    label: "clk_gen",
    detail: "Clock generator initial/always block",
    category: "Verification",
    body: "reg ${1:clk} = 0;\nalways #${2:5} ${1:clk} = ~${1:clk};",
  },
  {
    label: "dff",
    detail: "D Flip-Flop with asynchronous reset",
    category: "Sequential",
    body: "always_ff @(posedge ${1:clk} or posedge ${2:rst}) begin\n\tif (${2:rst}) ${3:q} <= '0;\n\telse if (${4:en}) ${3:q} <= ${5:d};\nend",
  },
  {
    label: "counter",
    detail: "Parameterized up-counter with enable",
    category: "Sequential",
    body: "reg [${1:7}:0] ${2:count};\nalways_ff @(posedge ${3:clk}) begin\n\tif (${4:rst}) ${2:count} <= '0;\n\telse if (${5:en}) ${2:count} <= ${2:count} + 1'b1;\nend",
  },
  {
    label: "mux",
    detail: "Parameterized 2-to-1 MUX",
    category: "Combinational",
    body: "assign ${1:y} = (${2:sel}) ? ${3:b} : ${4:a};",
  },
  { label: "initial", detail: "Initial block", category: "Verification", body: "initial begin\n\t$0\nend" },
  { label: "$display", detail: "Display statement", category: "Verification", body: '$display("${1:msg}: %0d", ${2:val});' },
  { label: "$dumpvars", detail: "VCD dump setup", category: "Verification", body: '$dumpfile("dump.vcd");\n$dumpvars(0, ${1:tb});' },
]

function registerProviders(monaco: any) {
  monaco.languages.registerCompletionItemProvider("verilog", {
    triggerCharacters: ["."],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const K = monaco.languages.CompletionItemKind;
      const rule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      const suggestions: any[] = [];

      for (const s of SNIPPETS)
        suggestions.push({
          label: s.label,
          kind: K.Snippet,
          detail: s.detail,
          insertText: s.body,
          insertTextRules: rule,
          range,
        });

      const idx = indexRef.current;
      for (const m of idx.modules) {
        suggestions.push({
          label: `${m.name} (instantiate)`,
          kind: K.Class,
          detail: moduleSignature(m),
          documentation: `Instantiate ${m.name} with named ports`,
          insertText: instantiationSnippet(m),
          insertTextRules: rule,
          filterText: m.name,
          range,
        });
      }

      const seen = new Set<string>();
      for (const sig of idx.signals) {
        if (seen.has(sig.name)) continue;
        seen.add(sig.name);
        suggestions.push({
          label: sig.name,
          kind: K.Variable,
          detail: `${sig.type}${sig.range ? " " + sig.range : ""}`,
          insertText: sig.name,
          range,
        });
      }

      for (const kw of VERILOG_KEYWORDS)
        suggestions.push({ label: kw, kind: K.Keyword, insertText: kw, range });

      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider("verilog", {
    provideHover(model: any, position: any) {
      const w = model.getWordAtPosition(position);
      if (!w) return null;
      const name = w.word;
      const idx = indexRef.current;
      const mod = idx.modules.find((m) => m.name === name);
      if (mod) {
        const ports = mod.ports.length
          ? mod.ports.map((p) => `- \`${p.dir || "port"} ${p.range || ""} ${p.name}\``).join("\n")
          : "_(no ports parsed)_";
        return {
          contents: [
            { value: "```systemverilog\n" + moduleSignature(mod) + "\n```" },
            { value: `**module** defined in \`${mod.file}:${mod.line}\`\n\n${ports}` },
          ],
        };
      }
      const sig = idx.signals.find((s) => s.name === name);
      if (sig) {
        return {
          contents: [
            { value: "```systemverilog\n" + `${sig.type} ${sig.range || ""} ${sig.name}`.replace(/\s+/g, " ").trim() + "\n```" },
            { value: `declared in \`${sig.file}:${sig.line}\`` },
          ],
        };
      }
      return null;
    },
  });

  monaco.languages.registerDefinitionProvider("verilog", {
    provideDefinition(model: any, position: any) {
      const w = model.getWordAtPosition(position);
      if (!w) return null;
      const name = w.word;
      const idx = indexRef.current;
      const cur = fileRef.current;

      const sameFileRange = (line: number) => ({
        uri: model.uri,
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      });

      const mod = idx.modules.find((m) => m.name === name);
      if (mod) {
        if (mod.file === cur) return sameFileRange(mod.line);
        jumpRef.current?.(mod.file, mod.line);
        return null;
      }
      const sigSame = idx.signals.find((s) => s.name === name && s.file === cur);
      if (sigSame) return sameFileRange(sigSame.line);
      const sigAny = idx.signals.find((s) => s.name === name);
      if (sigAny) {
        jumpRef.current?.(sigAny.file, sigAny.line);
        return null;
      }
      return null;
    },
  });
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  path?: string;
  language?: string;
  markers?: Marker[];
  index?: VIndex;
  themeId?: string;
  smartSuggestions?: boolean;
  onJump?: (file: string, line: number) => void;
  onReady?: (editor: any, monaco: any) => void;
}

export default function CodeEditor({ value, onChange, height = "100%", path, language = "verilog", markers = [], index, themeId = "night", smartSuggestions = true, onJump, onReady }: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  if (index) indexRef.current = index;
  jumpRef.current = onJump ?? null;
  if (path) fileRef.current = path;

  // Re-apply the editor theme when it changes.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    defineThemes(monaco);
    monaco.editor.setTheme(monacoName(getTheme(themeId).id));
  }, [themeId]);

  const applyMarkers = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!model || !monaco) return;
    monaco.editor.setModelMarkers(
      model,
      "verilog-tools",
      markers.map((m) => ({
        startLineNumber: m.line,
        endLineNumber: m.line,
        startColumn: 1,
        endColumn: 1000,
        message: m.message,
        severity: m.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      }))
    );
  };

  useEffect(() => {
    applyMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, path]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerVerilog(monaco);
    defineThemes(monaco);
    monaco.editor.setTheme(monacoName(getTheme(themeId).id));
    applyMarkers();
    onReady?.(editor, monaco);
  };

  return (
    <Editor
      height={height}
      language={language}
      theme={monacoName(getTheme(themeId).id)}
      path={path}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={registerVerilog}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
        renderLineHighlight: "line",
        smoothScrolling: true,
        // Smart suggestions: the autocomplete/IntelliSense popups that appear as
        // you type. When off, nothing is triggered automatically (Ctrl+Space
        // still works on demand).
        quickSuggestions: smartSuggestions,
        suggestOnTriggerCharacters: smartSuggestions,
        wordBasedSuggestions: smartSuggestions ? "currentDocument" : "off",
        parameterHints: { enabled: smartSuggestions },
      }}
    />
  );
}
