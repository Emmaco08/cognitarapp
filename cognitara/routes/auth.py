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
auth_bp = Blueprint('auth', __name__)

@auth_bp.route("/login", methods=["GET","POST"])
@limiter.limit(
    os.environ.get("COGNITARA_RATELIMIT_IP", "300 per minute"),
    key_func=get_remote_address,
    methods=["POST"],
    deduct_when=lambda res: res.status_code != 302
)
@limiter.limit(
    os.environ.get("COGNITARA_RATELIMIT_ACCOUNT", "5 per minute"),
    key_func=lambda: f"{get_remote_address()}:{request.form.get('username', '').strip().lower()}",
    methods=["POST"],
    deduct_when=lambda res: res.status_code != 302
)
def login():
    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]
        role = request.form["role"]
        
        conn = get_db_connection()
        
        if role == "Admin":
            user = conn.execute("SELECT * FROM admin WHERE username=?", (username,)).fetchone()
            if user and verify_and_upgrade_password(conn, "admin", "id", user["id"], user["password"], password):
                session.clear()
                session["admin_id"] = user["id"]
                session["username"] = user["username"]
                session["role"] = "Admin"
                conn.close()
                return redirect("/admin")
            else:
                conn.close()
                return render_template("login.html", error="Invalid Admin credentials!")
                
        elif role == "Teacher":
            user = conn.execute("SELECT * FROM teachers WHERE username=?", (username,)).fetchone()
            if user and verify_and_upgrade_password(conn, "teachers", "id", user["id"], user["password"], password):
                session.clear()
                session["teacher_id"] = user["id"]
                session["username"] = user["username"]
                session["class"] = user["class"]
                session["photo"] = user["photo"]
                session["role"] = "Teacher"
                conn.close()
                return redirect("/teacher")
            else:
                conn.close()
                return render_template("login.html", error="Invalid Teacher credentials!")
                
        else:  # Student
            user = conn.execute("SELECT * FROM students WHERE username=?", (username,)).fetchone()
            
            if user and verify_and_upgrade_password(conn, "students", "id", user["id"], user["password"], password):
                try:
                    student_status = user["status"]
                except (KeyError, IndexError):
                    student_status = "approved"
                
                if student_status == "approved":
                    session.clear()
                    session["student_id"] = user["id"]
                    session["username"] = user["username"]
                    session["full_name"] = user["full_name"] if "full_name" in user.keys() and user["full_name"] else user["username"]
                    session["class"] = user["class"]
                    
                    # 🚨 NEW: Capture the student's specialisation so their dashboard knows what to fetch
                    session["specialisation"] = user["specialisation"] if "specialisation" in user.keys() and user["specialisation"] else "General"
                    
                    # Get total warning count from database
                    warning_count = conn.execute(
                        "SELECT COUNT(*) as total FROM warning_logs WHERE student_id=?", 
                        (user["id"],)
                    ).fetchone()["total"]
                    session["warning_count"] = warning_count
                    
                    session["photo"] = user["photo"]
                    session["role"] = "Student"
                    conn.close()
                    return redirect("/dashboard")
                elif student_status == "pending":
                    conn.close()
                    return render_template("login.html", error="Your account is pending admin approval. Please wait.")
                else:
                    conn.close()
                    return render_template("login.html", error="Your account has been rejected. Contact admin.")
            else:
                pending = conn.execute("SELECT * FROM pending_registrations WHERE username=?", (username,)).fetchone()
                if pending and verify_and_upgrade_password(conn, "pending_registrations", "id", pending["id"], pending["password"], password):
                    conn.close()
                    return render_template("login.html", error="Your registration is pending admin approval. Please wait.")
                else:
                    conn.close()
                    return render_template("login.html", error="Invalid Student credentials!")
    
    return render_template("login.html")


@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        full_name = request.form["full_name"]
        username = request.form["username"]
        email = request.form["email"]
        password = request.form["password"]
        class_name = request.form["class"]
        specialisation = request.form.get("specialisation", "General")  # NEW
        file = request.files.get('photo')
        
        conn = get_db_connection()
        
        # Check if username already exists in students or pending
        existing = conn.execute("SELECT id FROM students WHERE username=?", (username,)).fetchone()
        if existing:
            conn.close()
            return render_template("student_register.html", error="Username already exists!")
        
        existing_pending = conn.execute("SELECT id FROM pending_registrations WHERE username=?", (username,)).fetchone()
        if existing_pending:
            conn.close()
            return render_template("student_register.html", error="Username already pending approval!")
        
        safe_user = secure_filename(username) or f"user_{int(datetime.now().timestamp())}"
        filename = f"student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
        save_path = get_upload_path(filename)
        success = compress_image(file, save_path, 50)
        if not success:
            conn.close()
            return render_template("student_register.html", error="Photo could not be saved. Please try another image.")
        
        hashed_password = generate_password_hash(password)
        
        # Updated INSERT to include specialisation
        try:
            conn.execute("""
                INSERT INTO pending_registrations (username, password, full_name, email, class, specialisation, photo, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            """, (username, hashed_password, full_name, email, class_name, specialisation, filename))
        except sqlite3.OperationalError:
            # Fallback if specialisation column doesn't exist
            conn.execute("""
                INSERT INTO pending_registrations (username, password, full_name, email, class, photo, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
            """, (username, hashed_password, full_name, email, class_name, filename))
        
        conn.commit()
        conn.close()
        
        return render_template("registration_pending.html", username=username)
    
    return render_template("student_register.html")


@auth_bp.route("/ce_login", methods=["GET", "POST"])
@limiter.limit(
    os.environ.get("COGNITARA_RATELIMIT_IP", "15 per minute"),
    key_func=get_remote_address,
    methods=["POST"],
    deduct_when=lambda res: res.status_code != 302
)
@limiter.limit(
    os.environ.get("COGNITARA_RATELIMIT_ACCOUNT", "5 per minute"),
    key_func=lambda: f"{get_remote_address()}:{request.form.get('username', '').strip().lower()}",
    methods=["POST"],
    deduct_when=lambda res: res.status_code != 302
)
def ce_login_page():
    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]
        
        conn = get_db_connection()
        student = conn.execute("""
            SELECT s.*, e.id as exam_id, e.name as exam_name, e.duration, e.passing_score, e.total_questions_to_show, e.target_class
            FROM ce_students s
            JOIN ce_exams e ON s.exam_id = e.id
            WHERE s.username=?
        """, (username,)).fetchone()
        
        if student and verify_and_upgrade_password(conn, "ce_students", "id", student["id"], student["password"], password):
            session.clear()
            session["ce_student_id"] = student["id"]
            session["ce_exam_id"] = student["exam_id"]
            session["ce_student_name"] = student["full_name"]
            session["ce_target_class"] = student["target_class"]
            conn.close()
            return redirect("/ce_dashboard")
        else:
            conn.close()
            return render_template("ce_login.html", error="Invalid credentials!")
    
    return render_template("ce_login.html")


