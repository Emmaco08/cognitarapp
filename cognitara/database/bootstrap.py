"""
CogniTara v2 — Self-Healing Core Database Bootstrap
(cognitara/database/bootstrap.py)

Idempotently ensures all 32+ core tables, indexes, and modular schema migrations
exist on any fresh SQLite database (including first boot of the frozen Windows
`cognitara-engine.exe` inside CogniTara Studio). Non-destructive on existing DBs.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from typing import Optional

logger = logging.getLogger("cognitara.database.bootstrap")

DEFAULT_CLASSES = (
    ("JSS 1", 1, "JSS 2"),
    ("JSS 2", 2, "JSS 3"),
    ("JSS 3", 3, "SSS 1"),
    ("SSS 1", 4, "SSS 2"),
    ("SSS 2", 5, "SSS 3"),
    ("SSS 3", 6, None),
)


def _safe_exec(cursor: sqlite3.Cursor, sql: str) -> None:
    try:
        cursor.execute(sql)
    except sqlite3.OperationalError:
        pass


def ensure_core_database_initialized(
    db_path: str,
    upload_folder: Optional[str] = None,
    seed_sample_users: bool = False,
) -> None:
    """
    Create all core CogniTara tables, indexes, and modular migrations cleanly
    without altering or deleting any existing records.
    """
    if upload_folder:
        os.makedirs(upload_folder, exist_ok=True)

    parent_dir = os.path.dirname(os.path.abspath(db_path))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    conn = sqlite3.connect(db_path, timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA foreign_keys = ON")
        c = conn.cursor()

        # Core accounts & academic entities
        c.execute("""
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            class TEXT,
            photo TEXT DEFAULT 'default.png',
            status TEXT DEFAULT 'approved',
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved_at DATETIME,
            email TEXT,
            full_name TEXT,
            specialisation TEXT DEFAULT 'General'
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            class TEXT,
            photo TEXT DEFAULT 'default.png',
            teaching_classes TEXT DEFAULT '',
            specialisations TEXT DEFAULT '',
            class_teacher_of TEXT DEFAULT ''
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            class TEXT,
            duration INTEGER DEFAULT 30,
            active INTEGER DEFAULT 0,
            teacher_id INTEGER,
            calculator_type TEXT DEFAULT 'none',
            max_warnings INTEGER DEFAULT 5,
            deactivated INTEGER DEFAULT 0,
            subject_tag TEXT DEFAULT 'General',
            specialisation_tag TEXT DEFAULT 'General',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            question TEXT,
            option1 TEXT,
            option2 TEXT,
            option3 TEXT,
            option4 TEXT,
            answer TEXT,
            image TEXT,
            section_id INTEGER,
            group_id INTEGER,
            display_order INTEGER DEFAULT 0,
            mandatory INTEGER DEFAULT 0,
            explanation TEXT,
            FOREIGN KEY(exam_id) REFERENCES exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_role TEXT,
            username TEXT,
            action TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            exam_id INTEGER,
            score INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            percentage REAL DEFAULT 0,
            submitted INTEGER DEFAULT 1,
            status TEXT DEFAULT 'in_progress',
            start_time DATETIME,
            end_time DATETIME,
            current_progress TEXT,
            warnings_count INTEGER DEFAULT 0,
            remaining_time INTEGER DEFAULT 0,
            is_paused INTEGER DEFAULT 0,
            paused_at DATETIME,
            paused_by TEXT,
            auto_submitted INTEGER DEFAULT 0,
            resume_requested INTEGER DEFAULT 0,
            resume_requested_at DATETIME,
            force_submit INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES students(id),
            FOREIGN KEY(exam_id) REFERENCES exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS warning_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            student_name TEXT,
            exam_id INTEGER,
            exam_name TEXT,
            warning_message TEXT,
            warning_count INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES students(id),
            FOREIGN KEY(exam_id) REFERENCES exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS pending_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            full_name TEXT,
            email TEXT,
            class TEXT,
            photo TEXT DEFAULT 'default.png',
            specialisation TEXT DEFAULT 'General',
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending'
        )
        """)

        # Common Entrance tables
        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            target_class TEXT NOT NULL,
            duration INTEGER DEFAULT 60,
            passing_score INTEGER DEFAULT 50,
            total_questions_to_show INTEGER DEFAULT 100,
            active INTEGER DEFAULT 0,
            calculator_type TEXT DEFAULT 'none',
            max_warnings INTEGER DEFAULT 5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            section_name TEXT NOT NULL,
            section_order INTEGER DEFAULT 0,
            questions_to_show INTEGER DEFAULT 0,
            randomize INTEGER DEFAULT 1,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_question_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            section_id INTEGER,
            group_name TEXT,
            group_type TEXT DEFAULT 'normal',
            group_content TEXT,
            group_image TEXT,
            display_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE,
            FOREIGN KEY(section_id) REFERENCES ce_sections(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            section_id INTEGER,
            group_id INTEGER,
            question TEXT NOT NULL,
            option1 TEXT,
            option2 TEXT,
            option3 TEXT,
            option4 TEXT,
            answer TEXT NOT NULL,
            explanation TEXT,
            image TEXT,
            mandatory INTEGER DEFAULT 0,
            points INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE,
            FOREIGN KEY(section_id) REFERENCES ce_sections(id) ON DELETE CASCADE,
            FOREIGN KEY(group_id) REFERENCES ce_question_groups(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER,
            full_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            photo TEXT DEFAULT 'default.png',
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            exam_id INTEGER,
            score INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            percentage REAL DEFAULT 0,
            passed INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            answers TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            reviewed_at DATETIME,
            reviewed_by TEXT,
            admin_notes TEXT,
            current_progress TEXT,
            warnings_count INTEGER DEFAULT 0,
            remaining_time INTEGER DEFAULT 0,
            is_paused INTEGER DEFAULT 0,
            paused_at DATETIME,
            paused_by TEXT,
            auto_submitted INTEGER DEFAULT 0,
            last_heartbeat TIMESTAMP,
            resume_requested INTEGER DEFAULT 0,
            force_submit INTEGER DEFAULT 0,
            updated_at TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES ce_students(id) ON DELETE CASCADE,
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS exam_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL,
            section_name TEXT NOT NULL,
            questions_to_show INTEGER DEFAULT 0,
            randomize INTEGER DEFAULT 1,
            section_order INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS exam_question_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL,
            section_id INTEGER NOT NULL,
            group_name TEXT NOT NULL,
            group_type TEXT DEFAULT 'normal',
            group_content TEXT,
            group_image TEXT,
            instruction_text TEXT,
            display_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_attempt_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER,
            question_id INTEGER,
            user_answer TEXT,
            is_correct INTEGER DEFAULT 0,
            shuffled_options TEXT,
            time_spent INTEGER DEFAULT 0,
            completed_at TIMESTAMP,
            FOREIGN KEY(attempt_id) REFERENCES ce_attempts(id) ON DELETE CASCADE,
            FOREIGN KEY(question_id) REFERENCES ce_questions(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS ce_warning_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            exam_id INTEGER,
            warning_message TEXT,
            warning_count INTEGER DEFAULT 1,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES ce_students(id),
            FOREIGN KEY(exam_id) REFERENCES ce_exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS exam_question_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            exam_id INTEGER NOT NULL,
            section_id INTEGER,
            user_answer TEXT,
            is_correct INTEGER DEFAULT 0,
            time_spent INTEGER DEFAULT 0,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (attempt_id) REFERENCES scores(id),
            FOREIGN KEY (question_id) REFERENCES questions(id),
            FOREIGN KEY (student_id) REFERENCES students(id),
            FOREIGN KEY (exam_id) REFERENCES exams(id)
        )
        """)

        c.execute("""
        CREATE TABLE IF NOT EXISTS teacher_class_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            specialisation TEXT NOT NULL DEFAULT 'General',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        )
        """)

        # Non-destructive column backfills for older databases
        for alter_sql in (
            "ALTER TABLE exams ADD COLUMN teacher_id INTEGER",
            "ALTER TABLE exams ADD COLUMN calculator_type TEXT DEFAULT 'none'",
            "ALTER TABLE exams ADD COLUMN max_warnings INTEGER DEFAULT 5",
            "ALTER TABLE exams ADD COLUMN deactivated INTEGER DEFAULT 0",
            "ALTER TABLE exams ADD COLUMN subject_tag TEXT DEFAULT 'General'",
            "ALTER TABLE exams ADD COLUMN specialisation_tag TEXT DEFAULT 'General'",
            "ALTER TABLE exams ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE questions ADD COLUMN image TEXT",
            "ALTER TABLE questions ADD COLUMN section_id INTEGER",
            "ALTER TABLE questions ADD COLUMN group_id INTEGER",
            "ALTER TABLE questions ADD COLUMN display_order INTEGER DEFAULT 0",
            "ALTER TABLE questions ADD COLUMN mandatory INTEGER DEFAULT 0",
            "ALTER TABLE questions ADD COLUMN explanation TEXT",
            "ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'approved'",
            "ALTER TABLE students ADD COLUMN registered_at DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE students ADD COLUMN approved_at DATETIME",
            "ALTER TABLE students ADD COLUMN email TEXT",
            "ALTER TABLE students ADD COLUMN full_name TEXT",
            "ALTER TABLE students ADD COLUMN specialisation TEXT DEFAULT 'General'",
            "ALTER TABLE teachers ADD COLUMN teaching_classes TEXT DEFAULT ''",
            "ALTER TABLE teachers ADD COLUMN specialisations TEXT DEFAULT ''",
            "ALTER TABLE teachers ADD COLUMN class_teacher_of TEXT DEFAULT ''",
            "ALTER TABLE pending_registrations ADD COLUMN specialisation TEXT DEFAULT 'General'",
            "ALTER TABLE scores ADD COLUMN status TEXT DEFAULT 'in_progress'",
            "ALTER TABLE scores ADD COLUMN start_time DATETIME",
            "ALTER TABLE scores ADD COLUMN end_time DATETIME",
            "ALTER TABLE scores ADD COLUMN current_progress TEXT",
            "ALTER TABLE scores ADD COLUMN warnings_count INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN remaining_time INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN is_paused INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN paused_at DATETIME",
            "ALTER TABLE scores ADD COLUMN paused_by TEXT",
            "ALTER TABLE scores ADD COLUMN auto_submitted INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN resume_requested INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN resume_requested_at DATETIME",
            "ALTER TABLE scores ADD COLUMN force_submit INTEGER DEFAULT 0",
            "ALTER TABLE scores ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE scores ADD COLUMN percentage REAL DEFAULT 0",
            "ALTER TABLE ce_exams ADD COLUMN calculator_type TEXT DEFAULT 'none'",
            "ALTER TABLE ce_exams ADD COLUMN max_warnings INTEGER DEFAULT 5",
            "ALTER TABLE ce_sections ADD COLUMN randomize INTEGER DEFAULT 1",
            "ALTER TABLE ce_sections ADD COLUMN active INTEGER DEFAULT 1",
            "ALTER TABLE ce_attempt_questions ADD COLUMN shuffled_options TEXT",
            "ALTER TABLE ce_attempts ADD COLUMN current_progress TEXT",
            "ALTER TABLE ce_attempts ADD COLUMN warnings_count INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN remaining_time INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN is_paused INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN paused_at DATETIME",
            "ALTER TABLE ce_attempts ADD COLUMN paused_by TEXT",
            "ALTER TABLE ce_attempts ADD COLUMN auto_submitted INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN last_heartbeat TIMESTAMP",
            "ALTER TABLE ce_attempts ADD COLUMN resume_requested INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN force_submit INTEGER DEFAULT 0",
            "ALTER TABLE ce_attempts ADD COLUMN updated_at TIMESTAMP",
        ):
            _safe_exec(c, alter_sql)

        # Performance indexes
        for idx_sql in (
            "CREATE INDEX IF NOT EXISTS idx_eqr_attempt ON exam_question_responses(attempt_id)",
            "CREATE INDEX IF NOT EXISTS idx_eqr_exam ON exam_question_responses(exam_id)",
            "CREATE INDEX IF NOT EXISTS idx_eqr_student ON exam_question_responses(student_id)",
            "CREATE INDEX IF NOT EXISTS idx_eqr_section ON exam_question_responses(section_id)",
            "CREATE INDEX IF NOT EXISTS idx_teacher_assignments ON teacher_class_assignments(teacher_id)",
            "CREATE INDEX IF NOT EXISTS idx_exam_tags ON exams(subject_tag, specialisation_tag)",
            "CREATE INDEX IF NOT EXISTS idx_student_specialisation ON students(specialisation)",
            "CREATE INDEX IF NOT EXISTS idx_ce_attempts_exam_status ON ce_attempts(exam_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_ce_attempt_questions_attempt ON ce_attempt_questions(attempt_id)",
            "CREATE INDEX IF NOT EXISTS idx_ce_attempts_student_exam ON ce_attempts(student_id, exam_id)",
            "CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id)",
            "CREATE INDEX IF NOT EXISTS idx_questions_group ON questions(group_id)",
            "CREATE INDEX IF NOT EXISTS idx_exam_sections_exam ON exam_sections(exam_id)",
            "CREATE INDEX IF NOT EXISTS idx_exam_groups_section ON exam_question_groups(section_id)",
        ):
            _safe_exec(c, idx_sql)

        if seed_sample_users:
            c.execute("INSERT OR IGNORE INTO admin (username, password) VALUES (?, ?)", ("Administrator", "python0877"))
            c.execute(
                "INSERT OR IGNORE INTO students (username, password, class, photo, status) VALUES (?, ?, ?, ?, 'approved')",
                ("student1", "pass123", "Grade 1", "default.png"),
            )
            c.execute(
                "INSERT OR IGNORE INTO teachers (username, password, class, photo) VALUES (?, ?, ?, ?)",
                ("teacher1", "teach123", "Grade 1", "default.png"),
            )

        conn.commit()

        # Run all modular Phase 4.6 + analytics + exam management + v2 licence migrations
        from cognitara.database.initialization import (
            ensure_deadline_columns,
            ensure_force_submit_column,
            ensure_section_active_column,
            init_analytics_tables,
            init_exam_management_tables,
            init_license_tables,
            init_phase4_6_schema,
        )

        ensure_deadline_columns(conn)
        ensure_force_submit_column(conn)
        ensure_section_active_column(conn)
        init_analytics_tables(conn)
        init_exam_management_tables(conn)
        init_phase4_6_schema(conn)
        init_license_tables(conn)

        # Ensure standard school classes exist on fresh installations so Admin can immediately add exams & students
        try:
            cls_count = conn.execute("SELECT COUNT(*) FROM classes").fetchone()[0]
            if cls_count == 0:
                for cls_name, order_num, next_cls in DEFAULT_CLASSES:
                    conn.execute(
                        "INSERT OR IGNORE INTO classes (name, level_order, next_class_name) VALUES (?, ?, ?)",
                        (cls_name, order_num, next_cls),
                    )
                conn.commit()
        except Exception as exc:
            logger.debug("Default classes seeding note: %s", exc)

    finally:
        conn.close()
