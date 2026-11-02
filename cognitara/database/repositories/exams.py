from cognitara.database.connection import get_db_connection

class ExamRepository:
    @staticmethod
    def get_exam_by_id(exam_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM exams WHERE id=?", (exam_id,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_ce_exam_by_id(exam_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM ce_exams WHERE id=?", (exam_id,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_exam_questions(exam_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM questions WHERE exam_id=? ORDER BY id", (exam_id,)).fetchall()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_ce_exam_sections(exam_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM ce_sections WHERE exam_id=? ORDER BY section_order", (exam_id,)).fetchall()
        finally:
            if conn is None: c.close()
