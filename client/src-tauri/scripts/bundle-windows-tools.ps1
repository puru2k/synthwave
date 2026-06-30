<#
.SYNOPSIS
  Bundle the native EDA toolchain (Icarus Verilog, Yosys, Verilator) into the
  SynthWave Windows app so it runs WITHOUT any system install.

.DESCRIPTION
  Sources the binaries from the YosysHQ OSS CAD Suite (Windows x64), which ships
  fully relocatable, self-contained EXEs + DLLs. This script copies the tools we
  need (and the DLLs they depend on) plus their data dirs into
  src-tauri\tools\windows-x64\, which is then shipped as a Tauri resource (see
  tauri.windows.conf.json) and resolved at runtime by src\tools.rs.

  Run on a Windows machine before `npm run app:build`. Re-run on toolchain bumps.

.PARAMETER OssCadSuite
  Path to an extracted OSS CAD Suite directory (the folder that contains bin\,
  lib\, share\). If omitted, the latest release is downloaded automatically.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\bundle-windows-tools.ps1
  powershell -ExecutionPolicy Bypass -File scripts\bundle-windows-tools.ps1 -OssCadSuite C:\oss-cad-suite
#>
[CmdletBinding()]
param(
  [string]$OssCadSuite = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TauriDir  = Resolve-Path (Join-Path $ScriptDir "..")
$Dest      = Join-Path $TauriDir "tools\windows-x64"

Write-Host "==> Bundling native tools into $Dest"

# ---- obtain OSS CAD Suite ---------------------------------------------------
function Resolve-Suite {
  param([string]$Path)

  if ($Path -and (Test-Path $Path)) {
    $item = Get-Item $Path
    if ($item.PSIsContainer) { return (Resolve-Path $Path).Path }
    # An archive was passed: extract it next to itself.
    $out = Join-Path $env:TEMP ("oss-cad-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    Write-Host "    Extracting $Path ..."
    tar -xf $Path -C $out
    return (Get-ChildItem $out -Directory | Select-Object -First 1).FullName
  }

  Write-Host "==> No -OssCadSuite given; downloading the latest OSS CAD Suite (Windows x64)"
  $api = "https://api.github.com/repos/YosysHQ/oss-cad-suite-build/releases/latest"
  $rel = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "synthwave-build" }
  $asset = $rel.assets | Where-Object { $_.name -match "windows-x64.*\.(tgz|tar\.gz)$" } | Select-Object -First 1
  if (-not $asset) { throw "Could not find a Windows x64 tarball in the latest OSS CAD Suite release." }
  $tmp = Join-Path $env:TEMP $asset.name
  Write-Host "    Downloading $($asset.name) ($([math]::Round($asset.size/1MB)) MB) ..."
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp
  $out = Join-Path $env:TEMP ("oss-cad-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  Write-Host "    Extracting ..."
  tar -xf $tmp -C $out
  return (Join-Path $out "oss-cad-suite")
}

$Suite = Resolve-Suite -Path $OssCadSuite
if (-not (Test-Path (Join-Path $Suite "bin"))) {
  throw "OSS CAD Suite layout not found (missing bin\) at: $Suite"
}
Write-Host "==> Using OSS CAD Suite at $Suite"

$SuiteBin   = Join-Path $Suite "bin"
$SuiteLib   = Join-Path $Suite "lib"
$SuiteShare = Join-Path $Suite "share"

# ---- fresh dest tree --------------------------------------------------------
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path (Join-Path $Dest "bin") | Out-Null

# ---- copy the tool executables ----------------------------------------------
$Exes = @("yosys.exe", "yosys-abc.exe", "iverilog.exe", "vvp.exe",
          "verilator.exe", "verilator_bin.exe")
Write-Host "==> Copying executables"
foreach ($e in $Exes) {
  $src = Join-Path $SuiteBin $e
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Dest "bin") -Force
    Write-Host "    bin\$e"
  } else {
    Write-Host "    (skipped, not in suite) $e"
  }
}

# OSS CAD Suite keeps every runtime DLL alongside the EXEs in bin\, so copying
# the full set guarantees the dependency closure resolves (DLLs load from the
# same directory as the executable on Windows). This is the reliable choice.
Write-Host "==> Copying runtime DLLs"
$dlls = Get-ChildItem (Join-Path $SuiteBin "*.dll") -ErrorAction SilentlyContinue
foreach ($d in $dlls) { Copy-Item $d.FullName (Join-Path $Dest "bin") -Force }
Write-Host "    $($dlls.Count) DLLs"

# ---- copy data directories --------------------------------------------------
Write-Host "==> Copying data directories"
function Copy-DataDir {
  param([string]$RelFrom, [string]$RelTo)
  foreach ($base in @($SuiteLib, $SuiteShare, $Suite)) {
    $src = Join-Path $base $RelFrom
    if (Test-Path $src) {
      $target = Join-Path $Dest $RelTo
      New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
      Copy-Item $src $target -Recurse -Force
      $sz = "{0:N0}" -f ((Get-ChildItem $target -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
      Write-Host "    $RelTo ($sz MB)"
      return
    }
  }
  Write-Host "    WARNING: could not locate '$RelFrom' in the suite" -ForegroundColor Yellow
}

# iverilog data (ivl, ivlpp, *.tgt, *.vpi, *.conf) -> lib\ivl ; vvp finds VPI here too.
Copy-DataDir -RelFrom "ivl" -RelTo "lib\ivl"
# yosys techmap/cell libraries -> share\yosys (yosys finds this relative to its exe).
Copy-DataDir -RelFrom "yosys" -RelTo "share\yosys"
# verilator root (include/, etc.) -> share\verilator (VERILATOR_ROOT points here).
Copy-DataDir -RelFrom "verilator" -RelTo "share\verilator"

$total = "{0:N0}" -f ((Get-ChildItem $Dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "==> Done. Bundle size: $total MB"
Write-Host "    Tools: $((Get-ChildItem (Join-Path $Dest 'bin') -Filter *.exe | ForEach-Object { $_.Name }) -join ' ')"
