# SynthWave

> ⚠️ **Work in progress** — SynthWave is still in active development. Features may change, and you may run into bugs or incomplete functionality. Feedback and bug reports are very welcome!

A web app to **write Verilog**, **simulate it with waveforms**, and **see what it synthesizes into** — runs fully in the browser (WebAssembly), so it can be hosted as a free static site.

- ✍️ Monaco-based editor with Verilog syntax highlighting (design + testbench)
- 📈 Simulation with [Icarus Verilog](http://iverilog.icarus.com/) → interactive VCD waveform viewer
- ⚙️ Synthesis with [Yosys](https://yosyshq.net/yosys/) → rendered circuit schematic (via netlistsvg)

## Architecture

```
client/   Vite + React + TypeScript frontend (editor, waveform viewer, schematic)
server/   Express backend that shells out to iverilog / vvp / yosys
```

The frontend talks to the backend over `/api`. In dev, Vite proxies `/api` to the
server on port 4000.

## Prerequisites

These command-line tools must be installed and on your `PATH`:

```bash
brew install node icarus-verilog yosys
```

- `iverilog`, `vvp` — compile and run simulations
- `yosys` — synthesis

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

### Easiest: build all three in CI

The [`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) workflow
builds macOS (Apple Silicon), Windows x64, and Linux x64 installers on their
native GitHub runners — no local toolchain needed. Trigger it from the repo's
**Actions** tab (**Desktop apps → Run workflow**), then download the installers
from the run's **Artifacts**. Pushing a tag like `v0.1.0` also attaches them to a
GitHub Release. The per-platform manual builds below do the same thing locally.

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

### Windows (x64)

The tools are sourced from the relocatable [OSS CAD Suite](https://github.com/YosysHQ/oss-cad-suite-build).

```powershell
# prerequisites: Rust (stable, MSVC), Node.js, and the WebView2 runtime (preinstalled on Win11)
npm install
npm run app:build:win      # downloads OSS CAD Suite, bundles tools/windows-x64, builds the installer
```

The bundling step downloads the latest OSS CAD Suite automatically; to use a copy
you already have, run the script directly with a path:

```powershell
powershell -ExecutionPolicy Bypass -File src-tauri/scripts/bundle-windows-tools.ps1 -OssCadSuite C:\oss-cad-suite
npm run app:build
```

Output: `src-tauri/target/release/bundle/nsis/SynthWave_0.1.0_x64-setup.exe`. The
installer embeds the WebView2 offline bootstrapper, so the result is fully
self-contained.

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
automatically — the Linux analog of WebView2 on Windows.

> The Linux build follows GNOME/Yaru conventions (Ubuntu/Cantarell type, Adwaita
> rounding, Ubuntu-orange focus accent) with native window decorations. Windows
> uses a Windows 11 Fluent theme; macOS uses an overlay title bar with vibrancy.
> All three share the same feature set and the same self-contained toolchain.

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
