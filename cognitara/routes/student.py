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
student_bp = Blueprint('student', __name__)

@student_bp.route("/dashboard")
@student_bp.route("/student")
def dashboard():
    if "student_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    student_class = session["class"]
    student_id = session["student_id"]
    
    # Get student's specialisation
    student_specialisation = "General"
    try:
        student_info = conn.execute("""
            SELECT specialisation FROM students WHERE id=?
        """, (student_id,)).fetchone()
        
        if student_info and student_info["specialisation"]:
            student_specialisation = student_info["specialisation"]
    except sqlite3.OperationalError:
        pass
    
    # SMART OVERRIDE: Get available exams
    try:
        exams = conn.execute("""
            SELECT * FROM exams 
            WHERE class = ? 
            AND active = 1
            AND (specialisation_tag = 'General' OR specialisation_tag = ? OR specialisation_tag IS NULL)
            AND id NOT IN (
                SELECT exam_id FROM scores WHERE student_id = ? AND status = 'completed'
            )
            ORDER BY id DESC
        """, (student_class, student_specialisation, student_id)).fetchall()
    except sqlite3.OperationalError:
        exams = conn.execute("""
            SELECT * FROM exams 
            WHERE class = ? 
            AND active = 1
            AND id NOT IN (
                SELECT exam_id FROM scores WHERE student_id = ? AND status = 'completed'
            )
            ORDER BY id DESC
        """, (student_class, student_id)).fetchall()
    
    # FIXED: Get in-progress exams - handle missing started_at column
    try:
        in_progress = conn.execute("""
            SELECT e.*, s.id as attempt_id, s.status as attempt_status, 
                   COALESCE(s.start_time, 'Unknown') as started_at
            FROM exams e
            JOIN scores s ON e.id = s.exam_id
            WHERE s.student_id = ? AND s.status = 'in_progress'
        """, (student_id,)).fetchall()
    except sqlite3.OperationalError:
        # Fallback without started_at
        in_progress = conn.execute("""
            SELECT e.*, s.id as attempt_id, s.status as attempt_status,
                   'In Progress' as started_at
            FROM exams e
            JOIN scores s ON e.id = s.exam_id
            WHERE s.student_id = ? AND s.status = 'in_progress'
        """, (student_id,)).fetchall()
    
    # Get completed exams
    try:
        completed = conn.execute("""
            SELECT exams.name as exam_name, scores.score, COALESCE(scores.total, 0) as total,
                   exams.subject_tag, exams.specialisation_tag,
                   COALESCE(scores.results_released, 1) as results_released,
                   COALESCE(exams.result_release_policy, 'immediate') as result_release_policy,
                   COALESCE(exams.results_released, 1) as exam_results_released,
                   scores.grade_label, scores.grade_remark
            FROM scores 
            JOIN exams ON scores.exam_id = exams.id
            WHERE scores.student_id = ? AND scores.status = 'completed'
            ORDER BY scores.id DESC
        """, (student_id,)).fetchall()
    except sqlite3.OperationalError:
        completed = conn.execute("""
            SELECT exams.name as exam_name, scores.score, COALESCE(scores.total, 0) as total,
                   1 as results_released, 'immediate' as result_release_policy, 1 as exam_results_released,
                   NULL as grade_label, NULL as grade_remark
            FROM scores 
            JOIN exams ON scores.exam_id = exams.id
            WHERE scores.student_id = ? AND scores.status = 'completed'
            ORDER BY scores.id DESC
        """, (student_id,)).fetchall()
    
    conn.close()
    
    return render_template("dashboard.html", 
                           exams=exams,
                           in_progress=in_progress,
                           completed=completed, 
                           username=session["username"],
                           full_name=session.get("full_name", session["username"]),
                           specialisation=student_specialisation,
                           photo=session.get("photo") or "default.png")


@student_bp.route("/ce_dashboard")
def ce_dashboard_page():
    if "ce_student_id" not in session:
        return redirect("/ce_login")
    
    conn = get_db_connection()
    exam = conn.execute("SELECT * FROM ce_exams WHERE id=?", (session["ce_exam_id"],)).fetchone()
    
    existing_attempt = conn.execute("""
        SELECT * FROM ce_attempts WHERE student_id=? AND exam_id=?
    """, (session["ce_student_id"], session["ce_exam_id"])).fetchone()
    
    conn.close()
    
    return render_template("ce_dashboard.html", exam=exam, existing_attempt=existing_attempt, student_name=session["ce_student_name"])


@student_bp.route("/ce_start")
def ce_start_exam():
    if "ce_student_id" not in session:
        return redirect("/ce_login")
    
    conn = get_db_connection()
    exam_id = session["ce_exam_id"]
    student_id = session["ce_student_id"]
    
    # ========== CRITICAL: CHECK FOR EXISTING ATTEMPT FIRST ==========
    existing = conn.execute("""
        SELECT id, exam_id, status, resume_requested, is_paused, pause_reason, remaining_time, 
               current_progress, warnings_count
        FROM ce_attempts 
        WHERE student_id=? AND exam_id=?
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if existing:
        # If there's an in-progress attempt, check pause before redirecting
        if existing["status"] == "in_progress":
            if existing["is_paused"] == 1:
                exam_row = conn.execute("SELECT * FROM ce_exams WHERE id=?", (existing["exam_id"],)).fetchone()
                conn.close()
                return render_template("exam_paused.html",
                                       attempt=existing,
                                       exam=dict(exam_row) if exam_row else None,
                                       pause_reason=existing["pause_reason"] or "Your examination attempt has been paused.",
                                       is_ce=True,
                                       role="student")
            session["ce_attempt_id"] = existing["id"]
            conn.close()
            return redirect(f"/ce_exam/{existing['id']}")
        
        # If pending approval, show message
        elif existing["status"] == "pending":
            conn.close()
            return render_template("ce_dashboard.html", 
                                   exam=None, 
                                   existing_attempt=existing,
                                   error="Your exam is pending review by admin",
                                   student_name=session["ce_student_name"])
        
        # If already approved, cannot retake
        elif existing["status"] == "approved":
            conn.close()
            return render_template("ce_dashboard.html", 
                                   exam=None, 
                                   existing_attempt=existing,
                                   error="You have already completed and passed this exam",
                                   student_name=session["ce_student_name"])
        
        # If rejected, allow new attempt (fall through to create new)
        elif existing["status"] == "rejected":
            # Delete old rejected attempt data
            conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id=?", (existing["id"],))
            conn.execute("DELETE FROM ce_attempts WHERE id=?", (existing["id"],))
            conn.commit()
            # Continue to create new attempt below
    
    # Get exam details
    exam = conn.execute("SELECT * FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        return "Exam not found", 404
    # NEW CODE: Block new attempts if exam is closed! 
    if not exam["active"]:
        # Only block them if they are trying to start a new exam. 
        # (We still allow them to resume an exam they are currently writing)
        if not existing or existing["status"] in ["rejected", "approved", "pending"]:
            conn.close()
            return render_template("ce_dashboard.html", 
                                   exam=exam, 
                                   existing_attempt=existing,
                                   error="This exam has not been started yet by the Admin.",
                                   student_name=session["ce_student_name"])
    total_exam_limit = exam["total_questions_to_show"]
    
    # Get all sections for this exam
    sections = conn.execute("""
    SELECT * FROM ce_sections 
    WHERE exam_id=? AND active=1 
    ORDER BY section_order
""", (exam_id,)).fetchall()
    
    # FIRST PASS: Calculate mandatory and normal counts per section
    section_info = []
    total_mandatory = 0
    total_normal_available = 0
    
    for section in sections:
        section_id = section["id"]
        
        # Get counts
        mandatory_count = conn.execute("""
            SELECT COUNT(*) as count FROM ce_questions 
            WHERE section_id=? AND mandatory=1
        """, (section_id,)).fetchone()["count"]
        
        normal_count = conn.execute("""
            SELECT COUNT(*) as count FROM ce_questions 
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
    normal_to_show_total = total_exam_limit - total_mandatory
    if normal_to_show_total < 0:
        normal_to_show_total = 0
    # =========================================================================
    # PHASE 2: THE WATERFALL MATH (Respect explicit limits first)
    # =========================================================================
    fixed_sections = []
    dynamic_sections = []
    for sec in section_info:
        if sec["questions_to_show"] > 0:
            # How many normal questions this section actually wants
            desired = sec["questions_to_show"] - sec["mandatory_count"]
            desired = max(0, desired) # Can't be negative
            desired = min(desired, sec["normal_count"]) # Can't ask for more than exists
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
            sec["normal_allocation"] = 0 # Sorry, no room for "All" sections
            
        # Fix any rounding errors
        diff = normal_to_show_total - sum(sec["normal_allocation"] for sec in fixed_sections)
        for sec in fixed_sections:
            if diff > 0 and sec["normal_allocation"] < sec["desired_normal"]:
                sec["normal_allocation"] += 1; diff -= 1
            elif diff < 0 and sec["normal_allocation"] > 0:
                sec["normal_allocation"] -= 1; diff += 1
            if diff == 0: break
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
                    sec["normal_allocation"] += 1; diff -= 1
                elif diff < 0 and sec["normal_allocation"] > 0:
                    sec["normal_allocation"] -= 1; diff += 1
                if diff == 0: break
    # =========================================================================
    # PHASE 3: FETCH & RANDOMIZE (With the Group Integrity Fix)
    # =========================================================================
    import random
    import json
    
    all_questions_by_section = []
    
    for sec_info in section_info:
        section_id = sec_info["id"]
        section_name = sec_info["name"]
        randomize = sec_info["randomize"]
        normal_allocation = sec_info["normal_allocation"]
        
        # Get all questions from this section with group info
        all_questions = conn.execute("""
            SELECT q.*, s.section_name, s.id as section_id,
                   g.group_name, g.group_content, g.group_image, g.instruction_text, g.group_type, g.id as group_db_id
            FROM ce_questions q
            JOIN ce_sections s ON q.section_id = s.id
            LEFT JOIN ce_question_groups g ON q.group_id = g.id
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
                            normal_items.append({'type': 'sequence_group', 'group_id': group_id, 'group_data': group_data, 'questions': group_data['normal_questions'].copy()})
                        elif group_type == 'comprehension':
                            normal_items.append({'type': 'comprehension_group', 'group_id': group_id, 'group_data': group_data, 'questions': group_data['normal_questions'].copy()})
                        else:
                            for q in group_data['normal_questions']:
                                normal_items.append({'type': 'normal_group_question', 'group_id': group_id, 'group_data': group_data, 'question': q})
                
                for q in normal_ungrouped:
                    normal_items.append({'type': 'ungrouped_normal', 'question': q})
                
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
                            section_final_questions.append({'type': 'group_normal_sequence', 'group_id': item['group_id'], 'group_data': group_data, 'question': q, 'is_first_in_group': (idx == 0), 'total_in_group': len(item['questions'])})
                    elif item['type'] == 'comprehension_group':
                        questions_copy = item['questions'].copy()
                        random.shuffle(questions_copy)
                        group_data = item['group_data']
                        for idx, q in enumerate(questions_copy):
                            section_final_questions.append({'type': 'group_normal_comprehension', 'group_id': item['group_id'], 'group_data': group_data, 'question': q, 'is_first_in_group': (idx == 0)})
                    elif item['type'] == 'normal_group_question':
                        section_final_questions.append({'type': 'group_normal_individual', 'group_id': item['group_id'], 'group_data': item['group_data'], 'question': item['question']})
                    else:
                        section_final_questions.append({'type': 'ungrouped_normal', 'question': item['question']})
            else:
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
                                section_final_questions.append({'type': 'group_normal_sequence', 'group_id': group_id, 'group_data': group_data, 'question': q, 'is_first_in_group': (idx == 0), 'total_in_group': q_count})
                        elif group_data['group_type'] == 'comprehension':
                            for idx, q in enumerate(group_data['normal_questions']):
                                section_final_questions.append({'type': 'group_normal_comprehension', 'group_id': group_id, 'group_data': group_data, 'question': q, 'is_first_in_group': (idx == 0)})
                        else:
                            for q in group_data['normal_questions']:
                                section_final_questions.append({'type': 'group_normal_individual', 'group_id': group_id, 'group_data': group_data, 'question': q})
                        
                        normal_added += q_count
                
                # Add ungrouped questions to fill remainder
                for q in normal_ungrouped:
                    if normal_added >= normal_allocation:
                        break
                    section_final_questions.append({'type': 'ungrouped_normal', 'question': q})
                    normal_added += 1
        
        all_questions_by_section.append({
            'section_id': section_id,
            'section_name': section_name,
            'section_order': sec_info["section_order"],
            'questions': section_final_questions
        })
    
    all_questions_by_section.sort(key=lambda x: x['section_order'])
    
    # ========== CREATE ATTEMPT WITH REMAINING_TIME ==========
    authoritative_deadline = (get_utc_now() + timedelta(minutes=exam["duration"])).strftime('%Y-%m-%d %H:%M:%S')
    cursor = conn.execute("""
        INSERT INTO ce_attempts (student_id, exam_id, status, started_at, remaining_time, max_warnings, authoritative_deadline)
        VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP, ?, ?, ?)
    """, (student_id, exam_id, exam["duration"] * 60, exam["max_warnings"] if exam["max_warnings"] else 5, authoritative_deadline))
    
    attempt_id = cursor.lastrowid
    
    # Save questions to attempt_questions
    for section in all_questions_by_section:
        for q in section['questions']:
            question = q['question']
            question_id = question['id']
            
            group_info = None
            if 'group_data' in q:
                group_info = {
                    'group_name': q['group_data']['group_name'],
                    'group_content': q['group_data']['group_content'],
                    'group_image': q['group_data']['group_image'],
                    'instruction_text': q['group_data']['instruction_text'],
                    'group_type': q['group_data']['group_type'],
                    'is_first_in_group': q.get('is_first_in_group', False),
                    'total_in_group': q.get('total_in_group', 0)
                }
            
            original_options = [question['option1'], question['option2'], question['option3'], question['option4']]
            shuffled_indices = list(range(4))
            random.shuffle(shuffled_indices)
            
            shuffled_options = []
            for new_index, old_index in enumerate(shuffled_indices):
                shuffled_options.append({
                    'letter': ['A','B','C','D'][new_index],
                    'text': original_options[old_index]
                })
            
            shuffled_options_json = json.dumps({'options': shuffled_options, 'group_info': group_info})
            
            conn.execute("""
                INSERT INTO ce_attempt_questions (attempt_id, question_id, shuffled_options, started_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """, (attempt_id, question_id, shuffled_options_json))
    
    conn.commit()
    conn.close()
    
    session["ce_attempt_id"] = attempt_id
    
    return redirect(f"/ce_exam/{attempt_id}")


@student_bp.route("/ce_submitted")
def ce_submitted():
    student_id = session.get("ce_student_id")
    attempt_id = session.get("ce_attempt_id") or request.args.get("attempt_id")
    
    conn = get_db_connection()
    ce_settings_row = conn.execute("SELECT * FROM ce_settings WHERE id=1").fetchone()
    ce_settings = dict(ce_settings_row) if ce_settings_row else {}

    attempt = None
    if attempt_id:
        attempt_row = conn.execute("SELECT * FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
        if attempt_row:
            attempt = dict(attempt_row)
    if not attempt and student_id:
        attempt_row = conn.execute("SELECT * FROM ce_attempts WHERE student_id=? ORDER BY id DESC LIMIT 1", (student_id,)).fetchone()
        if attempt_row:
            attempt = dict(attempt_row)

    exam = None
    if attempt and attempt.get("exam_id"):
        exam_row = conn.execute("SELECT * FROM ce_exams WHERE id=?", (attempt["exam_id"],)).fetchone()
        if exam_row:
            exam = dict(exam_row)

    student = None
    if student_id:
        st_row = conn.execute("SELECT * FROM ce_students WHERE id=?", (student_id,)).fetchone()
        if st_row:
            student = dict(st_row)
    elif attempt and attempt.get("student_id"):
        st_row = conn.execute("SELECT * FROM ce_students WHERE id=?", (attempt["student_id"],)).fetchone()
        if st_row:
            student = dict(st_row)

    conn.close()

    return render_template(
        "ce_submitted.html",
        ce_settings=ce_settings,
        attempt=attempt,
        exam=exam,
        student=student
    )


