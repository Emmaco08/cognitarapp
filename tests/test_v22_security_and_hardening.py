"""
CogniTara v2.2 — Full-Scale Security Hardening, Image Upload, XSS & Route Integrity Suite
"""
import io
import os
import tempfile
import pytest
from PIL import Image
from werkzeug.security import generate_password_hash

from cognitara import create_app
from cognitara.database.connection import get_db_connection
from cognitara.security.passwords import verify_and_upgrade_password
from cognitara.utils.helpers import compress_image, sanitize_html


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    import sqlite3
    from cognitara.database.bootstrap import ensure_core_database_initialized

    db_path = str(tmp_path / "test_v22.db")
    ensure_core_database_initialized(db_path, seed_sample_users=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO admin (id, username, password) VALUES (1, 'admin', ?)",
            (generate_password_hash("Admin#2026"),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO teachers (id, username, password, class, teaching_classes, class_teacher_of) VALUES (1, 'teacher1', ?, 'SSS 1', '[\"SSS 1\"]', 'SSS 1')",
            (generate_password_hash("Teach#2026"),),
        )
        conn.execute("UPDATE teachers SET class_teacher_of = 'SSS 1' WHERE id = 1")
        conn.execute(
            "INSERT OR IGNORE INTO teachers (id, username, password, class, teaching_classes, class_teacher_of) VALUES (2, 'teacher2', ?, 'SSS 1', '[\"SSS 1\"]', NULL)",
            (generate_password_hash("Teach#2026"),),
        )
        conn.execute("UPDATE teachers SET class_teacher_of = NULL WHERE id = 2")
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setenv("COGNITARA_TESTING_BYPASS_LICENSE", "1")
    monkeypatch.setenv("COGNITARA_BYPASS_LICENSE", "1")
    monkeypatch.setenv("COGNITARA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("COGNITARA_DB_NAME", db_path)

    from cognitara.config import Config
    monkeypatch.setattr(Config, "DATABASE_NAME", db_path)

    app = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-v22-hardening",
        "WTF_CSRF_ENABLED": False,
        "DATABASE_NAME": db_path,
    })
    with app.test_client() as client:
        yield app, client


def test_password_hash_as_password_bypass_blocked():
    """Submitting a leaked Werkzeug hash string as the password MUST fail."""
    import sqlite3
    conn = sqlite3.connect(":memory:")
    try:
        hashed = generate_password_hash("SuperSecret#2026")
        assert verify_and_upgrade_password(conn, "admin", "id", 999999, hashed, "SuperSecret#2026") is True
        assert verify_and_upgrade_password(conn, "admin", "id", 999999, hashed, hashed) is False
        assert verify_and_upgrade_password(conn, "admin", "id", 999999, hashed, "") is False
        assert verify_and_upgrade_password(conn, "admin", "id", 999999, hashed, None) is False
    finally:
        conn.close()


def test_compress_image_works_and_blocks_fake_files():
    """Verify compress_image saves genuine images (os import regression) and rejects forged payloads."""
    buf = io.BytesIO()
    Image.new("RGBA", (64, 64), (59, 130, 246, 255)).save(buf, format="PNG")
    buf.seek(0)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_jpg = os.path.join(tmpdir, "nested", "avatar.jpg")
        assert compress_image(buf, out_jpg) is True
        assert os.path.isfile(out_jpg) and os.path.getsize(out_jpg) > 0

        fake = io.BytesIO(b"<html><script>alert(1)</script></html>")
        out_fake = os.path.join(tmpdir, "fake.jpg")
        assert compress_image(fake, out_fake) is False
        assert not os.path.exists(out_fake)


def test_xss_sanitizer_strips_scripts_preserves_math():
    dirty = '<p>Solve <b>2x + 3 = 7</b><script>alert("xss")</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">click</a></p>'
    cleaned = sanitize_html(dirty)
    assert "<script" not in cleaned.lower()
    assert "onerror" not in cleaned.lower()
    assert "javascript:" not in cleaned.lower()
    assert "<b>2x + 3 = 7</b>" in cleaned


def test_security_headers_and_path_traversal_defense(app_client):
    _app, client = app_client
    res = client.get("/login")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "no-store" in (res.headers.get("Cache-Control") or "")

    # Path traversal checks
    for bad_path in [
        "/uploads/images/../../app.py",
        "/uploads/images/..%2F..%2Fapp.py",
        "/uploads/images/.secret_key",
        "/static/images/../../app.py",
    ]:
        r = client.get(bad_path)
        assert r.status_code in (400, 404), f"Unexpected status {r.status_code} for {bad_path}"


def test_rbac_blocks_unauthenticated_privileged_routes(app_client):
    _app, client = app_client
    protected = [
        "/admin",
        "/admin/exams-management",
        "/admin/school-analytics",
        "/admin/school-settings",
        "/admin/exam_technical_support",
        "/admin/ce_technical_support",
        "/teacher",
        "/teacher/technical_support",
        "/teacher/analytics",
        "/dashboard",
    ]
    for path in protected:
        r = client.get(path)
        assert r.status_code in (302, 401, 403), f"Route {path} allowed unauthenticated access ({r.status_code})"


def test_all_major_portal_pages_render_200_with_v5_ui(app_client):
    """Smoke-test every major Admin, Teacher, and Public page including Technical Support routes."""
    _app, client = app_client

    # Public pages
    for pub in ["/", "/login", "/register", "/ce_login", "/health"]:
        r = client.get(pub)
        assert r.status_code == 200, f"Public route {pub} failed: {r.status_code}"

    # Admin pages (including technical support & CE technical support)
    with client.session_transaction() as sess:
        sess["admin_id"] = 1
        sess["username"] = "admin"
        sess["role"] = "Admin"

    admin_routes = [
        "/admin",
        "/admin/exams-management",
        "/admin/exam_technical_support",
        "/admin/ce_technical_support",
        "/admin/school-analytics",
        "/admin/school-settings",
        "/admin/results",
        "/admin/common-entrance",
        "/admin/pending_students",
        "/admin/logs",
        "/admin/warning_logs",
        "/admin/exam_attempts",
        "/admin/ce-settings",
        "/admin/add_admin",
        "/admin/add_teacher",
        "/admin/add_student",
    ]
    for path in admin_routes:
        r = client.get(path)
        assert r.status_code == 200, f"Admin route {path} failed with {r.status_code}"
        html = r.get_data(as_text=True)
        assert "cognitara-admin-studio.css" in html, f"{path} missing v5 admin studio CSS"

    # Admin must NOT be able to create exams or edit/add regular exam questions
    assert client.get("/admin/add_exam").status_code == 302
    assert client.post("/admin/add_exam", data={"name": "Blocked"}).status_code == 403
    assert client.get("/edit_exam/1").status_code == 302
    assert client.post("/edit_exam/1", data={"name": "Blocked"}).status_code == 403
    assert client.get("/admin/add_question/1").status_code == 302
    assert client.post("/admin/add_question/1", data={"question": "Blocked"}).status_code == 403
    assert client.get("/teacher/exam/1/questions").status_code == 302
    assert client.get("/teacher/exam/1/settings").status_code == 302
    assert client.post("/teacher/exam/1/settings", data={"name": "Blocked"}).status_code == 403
    assert client.post("/teacher/exam/1/sections", data={"section_name": "Blocked"}).status_code == 403

    # Class Teacher pages (teacher1 is assigned class_teacher_of='SSS 1')
    with client.session_transaction() as sess:
        sess.clear()
        sess["teacher_id"] = 1
        sess["username"] = "teacher1"
        sess["class"] = "SSS 1"
        sess["role"] = "Teacher"

    teacher_routes = [
        "/teacher",
        "/teacher/technical_support",
        "/teacher/analytics",
        "/teacher/create_exam",
        "/teacher/progression",
        "/teacher/import_exam",
    ]
    for path in teacher_routes:
        r = client.get(path)
        assert r.status_code == 200, f"Teacher route {path} failed with {r.status_code}"
        html = r.get_data(as_text=True)
        assert "cognitara-teacher-studio.css" in html, f"{path} missing v5 teacher studio CSS"

    # Subject-only Teacher (teacher2 has class_teacher_of=NULL) must NOT access /teacher/progression
    with client.session_transaction() as sess:
        sess.clear()
        sess["teacher_id"] = 2
        sess["username"] = "teacher2"
        sess["class"] = "SSS 1"
        sess["role"] = "Teacher"

    r_prog = client.get("/teacher/progression")
    assert r_prog.status_code == 302, "Non-class-teacher should be redirected away from /teacher/progression"
    assert r_prog.headers.get("Location", "").endswith("/teacher")
    r_tdash = client.get("/teacher")
    assert r_tdash.status_code == 200
    assert "/teacher/progression" not in r_tdash.get_data(as_text=True)
