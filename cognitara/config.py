import os
import secrets
import sys
import tempfile


def _ensure_writable_dir(candidate: str) -> bool:
    """Create candidate directory and verify actual write access (crucial on Windows ProgramData/Program Files)."""
    try:
        os.makedirs(candidate, exist_ok=True)
        fd, probe = tempfile.mkstemp(prefix=".ct_write_probe_", dir=candidate)
        os.close(fd)
        try:
            os.remove(probe)
        except OSError:
            pass
        return True
    except OSError:
        return False


def resolve_data_dir() -> str:
    """
    Resolve the authoritative writable CogniTara data directory.
    Priority:
      1. Explicit COGNITARA_DATA_DIR environment variable (if writable)
      2. Frozen binary (`cognitara-engine.exe`):
         %PROGRAMDATA%\\CogniTara\\data -> %LOCALAPPDATA%\\CogniTara\\data -> ~\\CogniTara\\data
      3. Source / dev execution: repository root directory (if writable), else %LOCALAPPDATA%/home fallback.
    Never returns a read-only C:\\Program Files\\ installation directory.
    """
    candidates = []
    env_dir = os.environ.get("COGNITARA_DATA_DIR", "").strip()
    if env_dir:
        candidates.append(os.path.abspath(env_dir))

    is_frozen = getattr(sys, "frozen", False)
    if is_frozen:
        program_data = os.environ.get("PROGRAMDATA") or (r"C:\ProgramData" if sys.platform == "win32" else "")
        if program_data:
            candidates.append(os.path.join(program_data, "CogniTara", "data"))
        local_app = os.environ.get("LOCALAPPDATA")
        if local_app:
            candidates.append(os.path.join(local_app, "CogniTara", "data"))
        candidates.append(os.path.join(os.path.expanduser("~"), "CogniTara", "data"))
    else:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        candidates.append(repo_root)
        local_app = os.environ.get("LOCALAPPDATA")
        if local_app:
            candidates.append(os.path.join(local_app, "CogniTara", "data"))
        candidates.append(os.path.join(os.path.expanduser("~"), "CogniTara", "data"))

    for cand in candidates:
        if cand and _ensure_writable_dir(cand):
            return os.path.abspath(cand)

    fallback = os.path.join(tempfile.gettempdir(), "CogniTara", "data")
    os.makedirs(fallback, exist_ok=True)
    return os.path.abspath(fallback)


def _resolve_root_dir() -> str:
    return resolve_data_dir()


def resolve_logs_dir() -> str:
    """Return writable logs directory inside the resolved CogniTara data directory."""
    primary = os.path.join(resolve_data_dir(), "logs")
    if _ensure_writable_dir(primary):
        return primary
    local_app = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    fallback = os.path.join(local_app, "CogniTara", "data", "logs")
    if _ensure_writable_dir(fallback):
        return fallback
    tmp_fallback = os.path.join(tempfile.gettempdir(), "CogniTara", "logs")
    os.makedirs(tmp_fallback, exist_ok=True)
    return tmp_fallback


def resolve_upload_dir() -> str:
    """Return writable upload directory for user photos, school logos, and question images."""
    primary = os.path.join(resolve_data_dir(), "static", "images")
    if _ensure_writable_dir(primary):
        return primary
    local_app = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    fallback = os.path.join(local_app, "CogniTara", "data", "static", "images")
    if _ensure_writable_dir(fallback):
        return fallback
    tmp_fallback = os.path.join(tempfile.gettempdir(), "CogniTara", "images")
    os.makedirs(tmp_fallback, exist_ok=True)
    return tmp_fallback


def get_upload_path(filename: str) -> str:
    """
    Resolve an uploaded image path inside the active Flask UPLOAD_FOLDER
    (or the authoritative writable CogniTara data directory).
    """
    upload_dir = None
    try:
        from flask import current_app, has_app_context
        if has_app_context() and current_app:
            upload_dir = current_app.config.get("UPLOAD_FOLDER")
    except Exception:
        upload_dir = None
    if not upload_dir:
        upload_dir = resolve_upload_dir()
    os.makedirs(upload_dir, exist_ok=True)
    return os.path.join(upload_dir, os.path.basename(str(filename)))


def get_or_create_secret_key():
    env_key = os.environ.get("COGNITARA_SECRET_KEY")
    if env_key:
        return env_key
    root_dir = resolve_data_dir()
    key_file = os.path.join(root_dir, ".secret_key")
    try:
        if os.path.exists(key_file):
            with open(key_file, "r", encoding="utf-8") as f:
                stored = f.read().strip()
                if stored:
                    return stored
        new_key = secrets.token_hex(32)
        with open(key_file, "w", encoding="utf-8") as f:
            f.write(new_key)
        return new_key
    except Exception:
        return "cognitara_fallback_offline_key_2026_secured"


class Config:
    SECRET_KEY = get_or_create_secret_key()
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.environ.get('COGNITARA_COOKIE_SECURE', 'false').lower() in ('true', '1', 'yes')

    ROOT_DIR = resolve_data_dir()
    LOGS_DIR = resolve_logs_dir()
    UPLOAD_FOLDER = resolve_upload_dir()

    raw_db = os.environ.get("COGNITARA_DB_NAME", "exam.db")
    if os.path.isabs(raw_db):
        DATABASE_NAME = os.path.abspath(raw_db)
    else:
        DATABASE_NAME = os.path.abspath(os.path.join(ROOT_DIR, raw_db))

    # Safe request body limit: 16MB permits large uncompressed high-resolution images while preventing memory exhaustion DoS
    MAX_CONTENT_LENGTH = int(os.environ.get("COGNITARA_MAX_CONTENT_LENGTH", 16 * 1024 * 1024))
    TEMPLATES_AUTO_RELOAD = True

