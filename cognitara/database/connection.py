import sqlite3
import os
import sys
import time
import random
import functools
from cognitara.config import Config
from cognitara.database.initialization import ensure_deadline_columns

def with_db_retry(max_retries=5, initial_backoff=0.025, max_backoff=0.5):
    """
    Executes a database write or transaction with exponential backoff and randomized jitter
    when encountering SQLite lock contention (OperationalError: database is locked / busy).
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except sqlite3.OperationalError as e:
                    err_msg = str(e).lower()
                    if "locked" in err_msg or "busy" in err_msg:
                        retries += 1
                        if retries > max_retries:
                            raise
                        sleep_time = min(max_backoff, initial_backoff * (2 ** (retries - 1)))
                        sleep_time += random.uniform(0.005, 0.025)
                        time.sleep(sleep_time)
                    else:
                        raise
        return wrapper
    return decorator

class SafeRow:
    """
    A robust, drop-in replacement for sqlite3.Row that supports .get(key, default=None),
    dictionary conversion, tuple unpacking, column name and integer index access,
    preventing AttributeError when code treats database rows as dict-like objects.
    """
    __slots__ = ('_row',)
    def __init__(self, cursor, row):
        self._row = sqlite3.Row(cursor, row)
    def __getitem__(self, key):
        return self._row[key]
    def __iter__(self):
        return iter(self._row)
    def __len__(self):
        return len(self._row)
    def keys(self):
        return self._row.keys()
    def values(self):
        return tuple(self._row)
    def items(self):
        return [(k, self._row[k]) for k in self._row.keys()]
    def get(self, key, default=None):
        try:
            return self._row[key]
        except (IndexError, KeyError):
            return default
    def __contains__(self, key):
        try:
            return key in self._row.keys()
        except Exception:
            return False
    def __eq__(self, other):
        if isinstance(other, SafeRow):
            return tuple(self._row) == tuple(other._row)
        return tuple(self._row) == other
    def __repr__(self):
        return f"<SafeRow {dict(self)}>"

def get_db_connection(db_name=None, db_path=None):
    """
    Returns an optimized, WAL-mode SQLite database connection with row_factory=SafeRow,
    safe 30s busy timeout, foreign key enforcement, and deadline column validation.
    """
    if db_name is None:
        db_name = db_path
    if db_name is None:
        try:
            from flask import current_app, has_app_context
            if has_app_context() and current_app and current_app.config.get("DATABASE_NAME"):
                db_name = current_app.config.get("DATABASE_NAME")
        except Exception:
            pass
    if db_name is None:
        raw_db = os.environ.get("COGNITARA_DB_NAME", Config.DATABASE_NAME)
        if os.path.isabs(raw_db):
            db_name = os.path.abspath(raw_db)
        else:
            db_name = os.path.abspath(os.path.join(Config.ROOT_DIR, raw_db))
    
    # Enforce strict test isolation guardrail when testing
    if os.environ.get("COGNITARA_STRICT_TEST_ISOLATION") == "1":
        norm_path = os.path.normpath(db_name).lower()
        prod_path = os.path.normpath(os.path.join(Config.ROOT_DIR, "exam.db")).lower()
        if norm_path == prod_path:
            raise RuntimeError(
                "CRITICAL TEST ISOLATION SAFETY VIOLATION: Test suite attempted connection to production exam.db! "
                "Ensure COGNITARA_DB_NAME is set to an isolated disposable test database."
            )
    
    conn = sqlite3.connect(db_name, timeout=30.0)
    conn.row_factory = SafeRow
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA cache_size = -16000")
    conn.execute("PRAGMA temp_store = MEMORY")
    try:
        conn.execute("PRAGMA mmap_size = 67108864")
    except sqlite3.OperationalError:
        pass
    
    ensure_deadline_columns(conn)
    return conn
