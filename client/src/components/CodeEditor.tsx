import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { VIndex } from "../lib/verilogIndex";
import { moduleSignature, instantiationSnippet } from "../lib/verilogIndex";
import { THEMES, getTheme } from "../lib/themes";

const monacoName = (id: string) => "sw-" + id;

function defineThemes(monaco: any) {
  // Define (or redefine) every theme. defineTheme is idempotent, and avoiding a
  // one-time guard means newly added themes register correctly even when the
  // Monaco singleton persists across hot reloads / editor remounts.
  const hex = (c: string) => c.replace("#", "");
  for (const t of THEMES) {
    const e = t.editor;
    monaco.editor.defineTheme(monacoName(t.id), {
      base: e.base,
      inherit: true,
      rules: [
        { token: "keyword", foreground: hex(e.keyword) },
        { token: "keyword.directive", foreground: hex(e.directive) },
        { token: "type", foreground: hex(e.type) },
        { token: "type.identifier", foreground: hex(e.type) },
        { token: "number", foreground: hex(e.number) },
        { token: "string", foreground: hex(e.string) },
        { token: "comment", foreground: hex(e.comment), fontStyle: "italic" },
      ],
      colors: {
        "editor.background": e.bg,
        "editor.foreground": e.fg,
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

function baseName(uri: any): string {
  const p = String(uri?.path || uri || "");
  return p.split("/").pop() || p;
}

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
        [/[{}()\[\]]/, "@brackets"],
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

  registerProviders(monaco);
}

const SNIPPETS: Array<{ label: string; detail: string; body: string }> = [
  {
    label: "always_ff",
    detail: "Clocked always block (posedge clk)",
    body: "always_ff @(posedge ${1:clk}) begin\n\tif (${2:rst}) ${3:q} <= '0;\n\telse ${3:q} <= ${4:d};\nend",
  },
  {
    label: "always_comb",
    detail: "Combinational always block",
    body: "always_comb begin\n\t${1:y} = ${2:expr};\nend",
  },
  {
    label: "always",
    detail: "Generic clocked always block",
    body: "always @(posedge ${1:clk} or posedge ${2:rst}) begin\n\tif (${2:rst})\n\t\t${3:q} <= 0;\n\telse\n\t\t${3:q} <= ${4:d};\nend",
  },
  {
    label: "module",
    detail: "Module skeleton",
    body: "module ${1:name} (\n\tinput  logic ${2:clk},\n\tinput  logic ${3:rst},\n\toutput logic ${4:y}\n);\n\t$0\nendmodule",
  },
  {
    label: "fsm",
    detail: "FSM template (one-hot / enum states)",
    body:
      "typedef enum logic [${1:1}:0] { ${2:S0}, ${3:S1} } state_t;\nstate_t state, next;\n\n" +
      "always_ff @(posedge ${4:clk}) begin\n\tif (${5:rst}) state <= ${2:S0};\n\telse state <= next;\nend\n\n" +
      "always_comb begin\n\tnext = state;\n\tcase (state)\n\t\t${2:S0}: next = ${3:S1};\n\t\t${3:S1}: next = ${2:S0};\n\t\tdefault: next = ${2:S0};\n\tendcase\nend",
  },
  {
    label: "tb",
    detail: "Self-checking testbench skeleton",
    body:
      "module ${1:dut}_tb;\n\tlogic clk = 0, rst = 1;\n\talways #5 clk = ~clk;\n\n\t${1:dut} dut (.*);\n\n" +
      "\tinitial begin\n\t\t$dumpfile(\"dump.vcd\");\n\t\t$dumpvars(0, ${1:dut}_tb);\n\t\t#20 rst = 0;\n\t\t$0\n\t\t#100 $finish;\n\tend\nendmodule",
  },
  { label: "initial", detail: "Initial block", body: "initial begin\n\t$0\nend" },
  { label: "$display", detail: "Display statement", body: '$display("${1:msg} = %0d", ${2:val});' },
  { label: "$dumpvars", detail: "VCD dump setup", body: '$dumpfile("dump.vcd");\n$dumpvars(0, ${1:tb});' },
];

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
  onJump?: (file: string, line: number) => void;
  onReady?: (editor: any, monaco: any) => void;
}

export default function CodeEditor({ value, onChange, height = "100%", path, language = "verilog", markers = [], index, themeId = "dark-plus", onJump, onReady }: Props) {
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
      }}
    />
  );
}
