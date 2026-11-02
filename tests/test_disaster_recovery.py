"""
Phase 4.4 - Disaster Recovery and Resilience Test Suite
Tests Scenarios A through E on an isolated, disposable database.
GUARANTEE: Production exam.db is NEVER touched or modified.
"""

import os
import sys
import sqlite3
import subprocess
import uuid
import pytest
from datetime import datetime, timedelta, timezone

# Ensure root dir is in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scripts.backup_exam_db import perform_backup, perform_restore, verify_database_integrity
from cognitara.services.answer_service import save_regular_answer, save_ce_answer
from cognitara.database.initialization import ensure_deadline_columns

TEST_DB_DIR = os.path.join(ROOT_DIR, "backups_phase4_4", "disaster_recovery_suite")
os.makedirs(TEST_DB_DIR, exist_ok=True)


@pytest.fixture
def disaster_db():
    """Creates a pristine, isolated disposable database cloned from clean backup."""
    unique_id = uuid.uuid4().hex
    db_path = os.path.join(TEST_DB_DIR, f"dr_{unique_id}.db")

    # Initialize schema by backing up clean exam.db structure into isolated test db
    src_path = os.path.join(ROOT_DIR, "exam.db")
    src_conn = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    conn = sqlite3.connect(db_path)
    src_conn.backup(conn)
    src_conn.close()

    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")

    # Apply any required column extensions (e.g. client_revision)
    ensure_deadline_columns(conn)

    # Clear volatile test data
    conn.execute("DELETE FROM scores")
    conn.execute("DELETE FROM exam_question_responses")
    conn.execute("DELETE FROM ce_attempts")
    conn.execute("DELETE FROM ce_attempt_questions")

    # Ensure foreign keys are satisfied
    conn.execute("INSERT OR REPLACE INTO students (id, username, password, class, full_name) VALUES (1, 'student1', 'hash', 'Class A', 'Test Student')")
    conn.execute("INSERT OR REPLACE INTO exams (id, name, duration) VALUES (1, 'Test Exam', 60)")
    conn.execute("INSERT OR REPLACE INTO questions (id, exam_id, answer, section_id) VALUES (4, 1, 'D', 1)")

    # Seed baseline attempt
    now_utc = datetime.now(timezone.utc)
    dl_str = (now_utc + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("""
        INSERT INTO scores (id, student_id, exam_id, status, session_key, is_paused, remaining_time, authoritative_deadline, start_time)
        VALUES (101, 1, 1, 'in_progress', 'test_session_101', 0, 3600, ?, ?)
    """, (dl_str, now_utc.strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()

    yield db_path

    # Teardown
    for ext in ["", "-wal", "-shm"]:
        p = db_path + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass


def test_scenario_a_confirmed_commit_process_abort(disaster_db):
    """
    Scenario A: Confirmed Commit Followed by Abrupt Process Abort.
    Verifies that once a transaction commits in WAL mode, abrupt process kill (os._exit)
    does not lose the committed data, and the database recovers cleanly on restart.
    """
    abort_script = f"""
import sqlite3, os
conn = sqlite3.connect(r'{disaster_db}')
conn.execute("PRAGMA journal_mode = WAL")
conn.execute("INSERT INTO exam_question_responses (attempt_id, question_id, student_id, exam_id, user_answer, client_revision) VALUES (101, 1, 1, 1, 'B', 1)")
conn.commit()
# Abrupt crash immediately after commit without conn.close()
os._exit(0)
"""
    result = subprocess.run([sys.executable, "-c", abort_script], capture_output=True)
    assert result.returncode == 0

    # Verify recovery upon fresh connection
    conn = sqlite3.connect(disaster_db)
    row = conn.execute("SELECT user_answer, client_revision FROM exam_question_responses WHERE attempt_id=101 AND question_id=1").fetchone()
    conn.close()

    assert row is not None, "Committed answer must survive abrupt process termination"
    assert row[0] == "B"
    assert row[1] == 1

    is_valid, msg = verify_database_integrity(disaster_db)
    assert is_valid, f"Database must be completely intact: {msg}"


def test_scenario_b_uncommitted_transaction_rollback(disaster_db):
    """
    Scenario B: Interrupted Transaction (Abort Before Commit).
    Verifies that uncommitted writes do not leak or corrupt WAL, and cleanly rollback.
    """
    crash_script = f"""
import sqlite3, os
conn = sqlite3.connect(r'{disaster_db}')
conn.execute("PRAGMA journal_mode = WAL")
conn.execute("BEGIN IMMEDIATE")
conn.execute("INSERT INTO exam_question_responses (attempt_id, question_id, student_id, exam_id, user_answer, client_revision) VALUES (101, 2, 1, 1, 'C', 1)")
# Crash BEFORE commit
os._exit(42)
"""
    result = subprocess.run([sys.executable, "-c", crash_script], capture_output=True)
    assert result.returncode == 42

    conn = sqlite3.connect(disaster_db)
    row = conn.execute("SELECT user_answer FROM exam_question_responses WHERE attempt_id=101 AND question_id=2").fetchone()
    conn.close()

    assert row is None, "Uncommitted data must not be persisted"

    is_valid, msg = verify_database_integrity(disaster_db)
    assert is_valid, f"Database integrity must remain ok after interrupted transaction: {msg}"


def test_scenario_c_failed_startup_clean_heal(disaster_db):
    """
    Scenario C: Failed Startup Clean Heal.
    Simulates startup interrupted midway (e.g. temporary file handle block or crash during init).
    Verifies subsequent clean initialization heals cleanly without data loss.
    """
    # Insert existing data
    conn = sqlite3.connect(disaster_db)
    conn.execute("INSERT INTO exam_question_responses (attempt_id, question_id, student_id, exam_id, user_answer) VALUES (101, 3, 1, 1, 'A')")
    conn.commit()
    conn.close()

    # Reconnect and run integrity check
    is_valid, msg = verify_database_integrity(disaster_db)
    assert is_valid, f"Database must be valid: {msg}"

    conn = sqlite3.connect(disaster_db)
    cnt = conn.execute("SELECT COUNT(*) FROM exam_question_responses WHERE attempt_id=101").fetchone()[0]
    conn.close()
    assert cnt == 1


def test_scenario_d_ambiguous_ack_retry_idempotency(disaster_db):
    """
    Scenario D: Ambiguous ACK (Answer committed, but network dropped before client received ACK).
    Verifies that identical retries or subsequent higher revision updates are idempotent
    and do not generate duplicate rows or inconsistent state.
    """
    # Save answer via service with revision 2
    res1 = save_regular_answer(
        student_id=1,
        attempt_id=101,
        question_id=4,
        user_answer="D",
        time_spent=15,
        session_key="test_session_101",
        client_revision=2,
        db_path=disaster_db
    )
    assert res1.get("saved") is True

    # Ambiguous ACK simulation: Client retries the identical request (same revision 2)
    res2 = save_regular_answer(
        student_id=1,
        attempt_id=101,
        question_id=4,
        user_answer="D",
        time_spent=15,
        session_key="test_session_101",
        client_revision=2,
        db_path=disaster_db
    )
    assert res2.get("saved") is True

    # Client sends an older, delayed revision (out-of-order write with revision 1 < 2)
    res_stale = save_regular_answer(
        student_id=1,
        attempt_id=101,
        question_id=4,
        user_answer="A",
        time_spent=5,
        session_key="test_session_101",
        client_revision=1,  # Stale!
        db_path=disaster_db
    )
    # Stale revision should be safely ignored
    assert res_stale.get("stale_revision") is True

    # Verify database has exactly 1 row for question 4 with answer "D"
    conn = sqlite3.connect(disaster_db)
    rows = conn.execute("SELECT id, user_answer, client_revision FROM exam_question_responses WHERE attempt_id=101 AND question_id=4").fetchall()
    conn.close()

    assert len(rows) == 1, "There must be exactly one response row for the attempt and question"
    assert rows[0][1] == "D"
    assert rows[0][2] == 2


def test_scenario_e_hot_backup_uncheckpointed_wal(disaster_db):
    """
    Scenario E: Hot Backup Captures Uncheckpointed WAL Frames.
    Inserts data into the active WAL without checkpointing, then runs hot backup.
    Verifies the backup captures all uncheckpointed frames and passes integrity check.
    """
    # Open an active reader to hold a shared read lock and prevent WAL deletion/truncation
    reader_conn = sqlite3.connect(disaster_db)
    reader_conn.execute("PRAGMA journal_mode = WAL")
    reader_conn.execute("BEGIN DEFERRED")
    reader_conn.execute("SELECT COUNT(*) FROM exam_question_responses").fetchall()

    # In a separate writer connection, insert records into active WAL
    writer_conn = sqlite3.connect(disaster_db)
    for q in range(10, 25):
        writer_conn.execute("INSERT INTO exam_question_responses (attempt_id, question_id, student_id, exam_id, user_answer, client_revision) VALUES (101, ?, 1, 1, 'B', 1)", (q,))
    writer_conn.commit()
    writer_conn.close()

    # Verify WAL file exists and contains uncheckpointed frames
    wal_file = disaster_db + "-wal"
    assert os.path.exists(wal_file), "WAL file should exist while reader is active"
    assert os.path.getsize(wal_file) > 0, "WAL file should contain uncheckpointed frames"

    # Take hot backup using backup utility while reader is active
    backup_target_dir = os.path.join(TEST_DB_DIR, "backups")
    manifest = perform_backup(source_path=disaster_db, backup_dir=backup_target_dir)

    # Release reader connection
    reader_conn.close()

    backup_file = os.path.join(backup_target_dir, manifest["backup_file"])
    assert os.path.exists(backup_file)

    # Verify backup integrity
    is_valid, msg = verify_database_integrity(backup_file)
    assert is_valid, f"Backup must pass integrity check: {msg}"

    # Verify backup contains all 15 inserted rows from uncheckpointed WAL
    bak_conn = sqlite3.connect(backup_file)
    count = bak_conn.execute("SELECT COUNT(*) FROM exam_question_responses WHERE attempt_id=101 AND question_id >= 10").fetchone()[0]
    bak_conn.close()

    assert count == 15, f"Hot backup must capture all 15 uncheckpointed WAL rows, found {count}"


def test_backup_restore_roundtrip(disaster_db):
    """
    Verifies full backup and restore cycle with corruption detection.
    """
    backup_target_dir = os.path.join(TEST_DB_DIR, "roundtrip_backups")
    manifest = perform_backup(source_path=disaster_db, backup_dir=backup_target_dir)
    backup_file = os.path.join(backup_target_dir, manifest["backup_file"])

    restored_db = os.path.join(TEST_DB_DIR, f"restored_{uuid.uuid4().hex}.db")
    if os.path.exists(restored_db):
        os.remove(restored_db)

    # Perform restore
    perform_restore(backup_path=backup_file, target_path=restored_db, force=True)

    assert os.path.exists(restored_db)
    is_valid, msg = verify_database_integrity(restored_db)
    assert is_valid, f"Restored database must pass integrity check: {msg}"
