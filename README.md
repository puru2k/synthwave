# SynthWave

> ⚠️ **Work in progress** — SynthWave is a hobby/test project, still in active development. Features may change, and you may run into bugs or incomplete functionality. Feedback and bug reports are very welcome!

SynthWave is a hobby/test project: a **one-stop spot to quickly lint, simulate,
and synthesize** small Verilog/SystemVerilog snippets, without spinning up a full
EDA toolchain locally. You **write** code and get VCD waveforms, schematics, FSM
diagrams, and timing/area/power reports right away. It runs the same feature set
three ways: fully in the browser (WebAssembly), against a local Node server, or as
a self-contained native desktop app with the toolchain bundled in.

- ✍️ Monaco-based editor with Verilog syntax highlighting, multi-file/multi-project
  workspaces, cross-highlighting between the schematic and source, and toggleable
  smart suggestions (autocomplete) in the menu.
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

## Dependencies (full reference)

Everything below is what the project is built from. Exact pinned versions live in
the lockfiles (`package-lock.json`, `client/src-tauri/Cargo.lock`); the tables
list the direct dependencies and their purpose so you can reproduce or fork the
project. The GitHub workflows in [`.github/workflows/`](.github/workflows/) are
the canonical, always-up-to-date recipe — [`ci.yml`](.github/workflows/ci.yml)
(lint/test/build), [`deploy.yml`](.github/workflows/deploy.yml) (static site),
and [`desktop.yml`](.github/workflows/desktop.yml) (macOS + Linux installers).

### Build toolchains (install once)

| Tool | Version | Needed for |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | **24.x** | frontend + server (all builds) |
| [npm](https://www.npmjs.com/) | bundled with Node | dependency install / scripts |
| [Rust](https://www.rust-lang.org/) (stable, incl. Cargo) | **≥ 1.77.2** | desktop app only (Tauri backend) |
| [Tauri CLI](https://tauri.app/) | 2.x (via `@tauri-apps/cli`, installed by npm) | desktop app only |

### EDA toolchain (native binaries)

Used directly by the local **Server** engine, and **bundled into** the desktop
app by the `bundle:tools:*` scripts. Not needed for the in-browser web app.

| Package | Provides | macOS (Homebrew) | Linux (apt) |
| --- | --- | --- | --- |
| [Icarus Verilog](http://iverilog.icarus.com/) | `iverilog`, `vvp` — compile + run simulations | `icarus-verilog` | `iverilog` |
| [Yosys](https://yosyshq.net/yosys/) | `yosys` — synthesis | `yosys` | `yosys` |
| `yosys-abc` | ABC backend for gate-level synthesis | (bundled with `yosys`) | `yosys-abc` |
| [Verilator](https://www.veripool.org/verilator/) | `verilator` — strict lint | `verilator` | `verilator` |
| [patchelf](https://github.com/NixOS/patchelf) | relinks bundled `.so` closure (Linux packaging) | — | `patchelf` |

```bash
# macOS
brew install node rust icarus-verilog yosys verilator
# Linux (Ubuntu/Debian)
sudo apt-get install -y iverilog yosys yosys-abc verilator patchelf
```

### WebAssembly toolchain (in-browser engine)

Lets the app simulate/lint/synthesize with **no install**. The Icarus and
Verilator builds are prebuilt and vendored in
[`client/public/wasm/`](client/public/wasm/) (committed to the repo); Yosys is
[YoWASP](https://yowasp.org/) via the `@yowasp/yosys` npm package.

| Component | Source | Size |
| --- | --- | --- |
| Icarus Verilog (wasm) | vendored in `client/public/wasm/iverilog/` | ~10 MB |
| Verilator (wasm) | vendored in `client/public/wasm/verilator/` | ~7 MB |
| Yosys (wasm) | [`@yowasp/yosys`](https://www.npmjs.com/package/@yowasp/yosys) | ~50 MB (lazy) |

### Frontend (`client/`, npm)

- **Runtime:** [`react`](https://react.dev/) + `react-dom` 18, [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) (code editor), [`netlistsvg`](https://github.com/nturley/netlistsvg) (schematic rendering), [`@yowasp/yosys`](https://www.npmjs.com/package/@yowasp/yosys) (wasm synthesis), [`@tauri-apps/api`](https://tauri.app/) (desktop bridge).
- **Build/dev:** [`vite`](https://vitejs.dev/) 5 + `@vitejs/plugin-react`, [`typescript`](https://www.typescriptlang.org/) 5, [`@tauri-apps/cli`](https://tauri.app/) 2.
- **Quality:** [`eslint`](https://eslint.org/) 9 (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`), [`prettier`](https://prettier.io/) 3, [`vitest`](https://vitest.dev/) 2.

### Server (`server/`, npm)

Only used by the local Server engine: [`express`](https://expressjs.com/) 4,
[`cors`](https://www.npmjs.com/package/cors), and `netlistsvg`. The repo root uses
[`concurrently`](https://www.npmjs.com/package/concurrently) to run client + server
together in dev.

### Desktop backend (`client/src-tauri/`, Cargo)

[`tauri`](https://tauri.app/) 2.11 (+ `tauri-build`, `tauri-plugin-log`),
[`serde`](https://serde.rs/) / `serde_json`, [`log`](https://docs.rs/log/),
[`tempfile`](https://docs.rs/tempfile/) (per-run scratch dirs), and
[`wait-timeout`](https://docs.rs/wait-timeout/) (kill runaway tool processes).

### Linux desktop system libraries

Tauri links against the system WebKitGTK webview at build time, so a Linux desktop
build additionally needs (see [`desktop.yml`](.github/workflows/desktop.yml)):

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libssl-dev build-essential \
  curl wget file libfuse2t64      # libfuse2t64 = AppImage runtime (24.04+)
```

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
