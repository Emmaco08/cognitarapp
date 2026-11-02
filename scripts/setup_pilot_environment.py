#!/usr/bin/env python3
"""
CogniTara Offline Examination Portal - Pilot Environment Setup
Phase 4.5 Controlled School Pilot Preparation.

Sets up an isolated pilot database, synthetic pilot student accounts,
representative Regular and Common Entrance examination fixtures, and isolated upload directories.
Guarantees zero mutation to production exam.db.
"""

import os
import sys
import json
import sqlite3
import hashlib
from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from cognitara.database.initialization import (
    ensure_deadline_columns,
    ensure_force_submit_column,
    ensure_section_active_column,
    init_analytics_tables,
    init_exam_management_tables,
)
from scripts.backup_exam_db import verify_database_integrity, calculate_sha256

PILOT_DIR = os.path.join(ROOT_DIR, "backups_phase4_5", "pilot_environment")
PILOT_DB = os.path.join(PILOT_DIR, "exam_pilot_disposable.db")
PILOT_UPLOADS = os.path.join(ROOT_DIR, "uploads", "pilot_test")
MANIFEST_FILE = os.path.join(PILOT_DIR, "pilot_manifest.json")


def setup_pilot_environment(num_students: int = 25) -> dict:
    """Prepares isolated pilot database and test fixtures."""
    os.makedirs(PILOT_DIR, exist_ok=True)
    os.makedirs(PILOT_UPLOADS, exist_ok=True)

    # 1. Clean previous pilot db files
    for ext in ["", "-wal", "-shm"]:
        p = PILOT_DB + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    src_path = os.path.join(ROOT_DIR, "exam.db")
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source database not found at {src_path}")

    # Calculate and log production database hash to guarantee read-only access
    prod_hash = calculate_sha256(src_path)
    print(f"[*] Production exam.db SHA-256 before backup: {prod_hash}")

    # 2. Hot snapshot into pilot database
    src_conn = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    dst_conn = sqlite3.connect(PILOT_DB)
    try:
        src_conn.backup(dst_conn, pages=100)
    finally:
        dst_conn.close()
        src_conn.close()

    # Verify production hash remains completely unchanged
    post_hash = calculate_sha256(src_path)
    assert prod_hash == post_hash, "Production database was modified during snapshot!"
    print(f"[+] Verified: Production exam.db is untouched (SHA-256: {post_hash})")

    # 3. Configure pilot DB pragmas and schemas
    conn = sqlite3.connect(PILOT_DB, timeout=30.0)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    ensure_deadline_columns(conn)
    ensure_force_submit_column(conn)
    ensure_section_active_column(conn)
    init_analytics_tables(conn)
    init_exam_management_tables(conn)

    # 4. Provision Representative Pilot Regular Examination (ID: 801)
    conn.execute("DELETE FROM questions WHERE exam_id = 801")
    conn.execute("DELETE FROM exams WHERE id = 801")
    conn.execute("""
        INSERT INTO exams (id, name, class, duration, active, max_warnings)
        VALUES (801, 'School Pilot Regular Examination', 'JSS 1', 60, 1, 5)
    """)

    for q in range(1, 31):
        conn.execute("""
            INSERT INTO questions (id, exam_id, question, option1, option2, option3, option4, answer, section_id)
            VALUES (?, 801, ?, 'Alpha', 'Beta', 'Gamma', 'Delta', 'Beta', 1)
        """, (8000 + q, f"Pilot Question {q}: What is the value of 2 + {q}?"))

    # 5. Provision Representative Pilot Common Entrance Examination (ID: 802)
    conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id IN (SELECT id FROM ce_attempts WHERE exam_id = 802)")
    conn.execute("DELETE FROM ce_attempts WHERE exam_id = 802")
    conn.execute("DELETE FROM ce_questions WHERE exam_id = 802")
    conn.execute("DELETE FROM ce_exams WHERE id = 802")

    conn.execute("""
        INSERT INTO ce_exams (id, name, description, target_class, duration, passing_score, total_questions_to_show, active, calculator_type, max_warnings)
        VALUES (802, 'School Pilot Common Entrance Examination', 'Pilot Examination for Primary 6 Candidates', 'Primary 6', 60, 50, 30, 1, 'none', 5)
    """)

    # Create 2 CE sections
    conn.execute("""
        INSERT INTO ce_sections (id, exam_id, section_name, section_order, questions_to_show, active)
        VALUES (81, 802, 'English Language & Verbal Reasoning', 1, 15, 1)
    """)
    conn.execute("""
        INSERT INTO ce_sections (id, exam_id, section_name, section_order, questions_to_show, active)
        VALUES (82, 802, 'Mathematics & Quantitative Reasoning', 2, 15, 1)
    """)

    # 15 questions per section
    for q in range(1, 16):
        conn.execute("""
            INSERT INTO ce_questions (id, exam_id, section_id, question, option1, option2, option3, option4, answer, display_order)
            VALUES (?, 802, 81, ?, 'Noun', 'Verb', 'Adjective', 'Adverb', 'A', ?)
        """, (8100 + q, f"CE Section 1 Question {q}: Identify the part of speech.", q))

    for q in range(1, 16):
        conn.execute("""
            INSERT INTO ce_questions (id, exam_id, section_id, question, option1, option2, option3, option4, answer, display_order)
            VALUES (?, 802, 82, ?, '10', '20', '30', '40', 'B', ?)
        """, (8200 + q, f"CE Section 2 Question {q}: Solve the quantitative relation.", q))

    # 6. Provision Synthetic Pilot Students and Active Attempts
    hashed_pw = generate_password_hash("pilot_pass_2026")
    pilot_students = []

    now_utc = datetime.now(timezone.utc)
    dl_str = (now_utc + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
    now_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")

    # Clean existing pilot accounts and attempts
    conn.execute("DELETE FROM exam_question_responses WHERE exam_id = 801")
    conn.execute("DELETE FROM scores WHERE student_id >= 2001 AND student_id <= 2050")
    conn.execute("DELETE FROM ce_attempt_questions WHERE attempt_id IN (SELECT id FROM ce_attempts WHERE student_id >= 2001 AND student_id <= 2050)")
    conn.execute("DELETE FROM ce_attempts WHERE student_id >= 2001 AND student_id <= 2050")
    conn.execute("DELETE FROM ce_students WHERE id >= 2001 AND id <= 2050")
    conn.execute("DELETE FROM students WHERE id >= 2001 AND id <= 2050")

    for i in range(1, num_students + 1):
        s_id = 2000 + i
        username = f"pilot_student_{i:02d}"
        full_name = f"Pilot Candidate {i:02d}"
        attempt_id = 6000 + i
        ce_attempt_id = 7000 + i
        sess_key = f"pilot_sess_{i:02d}"
        ce_sess_key = f"pilot_ce_sess_{i:02d}"

        pilot_students.append({
            "id": s_id,
            "username": username,
            "full_name": full_name,
            "class": "JSS 1",
            "attempt_id": attempt_id,
            "ce_attempt_id": ce_attempt_id,
            "session_key": sess_key,
            "ce_session_key": ce_sess_key
        })

        conn.execute("""
            INSERT OR REPLACE INTO students (id, username, password, class, full_name, status)
            VALUES (?, ?, ?, 'JSS 1', ?, 'approved')
        """, (s_id, username, hashed_pw, full_name))

        conn.execute("""
            INSERT OR REPLACE INTO ce_students (id, exam_id, full_name, username, password)
            VALUES (?, 802, ?, ?, ?)
        """, (s_id, full_name, username, hashed_pw))

        # Regular exam active attempt
        conn.execute("""
            INSERT OR REPLACE INTO scores (id, student_id, exam_id, status, is_paused, session_key, remaining_time, authoritative_deadline, start_time, last_heartbeat)
            VALUES (?, ?, 801, 'in_progress', 0, ?, 3600, ?, ?, ?)
        """, (attempt_id, s_id, sess_key, dl_str, now_str, now_str))

        # CE exam active attempt
        conn.execute("""
            INSERT OR REPLACE INTO ce_attempts (id, student_id, exam_id, status, is_paused, session_key, remaining_time, authoritative_deadline, started_at, last_heartbeat)
            VALUES (?, ?, 802, 'in_progress', 0, ?, 3600, ?, ?, ?)
        """, (ce_attempt_id, s_id, ce_sess_key, dl_str, now_str, now_str))

    conn.commit()
    conn.close()

    # Verify integrity of pilot DB
    is_valid, msg = verify_database_integrity(PILOT_DB)
    if not is_valid:
        raise RuntimeError(f"Pilot database failed integrity check: {msg}")

    pilot_hash = calculate_sha256(PILOT_DB)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "pilot_database": PILOT_DB,
        "pilot_sha256": pilot_hash,
        "production_source_sha256": prod_hash,
        "pilot_uploads_dir": PILOT_UPLOADS,
        "regular_exam_id": 801,
        "ce_exam_id": 802,
        "students_count": len(pilot_students),
        "students": pilot_students,
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[+] Pilot environment successfully provisioned!")
    print(f"    Database: {PILOT_DB} (SHA-256: {pilot_hash})")
    print(f"    Uploads Directory: {PILOT_UPLOADS}")
    print(f"    Regular Exam ID: 801 (30 questions)")
    print(f"    Common Entrance Exam ID: 802 (2 sections, 30 questions)")
    print(f"    Students Provisioned: {len(pilot_students)} (usernames: pilot_student_01 .. pilot_student_{num_students:02d})")
    print(f"    Manifest saved to: {MANIFEST_FILE}")

    return manifest


if __name__ == "__main__":
    setup_pilot_environment(25)
