import sqlite3
import logging

logger = logging.getLogger("cognitara.database")

_CHECKED_DBS = set()

def ensure_deadline_columns(conn):
    """
    Ensures state, timing, heartbeat, and audit columns exist in scores and ce_attempts tables.
    Non-destructive; does not delete historical records.
    """
    global _CHECKED_DBS
    # Identify database file path from PRAGMA database_list
    try:
        db_file = conn.execute("PRAGMA database_list;").fetchone()[2] or ":memory:"
    except Exception:
        db_file = "unknown"
        
    if db_file in _CHECKED_DBS:
        return
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(scores);")
        scores_cols = {c[1] for c in cur.fetchall()}
        new_scores_cols = [
            ("authoritative_deadline", "DATETIME"),
            ("session_key", "TEXT"),
            ("last_heartbeat", "TIMESTAMP"),
            ("max_warnings", "INTEGER DEFAULT 5"),
            ("time_adjust_delta", "INTEGER DEFAULT 0"),
            ("time_adjusted_at", "DATETIME"),
            ("tab_closed", "INTEGER DEFAULT 0"),
            ("pause_reason", "TEXT")
        ]
        for col_name, col_type in new_scores_cols:
            if col_name not in scores_cols:
                conn.execute(f"ALTER TABLE scores ADD COLUMN {col_name} {col_type};")
        conn.commit()

        cur.execute("PRAGMA table_info(ce_attempts);")
        ce_cols = {c[1] for c in cur.fetchall()}
        new_ce_cols = [
            ("authoritative_deadline", "DATETIME"),
            ("session_key", "TEXT"),
            ("last_heartbeat", "TIMESTAMP"),
            ("max_warnings", "INTEGER DEFAULT 5"),
            ("time_adjust_delta", "INTEGER DEFAULT 0"),
            ("time_adjusted_at", "DATETIME"),
            ("tab_closed", "INTEGER DEFAULT 0"),
            ("pause_reason", "TEXT"),
            ("updated_at", "TIMESTAMP")
        ]
        for col_name, col_type in new_ce_cols:
            if col_name not in ce_cols:
                conn.execute(f"ALTER TABLE ce_attempts ADD COLUMN {col_name} {col_type};")
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ce_students';")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(ce_students);")
            ce_stud_cols = {c[1] for c in cur.fetchall()}
            if "photo" not in ce_stud_cols:
                conn.execute("ALTER TABLE ce_students ADD COLUMN photo TEXT DEFAULT 'default.png';")
            conn.commit()

        # Non-destructive uniqueness check & revision columns for exam_question_responses
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_question_responses';")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(exam_question_responses);")
            eqr_cols = {c[1] for c in cur.fetchall()}
            if "client_revision" not in eqr_cols:
                conn.execute("ALTER TABLE exam_question_responses ADD COLUMN client_revision INTEGER DEFAULT 0;")
            if "client_timestamp" not in eqr_cols:
                conn.execute("ALTER TABLE exam_question_responses ADD COLUMN client_timestamp INTEGER DEFAULT 0;")
            conn.commit()

            cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_eqr_attempt_question';")
            if not cur.fetchone():
                cur.execute("""
                    SELECT 1 FROM exam_question_responses 
                    GROUP BY attempt_id, question_id 
                    HAVING COUNT(*) > 1 
                    LIMIT 1;
                """)
                if cur.fetchone() is None:
                    conn.execute("""
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_eqr_attempt_question 
                        ON exam_question_responses(attempt_id, question_id);
                    """)
                    conn.commit()
                else:
                    logger.warning(
                        "Duplicate records detected in exam_question_responses; skipping automatic unique index creation. "
                        "Run separate migration script: migrations/reconcile_duplicate_responses.py"
                    )

        # Unique index & revision columns on ce_attempt_questions
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ce_attempt_questions';")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(ce_attempt_questions);")
            ce_aq_cols = {c[1] for c in cur.fetchall()}
            if "client_revision" not in ce_aq_cols:
                conn.execute("ALTER TABLE ce_attempt_questions ADD COLUMN client_revision INTEGER DEFAULT 0;")
            if "client_timestamp" not in ce_aq_cols:
                conn.execute("ALTER TABLE ce_attempt_questions ADD COLUMN client_timestamp INTEGER DEFAULT 0;")
            if "time_spent" not in ce_aq_cols:
                conn.execute("ALTER TABLE ce_attempt_questions ADD COLUMN time_spent INTEGER DEFAULT 0;")
            if "completed_at" not in ce_aq_cols:
                conn.execute("ALTER TABLE ce_attempt_questions ADD COLUMN completed_at TIMESTAMP;")
            conn.commit()

            cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_ce_aq_attempt_question';")
            if not cur.fetchone():
                cur.execute("""
                    SELECT 1 FROM ce_attempt_questions 
                    GROUP BY attempt_id, question_id 
                    HAVING COUNT(*) > 1 
                    LIMIT 1;
                """)
                if cur.fetchone() is None:
                    conn.execute("""
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_ce_aq_attempt_question 
                        ON ce_attempt_questions(attempt_id, question_id);
                    """)
                    conn.commit()

        # Warning reset audit table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS warning_reset_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attempt_id INTEGER NOT NULL,
                exam_type TEXT NOT NULL,
                student_id INTEGER NOT NULL,
                exam_id INTEGER NOT NULL,
                reset_by TEXT NOT NULL,
                role TEXT NOT NULL,
                previous_count INTEGER NOT NULL,
                new_count INTEGER NOT NULL,
                reason TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()

        # Run Phase 4.6 non-destructive schema initialization
        init_phase4_6_schema(conn)

        # Run v2 licensing & desktop recovery non-destructive schema initialization
        init_license_tables(conn)

        _CHECKED_DBS.add(db_file)
    except Exception as e:
        logger.error(f"Error checking deadline columns: {e}")

def ensure_force_submit_column(conn):
    """Add force_submit column to scores table if it doesn't exist"""
    try:
        conn.execute("ALTER TABLE scores ADD COLUMN force_submit INTEGER DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        pass

def ensure_section_active_column(conn):
    """Add active column to section tables if they don't exist"""
    try:
        conn.execute("ALTER TABLE exam_sections ADD COLUMN active INTEGER DEFAULT 1")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE ce_sections ADD COLUMN active INTEGER DEFAULT 1")
        conn.commit()
    except sqlite3.OperationalError:
        pass

def init_analytics_tables(conn):
    """Create analytics-related tables if they don't exist"""
    try:
        conn.execute("""
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eqr_attempt ON exam_question_responses(attempt_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eqr_exam ON exam_question_responses(exam_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eqr_student ON exam_question_responses(student_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_eqr_section ON exam_question_responses(section_id)")
        conn.commit()
    except Exception as e:
        logger.error(f"Error creating analytics tables: {e}")

def init_exam_management_tables(conn):
    """Create tables needed for exam management features"""
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exam_deactivation_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER,
                admin_username TEXT,
                reason TEXT,
                deactivated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exam_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER,
                version_number INTEGER,
                exam_snapshot TEXT,
                changed_by TEXT,
                change_description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            conn.execute("ALTER TABLE exams ADD COLUMN deactivated INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        conn.commit()
    except Exception as e:
        logger.error(f"Error creating exam management tables: {e}")

def init_phase4_6_schema(conn):
    """
    Phase 4.6 non-destructive schema additions:
    Classes, School Settings, CE Settings, Grading Schemes, Progression, and Explanations.
    """
    try:
        cur = conn.cursor()
        # 1. Classes Table
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

        nerdc_defaults = [
            ("Primary 1", 10, "Primary"), ("Primary 2", 20, "Primary"), ("Primary 3", 30, "Primary"),
            ("Primary 4", 40, "Primary"), ("Primary 5", 50, "Primary"), ("Primary 6", 60, "Primary"),
            ("JSS 1", 70, "Junior Secondary"), ("JSS 2", 80, "Junior Secondary"), ("JSS 3", 90, "Junior Secondary"),
            ("SSS 1", 100, "Senior Secondary"), ("SSS 2", 110, "Senior Secondary"), ("SSS 3", 120, "Senior Secondary"),
            ("Grade 1", 11, "Primary"), ("Grade 2", 21, "Primary"), ("Grade 3", 31, "Primary"),
            ("Grade 4", 41, "Primary"), ("Grade 5", 51, "Primary"), ("Grade 6", 61, "Primary"),
            ("Grade 7", 71, "Junior Secondary"), ("Grade 8", 81, "Junior Secondary"), ("Grade 9", 91, "Junior Secondary"),
            ("Grade 10", 101, "Senior Secondary"), ("Grade 11", 111, "Senior Secondary"), ("Grade 12", 121, "Senior Secondary")
        ]
        for c_name, order_idx, category in nerdc_defaults:
            cur.execute("INSERT OR IGNORE INTO classes (name, display_order, level_category, active) VALUES (?, ?, ?, 1)", (c_name, order_idx, category))

        # 2. Grading Schemes & Rules
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

        # 3. School Settings
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
                max_warnings INTEGER NOT NULL DEFAULT 5,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (active_grading_scheme_id) REFERENCES grading_schemes(id) ON DELETE SET NULL
            );
        """)
        cur.execute("PRAGMA table_info(school_settings);")
        school_cols = {c[1] for c in cur.fetchall()}
        if "max_warnings" not in school_cols:
            conn.execute("ALTER TABLE school_settings ADD COLUMN max_warnings INTEGER DEFAULT 5;")

        cur.execute("""
            INSERT OR IGNORE INTO school_settings (id, school_name, academic_session, current_term, default_result_visibility, active_grading_scheme_id, anti_cheating_profile, max_warnings)
            VALUES (1, 'CogniTara High School', '2026/2027', 'First Term', 'immediate', ?, 'medium', 5)
        """, (waec_id,))

        # 4. CE Settings
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ce_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                portal_title TEXT NOT NULL DEFAULT 'Entrance Examination Portal',
                institution_name TEXT NOT NULL DEFAULT 'CogniTara Academy',
                portal_logo TEXT DEFAULT 'default_ce_logo.png',
                admission_session TEXT NOT NULL DEFAULT '2026/2027',
                admission_batch TEXT NOT NULL DEFAULT 'Batch A',
                registration_open INTEGER NOT NULL DEFAULT 1,
                direct_submit INTEGER NOT NULL DEFAULT 0,
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
        cur.execute("PRAGMA table_info(ce_settings);")
        ce_set_cols = {c[1] for c in cur.fetchall()}
        if "direct_submit" not in ce_set_cols:
            conn.execute("ALTER TABLE ce_settings ADD COLUMN direct_submit INTEGER DEFAULT 0;")

        cur.execute("""
            INSERT OR IGNORE INTO ce_settings (id, portal_title, institution_name, admission_session, result_visibility, default_passing_score, anti_cheating_profile, direct_submit)
            VALUES (1, 'Entrance Examination Portal', 'CogniTara Academy', '2026/2027', 'hidden', 50, 'medium', 0)
        """)

        # 5. Columns additions (exams, ce_exams, scores, ce_attempts, questions)
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
                conn.execute(f"ALTER TABLE exams ADD COLUMN {col_name} {col_def};")

        cur.execute("PRAGMA table_info(ce_exams);")
        ce_exam_cols = {c[1] for c in cur.fetchall()}
        for col_name, col_def in [
            ("results_released", "INTEGER DEFAULT 0"),
            ("release_date", "DATETIME DEFAULT NULL"),
            ("anti_cheating_profile", "TEXT DEFAULT 'inherit'")
        ]:
            if col_name not in ce_exam_cols:
                conn.execute(f"ALTER TABLE ce_exams ADD COLUMN {col_name} {col_def};")

        cur.execute("PRAGMA table_info(scores);")
        scores_cols = {c[1] for c in cur.fetchall()}
        for col_name, col_def in [
            ("grade_label", "TEXT DEFAULT NULL"),
            ("grade_remark", "TEXT DEFAULT NULL"),
            ("results_released", "INTEGER DEFAULT 1"),
            ("auto_submitted_reason", "TEXT DEFAULT NULL")
        ]:
            if col_name not in scores_cols:
                conn.execute(f"ALTER TABLE scores ADD COLUMN {col_name} {col_def};")

        cur.execute("PRAGMA table_info(ce_attempts);")
        ce_att_cols = {c[1] for c in cur.fetchall()}
        for col_name, col_def in [
            ("grade_label", "TEXT DEFAULT NULL"),
            ("grade_remark", "TEXT DEFAULT NULL"),
            ("results_released", "INTEGER DEFAULT 0"),
            ("auto_submitted_reason", "TEXT DEFAULT NULL")
        ]:
            if col_name not in ce_att_cols:
                conn.execute(f"ALTER TABLE ce_attempts ADD COLUMN {col_name} {col_def};")

        # Migrate school_settings and ce_settings additions
        cur.execute("PRAGMA table_info(school_settings);")
        school_cols = {c[1] for c in cur.fetchall()}
        if "max_warnings" not in school_cols:
            conn.execute("ALTER TABLE school_settings ADD COLUMN max_warnings INTEGER DEFAULT 5;")

        cur.execute("PRAGMA table_info(ce_settings);")
        ce_set_cols = {c[1] for c in cur.fetchall()}
        if "direct_submit" not in ce_set_cols:
            conn.execute("ALTER TABLE ce_settings ADD COLUMN direct_submit INTEGER DEFAULT 0;")

        cur.execute("PRAGMA table_info(questions);")
        q_cols = {c[1] for c in cur.fetchall()}
        if "explanation" not in q_cols:
            conn.execute("ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT NULL;")

        # 6. Progression tables
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
    except Exception as e:
        logger.error(f"Error in init_phase4_6_schema: {e}")


def init_license_tables(conn):
    """
    Non-destructive v2 desktop licensing & recovery schema additions:
    - local_license_state: Anchor C of the triple-anchor anti-clock-tamper vault
    - admin_recovery_codes: Hashed one-time super admin recovery codes
    """
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS local_license_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                license_id TEXT NOT NULL,
                max_seen_utc INTEGER NOT NULL,
                used_seconds INTEGER NOT NULL DEFAULT 0,
                lock_state TEXT NOT NULL DEFAULT 'ACTIVE',
                active_exam_drain_until INTEGER DEFAULT NULL,
                vault_checksum TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_recovery_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                used_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admin(id) ON DELETE CASCADE
            );
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_admin_recovery_admin ON admin_recovery_codes(admin_id, used);"
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Error in init_license_tables: {e}")


