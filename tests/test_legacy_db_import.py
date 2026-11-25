"""
Comprehensive tests for Legacy School Database (exam.db) Inspection & Atomic Migration:
  - Real repository legacy exam.db (https://github.com/Emmaco08/cognitarapp/blob/main/exam.db)
  - Minimal older v1.x schema upgrade path
  - License vault (`local_license_state`) & Super Admin recovery code preservation
  - Automatic salted password upgrade for legacy plaintext credentials
  - Corrupt / non-CogniTara / active-exam safety guards
  - Desktop loopback internal API & Web Admin School Settings endpoints
"""

import io
import os
import shutil
import sqlite3

import pytest
from werkzeug.security import check_password_hash, generate_password_hash

from cognitara.database.bootstrap import ensure_core_database_initialized
from cognitara.services.legacy_db_import import (
    import_legacy_database,
    inspect_legacy_database,
)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REAL_LEGACY_DB = os.path.join(REPO_ROOT, "exam.db")


def _seed_fresh_v2_active_db(db_path: str) -> None:
    """Create a realistic freshly-onboarded v2.2.x active DB with license vault & recovery codes."""
    ensure_core_database_initialized(db_path, seed_sample_users=False)
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO admin (username, password) VALUES (?, ?)",
            ("principal_new", generate_password_hash("StrongAdmin#2026")),
        )
        aid = cur.lastrowid
        for i in range(4):
            cur.execute(
                "INSERT INTO admin_recovery_codes (admin_id, code_hash, used) VALUES (?, ?, 0)",
                (aid, f"sha256_recovery_code_{i}"),
            )
        cur.execute(
            """
            INSERT INTO local_license_state
                (id, license_id, max_seen_utc, used_seconds, lock_state, vault_checksum)
            VALUES (1, 'LIC-LIVE-9999', 1795600000, 4200, 'active', 'vault_sha256_abc123')
            """
        )
        conn.commit()
    finally:
        conn.close()


def test_real_repo_exam_db_inspect_and_import_preserves_vault_and_upgrades_passwords(tmp_path):
    assert os.path.isfile(REAL_LEGACY_DB), "Expected repository exam.db to exist"
    legacy_copy = str(tmp_path / "legacy_exam.db")
    shutil.copy2(REAL_LEGACY_DB, legacy_copy)
    orig_mtime = os.path.getmtime(legacy_copy)
    orig_size = os.path.getsize(legacy_copy)

    # Capture one sample real admin, teacher, and student credential from the real exam.db before import
    src_conn = sqlite3.connect(legacy_copy)
    sample_admin = src_conn.execute("SELECT username, password FROM admin ORDER BY id ASC LIMIT 1").fetchone()
    sample_teacher = src_conn.execute("SELECT username, password FROM teachers ORDER BY id ASC LIMIT 1").fetchone()
    sample_student = src_conn.execute("SELECT username, password FROM students ORDER BY id ASC LIMIT 1").fetchone()
    src_conn.close()

    # 1. Read-only inspection
    info = inspect_legacy_database(legacy_copy)
    assert info["ok"] is True
    assert info["counts"]["admins"] >= 1
    assert info["counts"]["teachers"] >= 1
    assert info["counts"]["students"] >= 1
    assert info["counts"]["exams"] >= 1
    assert info["legacy_plaintext_passwords"] >= 3
    assert info["has_recovery_codes"] is False
    # Source file must remain completely untouched
    assert os.path.getmtime(legacy_copy) == orig_mtime
    assert os.path.getsize(legacy_copy) == orig_size

    # 2. Import into a freshly onboarded v2 active DB
    active_db = str(tmp_path / "active_exam.db")
    backup_dir = str(tmp_path / "backups")
    _seed_fresh_v2_active_db(active_db)

    res = import_legacy_database(
        source_path=legacy_copy,
        active_db_path=active_db,
        backup_dir=backup_dir,
        preserve_current_admin=True,
    )
    assert res["ok"] is True
    assert res["passwords_upgraded"] >= 3
    assert res["license_state_preserved"] is True
    assert res["preserved_recovery_codes"] == 4
    assert "principal_new" in res["preserved_admin_usernames"]

    # Safety backup created and passes integrity check
    safety_path = os.path.join(backup_dir, res["safety_snapshot"])
    assert os.path.isfile(safety_path)
    s_conn = sqlite3.connect(safety_path)
    assert s_conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    s_conn.close()

    # Verify active DB state post-import
    conn = sqlite3.connect(active_db)
    try:
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"

        # 5-layer license vault state preserved bit-for-bit
        lic = conn.execute(
            "SELECT license_id, max_seen_utc, used_seconds, lock_state, vault_checksum FROM local_license_state WHERE id=1"
        ).fetchone()
        assert lic == ("LIC-LIVE-9999", 1795600000, 4200, "active", "vault_sha256_abc123")

        # Preserved current superadmin + recovery codes
        p_admin = conn.execute("SELECT id, password FROM admin WHERE username='principal_new'").fetchone()
        assert p_admin is not None
        assert check_password_hash(p_admin[1], "StrongAdmin#2026")
        rc_cnt = conn.execute("SELECT COUNT(*) FROM admin_recovery_codes WHERE admin_id=?", (p_admin[0],)).fetchone()[0]
        assert rc_cnt == 4

        # Legacy accounts imported AND plaintext passwords upgraded to secure hashes
        leg_admin = conn.execute("SELECT password FROM admin WHERE username=?", (sample_admin[0],)).fetchone()
        assert leg_admin is not None
        assert leg_admin[0] != sample_admin[1] and check_password_hash(leg_admin[0], sample_admin[1])

        leg_teacher = conn.execute("SELECT password FROM teachers WHERE username=?", (sample_teacher[0],)).fetchone()
        assert leg_teacher is not None
        assert leg_teacher[0] != sample_teacher[1] and check_password_hash(leg_teacher[0], sample_teacher[1])

        leg_student = conn.execute("SELECT password FROM students WHERE username=?", (sample_student[0],)).fetchone()
        assert leg_student is not None
        assert leg_student[0] != sample_student[1] and check_password_hash(leg_student[0], sample_student[1])
    finally:
        conn.close()


def test_minimal_v1_legacy_schema_auto_upgrades_all_tables_and_defaults(tmp_path):
    v1_db = str(tmp_path / "v1_old_school.db")
    conn = sqlite3.connect(v1_db)
    conn.executescript(
        """
        CREATE TABLE admin (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT);
        CREATE TABLE teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, class TEXT);
        CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, class TEXT);
        CREATE TABLE exams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, class TEXT, duration INTEGER, active INTEGER);
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, question TEXT,
            option1 TEXT, option2 TEXT, option3 TEXT, option4 TEXT, answer TEXT
        );
        INSERT INTO admin (username, password) VALUES ('old_admin', 'oldpass1');
        INSERT INTO teachers (username, password, class) VALUES ('mr_ade', 'ade123', 'JSS 1');
        INSERT INTO students (username, password, class) VALUES ('stu_001', 'stu123', 'JSS 1');
        INSERT INTO exams (name, class, duration, active) VALUES ('Civic Education', 'JSS 1', 30, 1);
        INSERT INTO questions (exam_id, question, option1, option2, option3, option4, answer)
            VALUES (1, 'Capital of Nigeria?', 'Lagos', 'Abuja', 'Kano', 'Enugu', 'Abuja');
        """
    )
    conn.commit()
    conn.close()

    info = inspect_legacy_database(v1_db)
    assert info["ok"] is True
    assert info["needs_schema_upgrade"] is True
    assert info["counts"]["students"] == 1
    assert info["counts"]["questions"] == 1
    assert info["legacy_plaintext_passwords"] == 3

    active_db = str(tmp_path / "active_v2.db")
    backup_dir = str(tmp_path / "backups")
    _seed_fresh_v2_active_db(active_db)

    res = import_legacy_database(
        source_path=v1_db,
        active_db_path=active_db,
        backup_dir=backup_dir,
        preserve_current_admin=False,
    )
    assert res["ok"] is True
    assert res["schema_upgraded"] is True
    assert res["passwords_upgraded"] == 3
    # Even with preserve_current_admin=False, recovery codes carry over so onboarding never regresses
    assert res["preserved_recovery_codes"] == 4

    c = sqlite3.connect(active_db)
    try:
        # Verify v2 columns & defaults exist on legacy student and exam
        srow = c.execute("SELECT username, password, status, specialisation, full_name FROM students WHERE username='stu_001'").fetchone()
        assert srow is not None
        assert check_password_hash(srow[1], "stu123")
        assert srow[2] == "approved"
        assert srow[3] == "General"
        assert srow[4] == "stu_001"

        erow = c.execute("SELECT name, calculator_type, max_warnings, result_release_policy FROM exams WHERE id=1").fetchone()
        assert erow[:3] == ("Civic Education", "none", 5)
        assert erow[3] in ("inherit", "immediate")

        # Modern tables created cleanly
        for tbl in ("school_settings", "ce_exams", "grading_schemes", "local_license_state", "admin_recovery_codes"):
            assert c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (tbl,)).fetchone() is not None
    finally:
        c.close()


def test_rejects_corrupt_non_cognitara_and_active_exam_conflicts(tmp_path):
    # Non-SQLite text file
    bad_txt = str(tmp_path / "fake.db")
    with open(bad_txt, "w", encoding="utf-8") as fh:
        fh.write("this is not a sqlite database at all" * 10)
    r1 = inspect_legacy_database(bad_txt)
    assert r1["ok"] is False and r1["error"] == "invalid_database"

    # Valid SQLite file without CogniTara tables
    unrelated = str(tmp_path / "unrelated.db")
    uconn = sqlite3.connect(unrelated)
    uconn.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)")
    uconn.execute("INSERT INTO notes (body) VALUES ('hello')")
    uconn.commit()
    uconn.close()
    r2 = inspect_legacy_database(unrelated)
    assert r2["ok"] is False and r2["error"] == "not_cognitara_database"

    # Blocks import when an exam attempt is currently in progress
    active_db = str(tmp_path / "active_live.db")
    backup_dir = str(tmp_path / "backups")
    _seed_fresh_v2_active_db(active_db)
    aconn = sqlite3.connect(active_db)
    aconn.execute("INSERT INTO scores (student_id, exam_id, status) VALUES (1, 1, 'in_progress')")
    aconn.commit()
    aconn.close()

    legacy_copy = str(tmp_path / "legacy_copy.db")
    shutil.copy2(REAL_LEGACY_DB, legacy_copy)
    r3 = import_legacy_database(legacy_copy, active_db, backup_dir)
    assert r3["ok"] is False and r3["error"] == "active_exams_in_progress"


def test_desktop_internal_and_admin_web_legacy_import_endpoints(tmp_path, monkeypatch):
    data_dir = str(tmp_path / "app_data")
    os.makedirs(data_dir, exist_ok=True)
    active_db = os.path.join(data_dir, "exam.db")
    _seed_fresh_v2_active_db(active_db)

    monkeypatch.setenv("COGNITARA_BYPASS_LICENSE", "1")
    monkeypatch.setenv("COGNITARA_DESKTOP_TOKEN", "test_desktop_token_xyz")
    monkeypatch.setenv("COGNITARA_DATA_DIR", data_dir)

    from cognitara import create_app
    app = create_app()
    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["DATABASE_NAME"] = active_db
    app.config["BACKUP_DIR"] = os.path.join(data_dir, "backups")
    app.config["DESKTOP_CONTROL_TOKEN"] = "test_desktop_token_xyz"

    legacy_copy = str(tmp_path / "school_old.db")
    shutil.copy2(REAL_LEGACY_DB, legacy_copy)

    client = app.test_client()

    # 1. Desktop internal endpoint rejects missing token
    unauth = client.post("/api/internal/backups/inspect-legacy", json={"file_path": legacy_copy})
    assert unauth.status_code == 401

    # 2. Desktop internal inspect + import with valid token
    headers = {"X-CogniTara-Desktop-Token": "test_desktop_token_xyz"}
    insp = client.post("/api/internal/backups/inspect-legacy", json={"file_path": legacy_copy}, headers=headers)
    assert insp.status_code == 200
    assert insp.get_json()["ok"] is True

    imp = client.post(
        "/api/internal/backups/import-legacy",
        json={"file_path": legacy_copy, "preserve_current_admin": True},
        headers=headers,
    )
    assert imp.status_code == 200
    imp_json = imp.get_json()
    assert imp_json["ok"] is True
    assert imp_json["counts"]["students"] >= 1

    # 3. Admin Web School Settings upload inspect + import
    with client.session_transaction() as sess:
        sess["admin_id"] = 1
        sess["username"] = "principal_new"
        sess["role"] = "Admin"

    with open(legacy_copy, "rb") as fh:
        raw = fh.read()

    web_insp = client.post(
        "/admin/school-settings/inspect-legacy-db",
        data={"db_file": (io.BytesIO(raw), "exam.db")},
        content_type="multipart/form-data",
    )
    assert web_insp.status_code == 200
    assert web_insp.get_json()["ok"] is True

    web_imp = client.post(
        "/admin/school-settings/import-legacy-db",
        data={
            "db_file": (io.BytesIO(raw), "exam.db"),
            "preserve_current_admin": "true",
        },
        content_type="multipart/form-data",
    )
    assert web_imp.status_code == 200
    assert web_imp.get_json()["ok"] is True
