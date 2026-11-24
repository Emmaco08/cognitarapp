//! Platform helpers: default paths, existing-install detection, disk space,
//! elevation heuristics and launching the installed app.
//!
//! Real implementations are Windows-only; other platforms get harmless stand-ins
//! so the setup UI can be developed and `cargo check`ed on Linux/macOS.

#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingInstall {
    pub version: String,
    pub install_dir: String,
    pub per_machine: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationInfo {
    pub path: String,
    /// Drive / volume label shown in the UI (e.g. `C:`).
    pub drive: String,
    /// Free bytes on the target volume (`None` when unknown).
    pub free_bytes: Option<u64>,
    pub required_bytes: u64,
    /// Install requires administrator rights (per-machine install).
    pub needs_admin: bool,
    /// Human readable problem, if any (blocks Continue).
    pub problem: Option<String>,
}

pub fn nearest_existing_ancestor(p: &Path) -> Option<PathBuf> {
    let mut cur = Some(p);
    while let Some(c) = cur {
        if c.is_dir() {
            return Some(c.to_path_buf());
        }
        cur = c.parent();
    }
    None
}

/// Recursively sum file sizes below `p` (errors ignored, symlinks not followed).
pub fn dir_size(p: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(entry.path());
            } else if ft.is_file() {
                if let Ok(md) = entry.metadata() {
                    total = total.saturating_add(md.len());
                }
            }
        }
    }
    total
}

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var_os(key).filter(|v| !v.is_empty()).map(PathBuf::from)
}

pub fn default_install_dir() -> PathBuf {
    #[cfg(windows)]
    {
        env_path("ProgramW6432")
            .or_else(|| env_path("ProgramFiles"))
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
            .join(crate::PRODUCT_NAME)
    }
    #[cfg(not(windows))]
    {
        env_path("HOME")
            .unwrap_or_else(|| PathBuf::from("/opt"))
            .join(".local/share")
            .join(crate::PRODUCT_NAME)
    }
}

pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        env_path("ProgramData")
            .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"))
            .join("CogniTara")
    }
    #[cfg(not(windows))]
    {
        PathBuf::from(r"C:\ProgramData\CogniTara")
    }
}

/// True when `dir` lives inside the current user's profile, i.e. a per-user
/// install that does not need elevation.
pub fn is_user_path(dir: &Path) -> bool {
    #[cfg(windows)]
    {
        let d = dir.to_string_lossy().to_lowercase().replace('/', "\\");
        ["LOCALAPPDATA", "APPDATA", "USERPROFILE"]
            .iter()
            .filter_map(|k| env_path(k))
            .map(|p| p.to_string_lossy().to_lowercase().trim_end_matches('\\').to_string())
            .any(|root| !root.is_empty() && (d == root || d.starts_with(&format!("{root}\\"))))
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        true
    }
}

fn drive_label(dir: &Path) -> String {
    #[cfg(windows)]
    {
        use std::path::Component;
        if let Some(Component::Prefix(pfx)) = dir.components().next() {
            return pfx.as_os_str().to_string_lossy().into_owned();
        }
        String::new()
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        "/".into()
    }
}

pub fn free_space(dir: &Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let base = nearest_existing_ancestor(dir)?;
        let wide: Vec<u16> = base.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut avail: u64 = 0;
        let ok = unsafe {
            GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, std::ptr::null_mut(), std::ptr::null_mut())
        };
        if ok != 0 {
            Some(avail)
        } else {
            None
        }
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        None
    }
}

pub fn location_info(path: &str, required: u64) -> LocationInfo {
    let p = PathBuf::from(path.trim());
    let free = free_space(&p);
    let mut problem = None;
    #[cfg(windows)]
    let valid_root = p.is_absolute();
    #[cfg(not(windows))]
    let valid_root = true;
    if path.trim().is_empty() || !valid_root {
        problem = Some("Choose a full folder path, e.g. C:\\Program Files\\CogniTara Studio".into());
    } else if path.contains(['"', '<', '>', '|', '?', '*']) {
        problem = Some("The folder name contains characters Windows does not allow.".into());
    } else if let Some(f) = free {
        // Keep a 10% safety margin for temporary extraction.
        if f < required + required / 10 {
            problem = Some("There isn't enough free space on this drive.".into());
        }
    }
    LocationInfo {
        path: p.to_string_lossy().into_owned(),
        drive: drive_label(&p),
        free_bytes: free,
        required_bytes: required,
        needs_admin: !is_user_path(&p),
        problem,
    }
}

/// Detect an existing CogniTara Studio installation (electron-builder writes an
/// Uninstall key named after the app GUID and `Software\<GUID>\InstallLocation`).
pub fn find_existing_install() -> Option<ExistingInstall> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
        use winreg::RegKey;
        const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
        for (hive, per_machine) in [(HKEY_LOCAL_MACHINE, true), (HKEY_CURRENT_USER, false)] {
            let root = RegKey::predef(hive);
            let Ok(un) = root.open_subkey_with_flags(UNINSTALL, KEY_READ | KEY_WOW64_64KEY) else {
                continue;
            };
            for name in un.enum_keys().flatten() {
                let Ok(k) = un.open_subkey_with_flags(&name, KEY_READ | KEY_WOW64_64KEY) else {
                    continue;
                };
                let display: String = k.get_value("DisplayName").unwrap_or_default();
                if !display.starts_with(crate::PRODUCT_NAME) || display.contains("Setup") {
                    continue;
                }
                let version: String = k.get_value("DisplayVersion").unwrap_or_default();
                let mut dir: String = root
                    .open_subkey_with_flags(format!(r"Software\{name}"), KEY_READ | KEY_WOW64_64KEY)
                    .and_then(|s| s.get_value("InstallLocation"))
                    .unwrap_or_default();
                if dir.is_empty() {
                    let icon: String = k.get_value("DisplayIcon").unwrap_or_default();
                    let exe = icon.split(',').next().unwrap_or("").trim_matches('"');
                    if let Some(parent) = Path::new(exe).parent() {
                        dir = parent.to_string_lossy().into_owned();
                    }
                }
                return Some(ExistingInstall { version, install_dir: dir, per_machine });
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Start the installed app as a detached, *non-elevated* process.
pub fn launch_detached(app_exe: &str) -> std::io::Result<()> {
    let exe = PathBuf::from(app_exe);
    if !exe.is_file() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "app executable not found"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        let elevated = unsafe { windows_sys::Win32::UI::Shell::IsUserAnAdmin() } != 0;
        let mut cmd = if elevated {
            // If the setup itself was started "as administrator", hand the launch to
            // Explorer so Studio runs with the user's normal (non-admin) token.
            let mut c = std::process::Command::new("explorer.exe");
            c.arg(&exe);
            c
        } else {
            std::process::Command::new(&exe)
        };
        if let Some(dir) = exe.parent() {
            cmd.current_dir(dir);
        }
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP).spawn().map(|_| ())
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(&exe).spawn().map(|_| ())
    }
}
