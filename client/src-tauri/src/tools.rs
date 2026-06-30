// Native EDA toolchain orchestration for the SynthWave desktop app.
//
// Mirrors the web server's runner.js, but runs the real iverilog/vvp/yosys/
// verilator binaries installed on the machine. Each command writes the sources
// to a throwaway temp dir, runs the tools, and returns raw text (VCD / netlist
// JSON / logs). The existing TypeScript frontend parses the VCD, renders the
// schematic (netlistsvg) and computes stats — exactly as it already does for
// the in-browser WASM engine — so there's no logic duplicated in Rust.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use wait_timeout::ChildExt;

const RUN_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(serde::Deserialize)]
pub struct SrcFile {
    pub name: String,
    pub content: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub kind: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct OutFile {
    pub name: String,
    pub content: String,
}

#[derive(serde::Serialize)]
pub struct Tools {
    pub iverilog: Option<String>,
    pub vvp: Option<String>,
    pub yosys: Option<String>,
    pub verilator: Option<String>,
}

#[derive(serde::Serialize)]
pub struct Health {
    pub ok: bool,
    pub tools: Tools,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimResult {
    pub ok: bool,
    pub stage: String,
    pub vcd: Option<String>,
    pub log: String,
    pub has_waveform: bool,
    pub outputs: Vec<OutFile>,
}

#[derive(serde::Serialize)]
pub struct LintResult {
    pub ok: bool,
    pub log: String,
}

#[derive(serde::Serialize)]
pub struct SynthResult {
    pub ok: bool,
    pub stage: String,
    pub netlist: Option<String>,
    pub log: String,
}

struct RunOut {
    code: i32,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

// Architecture-specific subdir of the bundled tools tree, matching the layout
// produced by the bundling scripts (scripts/bundle-macos-tools.sh,
// scripts/bundle-windows-tools.ps1) and shipped via tauri.conf.json resources.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const BUNDLE_ARCH: &str = "macos-arm64";
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const BUNDLE_ARCH: &str = "windows-x64";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const BUNDLE_ARCH: &str = "linux-x64";
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
const BUNDLE_ARCH: &str = "linux-arm64";
#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "aarch64")
)))]
const BUNDLE_ARCH: &str = "unsupported";

// Executable file extension for the host OS.
#[cfg(windows)]
const EXE_SUFFIX: &str = ".exe";
#[cfg(not(windows))]
const EXE_SUFFIX: &str = "";

// Candidate locations of the bundled `tools/` resource dir, used as a fallback
// when the Tauri-resolved resource dir is unavailable. Packaging differs by
// platform:
//   macOS .app:  SynthWave.app/Contents/MacOS/SynthWave (exe)
//                SynthWave.app/Contents/Resources/tools/...
//   Windows:     <install>/SynthWave.exe  +  <install>/tools/... (next to exe)
//   Linux:       /usr/bin/synthwave       +  /usr/lib/SynthWave/tools/...
// Returns empty in `tauri dev` (no packaged resources) -> system-tool fallback.
fn resource_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Windows / Linux AppImage: resources sit beside the executable.
            roots.push(dir.to_path_buf());
            if let Some(parent) = dir.parent() {
                // macOS: MacOS/<exe> -> ../Resources
                roots.push(parent.join("Resources"));
                // Linux deb: /usr/bin/<exe> -> /usr/lib/<product>
                roots.push(parent.join("lib").join("SynthWave"));
                roots.push(parent.join("lib").join("synthwave"));
            }
        }
    }
    roots
}

// Locate the self-contained toolchain shipped inside the app, if present.
fn bundled_root() -> Option<PathBuf> {
    // Canonical: the resource dir Tauri resolved at startup (correct on every
    // platform). Falls back to deriving it from the executable location.
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(res) = crate::resource_dir() {
        roots.push(res);
    }
    roots.extend(resource_roots());
    for r in roots {
        let root = r.join("tools").join(BUNDLE_ARCH);
        if root.join("bin").is_dir() {
            return Some(root);
        }
    }
    None
}

// macOS GUI apps launched from Finder get a minimal PATH that excludes
// /opt/homebrew/bin etc., so we resolve absolute tool paths ourselves.
fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        // Common OSS CAD Suite install locations.
        dirs.push(Path::new(&home).join("oss-cad-suite/bin"));
        dirs.push(Path::new(&home).join("tools/oss-cad-suite/bin"));
    }
    if let Ok(path) = std::env::var("PATH") {
        for p in std::env::split_paths(&path) {
            dirs.push(p);
        }
    }
    dirs
}

// Bundling/packaging can strip the executable bit off the binaries we ship as
// app resources; restore it so the tools always launch on the user's machine.
#[cfg(unix)]
fn ensure_executable(p: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(p) {
        let mode = meta.permissions().mode();
        if mode & 0o111 == 0 {
            let mut perms = meta.permissions();
            perms.set_mode(mode | 0o755);
            let _ = std::fs::set_permissions(p, perms);
        }
    }
}
#[cfg(not(unix))]
fn ensure_executable(_p: &Path) {}

fn find_tool(name: &str) -> Option<String> {
    // Prefer the tools bundled inside the .app so we never depend on a system
    // install. Verilator is shipped as the real `verilator_bin` (we set
    // VERILATOR_ROOT in `run` instead of relying on the perl wrapper).
    if let Some(root) = bundled_root() {
        let base = if name == "verilator" { "verilator_bin" } else { name };
        let cand = root.join("bin").join(format!("{base}{EXE_SUFFIX}"));
        if cand.is_file() {
            ensure_executable(&cand);
            return Some(cand.to_string_lossy().into_owned());
        }
    }
    let fname = format!("{name}{EXE_SUFFIX}");
    for dir in candidate_dirs() {
        let full = dir.join(&fname);
        if full.is_file() {
            return Some(full.to_string_lossy().into_owned());
        }
    }
    None
}

fn run(cmd: &str, args: &[&str], cwd: &Path) -> RunOut {
    let resolved = find_tool(cmd).unwrap_or_else(|| cmd.to_string());
    let bundled = bundled_root();

    // When running the bundled binaries, their compiled-in data paths point at
    // the build machine's Homebrew prefix (which won't exist on the user's Mac),
    // so redirect each tool at the data we shipped alongside it.
    let mut full_args: Vec<String> = Vec::new();
    if let Some(ref root) = bundled {
        let ivl = root.join("lib").join("ivl");
        if ivl.is_dir() {
            match cmd {
                // iverilog finds ivl/ivlpp/targets/VPI via -B; vvp finds VPI via -M.
                "iverilog" => full_args.extend(["-B".to_string(), ivl.to_string_lossy().into_owned()]),
                "vvp" => full_args.extend(["-M".to_string(), ivl.to_string_lossy().into_owned()]),
                _ => {}
            }
        }
    }
    full_args.extend(args.iter().map(|s| s.to_string()));

    let mut command = Command::new(&resolved);
    command
        .args(&full_args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // yosys locates share/yosys and yosys-abc relative to its own executable,
    // so no env is needed for it. Verilator needs its data root, though.
    if cmd == "verilator" {
        if let Some(ref root) = bundled {
            let vroot = root.join("share").join("verilator");
            if vroot.is_dir() {
                command.env("VERILATOR_ROOT", &vroot);
            }
        }
    }

    let child = command.spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            return RunOut {
                code: -1,
                stdout: String::new(),
                stderr: format!("Failed to start {}: {}", cmd, e),
                timed_out: false,
            }
        }
    };

    let timed_out = match child.wait_timeout(RUN_TIMEOUT) {
        Ok(Some(_)) => false,
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            true
        }
        Err(_) => false,
    };

    let output = child.wait_with_output();
    match output {
        Ok(out) => RunOut {
            code: if timed_out { -1 } else { out.status.code().unwrap_or(-1) },
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
            timed_out,
        },
        Err(e) => RunOut {
            code: -1,
            stdout: String::new(),
            stderr: format!("{}", e),
            timed_out,
        },
    }
}

fn sanitize_name(name: &str, fallback: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut n: String = base
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '_' })
        .collect();
    if n.is_empty() || n == "." || n == ".." {
        n = fallback.to_string();
    }
    let lower = n.to_lowercase();
    if !(lower.ends_with(".v") || lower.ends_with(".sv")) {
        n.push_str(".v");
    }
    n
}

// Sanitize a data filename to a safe RELATIVE path (subdirectories allowed for
// $readmemh("rom/init.hex")), stripping leading slashes and "..".
fn sanitize_data_name(name: &str, fallback: &str) -> String {
    let segs: Vec<String> = name
        .replace('\\', "/")
        .split('/')
        .map(|s| {
            s.chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '_' })
                .collect::<String>()
        })
        .filter(|s| !s.is_empty() && s != "." && s != "..")
        .collect();
    if segs.is_empty() {
        fallback.to_string()
    } else {
        segs.join("/")
    }
}

fn write_files(dir: &Path, files: &[SrcFile]) -> std::io::Result<Vec<String>> {
    let mut used: Vec<String> = Vec::new();
    for (i, f) in files.iter().enumerate() {
        let mut n = sanitize_name(&f.name, &format!("file{}.v", i + 1));
        let base = n.clone();
        let mut k = 1;
        while used.contains(&n) {
            // insert _k before the extension
            if let Some(pos) = base.to_lowercase().rfind(".s") {
                n = format!("{}_{}{}", &base[..pos], k, &base[pos..]);
            } else if let Some(pos) = base.rfind('.') {
                n = format!("{}_{}{}", &base[..pos], k, &base[pos..]);
            } else {
                n = format!("{}_{}", base, k);
            }
            k += 1;
        }
        used.push(n.clone());
        std::fs::write(dir.join(&n), &f.content)?;
    }
    Ok(used)
}

fn write_data_files(dir: &Path, data: &[SrcFile]) -> std::io::Result<Vec<String>> {
    let mut written = Vec::new();
    for (i, f) in data.iter().enumerate() {
        let n = sanitize_data_name(&f.name, &format!("data{}.dat", i + 1));
        let full = dir.join(&n);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&full, &f.content)?;
        written.push(n);
    }
    Ok(written)
}

fn collect_outputs(dir: &Path, known: &[String]) -> Vec<OutFile> {
    let mut outputs = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return outputs,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if known.contains(&name) {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
                continue;
            }
        }
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            outputs.push(OutFile { name, content });
        }
    }
    outputs
}

fn temp_dir() -> std::io::Result<tempfile::TempDir> {
    tempfile::Builder::new().prefix("synthwave-").tempdir()
}

fn nonempty(files: Vec<SrcFile>) -> Vec<SrcFile> {
    files.into_iter().filter(|f| !f.content.trim().is_empty()).collect()
}

// ---------------- Commands ----------------

pub fn check_tools_impl() -> Health {
    let iverilog = find_tool("iverilog");
    let vvp = find_tool("vvp");
    let yosys = find_tool("yosys");
    let verilator = find_tool("verilator");
    let ok = iverilog.is_some() && vvp.is_some() && yosys.is_some();
    Health {
        ok,
        tools: Tools { iverilog, vvp, yosys, verilator },
    }
}

pub fn simulate_impl(files: Vec<SrcFile>, data: Vec<SrcFile>) -> SimResult {
    let dir = match temp_dir() {
        Ok(d) => d,
        Err(e) => {
            return SimResult {
                ok: false,
                stage: "compile".into(),
                vcd: None,
                log: format!("Could not create temp dir: {}", e),
                has_waveform: false,
                outputs: vec![],
            }
        }
    };
    let p = dir.path();
    if files.is_empty() {
        return SimResult {
            ok: false,
            stage: "compile".into(),
            vcd: None,
            log: "No source files to simulate.".into(),
            has_waveform: false,
            outputs: vec![],
        };
    }
    let names = match write_files(p, &files) {
        Ok(n) => n,
        Err(e) => {
            return SimResult {
                ok: false,
                stage: "compile".into(),
                vcd: None,
                log: format!("Write error: {}", e),
                has_waveform: false,
                outputs: vec![],
            }
        }
    };
    let data_names = write_data_files(p, &data).unwrap_or_default();

    let mut compile_args: Vec<&str> = vec!["-g2012", "-o", "sim.out"];
    for n in &names {
        compile_args.push(n);
    }
    let compile = run("iverilog", &compile_args, p);
    if compile.timed_out {
        return SimResult { ok: false, stage: "compile".into(), vcd: None, log: "Compilation timed out.".into(), has_waveform: false, outputs: vec![] };
    }
    if compile.code != 0 {
        let log = format!("{}{}", compile.stdout, compile.stderr);
        return SimResult { ok: false, stage: "compile".into(), vcd: None, log: if log.trim().is_empty() { "Compilation failed.".into() } else { log.trim().into() }, has_waveform: false, outputs: vec![] };
    }

    let sim = run("vvp", &["sim.out"], p);
    let mut log = format!("{}{}{}{}", compile.stdout, compile.stderr, sim.stdout, sim.stderr);
    if sim.timed_out {
        log.push_str("\nSimulation timed out (possible infinite loop / missing $finish).");
        return SimResult { ok: false, stage: "simulate".into(), vcd: None, log: log.trim().into(), has_waveform: false, outputs: vec![] };
    }

    // Find a VCD file.
    let candidates = ["dump.vcd", "wave.vcd", "test.vcd", "tb.vcd", "waveform.vcd"];
    let mut vcd: Option<String> = None;
    let mut vcd_name: Option<String> = None;
    for c in &candidates {
        if let Ok(content) = std::fs::read_to_string(p.join(c)) {
            vcd = Some(content);
            vcd_name = Some((*c).to_string());
            break;
        }
    }
    if vcd.is_none() {
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.ends_with(".vcd") {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        vcd = Some(content);
                        vcd_name = Some(name);
                        break;
                    }
                }
            }
        }
    }

    let mut known: Vec<String> = Vec::new();
    known.extend(names.iter().cloned());
    known.extend(data_names.iter().cloned());
    known.push("sim.out".into());
    for c in &candidates {
        known.push((*c).to_string());
    }
    if let Some(ref n) = vcd_name {
        known.push(n.clone());
    }
    let outputs = collect_outputs(p, &known);

    let has_waveform = vcd.is_some();
    SimResult {
        ok: true,
        stage: "done".into(),
        vcd,
        log: if log.trim().is_empty() { "Simulation finished.".into() } else { log.trim().into() },
        has_waveform,
        outputs,
    }
}

pub fn lint_impl(files: Vec<SrcFile>, level: String, top: String) -> LintResult {
    let files = nonempty(files);
    let dir = match temp_dir() {
        Ok(d) => d,
        Err(e) => return LintResult { ok: false, log: format!("Could not create temp dir: {}", e) },
    };
    let p = dir.path();
    if files.is_empty() {
        return LintResult { ok: false, log: "Nothing to lint — write some Verilog first.".into() };
    }
    let names = match write_files(p, &files) {
        Ok(n) => n,
        Err(e) => return LintResult { ok: false, log: format!("Write error: {}", e) },
    };

    if level == "strict" {
        let mut args: Vec<String> = vec!["--lint-only".into(), "-Wall".into(), "-Wno-DECLFILENAME".into()];
        if !top.trim().is_empty() {
            args.push("--top-module".into());
            args.push(top.trim().into());
        }
        for n in &names {
            args.push(n.clone());
        }
        let argref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let r = run("verilator", &argref, p);
        let missing = r.code == -1 && (r.stderr.contains("Failed to start") || r.stderr.to_lowercase().contains("not found"));
        if !missing {
            if r.timed_out {
                return LintResult { ok: false, log: "Strict lint timed out.".into() };
            }
            let log = format!("{}{}", r.stdout, r.stderr);
            let log = log.trim().to_string();
            let has_error = log
                .lines()
                .any(|l| l.contains("%Error") && !l.contains("Exiting due to"));
            if !has_error {
                return LintResult {
                    ok: true,
                    log: if log.is_empty() { "\u{2713} No errors or warnings. Verilator strict lint is clean.".into() } else { format!("Verilator lint finished with warnings:\n\n{}", log) },
                };
            }
            return LintResult { ok: false, log: if log.is_empty() { "Strict lint failed.".into() } else { log } };
        }
        // Verilator missing -> basic fallback.
        let mut args2: Vec<&str> = vec!["-Wall", "-t", "null", "-g2012"];
        for n in &names {
            args2.push(n);
        }
        let r2 = run("iverilog", &args2, p);
        let log = format!("{}{}", r2.stdout, r2.stderr);
        let log = log.trim().to_string();
        let note = "[Verilator not installed — used basic lint. Run `brew install verilator` for strict mode.]\n\n";
        if r2.code == 0 {
            return LintResult { ok: true, log: format!("{}{}", note, if log.is_empty() { "\u{2713} No errors or warnings (basic lint).".into() } else { log }) };
        }
        return LintResult { ok: false, log: format!("{}{}", note, if log.is_empty() { "Verification failed.".into() } else { log }) };
    }

    // Basic: Icarus -Wall.
    let mut args: Vec<&str> = vec!["-Wall", "-t", "null", "-g2012"];
    for n in &names {
        args.push(n);
    }
    let r = run("iverilog", &args, p);
    if r.timed_out {
        return LintResult { ok: false, log: "Verification timed out.".into() };
    }
    let log = format!("{}{}", r.stdout, r.stderr);
    let log = log.trim().to_string();
    if r.code == 0 {
        LintResult {
            ok: true,
            log: if log.is_empty() { "\u{2713} No errors or warnings. The code parses, elaborates, and lints clean.".into() } else { format!("\u{2713} Elaborated successfully, with lint warnings:\n\n{}", log) },
        }
    } else {
        LintResult { ok: false, log: if log.is_empty() { "Verification failed.".into() } else { log } }
    }
}

pub fn synthesize_impl(files: Vec<SrcFile>, top: String, flatten: bool, mode: String, lib: Option<String>) -> SynthResult {
    let files = nonempty(files);
    let dir = match temp_dir() {
        Ok(d) => d,
        Err(e) => return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: format!("Could not create temp dir: {}", e) },
    };
    let p = dir.path();
    if files.is_empty() {
        return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: "No design files to synthesize.".into() };
    }
    let names = match write_files(p, &files) {
        Ok(n) => n,
        Err(e) => return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: format!("Write error: {}", e) },
    };
    let joined = names.join(" ");
    let top_arg = if top.trim().is_empty() { "-auto-top".to_string() } else { format!("-top {}", top.trim()) };
    let flatten_arg = if flatten { "; flatten" } else { "" };

    let has_lib = lib.as_ref().map(|l| !l.trim().is_empty()).unwrap_or(false);
    let script = if mode == "gate" && has_lib {
        let _ = std::fs::write(p.join("cells.lib"), lib.as_ref().unwrap());
        [
            "read_liberty -lib cells.lib".to_string(),
            format!("read_verilog -sv {}", joined),
            format!("synth {}{}", top_arg, flatten_arg),
            "dfflibmap -liberty cells.lib".to_string(),
            "abc -liberty cells.lib".to_string(),
            "opt_clean".to_string(),
            "stat -liberty cells.lib".to_string(),
            "write_json netlist.json".to_string(),
        ]
        .join("; ")
    } else if mode == "gate" {
        [
            format!("read_verilog -sv {}", joined),
            format!("synth {}{}", top_arg, flatten_arg),
            "abc -g AND,OR,XOR,MUX".to_string(),
            "opt_clean".to_string(),
            "stat".to_string(),
            "write_json netlist.json".to_string(),
        ]
        .join("; ")
    } else {
        [
            format!("read_verilog -sv {}", joined),
            format!("hierarchy {}", top_arg),
            "proc".to_string(),
            "opt".to_string(),
            "memory -nomap".to_string(),
            "opt".to_string(),
            "wreduce".to_string(),
            format!("opt -full{}", flatten_arg),
            "stat".to_string(),
            "write_json netlist.json".to_string(),
        ]
        .join("; ")
    };

    let ys = run("yosys", &["-p", &script], p);
    if ys.timed_out {
        return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: "Synthesis timed out.".into() };
    }
    if ys.code != 0 {
        let log = format!("{}{}", ys.stdout, ys.stderr);
        return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: if log.trim().is_empty() { "Synthesis failed.".into() } else { log.trim().into() } };
    }
    let netlist = std::fs::read_to_string(p.join("netlist.json")).ok();
    if netlist.is_none() {
        let log = format!("{}{}", ys.stdout, ys.stderr);
        return SynthResult { ok: false, stage: "synthesize".into(), netlist: None, log: format!("Yosys produced no netlist.\n\n{}", log.trim()) };
    }
    let log = if !ys.stdout.trim().is_empty() { ys.stdout } else if !ys.stderr.trim().is_empty() { ys.stderr } else { "Synthesis finished.".into() };
    SynthResult { ok: true, stage: "done".into(), netlist, log }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(name: &str, content: &str) -> SrcFile {
        SrcFile { name: name.into(), content: content.into(), kind: None }
    }

    const DESIGN: &str = r#"
module counter(input clk, input rst, output reg [3:0] q);
  always @(posedge clk or posedge rst)
    if (rst) q <= 4'd0; else q <= q + 4'd1;
endmodule
"#;

    const TB: &str = r#"
module tb;
  reg clk = 0, rst = 1; wire [3:0] q;
  counter dut(clk, rst, q);
  initial begin
    $dumpfile("dump.vcd"); $dumpvars(0, tb);
    #7 rst = 0;
    repeat (20) #5 clk = ~clk;
    $finish;
  end
endmodule
"#;

    #[test]
    fn simulate_produces_vcd() {
        let r = simulate_impl(vec![f("counter.v", DESIGN), f("tb.v", TB)], vec![]);
        assert!(r.ok, "sim should succeed: {}", r.log);
        assert!(r.has_waveform, "expected a VCD waveform");
        let vcd = r.vcd.unwrap_or_default();
        assert!(vcd.contains("$enddefinitions"), "VCD looks malformed:\n{}", vcd);
    }

    #[test]
    fn lint_clean_design_passes() {
        let r = lint_impl(vec![f("counter.v", DESIGN)], "basic".into(), String::new());
        assert!(r.ok, "clean design should lint ok: {}", r.log);
    }

    #[test]
    fn lint_catches_syntax_error() {
        let bad = "module oops(input a, output b); assign b = ~a endmodule"; // missing ;
        let r = lint_impl(vec![f("oops.v", bad)], "basic".into(), String::new());
        assert!(!r.ok, "syntax error should fail lint");
    }

    #[test]
    fn synthesize_rtl_emits_netlist() {
        let r = synthesize_impl(vec![f("counter.v", DESIGN)], "counter".into(), false, "rtl".into(), None);
        assert!(r.ok, "synth should succeed: {}", r.log);
        let net = r.netlist.unwrap_or_default();
        assert!(net.contains("\"modules\""), "netlist JSON missing modules:\n{}", &net[..net.len().min(200)]);
    }

    #[test]
    fn synthesize_gate_generic_emits_netlist() {
        let r = synthesize_impl(vec![f("counter.v", DESIGN)], "counter".into(), false, "gate".into(), None);
        assert!(r.ok, "gate synth should succeed: {}", r.log);
        assert!(r.netlist.is_some(), "expected a gate-level netlist");
    }

    #[test]
    fn check_tools_finds_iverilog() {
        let h = check_tools_impl();
        assert!(h.tools.iverilog.is_some(), "iverilog should be discoverable on this machine");
    }
}
