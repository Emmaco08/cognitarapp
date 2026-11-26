import os
import sqlite3
import random
import secrets
import math
import re
import json
import io
from io import StringIO, BytesIO
import csv
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
except ImportError:
    openpyxl = None
    Font = None
    PatternFill = None
from datetime import datetime, timedelta, timezone
from flask import Blueprint, render_template, request, redirect, session, url_for, send_file, Response, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from cognitara.config import get_upload_path
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
admin_ce_bp = Blueprint('admin_ce', __name__)

@admin_ce_bp.route("/admin/common-entrance")
def admin_common_entrance():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    exams = conn.execute("SELECT * FROM ce_exams ORDER BY created_at DESC").fetchall()
    
    registered_students = conn.execute("""
        SELECT s.*, e.name as exam_name, 
               (SELECT status FROM ce_attempts WHERE student_id = s.id ORDER BY id DESC LIMIT 1) as attempt_status
        FROM ce_students s
        JOIN ce_exams e ON s.exam_id = e.id
        ORDER BY s.id DESC
    """).fetchall()
    
    pending_approvals_list = conn.execute("""
        SELECT a.id as attempt_id, a.score, a.total, a.percentage, a.status,
               s.id as student_id, s.full_name, s.username, s.email,
               e.id as exam_id, e.name as exam_name, e.target_class, e.passing_score
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.status = 'pending'
        ORDER BY a.completed_at DESC
    """).fetchall()
    
    exams_list = []
    total_all_attempts = 0
    total_all_passed = 0
    total_all_failed = 0
    total_all_rejected = 0
    all_scores = []
    
    for exam in exams:
        exam_dict = dict(exam)
        attempts = conn.execute("SELECT * FROM ce_attempts WHERE exam_id=?", (exam["id"],)).fetchall()
        exam_dict["attempts_count"] = len(attempts)
        
        passing = exam["passing_score"]
        passed_count = 0
        failed_count = 0
        rejected_count = 0
        
        for a in attempts:
            total_all_attempts += 1
            if a["percentage"] is not None:
                all_scores.append(a["percentage"])
            
            if a["status"] == "rejected":
                rejected_count += 1
                total_all_rejected += 1
            
            if a["percentage"] is not None:
                if a["percentage"] >= passing:
                    passed_count += 1
                    total_all_passed += 1
                else:
                    failed_count += 1
                    total_all_failed += 1
        
        exam_dict["passed_count"] = passed_count
        exam_dict["failed_count"] = failed_count
        exam_dict["rejected_count"] = rejected_count
        exams_list.append(exam_dict)
    
    total_students = conn.execute("SELECT COUNT(*) as count FROM ce_students").fetchone()["count"]
    pending_approvals = len(pending_approvals_list)
    
    valid_scores = [s for s in all_scores if s is not None]
    if valid_scores:
        global_avg = round(sum(valid_scores) / len(valid_scores), 1)
        global_highest = round(max(valid_scores), 1)
        global_lowest = round(min(valid_scores), 1)
    else:
        global_avg = 0
        global_highest = 0
        global_lowest = 0
    
    distribution = conn.execute("""
        SELECT 
            CASE 
                WHEN percentage < 20 THEN '0-20%'
                WHEN percentage < 40 THEN '20-40%'
                WHEN percentage < 60 THEN '40-60%'
                WHEN percentage < 80 THEN '60-80%'
                ELSE '80-100%'
            END as score_range,
            COUNT(*) as count
        FROM ce_attempts 
        WHERE percentage IS NOT NULL
        GROUP BY score_range 
        ORDER BY MIN(percentage)
    """).fetchall()
    
    distribution_labels = [d["score_range"] for d in distribution]
    distribution_counts = [d["count"] for d in distribution]
    # Get highest and lowest score students for flip cards
    highest_score_data = conn.execute("""
      SELECT s.full_name, a.percentage FROM ce_attempts a
      JOIN ce_students s ON a.student_id = s.id
      WHERE a.percentage IS NOT NULL
      ORDER BY a.percentage DESC LIMIT 1
    """).fetchone()
    lowest_score_data = conn.execute("""
      SELECT s.full_name, a.percentage FROM ce_attempts a
      JOIN ce_students s ON a.student_id = s.id
      WHERE a.percentage IS NOT NULL
      ORDER BY a.percentage ASC LIMIT 1
    """).fetchone()
    top_performers = conn.execute("""
        SELECT a.*, s.full_name, s.username, e.name as exam_name
        FROM ce_attempts a 
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.percentage IS NOT NULL
        ORDER BY a.percentage DESC 
        LIMIT 5
    """).fetchall()
    total_all_approved = conn.execute("SELECT COUNT(*) as count FROM ce_attempts WHERE status='approved'").fetchone()["count"]
    # In your admin_common_entrance route, add this before render_template:
    exam_passing_scores = {}
    for exam in exams_list:
        exam_passing_scores[exam["id"]] = exam["passing_score"]
    # ============ WARNING LOGS & STATS ============
    try:
        warning_logs = conn.execute("""
            SELECT w.id, s.full_name, s.username, e.name as exam_name, w.warning_message, w.timestamp 
            FROM ce_warning_logs w 
            JOIN ce_students s ON w.student_id = s.id 
            JOIN ce_exams e ON w.exam_id = e.id 
            ORDER BY w.timestamp DESC
        """).fetchall()
        
        warning_summary = conn.execute("""
            SELECT s.id as student_id, s.full_name, s.username, e.id as exam_id, e.name as exam_name, 
                   COUNT(w.id) as total_warnings, MAX(w.timestamp) as last_warning 
            FROM ce_warning_logs w 
            JOIN ce_students s ON w.student_id = s.id 
            JOIN ce_exams e ON w.exam_id = e.id 
            GROUP BY s.id, e.id 
            ORDER BY total_warnings DESC
        """).fetchall()
        
        total_warnings_count = len(warning_logs)
        most_warned = warning_summary[0] if warning_summary else None
    except Exception:
        warning_logs = []
        warning_summary = []
        total_warnings_count = 0
        most_warned = None
    conn.close()
    
    import json
    return render_template("admin_common_entrance.html", 
                         exams=exams_list,
                         registered_students=registered_students,
                         pending_approvals_list=pending_approvals_list,
                         total_students=total_students,
                         pending_approvals=pending_approvals,
                         global_avg=global_avg,
                         global_highest=global_highest,
                         global_lowest=global_lowest,
                         total_all_attempts=total_all_attempts,
                         total_all_passed=total_all_passed,
                         total_all_failed=total_all_failed,
                         total_all_rejected=total_all_rejected,
                         distribution_labels=json.dumps(distribution_labels),
                         distribution_counts=json.dumps(distribution_counts),
                         total_all_approved=total_all_approved,
                         exam_passing_scores=exam_passing_scores,
                         highest_student_name=highest_score_data["full_name"] if highest_score_data else None,
                         lowest_student_name=lowest_score_data["full_name"] if lowest_score_data else None,
                         top_performers=top_performers,
                         warning_logs=warning_logs,
                         warning_summary=warning_summary,
                         total_warnings_count=total_warnings_count,
                         most_warned=most_warned)


@admin_ce_bp.route('/admin/ce_delete_all_warnings', methods=['POST'])
def ce_delete_all_warnings():
    if "admin_id" not in session: return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    conn.execute("DELETE FROM ce_warning_logs")
    conn.commit()
    conn.close()
    return {"success": True, "message": "All warning logs permanently deleted!"}


@admin_ce_bp.route('/admin/ce_delete_student_warnings/<int:student_id>/<int:exam_id>', methods=['POST'])
def ce_delete_student_warnings(student_id, exam_id):
    if "admin_id" not in session: return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    # Delete logs
    conn.execute("DELETE FROM ce_warning_logs WHERE student_id=? AND exam_id=?", (student_id, exam_id))
    # Reset live warning count for the attempt
    conn.execute("UPDATE ce_attempts SET warnings_count=0 WHERE student_id=? AND exam_id=?", (student_id, exam_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Student's warnings cleared!"}


@admin_ce_bp.route('/admin/ce_delete_warning_log/<int:log_id>', methods=['POST'])
def ce_delete_warning_log(log_id):
    if "admin_id" not in session: return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    conn.execute("DELETE FROM ce_warning_logs WHERE id=?", (log_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Individual log deleted!"}


@admin_ce_bp.route("/admin/ce_get_students_by_status")
def ce_get_students_by_status():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    status_type = request.args.get("type", "all")
    conn = get_db_connection()
    
    if status_type == "exams":
        exams_data = conn.execute("SELECT id, name, target_class FROM ce_exams").fetchall()
        conn.close()
        exams_list = [{"id": e["id"], "name": e["name"], "target_class": e["target_class"]} for e in exams_data]
        return {"students": exams_list}
    
    query = """
        SELECT s.full_name, s.username, e.name as exam_name, 
               a.score, a.total, a.percentage, a.status
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE 1=1
    """
    
    if status_type == "passed":
        query += " AND a.percentage >= e.passing_score"
    elif status_type == "failed":
        query += " AND a.percentage < e.passing_score"
    elif status_type == "rejected":
        query += " AND a.status = 'rejected'"
    elif status_type == "approved":
        query += " AND a.status = 'approved'"
    elif status_type == "pending_approval":
        query += " AND a.status = 'pending'"
    
    query += " ORDER BY a.percentage DESC"
    
    students = conn.execute(query).fetchall()
    conn.close()
    
    students_list = []
    for s in students:
        students_list.append({
            "full_name": s["full_name"],
            "username": s["username"],
            "exam_name": s["exam_name"],
            "score": s["score"],
            "total": s["total"],
            "percentage": round(s["percentage"], 1) if s["percentage"] else 0,
            "status": s["status"]
        })
    
    return {"students": students_list}


@admin_ce_bp.route("/admin/ce_reset_student_exam/<int:student_id>/<int:exam_id>", methods=["POST"])
def ce_reset_student_exam(student_id, exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    # Get attempt ID
    attempt = conn.execute("SELECT id FROM ce_attempts WHERE student_id=? AND exam_id=?", (student_id, exam_id)).fetchone()
    
    if attempt:
        conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id=?", (attempt["id"],))
        conn.execute("DELETE FROM ce_attempts WHERE id=?", (attempt["id"],))
        conn.commit()
    
    conn.close()
    return {"success": True, "message": "Exam reset successfully. Student can retake."}


@admin_ce_bp.route("/admin/ce_register_student", methods=["POST"])
def admin_ce_register_student():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    exam_id = request.form.get("exam_id")
    full_name = request.form.get("full_name")
    username = request.form.get("username")
    email = request.form.get("email")
    password = request.form.get("password")
    phone = request.form.get("phone", "")
    
    conn = get_db_connection()

    try:
        ce_cfg = conn.execute("SELECT registration_open FROM ce_settings WHERE id=1").fetchone()
        if ce_cfg is not None and int(ce_cfg["registration_open"] if ce_cfg["registration_open"] is not None else 1) == 0:
            conn.close()
            return {"success": False, "error": "Candidate registration is currently closed in CE Settings."}, 403
    except Exception:
        pass
    
    existing = conn.execute("SELECT id FROM ce_students WHERE username=?", (username,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Username already exists!"}, 400
    
    exam = conn.execute("SELECT name, target_class FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        return {"success": False, "error": "Exam not found!"}, 400

    photo_filename = "default.png"
    photo_file = request.files.get("photo")
    if photo_file and photo_file.filename:
        safe_user = secure_filename(username) or "ce_student"
        photo_filename = f"ce_student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
        save_path = get_upload_path(photo_filename)
        compress_image(photo_file, save_path, 50)
    
    hashed_password = generate_password_hash(password) if password else generate_password_hash("student123")
    conn.execute("""
        INSERT INTO ce_students (exam_id, full_name, username, email, password, phone, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, full_name, username, email, hashed_password, phone, photo_filename))
    
    student_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Student {full_name} registered successfully!",
        "student": {
            "id": student_id,
            "full_name": full_name,
            "username": username,
            "exam_name": exam["name"],
            "photo": photo_filename
        }
    }


@admin_ce_bp.route("/check_ce_username")
def check_ce_username():
    username = request.args.get("username")
    conn = get_db_connection()
    ce_exists = conn.execute("SELECT id FROM ce_students WHERE username=?", (username,)).fetchone()
    normal_exists = conn.execute("SELECT id FROM students WHERE username=?", (username,)).fetchone()
    conn.close()
    return {"exists": ce_exists is not None or normal_exists is not None}


@admin_ce_bp.route("/admin/ce_approve_all_pending", methods=["POST"])
def ce_approve_all_pending():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    pending = conn.execute("""
        SELECT a.id as attempt_id, a.student_id, a.exam_id, s.username, s.full_name, s.email, e.target_class
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.status = 'pending'
    """).fetchall()
    
    default_password = generate_password_hash("student123")
    approved_count = 0
    for p in pending:
        conn.execute("UPDATE ce_attempts SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=? WHERE id=?", (session["username"], p["attempt_id"]))
        
        existing = conn.execute("SELECT id FROM students WHERE username=?", (p["username"],)).fetchone()
        if not existing:
            conn.execute("""
                INSERT INTO students (username, password, full_name, email, class, photo, status, approved_at)
                VALUES (?, ?, ?, ?, ?, 'default.png', 'approved', CURRENT_TIMESTAMP)
            """, (p["username"], default_password, p["full_name"], p["email"], p["target_class"]))
        approved_count += 1
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"{approved_count} students approved successfully!"}


@admin_ce_bp.route("/admin/ce_delete_student/<int:student_id>", methods=["POST"])
def admin_ce_delete_student(student_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    student = conn.execute("SELECT full_name FROM ce_students WHERE id=?", (student_id,)).fetchone()
    
    if student:
        conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id IN (SELECT id FROM ce_attempts WHERE student_id=?)", (student_id,))
        conn.execute("DELETE FROM ce_attempts WHERE student_id=?", (student_id,))
        conn.execute("DELETE FROM ce_students WHERE id=?", (student_id,))
        conn.commit()
        conn.close()
        return {"success": True, "message": f"Student {student['full_name']} deleted successfully!"}
    
    conn.close()
    return {"error": "Student not found"}, 404


@admin_ce_bp.route("/admin/ce_approve/<int:attempt_id>", methods=["POST"])
def ce_approve(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    attempt = conn.execute("""
        SELECT a.*, s.full_name, s.username, s.email, e.target_class, e.name as exam_name
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id = ?
    """, (attempt_id,)).fetchone()
    
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    conn.execute("""
        UPDATE ce_attempts SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
        WHERE id=?
    """, (session["username"], attempt_id))
    
    default_password = generate_password_hash("student123")
    existing = conn.execute("SELECT id FROM students WHERE username=?", (attempt["username"],)).fetchone()
    
    if not existing:
        conn.execute("""
            INSERT INTO students (username, password, full_name, email, class, photo, status, approved_at)
            VALUES (?, ?, ?, ?, ?, 'default.png', 'approved', CURRENT_TIMESTAMP)
        """, (attempt["username"], default_password, attempt["full_name"], attempt["email"], attempt["target_class"]))
    
    log_action("Admin", session["username"], f"Approved common entrance student '{attempt['username']}' for {attempt['target_class']}", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Student {attempt['full_name']} approved and added to {attempt['target_class']}!"}


@admin_ce_bp.route("/admin/ce_reject/<int:attempt_id>", methods=["POST"])
def ce_reject(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    attempt = conn.execute("""
        SELECT s.full_name
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        WHERE a.id = ?
    """, (attempt_id,)).fetchone()
    
    if attempt:
        conn.execute("""
            UPDATE ce_attempts SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
            WHERE id=?
        """, (session["username"], attempt_id))
        
        log_action("Admin", session["username"], f"Rejected common entrance student '{attempt['full_name']}'", conn=conn)
        conn.commit()
    
    conn.close()
    return {"success": True, "message": f"Student {attempt['full_name']} has been rejected."}


@admin_ce_bp.route("/admin/ce_exam/<int:exam_id>/settings")
def ce_exam_settings_page(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    sections = conn.execute("SELECT * FROM ce_sections WHERE exam_id=? ORDER BY section_order", (exam_id,)).fetchall()
    
    sections_with_counts = []
    for section in sections:
        section_dict = dict(section)
        count = conn.execute("SELECT COUNT(*) as count FROM ce_questions WHERE section_id=?", (section["id"],)).fetchone()["count"]
        section_dict["question_count"] = count
        sections_with_counts.append(section_dict)
    
    conn.close()
    return render_template("ce_exam_settings.html", exam=exam, sections=sections_with_counts)


@admin_ce_bp.route("/admin/ce_exam/<int:exam_id>", methods=["POST"])
def update_ce_exam(exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    passing_score = int(request.form.get("passing_score", 50))
    total_questions_to_show = int(request.form.get("total_questions_to_show", 100))
    max_warnings = int(request.form.get("max_warnings", 5))
    calculator_type = request.form.get("calculator_type", "none")
    active = 1 if request.form.get("active") else 0
    
    conn.execute("""
        UPDATE ce_exams SET 
        name=?, target_class=?, duration=?, passing_score=?, 
        total_questions_to_show=?, max_warnings=?, calculator_type=?, active=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (name, target_class, duration, passing_score, total_questions_to_show, max_warnings, calculator_type, active, exam_id))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam settings saved successfully"}


@admin_ce_bp.route("/admin/ce_exam/create", methods=["GET"])
def create_ce_exam_page():
    if "admin_id" not in session:
        return redirect("/")
    return render_template("ce_exam_settings.html", exam=None)


@admin_ce_bp.route("/admin/ce_exam/create", methods=["POST"])
def create_ce_exam_ajax():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    ce_cfg = conn.execute("SELECT default_passing_score, anti_cheating_profile FROM ce_settings WHERE id=1").fetchone()
    cfg_pass = int(ce_cfg["default_passing_score"]) if (ce_cfg and ce_cfg["default_passing_score"]) else 50
    cfg_prof = str(ce_cfg["anti_cheating_profile"] or "medium").lower() if ce_cfg else "medium"
    cfg_max_w = {"low": 5, "medium": 3, "high": 2}.get(cfg_prof, 3)

    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    raw_pass = request.form.get("passing_score")
    passing_score = int(raw_pass) if (raw_pass is not None and str(raw_pass).strip() != "") else cfg_pass
    total_questions_to_show = int(request.form.get("total_questions_to_show", 100))
    raw_mw = request.form.get("max_warnings")
    max_warnings = int(raw_mw) if (raw_mw is not None and str(raw_mw).strip() != "") else cfg_max_w
    calculator_type = request.form.get("calculator_type", "none")
    active = 1 if request.form.get("active") else 0
    
    cursor = conn.execute("""
        INSERT INTO ce_exams (name, target_class, duration, passing_score, total_questions_to_show, max_warnings, calculator_type, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (name, target_class, duration, passing_score, total_questions_to_show, max_warnings, calculator_type, active))
    exam_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    return {
        "success": True, 
        "message": f"Exam '{name}' created successfully!",
        "redirect": f"/admin/ce_exam/{exam_id}/settings"
    }


@admin_ce_bp.route("/admin/ce_exam/create", methods=["POST"])
def create_ce_exam():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    passing_score = int(request.form.get("passing_score", 50))
    total_questions_to_show = int(request.form.get("total_questions_to_show", 100))
    active = 1 if request.form.get("active") else 0
    
    cursor = conn.execute("""
        INSERT INTO ce_exams (name, target_class, duration, passing_score, total_questions_to_show, active)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (name, target_class, duration, passing_score, total_questions_to_show, active))
    exam_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_exam/{exam_id}/settings")


@admin_ce_bp.route("/admin/ce_exam/<int:exam_id>/sections", methods=["POST"])
def add_ce_section(exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    section_name = request.form.get("section_name")
    questions_to_show = int(request.form.get("questions_to_show", 0))
    randomize = int(request.form.get("randomize", 1))
    
    # Get max order
    max_order = conn.execute("SELECT COALESCE(MAX(section_order), 0) as max FROM ce_sections WHERE exam_id=?", (exam_id,)).fetchone()["max"]
    
    cursor = conn.execute("""
        INSERT INTO ce_sections (exam_id, section_name, questions_to_show, randomize, section_order)
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


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/delete", methods=["POST"])
def delete_ce_section(section_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    # Get section info for response
    section = conn.execute("SELECT section_name FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    
    # Delete questions in this section first (due to foreign key)
    conn.execute("DELETE FROM ce_questions WHERE section_id=?", (section_id,))
    # Delete groups in this section
    conn.execute("DELETE FROM ce_question_groups WHERE section_id=?", (section_id,))
    # Delete the section
    conn.execute("DELETE FROM ce_sections WHERE id=?", (section_id,))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Section '{section['section_name']}' deleted successfully"}


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/questions")
def ce_section_questions(section_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT * FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    questions = conn.execute("SELECT * FROM ce_questions WHERE section_id=? ORDER BY display_order", (section_id,)).fetchall()
    conn.close()
    
    return render_template("ce_questions.html", section=section, questions=questions)


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/questions", methods=["POST"])
def add_ce_question(section_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT exam_id FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    exam_id = section["exam_id"]
    
    question = request.form.get("question")
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
        image_filename = f"ce_{exam_id}_{section_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = get_upload_path(image_filename)
        compress_image(file, save_path, 50)
    
    conn.execute("""
        INSERT INTO ce_questions (exam_id, section_id, question, option1, option2, option3, option4, answer, image, mandatory)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, section_id, question, option1, option2, option3, option4, answer, image_filename, mandatory))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{section_id}/questions")


@admin_ce_bp.route("/admin/ce_question/<int:question_id>/edit", methods=["GET", "POST"])
def edit_ce_question(question_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM ce_questions WHERE id=?", (question_id,)).fetchone()
    
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
            if image_filename:
                old_path = get_upload_path(image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"ce_{question['exam_id']}_{question['section_id']}_{int(datetime.now().timestamp())}.jpg"
            save_path = get_upload_path(image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE ce_questions SET
            question=?, option1=?, option2=?, option3=?, option4=?, answer=?, image=?, mandatory=?
            WHERE id=?
        """, (question_text, option1, option2, option3, option4, answer, image_filename, mandatory, question_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/admin/ce_section/{question['section_id']}/questions")
    
    conn.close()
    return render_template("ce_edit_question.html", question=question)


@admin_ce_bp.route("/admin/ce_question/<int:question_id>/delete")
def delete_ce_question(question_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT section_id, image FROM ce_questions WHERE id=?", (question_id,)).fetchone()
    section_id = question["section_id"]
    
    if question["image"]:
        img_path = get_upload_path(question["image"])
        if os.path.exists(img_path):
            os.remove(img_path)
    
    conn.execute("DELETE FROM ce_questions WHERE id=?", (question_id,))
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{section_id}/questions")


@admin_ce_bp.route("/admin/ce_question/<int:question_id>/remove_from_group")
def remove_question_from_group(question_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT section_id FROM ce_questions WHERE id=?", (question_id,)).fetchone()
    section_id = question["section_id"]
    
    conn.execute("UPDATE ce_questions SET group_id=NULL WHERE id=?", (question_id,))
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{section_id}/groups")


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/groups")
def ce_section_groups(section_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT * FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    groups = conn.execute("SELECT * FROM ce_question_groups WHERE section_id=? ORDER BY display_order", (section_id,)).fetchall()
    
    groups_list = []
    for group in groups:
        group_dict = dict(group)
        questions = conn.execute("SELECT * FROM ce_questions WHERE group_id=? ORDER BY display_order", (group["id"],)).fetchall()
        group_dict["questions"] = questions
        groups_list.append(group_dict)
    
    conn.close()
    return render_template("ce_groups.html", section=section, groups=groups_list)


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/groups", methods=["POST"])
def add_ce_group(section_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    section = conn.execute("SELECT exam_id FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    exam_id = section["exam_id"]
    
    group_name = request.form.get("group_name")
    group_type = request.form.get("group_type", "normal")
    group_content = request.form.get("group_content", "")
    instruction_text = request.form.get("instruction_text", "")
    
    file = request.files.get("group_image")
    image_filename = None
    if file and file.filename != "":
        image_filename = f"ce_group_{exam_id}_{section_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = get_upload_path(image_filename)
        compress_image(file, save_path, 50)
    
    max_order = conn.execute("SELECT COALESCE(MAX(display_order), 0) as max FROM ce_question_groups WHERE section_id=?", (section_id,)).fetchone()["max"]
    
    conn.execute("""
        INSERT INTO ce_question_groups (exam_id, section_id, group_name, group_type, group_content, group_image, instruction_text, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (exam_id, section_id, group_name, group_type, group_content, image_filename, instruction_text, max_order + 1))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{section_id}/groups")


@admin_ce_bp.route("/admin/ce_group/<int:group_id>/edit", methods=["GET", "POST"])
def edit_ce_group(group_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT * FROM ce_question_groups WHERE id=?", (group_id,)).fetchone()
    
    if request.method == "POST":
        group_name = request.form.get("group_name")
        group_type = request.form.get("group_type")
        group_content = request.form.get("group_content")
        instruction_text = request.form.get("instruction_text")
        
        file = request.files.get("group_image")
        image_filename = group["group_image"]
        
        if file and file.filename != "":
            if image_filename:
                old_path = get_upload_path(image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"ce_group_{group['exam_id']}_{group['section_id']}_{int(datetime.now().timestamp())}.jpg"
            save_path = get_upload_path(image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE ce_question_groups SET
            group_name=?, group_type=?, group_content=?, group_image=?, instruction_text=?
            WHERE id=?
        """, (group_name, group_type, group_content, image_filename, instruction_text, group_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/admin/ce_section/{group['section_id']}/groups")
    
    conn.close()
    return render_template("ce_edit_group.html", group=group)


@admin_ce_bp.route("/admin/ce_group/<int:group_id>/delete")
def delete_ce_group(group_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT section_id, group_image FROM ce_question_groups WHERE id=?", (group_id,)).fetchone()
    section_id = group["section_id"]
    
    if group["group_image"]:
        img_path = get_upload_path(group["group_image"])
        if os.path.exists(img_path):
            os.remove(img_path)
    
    conn.execute("DELETE FROM ce_question_groups WHERE id=?", (group_id,))
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{section_id}/groups")


@admin_ce_bp.route("/admin/ce_group/<int:group_id>/add_question", methods=["POST"])
def add_question_to_group(group_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    group = conn.execute("SELECT * FROM ce_question_groups WHERE id=?", (group_id,)).fetchone()
    
    question = request.form.get("question")
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
        image_filename = f"ce_group_q_{group_id}_{int(datetime.now().timestamp())}.jpg"
        save_path = get_upload_path(image_filename)
        compress_image(file, save_path, 50)
    
    max_order = conn.execute("SELECT COALESCE(MAX(display_order), 0) as max FROM ce_questions WHERE group_id=?", (group_id,)).fetchone()["max"]
    
    conn.execute("""
        INSERT INTO ce_questions (exam_id, section_id, group_id, question, option1, option2, option3, option4, answer, image, mandatory, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (group["exam_id"], group["section_id"], group_id, question, option1, option2, option3, option4, answer, image_filename, mandatory, max_order + 1))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/admin/ce_section/{group['section_id']}/groups")


@admin_ce_bp.route("/admin/ce_exam/<int:exam_id>/toggle")
def toggle_ce_exam_status(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT active, name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return redirect("/admin/common-entrance")
        
    new_status = 0 if exam["active"] == 1 else 1
    
    try:
        # Try to update with updated_at if the column exists
        conn.execute("UPDATE ce_exams SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_status, exam_id))
    except Exception:
        # Fallback if updated_at column doesn't exist
        conn.execute("UPDATE ce_exams SET active=? WHERE id=?", (new_status, exam_id))
        
    try:
        status_text = "started" if new_status == 1 else "stopped"
        log_action("Admin", session.get("username", "Admin"), f"{status_text.capitalize()} common entrance exam '{exam['name']}'", conn=conn)
    except Exception:
        pass # Ignore logging errors
        
    conn.commit()
    conn.close()
    
    return redirect("/admin/common-entrance")


@admin_ce_bp.route("/admin/ce_exam/<int:exam_id>/delete")
def delete_ce_exam(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    
    if exam:
        # Delete attempt questions for this exam
        conn.execute("""
            DELETE FROM ce_attempt_questions 
            WHERE attempt_id IN (SELECT id FROM ce_attempts WHERE exam_id=?)
        """, (exam_id,))
        # Delete attempts for this exam
        conn.execute("DELETE FROM ce_attempts WHERE exam_id=?", (exam_id,))
        # Delete students registered for this exam
        conn.execute("DELETE FROM ce_students WHERE exam_id=?", (exam_id,))
        # Delete questions for this exam
        conn.execute("DELETE FROM ce_questions WHERE exam_id=?", (exam_id,))
        # Delete sections for this exam
        conn.execute("DELETE FROM ce_sections WHERE exam_id=?", (exam_id,))
        # Delete groups for this exam
        conn.execute("DELETE FROM ce_question_groups WHERE exam_id=?", (exam_id,))
        # Finally delete the exam
        conn.execute("DELETE FROM ce_exams WHERE id=?", (exam_id,))
        
        log_action("Admin", session["username"], f"Deleted common entrance exam '{exam['name']}' and all related data", conn=conn)
        conn.commit()
    
    conn.close()
    return redirect("/admin/common-entrance")


@admin_ce_bp.route("/admin/ce_analytics/<int:exam_id>")
def ce_analytics(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    exam = conn.execute("SELECT * FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        return "Exam not found", 404
    
    # Get exam passing score
    passing_score = exam["passing_score"]
    
    # ============ ALL SUBMITTED ATTEMPTS (pending, approved, rejected) ============
    total_submitted = conn.execute("""
        SELECT COUNT(*) as count FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected')
    """, (exam_id,)).fetchone()["count"]
    
    # For template compatibility
    total_attempts = total_submitted
    
    # Passed/Failed based on score percentage (ALL submitted)
    passed = conn.execute("""
        SELECT COUNT(*) as count FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected') AND percentage >= ?
    """, (exam_id, passing_score)).fetchone()["count"]
    
    failed = conn.execute("""
        SELECT COUNT(*) as count FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected') AND percentage < ?
    """, (exam_id, passing_score)).fetchone()["count"]
    
    # Status breakdown
    pending = conn.execute("SELECT COUNT(*) as count FROM ce_attempts WHERE exam_id=? AND status='pending'", (exam_id,)).fetchone()["count"]
    approved = conn.execute("SELECT COUNT(*) as count FROM ce_attempts WHERE exam_id=? AND status='approved'", (exam_id,)).fetchone()["count"]
    rejected = conn.execute("SELECT COUNT(*) as count FROM ce_attempts WHERE exam_id=? AND status='rejected'", (exam_id,)).fetchone()["count"]
    
    # ============ SCORE STATISTICS (ALL submitted attempts) ============
    score_stats = conn.execute("""
        SELECT 
            AVG(percentage) as avg_score, 
            MIN(percentage) as min_score, 
            MAX(percentage) as max_score
        FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected') 
        AND total > 0 AND percentage IS NOT NULL
    """, (exam_id,)).fetchone()
    
    avg_score = round(score_stats["avg_score"] or 0, 1)
    min_score = round(score_stats["min_score"] or 0, 1)
    max_score = round(score_stats["max_score"] or 0, 1)
    
    # ============ SCORE DISTRIBUTION (ALL submitted attempts) ============
    distribution = conn.execute("""
        SELECT 
            CASE 
                WHEN percentage < 20 THEN '0-20%'
                WHEN percentage < 40 THEN '20-40%'
                WHEN percentage < 60 THEN '40-60%'
                WHEN percentage < 80 THEN '60-80%'
                ELSE '80-100%'
            END as score_range,
            COUNT(*) as count
        FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected')
        GROUP BY score_range 
        ORDER BY MIN(percentage)
    """, (exam_id,)).fetchall()
    
    distribution_labels = [d["score_range"] for d in distribution]
    distribution_counts = [d["count"] for d in distribution]
    
    # ============ QUESTION ANALYSIS (ALL submitted attempts) ============
    questions = conn.execute("""
        SELECT q.id, q.question, q.option1, q.option2, q.option3, q.option4, q.answer, s.section_name
        FROM ce_questions q 
        JOIN ce_sections s ON q.section_id = s.id
        WHERE q.exam_id=? 
        ORDER BY s.section_order, q.display_order
    """, (exam_id,)).fetchall()
    
    question_stats = []
    for q in questions:
        total_answers = conn.execute("""
            SELECT COUNT(*) as count FROM ce_attempt_questions aq
            JOIN ce_attempts a ON aq.attempt_id = a.id
            WHERE aq.question_id = ? AND a.exam_id = ? 
            AND a.status IN ('pending', 'approved', 'rejected')
        """, (q["id"], exam_id)).fetchone()["count"]
        
        correct_count = conn.execute("""
            SELECT COUNT(*) as count FROM ce_attempt_questions aq
            JOIN ce_attempts a ON aq.attempt_id = a.id
            WHERE aq.question_id = ? AND a.exam_id = ? 
            AND a.status IN ('pending', 'approved', 'rejected') 
            AND aq.is_correct = 1
        """, (q["id"], exam_id)).fetchone()["count"]
        
        avg_time = conn.execute("""
            SELECT AVG(aq.time_spent) as avg_time FROM ce_attempt_questions aq
            JOIN ce_attempts a ON aq.attempt_id = a.id
            WHERE aq.question_id = ? AND a.exam_id = ? 
            AND a.status IN ('pending', 'approved', 'rejected') 
            AND aq.time_spent > 0
        """, (q["id"], exam_id)).fetchone()["avg_time"] or 0
        
        correct_percentage = (correct_count / total_answers * 100) if total_answers > 0 else 0
        
        if correct_percentage >= 80: 
            difficulty = "Easy"
        elif correct_percentage >= 60: 
            difficulty = "Medium"
        elif correct_percentage >= 40: 
            difficulty = "Hard"
        else: 
            difficulty = "Very Hard"
        
        question_stats.append({
            "id": q["id"],
            "question": q["question"][:100] + ("..." if len(q["question"]) > 100 else ""),
            "section": q["section_name"],
            "correct_percentage": round(correct_percentage, 1),
            "avg_time_spent": round(avg_time, 1),
            "total_answers": total_answers,
            "difficulty": difficulty
        })
    
    # ============ QUESTION TABLES (ALL submitted attempts) ============
    most_missed = sorted(question_stats, key=lambda x: x["correct_percentage"])[:10]
    most_correct = sorted(question_stats, key=lambda x: x["correct_percentage"], reverse=True)[:10]
    most_time_spent = sorted([q for q in question_stats if q["avg_time_spent"] > 0], key=lambda x: x["avg_time_spent"], reverse=True)[:10]
    least_time_spent = sorted([q for q in question_stats if q["avg_time_spent"] > 0], key=lambda x: x["avg_time_spent"])[:10]
    
    # ============ TIME ANALYSIS (ALL submitted attempts) ============
    time_stats = conn.execute("""
        SELECT 
            AVG((julianday(completed_at) - julianday(started_at)) * 86400) as avg_total_time,
            MIN((julianday(completed_at) - julianday(started_at)) * 86400) as min_total_time,
            MAX((julianday(completed_at) - julianday(started_at)) * 86400) as max_total_time
        FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected') 
        AND started_at IS NOT NULL AND completed_at IS NOT NULL
    """, (exam_id,)).fetchone()
    
    avg_total_time = round((time_stats["avg_total_time"] or 0) / 60, 1)
    min_total_time = round((time_stats["min_total_time"] or 0) / 60, 1)
    max_total_time = round((time_stats["max_total_time"] or 0) / 60, 1)
    
    # Time distribution buckets
    time_buckets = conn.execute("""
        SELECT 
            CASE 
                WHEN (julianday(completed_at) - julianday(started_at)) * 86400 < 300 THEN 'Under 5 min'
                WHEN (julianday(completed_at) - julianday(started_at)) * 86400 < 600 THEN '5-10 min'
                WHEN (julianday(completed_at) - julianday(started_at)) * 86400 < 900 THEN '10-15 min'
                WHEN (julianday(completed_at) - julianday(started_at)) * 86400 < 1200 THEN '15-20 min'
                ELSE 'Over 20 min'
            END as time_range,
            COUNT(*) as count
        FROM ce_attempts 
        WHERE exam_id=? AND status IN ('pending', 'approved', 'rejected') 
        AND started_at IS NOT NULL AND completed_at IS NOT NULL
        GROUP BY time_range
    """, (exam_id,)).fetchall()
    
    time_distribution_labels = [t["time_range"] for t in time_buckets]
    time_distribution_counts = [t["count"] for t in time_buckets]
    
    # ============ TOP PERFORMERS (ALL submitted attempts, sorted by score) ============
    top_performers = conn.execute("""
        SELECT a.*, s.full_name, s.username, s.email
        FROM ce_attempts a 
        JOIN ce_students s ON a.student_id = s.id
        WHERE a.exam_id=? AND a.status IN ('pending', 'approved', 'rejected')
        ORDER BY a.percentage DESC 
        LIMIT 10
    """, (exam_id,)).fetchall()
    
    # ============ DIFFICULTY BREAKDOWN ============
    difficulty_counts = {
        "Easy": len([q for q in question_stats if q["difficulty"] == "Easy"]),
        "Medium": len([q for q in question_stats if q["difficulty"] == "Medium"]),
        "Hard": len([q for q in question_stats if q["difficulty"] == "Hard"]),
        "Very Hard": len([q for q in question_stats if q["difficulty"] == "Very Hard"])
    }
    
    # ============ STUDENTS REGISTERED FOR THIS EXAM ============
    all_students = conn.execute("""
        SELECT 
            s.id, s.full_name, s.username, s.email, s.registered_at,
            a.id as attempt_id, a.score, a.total, a.percentage, a.passed, a.status as attempt_status,
            a.started_at, a.completed_at
        FROM ce_students s
        LEFT JOIN ce_attempts a ON s.id = a.student_id AND a.exam_id = s.exam_id
        WHERE s.exam_id = ?
        ORDER BY s.registered_at DESC
    """, (exam_id,)).fetchall()
    
    # Sort students by percentage DESC (highest first, including pending/rejected)
    all_students_list = list(all_students)
    all_students_sorted = sorted(all_students_list, key=lambda x: (
        -(x['percentage'] or 0) if x['attempt_status'] in ['pending', 'approved', 'rejected'] else 1,
        x['registered_at']
    ))
    
    conn.close()
    
    import json
    
    return render_template("ce_analytics.html", 
                         exam=exam,
                         total_attempts=total_attempts,  # FOR TEMPLATE
                         total_submitted=total_submitted,
                         passed=passed,
                         failed=failed,
                         pending=pending,
                         approved=approved,
                         rejected=rejected,
                         avg_score=avg_score,
                         min_score=min_score,
                         max_score=max_score,
                         passing_score=passing_score,
                         distribution_labels=json.dumps(distribution_labels),
                         distribution_counts=json.dumps(distribution_counts),
                         question_stats=question_stats,
                         most_missed=most_missed,
                         most_correct=most_correct,
                         most_time_spent=most_time_spent,
                         least_time_spent=least_time_spent,
                         difficulty_counts=difficulty_counts,
                         avg_total_time=avg_total_time,
                         min_total_time=min_total_time,
                         max_total_time=max_total_time,
                         time_distribution_labels=json.dumps(time_distribution_labels),
                         time_distribution_counts=json.dumps(time_distribution_counts),
                         top_performers=top_performers,
                         all_students_sorted=all_students_sorted,
                         all_students=all_students)


@admin_ce_bp.route("/admin/ce_student_analytics/<int:student_id>/<int:exam_id>")
def ce_student_analytics(student_id, exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get student info
    student = conn.execute("""
        SELECT s.*, e.name as exam_name, e.passing_score, e.duration, e.id as exam_id
        FROM ce_students s
        JOIN ce_exams e ON s.exam_id = e.id
        WHERE s.id = ? AND e.id = ?
    """, (student_id, exam_id)).fetchone()
    
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Get attempt (could be None if not started)
    attempt = conn.execute("""
        SELECT * FROM ce_attempts 
        WHERE student_id=? AND exam_id=?
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    # Calculate statistics based on attempt existence
    if attempt and attempt["status"] in ['approved', 'pending', 'rejected']:
        # Get all questions with student's answers
        questions_data = conn.execute("""
            SELECT 
                q.id, q.question, q.option1, q.option2, q.option3, q.option4, q.answer as correct_answer,
                q.image, s.section_name,
                aq.user_answer, aq.is_correct, aq.time_spent,
                aq.started_at, aq.completed_at
            FROM ce_attempt_questions aq
            JOIN ce_questions q ON aq.question_id = q.id
            JOIN ce_sections s ON q.section_id = s.id
            WHERE aq.attempt_id = ?
            ORDER BY s.section_order, q.display_order
        """, (attempt["id"],)).fetchall()
        
        total_questions = len(questions_data)
        correct_count = sum(1 for q in questions_data if q["is_correct"])
        incorrect_count = total_questions - correct_count
        score_percentage = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0
        
        # Time statistics
        total_time_spent = sum(q["time_spent"] or 0 for q in questions_data)
        avg_time_per_question = round(total_time_spent / total_questions, 1) if total_questions > 0 else 0
        
        # Get attempt total time
        attempt_total_time = 0
        if attempt["started_at"] and attempt["completed_at"]:
            from datetime import datetime
            start = datetime.strptime(attempt["started_at"], "%Y-%m-%d %H:%M:%S")
            end = datetime.strptime(attempt["completed_at"], "%Y-%m-%d %H:%M:%S")
            attempt_total_time = (end - start).total_seconds()
        
        # Prepare question breakdown
        question_breakdown = []
        for idx, q in enumerate(questions_data, 1):
            selected_letter = ""
            selected_text = ""
            if q["user_answer"]:
                if q["user_answer"] == q["option1"]:
                    selected_letter = "A"
                    selected_text = q["option1"]
                elif q["user_answer"] == q["option2"]:
                    selected_letter = "B"
                    selected_text = q["option2"]
                elif q["user_answer"] == q["option3"]:
                    selected_letter = "C"
                    selected_text = q["option3"]
                elif q["user_answer"] == q["option4"]:
                    selected_letter = "D"
                    selected_text = q["option4"]
            
            correct_letter = ""
            correct_text = ""
            if q["correct_answer"]:
                if q["correct_answer"] == q["option1"]:
                    correct_letter = "A"
                    correct_text = q["option1"]
                elif q["correct_answer"] == q["option2"]:
                    correct_letter = "B"
                    correct_text = q["option2"]
                elif q["correct_answer"] == q["option3"]:
                    correct_letter = "C"
                    correct_text = q["option3"]
                elif q["correct_answer"] == q["option4"]:
                    correct_letter = "D"
                    correct_text = q["option4"]
            
            question_breakdown.append({
                "number": idx,
                "id": q["id"],
                "question": q["question"],
                "section": q["section_name"],
                "selected": selected_text,
                "selected_letter": selected_letter,
                "correct_answer": correct_text,
                "correct_letter": correct_letter,
                "is_correct": q["is_correct"],
                "time_spent": q["time_spent"] or 0,
                "options": [q["option1"], q["option2"], q["option3"], q["option4"]],
                "image": q["image"]
            })
        
    else:
        # No attempt yet or not started
        questions_data = []
        total_questions = 0
        correct_count = 0
        incorrect_count = 0
        score_percentage = 0
        total_time_spent = 0
        avg_time_per_question = 0
        attempt_total_time = 0
        question_breakdown = []
    
    # Get class average for comparison
    class_avg_data = conn.execute("""
        SELECT AVG(percentage) as avg FROM ce_attempts 
        WHERE exam_id=? AND status='approved'
    """, (exam_id,)).fetchone()
    class_avg = round(class_avg_data["avg"] or 0, 1)
    
    # Get student rank (only if approved)
    rank = None
    if attempt and attempt["status"] == "approved":
        rank_data = conn.execute("""
            SELECT COUNT(*) + 1 as rank FROM ce_attempts 
            WHERE exam_id=? AND status='approved' AND percentage > ?
        """, (exam_id, attempt["percentage"])).fetchone()
        rank = rank_data["rank"] if rank_data else 1
    
    # Get attempt status
    attempt_status = attempt["status"] if attempt else "not_started"
    
    # Create exam object for template
    exam_obj = {
        "id": exam_id,
        "name": student["exam_name"],
        "passing_score": student["passing_score"],
        "duration": student["duration"]
    }
    
    conn.close()
    
    return render_template("ce_student_analytics.html",
                         student=student,
                         exam=exam_obj,
                         attempt=attempt,
                         attempt_status=attempt_status,
                         score_percentage=score_percentage,
                         correct_count=correct_count,
                         incorrect_count=incorrect_count,
                         total_questions=total_questions,
                         total_time_spent=total_time_spent,
                         attempt_total_time=attempt_total_time,
                         avg_time_per_question=avg_time_per_question,
                         class_avg=class_avg,
                         rank=rank,
                         question_breakdown=question_breakdown)


@admin_ce_bp.route("/admin/ce_reset_all_students_exams", methods=["POST"])
def ce_reset_all_students_exams():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    conn.execute("DELETE FROM ce_attempt_questions")
    conn.execute("DELETE FROM ce_attempts")
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "All student exams have been reset!"}


@admin_ce_bp.route("/admin/ce_student_review/<int:student_id>/<int:exam_id>")
def ce_student_review(student_id, exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get student info
    student = conn.execute("""
        SELECT s.*, e.name as exam_name, e.passing_score, e.target_class, e.duration, e.id as exam_id
        FROM ce_students s
        JOIN ce_exams e ON s.exam_id = e.id
        WHERE s.id = ? AND e.id = ?
    """, (student_id, exam_id)).fetchone()
    
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Get attempt
    attempt = conn.execute("""
        SELECT * FROM ce_attempts 
        WHERE student_id=? AND exam_id=?
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if attempt and attempt["status"] in ['approved', 'pending', 'rejected']:
        # Get all questions with student's answers
        questions_data = conn.execute("""
            SELECT 
                q.id, q.question, q.option1, q.option2, q.option3, q.option4, q.answer as correct_answer,
                q.image, s.section_name,
                aq.user_answer, aq.is_correct, aq.time_spent
            FROM ce_attempt_questions aq
            JOIN ce_questions q ON aq.question_id = q.id
            JOIN ce_sections s ON q.section_id = s.id
            WHERE aq.attempt_id = ?
            ORDER BY s.section_order, q.display_order
        """, (attempt["id"],)).fetchall()
        
        total_questions = len(questions_data)
        correct_count = sum(1 for q in questions_data if q["is_correct"])
        incorrect_count = total_questions - correct_count
        score_percentage = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0
        total_time_spent = sum(q["time_spent"] or 0 for q in questions_data)
        avg_time_per_question = round(total_time_spent / total_questions, 1) if total_questions > 0 else 0
        
        # Prepare question breakdown
        question_breakdown = []
        for idx, q in enumerate(questions_data, 1):
            selected_letter = ""
            selected_text = ""
            if q["user_answer"]:
                if q["user_answer"] == q["option1"]:
                    selected_letter = "A"
                    selected_text = q["option1"]
                elif q["user_answer"] == q["option2"]:
                    selected_letter = "B"
                    selected_text = q["option2"]
                elif q["user_answer"] == q["option3"]:
                    selected_letter = "C"
                    selected_text = q["option3"]
                elif q["user_answer"] == q["option4"]:
                    selected_letter = "D"
                    selected_text = q["option4"]
            
            correct_letter = ""
            correct_text = ""
            if q["correct_answer"]:
                if q["correct_answer"] == q["option1"]:
                    correct_letter = "A"
                    correct_text = q["option1"]
                elif q["correct_answer"] == q["option2"]:
                    correct_letter = "B"
                    correct_text = q["option2"]
                elif q["correct_answer"] == q["option3"]:
                    correct_letter = "C"
                    correct_text = q["option3"]
                elif q["correct_answer"] == q["option4"]:
                    correct_letter = "D"
                    correct_text = q["option4"]
            
            question_breakdown.append({
                "number": idx,
                "id": q["id"],
                "question": q["question"],
                "section": q["section_name"],
                "selected": selected_text,
                "selected_letter": selected_letter,
                "correct_answer": correct_text,
                "correct_letter": correct_letter,
                "is_correct": q["is_correct"],
                "time_spent": q["time_spent"] or 0,
                "options": [q["option1"], q["option2"], q["option3"], q["option4"]],
                "image": q["image"]
            })
        
        attempt_status = attempt["status"]
    else:
        total_questions = 0
        correct_count = 0
        incorrect_count = 0
        score_percentage = 0
        total_time_spent = 0
        avg_time_per_question = 0
        question_breakdown = []
        attempt_status = "not_started"
    
    # Get class average for comparison
    class_avg_data = conn.execute("""
        SELECT AVG(percentage) as avg FROM ce_attempts 
        WHERE exam_id=? AND status='approved'
    """, (exam_id,)).fetchone()
    class_avg = round(class_avg_data["avg"] or 0, 1)
    
    conn.close()
    
    return render_template("ce_student_review.html",
                         student=student,
                         exam=student,
                         attempt=attempt,
                         attempt_status=attempt_status,
                         score_percentage=score_percentage,
                         correct_count=correct_count,
                         incorrect_count=incorrect_count,
                         total_questions=total_questions,
                         total_time_spent=total_time_spent,
                         avg_time_per_question=avg_time_per_question,
                         class_avg=class_avg,
                         question_breakdown=question_breakdown)


@admin_ce_bp.route("/admin/ce_student_approve/<int:student_id>/<int:exam_id>", methods=["POST"])
def ce_student_approve(student_id, exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    # Get the attempt
    attempt = conn.execute("""
        SELECT a.*, s.full_name, s.username, s.email, e.target_class
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.student_id = ? AND a.exam_id = ?
        ORDER BY a.id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if not attempt:
        conn.close()
        return {"error": "No attempt found"}, 404
    
    # Update attempt status
    conn.execute("""
        UPDATE ce_attempts SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
        WHERE id=?
    """, (session["username"], attempt["id"]))
    
    # Check if student already exists in main students table
    existing = conn.execute("SELECT id FROM students WHERE username=?", (attempt["username"],)).fetchone()
    
    if not existing:
        default_password = generate_password_hash("student123")
        conn.execute("""
            INSERT INTO students (username, password, full_name, email, class, photo, status, approved_at)
            VALUES (?, ?, ?, ?, ?, 'default.png', 'approved', CURRENT_TIMESTAMP)
        """, (attempt["username"], default_password, attempt["full_name"], attempt["email"], attempt["target_class"]))
    
    log_action("Admin", session["username"], f"Approved common entrance student '{attempt['username']}' for {attempt['target_class']}", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Student {attempt['full_name']} approved successfully!"}


@admin_ce_bp.route("/admin/ce_student_reject/<int:student_id>/<int:exam_id>", methods=["POST"])
def ce_student_reject(student_id, exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    # Get the attempt
    attempt = conn.execute("""
        SELECT a.*, s.full_name
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        WHERE a.student_id = ? AND a.exam_id = ?
        ORDER BY a.id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if not attempt:
        conn.close()
        return {"error": "No attempt found"}, 404
    
    # Update attempt status
    conn.execute("""
        UPDATE ce_attempts SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewed_by=?
        WHERE id=?
    """, (session["username"], attempt["id"]))
    
    log_action("Admin", session["username"], f"Rejected common entrance student '{attempt['full_name']}'", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Student {attempt['full_name']} has been rejected."}


@admin_ce_bp.route("/admin/ce_active_exams")
def admin_ce_active_exams():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get all in-progress attempts
    active_attempts = conn.execute("""
        SELECT a.*, s.full_name, s.username, s.email, e.name as exam_name, e.target_class
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.status = 'in_progress'
        ORDER BY a.started_at DESC
    """).fetchall()
    
    conn.close()
    
    return render_template("admin_active_exams.html", active_attempts=active_attempts)


@admin_ce_bp.route("/admin/ce_pause_exam/<int:attempt_id>", methods=["POST"])
def admin_ce_pause_exam(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT a.*, e.duration FROM ce_attempts a
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id=?
    """, (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        conn.execute("""
            UPDATE ce_attempts SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=?
            WHERE id=?
        """, (session["username"], server_rem, attempt_id))
        conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam paused successfully"}


@admin_ce_bp.route("/admin/ce_resume_exam/<int:attempt_id>", methods=["POST"])
def admin_ce_resume_exam(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT remaining_time FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    rem = int(attempt['remaining_time'] or 0) if attempt else 0
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE ce_attempts SET is_paused=0, paused_at=NULL, paused_by=NULL, resume_requested=0, authoritative_deadline=?
        WHERE id=?
    """, (new_dl, attempt_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam resumed successfully"}


@admin_ce_bp.route("/admin/ce_approve_resume/<int:attempt_id>", methods=["POST"])
def admin_ce_approve_resume(attempt_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    rem = int(attempt['remaining_time'] or 0)
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE ce_attempts SET 
        status='in_progress', 
        is_paused=0,
        paused_at=NULL,
        paused_by=NULL,
        resume_requested=0,
        auto_submitted=0,
        authoritative_deadline=?
        WHERE id=?
    """, (new_dl, attempt_id))
    
    log_action("Admin", session["username"], f"Approved resume for exam attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Student can now resume the exam"}


@admin_ce_bp.route('/admin/ce_approve_resume_request/<int:attempt_id>', methods=['POST'])
def ce_approve_resume_request(attempt_id):
    """Admin approves student to resume exam on new computer"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT remaining_time FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    rem = int(attempt['remaining_time'] or 0)
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE ce_attempts 
        SET resume_requested=0, is_paused=0, resume_requested_at=NULL, paused_by=NULL, paused_at=NULL, authoritative_deadline=?
        WHERE id=?
    """, (new_dl, attempt_id))
    
    log_action("Admin", session["username"], f"Approved resume request for attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Student can now resume the exam"}


@admin_ce_bp.route('/admin/ce_technical_support')
def ce_technical_support():
   
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get all active/in-progress attempts with resume requests
    active_attempts = conn.execute("""
        SELECT a.*, s.full_name, s.username, s.email, e.name as exam_name, e.target_class
        FROM ce_attempts a
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.status = 'in_progress'
        ORDER BY a.resume_requested DESC, a.started_at DESC
    """).fetchall()
    
    conn.close()
    
    return render_template("ce_technical_support.html", active_attempts=active_attempts)


@admin_ce_bp.route('/admin/ce_technical_support_count', methods=['GET'])
def ce_technical_support_count():
    """Get count of pending resume requests for badge"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    count = conn.execute(
        "SELECT COUNT(*) as count FROM ce_attempts WHERE status='in_progress' AND resume_requested=1"
    ).fetchone()["count"]
    conn.close()
    
    return {"count": count}


@admin_ce_bp.route('/admin/ce_tech_pause/<int:attempt_id>', methods=['POST'])
def ce_tech_pause(attempt_id):
    """Admin pauses a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT a.*, e.duration FROM ce_attempts a
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id=?
    """, (attempt_id,)).fetchone()
    if attempt and attempt["status"] == "in_progress":
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        conn.execute("""
            UPDATE ce_attempts 
            SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=?
            WHERE id=?
        """, (session["username"], server_rem, attempt_id))
        conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam paused successfully"}


@admin_ce_bp.route('/admin/ce_tech_resume/<int:attempt_id>', methods=['POST'])
def ce_tech_resume(attempt_id):
    """Admin resumes a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT remaining_time FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    rem = int(attempt['remaining_time'] or 0) if attempt else 0
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE ce_attempts 
        SET is_paused=0, paused_at=NULL, paused_by=NULL, resume_requested=0, authoritative_deadline=?
        WHERE id=?
    """, (new_dl, attempt_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam resumed successfully"}


@admin_ce_bp.route('/admin/ce_add_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def ce_add_time(attempt_id, minutes):
    """Admin adds extra time to a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT a.*, e.duration FROM ce_attempts a
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id=?
    """, (attempt_id,)).fetchone()
    
    if attempt and attempt["status"] == "in_progress":
        if attempt["is_paused"] == 1:
            new_time = (attempt["remaining_time"] or 0) + (minutes * 60)
            conn.execute("UPDATE ce_attempts SET remaining_time=? WHERE id=?", (new_time, attempt_id))
        else:
            cur_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            new_rem = cur_rem + (minutes * 60)
            new_dl = (get_utc_now() + timedelta(seconds=new_rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE ce_attempts SET remaining_time=?, authoritative_deadline=? WHERE id=?", (new_rem, new_dl, attempt_id))
        log_action("Admin", session["username"], f"Added {minutes} minutes to attempt {attempt_id}", conn=conn)
        conn.commit()
    
    conn.close()
    return {"success": True, "message": f"Added {minutes} minutes to exam"}


@admin_ce_bp.route('/admin/ce_subtract_time/<int:attempt_id>/<int:minutes>', methods=['POST'])
def ce_subtract_time(attempt_id, minutes):
    """Admin subtracts time from a student's exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT a.*, e.duration FROM ce_attempts a
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id=?
    """, (attempt_id,)).fetchone()
    
    if attempt and attempt["status"] == "in_progress":
        if attempt["is_paused"] == 1:
            new_time = max(0, (attempt["remaining_time"] or 0) - (minutes * 60))
            conn.execute("UPDATE ce_attempts SET remaining_time=? WHERE id=?", (new_time, attempt_id))
        else:
            cur_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            new_rem = max(0, cur_rem - (minutes * 60))
            new_dl = (get_utc_now() + timedelta(seconds=new_rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE ce_attempts SET remaining_time=?, authoritative_deadline=? WHERE id=?", (new_rem, new_dl, attempt_id))
        log_action("Admin", session["username"], f"Subtracted {minutes} minutes from attempt {attempt_id}", conn=conn)
        conn.commit()
    
    conn.close()
    return {"success": True, "message": f"Subtracted {minutes} minutes from exam"}


@admin_ce_bp.route('/admin/ce_force_submit/<int:attempt_id>', methods=['POST'])
def ce_force_submit(attempt_id):
    """
    Admin forces a student's exam to submit immediately.
    Grades the exam idempotently using saved progress.
    """
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
        
    conn = get_db_connection()
    attempt = conn.execute("SELECT * FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
        
    finalize_ce_exam_attempt(attempt_id, conn=conn)
    log_action("Admin", session["username"], f"Force submitted exam attempt {attempt_id}", conn=conn)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Exam has been force submitted successfully."}


@admin_ce_bp.route('/admin/ce_reset_warnings/<int:attempt_id>', methods=['POST'])
def ce_reset_warnings(attempt_id):
    """Admin resets a student's warning count to 0 with mandatory audit logging"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Admin manual reset")
    from cognitara.services.violation_service import reset_warnings
    res = reset_warnings(attempt_id, exam_type="ce", reset_by=session.get("username", "admin"), role="Admin", reason=reason)
    return res, res.get("status_code", 200)


@admin_ce_bp.route('/admin/ce_pause_all_exams', methods=['POST'])
def ce_pause_all_exams():
    """Admin pauses ALL active exams at once"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    try:
        active = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.status='in_progress' AND a.is_paused=0
        """).fetchall()
        for a in active:
            server_rem = calculate_authoritative_remaining_time(a, a["duration"])
            conn.execute("""
                UPDATE ce_attempts 
                SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by=?, remaining_time=?
                WHERE id=?
            """, (session["username"], server_rem, a["id"]))
        
        log_action("Admin", session["username"], "Paused all active exams", conn=conn)
        conn.commit()
        return {"success": True, "message": "All active exams paused."}
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_ce_bp.route('/admin/ce_force_submit_all', methods=['POST'])
def ce_force_submit_all():
    """Admin force submits and grades ALL active exams at once"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    try:
        active_attempts = conn.execute("SELECT id FROM ce_attempts WHERE status='in_progress'").fetchall()
        for attempt in active_attempts:
            finalize_ce_exam_attempt(attempt["id"], conn=conn)
            
        log_action("Admin", session["username"], "Force submitted ALL active exams", conn=conn)
        conn.commit()
        return {"success": True, "message": "All active exams have been force submitted."}
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_ce_bp.route('/admin/ce_resume_all_exams', methods=['POST'])
def ce_resume_all_exams():
    """Admin resumes ALL paused active exams at once"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    try:
        paused = conn.execute("SELECT id, remaining_time FROM ce_attempts WHERE status='in_progress' AND is_paused=1").fetchall()
        for p in paused:
            rem = int(p['remaining_time'] or 0)
            new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("""
                UPDATE ce_attempts 
                SET is_paused=0, paused_at=NULL, paused_by=NULL, resume_requested=0, authoritative_deadline=?
                WHERE id=?
            """, (new_dl, p["id"]))
        
        log_action("Admin", session["username"], "Resumed all paused exams", conn=conn)
        conn.commit()
        return {"success": True, "message": "All paused exams have been resumed."}
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_ce_bp.route('/admin/ce_live_data')
def ce_live_data():
    """Returns real-time data for the admin CE technical support dashboard to prevent full-page reloads"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
        
    from cognitara.services.session_service import sweep_disconnected_attempts
    conn = get_db_connection()
    try:
        sweep_disconnected_attempts(conn)
        now_dt = get_utc_now()
        active = conn.execute("""
            SELECT a.id, a.student_id, a.remaining_time, a.warnings_count, a.is_paused, 
                   a.resume_requested, a.last_heartbeat, a.start_time,
                   s.full_name, s.username, s.candidate_number, s.application_number, s.photo,
                   e.name as exam_name, e.target_class
            FROM ce_attempts a
            JOIN ce_students s ON a.student_id = s.id
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.status = 'in_progress'
            ORDER BY a.resume_requested DESC, a.start_time DESC
        """).fetchall()
        
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

            r["student_name"] = r.get("full_name") or r.get("candidate_number") or "Candidate"
            r["seconds_since_heartbeat"] = secs_since_hb
            r["connection_state"] = conn_state

            if r.get("is_paused"):
                total_paused += 1
            else:
                total_running += 1
            if r.get("resume_requested"):
                total_resume_req += 1

            sessions.append(r)

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
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_ce_bp.route("/admin/ce_question/<int:question_id>/data")
def ce_question_data(question_id):
    if "admin_id" not in session:
        return {"success": False, "error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM ce_questions WHERE id=?", (question_id,)).fetchone()
    conn.close()
    
    if not question:
        return {"success": False, "error": "Question not found"}, 404
    
    # Convert to dictionary and handle None values
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
        "explanation": question["explanation"] if "explanation" in question.keys() else None
    }
    
    return {
        "success": True,
        "question": question_dict
    }


@admin_ce_bp.route("/admin/ce_group_question/<int:question_id>/edit", methods=["GET", "POST"])
def edit_ce_group_question(question_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    question = conn.execute("SELECT * FROM ce_questions WHERE id=?", (question_id,)).fetchone()
    
    if not question:
        conn.close()
        return "Question not found", 404
    
    # Get group info for display
    group = None
    if question['group_id']:
        group = conn.execute("SELECT group_name FROM ce_question_groups WHERE id=?", (question['group_id'],)).fetchone()
    
    section_id = question["section_id"]
    group_name = group['group_name'] if group else None
    
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
                old_path = get_upload_path(image_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            
            image_filename = f"ce_group_q_{question['group_id']}_{int(datetime.now().timestamp())}.jpg"
            save_path = get_upload_path(image_filename)
            compress_image(file, save_path, 50)
        
        conn.execute("""
            UPDATE ce_questions SET
            question=?, option1=?, option2=?, option3=?, option4=?, answer=?, image=?, mandatory=?
            WHERE id=?
        """, (question_text, option1, option2, option3, option4, answer, image_filename, mandatory, question_id))
        
        conn.commit()
        conn.close()
        
        # Redirect back to GROUPS page
        return redirect(f"/admin/ce_section/{section_id}/groups")
    
    conn.close()
    return render_template("ce_edit_group_question.html", question=question, section_id=section_id, group_name=group_name)


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/update", methods=["POST"])
def update_ce_section(section_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    section_name = request.form.get("section_name")
    questions_to_show = int(request.form.get("questions_to_show", 0))
    randomize = int(request.form.get("randomize", 1))
    
    conn.execute("UPDATE ce_sections SET section_name=?, questions_to_show=?, randomize=? WHERE id=?", (section_name, questions_to_show, randomize, section_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Section updated successfully"}


@admin_ce_bp.route("/admin/ce_export/<int:exam_id>/csv")
def ce_export_csv(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get all students with their scores
    students = conn.execute("""
        SELECT s.full_name, s.username, s.email, 
               a.score, a.total, a.percentage, a.passed,
               a.started_at, a.completed_at,
               (strftime('%s', a.completed_at) - strftime('%s', a.started_at)) as time_spent
        FROM ce_students s
        JOIN ce_attempts a ON s.id = a.student_id
        WHERE a.exam_id=? AND a.status='approved'
        ORDER BY a.percentage DESC
    """, (exam_id,)).fetchall()
    
    # Get exam name
    exam = conn.execute("SELECT name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    conn.close()
    
    # Create CSV
    output = StringIO()
    writer = csv.writer(output)
    
    # Write headers
    writer.writerow([f"Exam: {exam['name']}", "", "", "", "", ""])
    writer.writerow([f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", "", "", "", "", ""])
    writer.writerow([])
    writer.writerow(["Full Name", "Username", "Email", "Score", "Percentage", "Status", "Time Spent (sec)", "Started At", "Completed At"])
    
    for s in students:
        status = "Passed" if s["passed"] else "Failed"
        writer.writerow([
            s["full_name"], s["username"], s["email"],
            f"{s['score']}/{s['total']}", f"{s['percentage']:.1f}%", status,
            s["time_spent"] or 0, s["started_at"], s["completed_at"]
        ])
    
    # Return CSV file
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=exam_{exam_id}_results.csv"}
    )


@admin_ce_bp.route("/admin/ce_export/<int:exam_id>/excel")
def ce_export_excel(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get data
    students = conn.execute("""
        SELECT s.full_name, s.username, s.email, 
               a.score, a.total, a.percentage, a.passed,
               a.started_at, a.completed_at
        FROM ce_students s
        JOIN ce_attempts a ON s.id = a.student_id
        WHERE a.exam_id=? AND a.status='approved'
        ORDER BY a.percentage DESC
    """, (exam_id,)).fetchall()
    
    # Get question-level data for each student
    questions_detail = conn.execute("""
        SELECT s.full_name, q.question, aq.user_answer, q.answer as correct_answer, aq.is_correct
        FROM ce_attempt_questions aq
        JOIN ce_attempts a ON aq.attempt_id = a.id
        JOIN ce_students s ON a.student_id = s.id
        JOIN ce_questions q ON aq.question_id = q.id
        WHERE a.exam_id=? AND a.status='approved'
        ORDER BY s.full_name, q.id
    """, (exam_id,)).fetchall()
    
    exam = conn.execute("SELECT name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    conn.close()
    
    # Create Excel workbook
    wb = openpyxl.Workbook()
    
    # Sheet 1: Summary
    ws_summary = wb.active
    ws_summary.title = "Summary"
    
    ws_summary["A1"] = f"Exam: {exam['name']}"
    ws_summary["A1"].font = Font(size=14, bold=True)
    ws_summary["A2"] = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    headers = ["Full Name", "Username", "Email", "Score", "Percentage", "Status", "Started At", "Completed At"]
    for col, header in enumerate(headers, 1):
        cell = ws_summary.cell(row=4, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        cell.font = Font(color="FFFFFF", bold=True)
    
    for row, s in enumerate(students, 5):
        status = "Passed" if s["passed"] else "Failed"
        ws_summary.cell(row=row, column=1, value=s["full_name"])
        ws_summary.cell(row=row, column=2, value=s["username"])
        ws_summary.cell(row=row, column=3, value=s["email"])
        ws_summary.cell(row=row, column=4, value=f"{s['score']}/{s['total']}")
        ws_summary.cell(row=row, column=5, value=f"{s['percentage']:.1f}%")
        ws_summary.cell(row=row, column=6, value=status)
        ws_summary.cell(row=row, column=7, value=s["started_at"])
        ws_summary.cell(row=row, column=8, value=s["completed_at"])
    
    # Sheet 2: Question Details per Student
    ws_details = wb.create_sheet("Question Details")
    
    detail_headers = ["Student", "Question", "Student Answer", "Correct Answer", "Correct?"]
    for col, header in enumerate(detail_headers, 1):
        cell = ws_details.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        cell.font = Font(color="FFFFFF", bold=True)
    
    for row, qd in enumerate(questions_detail, 2):
        ws_details.cell(row=row, column=1, value=qd["full_name"])
        ws_details.cell(row=row, column=2, value=qd["question"][:100])
        ws_details.cell(row=row, column=3, value=qd["user_answer"])
        ws_details.cell(row=row, column=4, value=qd["correct_answer"])
        ws_details.cell(row=row, column=5, value="Yes" if qd["is_correct"] else "No")
    
    # Auto-size columns
    for column in ws_summary.columns:
        max_length = 0
        column_letter = column[0].column_letter
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 30)
        ws_summary.column_dimensions[column_letter].width = adjusted_width
    
    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return Response(
        output.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment;filename=exam_{exam_id}_results.xlsx"}
    )


@admin_ce_bp.route("/admin/ce_section/<int:section_id>/toggle_active", methods=["POST"])
def toggle_ce_section_active(section_id):
    """Toggle a CE exam section active/inactive"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    section = conn.execute("SELECT active, section_name FROM ce_sections WHERE id=?", (section_id,)).fetchone()
    
    if not section:
        conn.close()
        return {"error": "Section not found"}, 404
    
    new_status = 0 if section["active"] == 1 else 1
    conn.execute("UPDATE ce_sections SET active=? WHERE id=?", (new_status, section_id))
    conn.commit()
    conn.close()
    
    status_text = "activated" if new_status == 1 else "deactivated"
    return {
        "success": True, 
        "message": f"Section '{section['section_name']}' {status_text}",
        "active": new_status == 1
    }


@admin_ce_bp.route("/admin/ce_export_student/<int:student_id>/<int:exam_id>/csv")
def ce_export_student_csv(student_id, exam_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get student info
    student = conn.execute("SELECT * FROM ce_students WHERE id=?", (student_id,)).fetchone()
    exam = conn.execute("SELECT name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    
    # Get questions with answers
    questions = conn.execute("""
        SELECT q.question, q.option1, q.option2, q.option3, q.option4, q.answer as correct_answer,
               aq.user_answer, aq.is_correct, aq.time_spent
        FROM ce_attempt_questions aq
        JOIN ce_questions q ON aq.question_id = q.id
        JOIN ce_attempts a ON aq.attempt_id = a.id
        WHERE a.student_id=? AND a.exam_id=? AND a.status='approved'
    """, (student_id, exam_id)).fetchall()
    
    conn.close()
    
    output = StringIO()
    writer = csv.writer(output)
    
    writer.writerow([f"Student: {student['full_name']}"])
    writer.writerow([f"Exam: {exam['name']}"])
    writer.writerow([f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
    writer.writerow([])
    writer.writerow(["Question", "Student Answer", "Correct Answer", "Correct?", "Time Spent (sec)"])
    
    for q in questions:
        writer.writerow([
            q["question"][:200],
            q["user_answer"],
            q["correct_answer"],
            "Yes" if q["is_correct"] else "No",
            q["time_spent"] or 0
        ])
    
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=student_{student_id}_results.csv"}
    )


@admin_ce_bp.route("/admin/ce_delete_all_students", methods=["POST"])
def admin_ce_delete_all_students():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    conn.execute("DELETE FROM ce_attempt_questions")
    conn.execute("DELETE FROM ce_attempts")
    conn.execute("DELETE FROM ce_students")
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "All students deleted successfully!"}


@admin_ce_bp.route("/admin/ce_get_student_stats/<int:student_id>/<int:exam_id>")
def ce_get_student_stats(student_id, exam_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    # Get exam details
    exam = conn.execute("SELECT passing_score, name FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    passing_score = exam["passing_score"] if exam else 50
    exam_name = exam["name"] if exam else "Exam"
    
    # Get student's attempt
    attempt = conn.execute("""
        SELECT a.*, 
               (strftime('%s', a.completed_at) - strftime('%s', a.started_at)) as time_spent_seconds
        FROM ce_attempts a
        WHERE a.student_id = ? AND a.exam_id = ?
        ORDER BY a.id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if not attempt:
        conn.close()
        return {
            "studentPercentage": 0,
            "passingScore": passing_score,
            "examName": exam_name,
            "score": 0,
            "total": 0,
            "hasAttempt": False
        }
    
    student_percentage = attempt["percentage"] or 0
    student_score = attempt["score"] or 0
    student_total = attempt["total"] or 0
    student_time = attempt.get("time_spent_seconds") or 0
    
    # Get rank (count how many students have higher percentage)
    rank_query = conn.execute("""
        SELECT COUNT(*) + 1 as rank FROM ce_attempts 
        WHERE exam_id = ? AND percentage > ? AND status IN ('pending', 'approved', 'rejected')
    """, (exam_id, student_percentage)).fetchone()
    rank = rank_query["rank"] if rank_query else 1
    
    total_students = conn.execute("""
        SELECT COUNT(*) as count FROM ce_attempts 
        WHERE exam_id = ? AND status IN ('pending', 'approved', 'rejected')
    """, (exam_id,)).fetchone()["count"]
    
    # Get speed rank
    speed_rank = 1
    time_list = conn.execute("""
        SELECT (strftime('%s', completed_at) - strftime('%s', started_at)) as time_spent
        FROM ce_attempts 
        WHERE exam_id = ? AND status IN ('pending', 'approved', 'rejected')
        AND started_at IS NOT NULL AND completed_at IS NOT NULL
        AND (strftime('%s', completed_at) - strftime('%s', started_at)) > 0
        ORDER BY time_spent ASC
    """, (exam_id,)).fetchall()
    
    all_times = [t["time_spent"] for t in time_list if t["time_spent"]]
    if all_times and student_time > 0:
        faster_count = sum(1 for t in all_times if t < student_time)
        speed_rank = faster_count + 1
        faster_percent = round((faster_count / len(all_times)) * 100)
    else:
        faster_percent = 0
    
    conn.close()
    
    return {
        "studentPercentage": round(student_percentage, 1),
        "passingScore": passing_score,
        "examName": exam_name,
        "score": student_score,
        "total": student_total,
        "rank": rank,
        "totalStudents": total_students,
        "speedRank": speed_rank,
        "fasterPercent": faster_percent,
        "studentTime": round(student_time / 60, 1) if student_time else 0,
        "hasAttempt": True,
        "meetsPassing": student_percentage >= passing_score
    }


