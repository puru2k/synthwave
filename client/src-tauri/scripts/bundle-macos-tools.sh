#!/usr/bin/env bash
#
# Bundle the native EDA toolchain (Icarus Verilog, Yosys, Verilator) into the
# SynthWave desktop app so it runs WITHOUT Homebrew or any system install.
#
# Run this on a build machine that already has the tools installed (e.g. via
# `brew install icarus-verilog yosys verilator`). It:
#   1. copies the binaries + their data dirs into src-tauri/tools/<arch>/,
#   2. vendors the full non-system dylib closure into tools/<arch>/lib/,
#   3. relinks every Mach-O to @loader_path-relative paths (relocatable), and
#   4. re-signs ad-hoc (mandatory on Apple Silicon after patching load commands).
#
# The result is shipped as a Tauri resource (see tauri.conf.json) and resolved
# at runtime by src/tools.rs. Re-run whenever the toolchain is upgraded.
#
# Usage: scripts/bundle-macos-tools.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

case "$(uname -m)" in
  arm64)  ARCH_DIR="macos-arm64" ;;
  x86_64) ARCH_DIR="macos-x64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

DEST="$TAURI_DIR/tools/$ARCH_DIR"
echo "==> Bundling native tools into $DEST"

# ---- locate tools on the build machine -------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 1; }; }
need iverilog; need vvp; need yosys; need install_name_tool; need otool; need codesign

IVERILOG="$(command -v iverilog)"
VVP="$(command -v vvp)"
YOSYS="$(command -v yosys)"
YOSYS_ABC="$(command -v yosys-abc || true)"
VERILATOR_BIN="$(command -v verilator_bin || true)"

# Homebrew/MacPorts prefix derived from where iverilog lives (.../bin/iverilog).
PREFIX="$(cd "$(dirname "$IVERILOG")/.." && pwd)"
IVL_SRC="$PREFIX/lib/ivl"
YOSYS_SHARE="$(cd "$(dirname "$YOSYS")/.." && pwd)/share/yosys"

# ---- fresh dest tree --------------------------------------------------------
rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/lib"

copybin() { # copybin <src> -> tools/<arch>/bin/<name>, dereferencing symlinks
  local src="$1" name; name="$(basename "$src")"
  cp -L "$src" "$DEST/bin/$name"
  chmod u+w "$DEST/bin/$name"
  echo "    bin/$name"
}

echo "==> Copying binaries"
copybin "$IVERILOG"
copybin "$VVP"
copybin "$YOSYS"
[ -n "$YOSYS_ABC" ] && copybin "$YOSYS_ABC"
[ -n "$VERILATOR_BIN" ] && copybin "$VERILATOR_BIN"

echo "==> Copying data directories"
if [ -d "$IVL_SRC" ]; then
  # Follow symlinks: Homebrew's lib/ivl points into the Cellar.
  cp -RL "$IVL_SRC" "$DEST/lib/ivl"
  echo "    lib/ivl ($(du -sh "$DEST/lib/ivl" | cut -f1))"
else
  echo "    WARNING: iverilog data dir not found at $IVL_SRC" >&2
fi
if [ -d "$YOSYS_SHARE" ]; then
  mkdir -p "$DEST/share"
  cp -RL "$YOSYS_SHARE" "$DEST/share/yosys"
  echo "    share/yosys ($(du -sh "$DEST/share/yosys" | cut -f1))"
else
  echo "    WARNING: yosys share dir not found at $YOSYS_SHARE" >&2
fi
# Verilator data root (best-effort; strict lint only). Prune bulky examples.
if [ -n "$VERILATOR_BIN" ]; then
  VROOT_SRC="$(cd "$(dirname "$VERILATOR_BIN")/.." && pwd)/share/verilator"
  if [ -d "$VROOT_SRC" ]; then
    mkdir -p "$DEST/share/verilator"
    cp -RL "$VROOT_SRC/include" "$DEST/share/verilator/include" 2>/dev/null || true
    [ -f "$VROOT_SRC/verilator-config.cmake" ] && cp -L "$VROOT_SRC"/verilator-config*.cmake "$DEST/share/verilator/" 2>/dev/null || true
    echo "    share/verilator ($(du -sh "$DEST/share/verilator" 2>/dev/null | cut -f1))"
  fi
fi

# ---- vendor the non-system dylib closure -----------------------------------
# System libs (/usr/lib, /System/...) are guaranteed present on every Mac and
# must NOT be copied; only relocate /opt/homebrew (or other non-system) deps.
is_vendored_dep() {
  case "$1" in
    /usr/lib/*|/System/*|@*) return 1 ;;  # system or already-relative
    /*) return 0 ;;                       # absolute, non-system -> vendor it
    *) return 1 ;;
  esac
}

collect() { # recursively copy non-system dylib deps of <file> into lib/
  local f="$1" dep base
  while read -r dep; do
    is_vendored_dep "$dep" || continue
    base="$(basename "$dep")"
    if [ ! -f "$DEST/lib/$base" ]; then
      cp -L "$dep" "$DEST/lib/$base"
      chmod u+w "$DEST/lib/$base"
      echo "    lib/$base"
      collect "$DEST/lib/$base"
    fi
  done < <(otool -L "$f" | tail -n +2 | awk '{print $1}')
}

echo "==> Vendoring dylib closure"
for b in "$DEST"/bin/*; do collect "$b"; done

# ---- relink everything to @loader_path -------------------------------------
relink_binary() { # binaries live in bin/; their libs are at ../lib
  local f="$1" dep base
  while read -r dep; do
    is_vendored_dep "$dep" || continue
    base="$(basename "$dep")"
    install_name_tool -change "$dep" "@loader_path/../lib/$base" "$f"
  done < <(otool -L "$f" | tail -n +2 | awk '{print $1}')
  codesign --force --sign - "$f" >/dev/null 2>&1 || true
}

relink_lib() { # vendored libs sit next to each other in lib/
  local f="$1" base dep b
  base="$(basename "$f")"
  install_name_tool -id "@loader_path/$base" "$f"
  while read -r dep; do
    is_vendored_dep "$dep" || continue
    b="$(basename "$dep")"
    install_name_tool -change "$dep" "@loader_path/$b" "$f"
  done < <(otool -L "$f" | tail -n +2 | awk '{print $1}')
  codesign --force --sign - "$f" >/dev/null 2>&1 || true
}

echo "==> Relinking + re-signing"
for f in "$DEST"/lib/*.dylib; do [ -f "$f" ] && relink_lib "$f"; done
for b in "$DEST"/bin/*; do [ -f "$b" ] && relink_binary "$b"; done

echo "==> Done. Bundle size: $(du -sh "$DEST" | cut -f1)"
echo "    Tools: $(ls "$DEST/bin" | tr '\n' ' ')"
