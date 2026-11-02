"""
Phase 4.4 Security and Abuse Resistance Test Suite.
Validates authorization boundaries, state transition integrity, XSS sanitization,
CSRF fail-closed behavior, and image upload verification.
"""

import os
import sys
import sqlite3
import uuid
import io
import pytest

# Ensure root dir is in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from cognitara import create_app
from cognitara.security.csrf_ratelimit import validate_csrf
from cognitara.utils.helpers import compress_image
from cognitara.database.initialization import ensure_deadline_columns

SECURITY_DB_DIR = os.path.join(ROOT_DIR, "backups_phase4_4", "security_suite")
os.makedirs(SECURITY_DB_DIR, exist_ok=True)


@pytest.fixture(scope="module")
def security_test_env():
    """Sets up an isolated test app and disposable database."""
    unique_id = uuid.uuid4().hex
    db_path = os.path.join(SECURITY_DB_DIR, f"sec_{unique_id}.db")

    # Clone schema from clean exam.db
    src_path = os.path.join(ROOT_DIR, "exam.db")
    src_conn = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    dst_conn = sqlite3.connect(db_path)
    src_conn.backup(dst_conn)
    src_conn.close()

    dst_conn.execute("PRAGMA journal_mode = WAL")
    dst_conn.execute("PRAGMA busy_timeout = 30000")
    ensure_deadline_columns(dst_conn)

    # Clean test data
    dst_conn.execute("DELETE FROM scores")
    dst_conn.execute("DELETE FROM ce_attempts")
    dst_conn.execute("DELETE FROM students")
    dst_conn.execute("DELETE FROM exams")

    # Seed test entities
    dst_conn.execute("INSERT INTO students (id, username, password, class, full_name) VALUES (1, 'alice', 'hash', 'Class 1', 'Alice Test')")
    dst_conn.execute("INSERT INTO students (id, username, password, class, full_name) VALUES (2, 'bob', 'hash', 'Class 1', 'Bob Test')")
    dst_conn.execute("INSERT INTO exams (id, name, duration, class, active) VALUES (1, 'Math Exam', 60, 'Class 1', 1)")
    dst_conn.execute("INSERT INTO ce_exams (id, name, duration, target_class, active) VALUES (1, 'CE Math', 60, 'Class 1', 1)")

    # Seed active attempts
    # Regular attempt 101 for Alice, paused by admin
    dst_conn.execute("""
        INSERT INTO scores (id, student_id, exam_id, status, is_paused, paused_by, pause_reason, session_key, remaining_time)
        VALUES (101, 1, 1, 'in_progress', 1, 'admin', 'Admin manual pause', 'alice_session_key', 1800)
    """)

    # CE attempt 201 for Alice, paused by admin
    dst_conn.execute("""
        INSERT INTO ce_attempts (id, student_id, exam_id, status, is_paused, paused_by, pause_reason, session_key, remaining_time)
        VALUES (201, 1, 1, 'in_progress', 1, 'admin', 'Admin manual pause', 'alice_ce_session', 1800)
    """)

    dst_conn.commit()
    dst_conn.close()

    old_env = os.environ.get("COGNITARA_DB_NAME")
    os.environ["COGNITARA_DB_NAME"] = db_path

    app = create_app({
        "TESTING": True,
        "DATABASE_NAME": db_path,
        "SECRET_KEY": "test_security_secret_key"
    })

    yield {"app": app, "db_path": db_path}

    if old_env is not None:
        os.environ["COGNITARA_DB_NAME"] = old_env
    else:
        os.environ.pop("COGNITARA_DB_NAME", None)

    # Teardown
    for ext in ["", "-wal", "-shm"]:
        p = db_path + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass


def test_csrf_fail_closed_validation(security_test_env):
    """Verifies validate_csrf fails closed when token is missing or invalid."""
    app = security_test_env["app"]
    with app.test_request_context():
        assert validate_csrf(None) is False
        assert validate_csrf("") is False
        assert validate_csrf("non_existent_token") is False
        assert validate_csrf("a" * 32) is False


def test_state_machine_pause_bypass_regular(security_test_env):
    """
    Verifies that calling /exam_auto_submit_close cannot overwrite an admin-enforced pause
    with auto_lock, preventing student self-unpause bypass.
    """
    app = security_test_env["app"]
    db_path = security_test_env["db_path"]

    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess["student_id"] = 1
            sess["username"] = "alice"

        res = client.post("/exam_auto_submit_close", json={"attempt_id": 101})
        # Even if route returns a response, verify database state did NOT clobber paused_by
        conn = sqlite3.connect(db_path)
        row = conn.execute("SELECT is_paused, paused_by, pause_reason FROM scores WHERE id=101").fetchone()
        conn.close()

        assert row[0] == 1, "Attempt must remain paused"
        assert row[1] == "admin", "Admin paused_by must NEVER be clobbered by auto_submit_close"
        assert row[2] == "Admin manual pause"


def test_state_machine_pause_bypass_ce(security_test_env):
    """
    Verifies that calling /ce_auto_submit_close cannot overwrite an admin-enforced pause.
    """
    app = security_test_env["app"]
    db_path = security_test_env["db_path"]

    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess["ce_student_id"] = 1
            sess["student_id"] = 1

        res = client.post("/ce_auto_submit_close", json={"attempt_id": 201})
        conn = sqlite3.connect(db_path)
        row = conn.execute("SELECT is_paused, paused_by, pause_reason FROM ce_attempts WHERE id=201").fetchone()
        conn.close()

        assert row[0] == 1, "CE Attempt must remain paused"
        assert row[1] == "admin", "Admin paused_by must NEVER be clobbered by ce_auto_submit_close"


def test_unauthenticated_ce_lockout_rejected(security_test_env):
    """
    Verifies unauthenticated callers cannot trigger /ce_auto_submit_close.
    """
    app = security_test_env["app"]
    with app.test_client() as client:
        # Without CSRF token or session -> rejected with 400 Bad Request
        res = client.post("/ce_auto_submit_close", json={"attempt_id": 201})
        assert res.status_code in [400, 401, 403], f"Unauthenticated request must be rejected, got {res.status_code}"


def test_unauthenticated_ce_state_harvesting_rejected(security_test_env):
    """
    Verifies that unauthenticated or horizontal attackers cannot harvest CE attempt state.
    """
    app = security_test_env["app"]
    with app.test_client() as client:
        # Unauthenticated request
        res = client.get("/ce_get_exam_state/201")
        assert res.status_code == 401, f"Unauthenticated state inspection must return 401, got {res.status_code}"

        # Horizontal privilege escalation attempt: Bob (student_id=2) tries to inspect Alice's attempt (student_id=1)
        with client.session_transaction() as sess:
            sess["ce_student_id"] = 2
            sess["student_id"] = 2

        res2 = client.get("/ce_get_exam_state/201")
        assert res2.status_code == 403, f"Cross-student attempt inspection must return 403, got {res2.status_code}"

        # Legitimate owner: Alice (student_id=1)
        with client.session_transaction() as sess:
            sess["ce_student_id"] = 1
            sess["student_id"] = 1

        res3 = client.get("/ce_get_exam_state/201")
        assert res3.status_code == 200, f"Authorized attempt inspection must return 200, got {res3.status_code}"


def test_avatar_svg_xss_sanitization(security_test_env):
    """
    Verifies /avatar route rejects SVG filenames that contain XSS payloads.
    """
    app = security_test_env["app"]
    with app.test_client() as client:
        # Attempt path traversal and XSS
        res = client.get("/avatar/<script>alert(1)</script>")
        assert res.status_code in [400, 404], f"XSS avatar payload must be rejected, got {res.status_code}"
        assert b"<script>" not in res.data, "Response must not reflect raw script tag"


def test_non_image_upload_rejection(tmp_path):
    """
    Verifies compress_image uses PIL header verification and rejects non-image executable binaries.
    """
    fake_png = io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00ExecutableBinaryDisguisedAsPng")
    out_file1 = str(tmp_path / "out1.png")
    assert compress_image(fake_png, out_file1) is False

    fake_script = io.BytesIO(b"<?php echo 'malicious'; ?>")
    out_file2 = str(tmp_path / "out2.png")
    assert compress_image(fake_script, out_file2) is False
