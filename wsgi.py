"""
Cognitara Examination Portal - Production WSGI Entrypoint
Serves the Flask application via Waitress multi-threaded WSGI server on Windows.
"""

import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("FLASK_ENV", "production")
default_db_path = os.path.join(PROJECT_ROOT, "exam.db")
raw_db_env = os.environ.get("COGNITARA_DB_NAME")
if not raw_db_env:
    os.environ["COGNITARA_DB_NAME"] = default_db_path
elif not os.path.isabs(raw_db_env):
    os.environ["COGNITARA_DB_NAME"] = os.path.abspath(os.path.join(PROJECT_ROOT, raw_db_env))

from app import app
from waitress import serve

if __name__ == "__main__":
    host = os.environ.get("COGNITARA_HOST", "0.0.0.0")
    port = int(os.environ.get("COGNITARA_PORT", 5000))
    threads = int(os.environ.get("COGNITARA_THREADS", 24))
    conn_limit = int(os.environ.get("COGNITARA_CONN_LIMIT", 300))
    channel_timeout = int(os.environ.get("COGNITARA_CHANNEL_TIMEOUT", 30))
    cleanup_interval = int(os.environ.get("COGNITARA_CLEANUP_INTERVAL", 15))

    print("=" * 65)
    print("COGNITARA EXAMINATION PORTAL — PRODUCTION WSGI SERVER (WAITRESS)")
    print(f"Binding Address: http://{host}:{port}")
    print(f"Worker Threads:  {threads}")
    print(f"Conn Limit:      {conn_limit}")
    print(f"Channel Timeout: {channel_timeout}s")
    print(f"Active Database: {os.environ.get('COGNITARA_DB_NAME')}")
    print("=" * 65)

    serve(
        app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=conn_limit,
        channel_timeout=channel_timeout,
        cleanup_interval=cleanup_interval,
        backlog=1024
    )
