"""
CogniTara Phase 4.6 Database Migration Script
Safely and idempotently upgrades exam.db with:
1. Normalized classes table with NERDC & legacy classes
2. School Settings & CE Settings singleton tables (Zero Crosstalk)
3. Configurable Grading Schemes & Rules (WAEC 9-Point & Letter scales)
4. Result release policy columns on exams, ce_exams, and scores
5. Question explanation column on questions
6. Academic progression & enrollment history tables
"""

import sqlite3
import os
import sys

def migrate(db_path='exam.db'):
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF;") # Off during DDL additions

    # 1. Classes Table
    print("Migrating classes...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            level_category TEXT DEFAULT 'Secondary',
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_classes_order ON classes(display_order);")

    # NERDC Standard Classes
    nerdc_defaults = [
        ("Primary 1", 10, "Primary"),
        ("Primary 2", 20, "Primary"),
        ("Primary 3", 30, "Primary"),
        ("Primary 4", 40, "Primary"),
        ("Primary 5", 50, "Primary"),
        ("Primary 6", 60, "Primary"),
        ("JSS 1", 70, "Junior Secondary"),
        ("JSS 2", 80, "Junior Secondary"),
        ("JSS 3", 90, "Junior Secondary"),
        ("SSS 1", 100, "Senior Secondary"),
        ("SSS 2", 110, "Senior Secondary"),
        ("SSS 3", 120, "Senior Secondary"),
        # Standard K-12 Grade 1-12 mappings for legacy compatibility
        ("Grade 1", 11, "Primary"),
        ("Grade 2", 21, "Primary"),
        ("Grade 3", 31, "Primary"),
        ("Grade 4", 41, "Primary"),
        ("Grade 5", 51, "Primary"),
        ("Grade 6", 61, "Primary"),
        ("Grade 7", 71, "Junior Secondary"),
        ("Grade 8", 81, "Junior Secondary"),
        ("Grade 9", 91, "Junior Secondary"),
        ("Grade 10", 101, "Senior Secondary"),
        ("Grade 11", 111, "Senior Secondary"),
        ("Grade 12", 121, "Senior Secondary")
    ]
    for c_name, order_idx, category in nerdc_defaults:
        cur.execute("""
            INSERT OR IGNORE INTO classes (name, display_order, level_category, active)
            VALUES (?, ?, ?, 1)
        """, (c_name, order_idx, category))

    # Also capture any existing legacy classes in students/exams
    try:
        cur.execute("""
            SELECT DISTINCT class FROM students WHERE class IS NOT NULL AND TRIM(class) != ''
            UNION
            SELECT DISTINCT class FROM exams WHERE class IS NOT NULL AND TRIM(class) != ''
        """)
        for row in cur.fetchall():
            c_name = row[0].strip()
            cur.execute("INSERT OR IGNORE INTO classes (name, display_order, level_category, active) VALUES (?, 999, 'Custom', 1)", (c_name,))
    except Exception as e:
        print(f"Note on legacy class scan: {e}")

    # 2. Grading Schemes & Rules
    print("Migrating grading schemes...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS grading_schemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            scheme_type TEXT NOT NULL DEFAULT 'school',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS grading_scheme_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scheme_id INTEGER NOT NULL,
            grade_label TEXT NOT NULL,
            min_percentage REAL NOT NULL,
            max_percentage REAL NOT NULL,
            grade_point REAL DEFAULT 0.0,
            remark TEXT NOT NULL,
            badge_color TEXT DEFAULT '#10b981',
            display_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (scheme_id) REFERENCES grading_schemes(id) ON DELETE CASCADE
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gsr_scheme ON grading_scheme_rules(scheme_id);")

    # Seed WAEC 9-Point Scale
    cur.execute("SELECT id FROM grading_schemes WHERE name = 'WAEC 9-Point Scale'")
    row = cur.fetchone()
    if not row:
        cur.execute("""
            INSERT INTO grading_schemes (name, description, scheme_type, is_default)
            VALUES ('WAEC 9-Point Scale', 'Official West African Examinations Council 9-point secondary grading standard', 'school', 1)
        """)
        waec_id = cur.lastrowid
        waec_rules = [
            (waec_id, 'A1', 75.0, 100.0, 4.0, 'Excellent', '#059669', 1),
            (waec_id, 'B2', 70.0, 75.0, 3.5, 'Very Good', '#10b981', 2),
            (waec_id, 'B3', 65.0, 70.0, 3.0, 'Good', '#34d399', 3),
            (waec_id, 'C4', 60.0, 65.0, 2.5, 'Credit', '#3b82f6', 4),
            (waec_id, 'C5', 55.0, 60.0, 2.0, 'Credit', '#60a5fa', 5),
            (waec_id, 'C6', 50.0, 55.0, 1.5, 'Credit', '#818cf8', 6),
            (waec_id, 'D7', 45.0, 50.0, 1.0, 'Pass', '#f59e0b', 7),
            (waec_id, 'E8', 40.0, 45.0, 0.5, 'Pass', '#fb923c', 8),
            (waec_id, 'F9', 0.0, 40.0, 0.0, 'Fail', '#ef4444', 9),
        ]
        cur.executemany("""
            INSERT INTO grading_scheme_rules 
            (scheme_id, grade_label, min_percentage, max_percentage, grade_point, remark, badge_color, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, waec_rules)
    else:
        waec_id = row[0]

    # Seed Standard Letter Scale
    cur.execute("SELECT id FROM grading_schemes WHERE name = 'Standard Letter (A-F)'")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO grading_schemes (name, description, scheme_type, is_default)
            VALUES ('Standard Letter (A-F)', 'Universal 5-point academic scale (A, B, C, D, F)', 'school', 0)
        """)
        letter_id = cur.lastrowid
        letter_rules = [
            (letter_id, 'A', 90.0, 100.0, 4.0, 'Excellent', '#10b981', 1),
            (letter_id, 'B', 80.0, 90.0, 3.0, 'Very Good', '#3b82f6', 2),
            (letter_id, 'C', 70.0, 80.0, 2.0, 'Good', '#8b5cf6', 3),
            (letter_id, 'D', 60.0, 70.0, 1.0, 'Pass', '#f59e0b', 4),
            (letter_id, 'F', 0.0, 60.0, 0.0, 'Fail', '#ef4444', 5),
        ]
        cur.executemany("""
            INSERT INTO grading_scheme_rules 
            (scheme_id, grade_label, min_percentage, max_percentage, grade_point, remark, badge_color, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, letter_rules)

    # 3. School Settings Table
    print("Migrating school_settings...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS school_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            school_name TEXT NOT NULL DEFAULT 'CogniTara High School',
            school_motto TEXT DEFAULT 'Knowledge, Integrity, Excellence',
            school_address TEXT DEFAULT '',
            school_phone TEXT DEFAULT '',
            school_email TEXT DEFAULT '',
            school_logo TEXT DEFAULT 'default_logo.png',
            academic_session TEXT NOT NULL DEFAULT '2026/2027',
            current_term TEXT NOT NULL DEFAULT 'First Term',
            default_result_visibility TEXT NOT NULL DEFAULT 'immediate',
            allow_teacher_release INTEGER NOT NULL DEFAULT 0,
            allow_student_review INTEGER NOT NULL DEFAULT 1,
            active_grading_scheme_id INTEGER DEFAULT NULL,
            anti_cheating_profile TEXT DEFAULT 'medium',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (active_grading_scheme_id) REFERENCES grading_schemes(id) ON DELETE SET NULL
        );
    """)
    cur.execute("""
        INSERT OR IGNORE INTO school_settings (id, school_name, academic_session, current_term, default_result_visibility, active_grading_scheme_id, anti_cheating_profile)
        VALUES (1, 'CogniTara High School', '2026/2027', 'First Term', 'immediate', ?, 'medium')
    """, (waec_id,))

    # 4. CE Settings Table
    print("Migrating ce_settings...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ce_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            portal_title TEXT NOT NULL DEFAULT 'Entrance Examination Portal',
            institution_name TEXT NOT NULL DEFAULT 'CogniTara Academy',
            portal_logo TEXT DEFAULT 'default_ce_logo.png',
            admission_session TEXT NOT NULL DEFAULT '2026/2027',
            admission_batch TEXT NOT NULL DEFAULT 'Batch A',
            registration_open INTEGER NOT NULL DEFAULT 1,
            result_visibility TEXT NOT NULL DEFAULT 'hidden',
            default_passing_score INTEGER NOT NULL DEFAULT 50,
            pending_message TEXT DEFAULT 'Your examination has been completed and is currently under administrative review.',
            approved_message TEXT DEFAULT 'Congratulations! Your application has been approved for admission.',
            rejected_message TEXT DEFAULT 'We regret to inform you that your application was unsuccessful for this session.',
            active_ce_grading_scheme_id INTEGER DEFAULT NULL,
            anti_cheating_profile TEXT DEFAULT 'medium',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (active_ce_grading_scheme_id) REFERENCES grading_schemes(id) ON DELETE SET NULL
        );
    """)
    cur.execute("""
        INSERT OR IGNORE INTO ce_settings (id, portal_title, institution_name, admission_session, result_visibility, default_passing_score, anti_cheating_profile)
        VALUES (1, 'Entrance Examination Portal', 'CogniTara Academy', '2026/2027', 'hidden', 50, 'medium')
    """)

    # 5. Alter Exams Table
    print("Altering exams table...")
    cur.execute("PRAGMA table_info(exams);")
    exam_cols = {c[1] for c in cur.fetchall()}
    for col_name, col_def in [
        ("result_release_policy", "TEXT DEFAULT 'inherit'"),
        ("results_released", "INTEGER DEFAULT 1"),
        ("results_release_at", "DATETIME DEFAULT NULL"),
        ("grading_scheme_id", "INTEGER DEFAULT NULL"),
        ("anti_cheating_profile", "TEXT DEFAULT 'inherit'")
    ]:
        if col_name not in exam_cols:
            cur.execute(f"ALTER TABLE exams ADD COLUMN {col_name} {col_def};")

    # 6. Alter CE Exams Table
    print("Altering ce_exams table...")
    cur.execute("PRAGMA table_info(ce_exams);")
    ce_exam_cols = {c[1] for c in cur.fetchall()}
    for col_name, col_def in [
        ("results_released", "INTEGER DEFAULT 0"),
        ("release_date", "DATETIME DEFAULT NULL"),
        ("anti_cheating_profile", "TEXT DEFAULT 'inherit'")
    ]:
        if col_name not in ce_exam_cols:
            cur.execute(f"ALTER TABLE ce_exams ADD COLUMN {col_name} {col_def};")

    # 7. Alter Scores Table
    print("Altering scores table...")
    cur.execute("PRAGMA table_info(scores);")
    scores_cols = {c[1] for c in cur.fetchall()}
    for col_name, col_def in [
        ("grade_label", "TEXT DEFAULT NULL"),
        ("grade_remark", "TEXT DEFAULT NULL"),
        ("results_released", "INTEGER DEFAULT 1"),
        ("auto_submitted_reason", "TEXT DEFAULT NULL")
    ]:
        if col_name not in scores_cols:
            cur.execute(f"ALTER TABLE scores ADD COLUMN {col_name} {col_def};")

    # 8. Alter CE Attempts Table
    print("Altering ce_attempts table...")
    cur.execute("PRAGMA table_info(ce_attempts);")
    ce_att_cols = {c[1] for c in cur.fetchall()}
    for col_name, col_def in [
        ("grade_label", "TEXT DEFAULT NULL"),
        ("grade_remark", "TEXT DEFAULT NULL"),
        ("results_released", "INTEGER DEFAULT 0"),
        ("auto_submitted_reason", "TEXT DEFAULT NULL")
    ]:
        if col_name not in ce_att_cols:
            cur.execute(f"ALTER TABLE ce_attempts ADD COLUMN {col_name} {col_def};")

    # 9. Alter Questions Table (Add Explanation)
    print("Altering questions table...")
    cur.execute("PRAGMA table_info(questions);")
    q_cols = {c[1] for c in cur.fetchall()}
    if "explanation" not in q_cols:
        cur.execute("ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT NULL;")

    # 10. Student Academic Progression & Sessions
    print("Migrating progression tables...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS academic_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            start_date DATE,
            end_date DATE,
            is_current INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("INSERT OR IGNORE INTO academic_sessions (name, is_current) VALUES ('2026/2027', 1);")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_enrollment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            session_name TEXT NOT NULL,
            class_name TEXT NOT NULL,
            term TEXT NOT NULL DEFAULT 'Full Session',
            status TEXT NOT NULL DEFAULT 'enrolled',
            specialisation TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id)
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_seh_student ON student_enrollment_history(student_id);")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_promotions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            from_class TEXT NOT NULL,
            to_class TEXT NOT NULL,
            from_session TEXT,
            to_session TEXT,
            promoted_by TEXT,
            role TEXT,
            promotion_type TEXT DEFAULT 'promoted',
            specialisation TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sp_student ON student_promotions(student_id);")

    conn.commit()
    conn.close()
    print("Phase 4.6 migration successfully completed.")

if __name__ == '__main__':
    db = sys.argv[1] if len(sys.argv) > 1 else 'exam.db'
    migrate(db)
