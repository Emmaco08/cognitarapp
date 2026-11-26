"""End-to-end backend + HTML verification for the v2.2.8 Admin Portal & Desktop School Profile overhaul.

Always operates on an isolated temporary copy of exam.db and a temporary upload
folder so the repository's root exam.db is never modified.
"""

from __future__ import annotations

import base64
import io
import os
import shutil
import sqlite3

import pytest
from PIL import Image

from cognitara import create_app
from cognitara.config import Config
from cognitara.database import get_db_connection


def _png_bytes(color=(37, 99, 235)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (128, 128), color=color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def isolated_app(tmp_path, monkeypatch):
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_db = os.path.join(repo_root, "exam.db")
    dst_db = str(tmp_path / "exam_test.db")
    shutil.copy2(src_db, dst_db)

    uploads_dir = str(tmp_path / "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    desktop_token = "test-desktop-internal-token-v228"
    monkeypatch.setenv("COGNITARA_DB_NAME", dst_db)
    monkeypatch.setenv("COGNITARA_STRICT_TEST_ISOLATION", "1")
    monkeypatch.setenv("COGNITARA_DESKTOP_TOKEN", desktop_token)
    monkeypatch.setattr(Config, "DATABASE_NAME", dst_db)
    monkeypatch.setattr(Config, "UPLOAD_FOLDER", uploads_dir)

    app = create_app()
    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    app.config["DATABASE_NAME"] = dst_db
    app.config["UPLOAD_FOLDER"] = uploads_dir

    # Ensure there is a known admin id in the temp DB
    conn = get_db_connection()
    try:
        admin_row = conn.execute("SELECT id, username FROM admin ORDER BY id ASC LIMIT 1").fetchone()
        assert admin_row is not None
        admin_id = admin_row["id"]
        admin_user = admin_row["username"]
    finally:
        conn.close()

    return {
        "app": app,
        "db_path": dst_db,
        "uploads_dir": uploads_dir,
        "admin_id": admin_id,
        "admin_user": admin_user,
        "desktop_token": desktop_token,
    }


def _login_admin(client, admin_id: int, admin_user: str):
    with client.session_transaction() as sess:
        sess["admin_id"] = admin_id
        sess["admin_username"] = admin_user
        sess["username"] = admin_user
        sess["role"] = "admin"


def test_01_admin_settings_redirect_and_all_admin_pages_200_with_pjax(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #2: /admin/settings must never 404 -> redirects to /admin/school-settings
    r_redir = client.get("/admin/settings", follow_redirects=False)
    assert r_redir.status_code in (301, 302)
    assert "/admin/school-settings" in (r_redir.headers.get("Location") or "")

    # Item #9: Every Admin sidebar page returns 200 and includes cognitara-pjax.js + unified shell
    admin_routes = [
        "/admin",
        "/admin/exams-management",
        "/admin/exam_technical_support",
        "/admin/common-entrance",
        "/admin/pending_students",
        "/admin/add_admin",
        "/admin/results",
        "/admin/school-analytics",
        "/admin/exam_attempts",
        "/admin/school-settings",
        "/admin/ce-settings",
        "/admin/logs",
        "/admin/warning_logs",
        "/admin/add_teacher",
        "/admin/add_student",
    ]
    for route in admin_routes:
        resp = client.get(route)
        assert resp.status_code == 200, f"Expected 200 for {route}, got {resp.status_code}"
        html = resp.get_data(as_text=True)
        assert "cognitara-pjax.js" in html, f"{route} missing cognitara-pjax.js"
        assert "ct-sidebar" in html, f"{route} missing unified Admin sidebar shell"
        assert 'href="/admin/settings"' not in html, f"{route} still links to broken /admin/settings"


def test_02_school_logo_upload_serves_in_sidebar_and_uploads(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #1: Upload school logo via /admin/school-settings/logo
    resp = client.post(
        "/admin/school-settings/logo",
        data={"school_logo": (io.BytesIO(_png_bytes()), "school_crest.png")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["success"] is True
    assert payload["logo_url"].startswith("/uploads/images/")

    # Uploaded logo file serves with 200
    logo_url = payload["logo_url"].split("?")[0]
    r_img = client.get(logo_url)
    assert r_img.status_code == 200
    assert len(r_img.data) > 50

    # Sidebar renders real <img> crest on /admin and /admin/school-settings
    dash_html = client.get("/admin").get_data(as_text=True)
    assert "ctSidebarSchoolCrest" in dash_html
    assert "<img" in dash_html and "/uploads/images/" in dash_html

    # Remove logo works cleanly
    r_rem = client.post("/admin/school-settings/logo", data={"remove_logo": "1"})
    assert r_rem.status_code == 200
    assert r_rem.get_json()["success"] is True


def test_03_teacher_full_name_required_and_persisted(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #6: /admin/add_teacher HTML includes required full_name input & clean class names
    form_html = client.get("/admin/add_teacher").get_data(as_text=True)
    assert 'name="full_name"' in form_html
    assert "[object Object]" not in form_html
    conn_cls = get_db_connection()
    try:
        active_cls = conn_cls.execute("SELECT name FROM classes WHERE active = 1 ORDER BY id ASC LIMIT 1").fetchone()
    finally:
        conn_cls.close()
    if active_cls:
        assert active_cls["name"] in form_html

    # Submitting without full_name must NOT create teacher
    client.post(
        "/admin/add_teacher",
        data={
            "full_name": "",
            "username": "teacher_missing_name_v228",
            "password": "Password123!",
        },
        follow_redirects=True,
    )
    conn = get_db_connection()
    try:
        missing = conn.execute(
            "SELECT id FROM teachers WHERE username = ?", ("teacher_missing_name_v228",)
        ).fetchone()
        assert missing is None
    finally:
        conn.close()

    # Submitting WITH full_name creates teacher and displays it in /admin and /admin/edit_teacher/<id>
    r_ok = client.post(
        "/admin/add_teacher",
        data={
            "full_name": "Dr. Ngozi Balogun",
            "username": "ngozi_balogun_v228",
            "password": "Password123!",
            "class_assignments": ["SS1:General"],
        },
        follow_redirects=True,
    )
    assert r_ok.status_code == 200
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT id, full_name, username FROM teachers WHERE username = ?",
            ("ngozi_balogun_v228",),
        ).fetchone()
        assert row is not None
        assert row["full_name"] == "Dr. Ngozi Balogun"
        tid = row["id"]
    finally:
        conn.close()

    dash_html = client.get("/admin").get_data(as_text=True)
    assert "Dr. Ngozi Balogun" in dash_html

    edit_html = client.get(f"/admin/edit_teacher/{tid}").get_data(as_text=True)
    assert "Dr. Ngozi Balogun" in edit_html


def test_04_student_add_and_edit_have_no_email_field(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #7: No email input on add_student
    add_html = client.get("/admin/add_student").get_data(as_text=True)
    assert 'name="email"' not in add_html

    conn = get_db_connection()
    try:
        cls_row = conn.execute("SELECT name FROM classes WHERE active = 1 LIMIT 1").fetchone()
        cls_name = cls_row["name"] if cls_row else "SS1"
    finally:
        conn.close()

    r_add = client.post(
        "/admin/add_student",
        data={
            "full_name": "Chinedu Obi",
            "username": "chinedu_obi_v228",
            "password": "Password123!",
            "class": cls_name,
            "specialisation": "General",
        },
        follow_redirects=True,
    )
    assert r_add.status_code == 200

    conn = get_db_connection()
    try:
        stu = conn.execute(
            "SELECT id, full_name, email FROM students WHERE username = ?",
            ("chinedu_obi_v228",),
        ).fetchone()
        assert stu is not None
        assert stu["full_name"] == "Chinedu Obi"
        sid = stu["id"]
    finally:
        conn.close()

    # Edit student form also has NO email input and updates cleanly without email
    edit_html = client.get(f"/admin/edit_student/{sid}").get_data(as_text=True)
    assert 'name="email"' not in edit_html

    r_edit = client.post(
        f"/admin/edit_student/{sid}",
        data={
            "full_name": "Chinedu K. Obi",
            "username": "chinedu_obi_v228",
            "class": cls_name,
            "specialisation": "General",
        },
        follow_redirects=True,
    )
    assert r_edit.status_code == 200

    conn = get_db_connection()
    try:
        stu2 = conn.execute("SELECT full_name FROM students WHERE id = ?", (sid,)).fetchone()
        assert stu2["full_name"] == "Chinedu K. Obi"
    finally:
        conn.close()


def test_05_exam_control_center_details_and_live_support_apis(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #4: Exam Control Center details API returns rich payload for Details drawer
    conn = get_db_connection()
    try:
        ex = conn.execute("SELECT id FROM exams ORDER BY id DESC LIMIT 1").fetchone()
    finally:
        conn.close()

    if ex:
        r_det = client.get(f"/admin/exam/{ex['id']}/details")
        assert r_det.status_code == 200
        d = r_det.get_json()
        assert d["success"] is True
        assert "exam" in d
        assert "students" in d
        assert "questions" in d
        assert "grade_distribution" in d
        assert isinstance(d["grade_distribution"], list) and len(d["grade_distribution"]) > 0

    # Item #5: Live Support & Pause page + live telemetry API
    r_sup = client.get("/admin/exam_technical_support")
    assert r_sup.status_code == 200
    sup_html = r_sup.get_data(as_text=True)
    assert "bootstrap.min.css" not in sup_html
    assert "sweetalert2" not in sup_html

    r_api = client.get("/admin/api/technical_support_status")
    assert r_api.status_code == 200
    live = r_api.get_json()
    assert live["success"] is True
    assert isinstance(live["attempts"], list)


def test_06_school_settings_and_ce_settings_take_live_effect(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    _login_admin(client, isolated_app["admin_id"], isolated_app["admin_user"])

    # Item #8A: School Settings update propagates into sidebar branding & DB
    r_ss = client.post(
        "/admin/school-settings/update",
        json={
            "school_name": "Cedar Crest Academy",
            "school_motto": "Truth & Innovation",
            "academic_session": "2026/2027",
            "current_term": "Second Term",
            "max_warnings": 5,
            "passing_score": 55,
            "exam_instructions": "Read every question carefully before answering.",
        },
    )
    assert r_ss.status_code == 200
    assert r_ss.get_json()["success"] is True

    dash_html = client.get("/admin").get_data(as_text=True)
    assert "Cedar Crest Academy" in dash_html
    assert "Second Term" in dash_html

    # DB health endpoint returns consistent keys
    r_health = client.get("/admin/school-settings/db-health")
    assert r_health.status_code == 200
    hj = r_health.get_json()
    assert hj["ok"] is True
    assert hj["tables"] > 0 and hj["table_count"] == hj["tables"]

    # Item #8B: CE Settings registration_open=0 actively blocks /admin/ce_register_student with 403
    r_ce = client.post(
        "/admin/ce-settings/update",
        json={
            "institution_name": "Cedar Crest Academy",
            "admission_session": "2026/2027",
            "portal_title": "Cedar Crest Entrance Portal",
            "welcome_message": "Welcome prospective scholars!",
            "registration_open": False,
            "default_passing_score": 65,
            "anti_cheating_profile": "high",
        },
    )
    assert r_ce.status_code == 200
    assert r_ce.get_json()["success"] is True

    # Verify /admin/ce_register_student respects registration_open=0!
    r_reg_closed = client.post(
        "/admin/ce_register_student",
        data={
            "exam_id": "1",
            "full_name": "Blocked Candidate",
            "username": "blocked_ce_v228",
            "password": "Password123!",
        },
    )
    assert r_reg_closed.status_code == 403

    # Re-open registration and confirm /ce_login reflects updated portal_title
    client.post("/admin/ce-settings/update", json={"registration_open": True})
    ce_login_html = client.get("/ce_login").get_data(as_text=True)
    assert "Cedar Crest Entrance Portal" in ce_login_html


def test_07_desktop_internal_school_profile_and_logo_endpoints(isolated_app):
    app = isolated_app["app"]
    client = app.test_client()
    hdrs = {"Authorization": f"Bearer {isolated_app['desktop_token']}"}

    data_url = "data:image/png;base64," + base64.b64encode(_png_bytes((16, 185, 129))).decode("ascii")
    r_save = client.post(
        "/api/internal/setup/school",
        headers=hdrs,
        json={
            "school_name": "Maitrebuilder College",
            "school_motto": "Building Future Leaders",
            "academic_session": "2026/2027",
            "current_term": "Third Term",
            "logo_data_url": data_url,
        },
    )
    assert r_save.status_code == 200
    js = r_save.get_json()
    assert js["ok"] is True
    assert js["school"]["school_name"] == "Maitrebuilder College"
    assert js["school"]["school_logo"].startswith("school_logo_")
    assert js["school"]["logo_data_url"].startswith("data:image/png;base64,")

    # /setup/status returns persisted logo_data_url
    r_stat = client.get("/api/internal/setup/status", headers=hdrs)
    assert r_stat.status_code == 200
    st = r_stat.get_json()
    assert st["school"]["school_name"] == "Maitrebuilder College"
    assert st["school"]["logo_data_url"].startswith("data:image/png;base64,")

    # Removing logo clears school_logo & logo_data_url
    r_rm = client.post(
        "/api/internal/setup/school",
        headers=hdrs,
        json={
            "school_name": "Maitrebuilder College",
            "school_motto": "Building Future Leaders",
            "academic_session": "2026/2027",
            "current_term": "Third Term",
            "remove_logo": True,
        },
    )
    assert r_rm.status_code == 200
    rmj = r_rm.get_json()
    assert rmj["school"]["school_logo"] is None
    assert rmj["school"]["logo_data_url"] is None
