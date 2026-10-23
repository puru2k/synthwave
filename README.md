# SynthWave

> SynthWave is a lightweight, modern web-based IDE for digital logic design, simulation, and synthesis. It runs a full Verilog EDA toolchain directly in your browser using WebAssembly without requiring any installation or backend.

**Live Web App:** [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/)

SynthWave provides a single in-browser workspace to write, lint, simulate, and synthesize Verilog and SystemVerilog designs. Write code and immediately inspect VCD waveforms, gate-level schematics, FSM state diagrams, and logic utilization reports.

---

## Features

### Modern Responsive Design System
- **Uniform Geometry:** Strict 7px corner curvature, standardized button heights, consistent hover/active feedback, and zero emoji clutter.
- **Adaptive Responsive Layout:** Scales cleanly from high-resolution desktop monitors down to mobile screens. On viewports below 820px, an inline segmented control (`Code` | `Output`) provides full-screen access to either editor or output views without cramped splits.
- **High-Contrast Themes:** Fully tuned Night and Day (light) themes with WCAG-compliant syntax contrast, clear line numbers, and readable timing bus labels.

### Code Editor & Workspace
- **Monaco Editor Integration:** Verilog and SystemVerilog syntax highlighting with intelligent auto-completion and auto-closing pairs.
- **Multi-File Projects:** Tabbed workspace supporting multi-file designs, drag-and-drop tab ordering, inline file renaming, file uploads, and full-project ZIP exports.
- **Keyboard Shortcuts:** Quick execution modal (`Ctrl+Enter` to simulate, `Ctrl+Shift+Enter` to synthesize, `Alt+Shift+F` to format).

### Simulation & Interactive Waveform Viewer
- **Client-Side Icarus Verilog:** Compiles and executes testbenches entirely in-browser using WebAssembly inside dedicated Web Workers.
- **VCD Waveform Viewer:** Signal search and filtering, multi-scale zoom (`In`, `Out`, `Fit`), cursor value tracking, bus radix switching (`hex`, `dec`, `bin`), and edge transition detection.
- **Interactive Time Seeking:** Clicking `$display` timestamp lines in the simulation log automatically jumps the waveform cursor to that exact simulation moment.
- **Automatic Testbench Generator:** Visual dialog to inspect design ports and automatically synthesize customizable testbenches with clock, reset, and stimulus drivers.

### Circuit Synthesis & Schematic Viewer
- **RTL & Gate-Level Synthesis:** Powered by YoWASP Yosys running inside WebAssembly with support for RTL elaboration and gate-level mapping.
- **Standard-Cell Library Support:** Gate-level synthesis supports Generic logic gates, SkyWater 130nm (`sky130`), or uploaded Liberty (`.lib`) cell libraries.
- **Interactive Schematic Diagram:** Vector rendering via NetlistSVG with pan, zoom-to-fit, reset zoom, and one-click SVG exports.
- **Cell-to-Source Cross-Highlighting:** Clicking a cell in the schematic diagram automatically jumps to and highlights the corresponding line in your Verilog source code.
- **Hierarchy Navigation:** Inspect natural module instantiation hierarchies and selectively flatten submodules.

### FSM State Machine Visualization
- **Automated FSM Extraction:** Analyzes behavioral `case` and `if-else` state transitions directly from source or synthesized netlists.
- **Interactive State Graph:** Visualizes states, transitions, reset conditions, and conditions for both Moore and Mealy machines.

### Built-in Starters & Templates
Includes ready-to-run modules and testbenches:
- **Sequential Logic:** 4-Bit Counter, Dual-Edge Detector, Shift Register.
- **State Machines:** Traffic Light Controller, Moore/Mealy sequence detectors.
- **Datapaths & Compute:** Arithmetic Logic Unit (ALU).
- **Communication Protocols:** UART Transmitter/Receiver, SPI Master.
- **Microarchitecture:** 5-Stage Pipelined RISC-V CPU Core.

---

## Architecture

SynthWave runs 100% in the browser. Execution engines run client-side inside Web Workers and feed raw tool outputs (VCD, netlist JSON, logs) into unified TypeScript parsing and visualization pipelines:

```
synthwave/
├── client/                     Vite + React 18 + TypeScript
│   ├── src/
│   │   ├── components/         Monaco Editor, WaveformViewer, Schematic, FSMDiagram, TestbenchDialog
│   │   ├── lib/
│   │   │   ├── api.ts          In-browser API and runner dispatcher
│   │   │   ├── clientSim.ts    WebAssembly Icarus & Verilator runner
│   │   │   ├── clientSynth.ts  WebAssembly Yosys runner + NetlistSVG integration
│   │   │   ├── format.ts       Verilog formatter & indentation engine
│   │   │   ├── fsmSource.ts    AST-based FSM state & transition extractor
│   │   │   ├── netlist.ts      Netlist JSON transform & schematic layout
│   │   │   ├── vcd.ts          VCD parser & digital timing analyzer
│   │   │   └── tbgen.ts        Automated testbench generator
│   │   └── workers/            Web Workers for background wasm execution
│   └── public/wasm/            WebAssembly binaries (Icarus, Verilator)
```

---

## Getting Started

### Prerequisites

- Any modern web browser (Chrome, Edge, Firefox, Safari).
- Node.js (v18 or higher) and npm (only for local development).

### Installation & Local Dev

```bash
# Clone the repository
git clone https://github.com/puru2k/synthwave.git
cd synthwave/client

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Verification & Testing

The client includes full unit test suites for the VCD parser, FSM extractor, Verilog formatter, port analyzer, and testbench generator:

```bash
cd client

# Run Vitest test suite
npm test

# Linting check
npm run lint

# Production build
npm run build
```

---

## Deployment

A GitHub Actions workflow at `.github/workflows/deploy.yml` automatically builds and deploys changes pushed to `main` directly to GitHub Pages at [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/).

---

## License

MIT License. See [LICENSE](LICENSE) for details.
