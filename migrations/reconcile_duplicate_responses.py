"""
Cognitara Examination Portal - Explicit Response Reconciliation Migration
Safely reconciles duplicate (attempt_id, question_id) rows in exam_question_responses.
Features:
- Default --dry-run mode: prints detailed duplicate analysis without modifying DB.
- Comprehensive response archival: archives all pruned records into exam_question_responses_history.
- Intelligent canonical selection: preserves correct answers and verified history (not just MAX(id)).
- Explicit transaction with rollback on any failure.
- Foreign key and database integrity verification.
"""

import os
import sys
import shutil
import sqlite3
import argparse
from datetime import datetime

def analyze_duplicate_groups(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT attempt_id, question_id, COUNT(*) as cnt
        FROM exam_question_responses
        GROUP BY attempt_id, question_id
        HAVING cnt > 1
        ORDER BY attempt_id, question_id;
    """)
    groups = cur.fetchall()
    return groups

def select_canonical_row(rows):
    """
    Selects the canonical record using a documented, integrity-first ordering policy:
    1. Prefer row where is_correct == 1 (preserves earned student credit)
    2. Prefer row with non-empty user_answer
    3. Prefer row with latest answered_at timestamp
    4. Prefer highest time_spent
    5. Fallback: highest id
    """
    def score_key(r):
        # r: (id, attempt_id, question_id, student_id, exam_id, section_id, user_answer, is_correct, time_spent, answered_at)
        row_id = r["id"]
        user_ans = r["user_answer"] or ""
        is_corr = r["is_correct"] or 0
        t_spent = r["time_spent"] or 0
        ans_at = r["answered_at"] or ""
        has_ans = 1 if len(user_ans.strip()) > 0 else 0
        return (is_corr, has_ans, ans_at, t_spent, row_id)

    sorted_rows = sorted(rows, key=score_key, reverse=True)
    canonical = sorted_rows[0]
    pruned = sorted_rows[1:]
    return canonical, pruned

def reconcile(db_path, apply_changes=False):
    print("=" * 70)
    print("COGNITARA RESPONSE RECONCILIATION MIGRATION")
    print(f"Target Database: {db_path}")
    print(f"Mode:            {'APPLY (LIVE MIGRATION)' if apply_changes else 'DRY RUN (NO CHANGES)'}")
    print("=" * 70)

    if not os.path.exists(db_path):
        print(f"ERROR: Database file not found: {db_path}")
        return False

    # Check if target is production exam.db and warn
    is_live_prod = os.path.abspath(db_path) == os.path.abspath("exam.db")
    if is_live_prod and apply_changes:
        print("ATTENTION: Target is live production exam.db!")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Check if table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='exam_question_responses';")
    if not cur.fetchone():
        print("Table 'exam_question_responses' does not exist in target database. Nothing to reconcile.")
        conn.close()
        return True

    # Find duplicates
    dup_groups = analyze_duplicate_groups(conn)
    total_dups = len(dup_groups)
    print(f"\n[1] Duplicate Group Scan: Found {total_dups} conflicting (attempt_id, question_id) groups.")

    if total_dups == 0:
        print("    -> Database is 100% clean! Zero duplicate records exist.")
        # Check if unique index exists
        cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_eqr_attempt_question';")
        if not cur.fetchone() and apply_changes:
            print("    -> Creating unique index uq_eqr_attempt_question...")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_eqr_attempt_question ON exam_question_responses(attempt_id, question_id);")
            conn.commit()
            print("    -> Unique index successfully created!")
        conn.close()
        return True

    # Detailed report of duplicate groups
    print("\n[2] Detailed Duplicate Group Analysis & Canonical Resolution Plan:")
    plan = []
    total_records_to_prune = 0

    for g in dup_groups:
        att_id = g["attempt_id"]
        q_id = g["question_id"]
        cur.execute("SELECT * FROM exam_question_responses WHERE attempt_id=? AND question_id=? ORDER BY id ASC", (att_id, q_id))
        rows = cur.fetchall()
        canonical, pruned = select_canonical_row(rows)
        plan.append({
            "attempt_id": att_id,
            "question_id": q_id,
            "all_rows": rows,
            "canonical": canonical,
            "pruned": pruned
        })
        total_records_to_prune += len(pruned)

        print(f"  * Attempt {att_id}, Question {q_id} ({len(rows)} rows):")
        for r in rows:
            is_canon = (r["id"] == canonical["id"])
            tag = " [CANONICAL KEEP]" if is_canon else " [ARCHIVE & PRUNE]"
            print(f"    - ID {r['id']:<5} | Ans: '{r['user_answer']}' | Correct: {r['is_correct']} | Time: {r['time_spent']}s | At: {r['answered_at']}{tag}")

    print(f"\nTotal rows to be archived and pruned: {total_records_to_prune}")

    if not apply_changes:
        print("\n[DRY RUN COMPLETE] Zero database records were modified.")
        print("To apply this migration, run with the --apply flag.")
        conn.close()
        return True

    # APPLY CHANGES WITHIN STRICT TRANSACTION
    print("\n[3] Applying Reconciliation Changes within Transaction...")
    try:
        # Pre-migration backup
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.pre_reconcile_{ts}.bak"
        shutil.copyfile(db_path, backup_path)
        print(f"    -> Safety snapshot created at: {backup_path}")

        # Start transaction
        conn.execute("BEGIN TRANSACTION;")

        # Ensure history table exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exam_question_responses_history (
                archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_id INTEGER NOT NULL,
                attempt_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                exam_id INTEGER NOT NULL,
                section_id INTEGER,
                user_answer TEXT,
                is_correct INTEGER,
                time_spent INTEGER,
                answered_at TIMESTAMP,
                reconciled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reconciliation_action TEXT NOT NULL
            );
        """)

        # Archive and prune
        pruned_ids = []
        for p in plan:
            # Archive canonical record as baseline
            c = p["canonical"]
            conn.execute("""
                INSERT INTO exam_question_responses_history 
                (original_id, attempt_id, question_id, student_id, exam_id, section_id, user_answer, is_correct, time_spent, answered_at, reconciliation_action)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RETAINED_AS_CANONICAL')
            """, (c["id"], c["attempt_id"], c["question_id"], c["student_id"], c["exam_id"], c["section_id"], c["user_answer"], c["is_correct"], c["time_spent"], c["answered_at"]))

            # Archive pruned records
            for pr in p["pruned"]:
                pruned_ids.append(pr["id"])
                conn.execute("""
                    INSERT INTO exam_question_responses_history 
                    (original_id, attempt_id, question_id, student_id, exam_id, section_id, user_answer, is_correct, time_spent, answered_at, reconciliation_action)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRUNED_DUPLICATE')
                """, (pr["id"], pr["attempt_id"], pr["question_id"], pr["student_id"], pr["exam_id"], pr["section_id"], pr["user_answer"], pr["is_correct"], pr["time_spent"], pr["answered_at"]))

        # Execute safe deletion of non-canonical duplicate rows
        for pid in pruned_ids:
            conn.execute("DELETE FROM exam_question_responses WHERE id=?", (pid,))

        print(f"    -> Archived {len(pruned_ids)} duplicate records to exam_question_responses_history.")
        print(f"    -> Pruned {len(pruned_ids)} duplicate records from exam_question_responses.")

        # Create unique index
        print("    -> Creating unique index uq_eqr_attempt_question...")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_eqr_attempt_question ON exam_question_responses(attempt_id, question_id);")

        # Verify foreign keys & integrity
        fk_errors = conn.execute("PRAGMA foreign_key_check;").fetchall()
        if fk_errors:
            raise RuntimeError(f"Foreign key integrity violation detected: {fk_errors}")

        integrity = conn.execute("PRAGMA integrity_check;").fetchone()
        if integrity[0] != "ok":
            raise RuntimeError(f"Database integrity check failed: {integrity[0]}")

        # Commit transaction
        conn.execute("COMMIT;")
        print("    -> TRANSACTION COMMITTED SUCCESSFULLY!")

    except Exception as e:
        conn.execute("ROLLBACK;")
        print(f"ERROR: Transaction failed and was ROLLED BACK: {e}")
        conn.close()
        return False

    conn.close()
    print("\n[MIGRATION SUCCESSFUL] Database reconciled and verified clean.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reconcile duplicate responses in exam_question_responses")
    parser.add_argument("--db", default="exam.db", help="Path to SQLite database")
    parser.add_argument("--apply", action="store_true", help="Apply reconciliation changes (default is dry-run)")
    args = parser.parse_args()

    reconcile(args.db, apply_changes=args.apply)
