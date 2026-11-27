# CogniTara Examination Portal - Developer & Contributor Guide

Welcome to the CogniTara developer guide. This guide explains how to develop, test, extend, and deploy the CogniTara modular offline examination portal.

---

## 1. Environment & Prerequisites

- **Operating System:** Windows, Linux, or macOS
- **Python Version:** Python 3.10 or higher (Python 3.11-3.14 tested)
- **Database:** SQLite 3 (included with standard Python runtime)
- **Dependencies:**
  - `Flask`
  - `Flask-WTF`
  - `Flask-Limiter`
  - `Werkzeug`
  - `Waitress` (for production Windows deployment)

Install required dependencies:
```bash
pip install flask flask-wtf flask-limiter werkzeug waitress
```

---

## 2. Running the Application

### Development Server
Run directly using the root entrypoint:
```bash
python app.py
```
Or using the Flask CLI:
```bash
flask --app app run --port 5000 --debug
```

### Production Deployment (Waitress)
For intranet examination centers, run Waitress via `wsgi.py`:
```bash
python wsgi.py
```
Waitress binds to `http://0.0.0.0:5000` with 8 worker threads and production header handling.

---

## 3. Running Automated Tests & Validation

Always run the full suite before committing or deploying changes.

### 1. Architectural Integrity Validation
Verifies package imports, root `app.py` simplicity, registered Blueprints, and 100% route baseline parity:
```bash
python scripts/validate_architecture.py
```

### 2. Core Modular Architecture & Server-Authoritative Persistence Suite
Executes 13 comprehensive tests covering application factory, WSGI, WAL pragmas, instant UPSERT answer persistence, session fencing, monotonic violations, and authoritative deadline enforcement:
```bash
python -m unittest -v tests/test_modular_architecture_and_persistence.py
```

### 3. Historical Phase 4.1 & 4.2 Security Regression Suites
Verifies CSRF token extraction from JSON/beacon, rate limiting (5 failed attempts lock), and idempotency:
```bash
python scratch/test_phase4_1_remediation.py
python scratch/test_phase4_2_verification.py
```

### 4. Database Integrity Check
```bash
python -c "import sqlite3; conn = sqlite3.connect('exam.db'); print(conn.execute('PRAGMA integrity_check;').fetchall()); conn.close()"
```

---

## 4. How to Extend the Application

### Adding a New Route
1. Identify the domain of your route:
   - Public / general: `cognitara/routes/home.py`
   - Authentication: `cognitara/routes/auth.py`
   - Student portal: `cognitara/routes/student.py`
   - Regular Exam runtime: `cognitara/routes/examinations/regular.py`
   - Common Entrance runtime: `cognitara/routes/examinations/common_entrance.py`
   - Teacher portal: `cognitara/routes/teacher.py`
   - Admin features: `cognitara/routes/admin/<dashboard|users|support|exams|results|common_entrance>.py`
2. Define the route on the appropriate Blueprint:
   ```python
   @admin_exams_bp.route("/admin/exam/new_feature", methods=["GET", "POST"])
   @admin_required
   def new_feature_handler():
       ...
   ```
3. Use `url_for('endpoint_name')` in templates. The global `handle_build_error` in `cognitara/__init__.py` ensures both prefixed (`admin_exams.new_feature_handler`) and un-prefixed (`new_feature_handler`) calls resolve cleanly.

### Adding a Business Service
Place domain logic in `cognitara/services/`:
- Never put raw database transactions directly inside templates or large route functions.
- Keep services pure and stateless, accepting database connections or IDs as arguments.
- Always commit immediately after state transitions in SQLite WAL mode.

### Adding a Database Query / Repository
Place reusable SQL queries in `cognitara/database/repositories/`:
- `users.py`: User lookup, password checks, student metadata.
- `exams.py`: Exam structures, questions, sections, group passages.
- `attempts.py`: Attempt retrieval, status updates, progress calculation.
- `results.py`: Score aggregation, class averages, grade distributions.

---

## 5. Critical Development Rules

1. **Keep Engines Decoupled:**
   Never merge tables or code between Regular Examination (`scores`, `questions`, `exams`) and Common Entrance (`ce_attempts`, `ce_questions`, `ce_exams`). They have distinct lifecycle semantics.
2. **Server-Authoritative Authority:**
   Never accept timer values, remaining seconds, or violation counts submitted directly by client JavaScript. The server calculates remaining time against `authoritative_deadline` and increments violations monotonically.
3. **Session Fencing:**
   All state-changing student endpoints (`/exam_save_single_answer`, `/ce_save_single_answer`, heartbeats) must validate `request.json.get("session_key") == attempt["session_key"]`. If mismatched, respond with HTTP 403 `{"superseded": true}`.
4. **No Destructive Startup Operations:**
   Never add `DELETE` or table restructuring commands to `ensure_deadline_columns` or application startup hooks.
5. **Image Upload Policies:**
   Do not compress or enforce arbitrary 500KB client-side limits on question or profile images. Allow standard web images at full clarity.
