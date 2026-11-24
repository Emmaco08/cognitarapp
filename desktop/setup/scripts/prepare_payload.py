"""Stage the electron-builder NSIS installer as the Tauri setup payload.

Run after `npm run dist:win` (from the repo root or anywhere):

    python desktop/setup/scripts/prepare_payload.py

It locates `desktop/release/CogniTara-Studio-Update-<ver>-x64.exe` (the NSIS
installer used by electron-updater), copies it to `desktop/setup/payload/payload.exe`
and writes `desktop/setup/payload/manifest.json` with the numbers the setup UI needs
for realistic progress:

    installedBytes  total size of release/win-unpacked (what lands in the install dir)
    fileCount       number of files in win-unpacked
    payloadBytes    size of the NSIS installer
    sha256          integrity hash of the payload

`src-tauri/build.rs` embeds both files into the setup executable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

DESKTOP = Path(__file__).resolve().parents[2]
RELEASE = DESKTOP / "release"
PAYLOAD_DIR = DESKTOP / "setup" / "payload"


def dir_stats(root: Path) -> tuple[int, int]:
    total = 0
    count = 0
    for p in root.rglob("*"):
        if p.is_file() and not p.is_symlink():
            total += p.stat().st_size
            count += 1
    return total, count


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--release-dir", type=Path, default=RELEASE)
    ap.add_argument("--installer", type=Path, default=None, help="explicit NSIS installer path")
    args = ap.parse_args()

    version = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))["version"]
    release: Path = args.release_dir

    installer = args.installer or release / f"CogniTara-Studio-Update-{version}-x64.exe"
    if not installer.is_file():
        print(f"ERROR: NSIS installer not found: {installer}", file=sys.stderr)
        return 1

    unpacked = release / "win-unpacked"
    if not unpacked.is_dir():
        print(f"ERROR: {unpacked} not found (electron-builder output)", file=sys.stderr)
        return 1
    installed_bytes, file_count = dir_stats(unpacked)
    # electron-builder also writes the uninstaller + icon into $INSTDIR (~1 MB).
    installed_bytes += 1_200_000

    PAYLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = PAYLOAD_DIR / "payload.exe"
    shutil.copy2(installer, dest)

    manifest = {
        "version": version,
        "installedBytes": installed_bytes,
        "fileCount": file_count,
        "payloadBytes": dest.stat().st_size,
        "payloadName": installer.name,
        "sha256": sha256(dest),
    }
    (PAYLOAD_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
