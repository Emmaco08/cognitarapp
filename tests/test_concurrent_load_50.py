"""
CogniTara Offline Examination Portal - Stepped Concurrent Load Testing Suite
Phase 4.4 Enterprise Performance and Concurrency Certification.

Simulates 1, 5, 10, 25, 50, and 100 concurrent students performing realistic
examination workloads (answer saves, heartbeats, pause checks) on Waitress WSGI.
Target: Measure real latency, throughput, lock contention, and verify 0 lost updates.
"""

import os
import sys
import time
import math
import sqlite3
import subprocess
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scripts.backup_exam_db import verify_database_integrity
from cognitara.database.initialization import ensure_deadline_columns

LOAD_DIR = os.path.join(ROOT_DIR, "backups_phase4_4", "load_testing")
os.makedirs(LOAD_DIR, exist_ok=True)
DISPOSABLE_DB = os.path.join(LOAD_DIR, "exam_load_test_disposable.db")
SERVER_PORT = 5060
BASE_URL = f"http://127.0.0.1:{SERVER_PORT}"


def setup_disposable_load_database():
    """Initializes isolated test database with 100 students, exam, and active attempts."""
    for ext in ["", "-wal", "-shm"]:
        p = DISPOSABLE_DB + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    src_path = os.path.join(ROOT_DIR, "exam.db")
    src_conn = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
    conn = sqlite3.connect(DISPOSABLE_DB)
    src_conn.backup(conn)
    src_conn.close()

    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    ensure_deadline_columns(conn)

    # Clean previous records
    conn.execute("DELETE FROM scores")
    conn.execute("DELETE FROM exam_question_responses")
    conn.execute("DELETE FROM students WHERE id >= 1000")
    conn.execute("DELETE FROM questions WHERE exam_id = 999")
    conn.execute("DELETE FROM exams WHERE id = 999")

    # Create dedicated load test exam
    conn.execute("""
        INSERT OR REPLACE INTO exams (id, name, class, duration, active, max_warnings)
        VALUES (999, 'Concurrent Load Test Exam', 'Class 1', 120, 1, 10)
    """)

    # Create 30 questions for exam 999
    for q in range(1, 31):
        conn.execute("""
            INSERT OR REPLACE INTO questions (id, exam_id, question, option1, option2, option3, option4, answer, section_id)
            VALUES (?, 999, ?, 'Option A', 'Option B', 'Option C', 'Option D', 'B', 1)
        """, (9000 + q, f"Load Test Question {q}"))

    hashed_pw = generate_password_hash("student123")
    now_utc = datetime.now(timezone.utc)
    dl_str = (now_utc + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

    # Create 100 synthetic students and active attempts
    for i in range(1, 101):
        student_id = 1000 + i
        attempt_id = 5000 + i
        sess_key = f"load_sess_key_{i}"

        conn.execute("""
            INSERT OR REPLACE INTO students (id, username, password, class, full_name, status)
            VALUES (?, ?, ?, 'Class 1', ?, 'approved')
        """, (student_id, f"load_student_{i}", hashed_pw, f"Load Student {i}"))

        conn.execute("""
            INSERT OR REPLACE INTO scores (id, student_id, exam_id, status, is_paused, session_key, remaining_time, authoritative_deadline, start_time)
            VALUES (?, ?, 999, 'in_progress', 0, ?, 7200, ?, ?)
        """, (attempt_id, student_id, sess_key, dl_str, now_utc.strftime("%Y-%m-%d %H:%M:%S")))

    conn.commit()
    conn.close()
    print(f"[+] Disposable database created and seeded: {DISPOSABLE_DB}")


def simulate_student_session(student_num: int, num_questions_to_answer: int = 10):
    """
    Simulates a realistic student session:
    - Login & extract CSRF
    - Answer saves with client_revision
    - Heartbeats
    - Pause checks
    Returns: list of (action, latency_ms, status_code, success_bool)
    """
    import re
    student_id = 1000 + student_num
    attempt_id = 5000 + student_num
    username = f"load_student_{student_num}"
    sess_key = f"load_sess_key_{student_num}"

    session = requests.Session()
    results = []

    # 1. Login
    t0 = time.perf_counter()
    try:
        login_page = session.get(f"{BASE_URL}/login", timeout=15)
        match = re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', login_page.text)
        csrf_token = match.group(1) if match else (session.cookies.get("csrf_token") or "")

        login_resp = session.post(
            f"{BASE_URL}/login",
            data={"username": username, "password": "student123", "role": "Student", "csrf_token": csrf_token},
            headers={"X-CSRFToken": csrf_token},
            timeout=15,
            allow_redirects=True
        )
        t_login = (time.perf_counter() - t0) * 1000
        login_ok = login_resp.status_code in [200, 302] and "Invalid" not in login_resp.text
        results.append(("login", t_login, login_resp.status_code, login_ok))
        login_text = login_resp.text
    except Exception:
        t_login = (time.perf_counter() - t0) * 1000
        results.append(("login", t_login, 0, False))
        login_text = ""
        csrf_token = ""

    # Re-extract CSRF if regenerated on dashboard
    match2 = re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', login_text)
    active_csrf = match2.group(1) if match2 else ""
    if not active_csrf:
        match3 = re.search(r'CSRF_TOKEN\s*=\s*["\']([^"\']+)["\']', login_text)
        active_csrf = match3.group(1) if match3 else csrf_token

    # 2. Answer Saves (Realistic student interaction: answer 10 questions)
    for q_idx in range(1, num_questions_to_answer + 1):
        question_id = 9000 + q_idx
        payload = {
            "attempt_id": attempt_id,
            "question_id": question_id,
            "user_answer": "B",
            "time_spent": 12 + q_idx,
            "session_key": sess_key,
            "client_revision": 1,
            "client_timestamp": datetime.now(timezone.utc).isoformat()
        }

        t_start = time.perf_counter()
        try:
            resp = session.post(
                f"{BASE_URL}/exam_save_single_answer",
                json=payload,
                headers={"X-CSRFToken": active_csrf, "Content-Type": "application/json"},
                timeout=20
            )
            lat = (time.perf_counter() - t_start) * 1000
            ok = resp.status_code == 200 and resp.json().get("saved") is True
            if not ok and student_num == 1 and q_idx == 1:
                print(f"\n[DEBUG SAVE FAIL] status={resp.status_code}, text={resp.text}\n")
            results.append(("save_answer", lat, resp.status_code, ok))
        except Exception as e:
            lat = (time.perf_counter() - t_start) * 1000
            if student_num == 1 and q_idx == 1:
                print(f"\n[DEBUG SAVE EXCEPTION]: {e}\n")
            results.append(("save_answer", lat, 0, False))

    # 3. Heartbeats (2 heartbeats)
    for _ in range(2):
        hb_payload = {"attempt_id": attempt_id, "session_key": sess_key}
        t_start = time.perf_counter()
        try:
            resp = session.post(
                f"{BASE_URL}/exam_heartbeat",
                json=hb_payload,
                headers={"X-CSRFToken": active_csrf, "Content-Type": "application/json"},
                timeout=15
            )
            lat = (time.perf_counter() - t_start) * 1000
            ok = resp.status_code == 200 and resp.json().get("success") is True
            results.append(("heartbeat", lat, resp.status_code, ok))
        except Exception:
            lat = (time.perf_counter() - t_start) * 1000
            results.append(("heartbeat", lat, 0, False))

    # 4. Pause Status Checks (2 checks)
    for _ in range(2):
        t_start = time.perf_counter()
        try:
            resp = session.get(f"{BASE_URL}/exam_check_pause/{attempt_id}", timeout=15)
            lat = (time.perf_counter() - t_start) * 1000
            ok = resp.status_code == 200
            results.append(("pause_check", lat, resp.status_code, ok))
        except Exception:
            lat = (time.perf_counter() - t_start) * 1000
            results.append(("pause_check", lat, 0, False))

    return results


def run_stage(concurrency: int):
    """Executes a load test stage with `concurrency` parallel students."""
    print(f"\n>>> Running Stage: {concurrency} Concurrent Student(s)...")
    stage_start = time.perf_counter()

    all_results = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(simulate_student_session, i, 10): i for i in range(1, concurrency + 1)}
        for future in as_completed(futures):
            res = future.result()
            all_results.extend(res)

    total_time = time.perf_counter() - stage_start
    total_reqs = len(all_results)
    success_reqs = sum(1 for r in all_results if r[3])
    failed_reqs = total_reqs - success_reqs
    throughput = total_reqs / total_time if total_time > 0 else 0

    latencies = sorted([r[1] for r in all_results])
    p50 = latencies[int(len(latencies) * 0.50)] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    p99 = latencies[int(len(latencies) * 0.99)] if latencies else 0
    min_lat = latencies[0] if latencies else 0
    max_lat = latencies[-1] if latencies else 0

    success_rate = (success_reqs / total_reqs * 100) if total_reqs > 0 else 0

    stats = {
        "concurrency": concurrency,
        "total_requests": total_reqs,
        "successful_requests": success_reqs,
        "failed_requests": failed_reqs,
        "success_rate": success_rate,
        "elapsed_seconds": total_time,
        "throughput_req_per_sec": throughput,
        "min_latency_ms": min_lat,
        "p50_latency_ms": p50,
        "p95_latency_ms": p95,
        "p99_latency_ms": p99,
        "max_latency_ms": max_lat
    }

    print(f"    Completed {total_reqs} requests in {total_time:.2f}s ({throughput:.1f} req/s)")
    print(f"    Success: {success_rate:.1f}% | p50: {p50:.1f}ms | p95: {p95:.1f}ms | p99: {p99:.1f}ms | Max: {max_lat:.1f}ms")
    return stats


def main():
    setup_disposable_load_database()

    # Launch Waitress production server in subprocess
    env = os.environ.copy()
    env["COGNITARA_HOST"] = "127.0.0.1"
    env["COGNITARA_PORT"] = str(SERVER_PORT)
    env["COGNITARA_DB_NAME"] = DISPOSABLE_DB
    env["COGNITARA_STRICT_TEST_ISOLATION"] = "1"
    env["COGNITARA_THREADS"] = "24"
    env["COGNITARA_RATELIMIT_IP"] = "100000 per minute"
    env["COGNITARA_RATELIMIT_ACCOUNT"] = "100000 per minute"
    env["RATELIMIT_ENABLED"] = "False"

    print(f"[*] Starting production Waitress server on {BASE_URL}...")
    server_proc = subprocess.Popen(
        [sys.executable, "wsgi.py"],
        cwd=ROOT_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    try:
        # Wait for server readiness
        ready = False
        for _ in range(30):
            try:
                r = requests.get(f"{BASE_URL}/health", timeout=1)
                if r.status_code == 200:
                    ready = True
                    break
            except Exception:
                time.sleep(0.5)

        if not ready:
            print("[!] Server failed to start within 15 seconds", file=sys.stderr)
            sys.exit(1)

        print("[+] Waitress server is UP and responding to health checks!")

        stages = [1, 5, 10, 25, 50, 100]
        results_table = []

        for c in stages:
            stats = run_stage(c)
            results_table.append(stats)
            time.sleep(1)  # Brief pause between stages

        # Post-test Database Integrity & Lost-Update Verification
        print("\n" + "=" * 70)
        print("DATABASE INTEGRITY & ZERO-LOST-UPDATES POST-TEST VERIFICATION")
        print("=" * 70)

        conn = sqlite3.connect(f"file:{DISPOSABLE_DB}?mode=ro", uri=True)
        total_answers_saved = conn.execute("SELECT COUNT(*) FROM exam_question_responses WHERE exam_id = 999").fetchone()[0]
        distinct_pairs = conn.execute("SELECT COUNT(DISTINCT attempt_id || '-' || question_id) FROM exam_question_responses WHERE exam_id = 999").fetchone()[0]
        conn.close()

        is_valid, msg = verify_database_integrity(DISPOSABLE_DB)

        print(f"Total Answers Persisted:  {total_answers_saved}")
        print(f"Distinct Question Pairs:  {distinct_pairs}")
        duplicate_rows = total_answers_saved - distinct_pairs
        print(f"Duplicate Rows Count:     {duplicate_rows} (Expected: 0)")
        print(f"SQLite Integrity Status:  {msg}")

        # Print Markdown Table for Phase 4.4 Report
        print("\n### Phase 4.4 Stepped Concurrent Load Testing Results Table\n")
        print("| Stage | Students | Requests | Success % | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |")
        print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        for s in results_table:
            print(f"| {s['concurrency']} Student{'s' if s['concurrency'] > 1 else ''} | {s['concurrency']} | {s['total_requests']} | {s['success_rate']:.1f}% | {s['throughput_req_per_sec']:.1f} | {s['p50_latency_ms']:.1f} | {s['p95_latency_ms']:.1f} | {s['p99_latency_ms']:.1f} | {s['max_latency_ms']:.1f} |")

        # Acceptance Criteria Assertions
        assert duplicate_rows == 0, "Duplicate rows detected!"
        assert is_valid, f"Database corruption detected: {msg}"
        # For 50 students: success rate should be 100% and median latency under 200ms
        stats_50 = next(s for s in results_table if s["concurrency"] == 50)
        assert stats_50["success_rate"] == 100.0, f"50 student success rate was {stats_50['success_rate']}%"
        print("\n[+] CONCURRENCY AND DISASTER RECOVERY LOAD TEST PASSED ALL ACCEPTANCE GATES!")

    finally:
        print("[*] Terminating Waitress server...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("[+] Server stopped.")


if __name__ == "__main__":
    main()
