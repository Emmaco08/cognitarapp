import sqlite3
from datetime import datetime, timedelta
from cognitara.utils.helpers import get_utc_now

def calculate_authoritative_remaining_time(attempt, exam_duration_minutes=30):
    """
    Computes authoritative remaining seconds for an attempt (regular or Common Entrance).
    Rules:
    - Never trust browser-reported remaining time.
    - If attempt status is not 'in_progress', remaining time is 0.
    - If is_paused == 1, remaining time is strictly frozen at stored remaining_time.
    - If authoritative_deadline exists: remaining = (authoritative_deadline - utc_now).
    - If authoritative_deadline is missing: reconstruct from start_time / started_at + duration.
    - If both deadline and start_time are missing/unparseable: return 0.
    Returns: remaining_seconds (int, minimum 0).
    """
    if not attempt:
        return 0
    if isinstance(attempt, sqlite3.Row):
        attempt = dict(attempt)
    if attempt.get("status") and attempt.get("status") not in ("in_progress", "resumed"):
        return 0
    if attempt.get("is_paused") == 1:
        return max(0, int(attempt.get("remaining_time") or 0))
    
    deadline_dt = None
    raw_dl = attempt.get("authoritative_deadline")
    if raw_dl:
        try:
            deadline_dt = datetime.strptime(str(raw_dl).split('.')[0], "%Y-%m-%d %H:%M:%S")
        except Exception:
            pass
            
    if not deadline_dt:
        st_raw = attempt.get("start_time") or attempt.get("started_at")
        if st_raw:
            try:
                st_dt = datetime.strptime(str(st_raw).split('.')[0], "%Y-%m-%d %H:%M:%S")
                deadline_dt = st_dt + timedelta(minutes=int(exam_duration_minutes or 30))
            except Exception:
                pass
                
    if not deadline_dt:
        return 0
        
    diff = int((deadline_dt - get_utc_now()).total_seconds())
    return max(0, diff)
