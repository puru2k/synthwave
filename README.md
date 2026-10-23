# SynthWave

> **Work in progress** — SynthWave is a lightweight, modern web-based IDE for digital logic design, simulation, and synthesis. It runs a full Verilog EDA toolchain directly in your browser without requiring local installation.

**Live Web App:** [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/) — runs the full EDA toolchain client-side in your browser with zero installation needed.

SynthWave provides a single workspace to write, lint, simulate, and synthesize Verilog and SystemVerilog designs. Write code and immediately inspect VCD waveforms, gate-level schematics, FSM state diagrams, and logic utilization reports.

SynthWave runs across three flexible environments:
1. **In-Browser (WebAssembly):** Zero install, zero server overhead, runs client-side inside Web Workers and caches offline via Service Worker.
2. **Local Server (Node/Express):** High-performance execution leveraging system-installed EDA binaries (`iverilog`, `vvp`, `yosys`, `verilator`).
3. **Desktop App (Tauri/Rust):** Cross-platform standalone desktop binary with the toolchain bundled internally.

---

## Features

### Modern Material You Design & Responsive Layout
- **Material 3 UI Philosophy:** Clean pill geometry, smooth elevation surfaces, tactile hover and active states, and zero emoji clutter.
- **Adaptive Responsive Design:** Seamlessly scales from 4K desktop screens down to mobile viewports. On mobile screens (<768px), an inline segmented pill switcher (`Code` | `Output`) provides full-screen access to both the editor and output tools without cramped vertical splits.
- **No Text Overflow:** Defensively structured flex containers with auto-collapsing hints and labels ensure zero toolbar clipping across screen sizes.

### Code Editor & Workspace
- **Monaco Editor Integration:** Full syntax highlighting for Verilog and SystemVerilog.
- **Code Formatting:** One-click automated code reindentation and formatting (`Format` button or `Alt+Shift+F`).
- **HDL Snippet Library:** Built-in template generator for modules, D flip-flops, Moore/Mealy state machines, clock generators, and testbenches.
- **IntelliSense & Suggestions:** Keyword completion, signal snippets, and jump-to-definition.
- **Multi-File Projects:** Tabbed workspace supporting drag-and-drop tab reordering, inline file renaming, file uploads, and full-project ZIP exports.
- **Keyboard Shortcuts:** Built-in modal cheat sheet (`Ctrl+Enter` to simulate, `Ctrl+Shift+Enter` to synthesize, `Alt+Shift+F` to format).

### Simulation & Interactive Waveform Viewer
- **Icarus Verilog Simulation:** Compiles and executes designs against testbenches in seconds.
- **VCD Waveform Viewer:** Signal search and filtering, multi-scale zoom (`In`, `Out`, `Fit`), cursor value tracking, and transition detection.
- **Interactive Time Seeking:** Clicking `$display` timestamp lines in the simulation log automatically jumps the waveform cursor to that exact simulation moment.
- **Automatic Testbench Generator:** Visual dialog to inspect design ports and automatically synthesize customizable testbenches with clock, reset, and stimulus drivers.

### Circuit Synthesis & Schematic Viewer
- **RTL & Gate-Level Synthesis:** Powered by Yosys with support for RTL elaboration and gate-level mapping.
- **Standard-Cell Library Support:** Gate-level synthesis supports Generic logic gates, SkyWater 130nm (`sky130`), or uploaded Liberty (`.lib`) cell libraries.
- **Interactive Schematic Diagram:** Vector rendering via NetlistSVG with pan, zoom-to-fit, reset zoom, and one-click SVG/PNG exports.
- **Cell-to-Source Cross-Highlighting:** Clicking a cell in the schematic diagram automatically jumps to and highlights the corresponding line in your Verilog source code.
- **Hierarchy Navigation:** Inspect natural module instantiation hierarchies and selectively flatten submodules.

### FSM State Machine Visualization
- **Automated FSM Extraction:** Analyzes behavioral `case` and `if-else` state transitions directly from source or synthesized netlists.
- **Interactive State Graph:** Visualizes states, transitions, reset conditions, and conditions for both Moore and Mealy machines.

### Starter Templates & Protocols
Includes ready-to-run modules and testbenches:
- **Sequential Logic:** 4-Bit Counter, Dual-Edge Detector, Shift Register.
- **State Machines:** Traffic Light Controller, Moore/Mealy sequence detectors.
- **Datapaths & Compute:** Arithmetic Logic Unit (ALU).
- **Communication Protocols:** UART Transmitter/Receiver, SPI Master.
- **Microarchitecture:** 5-Stage Pipelined RISC-V CPU Core.

---

## Architecture

SynthWave uses a decoupled architecture where interchangeable execution engines feed raw tool output (VCD, netlist JSON, logs) into unified TypeScript parsing and visualization pipelines:

```
synthwave/
├── client/                     Vite + React 18 + TypeScript
│   ├── src/
│   │   ├── components/         Monaco Editor, WaveformViewer, Schematic, FSMDiagram, TestbenchDialog
│   │   ├── lib/
│   │   │   ├── api.ts          Engine router (wasm vs server vs native)
│   │   │   ├── clientSim.ts    WebAssembly Icarus & Verilator runner
│   │   │   ├── clientSynth.ts  WebAssembly Yosys runner + NetlistSVG integration
│   │   │   ├── format.ts       Verilog formatter & indentation engine
│   │   │   ├── fsmSource.ts    AST-based FSM state & transition extractor
│   │   │   ├── netlist.ts      Netlist JSON transform & schematic layout
│   │   │   ├── vcd.ts          VCD parser & digital timing analyzer
│   │   │   └── tbgen.ts        Automated testbench generator
│   │   └── workers/            Web Workers for background wasm execution
│   └── public/wasm/            Vendored WebAssembly binaries (Icarus, Verilator)
├── server/                     Express backend for local system CLI tools
└── client/src-tauri/           Rust backend for native desktop app bundling
```

### Execution Engines

| Engine | Environment | Execution Mechanism |
| --- | --- | --- |
| **In-Browser (Wasm)** | Web / Static Hosting | WebAssembly builds of Icarus, Verilator, and Yosys running inside Web Workers. |
| **Server** | Local Development | Express server invoking host CLI binaries (`iverilog`, `vvp`, `yosys`, `verilator`). |
| **Native Desktop** | Desktop (macOS / Linux) | Rust (Tauri) invoking self-contained, pre-bundled toolchain binaries. |

---

## Getting Started

### Prerequisites

- **Web version:** No prerequisites required. Open in any modern web browser.
- **Local development:** Node.js (v18 or higher) and npm.
- **Optional CLI tools (for Server engine):** `iverilog`, `yosys`, `verilator`.

### Installation & Local Dev

Clone the repository and install dependencies:

```bash
git clone https://github.com/puru2k/synthwave.git
cd synthwave

# Install dependencies across root, server, and client
npm install
npm run install:all

# Start local development server (Client on :5173, Server on :4000)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Running Client Only (Static Mode)

If you only want to run the frontend with the in-browser WebAssembly engine:

```bash
cd client
npm install
npm run dev
```

---

## Verification & Testing

The client includes unit tests for the VCD parser, FSM extractor, Verilog formatter, port analyzer, and testbench generator:

```bash
cd client

# Run Vitest test suite
npm test

# Type-check TypeScript codebase
npm run typecheck

# Production build
npm run build
```

---

## Deployment

### GitHub Pages (Automated via GitHub Actions)
A workflow at `.github/workflows/deploy.yml` automatically triggers on pushes to `main`. It builds the client with the appropriate sub-path configuration and publishes it to [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/).

---

## Desktop Application

SynthWave can be packaged as a standalone desktop app using [Tauri](https://tauri.app/):

```bash
cd client

# Build for macOS (Apple Silicon)
npm run app:build:mac

# Build for Linux (x64)
npm run app:build:linux
```

Automated multi-platform desktop installers (`.dmg`, `.deb`, `.AppImage`) are also built via `.github/workflows/desktop.yml`.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
