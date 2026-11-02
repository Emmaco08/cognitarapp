import sqlite3
import json
import logging
from cognitara.database.connection import get_db_connection, with_db_retry, SafeRow

logger = logging.getLogger("cognitara.services.grading")

class GradingSchemeValidator:
    EPSILON = 1e-4

    @classmethod
    def validate_rules(cls, rules: list) -> tuple:
        """
        Validates that rules cover [0.0, 100.0] contiguously without gaps or overlaps.
        Each rule is a dict: {'grade_label': str, 'min_percentage': float, 'max_percentage': float, ...}
        """
        if not rules or len(rules) < 2:
            return False, "A grading scheme must have at least 2 tiers."

        labels = set()
        for r in rules:
            label = str(r.get("grade_label", "")).strip()
            if not label:
                return False, "Grade label cannot be empty."
            if label in labels:
                return False, f"Duplicate grade label '{label}' detected."
            labels.add(label)

            try:
                min_p = float(r["min_percentage"])
                max_p = float(r["max_percentage"])
            except (ValueError, TypeError, KeyError):
                return False, f"Invalid percentage values for tier '{label}'."

            if min_p < 0.0 or max_p > 100.0:
                return False, f"Tier '{label}' bounds [{min_p}, {max_p}] fall outside [0.0, 100.0]."
            if min_p >= max_p:
                return False, f"Tier '{label}' min ({min_p}%) must be strictly less than max ({max_p}%)."

        sorted_rules = sorted(rules, key=lambda x: float(x["min_percentage"]))

        if abs(float(sorted_rules[0]["min_percentage"]) - 0.0) > cls.EPSILON:
            return False, f"Lowest tier must start at 0.0% (starts at {sorted_rules[0]['min_percentage']}%)."

        if abs(float(sorted_rules[-1]["max_percentage"]) - 100.0) > cls.EPSILON:
            return False, f"Highest tier must terminate at 100.0% (ends at {sorted_rules[-1]['max_percentage']}%)."

        for i in range(1, len(sorted_rules)):
            prev_max = float(sorted_rules[i - 1]["max_percentage"])
            curr_min = float(sorted_rules[i]["min_percentage"])
            gap = curr_min - prev_max
            if gap > cls.EPSILON:
                return False, f"Coverage gap of {gap:.2f}% between '{sorted_rules[i-1]['grade_label']}' and '{sorted_rules[i]['grade_label']}'."
            if gap < -cls.EPSILON:
                return False, f"Overlap of {abs(gap):.2f}% between '{sorted_rules[i-1]['grade_label']}' and '{sorted_rules[i]['grade_label']}'."

        return True, "Valid"

    @classmethod
    def resolve_grade(cls, percentage: float, sorted_rules: list) -> dict:
        """
        Idempotent grade resolution for percentage P in [0.0, 100.0].
        Assumes sorted_rules is sorted ascending by min_percentage.
        """
        if not sorted_rules:
            # Fallback WAEC default
            pct_val = float(percentage or 0)
            if pct_val >= 75: return {"grade_label": "A1", "remark": "Excellent", "badge_color": "#059669"}
            if pct_val >= 70: return {"grade_label": "B2", "remark": "Very Good", "badge_color": "#10b981"}
            if pct_val >= 65: return {"grade_label": "B3", "remark": "Good", "badge_color": "#34d399"}
            if pct_val >= 60: return {"grade_label": "C4", "remark": "Credit", "badge_color": "#3b82f6"}
            if pct_val >= 55: return {"grade_label": "C5", "remark": "Credit", "badge_color": "#60a5fa"}
            if pct_val >= 50: return {"grade_label": "C6", "remark": "Credit", "badge_color": "#818cf8"}
            if pct_val >= 45: return {"grade_label": "D7", "remark": "Pass", "badge_color": "#f59e0b"}
            if pct_val >= 40: return {"grade_label": "E8", "remark": "Pass", "badge_color": "#fb923c"}
            return {"grade_label": "F9", "remark": "Fail", "badge_color": "#ef4444"}

        pct = max(0.0, min(100.0, float(percentage or 0)))
        n = len(sorted_rules)

        for i, r in enumerate(sorted_rules):
            min_p = float(r["min_percentage"])
            max_p = float(r["max_percentage"])
            if i == n - 1:
                if min_p <= pct <= 100.0:
                    return dict(r)
            else:
                if min_p <= pct < max_p:
                    return dict(r)

        return dict(sorted_rules[-1] if pct >= 100.0 else sorted_rules[0])

def get_active_grading_rules(conn, exam_id=None, scheme_type='school'):
    """Fetch active sorted grading rules for an exam or school default."""
    try:
        scheme_id = None
        if exam_id:
            table = "exams" if scheme_type == "school" else "ce_exams"
            try:
                cur = conn.execute(f"SELECT grading_scheme_id FROM {table} WHERE id=?", (exam_id,)).fetchone()
                if cur and cur[0]:
                    scheme_id = cur[0]
            except Exception:
                pass

        if not scheme_id:
            if scheme_type == "school":
                s_row = conn.execute("SELECT active_grading_scheme_id FROM school_settings WHERE id=1").fetchone()
                if s_row and s_row[0]:
                    scheme_id = s_row[0]
            else:
                ce_row = conn.execute("SELECT active_ce_grading_scheme_id FROM ce_settings WHERE id=1").fetchone()
                if ce_row and ce_row[0]:
                    scheme_id = ce_row[0]

        if not scheme_id:
            # Fallback to default scheme
            def_row = conn.execute("SELECT id FROM grading_schemes WHERE is_default=1 ORDER BY id ASC LIMIT 1").fetchone()
            if def_row:
                scheme_id = def_row[0]

        if scheme_id:
            rules = conn.execute("""
                SELECT grade_label, min_percentage, max_percentage, grade_point, remark, badge_color, display_order
                FROM grading_scheme_rules
                WHERE scheme_id=?
                ORDER BY min_percentage ASC
            """, (scheme_id,)).fetchall()
            if rules:
                return [dict(r) for r in rules]
    except Exception as e:
        logger.error(f"Error fetching active grading rules: {e}")
    return []

@with_db_retry(max_retries=5)
def finalize_regular_exam_attempt(attempt_id, conn=None, force_submit=0, auto_submitted_reason=None, answers=None, time_data=None):
    """
    Safely and idempotently finalizes an expired or submitted regular exam attempt.
    Grades the attempt against the student's assigned question subset using
    the last saved progress in scores.current_progress merged authoritatively with exam_question_responses.
    Persists resolved grade_label and grade_remark into scores.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        conn.row_factory = SafeRow
    try:
        attempt = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
        if not attempt:
            return None
        if attempt["status"] == "completed":
            return dict(attempt)
            
        exam_id = attempt["exam_id"]
        
        answers_dict = {}
        time_dict = {}
        assigned_order = []
        if attempt["current_progress"]:
            try:
                prog = json.loads(attempt["current_progress"])
                answers_dict = prog.get("answers", {})
                time_dict = prog.get("time_data", {})
                assigned_order = prog.get("question_order", [])
            except Exception:
                pass
                
        # Merge authoritatively from atomic exam_question_responses table
        try:
            saved_resp_rows = conn.execute("""
                SELECT question_id, user_answer, time_spent 
                FROM exam_question_responses 
                WHERE attempt_id=?
            """, (attempt_id,)).fetchall()
            for r in saved_resp_rows:
                k = f"q{r['question_id']}"
                if r["user_answer"] is not None and str(r["user_answer"]).strip() != "":
                    answers_dict[k] = r["user_answer"]
                elif k not in answers_dict:
                    answers_dict[k] = r["user_answer"]
                tk = f"time_{r['question_id']}"
                if r["time_spent"] is not None and r["time_spent"] > 0:
                    time_dict[tk] = r["time_spent"]
                elif tk not in time_dict:
                    time_dict[tk] = r["time_spent"] or 0
        except Exception:
            pass

        # Overlay any freshly submitted answers or timing data
        if answers and isinstance(answers, dict):
            for ak, av in answers.items():
                if av is not None:
                    answers_dict[ak] = av
        if time_data and isinstance(time_data, dict):
            for tk, tv in time_data.items():
                if tv is not None:
                    time_dict[tk] = tv
        
        answers = answers_dict
        time_data = time_dict
                
        questions = []
        if assigned_order and isinstance(assigned_order, list):
            q_ids = []
            for item in assigned_order:
                if isinstance(item, dict) and "question_id" in item:
                    try:
                        q_ids.append(int(item["question_id"]))
                    except (ValueError, TypeError):
                        pass
                elif isinstance(item, (int, str)):
                    try:
                        q_ids.append(int(item))
                    except (ValueError, TypeError):
                        pass
            if q_ids:
                placeholders = ",".join("?" * len(q_ids))
                q_rows = conn.execute(f"SELECT * FROM questions WHERE id IN ({placeholders})", q_ids).fetchall()
                q_map = {r["id"]: dict(r) for r in q_rows}
                for item in assigned_order:
                    qid = item["question_id"] if isinstance(item, dict) else item
                    try:
                        qid = int(qid)
                        if qid in q_map:
                            q_copy = dict(q_map[qid])
                            if isinstance(item, dict) and item.get("section_id") is not None:
                                q_copy["section_id"] = item["section_id"]
                            questions.append(q_copy)
                    except (ValueError, TypeError):
                        pass

        if not questions:
            q_rows = conn.execute("SELECT * FROM questions WHERE exam_id=? ORDER BY id", (exam_id,)).fetchall()
            questions = [dict(q) for q in q_rows]
            
        score = 0
        total = len(questions)
        if total == 0 and attempt["total"] and attempt["total"] > 0:
            total = attempt["total"]
            
        for q in questions:
            q_dict = dict(q)
            user_ans = answers.get(f"q{q_dict['id']}", "")
            time_spent = 0
            try:
                time_spent = int(time_data.get(f"time_{q_dict['id']}", 0))
            except Exception:
                pass
            is_correct = 1 if (user_ans and user_ans == q_dict["answer"]) else 0
            if is_correct:
                score += 1
            try:
                conn.execute("""
                    INSERT INTO exam_question_responses 
                    (attempt_id, question_id, student_id, exam_id, section_id, user_answer, is_correct, time_spent, answered_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                        user_answer = excluded.user_answer,
                        is_correct = excluded.is_correct,
                        time_spent = excluded.time_spent,
                        answered_at = excluded.answered_at
                """, (attempt_id, q_dict['id'], attempt['student_id'], exam_id, q_dict.get('section_id'), user_ans, is_correct, time_spent))
            except sqlite3.OperationalError:
                pass
                
        percentage = (score / total) * 100 if total > 0 else 0
        
        # Resolve authoritative Grade & Remark
        grading_rules = get_active_grading_rules(conn, exam_id=exam_id, scheme_type='school')
        grade_info = GradingSchemeValidator.resolve_grade(percentage, grading_rules)
        grade_label = grade_info.get("grade_label", "F9")
        grade_remark = grade_info.get("remark", "Completed")

        # Result release policy check
        results_released = 1
        try:
            exam_row = conn.execute("SELECT result_release_policy, results_released FROM exams WHERE id=?", (exam_id,)).fetchone()
            s_set = conn.execute("SELECT default_result_visibility FROM school_settings WHERE id=1").fetchone()
            default_vis = s_set["default_result_visibility"] if s_set else "immediate"
            
            if exam_row:
                pol = exam_row["result_release_policy"] or "inherit"
                if pol == "withheld":
                    results_released = 0
                elif pol == "immediate":
                    results_released = 1
                elif pol == "inherit":
                    results_released = 1 if default_vis == "immediate" else 0
                else:
                    results_released = int(exam_row["results_released"] or 1)
        except Exception:
            results_released = 1

        f_submit = 1 if force_submit else 0
        conn.execute("""
            UPDATE scores SET 
            score=?, total=?, percentage=?, grade_label=?, grade_remark=?, results_released=?,
            status='completed', end_time=CURRENT_TIMESTAMP, remaining_time=0, is_paused=0, 
            force_submit=?, auto_submitted_reason=?
            WHERE id=?
        """, (score, total, percentage, grade_label, grade_remark, results_released, f_submit, auto_submitted_reason, attempt_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM scores WHERE id=?", (attempt_id,)).fetchone()
        return dict(updated) if updated else None
    finally:
        if close_conn:
            conn.close()

@with_db_retry(max_retries=5)
def finalize_ce_exam_attempt(attempt_id, conn=None, force_submit=0, auto_submitted_reason=None):
    """
    Safely and idempotently finalizes an expired or submitted Common Entrance attempt.
    Grades the attempt using the last saved progress and existing attempt_questions.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True
    elif getattr(conn, "row_factory", None) is None:
        conn.row_factory = SafeRow
    try:
        attempt = conn.execute("SELECT * FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
        if not attempt:
            return None
        if attempt["status"] != "in_progress":
            return dict(attempt)
            
        exam = conn.execute("SELECT passing_score FROM ce_exams WHERE id=?", (attempt["exam_id"],)).fetchone()
        passing_score = exam["passing_score"] if exam else 50
        
        answers = {}
        time_data = {}
        if attempt["current_progress"]:
            try:
                prog = json.loads(attempt["current_progress"])
                answers = prog.get("answers", {})
                time_data = prog.get("time_data", {})
            except Exception:
                pass
                
        aq_list = conn.execute("""
            SELECT aq.id as attempt_qid, aq.question_id, aq.user_answer as existing_ans, aq.time_spent as existing_time, q.answer
            FROM ce_attempt_questions aq
            JOIN ce_questions q ON aq.question_id = q.id
            WHERE aq.attempt_id=?
        """, (attempt_id,)).fetchall()
        score = 0
        total = len(aq_list)
        for aq in aq_list:
            qid_str = f"q{aq['question_id']}"
            user_ans = aq["existing_ans"]
            if user_ans is None or str(user_ans).strip() == "":
                user_ans = answers.get(qid_str)
                
            t_spent = 0
            try:
                if f"time_{aq['question_id']}" in time_data:
                    t_spent = int(time_data[f"time_{aq['question_id']}"])
                elif aq["existing_time"]:
                    t_spent = int(aq["existing_time"])
            except Exception:
                t_spent = 0
                
            if user_ans and user_ans == aq["answer"]:
                score += 1
                conn.execute("""
                    UPDATE ce_attempt_questions 
                    SET user_answer=?, is_correct=1, time_spent=?, completed_at=CURRENT_TIMESTAMP 
                    WHERE id=?
                """, (user_ans, t_spent, aq["attempt_qid"]))
            else:
                conn.execute("""
                    UPDATE ce_attempt_questions 
                    SET user_answer=?, is_correct=0, time_spent=?, completed_at=CURRENT_TIMESTAMP 
                    WHERE id=?
                """, (user_ans if user_ans else None, t_spent, aq["attempt_qid"]))
                
        percentage = (score / total) * 100 if total > 0 else 0
        passed = 1 if percentage >= passing_score else 0

        # Resolve authoritative CE Grade & Remark
        ce_grading_rules = get_active_grading_rules(conn, exam_id=attempt["exam_id"], scheme_type='ce')
        grade_info = GradingSchemeValidator.resolve_grade(percentage, ce_grading_rules)
        grade_label = grade_info.get("grade_label", "P")
        grade_remark = grade_info.get("remark", "Passed" if passed else "Did Not Meet Cut-Off")

        # Check direct submit setting
        try:
            ce_settings_row = conn.execute("SELECT direct_submit FROM ce_settings WHERE id=1").fetchone()
            direct_submit = ce_settings_row["direct_submit"] if ce_settings_row and "direct_submit" in ce_settings_row.keys() else 0
        except Exception:
            direct_submit = 0

        submission_status = ('approved' if passed else 'rejected') if direct_submit else 'pending'

        f_submit = 1 if force_submit else 0
        conn.execute("""
            UPDATE ce_attempts SET 
            score=?, total=?, percentage=?, passed=?, grade_label=?, grade_remark=?, status=?,
            completed_at=CURRENT_TIMESTAMP, is_paused=0, force_submit=?, auto_submitted_reason=?, remaining_time=0
            WHERE id=?
        """, (score, total, percentage, passed, grade_label, grade_remark, submission_status, f_submit, auto_submitted_reason, attempt_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM ce_attempts WHERE id=?", (attempt_id,)).fetchone()
        return dict(updated) if updated else None
    finally:
        if close_conn:
            conn.close()
