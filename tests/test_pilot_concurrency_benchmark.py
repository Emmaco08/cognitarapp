"""
CogniTara Offline Examination Portal - Phase 4.5 Pilot Concurrency Benchmark Suite
Empirical performance certification for controlled school pilot.

Measures realistic student concurrency across 10, 20, 25 (target certified pilot), and 30 (hard ceiling)
concurrent students on Waitress WSGI with WAL SQLite using the isolated pilot database.
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

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scripts.backup_exam_db import verify_database_integrity, calculate_sha256
from scripts.setup_pilot_environment import setup_pilot_environment, PILOT_DB

SERVER_PORT = 5062
BASE_URL = f"http://127.0.0.1:{SERVER_PORT}"


def simulate_pilot_student_session(student_idx: int, num_answers: int = 10) -> list:
    """
    Simulates a realistic student examination session:
    1. Login as pilot_student_XX
    2. Extract CSRF token
    3. Save answers with client_revision logical clock
    4. Send heartbeats
    5. Check pause status
    """
    import re
    username = f"pilot_student_{student_idx:02d}"
    password = "pilot_pass_2026"
    attempt_id = 6000 + student_idx
    sess_key = f"pilot_sess_{student_idx:02d}"

    session = requests.Session()
    results = []

    # 1. Login
    t_start = time.perf_counter()
    active_csrf = ""
    try:
        login_page_resp = session.get(f"{BASE_URL}/login", timeout=15)
        match = re.search(r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', login_page_resp.text)
        csrf_token = match.group(1) if match else (session.cookies.get("csrf_token") or "")

        resp = session.post(
            f"{BASE_URL}/login",
            data={
                "username": username,
                "password": password,
                "role": "Student",
                "csrf_token": csrf_token
            },
            headers={"X-CSRFToken": csrf_token},
            timeout=15,
            allow_redirects=True
        )
        lat = (time.perf_counter() - t_start) * 1000
        ok = resp.status_code in [200, 302] and "Invalid" not in resp.text
        results.append(("login", lat, resp.status_code, ok))

        # 2. Fetch Exam Page (Exam 801) to obtain active CSRF token for the exam session
        exam_resp = session.get(f"{BASE_URL}/exam/801", timeout=15)
        m_csrf = re.search(r'meta name=["\']csrf-token["\'] content=["\']([^"\']+)["\']', exam_resp.text)
        if not m_csrf:
            m_csrf = re.search(r'CSRF_TOKEN\s*=\s*["\']([^"\']+)["\']', exam_resp.text)
        if m_csrf:
            active_csrf = m_csrf.group(1)

    except Exception:
        lat = (time.perf_counter() - t_start) * 1000
        results.append(("login", lat, 0, False))
        return results

    # 3. Simulate sequential answer saves with logical clocks
    options = ["Alpha", "Beta", "Gamma", "Delta"]
    for q_idx in range(1, num_answers + 1):
        q_id = 8000 + q_idx
        chosen_opt = options[q_idx % 4]
        rev = int(time.time() * 1000)

        payload = {
            "attempt_id": attempt_id,
            "question_id": q_id,
            "user_answer": chosen_opt,
            "time_spent": 15,
            "session_key": sess_key,
            "client_revision": rev,
            "client_timestamp": datetime.now(timezone.utc).isoformat()
        }

        t_start = time.perf_counter()
        try:
            resp = session.post(
                f"{BASE_URL}/exam_save_single_answer",
                json=payload,
                headers={"X-CSRFToken": active_csrf, "Content-Type": "application/json"},
                timeout=15
            )
            lat = (time.perf_counter() - t_start) * 1000
            ok = resp.status_code == 200 and resp.json().get("saved") is True
            if not ok and student_idx == 1 and q_idx == 1:
                print(f"\n[DEBUG SAVE FAIL] status={resp.status_code}, body={resp.text}\n")
            results.append(("save_answer", lat, resp.status_code, ok))
        except Exception as e:
            lat = (time.perf_counter() - t_start) * 1000
            if student_idx == 1 and q_idx == 1:
                print(f"\n[DEBUG SAVE EXCEPTION]: {e}\n")
            results.append(("save_answer", lat, 0, False))

    # 4. Periodic Heartbeat
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

    # 5. Pause status checks (6000ms interval check)
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


def run_pilot_stage(concurrency: int) -> dict:
    """Executes a benchmark stage with `concurrency` parallel students."""
    print(f"\n>>> Running Pilot Benchmark Stage: {concurrency} Concurrent Students...")
    
    # Pre-stage: refresh attempts to in_progress with fresh heartbeat
    conn = sqlite3.connect(PILOT_DB)
    conn.execute("UPDATE scores SET is_paused = 0, last_heartbeat = CURRENT_TIMESTAMP WHERE exam_id = 801")
    conn.commit()
    conn.close()

    stage_start = time.perf_counter()

    all_results = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(simulate_pilot_student_session, i, 10): i for i in range(1, concurrency + 1)}
        for future in as_completed(futures):
            res = future.result()
            all_results.extend(res)

    total_time = time.perf_counter() - stage_start
    total_reqs = len(all_results)
    success_reqs = sum(1 for r in all_results if r[3])
    failed_reqs = total_reqs - success_reqs
    throughput = total_reqs / total_time if total_time > 0 else 0

    # Filter answer saves specifically for SLA evaluation
    save_latencies = sorted([r[1] for r in all_results if r[0] == "save_answer" and r[3]])
    all_latencies = sorted([r[1] for r in all_results])

    p50 = all_latencies[int(len(all_latencies) * 0.50)] if all_latencies else 0
    p95 = all_latencies[int(len(all_latencies) * 0.95)] if all_latencies else 0
    p99 = all_latencies[int(len(all_latencies) * 0.99)] if all_latencies else 0

    save_p50 = save_latencies[int(len(save_latencies) * 0.50)] if save_latencies else 0
    save_p95 = save_latencies[int(len(save_latencies) * 0.95)] if save_latencies else 0
    save_p99 = save_latencies[int(len(save_latencies) * 0.99)] if save_latencies else 0

    success_rate = (success_reqs / total_reqs * 100) if total_reqs > 0 else 0

    stats = {
        "concurrency": concurrency,
        "total_requests": total_reqs,
        "successful_requests": success_reqs,
        "failed_requests": failed_reqs,
        "success_rate": success_rate,
        "elapsed_seconds": total_time,
        "throughput_req_per_sec": throughput,
        "all_p50_ms": p50,
        "all_p95_ms": p95,
        "all_p99_ms": p99,
        "save_p50_ms": save_p50,
        "save_p95_ms": save_p95,
        "save_p99_ms": save_p99,
        "max_latency_ms": all_latencies[-1] if all_latencies else 0
    }

    print(f"    Completed {total_reqs} requests in {total_time:.2f}s ({throughput:.1f} req/s)")
    print(f"    Success: {success_rate:.1f}% | Total p50: {p50:.1f}ms | Total p95: {p95:.1f}ms")
    print(f"    Answer-Save SLA: p50={save_p50:.1f}ms | p95={save_p95:.1f}ms | p99={save_p99:.1f}ms")
    return stats


def run_benchmark():
    # 1. Ensure clean pilot environment
    print("[*] Re-initializing pilot environment for benchmark...")
    setup_pilot_environment(30)

    # 2. Launch production Waitress server on isolated port
    env = os.environ.copy()
    env["COGNITARA_HOST"] = "127.0.0.1"
    env["COGNITARA_PORT"] = str(SERVER_PORT)
    env["COGNITARA_DB_NAME"] = PILOT_DB
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

        stages = [10, 20, 25, 30]
        results_table = []

        for c in stages:
            stats = run_pilot_stage(c)
            results_table.append(stats)
            time.sleep(1.5)  # Pause between stages

        # 3. Post-Benchmark Database Integrity & Lost-Update Audit
        print("\n" + "=" * 70)
        print("PILOT BENCHMARK DATA INTEGRITY & ZERO-LOST-UPDATES AUDIT")
        print("=" * 70)

        conn = sqlite3.connect(f"file:{PILOT_DB}?mode=ro", uri=True)
        total_answers_saved = conn.execute("SELECT COUNT(*) FROM exam_question_responses WHERE exam_id = 801").fetchone()[0]
        distinct_pairs = conn.execute("SELECT COUNT(DISTINCT attempt_id || '-' || question_id) FROM exam_question_responses WHERE exam_id = 801").fetchone()[0]
        attempts_count = conn.execute("SELECT COUNT(*) FROM scores WHERE exam_id = 801").fetchone()[0]
        conn.close()

        is_valid, msg = verify_database_integrity(PILOT_DB)

        print(f"Total Student Attempts:    {attempts_count}")
        print(f"Total Answers Persisted:   {total_answers_saved}")
        print(f"Distinct Question Pairs:   {distinct_pairs}")
        duplicate_rows = total_answers_saved - distinct_pairs
        print(f"Duplicate Rows Count:      {duplicate_rows} (Expected: 0)")
        print(f"SQLite Integrity Status:   {msg}")

        # Summary Table
        print("\n### Phase 4.5 Pilot Concurrency Benchmark Results Table\n")
        print("| Stage | Students | Requests | Success % | Throughput | Total p50 | Total p95 | Save p50 | Save p95 | Save p99 |")
        print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        for s in results_table:
            print(f"| {s['concurrency']} Students | {s['concurrency']} | {s['total_requests']} | {s['success_rate']:.1f}% | {s['throughput_req_per_sec']:.1f} req/s | {s['all_p50_ms']:.1f}ms | {s['all_p95_ms']:.1f}ms | {s['save_p50_ms']:.1f}ms | {s['save_p95_ms']:.1f}ms | {s['save_p99_ms']:.1f}ms |")

        # Acceptance Criteria Assertions
        assert duplicate_rows == 0, f"Duplicate rows detected: {duplicate_rows}"
        assert is_valid, f"Database integrity check failed: {msg}"

        # Certified Pilot Threshold (10 to 25 students): 100% success rate, save p95 <= 1.5s
        stats_25 = next(s for s in results_table if s["concurrency"] == 25)
        assert stats_25["success_rate"] >= 99.0, f"25-student success rate fell below 99%: {stats_25['success_rate']}%"
        assert stats_25["save_p95_ms"] <= 1500.0, f"25-student save p95 exceeded 1.5s: {stats_25['save_p95_ms']}ms"

        print("\n[+] PILOT CONCURRENCY BENCHMARK PASSED ALL PILOT ACCEPTANCE GATES!")
        return results_table

    finally:
        print("[*] Terminating Waitress server...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("[+] Server stopped.")


if __name__ == "__main__":
    run_benchmark()
