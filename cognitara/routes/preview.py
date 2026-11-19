"""
Preview & Telemetry Blueprint for CogniTara v2 Super Admin Desktop Showcase.
Provides strictly read-only live LAN, database, inventory, and server telemetry.
"""

import ipaddress
import json
import logging
import os
import socket
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, render_template

from cognitara.database.connection import get_db_connection

logger = logging.getLogger("cognitara.routes.preview")

preview_bp = Blueprint("preview", __name__)

_WAT_TZ = timezone(timedelta(hours=1))
_DEFAULT_PORT = 5000
_DEFAULT_WAITRESS_THREADS = 24


def _read_positive_int_env(var_name: str, default: int) -> int:
    raw = os.environ.get(var_name)
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


def _detect_network_identity() -> tuple[str, list[str]]:
    """
    Detect the local hostname and non-loopback IPv4 LAN addresses without
    emitting network traffic. Falls back gracefully when offline.
    """
    try:
        hostname = socket.gethostname() or "localhost"
    except OSError:
        hostname = "localhost"

    lan_ips: list[str] = []

    def _add_candidate_ip(candidate: str) -> None:
        try:
            addr = ipaddress.IPv4Address(candidate)
        except ValueError:
            return
        if addr.is_loopback or addr.is_unspecified or addr.is_link_local or addr.is_multicast:
            return
        ip_str = str(addr)
        if ip_str not in lan_ips:
            lan_ips.append(ip_str)

    # Primary interface probe via UDP socket connect (no packet transmitted)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(0.2)
            sock.connect(("10.255.255.255", 1))
            _add_candidate_ip(sock.getsockname()[0])
    except OSError:
        pass

    # Fallback / secondary adapter discovery via hostname resolution
    try:
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            if info and len(info) >= 5 and info[4]:
                _add_candidate_ip(info[4][0])
    except OSError:
        pass

    return hostname, lan_ips


def _safe_scalar_count(conn, sql: str, default: int = 0) -> int:
    try:
        row = conn.execute(sql).fetchone()
        if row is not None:
            return int(row[0] or 0)
    except Exception as exc:
        logger.debug("Telemetry count fallback for query (%s): %s", sql, exc)
    return default


def _collect_recent_exams(conn, limit: int = 6) -> list[dict]:
    """
    Safely collects up to `limit` real regular and Common Entrance exam rows
    from exam.db without failing when columns vary across test fixtures.
    """
    regular_items: list[dict] = []
    ce_items: list[dict] = []

    try:
        ce_rows = conn.execute(
            "SELECT * FROM ce_exams ORDER BY active DESC, id DESC LIMIT 2"
        ).fetchall()
        for row in ce_rows:
            is_active = bool(row.get("active"))
            ce_items.append({
                "id": int(row.get("id") or 0),
                "exam_type": "common_entrance",
                "name": row.get("name") or "Common Entrance Examination",
                "class": row.get("target_class") or "Placement",
                "target_class": row.get("target_class") or "Placement",
                "subject": "Common Entrance",
                "duration": int(row.get("duration") or 60),
                "passing_score": int(row.get("passing_score") or 50),
                "active": is_active,
                "status": "Active" if is_active else "Inactive",
                "calculator_type": row.get("calculator_type") or "none",
            })
    except Exception as exc:
        logger.debug("Telemetry ce_exams inventory fallback: %s", exc)

    regular_limit = max(1, limit - min(len(ce_items), 2))
    try:
        reg_rows = conn.execute(
            "SELECT * FROM exams ORDER BY active DESC, id DESC LIMIT ?",
            (regular_limit,),
        ).fetchall()
        for row in reg_rows:
            is_active = bool(row.get("active")) and not bool(row.get("deactivated"))
            subject_label = row.get("subject_tag") or row.get("subject") or "General"
            class_label = row.get("class") or "General"
            regular_items.append({
                "id": int(row.get("id") or 0),
                "exam_type": "regular",
                "name": row.get("name") or "Examination",
                "class": class_label,
                "target_class": class_label,
                "subject": subject_label,
                "duration": int(row.get("duration") or 30),
                "passing_score": None,
                "active": is_active,
                "status": "Active" if is_active else "Inactive",
                "calculator_type": row.get("calculator_type") or "none",
            })
    except Exception as exc:
        logger.debug("Telemetry exams inventory fallback: %s", exc)

    return (regular_items + ce_items)[:limit]


def _collect_grading_scheme(conn, active_scheme_id=None) -> str:
    default_scheme = "WAEC 9-Point Scale"
    try:
        if active_scheme_id is not None:
            row = conn.execute(
                "SELECT name FROM grading_schemes WHERE id = ?",
                (active_scheme_id,),
            ).fetchone()
            if row and row.get("name"):
                return str(row.get("name"))

        row = conn.execute(
            "SELECT name FROM grading_schemes WHERE is_default = 1 ORDER BY id ASC LIMIT 1"
        ).fetchone()
        if row and row.get("name"):
            return str(row.get("name"))

        row = conn.execute(
            "SELECT name FROM grading_schemes ORDER BY id ASC LIMIT 1"
        ).fetchone()
        if row and row.get("name"):
            return str(row.get("name"))
    except Exception as exc:
        logger.debug("Telemetry grading_scheme fallback: %s", exc)
    return default_scheme


def _collect_live_telemetry() -> dict:
    """
    Collects read-only host, LAN, database, inventory, and runtime telemetry
    for the Super Admin Desktop App showcase without ever mutating exam.db.
    """
    port = _read_positive_int_env("COGNITARA_PORT", _DEFAULT_PORT)
    waitress_threads = _read_positive_int_env("COGNITARA_THREADS", _DEFAULT_WAITRESS_THREADS)
    hostname, lan_ips = _detect_network_identity()

    primary_lan_ip = lan_ips[0] if lan_ips else None
    loopback_url = f"http://127.0.0.1:{port}"
    hostname_url = f"http://{hostname}:{port}"
    primary_lan_url = f"http://{primary_lan_ip}:{port}" if primary_lan_ip else loopback_url
    server_time_wat = datetime.now(_WAT_TZ).strftime("%Y-%m-%d %I:%M:%S %p WAT")

    school_name = "CogniTara High School"
    academic_session = "2026/2027"
    current_term = "First Term"
    anti_cheating_profile = "medium"
    grading_scheme = "WAEC 9-Point Scale"

    counts = {
        "exams": 0,
        "ce_exams": 0,
        "approved_students": 0,
        "teachers": 0,
        "active_regular_attempts": 0,
        "active_ce_attempts": 0,
        "active_attempts": 0,
        "regular_questions": 0,
        "ce_questions": 0,
        "total_questions": 0,
        "classes": 0,
    }
    total_questions = 0
    classes_count = 0
    recent_exams: list[dict] = []
    db_journal_mode = "unknown"
    db_health = "unknown"

    conn = None
    try:
        conn = get_db_connection()
        try:
            conn.execute("PRAGMA query_only = ON")
        except Exception:
            pass

        active_scheme_id = None
        try:
            settings_row = conn.execute(
                "SELECT school_name, academic_session, current_term, "
                "anti_cheating_profile, active_grading_scheme_id "
                "FROM school_settings WHERE id = 1"
            ).fetchone()
            if not settings_row:
                settings_row = conn.execute(
                    "SELECT school_name, academic_session, current_term, "
                    "anti_cheating_profile, active_grading_scheme_id "
                    "FROM school_settings LIMIT 1"
                ).fetchone()
            if settings_row:
                school_name = settings_row.get("school_name") or school_name
                academic_session = settings_row.get("academic_session") or academic_session
                current_term = settings_row.get("current_term") or current_term
                anti_cheating_profile = settings_row.get("anti_cheating_profile") or anti_cheating_profile
                active_scheme_id = settings_row.get("active_grading_scheme_id")
        except Exception as exc:
            logger.debug("Telemetry school_settings fallback: %s", exc)

        exams_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM exams")
        ce_exams_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM ce_exams")
        approved_students_count = _safe_scalar_count(
            conn, "SELECT COUNT(*) FROM students WHERE status = 'approved'"
        )
        teachers_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM teachers")
        active_regular_count = _safe_scalar_count(
            conn, "SELECT COUNT(*) FROM scores WHERE status = 'in_progress'"
        )
        active_ce_count = _safe_scalar_count(
            conn, "SELECT COUNT(*) FROM ce_attempts WHERE status = 'in_progress'"
        )
        regular_questions_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM questions")
        ce_questions_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM ce_questions")
        total_questions = regular_questions_count + ce_questions_count
        classes_count = _safe_scalar_count(conn, "SELECT COUNT(*) FROM classes WHERE active = 1")

        counts = {
            "exams": exams_count,
            "ce_exams": ce_exams_count,
            "approved_students": approved_students_count,
            "teachers": teachers_count,
            "active_regular_attempts": active_regular_count,
            "active_ce_attempts": active_ce_count,
            "active_attempts": active_regular_count + active_ce_count,
            "regular_questions": regular_questions_count,
            "ce_questions": ce_questions_count,
            "total_questions": total_questions,
            "classes": classes_count,
        }

        grading_scheme = _collect_grading_scheme(conn, active_scheme_id=active_scheme_id)
        recent_exams = _collect_recent_exams(conn, limit=6)

        try:
            jm_row = conn.execute("PRAGMA journal_mode").fetchone()
            if jm_row and jm_row[0]:
                db_journal_mode = str(jm_row[0]).strip().upper()
        except Exception as exc:
            logger.debug("Telemetry PRAGMA journal_mode fallback: %s", exc)

        try:
            qc_row = conn.execute("PRAGMA quick_check").fetchone()
            if qc_row and qc_row[0]:
                db_health = str(qc_row[0]).strip()
        except Exception as exc:
            logger.debug("Telemetry PRAGMA quick_check fallback: %s", exc)
    except Exception as exc:
        logger.warning("Telemetry DB inspection degraded gracefully: %s", exc)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass

    active_sessions_count = counts["active_attempts"]
    approved_count = counts["approved_students"]
    teachers_count_val = counts["teachers"]
    published_exams_count = counts["exams"] + counts["ce_exams"]

    def _plural(count: int, singular: str, plural: str | None = None) -> str:
        word = singular if count == 1 else (plural or f"{singular}s")
        return f"{count} {word}"

    portal_capabilities = [
        {
            "id": "student-cbt",
            "title": "Student CBT & Dockable Scientific Calculator",
            "route": "/dashboard",
            "summary": (
                "Distraction-free exam workspace with split-pane passages, instant per-click "
                "SQLite WAL answer saves, WAEC/JAMB grading, and a non-occluding docked calculator."
            ),
            "metrics": [
                f"{_plural(approved_count, 'approved student')}",
                f"{_plural(total_questions, 'banked question')}",
                grading_scheme,
            ],
        },
        {
            "id": "teacher-studio",
            "title": "Teacher Studio & KaTeX / mhchem Formula Editor",
            "route": "/teacher",
            "summary": (
                "Visual math and chemistry formula authoring rendered offline with KaTeX + mhchem, "
                "bulk Excel (.xlsx) exam imports, and per-class diagnostic analytics."
            ),
            "metrics": [
                f"{_plural(teachers_count_val, 'teacher')}",
                f"{_plural(published_exams_count, 'published exam')}",
                f"{_plural(classes_count, 'active class', 'active classes')}",
            ],
        },
        {
            "id": "live-proctor",
            "title": "Live Proctor & Cryptographic Session Fencing",
            "route": "/admin/exam_technical_support",
            "summary": (
                "Server-authoritative countdowns with single-PC session_key lease fencing, "
                "25s heartbeat disconnect pause, violation logs, and +5m time extensions."
            ),
            "metrics": [
                f"{_plural(active_sessions_count, 'active session')}",
                f"Anti-cheat: {anti_cheating_profile}",
                f"SQLite {db_journal_mode} ({db_health})",
            ],
        },
        {
            "id": "cloud-licensing",
            "title": "Cloud Paystack Licensing & Dual Referrals on cognitara.net",
            "route": "/admin/school-settings",
            "summary": (
                "Ed25519 hardware-bound licenses with 3-anchor DPAPI anti-clock-rollback, "
                "15-minute active-exam grace drain, Paystack checkout, and cash + bonus-day referrals."
            ),
            "metrics": [
                "Ed25519 + DPAPI Vault",
                "3/3 Clock Anchors",
                f"{_plural(waitress_threads, 'Waitress Thread')}",
            ],
        },
    ]

    return {
        "hostname": hostname,
        "lan_ips": lan_ips,
        "primary_lan_ip": primary_lan_ip,
        "is_lan_online": bool(lan_ips),
        "primary_lan_url": primary_lan_url,
        "hostname_url": hostname_url,
        "loopback_url": loopback_url,
        "school_name": school_name,
        "academic_session": academic_session,
        "current_term": current_term,
        "anti_cheating_profile": anti_cheating_profile,
        "grading_scheme": grading_scheme,
        "total_questions": total_questions,
        "classes_count": classes_count,
        "counts": counts,
        "recent_exams": recent_exams,
        "portal_capabilities": portal_capabilities,
        "db_journal_mode": db_journal_mode,
        "db_health": db_health,
        "port": port,
        "server_time_wat": server_time_wat,
        "waitress_threads": waitress_threads,
    }


@preview_bp.route("/desktop-preview", methods=["GET"])
def desktop_preview():
    """CogniTara Studio v2 desktop app design preview (Gate 1)."""
    return _render_desktop_preview("preview/studio.html")


@preview_bp.route("/desktop-preview/legacy", methods=["GET"])
def desktop_preview_legacy():
    """Earlier Stage 1 showcase, kept for comparison."""
    return _render_desktop_preview("preview/desktop_app_preview.html")


def _render_desktop_preview(template_name: str):
    telemetry = _collect_live_telemetry()
    school_settings = {
        "school_name": telemetry["school_name"],
        "academic_session": telemetry["academic_session"],
        "current_term": telemetry["current_term"],
        "anti_cheating_profile": telemetry["anti_cheating_profile"],
        "grading_scheme": telemetry["grading_scheme"],
    }
    host_info = {
        "hostname": telemetry["hostname"],
        "lan_ips": telemetry["lan_ips"],
        "primary_lan_ip": telemetry["primary_lan_ip"],
        "is_lan_online": telemetry["is_lan_online"],
        "primary_lan_url": telemetry["primary_lan_url"],
        "hostname_url": telemetry["hostname_url"],
        "loopback_url": telemetry["loopback_url"],
        "port": telemetry["port"],
    }
    # Escape "</" so database text can never close the embedding <script> tag.
    safe_json = json.dumps(telemetry).replace("</", "<\\/")
    return render_template(
        template_name,
        telemetry=telemetry,
        telemetry_json=safe_json,
        school_settings=school_settings,
        host_info=host_info,
        port=telemetry["port"],
    )


@preview_bp.route("/api/preview/telemetry", methods=["GET"])
def api_preview_telemetry():
    return jsonify(_collect_live_telemetry()), 200
