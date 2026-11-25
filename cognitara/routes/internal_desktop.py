"""
CogniTara v2 — Authenticated Localhost-Only Desktop Control API
(cognitara/routes/internal_desktop.py)

Communicates exclusively with the Electron main process over loopback using a
per-launch cryptographically random bearer token (`COGNITARA_DESKTOP_TOKEN`).
Never reachable from the school LAN or without the launch token.
"""

from __future__ import annotations

import base64
import gzip
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from flask import Blueprint, current_app, jsonify, request
from werkzeug.security import generate_password_hash

from cognitara.config import Config
from cognitara.database.connection import get_db_connection
from cognitara.database.initialization import init_license_tables
from cognitara.extensions import csrf
from cognitara.routes.preview import _collect_live_telemetry
from cognitara.security.license_guard import get_license_guard
from cognitara.services.legacy_db_import import (
    import_legacy_database,
    inspect_legacy_database,
    restore_database_with_vault_preservation,
)

logger = logging.getLogger("cognitara.routes.internal_desktop")

internal_desktop_bp = Blueprint("internal_desktop", __name__, url_prefix="/api/internal")
csrf.exempt(internal_desktop_bp)

_PROCESS_START_MONO = time.monotonic()
_PROCESS_START_UTC = int(time.time())
_LOOPBACK_ADDRS = frozenset({"127.0.0.1", "::1", "::ffff:127.0.0.1"})


def _extract_request_token() -> str:
    header_tok = request.headers.get("X-CogniTara-Desktop-Token", "").strip()
    if header_tok:
        return header_tok
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return ""


@internal_desktop_bp.before_request
def _authenticate_desktop_request():
    remote = (request.remote_addr or "").strip()
    if remote and remote not in _LOOPBACK_ADDRS:
        logger.warning("Blocked non-loopback internal API request from %s", remote)
        return jsonify({"ok": False, "error": "loopback_only"}), 403

    expected_token = (
        current_app.config.get("DESKTOP_CONTROL_TOKEN")
        or os.environ.get("COGNITARA_DESKTOP_TOKEN")
        or ""
    ).strip()
    if not expected_token:
        return jsonify({"ok": False, "error": "desktop_control_disabled"}), 503

    provided_token = _extract_request_token()
    if not provided_token or not hmac.compare_digest(provided_token, expected_token):
        return jsonify({"ok": False, "error": "invalid_desktop_token"}), 401
    return None


def _get_guard():
    return current_app.extensions.get("license_guard") or get_license_guard()


def _resolve_active_db_path() -> str:
    db_name = current_app.config.get("DATABASE_NAME") or os.environ.get("COGNITARA_DB_NAME") or Config.DATABASE_NAME
    if os.path.isabs(db_name):
        return os.path.abspath(db_name)
    return os.path.abspath(os.path.join(Config.ROOT_DIR, db_name))


def _resolve_backup_dir() -> str:
    env_dir = current_app.config.get("BACKUP_DIR") or os.environ.get("COGNITARA_BACKUP_DIR")
    if env_dir:
        os.makedirs(env_dir, exist_ok=True)
        return os.path.abspath(env_dir)
    if sys.platform == "win32":
        program_data = os.environ.get("PROGRAMDATA") or r"C:\ProgramData"
        candidate = os.path.join(program_data, "CogniTara", "Backups")
        try:
            os.makedirs(candidate, exist_ok=True)
            return candidate
        except OSError:
            local_app = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
            fallback = os.path.join(local_app, "CogniTara", "Backups")
            os.makedirs(fallback, exist_ok=True)
            return fallback
    fallback = os.path.join(Config.ROOT_DIR, "backups")
    os.makedirs(fallback, exist_ok=True)
    return os.path.abspath(fallback)


def _format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.0f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def _verify_sqlite_integrity(path: str) -> bool:
    conn = None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10.0)
        row = conn.execute("PRAGMA integrity_check").fetchone()
        return bool(row and str(row[0]).strip().lower() == "ok")
    except Exception:
        return False
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


# =============================================================================
# License Control Routes
# =============================================================================

@internal_desktop_bp.route("/license-status", methods=["GET"])
def api_internal_license_status():
    guard = _get_guard()
    status = guard.evaluate(advance_monotonic=False)
    return jsonify({"ok": True, "license": status}), 200


@internal_desktop_bp.route("/license/activate", methods=["POST"])
def api_internal_license_activate():
    data = request.get_json(silent=True) or {}
    guard = _get_guard()

    lease_obj = data.get("lease")
    if isinstance(lease_obj, str):
        try:
            lease_obj = json.loads(lease_obj)
        except Exception:
            return jsonify({"ok": False, "error": "invalid_lease_json"}), 400

    if isinstance(lease_obj, dict):
        res = guard.activate_lease(lease_obj)
        code = 200 if res.get("ok") else 400
        return jsonify(res), code

    license_key = str(data.get("license_key") or "").strip()
    if license_key:
        res = guard.activate_online(license_key, cloud_base_url=data.get("cloud_url"))
        code = 200 if res.get("ok") else 400
        return jsonify(res), code

    return jsonify({"ok": False, "error": "missing_lease_or_license_key"}), 400


@internal_desktop_bp.route("/license/checkin", methods=["POST"])
def api_internal_license_checkin():
    data = request.get_json(silent=True) or {}
    guard = _get_guard()
    res = guard.perform_heartbeat(cloud_base_url=data.get("cloud_url"))
    code = 200 if res.get("ok") else (403 if res.get("revoked") else 502)
    return jsonify(res), code


@internal_desktop_bp.route("/license/recheck", methods=["POST"])
def api_internal_license_recheck():
    guard = _get_guard()
    status = guard.evaluate(advance_monotonic=False)
    return jsonify({"ok": True, "license": status}), 200


@internal_desktop_bp.route("/license/start-trial", methods=["POST"])
def api_internal_license_start_trial():
    data = request.get_json(silent=True) or {}
    guard = _get_guard()
    res = guard.activate_trial(school_name=data.get("school_name"))
    code = 200 if res.get("ok") else 400
    return jsonify(res), code


@internal_desktop_bp.route("/license/repair-vault", methods=["POST"])
def api_internal_license_repair_vault():
    guard = _get_guard()
    res = guard.repair_or_reset_corrupt_vault()
    code = 200 if res.get("ok") else 403
    return jsonify(res), code


# =============================================================================
# Live Telemetry & Active Exam Proctor Controls
# =============================================================================

def _collect_live_exams_payload() -> Dict[str, Any]:
    active_exams: List[Dict[str, Any]] = []
    attention: List[Dict[str, Any]] = []

    conn = None
    try:
        conn = get_db_connection()
        now_utc = datetime.now(timezone.utc)

        # Regular in-progress exams
        try:
            reg_rows = conn.execute("""
                SELECT e.id AS exam_id, e.name, e.class AS target_class, e.duration,
                       COUNT(s.id) AS writing_count,
                       SUM(COALESCE(s.warnings_count, 0)) AS total_warnings,
                       MIN(COALESCE(s.remaining_time, e.duration * 60)) AS min_remaining
                FROM scores s
                JOIN exams e ON e.id = s.exam_id
                WHERE s.status = 'in_progress'
                GROUP BY e.id, e.name, e.class, e.duration
                ORDER BY writing_count DESC, e.id DESC
            """).fetchall()
            for r in reg_rows:
                cls_name = r["target_class"] or "General"
                total_cls = conn.execute(
                    "SELECT COUNT(*) FROM students WHERE class = ? AND status = 'approved'",
                    (cls_name,),
                ).fetchone()[0]
                writing = int(r["writing_count"] or 0)
                total = max(writing, int(total_cls or 0))
                dur_sec = max(60, int(r["duration"] or 30) * 60)
                min_rem = max(0, int(r["min_remaining"] or 0))
                progress = min(100.0, max(0.0, ((dur_sec - min_rem) / dur_sec) * 100.0))
                active_exams.append({
                    "exam_id": int(r["exam_id"]),
                    "exam_type": "regular",
                    "name": r["name"] or "School Examination",
                    "class": cls_name,
                    "writing": writing,
                    "total": total,
                    "progress": round(progress, 1),
                    "warnings": int(r["total_warnings"] or 0),
                    "left_seconds": min_rem,
                })
        except Exception as exc:
            logger.debug("Live regular exams query degraded: %s", exc)

        # Common Entrance in-progress exams
        try:
            ce_rows = conn.execute("""
                SELECT e.id AS exam_id, e.name, e.target_class, e.duration,
                       COUNT(a.id) AS writing_count,
                       SUM(COALESCE(a.warnings_count, 0)) AS total_warnings,
                       MIN(COALESCE(a.remaining_time, e.duration * 60)) AS min_remaining
                FROM ce_attempts a
                JOIN ce_exams e ON e.id = a.exam_id
                WHERE a.status = 'in_progress'
                GROUP BY e.id, e.name, e.target_class, e.duration
                ORDER BY writing_count DESC, e.id DESC
            """).fetchall()
            for r in ce_rows:
                total_ce = conn.execute(
                    "SELECT COUNT(*) FROM ce_students WHERE exam_id = ?",
                    (r["exam_id"],),
                ).fetchone()[0]
                writing = int(r["writing_count"] or 0)
                total = max(writing, int(total_ce or 0))
                dur_sec = max(60, int(r["duration"] or 60) * 60)
                min_rem = max(0, int(r["min_remaining"] or 0))
                progress = min(100.0, max(0.0, ((dur_sec - min_rem) / dur_sec) * 100.0))
                active_exams.append({
                    "exam_id": int(r["exam_id"]),
                    "exam_type": "common_entrance",
                    "name": r["name"] or "Common Entrance",
                    "class": r["target_class"] or "Entrance",
                    "writing": writing,
                    "total": total,
                    "progress": round(progress, 1),
                    "warnings": int(r["total_warnings"] or 0),
                    "left_seconds": min_rem,
                })
        except Exception as exc:
            logger.debug("Live CE exams query degraded: %s", exc)

        # Attention queue: paused or high-warning regular candidates
        try:
            paused_reg = conn.execute("""
                SELECT s.id AS attempt_id, st.full_name, st.username, st.class AS cls,
                       s.is_paused, s.pause_reason, s.warnings_count, e.name AS exam_name
                FROM scores s
                JOIN students st ON st.id = s.student_id
                JOIN exams e ON e.id = s.exam_id
                WHERE s.status = 'in_progress' AND (COALESCE(s.is_paused, 0) = 1 OR COALESCE(s.warnings_count, 0) >= 2)
                ORDER BY s.is_paused DESC, s.warnings_count DESC
                LIMIT 12
            """).fetchall()
            for p in paused_reg:
                name = p["full_name"] or p["username"] or "Student"
                reason = p["pause_reason"] or (
                    f"Paused during {p['exam_name']}"
                    if p["is_paused"]
                    else f"Recorded {p['warnings_count']} tab-switch warnings in {p['exam_name']}"
                )
                attention.append({
                    "attempt_id": int(p["attempt_id"]),
                    "exam_type": "regular",
                    "student_name": name,
                    "detail": f"{p['cls'] or 'Class'} · {reason}",
                    "can_resume": bool(p["is_paused"]),
                })
        except Exception as exc:
            logger.debug("Attention regular query degraded: %s", exc)

        # Attention queue: paused or high-warning CE candidates
        try:
            paused_ce = conn.execute("""
                SELECT a.id AS attempt_id, cs.full_name, cs.username, e.target_class AS cls,
                       a.is_paused, a.pause_reason, a.warnings_count, e.name AS exam_name
                FROM ce_attempts a
                JOIN ce_students cs ON cs.id = a.student_id
                JOIN ce_exams e ON e.id = a.exam_id
                WHERE a.status = 'in_progress' AND (COALESCE(a.is_paused, 0) = 1 OR COALESCE(a.warnings_count, 0) >= 2)
                ORDER BY a.is_paused DESC, a.warnings_count DESC
                LIMIT 12
            """).fetchall()
            for p in paused_ce:
                name = p["full_name"] or p["username"] or "Candidate"
                reason = p["pause_reason"] or (
                    f"Paused during {p['exam_name']}"
                    if p["is_paused"]
                    else f"Recorded {p['warnings_count']} warnings in {p['exam_name']}"
                )
                attention.append({
                    "attempt_id": int(p["attempt_id"]),
                    "exam_type": "common_entrance",
                    "student_name": name,
                    "detail": f"{p['cls'] or 'Common Entrance'} · {reason}",
                    "can_resume": bool(p["is_paused"]),
                })
        except Exception as exc:
            logger.debug("Attention CE query degraded: %s", exc)

        _ = now_utc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    total_writing = sum(e["writing"] for e in active_exams)
    return {
        "active_exams": active_exams,
        "attention": attention,
        "total_writing": total_writing,
    }


@internal_desktop_bp.route("/telemetry", methods=["GET"])
def api_internal_telemetry():
    telemetry = _collect_live_telemetry()
    live = _collect_live_exams_payload()
    guard = _get_guard()
    lic = guard.evaluate(advance_monotonic=False)
    uptime_seconds = max(0, int(time.monotonic() - _PROCESS_START_MONO))

    return jsonify({
        "ok": True,
        "telemetry": telemetry,
        "live": live,
        "license": lic,
        "uptime_seconds": uptime_seconds,
        "started_at_utc": _PROCESS_START_UTC,
        "backup_dir": _resolve_backup_dir(),
    }), 200


@internal_desktop_bp.route("/live-exams", methods=["GET"])
def api_internal_live_exams():
    return jsonify({"ok": True, **_collect_live_exams_payload()}), 200


@internal_desktop_bp.route("/live-exams/extend", methods=["POST"])
def api_internal_live_exams_extend():
    data = request.get_json(silent=True) or {}
    exam_id = data.get("exam_id")
    exam_type = str(data.get("exam_type") or "regular").lower()
    try:
        minutes = max(1, min(120, int(data.get("minutes", 5))))
    except (TypeError, ValueError):
        minutes = 5
    delta_sec = minutes * 60

    if not exam_id:
        return jsonify({"ok": False, "error": "missing_exam_id"}), 400

    conn = get_db_connection()
    try:
        table = "ce_attempts" if exam_type == "common_entrance" else "scores"
        cur = conn.execute(
            f"""
            UPDATE {table}
            SET remaining_time = COALESCE(remaining_time, 0) + ?,
                time_adjust_delta = COALESCE(time_adjust_delta, 0) + ?,
                authoritative_deadline = CASE
                    WHEN authoritative_deadline IS NOT NULL
                    THEN DATETIME(authoritative_deadline, '+' || ? || ' seconds')
                    ELSE authoritative_deadline
                END,
                time_adjusted_at = CURRENT_TIMESTAMP
            WHERE exam_id = ? AND status = 'in_progress'
            """,
            (delta_sec, delta_sec, delta_sec, int(exam_id)),
        )
        conn.commit()
        return jsonify({"ok": True, "updated": cur.rowcount, "minutes_added": minutes}), 200
    finally:
        conn.close()


@internal_desktop_bp.route("/live-exams/pause-all", methods=["POST"])
def api_internal_live_exams_pause_all():
    conn = get_db_connection()
    try:
        reason = "Paused by Super Admin from CogniTara Studio"
        r1 = conn.execute(
            """
            UPDATE scores
            SET is_paused = 1, paused_at = CURRENT_TIMESTAMP,
                paused_by = 'SuperAdmin', pause_reason = ?
            WHERE status = 'in_progress' AND COALESCE(is_paused, 0) = 0
            """,
            (reason,),
        ).rowcount
        r2 = conn.execute(
            """
            UPDATE ce_attempts
            SET is_paused = 1, paused_at = CURRENT_TIMESTAMP,
                paused_by = 'SuperAdmin', pause_reason = ?
            WHERE status = 'in_progress' AND COALESCE(is_paused, 0) = 0
            """,
            (reason,),
        ).rowcount
        conn.commit()
        return jsonify({"ok": True, "paused_regular": r1, "paused_ce": r2, "total_paused": r1 + r2}), 200
    finally:
        conn.close()


@internal_desktop_bp.route("/live-exams/resume", methods=["POST"])
def api_internal_live_exams_resume():
    data = request.get_json(silent=True) or {}
    attempt_id = data.get("attempt_id")
    exam_type = str(data.get("exam_type") or "regular").lower()
    if not attempt_id:
        return jsonify({"ok": False, "error": "missing_attempt_id"}), 400

    conn = get_db_connection()
    try:
        table = "ce_attempts" if exam_type == "common_entrance" else "scores"
        cur = conn.execute(
            f"""
            UPDATE {table}
            SET is_paused = 0, paused_at = NULL, pause_reason = NULL,
                last_heartbeat = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'in_progress'
            """,
            (int(attempt_id),),
        )
        conn.commit()
        return jsonify({"ok": True, "resumed": cur.rowcount > 0}), 200
    finally:
        conn.close()


# =============================================================================
# Hot SQLite Backups (`sqlite3.backup()`) & Verified Restore
# =============================================================================

@internal_desktop_bp.route("/backups", methods=["GET"])
def api_internal_list_backups():
    backup_dir = _resolve_backup_dir()
    items: List[Dict[str, Any]] = []
    try:
        for name in os.listdir(backup_dir):
            if not name.endswith(".db"):
                continue
            full = os.path.join(backup_dir, name)
            if not os.path.isfile(full):
                continue
            st = os.stat(full)
            kind = "Manual"
            lower = name.lower()
            if "auto" in lower:
                kind = "Automatic"
            elif "pre_legacy_import" in lower:
                kind = "Pre-import"
            elif "pre_restore" in lower or "pre_cloud_restore" in lower:
                kind = "Pre-restore"
            elif "pre_exam" in lower:
                kind = "Before exam"
            items.append({
                "filename": name,
                "type": kind,
                "size_bytes": st.st_size,
                "size_label": _format_size(st.st_size),
                "created_at_utc": int(st.st_mtime),
                "created_label": datetime.fromtimestamp(st.st_mtime).strftime("%d %b %Y, %H:%M"),
                "verified": True,
            })
        items.sort(key=lambda x: x["created_at_utc"], reverse=True)
    except OSError as exc:
        logger.warning("Backup directory listing error: %s", exc)
    return jsonify({"ok": True, "backup_dir": backup_dir, "backups": items}), 200


@internal_desktop_bp.route("/hot-backup", methods=["POST"])
def api_internal_hot_backup():
    data = request.get_json(silent=True) or {}
    kind = re.sub(r"[^a-z_]", "", str(data.get("type") or "manual").lower()) or "manual"
    src_path = _resolve_active_db_path()
    backup_dir = _resolve_backup_dir()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"exam_{kind}_{stamp}.db"
    dst_path = os.path.join(backup_dir, filename)

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
    except Exception as exc:
        logger.error("Hot backup failed: %s", exc)
        return jsonify({"ok": False, "error": "backup_failed", "message": str(exc)}), 500
    finally:
        if dst_conn is not None:
            try:
                dst_conn.close()
            except Exception:
                pass
        if src_conn is not None:
            try:
                src_conn.close()
            except Exception:
                pass

    verified = _verify_sqlite_integrity(dst_path)
    if not verified:
        try:
            os.remove(dst_path)
        except OSError:
            pass
        return jsonify({"ok": False, "error": "backup_integrity_failed"}), 500

    st = os.stat(dst_path)
    return jsonify({
        "ok": True,
        "backup": {
            "filename": filename,
            "path": dst_path,
            "type": "Automatic" if kind == "auto" else "Manual",
            "size_bytes": st.st_size,
            "size_label": _format_size(st.st_size),
            "created_at_utc": int(st.st_mtime),
            "created_label": datetime.fromtimestamp(st.st_mtime).strftime("%d %b %Y, %H:%M"),
            "verified": True,
        },
    }), 200


@internal_desktop_bp.route("/backups/set-dir", methods=["POST"])
def api_internal_set_backup_dir():
    data = request.get_json(silent=True) or {}
    new_dir = str(data.get("backup_dir") or "").strip()
    if not new_dir:
        return jsonify({"ok": False, "error": "missing_backup_dir"}), 400
    try:
        os.makedirs(new_dir, exist_ok=True)
        abs_dir = os.path.abspath(new_dir)
        os.environ["COGNITARA_BACKUP_DIR"] = abs_dir
        current_app.config["BACKUP_DIR"] = abs_dir
        return jsonify({"ok": True, "backup_dir": abs_dir}), 200
    except OSError as exc:
        return jsonify({"ok": False, "error": "invalid_dir", "message": str(exc)}), 400


@internal_desktop_bp.route("/backups/delete", methods=["POST"])
def api_internal_delete_backup():
    data = request.get_json(silent=True) or {}
    filename = os.path.basename(str(data.get("filename") or "").strip())
    if not filename or not filename.endswith(".db") or "/" in filename or "\\" in filename:
        return jsonify({"ok": False, "error": "invalid_backup_filename"}), 400
    backup_dir = _resolve_backup_dir()
    candidate = os.path.abspath(os.path.join(backup_dir, filename))
    if not candidate.startswith(os.path.abspath(backup_dir) + os.sep) or not os.path.isfile(candidate):
        return jsonify({"ok": False, "error": "backup_not_found"}), 404
    try:
        os.remove(candidate)
        return jsonify({"ok": True, "deleted": filename}), 200
    except OSError as exc:
        return jsonify({"ok": False, "error": "delete_failed", "message": str(exc)}), 500


@internal_desktop_bp.route("/backups/export-cloud-snapshot", methods=["POST"])
def api_internal_export_cloud_snapshot():
    """Creates an integrity-verified, gzipped exam DB snapshot for encrypted CogniTara Cloud upload."""
    src_path = _resolve_active_db_path()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"cognitara_exam_db_{stamp}.db.gz"

    stats: Dict[str, int] = {}
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = os.path.join(tmpdir, "snapshot.db")
        src_conn = None
        dst_conn = None
        try:
            src_conn = sqlite3.connect(src_path, timeout=30.0)
            try:
                src_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except Exception:
                pass
            dst_conn = sqlite3.connect(tmp_db, timeout=30.0)
            src_conn.backup(dst_conn)
            dst_conn.commit()
            for tbl, key in [("exams", "exams"), ("questions", "questions"), ("students", "students"), ("scores", "scores")]:
                try:
                    stats[key] = int(dst_conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0])
                except Exception:
                    stats[key] = 0
        except Exception as exc:
            logger.error("Cloud snapshot creation failed: %s", exc)
            return jsonify({"ok": False, "error": "snapshot_failed", "message": str(exc)}), 500
        finally:
            if dst_conn:
                dst_conn.close()
            if src_conn:
                src_conn.close()

        if not _verify_sqlite_integrity(tmp_db):
            return jsonify({"ok": False, "error": "snapshot_integrity_failed"}), 500

        with open(tmp_db, "rb") as fh:
            raw_bytes = fh.read()

    compressed = gzip.compress(raw_bytes, compresslevel=6)
    sha256 = hashlib.sha256(compressed).hexdigest()
    payload_b64 = base64.b64encode(compressed).decode("ascii")

    return jsonify({
        "ok": True,
        "filename": filename,
        "raw_size_bytes": len(raw_bytes),
        "compressed_bytes": len(compressed),
        "sha256": sha256,
        "stats": stats,
        "payload_b64": payload_b64,
    }), 200


@internal_desktop_bp.route("/backups/restore-cloud-snapshot", methods=["POST"])
def api_internal_restore_cloud_snapshot():
    """Restores exam.db atomically from a gzipped CogniTara Cloud snapshot with safety backup."""
    data = request.get_json(silent=True) or {}
    payload_b64 = str(data.get("payload_b64") or "").strip()
    expected_sha = str(data.get("sha256") or "").strip().lower()
    if not payload_b64:
        return jsonify({"ok": False, "error": "empty_snapshot"}), 400

    try:
        compressed = base64.b64decode(payload_b64)
    except Exception:
        return jsonify({"ok": False, "error": "invalid_base64"}), 400

    if expected_sha and hashlib.sha256(compressed).hexdigest().lower() != expected_sha:
        return jsonify({"ok": False, "error": "checksum_mismatch", "message": "Backup checksum verification failed."}), 400

    try:
        raw_db = gzip.decompress(compressed)
    except Exception:
        return jsonify({"ok": False, "error": "corrupt_gzip", "message": "Could not decompress cloud backup."}), 400

    backup_dir = _resolve_backup_dir()
    active_db = _resolve_active_db_path()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = os.path.join(tmpdir, "cloud_restore.db")
        with open(tmp_db, "wb") as fh:
            fh.write(raw_db)

        res = restore_database_with_vault_preservation(
            source_path=tmp_db,
            active_db_path=active_db,
            backup_dir=backup_dir,
            safety_prefix="exam_pre_cloud_restore",
            preserve_current_admin=False,
            hash_legacy_passwords=False,
            allow_during_active_exam=True,
        )

    if not res.get("ok"):
        return jsonify(res), 400
    return jsonify({
        "ok": True,
        "safety_snapshot": res.get("safety_snapshot"),
        "counts": res.get("counts"),
    }), 200


@internal_desktop_bp.route("/backups/restore", methods=["POST"])
def api_internal_restore_backup():
    data = request.get_json(silent=True) or {}
    filename = os.path.basename(str(data.get("filename") or "").strip())
    if not filename or not filename.endswith(".db") or "/" in filename or "\\" in filename:
        return jsonify({"ok": False, "error": "invalid_backup_filename"}), 400

    backup_dir = _resolve_backup_dir()
    candidate = os.path.abspath(os.path.join(backup_dir, filename))
    if not candidate.startswith(os.path.abspath(backup_dir) + os.sep) or not os.path.isfile(candidate):
        return jsonify({"ok": False, "error": "backup_not_found"}), 404

    active_db = _resolve_active_db_path()
    res = restore_database_with_vault_preservation(
        source_path=candidate,
        active_db_path=active_db,
        backup_dir=backup_dir,
        safety_prefix="exam_pre_restore",
        preserve_current_admin=False,
        hash_legacy_passwords=False,
        allow_during_active_exam=True,
    )
    if not res.get("ok"):
        return jsonify(res), 400

    return jsonify({
        "ok": True,
        "restored_from": filename,
        "safety_snapshot": res.get("safety_snapshot"),
        "counts": res.get("counts"),
    }), 200


@internal_desktop_bp.route("/backups/inspect-legacy", methods=["POST"])
def api_internal_inspect_legacy():
    """Inspect a school's former exam.db file from disk before importing."""
    data = request.get_json(silent=True) or {}
    file_path = str(data.get("file_path") or "").strip()
    if not file_path:
        return jsonify({"ok": False, "error": "missing_file_path", "message": "No database file was selected."}), 400
    res = inspect_legacy_database(file_path)
    return jsonify(res), (200 if res.get("ok") else 400)


@internal_desktop_bp.route("/backups/import-legacy", methods=["POST"])
def api_internal_import_legacy():
    """Import & automatically migrate a former CogniTara exam.db into the active school server."""
    data = request.get_json(silent=True) or {}
    file_path = str(data.get("file_path") or "").strip()
    if not file_path:
        return jsonify({"ok": False, "error": "missing_file_path", "message": "No database file was selected."}), 400

    preserve_current_admin = bool(data.get("preserve_current_admin", True))
    allow_during_active = bool(data.get("force", False))

    active_db = _resolve_active_db_path()
    backup_dir = _resolve_backup_dir()
    res = import_legacy_database(
        source_path=file_path,
        active_db_path=active_db,
        backup_dir=backup_dir,
        preserve_current_admin=preserve_current_admin,
        allow_during_active_exam=allow_during_active,
    )
    if not res.get("ok"):
        code = 409 if res.get("error") == "active_exams_in_progress" else 400
        return jsonify(res), code

    return jsonify(res), 200


# =============================================================================
# Onboarding Setup Routes (School Profile + Super Admin Creation)
# =============================================================================

@internal_desktop_bp.route("/setup/status", methods=["GET"])
def api_internal_setup_status():
    telemetry = _collect_live_telemetry()
    guard = _get_guard()
    lic = guard.evaluate(advance_monotonic=False)

    has_superadmin = False
    has_recovery_codes = False
    school_motto = "Knowledge, Discipline, Excellence"
    conn = get_db_connection()
    try:
        init_license_tables(conn)
        row = conn.execute("SELECT school_motto FROM school_settings WHERE id = 1").fetchone()
        if row and row.get("school_motto"):
            school_motto = str(row["school_motto"])
        has_superadmin = conn.execute("SELECT COUNT(*) FROM admin").fetchone()[0] > 0
        has_recovery_codes = conn.execute("SELECT COUNT(*) FROM admin_recovery_codes").fetchone()[0] > 0
    finally:
        conn.close()

    onboarding_complete = bool(lic.get("is_licensed") and has_superadmin and has_recovery_codes)
    return jsonify({
        "ok": True,
        "onboarding_complete": onboarding_complete,
        "school": {
            "school_name": telemetry["school_name"],
            "school_motto": school_motto,
            "academic_session": telemetry["academic_session"],
            "current_term": telemetry["current_term"],
        },
        "network": {
            "hostname": telemetry["hostname"],
            "lan_ips": telemetry["lan_ips"],
            "primary_lan_ip": telemetry["primary_lan_ip"],
            "port": telemetry["port"],
        },
        "license": lic,
        "has_superadmin": has_superadmin,
    }), 200


@internal_desktop_bp.route("/setup/school", methods=["POST"])
def api_internal_setup_school():
    data = request.get_json(silent=True) or {}
    school_name = str(data.get("school_name") or "").strip()
    if len(school_name) < 2:
        return jsonify({"ok": False, "error": "invalid_school_name"}), 400

    school_motto = str(data.get("school_motto") or "").strip()[:200]
    academic_session = str(data.get("academic_session") or "2026/2027").strip()[:40]
    current_term = str(data.get("current_term") or "First Term").strip()[:40]

    logo_filename = None
    logo_b64 = data.get("logo_data_url")
    if isinstance(logo_b64, str) and logo_b64.startswith("data:image/"):
        match = re.match(r"^data:image/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$", logo_b64, re.DOTALL)
        if match:
            ext = "svg" if match.group(1) == "svg+xml" else match.group(1).replace("jpeg", "jpg")
            raw_bytes = base64.b64decode(match.group(2))
            if raw_bytes:
                logo_filename = f"school_logo.{ext}"
                upload_dir = current_app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER
                os.makedirs(upload_dir, exist_ok=True)
                with open(os.path.join(upload_dir, logo_filename), "wb") as f:
                    f.write(raw_bytes)

    conn = get_db_connection()
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO school_settings (id, school_name, academic_session, current_term)
            VALUES (1, ?, ?, ?)
            """,
            (school_name, academic_session, current_term),
        )
        if logo_filename:
            conn.execute(
                """
                UPDATE school_settings
                SET school_name = ?, school_motto = ?, academic_session = ?,
                    current_term = ?, school_logo = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """,
                (school_name, school_motto, academic_session, current_term, logo_filename),
            )
        else:
            conn.execute(
                """
                UPDATE school_settings
                SET school_name = ?, school_motto = ?, academic_session = ?,
                    current_term = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
                """,
                (school_name, school_motto, academic_session, current_term),
            )
        conn.execute("UPDATE academic_sessions SET is_current = 0")
        conn.execute(
            "INSERT OR IGNORE INTO academic_sessions (name, is_current) VALUES (?, 1)",
            (academic_session,),
        )
        conn.execute("UPDATE academic_sessions SET is_current = 1 WHERE name = ?", (academic_session,))
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "ok": True,
        "school": {
            "school_name": school_name,
            "school_motto": school_motto,
            "academic_session": academic_session,
            "current_term": current_term,
            "school_logo": logo_filename,
        },
    }), 200


@internal_desktop_bp.route("/setup/superadmin", methods=["POST"])
def api_internal_setup_superadmin():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    recovery_codes = data.get("recovery_codes") or []

    if len(username) < 3 or len(username) > 64:
        return jsonify({"ok": False, "error": "invalid_username"}), 400
    if len(password) < 10:
        return jsonify({"ok": False, "error": "password_too_short"}), 400

    pwd_hash = generate_password_hash(password)
    conn = get_db_connection()
    try:
        init_license_tables(conn)
        existing = conn.execute("SELECT id FROM admin WHERE username = ?", (username,)).fetchone()
        if existing:
            admin_id = int(existing["id"])
            conn.execute("UPDATE admin SET password = ? WHERE id = ?", (pwd_hash, admin_id))
        else:
            cur = conn.execute("INSERT INTO admin (username, password) VALUES (?, ?)", (username, pwd_hash))
            admin_id = int(cur.lastrowid)

        if isinstance(recovery_codes, list) and recovery_codes:
            conn.execute("DELETE FROM admin_recovery_codes WHERE admin_id = ?", (admin_id,))
            for code in recovery_codes[:16]:
                cleaned = str(code).strip().upper()
                if cleaned:
                    conn.execute(
                        "INSERT INTO admin_recovery_codes (admin_id, code_hash, used) VALUES (?, ?, 0)",
                        (admin_id, generate_password_hash(cleaned)),
                    )
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "ok": True,
        "admin_id": admin_id,
        "username": username,
        "recovery_codes_saved": len(recovery_codes) if isinstance(recovery_codes, list) else 0,
    }), 200
