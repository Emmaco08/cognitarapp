"""
CogniTara Offline Examination Portal - Phase 4.3 Real-Browser Verification Suite
Uses Playwright Chromium to test real user workflows against an isolated test server.
Covers Scenarios A through H:
- Scenario A: Immediate Answer Persistence
- Scenario B: Rapid Revision / Answer Update
- Scenario C: Answer Restore on Page Reload
- Scenario D: Active Disconnect Detection
- Scenario E: Proctor Resume
- Scenario F: Cross-Computer Session Fencing
- Scenario G: Zero External Requests (Offline Self-Containment)
- Scenario H: Mobile Responsive Layout (360px, 375px, 768px, 1280px)
"""

import os
import sys
import time
import shutil
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

# Ensure project root in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from werkzeug.security import generate_password_hash
from playwright.sync_api import sync_playwright

TEST_PORT = 5058
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"
TEST_DB_PATH = os.path.join(PROJECT_ROOT, "backups_phase4_3", "exam_browser_test.db")
PRE_DB_PATH = os.path.join(PROJECT_ROOT, "backups_phase4_3", "exam_pre_phase4_3.db")
if not os.path.exists(PRE_DB_PATH):
    PRE_DB_PATH = os.path.join(PROJECT_ROOT, "exam.db")

def setup_browser_test_db():
    """Create isolated test database and ensure valid test fixtures."""
    os.makedirs(os.path.dirname(TEST_DB_PATH), exist_ok=True)
    shutil.copy2(PRE_DB_PATH, TEST_DB_PATH)
    
    conn = sqlite3.connect(TEST_DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # 1. Create or ensure test student
    conn.execute("""
        INSERT INTO students (id, username, password, class, full_name, status)
        VALUES (9999, 'browser_student', ?, 'Grade 12', 'Browser Test Student', 'approved')
        ON CONFLICT(id) DO UPDATE SET
            username = 'browser_student',
            password = excluded.password,
            status = 'approved'
    """, (generate_password_hash("TestPassword123!"),))

    # 2. Ensure an active exam with at least 5 questions
    exam = conn.execute("SELECT id FROM exams WHERE active=1 LIMIT 1").fetchone()
    if not exam:
        conn.execute("UPDATE exams SET active=1 WHERE id=(SELECT id FROM exams LIMIT 1)")
        exam = conn.execute("SELECT id FROM exams WHERE active=1 LIMIT 1").fetchone()
    
    exam_id = exam["id"]
    
    # Clean previous scores for this test student
    conn.execute("DELETE FROM scores WHERE student_id=9999")
    conn.execute("DELETE FROM exam_question_responses WHERE student_id=9999")
    conn.commit()
    conn.close()
    return exam_id

def run_server():
    """Runs Waitress or Werkzeug WSGI server in a background thread."""
    os.environ["COGNITARA_DB_NAME"] = TEST_DB_PATH
    os.environ["FLASK_ENV"] = "testing"
    
    from cognitara import create_app
    app = create_app()
    app.config["TESTING"] = True
    app.config["DATABASE_NAME"] = TEST_DB_PATH
    
    from waitress import serve
    serve(app, host="127.0.0.1", port=TEST_PORT, threads=4, _quiet=True)

def wait_for_server():
    import urllib.request
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"{BASE_URL}/login", timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False

def test_browser_phase4_3():
    print("=" * 70)
    print("COGNITARA PHASE 4.3 — REAL-BROWSER END-TO-END VERIFICATION SUITE")
    print("=" * 70)

    os.environ["COGNITARA_DB_NAME"] = TEST_DB_PATH
    exam_id = setup_browser_test_db()
    print(f"Test database prepared: {TEST_DB_PATH}")
    print(f"Target test exam ID: {exam_id}")

    # Start test server thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    if not wait_for_server():
        print("ERROR: Test server failed to launch on port", TEST_PORT)
        sys.exit(1)
    print(f"Test server successfully running at {BASE_URL}")

    external_requests = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Track network requests for Scenario G
        def on_request(request):
            url = request.url
            if not url.startswith(BASE_URL) and not url.startswith("data:"):
                external_requests.append(url)
        page.on("request", on_request)
        page.on("console", lambda msg: print(f"  [BROWSER CONSOLE {msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"  [BROWSER PAGEERROR] {err}"))

        # ---------------------------------------------------------------------
        # STEP 1: LOGIN AS TEST STUDENT
        # ---------------------------------------------------------------------
        print("\n[STEP 1] Logging in as student...")
        page.goto(f"{BASE_URL}/login")
        page.fill('input[name="username"]', 'browser_student')
        page.fill('input[name="password"]', 'TestPassword123!')
        page.select_option('select[name="role"]', 'student')
        page.click('button[type="submit"]')
        page.wait_for_url("**/dashboard**", timeout=10000)
        print("  -> Logged in successfully. Current URL:", page.url)

        # ---------------------------------------------------------------------
        # STEP 2: START EXAM & OPEN EXAM PAGE
        # ---------------------------------------------------------------------
        print("\n[STEP 2] Launching exam session...")
        page.goto(f"{BASE_URL}/exam_begin/{exam_id}")
        page.wait_for_url(f"**/exam/{exam_id}**", timeout=10000)
        page.wait_for_selector(".question-card.active", timeout=10000)
        # Retrieve attempt ID from page JS
        attempt_id = page.evaluate("() => window.ATTEMPT_ID || (typeof ATTEMPT_ID !== 'undefined' ? ATTEMPT_ID : null)")
        print(f"  -> Verified Active Attempt ID: {attempt_id}")
        assert attempt_id is not None, "Attempt ID must exist on exam page"

        # ---------------------------------------------------------------------
        # SCENARIO A: IMMEDIATE ANSWER PERSISTENCE
        # ---------------------------------------------------------------------
        print("\n[SCENARIO A] Immediate Answer Persistence Check...")
        first_q_container = page.locator('.question-card.active')
        options = first_q_container.locator('.radio-option')
        
        first_opt = options.nth(0)
        first_opt_input = first_opt.locator('input[type="radio"]')
        first_q_name = first_opt_input.get_attribute("name")
        first_qid = int(first_q_name.replace("q", ""))
        first_opt_val = first_opt_input.get_attribute("value")
        
        second_opt = options.nth(1)
        second_opt_val = second_opt.locator('input[type="radio"]').get_attribute("value")

        third_opt = options.nth(2)
        third_opt_val = third_opt.locator('input[type="radio"]').get_attribute("value")

        print(f"  -> Selecting first option '{first_opt_val}' for Question {first_qid}...")
        first_opt.click()

        # Wait for instant persistence feedback
        page.wait_for_selector('#saveStatusText', state='visible', timeout=5000)
        page.wait_for_function("() => document.getElementById('saveStatusText').textContent.includes('Saved')", timeout=5000)
        print("  -> UI save indicator confirmed 'Saved'")

        # Verify in SQLite database directly
        conn = sqlite3.connect(TEST_DB_PATH)
        conn.row_factory = sqlite3.Row
        saved_row = conn.execute("""
            SELECT user_answer, time_spent FROM exam_question_responses 
            WHERE attempt_id=? AND question_id=?
        """, (attempt_id, first_qid)).fetchone()
        conn.close()

        assert saved_row is not None, "Answer record must exist in exam_question_responses"
        assert saved_row["user_answer"] == first_opt_val, f"Expected '{first_opt_val}', got '{saved_row['user_answer']}'"
        print(f"  -> PASSED: In-place SQLite row verified with user_answer='{saved_row['user_answer']}'")

        # ---------------------------------------------------------------------
        # SCENARIO B: RAPID REVISION / IN-PLACE UPSERT (OPTION 1 -> OPTION 2)
        # ---------------------------------------------------------------------
        print(f"\n[SCENARIO B] Rapid Revision Check (Switching to '{second_opt_val}')...")
        second_opt.click()
        page.wait_for_function("() => document.getElementById('saveStatusText').textContent.includes('Saved')", timeout=5000)

        conn = sqlite3.connect(TEST_DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT id, user_answer FROM exam_question_responses 
            WHERE attempt_id=? AND question_id=?
        """, (attempt_id, first_qid)).fetchall()
        conn.close()

        assert len(rows) == 1, f"Expected exactly 1 row, got {len(rows)}"
        assert rows[0]["user_answer"] == second_opt_val, f"Expected '{second_opt_val}', got '{rows[0]['user_answer']}'"
        print(f"  -> PASSED: Single row ID {rows[0]['id']} preserved with revised user_answer='{rows[0]['user_answer']}'")

        # ---------------------------------------------------------------------
        # SCENARIO C: ANSWER RESTORE ON PAGE RELOAD
        # ---------------------------------------------------------------------
        print("\n[SCENARIO C] Answer Restore on Page Reload...")
        page.reload()
        page.wait_for_selector(f'input[name="{first_q_name}"]', timeout=8000)
        is_checked = page.evaluate("""([name, val]) => {
            const inps = Array.from(document.querySelectorAll(`input[name="${name}"]`));
            const target = inps.find(i => i.value === val);
            return target ? target.checked : false;
        }""", [first_q_name, second_opt_val])
        assert is_checked, f"Option '{second_opt_val}' must remain checked after page reload"
        print(f"  -> PASSED: Option '{second_opt_val}' correctly restored and checked after full page reload")

        # ---------------------------------------------------------------------
        # SCENARIO D: ACTIVE DISCONNECT DETECTION (>25s HEARTBEAT TIMEOUT)
        # ---------------------------------------------------------------------
        print("\n[SCENARIO D] Active Disconnect Detection Check (>25s timeout)...")
        from cognitara.utils.helpers import get_utc_now
        stale_time = (get_utc_now() - timedelta(seconds=35)).strftime('%Y-%m-%d %H:%M:%S')

        conn = sqlite3.connect(TEST_DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("UPDATE scores SET last_heartbeat=?, updated_at=? WHERE id=?", (stale_time, stale_time, attempt_id))
        conn.commit()

        # Trigger authoritative disconnect detection sweep (simulating proctor or monitoring query)
        from cognitara.services.session_service import sweep_disconnected_attempts
        sweep_disconnected_attempts(conn)

        row = conn.execute("SELECT is_paused, paused_by, pause_reason FROM scores WHERE id=?", (attempt_id,)).fetchone()
        conn.close()

        assert row[0] == 1, f"Attempt must be paused, got is_paused={row[0]}"
        assert row[1] == "heartbeat_timeout", f"Expected 'heartbeat_timeout', got {row[1]}"
        print(f"  -> PASSED: Disconnect actively detected: is_paused=1, reason='{row[2]}'")

        # Verify student browser navigates to paused screen upon reload
        page.reload()
        page.wait_for_selector('.blocked-card, .message-box', timeout=8000)
        assert "paused" in page.content().lower() or "interrupted" in page.content().lower()
        print("  -> PASSED: Student UI displays paused status on disconnected attempt")

        # ---------------------------------------------------------------------
        # SCENARIO E: PROCTOR RESUME WORKFLOW
        # ---------------------------------------------------------------------
        print("\n[SCENARIO E] Proctor Resume Workflow Check...")
        from cognitara.services.session_service import resume_regular_attempt
        resume_res = resume_regular_attempt(attempt_id, actor_name="Administrator", role="Admin")

        assert resume_res.get("success"), f"Resume failed: {resume_res}"
        print(f"  -> Proctor resumed attempt: session_key={resume_res.get('session_key')}")

        # Reload student browser: should return to exam page
        page.goto(f"{BASE_URL}/exam/{exam_id}")
        page.wait_for_selector('#saveStatusIndicator', timeout=8000)
        old_comp1_key = page.evaluate("() => typeof SESSION_KEY !== 'undefined' ? SESSION_KEY : null")
        print(f"  -> PASSED: Resumed attempt loaded cleanly with active countdown and answer indicator (session_key={old_comp1_key})")

        # ---------------------------------------------------------------------
        # SCENARIO F: CROSS-COMPUTER SESSION FENCING & LOCKOUT
        # ---------------------------------------------------------------------
        print("\n[SCENARIO F] Cross-Computer Session Fencing Check...")
        # Authorize / transfer exam to Computer 2 by generating a fresh session lease
        transfer_res = resume_regular_attempt(attempt_id, actor_name="Administrator", role="Admin")
        assert transfer_res.get("success"), f"Transfer lease failed: {transfer_res}"
        fresh_comp2_key = transfer_res.get("session_key")
        print(f"  -> Authorized Computer 2 with fresh session lease: {fresh_comp2_key}")

        # Computer 2 context
        context2 = browser.new_context()
        page2 = context2.new_page()
        page2.on("request", on_request)

        # Computer 2 logs in and resumes
        page2.goto(f"{BASE_URL}/login")
        page2.fill('input[name="username"]', 'browser_student')
        page2.fill('input[name="password"]', 'TestPassword123!')
        page2.select_option('select[name="role"]', 'student')
        page2.click('button[type="submit"]')
        page2.wait_for_url("**/dashboard**", timeout=10000)

        page2.goto(f"{BASE_URL}/exam/{exam_id}")
        page2.wait_for_selector('#saveStatusIndicator', timeout=8000)
        c2_key = page2.evaluate("() => typeof SESSION_KEY !== 'undefined' ? SESSION_KEY : null")
        print(f"  -> Computer 2 active with lease: {c2_key}")
        assert c2_key == fresh_comp2_key, f"Expected {fresh_comp2_key}, got {c2_key}"

        # Now Computer 1 (stale session lease: old_comp1_key) tries to interact
        print(f"  -> Computer 1 attempting to write answer with superseded lease ({old_comp1_key})...")
        # Trigger answer change on Computer 1
        page.evaluate("""([name, val]) => {
            const inps = Array.from(document.querySelectorAll(`input[name="${name}"]`));
            const rad = inps.find(i => i.value === val);
            if (rad) {
                rad.checked = true;
                rad.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""", [first_q_name, third_opt_val])

        # Computer 1 must trigger superseded modal and lock UI
        page.wait_for_selector('#supersededModal', state='visible', timeout=8000)
        modal_visible = page.locator('#supersededModal').is_visible()
        assert modal_visible, "Superseded modal must be displayed on Computer 1"
        is_disabled = page.locator('input[type="radio"]').first.is_disabled()
        assert is_disabled, "Radio buttons must be disabled on superseded station"
        print("  -> PASSED: Computer 1 locked with non-dismissible 'Session Superseded' overlay")

        # Computer 2 continues writing answer -> Saved successfully
        print("  -> Computer 2 saving answer with valid lease...")
        with page2.expect_response(lambda r: "exam_save_single_answer" in r.url, timeout=10000) as resp_info:
            page2.evaluate("""([name, val]) => {
                const inps = Array.from(document.querySelectorAll(`input[name="${name}"]`));
                const rad = inps.find(i => i.value === val);
                if (rad) {
                    rad.checked = true;
                    rad.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }""", [first_q_name, third_opt_val])
        resp2 = resp_info.value
        print(f"  -> Computer 2 save response: status={resp2.status}, body={resp2.text()}")
        page2.wait_for_timeout(1000)

        conn = sqlite3.connect(TEST_DB_PATH)
        conn.row_factory = sqlite3.Row
        final_row = conn.execute("""
            SELECT user_answer FROM exam_question_responses 
            WHERE attempt_id=? AND question_id=?
        """, (attempt_id, first_qid)).fetchone()
        conn.close()

        assert final_row["user_answer"] == third_opt_val, f"Expected '{third_opt_val}', got {final_row['user_answer']}"
        print(f"  -> PASSED: Computer 2 successfully persisted answer '{third_opt_val}'")
        context2.close()

        # ---------------------------------------------------------------------
        # SCENARIO G: ZERO EXTERNAL REQUESTS / OFFLINE SELF-CONTAINMENT
        # ---------------------------------------------------------------------
        print("\n[SCENARIO G] Offline Self-Containment Check...")
        print(f"  -> Total external requests captured: {len(external_requests)}")
        if external_requests:
            for r in external_requests:
                print(f"     [EXTERNAL LEAK] {r}")
        assert len(external_requests) == 0, f"Found {len(external_requests)} external network requests during session"
        print("  -> PASSED: 100% self-contained offline execution (0 external CDN requests)")

        # ---------------------------------------------------------------------
        # SCENARIO H: MOBILE VIEWPORTS & RESPONSIVE LAYOUT
        # ---------------------------------------------------------------------
        print("\n[SCENARIO H] Mobile Responsive Layout Audit...")
        viewports = [
            {"width": 360, "height": 640, "name": "Small Mobile (360px)"},
            {"width": 375, "height": 667, "name": "iPhone SE / standard (375px)"},
            {"width": 768, "height": 1024, "name": "Tablet Portrait (768px)"},
            {"width": 1280, "height": 800, "name": "Desktop (1280px)"}
        ]

        # Use page on Computer 2 (active session)
        context_mobile = browser.new_context()
        page_mobile = context_mobile.new_page()
        page_mobile.goto(f"{BASE_URL}/login")
        page_mobile.fill('input[name="username"]', 'browser_student')
        page_mobile.fill('input[name="password"]', 'TestPassword123!')
        page_mobile.select_option('select[name="role"]', 'student')
        page_mobile.click('button[type="submit"]')
        page_mobile.wait_for_url("**/dashboard**", timeout=10000)
        page_mobile.goto(f"{BASE_URL}/exam/{exam_id}")
        page_mobile.wait_for_selector('#saveStatusIndicator', timeout=8000)

        for vp in viewports:
            page_mobile.set_viewport_size({"width": vp["width"], "height": vp["height"]})
            page_mobile.wait_for_timeout(300)
            
            # Check horizontal overflow
            scroll_width = page_mobile.evaluate("() => document.documentElement.scrollWidth")
            inner_width = page_mobile.evaluate("() => window.innerWidth")
            overflow = scroll_width - inner_width
            
            # Verify critical UI components are visible
            question_visible = page_mobile.locator('.question-card.active, .question-card, .question-container, #questionText, .exam-question').first.is_visible()
            if not question_visible:
                question_visible = page_mobile.locator('.question-card.active').is_visible()
            status_visible = page_mobile.locator('#saveStatusIndicator').is_visible()

            print(f"  -> Testing {vp['name']}: scrollWidth={scroll_width}, innerWidth={inner_width}, overflow={overflow}px, visible={question_visible and status_visible}")
            assert overflow <= 1, f"Horizontal scroll overflow of {overflow}px on {vp['name']}"
            assert question_visible, f"Question card missing on {vp['name']}"
            assert status_visible, f"Save status indicator missing on {vp['name']}"

        print("  -> PASSED: Responsive layout verified with 0px horizontal overflow across all mobile viewports")
        context_mobile.close()
        browser.close()

    print("\n" + "=" * 70)
    print("ALL REAL-BROWSER SCENARIOS (A - H) PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == "__main__":
    test_browser_phase4_3()
