import sqlite3
import os

def migrate(db_path='exam.db'):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # 1. scores columns
    cur.execute("PRAGMA table_info(scores)")
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
            cur.execute(f"ALTER TABLE scores ADD COLUMN {col_name} {col_type};")
            print(f"Added {col_name} to scores")

    # 2. ce_attempts columns
    cur.execute("PRAGMA table_info(ce_attempts)")
    ce_cols = {c[1] for c in cur.fetchall()}
    
    new_ce_cols = [
        ("authoritative_deadline", "DATETIME"),
        ("session_key", "TEXT"),
        ("last_heartbeat", "TIMESTAMP"),
        ("max_warnings", "INTEGER DEFAULT 5"),
        ("time_adjust_delta", "INTEGER DEFAULT 0"),
        ("time_adjusted_at", "DATETIME"),
        ("tab_closed", "INTEGER DEFAULT 0"),
        ("pause_reason", "TEXT")
    ]
    for col_name, col_type in new_ce_cols:
        if col_name not in ce_cols:
            cur.execute(f"ALTER TABLE ce_attempts ADD COLUMN {col_name} {col_type};")
            print(f"Added {col_name} to ce_attempts")

    # 3. Unique index on ce_attempt_questions (attempt_id, question_id)
    cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_ce_aq_attempt_question';")
    if not cur.fetchone():
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_ce_aq_attempt_question ON ce_attempt_questions(attempt_id, question_id);")
        print("Created unique index uq_ce_aq_attempt_question")

    # 4. warning_reset_audit table
    cur.execute("""
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
    print("Ensured table warning_reset_audit")

    # 5. Enable WAL mode
    cur.execute("PRAGMA journal_mode=WAL;")
    wal_mode = cur.fetchone()[0]
    print(f"Journal mode: {wal_mode}")

    conn.commit()
    conn.close()
    print("Migration completed successfully.")

if __name__ == '__main__':
    migrate()
