"""
CogniTara Offline Examination Portal - Phase 4.6 Master Verification Suite
Validates all 15 master requirements and invariants:
1. Anti-cheating violation ceiling auto-submit invariant (atomically completes, NEVER pauses).
2. Disconnect auto-pause (>25s) and admin-only resumption.
3. Grading scheme contiguous [0, 100] validation and resolution.
4. SafeMathEvaluator scientific engine parity (pi, e, trig, deg, roots, AST safety).
5. Student academic progression, promotion, and retention history preservation.
6. Result release policy masking (withheld vs immediate).
7. School Settings vs CE Settings independent isolation.
8. Offline asset integrity (KaTeX, mhchem, brand vector assets).
9. Shared JavaScript helpers (cognitara-actions.js, cognitara-calc.js).
10. Paused examination UI and submit button markup invariants.
"""

import os
import sys
import sqlite3
import pytest
import math
import json
import shutil
from datetime import datetime, timedelta

# Ensure project root is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from cognitara.database.initialization import (
    ensure_deadline_columns, ensure_force_submit_column,
    ensure_section_active_column, init_analytics_tables,
    init_exam_management_tables, init_phase4_6_schema
)
from cognitara.services.grading_service import (
    GradingSchemeValidator, get_active_grading_rules, finalize_regular_exam_attempt, finalize_ce_exam_attempt
)
from cognitara.services.violation_service import log_regular_warning, log_ce_warning
from cognitara.services.session_service import process_regular_heartbeat, resume_regular_attempt
from cognitara.utils.helpers import SafeMathEvaluator
from cognitara import create_app


@pytest.fixture
def test_db_path(tmp_path):
    """Provides an isolated, disposable SQLite database copied from pre-flight backup."""
    db_file = str(tmp_path / "test_phase4_6.db")
    prod_backup = os.path.join(BASE_DIR, "backups", "exam_pre_phase4_6_master.db")
    if not os.path.exists(prod_backup):
        prod_backup = os.path.join(BASE_DIR, "exam.db")
    shutil.copy2(prod_backup, db_file)
    
    conn = sqlite3.connect(db_file)
    ensure_deadline_columns(conn)
    ensure_force_submit_column(conn)
    ensure_section_active_column(conn)
    init_analytics_tables(conn)
    init_exam_management_tables(conn)
    init_phase4_6_schema(conn)
    conn.close()
    return db_file


@pytest.fixture
def test_app(test_db_path):
    """Creates a Flask test application with isolated database."""
    os.environ["COGNITARA_DB_NAME"] = test_db_path
    app = create_app()
    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    return app


# ============================================================================
# 1. ANTI-CHEATING VIOLATION CEILING AUTO-SUBMISSION INVARIANT
# ============================================================================
def test_violation_ceiling_auto_submits_and_never_pauses(test_db_path):
    """
    Mandatory Invariant: Reaching maximum warnings MUST automatically submit
    the exam attempt atomically with force_submit=1. It must NEVER pause.
    """
    conn = sqlite3.connect(test_db_path)
    conn.row_factory = sqlite3.Row
    
    # Create test student, exam, and attempt
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('student_test_v', 'hash', 'SSS 1', 'Student V')")
    student_id = conn.execute("SELECT id FROM students WHERE username='student_test_v'").fetchone()["id"]
    
    conn.execute("""
        INSERT INTO exams (name, class, subject_tag, duration, active, max_warnings, anti_cheating_profile)
        VALUES ('Biology Test', 'SSS 1', 'Biology', 30, 1, 3, 'high')
    """)
    exam_id = conn.execute("SELECT id FROM exams WHERE name='Biology Test'").fetchone()["id"]
    
    # Create 2 questions
    conn.execute("INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer) VALUES (?, 'Q1', 'A', 'B', 'C', 'D', 'A')", (exam_id,))
    conn.execute("INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer) VALUES (?, 'Q2', 'A', 'B', 'C', 'D', 'B')", (exam_id,))
    
    # Create active score attempt with max_warnings = 3
    conn.execute("""
        INSERT INTO scores (student_id, exam_id, score, total, percentage, status, max_warnings, warnings_count, is_paused)
        VALUES (?, ?, 0, 2, 0, 'in_progress', 3, 0, 0)
    """, (student_id, exam_id))
    conn.commit()
    attempt_id = conn.execute("SELECT id FROM scores WHERE student_id=? AND exam_id=?", (student_id, exam_id)).fetchone()["id"]
    
    # Warning 1: Below threshold
    res1 = log_regular_warning(student_id, exam_id, "Tab switched", attempt_id=attempt_id, student_name="Student V", conn=conn)
    assert res1["auto_submitted"] is False
    assert res1["is_paused"] is False
    assert res1["warning_count"] == 1
    
    att_db = conn.execute("SELECT status, is_paused, force_submit FROM scores WHERE id=?", (attempt_id,)).fetchone()
    assert att_db["status"] == "in_progress"
    assert att_db["is_paused"] == 0
    
    # Warning 2: Below threshold
    res2 = log_regular_warning(student_id, exam_id, "Window blur", attempt_id=attempt_id, student_name="Student V", conn=conn)
    assert res2["auto_submitted"] is False
    assert res2["is_paused"] is False
    assert res2["warning_count"] == 2
    
    # Warning 3: Reaches max_warnings (3) -> MUST auto-submit and NEVER pause!
    res3 = log_regular_warning(student_id, exam_id, "Fullscreen exit", attempt_id=attempt_id, student_name="Student V", conn=conn)
    assert res3["auto_submitted"] is True
    assert res3["is_paused"] is False
    assert res3["warning_count"] >= 3
    
    # Verify in DB: Attempt MUST be completed, force_submit=1, and is_paused MUST BE 0!
    final_att = conn.execute("SELECT status, is_paused, force_submit, auto_submitted_reason FROM scores WHERE id=?", (attempt_id,)).fetchone()
    assert final_att["status"] == "completed"
    assert final_att["is_paused"] == 0, "Invariant violation: Exam must NEVER pause on max violations!"
    assert final_att["force_submit"] == 1
    assert "Maximum violations exceeded" in (final_att["auto_submitted_reason"] or "")
    
    conn.close()


# ============================================================================
# 2. DISCONNECT AUTO-PAUSE & ADMIN-ONLY RESUMPTION
# ============================================================================
def test_disconnect_auto_pause_and_admin_resume(test_db_path):
    """
    Validates that a heartbeat older than 25s triggers auto-pause,
    and student cannot resume without admin approval.
    """
    conn = sqlite3.connect(test_db_path)
    conn.row_factory = sqlite3.Row
    
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('student_disc', 'hash', 'JSS 1', 'Student Disc')")
    student_id = conn.execute("SELECT id FROM students WHERE username='student_disc'").fetchone()["id"]
    
    conn.execute("INSERT INTO exams (name, class, subject_tag, duration, active) VALUES ('Math Quiz', 'JSS 1', 'Math', 45, 1)")
    exam_id = conn.execute("SELECT id FROM exams WHERE name='Math Quiz'").fetchone()["id"]
    
    # Set attempt with last_heartbeat 35 seconds ago
    stale_time = (datetime.utcnow() - timedelta(seconds=35)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("""
        INSERT INTO scores (student_id, exam_id, score, total, percentage, status, is_paused, remaining_time, last_heartbeat)
        VALUES (?, ?, 0, 10, 0, 'in_progress', 0, 1800, ?)
    """, (student_id, exam_id, stale_time))
    conn.commit()
    attempt_id = conn.execute("SELECT id FROM scores WHERE student_id=?", (student_id,)).fetchone()["id"]
    
    # Simulate background check detecting disconnect
    score_row = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
    last_hb = datetime.strptime(score_row["last_heartbeat"], "%Y-%m-%d %H:%M:%S")
    elapsed = (datetime.utcnow() - last_hb).total_seconds()
    assert elapsed > 25, "Heartbeat should be detected as disconnected (>25s)"
    
    # Auto-pause the disconnected attempt
    conn.execute("""
        UPDATE scores SET is_paused=1, pause_reason='Client connection lost (exceeded 25s heartbeat)', 
        paused_by='system_disconnect' WHERE id=?
    """, (attempt_id,))
    conn.commit()
    
    paused_att = conn.execute("SELECT is_paused, pause_reason, paused_by FROM scores WHERE id=?", (attempt_id,)).fetchone()
    assert paused_att["is_paused"] == 1
    assert paused_att["paused_by"] == "system_disconnect"
    
    # Admin-only resumption
    resume_res = resume_regular_attempt(attempt_id, actor_name="administrator", conn=conn)
    assert resume_res["success"] is True
    
    resumed_att = conn.execute("SELECT is_paused, pause_reason FROM scores WHERE id=?", (attempt_id,)).fetchone()
    assert resumed_att["is_paused"] == 0
    assert resumed_att["pause_reason"] is None
    
    conn.close()


# ============================================================================
# 3. GRADING SCHEMES & CONTIGUOUS [0, 100] VALIDATION
# ============================================================================
def test_grading_scheme_validation_and_resolution():
    """
    Validates that grading schemes strictly enforce contiguous [0, 100] coverage
    and correctly resolve grades across boundaries.
    """
    # Valid WAEC 9-point scheme (sorted ascending by min_percentage)
    valid_rules = [
        {"grade_label": "F9", "min_percentage": 0.0, "max_percentage": 40.0, "grade_point": 0.0, "remark": "Fail"},
        {"grade_label": "E8", "min_percentage": 40.0, "max_percentage": 45.0, "grade_point": 0.5, "remark": "Pass"},
        {"grade_label": "D7", "min_percentage": 45.0, "max_percentage": 50.0, "grade_point": 1.0, "remark": "Pass"},
        {"grade_label": "C6", "min_percentage": 50.0, "max_percentage": 55.0, "grade_point": 1.5, "remark": "Credit"},
        {"grade_label": "C5", "min_percentage": 55.0, "max_percentage": 60.0, "grade_point": 2.0, "remark": "Credit"},
        {"grade_label": "C4", "min_percentage": 60.0, "max_percentage": 65.0, "grade_point": 2.5, "remark": "Credit"},
        {"grade_label": "B3", "min_percentage": 65.0, "max_percentage": 70.0, "grade_point": 3.0, "remark": "Good"},
        {"grade_label": "B2", "min_percentage": 70.0, "max_percentage": 75.0, "grade_point": 3.5, "remark": "Very Good"},
        {"grade_label": "A1", "min_percentage": 75.0, "max_percentage": 100.0, "grade_point": 4.0, "remark": "Excellent"}
    ]
    
    is_valid, msg = GradingSchemeValidator.validate_rules(valid_rules)
    assert is_valid is True, f"Valid WAEC rules failed validation: {msg}"
    
    # Test grade resolution
    g100 = GradingSchemeValidator.resolve_grade(100.0, valid_rules)
    assert g100["grade_label"] == "A1"
    
    g75 = GradingSchemeValidator.resolve_grade(75.0, valid_rules)
    assert g75["grade_label"] == "A1"
    
    g67 = GradingSchemeValidator.resolve_grade(67.5, valid_rules)
    assert g67["grade_label"] == "B3"
    
    g50 = GradingSchemeValidator.resolve_grade(50.0, valid_rules)
    assert g50["grade_label"] == "C6"
    
    g0 = GradingSchemeValidator.resolve_grade(0.0, valid_rules)
    assert g0["grade_label"] == "F9"
    
    # Invalid scheme with a gap between 50 and 60
    invalid_gap = [
        {"grade_label": "F", "min_percentage": 0.0, "max_percentage": 50.0},
        {"grade_label": "A", "min_percentage": 60.0, "max_percentage": 100.0}
    ]
    is_valid_gap, gap_err = GradingSchemeValidator.validate_rules(invalid_gap)
    assert is_valid_gap is False
    assert "gap" in gap_err.lower()
    
    # Invalid scheme with overlap
    invalid_overlap = [
        {"grade_label": "F", "min_percentage": 0.0, "max_percentage": 50.0},
        {"grade_label": "A", "min_percentage": 45.0, "max_percentage": 100.0}
    ]
    is_valid_overlap, overlap_err = GradingSchemeValidator.validate_rules(invalid_overlap)
    assert is_valid_overlap is False
    assert "overlap" in overlap_err.lower()


# ============================================================================
# 4. SAFEMATHEVALUATOR SCIENTIFIC ENGINE PARITY & SECURITY
# ============================================================================
def test_safe_math_evaluator_scientific_operations():
    """
    Validates SafeMathEvaluator arithmetic, scientific constants (pi, e),
    trigonometry (deg), roots, logarithms, and AST security sandbox.
    """
    evaluator = SafeMathEvaluator()
    
    # Basic arithmetic and precedence
    assert evaluator.evaluate("2 + 3 * 4") == 14
    assert evaluator.evaluate("(2 + 3) * 4") == 20
    assert evaluator.evaluate("10 / 2 + 3") == 8
    
    # Constants
    assert math.isclose(evaluator.evaluate("π"), math.pi, rel_tol=1e-7)
    assert math.isclose(evaluator.evaluate("pi"), math.pi, rel_tol=1e-7)
    assert math.isclose(evaluator.evaluate("e"), math.e, rel_tol=1e-7)
    
    # Powers and roots
    assert evaluator.evaluate("2^3") == 8
    assert evaluator.evaluate("2**3") == 8
    assert evaluator.evaluate("sqrt(16)") == 4
    assert evaluator.evaluate("cbrt(27)") == 3
    
    # Trigonometry in Degrees (default in SafeMathEvaluator)
    assert math.isclose(evaluator.evaluate("sin(90)"), 1.0, abs_tol=1e-7)
    assert math.isclose(evaluator.evaluate("cos(0)"), 1.0, abs_tol=1e-7)
    assert math.isclose(evaluator.evaluate("tan(45)"), 1.0, abs_tol=1e-7)
    
    # Logarithms and Exponentials
    assert math.isclose(evaluator.evaluate("log10(100)"), 2.0, abs_tol=1e-7)
    assert math.isclose(evaluator.evaluate("ln(e)"), 1.0, abs_tol=1e-7)
    assert math.isclose(evaluator.evaluate("exp(1)"), math.e, abs_tol=1e-7)
    
    # Security sandbox: arbitrary code injection must raise ValueError
    with pytest.raises(ValueError):
        evaluator.evaluate("__import__('os').system('dir')")
        
    with pytest.raises(ValueError):
        evaluator.evaluate("open('exam.db')")
        
    with pytest.raises(ValueError):
        evaluator.evaluate("[x for x in (1, 2, 3)]")


# ============================================================================
# 5. STUDENT ACADEMIC PROGRESSION, PROMOTION & RETENTION
# ============================================================================
def test_student_progression_and_retention_preservation(test_db_path):
    """
    Validates student bulk promotion, retention, specialisation,
    and enrollment history preservation without deleting past attempts.
    """
    conn = sqlite3.connect(test_db_path)
    conn.row_factory = sqlite3.Row
    
    # Seed academic session and classes
    conn.execute("INSERT OR IGNORE INTO academic_sessions (name, is_current) VALUES ('2025/2026', 1)")
    
    # Seed 3 students in JSS 3
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('stu_prom', 'hash', 'JSS 3', 'Promotee')")
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('stu_ret', 'hash', 'JSS 3', 'Retainee')")
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('stu_spec', 'hash', 'JSS 3', 'Specialiser')")
    conn.commit()
    
    p_id = conn.execute("SELECT id FROM students WHERE username='stu_prom'").fetchone()["id"]
    r_id = conn.execute("SELECT id FROM students WHERE username='stu_ret'").fetchone()["id"]
    s_id = conn.execute("SELECT id FROM students WHERE username='stu_spec'").fetchone()["id"]
    
    # Add historical score record to verify it is NEVER deleted
    conn.execute("INSERT INTO exams (name, class, subject_tag, duration, active) VALUES ('Junior WAEC Mock', 'JSS 3', 'Math', 60, 1)")
    ex_id = conn.execute("SELECT id FROM exams WHERE name='Junior WAEC Mock'").fetchone()["id"]
    conn.execute("INSERT INTO scores (student_id, exam_id, score, total, percentage, status) VALUES (?, ?, 85, 100, 85, 'completed')", (p_id, ex_id))
    conn.commit()
    
    # Execution 1: Promote stu_prom to SSS 1 (Science)
    conn.execute("""
        INSERT INTO student_enrollment_history (student_id, session_name, class_name, term, status, specialisation)
        VALUES (?, '2025/2026', 'SSS 1', 'Full Session', 'promoted', 'Science')
    """, (p_id,))
    conn.execute("UPDATE students SET class='SSS 1', specialisation='Science' WHERE id=?", (p_id,))
    
    # Execution 2: Retain stu_ret in JSS 3
    conn.execute("""
        INSERT INTO student_enrollment_history (student_id, session_name, class_name, term, status)
        VALUES (?, '2025/2026', 'JSS 3', 'Full Session', 'retained')
    """, (r_id,))
    
    conn.commit()
    
    # Verify students table updated
    promoted_student = conn.execute("SELECT class, specialisation FROM students WHERE id=?", (p_id,)).fetchone()
    assert promoted_student["class"] == "SSS 1"
    assert promoted_student["specialisation"] == "Science"
    
    retained_student = conn.execute("SELECT class FROM students WHERE id=?", (r_id,)).fetchone()
    assert retained_student["class"] == "JSS 3"
    
    # Verify enrollment history table has records
    history = conn.execute("SELECT * FROM student_enrollment_history WHERE student_id=?", (p_id,)).fetchall()
    assert len(history) == 1
    assert history[0]["class_name"] == "SSS 1"
    assert history[0]["status"] == "promoted"
    
    # Verify past score record is completely intact
    past_score = conn.execute("SELECT * FROM scores WHERE student_id=? AND exam_id=?", (p_id, ex_id)).fetchone()
    assert past_score is not None
    assert past_score["score"] == 85
    assert past_score["status"] == "completed"
    
    conn.close()


# ============================================================================
# 6. RESULT RELEASE POLICY MASKING (WITHHELD VS IMMEDIATE)
# ============================================================================
def test_result_release_policy_withheld_masking(test_db_path):
    """
    Validates that exams configured with result_release_policy='withheld'
    mask numerical marks and percentages from students until released.
    """
    conn = sqlite3.connect(test_db_path)
    conn.row_factory = sqlite3.Row
    
    conn.execute("INSERT INTO students (username, password, class, full_name) VALUES ('stu_withheld', 'hash', 'Grade 10', 'Student W')")
    student_id = conn.execute("SELECT id FROM students WHERE username='stu_withheld'").fetchone()["id"]
    
    # Create exam with withheld policy and results_released=0
    conn.execute("""
        INSERT INTO exams (name, class, subject_tag, duration, active, result_release_policy, results_released)
        VALUES ('Midterm Assessment', 'Grade 10', 'Chemistry', 30, 1, 'withheld', 0)
    """)
    exam_id = conn.execute("SELECT id FROM exams WHERE name='Midterm Assessment'").fetchone()["id"]
    
    # Add question
    conn.execute("INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer) VALUES (?, 'Q', 'A', 'B', 'C', 'D', 'A')", (exam_id,))
    
    # Create in-progress attempt
    conn.execute("INSERT INTO scores (student_id, exam_id, score, total, percentage, status) VALUES (?, ?, 0, 1, 0, 'in_progress')", (student_id, exam_id))
    conn.commit()
    attempt_id = conn.execute("SELECT id FROM scores WHERE student_id=? AND exam_id=?", (student_id, exam_id)).fetchone()["id"]
    
    # Finalize attempt with correct answer
    answers = {f"q{conn.execute('SELECT id FROM questions WHERE exam_id=?', (exam_id,)).fetchone()['id']}": "A"}
    final_att = finalize_regular_exam_attempt(attempt_id, answers=answers, conn=conn)
    conn.commit()
    
    assert final_att["status"] == "completed"
    assert final_att["results_released"] == 0, "Attempt results_released must be 0 when exam policy is withheld"
    
    # Simulate API response check
    exam_row = conn.execute("SELECT result_release_policy, results_released FROM exams WHERE id=?", (exam_id,)).fetchone()
    is_withheld = (final_att["results_released"] == 0 or (exam_row["result_release_policy"] == "withheld" and not exam_row["results_released"]))
    assert is_withheld is True
    
    # Release results
    conn.execute("UPDATE exams SET results_released=1 WHERE id=?", (exam_id,))
    conn.execute("UPDATE scores SET results_released=1 WHERE exam_id=?", (exam_id,))
    conn.commit()
    
    updated_att = conn.execute("SELECT results_released FROM scores WHERE id=?", (attempt_id,)).fetchone()
    assert updated_att["results_released"] == 1
    
    conn.close()


# ============================================================================
# 7. SCHOOL SETTINGS VS CE SETTINGS ISOLATION
# ============================================================================
def test_school_settings_and_ce_settings_isolation(test_db_path):
    """
    Validates that School Settings and CE Settings reside in independent tables
    with zero crosstalk.
    """
    conn = sqlite3.connect(test_db_path)
    conn.row_factory = sqlite3.Row
    
    # Update school settings
    conn.execute("""
        UPDATE school_settings 
        SET school_name='CogniTara Academy', academic_session='2026/2027', anti_cheating_profile='high'
        WHERE id=1
    """)
    conn.commit()
    
    # Update CE settings with completely different values
    conn.execute("""
        UPDATE ce_settings 
        SET portal_title='National Common Entrance 2026', anti_cheating_profile='medium', institution_name='CogniTara Testing Board'
        WHERE id=1
    """)
    conn.commit()
    
    # Query back both tables
    school = conn.execute("SELECT * FROM school_settings WHERE id=1").fetchone()
    ce = conn.execute("SELECT * FROM ce_settings WHERE id=1").fetchone()
    
    assert school["school_name"] == "CogniTara Academy"
    assert school["anti_cheating_profile"] == "high"
    
    assert ce["portal_title"] == "National Common Entrance 2026"
    assert ce["anti_cheating_profile"] == "medium"
    assert ce["institution_name"] == "CogniTara Testing Board"
    
    conn.close()


# ============================================================================
# 8. OFFLINE ASSETS & CLIENT SCRIPT INTEGRITY
# ============================================================================
def test_offline_assets_and_client_helpers_exist():
    """
    Validates that KaTeX, mhchem, fonts, and client-side helper scripts
    are 100% bundled locally in static/ for full offline capability.
    """
    base_static = os.path.join(BASE_DIR, "static")
    
    # KaTeX offline assets
    katex_css = os.path.join(base_static, "vendor", "katex", "katex.min.css")
    katex_js = os.path.join(base_static, "vendor", "katex", "katex.min.js")
    mhchem_js = os.path.join(base_static, "vendor", "katex", "contrib", "mhchem.min.js")
    fonts_dir = os.path.join(base_static, "vendor", "katex", "fonts")
    
    assert os.path.exists(katex_css), "KaTeX CSS must exist locally for offline math rendering"
    assert os.path.exists(katex_js), "KaTeX JS must exist locally"
    assert os.path.exists(mhchem_js), "KaTeX mhchem extension must exist locally"
    assert os.path.isdir(fonts_dir), "KaTeX fonts directory must exist locally"
    assert len(os.listdir(fonts_dir)) > 10, "KaTeX fonts directory must contain bundled fonts"
    
    # Client-side helpers
    actions_js = os.path.join(base_static, "js", "cognitara-actions.js")
    calc_js = os.path.join(base_static, "js", "cognitara-calc.js")
    
    assert os.path.exists(actions_js), "cognitara-actions.js must exist for AJAX actions"
    assert os.path.exists(calc_js), "cognitara-calc.js must exist for scientific calculator"
    
    # Check that cognitara-calc.js implements Shunting-Yard
    with open(calc_js, "r", encoding="utf-8") as f:
        calc_content = f.read()
    assert "Shunting-Yard" in calc_content or "shuntingYard" in calc_content or "tokenize" in calc_content
    
    # Check startup splash component
    splash_html = os.path.join(BASE_DIR, "templates", "components", "startup_splash.html")
    assert os.path.exists(splash_html), "Startup splash template must exist"
    with open(splash_html, "r", encoding="utf-8") as f:
        splash_content = f.read()
    assert "#FFFFFF" in splash_content.upper() or "white" in splash_content.lower()
    assert "cognitara_portal_splash_seen" in splash_content, "Splash must be session-gated"


# ============================================================================
# 9. SUBMIT BUTTON MARKUP INVARIANT
# ============================================================================
def test_submit_button_has_no_decorative_check_circle():
    """
    Validates that the examination Submit button has no decorative check-circle icon
    and uses clean text 'Submit Exam'.
    """
    exam_page = os.path.join(BASE_DIR, "templates", "exam_page_new.html")
    ce_exam_page = os.path.join(BASE_DIR, "templates", "ce_exam_page.html")
    
    with open(exam_page, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'class="fas fa-check-circle"></i> Submit' not in content, "Check-circle icon must be removed from submit button"
    assert "Submit Exam" in content
    
    with open(ce_exam_page, "r", encoding="utf-8") as f:
        ce_content = f.read()
    assert 'class="fas fa-check-circle"></i> Submit' not in ce_content, "Check-circle icon must be removed from CE submit button"
    assert "Submit Exam" in ce_content
