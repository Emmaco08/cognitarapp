from cognitara.database.connection import get_db_connection

class AttemptRepository:
    @staticmethod
    def get_regular_attempt(attempt_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("""
                SELECT s.*, e.name as exam_name, e.duration, e.passing_percentage
                FROM scores s
                JOIN exams e ON s.exam_id = e.id
                WHERE s.id=?
            """, (attempt_id,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_ce_attempt(attempt_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("""
                SELECT a.*, e.name as exam_name, e.duration, e.passing_score
                FROM ce_attempts a
                JOIN ce_exams e ON a.exam_id = e.id
                WHERE a.id=?
            """, (attempt_id,)).fetchone()
        finally:
            if conn is None: c.close()
