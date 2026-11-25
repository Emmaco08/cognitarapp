"""
CogniTara v2 — Legacy School Database (exam.db) Inspector & Atomic Migration Engine
(cognitara/services/legacy_db_import.py)

Allows schools upgrading from older CogniTara installations to safely inspect and
import their former `exam.db` SQLite database without losing students, teachers,
exams, questions, results, or Common Entrance records — while:
  1. Verifying SQLite magic header, PRAGMA integrity_check, and CogniTara tables.
  2. Creating an integrity-verified pre-import safety backup automatically.
  3. Staging and running full idempotent v2 schema migrations on an isolated copy.
  4. Upgrading legacy plaintext passwords to salted Werkzeug hashes automatically.
  5. Preserving the active machine's 5-layer `local_license_state` vault table and
     Super Admin login / recovery codes so the school is never locked out.
"""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from werkzeug.security import generate_password_hash

from cognitara.database.bootstrap import ensure_core_database_initialized
from cognitara.database import initialization as db_init
from cognitara.security.passwords import _HASH_PREFIXES

logger = logging.getLogger("cognitara.services.legacy_db_import")

_SQLITE_MAGIC = b"SQLite format 3\x00"
_CORE_SIGNATURE_TABLES = frozenset({
    "students",
    "teachers",
    "exams",
    "questions",
    "admin",
    "scores",
    "ce_exams",
})
_MODERN_REQUIRED_TABLES = frozenset({
    "school_settings",
    "admin_recovery_codes",
    "local_license_state",
    "grading_schemes",
    "classes",
    "exam_sections",
    "exam_question_responses",
    "ce_exams",
    "ce_attempts",
})
_AUTH_PASSWORD_TABLES = (
    "admin",
    "teachers",
    "students",
    "ce_students",
    "pending_registrations",
)


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table,),
    ).fetchone()
    return row is not None


def _table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    if not _table_exists(conn, table):
        return []
    return [str(r[1]) for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]


def _safe_count(conn: sqlite3.Connection, table: str) -> int:
    if not _table_exists(conn, table):
        return 0
    try:
        return int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] or 0)
    except Exception:
        return 0


def _verify_sqlite_file(path: str) -> Tuple[bool, str]:
    if not path or not os.path.isfile(path):
        return False, "The selected database file does not exist."
    try:
        size = os.path.getsize(path)
    except OSError as exc:
        return False, f"Cannot read selected file: {exc}"
    if size < 100:
        return False, "The selected file is too small to be a valid SQLite database."

    try:
        with open(path, "rb") as fh:
            header = fh.read(16)
    except OSError as exc:
        return False, f"Cannot open selected file: {exc}"
    if header != _SQLITE_MAGIC:
        return False, "This file is not a valid SQLite 3 database (.db)."

    conn = None
    try:
        abs_p = os.path.abspath(path)
        conn = sqlite3.connect(f"file:{abs_p}?mode=ro", uri=True, timeout=15.0)
        res = conn.execute("PRAGMA integrity_check").fetchone()
        if not res or str(res[0]).lower() != "ok":
            return False, "The selected SQLite file failed integrity verification (corrupt database)."
        return True, "ok"
    except sqlite3.Error as exc:
        return False, f"Could not open SQLite database: {exc}"
    finally:
        if conn:
            conn.close()


def _count_plaintext_passwords(conn: sqlite3.Connection) -> int:
    total = 0
    for tbl in _AUTH_PASSWORD_TABLES:
        cols = _table_columns(conn, tbl)
        if "password" not in cols:
            continue
        try:
            rows = conn.execute(
                f'SELECT password FROM "{tbl}" WHERE password IS NOT NULL AND TRIM(password) != ""'
            ).fetchall()
            for (pwd,) in rows:
                s = str(pwd)
                if s and not s.startswith(_HASH_PREFIXES):
                    total += 1
        except Exception:
            continue
    return total


def inspect_legacy_database(source_path: str) -> Dict[str, Any]:
    """
    Read-only inspection of a candidate legacy `exam.db` file.
    Never modifies `source_path`.
    """
    ok, msg = _verify_sqlite_file(source_path)
    if not ok:
        return {"ok": False, "error": "invalid_database", "message": msg}

    abs_p = os.path.abspath(source_path)
    file_size = os.path.getsize(abs_p)
    file_name = os.path.basename(abs_p)

    conn = None
    try:
        conn = sqlite3.connect(f"file:{abs_p}?mode=ro", uri=True, timeout=15.0)
        tables = [
            str(r[0])
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
        table_set = set(tables)
        matched_core = sorted(table_set & _CORE_SIGNATURE_TABLES)
        if len(matched_core) < 2:
            return {
                "ok": False,
                "error": "not_cognitara_database",
                "message": "This SQLite file does not look like a CogniTara school database (missing students, teachers, exams, or questions tables).",
            }

        counts = {
            "admins": _safe_count(conn, "admin"),
            "teachers": _safe_count(conn, "teachers"),
            "students": _safe_count(conn, "students"),
            "pending_registrations": _safe_count(conn, "pending_registrations"),
            "exams": _safe_count(conn, "exams"),
            "questions": _safe_count(conn, "questions"),
            "scores": _safe_count(conn, "scores"),
            "ce_exams": _safe_count(conn, "ce_exams"),
            "ce_students": _safe_count(conn, "ce_students"),
            "ce_attempts": _safe_count(conn, "ce_attempts"),
            "classes": _safe_count(conn, "classes"),
        }

        school_name = ""
        academic_session = ""
        current_term = ""
        if _table_exists(conn, "school_settings"):
            cols = _table_columns(conn, "school_settings")
            sel = [c for c in ("school_name", "academic_session", "current_term") if c in cols]
            if sel:
                row = conn.execute(
                    f"SELECT {', '.join(sel)} FROM school_settings WHERE id = 1 LIMIT 1"
                ).fetchone()
                if row:
                    mapped = dict(zip(sel, row))
                    school_name = str(mapped.get("school_name") or "").strip()
                    academic_session = str(mapped.get("academic_session") or "").strip()
                    current_term = str(mapped.get("current_term") or "").strip()

        plaintext_passwords = _count_plaintext_passwords(conn)
        missing_tables = sorted(_MODERN_REQUIRED_TABLES - table_set)

        # Check key modern columns on core tables
        missing_cols: List[str] = []
        col_checks = {
            "students": ("status", "specialisation", "full_name"),
            "teachers": ("teaching_classes",),
            "exams": ("calculator_type", "max_warnings", "result_release_policy", "results_released"),
            "scores": ("authoritative_deadline", "status", "remaining_time"),
        }
        for tbl, req_cols in col_checks.items():
            if tbl in table_set:
                present = set(_table_columns(conn, tbl))
                for col in req_cols:
                    if col not in present:
                        missing_cols.append(f"{tbl}.{col}")

        needs_schema_upgrade = bool(missing_tables or missing_cols)
        has_recovery_codes = _safe_count(conn, "admin_recovery_codes") > 0

        notes: List[str] = []
        if needs_schema_upgrade:
            notes.append(
                f"Older CogniTara schema detected ({len(missing_tables)} tables / {len(missing_cols)} columns will be upgraded automatically)."
            )
        else:
            notes.append("Schema matches current CogniTara v2 structure (full compatibility verified).")

        if plaintext_passwords > 0:
            notes.append(
                f"{plaintext_passwords} legacy account password{'s' if plaintext_passwords != 1 else ''} will be automatically upgraded to salted hashes (users keep their exact same passwords)."
            )
        if not has_recovery_codes:
            notes.append(
                "Legacy database has no Desktop recovery codes — your active Super Admin recovery codes and Desktop licence vault will be preserved automatically."
            )

        return {
            "ok": True,
            "file_path": abs_p,
            "file_name": file_name,
            "file_size_bytes": file_size,
            "table_count": len(tables),
            "school_name": school_name or "Legacy CogniTara School",
            "academic_session": academic_session or "2026/2027",
            "current_term": current_term or "First Term",
            "counts": counts,
            "legacy_plaintext_passwords": plaintext_passwords,
            "needs_schema_upgrade": needs_schema_upgrade,
            "missing_tables": missing_tables,
            "missing_columns": missing_cols,
            "has_recovery_codes": has_recovery_codes,
            "notes": notes,
        }
    except sqlite3.Error as exc:
        return {"ok": False, "error": "inspection_failed", "message": f"Failed to inspect database: {exc}"}
    finally:
        if conn:
            conn.close()


def _snapshot_table_rows(conn: sqlite3.Connection, table: str) -> Tuple[List[str], List[Tuple[Any, ...]]]:
    if not _table_exists(conn, table):
        return [], []
    cols = _table_columns(conn, table)
    if not cols:
        return [], []
    quoted = ", ".join(f'"{c}"' for c in cols)
    rows = conn.execute(f'SELECT {quoted} FROM "{table}"').fetchall()
    return cols, rows


def _restore_license_state_rows(
    conn: sqlite3.Connection,
    lic_cols: List[str],
    lic_rows: List[Tuple[Any, ...]],
) -> None:
    if not lic_cols or not lic_rows or not _table_exists(conn, "local_license_state"):
        return
    dst_cols = set(_table_columns(conn, "local_license_state"))
    valid_indices = [i for i, c in enumerate(lic_cols) if c in dst_cols]
    if not valid_indices:
        return
    use_cols = [lic_cols[i] for i in valid_indices]
    quoted = ", ".join(f'"{c}"' for c in use_cols)
    placeholders = ", ".join("?" for _ in use_cols)
    conn.execute("DELETE FROM local_license_state")
    for r in lic_rows:
        conn.execute(
            f"INSERT OR REPLACE INTO local_license_state ({quoted}) VALUES ({placeholders})",
            [r[i] for i in valid_indices],
        )


def _upgrade_all_plaintext_passwords(conn: sqlite3.Connection) -> int:
    upgraded = 0
    for tbl in _AUTH_PASSWORD_TABLES:
        cols = _table_columns(conn, tbl)
        if "id" not in cols or "password" not in cols:
            continue
        rows = conn.execute(
            f'SELECT id, password FROM "{tbl}" WHERE password IS NOT NULL AND TRIM(password) != ""'
        ).fetchall()
        for row_id, pwd in rows:
            pwd_str = str(pwd)
            if pwd_str and not pwd_str.startswith(_HASH_PREFIXES):
                conn.execute(
                    f'UPDATE "{tbl}" SET password = ? WHERE id = ?',
                    (generate_password_hash(pwd_str), row_id),
                )
                upgraded += 1
    return upgraded


def _normalize_legacy_defaults(conn: sqlite3.Connection) -> None:
    """Backfills safe defaults on legacy rows that may have NULL values in modern columns."""
    fixes = [
        ("students", "status", "UPDATE students SET status = 'approved' WHERE status IS NULL OR TRIM(status) = ''"),
        ("students", "specialisation", "UPDATE students SET specialisation = 'General' WHERE specialisation IS NULL OR TRIM(specialisation) = ''"),
        ("students", "full_name", "UPDATE students SET full_name = username WHERE full_name IS NULL OR TRIM(full_name) = ''"),
        ("students", "photo", "UPDATE students SET photo = 'default.png' WHERE photo IS NULL OR TRIM(photo) = ''"),
        ("teachers", "photo", "UPDATE teachers SET photo = 'default.png' WHERE photo IS NULL OR TRIM(photo) = ''"),
        ("exams", "calculator_type", "UPDATE exams SET calculator_type = 'none' WHERE calculator_type IS NULL OR TRIM(calculator_type) = ''"),
        ("exams", "max_warnings", "UPDATE exams SET max_warnings = 5 WHERE max_warnings IS NULL OR max_warnings <= 0"),
        ("exams", "deactivated", "UPDATE exams SET deactivated = 0 WHERE deactivated IS NULL"),
        ("exams", "subject_tag", "UPDATE exams SET subject_tag = 'General' WHERE subject_tag IS NULL OR TRIM(subject_tag) = ''"),
        ("exams", "specialisation_tag", "UPDATE exams SET specialisation_tag = 'General' WHERE specialisation_tag IS NULL OR TRIM(specialisation_tag) = ''"),
        ("exams", "result_release_policy", "UPDATE exams SET result_release_policy = 'immediate' WHERE result_release_policy IS NULL OR TRIM(result_release_policy) = ''"),
        ("exams", "results_released", "UPDATE exams SET results_released = 1 WHERE results_released IS NULL"),
        ("scores", "results_released", "UPDATE scores SET results_released = 1 WHERE status = 'completed' AND results_released IS NULL"),
        ("scores", "auto_submitted", "UPDATE scores SET auto_submitted = 0 WHERE auto_submitted IS NULL"),
    ]
    for tbl, col, sql in fixes:
        if col in _table_columns(conn, tbl):
            try:
                conn.execute(sql)
            except sqlite3.Error:
                pass

    # Auto-register any custom legacy class names used by students, exams, or teachers into `classes`
    if _table_exists(conn, "classes"):
        cls_cols = set(_table_columns(conn, "classes"))
        discovered: List[str] = []
        for tbl, col in (
            ("students", "class"),
            ("exams", "class"),
            ("teachers", "class"),
            ("teacher_class_assignments", "class_name"),
        ):
            if col in _table_columns(conn, tbl):
                try:
                    for (cname,) in conn.execute(
                        f'SELECT DISTINCT TRIM("{col}") FROM "{tbl}" WHERE "{col}" IS NOT NULL AND TRIM("{col}") != ""'
                    ).fetchall():
                        if cname and cname not in discovered:
                            discovered.append(str(cname))
                except sqlite3.Error:
                    pass
        if discovered and "name" in cls_cols:
            existing_lower = {
                str(r[0]).strip().lower()
                for r in conn.execute("SELECT name FROM classes WHERE name IS NOT NULL").fetchall()
            }
            next_order = 100
            for cname in discovered:
                if cname.lower() in existing_lower:
                    continue
                try:
                    if {"display_order", "level_category", "active"}.issubset(cls_cols):
                        conn.execute(
                            "INSERT OR IGNORE INTO classes (name, display_order, level_category, active) VALUES (?, ?, 'Custom', 1)",
                            (cname, next_order),
                        )
                    else:
                        conn.execute("INSERT OR IGNORE INTO classes (name) VALUES (?)", (cname,))
                    existing_lower.add(cname.lower())
                    next_order += 1
                except sqlite3.Error:
                    pass

    if _table_exists(conn, "school_settings") and _safe_count(conn, "school_settings") == 0:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO school_settings (id, school_name, academic_session, current_term) VALUES (1, 'CogniTara High School', '2026/2027', 'First Term')"
            )
        except sqlite3.Error:
            pass

    if _table_exists(conn, "ce_settings") and _safe_count(conn, "ce_settings") == 0:
        try:
            conn.execute(
                "INSERT OR IGNORE INTO ce_settings (id, portal_title, institution_name) VALUES (1, 'Common Entrance Examination Portal', 'CogniTara High School')"
            )
        except sqlite3.Error:
            pass


def _merge_admin_and_recovery_codes(
    conn: sqlite3.Connection,
    prev_admins: List[Tuple[int, str, str]],
    prev_codes: List[Tuple[Any, ...]],
    prev_code_cols: List[str],
    preserve_current_admin: bool,
) -> Dict[str, Any]:
    """
    Ensures the school admin is never locked out and Desktop onboarding recovery codes
    never regress to 0 rows after importing a legacy exam.db.
    """
    preserved_admin_usernames: List[str] = []
    old_to_new_admin_id: Dict[int, int] = {}

    imported_admin_count = _safe_count(conn, "admin")
    should_keep_admins = preserve_current_admin or imported_admin_count == 0

    if should_keep_admins and prev_admins:
        for old_id, uname, pwd in prev_admins:
            uname_clean = str(uname or "").strip()
            if not uname_clean:
                continue
            existing = conn.execute(
                "SELECT id FROM admin WHERE LOWER(username) = LOWER(?) LIMIT 1",
                (uname_clean,),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE admin SET password = ? WHERE id = ?",
                    (pwd, existing[0]),
                )
                old_to_new_admin_id[int(old_id)] = int(existing[0])
            else:
                cur = conn.execute(
                    "INSERT INTO admin (username, password) VALUES (?, ?)",
                    (uname_clean, pwd),
                )
                old_to_new_admin_id[int(old_id)] = int(cur.lastrowid)
            preserved_admin_usernames.append(uname_clean)

    # Always ensure recovery codes exist if the previous DB had them and the imported DB didn't (or when preserving current admin)
    imported_code_count = _safe_count(conn, "admin_recovery_codes")
    preserved_codes = 0
    if prev_codes and prev_code_cols and (preserve_current_admin or imported_code_count == 0):
        dst_cols = set(_table_columns(conn, "admin_recovery_codes"))
        if {"admin_id", "code_hash"}.issubset(dst_cols):
            first_admin = conn.execute("SELECT id FROM admin ORDER BY id ASC LIMIT 1").fetchone()
            fallback_admin_id = int(first_admin[0]) if first_admin else None
            if fallback_admin_id is not None:
                idx_map = {c: i for i, c in enumerate(prev_code_cols)}
                existing_hashes = {
                    str(r[0]) for r in conn.execute("SELECT code_hash FROM admin_recovery_codes").fetchall()
                }
                for row in prev_codes:
                    code_hash = str(row[idx_map["code_hash"]])
                    if not code_hash or code_hash in existing_hashes:
                        continue
                    orig_aid = int(row[idx_map["admin_id"]]) if row[idx_map["admin_id"]] is not None else -1
                    mapped_aid = old_to_new_admin_id.get(orig_aid, fallback_admin_id)
                    used_val = row[idx_map["used"]] if "used" in idx_map else 0
                    used_at = row[idx_map["used_at"]] if "used_at" in idx_map else None
                    conn.execute(
                        "INSERT INTO admin_recovery_codes (admin_id, code_hash, used, used_at) VALUES (?, ?, ?, ?)",
                        (mapped_aid, code_hash, used_val, used_at),
                    )
                    existing_hashes.add(code_hash)
                    preserved_codes += 1

    return {
        "preserved_admin_usernames": preserved_admin_usernames,
        "preserved_recovery_codes": preserved_codes,
    }


def _backup_sqlite_file(src_path: str, dst_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(dst_path)), exist_ok=True)
    src_conn = None
    dst_conn = None
    try:
        src_conn = sqlite3.connect(src_path, timeout=30.0)
        try:
            src_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:
            pass
        dst_conn = sqlite3.connect(dst_path, timeout=30.0)
        src_conn.backup(dst_conn)
        dst_conn.commit()
    finally:
        if dst_conn:
            dst_conn.close()
        if src_conn:
            src_conn.close()


def _clear_checked_db_cache(*paths: str) -> None:
    for p in paths:
        if not p:
            continue
        for candidate in (p, os.path.abspath(p)):
            db_init._CHECKED_DBS.discard(candidate)


def _count_in_progress_exams(db_path: str) -> int:
    if not os.path.isfile(db_path):
        return 0
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=10.0)
        total = 0
        if _table_exists(conn, "scores") and "status" in _table_columns(conn, "scores"):
            total += int(
                conn.execute("SELECT COUNT(*) FROM scores WHERE status = 'in_progress'").fetchone()[0] or 0
            )
        if _table_exists(conn, "ce_attempts") and "status" in _table_columns(conn, "ce_attempts"):
            total += int(
                conn.execute("SELECT COUNT(*) FROM ce_attempts WHERE status = 'in_progress'").fetchone()[0] or 0
            )
        return total
    except Exception:
        return 0
    finally:
        if conn:
            conn.close()


def restore_database_with_vault_preservation(
    source_path: str,
    active_db_path: str,
    backup_dir: str,
    *,
    safety_prefix: str = "exam_pre_restore",
    preserve_current_admin: bool = False,
    hash_legacy_passwords: bool = False,
    allow_during_active_exam: bool = False,
) -> Dict[str, Any]:
    """
    Shared atomic restore/import pipeline used by:
      - Legacy School Database Import (Settings -> Import exam.db)
      - Local Backup Restore
      - Encrypted Cloud Snapshot Restore

    Always takes a verified safety backup of `active_db_path`, preserves
    `local_license_state` (5-layer vault sync) + recovery codes, runs full
    idempotent schema migrations on a staged copy, and swaps cleanly into
    `active_db_path` via online `sqlite3.backup()`.
    """
    inspection = inspect_legacy_database(source_path)
    if not inspection.get("ok"):
        return inspection

    active_abs = os.path.abspath(active_db_path)
    os.makedirs(backup_dir, exist_ok=True)

    active_live = _count_in_progress_exams(active_abs)
    if active_live > 0 and not allow_during_active_exam:
        return {
            "ok": False,
            "error": "active_exams_in_progress",
            "active_exams": active_live,
            "message": f"{active_live} live exam session{'s are' if active_live != 1 else ' is'} currently in progress. Finish or pause active exams before importing a database.",
        }

    # 1. Safety snapshot of current active DB before modifying anything
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safety_name = f"{safety_prefix}_{stamp}.db"
    safety_path = os.path.join(backup_dir, safety_name)

    lic_cols: List[str] = []
    lic_rows: List[Tuple[Any, ...]] = []
    prev_school_cols: List[str] = []
    prev_school_rows: List[Tuple[Any, ...]] = []
    prev_admins: List[Tuple[int, str, str]] = []
    prev_code_cols: List[str] = []
    prev_codes: List[Tuple[Any, ...]] = []
    legacy_lacked_school_settings = "school_settings" in (inspection.get("missing_tables") or [])

    if os.path.isfile(active_abs):
        try:
            _backup_sqlite_file(active_abs, safety_path)
            s_ok, s_msg = _verify_sqlite_file(safety_path)
            if not s_ok:
                return {
                    "ok": False,
                    "error": "safety_backup_failed",
                    "message": f"Pre-import safety backup failed verification: {s_msg}",
                }
        except Exception as exc:
            logger.error("Safety backup failed before import/restore: %s", exc)
            return {
                "ok": False,
                "error": "safety_backup_failed",
                "message": f"Could not create safety backup before importing: {exc}",
            }

        # Snapshot license vault state, active school profile, active admins, and recovery codes
        cur_conn = None
        try:
            cur_conn = sqlite3.connect(active_abs, timeout=20.0)
            lic_cols, lic_rows = _snapshot_table_rows(cur_conn, "local_license_state")
            if legacy_lacked_school_settings:
                prev_school_cols, prev_school_rows = _snapshot_table_rows(cur_conn, "school_settings")
            if _table_exists(cur_conn, "admin"):
                a_cols = _table_columns(cur_conn, "admin")
                if {"id", "username", "password"}.issubset(set(a_cols)):
                    prev_admins = [
                        (int(r[0]), str(r[1]), str(r[2]))
                        for r in cur_conn.execute("SELECT id, username, password FROM admin").fetchall()
                    ]
            prev_code_cols, prev_codes = _snapshot_table_rows(cur_conn, "admin_recovery_codes")
        finally:
            if cur_conn:
                cur_conn.close()
    else:
        safety_name = ""

    # 2. Stage copy in isolated temp directory, migrate schema, upgrade passwords, preserve vault
    passwords_upgraded = 0
    admin_merge_info: Dict[str, Any] = {
        "preserved_admin_usernames": [],
        "preserved_recovery_codes": 0,
    }
    final_counts: Dict[str, int] = {}
    final_school_name = inspection.get("school_name", "CogniTara High School")

    with tempfile.TemporaryDirectory(prefix="cognitara_legacy_import_") as tmpdir:
        staged_db = os.path.join(tmpdir, "staged_import.db")
        try:
            shutil.copy2(os.path.abspath(source_path), staged_db)
        except OSError as exc:
            return {"ok": False, "error": "stage_copy_failed", "message": f"Could not read source file: {exc}"}

        # Full idempotent v2.2.x schema migration on staged copy
        _clear_checked_db_cache(staged_db, active_abs)
        try:
            ensure_core_database_initialized(staged_db, seed_sample_users=False)
        except Exception as exc:
            logger.error("Schema migration on staged legacy DB failed: %s", exc)
            return {
                "ok": False,
                "error": "schema_migration_failed",
                "message": f"Database schema upgrade failed: {exc}",
            }

        st_conn = None
        try:
            st_conn = sqlite3.connect(staged_db, timeout=30.0)
            st_conn.execute("PRAGMA foreign_keys = OFF")
            _normalize_legacy_defaults(st_conn)
            if legacy_lacked_school_settings and prev_school_cols and prev_school_rows and _table_exists(st_conn, "school_settings"):
                dst_s_cols = set(_table_columns(st_conn, "school_settings"))
                valid_idx = [i for i, c in enumerate(prev_school_cols) if c in dst_s_cols]
                if valid_idx:
                    use_c = [prev_school_cols[i] for i in valid_idx]
                    quoted_s_cols = ", ".join('"' + col + '"' for col in use_c)
                    q_marks = ", ".join("?" for _ in use_c)
                    st_conn.execute("DELETE FROM school_settings")
                    for sr in prev_school_rows:
                        st_conn.execute(
                            f"INSERT OR REPLACE INTO school_settings ({quoted_s_cols}) VALUES ({q_marks})",
                            [sr[i] for i in valid_idx],
                        )
            if hash_legacy_passwords:
                passwords_upgraded = _upgrade_all_plaintext_passwords(st_conn)
            _restore_license_state_rows(st_conn, lic_cols, lic_rows)
            admin_merge_info = _merge_admin_and_recovery_codes(
                st_conn,
                prev_admins=prev_admins,
                prev_codes=prev_codes,
                prev_code_cols=prev_code_cols,
                preserve_current_admin=preserve_current_admin,
            )
            st_conn.commit()
            st_conn.execute("PRAGMA foreign_keys = ON")
            st_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

            chk = st_conn.execute("PRAGMA integrity_check").fetchone()
            if not chk or str(chk[0]).lower() != "ok":
                return {
                    "ok": False,
                    "error": "staged_integrity_failed",
                    "message": "Migrated database failed SQLite integrity verification. Your active database was not modified.",
                }

            for tbl in ("admin", "teachers", "students", "exams", "questions", "scores", "ce_exams", "ce_students", "classes"):
                final_counts[tbl] = _safe_count(st_conn, tbl)
            row = st_conn.execute("SELECT school_name FROM school_settings WHERE id = 1 LIMIT 1").fetchone()
            if row and row[0]:
                final_school_name = str(row[0]).strip()
        except Exception as exc:
            logger.error("Staged legacy DB post-processing failed: %s", exc)
            return {
                "ok": False,
                "error": "migration_postprocess_failed",
                "message": f"Could not finalize database migration: {exc}",
            }
        finally:
            if st_conn:
                st_conn.close()

        # 3. Atomic online swap into active exam.db
        try:
            _backup_sqlite_file(staged_db, active_abs)
            _clear_checked_db_cache(active_abs)
            v_ok, v_msg = _verify_sqlite_file(active_abs)
            if not v_ok:
                # Auto-rollback from safety backup if swap verification ever failed
                if safety_name and os.path.isfile(safety_path):
                    _backup_sqlite_file(safety_path, active_abs)
                return {
                    "ok": False,
                    "error": "swap_integrity_failed",
                    "message": f"Database verification failed after import (automatically rolled back): {v_msg}",
                }
        except Exception as exc:
            logger.error("Atomic DB swap failed: %s", exc)
            if safety_name and os.path.isfile(safety_path):
                try:
                    _backup_sqlite_file(safety_path, active_abs)
                except Exception:
                    pass
            return {
                "ok": False,
                "error": "restore_failed",
                "message": f"Could not write migrated database: {exc}",
            }

    return {
        "ok": True,
        "school_name": final_school_name,
        "safety_snapshot": safety_name,
        "counts": final_counts,
        "passwords_upgraded": passwords_upgraded,
        "schema_upgraded": bool(inspection.get("needs_schema_upgrade")),
        "license_state_preserved": len(lic_rows) > 0,
        "preserved_admin_usernames": admin_merge_info.get("preserved_admin_usernames", []),
        "preserved_recovery_codes": admin_merge_info.get("preserved_recovery_codes", 0),
    }


def import_legacy_database(
    source_path: str,
    active_db_path: str,
    backup_dir: str,
    *,
    preserve_current_admin: bool = True,
    allow_during_active_exam: bool = False,
) -> Dict[str, Any]:
    """High-level entry point for importing a legacy school `exam.db`."""
    return restore_database_with_vault_preservation(
        source_path=source_path,
        active_db_path=active_db_path,
        backup_dir=backup_dir,
        safety_prefix="exam_pre_legacy_import",
        preserve_current_admin=preserve_current_admin,
        hash_legacy_passwords=True,
        allow_during_active_exam=allow_during_active_exam,
    )
