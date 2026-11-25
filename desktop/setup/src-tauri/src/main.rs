// CogniTara Studio Setup — custom Windows installer experience.
//
// A tiny Tauri v2 (Rust + WebView2) shell whose UI lives in `../ui` (plain
// HTML/CSS/JS). The real installation is performed by the electron-builder NSIS
// installer, embedded into this binary as a payload and executed silently
// (`/S /D=<dir>`). Progress is inferred from bytes written to disk.
//
// See `desktop/setup/README.md` for the full architecture.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod install;
mod sys;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewWindow};

/// The electron-builder NSIS installer (empty in preview builds).
pub static PAYLOAD: &[u8] = include_bytes!(env!("COGNITARA_PAYLOAD_PATH"));
/// JSON written by `scripts/prepare_payload.py` (expected sizes, version, hash).
pub static MANIFEST_JSON: &str = include_str!(env!("COGNITARA_MANIFEST_PATH"));

pub const PRODUCT_NAME: &str = "CogniTara Studio";
pub const APP_EXE_NAME: &str = "CogniTara Studio.exe";

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Manifest {
    pub version: String,
    /// Total uncompressed size of `win-unpacked` (what ends up in the install dir).
    pub installed_bytes: u64,
    pub file_count: u64,
    /// Size of the NSIS installer itself.
    pub payload_bytes: u64,
    pub payload_name: String,
    pub sha256: String,
}

pub fn manifest() -> Manifest {
    serde_json::from_str(MANIFEST_JSON).unwrap_or_default()
}

pub fn is_preview() -> bool {
    PAYLOAD.is_empty()
}

#[derive(Default)]
pub struct SetupState {
    pub installing: Arc<AtomicBool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupInfo {
    product_name: String,
    version: String,
    preview: bool,
    platform: String,
    default_dir: String,
    data_dir: String,
    required_bytes: u64,
    existing: Option<sys::ExistingInstall>,
    location: sys::LocationInfo,
}

#[tauri::command]
fn get_setup_info(app: tauri::AppHandle) -> SetupInfo {
    let m = manifest();
    let version = if m.version.is_empty() || m.version.contains("preview") {
        app.package_info().version.to_string()
    } else {
        m.version.clone()
    };
    let existing = sys::find_existing_install();
    let default_dir = existing
        .as_ref()
        .map(|e| e.install_dir.clone())
        .filter(|d| sys::is_valid_install_dir(d))
        .unwrap_or_else(|| sys::default_install_dir().to_string_lossy().into_owned());
    let location = sys::location_info(&default_dir, m.installed_bytes);
    SetupInfo {
        product_name: PRODUCT_NAME.into(),
        version,
        preview: is_preview(),
        platform: std::env::consts::OS.into(),
        default_dir,
        data_dir: sys::data_dir().to_string_lossy().into_owned(),
        required_bytes: m.installed_bytes,
        existing,
        location,
    }
}

#[tauri::command]
fn check_location(path: String) -> sys::LocationInfo {
    sys::location_info(&path, manifest().installed_bytes)
}

#[tauri::command(async)]
fn choose_folder(window: WebviewWindow, current: String) -> Option<String> {
    let mut dlg = rfd::FileDialog::new().set_title("Choose where to install CogniTara Studio");
    let start = PathBuf::from(&current);
    if let Some(existing) = sys::nearest_existing_ancestor(&start) {
        dlg = dlg.set_directory(existing);
    }
    dlg = dlg.set_parent(&window);
    dlg.pick_folder().map(|p| {
        // Mirror classic installers: always install into a product sub-folder.
        let ends_with_product = p
            .file_name()
            .map(|n| n.to_string_lossy().eq_ignore_ascii_case(PRODUCT_NAME))
            .unwrap_or(false);
        let p = if ends_with_product { p } else { p.join(PRODUCT_NAME) };
        p.to_string_lossy().into_owned()
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    pub install_dir: String,
    pub desktop_shortcut: bool,
    pub start_menu_shortcut: bool,
}

#[tauri::command]
fn start_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, SetupState>,
    options: InstallOptions,
) -> Result<(), String> {
    if options.install_dir.trim().is_empty() {
        return Err("Please choose an installation folder.".into());
    }
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("Installation is already running.".into());
    }
    let flag = state.installing.clone();
    std::thread::spawn(move || {
        let result = install::run(&app, &options);
        flag.store(false, Ordering::SeqCst);
        let _ = app.emit("setup://finished", result);
    });
    Ok(())
}

#[tauri::command]
fn launch_app(app_exe: String) -> Result<(), String> {
    sys::launch_detached(&app_exe).map_err(|e| format!("Could not start CogniTara Studio: {e}"))
}

#[tauri::command]
fn ui_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn win_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn win_close(window: WebviewWindow, state: tauri::State<'_, SetupState>) -> bool {
    if state.installing.load(Ordering::SeqCst) {
        return false;
    }
    let _ = window.destroy();
    true
}

fn main() {
    // Machines without the WebView2 runtime (rare on Windows 10/11) still get a
    // working install: fall back to the classic NSIS wizard.
    #[cfg(windows)]
    if !is_preview() && tauri::webview_version().is_err() {
        install::run_classic_fallback();
        return;
    }

    tauri::Builder::default()
        .manage(SetupState::default())
        .invoke_handler(tauri::generate_handler![
            get_setup_info,
            check_location,
            choose_folder,
            start_install,
            launch_app,
            ui_ready,
            win_minimize,
            win_close
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let busy = window
                    .app_handle()
                    .state::<SetupState>()
                    .installing
                    .load(Ordering::SeqCst);
                if busy {
                    api.prevent_close();
                    let _ = window.emit("setup://close-blocked", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CogniTara Studio Setup");
}
