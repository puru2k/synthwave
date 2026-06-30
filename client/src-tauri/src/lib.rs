mod tools;

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;
use tools::{Health, LintResult, SimResult, SrcFile, SynthResult};

// The app's resource directory, captured once at startup. This is the canonical,
// cross-platform location of bundled resources (macOS Contents/Resources, the
// install dir on Windows, /usr/lib/<app> on Linux), so tools.rs uses it to find
// the bundled toolchain regardless of platform packaging differences.
static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn resource_dir() -> Option<PathBuf> {
    RESOURCE_DIR.get().cloned()
}

#[tauri::command]
async fn check_tools() -> Health {
    tools::check_tools_impl()
}

#[tauri::command]
async fn simulate(files: Vec<SrcFile>, data: Option<Vec<SrcFile>>) -> SimResult {
    let data = data.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || tools::simulate_impl(files, data))
        .await
        .expect("simulate task panicked")
}

#[tauri::command]
async fn lint(files: Vec<SrcFile>, level: String, top: Option<String>) -> LintResult {
    let top = top.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || tools::lint_impl(files, level, top))
        .await
        .expect("lint task panicked")
}

#[tauri::command]
async fn synthesize(
    files: Vec<SrcFile>,
    top: Option<String>,
    flatten: Option<bool>,
    mode: String,
    lib: Option<String>,
) -> SynthResult {
    let top = top.unwrap_or_default();
    let flatten = flatten.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || tools::synthesize_impl(files, top, flatten, mode, lib))
        .await
        .expect("synthesize task panicked")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(dir) = app.path().resource_dir() {
                let _ = RESOURCE_DIR.set(dir);
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_tools,
            simulate,
            lint,
            synthesize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
