#!/usr/bin/env bash
#
# Bundle the native EDA toolchain (Icarus Verilog, Yosys, Verilator) into the
# SynthWave Linux app so it runs WITHOUT any system EDA install.
#
# Run on an Ubuntu/Debian build machine that has the tools installed:
#   sudo apt-get install -y iverilog yosys verilator patchelf
#
# It:
#   1. copies the binaries + their data dirs into src-tauri/tools/<arch>/,
#   2. vendors the non-system shared-object (.so) closure into tools/<arch>/lib/
#      via ldd, and
#   3. rewrites each ELF's RPATH to $ORIGIN-relative paths so it's relocatable.
#
# The result is shipped as a Tauri resource (see tauri.linux.conf.json) and
# resolved at runtime by src/tools.rs. Re-run when the toolchain is upgraded.
#
# Usage: scripts/bundle-linux-tools.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

case "$(uname -m)" in
  x86_64)         ARCH_DIR="linux-x64" ;;
  aarch64|arm64)  ARCH_DIR="linux-arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

DEST="$TAURI_DIR/tools/$ARCH_DIR"
echo "==> Bundling native tools into $DEST"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1 (try: sudo apt-get install $1)" >&2; exit 1; }; }
need iverilog; need vvp; need yosys; need ldd; need patchelf

IVERILOG="$(command -v iverilog)"
YOSYS="$(command -v yosys)"

# Resolve a data dir by probing the usual Debian/Ubuntu locations.
first_existing() { for d in "$@"; do [ -e "$d" ] && { echo "$d"; return 0; }; done; return 1; }

IVL_SRC="$(first_existing /usr/lib/ivl /usr/lib/x86_64-linux-gnu/ivl /usr/local/lib/ivl || true)"
YOSYS_SHARE="$(first_existing /usr/share/yosys /usr/local/share/yosys || true)"
VERILATOR_SHARE="$(first_existing /usr/share/verilator /usr/local/share/verilator || true)"

# ---- fresh dest tree --------------------------------------------------------
rm -rf "$DEST"
mkdir -p "$DEST/bin" "$DEST/lib"

copybin() {
  local n="$1" src; src="$(command -v "$n" || true)"
  if [ -n "$src" ]; then
    cp -L "$src" "$DEST/bin/$n"; chmod u+w "$DEST/bin/$n"; echo "    bin/$n"
  else
    echo "    (skipped, not found) $n"
  fi
}

echo "==> Copying binaries"
copybin iverilog
copybin vvp
copybin yosys
copybin yosys-abc
copybin verilator_bin

echo "==> Copying data directories"
if [ -n "$IVL_SRC" ]; then cp -RL "$IVL_SRC" "$DEST/lib/ivl"; echo "    lib/ivl ($(du -sh "$DEST/lib/ivl" | cut -f1))"; else echo "    WARNING: iverilog data dir (ivl) not found" >&2; fi
mkdir -p "$DEST/share"
if [ -n "$YOSYS_SHARE" ]; then cp -RL "$YOSYS_SHARE" "$DEST/share/yosys"; echo "    share/yosys ($(du -sh "$DEST/share/yosys" | cut -f1))"; else echo "    WARNING: yosys share dir not found" >&2; fi
if [ -n "$VERILATOR_SHARE" ]; then cp -RL "$VERILATOR_SHARE" "$DEST/share/verilator"; echo "    share/verilator ($(du -sh "$DEST/share/verilator" | cut -f1))"; fi

# ---- vendor the non-system .so closure --------------------------------------
# Core glibc/gcc libraries are guaranteed present on every Ubuntu and must NOT be
# bundled (mixing them across distro versions breaks the loader). Everything else
# (libreadline, libtcl, libffi, ...) is vendored for portability.
is_system_lib() {
  case "$(basename "$1")" in
    libc.so*|libm.so*|libdl.so*|libpthread.so*|librt.so*|ld-linux*|linux-vdso*|\
    libgcc_s.so*|libstdc++.so*|libresolv.so*|libutil.so*|libnss_*|libcrypt.so*) return 0 ;;
    *) return 1 ;;
  esac
}

echo "==> Vendoring .so closure (ldd)"
# ldd resolves the full transitive closure, so one pass per binary is enough.
for b in "$DEST"/bin/*; do
  [ -f "$b" ] || continue
  while read -r path; do
    [ -n "$path" ] && [ -f "$path" ] || continue
    is_system_lib "$path" && continue
    base="$(basename "$path")"
    if [ ! -f "$DEST/lib/$base" ]; then
      cp -L "$path" "$DEST/lib/$base"; chmod u+w "$DEST/lib/$base"; echo "    lib/$base"
    fi
  done < <(ldd "$b" 2>/dev/null | awk '/=>/ {print $3}')
done

# ---- relink RPATHs to $ORIGIN ----------------------------------------------
echo "==> Rewriting RPATHs"
for b in "$DEST"/bin/*;  do [ -f "$b" ] && patchelf --set-rpath '$ORIGIN/../lib' "$b" 2>/dev/null || true; done
for l in "$DEST"/lib/*.so*; do [ -f "$l" ] && patchelf --set-rpath '$ORIGIN' "$l" 2>/dev/null || true; done

echo "==> Done. Bundle size: $(du -sh "$DEST" | cut -f1)"
echo "    Tools: $(ls "$DEST/bin" | tr '\n' ' ')"
