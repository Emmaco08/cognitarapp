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
admin_exams_bp = Blueprint('admin_exams', __name__)

@admin_exams_bp.route("/admin/exam/<int:exam_id>/settings", methods=["POST"])
def update_exam_settings(exam_id):
    """Update regular exam settings"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    name = request.form.get("name")
    target_class = request.form.get("target_class")
    duration = max(1, int(request.form.get("duration", 60)))
    specialisation_tag = request.form.get("specialisation_tag", "General")
    subject_tag = request.form.get("subject_tag", "General")
    active = 1 if request.form.get("active") else 0
    
    conn.execute("""
        UPDATE exams SET 
        name=?, class=?, duration=?, specialisation_tag=?, subject_tag=?, active=?
        WHERE id=?
    """, (name, target_class, duration, specialisation_tag, subject_tag, active, exam_id))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam settings saved successfully"}


@admin_exams_bp.route("/admin/exam_attempts")
def exam_attempts():
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    search_student = request.args.get('search_student', '')
    search_exam = request.args.get('search_exam', '')
    
    query = """
        SELECT s.username, e.name as exam_name, sc.score, sc.total, 
               sc.start_time, sc.end_time, sc.status
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        JOIN exams e ON sc.exam_id = e.id
        WHERE 1=1
    """
    params = []
    
    if search_student:
        query += " AND s.username LIKE ?"
        params.append(f'%{search_student}%')
    
    if search_exam:
        query += " AND e.name LIKE ?"
        params.append(f'%{search_exam}%')
    
    query += " ORDER BY sc.start_time DESC"
    
    attempts = conn.execute(query, params).fetchall()
    exams_list = conn.execute("SELECT DISTINCT name FROM exams ORDER BY name").fetchall()
    
    conn.close()
    
    return render_template("exam_attempts.html", 
                         attempts=attempts, 
                         search_student=search_student,
                         search_exam=search_exam,
                         exams_list=exams_list)


@admin_exams_bp.route("/admin/toggle_exam/<int:exam_id>")
def toggle_exam(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    conn = get_db_connection()
    exam = conn.execute("SELECT name, active FROM exams WHERE id=?", (exam_id,)).fetchone()
    if exam:
        new_status = 0 if exam["active"] == 1 else 1
        conn.execute("UPDATE exams SET active=? WHERE id=?", (new_status, exam_id))
        action_verb = "Started" if new_status == 1 else "Stopped"
        log_action("Admin", session.get("username", "admin"), f"{action_verb} exam '{exam['name']}' (ID: {exam_id})", conn=conn)
        conn.commit()
    conn.close()
    return redirect("/admin")


@admin_exams_bp.route("/admin/add_exam", methods=["GET","POST"])
def add_exam():
    if "admin_id" not in session:
        return redirect("/")
    # Administrators oversee examinations; subject teachers author and edit examinations.
    if request.method == "POST":
        return jsonify({
            "ok": False,
            "error": "forbidden",
            "message": "Administrators cannot create examinations. Subject teachers create examinations.",
        }), 403
    return redirect("/admin/exams-management")


@admin_exams_bp.route("/admin/add_question/<int:exam_id>", methods=["GET","POST"])
def add_question(exam_id):
    if "teacher_id" not in session:
        if "admin_id" in session:
            if request.method == "POST":
                return jsonify({
                    "ok": False,
                    "error": "forbidden",
                    "message": "Administrators cannot add or modify examination questions.",
                }), 403
            return redirect(f"/admin/exam/{exam_id}/preview")
        return redirect("/")
    if request.method == "POST":
        q = request.form["question"]
        op1 = request.form["option1"]
        op2 = request.form["option2"]
        op3 = request.form["option3"]
        op4 = request.form["option4"]
        ans = request.form["answer"]
        conn = get_db_connection()
        conn.execute("INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (exam_id, q, op1, op2, op3, op4, ans))
        conn.commit()
        conn.close()
        return redirect("/teacher")
    return redirect(f"/teacher/exam/{exam_id}/questions")


@admin_exams_bp.route("/admin/reset_exam/<int:student_id>/<int:exam_id>", methods=["GET", "POST"])
def reset_exam(student_id, exam_id):
    if "admin_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    
    conn = get_db_connection()
    try:
        exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
        exam_name = exam["name"] if exam else None

        if not exam:
            # Check if Common Entrance exam
            ce_exam = conn.execute("SELECT * FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
            if ce_exam:
                exam_name = ce_exam["name"]
                attempt = conn.execute("SELECT id FROM ce_attempts WHERE student_id=? AND exam_id=?", (student_id, exam_id)).fetchone()
                if attempt:
                    conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id=?", (attempt["id"],))
                    conn.execute("DELETE FROM ce_warning_logs WHERE student_id=? AND exam_id=?", (student_id, exam_id))
                    conn.execute("DELETE FROM ce_attempts WHERE id=?", (attempt["id"],))
                    conn.commit()
                    log_action("Admin", session["username"], f"Reset CE exam '{exam_name}' for student ID {student_id}", conn=conn)
                if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return {"success": True, "message": f"Score reset for student in {exam_name}"}
                return redirect("/admin")
            return ("Exam not found", 404) if not request.is_json else ({"error": "Exam not found"}, 404)

        # 1. Delete question responses FIRST to respect FOREIGN KEY (attempt_id -> scores.id)
        conn.execute("DELETE FROM exam_question_responses WHERE student_id=? AND exam_id=?", (student_id, exam_id))
        
        # 2. Delete warning logs for this student and exam
        conn.execute("DELETE FROM warning_logs WHERE student_id=? AND exam_id=?", (student_id, exam_id))
        
        # 3. Delete score record
        conn.execute("DELETE FROM scores WHERE student_id=? AND exam_id=?", (student_id, exam_id))
        
        log_action("Admin", session["username"], f"Reset scores for exam '{exam_name}' for student ID {student_id}", conn=conn)
        conn.commit()
        
        if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return {"success": True, "message": f"Score reset for student in {exam_name}"}
        return redirect("/admin")
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_exams_bp.route("/admin/delete_exam/<int:exam_id>", methods=["POST"])
def delete_exam(exam_id):
    if "admin_id" not in session:
        return redirect("/") if not request.is_json else ({"error": "Unauthorized"}, 401)
    if not validate_csrf():
        return {"error": "Invalid CSRF token"}, 403
    conn = get_db_connection()
    try:
        exam = conn.execute("SELECT name FROM exams WHERE id=?", (exam_id,)).fetchone()
        if not exam:
            return {"error": "Exam not found"}, 404
        
        conn.execute("BEGIN TRANSACTION")
        # 1. Delete student responses first
        conn.execute("DELETE FROM exam_question_responses WHERE exam_id=?", (exam_id,))
        # 2. Delete warning logs
        conn.execute("DELETE FROM warning_logs WHERE exam_id=?", (exam_id,))
        # 3. Delete notes & versions
        try:
            conn.execute("DELETE FROM exam_deactivation_notes WHERE exam_id=?", (exam_id,))
        except Exception:
            pass
        try:
            conn.execute("DELETE FROM exam_versions WHERE exam_id=?", (exam_id,))
        except Exception:
            pass
        # 4. Delete scores
        conn.execute("DELETE FROM scores WHERE exam_id=?", (exam_id,))
        # 5. Delete questions and clean image files
        questions = conn.execute("SELECT image FROM questions WHERE exam_id=?", (exam_id,)).fetchall()
        for q in questions:
            if q["image"] and q["image"] != "default.png":
                img_path = get_upload_path(q["image"])
                if os.path.exists(img_path):
                    try:
                        os.remove(img_path)
                    except Exception:
                        pass
        conn.execute("DELETE FROM questions WHERE exam_id=?", (exam_id,))
        # 6. Delete sections and groups
        conn.execute("DELETE FROM exam_sections WHERE exam_id=?", (exam_id,))
        conn.execute("DELETE FROM exam_question_groups WHERE exam_id=?", (exam_id,))
        # 7. Delete exam
        conn.execute("DELETE FROM exams WHERE id=?", (exam_id,))
        log_action("Admin", session["username"], f"Deleted exam '{exam['name']}'", conn=conn)
        conn.commit()
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()

    if request.is_json or 'fetch' in request.headers.get('Sec-Fetch-Mode', '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"success": True, "message": f"Exam '{exam['name']}' deleted successfully"}
    return redirect("/admin")


@admin_exams_bp.route("/edit_exam/<int:exam_id>", methods=["GET", "POST"])
def edit_exam(exam_id):
    if "admin_id" not in session:
        return redirect("/")
    # Administrators have read-only preview access; only teachers edit exam questions.
    if request.method == "POST":
        return jsonify({
            "ok": False,
            "error": "forbidden",
            "message": "Administrators cannot edit or modify examination questions.",
        }), 403
    return redirect(f"/admin/exam/{exam_id}/preview")


@admin_exams_bp.route("/admin/exams-management")
def admin_exams_management():
    """Full power exams management page for admin"""
    if "admin_id" not in session:
        if "teacher_id" in session:
            return redirect("/teacher/exams-management")
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get ALL exams with full details
    try:
        exams = conn.execute("""
            SELECT e.*, 
                   COALESCE(NULLIF(TRIM(t.full_name), ''), t.username) as teacher_name,
                   t.username as teacher_username,
                   t.photo as teacher_photo,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id) as student_count,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'completed') as completed_count,
                   (SELECT ROUND(AVG(percentage), 1) FROM scores WHERE exam_id = e.id AND status = 'completed') as avg_score,
                   (SELECT ROUND(AVG(percentage), 1) FROM scores WHERE exam_id = e.id AND status = 'completed' AND percentage >= 50) as avg_passing_score,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'completed' AND percentage >= 50) as passed_count,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'in_progress') as in_progress_count,
                   (SELECT MAX(percentage) FROM scores WHERE exam_id = e.id AND status = 'completed') as highest_score,
                   (SELECT MIN(percentage) FROM scores WHERE exam_id = e.id AND status = 'completed' AND total > 0) as lowest_score
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            ORDER BY e.id DESC
        """).fetchall()
        teachers = conn.execute(
            "SELECT id, username, COALESCE(NULLIF(TRIM(full_name), ''), username) as display_name FROM teachers ORDER BY display_name"
        ).fetchall()
    except sqlite3.OperationalError:
        exams = conn.execute("""
            SELECT e.*, 
                   t.username as teacher_name,
                   t.username as teacher_username,
                   t.photo as teacher_photo,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id) as student_count,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'completed') as completed_count,
                   (SELECT ROUND(AVG(percentage), 1) FROM scores WHERE exam_id = e.id AND status = 'completed') as avg_score,
                   (SELECT ROUND(AVG(percentage), 1) FROM scores WHERE exam_id = e.id AND status = 'completed' AND percentage >= 50) as avg_passing_score,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'completed' AND percentage >= 50) as passed_count,
                   (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'in_progress') as in_progress_count,
                   (SELECT MAX(percentage) FROM scores WHERE exam_id = e.id AND status = 'completed') as highest_score,
                   (SELECT MIN(percentage) FROM scores WHERE exam_id = e.id AND status = 'completed' AND total > 0) as lowest_score
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            ORDER BY e.id DESC
        """).fetchall()
        teachers = conn.execute("SELECT id, username, username as display_name FROM teachers ORDER BY username").fetchall()
    
    # Get all distinct subjects
    subjects = conn.execute("SELECT DISTINCT subject_tag FROM exams WHERE subject_tag IS NOT NULL ORDER BY subject_tag").fetchall()
    
    # Get all distinct classes
    classes = conn.execute("SELECT DISTINCT class FROM exams ORDER BY class").fetchall()
    
    # Activity logs for exams
    activity_logs = conn.execute("""
        SELECT * FROM audit_logs 
        WHERE action LIKE '%exam%' OR action LIKE '%Exam%'
        ORDER BY timestamp DESC 
        LIMIT 50
    """).fetchall()
    
    # Deactivation notes
    deactivation_notes = conn.execute("""
        SELECT * FROM exam_deactivation_notes 
        ORDER BY deactivated_at DESC
    """).fetchall()
    
    # Stats
    total_exams = len(exams)
    active_exams = 0
    inactive_exams = 0
    deactivated_exams = 0
    for e in exams:
        is_deactivated = False
        if "deactivated" in e.keys():
            is_deactivated = e["deactivated"] == 1
        if is_deactivated:
            deactivated_exams += 1
        elif e["active"] == 1:
            active_exams += 1
        else:
            inactive_exams += 1
    
    # School-wide averages
    school_avg = conn.execute("""
        SELECT ROUND(AVG(percentage), 1) as avg 
        FROM scores WHERE status = 'completed' AND percentage IS NOT NULL
    """).fetchone()["avg"] or 0
    
    conn.close()
    
    return render_template("admin_exams_management.html",
                         exams=exams,
                         teachers=teachers,
                         subjects=subjects,
                         classes=classes,
                         activity_logs=activity_logs,
                         deactivation_notes=deactivation_notes,
                         total_exams=total_exams,
                         active_exams=active_exams,
                         inactive_exams=inactive_exams,
                         deactivated_exams=deactivated_exams,
                         school_avg=school_avg)


@admin_exams_bp.route("/admin/exam/<int:exam_id>/preview")
def admin_exam_preview(exam_id):
    """Admin preview exam - view all questions, sections, answers in read-only mode"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id = ?", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found", 404
    
    # Get all sections
    sections = conn.execute("""
        SELECT * FROM exam_sections WHERE exam_id = ? ORDER BY section_order
    """, (exam_id,)).fetchall()
    
    # Get ALL questions for this exam (including ungrouped and legacy unsectioned questions)
    all_questions = conn.execute("""
        SELECT q.*, es.section_name, es.section_order,
               g.group_name, g.group_type, g.group_content, g.group_image, g.instruction_text
        FROM questions q
        LEFT JOIN exam_sections es ON q.section_id = es.id
        LEFT JOIN exam_question_groups g ON q.group_id = g.id
        WHERE q.exam_id = ?
        ORDER BY COALESCE(es.section_order, 9999), q.group_id, q.display_order, q.id
    """, (exam_id,)).fetchall()
    
    # Organize by sections
    sections_with_data = []
    
    if sections:
        section_ids = set()
        for section in sections:
            section_ids.add(section["id"])
            section_dict = dict(section)
            
            # Get questions for this section
            section_questions = [q for q in all_questions if q["section_id"] == section["id"]]
            
            # Separate grouped vs ungrouped
            standalone_questions = []
            groups_dict = {}
            
            for q in section_questions:
                q_dict = dict(q)
                if q["group_id"]:
                    if q["group_id"] not in groups_dict:
                        groups_dict[q["group_id"]] = {
                            "id": q["group_id"],
                            "group_name": q["group_name"],
                            "group_type": q["group_type"],
                            "group_content": q["group_content"],
                            "group_image": q["group_image"],
                            "instruction_text": q["instruction_text"],
                            "questions": []
                        }
                    groups_dict[q["group_id"]]["questions"].append(q_dict)
                else:
                    standalone_questions.append(q_dict)
            
            if standalone_questions or groups_dict:
                sections_with_data.append({
                    "section": section_dict,
                    "standalone_questions": standalone_questions,
                    "groups": list(groups_dict.values())
                })

        # Also preserve any legacy/unsectioned questions whose section_id is NULL or unmapped
        orphan_qs = [dict(q) for q in all_questions if q["section_id"] not in section_ids]
        if orphan_qs:
            sections_with_data.append({
                "section": {"section_name": "General Questions", "id": 0},
                "standalone_questions": orphan_qs,
                "groups": []
            })
    else:
        # No sections - get all questions directly
        questions = conn.execute("""
            SELECT * FROM questions WHERE exam_id = ? ORDER BY id
        """, (exam_id,)).fetchall()
        
        if questions:
            sections_with_data.append({
                "section": {"section_name": "All Questions", "id": 0},
                "standalone_questions": [dict(q) for q in questions],
                "groups": []
            })
    
    conn.close()
    
    return render_template("admin_exam_preview.html",
                         exam=exam,
                         sections=sections_with_data)


@admin_exams_bp.route("/admin/exam/<int:exam_id>/toggle-status", methods=["POST"])
def admin_toggle_exam_status(exam_id):
    """Toggle exam Active/Inactive"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json()
    new_status = data.get('active', None)
    
    conn = get_db_connection()
    
    if new_status is not None:
        conn.execute("UPDATE exams SET active = ? WHERE id = ?", (new_status, exam_id))
    else:
        exam = conn.execute("SELECT active FROM exams WHERE id = ?", (exam_id,)).fetchone()
        new_status = 0 if exam["active"] == 1 else 1
        conn.execute("UPDATE exams SET active = ? WHERE id = ?", (new_status, exam_id))
    
    log_action("Admin", session["username"], 
               f"{'Activated' if new_status == 1 else 'Deactivated'} exam ID {exam_id}", conn=conn)
    
    conn.commit()
    conn.close()
    
    return {"success": True, "active": new_status == 1}


@admin_exams_bp.route("/admin/exam/<int:exam_id>/deactivate", methods=["POST"])
def admin_deactivate_exam(exam_id):
    """Deactivate exam - stops it AND hides from teachers"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json()
    reason = data.get('reason', 'No reason provided')
    
    conn = get_db_connection()
    
    # Ensure deactivated column exists
    try:
        conn.execute("ALTER TABLE exams ADD COLUMN deactivated INTEGER DEFAULT 0")
    except:
        pass
    
    # Deactivate + Stop the exam
    conn.execute("UPDATE exams SET deactivated = 1, active = 0 WHERE id = ?", (exam_id,))
    
    # Save deactivation note
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exam_deactivation_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER, admin_username TEXT, reason TEXT,
                deactivated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            INSERT INTO exam_deactivation_notes (exam_id, admin_username, reason, deactivated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """, (exam_id, session["username"], reason))
    except:
        pass
    
    # Auto-submit all in-progress attempts for this exam
    in_progress = conn.execute("""
        SELECT id, current_progress FROM scores WHERE exam_id = ? AND status = 'in_progress'
    """, (exam_id,)).fetchall()
    
    import json as _json
    for attempt in in_progress:
        score = 0
        total = 0
        try:
            progress = _json.loads(attempt["current_progress"]) if attempt["current_progress"] else {}
            answers = progress.get("answers", {})
            questions = conn.execute("SELECT * FROM questions WHERE exam_id = ?", (exam_id,)).fetchall()
            total = len(questions)
            for q in questions:
                user_ans = answers.get(f"q{q['id']}", "")
                if user_ans and user_ans == q["answer"]:
                    score += 1
        except:
            pass
        
        percentage = (score / total * 100) if total > 0 else 0
        conn.execute("""
            UPDATE scores SET status = 'completed', score = ?, total = ?, percentage = ?,
            end_time = CURRENT_TIMESTAMP, is_paused = 0 WHERE id = ?
        """, (score, total, percentage, attempt["id"]))
    
    log_action("Admin", session["username"], f"Deactivated exam ID {exam_id}. Reason: {reason}", conn=conn)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam deactivated and stopped successfully"}


@admin_exams_bp.route("/admin/exam/<int:exam_id>/reactivate", methods=["POST"])
def admin_reactivate_exam(exam_id):
    """Reactivate a deactivated exam"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    try:
        conn.execute("UPDATE exams SET deactivated = 0, active = 1 WHERE id = ?", (exam_id,))
    except:
        conn.execute("UPDATE exams SET active = 1 WHERE id = ?", (exam_id,))
    
    log_action("Admin", session["username"], f"Reactivated exam ID {exam_id}", conn=conn)
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Exam reactivated successfully"}


@admin_exams_bp.route("/admin/exam/<int:exam_id>/details")
def admin_exam_details(exam_id):
    """Get full exam details for slide-out panel"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    from cognitara.services.grading_service import get_active_grading_rules, GradingSchemeValidator
    conn = get_db_connection()
    
    # Exam info
    try:
        exam = conn.execute("""
            SELECT e.*,
                   COALESCE(NULLIF(TRIM(t.full_name), ''), t.username) as teacher_name,
                   t.username as teacher_username,
                   t.photo as teacher_photo,
                   t.id as teacher_id
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            WHERE e.id = ?
        """, (exam_id,)).fetchone()
    except sqlite3.OperationalError:
        exam = conn.execute("""
            SELECT e.*, t.username as teacher_name, t.username as teacher_username, t.photo as teacher_photo, t.id as teacher_id
            FROM exams e
            LEFT JOIN teachers t ON e.teacher_id = t.id
            WHERE e.id = ?
        """, (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return {"error": "Exam not found"}, 404
    
    # Student results
    students = conn.execute("""
        SELECT s.id, s.username, s.full_name, s.photo, s.class,
               sc.score, sc.total, sc.percentage, sc.grade_label, sc.grade_remark, sc.status,
               sc.start_time, sc.end_time,
               (strftime('%s', sc.end_time) - strftime('%s', sc.start_time)) as time_spent
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        WHERE sc.exam_id = ? AND sc.status = 'completed'
        ORDER BY sc.percentage DESC
    """, (exam_id,)).fetchall()

    in_progress_count = int(
        conn.execute("SELECT COUNT(*) FROM scores WHERE exam_id = ? AND status = 'in_progress'", (exam_id,)).fetchone()[0] or 0
    )
    
    # Question analysis
    try:
        questions = conn.execute("""
            SELECT q.*, es.section_name,
                   COUNT(eqr.id) as total_attempts,
                   SUM(CASE WHEN eqr.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
                   ROUND(AVG(eqr.time_spent), 1) as avg_time
            FROM questions q
            LEFT JOIN exam_sections es ON q.section_id = es.id
            LEFT JOIN exam_question_responses eqr ON q.id = eqr.question_id
            WHERE q.exam_id = ?
            GROUP BY q.id
            ORDER BY COALESCE(es.section_order, 9999), COALESCE(q.display_order, 0), q.id
        """, (exam_id,)).fetchall()
    except Exception:
        questions = conn.execute("""
            SELECT q.*, es.section_name
            FROM questions q
            LEFT JOIN exam_sections es ON q.section_id = es.id
            WHERE q.exam_id = ?
            ORDER BY COALESCE(es.section_order, 9999), COALESCE(q.display_order, 0), q.id
        """, (exam_id,)).fetchall()
    
    # Grade distribution resolved dynamically using the school's active grading scheme
    rules = get_active_grading_rules(conn, exam_id=exam_id, scheme_type="school")
    ordered_rules = sorted(rules, key=lambda r: float(r.get("min_percentage", 0)), reverse=True) if rules else [
        {"grade_label": "A", "badge_color": "#10b981"},
        {"grade_label": "B", "badge_color": "#3b82f6"},
        {"grade_label": "C", "badge_color": "#f59e0b"},
        {"grade_label": "D", "badge_color": "#f97316"},
        {"grade_label": "F", "badge_color": "#ef4444"},
    ]
    bucket_map = {r["grade_label"]: {"grade": r["grade_label"], "count": 0, "color": r.get("badge_color") or "#3b82f6"} for r in ordered_rules}
    for s in students:
        if s["percentage"] is None:
            continue
        resolved = GradingSchemeValidator.resolve_grade(s["percentage"], rules)
        lbl = resolved.get("grade_label") or "F"
        if lbl not in bucket_map:
            bucket_map[lbl] = {"grade": lbl, "count": 0, "color": resolved.get("badge_color") or "#64748b"}
        bucket_map[lbl]["count"] += 1
    grade_dist = list(bucket_map.values())
    
    # Version history (optional table on legacy databases)
    try:
        versions = conn.execute("""
            SELECT * FROM exam_versions WHERE exam_id = ? ORDER BY created_at DESC LIMIT 10
        """, (exam_id,)).fetchall()
    except Exception:
        versions = []
    
    conn.close()
    
    return {
        "ok": True,
        "success": True,
        "exam": dict(exam),
        "question_count": len(questions),
        "in_progress_count": in_progress_count,
        "students": [dict(s) for s in students],
        "questions": [dict(q) for q in questions],
        "grade_distribution": grade_dist,
        "versions": [dict(v) for v in versions] if versions else []
    }


@admin_exams_bp.route("/admin/exam/<int:exam_id>/test-run")
def admin_exam_test_run(exam_id):
    """Start a test run of the exam as admin"""
    if "admin_id" not in session:
        return redirect("/")
    
    session["test_run_exam_id"] = exam_id
    session["test_run_mode"] = True
    
    return redirect(f"/exam_start/{exam_id}")


@admin_exams_bp.route("/admin/exam/<int:exam_id>/export-json")
def admin_export_exam_json(exam_id):
    """Export exam as JSON compatible with import system"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    exam = conn.execute("SELECT * FROM exams WHERE id = ?", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return {"error": "Exam not found"}, 404
    
    # Build export data in the format expected by import_exam.html
    export_data = {
        "name": exam["name"],
        "class": exam["class"],
        "specialisation": exam["specialisation_tag"] if "specialisation_tag" in exam.keys() else "General",
        "subject": exam["subject_tag"] if "subject_tag" in exam.keys() else "General",
        "duration": exam["duration"],
        "maxWarnings": exam["max_warnings"] if "max_warnings" in exam.keys() else 5,
        "calculator": exam["calculator_type"] if "calculator_type" in exam.keys() else "none",
        "sections": []
    }
    
    # Get sections
    sections = conn.execute("""
        SELECT * FROM exam_sections 
        WHERE exam_id = ?
        ORDER BY section_order
    """, (exam_id,)).fetchall()
    
    for section in sections:
        section_data = {
            "name": section["section_name"],
            "questionsToShow": section["questions_to_show"] if "questions_to_show" in section.keys() else 0,
            "randomize": section["randomize"] if "randomize" in section.keys() else 1,
            "questions": [],
            "groups": []
        }
        
        # Get standalone questions (not in groups)
        questions = conn.execute("""
            SELECT * FROM questions 
            WHERE section_id = ? AND (group_id IS NULL OR group_id = 0)
            ORDER BY COALESCE(display_order, id)
        """, (section["id"],)).fetchall()
        
        for q in questions:
            # Determine answer number (1-4)
            answer_num = 1
            if q["answer"]:
                if q["answer"] == q["option1"]: answer_num = 1
                elif q["answer"] == q["option2"]: answer_num = 2
                elif q["answer"] == q["option3"]: answer_num = 3
                elif q["answer"] == q["option4"]: answer_num = 4
            
            section_data["questions"].append({
                "text": q["question"] or "",
                "opt1": q["option1"] or "",
                "opt2": q["option2"] or "",
                "opt3": q["option3"] or "",
                "opt4": q["option4"] or "",
                "answer": answer_num,
                "mandatory": bool(q["mandatory"]) if "mandatory" in q.keys() else False,
                "img": q["image"] if q["image"] else ""
            })
        
        # Get groups
        groups = conn.execute("""
            SELECT * FROM exam_question_groups 
            WHERE section_id = ? 
            ORDER BY display_order
        """, (section["id"],)).fetchall()
        
        for group in groups:
            group_questions = conn.execute("""
                SELECT * FROM questions 
                WHERE group_id = ? 
                ORDER BY display_order
            """, (group["id"],)).fetchall()
            
            group_qs = []
            for gq in group_questions:
                answer_num = 1
                if gq["answer"]:
                    if gq["answer"] == gq["option1"]: answer_num = 1
                    elif gq["answer"] == gq["option2"]: answer_num = 2
                    elif gq["answer"] == gq["option3"]: answer_num = 3
                    elif gq["answer"] == gq["option4"]: answer_num = 4
                
                group_qs.append({
                    "text": gq["question"] or "",
                    "opt1": gq["option1"] or "",
                    "opt2": gq["option2"] or "",
                    "opt3": gq["option3"] or "",
                    "opt4": gq["option4"] or "",
                    "answer": answer_num,
                    "mandatory": bool(gq["mandatory"]) if "mandatory" in gq.keys() else False
                })
            
            section_data["groups"].append({
                "name": group["group_name"] or "",
                "type": group["group_type"] or "normal",
                "instruction": group["instruction_text"] or "",
                "content": group["group_content"] or "",
                "img": group["group_image"] if group["group_image"] else "",
                "questions": group_qs
            })
        
        export_data["sections"].append(section_data)
    
    export_data["exportedAt"] = datetime.now().isoformat()
    export_data["exportedBy"] = session["username"]
    export_data["examId"] = exam_id
    
    conn.close()
    
    # Create the JSON response
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False, default=str)
    
    return Response(
        json_str,
        mimetype="application/json",
        headers={
            "Content-Disposition": f"attachment;filename=exam_{exam_id}_{export_data['name'].replace(' ', '_')[:50]}.json"
        }
    )


@admin_exams_bp.route("/admin/exams/bulk-action", methods=["POST"])
def admin_exams_bulk_action():
    """Handle bulk actions on exams"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json()
    action = data.get('action')
    exam_ids = data.get('exam_ids', [])
    
    if not exam_ids:
        return {"error": "No exams selected"}, 400
    
    conn = get_db_connection()
    affected = 0
    
    try:
        if action == 'start':
            for eid in exam_ids:
                conn.execute("UPDATE exams SET active = 1, deactivated = 0 WHERE id = ?", (eid,))
                affected += 1
            log_action("Admin", session["username"], f"Bulk started {affected} exams", conn=conn)
            
        elif action == 'stop':
            for eid in exam_ids:
                conn.execute("UPDATE exams SET active = 0 WHERE id = ?", (eid,))
                affected += 1
            log_action("Admin", session["username"], f"Bulk stopped {affected} exams", conn=conn)
            
        elif action == 'deactivate':
            for eid in exam_ids:
                try:
                    conn.execute("UPDATE exams SET deactivated = 1, active = 0 WHERE id = ?", (eid,))
                except:
                    conn.execute("UPDATE exams SET active = 0 WHERE id = ?", (eid,))
                affected += 1
            log_action("Admin", session["username"], f"Bulk deactivated {affected} exams", conn=conn)
            
        elif action == 'reactivate':
            for eid in exam_ids:
                try:
                    conn.execute("UPDATE exams SET deactivated = 0, active = 1 WHERE id = ?", (eid,))
                except:
                    conn.execute("UPDATE exams SET active = 1 WHERE id = ?", (eid,))
                affected += 1
            log_action("Admin", session["username"], f"Bulk reactivated {affected} exams", conn=conn)
            
        elif action == 'delete':
            for eid in exam_ids:
                conn.execute("DELETE FROM exam_question_responses WHERE exam_id = ?", (eid,))
                conn.execute("DELETE FROM warning_logs WHERE exam_id = ?", (eid,))
                try:
                    conn.execute("DELETE FROM exam_deactivation_notes WHERE exam_id = ?", (eid,))
                except Exception:
                    pass
                try:
                    conn.execute("DELETE FROM exam_versions WHERE exam_id = ?", (eid,))
                except Exception:
                    pass
                conn.execute("DELETE FROM scores WHERE exam_id = ?", (eid,))
                conn.execute("DELETE FROM questions WHERE exam_id = ?", (eid,))
                conn.execute("DELETE FROM exam_sections WHERE exam_id = ?", (eid,))
                conn.execute("DELETE FROM exam_question_groups WHERE exam_id = ?", (eid,))
                conn.execute("DELETE FROM exams WHERE id = ?", (eid,))
                affected += 1
            log_action("Admin", session["username"], f"Bulk deleted {affected} exams", conn=conn)
        
        conn.commit()
        return {"success": True, "affected": affected, "message": f"{action.capitalize()} action completed on {affected} exams"}
    
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_exams_bp.route("/admin/exam/<int:exam_id>/delete", methods=["DELETE", "POST"])
def admin_delete_exam_ajax(exam_id):
    """AJAX delete exam (permanent)"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    try:
        exam = conn.execute("SELECT name FROM exams WHERE id = ?", (exam_id,)).fetchone()
        
        if exam:
            conn.execute("DELETE FROM exam_question_responses WHERE exam_id = ?", (exam_id,))
            conn.execute("DELETE FROM warning_logs WHERE exam_id = ?", (exam_id,))
            try:
                conn.execute("DELETE FROM exam_deactivation_notes WHERE exam_id = ?", (exam_id,))
            except Exception:
                pass
            try:
                conn.execute("DELETE FROM exam_versions WHERE exam_id = ?", (exam_id,))
            except Exception:
                pass
            conn.execute("DELETE FROM scores WHERE exam_id = ?", (exam_id,))
            conn.execute("DELETE FROM questions WHERE exam_id = ?", (exam_id,))
            conn.execute("DELETE FROM exam_sections WHERE exam_id = ?", (exam_id,))
            conn.execute("DELETE FROM exam_question_groups WHERE exam_id = ?", (exam_id,))
            conn.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
            
            log_action("Admin", session["username"], f"Permanently deleted exam '{exam['name']}'", conn=conn)
            conn.commit()
            
            return {"success": True, "message": f"Exam '{exam['name']}' permanently deleted"}
        
        return {"error": "Exam not found"}, 404
    except Exception as e:
        conn.rollback()
        return {"error": str(e)}, 500
    finally:
        conn.close()


@admin_exams_bp.route("/admin/exam/<int:exam_id>/live-data")
def admin_exam_live_monitoring(exam_id):
    """Get live data for exam monitoring"""
    if "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    
    active_students = conn.execute("""
        SELECT s.id, s.username, s.full_name, s.photo,
               sc.id as attempt_id, sc.warnings_count, sc.remaining_time,
               sc.current_progress, sc.started_at, sc.is_paused
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        WHERE sc.exam_id = ? AND sc.status = 'in_progress'
        ORDER BY sc.started_at DESC
    """, (exam_id,)).fetchall()
    
    conn.close()
    
    return {
        "success": True,
        "active_count": len(active_students),
        "students": [dict(s) for s in active_students]
    }


