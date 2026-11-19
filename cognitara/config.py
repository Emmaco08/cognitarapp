import os
import secrets
import sys


def _resolve_root_dir():
    if os.environ.get("COGNITARA_DATA_DIR"):
        data_dir = os.path.abspath(os.environ["COGNITARA_DATA_DIR"])
        os.makedirs(data_dir, exist_ok=True)
        return data_dir
    if getattr(sys, "frozen", False):
        base = os.environ.get("PROGRAMDATA") or os.environ.get("LOCALAPPDATA") or os.path.dirname(os.path.abspath(sys.executable))
        data_dir = os.path.join(base, "CogniTara", "data")
        try:
            os.makedirs(data_dir, exist_ok=True)
            return data_dir
        except OSError:
            fallback = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "CogniTara", "data")
            os.makedirs(fallback, exist_ok=True)
            return fallback
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_or_create_secret_key():
    env_key = os.environ.get("COGNITARA_SECRET_KEY")
    if env_key:
        return env_key
    root_dir = _resolve_root_dir()
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

    ROOT_DIR = _resolve_root_dir()
    UPLOAD_FOLDER = os.path.join(ROOT_DIR, "static", "images")
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    raw_db = os.environ.get("COGNITARA_DB_NAME", "exam.db")
    if os.path.isabs(raw_db):
        DATABASE_NAME = os.path.abspath(raw_db)
    else:
        DATABASE_NAME = os.path.abspath(os.path.join(ROOT_DIR, raw_db))
    
    # Safe request body limit: 16MB permits large uncompressed high-resolution images while preventing memory exhaustion DoS
    MAX_CONTENT_LENGTH = int(os.environ.get("COGNITARA_MAX_CONTENT_LENGTH", 16 * 1024 * 1024))
    TEMPLATES_AUTO_RELOAD = True
