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
    exams = conn.execute("SELECT * FROM exams").fetchall()
    
    # Common Entrance exams for dashboard
    ce_exams = conn.execute("""
        SELECT e.*, 
               (SELECT COUNT(*) FROM ce_attempts WHERE exam_id = e.id) as attempts_count,
               (SELECT COUNT(*) FROM ce_attempts WHERE exam_id = e.id AND status = 'approved') as approved_count
        FROM ce_exams e 
        ORDER BY id DESC
    """).fetchall()
    
    # Paginated Students (10 latest created/modified)
    search_query = request.args.get('search', '').strip()
    try:
        page_students = max(1, int(request.args.get('page_students', 1)))
    except (ValueError, TypeError):
        page_students = 1
    per_page_students = 10

    if search_query:
        total_students_res = conn.execute(
            "SELECT COUNT(*) as count FROM students WHERE (username LIKE ? OR class LIKE ? OR full_name LIKE ?) AND status='approved'", 
            (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%')
        ).fetchone()
        total_students_count = total_students_res["count"] if total_students_res else 0
        total_student_pages = max(1, math.ceil(total_students_count / per_page_students))
        page_students = max(1, min(page_students, total_student_pages))
        offset_students = (page_students - 1) * per_page_students
        students = conn.execute(
            "SELECT * FROM students WHERE (username LIKE ? OR class LIKE ? OR full_name LIKE ?) AND status='approved' ORDER BY id DESC LIMIT ? OFFSET ?", 
            (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', per_page_students, offset_students)
        ).fetchall()
    else:
        total_students_res = conn.execute("SELECT COUNT(*) as count FROM students WHERE status='approved'").fetchone()
        total_students_count = total_students_res["count"] if total_students_res else 0
        total_student_pages = max(1, math.ceil(total_students_count / per_page_students))
        page_students = max(1, min(page_students, total_student_pages))
        offset_students = (page_students - 1) * per_page_students
        students = conn.execute(
            "SELECT * FROM students WHERE status='approved' ORDER BY id DESC LIMIT ? OFFSET ?",
            (per_page_students, offset_students)
        ).fetchall()

    # Paginated Teachers (10 latest created/modified)
    teacher_search = request.args.get('teacher_search', '').strip()
    try:
        page_teachers = max(1, int(request.args.get('page_teachers', 1)))
    except (ValueError, TypeError):
        page_teachers = 1
    per_page_teachers = 10

    if teacher_search:
        total_teachers_res = conn.execute(
            "SELECT COUNT(*) as count FROM teachers WHERE username LIKE ? OR class LIKE ?",
            (f'%{teacher_search}%', f'%{teacher_search}%')
        ).fetchone()
        total_teachers_count = total_teachers_res["count"] if total_teachers_res else 0
        total_teacher_pages = max(1, math.ceil(total_teachers_count / per_page_teachers))
        page_teachers = max(1, min(page_teachers, total_teacher_pages))
        offset_teachers = (page_teachers - 1) * per_page_teachers
        teachers = conn.execute(
            "SELECT * FROM teachers WHERE username LIKE ? OR class LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?",
            (f'%{teacher_search}%', f'%{teacher_search}%', per_page_teachers, offset_teachers)
        ).fetchall()
    else:
        total_teachers_res = conn.execute("SELECT COUNT(*) as count FROM teachers").fetchone()
        total_teachers_count = total_teachers_res["count"] if total_teachers_res else 0
        total_teacher_pages = max(1, math.ceil(total_teachers_count / per_page_teachers))
        page_teachers = max(1, min(page_teachers, total_teacher_pages))
        offset_teachers = (page_teachers - 1) * per_page_teachers
        teachers = conn.execute(
            "SELECT * FROM teachers ORDER BY id DESC LIMIT ? OFFSET ?",
            (per_page_teachers, offset_teachers)
        ).fetchall()
    
    result = conn.execute("SELECT COUNT(*) as count FROM pending_registrations WHERE status='pending'").fetchone()
    pending_count = result["count"] if result else 0
    
    conn.close()
    
    return render_template("admin.html", 
                         exams=exams, 
                         ce_exams=ce_exams,
                         students=students,
                         teachers=teachers, 
                         username=session["username"],
                         search_query=search_query,
                         teacher_search=teacher_search,
                         pending_count=pending_count,
                         total_students_count=total_students_count,
                         total_teachers_count=total_teachers_count,
                         current_student_page=page_students,
                         total_student_pages=total_student_pages,
                         current_teacher_page=page_teachers,
                         total_teacher_pages=total_teacher_pages)


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


@admin_dashboard_bp.route("/admin/delete_warning_log/<int:log_id>")
def delete_warning_log(log_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    log = conn.execute("SELECT student_name, exam_name FROM warning_logs WHERE id=?", (log_id,)).fetchone()
    conn.execute("DELETE FROM warning_logs WHERE id=?", (log_id,))
    if log:
        log_action("Admin", session.get("username", "admin"), f"Deleted warning log ID {log_id} for {log['student_name']} in {log['exam_name']}", conn=conn)
    conn.commit()
    conn.close()
    
    return redirect("/admin/warning_logs")


@admin_dashboard_bp.route("/admin/delete_all_warning_logs")
def delete_all_warning_logs():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    conn.execute("DELETE FROM warning_logs")
    log_action("Admin", session.get("username", "admin"), "Cleared all warning logs", conn=conn)
    conn.commit()
    conn.close()
    
    return redirect("/admin/warning_logs")


@admin_dashboard_bp.route("/admin/delete_student_warning_logs/<string:student_name>")
def delete_student_warning_logs(student_name):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    conn.execute("DELETE FROM warning_logs WHERE student_name=?", (student_name,))
    log_action("Admin", session.get("username", "admin"), f"Deleted all warnings for student '{student_name}'", conn=conn)
    conn.commit()
    conn.close()
    
    return redirect("/admin/warning_logs")
