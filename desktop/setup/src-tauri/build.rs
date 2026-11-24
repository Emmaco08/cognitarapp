//! Build script for the CogniTara Studio setup app.
//!
//! Embeds the electron-builder NSIS installer ("payload") and its manifest into the
//! setup binary at compile time via `include_bytes!` / `include_str!`.
//!
//! Resolution order for the payload:
//!   1. `COGNITARA_PAYLOAD`           – absolute path to the NSIS installer .exe
//!   2. `../payload/payload.exe`      – written by `scripts/prepare_payload.py` in CI
//!   3. (none) → an empty payload is embedded and the app runs in *preview mode*
//!      (simulated install) so the UI can be developed without a Windows build.
//!
//! Embedding (instead of appending an overlay to the .exe) keeps Authenticode signing
//! of the final setup executable valid and straightforward.

use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=COGNITARA_PAYLOAD");
    println!("cargo:rerun-if-env-changed=COGNITARA_PAYLOAD_MANIFEST");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let payload_dir = manifest_dir.join("..").join("payload");

    // ---- payload (.exe) --------------------------------------------------------
    let payload = env::var("COGNITARA_PAYLOAD")
        .ok()
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| Some(payload_dir.join("payload.exe")))
        .filter(|p| p.is_file());

    let payload_path = match payload {
        Some(p) => {
            println!("cargo:rerun-if-changed={}", p.display());
            println!("cargo:warning=Embedding NSIS payload: {}", p.display());
            absolutize(p)
        }
        None => {
            println!("cargo:warning=No NSIS payload found - building setup in PREVIEW mode (simulated install).");
            let empty = out_dir.join("empty-payload.bin");
            fs::write(&empty, b"").expect("write empty payload");
            empty
        }
    };
    println!("cargo:rerun-if-changed={}", payload_dir.join("payload.exe").display());

    // ---- manifest (.json) ------------------------------------------------------
    let manifest = env::var("COGNITARA_PAYLOAD_MANIFEST")
        .ok()
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| Some(payload_dir.join("manifest.json")))
        .filter(|p| p.is_file());

    let manifest_path = match manifest {
        Some(p) => {
            println!("cargo:rerun-if-changed={}", p.display());
            absolutize(p)
        }
        None => {
            let fallback = out_dir.join("manifest.json");
            fs::write(
                &fallback,
                br#"{"version":"0.0.0-preview","installedBytes":438000000,"fileCount":1450,"payloadBytes":0,"payloadName":"preview.exe","sha256":""}"#,
            )
            .expect("write fallback manifest");
            fallback
        }
    };
    println!("cargo:rerun-if-changed={}", payload_dir.join("manifest.json").display());

    println!("cargo:rustc-env=COGNITARA_PAYLOAD_PATH={}", payload_path.display());
    println!("cargo:rustc-env=COGNITARA_MANIFEST_PATH={}", manifest_path.display());

    tauri_build::build();
}

/// Make a path absolute without `canonicalize()` (which yields `\\?\` verbatim
/// paths on Windows that some tools dislike).
fn absolutize(p: PathBuf) -> PathBuf {
    if p.is_absolute() {
        p
    } else {
        env::current_dir().map(|d| d.join(&p)).unwrap_or(p)
    }
}
