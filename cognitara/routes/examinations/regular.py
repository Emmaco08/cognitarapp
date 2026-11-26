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
exam_regular_bp = Blueprint('exam_regular', __name__)

@exam_regular_bp.route("/exam_start/<int:exam_id>")
def exam_start(exam_id):
    """CE-style start page for regular exams"""
    if "student_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not found", 404
    
    # Check if exam is active
    if not exam["active"]:
        conn.close()
        return render_template("exam_start.html", 
                               exam=exam,
                               error="This exam is not currently active.",
                               student_name=session.get("full_name", session["username"]))
    
    # Check for existing attempt
    existing = conn.execute("""
        SELECT id, status FROM scores 
        WHERE student_id=? AND exam_id=?
        ORDER BY id DESC LIMIT 1
    """, (session["student_id"], exam_id)).fetchone()
    
    if existing:
        if existing["status"] == "in_progress":
            conn.close()
            return redirect(f"/exam/{exam_id}")
        elif existing["status"] == "completed":
            conn.close()
            return render_template("exam_start.html",
                                   exam=exam,
                                   error="You have already completed this exam.",
                                   student_name=session.get("full_name", session["username"]))
    
    conn.close()
    
    return render_template("exam_start.html",
                           exam=exam,
                           student_name=session.get("full_name", session["username"]))


@exam_regular_bp.route("/exam_begin/<int:exam_id>")
def exam_begin(exam_id):
    """Start the exam with sections/groups randomization - EXACT CE logic"""
    import json
    import random
    if "student_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
    
    if not exam or not exam["active"]:
        conn.close()
        return redirect("/dashboard")
    
    student_id = session["student_id"]
    
    # ========== CRITICAL: CHECK FOR EXISTING ATTEMPT FIRST ==========
    existing = conn.execute("""
        SELECT id, status, resume_requested, is_paused, remaining_time, 
               current_progress, warnings_count
        FROM scores 
        WHERE student_id=? AND exam_id=?
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if existing:
        # If there's an in-progress attempt, check pause state or resume it
        if existing["status"] == "in_progress":
            if existing["is_paused"] == 1:
                conn.close()
                return render_template("exam_paused.html", 
                                       exam=exam, 
                                       attempt=existing,
                                       pause_reason=existing["pause_reason"] if "pause_reason" in existing.keys() and existing["pause_reason"] else "Examination is paused or interrupted.",
                                       student_name=session.get("full_name", session["username"]))
            sess_key = existing["session_key"] if "session_key" in existing.keys() and existing["session_key"] else None
            if not sess_key:
                sess_key = secrets.token_hex(16)
                conn.execute("UPDATE scores SET session_key=?, last_heartbeat=CURRENT_TIMESTAMP WHERE id=?", (sess_key, existing["id"]))
                conn.commit()
            conn.close()
            return redirect(f"/exam/{exam_id}")
        
        # If completed, cannot retake
        elif existing["status"] == "completed":
            conn.close()
            return render_template("exam_start.html", 
                                   exam=exam, 
                                   error="You have already completed this exam.",
                                   student_name=session.get("full_name", session["username"]))
    
    # Get all sections for this exam
    sections = conn.execute("""
    SELECT * FROM exam_sections 
    WHERE exam_id=? AND active=1 
    ORDER BY section_order
""", (exam_id,)).fetchall()

    
    if not sections:
        # No sections - legacy: shuffle all questions
        questions = conn.execute("SELECT * FROM questions WHERE exam_id=?", (exam_id,)).fetchall()
        questions_list = list(questions)
        import random
        random.shuffle(questions_list)
        
        # Store question order exclusively in SQLite current_progress (never in the 4KB session cookie)
        question_order = [{
            'question_id': q['id'],
            'section_id': None,
            'section_name': 'All Questions',
            'group_data': None
        } for q in questions_list]
        session.pop(f'exam_{exam_id}_questions', None)
        
        deadline_str = (get_utc_now() + timedelta(minutes=int(exam["duration"]))).strftime('%Y-%m-%d %H:%M:%S')
        new_session_key = secrets.token_hex(16)
        cursor = conn.execute("""
            INSERT INTO scores (student_id, exam_id, status, start_time, total, remaining_time, authoritative_deadline, session_key, last_heartbeat)
            VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (student_id, exam_id, len(questions_list), exam["duration"] * 60, deadline_str, new_session_key))
        
        attempt_id = cursor.lastrowid
        
        # Save question order to DB for cross-device recovery
        conn.execute("""
            UPDATE scores SET current_progress = ? WHERE id = ?
        """, (json.dumps({'question_order': question_order, 'answers': {}, 'current_index': 0, 'time_data': {}}), attempt_id))
        
        conn.commit()
        conn.close()
        return redirect(f"/exam/{exam_id}")
    
    # =========================================================================
    # PHASE 1: Calculate mandatory and normal counts per section
    # =========================================================================
    section_info = []
    total_mandatory = 0
    total_normal_available = 0
    
    for section in sections:
        section_id = section["id"]
        
        # Get counts
        mandatory_count = conn.execute("""
            SELECT COUNT(*) as count FROM questions 
            WHERE section_id=? AND mandatory=1
        """, (section_id,)).fetchone()["count"]
        
        normal_count = conn.execute("""
            SELECT COUNT(*) as count FROM questions 
            WHERE section_id=? AND mandatory=0
        """, (section_id,)).fetchone()["count"]
        
        total_mandatory += mandatory_count
        total_normal_available += normal_count
        
        section_info.append({
            "id": section_id,
            "name": section["section_name"],
            "section_order": section["section_order"],
            "randomize": section["randomize"] if "randomize" in section.keys() else 1,
            "questions_to_show": section["questions_to_show"],
            "mandatory_count": mandatory_count,
            "normal_count": normal_count
        })
    
    # Calculate how many normal questions to show across the whole exam
    # Use the sum of (questions_to_show - mandatory) for sections with explicit limits
    # For sections with questions_to_show=0 (All), use all their normal questions
    normal_to_show_total = 0
    for sec in section_info:
        if sec["questions_to_show"] > 0:
            normal_to_show_total += max(0, sec["questions_to_show"] - sec["mandatory_count"])
        else:
            normal_to_show_total += sec["normal_count"]
    
    # =========================================================================
    # PHASE 2: THE WATERFALL MATH (Respect explicit limits first)
    # =========================================================================
    fixed_sections = []
    dynamic_sections = []
    
    for sec in section_info:
        if sec["questions_to_show"] > 0:
            # How many normal questions this section actually wants
            desired = sec["questions_to_show"] - sec["mandatory_count"]
            desired = max(0, desired)  # Can't be negative
            desired = min(desired, sec["normal_count"])  # Can't ask for more than exists
            sec["desired_normal"] = desired
            fixed_sections.append(sec)
        else:
            # "0" means All: This section acts as a sponge for remaining slots
            sec["desired_normal"] = sec["normal_count"]
            dynamic_sections.append(sec)
    
    sum_fixed_desired = sum(sec["desired_normal"] for sec in fixed_sections)
    
    # SCENARIO A: The Squeeze (Fixed sections alone ask for more than the exam allows)
    if sum_fixed_desired > normal_to_show_total:
        for sec in fixed_sections:
            if sum_fixed_desired > 0:
                sec["normal_allocation"] = int(round(normal_to_show_total * (sec["desired_normal"] / sum_fixed_desired)))
            else:
                sec["normal_allocation"] = 0
        
        for sec in dynamic_sections:
            sec["normal_allocation"] = 0  # Sorry, no room for "All" sections
        
        # Fix any rounding errors
        diff = normal_to_show_total - sum(sec["normal_allocation"] for sec in fixed_sections)
        for sec in fixed_sections:
            if diff > 0 and sec["normal_allocation"] < sec["desired_normal"]:
                sec["normal_allocation"] += 1
                diff -= 1
            elif diff < 0 and sec["normal_allocation"] > 0:
                sec["normal_allocation"] -= 1
                diff += 1
            if diff == 0:
                break
    
    # SCENARIO B: Perfect Match or Overflow (We have slots left over for the "All" sections)
    else:
        # 1. Give fixed sections EXACTLY what they asked for
        for sec in fixed_sections:
            sec["normal_allocation"] = sec["desired_normal"]
        
        # 2. Calculate remaining slots for the "All" sections
        remaining_slots = normal_to_show_total - sum_fixed_desired
        sum_dynamic_available = sum(sec["normal_count"] for sec in dynamic_sections)
        
        if sum_dynamic_available <= remaining_slots:
            # We have enough slots to give every "All" section everything they have
            for sec in dynamic_sections:
                sec["normal_allocation"] = sec["normal_count"]
        else:
            # Not enough slots to give them everything, scale them proportionally
            for sec in dynamic_sections:
                if sum_dynamic_available > 0:
                    sec["normal_allocation"] = int(round(remaining_slots * (sec["normal_count"] / sum_dynamic_available)))
                else:
                    sec["normal_allocation"] = 0
            
            # Fix rounding errors
            diff = remaining_slots - sum(sec["normal_allocation"] for sec in dynamic_sections)
            for sec in dynamic_sections:
                if diff > 0 and sec["normal_allocation"] < sec["normal_count"]:
                    sec["normal_allocation"] += 1
                    diff -= 1
                elif diff < 0 and sec["normal_allocation"] > 0:
                    sec["normal_allocation"] -= 1
                    diff += 1
                if diff == 0:
                    break
    
    # =========================================================================
    # PHASE 3: FETCH & RANDOMIZE (With the Group Integrity Fix)
    # =========================================================================
    all_questions_by_section = []
    
    for sec_info in section_info:
        section_id = sec_info["id"]
        section_name = sec_info["name"]
        randomize = sec_info["randomize"]
        normal_allocation = sec_info["normal_allocation"]
        
        # Get all questions from this section with group info
        all_questions = conn.execute("""
            SELECT q.*, s.section_name, s.id as section_id,
                   g.group_name, g.group_content, g.group_image, 
                   g.instruction_text, g.group_type, g.id as group_db_id
            FROM questions q
            JOIN exam_sections s ON q.section_id = s.id
            LEFT JOIN exam_question_groups g ON q.group_id = g.id
            WHERE q.section_id=?
            ORDER BY q.display_order
        """, (section_id,)).fetchall()
        
        # Separate questions by group and type
        groups_data = {}
        mandatory_ungrouped = []
        normal_ungrouped = []
        
        for q in all_questions:
            q_dict = dict(q)
            if q['group_id']:
                if q['group_id'] not in groups_data:
                    groups_data[q['group_id']] = {
                        'group_id': q['group_id'],
                        'group_db_id': q['group_db_id'],
                        'group_name': q['group_name'],
                        'group_content': q['group_content'],
                        'group_image': q['group_image'],
                        'instruction_text': q['instruction_text'],
                        'group_type': q['group_type'],
                        'mandatory_questions': [],
                        'normal_questions': [],
                        'all_questions_ordered': []
                    }
                if q['mandatory']:
                    groups_data[q['group_id']]['mandatory_questions'].append(q_dict)
                else:
                    groups_data[q['group_id']]['normal_questions'].append(q_dict)
                groups_data[q['group_id']]['all_questions_ordered'].append(q_dict)
            else:
                if q['mandatory']:
                    mandatory_ungrouped.append(q_dict)
                else:
                    normal_ungrouped.append(q_dict)
        
        section_final_questions = []
        
        # STEP 1: Add ALL mandatory questions (always included)
        for group_id, group_data in groups_data.items():
            for q in group_data['mandatory_questions']:
                section_final_questions.append({
                    'type': 'group_mandatory',
                    'group_id': group_id,
                    'group_data': group_data,
                    'question': q
                })
        
        for q in mandatory_ungrouped:
            section_final_questions.append({
                'type': 'ungrouped_mandatory',
                'question': q
            })
        
        # STEP 2: Handle normal questions
        if normal_allocation > 0:
            if randomize == 1:
                normal_items = []
                
                for group_id, group_data in groups_data.items():
                    if group_data['normal_questions']:
                        group_type = group_data['group_type']
                        if group_type == 'sequence':
                            normal_items.append({
                                'type': 'sequence_group', 
                                'group_id': group_id, 
                                'group_data': group_data, 
                                'questions': group_data['normal_questions'].copy()
                            })
                        elif group_type == 'comprehension':
                            normal_items.append({
                                'type': 'comprehension_group', 
                                'group_id': group_id, 
                                'group_data': group_data, 
                                'questions': group_data['normal_questions'].copy()
                            })
                        else:
                            for q in group_data['normal_questions']:
                                normal_items.append({
                                    'type': 'normal_group_question', 
                                    'group_id': group_id, 
                                    'group_data': group_data, 
                                    'question': q
                                })
                
                for q in normal_ungrouped:
                    normal_items.append({
                        'type': 'ungrouped_normal', 
                        'question': q
                    })
                
                random.shuffle(normal_items)
                
                # Weight-based allocation to protect reading passages
                selected_normal_items = []
                questions_added = 0
                
                for item in normal_items:
                    if questions_added >= normal_allocation:
                        break
                    
                    # Calculate how many questions are inside this item
                    item_q_count = len(item['questions']) if item['type'] in ['sequence_group', 'comprehension_group'] else 1
                    
                    # Only add the item if the ENTIRE group fits into our remaining allocation
                    if questions_added + item_q_count <= normal_allocation:
                        selected_normal_items.append(item)
                        questions_added += item_q_count
                
                normal_items = selected_normal_items
                
                for item in normal_items:
                    if item['type'] == 'sequence_group':
                        group_data = item['group_data']
                        for idx, q in enumerate(item['questions']):
                            section_final_questions.append({
                                'type': 'group_normal_sequence', 
                                'group_id': item['group_id'], 
                                'group_data': group_data, 
                                'question': q, 
                                'is_first_in_group': (idx == 0), 
                                'total_in_group': len(item['questions'])
                            })
                    elif item['type'] == 'comprehension_group':
                        # CRITICAL: Shuffle comprehension questions internally
                        questions_copy = item['questions'].copy()
                        random.shuffle(questions_copy)
                        group_data = item['group_data']
                        for idx, q in enumerate(questions_copy):
                            section_final_questions.append({
                                'type': 'group_normal_comprehension', 
                                'group_id': item['group_id'], 
                                'group_data': group_data, 
                                'question': q, 
                                'is_first_in_group': (idx == 0)
                            })
                    elif item['type'] == 'normal_group_question':
                        section_final_questions.append({
                            'type': 'group_normal_individual', 
                            'group_id': item['group_id'], 
                            'group_data': item['group_data'], 
                            'question': item['question']
                        })
                    else:
                        section_final_questions.append({
                            'type': 'ungrouped_normal', 
                            'question': item['question']
                        })
            else:
                # No randomization - add in order
                normal_added = 0
                
                # Add non-randomized groups cleanly
                for group_id, group_data in groups_data.items():
                    if normal_added >= normal_allocation:
                        break
                    
                    q_count = len(group_data['normal_questions'])
                    if q_count > 0 and normal_added + q_count <= normal_allocation:
                        # Add the whole group safely
                        if group_data['group_type'] == 'sequence':
                            for idx, q in enumerate(group_data['normal_questions']):
                                section_final_questions.append({
                                    'type': 'group_normal_sequence', 
                                    'group_id': group_id, 
                                    'group_data': group_data, 
                                    'question': q, 
                                    'is_first_in_group': (idx == 0), 
                                    'total_in_group': q_count
                                })
                        elif group_data['group_type'] == 'comprehension':
                            # Still shuffle comprehension internally even without global randomize
                            comp_questions = group_data['normal_questions'].copy()
                            random.shuffle(comp_questions)
                            for idx, q in enumerate(comp_questions):
                                section_final_questions.append({
                                    'type': 'group_normal_comprehension', 
                                    'group_id': group_id, 
                                    'group_data': group_data, 
                                    'question': q, 
                                    'is_first_in_group': (idx == 0)
                                })
                        else:
                            for q in group_data['normal_questions']:
                                section_final_questions.append({
                                    'type': 'group_normal_individual', 
                                    'group_id': group_id, 
                                    'group_data': group_data, 
                                    'question': q
                                })
                        
                        normal_added += q_count
                
                # Add ungrouped questions to fill remainder
                for q in normal_ungrouped:
                    if normal_added >= normal_allocation:
                        break
                    section_final_questions.append({
                        'type': 'ungrouped_normal', 
                        'question': q
                    })
                    normal_added += 1
        
        all_questions_by_section.append({
            'section_id': section_id,
            'section_name': section_name,
            'section_order': sec_info["section_order"],
            'questions': section_final_questions
        })
    
    # Sort sections by order
    all_questions_by_section.sort(key=lambda x: x['section_order'])
    
    # =========================================================================
    # BUILD FINAL FLAT QUESTION LIST FOR STORAGE
    # =========================================================================
    all_selected_questions = []
    
    for section_data in all_questions_by_section:
        for q in section_data['questions']:
            question = q['question']
            
            group_info = None
            if 'group_data' in q:
                gd = q['group_data']
                group_info = {
                    'group_name': gd.get('group_name'),
                    'group_content': gd.get('group_content'),
                    'group_image': gd.get('group_image'),
                    'instruction_text': gd.get('instruction_text'),
                    'group_type': gd.get('group_type'),
                    'is_first_in_group': q.get('is_first_in_group', False),
                    'total_in_group': q.get('total_in_group', 0)
                }
            
            all_selected_questions.append({
                'question_id': question['id'],
                'section_id': section_data['section_id'],
                'section_name': section_data['section_name'],
                'group_data': group_info
            })
    
    # =========================================================================
    # CREATE ATTEMPT WITH REMAINING_TIME
    # =========================================================================
    deadline_str = (get_utc_now() + timedelta(minutes=int(exam["duration"]))).strftime('%Y-%m-%d %H:%M:%S')
    new_session_key = secrets.token_hex(16)
    cursor = conn.execute("""
        INSERT INTO scores (student_id, exam_id, status, start_time, total, remaining_time, authoritative_deadline, session_key, last_heartbeat)
        VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    """, (student_id, exam_id, len(all_selected_questions), exam["duration"] * 60, deadline_str, new_session_key))
    
    attempt_id = cursor.lastrowid
    
    # Store question order exclusively in SQLite current_progress (never in the 4KB session cookie)
    question_order = [{
        'question_id': item['question_id'],
        'section_id': item['section_id'],
        'section_name': item['section_name'],
        'group_data': item['group_data']
    } for item in all_selected_questions]
    session.pop(f'exam_{exam_id}_questions', None)
    
    # Save to database for reliable server-side & cross-device recovery
    conn.execute("""
        UPDATE scores SET current_progress = ? WHERE id = ?
    """, (json.dumps({
        'question_order': question_order, 
        'answers': {}, 
        'current_index': 0, 
        'time_data': {}
    }), attempt_id))
    
    conn.commit()
    conn.close()
    
    return redirect(f"/exam/{exam_id}")


@exam_regular_bp.route("/exam_check_pause")
def exam_check_pause_query():
    """Poll endpoint used by exam_paused.html to detect when an invigilator resumes a regular exam."""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    attempt_id = request.args.get("attempt_id", type=int)
    if not attempt_id:
        return {"is_paused": True}
    conn = get_db_connection()
    row = conn.execute(
        "SELECT is_paused, status FROM scores WHERE id=? AND student_id=?",
        (attempt_id, session["student_id"]),
    ).fetchone()
    conn.close()
    if not row:
        return {"is_paused": True}
    return {"is_paused": bool(row["is_paused"] == 1), "status": row["status"]}


@exam_regular_bp.route("/ce_exam_check_pause")
def ce_exam_check_pause():
    """Poll endpoint used by exam_paused.html for Common Entrance candidates."""
    if "ce_student_id" not in session:
        return {"error": "Unauthorized"}, 401
    attempt_id = request.args.get("attempt_id", type=int)
    if not attempt_id:
        return {"is_paused": True}
    conn = get_db_connection()
    row = conn.execute(
        "SELECT is_paused, status FROM ce_attempts WHERE id=? AND student_id=?",
        (attempt_id, session["ce_student_id"]),
    ).fetchone()
    conn.close()
    if not row:
        return {"is_paused": True}
    return {"is_paused": bool(row["is_paused"] == 1), "status": row["status"]}


@exam_regular_bp.route("/exam/<int:exam_id>", methods=["GET", "POST"])
def exam_page(exam_id):
    if "student_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM exams WHERE id=? AND active=1", (exam_id,)).fetchone()
    
    if not exam:
        conn.close()
        return "Exam not active or doesn't exist."
    
    student_id = session["student_id"]
    
    # Check for existing attempt
    attempt = conn.execute("""
        SELECT * FROM scores WHERE student_id=? AND exam_id=? AND status='in_progress'
    """, (student_id, exam_id)).fetchone()
    
    if not attempt:
        conn.close()
        return redirect(f"/exam_start/{exam_id}")
        
    if attempt["is_paused"] == 1:
        conn.close()
        return render_template("exam_paused.html", 
                               exam=exam, 
                               attempt=attempt,
                               pause_reason=attempt["pause_reason"] if "pause_reason" in attempt.keys() and attempt["pause_reason"] else "Examination is paused or interrupted.",
                               student_name=session.get("full_name", session["username"]))
        
    sess_key = attempt["session_key"] if "session_key" in attempt.keys() and attempt["session_key"] else None
    if not sess_key:
        sess_key = secrets.token_hex(16)
        conn.execute("UPDATE scores SET session_key=?, last_heartbeat=CURRENT_TIMESTAMP WHERE id=?", (sess_key, attempt["id"]))
        conn.commit()
        att_dict = dict(attempt)
        att_dict["session_key"] = sess_key
        attempt = att_dict

    # Auto-heal missing authoritative_deadline for active attempt with trustworthy start_time
    att_dict = dict(attempt) if isinstance(attempt, sqlite3.Row) else (attempt or {})
    if not att_dict.get("authoritative_deadline") and att_dict.get("start_time"):
        try:
            st_dt = datetime.strptime(str(att_dict["start_time"]).split('.')[0], "%Y-%m-%d %H:%M:%S")
            reconstructed_dl = (st_dt + timedelta(minutes=int(exam["duration"] or 30))).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE scores SET authoritative_deadline=? WHERE id=? AND authoritative_deadline IS NULL", (reconstructed_dl, att_dict["id"]))
            conn.commit()
            attempt = dict(att_dict)
            attempt["authoritative_deadline"] = reconstructed_dl
        except Exception:
            pass

    remaining_secs = calculate_authoritative_remaining_time(attempt, exam["duration"])
    if remaining_secs <= 0 and attempt["status"] == "in_progress":
        finalize_regular_exam_attempt(attempt["id"], conn=conn)
        conn.commit()
        final_att = conn.execute("SELECT * FROM scores WHERE id=?", (attempt["id"],)).fetchone()
        conn.close()
        session.pop(f'exam_{exam_id}_questions', None)
        if request.method == "POST":
            score = final_att["score"] if final_att else 0
            total = final_att["total"] if final_att else (attempt["total"] or 0)
            percentage = final_att["percentage"] if final_att else 0
            return {
                "success": True,
                "expired": True,
                "score": score,
                "total": total,
                "percentage": percentage,
                "passed": percentage >= 50,
                "exam_name": exam["name"]
            }
        return redirect(f"/result/{exam_id}")
    
    # =====================================================
    # SERVER-SIDE RECOVERY: Read question order from SQLite (never bloat 4KB session cookie)
    # =====================================================
    stored_questions = None
    if attempt and attempt["current_progress"]:
        try:
            progress = json.loads(attempt["current_progress"])
            if progress.get('question_order'):
                stored_questions = json.dumps(progress['question_order'])
        except Exception as e:
            print(f"Could not recover question order: {e}")
    if not stored_questions:
        stored_questions = session.pop(f'exam_{exam_id}_questions', None)
    
    if stored_questions:
        import json
        selected_data = json.loads(stored_questions)
        question_ids = [item['question_id'] for item in selected_data]
        
        if question_ids:
            placeholders = ",".join("?" * len(question_ids))
            questions_raw = conn.execute(f"""
                SELECT q.*, 
                       g.group_name, g.group_content, g.group_image, g.instruction_text, g.group_type
                FROM questions q
                LEFT JOIN exam_question_groups g ON q.group_id = g.id
                WHERE q.id IN ({placeholders})
            """, question_ids).fetchall()
            
            # Build a map and preserve ORDER
            question_map = {q['id']: q for q in questions_raw}
            questions = []
            for item in selected_data:
                q = dict(question_map.get(item['question_id'], {}))
                if q:
                    q['question_id'] = q['id']
                    q['section_name'] = item.get('section_name', '')
                    q['section_id'] = item.get('section_id')
                    if item.get('group_data'):
                        q['group_name'] = item['group_data'].get('group_name')
                        q['group_content'] = item['group_data'].get('group_content')
                        q['group_image'] = item['group_data'].get('group_image')
                        q['instruction_text'] = item['group_data'].get('instruction_text')
                    questions.append(q)
            
            # Update the attempt total to match selected questions
            if len(questions) != attempt["total"]:
                conn.execute("UPDATE scores SET total=? WHERE id=?", (len(questions), attempt["id"]))
                conn.commit()
        else:
            questions = []
    else:
        # No stored data - fallback to all questions (shouldn't happen normally)
        questions_raw = conn.execute("""
            SELECT q.*, 
                   g.group_name, g.group_content, g.group_image, g.instruction_text, g.group_type
            FROM questions q
            LEFT JOIN exam_question_groups g ON q.group_id = g.id
            WHERE q.exam_id=?
            ORDER BY q.id
        """, (exam_id,)).fetchall()
        
        questions = []
        for q in questions_raw:
            q_dict = dict(q)
            q_dict['question_id'] = q_dict['id']
            questions.append(q_dict)
        
        import random
        random.shuffle(questions)
    
    # Generate shuffled options
    import random
    import json
    
    for q in questions:
        original_options = [
            {'letter': 'A', 'text': q.get('option1', '')},
            {'letter': 'B', 'text': q.get('option2', '')},
            {'letter': 'C', 'text': q.get('option3', '')},
            {'letter': 'D', 'text': q.get('option4', '')}
        ]
        shuffled = original_options.copy()
        random.shuffle(shuffled)
        q['shuffled_options_data'] = {'options': shuffled}
    
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    
    if request.method == "POST":
        existing_check = conn.execute("SELECT * FROM scores WHERE student_id=? AND exam_id=? ORDER BY id DESC LIMIT 1", (student_id, exam_id)).fetchone()
        if existing_check and existing_check["status"] == "completed":
            score = existing_check["score"] or 0
            total = existing_check["total"] or len(questions)
            percentage = existing_check["percentage"] or 0
            is_withheld = (existing_check["results_released"] == 0 or (exam.get("result_release_policy") == "withheld" and not exam.get("results_released")))
            conn.close()
            if is_withheld:
                return {
                    "success": True,
                    "results_withheld": True,
                    "exam_name": exam["name"],
                    "message": "Exam submitted successfully. Results are withheld pending administrative release."
                }
            return {
                "success": True,
                "score": score,
                "total": total,
                "percentage": percentage,
                "passed": percentage >= 50,
                "exam_name": exam["name"]
            }

        # Check authoritative deadline at the exact moment of POST submission
        server_rem = calculate_authoritative_remaining_time(attempt, exam["duration"])
        if server_rem <= 0:
            final_att = finalize_regular_exam_attempt(attempt["id"], conn=conn, auto_submitted_reason="Time expired")
            conn.commit()
            conn.close()
            session.pop(f'exam_{exam_id}_questions', None)
            score = final_att["score"] if final_att else 0
            total = final_att["total"] if final_att else len(questions)
            percentage = final_att["percentage"] if final_att else 0
            is_withheld = (final_att.get("results_released") == 0 if final_att else (exam.get("result_release_policy") == "withheld" and not exam.get("results_released")))
            if is_withheld:
                return {
                    "success": True,
                    "expired": True,
                    "results_withheld": True,
                    "exam_name": exam["name"],
                    "message": "Time expired. Exam submitted successfully. Results are withheld pending administrative release."
                }
            return {
                "success": True,
                "expired": True,
                "score": score,
                "total": total,
                "percentage": percentage,
                "passed": percentage >= 50,
                "exam_name": exam["name"]
            }

        warning_count = int(request.form.get("warning_count", 0))
        attempt_id = attempt["id"]
        form_answers = {}
        time_data = {}
        for q in questions:
            user_ans = request.form.get(f"q{q['id']}")
            if user_ans is not None:
                form_answers[f"q{q['id']}"] = user_ans
            time_spent = request.form.get(f"time_{q['id']}", 0)
            if time_spent is not None:
                time_data[f"time_{q['id']}"] = time_spent

        final_att = finalize_regular_exam_attempt(attempt_id, answers=form_answers, time_data=time_data, conn=conn)

        if warning_count > 0:
            conn.execute("""
                INSERT INTO warning_logs (student_id, student_name, exam_id, exam_name, warning_message, warning_count)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (student_id, session["username"], exam_id, exam["name"], 
                  f"Exam submitted with {warning_count} warnings", warning_count))
        
        conn.commit()
        conn.close()
        
        session.pop(f'exam_{exam_id}_questions', None)
        
        score = final_att["score"] if final_att else 0
        total = final_att["total"] if final_att else len(questions)
        percentage = final_att["percentage"] if final_att else 0
        passed = percentage >= 50
        is_withheld = (final_att.get("results_released") == 0 if final_att else (exam.get("result_release_policy") == "withheld" and not exam.get("results_released")))
        if is_withheld:
            return {
                "success": True,
                "results_withheld": True,
                "exam_name": exam["name"],
                "message": "Exam submitted successfully. Results are withheld pending administrative release."
            }
        return {
            "success": True,
            "score": score,
            "total": total,
            "percentage": percentage,
            "passed": passed,
            "exam_name": exam["name"]
        }
    
    warning_count = attempt["warnings_count"] if "warnings_count" in attempt.keys() and attempt["warnings_count"] is not None else 0
    s_cfg = conn.execute("SELECT max_warnings, anti_cheating_profile FROM school_settings WHERE id=1").fetchone()
    cfg_max_w = int(s_cfg["max_warnings"]) if (s_cfg and s_cfg["max_warnings"]) else 5
    anti_cheat_profile = str(s_cfg["anti_cheating_profile"] or "medium").lower() if s_cfg else "medium"
    max_w = exam["max_warnings"] if "max_warnings" in exam.keys() and exam["max_warnings"] else (attempt.get("max_warnings") or cfg_max_w)

    max_rev_row = conn.execute("SELECT MAX(client_revision) as max_rev FROM exam_question_responses WHERE attempt_id=?", (attempt["id"],)).fetchone()
    max_rev = int(max_rev_row["max_rev"] or 0) if max_rev_row else 0
    conn.close()

    return render_template("exam_page_new.html", 
                         exam=exam, 
                         questions=questions,
                         attempt_id=attempt["id"],
                         student=student,
                         remaining_time=remaining_secs,
                         session_key=sess_key,
                         warning_count=warning_count,
                         max_warnings=max_w,
                         anti_cheating_profile=anti_cheat_profile,
                         max_revision=max_rev)


@exam_regular_bp.route('/exam_save_single_answer', methods=['POST'])
def exam_save_single_answer():
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    try:
        data = request.get_json(silent=True) or {}
        attempt_id = data.get('attempt_id')
        question_id = data.get('question_id')
        user_answer = data.get('user_answer')
        time_spent = int(data.get('time_spent', 0) or 0)
        session_key = data.get('session_key')
        client_revision = data.get('client_revision')
        client_timestamp = data.get('client_timestamp')
        
        if not attempt_id or not question_id:
            return {"error": "attempt_id and question_id are required"}, 400
            
        result = save_regular_answer(
            student_id=session["student_id"],
            attempt_id=attempt_id,
            question_id=question_id,
            user_answer=user_answer,
            time_spent=time_spent,
            session_key=session_key,
            client_revision=client_revision,
            client_timestamp=client_timestamp
        )
        status_code = result.pop("status_code", 200)
        return result, status_code
    except Exception as e:
        return {"success": False, "error": "Failed to save answer"}, 500


@exam_regular_bp.route('/exam_heartbeat', methods=['POST'])
def exam_heartbeat():
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json(silent=True) or {}
    attempt_id = data.get('attempt_id')
    session_key = data.get('session_key')
    
    if not attempt_id:
        return {"error": "attempt_id required"}, 400
        
    result = process_regular_heartbeat(
        student_id=session["student_id"],
        attempt_id=attempt_id,
        session_key=session_key
    )
    status_code = result.pop("status_code", 200)
    return result, status_code


@exam_regular_bp.route('/exam_auto_save', methods=['POST'])
def exam_auto_save():
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    try:
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
        is_closing = data.get('is_closing', False)
        session_key = data.get('session_key')
        
        conn = get_db_connection()
        
        attempt = conn.execute("""
            SELECT id, exam_id, student_id, status, remaining_time, authoritative_deadline, start_time, is_paused, session_key, pause_reason 
            FROM scores WHERE id=?
        """, (attempt_id,)).fetchone()
        if not attempt:
            conn.close()
            return {"error": "Attempt not found"}, 404
        if attempt["student_id"] != session["student_id"]:
            conn.close()
            return {"error": "Forbidden: Not your exam attempt"}, 403
        if attempt["status"] != "in_progress":
            conn.close()
            return {"success": True, "already_completed": True, "remaining_time": 0}
            
        # Session fencing
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                conn.close()
                return {"error": "Session superseded", "superseded": True}, 403

        if attempt["is_paused"] == 1:
            conn.close()
            return {"success": True, "paused": True, "remaining_time": int(attempt["remaining_time"] or 0)}

        exam_id = attempt["exam_id"]
        exam = conn.execute("SELECT duration FROM exams WHERE id=?", (exam_id,)).fetchone()
        exam_duration = exam["duration"] if exam else 30
        
        # Auto-heal missing authoritative_deadline
        if not attempt.get("authoritative_deadline") and attempt.get("start_time"):
            try:
                st_dt = datetime.strptime(str(attempt["start_time"]).split('.')[0], "%Y-%m-%d %H:%M:%S")
                reconstructed_dl = (st_dt + timedelta(minutes=int(exam_duration or 30))).strftime('%Y-%m-%d %H:%M:%S')
                conn.execute("UPDATE scores SET authoritative_deadline=? WHERE id=? AND authoritative_deadline IS NULL", (reconstructed_dl, attempt_id))
                conn.commit()
                attempt = dict(attempt)
                attempt["authoritative_deadline"] = reconstructed_dl
            except Exception:
                pass

        # Calculate server-authoritative remaining time
        server_remaining = calculate_authoritative_remaining_time(attempt, exam_duration)
        
        # Build progress data with question order
        progress_data = {
            'answers': answers, 
            'current_index': current_index, 
            'time_data': time_data
        }
        
        if exam_id:
            stored_questions = session.get(f'exam_{exam_id}_questions')
            if stored_questions:
                try:
                    progress_data['question_order'] = json.loads(stored_questions)
                except Exception:
                    pass
            elif attempt.get("current_progress"):
                try:
                    prev_prog = json.loads(attempt["current_progress"])
                    if prev_prog.get("question_order"):
                        progress_data['question_order'] = prev_prog["question_order"]
                except Exception:
                    pass
        
        if server_remaining <= 0:
            conn.execute("""
                UPDATE scores SET current_progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            """, (json.dumps(progress_data), attempt_id))
            conn.commit()
            finalize_regular_exam_attempt(attempt_id, conn=conn)
            conn.close()
            return {"success": True, "time_up": True, "remaining_time": 0}
        
        # Note: warnings_count is NOT updated from client data!
        conn.execute("""
            UPDATE scores 
            SET current_progress = ?, remaining_time = ?, last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND student_id = ? AND status = 'in_progress' AND is_paused = 0
        """, (json.dumps(progress_data), server_remaining, attempt_id, session["student_id"]))
        
        if is_closing:
            conn.execute("""
                UPDATE scores 
                SET resume_requested = 1, is_paused = 1, paused_at = CURRENT_TIMESTAMP,
                    paused_by = 'auto_lock', pause_reason = 'Browser or tab closed', tab_closed = 1, remaining_time = ?
                WHERE id = ? AND student_id = ? AND status = 'in_progress'
            """, (server_remaining, attempt_id, session["student_id"]))
        
        conn.commit()
        conn.close()
        return {"success": True, "remaining_time": server_remaining}
    except Exception as e:
        return {"success": False, "error": str(e)}


@exam_regular_bp.route('/exam_check_pause/<int:attempt_id>', methods=['GET'])
def exam_check_pause(attempt_id):
    """Check if exam is paused, force submitted, or time is up according to authoritative server clock"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT student_id, is_paused, paused_by, pause_reason, updated_at, last_heartbeat, status, force_submit, remaining_time, warnings_count,
               authoritative_deadline, start_time, exam_id
        FROM scores WHERE id=?
    """, (attempt_id,)).fetchone()
    
    if not attempt:
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": False, "remaining_time": 0}
    
    if attempt["student_id"] != session["student_id"]:
        conn.close()
        return {"error": "Forbidden: Not your exam attempt"}, 403
    
    attempt = dict(attempt)

    if attempt["status"] != "in_progress":
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": True, "time_up": True,
                "remaining_time": 0, "warnings_count": attempt.get("warnings_count")}

    exam = conn.execute("SELECT duration FROM exams WHERE id=?", (attempt["exam_id"],)).fetchone()
    exam_duration = exam["duration"] if exam else 30
    server_remaining = calculate_authoritative_remaining_time(attempt, exam_duration)

    if server_remaining <= 0:
        finalize_regular_exam_attempt(attempt_id, conn=conn)
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": True, "time_up": True,
                "remaining_time": 0, "warnings_count": attempt.get("warnings_count")}
    
    if attempt.get('force_submit') == 1:
        conn.close()
        return {"paused": False, "paused_by": None, "force_submit": True, 
                "remaining_time": server_remaining, 
                "warnings_count": attempt.get("warnings_count")}
    
    # Heartbeat timeout / crash detection (25-second lease threshold)
    if attempt['status'] == 'in_progress' and attempt['is_paused'] == 0:
        stale = False
        last_hb = attempt.get('last_heartbeat') or attempt.get('updated_at')
        if last_hb:
            try:
                last_update = datetime.strptime(str(last_hb).split('.')[0], '%Y-%m-%d %H:%M:%S')
                stale = (get_utc_now() - last_update) > timedelta(seconds=25)
            except Exception:
                stale = False
        
        if stale:
            conn.execute("""
                UPDATE scores
                SET is_paused=1, paused_at=CURRENT_TIMESTAMP, paused_by='heartbeat_timeout',
                    pause_reason='Connection lost / heartbeat timeout', tab_closed=1, remaining_time=?
                WHERE id=? AND student_id=? AND status='in_progress' AND is_paused=0
            """, (server_remaining, attempt_id, session["student_id"]))
            conn.commit()
            conn.close()
            return {"paused": True, "paused_by": "heartbeat_timeout", "pause_reason": "Connection lost / heartbeat timeout", "force_submit": False,
                    "remaining_time": server_remaining,
                    "warnings_count": attempt.get("warnings_count")}
    
    paused = attempt['is_paused'] == 1
    paused_by = attempt['paused_by']
    pause_reason = attempt.get('pause_reason')

    conn.close()
    
    return {"paused": paused, "paused_by": paused_by, "pause_reason": pause_reason, "force_submit": False,
            "remaining_time": server_remaining, "warnings_count": attempt.get("warnings_count")}


@exam_regular_bp.route('/exam_get_state/<int:attempt_id>', methods=['GET'])
def exam_get_state(attempt_id):
    """Get saved exam state for resume"""
    is_teacher_or_admin = session.get("role") in ["Admin", "Teacher"] or "admin_id" in session or "teacher_id" in session
    student_id = session.get("student_id")
    if not is_teacher_or_admin and not student_id:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT student_id, current_progress, remaining_time, warnings_count, status FROM scores WHERE id=?", (attempt_id,)).fetchone()
    max_rev_row = conn.execute("SELECT MAX(client_revision) as max_rev FROM exam_question_responses WHERE attempt_id=?", (attempt_id,)).fetchone()
    conn.close()
    
    if not attempt:
        return {"error": "Attempt not found"}, 404
        
    if not is_teacher_or_admin and attempt["student_id"] != student_id:
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


@exam_regular_bp.route('/exam_check_resume_approved/<int:attempt_id>', methods=['GET'])
def exam_check_resume_approved(attempt_id):
    """Check if admin approved resume request"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("SELECT student_id, resume_requested, is_paused, paused_by FROM scores WHERE id=?", (attempt_id,)).fetchone()
    conn.close()
    
    if not attempt:
        return {"resume_requested": False, "approved": False, "paused_by": None}
    
    if attempt["student_id"] != session["student_id"]:
        return {"error": "Forbidden: Not your exam attempt"}, 403
    
    approved = (attempt["resume_requested"] == 0 and attempt["is_paused"] == 0)
    return {
        "resume_requested": attempt["resume_requested"] == 1,
        "approved": approved,
        "paused_by": attempt["paused_by"]
    }


@exam_regular_bp.route('/exam_request_resume', methods=['POST'])
def exam_request_resume():
    """Student requests to resume exam"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json(silent=True) or {}
    attempt_id = data.get('attempt_id')
    
    conn = get_db_connection()
    
    attempt = conn.execute("SELECT * FROM scores WHERE id=? AND student_id=?", 
                          (attempt_id, session["student_id"])).fetchone()
    
    if not attempt:
        conn.close()
        return {"error": "Attempt not found"}, 404
    
    conn.execute("""
        UPDATE scores 
        SET resume_requested=1, resume_requested_at=CURRENT_TIMESTAMP, is_paused=1, status='in_progress'
        WHERE id=? AND student_id=?
    """, (attempt_id, session["student_id"]))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Resume request sent to admin"}


@exam_regular_bp.route('/exam_clear_auto_lock/<int:attempt_id>', methods=['POST'])
def exam_clear_auto_lock(attempt_id):
    """Clear auto-lock after quick reload and re-anchor authoritative deadline"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT remaining_time, paused_at, is_paused, paused_by 
        FROM scores 
        WHERE id=? AND student_id=? AND paused_by='auto_lock'
    """, (attempt_id, session["student_id"])).fetchone()
    
    if not attempt or attempt["is_paused"] != 1:
        conn.close()
        return {"success": False, "error": "Attempt not auto-locked or not found"}, 404
        
    # Check how long the attempt has been auto-locked
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
        
    rem = int(attempt["remaining_time"] or 0)
    new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        UPDATE scores 
        SET resume_requested = 0, is_paused = 0, paused_at = NULL, paused_by = NULL, authoritative_deadline = ?
        WHERE id = ? AND student_id = ? AND paused_by = 'auto_lock'
    """, (new_dl, attempt_id, session["student_id"]))
    conn.commit()
    conn.close()
    return {"success": True}


@exam_regular_bp.route('/exam_check_active_session/<int:attempt_id>', methods=['GET'])
def exam_check_active_session(attempt_id):
    """Check if another tab is running this exam"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401

    from datetime import datetime, timedelta
    
    conn = get_db_connection()
    attempt = conn.execute("""
        SELECT student_id, status, is_paused, updated_at, current_progress, remaining_time, warnings_count 
        FROM scores WHERE id=?
    """, (attempt_id,)).fetchone()
    conn.close()
    
    if not attempt:
        return {"active_elsewhere": False}

    if attempt["student_id"] != session["student_id"]:
        return {"error": "Forbidden: Not your exam attempt"}, 403
    
    if attempt['status'] != 'in_progress' or attempt['is_paused'] == 1:
        return {"active_elsewhere": False}
    
    try:
        last_update = datetime.strptime(attempt['updated_at'], '%Y-%m-%d %H:%M:%S')
        recently_active = (datetime.utcnow() - last_update) < timedelta(seconds=20)
    except Exception:
        recently_active = False
    
    return {"active_elsewhere": recently_active}


@exam_regular_bp.route('/exam_auto_submit_close', methods=['POST'])
def exam_auto_submit_close():
    """Lock exam when tab closes"""
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    try:
        data = request.get_json(silent=True) or {}
        attempt_id = data.get('attempt_id')
        if not attempt_id:
            return {"error": "attempt_id is required"}, 400
        
        conn = get_db_connection()
        conn.execute("""
            UPDATE scores 
            SET resume_requested = 1, is_paused = 1, paused_at = CURRENT_TIMESTAMP, paused_by = 'auto_lock'
            WHERE id = ? AND student_id = ? AND status = 'in_progress' AND is_paused = 0
        """, (attempt_id, session["student_id"]))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": "Internal server error"}, 500


@exam_regular_bp.route('/log_warning', methods=['POST'])
def log_warning():
    if "student_id" not in session:
        return {"error": "Unauthorized"}, 401
    
    data = request.get_json(silent=True) or {}
    if not data and request.data:
        try:
            import json as _json
            data = _json.loads(request.get_data(as_text=True))
        except Exception:
            data = {}
            
    exam_id = data.get('exam_id')
    warning_message = data.get('warning_message', 'Suspicious activity detected')
    attempt_id = data.get('attempt_id')
    
    result = log_regular_warning(
        student_id=session["student_id"],
        exam_id=exam_id,
        warning_message=warning_message,
        attempt_id=attempt_id,
        student_name=session.get("username", "student")
    )
    return result


@exam_regular_bp.route("/result/<int:exam_id>")
def result(exam_id):
    if "student_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    score_data = conn.execute("""
        SELECT scores.score, scores.total, scores.percentage, scores.grade_label, 
               scores.grade_remark, scores.results_released,
               exams.name AS exam_name, exams.result_release_policy, exams.results_released as exam_results_released
        FROM scores
        JOIN exams ON scores.exam_id = exams.id
        WHERE scores.student_id=? AND scores.exam_id=?
        ORDER BY scores.id DESC
    """, (session["student_id"], exam_id)).fetchone()
    
    conn.close()
    
    if not score_data:
        return "No result found."
    
    exam_name = score_data["exam_name"]
    username = session["username"]
    
    # Check if results are withheld
    is_withheld = (score_data["results_released"] == 0 or (score_data["result_release_policy"] == "withheld" and not score_data["exam_results_released"]))
    if is_withheld:
        return render_template(
            "result.html",
            score=0,
            total=0,
            exam_name=exam_name,
            username=username,
            passed=False,
            withheld=True
        )

    score = score_data["score"] or 0
    total = score_data["total"] if score_data["total"] else 0
    percentage = (score / total) * 100 if total > 0 else 0
    passed = True if percentage >= 50 else False
    
    return render_template(
        "result.html",
        score=score,
        total=total,
        exam_name=exam_name,
        username=username,
        passed=passed,
        withheld=False
    )


