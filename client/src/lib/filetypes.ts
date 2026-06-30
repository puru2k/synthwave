// File-type helpers: distinguish HDL sources (fed to the Verilog toolchain)
// from arbitrary text files (editable, but not compiled), and map a filename
// to a Monaco editor language.

// Files passed to iverilog / verilator / yosys.
export const HDL_RE = /\.(v|sv|svh|vh)$/i;

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isHdl(name: string): boolean {
  return HDL_RE.test(name);
}

// Split a filename into stem + extension (extension includes the dot).
// "foo.bar.v" -> { stem: "foo.bar", ext: ".v" };  "Makefile" -> { stem, ext: "" }.
export function splitExt(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf(".");
  return i > 0 ? { stem: name.slice(0, i), ext: name.slice(i) } : { stem: name, ext: "" };
}

// Strip characters that are awkward in a virtual filesystem path. Forward
// slashes are kept (so files can live in subdirectories, e.g. rom/init.hex),
// but leading slashes and ".." segments are removed for safety.
export function sanitizeName(name: string): string {
  const segs = name
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[^A-Za-z0-9_.\-]/g, "_"))
    .filter((s) => s && s !== "." && s !== "..");
  return segs.join("/") || "untitled.v";
}

// Monaco language id for a filename. Falls back to plaintext for unknown types.
const LANG_BY_EXT: Record<string, string> = {
  v: "verilog",
  sv: "verilog",
  svh: "verilog",
  vh: "verilog",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  tcl: "tcl",
  do: "tcl",
  sdc: "tcl",
  xdc: "tcl",
  sh: "shell",
  bash: "shell",
  py: "python",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  js: "javascript",
  ts: "typescript",
};

export function monacoLanguage(name: string): string {
  return LANG_BY_EXT[fileExt(name)] || "plaintext";
}
