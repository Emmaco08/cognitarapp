"""
CogniTara Offline Examination Portal - Comprehensive Test Suite
Tests Modular Architecture, Server-Authoritative State, Instant Persistence,
Session Fencing, Violation Integrity, and Dual-Engine Parity.
"""

import os
import sys
import unittest
import sqlite3
import json
import secrets
from datetime import datetime, timedelta

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cognitara import create_app
from cognitara.config import Config
from cognitara.database.connection import get_db_connection
from cognitara.database.initialization import ensure_deadline_columns
from cognitara.utils.helpers import get_utc_now
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.answer_service import save_regular_answer, save_ce_answer
from cognitara.services.session_service import (
    process_regular_heartbeat, process_ce_heartbeat,
    resume_regular_attempt, resume_ce_attempt, sweep_disconnected_attempts
)
from cognitara.services.violation_service import (
    log_regular_warning, log_ce_warning, reset_warnings
)
from cognitara.services.grading_service import (
    finalize_regular_exam_attempt, finalize_ce_exam_attempt
)

class TestCognitaraModularSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import shutil
        cls.test_db = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backups_phase4_3", "exam_test_disposable.db"))
        os.makedirs(os.path.dirname(cls.test_db), exist_ok=True)
        prod_db = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backups_phase4_3", "exam_pre_phase4_3.db"))
        if not os.path.exists(prod_db):
            prod_db = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "exam.db"))
        shutil.copy2(prod_db, cls.test_db)
        os.environ["COGNITARA_DB_NAME"] = cls.test_db

        from cognitara.database.initialization import init_phase4_6_schema
        m_conn = sqlite3.connect(cls.test_db)
        init_phase4_6_schema(m_conn)
        m_conn.close()

        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.app.config['WTF_CSRF_ENABLED'] = False  # Enable direct API testing
        cls.app.config['DATABASE_NAME'] = cls.test_db
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        if "COGNITARA_DB_NAME" in os.environ:
            del os.environ["COGNITARA_DB_NAME"]

    # =========================================================================
    # DOMAIN 1: ARCHITECTURAL MODULARITY & ENTRY POINT COMPATIBILITY
    # =========================================================================
    def test_01_application_factory_starts(self):
        """Verify create_app creates a valid, configured Flask application."""
        self.assertIsNotNone(self.app)
        self.assertTrue(self.app.secret_key is not None)
        self.assertTrue(os.path.exists(self.app.template_folder))
        self.assertTrue(os.path.exists(self.app.static_folder))

    def test_02_backward_compatible_app_py(self):
        """Verify root app.py exposes app instance and core symbols."""
        import app as root_app
        self.assertIsNotNone(root_app.app)
        self.assertEqual(root_app.app.name, "cognitara")
        self.assertTrue(callable(root_app.get_db_connection))
        self.assertTrue(callable(root_app.calculate_authoritative_remaining_time))

    def test_03_wsgi_compatibility(self):
        """Verify wsgi.py correctly imports app instance."""
        import wsgi
        self.assertIsNotNone(wsgi.app)

    def test_04_url_rule_baseline_completeness(self):
        """Verify all baseline routes are present in the modular application."""
        baseline_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'routes_baseline.json')
        if os.path.exists(baseline_path):
            with open(baseline_path, 'r', encoding='utf-8') as f:
                baseline = json.load(f)
            registered_rules = {str(r) for r in self.app.url_map.iter_rules()}
            for b in baseline:
                self.assertIn(b['rule'], registered_rules, f"Missing route: {b['rule']}")

    def test_05_url_for_backward_compatibility(self):
        """Verify unprefixed url_for calls resolve cleanly via url_build_error_handlers."""
        with self.app.test_request_context():
            from flask import url_for
            self.assertEqual(url_for('login'), '/login')
            self.assertEqual(url_for('admin_dashboard'), '/admin')
            self.assertEqual(url_for('avatar'), '/avatar')
            self.assertEqual(url_for('edit_student', student_id=5), '/admin/edit_student/5')

    # =========================================================================
    # DOMAIN 2: DATABASE DURABILITY & CRASH SAFETY
    # =========================================================================
    def test_06_database_wal_and_pragmas(self):
        """Verify SQLite connection pragmas: WAL mode, busy_timeout, foreign_keys."""
        conn = get_db_connection()
        try:
            journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            self.assertEqual(journal_mode.lower(), "wal")
            foreign_keys = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
            self.assertEqual(foreign_keys, 1)
            integrity = conn.execute("PRAGMA integrity_check;").fetchone()[0]
            self.assertEqual(integrity.lower(), "ok")
        finally:
            conn.close()

    def test_07_nondestructive_schema_check(self):
        """Verify ensure_deadline_columns is idempotent and never deletes rows."""
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            scores_before = cur.execute("SELECT COUNT(*) FROM scores;").fetchone()[0]
            ensure_deadline_columns(conn)
            scores_after = cur.execute("SELECT COUNT(*) FROM scores;").fetchone()[0]
            self.assertEqual(scores_before, scores_after)
        finally:
            conn.close()

    # =========================================================================
    # DOMAIN 3: INSTANT ANSWER PERSISTENCE (REGULAR EXAM & CE)
    @classmethod
    def _ensure_active_regular_attempt(cls, conn):
        attempt = conn.execute("SELECT id, student_id, exam_id FROM scores WHERE status='in_progress' LIMIT 1").fetchone()
        if not attempt:
            cur = conn.cursor()
            student = conn.execute("SELECT id FROM students LIMIT 1").fetchone()
            if not student:
                cur.execute(
                    "INSERT INTO students (username, password, class, full_name, status) "
                    "VALUES ('ci_student_1', 'scrypt:dummy', 'JSS 1', 'CI Test Student', 'approved')"
                )
                conn.commit()
                student = conn.execute("SELECT id FROM students WHERE id=?", (cur.lastrowid,)).fetchone()
            exam = conn.execute("SELECT e.id FROM exams e JOIN questions q ON e.id = q.exam_id LIMIT 1").fetchone()
            if not exam:
                cur.execute(
                    "INSERT INTO exams (name, class, duration, active, max_warnings) "
                    "VALUES ('CI Sample Exam', 'JSS 1', 30, 1, 3)"
                )
                exam_id = cur.lastrowid
                cur.execute(
                    "INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer) "
                    "VALUES (?, 'What is 2 + 2?', '3', '4', '5', '6', '4')",
                    (exam_id,)
                )
                conn.commit()
                exam = conn.execute("SELECT id FROM exams WHERE id=?", (exam_id,)).fetchone()
            if student and exam:
                cur.execute(
                    "INSERT INTO scores (student_id, exam_id, score, total, percentage, submitted, status, start_time, is_paused, warnings_count, remaining_time, authoritative_deadline) "
                    "VALUES (?, ?, 0, 0, 0, 0, 'in_progress', DATETIME('now'), 0, 0, 1800, DATETIME('now', '+30 minutes'))",
                    (student["id"], exam["id"])
                )
                conn.commit()
                attempt = conn.execute("SELECT id, student_id, exam_id FROM scores WHERE id=?", (cur.lastrowid,)).fetchone()
        return attempt

    @classmethod
    def _ensure_active_ce_attempt(cls, conn):
        attempt = conn.execute("SELECT id, student_id, exam_id FROM ce_attempts WHERE status='in_progress' LIMIT 1").fetchone()
        if not attempt:
            cur = conn.cursor()
            exam = conn.execute("SELECT e.id FROM ce_exams e JOIN ce_questions q ON e.id = q.exam_id LIMIT 1").fetchone()
            if not exam:
                cur.execute(
                    "INSERT INTO ce_exams (name, target_class, duration, active, max_warnings, passing_score) "
                    "VALUES ('CI Common Entrance', 'JSS 1', 45, 1, 3, 50)"
                )
                ce_exam_id = cur.lastrowid
                cur.execute(
                    "INSERT INTO ce_questions (exam_id, question, option1, option2, option3, option4, answer) "
                    "VALUES (?, 'Capital of Nigeria?', 'Lagos', 'Abuja', 'Kano', 'Ibadan', 'Abuja')",
                    (ce_exam_id,)
                )
                conn.commit()
                exam = conn.execute("SELECT id FROM ce_exams WHERE id=?", (ce_exam_id,)).fetchone()
            student = conn.execute("SELECT id FROM ce_students LIMIT 1").fetchone()
            if not student and exam:
                cur.execute(
                    "INSERT INTO ce_students (full_name, username, password, exam_id) "
                    "VALUES ('CI Candidate', 'ci_ce_cand_1', 'scrypt:dummy', ?)",
                    (exam["id"],)
                )
                conn.commit()
                student = conn.execute("SELECT id FROM ce_students WHERE id=?", (cur.lastrowid,)).fetchone()
            if student and exam:
                cur.execute(
                    "INSERT INTO ce_attempts (student_id, exam_id, score, total, percentage, passed, status, started_at, is_paused, warnings_count, remaining_time, authoritative_deadline) "
                    "VALUES (?, ?, 0, 0, 0, 0, 'in_progress', DATETIME('now'), 0, 0, 1800, DATETIME('now', '+30 minutes'))",
                    (student["id"], exam["id"])
                )
                conn.commit()
                attempt = conn.execute("SELECT id, student_id, exam_id FROM ce_attempts WHERE id=?", (cur.lastrowid,)).fetchone()
        return attempt

    # =========================================================================
    # DOMAIN 3: INSTANT ANSWER PERSISTENCE (REGULAR EXAM & CE)
    # =========================================================================
    def test_08_regular_save_single_answer_atomic_upsert(self):
        """Verify saving single regular answer performs atomic UPSERT in-place."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress regular attempt required")
            
            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            exam_id = attempt["exam_id"]
            q = conn.execute("SELECT id FROM questions WHERE exam_id=? LIMIT 1", (exam_id,)).fetchone()
            self.assertIsNotNone(q, "Question required for active exam")
            qid = q["id"]

            sess_key = secrets.token_hex(16)
            conn.execute("UPDATE scores SET session_key=?, authoritative_deadline=DATETIME('now', '+30 minutes'), is_paused=0, status='in_progress' WHERE id=?", (sess_key, att_id))
            conn.commit()

            # First save: option A
            res1 = save_regular_answer(stud_id, att_id, qid, "A", time_spent=10, session_key=sess_key)
            self.assertTrue(res1.get("success"), res1)
            self.assertTrue(res1.get("saved"))

            ans1 = conn.execute("SELECT user_answer, time_spent FROM exam_question_responses WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()
            self.assertIsNotNone(ans1)
            self.assertEqual(ans1["user_answer"], "A")
            self.assertEqual(ans1["time_spent"], 10)

            # Rapid change / revision: option B
            res2 = save_regular_answer(stud_id, att_id, qid, "B", time_spent=25, session_key=sess_key)
            self.assertTrue(res2.get("success"), res2)

            # Assert exactly 1 row exists (no duplicate) and contains option B
            count = conn.execute("SELECT COUNT(*) FROM exam_question_responses WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()[0]
            self.assertEqual(count, 1)

            ans2 = conn.execute("SELECT user_answer, time_spent FROM exam_question_responses WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()
            self.assertEqual(ans2["user_answer"], "B")
            self.assertEqual(ans2["time_spent"], 25)
        finally:
            conn.close()

    def test_09_ce_save_single_answer_atomic_upsert(self):
        """Verify saving single CE answer performs atomic UPSERT in-place."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_ce_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress CE attempt required")
            
            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            exam_id = attempt["exam_id"]
            q = conn.execute("SELECT id FROM ce_questions WHERE exam_id=? LIMIT 1", (exam_id,)).fetchone()
            self.assertIsNotNone(q, "CE question required for active CE exam")
            qid = q["id"]

            sess_key = secrets.token_hex(16)
            conn.execute("UPDATE ce_attempts SET session_key=?, authoritative_deadline=DATETIME('now', '+30 minutes'), is_paused=0, status='in_progress' WHERE id=?", (sess_key, att_id))
            conn.commit()

            # First save: option A
            res1 = save_ce_answer(stud_id, att_id, qid, "A", time_spent=12, session_key=sess_key)
            self.assertTrue(res1.get("success"), res1)
            self.assertTrue(res1.get("saved"))

            ans1 = conn.execute("SELECT user_answer, time_spent FROM ce_attempt_questions WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()
            self.assertIsNotNone(ans1)
            self.assertEqual(ans1["user_answer"], "A")

            # Revision: option C
            res2 = save_ce_answer(stud_id, att_id, qid, "C", time_spent=30, session_key=sess_key)
            self.assertTrue(res2.get("success"), res2)

            # Assert exactly 1 row in ce_attempt_questions (no duplicate)
            count = conn.execute("SELECT COUNT(*) FROM ce_attempt_questions WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()[0]
            self.assertEqual(count, 1)

            ans2 = conn.execute("SELECT user_answer, time_spent FROM ce_attempt_questions WHERE attempt_id=? AND question_id=?", (att_id, qid)).fetchone()
            self.assertEqual(ans2["user_answer"], "C")
            self.assertEqual(ans2["time_spent"], 30)
        finally:
            conn.close()

    # =========================================================================
    # DOMAIN 4: SESSION FENCING & CROSS-COMPUTER RECOVERY
    # =========================================================================
    def test_10_stale_session_lease_rejection(self):
        """Verify that writes with an outdated session_key are rejected as superseded."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress regular attempt required")

            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            q = conn.execute("SELECT id FROM questions WHERE exam_id=? LIMIT 1", (attempt["exam_id"],)).fetchone()
            self.assertIsNotNone(q, "Question required")
            qid = q["id"]

            old_lease = "old_lease_computer_1"
            new_lease = "new_lease_computer_2"

            # Admin resumes exam on Computer 2, issuing new_lease
            conn.execute("UPDATE scores SET session_key=?, is_paused=0, status='in_progress', authoritative_deadline=DATETIME('now', '+30 minutes') WHERE id=?", (new_lease, att_id))
            conn.commit()

            # Computer 1 tries to write with old lease -> REJECTED
            res_stale = save_regular_answer(stud_id, att_id, qid, "B", session_key=old_lease)
            self.assertEqual(res_stale.get("status_code"), 403)
            self.assertTrue(res_stale.get("superseded"))

            # Computer 2 writes with active lease -> ACCEPTED
            res_active = save_regular_answer(stud_id, att_id, qid, "B", session_key=new_lease)
            self.assertTrue(res_active.get("success"))
        finally:
            conn.close()

    # =========================================================================
    # DOMAIN 5: SERVER-AUTHORITATIVE VIOLATIONS & AUDIT INTEGRITY
    # =========================================================================
    def test_11_violation_monotonic_increment_and_audit(self):
        """Verify warning logs monotonically increment and authorized reset logs audit trail."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress attempt required")

            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            exam_id = attempt["exam_id"]

            conn.execute("UPDATE scores SET warnings_count=2, max_warnings=5, is_paused=0, status='in_progress' WHERE id=?", (att_id,))
            conn.commit()

            # Monotonic increment via service
            log_res = log_regular_warning(stud_id, exam_id, "Tab switched", attempt_id=att_id)
            self.assertEqual(log_res["warning_count"], 3)
            self.assertFalse(log_res["is_paused"])

            # Verify in database
            curr_w = conn.execute("SELECT warnings_count FROM scores WHERE id=?", (att_id,)).fetchone()[0]
            self.assertEqual(curr_w, 3)

            # Authorized proctor reset with audit
            reset_res = reset_warnings(att_id, exam_type="regular", reset_by="proctor_smith", role="Teacher", reason="Accidental touch on laboratory mouse")
            self.assertTrue(reset_res["success"])
            self.assertEqual(reset_res["new_count"], 0)
            self.assertEqual(reset_res["previous_count"], 3)

            # Verify audit trail record
            audit_entry = conn.execute("SELECT * FROM warning_reset_audit WHERE attempt_id=? ORDER BY id DESC LIMIT 1", (att_id,)).fetchone()
            self.assertIsNotNone(audit_entry)
            self.assertEqual(audit_entry["reset_by"], "proctor_smith")
            self.assertEqual(audit_entry["previous_count"], 3)
            self.assertEqual(audit_entry["new_count"], 0)
            self.assertIn("Accidental touch", audit_entry["reason"])
        finally:
            conn.close()

    # =========================================================================
    # DOMAIN 6: TIMING & DEADLINE ENFORCEMENT
    # =========================================================================
    def test_12_expired_deadline_rejection(self):
        """Verify server authoritative timing rejects writes after deadline expiry."""
        from datetime import timezone
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress attempt required")

            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            exam_id = attempt["exam_id"]
            q = conn.execute("SELECT id FROM questions WHERE exam_id=? LIMIT 1", (exam_id,)).fetchone()
            self.assertIsNotNone(q, "Question required")
            qid = q["id"]

            sess_key = secrets.token_hex(16)
            # Set deadline in the past
            past_deadline = (datetime.now(timezone.utc) - timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("UPDATE scores SET authoritative_deadline=?, session_key=?, is_paused=0, status='in_progress' WHERE id=?", (past_deadline, sess_key, att_id))
            conn.commit()

            # Attempt to write -> Auto-submits and reports time_up
            res = save_regular_answer(stud_id, att_id, qid, "C", session_key=sess_key)
            self.assertTrue(res.get("time_up"))
            self.assertEqual(res.get("remaining_time"), 0)

            # Verify attempt is now completed
            status = conn.execute("SELECT status FROM scores WHERE id=?", (att_id,)).fetchone()[0]
            self.assertEqual(status, "completed")

            # Restore attempt status to in_progress with active deadline for subsequent tests
            conn.execute("UPDATE scores SET status='in_progress', authoritative_deadline=DATETIME('now', '+30 minutes') WHERE id=?", (att_id,))
            conn.commit()
        finally:
            conn.close()

    # =========================================================================
    # DOMAIN 7: AUTO-PAUSE ON DISCONNECT (HEARTBEAT LEASE TIMEOUT)
    # =========================================================================
    def test_13_heartbeat_service_updates_and_monitors(self):
        """Verify heartbeat updates last_heartbeat timestamp and detects pauses."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt, "Active in-progress attempt required")

            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            sess_key = secrets.token_hex(16)
            conn.execute("UPDATE scores SET session_key=?, is_paused=0, status='in_progress', authoritative_deadline=DATETIME('now', '+20 minutes') WHERE id=?", (sess_key, att_id))
            conn.commit()

            hb_res = process_regular_heartbeat(stud_id, att_id, sess_key)
            self.assertTrue(hb_res.get("success"))
            self.assertFalse(hb_res.get("is_paused"))
            self.assertGreater(hb_res.get("remaining_time"), 0)
        finally:
            conn.close()

    def test_14_sweep_disconnected_attempts_active_detection(self):
        """Verify sweep_disconnected_attempts pauses attempts with dropped heartbeats (>90s) without background threads."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt)
            att_id = attempt["id"]
            
            # Simulate dropped heartbeat 105 seconds ago (beyond 90s HEARTBEAT_TIMEOUT_SECONDS)
            stale_time = (get_utc_now() - timedelta(seconds=105)).strftime('%Y-%m-%d %H:%M:%S')
            conn.execute("""
                UPDATE scores 
                SET last_heartbeat=?, updated_at=?, is_paused=0, status='in_progress', authoritative_deadline=DATETIME('now', '+20 minutes')
                WHERE id=?
            """, (stale_time, stale_time, att_id))
            conn.commit()

            # Execute sweep
            paused_count = sweep_disconnected_attempts(conn)
            self.assertGreaterEqual(paused_count, 1)

            # Check database: attempt must be paused with reason
            row = conn.execute("SELECT is_paused, paused_by, pause_reason FROM scores WHERE id=?", (att_id,)).fetchone()
            self.assertEqual(row["is_paused"], 1)
            self.assertEqual(row["paused_by"], "heartbeat_timeout")
            self.assertIn("Connection lost", row["pause_reason"])
        finally:
            conn.close()

    def test_15_cross_student_ownership_rejection(self):
        """Verify that a student cannot write answers to another student's exam attempt."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_regular_attempt(conn)
            self.assertIsNotNone(attempt)
            att_id = attempt["id"]
            real_student_id = attempt["student_id"]
            impostor_student_id = real_student_id + 999
            
            q = conn.execute("SELECT id FROM questions WHERE exam_id=? LIMIT 1", (attempt["exam_id"],)).fetchone()
            self.assertIsNotNone(q)
            
            sess_key = secrets.token_hex(16)
            conn.execute("UPDATE scores SET session_key=?, is_paused=0, status='in_progress', authoritative_deadline=DATETIME('now', '+30 minutes') WHERE id=?", (sess_key, att_id))
            conn.commit()

            # Attempt write as impostor
            res = save_regular_answer(impostor_student_id, att_id, q["id"], "A", session_key=sess_key)
            self.assertEqual(res.get("status_code"), 403)
            self.assertIn("Forbidden", res.get("error", ""))
        finally:
            conn.close()

    def test_16_ce_violation_monotonic_and_reset(self):
        """Verify Common Entrance violation tracking is monotonic and reset writes audit."""
        conn = get_db_connection()
        try:
            attempt = self._ensure_active_ce_attempt(conn)
            self.assertIsNotNone(attempt)
            att_id = attempt["id"]
            stud_id = attempt["student_id"]
            exam_id = attempt["exam_id"]

            conn.execute("UPDATE ce_attempts SET warnings_count=1, max_warnings=3, is_paused=0, status='in_progress' WHERE id=?", (att_id,))
            conn.commit()

            # Log warning 2
            res1 = log_ce_warning(stud_id, exam_id, "Tab switched", attempt_id=att_id)
            self.assertEqual(res1["warning_count"], 2)
            self.assertFalse(res1["is_paused"])

            # Log warning 3 -> Reaches max -> Auto-submits atomically (Phase 4.6 invariant)
            res2 = log_ce_warning(stud_id, exam_id, "Window minimized", attempt_id=att_id)
            self.assertEqual(res2["warning_count"], 3)
            self.assertFalse(res2.get("is_paused", False))
            self.assertTrue(res2.get("auto_submitted", False))

            # Verify in database that it is auto-submitted and NOT paused
            att_row = conn.execute("SELECT is_paused, paused_by, warnings_count, status, force_submit FROM ce_attempts WHERE id=?", (att_id,)).fetchone()
            self.assertEqual(att_row["is_paused"], 0)
            self.assertEqual(att_row["warnings_count"], 3)
            self.assertEqual(att_row["status"], "pending")
            self.assertEqual(att_row["force_submit"], 1)

            # Authorized proctor reset
            reset_res = reset_warnings(att_id, exam_type="ce", reset_by="proctor_admin", role="Admin", reason="Authorized warning reset")
            self.assertTrue(reset_res["success"])
            self.assertEqual(reset_res["new_count"], 0)

            # Verify audit trail
            audit = conn.execute("SELECT * FROM warning_reset_audit WHERE attempt_id=? AND exam_type='ce' ORDER BY id DESC LIMIT 1", (att_id,)).fetchone()
            self.assertIsNotNone(audit)
            self.assertEqual(audit["reset_by"], "proctor_admin")
            self.assertEqual(audit["previous_count"], 3)
        finally:
            conn.close()

    def test_17_request_body_size_limit_configured(self):
        """Verify MAX_CONTENT_LENGTH defaults to None so image uploads of any size are accepted."""
        limit = self.app.config.get("MAX_CONTENT_LENGTH")
        self.assertIsNone(limit)

if __name__ == "__main__":
    unittest.main()
