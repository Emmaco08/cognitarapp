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
admin_results_bp = Blueprint('admin_results', __name__)

@admin_results_bp.route("/admin/results")
def view_results():
    if "admin_id" not in session: 
        return redirect("/")
    conn = get_db_connection()
    classes = conn.execute("SELECT DISTINCT class FROM students WHERE status='approved'").fetchall()
    results_by_class = {}
    for cls in classes:
        students = conn.execute("SELECT * FROM students WHERE class=? AND status='approved'", (cls["class"],)).fetchall()
        results = []
        for student in students:
            scores = conn.execute("""
                SELECT exams.name as exam_name, scores.score, scores.total, 
                       scores.exam_id, scores.student_id
                FROM scores 
                JOIN exams ON scores.exam_id = exams.id 
                WHERE scores.student_id = ? AND scores.status = 'completed'
            """, (student["id"],)).fetchall()
            
            display_name = student["full_name"] if "full_name" in student.keys() and student["full_name"] else student["username"]
            results.append({
                "student": display_name, 
                "scores": scores,
                "student_id": student["id"]
            })
        results_by_class[cls["class"]] = results
    conn.close()
    return render_template("results.html", results_by_class=results_by_class)


@admin_results_bp.route("/admin/class/<class_name>/analytics")
def admin_class_analytics(class_name):
    """Admin view - analytics for a specific class across all teachers"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Get all exams for this class
    exams = conn.execute("""
        SELECT e.*, t.username as teacher_name,
               (SELECT COUNT(*) FROM scores WHERE exam_id = e.id AND status = 'completed') as attempt_count,
               (SELECT AVG(percentage) FROM scores WHERE exam_id = e.id AND status = 'completed') as avg_score
        FROM exams e
        JOIN teachers t ON e.teacher_id = t.id
        WHERE e.class = ?
        ORDER BY e.id DESC
    """, (class_name,)).fetchall()
    
    # Get all students in this class
    students = conn.execute("""
        SELECT * FROM students WHERE class=? AND status='approved'
        ORDER BY username
    """, (class_name,)).fetchall()
    
    # Grade distribution for this class
    grade_dist = conn.execute("""
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
        WHERE e.class = ? AND sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY grade
        ORDER BY 
            CASE grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    """, (class_name,)).fetchall()
    
    grade_labels = [g["grade"] for g in grade_dist] if grade_dist else []
    grade_counts = [g["count"] for g in grade_dist] if grade_dist else []
    
    # Class average
    class_avg_result = conn.execute("""
        SELECT AVG(sc.percentage) as avg FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.class = ? AND sc.status = 'completed' AND sc.percentage IS NOT NULL
    """, (class_name,)).fetchone()
    class_avg = round(class_avg_result["avg"] or 0, 1) if class_avg_result else 0
    
    # Top students in this class
    top_students = conn.execute("""
        SELECT s.id, s.username, s.full_name, s.photo,
               AVG(sc.percentage) as avg_score,
               COUNT(sc.id) as exam_count
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        JOIN exams e ON sc.exam_id = e.id
        WHERE e.class = ? AND sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY s.id
        ORDER BY avg_score DESC
        LIMIT 10
    """, (class_name,)).fetchall()
    
    # Total students
    total_students = len(students)
    
    # Students with their exam results
    student_results = []
    for student in students:
        scores = conn.execute("""
            SELECT e.name as exam_name, sc.score, sc.total, sc.percentage,
                   sc.status, t.username as teacher_name
            FROM scores sc
            JOIN exams e ON sc.exam_id = e.id
            JOIN teachers t ON e.teacher_id = t.id
            WHERE sc.student_id = ? AND sc.status = 'completed'
            ORDER BY e.name
        """, (student["id"],)).fetchall()
        
        if scores:
            valid_scores = [s["percentage"] for s in scores if s["percentage"] is not None]
            avg = round(sum(valid_scores) / len(valid_scores), 1) if valid_scores else 0
        else:
            avg = 0
        
        student_results.append({
            "id": student["id"],
            "username": student["username"],
            "full_name": student["full_name"] or student["username"],
            "photo": student["photo"],
            "avg_score": avg,
            "exam_count": len(scores),
            "scores": scores
        })
    
    conn.close()
    
    return render_template("admin_class_analytics.html",
                         class_name=class_name,
                         exams=exams,
                         total_students=total_students,
                         class_avg=class_avg,
                         grade_labels=json.dumps(grade_labels),
                         grade_counts=json.dumps(grade_counts),
                         top_students=top_students,
                         student_results=student_results)


@admin_results_bp.route("/admin/student/<int:student_id>")
def admin_student_profile(student_id):
    """Admin view - complete student profile"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return "Student not found", 404
    
    # Get all exam results
    results = conn.execute("""
        SELECT sc.*, e.name as exam_name, e.subject_tag,
               t.username as teacher_name,
               (strftime('%s', sc.end_time) - strftime('%s', sc.start_time)) as time_spent_seconds
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        JOIN teachers t ON e.teacher_id = t.id
        WHERE sc.student_id = ? AND sc.status = 'completed'
        ORDER BY sc.end_time DESC
    """, (student_id,)).fetchall()
    
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
    
    conn.close()
    
    return render_template("admin_student_profile.html",
                         student=student,
                         results=results,
                         total_exams=total_exams,
                         avg_score=round(avg_score, 1),
                         best_exam=best_exam,
                         worst_exam=worst_exam)


@admin_results_bp.route("/admin/student/<int:student_id>/exam/<int:exam_id>")
def admin_student_exam_detail(student_id, exam_id):
    """Admin view - deep dive into a student's exam"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    student = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return "Student not found", 404
    
    exam = conn.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
    if not exam:
        conn.close()
        return "Exam not found", 404
    
    score = conn.execute("""
        SELECT *, (strftime('%s', end_time) - strftime('%s', start_time)) as time_spent_seconds
        FROM scores 
        WHERE student_id=? AND exam_id=? AND status='completed'
        ORDER BY id DESC LIMIT 1
    """, (student_id, exam_id)).fetchone()
    
    if not score:
        conn.close()
        return "No completed attempt found", 404
    
    # Per-question breakdown
    missed_questions = []
    correct_questions = []
    
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
    except:
        questions_detail = []
    
    for q_row in questions_detail:
        q = dict(q_row)
        options = [q.get('option1') or '', q.get('option2') or '', q.get('option3') or '', q.get('option4') or '']
        letters = ['A', 'B', 'C', 'D']
        
        chosen_letter = '—'
        user_answer = q.get('user_answer')
        if user_answer:
            for i, opt in enumerate(options):
                if opt and opt == user_answer:
                    chosen_letter = letters[i]
                    break
        
        correct_letter = '—'
        correct_answer = q.get('answer')
        if correct_answer:
            for i, opt in enumerate(options):
                if opt and opt == correct_answer:
                    correct_letter = letters[i]
                    break
        
        q['chosen_letter'] = chosen_letter
        q['correct_letter'] = correct_letter
        
        if q.get('is_correct'):
            correct_questions.append(q)
        else:
            missed_questions.append(q)
    
    # Rank
    score_pct = score["percentage"] if score["percentage"] is not None else 0
    rank_data = conn.execute("""
        SELECT COUNT(*) + 1 as rank FROM scores 
        WHERE exam_id = ? AND status = 'completed' AND percentage > ?
    """, (exam_id, score_pct)).fetchone()
    rank = rank_data["rank"] if rank_data else 1
    
    total_students = conn.execute("""
        SELECT COUNT(*) as count FROM scores WHERE exam_id=? AND status='completed'
    """, (exam_id,)).fetchone()["count"]
    
    # Speed
    time_spent = score["time_spent_seconds"] if score["time_spent_seconds"] else 0
    speed_rank = conn.execute("""
        SELECT COUNT(*) + 1 as rank FROM scores 
        WHERE exam_id = ? AND status = 'completed'
        AND (strftime('%s', end_time) - strftime('%s', start_time)) < ?
        AND (strftime('%s', end_time) - strftime('%s', start_time)) > 0
    """, (exam_id, time_spent)).fetchone()["rank"] if time_spent > 0 else 1
    
    avg_time = conn.execute("""
        SELECT AVG(strftime('%s', end_time) - strftime('%s', start_time)) as avg_time
        FROM scores WHERE exam_id=? AND status='completed'
        AND (strftime('%s', end_time) - strftime('%s', start_time)) > 0
    """, (exam_id,)).fetchone()["avg_time"] or 0
    
    percentage = score_pct
    if percentage >= 90: grade = 'A'
    elif percentage >= 80: grade = 'B'
    elif percentage >= 70: grade = 'C'
    elif percentage >= 65: grade = 'D'
    else: grade = 'F'
    
    conn.close()
    
    return render_template("admin_student_exam_detail.html",
                         student=student,
                         exam=exam,
                         score=score,
                         missed_questions=missed_questions,
                         correct_questions=correct_questions,
                         rank=rank,
                         total_students=total_students,
                         speed_rank=speed_rank,
                         avg_time=avg_time,
                         grade=grade,
                         percentage=percentage)


@admin_results_bp.route("/admin/school-analytics")
def admin_school_analytics():
    """School-wide analytics dashboard for admin"""
    if "admin_id" not in session:
        return redirect("/")
    
    conn = get_db_connection()
    
    # Total stats
    total_students = conn.execute("SELECT COUNT(*) as count FROM students WHERE status='approved'").fetchone()["count"]
    total_teachers = conn.execute("SELECT COUNT(*) as count FROM teachers").fetchone()["count"]
    total_exams = conn.execute("SELECT COUNT(*) as count FROM exams").fetchone()["count"]
    total_attempts = conn.execute("SELECT COUNT(*) as count FROM scores WHERE status='completed'").fetchone()["count"]
    
    # School-wide grade distribution
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
        WHERE status = 'completed' AND percentage IS NOT NULL
        GROUP BY grade
        ORDER BY 
            CASE grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    """).fetchall()
    
    grade_labels = [g["grade"] for g in grade_dist] if grade_dist else []
    grade_counts = [g["count"] for g in grade_dist] if grade_dist else []
    
    # School average
    school_avg = conn.execute("""
        SELECT AVG(percentage) as avg FROM scores WHERE status='completed' AND percentage IS NOT NULL
    """).fetchone()
    school_average = round(school_avg["avg"] or 0, 1) if school_avg else 0
    
    # Top 20 students school-wide
    top_students = conn.execute("""
        SELECT s.id, s.username, s.full_name, s.class, s.photo, s.specialisation,
               AVG(sc.percentage) as avg_score,
               COUNT(sc.id) as exam_count,
               MAX(sc.percentage) as best_score
        FROM scores sc
        JOIN students s ON sc.student_id = s.id
        WHERE sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY s.id
        HAVING exam_count >= 2
        ORDER BY avg_score DESC
        LIMIT 20
    """).fetchall()
    
    # Class-wise performance
    class_performance = conn.execute("""
        SELECT e.class,
               COUNT(DISTINCT sc.student_id) as students_count,
               COUNT(sc.id) as attempt_count,
               AVG(sc.percentage) as avg_score,
               SUM(CASE WHEN sc.percentage >= 50 THEN 1 ELSE 0 END) as passed_count
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY e.class
        ORDER BY 
            CAST(SUBSTR(e.class, 7) AS INTEGER) ASC
    """).fetchall()
    
    class_labels = [c["class"] for c in class_performance]
    class_avgs = [round(c["avg_score"] or 0, 1) for c in class_performance]
    
    # Subject-wise performance (case-insensitive normalization so 'Physics' and 'PHYSICS' merge cleanly)
    raw_subject_rows = conn.execute("""
        SELECT TRIM(COALESCE(NULLIF(TRIM(e.subject_tag), ''), e.name)) AS raw_subject,
               sc.percentage AS pct
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE sc.status = 'completed' AND sc.percentage IS NOT NULL
    """).fetchall()

    subj_buckets = {}
    for row in raw_subject_rows:
        raw_name = str(row["raw_subject"] or "General").strip()
        if not raw_name:
            raw_name = "General"
        key = " ".join(raw_name.split()).lower()
        # Preserve clean acronyms (e.g. C.R.S., I.C.T., P.H.E.) while title-casing standard names
        display = raw_name if ("." in raw_name or len(raw_name) <= 4) else raw_name.title()
        b = subj_buckets.get(key)
        if not b:
            b = {"subject_tag": display, "sum_pct": 0.0, "attempt_count": 0, "passed_count": 0}
            subj_buckets[key] = b
        pct_val = float(row["pct"] or 0.0)
        b["sum_pct"] += pct_val
        b["attempt_count"] += 1
        if pct_val >= 50.0:
            b["passed_count"] += 1

    subject_performance = sorted(
        [
            {
                "subject_tag": b["subject_tag"],
                "attempt_count": b["attempt_count"],
                "avg_score": round(b["sum_pct"] / b["attempt_count"], 1) if b["attempt_count"] else 0.0,
                "passed_count": b["passed_count"],
                "pass_rate": round((b["passed_count"] / b["attempt_count"]) * 100, 1) if b["attempt_count"] else 0.0,
            }
            for b in subj_buckets.values()
        ],
        key=lambda x: x["avg_score"],
        reverse=True,
    )

    subject_labels = [s["subject_tag"] for s in subject_performance]
    subject_scores = [s["avg_score"] for s in subject_performance]
    
    # Recent exam results (last 10)
    recent_exams = conn.execute("""
        SELECT e.name as exam_name, e.class,
               COUNT(sc.id) as attempt_count,
               AVG(sc.percentage) as avg_score,
               MAX(sc.percentage) as highest,
               MIN(sc.percentage) as lowest
        FROM exams e
        LEFT JOIN scores sc ON e.id = sc.exam_id AND sc.status = 'completed'
        GROUP BY e.id
        ORDER BY e.id DESC
        LIMIT 10
    """).fetchall()
    
    # Pass rate per class
    pass_rates = conn.execute("""
        SELECT e.class,
               COUNT(sc.id) as total,
               SUM(CASE WHEN sc.percentage >= 50 THEN 1 ELSE 0 END) as passed
        FROM scores sc
        JOIN exams e ON sc.exam_id = e.id
        WHERE sc.status = 'completed' AND sc.percentage IS NOT NULL
        GROUP BY e.class
        ORDER BY CAST(SUBSTR(e.class, 7) AS INTEGER) ASC
    """).fetchall()
    
    pass_rate_labels = [p["class"] for p in pass_rates]
    pass_rate_data = [round((p["passed"] / p["total"] * 100) if p["total"] > 0 else 0, 1) for p in pass_rates]
    
    conn.close()
    
    return render_template("admin_school_analytics.html",
                         total_students=total_students,
                         total_teachers=total_teachers,
                         total_exams=total_exams,
                         total_attempts=total_attempts,
                         school_average=school_average,
                         grade_labels=json.dumps(grade_labels),
                         grade_counts=json.dumps(grade_counts),
                         top_students=top_students,
                         class_labels=json.dumps(class_labels),
                         class_avgs=json.dumps(class_avgs),
                         subject_labels=json.dumps(subject_labels),
                         subject_scores=json.dumps(subject_scores),
                         recent_exams=recent_exams,
                         pass_rate_labels=json.dumps(pass_rate_labels),
                         pass_rate_data=json.dumps(pass_rate_data))


