import logging
from cognitara.database.connection import get_db_connection, SafeRow
from cognitara.utils.helpers import log_action
from cognitara.services.grading_service import finalize_regular_exam_attempt, finalize_ce_exam_attempt

logger = logging.getLogger("cognitara.services.violation")

def log_regular_warning(student_id, exam_id, warning_message, attempt_id=None, student_name=None, exam_name=None, conn=None):
    """
    Monotonically increments scores.warnings_count and logs audit event.
    MANDATORY INVARIANT: If warnings reach or exceed max_warnings, the exam
    MUST be automatically and authoritatively finalized and submitted.
    It must NEVER be paused.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        conn.row_factory = SafeRow

    try:
        if not attempt_id and student_id and exam_id:
            att_row = conn.execute(
                "SELECT id FROM scores WHERE student_id=? AND exam_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",
                (student_id, exam_id)
            ).fetchone()
            if att_row:
                attempt_id = att_row["id"]

        new_count = 1
        max_w = 5
        auto_submitted = False
        reason = None

        if attempt_id:
            attempt = conn.execute("""
                SELECT s.*, e.name as exam_name, e.duration as exam_duration, e.max_warnings as exam_max_warnings,
                       st.full_name, st.username
                FROM scores s
                LEFT JOIN exams e ON s.exam_id = e.id
                LEFT JOIN students st ON s.student_id = st.id
                WHERE s.id=?
            """, (attempt_id,)).fetchone()
            if attempt:
                cur_w = int(attempt["warnings_count"] or 0)
                max_w = int(attempt["max_warnings"] or attempt["exam_max_warnings"] or 5)
                new_count = cur_w + 1
                if not student_name:
                    student_name = attempt["full_name"] or attempt["username"] or "student"
                if not exam_name:
                    exam_name = attempt["exam_name"] or "Exam"

                if new_count >= max_w:
                    # Invariant: Reaching violation ceiling triggers immediate authoritative finalization
                    auto_submitted = True
                    reason = f"Maximum violations exceeded ({new_count}/{max_w})"
                    logger.warning(f"Regular attempt {attempt_id} reached violation limit ({new_count}/{max_w}). Auto-submitting.")
                    conn.execute("UPDATE scores SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
                    conn.commit()
                    # Finalize attempt atomically and authoritatively
                    finalize_regular_exam_attempt(attempt_id, conn=conn, force_submit=1, auto_submitted_reason=reason)
                else:
                    conn.execute("UPDATE scores SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
                    conn.commit()

        conn.execute("""
            INSERT INTO warning_logs (student_id, student_name, exam_id, exam_name, warning_message, warning_count, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (student_id, student_name, exam_id, exam_name, warning_message, new_count))

        conn.commit()
        return {
            "success": True,
            "warning_count": new_count,
            "max_warnings": max_w,
            "is_paused": False, # Never paused on violation limit
            "auto_submitted": auto_submitted,
            "auto_submitted_reason": reason,
            "pause_reason": None
        }
    finally:
        if close_conn:
            conn.close()

def log_ce_warning(student_id, exam_id, warning_message, attempt_id=None, student_name=None, exam_name=None, conn=None):
    """
    Monotonically increments ce_attempts.warnings_count and logs audit event.
    MANDATORY INVARIANT: If warnings reach or exceed max_warnings, the exam
    MUST be automatically and authoritatively finalized and submitted.
    It must NEVER be paused.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        conn.row_factory = SafeRow

    try:
        if not attempt_id and student_id and exam_id:
            att_row = conn.execute(
                "SELECT id FROM ce_attempts WHERE student_id=? AND exam_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",
                (student_id, exam_id)
            ).fetchone()
            if att_row:
                attempt_id = att_row["id"]

        new_count = 1
        max_w = 5
        auto_submitted = False
        reason = None

        if attempt_id:
            attempt = conn.execute("""
                SELECT a.*, e.name as exam_name, e.duration as exam_duration, e.max_warnings as exam_max_warnings,
                       st.full_name, st.username
                FROM ce_attempts a
                LEFT JOIN ce_exams e ON a.exam_id = e.id
                LEFT JOIN students st ON a.student_id = st.id
                WHERE a.id=?
            """, (attempt_id,)).fetchone()
            if attempt:
                cur_w = int(attempt["warnings_count"] or 0)
                max_w = int(attempt["max_warnings"] or attempt["exam_max_warnings"] or 5)
                new_count = cur_w + 1
                if not student_name:
                    student_name = attempt["full_name"] or attempt["username"] or "student"
                if not exam_name:
                    exam_name = attempt["exam_name"] or "Exam"

                if new_count >= max_w:
                    # Invariant: Reaching violation ceiling triggers immediate authoritative finalization
                    auto_submitted = True
                    reason = f"Maximum violations exceeded ({new_count}/{max_w})"
                    logger.warning(f"CE attempt {attempt_id} reached violation limit ({new_count}/{max_w}). Auto-submitting.")
                    conn.execute("UPDATE ce_attempts SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
                    conn.commit()
                    # Finalize attempt atomically and authoritatively
                    finalize_ce_exam_attempt(attempt_id, conn=conn, force_submit=1, auto_submitted_reason=reason)
                else:
                    conn.execute("UPDATE ce_attempts SET warnings_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_count, attempt_id))
                    conn.commit()

        conn.execute("""
            INSERT INTO ce_warning_logs (student_id, exam_id, warning_message, warning_count, timestamp) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (student_id, exam_id, warning_message, new_count))

        conn.commit()
        return {
            "success": True,
            "warning_count": new_count,
            "max_warnings": max_w,
            "is_paused": False, # Never paused on violation limit
            "auto_submitted": auto_submitted,
            "auto_submitted_reason": reason,
            "pause_reason": None
        }
    finally:
        if close_conn:
            conn.close()

def reset_warnings(attempt_id, exam_type="regular", reset_by="Admin", role="Admin", reason="Proctor reset"):
    """
    Authorized proctor reset with mandatory audit logging into warning_reset_audit.
    """
    conn = get_db_connection()
    try:
        table = "scores" if exam_type == "regular" else "ce_attempts"
        row = conn.execute(f"SELECT student_id, exam_id, warnings_count FROM {table} WHERE id=?", (attempt_id,)).fetchone()
        if not row:
            return {"error": "Attempt not found", "status_code": 404}
            
        prev_count = int(row["warnings_count"] or 0)
        conn.execute(f"UPDATE {table} SET warnings_count=0 WHERE id=?", (attempt_id,))
        
        conn.execute("""
            INSERT INTO warning_reset_audit 
            (attempt_id, exam_type, student_id, exam_id, reset_by, role, previous_count, new_count, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        """, (attempt_id, exam_type, row["student_id"], row["exam_id"], reset_by, role, prev_count, reason))
        
        log_action(role, reset_by, f"Reset {exam_type} warnings from {prev_count} to 0 for attempt {attempt_id}", conn)
        conn.commit()
        return {
            "success": True,
            "previous_count": prev_count,
            "new_count": 0,
            "message": f"Successfully reset warnings for attempt {attempt_id}"
        }
    finally:
        conn.close()
