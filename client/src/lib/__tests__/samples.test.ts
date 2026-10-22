import { describe, it, expect } from "vitest";
import { SAMPLES } from "../samples";
import { parseModules, findModule } from "../ports";

describe("SAMPLES library", () => {
  it("includes all standard and new sample categories", () => {
    const categories = new Set(SAMPLES.map((s) => s.category));
    expect(categories.has("Communication & Protocols")).toBe(true);
    expect(categories.has("Processor")).toBe(true);
    expect(categories.has("Arithmetic")).toBe(true);
  });

  it("contains UART and SPI starter templates with valid top modules", () => {
    const uart = SAMPLES.find((s) => s.name.includes("UART"))!;
    expect(uart).toBeDefined();
    const uartMods = parseModules([{ name: "design.v", content: uart.design }]);
    expect(findModule(uartMods, uart.top)).toBeDefined();

    const spi = SAMPLES.find((s) => s.name.includes("SPI"))!;
    expect(spi).toBeDefined();
    const spiMods = parseModules([{ name: "design.v", content: spi.design }]);
    expect(findModule(spiMods, spi.top)).toBeDefined();
  });

  it("contains RISC-V and Parameterized ALU templates with valid ports", () => {
    const riscv = SAMPLES.find((s) => s.name.includes("RISC-V"))!;
    expect(riscv).toBeDefined();
    const riscvMods = parseModules([{ name: "design.v", content: riscv.design }]);
    const topMod = findModule(riscvMods, riscv.top)!;
    expect(topMod).toBeDefined();
    expect(topMod.ports.some((p) => p.name === "alu_result")).toBe(true);
    expect(topMod.ports.some((p) => p.name === "branch_taken")).toBe(true);

    const alu = SAMPLES.find((s) => s.name.includes("Parameterized ALU"))!;
    expect(alu).toBeDefined();
    const aluMods = parseModules([{ name: "design.v", content: alu.design }]);
    const aluTop = findModule(aluMods, alu.top)!;
    expect(aluTop).toBeDefined();
    expect(aluTop.ports.some((p) => p.name === "carry")).toBe(true);
    expect(aluTop.ports.some((p) => p.name === "overflow")).toBe(true);
  });
});
