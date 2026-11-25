import sqlite3
import secrets
from datetime import datetime, timedelta
from cognitara.database.connection import get_db_connection, SafeRow
from cognitara.utils.helpers import get_utc_now
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.grading_service import finalize_regular_exam_attempt, finalize_ce_exam_attempt

HEARTBEAT_TIMEOUT_SECONDS = 90

def process_regular_heartbeat(student_id, attempt_id, session_key):
    conn = get_db_connection()
    try:
        attempt = conn.execute("""
            SELECT s.*, e.duration FROM scores s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["student_id"] != student_id:
            return {"error": "Forbidden", "status_code": 403}
        if attempt["status"] != "in_progress":
            return {"success": False, "status": attempt["status"], "completed": True, "remaining_time": 0, "status_code": 200}
            
        # Session fencing
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                return {"error": "Session superseded", "superseded": True, "message": "This session is no longer active. The exam has been resumed on another device.", "status_code": 403}
                
        if attempt["is_paused"] == 1:
            return {"success": True, "is_paused": True, "pause_reason": attempt["pause_reason"], "remaining_time": int(attempt["remaining_time"] or 0), "status_code": 200}
            
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        if server_rem <= 0:
            finalize_regular_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            return {"success": True, "time_up": True, "remaining_time": 0, "status_code": 200}
            
        conn.execute("""
            UPDATE scores 
            SET last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, remaining_time = ?
            WHERE id = ? AND is_paused = 0 AND status = 'in_progress'
        """, (server_rem, attempt_id))
        conn.commit()
        
        return {
            "success": True,
            "is_paused": False,
            "remaining_time": server_rem,
            "warnings_count": int(attempt["warnings_count"] or 0),
            "status_code": 200
        }
    finally:
        conn.close()

def process_ce_heartbeat(student_id, attempt_id, session_key):
    conn = get_db_connection()
    try:
        attempt = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["student_id"] != student_id:
            return {"error": "Forbidden", "status_code": 403}
        if attempt["status"] != "in_progress":
            return {"success": False, "status": attempt["status"], "completed": True, "remaining_time": 0, "status_code": 200}
            
        # Session fencing
        active_key = attempt["session_key"] if ("session_key" in attempt.keys() and attempt["session_key"]) else None
        if active_key:
            if not session_key or str(active_key).strip() != str(session_key).strip():
                return {"error": "Session superseded", "superseded": True, "message": "This session is no longer active. The exam has been resumed on another device.", "status_code": 403}
                
        if attempt["is_paused"] == 1:
            return {"success": True, "is_paused": True, "pause_reason": attempt["pause_reason"], "remaining_time": int(attempt["remaining_time"] or 0), "status_code": 200}
            
        server_rem = calculate_authoritative_remaining_time(attempt, attempt["duration"])
        if server_rem <= 0:
            finalize_ce_exam_attempt(attempt_id, conn=conn)
            conn.commit()
            return {"success": True, "time_up": True, "remaining_time": 0, "status_code": 200}
            
        conn.execute("""
            UPDATE ce_attempts 
            SET last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, remaining_time = ?
            WHERE id = ? AND is_paused = 0 AND status = 'in_progress'
        """, (server_rem, attempt_id))
        conn.commit()
        
        return {
            "success": True,
            "is_paused": False,
            "remaining_time": server_rem,
            "warnings_count": int(attempt["warnings_count"] or 0),
            "status_code": 200
        }
    finally:
        conn.close()

def resume_regular_attempt(attempt_id, actor_name, role="Admin", conn=None):
    """
    Authoritatively resumes a paused regular attempt, generating a fresh session_key lease,
    clearing pause flags, and calculating new deadline.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        import sqlite3
        conn.row_factory = SafeRow
    try:
        attempt = conn.execute("""
            SELECT s.*, e.duration FROM scores s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["status"] != "in_progress":
            return {"error": "Exam attempt is not in progress", "status_code": 400}
            
        rem = int(attempt["remaining_time"] or 0)
        if rem <= 0:
            rem = int(attempt["duration"] or 30) * 60
            
        new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
        new_session_key = secrets.token_hex(16)
        
        conn.execute("""
            UPDATE scores 
            SET is_paused=0, paused_at=NULL, paused_by=NULL, pause_reason=NULL,
                resume_requested=0, tab_closed=0, authoritative_deadline=?,
                session_key=?, last_heartbeat=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        """, (new_dl, new_session_key, attempt_id))
        
        conn.commit()
        return {"success": True, "message": "Exam resumed successfully", "session_key": new_session_key}
    finally:
        if close_conn:
            conn.close()

def resume_ce_attempt(attempt_id, actor_name, role="Admin", conn=None):
    """
    Authoritatively resumes a paused Common Entrance attempt, generating a fresh session_key lease,
    clearing pause flags, and calculating new deadline.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        import sqlite3
        conn.row_factory = SafeRow
    try:
        attempt = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.id=?
        """, (attempt_id,)).fetchone()
        
        if not attempt:
            return {"error": "Attempt not found", "status_code": 404}
        if attempt["status"] != "in_progress":
            return {"error": "Exam attempt is not in progress", "status_code": 400}
            
        rem = int(attempt["remaining_time"] or 0)
        if rem <= 0:
            rem = int(attempt["duration"] or 30) * 60
            
        new_dl = (get_utc_now() + timedelta(seconds=rem)).strftime('%Y-%m-%d %H:%M:%S')
        new_session_key = secrets.token_hex(16)
        
        conn.execute("""
            UPDATE ce_attempts 
            SET is_paused=0, paused_at=NULL, paused_by=NULL, pause_reason=NULL,
                resume_requested=0, tab_closed=0, authoritative_deadline=?,
                session_key=?, last_heartbeat=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        """, (new_dl, new_session_key, attempt_id))
        
        conn.commit()
        return {"success": True, "message": "Exam resumed successfully", "session_key": new_session_key}
    finally:
        if close_conn:
            conn.close()

import time

_LAST_SWEEP_TIME = 0
SWEEP_COOLDOWN_SECONDS = 10

def sweep_disconnected_attempts(conn=None, force=False):
    """
    Authoritative active disconnect detection without background threads.
    Scans active in-progress attempts whose last_heartbeat is older than HEARTBEAT_TIMEOUT_SECONDS (25s)
    and transitions them safely to is_paused=1 with freeze of remaining_time.
    Throttled to run at most once every 10 seconds unless force=True.
    """
    global _LAST_SWEEP_TIME
    now = time.time()
    if not force and (now - _LAST_SWEEP_TIME) < SWEEP_COOLDOWN_SECONDS:
        return 0
    _LAST_SWEEP_TIME = now

    should_close = False
    if conn is None:
        conn = get_db_connection()
        should_close = True
    else:
        conn.row_factory = SafeRow
    try:
        paused_count = 0
        now_dt = get_utc_now()
        
        # 1. Sweep Regular Exam scores
        regular_active = conn.execute("""
            SELECT s.*, e.duration FROM scores s
            JOIN exams e ON s.exam_id = e.id
            WHERE s.status = 'in_progress' AND s.is_paused = 0
        """).fetchall()
        
        for att in regular_active:
            last_hb_str = att["last_heartbeat"] or att["updated_at"] or att["start_time"]
            if not last_hb_str:
                continue
            try:
                last_dt = datetime.strptime(str(last_hb_str).split('.')[0], '%Y-%m-%d %H:%M:%S')
                elapsed = (now_dt - last_dt).total_seconds()
            except Exception:
                continue
                
            if elapsed > HEARTBEAT_TIMEOUT_SECONDS:
                rem = calculate_authoritative_remaining_time(att, att["duration"])
                conn.execute("""
                    UPDATE scores 
                    SET is_paused = 1, paused_at = CURRENT_TIMESTAMP, paused_by = 'heartbeat_timeout',
                        pause_reason = 'Connection lost / heartbeat timeout', tab_closed = 1, remaining_time = ?
                    WHERE id = ? AND is_paused = 0 AND status = 'in_progress'
                """, (rem, att["id"]))
                paused_count += 1
                
        # 2. Sweep Common Entrance ce_attempts
        ce_active = conn.execute("""
            SELECT a.*, e.duration FROM ce_attempts a
            JOIN ce_exams e ON a.exam_id = e.id
            WHERE a.status = 'in_progress' AND a.is_paused = 0
        """).fetchall()
        
        for att in ce_active:
            last_hb_str = att["last_heartbeat"] or att["updated_at"] or att["started_at"]
            if not last_hb_str:
                continue
            try:
                last_dt = datetime.strptime(str(last_hb_str).split('.')[0], '%Y-%m-%d %H:%M:%S')
                elapsed = (now_dt - last_dt).total_seconds()
            except Exception:
                continue
                
            if elapsed > HEARTBEAT_TIMEOUT_SECONDS:
                rem = calculate_authoritative_remaining_time(att, att["duration"])
                conn.execute("""
                    UPDATE ce_attempts 
                    SET is_paused = 1, paused_at = CURRENT_TIMESTAMP, paused_by = 'heartbeat_timeout',
                        pause_reason = 'Connection lost / heartbeat timeout', tab_closed = 1, remaining_time = ?
                    WHERE id = ? AND is_paused = 0 AND status = 'in_progress'
                """, (rem, att["id"]))
                paused_count += 1
                
        conn.commit()
        return paused_count
    finally:
        if should_close:
            conn.close()
