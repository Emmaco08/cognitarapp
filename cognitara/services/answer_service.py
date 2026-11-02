import json
import sqlite3
import logging
from cognitara.database.connection import get_db_connection, with_db_retry
from cognitara.utils.helpers import get_utc_now
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.grading_service import finalize_regular_exam_attempt, finalize_ce_exam_attempt

logger = logging.getLogger("cognitara.services.answer")

@with_db_retry(max_retries=5)
def save_regular_answer(student_id, attempt_id, question_id, user_answer, time_spent=0, session_key=None, client_revision=None, client_timestamp=None, conn=None, db_path=None):
    """
    Saves a single regular exam answer immediately with atomic UPSERT and explicit commit.
    Enforces student ownership, session fencing, out-of-order revision protection, and authoritative timing.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection(db_path=db_path)
        close_conn = True
    try:
        attempt = conn.execute("""
            SELECT s.*, e.duration FROM scores s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["student_id"] != student_id:
            return {"error": "Forbidden: Not your exam attempt", "status_code": 403}
        if attempt["status"] != "in_progress":
            return {"error": "Exam attempt is not in progress", "status": attempt["status"], "status_code": 400}
        if attempt["is_paused"] == 1:
            return {"error": "Exam attempt is paused", "is_paused": True, "pause_reason": attempt["pause_reason"], "status_code": 403}
            
        # Session fencing
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                return {"error": "Session superseded", "superseded": True, "message": "This session is no longer active. The exam has been resumed on another device.", "status_code": 403}
                
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            
        q_row = conn.execute("SELECT id, answer, section_id FROM questions WHERE id=? AND exam_id=?", (question_id, attempt["exam_id"])).fetchone()
        if not q_row:
            return {"error": "Question not found in this exam", "status_code": 404}
            
        is_correct = 1 if (user_answer and str(user_answer).strip() == str(q_row["answer"]).strip()) else 0
        section_id = q_row["section_id"]
        
        # Out-of-order revision protection
        try:
            client_rev_int = int(client_revision or 0)
        except (ValueError, TypeError):
            client_rev_int = 0
        client_ts_str = str(client_timestamp) if client_timestamp else None

        if client_rev_int > 0:
            existing_resp = conn.execute("""
                SELECT user_answer, client_revision 
                FROM exam_question_responses 
                WHERE attempt_id=? AND question_id=?
            """, (attempt_id, question_id)).fetchone()
            if existing_resp and "client_revision" in existing_resp.keys() and existing_resp["client_revision"] is not None:
                stored_rev = int(existing_resp["client_revision"] or 0)
                if stored_rev > client_rev_int:
                    # Current database record is newer than this delayed packet
                    return {
                        "success": True,
                        "saved": False,
                        "stale_revision": True,
                        "server_revision": stored_rev,
                        "current_answer": existing_resp["user_answer"],
                        "message": "Ignored stale out-of-order revision",
                        "remaining_time": max(0, server_rem),
                        "status_code": 200
                    }

        # Merge into scores.current_progress BEFORE acquiring write lock
        cur_prog = {}
        if attempt["current_progress"]:
            try:
                cur_prog = json.loads(attempt["current_progress"])
            except Exception:
                cur_prog = {}
        answers_dict = cur_prog.get("answers", {})
        answers_dict[f"q{question_id}"] = user_answer
        cur_prog["answers"] = answers_dict
        
        time_dict = cur_prog.get("time_data", {})
        time_dict[f"time_{question_id}"] = time_spent
        cur_prog["time_data"] = time_dict
        serialized_progress = json.dumps(cur_prog)

        conn.execute("""
            INSERT INTO exam_question_responses 
            (attempt_id, question_id, student_id, exam_id, section_id, user_answer, is_correct, time_spent, client_revision, client_timestamp, answered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                user_answer = excluded.user_answer,
                is_correct = excluded.is_correct,
                time_spent = excluded.time_spent,
                client_revision = excluded.client_revision,
                client_timestamp = excluded.client_timestamp,
                answered_at = excluded.answered_at
        """, (attempt_id, question_id, student_id, attempt["exam_id"], section_id, user_answer, is_correct, time_spent, client_rev_int, client_ts_str))
        
        conn.execute("""
            UPDATE scores 
            SET current_progress = ?, updated_at = CURRENT_TIMESTAMP, last_heartbeat = CURRENT_TIMESTAMP
            WHERE id = ? AND student_id = ? AND status = 'in_progress'
        """, (serialized_progress, attempt_id, student_id))
        
        # Check authoritative deadline: if expired, finalize AFTER saving the incoming answer
        if server_rem <= 0:
            finalize_regular_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            return {
                "success": True,
                "saved": True,
                "time_up": True,
                "remaining_time": 0,
                "server_revision": client_rev_int,
                "message": "Time is up! Exam auto-submitted.",
                "status_code": 200
            }
        
        conn.commit()
        return {
            "success": True,
            "saved": True,
            "saved_at": get_utc_now().isoformat(),
            "attempt_id": attempt_id,
            "question_id": question_id,
            "server_revision": client_rev_int,
            "remaining_time": server_rem,
            "status_code": 200
        }
    except Exception as e:
        conn.rollback()
        logger.error(f"[ANSWER_SAVE_FAIL] Attempt {attempt_id}, Q{question_id}: {e}")
        return {"error": "Failed to save answer due to server contention", "status_code": 500}
    finally:
        if close_conn and conn:
            conn.close()

@with_db_retry(max_retries=5)
def save_ce_answer(student_id, attempt_id, question_id, user_answer, time_spent=0, session_key=None, client_revision=None, client_timestamp=None, conn=None, db_path=None):
    """
    Saves a single Common Entrance exam answer immediately with atomic UPSERT and explicit commit.
    Enforces student ownership, session fencing, out-of-order revision protection, and authoritative timing.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection(db_path=db_path)
        close_conn = True
    try:
        attempt = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["student_id"] != student_id:
            return {"error": "Forbidden: Not your exam attempt", "status_code": 403}
        if attempt["status"] != "in_progress":
            return {"error": "Exam attempt is not in progress", "status": attempt["status"], "status_code": 400}
        if attempt["is_paused"] == 1:
            return {"error": "Exam attempt is paused", "is_paused": True, "pause_reason": attempt["pause_reason"], "status_code": 403}
            
        # Session fencing
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                return {"error": "Session superseded", "superseded": True, "message": "This session is no longer active. The exam has been resumed on another device.", "status_code": 403}
                
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
            
        q_row = conn.execute("SELECT id, answer FROM ce_questions WHERE id=? AND exam_id=?", (question_id, attempt["exam_id"])).fetchone()
        if not q_row:
            return {"error": "Question not found in this exam", "status_code": 404}
            
        is_correct = 1 if (user_answer and str(user_answer).strip() == str(q_row["answer"]).strip()) else 0
        
        # Out-of-order revision protection
        try:
            client_rev_int = int(client_revision or 0)
        except (ValueError, TypeError):
            client_rev_int = 0
        client_ts_str = str(client_timestamp) if client_timestamp else None

        if client_rev_int > 0:
            existing_resp = conn.execute("""
                SELECT user_answer, client_revision 
                FROM ce_attempt_questions 
                WHERE attempt_id=? AND question_id=?
            """, (attempt_id, question_id)).fetchone()
            if existing_resp and "client_revision" in existing_resp.keys() and existing_resp["client_revision"] is not None:
                stored_rev = int(existing_resp["client_revision"] or 0)
                if stored_rev > client_rev_int:
                    return {
                        "success": True,
                        "saved": False,
                        "stale_revision": True,
                        "server_revision": stored_rev,
                        "current_answer": existing_resp["user_answer"],
                        "message": "Ignored stale out-of-order revision",
                        "remaining_time": max(0, server_rem),
                        "status_code": 200
                    }

        # Merge into ce_attempts.current_progress BEFORE acquiring write lock
        cur_prog = {}
        if attempt["current_progress"]:
            try:
                cur_prog = json.loads(attempt["current_progress"])
            except Exception:
                cur_prog = {}
        answers_dict = cur_prog.get("answers", {})
        answers_dict[f"q{question_id}"] = user_answer
        cur_prog["answers"] = answers_dict
        
        time_dict = cur_prog.get("time_data", {})
        time_dict[f"time_{question_id}"] = time_spent
        cur_prog["time_data"] = time_dict
        serialized_progress = json.dumps(cur_prog)

        conn.execute("""
            INSERT INTO ce_attempt_questions 
            (attempt_id, question_id, user_answer, is_correct, time_spent, client_revision, client_timestamp, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                user_answer = excluded.user_answer,
                is_correct = excluded.is_correct,
                time_spent = excluded.time_spent,
                client_revision = excluded.client_revision,
                client_timestamp = excluded.client_timestamp,
                completed_at = CURRENT_TIMESTAMP
        """, (attempt_id, question_id, user_answer if user_answer else None, is_correct, time_spent, client_rev_int, client_ts_str))
        
        conn.execute("""
            UPDATE ce_attempts 
            SET current_progress = ?, updated_at = CURRENT_TIMESTAMP, last_heartbeat = CURRENT_TIMESTAMP
            WHERE id = ? AND student_id = ? AND status = 'in_progress'
        """, (serialized_progress, attempt_id, student_id))
        
        # Check authoritative deadline: if expired, finalize AFTER saving the incoming answer
        if server_rem <= 0:
            finalize_ce_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            return {
                "success": True,
                "saved": True,
                "time_up": True,
                "remaining_time": 0,
                "server_revision": client_rev_int,
                "message": "Time is up! Exam auto-submitted.",
                "status_code": 200
            }
        
        conn.commit()
        return {
            "success": True,
            "saved": True,
            "saved_at": get_utc_now().isoformat(),
            "attempt_id": attempt_id,
            "question_id": question_id,
            "server_revision": client_rev_int,
            "remaining_time": server_rem,
            "status_code": 200
        }
    except Exception as e:
        conn.rollback()
        logger.error(f"[CE_ANSWER_SAVE_FAIL] Attempt {attempt_id}, Q{question_id}: {e}")
        return {"error": "Failed to save answer due to server contention", "status_code": 500}
    finally:
        if close_conn and conn:
            conn.close()
