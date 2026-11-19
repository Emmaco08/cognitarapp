#!/usr/bin/env python3
"""
Build script for freezing the CogniTara v2 Python/Waitress engine into
`desktop/resources/engine/cognitara-engine(.exe)` using PyInstaller.

Features:
- Optional PyArmor protection of `cognitara/security/{hwid,vault_store,license_guard}.py`
  in a temporary build staging copy when `COGNITARA_USE_PYARMOR=1` is set and
  `pyarmor` is available (falls back cleanly if PyArmor is not installed).
- Runs PyInstaller with `desktop/cognitara-engine.spec` (`--onedir`, `console=False`).
- Post-build smoke test: launches the frozen binary on a free loopback port with a
  random `COGNITARA_DESKTOP_TOKEN`, verifies `GET /health == 200` and authenticated
  `GET /api/internal/license-status == 200`, then shuts it down cleanly.
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DESKTOP_DIR = os.path.join(ROOT_DIR, "desktop")
SPEC_PATH = os.path.join(DESKTOP_DIR, "cognitara-engine.spec")
DIST_PARENT = os.path.join(DESKTOP_DIR, "resources")
OUT_DIR = os.path.join(DIST_PARENT, "engine")
WORK_DIR = os.path.join(ROOT_DIR, "build", "pyinstaller-engine")


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _maybe_prepare_pyarmor_overlay() -> str | None:
    if os.environ.get("COGNITARA_USE_PYARMOR", "").strip() != "1":
        return None
    pyarmor_exe = shutil.which("pyarmor")
    if not pyarmor_exe:
        print("[build_engine] COGNITARA_USE_PYARMOR=1 requested, but pyarmor not installed; skipping obfuscation.")
        return None

    tmp_dir = tempfile.mkdtemp(prefix="cognitara_pyarmor_")
    targets = [
        os.path.join(ROOT_DIR, "cognitara", "security", "hwid.py"),
        os.path.join(ROOT_DIR, "cognitara", "security", "vault_store.py"),
        os.path.join(ROOT_DIR, "cognitara", "security", "license_guard.py"),
    ]
    cmd = [pyarmor_exe, "gen", "-O", tmp_dir, *targets]
    print(f"[build_engine] Running PyArmor: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=ROOT_DIR, check=False)
    if proc.returncode != 0:
        print("[build_engine] PyArmor exited non-zero; falling back to standard PyInstaller bundle.")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return None
    return tmp_dir


def build_engine() -> str:
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(DIST_PARENT, exist_ok=True)
    os.makedirs(WORK_DIR, exist_ok=True)

    overlay = _maybe_prepare_pyarmor_overlay()
    try:
        cmd = [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            DIST_PARENT,
            "--workpath",
            WORK_DIR,
            SPEC_PATH,
        ]
        print(f"[build_engine] Building engine: {' '.join(cmd)}")
        subprocess.run(cmd, cwd=ROOT_DIR, check=True)
    finally:
        if overlay:
            shutil.rmtree(overlay, ignore_errors=True)

    exe_name = "cognitara-engine.exe" if sys.platform == "win32" else "cognitara-engine"
    exe_path = os.path.join(OUT_DIR, exe_name)
    if not os.path.isfile(exe_path):
        raise RuntimeError(f"Expected frozen binary not found at {exe_path}")
    print(f"[build_engine] Built frozen engine at {exe_path}")
    return exe_path


def smoke_test(exe_path: str) -> None:
    port = _find_free_port()
    token = secrets.token_hex(24)
    tmp_data = tempfile.mkdtemp(prefix="cognitara_smoke_")
    env = os.environ.copy()
    env.update({
        "COGNITARA_HOST": "127.0.0.1",
        "COGNITARA_PORT": str(port),
        "COGNITARA_THREADS": "4",
        "COGNITARA_DATA_DIR": tmp_data,
        "COGNITARA_DB_NAME": os.path.join(tmp_data, "exam.db"),
        "COGNITARA_BACKUP_DIR": os.path.join(tmp_data, "backups"),
        "COGNITARA_DESKTOP_TOKEN": token,
        "COGNITARA_DESKTOP_MANAGED": "1",
        "COGNITARA_ENFORCE_LICENSE": "1",
    })

    print(f"[build_engine] Smoke-testing frozen engine on 127.0.0.1:{port} ...")
    kwargs: dict = {"cwd": os.path.dirname(exe_path), "env": env}
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

    proc = subprocess.Popen([exe_path], **kwargs)
    try:
        deadline = time.time() + 30.0
        healthy = False
        while time.time() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(f"Frozen engine exited prematurely with code {proc.returncode}")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as resp:
                    if resp.status == 200:
                        healthy = True
                        break
            except Exception:
                time.sleep(0.4)
        if not healthy:
            raise RuntimeError("Frozen engine failed to respond on /health within 30s")

        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/internal/license-status",
            headers={"X-CogniTara-Desktop-Token": token},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            assert resp.status == 200 and body.get("ok") is True, f"Unexpected response: {body}"
            assert "license" in body and body["license"].get("display_hwid"), f"Missing HWID in {body}"
            print(f"[build_engine] Smoke test PASSED (HWID={body['license']['display_hwid']}, state={body['license']['lock_state']})")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(tmp_data, ignore_errors=True)


if __name__ == "__main__":
    binary = build_engine()
    if "--skip-smoke-test" not in sys.argv:
        smoke_test(binary)
