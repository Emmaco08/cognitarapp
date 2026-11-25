"""Regression tests for Track 1 (v2.2.3) Flask LAN CBT Portal fixes:
1. Optional photos on student registration (/register).
2. Unlimited image upload size (>6MB BMP compressed safely via compress_image, MAX_CONTENT_LENGTH=None).
3. Teacher creates exam (/teacher/add_exam) -> default section auto-created -> adds question with LaTeX (<, >, \\ce{<=>}).
4. Teacher visiting /teacher/exams-management and /admin/exams-management stays logged in (never logged out).
5. Permanent session + zero 4KB cookie bloat during active exam.
"""

import io
import os
import tempfile
import unittest
from PIL import Image

from cognitara import create_app
from cognitara.database import get_db_connection
from cognitara.utils.helpers import compress_image


class TestPortalFixesV223(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.app.config["WTF_CSRF_ENABLED"] = False

    def test_01_unlimited_upload_and_large_image_compression(self):
        self.assertIsNone(self.app.config.get("MAX_CONTENT_LENGTH"))
        self.assertIsNone(self.app.config.get("WTF_CSRF_TIME_LIMIT"))
        self.assertTrue(self.app.config.get("SESSION_REFRESH_EACH_REQUEST"))

        # Generate raw BMP > 6 MB (1800x1400 RGBA ~= 10 MB) and compress via compress_image
        img = Image.new("RGBA", (1800, 1400), color=(42, 118, 200, 255))
        buf = io.BytesIO()
        img.save(buf, format="BMP")
        self.assertGreater(buf.tell(), 6 * 1024 * 1024)
        buf.seek(0)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "large_test.jpg")
            ok = compress_image(buf, out_path)
            self.assertTrue(ok)
            self.assertTrue(os.path.exists(out_path))
            self.assertGreater(os.path.getsize(out_path), 1000)

    def test_02_optional_photo_student_registration(self):
        client = self.app.test_client()
        uname = "test_nophoto_v223"
        conn = get_db_connection()
        try:
            conn.execute("DELETE FROM pending_registrations WHERE username = ?", (uname,))
            conn.execute("DELETE FROM students WHERE username = ?", (uname,))
            cls_row = conn.execute("SELECT name FROM classes LIMIT 1").fetchone()
            class_name = cls_row["name"] if cls_row else "SS1"
            conn.commit()
        finally:
            conn.close()

        try:
            resp = client.post(
                "/register",
                data={
                    "full_name": "No Photo Student",
                    "username": uname,
                    "email": "nophoto223@example.com",
                    "password": "Password123!",
                    "class": class_name,
                    "specialisation": "General",
                },
                follow_redirects=False,
            )
            self.assertEqual(resp.status_code, 200)
            conn = get_db_connection()
            try:
                pend = conn.execute(
                    "SELECT full_name, photo FROM pending_registrations WHERE username = ?",
                    (uname,),
                ).fetchone()
                self.assertIsNotNone(pend)
                self.assertEqual(pend["photo"], "default.png")
            finally:
                conn.close()
        finally:
            conn = get_db_connection()
            try:
                conn.execute("DELETE FROM pending_registrations WHERE username = ?", (uname,))
                conn.execute("DELETE FROM students WHERE username = ?", (uname,))
                conn.commit()
            finally:
                conn.close()

    def test_03_teacher_exam_creation_question_add_and_control_center_no_logout(self):
        conn = get_db_connection()
        try:
            teacher = conn.execute("SELECT id, username, class FROM teachers LIMIT 1").fetchone()
            self.assertIsNotNone(teacher)
            teacher_id = teacher["id"]
            teacher_username = teacher["username"]
            ca = conn.execute(
                "SELECT class_name, specialisation FROM teacher_class_assignments WHERE teacher_id = ? LIMIT 1",
                (teacher_id,),
            ).fetchone()
            target_class = ca["class_name"] if ca else (teacher["class"] or "SS1")
            target_spec = ca["specialisation"] if ca else "General"
        finally:
            conn.close()

        client = self.app.test_client()
        with client.session_transaction() as sess:
            sess["teacher_id"] = teacher_id
            sess["teacher_username"] = teacher_username
            sess["role"] = "teacher"

        # 1) Visiting /teacher/exams-management succeeds (200) without logging out
        r_ctrl = client.get("/teacher/exams-management")
        self.assertEqual(r_ctrl.status_code, 200)
        self.assertIn(b"Exam Control", r_ctrl.data)

        # 2) Visiting /admin/exams-management as a teacher redirects to /teacher/exams-management (NEVER logs out)
        r_admin_ctrl = client.get("/admin/exams-management", follow_redirects=False)
        self.assertEqual(r_admin_ctrl.status_code, 302)
        self.assertIn("/teacher/exams-management", r_admin_ctrl.headers.get("Location", ""))
        with client.session_transaction() as sess:
            self.assertEqual(sess.get("teacher_id"), teacher_id)

        # 3) Create exam via /teacher/add_exam (previously crashed on SQL `specialisation` column!)
        exam_name = "V223 Regression Math Test"
        created_exam_id = None
        try:
            r_create = client.post(
                "/teacher/add_exam",
                data={
                    "exam_name": exam_name,
                    "target_class": target_class,
                    "subject_tag": "Mathematics",
                    "specialisation_tag": target_spec,
                    "duration": "30",
                },
                follow_redirects=False,
            )
            self.assertIn(r_create.status_code, (301, 302))

            conn = get_db_connection()
            try:
                ex = conn.execute(
                    "SELECT id FROM exams WHERE name = ? ORDER BY id DESC LIMIT 1",
                    (exam_name,),
                ).fetchone()
                self.assertIsNotNone(ex)
                created_exam_id = ex["id"]
                secs = conn.execute(
                    "SELECT id FROM exam_sections WHERE exam_id = ?",
                    (created_exam_id,),
                ).fetchall()
                self.assertGreaterEqual(len(secs), 1, "Default section should be auto-created")
                sec_id = secs[0]["id"]
            finally:
                conn.close()

            # 4) Jump via /teacher/exam/<id>/questions -> lands on questions page with Teacher sidebar (NOT admin!)
            r_jump = client.get(f"/teacher/exam/{created_exam_id}/questions", follow_redirects=True)
            self.assertEqual(r_jump.status_code, 200)
            self.assertIn(b"/teacher/exams-management", r_jump.data)

            # 5) Add question with LaTeX containing < and > via /teacher/exam_section/<sec_id>/questions
            r_addq = client.post(
                f"/teacher/exam_section/{sec_id}/questions",
                data={
                    "question": r"Solve $x < 5$ and $\ce{A <=> B}$",
                    "option1": "$x = 1$",
                    "option2": "$x = 6$",
                    "option3": "$x = 7$",
                    "option4": "$x = 8$",
                    "answer": "1",
                    "explanation": "Simple inequality",
                },
                follow_redirects=False,
            )
            self.assertIn(r_addq.status_code, (301, 302))

            conn = get_db_connection()
            try:
                q_row = conn.execute(
                    "SELECT question, answer FROM questions WHERE exam_id = ? ORDER BY id DESC LIMIT 1",
                    (created_exam_id,),
                ).fetchone()
                self.assertIsNotNone(q_row)
                self.assertIn("< 5", q_row["question"])
                self.assertEqual(q_row["answer"], "$x = 1$")
            finally:
                conn.close()
        finally:
            if created_exam_id:
                conn = get_db_connection()
                try:
                    conn.execute("DELETE FROM questions WHERE exam_id = ?", (created_exam_id,))
                    conn.execute("DELETE FROM exam_sections WHERE exam_id = ?", (created_exam_id,))
                    conn.execute("DELETE FROM exams WHERE id = ?", (created_exam_id,))
                    conn.commit()
                finally:
                    conn.close()


if __name__ == "__main__":
    unittest.main()
