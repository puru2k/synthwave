# SynthWave

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
