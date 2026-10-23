# SynthWave

[![CI](https://github.com/puru2k/synthwave/actions/workflows/ci.yml/badge.svg)](https://github.com/puru2k/synthwave/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/puru2k/synthwave/actions/workflows/deploy.yml/badge.svg)](https://github.com/puru2k/synthwave/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: WebAssembly](https://img.shields.io/badge/Engine-WebAssembly-654ff0.svg)](https://webassembly.org/)

SynthWave is a lightweight, modern web-based IDE for digital logic design, simulation, and synthesis. It packages a full electronic design automation (EDA) toolchain directly inside the browser using WebAssembly—delivering instant, zero-install HDL verification on any desktop or mobile device.

**Live Application:** [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/)

---

## Overview

Traditional digital design toolchains require complex multi-gigabyte local installations of simulators, synthesis tools, and waveform viewers. SynthWave eliminates this barrier by running the entire toolchain client-side in the browser:

- **Simulation**: Compiled directly in-browser using WebAssembly-ported Icarus Verilog (`iverilog` / `vvp`).
- **Synthesis**: RTL elaboration and technology mapping powered by YoWASP Yosys in WebAssembly.
- **Timing Analysis**: Real-time VCD waveform rendering with bus inspection, edge navigation, and time markers.
- **Schematic Visualization**: Dynamic vector circuit schematics rendered with NetlistSVG, linked interactively to the Verilog source code.
- **State Machine Extraction**: Automated state graph generation from behavioral HDL statements.

---

## Features

### Web-First Responsive User Interface
- **Uniform Geometry**: Cohesive design system built around strict 7px corner radii, standardized button heights, consistent hover/active feedback, and zero emoji clutter.
- **Adaptive Viewports**: Seamlessly scales from 4K desktop workstations down to mobile screens. On displays below 820px, an inline segmented control (`Code` | `Output`) provides full-screen access to either editor or output tools without cramped split views.
- **High-Contrast Themes**: Tuned Night and Day (light) themes with WCAG-compliant syntax contrast, clear gutter line numbers, and readable dark-slate bus labels.
- **Keyboard-Driven Workflow**: Centered modal overlay (`?` or `Ctrl+/`) detailing shortcuts for simulation (`Ctrl+Enter`), synthesis (`Ctrl+Shift+Enter`), linting (`Ctrl+L`), project saving (`Ctrl+S`), and sidebar toggling (`Ctrl+B`).

### Code Editor & Workspace
- **Monaco Editor Integration**: Full syntax highlighting for Verilog and SystemVerilog with bracket matching and auto-closing pairs.
- **IntelliSense & Autocomplete**: Keyword completion, signal snippets, and instant module signature hints.
- **Multi-File Project Management**: Tabbed editor supporting multi-file designs, drag-and-drop tab reordering, inline file renaming, file uploads, and full-project ZIP exports.
- **URL Project Sharing**: One-click generation of shareable, compressed URLs encoding complete multi-file HDL designs.

### In-Browser Simulation & Waveform Viewer
- **Client-Side Icarus Verilog**: Fast simulation executed inside dedicated Web Workers, preventing UI freezes during intensive test runs.
- **Interactive VCD Waveforms**:
  - Multi-scale zooming (`In`, `Out`, `Fit`).
  - Dynamic signal search and hierarchy filtering.
  - Value radix switching per signal (`hex`, `dec`, `bin`).
  - Edge navigation (jump to previous/next transition).
  - Time cursors and delta measurement markers.
- **Log-to-Waveform Time Seeking**: Clicking any `$display` timestamp in the console output automatically positions the waveform cursor at that exact simulation moment.
- **Automated Testbench Generator**: Visual dialog that inspects module ports and generates clocked, stimulus-driven testbench templates automatically.

### RTL & Gate-Level Synthesis
- **YoWASP Yosys Engine**: Executes standard synthesis passes (`synth`, `dfflegalize`, `abc`) directly in client Web Workers.
- **Standard-Cell Library Mapping**:
  - Generic logic gates (AND, OR, XOR, NOT, MUX, DFF).
  - SkyWater 130nm Open-Source PDK (`sky130`).
  - Upload custom Liberty (`.lib`) timing and cell libraries.
- **Interactive Vector Schematics**: Rendered via NetlistSVG with pan, zoom-to-fit, reset zoom, and SVG export.
- **Cell-to-Source Cross-Highlighting**: Clicking any synthesized gate or flip-flop in the schematic highlights its corresponding declaration in your Verilog source.
- **Hierarchy Explorer**: Visual module instantiation tree with support for selective submodule flattening.

### Finite State Machine (FSM) Visualization
- **Automated State Extraction**: Analyzes behavioral state registers, transitions, and reset conditions directly from AST source structures and netlists.
- **Interactive Graph**: Renders states and directed transition conditions for both Moore and Mealy state machines.

### Built-in Example Designs
Ready-to-run HDL projects covering sequential logic, state machines, communication protocols, and processors:
- **Sequential Circuits**: 4-Bit Up-Counter with Async Reset, Dual-Edge Detector, Shift Register.
- **State Machines**: Traffic Light Controller, Sequence Detectors.
- **Datapaths & Compute**: Arithmetic Logic Unit (ALU).
- **Communication Protocols**: UART Transmitter/Receiver with Baud Rate Generator, SPI Master.
- **Microarchitecture**: 5-Stage Pipelined RISC-V CPU Core.

---

## Technical Architecture

SynthWave is architected as a fully static web application. Compute-heavy operations run asynchronously in background Web Workers, keeping the main thread responsive at 60 FPS:

```
synthwave/
├── client/                     Vite + React 18 + TypeScript frontend
│   ├── public/
│   │   ├── wasm/               Pre-compiled WebAssembly toolchains (Icarus, Verilator)
│   │   └── favicon.svg         Digital clock waveform vector brand mark
│   └── src/
│       ├── components/         Monaco Editor, WaveformViewer, Schematic, FSM, Dialogs
│       ├── lib/
│       │   ├── api.ts          Client runner dispatcher
│       │   ├── clientSim.ts    WebAssembly simulation coordinator
│       │   ├── clientSynth.ts  WebAssembly Yosys synthesis & NetlistSVG integration
│       │   ├── fsmSource.ts    AST-based FSM state & transition extractor
│       │   ├── netlist.ts      Netlist JSON transform & schematic layout
│       │   ├── vcd.ts          Fast VCD parser & digital timing analyzer
│       │   ├── tbgen.ts        Automated testbench generator
│       │   └── themes.ts       High-contrast theme system (Night & Day palettes)
│       └── workers/            Dedicated Web Workers for background wasm execution
├── .github/workflows/
│   ├── ci.yml                  Continuous integration (typecheck, lint, test, build)
│   └── deploy.yml              Automated deployment to GitHub Pages
└── package.json                Root workspace scripts
```

---

## Getting Started

### Online
No installation required. Access the application directly at [puru2k.github.io/synthwave](https://puru2k.github.io/synthwave/).

### Local Development

#### Prerequisites
- Node.js (version 18 or higher)
- npm

#### Setup & Execution

```bash
# Clone the repository
git clone https://github.com/puru2k/synthwave.git
cd synthwave

# Install dependencies in the client
npm install --prefix client

# Launch local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Testing & Verification

SynthWave maintains automated unit test suites covering the VCD parser, FSM extractor, port analyzer, testbench generator, and sample designs:

```bash
cd client

# Run Vitest unit tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint validation
npm run lint

# Compile production bundle
npm run build
```

---

## Deployment

Pushes to the `main` branch trigger `.github/workflows/deploy.yml`, which runs verification tests, compiles the production client bundle with appropriate base path configuration, and deploys it automatically to GitHub Pages.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
