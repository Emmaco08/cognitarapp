# CogniTara Examination Portal — Database Architecture & Schema Specification

## 1. Engine & Durability Architecture

The CogniTara Examination Portal uses an authoritative local **SQLite 3** database (`exam.db`). It is configured for high concurrency, ACID transaction guarantees, and crash safety across offline intranet deployments.

### Mandatory Durability Pragmas
Every database connection created via `cognitara.database.connection.get_db_connection()` executes the following configuration:

```sql
PRAGMA journal_mode=WAL;       -- Write-Ahead Logging for non-blocking concurrent readers & writers
PRAGMA busy_timeout=5000;      -- 5000ms busy wait before throwing database locked error
PRAGMA foreign_keys=ON;        -- Referential integrity enforcement across all relational tables
PRAGMA synchronous=NORMAL;     -- Optimal durability balance with zero disk corruption on crash
```

### WAL Mode Guarantees
- In WAL mode, writes are appended to an auxiliary `exam.db-wal` log file without locking out simultaneous readers.
- Checkpoints automatically flush WAL entries back to the primary database `exam.db`.
- Reader connections inspect snapshots consistent with the transaction boundary, preventing partial reads during active student question submissions.

---

## 2. Table Catalog

The application maintains 24 relational tables cleanly divided between Regular Examination, Common Entrance, Administration, and Audit domains:

### 2.1 User & Identity Tables
1. **`admin`**: System administrator accounts.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `username`, `password`, `created_at`
2. **`students`**: Registered student accounts for regular school classes.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `username`, `password`, `class`, `photo`, `status`, `approved_at`, `email`, `full_name`, `specialisation`
3. **`teachers`**: Faculty and instructor accounts.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `username`, `password`, `full_name`, `email`, `subject`, `role`, `created_at`, `photo`, `classes`, `status`
4. **`teacher_class_assignments`**: Class-to-teacher permission matrix.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `teacher_id`, `class_name`, `assigned_at`
5. **`pending_registrations`**: Pre-approval student onboarding queue.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `full_name`, `username`, `email`, `password`, `class`, `photo`, `created_at`, `specialisation`

### 2.2 Regular Examination Engine Tables
6. **`exams`**: Regular examination specifications.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `exam_name`, `subject`, `class`, `duration`, `term`, `status`, `created_by`, `date_created`, `specialisation`, `calculator_type`, `max_warnings`, `strict_mode`, `allow_pause`
7. **`exam_sections`**: Modular sub-sections (e.g. Section A: Multiple Choice, Section B: Comprehension).
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `exam_id`, `title`, `instructions`, `total_questions_to_answer`, `order_index`, `is_active`
8. **`exam_question_groups`**: Shared passage / comprehension / stimulus blocks.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `section_id`, `passage_text`, `title`, `order_index`
9. **`questions`**: Individual examination questions.
   - Primary Key: `id` (INTEGER AUTOINCREMENT)
   - Columns: `exam_id`, `section_id`, `group_id`, `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_answer`, `image_url`, `explanation`, `marks`, `question_type`
10. **`exam_versions`**: Historical revision snapshots of exams.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `exam_id`, `version_number`, `snapshot_json`, `created_by`, `created_at`
11. **`exam_deactivation_notes`**: Administrative audit trail for deactivating exams.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `exam_id`, `admin_id`, `reason`, `deactivated_at`
12. **`scores`**: Regular exam student attempts and authoritative state.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `student_id`, `exam_id`, `score`, `total`, `submitted`, `status`, `start_time`, `end_time`, `current_progress`, `warnings_count`, `remaining_time`, `is_paused`, `paused_at`, `paused_by`, `resume_requested`, `resume_requested_at`, `force_submit`, `updated_at`, `percentage`, `authoritative_deadline`, `session_key`, `last_heartbeat`, `max_warnings`, `time_adjust_delta`, `time_adjusted_at`, `tab_closed`, `pause_reason`
13. **`exam_question_responses`**: Instantaneous per-question persisted student answers.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Unique Constraint: `(attempt_id, question_id)`
    - Columns: `attempt_id`, `question_id`, `user_answer`, `is_correct`, `time_spent`, `created_at`, `updated_at`

### 2.3 Common Entrance Examination Engine Tables
14. **`ce_exams`**: Common Entrance entrance exam definitions.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `name`, `description`, `target_class`, `duration`, `passing_score`, `total_questions_to_show`, `active`, `created_at`, `updated_at`, `calculator_type`, `max_warnings`
15. **`ce_sections`**: Common Entrance exam sections.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `exam_id`, `title`, `instructions`, `total_questions_to_answer`, `order_index`, `is_active`
16. **`ce_question_groups`**: Common Entrance stimulus / comprehension passages.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `section_id`, `passage_text`, `title`, `order_index`
17. **`ce_questions`**: Common Entrance questions.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `exam_id`, `section_id`, `group_id`, `question_text`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_answer`, `image_url`, `explanation`, `marks`, `question_type`
18. **`ce_students`**: Candidates registered for Common Entrance examinations.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `exam_id`, `full_name`, `username`, `email`, `password`, `phone`, `address`, `registered_at`, `selected_exam_id`
19. **`ce_attempts`**: Common Entrance candidate attempt authoritative state.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `student_id`, `exam_id`, `score`, `total`, `percentage`, `passed`, `status`, `answers`, `started_at`, `completed_at`, `reviewed_at`, `reviewed_by`, `admin_notes`, `is_paused`, `paused_at`, `paused_by`, `current_progress`, `warnings_count`, `remaining_time`, `auto_submitted`, `max_warnings`, `resume_requested`, `resume_requested_at`, `updated_at`, `tab_closed`, `session_key`, `time_adjust_delta`, `time_adjusted_at`, `force_submit`, `last_heartbeat`, `authoritative_deadline`, `pause_reason`
20. **`ce_attempt_questions`**: Instantaneous per-question answers for Common Entrance.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Unique Constraint: `(attempt_id, question_id)`
    - Columns: `attempt_id`, `question_id`, `user_answer`, `is_correct`, `time_spent`, `created_at`, `updated_at`

### 2.4 Integrity, Violations & Audit Tables
21. **`warning_logs`**: Audit trail of student violations during Regular examinations.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `student_id`, `exam_id`, `warning_count`, `reason`, `timestamp`
22. **`ce_warning_logs`**: Audit trail of candidate violations during Common Entrance.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `student_id`, `exam_id`, `warning_count`, `reason`, `timestamp`
23. **`warning_reset_audit`**: Mandatory audit log for authorized proctor warning resets.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `attempt_id`, `exam_type`, `reset_by`, `role`, `previous_count`, `new_count`, `reason`, `timestamp`
24. **`audit_logs`**: General administrative event logging.
    - Primary Key: `id` (INTEGER AUTOINCREMENT)
    - Columns: `user_id`, `user_role`, `action`, `details`, `ip_address`, `timestamp`

---

## 3. Critical Performance & Uniqueness Indexes

```sql
-- Prevents duplicate response rows and accelerates single-answer UPSERTs
CREATE UNIQUE INDEX IF NOT EXISTS idx_eqr_attempt_question 
    ON exam_question_responses (attempt_id, question_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_attempt_question 
    ON ce_attempt_questions (attempt_id, question_id);

-- Accelerates student attempt lookups during active examination
CREATE INDEX IF NOT EXISTS idx_scores_student_exam 
    ON scores (student_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_ce_attempts_student_exam 
    ON ce_attempts (student_id, exam_id);

-- Accelerates heartbeat monitoring and auto-pause scans
CREATE INDEX IF NOT EXISTS idx_scores_heartbeat_status 
    ON scores (status, is_paused, last_heartbeat);

CREATE INDEX IF NOT EXISTS idx_ce_attempts_heartbeat_status 
    ON ce_attempts (status, is_paused, last_heartbeat);
```

---

## 4. Startup Migration Idempotency & Safety

Application initialization (`cognitara.database.initialization.ensure_deadline_columns`) adheres to strict safety principles:

1. **Purely Additive Schema Checks:** Only inspects existing columns using `PRAGMA table_info` and issues `ALTER TABLE ... ADD COLUMN` if missing.
2. **Zero Row Deletions:** Startup code **never** runs `DELETE`, `TRUNCATE`, or destructive deduplication queries.
3. **Graceful Fault Tolerance:** Startup checks use `IF NOT EXISTS` syntax to guarantee idempotency across multiple process starts.

---

## 5. Backup & Recovery Operations

### Live Online Backup
Because SQLite is configured in WAL mode, backups can be performed live while examinations are in progress without locking or interrupting active students:

```bash
# Using SQLite's safe online backup API
python -c "import sqlite3; src = sqlite3.connect('exam.db'); dst = sqlite3.connect('backups/exam_backup.db'); src.backup(dst); dst.close(); src.close()"
```

### Integrity Verification
```bash
python -c "import sqlite3; conn = sqlite3.connect('exam.db'); print(conn.execute('PRAGMA integrity_check;').fetchall()); conn.close()"
```
Output must always return `[('ok',)]`.
