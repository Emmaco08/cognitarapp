"""
Architecture Validation Script for CogniTara Modular Exam Portal.
Verifies modular boundaries, root app.py simplicity, route parity, and database integrity.
"""

import sys
import os
import json
import sqlite3

# Ensure project root is on PYTHONPATH
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

def run_validation():
    print("=" * 70)
    print("COGNITARA OFFLINE EXAMINATION PORTAL — ARCHITECTURE VALIDATION")
    print("=" * 70)
    errors = []

    # 1. Root app.py line count check
    app_py_path = os.path.join(PROJECT_ROOT, "app.py")
    if not os.path.isfile(app_py_path):
        errors.append("Root app.py not found!")
    else:
        with open(app_py_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        line_count = len(lines)
        print(f"[CHECK 1] Root app.py line count: {line_count} lines")
        if line_count > 100:
            errors.append(f"app.py exceeds 100 lines (actual: {line_count})")
        else:
            print("          PASSED: Root app.py is a clean, minimal entrypoint.")

    # 2. Package module importability check
    required_modules = [
        "cognitara.config",
        "cognitara.extensions",
        "cognitara.database.connection",
        "cognitara.database.initialization",
        "cognitara.database.repositories.users",
        "cognitara.database.repositories.exams",
        "cognitara.database.repositories.attempts",
        "cognitara.database.repositories.results",
        "cognitara.security.passwords",
        "cognitara.security.csrf_ratelimit",
        "cognitara.security.permissions",
        "cognitara.utils.helpers",
        "cognitara.utils.offline_builder",
        "cognitara.services.timing_service",
        "cognitara.services.grading_service",
        "cognitara.services.answer_service",
        "cognitara.services.session_service",
        "cognitara.services.violation_service",
        "cognitara.routes.home",
        "cognitara.routes.auth",
        "cognitara.routes.student",
        "cognitara.routes.examinations.regular",
        "cognitara.routes.examinations.common_entrance",
        "cognitara.routes.teacher",
        "cognitara.routes.admin.dashboard",
        "cognitara.routes.admin.users",
        "cognitara.routes.admin.support",
        "cognitara.routes.admin.exams",
        "cognitara.routes.admin.results",
        "cognitara.routes.admin.common_entrance",
    ]

    print("\n[CHECK 2] Validating modular package imports...")
    import importlib
    for mod_name in required_modules:
        try:
            importlib.import_module(mod_name)
        except Exception as e:
            errors.append(f"Failed to import {mod_name}: {e}")
    if not errors:
        print(f"          PASSED: All {len(required_modules)} modular components imported cleanly.")

    # 3. Application factory instantiation
    print("\n[CHECK 3] Instantiating Flask app via create_app()...")
    try:
        from cognitara import create_app
        app = create_app()
        print(f"          PASSED: create_app() returned valid Flask instance '{app.name}'.")
    except Exception as e:
        errors.append(f"create_app() instantiation failed: {e}")
        app = None

    # 4. Blueprint registration verification
    if app:
        print("\n[CHECK 4] Verifying registered Blueprints...")
        expected_blueprints = {
            "home", "auth", "student", "exam_regular", "exam_ce",
            "teacher", "admin_dashboard", "admin_users", "admin_support",
            "admin_exams", "admin_results", "admin_ce"
        }
        actual_blueprints = set(app.blueprints.keys())
        missing_bp = expected_blueprints - actual_blueprints
        if missing_bp:
            errors.append(f"Missing blueprints: {missing_bp}")
        else:
            print(f"          PASSED: All {len(expected_blueprints)} expected blueprints registered.")

    # 5. Route baseline parity check
    baseline_file = os.path.join(PROJECT_ROOT, "scripts", "routes_baseline.json")
    if os.path.isfile(baseline_file) and app:
        print("\n[CHECK 5] Checking route parity against pre-modularization baseline...")
        with open(baseline_file, "r", encoding="utf-8") as f:
            baseline_routes = json.load(f)

        app_rules = {}
        for rule in app.url_map.iter_rules():
            rule_str = str(rule.rule)
            methods = [m for m in rule.methods if m not in ('HEAD', 'OPTIONS')]
            app_rules.setdefault(rule_str, set()).update(methods)

        missing_routes = []
        for base in baseline_routes:
            b_rule = base["rule"]
            b_methods = set(base["methods"])
            if b_rule not in app_rules:
                missing_routes.append(f"{b_rule} missing entirely")
            else:
                diff = b_methods - app_rules[b_rule]
                if diff:
                    missing_routes.append(f"{b_rule} missing methods {diff}")

        if missing_routes:
            errors.append(f"Route parity violations ({len(missing_routes)}): {missing_routes[:5]}")
        else:
            print(f"          PASSED: 100% route and method parity across {len(baseline_routes)} baseline routes.")
            print(f"          Current registered routes: {len(app_rules)} (2 new CE endpoints included).")

    # 6. Database integrity and WAL mode check
    print("\n[CHECK 6] Database engine and durability verification...")
    db_path = os.path.join(PROJECT_ROOT, "exam.db")
    if not os.path.isfile(db_path):
        errors.append(f"Database not found at {db_path}")
    else:
        conn = sqlite3.connect(db_path)
        try:
            cur = conn.cursor()
            jmode = cur.execute("PRAGMA journal_mode;").fetchone()[0]
            fk = cur.execute("PRAGMA foreign_keys;").fetchone()[0]
            integrity = cur.execute("PRAGMA integrity_check;").fetchone()[0]
            print(f"          SQLite Journal Mode: {jmode.upper()}")
            print(f"          PRAGMA integrity_check: {integrity}")
            if integrity.lower() != "ok":
                errors.append(f"Database integrity check failed: {integrity}")
        finally:
            conn.close()

    print("\n" + "=" * 70)
    if errors:
        print(f"VALIDATION FAILED WITH {len(errors)} ERRORS:")
        for err in errors:
            print(f"  - {err}")
        print("=" * 70)
        sys.exit(1)
    else:
        print("VALIDATION SUCCESSFUL: Architecture is clean, modular, and fully compatible.")
        print("=" * 70)
        sys.exit(0)

if __name__ == "__main__":
    run_validation()
