#!/usr/bin/env python3
"""
CogniTara web redesign — Playwright screenshot harness.

Captures full-page screenshots of portal pages in BOTH dark and light themes
for every role, and logs console errors / page errors / failed requests.

Requires a running server (default http://127.0.0.1:5000):
    python3 init_db.py         # fresh workspace only
    python3 app.py             # in another terminal

Usage examples:
    python3 scripts/capture_web_redesign.py --out /tmp/shots
    python3 scripts/capture_web_redesign.py --out /tmp/shots --only login,admin,dashboard
    python3 scripts/capture_web_redesign.py --out /tmp/shots --roles admin --themes light
    python3 scripts/capture_web_redesign.py --out /tmp/shots --mobile          # adds 390px captures
    python3 scripts/capture_web_redesign.py --seed --list                      # seed demo data, list routes
    python3 scripts/capture_web_redesign.py --out /tmp/shots --url /admin#sec-exams:admin

Extending: add entries to ROUTES below as (path, role, name).  Paths may use
placeholders resolved from exam.db: {exam_id}, {student_id}, {teacher_id},
{ce_exam_id}, {class_name}, {section_id}.  Routes whose placeholder cannot be
resolved are skipped with a note.

Notes
  * By default captures run with prefers-reduced-motion=reduce so reveal /
    count-up animations settle instantly and screenshots are deterministic.
    Pass --motion to capture with full motion (adds a settle delay).
  * The theme is forced through localStorage["ct-theme"] (init script) AND the
    ?theme= query parameter, which every redesigned page honours.
  * State-changing GET routes (logout, toggle, delete, reset, approve, ...)
    are intentionally NOT listed.
  * --seed inserts a small, idempotent demo dataset into exam.db (approved
    student, exams, scores, a CE exam, extra teachers/students) so pages have
    realistic content.  exam.db is git-ignored.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_DB = os.path.join(PROJECT_ROOT, "exam.db")

CREDENTIALS = {
    "admin": {"username": "Administrator", "password": "python0877", "role": "Admin"},
    "teacher": {"username": "teacher1", "password": "teach123", "role": "Teacher"},
    "student": {"username": "student1", "password": "pass123", "role": "student"},
}

# (path, role, name).  role: public | admin | teacher | student
ROUTES: list[tuple[str, str, str]] = [
    # ---------- Public ----------
    ("/login", "public", "login"),
    ("/login?role=Admin", "public", "login-admin-role"),
    ("/register", "public", "register"),
    ("/ce_login", "public", "ce-login"),
    # ---------- Admin ----------
    ("/admin", "admin", "admin"),
    ("/admin#sec-exams", "admin", "admin-sec-exams"),
    ("/admin/add_admin", "admin", "admin-add-admin"),
    ("/admin/add_exam", "admin", "admin-add-exam"),
    ("/admin/add_student", "admin", "admin-add-student"),
    ("/admin/add_teacher", "admin", "admin-add-teacher"),
    ("/admin/pending_students", "admin", "admin-pending-students"),
    ("/admin/exams-management", "admin", "admin-exams-management"),
    ("/admin/exam_attempts", "admin", "admin-exam-attempts"),
    ("/admin/exam_technical_support", "admin", "admin-technical-support"),
    ("/admin/logs", "admin", "admin-logs"),
    ("/admin/warning_logs", "admin", "admin-warning-logs"),
    ("/admin/results", "admin", "admin-results"),
    ("/admin/school-analytics", "admin", "admin-school-analytics"),
    ("/admin/school-settings", "admin", "admin-school-settings"),
    ("/admin/ce-settings", "admin", "admin-ce-settings"),
    ("/admin/common-entrance", "admin", "admin-common-entrance"),
    ("/admin/ce_exam/create", "admin", "admin-ce-exam-create"),
    ("/admin/ce_active_exams", "admin", "admin-ce-active-exams"),
    ("/admin/ce_technical_support", "admin", "admin-ce-technical-support"),
    ("/admin/add_question/{exam_id}", "admin", "admin-add-question"),
    ("/edit_exam/{exam_id}", "admin", "admin-edit-exam"),
    ("/admin/exam/{exam_id}/details", "admin", "admin-exam-details"),
    ("/admin/exam/{exam_id}/preview", "admin", "admin-exam-preview"),
    ("/admin/exam/{exam_id}/test-run", "admin", "admin-exam-test-run"),
    ("/admin/edit_student/{student_id}", "admin", "admin-edit-student"),
    ("/admin/edit_teacher/{teacher_id}", "admin", "admin-edit-teacher"),
    ("/admin/student/{student_id}", "admin", "admin-student-profile"),
    ("/admin/student/{student_id}/exam/{exam_id}", "admin", "admin-student-exam-detail"),
    ("/admin/class/{class_name}/analytics", "admin", "admin-class-analytics"),
    ("/admin/ce_exam/{ce_exam_id}/settings", "admin", "admin-ce-exam-settings"),
    ("/admin/ce_analytics/{ce_exam_id}", "admin", "admin-ce-analytics"),
    # ---------- Teacher ----------
    ("/teacher", "teacher", "teacher"),
    ("/teacher/add_exam", "teacher", "teacher-add-exam"),
    ("/teacher/create_exam", "teacher", "teacher-create-exam"),
    ("/teacher/analytics", "teacher", "teacher-analytics"),
    ("/teacher/import_exam", "teacher", "teacher-import-exam"),
    ("/teacher/progression", "teacher", "teacher-progression"),
    ("/teacher/technical_support", "teacher", "teacher-technical-support"),
    ("/teacher/exam/{exam_id}/settings", "teacher", "teacher-exam-settings"),
    ("/teacher/exam/{exam_id}/analytics", "teacher", "teacher-exam-analytics"),
    ("/teacher/results/{exam_id}", "teacher", "teacher-results"),
    ("/teacher/student/{student_id}", "teacher", "teacher-student-profile"),
    ("/teacher/student/{student_id}/exam/{exam_id}", "teacher", "teacher-student-exam-detail"),
    # ---------- Student ----------
    ("/dashboard", "student", "dashboard"),
    ("/result/{exam_id}", "student", "student-result"),
]

# Routes that render the live exam engine (they create/advance attempts). Opt-in only.
EXAM_ENGINE_ROUTES: list[tuple[str, str, str]] = [
    ("/exam/{exam_id}", "student", "student-exam"),
]

ROLE_ORDER = ["public", "admin", "teacher", "student"]


# ---------------------------------------------------------------------------
# Sample-ID resolution & demo seeding
# ---------------------------------------------------------------------------
def _one(conn, sql, args=()):
    try:
        row = conn.execute(sql, args).fetchone()
        return row[0] if row else None
    except sqlite3.Error:
        return None


def resolve_params(db_path: str) -> dict:
    params: dict = {}
    if not os.path.isfile(db_path):
        return params
    conn = sqlite3.connect(db_path)
    try:
        params["exam_id"] = _one(conn, "SELECT exam_id FROM scores WHERE status='completed' ORDER BY id LIMIT 1") or _one(conn, "SELECT id FROM exams ORDER BY id LIMIT 1")
        params["student_id"] = _one(conn, "SELECT id FROM students WHERE username='student1'") or _one(conn, "SELECT id FROM students ORDER BY id LIMIT 1")
        params["teacher_id"] = _one(conn, "SELECT id FROM teachers ORDER BY id LIMIT 1")
        params["ce_exam_id"] = _one(conn, "SELECT id FROM ce_exams ORDER BY id LIMIT 1")
        params["class_name"] = _one(conn, "SELECT class FROM students WHERE class IS NOT NULL ORDER BY id LIMIT 1")
        params["section_id"] = _one(conn, "SELECT id FROM exam_sections ORDER BY id LIMIT 1")
    finally:
        conn.close()
    return {k: v for k, v in params.items() if v is not None}


def seed_demo_data(db_path: str) -> None:
    """Idempotently add realistic demo content so pages are not empty."""
    if not os.path.isfile(db_path):
        print(f"[seed] {db_path} not found — run `python3 init_db.py` first.")
        return
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    now = datetime.now()

    def cols(table):
        try:
            return {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
        except sqlite3.Error:
            return set()

    student_cols = cols("students")
    # Approve the sample student and give them a name
    sets = []
    if "status" in student_cols:
        sets.append("status='approved'")
    if "full_name" in student_cols:
        sets.append("full_name=COALESCE(full_name,'Ada Okafor')")
    if sets:
        c.execute(f"UPDATE students SET {', '.join(sets)} WHERE username='student1'")

    extra_students = [
        ("chidi.n", "Chidi Nwosu", "Grade 1"),
        ("amara.b", "Amara Bello", "Grade 1"),
        ("tunde.a", "Tunde Adeyemi", "Grade 2"),
        ("zainab.u", "Zainab Usman", "Grade 2"),
        ("ifeoma.e", "Ifeoma Eze", "Grade 1"),
    ]
    for uname, full, klass in extra_students:
        if _one(conn, "SELECT id FROM students WHERE username=?", (uname,)) is None:
            fields = ["username", "password", "class", "photo"]
            vals = [uname, "pass123", klass, "default.png"]
            if "status" in student_cols:
                fields.append("status"); vals.append("approved")
            if "full_name" in student_cols:
                fields.append("full_name"); vals.append(full)
            c.execute(f"INSERT INTO students ({', '.join(fields)}) VALUES ({', '.join('?' * len(vals))})", vals)
    # One pending registration so approvals UI has content
    if _one(conn, "SELECT id FROM students WHERE username='pending.k'") is None:
        fields = ["username", "password", "class", "photo"]
        vals = ["pending.k", "pass123", "Grade 2", "default.png"]
        if "status" in student_cols:
            fields.append("status"); vals.append("pending")
        if "full_name" in student_cols:
            fields.append("full_name"); vals.append("Kemi Lawal")
        c.execute(f"INSERT INTO students ({', '.join(fields)}) VALUES ({', '.join('?' * len(vals))})", vals)

    for uname, klass in [("mrs.adebayo", "Grade 2"), ("mr.okeke", "Grade 3")]:
        if _one(conn, "SELECT id FROM teachers WHERE username=?", (uname,)) is None:
            c.execute("INSERT INTO teachers (username, password, class, photo) VALUES (?,?,?,?)", (uname, "teach123", klass, "default.png"))

    exam_cols = cols("exams")
    teacher_id = _one(conn, "SELECT id FROM teachers WHERE username='teacher1'") or 1
    demo_exams = [
        ("Mathematics — First Term Test", "Grade 1", 45, 1, "Mathematics", "General"),
        ("English Language — Comprehension", "Grade 1", 40, 1, "English", "General"),
        ("Basic Science — Mid-Term", "Grade 1", 30, 1, "Basic Science", "Science"),
        ("Civic Education — Quiz", "Grade 1", 20, 0, "Civic Education", "General"),
        ("Agricultural Science — Practical", "Grade 2", 35, 1, "Agric", "Science"),
    ]
    exam_ids = {}
    for name, klass, dur, active, subj, spec in demo_exams:
        eid = _one(conn, "SELECT id FROM exams WHERE name=?", (name,))
        if eid is None:
            data = {"name": name, "class": klass, "duration": dur, "active": active, "teacher_id": teacher_id}
            if "subject_tag" in exam_cols: data["subject_tag"] = subj
            if "specialisation_tag" in exam_cols: data["specialisation_tag"] = spec
            if "deactivated" in exam_cols: data["deactivated"] = 0
            c.execute(f"INSERT INTO exams ({', '.join(data)}) VALUES ({', '.join('?' * len(data))})", list(data.values()))
            eid = c.lastrowid
            q_cols = cols("questions")
            for i in range(1, 6):
                qd = {"exam_id": eid, "question": f"Sample question {i} for {subj}?", "option1": "Option A", "option2": "Option B", "option3": "Option C", "option4": "Option D", "answer": "Option A"}
                qd = {k: v for k, v in qd.items() if k in q_cols}
                c.execute(f"INSERT INTO questions ({', '.join(qd)}) VALUES ({', '.join('?' * len(qd))})", list(qd.values()))
        exam_ids[name] = eid

    # Completed scores for student1 on the Basic Science + Civic exams
    sid = _one(conn, "SELECT id FROM students WHERE username='student1'")
    score_cols = cols("scores")
    if sid:
        for name, score in [("Basic Science — Mid-Term", 4), ("Civic Education — Quiz", 5)]:
            eid = exam_ids.get(name)
            if eid and _one(conn, "SELECT id FROM scores WHERE student_id=? AND exam_id=?", (sid, eid)) is None:
                sd = {"student_id": sid, "exam_id": eid, "score": score, "total": 5, "submitted": 1, "status": "completed",
                      "start_time": (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"),
                      "end_time": (now - timedelta(days=2, minutes=-25)).strftime("%Y-%m-%d %H:%M:%S"),
                      "percentage": round(score / 5 * 100, 1), "results_released": 1}
                sd = {k: v for k, v in sd.items() if k in score_cols}
                c.execute(f"INSERT INTO scores ({', '.join(sd)}) VALUES ({', '.join('?' * len(sd))})", list(sd.values()))
        # Classmates' scores for analytics
        for uname, sc in [("chidi.n", 3), ("amara.b", 5), ("ifeoma.e", 2)]:
            osid = _one(conn, "SELECT id FROM students WHERE username=?", (uname,))
            eid = exam_ids.get("Basic Science — Mid-Term")
            if osid and eid and _one(conn, "SELECT id FROM scores WHERE student_id=? AND exam_id=?", (osid, eid)) is None:
                sd = {"student_id": osid, "exam_id": eid, "score": sc, "total": 5, "submitted": 1, "status": "completed",
                      "start_time": (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"),
                      "percentage": round(sc / 5 * 100, 1), "results_released": 1}
                sd = {k: v for k, v in sd.items() if k in score_cols}
                c.execute(f"INSERT INTO scores ({', '.join(sd)}) VALUES ({', '.join('?' * len(sd))})", list(sd.values()))

    ce_cols = cols("ce_exams")
    if ce_cols and _one(conn, "SELECT id FROM ce_exams WHERE name=?", ("JSS1 Common Entrance 2026",)) is None:
        cd = {"name": "JSS1 Common Entrance 2026", "description": "Entrance examination for incoming JSS1 candidates.",
              "target_class": "JSS1", "duration": 60, "passing_score": 50, "total_questions_to_show": 40, "active": 1}
        cd = {k: v for k, v in cd.items() if k in ce_cols}
        c.execute(f"INSERT INTO ce_exams ({', '.join(cd)}) VALUES ({', '.join('?' * len(cd))})", list(cd.values()))

    conn.commit()
    conn.close()
    print("[seed] demo data ensured in", db_path)


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def fill(path: str, params: dict) -> str | None:
    missing = [m for m in PLACEHOLDER.findall(path) if m not in params]
    if missing:
        return None
    return PLACEHOLDER.sub(lambda m: str(params[m.group(1)]), path)


def with_theme(url: str, theme: str) -> str:
    parts = urlsplit(url)
    q = dict(parse_qsl(parts.query))
    q["theme"] = theme
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))


def safe_name(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", s).strip("-")


def login(context, base: str, role: str, report: list) -> bool:
    if role == "public":
        return True
    cred = CREDENTIALS[role]
    page = context.new_page()
    try:
        page.goto(f"{base}/login?role={cred['role']}", wait_until="domcontentloaded")
        page.fill("#username", cred["username"])
        page.fill("#password", cred["password"])
        page.evaluate("(r) => { const i = document.getElementById('roleInput'); if (i) i.value = r; }", cred["role"])
        with page.expect_navigation(wait_until="domcontentloaded", timeout=15000):
            page.evaluate("() => document.getElementById('loginForm').submit()")
        ok = "/login" not in page.url
        if not ok:
            report.append({"role": role, "error": f"login failed (still on {page.url})"})
            print(f"  ! login failed for {role}: {page.url}")
        return ok
    except Exception as exc:  # pragma: no cover - diagnostic path
        report.append({"role": role, "error": f"login exception: {exc}"})
        print(f"  ! login exception for {role}: {exc}")
        return False
    finally:
        page.close()


def capture(args) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright missing: pip install playwright && python3 -m playwright install chromium")
        return 2

    params = resolve_params(args.db)
    routes = list(ROUTES) + (list(EXAM_ENGINE_ROUTES) if args.include_exam else [])
    for extra in args.url or []:
        path, _, role = extra.rpartition(":") if ":" in extra and not extra.startswith("http") else (extra, "", "public")
        if not path:
            path, role = extra, "public"
        routes.append((path, role or "public", safe_name(path.strip("/") or "root")))

    only = [s.strip() for s in (args.only or "").split(",") if s.strip()]
    roles = [r.strip() for r in (args.roles or ",".join(ROLE_ORDER)).split(",") if r.strip()]
    themes = [t.strip() for t in args.themes.split(",") if t.strip()]
    selected = []
    for path, role, name in routes:
        if role not in roles:
            continue
        if only and not any(o == name or ("/" in o and o in path) for o in only):
            continue
        resolved = fill(path, params)
        if resolved is None:
            print(f"  - skip {path} (unresolved params; available: {sorted(params)})")
            continue
        selected.append((resolved, role, name))

    os.makedirs(args.out, exist_ok=True)
    viewports = [("desktop", {"width": args.width, "height": args.height})]
    if args.mobile:
        viewports.append(("mobile", {"width": 390, "height": 844}))

    report = {"base": args.base, "generated": datetime.now().isoformat(timespec="seconds"), "pages": [], "login": []}
    total_errors = 0

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for role in ROLE_ORDER:
            role_routes = [r for r in selected if r[1] == role]
            if not role_routes:
                continue
            for vp_name, vp in viewports:
                for theme in themes:
                    context = browser.new_context(
                        viewport=vp,
                        device_scale_factor=args.scale,
                        reduced_motion="no-preference" if args.motion else "reduce",
                        color_scheme=theme,
                    )
                    context.add_init_script(f"try{{localStorage.setItem('ct-theme','{theme}')}}catch(e){{}}")
                    if not login(context, args.base, role, report["login"]):
                        context.close()
                        continue
                    for path, _, name in role_routes:
                        page = context.new_page()
                        console_errors, page_errors, failed = [], [], []
                        page.on("console", lambda m, ce=console_errors: ce.append(m.text) if m.type == "error" else None)
                        page.on("pageerror", lambda e, pe=page_errors: pe.append(str(e)))
                        page.on("requestfailed", lambda r, fl=failed: fl.append(f"{r.url} ({r.failure})"))
                        page.on("response", lambda r, fl=failed: fl.append(f"{r.status} {r.url}") if r.status >= 400 else None)
                        url = with_theme(args.base + path, theme)
                        status = None
                        try:
                            resp = page.goto(url, wait_until="networkidle", timeout=args.timeout * 1000)
                            status = resp.status if resp else None
                        except Exception as exc:
                            page_errors.append(f"navigation: {exc}")
                        page.wait_for_timeout(1400 if args.motion else 350)
                        suffix = "" if vp_name == "desktop" else "-mobile"
                        fname = f"{safe_name(name)}{suffix}-{theme}.png"
                        out_path = os.path.join(args.out, fname)
                        try:
                            page.screenshot(path=out_path, full_page=not args.viewport_only)
                        except Exception as exc:
                            page_errors.append(f"screenshot: {exc}")
                        errs = len(console_errors) + len(page_errors)
                        total_errors += errs
                        flag = "OK " if errs == 0 and (status or 0) < 400 else "ERR"
                        print(f"  [{flag}] {role:<7} {theme:<5} {vp_name:<7} {status} {path} -> {fname}")
                        for e in console_errors + page_errors:
                            print(f"        console: {e[:300]}")
                        report["pages"].append({
                            "role": role, "theme": theme, "viewport": vp_name, "path": path, "final_url": page.url,
                            "status": status, "file": out_path, "console_errors": console_errors,
                            "page_errors": page_errors, "failed_requests": failed,
                        })
                        page.close()
                    context.close()
        browser.close()

    with open(os.path.join(args.out, "capture_report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nSaved {len(report['pages'])} screenshots to {args.out} — console/page errors: {total_errors}")
    return 1 if (total_errors and args.strict) else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://127.0.0.1:5000", help="Running server base URL")
    ap.add_argument("--out", default=os.path.join(PROJECT_ROOT, "logs", "web_redesign_shots"), help="Output directory")
    ap.add_argument("--themes", default="dark,light", help="Comma list: dark,light")
    ap.add_argument("--roles", default=None, help="Comma list of roles to include (public,admin,teacher,student)")
    ap.add_argument("--only", default=None, help="Comma list of exact route names, or path substrings containing '/'")
    ap.add_argument("--url", action="append", help="Extra path[:role], e.g. /admin/logs:admin (repeatable)")
    ap.add_argument("--db", default=DEFAULT_DB, help="SQLite DB used to resolve sample IDs")
    ap.add_argument("--seed", action="store_true", help="Seed idempotent demo data into the DB before capturing")
    ap.add_argument("--list", action="store_true", help="List resolved routes and exit")
    ap.add_argument("--mobile", action="store_true", help="Also capture a 390x844 mobile viewport")
    ap.add_argument("--motion", action="store_true", help="Capture with motion enabled (default: reduced motion)")
    ap.add_argument("--include-exam", action="store_true", help="Also capture live exam engine pages (creates attempts)")
    ap.add_argument("--viewport-only", action="store_true", help="Viewport screenshot instead of full page")
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--scale", type=float, default=1.0, help="Device scale factor")
    ap.add_argument("--timeout", type=int, default=25, help="Navigation timeout (seconds)")
    ap.add_argument("--strict", action="store_true", help="Exit 1 if any console/page errors were logged")
    args = ap.parse_args()

    if args.seed:
        seed_demo_data(args.db)
    if args.list:
        params = resolve_params(args.db)
        print("Resolved params:", params)
        for path, role, name in ROUTES + EXAM_ENGINE_ROUTES:
            print(f"  {role:<8} {name:<34} {fill(path, params) or path + '  (unresolved)'}")
        return 0
    return capture(args)


if __name__ == "__main__":
    sys.exit(main())
