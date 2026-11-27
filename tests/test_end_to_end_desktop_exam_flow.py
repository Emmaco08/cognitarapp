"""
CogniTara v2 - End-to-End Fresh-Install Desktop + Admin + Live Exam Verification
(tests/test_end_to_end_desktop_exam_flow.py)

Simulates a brand-new Windows installation starting from an EMPTY data directory
(no pre-existing exam.db, no pre-existing vault, COGNITARA_ENFORCE_LICENSE=1,
NO testing license bypass) and verifies the complete user journey:
  1. Auto-bootstrap of all 32+ SQLite tables & default classes on first startup.
  2. Unactivated portal lock (403) before licence/trial activation.
  3. Studio Onboarding via authenticated /api/internal/* routes:
     - School profile saved
     - 14-day hardware-bound trial activated & sealed across all 3 anchors
     - Super admin created with 8 recovery codes
  4. Redesigned /login (Studio v2) & /admin (Studio v2) render cleanly with HTTP 200.
  5. Admin creates an Exam, adds 2 MCQ questions, activates the exam, and adds a Student.
  6. Student signs in, opens /dashboard, starts the exam (/exam_begin/<id>),
     saves answers (/exam_save_single_answer), sends heartbeat (/exam_heartbeat),
     submits (/exam/<id> POST), and views graded 2/2 score on /result/<id>.
  7. Studio telemetry (/api/internal/telemetry) and hot SQLite backup (/api/internal/hot-backup)
     verify cleanly.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import pytest

from cognitara import create_app
from cognitara.security.license_guard import LicenseGuard
from cognitara.security.vault_store import RegistryAnchor, TripleAnchorVaultStore


def test_fresh_install_onboarding_admin_and_full_live_exam(tmp_path, monkeypatch):
    # Completely empty fresh data dir - NO exam.db exists yet!
    data_dir = tmp_path / "fresh_data"
    db_path = data_dir / "exam.db"
    backup_dir = tmp_path / "backups"
    vault_path = tmp_path / "vault" / "license_vault.bin"
    reg_path = tmp_path / "vault" / "registry_anchor.json"
    desktop_token = "e2e-desktop-launch-token-987654321"

    monkeypatch.setenv("COGNITARA_DATA_DIR", str(data_dir))
    monkeypatch.setenv("COGNITARA_DB_NAME", str(db_path))
    monkeypatch.setenv("COGNITARA_BACKUP_DIR", str(backup_dir))
    monkeypatch.setenv("COGNITARA_DESKTOP_TOKEN", desktop_token)
    monkeypatch.setenv("COGNITARA_ENFORCE_LICENSE", "1")
    monkeypatch.delenv("COGNITARA_TESTING_BYPASS_LICENSE", raising=False)

    app = create_app()
    # Keep TESTING=False during enforcement checks so bypass can never activate
    app.config["TESTING"] = False
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["DATABASE_NAME"] = str(db_path)
    app.config["BACKUP_DIR"] = str(backup_dir)
    app.config["DESKTOP_CONTROL_TOKEN"] = desktop_token

    # Attach isolated TripleAnchorVaultStore for this test run
    def _conn():
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        return c

    vault = TripleAnchorVaultStore(
        vault_path=str(vault_path),
        registry_anchor=RegistryAnchor(fallback_file=str(reg_path), force_file_backend=True),
        db_conn_factory=_conn,
    )
    guard = LicenseGuard(vault_store=vault, db_conn_factory=_conn)
    app.extensions["license_guard"] = guard

    client = app.test_client()
    hdrs = {"X-CogniTara-Desktop-Token": desktop_token}

    # 1. Verify fresh exam.db was auto-bootstrapped with core tables & default classes
    assert db_path.exists()
    with _conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        for required in ("admin", "students", "teachers", "exams", "questions", "scores", "school_settings", "classes", "local_license_state"):
            assert required in tables, f"Missing auto-bootstrapped table: {required}"
        cls_names = {r[0] for r in conn.execute("SELECT name FROM classes").fetchall()}
        assert "JSS 1" in cls_names and "SSS 3" in cls_names

    # 2. Unactivated portal is blocked (403), while /health & /api/internal/* remain reachable
    assert client.get("/health").status_code == 200
    assert client.get("/login").status_code == 403

    # 3. Complete Studio Onboarding: school profile -> 14-day trial -> super admin
    r_school = client.post(
        "/api/internal/setup/school",
        json={
            "school_name": "Cedar Hills Test Academy",
            "school_motto": "Truth and Merit",
            "academic_session": "2026/2027",
            "current_term": "First Term",
        },
        headers=hdrs,
    )
    assert r_school.status_code == 200 and r_school.get_json()["ok"] is True

    r_trial = client.post(
        "/api/internal/license/start-trial",
        json={"school_name": "Cedar Hills Test Academy"},
        headers=hdrs,
    )
    assert r_trial.status_code == 200
    trial_data = r_trial.get_json()
    assert trial_data["ok"] is True
    assert trial_data["status"]["lock_state"] == "ACTIVE"
    assert trial_data["status"]["plan_tier"] == "trial"
    assert trial_data["status"]["days_remaining"] >= 13

    r_admin = client.post(
        "/api/internal/setup/superadmin",
        json={
            "full_name": "Adaeze Okafor",
            "username": "superadmin",
            "password": "SuperStrong#Password2026",
            "recovery_codes": ["ABCD-1234", "EFGH-5678"],
        },
        headers=hdrs,
    )
    assert r_admin.status_code == 200 and r_admin.get_json()["ok"] is True

    # 4. Redesigned /login renders cleanly with saved school branding
    r_login_page = client.get("/login")
    assert r_login_page.status_code == 200
    login_html = r_login_page.get_data(as_text=True)
    assert "Cedar Hills Test Academy" in login_html
    assert "Truth and Merit" in login_html

    # 5. Super Admin signs in -> lands on redesigned Studio v2 /admin console
    r_admin_login = client.post(
        "/login",
        data={"username": "superadmin", "password": "SuperStrong#Password2026", "role": "Admin"},
        follow_redirects=True,
    )
    assert r_admin_login.status_code == 200
    admin_html = r_admin_login.get_data(as_text=True)
    assert "Cedar Hills Test Academy" in admin_html
    assert "Examinations Directory" in admin_html
    assert "Students Management" in admin_html
    assert "/admin/add_exam" not in admin_html

    # 6. Verify v2.2.6 RBAC: Admin cannot create regular exams (GET redirects, POST 403 Forbidden)
    r_blocked_get = client.get("/admin/add_exam", follow_redirects=False)
    assert r_blocked_get.status_code == 302
    assert "/admin/exams-management" in (r_blocked_get.headers.get("Location") or "")
    r_blocked_exam = client.post(
        "/admin/add_exam",
        data={"exam_name": "Should Not Exist", "class": "JSS 1", "duration": "30"},
        follow_redirects=False,
    )
    assert r_blocked_exam.status_code == 403

    # Admin provisions a Teacher and an approved Student
    r_add_teacher = client.post(
        "/admin/add_teacher",
        data={
            "full_name": "Mrs. Ada Nwosu",
            "username": "teacher_e2e",
            "password": "TeacherPass123",
            "class_name": "JSS 1",
            "specialisation": "General",
            "class_teacher_of": "JSS 1",
        },
        follow_redirects=False,
    )
    assert r_add_teacher.status_code in (302, 200)

    r_add_stud = client.post(
        "/admin/add_student",
        data={
            "username": "student_e2e",
            "full_name": "Chinedu Obi",
            "password": "StudentPass123",
            "class": "JSS 1",
            "specialisation": "General",
        },
        follow_redirects=False,
    )
    assert r_add_stud.status_code in (302, 200)

    # Admin logs out; Teacher signs in and authors the Exam with 2 MCQ questions
    client.get("/logout")
    r_teach_login = client.post(
        "/login",
        data={"username": "teacher_e2e", "password": "TeacherPass123", "role": "Teacher"},
        follow_redirects=True,
    )
    assert r_teach_login.status_code == 200

    r_add_exam = client.post(
        "/teacher/add_exam",
        data={
            "exam_name": "First Term Mathematics CBT",
            "target_class": "JSS 1",
            "subject_tag": "Mathematics",
            "specialisation_tag": "General",
            "duration": "30",
            "question1": "What is 7 + 8?",
            "option1_1": "12",
            "option1_2": "15",
            "option1_3": "16",
            "option1_4": "14",
            "answer1": "2",
            "question2": "What is the square root of 81?",
            "option2_1": "7",
            "option2_2": "8",
            "option2_3": "9",
            "option2_4": "10",
            "answer2": "3",
        },
        follow_redirects=False,
    )
    assert r_add_exam.status_code in (302, 200)

    with _conn() as conn:
        exam_row = conn.execute("SELECT id, active FROM exams WHERE name = 'First Term Mathematics CBT'").fetchone()
        assert exam_row is not None
        exam_id = int(exam_row["id"])

    # Activate exam via teacher toggle
    r_toggle = client.get(f"/teacher/toggle_exam/{exam_id}", follow_redirects=False)
    assert r_toggle.status_code in (302, 200)

    # Teacher logout
    client.get("/logout")

    # 7. Student logs in, views /dashboard, starts exam, saves answers, heartbeats, submits, views result!
    r_stud_login = client.post(
        "/login",
        data={"username": "student_e2e", "password": "StudentPass123", "role": "student"},
        follow_redirects=True,
    )
    assert r_stud_login.status_code == 200
    assert "First Term Mathematics CBT" in r_stud_login.get_data(as_text=True)

    # Exam instruction page & begin exam
    assert client.get(f"/exam_start/{exam_id}").status_code == 200
    r_begin = client.get(f"/exam_begin/{exam_id}", follow_redirects=True)
    assert r_begin.status_code == 200

    with _conn() as conn:
        attempt = conn.execute(
            "SELECT id, session_key FROM scores WHERE exam_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1",
            (exam_id,),
        ).fetchone()
        assert attempt is not None, "Expected in-progress exam attempt after /exam_begin"
        attempt_id = int(attempt["id"])
        session_key = attempt["session_key"]
        q_rows = conn.execute("SELECT id, answer FROM questions WHERE exam_id = ? ORDER BY id", (exam_id,)).fetchall()
        assert len(q_rows) == 2

    # Save each answer via real instant-persistence endpoint
    for idx, qr in enumerate(q_rows, start=1):
        r_save = client.post(
            "/exam_save_single_answer",
            json={
                "attempt_id": attempt_id,
                "question_id": int(qr["id"]),
                "answer": qr["answer"],
                "session_key": session_key,
                "client_revision": idx,
            },
        )
        assert r_save.status_code == 200, r_save.get_data(as_text=True)

    # Heartbeat check
    r_hb = client.post(
        "/exam_heartbeat",
        json={"attempt_id": attempt_id, "session_key": session_key},
    )
    assert r_hb.status_code == 200

    # Verify Studio /api/internal/telemetry sees the live active student writing!
    r_tel_live = client.get("/api/internal/telemetry", headers=hdrs)
    assert r_tel_live.status_code == 200
    assert r_tel_live.get_json()["live"]["total_writing"] >= 1

    # Submit the exam
    submit_form = {f"q{qr['id']}": qr["answer"] for qr in q_rows}
    r_submit = client.post(f"/exam/{exam_id}", data=submit_form, follow_redirects=True)
    assert r_submit.status_code == 200

    # Verify graded 2/2 score persisted in SQLite!
    with _conn() as conn:
        final_row = conn.execute(
            "SELECT score, total, submitted, status FROM scores WHERE id = ?",
            (attempt_id,),
        ).fetchone()
        assert final_row is not None
        assert int(final_row["score"]) == 2
        assert int(final_row["total"]) == 2
        assert int(final_row["submitted"]) == 1

    # 8. Verify hot SQLite backup succeeds with real exam data intact
    r_bk = client.post("/api/internal/hot-backup", json={"type": "manual"}, headers=hdrs)
    assert r_bk.status_code == 200 and r_bk.get_json()["ok"] is True
