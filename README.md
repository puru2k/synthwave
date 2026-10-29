# SynthWave

An in-browser IDE for writing, simulating, and synthesizing Verilog and SystemVerilog designs entirely on the client side using WebAssembly.

Live site: [https://puru2k.github.io/synthwave/](https://puru2k.github.io/synthwave/)

---

## Technical Overview

SynthWave runs the complete digital logic design and verification flow inside the web browser without requiring backend servers or local tool installations.

- **In-Browser Simulation**: Executes Icarus Verilog (`ivlpp`, `ivl`, `vvp` compiled to WebAssembly with VPI support) inside background Web Workers. Compiles HDL designs and testbenches to produce Value Change Dump (`.vcd`) files, while capturing runtime console output and testbench file operations (`$fopen`, `$fwrite`, `$writememh`).
- **RTL & Gate-Level Synthesis**: Runs YoWASP Yosys (`@yowasp/yosys` WebAssembly) in dedicated workers. Performs RTL elaboration, logic optimization, technology mapping to generic logic gates or SkyWater 130nm (`sky130`) standard cells, and generates synthesis netlist JSON.
- **Circuit Schematic Visualization**: Transforms synthesized netlist JSON into interactive SVG circuit diagrams using NetlistSVG with the ELK layout engine. Gates, flip-flops, and hierarchies in the diagram link directly back to their HDL source definitions.
- **Waveform Viewer**: Custom SVG timing diagram viewer parsing VCD streams client-side. Supports multi-bit bus radix switching (`hex`, `dec`, `bin`), transition edge navigation, time delta measurement markers, and time-seeking linked to `$display` timestamps in the console.
- **Dual-Engine Linting**: Provides live syntax diagnostics through Icarus Verilog and strict verification through WebAssembly-compiled Verilator (`verilator_bin`), surfacing errors, bit-width mismatches, and style warnings directly on Monaco editor line gutters.
- **Finite State Machine (FSM) Extraction**: Extracts state registers, transitions, inputs, outputs, and reset states directly from behavioral HDL AST, diagramming Moore and Mealy machines in interactive vector graphs.
- **Synthesis Reports**: Analyzes gate-level netlists against Liberty standard-cell models to compute total silicon area, rough critical path delay estimates, and cell utilization breakdowns.
- **Offline Caching & Toolchain Prefetching**: Uses browser Cache API and Service Workers (`sw.js`) to download WebAssembly toolchains on first use and store them persistently for offline execution.
- **Client Workspace**: Manages multi-file and multi-project workspaces with local persistence via `localStorage`, ZIP project bundle export, and URL compression for project sharing.

---

## Codebase Architecture

```
synthwave/
├── package.json                Root workspace helper scripts
├── .gitignore                  Repository ignore rules
├── client/
│   ├── public/
│   │   ├── wasm/               WebAssembly binaries (Icarus Verilog, Verilator, Yosys)
│   │   ├── favicon.svg         Digital clock waveform vector icon
│   │   ├── manifest.webmanifest Web application manifest
│   │   └── sw.js               Service Worker for offline toolchain caching
│   ├── src/
│   │   ├── components/
│   │   │   ├── CodeEditor.tsx      Monaco editor integration with syntax tokens & providers
│   │   │   ├── WaveformViewer.tsx  SVG timing diagram renderer and signal inspector
│   │   │   ├── Schematic.tsx       NetlistSVG interactive circuit schematic viewer
│   │   │   ├── SynthReports.tsx    Area, delay, and cell utilization report inspector
│   │   │   ├── FSMDiagram.tsx      Interactive SVG state machine transition graph
│   │   │   ├── TestbenchDialog.tsx Module port inspection and testbench stimulus generator
│   │   │   ├── Icons.tsx           Vector icon library with digital clock waveform logo
│   │   │   └── ErrorBoundary.tsx   React component error boundary
│   │   ├── lib/
│   │   │   ├── clientSim.ts        WebAssembly simulation worker coordinator
│   │   │   ├── clientSynth.ts      WebAssembly Yosys runner and NetlistSVG interface
│   │   │   ├── vcd.ts              Streaming VCD format parser and signal value sampler
│   │   │   ├── verilogIndex.ts     Module, port, and wire indexer for autocompletion
│   │   │   ├── fsmSource.ts        Source-level AST parser for behavioral FSM extraction
│   │   │   ├── netlist.ts          Netlist JSON transformation helpers and cell stats
│   │   │   ├── workspace.ts        Multi-project workspace management & localStorage persistence
│   │   │   ├── toolchain.ts        Progress reporting, Cache API warming, and SW registration
│   │   │   ├── api.ts              Shared TypeScript data structures and response types
│   │   │   ├── themes.ts           High-contrast color token definitions (Day and Night)
│   │   │   ├── zip.ts              In-memory ZIP archive builder for project exports
│   │   │   └── share.ts            URL project encoding and compression
│   │   ├── workers/
│   │   │   ├── iverilogWorker.ts   Web Worker running in-browser Icarus Verilog
│   │   │   ├── verilatorWorker.ts  Web Worker running in-browser Verilator strict lint
│   │   │   └── yosysWorker.ts      Web Worker running in-browser YoWASP Yosys
│   │   ├── App.tsx             Root workspace coordinator, responsive layout, and state management
│   │   └── styles.css          Design tokens, UI geometry, and responsive CSS rules
│   └── package.json            Client dependencies and scripts
└── .github/workflows/
    ├── ci.yml                  Typecheck, lint, test, and build validation
    └── deploy.yml              GitHub Pages build and deployment workflow
```

---

## Local Development

### Prerequisites

- Node.js (v18 or higher)
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/puru2k/synthwave.git
cd synthwave/client

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be accessible at `http://localhost:5173/`.

---

## Scripts

Run commands from the `client/` directory (or use `npm run <command>` from the repository root):

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite local development server with hot module replacement |
| `npm run build` | Compile TypeScript and bundle production assets into `dist/` |
| `npm test` | Run Vitest unit tests (VCD parser, FSM extractor, port indexer) |
| `npm run lint` | Run ESLint across TypeScript and TSX source files |
| `npm run typecheck` | Run `tsc -b` to validate TypeScript types without emitting files |

---

## Deployment

The application is deployed as a static site to GitHub Pages.

Every commit pushed to the `main` branch triggers `.github/workflows/deploy.yml`, which:
1. Runs a clean install (`npm ci`)
2. Verifies types and builds production assets (`npm run build`) with base path `/synthwave/`
3. Publishes the output directory (`client/dist`) to GitHub Pages
