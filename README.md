# SynthWave

> ⚠️ **Work in progress** — SynthWave is still in active development. Features may change, and you may run into bugs or incomplete functionality. Feedback and bug reports are very welcome!

SynthWave is a Verilog/SystemVerilog IDE to **write**, **simulate**, **lint**, and
**synthesize** hardware designs. It runs the same feature set three ways: fully
in the browser (WebAssembly), against a local Node server, or as a self-contained
native desktop app with the toolchain bundled in.

- ✍️ Monaco-based editor with Verilog syntax highlighting, multi-file/multi-project
  workspaces, and cross-highlighting between the schematic and source.
- 📈 Simulation with [Icarus Verilog](http://iverilog.icarus.com/) → an interactive
  VCD waveform viewer.
- 🩺 Linting: basic (Icarus `-Wall`) and strict ([Verilator](https://www.veripool.org/verilator/)),
  surfaced as inline editor diagnostics.
- ⚙️ Synthesis with [Yosys](https://yosyshq.net/yosys/) → a rendered circuit
  schematic (via [netlistsvg](https://github.com/nturley/netlistsvg)), RTL and
  gate-level (with generic, Sky130, or custom Liberty libraries).
- 📊 Synthesis reports (cell/FF counts, logic depth, and area/delay estimates for
  gate-level runs) and an extracted **FSM state diagram**.

## Architecture

SynthWave is one React frontend that can be driven by three interchangeable
**engines**, all exposing the same `simulate` / `lint` / `synthesize` / `extractFsm`
API (see [`client/src/lib/api.ts`](client/src/lib/api.ts)):

| Engine | When it's used | Runs the tools via |
| --- | --- | --- |
| **In-browser (wasm)** | default on the web / static hosts | WebAssembly builds of Icarus, Verilator, and Yosys in Web Workers |
| **Server** | local dev with `npm run dev` | Express backend shelling out to system `iverilog`/`vvp`/`yosys`/`verilator` |
| **Native** | inside the desktop app | Rust (Tauri) commands running the **bundled** binaries |

A key design decision: **the engines only produce raw tool output** (VCD text,
netlist JSON, logs). All parsing, schematic rendering, stats, and FSM extraction
live once in the TypeScript layer (`client/src/lib/`), so behavior is identical
across engines and there is no logic duplicated in Rust or the server.

```
client/            Vite + React + TypeScript frontend (all UI + shared post-processing)
  src/App.tsx        Top-level app: workspace state, run orchestration, layout
  src/components/    Editor, waveform viewer, schematic, FSM diagram, reports
  src/lib/           Engine clients + shared parsing/render logic (see below)
  src/workers/       Web Workers wrapping the wasm toolchains
  src-tauri/         Rust (Tauri) desktop backend + per-platform tool bundling
  public/wasm/       Committed wasm toolchain artifacts served to the browser
server/            Express backend used only by the local "Server" engine
```

Key modules in `client/src/lib/` (a good place for a new contributor to start):

- `api.ts` — engine router; picks native/server/wasm and defines the shared types.
- `native.ts` — desktop bridge to the Tauri Rust commands.
- `clientSim.ts` / `clientSynth.ts` — in-browser (wasm) simulate/lint/synthesize.
- `netlist.ts` / `reports.ts` — netlist → schematic SVG, stats, and reports.
- `fsm.ts` / `fsmSource.ts` — FSM extraction (source-level, preserving Moore/Mealy).
- `vcd.ts` — VCD waveform parsing.
- `workspace.ts` / `persist.ts` — multi-project workspace model + localStorage.

The desktop backend lives in [`client/src-tauri/src/tools.rs`](client/src-tauri/src/tools.rs):
it locates the bundled toolchain, runs each tool in a temp dir, and returns raw
text for the TypeScript layer to process.

## Prerequisites

**None** for the in-browser web app or the desktop app — the toolchain is bundled.
The prerequisites below are only needed to run the local **Server** engine
(`npm run dev`), which shells out to your system tools:

```bash
brew install node icarus-verilog yosys   # + `verilator` for strict lint
```

- `iverilog`, `vvp` — compile and run simulations
- `yosys` — synthesis
- `verilator` (optional) — strict lint

## Setup

```bash
npm install                 # root (concurrently)
npm run install:all         # installs server + client deps
```

## Run (development)

```bash
npm run dev
```

Then open http://localhost:5173.

- **Simulate**: compiles `design.v` + `testbench.v` with `iverilog`, runs `vvp`,
  and renders the `dump.vcd` your testbench produces. Your testbench must call
  `$dumpfile("dump.vcd")` and `$dumpvars(...)`.
- **Synthesize**: runs Yosys on `design.v` and draws the resulting netlist.
  Set the `top` module (or leave blank for auto-detect); toggle `flatten` to
  inline submodules.

## Production build

```bash
npm run build       # builds client into client/dist
npm start           # server serves the built client on http://localhost:4000
```

## Deploy as a static site (no backend)

The whole toolchain — simulation (Icarus), basic + strict lint (Icarus +
Verilator), and synthesis / FSM extraction (Yosys) — is also compiled to
WebAssembly and can run **entirely in the browser**. That means SynthWave can be
deployed as a pure static site with no server at all.

The app defaults to the **In-browser** engine, so no backend is required. A
[service worker](client/public/sw.js) caches the wasm toolchains (Icarus ~10 MB,
Verilator ~7 MB, Yosys ~50 MB from a CDN) so repeat visits load instantly and the
app works offline (installable PWA). Asset paths are base-aware, so the build
works whether it's served from a domain root or a sub-path.

```bash
cd client
npm install
npm run build       # outputs a static site in client/dist
```

### Host it on GitHub Pages (free, recommended)

A workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
builds and deploys automatically:

1. Create a repo on GitHub and push this project to the `main` branch.
2. In the repo, go to **Settings → Pages → Build and deployment** and set
   **Source = GitHub Actions**.
3. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually). The
   workflow sets the asset base to `/<repo>/` automatically and publishes the
   site at `https://<your-username>.github.io/<repo>/`.

> Tip: name the repo `<your-username>.github.io` to serve it at the root domain
> with no sub-path.

### Other hosts

- **Netlify / Cloudflare Pages**: connect the GitHub repo and set the base
  directory to `verilog-studio/client`. The included
  [`netlify.toml`](client/netlify.toml) handles the build, SPA fallback, and
  service-worker headers. These serve at the root, so no `BASE_PATH` is needed.
- **Any static host**: serve `client/dist`. For a sub-path, build with
  `BASE_PATH=/your-sub-path/ npm run build`.

> First load downloads a toolchain only when you first use it (e.g. the
> Verilator wasm only downloads the first time you run a strict lint); a progress
> bar shows the download, and everything is cached afterward.

## Desktop app (standalone, no dependencies)

SynthWave also ships as a native desktop app (built with [Tauri](https://tauri.app/))
that **bundles the entire EDA toolchain inside the app** — Icarus Verilog, Yosys,
and Verilator — so it runs with no Homebrew, no installers, and no network. The
binaries and their data/libraries are vendored, relinked to load relative paths,
and resolved at runtime by the Rust backend (`src-tauri/src/tools.rs`).

Builds are produced **per platform on that platform** (the native binaries can't
be cross-bundled). Run everything from `client/`.

> Desktop builds target **macOS (Apple Silicon)** and **Linux x64**. On other
> systems (including Windows), use the fully-featured in-browser web app above.

### Easiest: build both in CI

The [`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) workflow
builds macOS (Apple Silicon) and Linux x64 installers on their native GitHub
runners — no local toolchain needed. Trigger it from the repo's **Actions** tab
(**Desktop apps → Run workflow**), then download the installers from the run's
**Artifacts**. Pushing a tag like `v0.1.0` also attaches them to a GitHub
Release. The per-platform manual builds below do the same thing locally.

### macOS (Apple Silicon, arm64)

```bash
# one-time: the bundling script copies the tools from your Homebrew install
brew install icarus-verilog yosys verilator

npm install
npm run app:build:mac      # bundles tools/macos-arm64 + builds SynthWave.app/.dmg
```

Output: `src-tauri/target/release/bundle/{macos,dmg}/`. The app is ad-hoc signed
(not notarized), so on **other** Macs first launch needs a one-time approval:
right-click → **Open**, or `xattr -dr com.apple.quarantine /Applications/SynthWave.app`.

### Linux (Ubuntu/Debian, x64)

```bash
# one-time: tools the bundling script copies + relinks from
# (yosys-abc is required for gate-level synthesis)
sudo apt-get install -y iverilog yosys yosys-abc verilator patchelf

npm install
npm run app:build:linux    # bundles tools/linux-x64 (+vendored .so closure) and builds .deb/AppImage
```

Output: `src-tauri/target/release/bundle/{deb,appimage}/`. The EDA toolchain is
fully bundled; the only system dependency is the WebKitGTK webview
(`libwebkit2gtk-4.1-0`), which the `.deb` declares so `apt` pulls it in
automatically.

> The Linux build follows GNOME/Yaru conventions (Ubuntu/Cantarell type, Adwaita
> rounding, Ubuntu-orange focus accent) with native window decorations; macOS uses
> an overlay title bar with vibrancy. Both share the same feature set and the same
> self-contained toolchain.

## Development scripts

Run from `client/`:

```bash
npm run dev          # Vite dev server
npm run typecheck    # tsc -b
npm run lint         # ESLint
npm run format       # Prettier (write)
npm test             # Vitest unit tests
npm run build        # production build
```

CI (typecheck + lint + test + build) runs on every push/PR via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Notes / limits

- Simulations have a 20s timeout; make sure your testbench ends with `$finish`.
- The schematic is an RTL-level view (after `proc; opt; memory -nomap`), which is
  the most readable. Enable `flatten` to merge module hierarchy.
