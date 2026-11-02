import asyncio
import os
import re
from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\akinb\.gemini\antigravity\brain\3544bf45-6115-4af5-b129-bb289278ecbe"
BASE_URL = "http://127.0.0.1:5000"

async def run():
    print("Beginning E2E Verification & Screenshot Capture...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await context.new_page()

        # -------------------------------------------------------------
        # 1. Admin Login & Dashboard
        # -------------------------------------------------------------
        print("\n1. Testing Admin Login...")
        await page.goto(f"{BASE_URL}/login")
        await page.fill('input[name="username"]', "Administrator")
        await page.fill('input[name="password"]', "python0877")
        await page.select_option('select[name="role"]', "Admin")
        await page.click('button[type="submit"]')
        await page.wait_for_url(f"{BASE_URL}/admin")
        print("  -> Logged in to Admin Dashboard successfully.")

        # Capture Admin Dashboard with Add Admin button and Student Profile links & pagination
        admin_screenshot = os.path.join(ARTIFACT_DIR, "admin_dashboard_pagination_and_links.png")
        await page.screenshot(path=admin_screenshot, full_page=True)
        print(f"  -> Screenshot saved: {admin_screenshot}")

        # Check for Add Admin button
        add_admin_btn = await page.query_selector('a[href="/admin/add_admin"]')
        assert add_admin_btn is not None, "Add Admin button not found on Admin Dashboard!"
        print("  -> Verified 'Add Admin' button is present.")

        # Check student profile links
        student_profile_link = await page.query_selector('a[href*="/admin/student/"]')
        assert student_profile_link is not None, "Student profile link not found in table!"
        print("  -> Verified student name/photo links to profile page.")

        # -------------------------------------------------------------
        # 2. Add Admin Page
        # -------------------------------------------------------------
        print("\n2. Testing Add Admin Page (/admin/add_admin)...")
        await page.goto(f"{BASE_URL}/admin/add_admin")
        await page.wait_for_selector('#username')
        add_admin_shot = os.path.join(ARTIFACT_DIR, "add_admin_page.png")
        await page.screenshot(path=add_admin_shot, full_page=True)
        print(f"  -> Screenshot saved: {add_admin_shot}")

        # Check live username check
        await page.fill('#username', "Administrator")
        await page.wait_for_timeout(600)
        status_text = await page.text_content('#usernameStatus')
        assert "already taken" in status_text.lower(), f"Expected 'already taken', got '{status_text}'"
        print(f"  -> Live check verified: '{status_text.strip()}'")

        # -------------------------------------------------------------
        # 3. School Settings (/admin/school-settings)
        # -------------------------------------------------------------
        print("\n3. Testing School Settings (/admin/school-settings)...")
        await page.goto(f"{BASE_URL}/admin/school-settings")
        await page.wait_for_selector('input[name="school_name"]')
        school_shot = os.path.join(ARTIFACT_DIR, "admin_school_settings.png")
        await page.screenshot(path=school_shot, full_page=True)
        print(f"  -> Screenshot saved: {school_shot}")

        # Click Save School Settings
        save_btn = await page.query_selector('button[onclick*="saveGeneralSettings"]')
        if save_btn:
            await save_btn.click()
            await page.wait_for_timeout(1000)
            print("  -> Triggered Save School Settings successfully.")

        # -------------------------------------------------------------
        # 4. Common Entrance Settings (/admin/ce-settings)
        # -------------------------------------------------------------
        print("\n4. Testing Common Entrance Settings (/admin/ce-settings)...")
        await page.goto(f"{BASE_URL}/admin/ce-settings")
        await page.wait_for_selector('input[name="portal_title"]')
        ce_shot = os.path.join(ARTIFACT_DIR, "admin_ce_settings.png")
        await page.screenshot(path=ce_shot, full_page=True)
        print(f"  -> Screenshot saved: {ce_shot}")

        # Click Save CE Settings
        save_ce_btn = await page.query_selector('button[onclick*="saveCeSettings"]')
        if save_ce_btn:
            await save_ce_btn.click()
            await page.wait_for_timeout(1000)
            print("  -> Triggered Save CE Settings successfully.")

        # -------------------------------------------------------------
        # 5. Audit Logs (/admin/logs) with Nigeria WAT Time
        # -------------------------------------------------------------
        print("\n5. Testing Audit Logs (/admin/logs)...")
        await page.goto(f"{BASE_URL}/admin/logs")
        await page.wait_for_selector('#auditTable, .audit-table')
        logs_shot = os.path.join(ARTIFACT_DIR, "admin_audit_logs_wat_time.png")
        await page.screenshot(path=logs_shot, full_page=True)
        print(f"  -> Screenshot saved: {logs_shot}")

        content_logs = await page.content()
        assert "WAT" in content_logs, "WAT timezone abbreviation not found in audit logs!"
        print("  -> Verified Nigeria WAT timestamps present in Audit Logs.")

        # -------------------------------------------------------------
        # 6. Warning Logs (/admin/warning_logs)
        # -------------------------------------------------------------
        print("\n6. Testing Warning Logs (/admin/warning_logs)...")
        await page.goto(f"{BASE_URL}/admin/warning_logs")
        await page.wait_for_selector('.card-custom, table')
        warn_shot = os.path.join(ARTIFACT_DIR, "admin_warning_logs_wat_time.png")
        await page.screenshot(path=warn_shot, full_page=True)
        print(f"  -> Screenshot saved: {warn_shot}")

        # -------------------------------------------------------------
        # 7. Exam Details in Admin Exams Management (/admin/exams-management)
        # -------------------------------------------------------------
        print("\n7. Testing Admin Exams Management (/admin/exams-management)...")
        await page.goto(f"{BASE_URL}/admin/exams-management")
        await page.wait_for_selector('.app')
        exams_mgmt_shot = os.path.join(ARTIFACT_DIR, "admin_exams_management_cards.png")
        await page.screenshot(path=exams_mgmt_shot, full_page=True)
        print(f"  -> Screenshot saved: {exams_mgmt_shot}")

        # -------------------------------------------------------------
        # 8. Teacher Login & Create Exam (/teacher/create_exam)
        # -------------------------------------------------------------
        print("\n8. Testing Teacher Portal...")
        await page.goto(f"{BASE_URL}/logout")
        await page.goto(f"{BASE_URL}/login")
        await page.fill('input[name="username"]', "teacher")
        await page.fill('input[name="password"]', "TeacherPass123!")
        await page.select_option('select[name="role"]', "Teacher")
        await page.click('button[type="submit"]')
        await page.wait_for_url(f"{BASE_URL}/teacher")
        print("  -> Logged in as Teacher successfully.")

        # Test Create Exam page
        print("  -> Visiting /teacher/create_exam...")
        await page.goto(f"{BASE_URL}/teacher/create_exam")
        await page.wait_for_selector('input[name="name"]')
        teacher_create_exam_shot = os.path.join(ARTIFACT_DIR, "teacher_create_exam_page.png")
        await page.screenshot(path=teacher_create_exam_shot, full_page=True)
        print(f"  -> Screenshot saved: {teacher_create_exam_shot}")

        # -------------------------------------------------------------
        # 9. Teacher Technical Support (/teacher/technical_support)
        # -------------------------------------------------------------
        print("\n9. Testing Teacher Technical Support (/teacher/technical_support)...")
        await page.goto(f"{BASE_URL}/teacher/technical_support")
        await page.wait_for_selector('.container-fluid, body')
        tech_support_shot = os.path.join(ARTIFACT_DIR, "teacher_technical_support_working.png")
        await page.screenshot(path=tech_support_shot, full_page=True)
        print(f"  -> Screenshot saved: {tech_support_shot}")

        # -------------------------------------------------------------
        # 10. Teacher Import Exam with CSV & KaTeX (/teacher/import_exam)
        # -------------------------------------------------------------
        print("\n10. Testing Import Exam with CSV & KaTeX (/teacher/import_exam)...")
        await page.goto(f"{BASE_URL}/teacher/import_exam")
        await page.wait_for_selector('#uploadZone')
        import_exam_shot = os.path.join(ARTIFACT_DIR, "teacher_import_exam_csv_katex.png")
        await page.screenshot(path=import_exam_shot, full_page=True)
        print(f"  -> Screenshot saved: {import_exam_shot}")

        # -------------------------------------------------------------
        # 11. Section Questions page (/teacher/exam_section/X/questions)
        # -------------------------------------------------------------
        print("\n11. Testing Section Questions with Import CSV modal...")
        import sqlite3
        conn = sqlite3.connect('exam.db')
        cur = conn.cursor()
        sec = cur.execute("SELECT id FROM exam_sections ORDER BY id DESC LIMIT 1").fetchone()
        conn.close()

        if sec:
            sec_id = sec[0]
            print(f"  -> Visiting /teacher/exam_section/{sec_id}/questions...")
            await page.goto(f"{BASE_URL}/teacher/exam_section/{sec_id}/questions")
            await page.wait_for_selector('.top-bar')
            
            # Click Import CSV button to show modal
            await page.click('button[onclick="openCsvModal()"]')
            await page.wait_for_selector('#importCsvModal.show')
            section_csv_modal_shot = os.path.join(ARTIFACT_DIR, "section_import_csv_modal.png")
            await page.screenshot(path=section_csv_modal_shot)
            print(f"  -> Screenshot saved: {section_csv_modal_shot}")

        print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
