"""
Cognitara Examination Portal - Production WSGI Entrypoint
Serves the Flask application via Waitress multi-threaded WSGI server on Windows
(both standalone and when frozen into `cognitara-engine.exe` for CogniTara Studio).
"""

import os
import sys

if getattr(sys, "frozen", False):
    PROJECT_ROOT = os.path.dirname(os.path.abspath(sys.executable))
    BUNDLE_DIR = getattr(sys, "_MEIPASS", PROJECT_ROOT)
    if BUNDLE_DIR not in sys.path:
        sys.path.insert(0, BUNDLE_DIR)
else:
    PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("FLASK_ENV", "production")
from cognitara.config import resolve_data_dir

DATA_ROOT = resolve_data_dir()
default_db_path = os.path.join(DATA_ROOT, "exam.db")
raw_db_env = os.environ.get("COGNITARA_DB_NAME")
if not raw_db_env:
    os.environ["COGNITARA_DB_NAME"] = default_db_path
elif not os.path.isabs(raw_db_env):
    os.environ["COGNITARA_DB_NAME"] = os.path.abspath(os.path.join(DATA_ROOT, raw_db_env))

from app import app
from cognitara.security.license_guard import get_license_guard, should_enforce_license
from waitress import serve

if __name__ == "__main__":
    host = os.environ.get("COGNITARA_HOST", "0.0.0.0")
    port = int(os.environ.get("COGNITARA_PORT", 5000))
    threads = int(os.environ.get("COGNITARA_THREADS", 24))
    conn_limit = int(os.environ.get("COGNITARA_CONN_LIMIT", 300))
    channel_timeout = int(os.environ.get("COGNITARA_CHANNEL_TIMEOUT", 30))
    cleanup_interval = int(os.environ.get("COGNITARA_CLEANUP_INTERVAL", 15))

    guard = get_license_guard()
    if should_enforce_license(app):
        lic_status = guard.evaluate(advance_monotonic=False)
        if os.environ.get("COGNITARA_VAULT_READONLY_WATCHDOG", "").strip() != "1":
            guard.start_watchdog()
        lock_state = lic_status.get("lock_state", "UNACTIVATED")
    else:
        lock_state = "BYPASS_DEV"

    print("=" * 65)
    print("COGNITARA EXAMINATION PORTAL — PRODUCTION WSGI SERVER (WAITRESS)")
    print(f"Binding Address: http://{host}:{port}")
    print(f"Worker Threads:  {threads}")
    print(f"Conn Limit:      {conn_limit}")
    print(f"Channel Timeout: {channel_timeout}s")
    print(f"Active Database: {os.environ.get('COGNITARA_DB_NAME')}")
    print(f"Licence State:   {lock_state}")
    print("=" * 65, flush=True)

    serve(
        app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=conn_limit,
        channel_timeout=channel_timeout,
        cleanup_interval=cleanup_interval,
        backlog=1024,
    )
