import os
import sqlite3
import random
import secrets
import math
import re
import json
import io
import csv
from datetime import datetime, timedelta, timezone
from flask import Blueprint, render_template, request, redirect, session, url_for, send_file, Response, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from cognitara.database.connection import get_db_connection
from cognitara.security.csrf_ratelimit import validate_csrf, get_csrf_token
from cognitara.security.passwords import verify_and_upgrade_password
from cognitara.security.permissions import (
    is_admin, is_teacher, is_student, require_admin, require_teacher, require_student
)
from cognitara.utils.helpers import (
    SafeMathEvaluator, sanitize_html, get_utc_now, log_action, compress_image
)
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.grading_service import (
    finalize_regular_exam_attempt, finalize_ce_exam_attempt
)
from cognitara.services.answer_service import save_regular_answer, save_ce_answer
from cognitara.services.session_service import (
    process_regular_heartbeat, process_ce_heartbeat, resume_regular_attempt, resume_ce_attempt
)
from cognitara.services.violation_service import (
    log_regular_warning, log_ce_warning, reset_warnings
)
from cognitara.database.repositories.results import (
    get_scores, get_score_details, get_student_average, get_class_average,
    get_highest_score_in_class, get_total_passed_exams, get_highest_average_in_class
)
from cognitara.extensions import limiter
from flask_limiter.util import get_remote_address
admin_support_bp = Blueprint('admin_support', __name__)

@admin_support_bp.route("/admin/exam_technical_support")
def admin_exam_technical_support():
    """Admin technical support page - manage all active exams"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    active_attempts = conn.execute("""
        SELECT s.id, s.student_id, s.warnings_count, s.remaining_time, 
               s.is_paused, s.paused_by, s.pause_reason, s.last_heartbeat,
               s.resume_requested, s.start_time as started_at,
               st.full_name, st.username, st.class as student_class,
               e.name as exam_name, e.class as target_class, e.duration,
               t.username as teacher_name
        FROM scores s
        JOIN students st ON s.student_id = st.id
        JOIN exams e ON s.exam_id = e.id
        JOIN teachers t ON e.teacher_id = t.id
        WHERE s.status = 'in_progress'
        ORDER BY s.resume_requested DESC, s.start_time DESC
    """).fetchall()
    
    conn.close()
    
    return render_template("admin_exam_technical_support.html", active_attempts=active_attempts)


@admin_support_bp.route('/admin/exam_pause/<int:attempt_id>', methods=['POST'])
def admin_exam_pause(attempt_id):
    """Admin pauses a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    paused_by = session.get('username', 'admin')
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        exam = conn.execute("SELECT duration FROM exams WHERE id=?", (attempt["exam_id"],)).fetchone()
        server_rem = calculate_authoritative_remaining_time(attempt, exam["duration"] if exam else 30)
        conn.execute("UPDATE scores SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=? WHERE id=?", (paused_by, server_rem, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": "Exam paused"}


@admin_support_bp.route('/admin/exam_resume/<int:attempt_id>', methods=['POST'])
def admin_exam_resume(attempt_id):
    """Admin resumes a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    if attempt["status"] != "in_progress":
        conn.close()
        return {"error": "Cannot resume an attempt that is not in progress or already submitted"}, 400
    rem = int(attempt['remaining_time'] or 0)
    if rem <= 0:
        conn.close()
        return {"error": "Cannot resume: remaining time is expired"}, 400
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    new_session_key = secrets.token_hex(16)
    conn.execute("""
        UPDATE scores 
        SET is_paused=0, paused_at=NULL, paused_by=NULL, pause_reason=NULL,
            resume_requested=0, authoritative_deadline=?, session_key=?, last_heartbeat=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (new_dl, new_session_key, attempt_id))
    log_action("Admin", session.get("username", "admin"), f"Resumed exam attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam resumed", "session_key": new_session_key}


@admin_support_bp.route('/admin/exam_add_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def admin_exam_add_time(attempt_id, minutes):
    """Admin adds extra time to a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        if attempt["is_paused"] == 1:
            new_time = (attempt['remaining_time'] or 0) + (minutes * 60)
            conn.execute("UPDATE scores SET remaining_time=? WHERE id=?", (new_time, attempt_id))
        else:
            exam = conn.execute("SELECT duration FROM exams WHERE id=?", (attempt["exam_id"],)).fetchone()
            cur_rem = calculate_authoritative_remaining_time(attempt, exam["duration"] if exam else 30)
            new_rem = cur_rem + (minutes * 60)
            new_dl = (get_utc_now() + timedelta(seconds=new_rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE scores SET remaining_time=?, authoritative_deadline=? WHERE id=?", (new_rem, new_dl, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": f"Added {minutes} minutes"}


@admin_support_bp.route('/admin/exam_subtract_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def admin_exam_subtract_time(attempt_id, minutes):
    """Admin subtracts time from a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        if attempt["is_paused"] == 1:
            new_time = max(0, (attempt['remaining_time'] or 0) - (minutes * 60))
            conn.execute("UPDATE scores SET remaining_time=? WHERE id=?", (new_time, attempt_id))
        else:
            exam = conn.execute("SELECT duration FROM exams WHERE id=?", (attempt["exam_id"],)).fetchone()
            cur_rem = calculate_authoritative_remaining_time(attempt, exam["duration"] if exam else 30)
            new_rem = max(0, cur_rem - (minutes * 60))
            new_dl = (get_utc_now() + timedelta(seconds=new_rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE scores SET remaining_time=?, authoritative_deadline=? WHERE id=?", (new_rem, new_dl, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": f"Subtracted {minutes} minutes"}


@admin_support_bp.route('/admin/exam_force_submit/<int:attempt_id>', methods=['POST'])
def admin_exam_force_submit(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    finalize_regular_exam_attempt(attempt_id, conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam force submitted successfully"}


@admin_support_bp.route('/admin/exam_reset_warnings/<int:attempt_id>', methods=['POST'])
def admin_exam_reset_warnings(attempt_id):
    """Admin resets or reduces a student's warning count"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    data = request.get_json(silent=True) or {}
    new_count = int(data.get("new_count", 0))
    reason = data.get("reason", "Admin manual reset")
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
        
    prev_count = attempt["warnings_count"] or 0
    conn.execute("UPDATE scores SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
    conn.execute("""
        INSERT INTO warning_reset_audit (attempt_id, exam_type, student_id, exam_id, reset_by, role, previous_count, new_count, reason, timestamp)
        VALUES (?, 'regular', ?, ?, ?, 'admin', ?, ?, ?, CURRENT_TIMESTAMP)
    """, (attempt_id, attempt["student_id"], attempt["exam_id"], session.get("username", "admin"), prev_count, new_count, reason))
    log_action("Admin", session.get("username", "admin"), f"Reset warnings from {prev_count} to {new_count} for attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Warnings reset to {new_count}", "previous_count": prev_count, "new_count": new_count}


@admin_support_bp.route('/admin/exam_pause_all', methods=['POST'])
def admin_exam_pause_all():
    """Admin pauses ALL active exams"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    active = conn.execute("""
        SELECT s.*, e.duration FROM scores s
        JOIN exams e ON s.exam_id = e.id
        WHERE s.status='in_progress' AND s.is_paused=0
    """).fetchall()
    paused_by = session.get("username", "admin")
    for a in active:
        server_rem = calculate_authoritative_remaining_time(a, a["duration"])
        conn.execute("""
            UPDATE scores SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=?
            WHERE id=?
        """, (paused_by, server_rem, a["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": "All exams paused"}


@admin_support_bp.route('/admin/exam_resume_all', methods=['POST'])
def admin_exam_resume_all():
    """Admin resumes ALL paused exams"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    paused = conn.execute("""
        SELECT id, remaining_time FROM scores
        WHERE status='in_progress' AND is_paused=1
    """).fetchall()
    for p in paused:
        rem = int(p['remaining_time'] or 0)
        new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
        new_key = secrets.token_hex(16)
        conn.execute("""
            UPDATE scores SET is_paused=0, paused_at=NULL, paused_by=NULL, pause_reason=NULL, resume_requested=0,
                authoritative_deadline=?, session_key=?, last_heartbeat=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        """, (new_dl, new_key, p["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": "All exams resumed"}


@admin_support_bp.route('/admin/exam_force_submit_all', methods=['POST'])
def admin_exam_force_submit_all():
    """Admin force submits ALL active exams"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    active = conn.execute("SELECT id FROM scores WHERE status='in_progress'").fetchall()
    for a in active:
        finalize_regular_exam_attempt(a["id"], conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "All exams force submitted"}


@admin_support_bp.route('/admin/exam_live_data')
def admin_exam_live_data():
    """Live data for admin technical support - returns all active sessions"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    from cognitara.services.session_service import sweep_disconnected_attempts
    conn = get_db_connection()
    sweep_disconnected_attempts(conn)
    active = conn.execute("""
        SELECT id, remaining_time, warnings_count, is_paused, paused_by, pause_reason, last_heartbeat, resume_requested
        FROM scores WHERE status = 'in_progress'
    """).fetchall()
    
    sessions = [dict(row) for row in active]
    conn.close()
    
    return {"success": True, "total_active": len(sessions), "sessions": sessions}


@admin_support_bp.route('/admin/api/technical_support_status')
def admin_api_technical_support_status():
    """
    Real-time status API for Technical Support dashboard.
    Returns detailed snapshot of all in-progress attempts with heartbeat age and connection metrics.
    Throttled sweep ensures low database contention.
    """
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    from cognitara.services.session_service import sweep_disconnected_attempts
    conn = get_db_connection()
    sweep_disconnected_attempts(conn)

    now_dt = get_utc_now()
    rows = conn.execute("""
        SELECT s.id, s.student_id, s.exam_id, s.warnings_count, s.max_warnings,
               s.remaining_time, s.is_paused, s.paused_by, s.pause_reason,
               s.last_heartbeat, s.resume_requested, s.start_time as started_at,
               st.full_name, st.username, st.class as student_class,
               e.name as exam_name, e.class as target_class, e.duration, e.max_warnings as exam_max_w,
               t.username as teacher_name
        FROM scores s
        JOIN students st ON s.student_id = st.id
        JOIN exams e ON s.exam_id = e.id
        LEFT JOIN teachers t ON e.teacher_id = t.id
        WHERE s.status = 'in_progress'
        ORDER BY s.resume_requested DESC, s.start_time DESC
    """).fetchall()

    attempts = []
    total_running = 0
    total_paused = 0
    total_resume_req = 0
    total_disconnected = 0

    for r in rows:
        hb_str = r["last_heartbeat"] or r["started_at"]
        secs_since_hb = 999
        if hb_str:
            try:
                hb_dt = datetime.strptime(str(hb_str).split('.')[0], '%Y-%m-%d %H:%M:%S')
                secs_since_hb = max(0, int((now_dt - hb_dt).total_seconds()))
            except Exception:
                secs_since_hb = 999

        if secs_since_hb <= 15:
            conn_state = "active"
        elif secs_since_hb <= 25:
            conn_state = "lagging"
        else:
            conn_state = "disconnected"
            total_disconnected += 1

        is_p = bool(r["is_paused"])
        if is_p:
            total_paused += 1
        else:
            total_running += 1

        if r["resume_requested"]:
            total_resume_req += 1

        cur_max_w = int(r["max_warnings"] or r["exam_max_w"] or 5)
        rem_secs = int(r["remaining_time"] or 0)

        attempts.append({
            "id": r["id"],
            "student_id": r["student_id"],
            "exam_id": r["exam_id"],
            "student_name": r["full_name"] or r["username"] or "Student",
            "username": r["username"],
            "student_class": r["student_class"],
            "exam_name": r["exam_name"],
            "teacher_name": r["teacher_name"] or "Staff",
            "duration": r["duration"],
            "remaining_time": rem_secs,
            "remaining_minutes": rem_secs // 60,
            "remaining_display": f"{rem_secs // 60:02d}:{rem_secs % 60:02d}",
            "is_paused": is_p,
            "paused_by": r["paused_by"],
            "pause_reason": r["pause_reason"],
            "warnings_count": int(r["warnings_count"] or 0),
            "max_warnings": cur_max_w,
            "resume_requested": bool(r["resume_requested"]),
            "seconds_since_heartbeat": secs_since_hb,
            "connection_state": conn_state,
            "started_at": str(r["started_at"] or "")
        })

    conn.close()

    return {
        "ok": True,
        "success": True,
        "server_time": now_dt.strftime('%Y-%m-%d %H:%M:%S'),
        "summary": {
            "total_active": len(attempts),
            "total_running": total_running,
            "total_paused": total_paused,
            "total_resume_requested": total_resume_req,
            "total_disconnected": total_disconnected
        },
        "attempts": attempts
    }



