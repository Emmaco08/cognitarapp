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
teacher_bp = Blueprint('teacher', __name__)

from cognitara.utils.offline_builder import generate_offline_builder_html

@teacher_bp.route("/teacher/technical_support")
def teacher_technical_support():
    """Teacher technical support page - manage active exams"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get all in-progress attempts for this teacher's exams
    active_attempts = conn.execute("""
        SELECT s.id, s.student_id, s.warnings_count, s.remaining_time, 
               s.is_paused, s.resume_requested, s.start_time as started_at,
               st.full_name, st.username, st.class as student_class,
               e.name as exam_name, e.class as target_class, e.duration
        FROM scores s
        JOIN students st ON s.student_id = st.id
        JOIN exams e ON s.exam_id = e.id
        WHERE s.status = 'in_progress' AND e.teacher_id = ?
        ORDER BY s.resume_requested DESC, s.start_time DESC
    """, (session["teacher_id"],)).fetchall()
    
    attempts_list = [dict(a) for a in active_attempts]
    total_active = len(attempts_list)
    total_running = len([a for a in attempts_list if not a.get("is_paused")])
    total_paused = len([a for a in attempts_list if a.get("is_paused")])
    total_requests = len([a for a in attempts_list if a.get("resume_requested")])
    conn.close()
    
    return render_template(
        "teacher_technical_support.html",
        active_attempts=attempts_list,
        total_active=total_active,
        total_running=total_running,
        total_paused=total_paused,
        total_requests=total_requests
    )


@teacher_bp.route('/teacher/exam_pause/<int:attempt_id>', methods=['POST'])
def teacher_exam_pause(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    paused_by = session.get('username', 'teacher')
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        exam = conn.execute("SELECT duration FROM exams WHERE id=?", (attempt["exam_id"],)).fetchone()
        server_rem = calculate_authoritative_remaining_time(attempt, exam["duration"] if exam else 30)
        conn.execute("UPDATE scores SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=? WHERE id=?", (paused_by, server_rem, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": "Exam paused"}


@teacher_bp.route('/teacher/exam_resume/<int:attempt_id>', methods=['POST'])
def teacher_exam_resume(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT s.*, e.teacher_id FROM scores s 
        JOIN exams e ON s.exam_id = e.id 
        WHERE s.id=?
    """, (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    if "admin_id" not in session and attempt["teacher_id"] != session.get("teacher_id"):
        conn.close()
        return {"error": "Forbidden: Exam not assigned to you"}, 403
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
    role_str = "Admin" if "admin_id" in session else "Teacher"
    log_action(role_str, session.get("username", role_str.lower()), f"Resumed exam attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam resumed", "session_key": new_session_key}


@teacher_bp.route('/teacher/exam_add_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def teacher_exam_add_time(attempt_id, minutes):
    if "teacher_id" not in session and "admin_id" not in session:
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
    return {"success": True, "message": f"{minutes} minutes added"}


@teacher_bp.route('/teacher/exam_subtract_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def teacher_exam_subtract_time(attempt_id, minutes):
    if "teacher_id" not in session and "admin_id" not in session:
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
    return {"success": True, "message": f"{minutes} minutes removed"}


@teacher_bp.route('/teacher/exam_force_submit/<int:attempt_id>', methods=['POST'])
def teacher_exam_force_submit(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    finalize_regular_exam_attempt(attempt_id, conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam force submitted"}


@teacher_bp.route('/teacher/exam_reset_warnings/<int:attempt_id>', methods=['POST'])
def teacher_exam_reset_warnings(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    data = request.get_json(silent=True) or {}
    new_count = int(data.get("new_count", 0))
    reason = data.get("reason", "Teacher manual reset")
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT s.*, e.teacher_id FROM scores s 
        JOIN exams e ON s.exam_id = e.id 
        WHERE s.id=?
    """, (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    if "admin_id" not in session and attempt["teacher_id"] != session.get("teacher_id"):
        conn.close()
        return {"error": "Forbidden: Exam not assigned to you"}, 403
        
    prev_count = attempt["warnings_count"] or 0
    conn.execute("UPDATE scores SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
    role_str = "admin" if "admin_id" in session else "teacher"
    conn.execute("""
        INSERT INTO warning_reset_audit (attempt_id, exam_type, student_id, exam_id, reset_by, role, previous_count, new_count, reason, timestamp)
        VALUES (?, 'regular', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (attempt_id, attempt["student_id"], attempt["exam_id"], session.get("username", role_str), role_str, prev_count, new_count, reason))
    log_action(role_str.capitalize(), session.get("username", role_str), f"Reset warnings from {prev_count} to {new_count} for attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Warnings reset to {new_count}", "previous_count": prev_count, "new_count": new_count}


@teacher_bp.route('/teacher/exam_pause_all', methods=['POST'])
def teacher_exam_pause_all():
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    active = conn.execute("""
        SELECT s.*, e.duration FROM scores s
        JOIN exams e ON s.exam_id = e.id
        WHERE s.status='in_progress' AND s.is_paused=0 AND e.teacher_id=?
    """, (session["teacher_id"],)).fetchall()
    paused_by = session.get("username", "teacher")
    for a in active:
        server_rem = calculate_authoritative_remaining_time(a, a["duration"])
        conn.execute("""
            UPDATE scores SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=?
            WHERE id=?
        """, (paused_by, server_rem, a["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": "All exams paused"}


@teacher_bp.route('/teacher/exam_resume_all', methods=['POST'])
def teacher_exam_resume_all():
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    paused = conn.execute("""
        SELECT s.id, s.remaining_time FROM scores s
        JOIN exams e ON s.exam_id = e.id
        WHERE s.status='in_progress' AND s.is_paused=1 AND e.teacher_id=?
    """, (session["teacher_id"],)).fetchall()
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


@teacher_bp.route('/teacher/exam_force_submit_all', methods=['POST'])
def teacher_exam_force_submit_all():
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    active = conn.execute("""
        SELECT s.id FROM scores s
        JOIN exams e ON s.exam_id = e.id
        WHERE s.status='in_progress' AND e.teacher_id=?
    """, (session["teacher_id"],)).fetchall()
    for a in active:
        finalize_regular_exam_attempt(a["id"], conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "All exams force submitted"}


@teacher_bp.route('/teacher/exam_live_data')
def teacher_exam_live_data():
    """Live data for teacher technical support page with full metadata and heartbeat age"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    from cognitara.services.session_service import sweep_disconnected_attempts
    conn = get_db_connection()
    sweep_disconnected_attempts(conn)
    
    now_dt = get_utc_now()
    active = conn.execute("""
        SELECT s.id, s.student_id, s.exam_id, s.remaining_time, s.warnings_count, s.is_paused, 
               s.paused_by, s.pause_reason, s.resume_requested, s.last_heartbeat, s.start_time,
               st.full_name, st.username, st.class as student_class,
               e.name as exam_name, e.duration
        FROM scores s
        JOIN exams e ON s.exam_id = e.id
        JOIN students st ON s.student_id = st.id
        WHERE s.status = 'in_progress' AND e.teacher_id = ?
        ORDER BY s.resume_requested DESC, s.start_time DESC
    """, (session["teacher_id"],)).fetchall()
    
    sessions = []
    total_running = 0
    total_paused = 0
    total_resume_req = 0
    
    for row in active:
        r = dict(row)
        secs_since_hb = 999
        hb_str = r.get("last_heartbeat") or r.get("start_time")
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
        
        r["student_name"] = r.get("full_name") or r.get("username") or "Student"
        r["seconds_since_heartbeat"] = secs_since_hb
        r["connection_state"] = conn_state
        
        if r.get("is_paused"):
            total_paused += 1
        else:
            total_running += 1
        if r.get("resume_requested"):
            total_resume_req += 1
            
        sessions.append(r)
        
    conn.close()
    
    return {
        "success": True,
        "ok": True,
        "total_active": len(sessions),
        "summary": {
            "total_active": len(sessions),
            "total_running": total_running,
            "total_paused": total_paused,
            "total_resume_requested": total_resume_req
        },
        "sessions": sessions
    }


@teacher_bp.route("/teacher/exam/<int:exam_id>/settings")
def teacher_exam_settings(exam_id):
    """Teacher view/edit exam settings - CE style"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Verify exam belongs to this teacher
    exam = conn.execute("""
        SELECT * FROM exams WHERE id=? AND teacher_id=?
    """, (exam_id, teacher_id)).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found or unauthorized", 403
    
    # Get teacher's assigned classes for the dropdown
    teaching_classes = []
    specialisations_by_class = {}
    
    try:
        class_assignments = conn.execute("""
            SELECT DISTINCT class_name, specialisation 
            FROM teacher_class_assignments 
            WHERE teacher_id=?
            ORDER BY class_name
        """, (teacher_id,)).fetchall()
        
        if class_assignments:
            for ca in class_assignments:
                if ca["class_name"] not in specialisations_by_class:
                    specialisations_by_class[ca["class_name"]] = []
                    teaching_classes.append(ca["class_name"])
                specialisations_by_class[ca["class_name"]].append(ca["specialisation"])
    except sqlite3.OperationalError:
        # Fallback
        if exam["class"]:
            teaching_classes = [exam["class"]]
            specialisations_by_class[exam["class"]] = ["General"]
    
    # Get sections
    sections = conn.execute("""
        SELECT * FROM exam_sections 
        WHERE exam_id=? 
        ORDER BY section_order
    """, (exam_id,)).fetchall()
    
    sections_with_counts = []
    for section in sections:
        section_dict = dict(section)
        count = conn.execute(
            "SELECT COUNT(*) as count FROM questions WHERE section_id=?", 
            (section["id"],)
        ).fetchone()["count"]
        section_dict["question_count"] = count
        sections_with_counts.append(section_dict)
    
    conn.close()
    
    return render_template("teacher_exam_settings.html",  # or teacher_exam_settings.html
                           exam=exam,
                           teaching_classes=teaching_classes,
                           specialisations_by_class=specialisations_by_class,
                           sections=sections_with_counts)


@teacher_bp.route("/teacher/exam/<int:exam_id>/settings", methods=["POST"])
def teacher_exam_settings_update(exam_id):
    """Teacher updates exam settings"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    exam = conn.execute("SELECT id FROM exams WHERE id=? AND teacher_id=?", (exam_id, teacher_id)).fetchone()
    if not exam:
        conn.close()
        return {"error": "Unauthorized"}, 403
    
    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    specialisation_tag = request.form.get("specialisation_tag", "General")
    subject_tag = request.form.get("subject_tag", "General")
    try:
        school_setting_row = conn.execute("SELECT max_warnings FROM school_settings WHERE id=1").fetchone()
        max_warnings = int(school_setting_row["max_warnings"]) if school_setting_row and school_setting_row["max_warnings"] else 5
    except Exception:
        max_warnings = 5
    calculator_type = request.form.get("calculator_type", "none")
    active = 1 if request.form.get("active") else 0
    
    try:
        conn.execute("""
            UPDATE exams SET 
            name=?, class=?, duration=?, specialisation_tag=?, subject_tag=?, max_warnings=?, calculator_type=?, active=?
            WHERE id=?
        """, (name, target_class, duration, specialisation_tag, subject_tag, max_warnings, calculator_type, active, exam_id))
    except sqlite3.OperationalError:
        # Fallback without new columns
        conn.execute("""
            UPDATE exams SET 
            name=?, class=?, duration=?, specialisation_tag=?, subject_tag=?, active=?
            WHERE id=?
        """, (name, target_class, duration, specialisation_tag, subject_tag, active, exam_id))
    
    log_action("Teacher", session["username"], f"Updated exam settings for '{name}'", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam settings saved successfully"}


@teacher_bp.route("/teacher/create_exam")
def teacher_create_exam():
    """Teacher creates a new exam - CE style settings page"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get teacher's assigned classes and specialisations
    teaching_classes = []
    specialisations_by_class = {}
    
    try:
        class_assignments = conn.execute("""
            SELECT DISTINCT class_name, specialisation 
            FROM teacher_class_assignments 
            WHERE teacher_id=?
            ORDER BY class_name
        """, (teacher_id,)).fetchall()
        
        if class_assignments:
            for ca in class_assignments:
                if ca["class_name"] not in specialisations_by_class:
                    specialisations_by_class[ca["class_name"]] = []
                    teaching_classes.append(ca["class_name"])
                specialisations_by_class[ca["class_name"]].append(ca["specialisation"])
        else:
            # Fallback to teacher's primary class
            teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
            if teacher and teacher["class"]:
                teaching_classes = [teacher["class"]]
                specialisations_by_class[teacher["class"]] = ["General"]
    except sqlite3.OperationalError:
        teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        if teacher and teacher["class"]:
            teaching_classes = [teacher["class"]]
            specialisations_by_class[teacher["class"]] = ["General"]
    
    conn.close()
    
    return render_template("teacher_create_exam.html",
                           teaching_classes=teaching_classes,
                           specialisations_by_class=specialisations_by_class)


@teacher_bp.route("/teacher/create_exam", methods=["POST"])
def teacher_create_exam_post():
    """Handle exam creation from CE-style settings page"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    specialisation_tag = request.form.get("specialisation_tag", "General")
    subject_tag = request.form.get("subject_tag", "General")
    try:
        school_setting_row = conn.execute("SELECT max_warnings FROM school_settings WHERE id=1").fetchone()
        max_warnings = int(school_setting_row["max_warnings"]) if school_setting_row and school_setting_row["max_warnings"] else 5
    except Exception:
        max_warnings = 5
    calculator_type = request.form.get("calculator_type", "none")
    active = 1 if request.form.get("active") else 0
    
    # Verify teacher is authorized for this class/specialisation
    allowed = False
    try:
        allowed = conn.execute("""
            SELECT id FROM teacher_class_assignments 
            WHERE teacher_id=? AND class_name=? AND specialisation=?
        """, (teacher_id, target_class, specialisation_tag)).fetchone()
        
        if not allowed and specialisation_tag != "General":
            allowed = conn.execute("""
                SELECT id FROM teacher_class_assignments 
                WHERE teacher_id=? AND class_name=?
            """, (teacher_id, target_class)).fetchone()
    except sqlite3.OperationalError:
        teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        allowed = teacher and teacher["class"] == target_class
    
    if not allowed:
        conn.close()
        return {"success": False, "error": "You are not authorized to create exams for this class/specialisation."}, 403
    
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exams (name, class, duration, teacher_id, subject_tag, specialisation_tag, max_warnings, calculator_type, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, target_class, duration, teacher_id, subject_tag, specialisation_tag, max_warnings, calculator_type, active))
    except sqlite3.OperationalError:
        # Fallback if new columns don't exist
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exams (name, class, duration, teacher_id, subject_tag, specialisation_tag, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, target_class, duration, teacher_id, subject_tag, specialisation_tag, active))
    
    exam_id = cursor.lastrowid
    
    log_action("Teacher", session["username"], f"Created exam '{name}' for {target_class}", conn=conn)
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Exam '{name}' created successfully!",
        "redirect": f"/teacher/exam/{exam_id}/settings"
    }                 


@teacher_bp.route("/teacher/exam/<int:exam_id>/settings")
def exam_settings_page(exam_id):
    """Regular exam settings page - CE style"""
    if "teacher_id" not in session and "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return redirect("/admin")
    
    sections = conn.execute("""
        SELECT * FROM exam_sections 
        WHERE exam_id=? 
        ORDER BY section_order
    """, (exam_id,)).fetchall()
    
    sections_with_counts = []
    for section in sections:
        section_dict = dict(section)
        count = conn.execute(
            "SELECT COUNT(*) as count FROM questions WHERE section_id=?", 
            (section["id"],)
        ).fetchone()["count"]
        section_dict["question_count"] = count
        sections_with_counts.append(section_dict)
    
    # Get all questions for display
    questions = conn.execute("""
        SELECT * FROM questions 
        WHERE exam_id=? 
        ORDER BY COALESCE(display_order, id)
    """, (exam_id,)).fetchall()
    
    conn.close()
    
    return render_template("exam_settings.html", 
                         exam=exam, 
                         sections=sections_with_counts,
                         questions=questions)


@teacher_bp.route("/teacher/exam/<int:exam_id>/sections", methods=["POST"])
def add_exam_section(exam_id):
    """Add a new section to regular exam"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    section_name = request.form.get("section_name")
    questions_to_show = int(request.form.get("questions_to_show", 0))
    randomize = int(request.form.get("randomize", 1))
    
    max_order = conn.execute(
        "SELECT COALESCE(MAX(section_order), 0) as max FROM exam_sections WHERE exam_id=?", 
        (exam_id,)
    ).fetchone()["max"]
    
    cursor = conn.execute("""
        INSERT INTO exam_sections (exam_id, section_name, questions_to_show, randomize, section_order)
        VALUES (?, ?, ?, ?, ?)
    """, (exam_id, section_name, questions_to_show, randomize, max_order + 1))
    
    section_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Section '{section_name}' added successfully!",
        "section": {
            "id": section_id,
            "section_name": section_name,
            "questions_to_show": questions_to_show,
            "randomize": randomize
        }
    }


@teacher_bp.route("/teacher/exam_section/<int:section_id>/update", methods=["POST"])
def update_exam_section(section_id):
    """Update regular exam section"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    section_name = request.form.get("section_name")
    questions_to_show = int(request.form.get("questions_to_show", 0))
    randomize = int(request.form.get("randomize", 1))
    
    conn.execute("""
        UPDATE exam_sections SET 
        section_name=?, questions_to_show=?, randomize=?
        WHERE id=?
    """, (section_name, questions_to_show, randomize, section_id))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Section updated successfully"}


@teacher_bp.route("/teacher/exam_section/<int:section_id>/delete", methods=["POST"])
def delete_exam_section(section_id):
    """Delete regular exam section and all its questions/groups"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    try:
        section = conn.execute("SELECT section_name FROM exam_sections WHERE id=?", (section_id,)).fetchone()
        
        if section:
            # 1. Delete student responses for questions in this section
            conn.execute("""
                DELETE FROM exam_question_responses 
                WHERE section_id=? OR question_id IN (SELECT id FROM questions WHERE section_id=?)
            """, (section_id, section_id))
            
            # 2. Delete questions in this section and their images
            questions = conn.execute("SELECT image FROM questions WHERE section_id=?", (section_id,)).fetchall()
            for q in questions:
                if q["image"] and q["image"] != "default.png":
                    img_path = os.path.join("static/images", q["image"])
                    if os.path.exists(img_path):
                        try:
                            os.remove(img_path)
                        except Exception:
                            pass
            conn.execute("DELETE FROM questions WHERE section_id=?", (section_id,))
            
            # 3. Delete groups in this section and group images
            groups = conn.execute("SELECT group_image FROM exam_question_groups WHERE section_id=?", (section_id,)).fetchall()
            for g in groups:
                if g["group_image"] and g["group_image"] != "default.png":
                    img_path = os.path.join("static/images", g["group_image"])
                    if os.path.exists(img_path):
                        try:
                            os.remove(img_path)
                        except Exception:
                            pass
            conn.execute("DELETE FROM exam_question_groups WHERE section_id=?", (section_id,))
            
            # 4. Delete the section
            conn.execute("DELETE FROM exam_sections WHERE id=?", (section_id,))
            conn.commit()
            
            return {"success": True, "message": f"Section '{section['section_name']}' deleted successfully"}
        return {"error": "Section not found"}, 404
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()


@teacher_bp.route("/teacher/exam_section/<int:section_id>/questions")
def exam_section_questions(section_id):
    """View questions in a regular exam section"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT * FROM exam_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return redirect("/teacher")
    
    questions = conn.execute("""
        SELECT * FROM questions 
        WHERE section_id=? 
        ORDER BY COALESCE(display_order, id)
    """, (section_id,)).fetchall()
    
    conn.close()
    
    return render_template("exam_questions.html", section=section, questions=questions)


@teacher_bp.route("/teacher/exam_section/<int:section_id>/questions", methods=["POST"])
def add_exam_question(section_id):
    """Add a question to regular exam section"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT exam_id FROM exam_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return redirect("/teacher")
    
    exam_id = section["exam_id"]
    
    question_text = request.form.get("question")
    option1 = request.form.get("option1")
    option2 = request.form.get("option2")
    option3 = request.form.get("option3")
    option4 = request.form.get("option4")
    answer_index = request.form.get("answer")
    mandatory = 1 if request.form.get("mandatory") else 0
    explanation = request.form.get("explanation", "").strip()
    
    # Convert answer index to actual answer text
    if answer_index == "1":
        answer = option1
    elif answer_index == "2":
        answer = option2
    elif answer_index == "3":
        answer = option3
    elif answer_index == "4":
        answer = option4
    else:
        answer = answer_index
    
    file = request.files.get("image")
    image_filename = None
    if file and file.filename != "":
        image_filename = f"exam_{exam_id}_{section_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = os.path.join("static/images", image_filename)
        compress_image(file, save_path, 50)
    
    # Get max display order
    max_order = conn.execute(
        "SELECT COALESCE(MAX(display_order), 0) as max FROM questions WHERE section_id=?", 
        (section_id,)
    ).fetchone()["max"]
    
    conn.execute("""
        INSERT INTO questions (exam_id, section_id, question, option1, option2, option3, option4, answer, image, mandatory, display_order, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, section_id, question_text, option1, option2, option3, option4, answer, image_filename, mandatory, max_order + 1, explanation))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/teacher/exam_section/{section_id}/questions")


@teacher_bp.route("/teacher/exam_section/<int:section_id>/import_csv", methods=["POST"])
def import_section_csv(section_id):
    """Import questions from CSV into an exam section (supports KaTeX formulas)"""
    if "teacher_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    if not validate_csrf():
        return jsonify({"success": False, "error": "Invalid CSRF token"}), 403

    conn = get_db_connection()
    section = conn.execute("SELECT s.*, e.teacher_id, e.name as exam_name FROM exam_sections s JOIN exams e ON s.exam_id = e.id WHERE s.id=?", (section_id,)).fetchone()
    if not section:
        conn.close()
        return jsonify({"success": False, "error": "Section not found"}), 404

    teacher_id = session["teacher_id"]
    if section["teacher_id"] and section["teacher_id"] != teacher_id:
        conn.close()
        return jsonify({"success": False, "error": "Unauthorized to modify this exam"}), 403

    exam_id = section["exam_id"]
    csv_file = request.files.get("csv_file")
    csv_text = request.form.get("csv_text", "").strip()

    raw_data = ""
    if csv_file and csv_file.filename != "":
        try:
            raw_data = csv_file.read().decode('utf-8-sig', errors='replace')
        except Exception as e:
            conn.close()
            return jsonify({"success": False, "error": f"Failed to read CSV file: {str(e)}"}), 400
    elif csv_text:
        raw_data = csv_text
    else:
        conn.close()
        return jsonify({"success": False, "error": "No CSV file or text provided"}), 400

    import csv
    import io
    reader = csv.reader(io.StringIO(raw_data))
    rows = list(reader)
    if not rows:
        conn.close()
        return jsonify({"success": False, "error": "CSV file is empty"}), 400

    header = [h.strip().lower() for h in rows[0]]
    has_header = any("question" in h for h in header)
    data_rows = rows[1:] if has_header else rows

    col_map = {
        "question": 0, "option1": 1, "option2": 2, "option3": 3, "option4": 4,
        "answer": 5, "explanation": 6
    }
    if has_header:
        for idx, h in enumerate(header):
            if "question" in h or h == "q": col_map["question"] = idx
            elif "option1" in h or "opt1" in h or h == "a": col_map["option1"] = idx
            elif "option2" in h or "opt2" in h or h == "b": col_map["option2"] = idx
            elif "option3" in h or "opt3" in h or h == "c": col_map["option3"] = idx
            elif "option4" in h or "opt4" in h or h == "d": col_map["option4"] = idx
            elif "answer" in h or "ans" in h or "correct" in h: col_map["answer"] = idx
            elif "explanation" in h or "exp" in h: col_map["explanation"] = idx

    max_order_res = conn.execute("SELECT COALESCE(MAX(display_order), 0) as max FROM questions WHERE section_id=?", (section_id,)).fetchone()
    current_order = max_order_res["max"] if max_order_res else 0

    inserted_count = 0
    for r in data_rows:
        if not r or all(not str(cell).strip() for cell in r):
            continue
        def get_val(key, default=""):
            idx = col_map.get(key)
            if idx is not None and idx < len(r):
                return r[idx].strip()
            return default

        q_text = get_val("question")
        if not q_text:
            continue
        opt1 = get_val("option1")
        opt2 = get_val("option2")
        opt3 = get_val("option3")
        opt4 = get_val("option4")
        ans_raw = get_val("answer")
        explanation = get_val("explanation")

        ans_clean = ans_raw.strip().upper()
        if ans_clean in ("1", "A"):
            answer = opt1
        elif ans_clean in ("2", "B"):
            answer = opt2
        elif ans_clean in ("3", "C"):
            answer = opt3
        elif ans_clean in ("4", "D"):
            answer = opt4
        elif ans_raw.strip():
            answer = ans_raw.strip()
        else:
            answer = opt1

        current_order += 1
        conn.execute("""
            INSERT INTO questions (exam_id, section_id, question, option1, option2, option3, option4, answer, mandatory, display_order, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """, (exam_id, section_id, q_text, opt1, opt2, opt3, opt4, answer, current_order, explanation))
        inserted_count += 1

    log_action("Teacher", session["username"], f"Imported {inserted_count} questions via CSV into '{section['exam_name']}' - '{section['section_name']}'", conn=conn)
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "count": inserted_count,
        "message": f"Successfully imported {inserted_count} questions into {section['section_name']}."
    })


@teacher_bp.route("/teacher/exam_question/<int:question_id>/edit", methods=["GET", "POST"])
def edit_exam_question(question_id):
    """Edit a regular exam question"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
    
    if not question:
        conn.close()
        return redirect("/teacher")
    
    if request.method == "POST":
        question_text = request.form.get("question")
        option1 = request.form.get("option1")
        option2 = request.form.get("option2")
        option3 = request.form.get("option3")
        option4 = request.form.get("option4")
        answer_index = request.form.get("answer")
        mandatory = 1 if request.form.get("mandatory") else 0
        explanation = request.form.get("explanation", "").strip()
        
        if answer_index == "1":
            answer = option1
        elif answer_index == "2":
            answer = option2
        elif answer_index == "3":
            answer = option3
        elif answer_index == "4":
            answer = option4
        else:
            answer = answer_index
        
        file = request.files.get("image")
        image_filename = question["image"]
        
        if file and file.filename != "":
            if image_filename:
                old_path = os.path.join("static/images", image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"exam_q_{question_id}_{int(datetime.now().timestamp())}.jpg"
            save_path = os.path.join("static/images", image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE questions SET
            question=?, option1=?, option2=?, option3=?, option4=?, answer=?, image=?, mandatory=?, explanation=?
            WHERE id=?
        """, (question_text, option1, option2, option3, option4, answer, image_filename, mandatory, explanation, question_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/teacher/exam_section/{question['section_id']}/questions")
    
    conn.close()
    return render_template("exam_edit_question.html", question=question)


@teacher_bp.route("/teacher/exam_question/<int:question_id>/delete", methods=["GET", "POST"])
def delete_exam_question(question_id):
    """Delete a regular exam question"""
    if "teacher_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    
    conn = get_db_connection()
    try:
        question = conn.execute("SELECT section_id, image FROM questions WHERE id=?", (question_id,)).fetchone()
        
        if question:
            # Delete responses for this question first
            conn.execute("DELETE FROM exam_question_responses WHERE question_id=?", (question_id,))
            
            if question["image"] and question["image"] != "default.png":
                img_path = os.path.join("static/images", question["image"])
                if os.path.exists(img_path):
                    try:
                        os.remove(img_path)
                    except Exception:
                        pass
            
            section_id = question["section_id"]
            conn.execute("DELETE FROM questions WHERE id=?", (question_id,))
            conn.commit()
            
            if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"success": True, "message": "Question deleted successfully"}
            return redirect(f"/teacher/exam_section/{section_id}/questions")
        
        if request.is_json:
            return {"error": "Question not found"}, 404
        return redirect("/teacher")
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()


@teacher_bp.route("/teacher/exam_question/<int:question_id>/data")
def exam_question_data(question_id):
    """Get question data for preview (AJAX)"""
    if "teacher_id" not in session:
        return {"success": False, "error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
    conn.close()
    
    if not question:
        return {"success": False, "error": "Question not found"}, 404
    
    question_dict = {
        "id": question["id"],
        "question": question["question"] or "",
        "option1": question["option1"] or "",
        "option2": question["option2"] or "",
        "option3": question["option3"] or "",
        "option4": question["option4"] or "",
        "answer": question["answer"] or "",
        "image": question["image"] if question["image"] else None,
        "mandatory": question["mandatory"] if "mandatory" in question.keys() else 0,
        "explanation": question["explanation"] if ("explanation" in question.keys() and question["explanation"]) else ""
    }
    
    return {"success": True, "question": question_dict}


@teacher_bp.route("/teacher/exam_section/<int:section_id>/groups")
def exam_section_groups(section_id):
    """View groups in a regular exam section"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT * FROM exam_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return redirect("/teacher")
    
    groups = conn.execute("""
        SELECT * FROM exam_question_groups 
        WHERE section_id=? 
        ORDER BY display_order
    """, (section_id,)).fetchall()
    
    groups_list = []
    for group in groups:
        group_dict = dict(group)
        questions = conn.execute("""
            SELECT * FROM questions 
            WHERE group_id=? 
            ORDER BY display_order
        """, (group["id"],)).fetchall()
        group_dict["questions"] = questions
        groups_list.append(group_dict)
    
    conn.close()
    
    return render_template("exam_groups.html", section=section, groups=groups_list)


@teacher_bp.route("/teacher/exam_section/<int:section_id>/groups", methods=["POST"])
def add_exam_group(section_id):
    """Add a new group to regular exam section"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT exam_id FROM exam_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return redirect("/teacher")
    
    exam_id = section["exam_id"]
    
    group_name = request.form.get("group_name")
    group_type = request.form.get("group_type", "normal")
    group_content = request.form.get("group_content", "")
    instruction_text = request.form.get("instruction_text", "")
    
    file = request.files.get("group_image")
    image_filename = None
    if file and file.filename != "":
        image_filename = f"exam_group_{exam_id}_{section_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = os.path.join("static/images", image_filename)
        compress_image(file, save_path, 50)
    
    max_order = conn.execute(
        "SELECT COALESCE(MAX(display_order), 0) as max FROM exam_question_groups WHERE section_id=?", 
        (section_id,)
    ).fetchone()["max"]
    
    conn.execute("""
        INSERT INTO exam_question_groups (exam_id, section_id, group_name, group_type, group_content, group_image, instruction_text, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, section_id, group_name, group_type, group_content, image_filename, instruction_text, max_order + 1))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/teacher/exam_section/{section_id}/groups")


@teacher_bp.route("/teacher/exam_group/<int:group_id>/edit", methods=["GET", "POST"])
def edit_exam_group(group_id):
    """Edit a regular exam group"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT * FROM exam_question_groups WHERE id=?", (group_id,)).fetchone()
    
    if not group:
        conn.close()
        return redirect("/teacher")
    
    if request.method == "POST":
        group_name = request.form.get("group_name")
        group_type = request.form.get("group_type")
        group_content = request.form.get("group_content")
        instruction_text = request.form.get("instruction_text")
        
        file = request.files.get("group_image")
        image_filename = group["group_image"]
        
        if file and file.filename != "":
            if image_filename:
                old_path = os.path.join("static/images", image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"exam_group_{group_id}_{int(datetime.now().timestamp())}.jpg"
            save_path = os.path.join("static/images", image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE exam_question_groups SET
            group_name=?, group_type=?, group_content=?, group_image=?, instruction_text=?
            WHERE id=?
        """, (group_name, group_type, group_content, image_filename, instruction_text, group_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/teacher/exam_section/{group['section_id']}/groups")
    
    conn.close()
    return render_template("exam_edit_group.html", group=group)


@teacher_bp.route("/teacher/exam_group/<int:group_id>/delete")
def delete_exam_group(group_id):
    """Delete a regular exam group"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT section_id, group_image FROM exam_question_groups WHERE id=?", (group_id,)).fetchone()
    
    if group:
        if group["group_image"]:
            img_path = os.path.join("static/images", group["group_image"])
            if os.path.exists(img_path):
                os.remove(img_path)
        
        section_id = group["section_id"]
        # Unlink questions from this group
        conn.execute("UPDATE questions SET group_id=NULL WHERE group_id=?", (group_id,))
        conn.execute("DELETE FROM exam_question_groups WHERE id=?", (group_id,))
        conn.commit()
        conn.close()
        return redirect(f"/teacher/exam_section/{section_id}/groups")
    
    conn.close()
    return redirect("/teacher")


@teacher_bp.route("/teacher/exam_group/<int:group_id>/add_question", methods=["POST"])
def add_question_to_exam_group(group_id):
    """Add a question to a regular exam group"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT * FROM exam_question_groups WHERE id=?", (group_id,)).fetchone()
    
    if not group:
        conn.close()
        return redirect("/teacher")
    
    question_text = request.form.get("question")
    option1 = request.form.get("option1")
    option2 = request.form.get("option2")
    option3 = request.form.get("option3")
    option4 = request.form.get("option4")
    answer_index = request.form.get("answer")
    mandatory = 1 if request.form.get("mandatory") else 0
    
    if answer_index == "1":
        answer = option1
    elif answer_index == "2":
        answer = option2
    elif answer_index == "3":
        answer = option3
    elif answer_index == "4":
        answer = option4
    else:
        answer = answer_index
    
    file = request.files.get("image")
    image_filename = None
    if file and file.filename != "":
        image_filename = f"exam_group_q_{group_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = os.path.join("static/images", image_filename)
        compress_image(file, save_path, 50)
    
    max_order = conn.execute(
        "SELECT COALESCE(MAX(display_order), 0) as max FROM questions WHERE group_id=?", 
        (group_id,)
    ).fetchone()["max"]
    
    conn.execute("""
        INSERT INTO questions (exam_id, section_id, group_id, question, option1, option2, option3, option4, answer, image, mandatory, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (group["exam_id"], group["section_id"], group_id, question_text, option1, option2, option3, option4, answer, image_filename, mandatory, max_order + 1))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/teacher/exam_section/{group['section_id']}/groups")


@teacher_bp.route("/teacher/exam_question/<int:question_id>/remove_from_group")
def remove_question_from_exam_group(question_id):
    """Remove a question from its group"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT section_id FROM questions WHERE id=?", (question_id,)).fetchone()
    
    if question:
        conn.execute("UPDATE questions SET group_id=NULL WHERE id=?", (question_id,))
        conn.commit()
        conn.close()
        return redirect(f"/teacher/exam_section/{question['section_id']}/groups")
    
    conn.close()
    return redirect("/teacher")


@teacher_bp.route("/teacher/exam_group_question/<int:question_id>/edit", methods=["GET", "POST"])
def edit_exam_group_question(question_id):
    """Edit a question that belongs to a group"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM questions WHERE id=?", (question_id,)).fetchone()
    
    if not question:
        conn.close()
        return redirect("/teacher")
    
    group = None
    if question['group_id']:
        group = conn.execute("SELECT group_name FROM exam_question_groups WHERE id=?", (question['group_id'],)).fetchone()
    
    if request.method == "POST":
        question_text = request.form.get("question")
        option1 = request.form.get("option1")
        option2 = request.form.get("option2")
        option3 = request.form.get("option3")
        option4 = request.form.get("option4")
        answer_index = request.form.get("answer")
        mandatory = 1 if request.form.get("mandatory") else 0
        
        if answer_index == "1":
            answer = option1
        elif answer_index == "2":
            answer = option2
        elif answer_index == "3":
            answer = option3
        elif answer_index == "4":
            answer = option4
        else:
            answer = answer_index
        
        file = request.files.get("image")
        image_filename = question["image"]
        
        if file and file.filename != "":
            if image_filename and image_filename != "default.png":
                old_path = os.path.join("static/images", image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"exam_group_q_{question_id}_{int(datetime.now().timestamp())}.jpg"
            save_path = os.path.join("static/images", image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE questions SET
            question=?, option1=?, option2=?, option3=?, option4=?, answer=?, image=?, mandatory=?
            WHERE id=?
        """, (question_text, option1, option2, option3, option4, answer, image_filename, mandatory, question_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/teacher/exam_section/{question['section_id']}/groups")
    
    conn.close()
    return render_template("exam_edit_group_question.html", 
                         question=question, 
                         section_id=question['section_id'], 
                         group_name=group['group_name'] if group else None)


@teacher_bp.route("/teacher")
def teacher_dashboard():
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get teacher details
    try:
        teacher = conn.execute("""
            SELECT username, class, photo, 
                   COALESCE(class_teacher_of, '') as class_teacher_of 
            FROM teachers WHERE id=?
        """, (teacher_id,)).fetchone()
    except sqlite3.OperationalError:
        teacher = conn.execute("""
            SELECT username, class, photo, '' as class_teacher_of 
            FROM teachers WHERE id=?
        """, (teacher_id,)).fetchone()
    
    # FIXED: Build teaching classes from assignments ONLY
    teaching_classes = []
    specialisations_by_class = {}
    
    try:
        class_assignments = conn.execute("""
            SELECT class_name, specialisation 
            FROM teacher_class_assignments 
            WHERE teacher_id=?
            ORDER BY class_name
        """, (teacher_id,)).fetchall()
        
        if class_assignments:
            for ca in class_assignments:
                if ca["class_name"] not in specialisations_by_class:
                    specialisations_by_class[ca["class_name"]] = []
                    teaching_classes.append(ca["class_name"])
                # FIX: Only append if not already present
                if ca["specialisation"] not in specialisations_by_class[ca["class_name"]]:
                    specialisations_by_class[ca["class_name"]].append(ca["specialisation"])
        else:
            # Fallback only if no assignments exist
            if teacher and teacher["class"]:
                teaching_classes = [teacher["class"]]
                specialisations_by_class[teacher["class"]] = ["General"]
    except sqlite3.OperationalError:
        # Table doesn't exist - use legacy
        if teacher and teacher["class"]:
            teaching_classes = [teacher["class"]]
            specialisations_by_class[teacher["class"]] = ["General"]
    
    is_form_tutor = teacher["class_teacher_of"] and teacher["class_teacher_of"] != ""
    
    # Get exams created by this teacher
    try:
        my_exams = conn.execute("""
    SELECT e.*, 
           (SELECT COUNT(*) FROM scores WHERE exam_id = e.id) as attempt_count,
           (SELECT AVG(CAST(score AS FLOAT) / CAST(total AS FLOAT) * 100) 
            FROM scores WHERE exam_id = e.id AND total > 0) as avg_score
    FROM exams e
    WHERE e.teacher_id = ? AND (e.deactivated IS NULL OR e.deactivated = 0)
    ORDER BY e.id DESC
""", (teacher_id,)).fetchall()
    except sqlite3.OperationalError:
        my_exams = conn.execute("""
            SELECT e.*, 
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id) as attempt_count,
                   0 as avg_score
            FROM exams e
            WHERE e.teacher_id=?
            ORDER BY e.id DESC
        """, (teacher_id,)).fetchall()
    
    # Group exams by class
    exams_by_class = {}
    my_exams_list = []
    for exam in my_exams:
        exam_dict = dict(exam)
        my_exams_list.append(exam_dict)
        class_name = exam_dict.get("class", "Unknown")
        if class_name not in exams_by_class:
            exams_by_class[class_name] = []
        exams_by_class[class_name].append(exam_dict)
    
    # Get students in teacher's classes
    my_students = []
    if teaching_classes:
        seen_ids = set()
        student_rows = []
        for class_name in teaching_classes:
            specs = specialisations_by_class.get(class_name, ["General"])
            try:
                if "General" in specs:
                    rows = conn.execute("""
                        SELECT DISTINCT s.* FROM students s
                        WHERE s.class=? AND s.status='approved'
                        ORDER BY s.username
                    """, (class_name,)).fetchall()
                else:
                    # Build query for specific specialisations
                    placeholders = ",".join("?" * len(specs))
                    rows = conn.execute(f"""
                        SELECT DISTINCT s.* FROM students s
                        WHERE s.class=? AND s.specialisation IN ({placeholders}) AND s.status='approved'
                        ORDER BY s.username
                    """, [class_name] + specs).fetchall()
                
                for row in rows:
                    if row["id"] not in seen_ids:
                        seen_ids.add(row["id"])
                        student_rows.append(row)
            except sqlite3.OperationalError:
                rows = conn.execute("""
                    SELECT DISTINCT s.* FROM students s
                    WHERE s.class=? AND s.status='approved'
                    ORDER BY s.username
                """, (class_name,)).fetchall()
                for row in rows:
                    if row["id"] not in seen_ids:
                        seen_ids.add(row["id"])
                        student_rows.append(row)
        my_students = student_rows
    
    # Get results
    my_results = []
    all_subject_results = []
    
    if my_exams_list:
        my_exam_ids = [e["id"] for e in my_exams_list]
        placeholders = ",".join("?" * len(my_exam_ids))
        
        try:
            my_results = conn.execute(f"""
                SELECT s.id as student_id, s.username as student_name, s.class as student_class,
                       e.id as exam_id, e.name as exam_name,
                       sc.score, sc.total, sc.percentage, sc.status
                FROM scores sc
                JOIN students s ON sc.student_id = s.id
                JOIN exams e ON sc.exam_id = e.id
                WHERE sc.exam_id IN ({placeholders}) AND sc.status='completed'
                ORDER BY s.class, s.username, e.name
            """, my_exam_ids).fetchall()
        except sqlite3.OperationalError:
            my_results_raw = conn.execute(f"""
                SELECT s.id as student_id, s.username as student_name, s.class as student_class,
                       e.id as exam_id, e.name as exam_name,
                       sc.score, sc.total, sc.status
                FROM scores sc
                JOIN students s ON sc.student_id = s.id
                JOIN exams e ON sc.exam_id = e.id
                WHERE sc.exam_id IN ({placeholders}) AND sc.status='completed'
                ORDER BY s.class, s.username, e.name
            """, my_exam_ids).fetchall()
            my_results = []
            for r in my_results_raw:
                r_dict = dict(r)
                if r_dict.get("total") and r_dict["total"] > 0:
                    r_dict["percentage"] = (r_dict["score"] / r_dict["total"]) * 100
                else:
                    r_dict["percentage"] = 0
                my_results.append(r_dict)
    
    # Form tutor section
    form_class_students = []
    if is_form_tutor:
        form_class = teacher["class_teacher_of"]
        try:
            form_class_students = conn.execute("""
                SELECT * FROM students WHERE class=? AND status='approved' ORDER BY username
            """, (form_class,)).fetchall()
        except:
            form_class_students = conn.execute("""
                SELECT * FROM students WHERE class=? ORDER BY username
            """, (form_class,)).fetchall()
        
        try:
            all_subject_results = conn.execute("""
                SELECT s.id as student_id, s.username as student_name, 
                       e.id as exam_id, e.name as exam_name, 
                       sc.score, sc.total, sc.percentage,
                       t.username as teacher_name
                FROM scores sc
                JOIN students s ON sc.student_id = s.id
                JOIN exams e ON sc.exam_id = e.id
                JOIN teachers t ON e.teacher_id = t.id
                WHERE s.class=? AND sc.status='completed'
                ORDER BY s.username, e.name
            """, (form_class,)).fetchall()
        except:
            results_raw = conn.execute("""
                SELECT s.id as student_id, s.username as student_name, 
                       e.id as exam_id, e.name as exam_name, 
                       sc.score, sc.total,
                       t.username as teacher_name
                FROM scores sc
                JOIN students s ON sc.student_id = s.id
                JOIN exams e ON sc.exam_id = e.id
                JOIN teachers t ON e.teacher_id = t.id
                WHERE s.class=? AND sc.status='completed'
                ORDER BY s.username, e.name
            """, (form_class,)).fetchall()
            all_subject_results = []
            for r in results_raw:
                r_dict = dict(r)
                if r_dict["total"] and r_dict["total"] > 0:
                    r_dict["percentage"] = (r_dict["score"] / r_dict["total"]) * 100
                else:
                    r_dict["percentage"] = 0
                all_subject_results.append(r_dict)
    
    conn.close()
    
    return render_template("teacher_dashboard.html",
                         teacher=teacher,
                         teaching_classes=teaching_classes,
                         specialisations_by_class=specialisations_by_class,
                         is_form_tutor=is_form_tutor,
                         my_exams=my_exams_list,
                         exams_by_class=exams_by_class,
                         my_students=my_students,
                         my_results=my_results,
                         form_class_students=form_class_students,
                         all_subject_results=all_subject_results,
                         username=session.get("username", teacher["username"] if teacher and "username" in teacher.keys() else "Teacher"),
                         photo=session.get("photo", teacher["photo"] if teacher and "photo" in teacher.keys() else "default.png"))


@teacher_bp.route("/teacher/analytics")
def teacher_analytics():
    """Overall analytics dashboard for a teacher across all their classes"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get filter parameters
    filter_class = request.args.get('class', 'all')
    filter_exam = request.args.get('exam_id', 'all')
    
    # Get teacher's classes
    teaching_classes = []
    try:
        class_assignments = conn.execute("""
            SELECT DISTINCT class_name FROM teacher_class_assignments WHERE teacher_id=?
        """, (teacher_id,)).fetchall()
        teaching_classes = [c["class_name"] for c in class_assignments]
    except:
        teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        if teacher and teacher["class"]:
            teaching_classes = [teacher["class"]]
    
    # Build class filter
    class_condition = ""
    params = [teacher_id]
    if filter_class != 'all' and filter_class in teaching_classes:
        class_condition = " AND e.class = ?"
        params.append(filter_class)
    
    # Get all exams by this teacher
    exams = conn.execute(f"""
        SELECT e.*, 
               COUNT(DISTINCT sc.student_id) as student_count,
               AVG(sc.percentage) as avg_score,
               COUNT(sc.id) as attempt_count
        FROM exams e
        LEFT JOIN scores sc ON e.id = sc.exam_id AND sc.status = 'completed'
        WHERE e.teacher_id = ? {class_condition}
        GROUP BY e.id
        ORDER BY e.id DESC
    """, params).fetchall()
    
    # Grade Distribution (across all teacher's completed exams)
    grade_dist = conn.execute(f"""
        SELECT 
            CASE 
                WHEN sc.percentage >= 90 THEN 'A'
                WHEN sc.percentage >= 80 THEN 'B'
                WHEN sc.percentage >= 70 THEN 'C'
                WHEN sc.percentage >= 65 THEN 'D'
                ELSE 'F'
            END as grade,
            COUNT(*) as count
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
        AND sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY grade
        ORDER BY 
            CASE grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    """, params).fetchall()
    
    grade_labels = [g["grade"] for g in grade_dist] if grade_dist else []
    grade_counts = [g["count"] for g in grade_dist] if grade_dist else []
    
    # Top 10 Students by average
    top_students = conn.execute(f"""
        SELECT s.id, s.username, s.full_name, s.class, s.photo,
               AVG(sc.percentage) as avg_score,
               COUNT(sc.id) as exam_count
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
        AND sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY s.id
        HAVING exam_count >= 1
        ORDER BY avg_score DESC
        LIMIT 10
    """, params).fetchall()
    
    # Bottom 5 Students
    bottom_students = conn.execute(f"""
        SELECT s.id, s.username, s.full_name, s.class, s.photo,
               AVG(sc.percentage) as avg_score,
               COUNT(sc.id) as exam_count
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
        AND sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY s.id
        HAVING exam_count >= 1
        ORDER BY avg_score ASC
        LIMIT 5
    """, params).fetchall()
    
    # Section Performance Analysis - with fallback for empty data
    try:
        section_performance = conn.execute(f"""
            SELECT es.section_name, e.name as exam_name, e.id as exam_id,
                   AVG(CASE WHEN eqr.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as accuracy,
                   COUNT(DISTINCT eqr.question_id) as question_count,
                   COUNT(eqr.id) as total_responses
            FROM exam_question_responses eqr
            JOIN exam_sections es ON eqr.section_id = es.id
            JOIN exams e ON eqr.exam_id = e.id
            WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
            AND eqr.is_correct IS NOT NULL
            GROUP BY es.id, e.id
            ORDER BY accuracy ASC
            LIMIT 15
        """, params).fetchall()
    except sqlite3.OperationalError:
        section_performance = []
    
    # Overall class average
    overall_avg = conn.execute(f"""
        SELECT AVG(sc.percentage) as overall_average
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
        AND sc.status = 'completed' AND sc.percentage IS NOT NULL
    """, params).fetchone()
    
    class_avg = round(overall_avg["overall_average"] or 0, 1) if overall_avg else 0
    
    # Total unique students taught
    total_students_result = conn.execute(f"""
        SELECT COUNT(DISTINCT sc.student_id) as count
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.teacher_id = ? {class_condition.replace('e.class', 'e.class')}
    """, params).fetchone()
    total_students = total_students_result["count"] if total_students_result else 0
    
    # Get all exams for filter dropdown
    all_exams = conn.execute("""
        SELECT id, name FROM exams WHERE teacher_id=? ORDER BY name
    """, (teacher_id,)).fetchall()
    
    conn.close()
    
    return render_template("teacher_analytics.html",
                         teacher_name=session["username"],
                         teaching_classes=teaching_classes,
                         exams=exams,
                         all_exams=all_exams,
                         filter_class=filter_class,
                         filter_exam=filter_exam,
                         grade_labels=json.dumps(grade_labels),
                         grade_counts=json.dumps(grade_counts),
                         top_students=top_students,
                         bottom_students=bottom_students,
                         section_performance=section_performance,
                         class_avg=class_avg,
                         total_students=total_students,
                         total_exams=len(exams))


@teacher_bp.route("/teacher/exam/<int:exam_id>/analytics")
def exam_analytics(exam_id):
    """Detailed analytics for a specific exam"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Verify exam ownership
    exam = conn.execute("""
        SELECT * FROM exams WHERE id=? AND teacher_id=?
    """, (exam_id, teacher_id)).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found or unauthorized", 403
    
    # Grade distribution for this exam
    grade_dist = conn.execute("""
        SELECT 
            CASE 
                WHEN percentage >= 90 THEN 'A'
                WHEN percentage >= 80 THEN 'B'
                WHEN percentage >= 70 THEN 'C'
                WHEN percentage >= 65 THEN 'D'
                ELSE 'F'
            END as grade,
            COUNT(*) as count
        FROM scores 
        WHERE exam_id = ? AND status = 'completed' AND percentage IS NOT NULL
        GROUP BY grade
        ORDER BY 
            CASE grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    """, (exam_id,)).fetchall()
    
    grade_labels = [g["grade"] for g in grade_dist] if grade_dist else []
    grade_counts = [g["count"] for g in grade_dist] if grade_dist else []
    
    # Score statistics
    score_stats = conn.execute("""
        SELECT 
            COUNT(*) as total_attempts,
            AVG(percentage) as avg_score,
            MAX(percentage) as highest_score,
            MIN(percentage) as lowest_score,
            AVG(score) as avg_raw,
            SUM(CASE WHEN percentage >= 50 THEN 1 ELSE 0 END) as passed_count
        FROM scores 
        WHERE exam_id = ? AND status = 'completed' AND percentage IS NOT NULL
    """, (exam_id,)).fetchone()
    
    # Most missed questions - with fallback
    try:
        most_missed = conn.execute("""
            SELECT q.id, q.question, q.section_id, es.section_name,
                   COUNT(CASE WHEN eqr.is_correct = 0 THEN 1 END) as wrong_count,
                   COUNT(eqr.id) as total_attempts,
                   ROUND(COUNT(CASE WHEN eqr.is_correct = 0 THEN 1 END) * 100.0 / MAX(1, COUNT(eqr.id)), 1) as error_rate
            FROM questions q
            LEFT JOIN exam_question_responses eqr ON q.id = eqr.question_id AND eqr.exam_id = ?
            LEFT JOIN exam_sections es ON q.section_id = es.id
            WHERE q.exam_id = ?
            GROUP BY q.id
            HAVING COUNT(eqr.id) > 0
            ORDER BY error_rate DESC
            LIMIT 10
        """, (exam_id, exam_id)).fetchall()
    except sqlite3.OperationalError:
        most_missed = []
    
    # Most correct questions
    try:
        most_correct = conn.execute("""
            SELECT q.id, q.question, q.section_id, es.section_name,
                   COUNT(CASE WHEN eqr.is_correct = 1 THEN 1 END) as correct_count,
                   COUNT(eqr.id) as total_attempts,
                   ROUND(COUNT(CASE WHEN eqr.is_correct = 1 THEN 1 END) * 100.0 / MAX(1, COUNT(eqr.id)), 1) as success_rate
            FROM questions q
            LEFT JOIN exam_question_responses eqr ON q.id = eqr.question_id AND eqr.exam_id = ?
            LEFT JOIN exam_sections es ON q.section_id = es.id
            WHERE q.exam_id = ?
            GROUP BY q.id
            HAVING COUNT(eqr.id) > 0
            ORDER BY success_rate DESC
            LIMIT 5
        """, (exam_id, exam_id)).fetchall()
    except sqlite3.OperationalError:
        most_correct = []
    
    # Section performance - with fallback
    try:
        section_perf = conn.execute("""
            SELECT es.id, es.section_name,
                   COUNT(DISTINCT q.id) as question_count,
                   AVG(CASE WHEN eqr.is_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as accuracy,
                   COUNT(DISTINCT eqr.student_id) as students_attempted
            FROM exam_sections es
            LEFT JOIN questions q ON es.id = q.section_id
            LEFT JOIN exam_question_responses eqr ON q.id = eqr.question_id AND eqr.exam_id = ?
            WHERE es.exam_id = ?
            GROUP BY es.id
            ORDER BY accuracy ASC
        """, (exam_id, exam_id)).fetchall()
    except sqlite3.OperationalError:
        section_perf = []
    
    # Student rankings for this exam
    rankings = conn.execute("""
        SELECT s.id, s.username, s.full_name, s.class, s.photo,
               sc.score, sc.total, sc.percentage, sc.end_time, sc.start_time,
               (strftime('%s', sc.end_time) - strftime('%s', sc.start_time)) as time_spent_seconds
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        WHERE sc.exam_id = ? AND sc.status = 'completed'
        ORDER BY sc.percentage DESC, time_spent_seconds ASC
    """, (exam_id,)).fetchall()
    
    # Fastest completions
    fastest = sorted(
        [r for r in rankings if r["time_spent_seconds"] and r["time_spent_seconds"] > 0],
        key=lambda x: x["time_spent_seconds"]
    )[:5]
    
    conn.close()
    
    return render_template("exam_analytics.html",
                         exam=exam,
                         grade_labels=json.dumps(grade_labels),
                         grade_counts=json.dumps(grade_counts),
                         score_stats=score_stats,
                         most_missed=most_missed,
                         most_correct=most_correct,
                         section_perf=section_perf,
                         rankings=rankings,
                         fastest=fastest,
                         total_students=len(rankings))


@teacher_bp.route("/teacher/student/<int:student_id>")
def student_profile(student_id):
    """Complete student profile with all exam results and analysis"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get student info
    student = conn.execute("""
        SELECT * FROM students WHERE id=?
    """, (student_id,)).fetchone()
    
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Try to verify teacher teaches this student's class
    try:
        authorized = conn.execute("""
            SELECT id FROM teacher_class_assignments 
            WHERE teacher_id=? AND class_name=?
        """, (teacher_id, student["class"])).fetchone()
        if not authorized:
            # Check if teacher is form tutor of this class
            teacher_info = conn.execute("SELECT class_teacher_of FROM teachers WHERE id=?", (teacher_id,)).fetchone()
            if not (teacher_info and teacher_info["class_teacher_of"] == student["class"]):
                # Still allow access - just warn in logs
                pass
    except:
        pass  # Allow access if table doesn't exist
    
    # Get all exam results for this student from THIS teacher's exams
    results = conn.execute("""
        SELECT sc.*, e.name as exam_name, e.subject_tag, e.specialisation_tag,
               (strftime('%s', sc.end_time) - strftime('%s', sc.start_time)) as time_spent_seconds
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE sc.student_id = ? AND e.teacher_id = ? AND sc.status = 'completed'
        ORDER BY sc.end_time DESC
    """, (student_id, teacher_id)).fetchall()
    
    # Calculate overall stats
    total_exams = len(results)
    if total_exams > 0:
        valid_results = [r for r in results if r["percentage"] is not None]
        if valid_results:
            avg_score = sum(r["percentage"] for r in valid_results) / len(valid_results)
            best_exam = max(valid_results, key=lambda r: r["percentage"] if r["percentage"] is not None else 0)
            worst_exam = min(valid_results, key=lambda r: r["percentage"] if r["percentage"] is not None else 0)
        else:
            avg_score = 0
            best_exam = None
            worst_exam = None
    else:
        avg_score = 0
        best_exam = None
        worst_exam = None
    
    # Class average
    class_avg_result = conn.execute("""
        SELECT AVG(sc.percentage) as avg FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        JOIN students s ON sc.student_id = s.id
        WHERE s.class = ? AND e.teacher_id = ? AND sc.status = 'completed' AND sc.percentage IS NOT NULL
    """, (student["class"], teacher_id)).fetchone()
    
    class_average = round(class_avg_result["avg"] or 0, 1) if class_avg_result else 0
    
    conn.close()
    
    return render_template("student_profile.html",
                         student=student,
                         results=results,
                         total_exams=total_exams,
                         avg_score=round(avg_score, 1),
                         best_exam=best_exam,
                         worst_exam=worst_exam,
                         class_average=class_average)


@teacher_bp.route("/teacher/student/<int:student_id>/exam/<int:exam_id>")
def student_exam_detail(student_id, exam_id):
    """Detailed view of a single student's exam attempt with per-question breakdown"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get student info
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Get exam info (allow form tutors to view too)
    exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        return "Exam not found", 404
    
    # Check authorization - teacher owns exam OR is form tutor of student's class
    authorized = False
    if exam["teacher_id"] == teacher_id:
        authorized = True
    else:
        # Check if form tutor
        teacher_info = conn.execute("SELECT class_teacher_of FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        if teacher_info and teacher_info["class_teacher_of"] == student["class"]:
            authorized = True
    
    if not authorized:
        conn.close()
        return "Unauthorized to view this student's exam details", 403
    
    # Get score
    score = conn.execute("""
        SELECT *, (strftime('%s', end_time) - strftime('%s', start_time)) as time_spent_seconds
        FROM scores 
        WHERE student_id=? AND exam_id=? AND status='completed'
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if not score:
        conn.close()
        return "No completed attempt found for this student in this exam", 404
    
    # Try to get per-question responses
    questions_detail = []
    missed_questions = []
    correct_questions = []
    section_performance = {}
    
    try:
        questions_detail = conn.execute("""
            SELECT q.*, es.section_name,
                   eqr.user_answer, eqr.is_correct, eqr.time_spent
            FROM exam_question_responses eqr
            JOIN questions q ON eqr.question_id = q.id
            LEFT JOIN exam_sections es ON q.section_id = es.id
            WHERE eqr.student_id = ? AND eqr.exam_id = ?
            ORDER BY es.section_order, q.display_order, q.id
        """, (student_id, exam_id)).fetchall()
    except sqlite3.OperationalError:
        questions_detail = []
    
    # Process question details - FIXED: Use dictionary-style access with fallbacks
    for q_row in questions_detail:
        # Convert Row to plain dict to avoid .get() issues
        q = dict(q_row)
        
        options = [
            q.get('option1') or '',
            q.get('option2') or '',
            q.get('option3') or '',
            q.get('option4') or ''
        ]
        letters = ['A', 'B', 'C', 'D']
        
        # Determine chosen letter
        chosen_letter = '—'
        user_answer = q.get('user_answer')
        if user_answer:
            for i, opt in enumerate(options):
                if opt and opt == user_answer:
                    chosen_letter = letters[i]
                    break
        
        # Determine correct letter
        correct_letter = '—'
        correct_answer = q.get('answer')
        if correct_answer:
            for i, opt in enumerate(options):
                if opt and opt == correct_answer:
                    correct_letter = letters[i]
                    break
        
        q['chosen_letter'] = chosen_letter
        q['correct_letter'] = correct_letter
        
        is_correct_val = q.get('is_correct', 0)
        if is_correct_val:
            correct_questions.append(q)
        else:
            missed_questions.append(q)
        
        # Section performance
        section_name = q.get('section_name') or 'General'
        if section_name not in section_performance:
            section_performance[section_name] = {"correct": 0, "total": 0}
        section_performance[section_name]["total"] += 1
        if is_correct_val:
            section_performance[section_name]["correct"] += 1
    
    # Calculate rank for this exam
    score_pct = score["percentage"] if score["percentage"] is not None else 0
    score_id = score["id"] if score["id"] is not None else 0
    
    rank_data = conn.execute("""
        SELECT COUNT(*) + 1 as rank 
        FROM scores 
        WHERE exam_id = ? AND status = 'completed' 
        AND (percentage > ? OR (percentage = ? AND id < ?))
    """, (exam_id, score_pct, score_pct, score_id)).fetchone()
    
    rank = rank_data["rank"] if rank_data else 1
    
    total_students_result = conn.execute("""
        SELECT COUNT(*) as count FROM scores WHERE exam_id=? AND status='completed'
    """, (exam_id,)).fetchone()
    total_students_in_exam = total_students_result["count"] if total_students_result else 0
    
    # Speed comparison
    speed_rank = 1
    fastest_time = 0
    avg_time = 0
    time_spent = score["time_spent_seconds"] if score["time_spent_seconds"] else 0
    
    if time_spent and time_spent > 0:
        speed_result = conn.execute("""
            SELECT COUNT(*) + 1 as rank FROM scores 
            WHERE exam_id = ? AND status = 'completed'
            AND (strftime('%s', end_time) - strftime('%s', start_time)) < ?
            AND (strftime('%s', end_time) - strftime('%s', start_time)) > 0
        """, (exam_id, time_spent)).fetchone()
        speed_rank = speed_result["rank"] if speed_result else 1
        
        fastest_result = conn.execute("""
            SELECT MIN(strftime('%s', end_time) - strftime('%s', start_time)) as min_time
            FROM scores WHERE exam_id=? AND status='completed'
            AND (strftime('%s', end_time) - strftime('%s', start_time)) > 0
        """, (exam_id,)).fetchone()
        fastest_time = fastest_result["min_time"] if fastest_result else 0
        
        avg_result = conn.execute("""
            SELECT AVG(strftime('%s', end_time) - strftime('%s', start_time)) as avg_time
            FROM scores WHERE exam_id=? AND status='completed'
            AND (strftime('%s', end_time) - strftime('%s', start_time)) > 0
        """, (exam_id,)).fetchone()
        avg_time = avg_result["avg_time"] if avg_result else 0
    
    # Determine grade
    percentage = score_pct
    if percentage >= 90:
        grade = 'A'
    elif percentage >= 80:
        grade = 'B'
    elif percentage >= 70:
        grade = 'C'
    elif percentage >= 65:
        grade = 'D'
    else:
        grade = 'F'
    
    conn.close()
    
    return render_template("student_exam_detail.html",
                         student=student,
                         exam=exam,
                         score=score,
                         missed_questions=missed_questions,
                         correct_questions=correct_questions,
                         section_performance=section_performance,
                         rank=rank,
                         total_students_in_exam=total_students_in_exam,
                         speed_rank=speed_rank,
                         fastest_time=fastest_time,
                         avg_time=avg_time,
                         grade=grade,
                         percentage=percentage)


@teacher_bp.route("/teacher/promote_student/<int:student_id>")
def promote_student(student_id):
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    
    if student:
        current_class = student["class"]
        parts = current_class.split()
        if len(parts) == 2 and parts[0].lower() == "grade" and parts[1].isdigit():
            new_grade = int(parts[1]) + 1
            new_class = f"Grade {new_grade}"
            conn.execute("UPDATE students SET class=? WHERE id=?", (new_class, student_id))
            log_action("Teacher", session["username"], f"Promoted student '{student['username']}' from {current_class} to {new_class}", conn=conn)
            conn.commit()
    
    conn.close()
    return redirect("/teacher")


@teacher_bp.route("/teacher/delete_exam/<int:exam_id>", methods=["POST"])
def teacher_delete_exam(exam_id):
    if "teacher_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    
    if not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    
    conn = get_db_connection()
    try:
        exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
        if not exam:
            return ("Exam not found", 404) if not request.is_json else ({"error": "Exam not found"}, 404)
        
        if exam["teacher_id"] != session["teacher_id"]:
            return ("Forbidden: You cannot delete another teacher's exam", 403) if not request.is_json else ({"error": "Forbidden"}, 403)
        
        conn.execute("BEGIN TRANSACTION")
        # 1. Responses
        conn.execute("DELETE FROM exam_question_responses WHERE exam_id=?", (exam_id,))
        # 2. Warning logs
        conn.execute("DELETE FROM warning_logs WHERE exam_id=?", (exam_id,))
        # 3. Notes & versions
        try:
            conn.execute("DELETE FROM exam_deactivation_notes WHERE exam_id=?", (exam_id,))
        except Exception:
            pass
        try:
            conn.execute("DELETE FROM exam_versions WHERE exam_id=?", (exam_id,))
        except Exception:
            pass
        # 4. Scores
        conn.execute("DELETE FROM scores WHERE exam_id=?", (exam_id,))
        # 5. Questions and question images
        questions = conn.execute("SELECT image FROM questions WHERE exam_id=?", (exam_id,)).fetchall()
        for q in questions:
            if q["image"] and q["image"] != "default.png":
                img_path = os.path.join("static/images", q["image"])
                if os.path.exists(img_path):
                    try:
                        os.remove(img_path)
                    except Exception:
                        pass
        conn.execute("DELETE FROM questions WHERE exam_id=?", (exam_id,))
        # 6. Sections and groups
        conn.execute("DELETE FROM exam_sections WHERE exam_id=?", (exam_id,))
        conn.execute("DELETE FROM exam_question_groups WHERE exam_id=?", (exam_id,))
        # 7. Exam
        conn.execute(
            "DELETE FROM exams WHERE id=? AND teacher_id=?",
            (exam_id, session["teacher_id"])
        )
        log_action("Teacher", session["username"], f"Deleted exam '{exam['name']}'", conn=conn)
        conn.commit()
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()

    if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"success": True, "message": f"Exam '{exam['name']}' deleted"}
    return redirect("/teacher")


@teacher_bp.route("/teacher/toggle_exam/<int:exam_id>")
def teacher_toggle_exam(exam_id):
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # 🚨 FIX: We now verify the exam using teacher_id, NOT session['class']
    exam = conn.execute(
        "SELECT * FROM exams WHERE id=? AND teacher_id=?",
        (exam_id, session["teacher_id"])
    ).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found or not allowed", 404
    
    new_status = 0 if exam["active"] == 1 else 1
    
    # 🚨 FIX: Update using just the exam ID
    conn.execute(
        "UPDATE exams SET active=? WHERE id=?",
        (new_status, exam_id)
    )
    
    status_text = "started" if new_status == 1 else "stopped"
    log_action("Teacher", session["username"], f"{status_text.capitalize()} exam '{exam['name']}'", conn=conn)
    
    conn.commit()
    conn.close()
    
    return redirect("/teacher")


@teacher_bp.route("/teacher/add_exam", methods=["GET", "POST"])
def teacher_add_exam():
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get teacher's class assignments
    class_assignments = conn.execute("""
        SELECT DISTINCT class_name, specialisation 
        FROM teacher_class_assignments 
        WHERE teacher_id=?
        ORDER BY class_name
    """, (session["teacher_id"],)).fetchall()
    
    # Organize by class for dropdown
    classes_taught = {}
    for ca in class_assignments:
        if ca["class_name"] not in classes_taught:
            classes_taught[ca["class_name"]] = []
        classes_taught[ca["class_name"]].append(ca["specialisation"])
    
    if request.method == "POST":
        name = request.form["exam_name"]
        duration = int(request.form["duration"])
        target_class = request.form["target_class"]
        subject_tag = request.form.get("subject_tag", "General")
        specialisation_tag = request.form.get("specialisation_tag", "General")
        
        # Strict check: teacher must have this exact class+specialisation assignment
        allowed = conn.execute("""
            SELECT id FROM teacher_class_assignments 
            WHERE teacher_id=? AND class_name=? AND specialisation=?
        """, (session["teacher_id"], target_class, specialisation_tag)).fetchone()
        
        if not allowed:
            conn.close()
            return "You are not authorized to create exams for this class/specialisation.", 403
        
        teacher_id = session["teacher_id"]
        
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exams (name, class, duration, teacher_id, subject_tag, specialisation) 
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, target_class, duration, teacher_id, subject_tag, specialisation_tag))
        
        exam_id = cursor.lastrowid
        
        # Insert questions (same as before)
        question_num = 1
        while f"question{question_num}" in request.form:
            q = request.form[f"question{question_num}"]
            op1 = request.form[f"option{question_num}_1"]
            op2 = request.form[f"option{question_num}_2"]
            op3 = request.form[f"option{question_num}_3"]
            op4 = request.form[f"option{question_num}_4"]
            
            file = request.files.get(f"image{question_num}")
            image_filename = None
            if file and file.filename != "":
                image_filename = f"q_{exam_id}_{question_num}_{int(datetime.now().timestamp())}.jpg"
                save_path = os.path.join("static/images", image_filename)
                compress_image(file, save_path, 50)
            
            ans_index = int(request.form[f"answer{question_num}"])
            ans = [op1, op2, op3, op4][ans_index - 1]
            
            cursor.execute("""
                INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer, image)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (exam_id, q, op1, op2, op3, op4, ans, image_filename))
            
            question_num += 1
        
        conn.commit()
        conn.close()
        return redirect("/teacher")
    
    conn.close()
    return render_template("teacher_add_exam.html", 
                           classes_taught=classes_taught)


@teacher_bp.route("/teacher/results/<int:exam_id>")
def teacher_results(exam_id):
    if "teacher_id" not in session: 
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id=? AND teacher_id=?", 
                       (exam_id, session["teacher_id"])).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found or not authorized.", 403
    
    exam_class = exam["class"]
    
    # FIXED: Use specialisation_tag instead of specialisation
    try:
        exam_spec = exam["specialisation_tag"]
    except (IndexError, KeyError):
        exam_spec = "General"
    
    try:
        if exam_spec and exam_spec != "General":
            # Specialist exam: only show students from that specific department
            students = conn.execute(
                "SELECT * FROM students WHERE class=? AND specialisation=? AND status='approved'",
                (exam_class, exam_spec)
            ).fetchall()
        else:
            # General exam (Smart Override): show ALL students in this class
            students = conn.execute(
                "SELECT * FROM students WHERE class=? AND status='approved'",
                (exam_class,)
            ).fetchall()
    except sqlite3.OperationalError:
        # Fallback if specialisation column doesn't exist
        students = conn.execute(
            "SELECT * FROM students WHERE class=?", 
            (exam_class,)
        ).fetchall()
    
    results = []
    for student in students:
        score = conn.execute(
            "SELECT score, total FROM scores WHERE student_id=? AND exam_id=?",
            (student["id"], exam_id)
        ).fetchone()
        
        display_name = student["full_name"] if "full_name" in student.keys() and student["full_name"] else student["username"]
        results.append({
            "student": display_name,
            "score": score["score"] if score else 0,
            "total": score["total"] if score else 0
        })
    
    conn.close()
    return render_template("teacher_results.html", results=results, exam=exam)


@teacher_bp.route("/teacher/import_exam", methods=["GET", "POST"])
def import_exam():
    if "teacher_id" not in session:
        return redirect("/")
    
    if request.method == "POST":
        teacher_id = session["teacher_id"]
        
        # Check if JSON or CSV file was uploaded
        file = request.files.get('json_file') or request.files.get('csv_file') or request.files.get('file')
        if not file or file.filename == '':
            return json.dumps({"success": False, "error": "No file selected"}), 400

        fname = file.filename.lower()
        exam_data = None

        if fname.endswith('.csv'):
            try:
                import csv, io
                raw_csv = file.read().decode('utf-8-sig', errors='replace')
                reader = csv.reader(io.StringIO(raw_csv))
                csv_rows = list(reader)
                if not csv_rows:
                    return json.dumps({"success": False, "error": "CSV file is empty"}), 400

                hdr = [h.strip().lower() for h in csv_rows[0]]
                has_hdr = any("question" in h for h in hdr)
                data_rows = csv_rows[1:] if has_hdr else csv_rows

                col_map = {"question": 0, "option1": 1, "option2": 2, "option3": 3, "option4": 4, "answer": 5, "explanation": 6}
                if has_hdr:
                    for idx, h in enumerate(hdr):
                        if "question" in h or h == "q": col_map["question"] = idx
                        elif "option1" in h or "opt1" in h or h == "a": col_map["option1"] = idx
                        elif "option2" in h or "opt2" in h or h == "b": col_map["option2"] = idx
                        elif "option3" in h or "opt3" in h or h == "c": col_map["option3"] = idx
                        elif "option4" in h or "opt4" in h or h == "d": col_map["option4"] = idx
                        elif "answer" in h or "ans" in h or "correct" in h: col_map["answer"] = idx
                        elif "explanation" in h or "exp" in h: col_map["explanation"] = idx

                parsed_questions = []
                for r in data_rows:
                    if not r or all(not str(c).strip() for c in r):
                        continue
                    def gv(k, d=""):
                        idx = col_map.get(k)
                        return r[idx].strip() if idx is not None and idx < len(r) else d
                    q_text = gv("question")
                    if not q_text:
                        continue
                    o1, o2, o3, o4 = gv("option1"), gv("option2"), gv("option3"), gv("option4")
                    ans_r = gv("answer")
                    exp = gv("explanation")
                    ans_num = 1
                    ans_clean = ans_r.strip().upper()
                    if ans_clean in ("2", "B") or ans_r == o2: ans_num = 2
                    elif ans_clean in ("3", "C") or ans_r == o3: ans_num = 3
                    elif ans_clean in ("4", "D") or ans_r == o4: ans_num = 4

                    parsed_questions.append({
                        "text": q_text,
                        "opt1": o1, "opt2": o2, "opt3": o3, "opt4": o4,
                        "answer": ans_num,
                        "explanation": exp,
                        "mandatory": False
                    })

                exam_title = request.form.get("name") or os.path.splitext(file.filename)[0].replace('_', ' ').title()
                exam_data = {
                    "name": exam_title,
                    "class": request.form.get("class") or session.get("class", "SS 1"),
                    "subject": request.form.get("subject", "General"),
                    "specialisation": request.form.get("specialisation", "General"),
                    "duration": int(request.form.get("duration", 60)),
                    "maxWarnings": int(request.form.get("maxWarnings", 5)),
                    "calculator": request.form.get("calculator", "none"),
                    "sections": [{
                        "name": "Section A",
                        "questionsToShow": len(parsed_questions),
                        "randomize": 1,
                        "questions": parsed_questions
                    }]
                }
            except Exception as e:
                return json.dumps({"success": False, "error": f"Invalid CSV file format: {str(e)}"}), 400
        else:
            try:
                exam_data = json.loads(file.read().decode('utf-8'))
            except Exception:
                return json.dumps({"success": False, "error": "Invalid JSON file"}), 400
        
        conn = get_db_connection()
        
        # Extract data from JSON
        name = exam_data.get("name", "Imported Exam")
        target_class = exam_data.get("class")
        specialisation_tag = exam_data.get("specialisation", "General")
        subject_tag = exam_data.get("subject", "General")
        duration = int(exam_data.get("duration", 60))
        max_warnings = int(exam_data.get("maxWarnings", 5))
        calculator_type = exam_data.get("calculator", "none")
        
        # Verify teacher is authorized for this class/specialisation
        allowed = False
        try:
            # Check exact class+specialisation match
            allowed = conn.execute("""
                SELECT id FROM teacher_class_assignments 
                WHERE teacher_id=? AND class_name=? AND specialisation=?
            """, (teacher_id, target_class, specialisation_tag)).fetchone()
            
            # If not exact match, check if teacher has this class at all (for General)
            if not allowed and specialisation_tag != "General":
                allowed = conn.execute("""
                    SELECT id FROM teacher_class_assignments 
                    WHERE teacher_id=? AND class_name=?
                """, (teacher_id, target_class)).fetchone()
        except sqlite3.OperationalError:
            # Fallback if table doesn't exist
            teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
            allowed = teacher and teacher["class"] == target_class
        
        if not allowed:
            conn.close()
            return json.dumps({
                "success": False, 
                "error": f"You are not authorized to create exams for {target_class}/{specialisation_tag}."
            }), 403
        
        # Create exam
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO exams (name, class, duration, teacher_id, subject_tag, specialisation_tag, max_warnings, calculator_type, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (name, target_class, duration, teacher_id, subject_tag, specialisation_tag, max_warnings, calculator_type))
        except sqlite3.OperationalError:
            # Fallback without new columns
            cursor.execute("""
                INSERT INTO exams (name, class, duration, teacher_id, subject_tag, specialisation_tag, active)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            """, (name, target_class, duration, teacher_id, specialisation_tag))
        
        exam_id = cursor.lastrowid
        
        # Process sections
        sections = exam_data.get("sections", [])
        total_questions = 0
        
        for sec_order, section in enumerate(sections):
            section_name = section.get("name", f"Section {sec_order + 1}")
            questions_to_show = section.get("questionsToShow", 0)
            randomize = section.get("randomize", 1)
            
            # Insert section
            cursor.execute("""
                INSERT INTO exam_sections (exam_id, section_name, questions_to_show, randomize, section_order, active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (exam_id, section_name, questions_to_show, randomize, sec_order))
            
            section_id = cursor.lastrowid
            
            # Insert standalone questions
            for q_order, q in enumerate(section.get("questions", [])):
                question_text = q.get("text", "")
                opt1 = q.get("opt1", "")
                opt2 = q.get("opt2", "")
                opt3 = q.get("opt3", "")
                opt4 = q.get("opt4", "")
                answer_num = q.get("answer", 1)
                mandatory = 1 if q.get("mandatory") else 0
                
                # Convert answer number to actual text
                answer_text = ""
                if answer_num == 1: answer_text = opt1
                elif answer_num == 2: answer_text = opt2
                elif answer_num == 3: answer_text = opt3
                elif answer_num == 4: answer_text = opt4
                
                # Handle image (base64)
                image_filename = None
                if q.get("img"):
                    image_filename = f"exam_{exam_id}_{section_id}_{q_order}_{int(datetime.now().timestamp())}.jpg"
                    save_path = os.path.join("static/images", image_filename)
                    try:
                        import base64
                        img_data = q["img"]
                        if ',' in img_data:
                            img_data = img_data.split(',')[1]
                        with open(save_path, 'wb') as f:
                            f.write(base64.b64decode(img_data))
                    except:
                        image_filename = None
                
                cursor.execute("""
                    INSERT INTO questions (exam_id, section_id, question, option1, option2, option3, option4, answer, image, mandatory, display_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (exam_id, section_id, question_text, opt1, opt2, opt3, opt4, answer_text, image_filename, mandatory, q_order))
                total_questions += 1
            
            # Process groups
            for grp_order, group in enumerate(section.get("groups", [])):
                group_name = group.get("name", f"Group {grp_order + 1}")
                group_type = group.get("type", "normal")
                group_content = group.get("content", "")
                instruction_text = group.get("instruction", "")
                
                # Handle group image
                group_image = None
                if group.get("img"):
                    group_image = f"exam_grp_{exam_id}_{section_id}_{grp_order}_{int(datetime.now().timestamp())}.jpg"
                    save_path = os.path.join("static/images", group_image)
                    try:
                        import base64
                        img_data = group["img"]
                        if ',' in img_data:
                            img_data = img_data.split(',')[1]
                        with open(save_path, 'wb') as f:
                            f.write(base64.b64decode(img_data))
                    except:
                        group_image = None
                
                cursor.execute("""
                    INSERT INTO exam_question_groups (exam_id, section_id, group_name, group_type, group_content, group_image, instruction_text, display_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (exam_id, section_id, group_name, group_type, group_content, group_image, instruction_text, grp_order))
                
                group_id = cursor.lastrowid
                
                # Insert group questions
                for gq_order, gq in enumerate(group.get("questions", [])):
                    question_text = gq.get("text", "")
                    opt1 = gq.get("opt1", "")
                    opt2 = gq.get("opt2", "")
                    opt3 = gq.get("opt3", "")
                    opt4 = gq.get("opt4", "")
                    answer_num = gq.get("answer", 1)
                    mandatory = 1 if gq.get("mandatory") else 0
                    
                    answer_text = ""
                    if answer_num == 1: answer_text = opt1
                    elif answer_num == 2: answer_text = opt2
                    elif answer_num == 3: answer_text = opt3
                    elif answer_num == 4: answer_text = opt4
                    
                    cursor.execute("""
                        INSERT INTO questions (exam_id, section_id, group_id, question, option1, option2, option3, option4, answer, mandatory, display_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (exam_id, section_id, group_id, question_text, opt1, opt2, opt3, opt4, answer_text, mandatory, gq_order))
                    total_questions += 1
        
        log_action("Teacher", session["username"], f"Imported exam '{name}' with {total_questions} questions", conn=conn)
        conn.commit()
        conn.close()
        
        return json.dumps({
            "success": True,
            "message": f"Exam '{name}' imported with {total_questions} questions!",
            "redirect": f"/teacher/exam/{exam_id}/settings"
        })
    
    return render_template("import_exam.html")


@teacher_bp.route("/teacher/download_builder")
def teacher_download_builder():
    """Generate a teacher-specific offline exam builder HTML"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher_id = session["teacher_id"]
    
    # Get teacher's assigned classes and specialisations
    teaching_classes = []
    specialisations_by_class = {}
    
    try:
        class_assignments = conn.execute("""
            SELECT DISTINCT class_name, specialisation 
            FROM teacher_class_assignments 
            WHERE teacher_id=?
            ORDER BY class_name
        """, (teacher_id,)).fetchall()
        
        if class_assignments:
            for ca in class_assignments:
                if ca["class_name"] not in specialisations_by_class:
                    specialisations_by_class[ca["class_name"]] = []
                    teaching_classes.append(ca["class_name"])
                specialisations_by_class[ca["class_name"]].append(ca["specialisation"])
    except sqlite3.OperationalError:
        teacher = conn.execute("SELECT class FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        if teacher and teacher["class"]:
            teaching_classes = [teacher["class"]]
            specialisations_by_class[teacher["class"]] = ["General"]
    
    teacher_name = session["username"]
    conn.close()
    
    # Convert to JSON for embedding in HTML
    import json
    teacher_data = {
        "name": teacher_name,
        "classes": teaching_classes,
        "specialisations": specialisations_by_class
    }
    
    teacher_json = json.dumps(teacher_data)
    
    # Generate the HTML
    html_content = generate_offline_builder_html(teacher_json)
    
    # Create response
    from flask import Response
    return Response(
        html_content,
        mimetype='text/html',
        headers={
            'Content-Disposition': f'attachment; filename=exam_builder_{teacher_name}.html'
        }
    )


@teacher_bp.route('/teacher/pause_exam/<int:attempt_id>', methods=['POST'])
def pause_exam(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    paused_by = session.get('username') or session.get('teacher_id') or 'teacher'
    conn = get_db_connection()
    attempt = conn.execute("SELECT a.*, e.duration FROM ce_attempts a JOIN ce_exams e ON a.exam_id = e.id WHERE a.id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        conn.execute("UPDATE ce_attempts SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=? WHERE id=?", (paused_by, server_rem, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": "Exam paused"}


@teacher_bp.route('/teacher/resume_exam/<int:attempt_id>', methods=['POST'])
def resume_exam(attempt_id):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT remaining_time FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    rem = int(attempt['remaining_time'] or 0) if attempt else 0
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("UPDATE ce_attempts SET is_paused=0, paused_at=NULL, paused_by=NULL, resume_requested=0, authoritative_deadline=? WHERE id=?", (new_dl, attempt_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam resumed"}


@teacher_bp.route('/teacher/add_time/<int:attempt_id>/<int:extra_minutes>', methods=['POST'])
def add_exam_time(attempt_id, extra_minutes):
    if "teacher_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT a.*, e.duration FROM ce_attempts a JOIN ce_exams e ON a.exam_id = e.id WHERE a.id=?", (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        if attempt["is_paused"] == 1:
            new_time = (attempt['remaining_time'] or 0) + (extra_minutes * 60)
            conn.execute("UPDATE ce_attempts SET remaining_time=? WHERE id=?", (new_time, attempt_id))
        else:
            cur_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            new_rem = cur_rem + (extra_minutes * 60)
            new_dl = (get_utc_now() + timedelta(seconds=new_rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE ce_attempts SET remaining_time=?, authoritative_deadline=? WHERE id=?", (new_rem, new_dl, attempt_id))
        conn.commit()
    conn.close()
    return {"success": True, "message": f"{extra_minutes} minutes added"}


@teacher_bp.route("/teacher/exam_section/<int:section_id>/toggle_active", methods=["POST"])
def toggle_exam_section_active(section_id):
    """Toggle a regular exam section active/inactive"""
    if "teacher_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    section = conn.execute("SELECT active, section_name FROM exam_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return {"error": "Section not found"}, 404
    
    new_status = 0 if section["active"] == 1 else 1
    conn.execute("UPDATE exam_sections SET active=? WHERE id=?", (new_status, section_id))
    conn.commit()
    conn.close()
    
    status_text = "activated" if new_status == 1 else "deactivated"
    return {
        "success": True, 
        "message": f"Section '{section['section_name']}' {status_text}",
        "active": new_status == 1
    }


PROGRESSION_LADDER = {
    "Primary 1": "Primary 2",
    "Primary 2": "Primary 3",
    "Primary 3": "Primary 4",
    "Primary 4": "Primary 5",
    "Primary 5": "Primary 6",
    "Primary 6": "JSS 1",
    "JSS 1": "JSS 2",
    "JSS 2": "JSS 3",
    "JSS 3": "SSS 1",
    "SSS 1": "SSS 2",
    "SSS 2": "SSS 3",
    "SSS 3": "Graduated",
    "Grade 1": "Grade 2",
    "Grade 2": "Grade 3",
    "Grade 3": "Grade 4",
    "Grade 4": "Grade 5",
    "Grade 5": "Grade 6",
    "Grade 6": "Grade 7",
    "Grade 7": "Grade 8",
    "Grade 8": "Grade 9",
    "Grade 9": "Grade 10",
    "Grade 10": "Grade 11",
    "Grade 11": "Grade 12",
    "Grade 12": "Graduated",
}


@teacher_bp.route("/teacher/progression")
def teacher_progression():
    """Class teacher student academic progression workspace"""
    if "teacher_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    teacher = conn.execute("SELECT * FROM teachers WHERE id=?", (session["teacher_id"],)).fetchone()
    if not teacher:
        conn.close()
        return redirect("/teacher")
    
    assigned_class = teacher["class_teacher_of"] if ("class_teacher_of" in teacher.keys() and teacher["class_teacher_of"]) else None
    
    current_session = conn.execute("SELECT name FROM academic_sessions WHERE is_current=1 LIMIT 1").fetchone()
    current_session_name = current_session["name"] if current_session else "2026/2027"
    
    all_classes_rows = conn.execute("SELECT name FROM classes ORDER BY id ASC").fetchall()
    all_classes = [r["name"] for r in all_classes_rows] if all_classes_rows else list(PROGRESSION_LADDER.keys())
    
    students = []
    next_class = ""
    is_specialisation_stage = False
    is_graduation_stage = False
    
    if assigned_class:
        students = conn.execute("""
            SELECT id, username, full_name, class, specialisation, status, photo
            FROM students
            WHERE class = ? AND status = 'approved'
            ORDER BY full_name ASC, username ASC
        """, (assigned_class,)).fetchall()
        
        next_class = PROGRESSION_LADDER.get(assigned_class, "")
        is_specialisation_stage = (assigned_class in ["JSS 3", "Grade 9"])
        is_graduation_stage = (assigned_class in ["SSS 3", "Grade 12"] or next_class == "Graduated")
        
    conn.close()
    return render_template(
        "teacher_progression.html",
        assigned_class=assigned_class,
        students=students,
        next_class=next_class,
        is_specialisation_stage=is_specialisation_stage,
        is_graduation_stage=is_graduation_stage,
        available_classes=all_classes,
        current_session=current_session_name
    )


@teacher_bp.route("/teacher/api/promote_students", methods=["POST"])
def api_teacher_promote_students():
    """Process student academic progression batch transactionally"""
    if "teacher_id" not in session:
        return {"success": False, "error": "Unauthorized"}, 401
    
    data = request.get_json(silent=True) or {}
    students_data = data.get("students", [])
    target_session = (data.get("target_session") or "").strip() or "2027/2028"
    
    if not students_data:
        return {"success": False, "error": "No students provided"}, 400
        
    conn = get_db_connection()
    try:
        teacher = conn.execute("SELECT * FROM teachers WHERE id=?", (session["teacher_id"],)).fetchone()
        assigned_class = teacher["class_teacher_of"] if ("class_teacher_of" in teacher.keys() and teacher["class_teacher_of"]) else None
        
        if not assigned_class:
            conn.close()
            return {"success": False, "error": "Only assigned class teachers can execute progression"}, 403
            
        current_session = conn.execute("SELECT name FROM academic_sessions WHERE is_current=1 LIMIT 1").fetchone()
        from_session_name = current_session["name"] if current_session else "2026/2027"
        
        processed_count = 0
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        for item in students_data:
            sid = item.get("student_id")
            action = item.get("action", "promote")
            target_cls = item.get("target_class", "")
            spec = item.get("specialisation")
            
            st = conn.execute("SELECT * FROM students WHERE id=? AND class=?", (sid, assigned_class)).fetchone()
            if not st:
                continue
                
            from_class = st["class"]
            
            # 1. Archive historical snapshot
            conn.execute("""
                INSERT INTO student_enrollment_history (student_id, session_name, class_name, status, specialisation, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (sid, from_session_name, from_class, action, st["specialisation"], now_str))
            
            # 2. Record promotion log
            conn.execute("""
                INSERT INTO student_promotions (student_id, from_class, to_class, from_session, to_session, promoted_by, role, promotion_type, specialisation, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, 'teacher', ?, ?, ?)
            """, (sid, from_class, target_cls, from_session_name, target_session, teacher["username"], action, spec, now_str))
            
            # 3. Update student current record
            if action == "graduate":
                conn.execute("UPDATE students SET class='Graduated', status='alumni' WHERE id=?", (sid,))
            elif action == "promote":
                if spec:
                    conn.execute("UPDATE students SET class=?, specialisation=? WHERE id=?", (target_cls, spec, sid))
                else:
                    conn.execute("UPDATE students SET class=? WHERE id=?", (target_cls, sid))
            elif action == "retain":
                pass
                
            processed_count += 1
            
        conn.commit()
        conn.close()
        return {"success": True, "message": f"Successfully processed progression for {processed_count} students."}
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "error": str(e)}, 500



