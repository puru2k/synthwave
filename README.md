# SynthWave

An in-browser IDE for writing, simulating, and synthesizing Verilog and SystemVerilog designs entirely on the client side using WebAssembly.

Live site: [https://puru2k.github.io/synthwave/](https://puru2k.github.io/synthwave/)

---

## Technical Overview

SynthWave runs the complete digital logic design flow in the browser without requiring local tool installations or a backend server.

- **Simulation**: Uses Icarus Verilog (`iverilog` and `vvp`) compiled to WebAssembly running inside background Web Workers. Designs are compiled with the testbench to generate Value Change Dump (`.vcd`) files.
- **Synthesis**: Runs Yosys via `@yowasp/yosys` (WebAssembly) in a Web Worker. Performs RTL elaboration, optimization, and technology mapping to either generic logic gates or SkyWater 130nm (`sky130`) standard cells, outputting netlist JSON.
- **Schematic Visualization**: Converts synthesized netlist JSON into interactive SVG circuit diagrams using NetlistSVG. Gates and flip-flops in the schematic link directly back to their source declarations.
- **Waveform Viewer**: Custom SVG timing diagram viewer that parses VCD output, supporting multi-bit bus radix switching (`hex`, `dec`, `bin`), edge search, time markers, and time-seeking from `$display` console logs.
- **State Machine Extraction**: Parses behavioral `always` blocks and `case`/`if-else` statements to extract and diagram Finite State Machine (FSM) states, transitions, and reset conditions.
- **Code Editor**: Monaco Editor configured with Verilog language support, keyword completion, symbol indexing across project files, and inline lint diagnostics.

---

## Codebase Architecture

```
synthwave/
├── client/
│   ├── public/
│   │   ├── wasm/               Compiled WebAssembly binaries (Icarus Verilog, Verilator)
│   │   └── favicon.svg         Digital clock waveform vector icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── CodeEditor.tsx      Monaco editor integration with syntax tokens & providers
│   │   │   ├── WaveformViewer.tsx  SVG timing diagram renderer and signal inspector
│   │   │   ├── Schematic.tsx       NetlistSVG interactive circuit schematic viewer
│   │   │   ├── FSMDiagram.tsx      Interactive SVG state machine transition graph
│   │   │   └── TestbenchDialog.tsx Port inspection and stimulus generator
│   │   ├── lib/
│   │   │   ├── clientSim.ts        WebAssembly simulation worker coordinator
│   │   │   ├── clientSynth.ts      WebAssembly Yosys runner and NetlistSVG interface
│   │   │   ├── vcd.ts              Streaming VCD format parser and signal value sampler
│   │   │   ├── verilogIndex.ts     Module, port, and wire indexer for autocompletion
│   │   │   ├── fsmSource.ts        AST parser for behavioral FSM extraction
│   │   │   ├── netlist.ts          Netlist JSON transformation helpers
│   │   │   └── themes.ts           Color token definitions (Night and Day themes)
│   │   ├── workers/            Dedicated Web Workers for sandboxed tool execution
│   │   ├── App.tsx             Root workspace coordinator, layout, and state management
│   │   └── styles.css          Design tokens and CSS rules
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

Run commands from the `client/` directory:

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
