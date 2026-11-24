"""
Tests for Windows C:\\Program Files\\ PermissionError immunity and write-path isolation.
Verifies that frozen `cognitara-engine.exe` writes logs, uploads, secret keys, and DBs
exclusively into %ProgramData%\\CogniTara\\data\\ (with %LOCALAPPDATA% fallback).
"""

import logging
import os
import re
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import pytest

from cognitara.config import (
    get_upload_path,
    resolve_data_dir,
    resolve_logs_dir,
    resolve_upload_dir,
)
from cognitara.logging_config import setup_logging


def test_frozen_uses_programdata_then_falls_back_to_localappdata(tmp_path, monkeypatch):
    program_data = tmp_path / "ProgramData"
    local_app = tmp_path / "LocalAppData"
    program_data.mkdir()
    local_app.mkdir()

    monkeypatch.delenv("COGNITARA_DATA_DIR", raising=False)
    monkeypatch.setenv("PROGRAMDATA", str(program_data))
    monkeypatch.setenv("LOCALAPPDATA", str(local_app))
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    # 1. Writable PROGRAMDATA -> %ProgramData%\CogniTara\data
    data_dir = resolve_data_dir()
    assert os.path.normpath(data_dir) == os.path.normpath(str(program_data / "CogniTara" / "data"))
    assert os.path.normpath(resolve_logs_dir()) == os.path.normpath(str(program_data / "CogniTara" / "data" / "logs"))
    assert os.path.normpath(resolve_upload_dir()) == os.path.normpath(
        str(program_data / "CogniTara" / "data" / "static" / "images")
    )

    # 2. Unwritable PROGRAMDATA -> automatic fallback to %LOCALAPPDATA%\CogniTara\data
    # (On Windows NTFS, os.chmod(0o555) does not block Administrator writes; simulate PermissionError deterministically.)
    import cognitara.config as cfg_mod

    ro_program_data = tmp_path / "ReadOnlyProgramData"
    ro_program_data.mkdir()
    real_ensure = cfg_mod._ensure_writable_dir

    def _blocked_programdata(cand: str) -> bool:
        if os.path.normcase(os.path.abspath(cand)).startswith(os.path.normcase(os.path.abspath(str(ro_program_data)))):
            return False
        return real_ensure(cand)

    monkeypatch.setenv("PROGRAMDATA", str(ro_program_data))
    monkeypatch.setattr(cfg_mod, "_ensure_writable_dir", _blocked_programdata)
    fallback_dir = resolve_data_dir()
    assert os.path.normpath(fallback_dir) == os.path.normpath(str(local_app / "CogniTara" / "data"))


def test_setup_logging_writes_into_data_dir_not_install_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "ProgramData" / "CogniTara" / "data"
    monkeypatch.setenv("COGNITARA_DATA_DIR", str(data_dir))
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    root_logger = logging.getLogger()
    saved_handlers = list(root_logger.handlers)
    for h in list(root_logger.handlers):
        root_logger.removeHandler(h)

    try:
        logger = setup_logging()
        logger.info("ProgramFiles write-isolation probe")
        rotating = [h for h in root_logger.handlers if isinstance(h, RotatingFileHandler)]
        assert len(rotating) == 1
        log_path = Path(rotating[0].baseFilename)
        assert log_path.parent == data_dir / "logs"
        assert log_path.name == "cognitara.log"
        assert log_path.is_file()
        rotating[0].close()
        root_logger.removeHandler(rotating[0])
    finally:
        for h in saved_handlers:
            root_logger.addHandler(h)


def test_no_hardcoded_relative_static_images_writes_in_routes():
    repo_root = Path(__file__).resolve().parent.parent
    routes_dir = repo_root / "cognitara" / "routes"
    pattern = re.compile(r'os\.path\.join\(\s*["\']static/images["\']')
    offenders = []
    for py_file in routes_dir.rglob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        if pattern.search(text):
            offenders.append(str(py_file.relative_to(repo_root)))
    assert offenders == [], f"Found hardcoded static/images write paths in: {offenders}"


def test_static_images_serves_from_writable_upload_folder(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    db_file = data_dir / "exam.db"
    monkeypatch.setenv("COGNITARA_DATA_DIR", str(data_dir))
    monkeypatch.setenv("COGNITARA_DB_NAME", str(db_file))
    monkeypatch.setenv("COGNITARA_TESTING_BYPASS_LICENSE", "1")

    from cognitara import create_app

    app = create_app({"TESTING": True, "DATABASE_NAME": str(db_file)})
    with app.app_context():
        target = Path(get_upload_path("probe_upload_logo.txt"))
        target.write_text("cognitara-upload-ok", encoding="utf-8")
        assert str(data_dir) in str(target)

    client = app.test_client()
    resp = client.get("/static/images/probe_upload_logo.txt")
    assert resp.status_code == 200
    assert resp.data == b"cognitara-upload-ok"

    resp2 = client.get("/uploads/images/probe_upload_logo.txt")
    assert resp2.status_code == 200
    assert resp2.data == b"cognitara-upload-ok"
