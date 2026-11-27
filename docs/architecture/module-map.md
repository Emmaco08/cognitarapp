# CogniTara Examination Portal - Module Map

## 1. Architectural Overview

CogniTara has been refactored from a monolithic ~11,000-line `app.py` into a clean, modular Python application package (`cognitara/`). The application follows a layered architecture separating routing, business logic, persistence, and security concerns.

The root `app.py` is now a minimal 42-line entrypoint that preserves 100% backward compatibility for:
- Direct script execution: `python app.py`
- Flask CLI: `flask run`
- Production WSGI runners: `wsgi.py` (Waitress)
- Legacy test suites expecting root-level exports.

---

## 2. Package Directory Structure

```
c:\COGNITARA EXAM PORTAL\
├── app.py                                   # Minimal root entry point (42 lines)
├── wsgi.py                                  # Production WSGI entry point (Waitress)
├── exam.db                                  # SQLite authoritative database (WAL mode)
│
├── cognitara/                               # Main application package
│   ├── __init__.py                          # Application factory (create_app) & url_for error handler
│   ├── config.py                            # Application configuration (Config class)
│   ├── extensions.py                        # Shared extensions (CSRFProtect, Limiter)
│   │
│   ├── database/                            # Database connection and lifecycle management
│   │   ├── __init__.py                      # Package exports
│   │   ├── connection.py                    # get_db_connection() with WAL & PRAGMA setup
│   │   ├── initialization.py                # ensure_deadline_columns, analytics & management tables
│   │   └── repositories/                    # Repository layer for domain data queries
│   │       ├── __init__.py
│   │       ├── users.py                     # User querying & authentication helpers
│   │       ├── exams.py                     # Exam definitions, sections, and question retrieval
│   │       ├── attempts.py                  # Exam score & attempt record querying
│   │       └── results.py                   # Aggregation, statistics, and reporting queries
│   │
│   ├── security/                            # Security, authentication, and access control
│   │   ├── __init__.py
│   │   ├── passwords.py                     # Password verification & transparent Argon2/PBKDF2 upgrading
│   │   ├── csrf_ratelimit.py                # CSRF body extraction, rate limiter error handlers
│   │   └── permissions.py                   # Role decorators (@admin_required, @teacher_required, @student_required)
│   │
│   ├── utils/                               # Cross-cutting utilities & helpers
│   │   ├── __init__.py
│   │   ├── helpers.py                       # SafeMathEvaluator, sanitize_html, get_utc_now, log_action
│   │   └── offline_builder.py               # generate_offline_builder_html() extracted from monolith
│   │
│   ├── services/                            # Core server-authoritative business services
│   │   ├── __init__.py
│   │   ├── timing_service.py                # Server-authoritative countdown & deadline enforcement
│   │   ├── answer_service.py                # Instant asynchronous answer persistence & UPSERTs
│   │   ├── session_service.py               # Heartbeat processing, cross-computer session lease fencing
│   │   ├── violation_service.py             # Monotonic warning logging & authorized proctor resets
│   │   └── grading_service.py               # Server-authoritative exam submission & score calculation
│   │
│   └── routes/                              # Modular Blueprint route handlers
│       ├── __init__.py                      # Blueprint discovery and registration
│       ├── home.py                          # General public routes (/avatar, /, /api/calculate, /api/stats)
│       ├── auth.py                          # Authentication routes (/login, /logout, /register, /ce_login)
│       ├── student.py                       # Student portal routes (/dashboard, /ce_dashboard, /ce_start)
│       ├── teacher.py                       # Teacher dashboard & exam authoring routes (/teacher/*)
│       ├── examinations/                    # Examination delivery engines (strictly decoupled)
│       │   ├── __init__.py
│       │   ├── regular.py                   # Regular examination delivery & student runtime routes
│       │   └── common_entrance.py           # Common Entrance examination delivery & runtime routes
│       └── admin/                           # Administrative controllers
│           ├── __init__.py
│           ├── dashboard.py                 # Admin dashboard & overview statistics
│           ├── users.py                     # Student, teacher, and administrator account management
│           ├── support.py                   # Technical support, audit logs, and security monitoring
│           ├── exams.py                     # Regular exam management, section builder, version history
│           ├── results.py                   # Analytics, result review, and grade export (Excel/CSV)
│           └── common_entrance.py           # Comprehensive CE exam management, review & settings
│
├── scripts/                                 # Operational & validation scripts
│   ├── routes_baseline.json                 # Pre-modularization route baseline catalog (201 routes)
│   ├── inspect_routes.py                    # Real-time route inspector and method counter
│   ├── validate_architecture.py             # Architectural integrity & boundary verification script
│   └── seed_testing_data.py                 # Multi-role test data generation script
│
├── tests/                                   # Automated test suite
│   ├── test_modular_architecture_and_persistence.py  # 13 tests covering all 7 architectural domains
│   └── ...                                  # Additional regression and unit test files
│
└── docs/                                    # System architecture documentation
    └── architecture/
        ├── module-map.md                    # This document
        ├── route-map.md                     # Endpoint catalog & blueprint mapping
        ├── data-flow.md                     # Lifecycle & sequence diagrams
        ├── database.md                      # Schema, tables, pragmas & backup procedures
        └── development-guide.md             # Developer workflow & extension guide
```

---

## 3. Module Lookup Table

| Functional Domain | Key Responsibilities | Primary File Location | Dependent Modules |
| :--- | :--- | :--- | :--- |
| **Application Factory** | Instantiates Flask app, configures settings, registers extensions & blueprints, handles `url_for` backward compatibility | `cognitara/__init__.py` | All blueprints, `config`, `extensions` |
| **Entry Point** | Exposes `app = create_app()` and legacy symbols for CLI/WSGI | `app.py` | `cognitara` |
| **Production Server** | Runs production Waitress HTTP server on port 5000 | `wsgi.py` | `app` |
| **Configuration** | Manages secrets, cookie flags, database path, uploads (`MAX_CONTENT_LENGTH = None`) | `cognitara/config.py` | None |
| **Extensions** | Shared singleton instances for CSRFProtect and Limiter | `cognitara/extensions.py` | None |
| **Database Durability** | Manages SQLite connection, WAL mode, busy_timeout (5000ms), foreign keys | `cognitara/database/connection.py` | `config` |
| **Startup Migrations** | Non-destructive schema column and analytics table creation | `cognitara/database/initialization.py` | `database.connection` |
| **User Data Queries** | Authenticates users, fetches profiles, validates student/teacher records | `cognitara/database/repositories/users.py` | `database.connection` |
| **Exam Data Queries** | Loads exam metadata, sections, question groups, and randomized questions | `cognitara/database/repositories/exams.py` | `database.connection` |
| **Attempt Queries** | Reads attempt state, remaining time, pause status, and submitted answers | `cognitara/database/repositories/attempts.py` | `database.connection` |
| **Result Queries** | Calculates student exam averages, passing rates, and distribution histograms | `cognitara/database/repositories/results.py` | `database.connection` |
| **Password Security** | Verifies PBKDF2/Argon2 hashes and transparently upgrades legacy hashes | `cognitara/security/passwords.py` | `database.connection` |
| **CSRF & Rate Limiting**| Injects CSRF token from JSON body/beacon, handles 429/400 errors | `cognitara/security/csrf_ratelimit.py` | `extensions` |
| **Permissions** | Decorators `@admin_required`, `@teacher_required`, `@student_required` | `cognitara/security/permissions.py` | None |
| **Math & Sanitization** | Safe mathematical evaluation (`SafeMathEvaluator`), HTML sanitization, UTC formatting | `cognitara/utils/helpers.py` | None |
| **Offline Exam Builder**| Generates self-contained offline exam bundle HTML | `cognitara/utils/offline_builder.py` | `database.connection` |
| **Authoritative Timing**| Computes authoritative remaining time, enforces strict server deadlines | `cognitara/services/timing_service.py` | `database.connection`, `helpers` |
| **Instant Answer Persist**| Saves answers asynchronously as individual questions are answered using atomic UPSERTs | `cognitara/services/answer_service.py` | `database.connection`, `timing_service` |
| **Session Fencing** | Heartbeat lease tracking, auto-pause on disconnect (>25s), cross-computer session lease invalidation | `cognitara/services/session_service.py` | `database.connection`, `timing_service` |
| **Violation Integrity** | Monotonically increments warnings, logs audit records on authorized proctor resets | `cognitara/services/violation_service.py` | `database.connection` |
| **Exam Finalization** | Calculates final score, evaluates grade/percentage, marks attempts completed | `cognitara/services/grading_service.py` | `database.connection`, `helpers` |
| **Home & Utils Routes** | Landing page, avatar serving, basic math API | `cognitara/routes/home.py` | `database.connection`, `helpers` |
| **Auth Routes** | Login, registration, CE login, logout with rate limiting and CSRF | `cognitara/routes/auth.py` | `database.connection`, `security.passwords` |
| **Student Routes** | Student portal dashboard, CE dashboard, CE exam start | `cognitara/routes/student.py` | `database.connection`, `timing_service` |
| **Regular Exam Engine** | Regular examination delivery, auto-save, heartbeat, single answer saving, pause check | `cognitara/routes/examinations/regular.py` | `services.*`, `database.connection` |
| **Common Entrance Engine**| CE examination delivery, auto-save, heartbeat, single answer saving, pause check | `cognitara/routes/examinations/common_entrance.py`| `services.*`, `database.connection` |
| **Teacher Routes** | Teacher exam authoring, question management, student progress monitoring | `cognitara/routes/teacher.py` | `database.connection`, `helpers` |
| **Admin Dashboard** | Main administrative dashboard, system stats, quick links | `cognitara/routes/admin/dashboard.py` | `database.connection` |
| **Admin Users** | Admin CRUD operations for students, teachers, and admins | `cognitara/routes/admin/users.py` | `database.connection`, `security.passwords` |
| **Admin Support** | Technical support tools, live monitoring, audit log browser | `cognitara/routes/admin/support.py` | `database.connection` |
| **Admin Exams** | Regular exam creation, section builder, versioning, question editor | `cognitara/routes/admin/exams.py` | `database.connection`, `utils.*` |
| **Admin Results** | Exam results, grade sheet export, analytics breakdown | `cognitara/routes/admin/results.py` | `database.connection` |
| **Admin Common Entrance**| CE exam lifecycle, student approvals, grading, review, settings | `cognitara/routes/admin/common_entrance.py` | `database.connection`, `services.*` |

---

## 4. Key Architectural Guarantees

1. **Separation of Engines:** Regular Examination and Common Entrance remain strictly independent execution flows with their own tables, models, and routes, preventing cross-engine regression.
2. **Database Non-Destruction:** Application startup checks never delete or modify historical student response rows.
3. **Session Fencing:** The server generates a random cryptographic `session_key` lease on each exam start/resume. Stale requests from superseded devices are rejected with HTTP 403 `superseded: true`.
4. **Immediate Single-Answer Persistence:** Responses are written directly to SQLite WAL on click/selection using `ON CONFLICT DO UPDATE`, ensuring zero data loss if power or browser crashes occur.
5. **No File Size or Compression Constraints:** Image uploads allow full natural resolution with `MAX_CONTENT_LENGTH = None` and removal of client-side 500KB blockers.
