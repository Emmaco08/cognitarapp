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
admin_dashboard_bp = Blueprint('admin_dashboard', __name__)

@admin_dashboard_bp.route("/admin")
def admin_dashboard():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    try:
        exams = conn.execute("""
            SELECT e.*, COALESCE(NULLIF(TRIM(t.full_name), ''), t.username) as teacher_name
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            ORDER BY e.id DESC
        """).fetchall()
    except sqlite3.OperationalError:
        exams = conn.execute("""
            SELECT e.*, t.username as teacher_name
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            ORDER BY e.id DESC
        """).fetchall()
    
    # Common Entrance exams for dashboard
    ce_exams = conn.execute("""
        SELECT e.*, 
               (SELECT COUNT(*) FROM ce_attempts WHERE exam_id = e.id) as attempts_count,
               (SELECT COUNT(*) FROM ce_attempts WHERE exam_id = e.id AND status = 'approved') as approved_count
        FROM ce_exams e 
        ORDER BY id DESC
    """).fetchall()
    
    search_query = request.args.get('search', '').strip()
    teacher_search = request.args.get('teacher_search', '').strip()

    if search_query:
        students = conn.execute(
            "SELECT * FROM students WHERE (username LIKE ? OR class LIKE ? OR full_name LIKE ?) AND status='approved' ORDER BY id DESC",
            (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%')
        ).fetchall()
    else:
        students = conn.execute(
            "SELECT * FROM students WHERE status='approved' ORDER BY id DESC"
        ).fetchall()

    total_students_count = len(students)

    if teacher_search:
        try:
            teachers = conn.execute(
                "SELECT * FROM teachers WHERE username LIKE ? OR full_name LIKE ? OR class LIKE ? ORDER BY id DESC",
                (f'%{teacher_search}%', f'%{teacher_search}%', f'%{teacher_search}%')
            ).fetchall()
        except sqlite3.OperationalError:
            teachers = conn.execute(
                "SELECT * FROM teachers WHERE username LIKE ? OR class LIKE ? ORDER BY id DESC",
                (f'%{teacher_search}%', f'%{teacher_search}%')
            ).fetchall()
    else:
        teachers = conn.execute("SELECT * FROM teachers ORDER BY id DESC").fetchall()

    total_teachers_count = len(teachers)

    student_classes = sorted({(s["class"] or "").strip() for s in students if s["class"] and str(s["class"]).strip()})

    result = conn.execute("SELECT COUNT(*) as count FROM pending_registrations WHERE status='pending'").fetchone()
    pending_count = result["count"] if result else 0
    
    conn.close()
    
    return render_template("admin.html", 
                         exams=exams, 
                         ce_exams=ce_exams,
                         students=students,
                         teachers=teachers, 
                         student_classes=student_classes,
                         username=session.get("username") or session.get("admin_username") or "Admin",
                         search_query=search_query,
                         teacher_search=teacher_search,
                         pending_count=pending_count,
                         total_students_count=total_students_count,
                         total_teachers_count=total_teachers_count,
                         current_student_page=1,
                         total_student_pages=1,
                         current_teacher_page=1,
                         total_teacher_pages=1)


@admin_dashboard_bp.route("/admin/logs")
def admin_logs():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    logs = conn.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC").fetchall()
    conn.close()
    return render_template("audit_logs.html", logs=logs)


@admin_dashboard_bp.route("/admin/warning_logs")
def warning_logs():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    logs = conn.execute("""
        SELECT * FROM warning_logs 
        ORDER BY timestamp DESC
    """).fetchall()
    
    summary = conn.execute("""
        SELECT 
            student_name,
            COUNT(*) - COALESCE(SUM(CASE WHEN warning_message LIKE 'Exam submitted%' THEN 1 ELSE 0 END), 0) as total_warning_events,
            COUNT(DISTINCT exam_id) as exams_with_warnings,
            GROUP_CONCAT(DISTINCT exam_name) as exam_names,
            MIN(timestamp) as first_warning,
            MAX(timestamp) as last_warning
        FROM warning_logs 
        GROUP BY student_name
        ORDER BY total_warning_events DESC
    """).fetchall()
    
    by_exam = conn.execute("""
        SELECT 
            student_name,
            exam_name,
            COUNT(*) - COALESCE(SUM(CASE WHEN warning_message LIKE 'Exam submitted%' THEN 1 ELSE 0 END), 0) as warning_events_in_exam,
            GROUP_CONCAT(warning_message, ' | ') as warnings_list,
            MIN(timestamp) as first_warning,
            MAX(timestamp) as last_warning
        FROM warning_logs 
        GROUP BY student_name, exam_name
        ORDER BY student_name, exam_name
    """).fetchall()
    
    conn.close()
    return render_template("warning_logs.html", logs=logs, summary=summary, by_exam=by_exam)


@admin_dashboard_bp.route("/admin/delete_warning_log/<int:log_id>", methods=["GET", "POST"])
def delete_warning_log(log_id):
    if "admin_id" not in session:
        return ({"error": "Unauthorized"}, 401) if request.method == "POST" else redirect("/")
    if request.method == "POST" and not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    
    conn = get_db_connection()
    log = conn.execute("SELECT student_name, exam_name FROM warning_logs WHERE id=?", (log_id,)).fetchone()
    conn.execute("DELETE FROM warning_logs WHERE id=?", (log_id,))
    if log:
        log_action("Admin", session.get("username", "admin"), f"Deleted warning log ID {log_id} for {log['student_name']} in {log['exam_name']}", conn=conn)
    conn.commit()
    conn.close()
    
    if request.method == "POST" or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return {"success": True, "message": "Warning log entry deleted."}
    return redirect("/admin/warning_logs")


@admin_dashboard_bp.route("/admin/delete_all_warning_logs", methods=["GET", "POST"])
def delete_all_warning_logs():
    if "admin_id" not in session:
        return ({"error": "Unauthorized"}, 401) if request.method == "POST" else redirect("/")
    if request.method == "POST" and not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    
    conn = get_db_connection()
    conn.execute("DELETE FROM warning_logs")
    log_action("Admin", session.get("username", "admin"), "Cleared all warning logs", conn=conn)
    conn.commit()
    conn.close()
    
    if request.method == "POST" or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return {"success": True, "message": "All warning logs cleared."}
    return redirect("/admin/warning_logs")


@admin_dashboard_bp.route("/admin/delete_student_warning_logs/<string:student_name>", methods=["GET", "POST"])
def delete_student_warning_logs(student_name):
    if "admin_id" not in session:
        return ({"error": "Unauthorized"}, 401) if request.method == "POST" else redirect("/")
    if request.method == "POST" and not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    
    conn = get_db_connection()
    conn.execute("DELETE FROM warning_logs WHERE student_name=?", (student_name,))
    log_action("Admin", session.get("username", "admin"), f"Deleted all warnings for student '{student_name}'", conn=conn)
    conn.commit()
    conn.close()
    
    if request.method == "POST" or request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return {"success": True, "message": f"Cleared all warning logs for {student_name}."}
    return redirect("/admin/warning_logs")
