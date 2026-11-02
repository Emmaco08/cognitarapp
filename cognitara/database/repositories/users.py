from cognitara.database.connection import get_db_connection

class UserRepository:
    @staticmethod
    def get_admin_by_username(username, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM admin WHERE username=?", (username,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_teacher_by_username(username, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM teachers WHERE username=?", (username,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_student_by_username(username, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM students WHERE username=?", (username,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_student_by_id(student_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_teacher_by_id(teacher_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM teachers WHERE id=?", (teacher_id,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_ce_student_by_username(username, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM ce_students WHERE username=?", (username,)).fetchone()
        finally:
            if conn is None: c.close()

    @staticmethod
    def get_ce_student_by_id(student_id, conn=None):
        c = conn or get_db_connection()
        try:
            return c.execute("SELECT * FROM ce_students WHERE id=?", (student_id,)).fetchone()
        finally:
            if conn is None: c.close()
