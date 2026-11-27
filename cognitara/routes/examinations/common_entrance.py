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
exam_ce_bp = Blueprint('exam_ce', __name__)


@exam_ce_bp.route('/ce_save_single_answer', methods=['POST'])
def ce_save_single_answer():
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    data = request.get_json(silent=True) or {}
    attempt_id = data.get('attempt_id')
    question_id = data.get('question_id')
    user_answer = data.get('user_answer')
    time_spent = int(data.get('time_spent', 0) or 0)
    session_key = data.get('session_key')
    client_revision = data.get('client_revision')
    client_timestamp = data.get('client_timestamp')
    if not attempt_id or not question_id:
        return {"error": "attempt_id and question_id required"}, 400
    res = save_ce_answer(
        session['ce_student_id'],
        attempt_id,
        question_id,
        user_answer,
        time_spent,
        session_key,
        client_revision=client_revision,
        client_timestamp=client_timestamp
    )
    status_code = res.pop("status_code", 200)
    return res, status_code

@exam_ce_bp.route('/ce_heartbeat', methods=['POST'])
def ce_heartbeat():
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    data = request.get_json(silent=True) or {}
    attempt_id = data.get('attempt_id')
    session_key = data.get('session_key')
    if not attempt_id:
        return {"error": "attempt_id required"}, 400
    res = process_ce_heartbeat(session['ce_student_id'], attempt_id, session_key)
    status_code = res.pop("status_code", 200)
    return res, status_code


@exam_ce_bp.route("/ce_exam/<int:attempt_id>", methods=["GET", "POST"])
def ce_exam_page(attempt_id):
    if "ce_student_id" not in session:
        return redirect("/ce_login")
    
    conn = get_db_connection()
    
    # Get attempt with exam details
    attempt = conn.execute("""
        SELECT a.*, e.name as exam_name, e.duration, e.passing_score, e.max_warnings, e.calculator_type
        FROM ce_attempts a
        JOIN ce_exams e ON a.exam_id = e.id
        WHERE a.id=?
    """, (attempt_id,)).fetchone()
    
    if not attempt:
        conn.close()
        return redirect("/ce_dashboard")
    
    # IDOR check: Attempt must belong to logged-in student
    if attempt["student_id"] != session["ce_student_id"]:
        conn.close()
        return redirect("/ce_dashboard")
    
    # If already submitted, return submitted page (idempotent)
    if attempt["status"] != "in_progress":
        conn.close()
        session.pop("ce_attempt_id", None)
        return redirect(f"/ce_submitted?attempt_id={attempt_id}")

    # Authoritative Pause Lock: Students cannot bypass paused state
    if attempt["is_paused"] == 1:
        exam_row = conn.execute("SELECT * FROM ce_exams WHERE id=?", (attempt["exam_id"],)).fetchone()
        conn.close()
        return render_template("exam_paused.html",
                               attempt=attempt,
                               exam=dict(exam_row) if exam_row else None,
                               pause_reason=attempt.get("pause_reason") or "Your examination attempt has been paused.",
                               is_ce=True,
                               role="student")

    # Ensure authoritative session lease key
    sess_key = attempt["session_key"] if "session_key" in attempt.keys() and attempt["session_key"] else None
    if not sess_key:
        sess_key = secrets.token_hex(16)
        conn.execute("UPDATE ce_attempts SET session_key=?, last_heartbeat=CURRENT_TIMESTAMP WHERE id=?", (sess_key, attempt["id"]))
        conn.commit()
    att_dict = dict(attempt)
    att_dict["session_key"] = sess_key
    attempt = att_dict
    
    # Auto-heal missing authoritative_deadline for active attempt with trustworthy started_at
    att_dict = dict(attempt) if isinstance(attempt, sqlite3.Row) else (attempt or {})
    if not att_dict.get("authoritative_deadline") and att_dict.get("started_at"):
        try:
            st_dt = datetime.strptime(str(att_dict["started_at"]).split('.')[0], "%Y-%m-%d %H:%M:%S")
            reconstructed_dl = (st_dt + timedelta(minutes=int(att_dict.get("duration") or 30))).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE ce_attempts SET authoritative_deadline=? WHERE id=? AND authoritative_deadline IS NULL", (reconstructed_dl, attempt_id))
            conn.commit()
            attempt = dict(att_dict)
            attempt["authoritative_deadline"] = reconstructed_dl
        except Exception:
            pass

    # Check authoritative remaining time
    server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
    if server_rem <= 0:
        finalize_ce_exam_attempt(attempt_id, conn=conn)
        conn.commit()
        conn.close()
        session.pop("ce_attempt_id", None)
        return redirect(f"/ce_submitted?attempt_id={attempt_id}")
    
    # Initialize started_at for each question if not set
    conn.execute("""
        UPDATE ce_attempt_questions 
        SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
        WHERE attempt_id = ? AND started_at IS NULL
    """, (attempt_id,))
    conn.commit()
    
    # Get all attempt questions with shuffled options
    attempt_questions = conn.execute("""
        SELECT aq.id as attempt_qid, aq.question_id, aq.user_answer, aq.is_correct,
               aq.time_spent, aq.started_at, aq.shuffled_options,
               q.*, s.section_name, s.id as section_id,
               g.group_name, g.group_content, g.group_image, g.instruction_text, g.group_type
        FROM ce_attempt_questions aq
        JOIN ce_questions q ON aq.question_id = q.id
        JOIN ce_sections s ON q.section_id = s.id
        LEFT JOIN ce_question_groups g ON q.group_id = g.id
        WHERE aq.attempt_id=?
        ORDER BY aq.id
    """, (attempt_id,)).fetchall()
    
    # Parse shuffled options for each question
    questions = []
    for q in attempt_questions:
        q_dict = dict(q)
        if q['shuffled_options']:
            shuffled_data = json.loads(q['shuffled_options'])
            q_dict['shuffled_options_data'] = shuffled_data
        else:
            q_dict['shuffled_options_data'] = {
                'options': [
                    {'letter': 'A', 'text': q['option1']},
                    {'letter': 'B', 'text': q['option2']},
                    {'letter': 'C', 'text': q['option3']},
                    {'letter': 'D', 'text': q['option4']}
                ]
            }
        questions.append(q_dict)
    
    # Handle POST request (exam submission)
    if request.method == "POST":
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        if server_rem <= 0:
            finalize_ce_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            conn.close()
            session.pop("ce_attempt_id", None)
            return redirect(f"/ce_submitted?attempt_id={attempt_id}")

        warning_count = int(request.form.get("warning_count", 0))
        form_answers = {}
        time_data = {}
        
        for q in questions:
            user_ans = request.form.get(f"q{q['question_id']}")
            time_spent = request.form.get(f"time_{q['question_id']}", 0)
            try:
                time_spent = int(time_spent)
            except Exception:
                time_spent = 0
            
            is_corr = 1 if (user_ans and user_ans == q["answer"]) else 0
            conn.execute("""
                UPDATE ce_attempt_questions SET 
                user_answer=?, is_correct=?, completed_at=CURRENT_TIMESTAMP,
                time_spent=?
                WHERE id=?
            """, (user_ans if user_ans else None, is_corr, time_spent, q["attempt_qid"]))
            if user_ans:
                form_answers[f"q{q['question_id']}"] = user_ans
            time_data[f"time_{q['question_id']}"] = time_spent
        
        # Log warnings if any
        if warning_count > 0:
            conn.execute("""
                INSERT INTO ce_warning_logs (student_id, exam_id, warning_message, warning_count)
                VALUES (?, ?, ?, ?)
            """, (session["ce_student_id"], attempt["exam_id"], f"Exam submitted with {warning_count} warnings", warning_count))
        
        # Update current_progress JSON with latest form answers before finalization
        cur_prog = {}
        if attempt["current_progress"]:
            try:
                cur_prog = json.loads(attempt["current_progress"])
            except Exception:
                cur_prog = {}
        cur_prog["answers"] = form_answers
        cur_prog["time_data"] = time_data
        conn.execute("""
            UPDATE ce_attempts 
            SET current_progress = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, (json.dumps(cur_prog), attempt_id))
        conn.commit()

        finalize_ce_exam_attempt(attempt_id, conn=conn)
        conn.commit()
        conn.close()
        
        session.pop("ce_attempt_id", None)
        return redirect(f"/ce_submitted?attempt_id={attempt_id}")
    
    max_rev_row = conn.execute("SELECT MAX(client_revision) as max_rev FROM ce_attempt_questions WHERE attempt_id=?", (attempt_id,)).fetchone()
    max_rev = int(max_rev_row["max_rev"] or 0) if max_rev_row else 0
    student_row = conn.execute("SELECT * FROM ce_students WHERE id=?", (attempt["student_id"],)).fetchone()
    student_data = dict(student_row) if student_row else None
    conn.close()
    
    attempt_dict = dict(attempt)
    attempt_dict["remaining_time"] = server_rem
    attempt_dict["session_key"] = sess_key
    
    # Pass all data to template including attempt_id and student
    return render_template("ce_exam_page.html", 
                         exam=attempt_dict, 
                         questions=questions, 
                         attempt_id=attempt_id,
                         student=student_data,
                         max_revision=max_rev)


@exam_ce_bp.route('/ce_auto_save', methods=['POST'])
def ce_auto_save():
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    try:
        # sendBeacon sends as text/plain; fetch sends as application/json
        # Handle both by trying get_json first, then falling back to raw data
        data = request.get_json(silent=True)
        if data is None:
            import json as _json
            try:
                data = _json.loads(request.get_data(as_text=True))
            except Exception:
                data = {}
        attempt_id = data.get('attempt_id')
        if not attempt_id:
            return {"error": "attempt_id is required"}, 400
            
        answers = data.get('answers', {})
        time_data = data.get('time_data', {})
        current_index = data.get('current_index', 0)
        warnings = data.get('warnings', 0)
        duration = data.get('duration', 0)
        current_section = data.get('current_section', 0)
        is_closing = data.get('is_closing', False)
        
        conn = get_db_connection()
        attempt = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=?
        """, (attempt_id,)).fetchone()
        if not attempt:
            conn.close()
            return {"error": "Attempt not found"}, 404
        if attempt["student_id"] != session["ce_student_id"]:
            conn.close()
            return {"error": "Forbidden: Not your exam attempt"}, 403
        if attempt["status"] != "in_progress":
            conn.close()
            return {"error": "Exam attempt is not in progress"}, 400
        if attempt["is_paused"] == 1:
            conn.close()
            return {"success": True, "paused": True, "message": "Attempt is paused"}
            
        session_key = data.get('session_key')
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                conn.close()
                return {"error": "Session superseded", "superseded": True, "message": "This session is no longer active."}, 403
        
        # Auto-heal missing authoritative_deadline
        if not attempt.get("authoritative_deadline") and attempt.get("started_at"):
            try:
                st_dt = datetime.strptime(str(attempt["started_at"]).split('.')[0], "%Y-%m-%d %H:%M:%S")
                reconstructed_dl = (st_dt + timedelta(minutes=int(attempt["duration"] or 30))).strftime('%Y-%m-%d %H:%M:%S')
                conn.execute("UPDATE ce_attempts SET authoritative_deadline=? WHERE id=? AND authoritative_deadline IS NULL", (reconstructed_dl, attempt_id))
                conn.commit()
                attempt = dict(attempt)
                attempt["authoritative_deadline"] = reconstructed_dl
            except Exception:
                pass

        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        progress_json = json.dumps({'answers': answers, 'current_index': current_index, 'current_section': current_section, 'time_data': time_data})

        if server_rem <= 0:
            conn.execute("""
                UPDATE ce_attempts SET current_progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            """, (progress_json, attempt_id))
            conn.commit()
            finalize_ce_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            conn.close()
            return {"success": True, "time_up": True, "remaining_time": 0, "message": "Time is up! Exam auto-submitted."}
        
        if is_closing:
            conn.execute("""
                UPDATE ce_attempts 
                SET current_progress = ?, remaining_time = ?,
                    resume_requested = 1, is_paused = 1, paused_at = CURRENT_TIMESTAMP, paused_by = 'auto_lock',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND student_id = ? AND status = 'in_progress'
            """, (progress_json, server_rem, attempt_id, session["ce_student_id"]))
        elif attempt["is_paused"] == 0:
            conn.execute("""
                UPDATE ce_attempts 
                SET current_progress = ?, remaining_time = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND student_id = ? AND status = 'in_progress' AND is_paused = 0
            """, (progress_json, server_rem, attempt_id, session["ce_student_id"]))
            
        conn.commit()
        conn.close()
        return {"success": True, "remaining_time": server_rem}
    except Exception as e:
        return {"success": False, "error": str(e)}


@exam_ce_bp.route('/ce_auto_submit_close', methods=['POST'])
def ce_auto_submit_close():
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    try:
        data = request.get_json(silent=True) or {}
        attempt_id = data.get('attempt_id')
        if not attempt_id:
            return {"error": "attempt_id required"}, 400
        conn = get_db_connection()
        attempt = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=? AND a.student_id=?
        """, (attempt_id, session["ce_student_id"])).fetchone()
        if attempt and attempt["status"] == "in_progress" and attempt["is_paused"] == 0:
            server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            conn.execute("""
                UPDATE ce_attempts 
                SET resume_requested = 1, 
                    is_paused = 1, 
                    paused_at = CURRENT_TIMESTAMP, 
                    paused_by = 'auto_lock',
                    remaining_time = ?
                WHERE id = ? AND student_id = ? AND status = 'in_progress' AND is_paused = 0
            """, (server_rem, attempt_id, session["ce_student_id"]))
            conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": "Internal server error"}, 500


@exam_ce_bp.route('/ce_get_saved_state/<int:attempt_id>', methods=['GET'])
def ce_get_saved_state(attempt_id):
    is_admin = session.get("role") == "Admin" or "admin_id" in session
    ce_student_id = session.get("ce_student_id")
    if not is_admin and not ce_student_id:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT student_id, current_progress, warnings_count, remaining_time FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    conn.close()
    if not attempt:
        return {"error": "Attempt not found"}, 404
    if not is_admin and attempt['student_id'] != ce_student_id:
        return {"error": "Forbidden: Not your exam attempt"}, 403
    if attempt and attempt['current_progress']:
        return {"success": True, "has_state": True, "state": json.loads(attempt['current_progress']), "remaining_time": attempt["remaining_time"], "warnings": attempt["warnings_count"]}
    return {"success": True, "has_state": False}


@exam_ce_bp.route("/ce_get_exam_state/<int:attempt_id>", methods=["GET"])
def ce_get_exam_state(attempt_id):
    is_admin = session.get("role") == "Admin" or "admin_id" in session
    ce_student_id = session.get("ce_student_id")
    if not is_admin and not ce_student_id:
        return {"error": "Unauthorized"}, 401
    conn = get_db_connection()
    attempt = conn.execute("SELECT student_id, current_progress, remaining_time, warnings_count FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    max_rev_row = conn.execute("SELECT MAX(client_revision) as max_rev FROM ce_attempt_questions WHERE attempt_id=?", (attempt_id,)).fetchone()
    conn.close()
    if not attempt:
        return {"error": "Attempt not found"}, 404
    if not is_admin and attempt["student_id"] != ce_student_id:
        return {"error": "Forbidden: Not your exam attempt"}, 403
    
    max_rev = int(max_rev_row["max_rev"] or 0) if max_rev_row else 0
    if attempt and attempt["current_progress"]:
        return {
            "success": True,
            "has_state": True,
            "state": json.loads(attempt["current_progress"]),
            "remaining_time": attempt["remaining_time"],
            "warnings": attempt["warnings_count"],
            "max_revision": max_rev
        }
    return {"success": True, "has_state": False, "max_revision": max_rev}


@exam_ce_bp.route('/ce_check_active_session/<int:attempt_id>', methods=['GET'])
def ce_check_active_session(attempt_id):
    """
    Called by a newly opened tab on load.
    Returns whether this attempt is already being actively used in another tab
    (recent heartbeat within 20s, not paused, status=in_progress).
    If so, the new tab should NOT start fresh - it must load state from backend.
    """
    if "ce_student_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    from datetime import datetime, timedelta
    conn = get_db_connection()
    attempt = conn.execute(
        "SELECT student_id, status, is_paused, updated_at, current_progress, remaining_time, warnings_count FROM ce_attempts WHERE id=?",
        (attempt_id,)
    ).fetchone()
    conn.close()
    if not attempt:
        return {"active_elsewhere": False}
    if "ce_student_id" in session and attempt['student_id'] != session["ce_student_id"]:
        return {"error": "Forbidden: Not your exam attempt"}, 403
    if attempt['status'] != 'in_progress' or attempt['is_paused'] == 1:
        return {"active_elsewhere": False}
    try:
        last_update = datetime.strptime(attempt['updated_at'], '%Y-%m-%d %H:%M:%S')
        recently_active = (datetime.utcnow() - last_update) < timedelta(seconds=20)
    except Exception:
        recently_active = False
    return {"active_elsewhere": recently_active}


@exam_ce_bp.route('/ce_check_pause/<int:attempt_id>', methods=['GET'])
def ce_check_pause(attempt_id):
    if "ce_student_id" not in session and "admin_id" not in session:
        return {"error": "Unauthorized"}, 401
    from datetime import datetime, timedelta
    conn = get_db_connection()
    try:
        attempt = conn.execute("""
            SELECT a.*, e.duration 
            FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=?
        """, (attempt_id,)).fetchone()
        if attempt:
            attempt = dict(attempt)
    except Exception:
        attempt = None

    if not attempt:
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": False}
        
    if "ce_student_id" in session and attempt['student_id'] != session["ce_student_id"]:
        conn.close()
        return {"error": "Forbidden: Not your exam attempt"}, 403
        
    # Check force_submit flag or completed status
    if attempt.get('force_submit') == 1 or attempt.get('status') != 'in_progress':
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": True, "remaining_time": attempt.get("remaining_time"), "warnings_count": attempt.get("warnings_count")}
    
    server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
    if server_rem <= 0:
        finalize_ce_exam_attempt(attempt_id, conn=conn)
        conn.commit()
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": True, "time_up": True, "remaining_time": 0, "warnings_count": attempt.get("warnings_count")}

    # Crash detection...
    if attempt['status'] == 'in_progress' and attempt['is_paused'] == 0:
        try:
            last_update = datetime.strptime(attempt['updated_at'], '%Y-%m-%d %H:%M:%S')
            stale = (datetime.utcnow() - last_update) > timedelta(seconds=90)
        except Exception:
            stale = False
        if stale:
            conn.execute("""
                UPDATE ce_attempts
                SET resume_requested=1, is_paused=1,
                    paused_at=CURRENT_TIMESTAMP, paused_by='auto_lock', remaining_time=?
                WHERE id=? AND student_id=? AND status='in_progress' AND is_paused=0
            """, (server_rem, attempt_id, attempt['student_id']))
            conn.commit()
            conn.close()
            return {"paused": True, "paused_by": "auto_lock", "force_submit": False, "remaining_time": server_rem, "warnings_count": attempt.get("warnings_count")}
            
    paused = attempt['is_paused'] == 1
    paused_by = attempt['paused_by']
    conn.close()
    
    # Return warnings_count to the frontend
    return {"paused": paused, "paused_by": paused_by, "force_submit": False, "remaining_time": server_rem, "warnings_count": attempt.get("warnings_count")}


@exam_ce_bp.route('/ce_request_resume', methods=['POST'])
def ce_request_resume():
    """Student requests to resume exam on a different computer"""
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json()
    attempt_id = data.get('attempt_id')
    
    conn = get_db_connection()
    
    # Check if attempt belongs to this student
    attempt = conn.execute(
        "SELECT * FROM ce_attempts WHERE id=? AND student_id=?", 
        (attempt_id, session["ce_student_id"])
    ).fetchone()
    
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    # Mark as needing resume approval
    conn.execute("""
        UPDATE ce_attempts 
        SET resume_requested=1, resume_requested_at=CURRENT_TIMESTAMP, 
            is_paused=1, status='in_progress'
        WHERE id=?
    """, (attempt_id,))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Resume request sent to admin"}


@exam_ce_bp.route('/ce_check_resume_approved/<int:attempt_id>', methods=['GET'])
def ce_check_resume_approved(attempt_id):
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute(
        "SELECT student_id, resume_requested, is_paused, paused_by FROM ce_attempts WHERE id=?", 
        (attempt_id,)
    ).fetchone()
    conn.close()
    
    if not attempt:
        return {"resume_requested": False, "approved": False, "paused_by": None}
    if attempt["student_id"] != session.get("ce_student_id"):
        return {"error": "Forbidden: Not your exam attempt"}, 403
    
    approved = (attempt["resume_requested"] == 0 and attempt["is_paused"] == 0)
    return {
        "resume_requested": attempt["resume_requested"] == 1,
        "approved": approved,
        "paused_by": attempt["paused_by"]
    }


@exam_ce_bp.route('/ce_clear_auto_lock/<int:attempt_id>', methods=['POST'])
def ce_clear_auto_lock(attempt_id):
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT remaining_time, paused_at, is_paused, paused_by 
        FROM ce_attempts 
        WHERE id=? AND student_id=? AND paused_by='auto_lock'
    """, (attempt_id, session["ce_student_id"])).fetchone()
    
    if not attempt or attempt["is_paused"] != 1:
        conn.close()
        return {"success": False, "error": "Attempt not auto-locked or not found"}, 404
        
    paused_at_raw = attempt["paused_at"]
    if not paused_at_raw:
        conn.close()
        return {"success": False, "error": "Auto-lock timestamp missing. Administrator approval required."}, 403
        
    try:
        paused_dt = datetime.strptime(str(paused_at_raw).split('.')[0], "%Y-%m-%d %H:%M:%S")
        elapsed_paused = (get_utc_now() - paused_dt).total_seconds()
    except Exception:
        conn.close()
        return {"success": False, "error": "Invalid auto-lock timestamp. Administrator approval required."}, 403
        
    # Only allow self-unpause for quick reloads (under 20 seconds)
    if elapsed_paused > 20:
        conn.close()
        return {
            "success": False, 
            "error": "Interruption exceeded quick reload window. Administrator approval required to resume."
        }, 403
        
    rem = int(attempt['remaining_time'] or 0)
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE ce_attempts 
        SET resume_requested = 0, is_paused = 0, paused_at = NULL, paused_by = NULL, authoritative_deadline = ?
        WHERE id = ? AND paused_by = 'auto_lock' AND student_id = ?
    """, (new_dl, attempt_id, session["ce_student_id"]))
    conn.commit()
    conn.close()
    return {"success": True}


@exam_ce_bp.route('/ce_log_warning', methods=['POST'])
def ce_log_warning():
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    data = request.get_json(silent=True) or {}
    attempt_id = data.get('attempt_id')
    warning_message = data.get('warning_message', 'Suspicious activity detected')
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT student_id, exam_id FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
    conn.close()
    if not attempt:
        return {"error": "Attempt not found"}, 404
    if attempt["student_id"] != session["ce_student_id"]:
        return {"error": "Forbidden"}, 403
        
    from cognitara.services.violation_service import log_ce_warning
    res = log_ce_warning(session["ce_student_id"], attempt["exam_id"], warning_message, attempt_id=attempt_id)
    return res


