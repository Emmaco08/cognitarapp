//! Installation driver.
//!
//! * **Windows (real payload):** writes the embedded electron-builder NSIS installer
//!   to `%TEMP%`, runs it silently (elevated via `ShellExecuteExW("runas")` for
//!   per-machine installs) and streams *inferred* progress to the UI.
//! * **Preview builds / non-Windows:** a timed simulation that walks the exact same
//!   phases so the UI can be developed anywhere.
//!
//! ## How progress is inferred
//! NSIS in silent mode does not report a percentage. electron-builder installs in
//! three disk-visible stages, so we measure bytes on disk for each of them:
//!
//! 1. `File /oname=$PLUGINSDIR\app-64.7z`  → new `%TEMP%\nsXXXX.tmp` dir grows to ≈ payload size
//! 2. `Nsis7z::Extract` into `$PLUGINSDIR\7z-out` → the same temp dir grows by ≈ `installedBytes`
//! 3. `CopyFiles 7z-out\* $INSTDIR`          → the install dir grows to ≈ `installedBytes`
//!
//! `installedBytes` (size of `win-unpacked`) is written into the payload manifest at
//! build time. Remaining work (shortcuts, registry, ProgramData ACLs) has no disk
//! signal, so it eases asymptotically towards 99% until the process exits, and
//! jumps to 100% on exit code 0.

#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use crate::{InstallOptions, APP_EXE_NAME};
use serde::Serialize;
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub percent: f64,
    pub step: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finished {
    pub ok: bool,
    pub code: i64,
    pub title: String,
    pub message: String,
    pub detail: String,
    pub app_exe: String,
    pub install_dir: String,
}

impl Finished {
    fn success(dir: &str) -> Self {
        Finished {
            ok: true,
            code: 0,
            title: "CogniTara Studio is ready".into(),
            message: "Installation completed successfully.".into(),
            detail: String::new(),
            app_exe: Path::new(dir).join(APP_EXE_NAME).to_string_lossy().into_owned(),
            install_dir: dir.into(),
        }
    }
    fn error(code: i64, title: &str, message: impl Into<String>, detail: impl Into<String>, dir: &str) -> Self {
        Finished {
            ok: false,
            code,
            title: title.into(),
            message: message.into(),
            detail: detail.into(),
            app_exe: String::new(),
            install_dir: dir.into(),
        }
    }
}

struct Reporter<'a> {
    app: &'a AppHandle,
    shown: f64,
}

impl Reporter<'_> {
    fn emit(&mut self, percent: f64, step: &str, detail: &str) {
        // Progress never moves backwards.
        self.shown = self.shown.max(percent.clamp(0.0, 100.0));
        let _ = self.app.emit(
            "setup://progress",
            Progress { percent: self.shown, step: step.into(), detail: detail.into() },
        );
    }
}

pub fn run(app: &AppHandle, opts: &InstallOptions) -> Finished {
    let mut rep = Reporter { app, shown: 0.0 };
    #[cfg(windows)]
    {
        if !crate::is_preview() {
            return windows_impl::run_real(&mut rep, opts);
        }
    }
    simulate(&mut rep, opts)
}

/// Step labels used during the post-copy phase (no disk signal available).
const FINALIZE_STEPS: [&str; 5] = [
    "Configuring data folder…",
    "Applying exam-data permissions…",
    "Creating shortcuts…",
    "Registering uninstaller…",
    "Finishing up…",
];

fn simulate(rep: &mut Reporter, opts: &InstallOptions) -> Finished {
    let detail = format!("Installing to {}", opts.install_dir);
    let phases: [(&str, f64, u64); 6] = [
        ("Preparing installer…", 6.0, 900),
        ("Unpacking application package…", 22.0, 2600),
        ("Extracting CogniTara engine…", 48.0, 3600),
        ("Extracting Studio interface…", 66.0, 2600),
        ("Installing program files…", 92.0, 3800),
        ("Configuring data folder…", 99.0, 3200),
    ];
    let mut from = 0.0;
    for (label, to, ms) in phases {
        let steps = (ms / 80).max(1);
        for i in 0..=steps {
            let t = i as f64 / steps as f64;
            let eased = 1.0 - (1.0 - t).powi(2);
            let p = from + (to - from) * eased;
            let lbl = if label.starts_with("Configuring") {
                FINALIZE_STEPS[((t * 4.99) as usize).min(4)]
            } else {
                label
            };
            rep.emit(p, lbl, &detail);
            std::thread::sleep(Duration::from_millis(80));
        }
        from = to;
    }
    rep.emit(100.0, "Installation complete", &detail);
    std::thread::sleep(Duration::from_millis(350));
    Finished::success(&opts.install_dir)
}

/// Rough step label for the extraction/copy stages.
fn stage_label(stage: Stage, frac: f64) -> &'static str {
    match stage {
        Stage::Removing => "Removing previous version…",
        Stage::Unpacking => "Unpacking application package…",
        Stage::Extracting if frac < 0.5 => "Extracting CogniTara engine…",
        Stage::Extracting => "Extracting Studio interface…",
        Stage::Copying => "Installing program files…",
        Stage::Finalizing => FINALIZE_STEPS[0],
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
#[allow(dead_code)]
enum Stage {
    Removing,
    Unpacking,
    Extracting,
    Copying,
    Finalizing,
}

/// Pure progress model (unit-testable): maps measured bytes to (percent, stage).
#[allow(dead_code)]
fn model(
    payload: u64,
    installed: u64,
    tmp_max: u64,
    inst_counted: u64,
    removing: bool,
) -> (f64, Stage, f64) {
    let c = payload.max(1) as f64;
    let u = installed.max(1) as f64;
    let tmp = (tmp_max as f64).min(c + u);
    let inst = (inst_counted as f64).min(u);
    let work = tmp + inst;
    let frac = (work / (c + 2.0 * u)).clamp(0.0, 1.0);
    let pct = 6.0 + 88.0 * frac;
    let (stage, sub) = if removing && inst == 0.0 && tmp < c * 0.05 {
        (Stage::Removing, 0.0)
    } else if inst == 0.0 && tmp < c * 0.92 {
        (Stage::Unpacking, tmp / c)
    } else if inst == 0.0 {
        (Stage::Extracting, ((tmp - c) / u).clamp(0.0, 1.0))
    } else if inst < u * 0.97 {
        (Stage::Copying, inst / u)
    } else {
        (Stage::Finalizing, 1.0)
    };
    (pct, stage, sub)
}

#[cfg(windows)]
pub fn run_classic_fallback() {
    windows_impl::run_classic_fallback();
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::collections::HashSet;
    use std::ffi::OsStr;
    use std::io::Write;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, WAIT_OBJECT_0};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNORMAL};

    const ERROR_CANCELLED: u32 = 1223;

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    /// Launch `file` with `params` through the shell, optionally elevated.
    fn shell_execute(file: &Path, params: &str, elevate: bool, show: i32) -> Result<HANDLE, u32> {
        let verb = wide(OsStr::new(if elevate { "runas" } else { "open" }));
        let file_w = wide(file.as_os_str());
        let params_w = wide(OsStr::new(params));
        let dir_w = file.parent().map(|d| wide(d.as_os_str()));
        let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file_w.as_ptr();
        info.lpParameters = params_w.as_ptr();
        info.lpDirectory = dir_w.as_ref().map(|d| d.as_ptr()).unwrap_or(std::ptr::null());
        info.nShow = show;
        let ok = unsafe { ShellExecuteExW(&mut info) };
        if ok == 0 || info.hProcess.is_null() {
            let err = unsafe { GetLastError() };
            return Err(if err == 0 { 2 } else { err });
        }
        Ok(info.hProcess)
    }

    fn write_payload(rep: &mut Reporter, dir: &Path) -> std::io::Result<PathBuf> {
        std::fs::create_dir_all(dir)?;
        let m = crate::manifest();
        let name = if m.payload_name.is_empty() { "CogniTara-Studio-Update.exe".into() } else { m.payload_name };
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path)?;
        let total = crate::PAYLOAD.len().max(1);
        let chunk = 4 * 1024 * 1024;
        for (i, part) in crate::PAYLOAD.chunks(chunk).enumerate() {
            f.write_all(part)?;
            let done = ((i + 1) * chunk).min(total) as f64 / total as f64;
            rep.emit(0.5 + 3.5 * done, "Preparing installer…", "Unpacking setup files");
        }
        f.flush()?;
        f.sync_all()?;
        Ok(path)
    }

    /// `%TEMP%\ns*.tmp` directories (NSIS `$PLUGINSDIR`).
    fn nsis_temp_dirs() -> HashSet<PathBuf> {
        let mut out = HashSet::new();
        if let Ok(rd) = std::fs::read_dir(std::env::temp_dir()) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_lowercase();
                if n.starts_with("ns") && n.ends_with(".tmp") && e.path().is_dir() {
                    out.insert(e.path());
                }
            }
        }
        out
    }

    pub fn run_real(rep: &mut Reporter, opts: &InstallOptions) -> Finished {
        let dir = opts.install_dir.trim().trim_end_matches('\\').to_string();
        let dir_path = PathBuf::from(&dir);
        let detail = format!("Installing to {dir}");
        let m = crate::manifest();

        rep.emit(0.5, "Preparing installer…", "Unpacking setup files");
        let work_dir = std::env::temp_dir().join(format!("CogniTaraSetup-{}", std::process::id()));
        let payload_path = match write_payload(rep, &work_dir) {
            Ok(p) => p,
            Err(e) => {
                let _ = std::fs::remove_dir_all(&work_dir);
                return Finished::error(
                    -10,
                    "Couldn't prepare the installer",
                    "Setup could not write its temporary files. Free up some disk space or temporarily pause antivirus scanning, then try again.",
                    format!("{e} ({})", work_dir.display()),
                    &dir,
                );
            }
        };

        // Per-machine installs (Program Files, other drives) need administrator rights.
        let per_machine = !crate::sys::is_user_path(&dir_path);
        let mut params = String::from("/S");
        params.push_str(if per_machine { " /allusers" } else { " /currentuser" });
        if !opts.desktop_shortcut {
            params.push_str(" --no-desktop-shortcut");
        }
        if !opts.start_menu_shortcut {
            params.push_str(" --no-start-menu-shortcut");
        }
        // NSIS requires /D= to be last and unquoted (spaces allowed).
        params.push_str(&format!(" /D={dir}"));

        if per_machine {
            rep.emit(4.5, "Waiting for administrator permission…", "Approve the Windows security prompt to continue");
        }
        let baseline_inst = if dir_path.is_dir() { crate::sys::dir_size(&dir_path) } else { 0 };
        let before_tmp = nsis_temp_dirs();

        let handle = match shell_execute(&payload_path, &params, per_machine, SW_HIDE) {
            Ok(h) => h,
            Err(code) => {
                let _ = std::fs::remove_dir_all(&work_dir);
                return if code == ERROR_CANCELLED {
                    Finished::error(
                        code as i64,
                        "Administrator permission is needed",
                        format!("Installing to {dir} requires administrator approval. Choose Try again and accept the Windows prompt, or pick a folder inside your user profile."),
                        format!("UAC elevation was cancelled (Win32 error {code})."),
                        &dir,
                    )
                } else {
                    Finished::error(
                        code as i64,
                        "The installer couldn't start",
                        "Windows blocked the installation engine from starting. If antivirus software quarantined it, allow CogniTara Studio Setup and try again.",
                        format!("ShellExecuteExW failed with Win32 error {code}."),
                        &dir,
                    )
                };
            }
        };

        rep.emit(6.0, "Preparing installation…", &detail);
        let payload_bytes = if m.payload_bytes > 0 { m.payload_bytes } else { crate::PAYLOAD.len() as u64 };
        let installed = m.installed_bytes.max(1);
        let removing = baseline_inst > 0;
        let mut tmp_dirs: HashSet<PathBuf> = HashSet::new();
        let mut tmp_max: u64 = 0;
        let mut dropped = baseline_inst == 0;
        let started = Instant::now();
        let mut last_measure = Instant::now() - Duration::from_secs(1);
        let mut finalize_started: Option<Instant> = None;
        let mut creep: f64 = 0.0;
        let mut last_pct: f64 = 6.0;

        loop {
            let wait = unsafe { WaitForSingleObject(handle, 200) };
            if wait == WAIT_OBJECT_0 {
                break;
            }
            if last_measure.elapsed() < Duration::from_millis(500) {
                continue;
            }
            last_measure = Instant::now();

            for d in nsis_temp_dirs() {
                if !before_tmp.contains(&d) {
                    tmp_dirs.insert(d);
                }
            }
            let tmp_now: u64 = tmp_dirs.iter().map(|d| crate::sys::dir_size(d)).sum();
            tmp_max = tmp_max.max(tmp_now);
            let inst_now = if dir_path.is_dir() { crate::sys::dir_size(&dir_path) } else { 0 };
            if !dropped && inst_now < baseline_inst / 2 {
                dropped = true;
            }
            let inst_counted = if dropped { inst_now } else { 0 };

            let (pct, stage, sub) = model(payload_bytes, installed, tmp_max, inst_counted, removing && !dropped);
            if stage == Stage::Finalizing {
                let t0 = *finalize_started.get_or_insert_with(Instant::now);
                let secs = t0.elapsed().as_secs_f64();
                // Ease 94 → 99 with a ~6s time constant; rotate finalize labels.
                let p = 94.0 + 5.0 * (1.0 - (-secs / 6.0).exp());
                let idx = ((secs / 1.6) as usize).min(FINALIZE_STEPS.len() - 1);
                rep.emit(p, FINALIZE_STEPS[idx], &detail);
                continue;
            }
            // Keep motion alive when disk activity pauses (e.g. antivirus scanning).
            if pct <= last_pct + 0.05 {
                creep = (creep + 0.12).min(3.0);
            } else {
                creep = 0.0;
                last_pct = pct;
            }
            let label = if started.elapsed() < Duration::from_millis(1500) && stage == Stage::Unpacking {
                "Preparing installation…"
            } else {
                stage_label(stage, sub)
            };
            rep.emit((pct + creep).min(94.0), label, &detail);
        }

        let mut code: u32 = 1;
        unsafe {
            WaitForSingleObject(handle, INFINITE);
            GetExitCodeProcess(handle, &mut code);
            CloseHandle(handle);
        }
        let _ = std::fs::remove_dir_all(&work_dir);

        let app_exe = dir_path.join(APP_EXE_NAME);
        match code {
            0 if app_exe.is_file() => {
                rep.emit(100.0, "Installation complete", &detail);
                std::thread::sleep(Duration::from_millis(300));
                Finished::success(&dir)
            }
            0 => Finished::error(
                0,
                "Installation is incomplete",
                format!("The installer finished but {APP_EXE_NAME} was not found in the selected folder. Try again, or choose a different location."),
                format!("Missing: {}", app_exe.display()),
                &dir,
            ),
            1 => Finished::error(
                1,
                "Installation was cancelled",
                "The installer stopped before finishing. If CogniTara Studio is running, quit it from the system tray and try again.",
                "NSIS exit code 1 (cancelled / app still running).",
                &dir,
            ),
            2 => Finished::error(
                2,
                "Installation failed",
                "Windows reported an error while writing program files. Make sure the folder is writable and that no other installer is running, then try again.",
                "NSIS exit code 2 (aborted by installer script).",
                &dir,
            ),
            other => Finished::error(
                other as i64,
                "Installation failed",
                "Something went wrong while installing CogniTara Studio. Try again — if it keeps failing, send the details below to CogniTara support.",
                format!("Installer exit code {other} (0x{other:X})."),
                &dir,
            ),
        }
    }

    /// No WebView2 runtime: extract the payload and run the classic NSIS wizard.
    pub fn run_classic_fallback() {
        let work_dir = std::env::temp_dir().join(format!("CogniTaraSetup-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&work_dir);
        let path = work_dir.join("CogniTara-Studio-Setup.exe");
        if std::fs::write(&path, crate::PAYLOAD).is_ok() {
            if let Ok(h) = shell_execute(&path, "", false, SW_SHOWNORMAL) {
                unsafe {
                    WaitForSingleObject(h, INFINITE);
                    CloseHandle(h);
                }
            }
        }
        let _ = std::fs::remove_dir_all(&work_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_is_monotonic_through_stages() {
        let c = 150_000_000;
        let u = 430_000_000;
        let (p0, s0, _) = model(c, u, 0, 0, false);
        assert_eq!(s0, Stage::Unpacking);
        assert!((p0 - 6.0).abs() < 0.01);
        let (p1, s1, _) = model(c, u, c, 0, false);
        assert_eq!(s1, Stage::Extracting);
        let (p2, s2, _) = model(c, u, c + u, u / 2, false);
        assert_eq!(s2, Stage::Copying);
        let (p3, s3, _) = model(c, u, c + u, u, false);
        assert_eq!(s3, Stage::Finalizing);
        assert!(p0 < p1 && p1 < p2 && p2 < p3);
        assert!((p3 - 94.0).abs() < 0.01);
    }

    #[test]
    fn model_reports_removal_on_update() {
        let (_, s, _) = model(1, 1, 0, 0, true);
        assert_eq!(s, Stage::Removing);
    }
}
