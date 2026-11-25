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
admin_users_bp = Blueprint('admin_users', __name__)

@admin_users_bp.route("/admin/pending_students")
def pending_students():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    pending = conn.execute("SELECT * FROM pending_registrations WHERE status='pending' ORDER BY registered_at DESC").fetchall()
    conn.close()
    return render_template("pending_students.html", pending=pending)


@admin_users_bp.route("/admin/approve_student/<int:student_id>")
def approve_student(student_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    pending = conn.execute("SELECT * FROM pending_registrations WHERE id=?", (student_id,)).fetchone()
    
    if pending:
        pending_dict = dict(pending)
        specialisation = pending_dict.get('specialisation', 'General')
        
        pwd = pending_dict['password']
        if pwd and not (pwd.startswith("scrypt:") or pwd.startswith("pbkdf2:")):
            pwd = generate_password_hash(pwd)
            
        try:
            conn.execute("""
                INSERT INTO students (username, password, full_name, email, class, specialisation, photo, status, approved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
            """, (pending_dict['username'], pwd, pending_dict['full_name'], 
                  pending_dict['email'], pending_dict['class'], specialisation, pending_dict['photo']))
        except sqlite3.OperationalError:
            # Fallback without specialisation
            conn.execute("""
                INSERT INTO students (username, password, full_name, email, class, photo, status, approved_at)
                VALUES (?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
            """, (pending_dict['username'], pwd, pending_dict['full_name'], 
                  pending_dict['email'], pending_dict['class'], pending_dict['photo']))
        
        conn.execute("DELETE FROM pending_registrations WHERE id=?", (student_id,))
        
        log_action("Admin", session["username"], f"Approved student '{pending_dict['username']}'", conn=conn)
        conn.commit()
    
    conn.close()
    return redirect("/admin/pending_students")


@admin_users_bp.route("/admin/reject_student/<int:student_id>")
def reject_student(student_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    pending = conn.execute("SELECT * FROM pending_registrations WHERE id=?", (student_id,)).fetchone()
    
    if pending:
        if pending['photo'] and pending['photo'] != 'default.png':
            photo_path = get_upload_path(pending['photo'])
            if os.path.exists(photo_path):
                try:
                    os.remove(photo_path)
                except OSError:
                    pass
        
        conn.execute("DELETE FROM pending_registrations WHERE id=?", (student_id,))
        
        log_action("Admin", session["username"], f"Rejected student '{pending['username']}'", conn=conn)
        conn.commit()
    
    conn.close()
    return redirect("/admin/pending_students")


@admin_users_bp.route("/admin/edit_teacher/<int:teacher_id>", methods=["GET", "POST"])
def edit_teacher(teacher_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    try:
        teacher = conn.execute("SELECT * FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        
        if not teacher:
            return redirect("/admin")
        
        # Convert teacher to dict for template
        teacher_dict = dict(teacher)
        if not teacher_dict.get('photo'):
            teacher_dict['photo'] = 'default.png'
        
        # Get existing class assignments and convert to list of dicts
        teacher_assignments = []
        try:
            assignments_raw = conn.execute("""
                SELECT DISTINCT class_name, specialisation 
                FROM teacher_class_assignments 
                WHERE teacher_id=?
                ORDER BY class_name
            """, (teacher_id,)).fetchall()
            
            # Convert Row objects to dictionaries
            for assignment in assignments_raw:
                teacher_assignments.append({
                    "class_name": assignment["class_name"],
                    "specialisation": assignment["specialisation"]
                })
        except sqlite3.OperationalError:
            # Fallback to single class from teachers table
            if teacher_dict.get("class"):
                teacher_assignments = [{"class_name": teacher_dict["class"], "specialisation": "General"}]
        
        if request.method == "POST":
            username = request.form["username"]
            password = request.form.get("password", "")
            class_teacher_of = request.form.get("class_teacher_of", "")
            
            # Get multiple class assignments
            class_names = request.form.getlist("class_name")
            specialisations = request.form.getlist("specialisation")
            
            file = request.files.get('photo')
            
            # Update password if provided
            if password:
                conn.execute("UPDATE teachers SET password=? WHERE id=?", (generate_password_hash(password), teacher_id))
            
            # Update class_teacher_of
            try:
                conn.execute("UPDATE teachers SET class_teacher_of=? WHERE id=?", (class_teacher_of, teacher_id))
            except sqlite3.OperationalError:
                pass
            
            # Handle photo upload
            if file and file.filename != "":
                if teacher_dict.get('photo') and teacher_dict['photo'] != "default.png":
                    old_path = get_upload_path(teacher_dict['photo'])
                    if os.path.exists(old_path):
                        try:
                            os.remove(old_path)
                        except Exception:
                            pass
                
                safe_user = secure_filename(username) or f"user_{teacher_id}"
                filename = f"teacher_{safe_user}_{int(datetime.now().timestamp())}.jpg"
                save_path = get_upload_path(filename)
                success = compress_image(file, save_path, 50)
                if success:
                    conn.execute("UPDATE teachers SET photo=? WHERE id=?", (filename, teacher_id))
            
            # Update class assignments
            try:
                conn.execute("DELETE FROM teacher_class_assignments WHERE teacher_id=?", (teacher_id,))
                seen_assignments = set()
                for class_name, specialisation in zip(class_names, specialisations):
                    if class_name and specialisation:
                        assignment_key = (class_name.strip(), specialisation.strip())
                        if assignment_key not in seen_assignments:
                            conn.execute("""
                                INSERT INTO teacher_class_assignments (teacher_id, class_name, specialisation)
                                VALUES (?, ?, ?)
                            """, (teacher_id, assignment_key[0], assignment_key[1]))
                            seen_assignments.add(assignment_key)
                
                if class_names:
                    conn.execute("UPDATE teachers SET class=? WHERE id=?", (class_names[0], teacher_id))
            except sqlite3.OperationalError as e:
                print(f"Error updating assignments: {e}")
                if class_names:
                    conn.execute("UPDATE teachers SET class=? WHERE id=?", (class_names[0], teacher_id))
            
            log_action("Admin", session["username"], f"Updated teacher '{teacher_dict['username']}'", conn=conn)
            conn.commit()
            return redirect("/admin")
        
        return render_template("edit_teacher.html", 
                               teacher=teacher_dict, 
                               teacher_assignments=teacher_assignments)
    finally:
        conn.close()


@admin_users_bp.route("/admin/edit_student/<int:student_id>", methods=["GET", "POST"])
def edit_student(student_id):
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    try:
        student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
        
        if not student:
            return redirect("/admin")
        
        # Convert to dict for template
        student_dict = dict(student)
        if not student_dict.get('photo'):
            student_dict['photo'] = 'default.png'
        
        # Ensure specialisation has a default value
        if 'specialisation' not in student_dict or student_dict['specialisation'] is None:
            student_dict['specialisation'] = 'General'
        
        if request.method == "POST":
            username = request.form["username"]
            password = request.form.get("password", "")
            class_name = request.form["class"]
            full_name = request.form.get("full_name", "")
            email = request.form.get("email", "")
            specialisation = request.form.get("specialisation", "General")
            
            file = request.files.get('photo')
            
            # Update password if provided
            if password:
                conn.execute("UPDATE students SET password=? WHERE id=?", (generate_password_hash(password), student_id))
            
            # Update student details
            try:
                conn.execute("""
                    UPDATE students 
                    SET full_name=?, email=?, class=?, specialisation=? 
                    WHERE id=?
                """, (full_name, email, class_name, specialisation, student_id))
            except sqlite3.OperationalError:
                conn.execute("UPDATE students SET class=? WHERE id=?", (class_name, student_id))
            
            # Handle photo upload
            if file and file.filename != "":
                if student_dict.get('photo') and student_dict['photo'] != "default.png":
                    old_path = get_upload_path(student_dict['photo'])
                    if os.path.exists(old_path):
                        try:
                            os.remove(old_path)
                        except Exception:
                            pass
                
                safe_user = secure_filename(username) or f"user_{student_id}"
                filename = f"student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
                save_path = get_upload_path(filename)
                success = compress_image(file, save_path, 50)
                if success:
                    conn.execute("UPDATE students SET photo=? WHERE id=?", (filename, student_id))
            
            log_action("Admin", session.get("username", "admin"), f"Updated student '{username}'", conn=conn)
            conn.commit()
            return redirect("/admin")
        
        return render_template("edit_student.html", student=student_dict)
    finally:
        conn.close()


@admin_users_bp.route("/admin/add_student", methods=["GET","POST"])
def add_student():
    if "admin_id" not in session:
        return redirect("/")
    if request.method == "POST":
        full_name = request.form.get("full_name", "")
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])
        class_name = request.form["class"]
        
        specialisation = request.form.get("specialisation", "General")
        email = request.form.get("email", "").strip()
        
        file = request.files.get('photo')
        
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM students WHERE username = ?", (username,)).fetchone()
        
        if existing:
            conn.close()
            return render_template("add_student.html", error="Username already exists!")
        
        filename = "default.png"
        if file and file.filename != "":
            safe_user = secure_filename(username) or "new_student"
            cand_name = f"student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
            save_path = get_upload_path(cand_name)
            if compress_image(file, save_path, 50):
                filename = cand_name
        
        conn.execute("""INSERT INTO students (full_name, username, password, class, specialisation, email, photo, status, approved_at) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)""",
                     (full_name, username, password, class_name, specialisation, email, filename))
        log_action("Admin", session.get("username", "admin"), f"Created student '{username}' ({class_name})", conn=conn)
        conn.commit()
        conn.close()
        return redirect("/admin")
    return render_template("add_student.html", error=None)


@admin_users_bp.route("/check_student_username")
def check_student_username():
    username = request.args.get("username")
    conn = get_db_connection()
    existing = conn.execute("SELECT id FROM students WHERE username = ?", (username,)).fetchone()
    conn.close()
    return {"exists": existing is not None}


@admin_users_bp.route("/admin/add_teacher", methods=["GET", "POST"])
def add_teacher():
    if "admin_id" not in session:
        return redirect("/")
    
    if request.method == "POST":
        username = request.form["username"]
        password = generate_password_hash(request.form["password"])
        class_teacher_of = request.form.get("class_teacher_of", "")
        
        # Get multiple class assignments from form
        # The form will send arrays like: class_name[], specialisation[]
        class_names = request.form.getlist("class_name")
        specialisations = request.form.getlist("specialisation")
        
        email = request.form.get("email", "").strip()
        file = request.files.get('photo')
        
        conn = get_db_connection()
        
        existing = conn.execute("SELECT id FROM teachers WHERE username = ?", (username,)).fetchone()
        if existing:
            conn.close()
            return render_template("add_teacher.html", error="Username already exists!")
        
        filename = "default.png"
        if file and file.filename != "":
            safe_user = secure_filename(username) or "new_teacher"
            cand_name = f"teacher_{safe_user}_{int(datetime.now().timestamp())}.jpg"
            save_path = get_upload_path(cand_name)
            if compress_image(file, save_path, 50):
                filename = cand_name
        
        # Insert teacher with primary class (for backward compatibility)
        primary_class = class_names[0] if class_names else ""
        primary_specialisation = specialisations[0] if specialisations else "General"
        
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO teachers (username, password, class, photo, class_teacher_of, email) 
                VALUES (?, ?, ?, ?, ?, ?)
            """, (username, password, primary_class, filename, class_teacher_of, email))
        except sqlite3.OperationalError:
            cursor.execute("""
                INSERT INTO teachers (username, password, class, photo, class_teacher_of) 
                VALUES (?, ?, ?, ?, ?)
            """, (username, password, primary_class, filename, class_teacher_of))
        
        teacher_id = cursor.lastrowid
        
        # 🚨 NEW: Create a set to track unique assignments
        seen_assignments = set()
        
        # Insert all class assignments
        for class_name, specialisation in zip(class_names, specialisations):
            if class_name and specialisation:
                # Clean the strings and create a unique key
                assignment_key = (class_name.strip(), specialisation.strip())
                
                # Only insert if we haven't seen this exact pair yet
                if assignment_key not in seen_assignments:
                    conn.execute("""
                        INSERT INTO teacher_class_assignments (teacher_id, class_name, specialisation)
                        VALUES (?, ?, ?)
                    """, (teacher_id, assignment_key[0], assignment_key[1]))
                    seen_assignments.add(assignment_key)
        
        log_action("Admin", session.get("username", "admin"), f"Created teacher '{username}'", conn=conn)
        conn.commit()
        conn.close()
        return redirect("/admin")
    
    return render_template("add_teacher.html", error=None)


@admin_users_bp.route("/check_teacher_username")
def check_teacher_username():
    username = request.args.get("username")
    conn = get_db_connection()
    existing = conn.execute("SELECT id FROM teachers WHERE username = ?", (username,)).fetchone()
    conn.close()
    return {"exists": existing is not None}


@admin_users_bp.route("/check_admin_username")
def check_admin_username():
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    username = request.args.get("username", "").strip()
    if not username:
        return {"exists": False}
    conn = get_db_connection()
    existing = conn.execute("SELECT id FROM admin WHERE LOWER(username) = LOWER(?)", (username,)).fetchone()
    conn.close()
    return {"exists": existing is not None}


def _fetch_existing_admins(conn):
    try:
        return conn.execute("SELECT id, username FROM admin ORDER BY id ASC").fetchall()
    except sqlite3.OperationalError:
        return []


@admin_users_bp.route("/admin/add_admin", methods=["GET", "POST"])
def add_admin():
    if "admin_id" not in session:
        return redirect("/")

    conn = get_db_connection()
    current_admin_id = session.get("admin_id")

    if request.method == "POST":
        if not validate_csrf():
            admins = _fetch_existing_admins(conn)
            conn.close()
            return render_template("add_admin.html", error="Security session expired. Please refresh and try again.", success=None, existing_admins=admins, current_admin_id=current_admin_id)
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not username or len(username) < 3:
            admins = _fetch_existing_admins(conn)
            conn.close()
            return render_template("add_admin.html", error="Username must be at least 3 characters.", success=None, existing_admins=admins, current_admin_id=current_admin_id)
        if not password or len(password) < 6:
            admins = _fetch_existing_admins(conn)
            conn.close()
            return render_template("add_admin.html", error="Password must be at least 6 characters.", success=None, existing_admins=admins, current_admin_id=current_admin_id)
        if password != confirm_password:
            admins = _fetch_existing_admins(conn)
            conn.close()
            return render_template("add_admin.html", error="Passwords do not match.", success=None, existing_admins=admins, current_admin_id=current_admin_id)

        existing = conn.execute("SELECT id FROM admin WHERE LOWER(username) = LOWER(?)", (username,)).fetchone()
        if existing:
            admins = _fetch_existing_admins(conn)
            conn.close()
            return render_template("add_admin.html", error=f"Administrator username '{username}' already exists.", success=None, existing_admins=admins, current_admin_id=current_admin_id)

        hashed_pw = generate_password_hash(password)
        conn.execute("INSERT INTO admin (username, password) VALUES (?, ?)", (username, hashed_pw))
        log_action("Admin", session.get("username", "admin"), f"Created new admin account '{username}'", conn=conn)
        conn.commit()
        admins = _fetch_existing_admins(conn)
        conn.close()
        return render_template(
            "add_admin.html",
            error=None,
            success=f"Administrator '{username}' created successfully.",
            existing_admins=admins,
            current_admin_id=current_admin_id,
        )

    admins = _fetch_existing_admins(conn)
    conn.close()
    return render_template("add_admin.html", error=None, success=None, existing_admins=admins, current_admin_id=current_admin_id)


@admin_users_bp.route("/admin/delete_admin/<int:target_id>", methods=["POST"])
def delete_admin(target_id):
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    if not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    if target_id == session.get("admin_id"):
        return {"error": "You cannot remove your own currently active administrator account."}, 400
    conn = get_db_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM admin").fetchone()[0]
        if total <= 1:
            return {"error": "At least one administrator account must remain active."}, 400
        row = conn.execute("SELECT id, username FROM admin WHERE id=?", (target_id,)).fetchone()
        if not row:
            return {"error": "Administrator not found."}, 404
        conn.execute("DELETE FROM admin WHERE id=?", (target_id,))
        log_action("Admin", session.get("username", "admin"), f"Removed administrator account '{row['username']}'", conn=conn)
        conn.commit()
        return {"success": True, "message": f"Administrator '{row['username']}' removed."}
    finally:
        conn.close()


@admin_users_bp.route("/admin/delete_teacher/<int:teacher_id>", methods=["POST"])
def delete_teacher(teacher_id):
    if "admin_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    if not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    conn = get_db_connection()
    try:
        teacher = conn.execute("SELECT username, photo FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        if not teacher:
            return {"error": "Teacher not found"}, 404
        
        conn.execute("BEGIN TRANSACTION")
        # Unlink any exams created by this teacher
        conn.execute("UPDATE exams SET teacher_id=NULL WHERE teacher_id=?", (teacher_id,))
        # Delete class assignments
        conn.execute("DELETE FROM teacher_class_assignments WHERE teacher_id=?", (teacher_id,))
        # Delete teacher
        conn.execute("DELETE FROM teachers WHERE id=?", (teacher_id,))
        log_action("Admin", session["username"], f"Deleted teacher '{teacher['username']}'", conn=conn)
        conn.commit()
        
        # Clean up photo
        if teacher["photo"] and teacher["photo"] != "default.png":
            photo_path = get_upload_path(teacher["photo"])
            if os.path.exists(photo_path):
                try:
                    os.remove(photo_path)
                except Exception:
                    pass
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()

    if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"success": True, "message": f"Teacher '{teacher['username']}' deleted successfully"}
    return redirect("/admin")


@admin_users_bp.route("/admin/delete_student/<int:student_id>", methods=["POST"])
def delete_student(student_id):
    if "admin_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    if not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    conn = get_db_connection()
    try:
        student = conn.execute("SELECT username, photo FROM students WHERE id=?", (student_id,)).fetchone()
        if not student:
            return {"error": "Student not found"}, 404
        
        conn.execute("BEGIN TRANSACTION")
        # 1. Delete question responses FIRST to respect FK attempt_id -> scores.id and student_id -> students.id
        conn.execute("DELETE FROM exam_question_responses WHERE student_id=?", (student_id,))
        # 2. Delete warning logs
        conn.execute("DELETE FROM warning_logs WHERE student_id=?", (student_id,))
        # 3. Delete scores
        conn.execute("DELETE FROM scores WHERE student_id=?", (student_id,))
        # 4. Delete student (never touch ce_students — independent ID sequence!)
        conn.execute("DELETE FROM students WHERE id=?", (student_id,))
        log_action("Admin", session["username"], f"Deleted student '{student['username']}'", conn=conn)
        conn.commit()
        
        # Clean up photo
        if student["photo"] and student["photo"] != "default.png":
            photo_path = get_upload_path(student["photo"])
            if os.path.exists(photo_path):
                try:
                    os.remove(photo_path)
                except Exception:
                    pass
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()

    if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"success": True, "message": f"Student '{student['username']}' deleted successfully"}
    return redirect("/admin")


