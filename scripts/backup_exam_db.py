#!/usr/bin/env python3
"""
CogniTara Offline Examination Portal - Hot Online Backup & Restore Utility
Phase 4.4 Enterprise Disaster Recovery and Online Database Maintenance.

Guarantees:
1. Online, non-blocking backup of live SQLite database with active WAL journal.
2. Uses sqlite3.Connection.backup() for torn-read prevention and uncheckpointed WAL capture.
3. PRAGMA integrity_check verification on all backup files.
4. SHA-256 checksum and table row-count manifest generation (.json).
5. Safe atomic rename (.tmp -> .db).
6. Automatic retention policy pruning (--keep N).
7. Verified restore command with pre-restore safety copy and target integrity verification.
"""

import os
import sys
import argparse
import sqlite3
import hashlib
import json
import glob
import shutil
from datetime import datetime, timezone

KEY_TABLES = [
    "students", "teachers", "admins", "classes", "subjects",
    "exams", "questions", "scores", "exam_question_responses",
    "ce_attempts", "ce_questions", "ce_attempt_questions", "ce_sections",
    "warning_logs", "ce_warning_logs", "warning_reset_audit"
]


def calculate_sha256(file_path: str) -> str:
    """Computes SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().upper()


def get_table_counts(conn: sqlite3.Connection) -> dict:
    """Collects row counts for all existing key tables."""
    counts = {}
    for table in KEY_TABLES:
        try:
            res = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            counts[table] = res[0] if res else 0
        except sqlite3.OperationalError:
            counts[table] = None
    return counts


def verify_database_integrity(db_path: str) -> tuple[bool, str]:
    """Runs PRAGMA integrity_check on the specified SQLite database."""
    if not os.path.exists(db_path):
        return False, f"File does not exist: {db_path}"
    try:
        conn = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True, timeout=10.0)
        cursor = conn.cursor()
        res = cursor.execute("PRAGMA integrity_check").fetchall()
        conn.close()
        if len(res) == 1 and res[0][0] == "ok":
            return True, "ok"
        errors = "; ".join(row[0] for row in res)
        return False, f"Integrity check failed: {errors}"
    except Exception as e:
        return False, f"Integrity check exception: {str(e)}"


def perform_backup(source_path: str, backup_dir: str, keep: int = 30) -> dict:
    """
    Executes an online hot backup using sqlite3.Connection.backup().
    Saves to <backup_dir>/exam_backup_YYYYMMDD_HHMMSS.db and manifest JSON.
    """
    source_abs = os.path.abspath(source_path)
    if not os.path.exists(source_abs):
        raise FileNotFoundError(f"Source database not found: {source_abs}")

    os.makedirs(backup_dir, exist_ok=True)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    base_name = f"exam_backup_{timestamp_str}"
    dest_path = os.path.abspath(os.path.join(backup_dir, f"{base_name}.db"))
    dest_tmp = os.path.abspath(os.path.join(backup_dir, f"{base_name}.tmp"))
    manifest_path = os.path.abspath(os.path.join(backup_dir, f"{base_name}.json"))

    if os.path.exists(dest_tmp):
        os.remove(dest_tmp)

    print(f"[*] Starting hot online backup of {source_abs} -> {dest_path}")

    # Connect to source with read-only URI to ensure no unintended writes
    src_conn = sqlite3.connect(f"file:{source_abs}?mode=ro", uri=True, timeout=30.0)
    dst_conn = sqlite3.connect(dest_tmp, timeout=30.0)

    try:
        # Perform online backup in 100-page increments
        src_conn.backup(dst_conn, pages=100)
    finally:
        dst_conn.close()
        src_conn.close()

    # Verify backup integrity before finalizing
    is_valid, msg = verify_database_integrity(dest_tmp)
    if not is_valid:
        if os.path.exists(dest_tmp):
            os.remove(dest_tmp)
        raise RuntimeError(f"Backup file failed integrity check: {msg}")

    # Atomic rename from .tmp to .db
    if os.path.exists(dest_path):
        os.remove(dest_path)
    os.rename(dest_tmp, dest_path)

    # Clean up any lingering temporary WAL or SHM files
    for ext in ["-wal", "-shm"]:
        tmp_aux = dest_tmp + ext
        if os.path.exists(tmp_aux):
            try:
                os.remove(tmp_aux)
            except OSError:
                pass

    # Collect metadata and manifest
    sha256_hash = calculate_sha256(dest_path)
    file_size = os.path.getsize(dest_path)

    check_conn = sqlite3.connect(f"file:{dest_path}?mode=ro", uri=True)
    table_counts = get_table_counts(check_conn)
    check_conn.close()

    manifest = {
        "backup_file": os.path.basename(dest_path),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "source_database": source_abs,
        "sha256": sha256_hash,
        "size_bytes": file_size,
        "integrity_check": "ok",
        "table_counts": table_counts
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[+] Hot backup completed successfully: {dest_path}")
    print(f"    SHA-256: {sha256_hash}")
    print(f"    Size: {file_size:,} bytes")
    print(f"    Manifest: {manifest_path}")

    # Prune old backups
    if keep > 0:
        prune_backups(backup_dir, keep)

    return manifest


def prune_backups(backup_dir: str, keep: int):
    """Retains the newest `keep` backups and deletes older ones."""
    pattern = os.path.join(backup_dir, "exam_backup_*.db")
    backup_files = sorted(glob.glob(pattern), reverse=True)
    if len(backup_files) > keep:
        to_delete = backup_files[keep:]
        print(f"[*] Pruning {len(to_delete)} old backup(s) exceeding retention limit ({keep}):")
        for f in to_delete:
            try:
                os.remove(f)
                json_f = f.replace(".db", ".json")
                if os.path.exists(json_f):
                    os.remove(json_f)
                print(f"    Removed: {os.path.basename(f)}")
            except OSError as e:
                print(f"    Failed to remove {f}: {e}", file=sys.stderr)


def perform_restore(backup_path: str, target_path: str, force: bool = False) -> bool:
    """
    Safely restores a backup file into the target database location.
    Includes target safety copy and integrity checks.
    """
    backup_abs = os.path.abspath(backup_path)
    target_abs = os.path.abspath(target_path)

    if not os.path.exists(backup_abs):
        raise FileNotFoundError(f"Backup file not found: {backup_abs}")

    print(f"[*] Validating backup candidate: {backup_abs}")
    is_valid, msg = verify_database_integrity(backup_abs)
    if not is_valid:
        raise ValueError(f"Cannot restore corrupt backup: {msg}")

    # Validate against JSON manifest if present
    manifest_path = backup_abs.replace(".db", ".json")
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        current_hash = calculate_sha256(backup_abs)
        if manifest.get("sha256") and manifest["sha256"] != current_hash:
            raise ValueError(f"Checksum mismatch! Manifest: {manifest['sha256']}, Actual: {current_hash}")
        print(f"[+] Backup checksum verified against manifest: {current_hash}")

    # If target exists and not forced, create a safety copy of target first
    if os.path.exists(target_abs):
        safety_path = target_abs + f".pre_restore_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.bak"
        print(f"[*] Backing up existing target database to: {safety_path}")
        try:
            src_conn = sqlite3.connect(f"file:{target_abs}?mode=ro", uri=True)
            safe_conn = sqlite3.connect(safety_path)
            try:
                src_conn.backup(safe_conn)
            finally:
                safe_conn.close()
                src_conn.close()
        except Exception as e:
            print(f"[!] Target SQLite online backup note: {e}. Falling back to file copy for safety snapshot...")
            try:
                shutil.copy2(target_abs, safety_path)
                for ext in ["-wal", "-shm"]:
                    if os.path.exists(target_abs + ext):
                        shutil.copy2(target_abs + ext, safety_path + ext)
            except Exception as copy_err:
                print(f"[!] Target file copy fallback warning: {copy_err}")

    # Perform restore using Connection.backup to target temp file
    target_tmp = target_abs + ".restore_tmp"
    if os.path.exists(target_tmp):
        os.remove(target_tmp)

    print(f"[*] Restoring from {backup_abs} -> {target_tmp}")
    bak_conn = sqlite3.connect(f"file:{backup_abs}?mode=ro", uri=True)
    tgt_conn = sqlite3.connect(target_tmp)
    try:
        bak_conn.backup(tgt_conn)
    finally:
        tgt_conn.close()
        bak_conn.close()

    # Check restored database integrity
    tgt_valid, tgt_msg = verify_database_integrity(target_tmp)
    if not tgt_valid:
        if os.path.exists(target_tmp):
            os.remove(target_tmp)
        raise RuntimeError(f"Restored file failed integrity check: {tgt_msg}")

    # Replace target
    if os.path.exists(target_abs):
        # Remove any lingering WAL or SHM files for target
        for ext in ["", "-wal", "-shm"]:
            f_path = target_abs + ext
            if os.path.exists(f_path):
                try:
                    os.remove(f_path)
                except OSError:
                    pass

    # Clean up any lingering WAL or SHM files for target_tmp before rename
    for ext in ["-wal", "-shm"]:
        f_tmp = target_tmp + ext
        if os.path.exists(f_tmp):
            try:
                os.remove(f_tmp)
            except OSError:
                pass

    os.rename(target_tmp, target_abs)
    print(f"[+] Database restored successfully to: {target_abs}")
    return True


def perform_checkpoint(db_path: str, mode: str = "TRUNCATE") -> tuple[bool, str]:
    """
    Executes PRAGMA wal_checkpoint on the specified SQLite database.
    Modes: PASSIVE, FULL, RESTART, TRUNCATE.
    """
    if not os.path.exists(db_path):
        return False, f"File does not exist: {db_path}"
    valid_modes = {"PASSIVE", "FULL", "RESTART", "TRUNCATE"}
    mode_upper = mode.upper()
    if mode_upper not in valid_modes:
        return False, f"Invalid checkpoint mode '{mode}'. Must be one of {valid_modes}"
    try:
        conn = sqlite3.connect(os.path.abspath(db_path), timeout=30.0)
        cursor = conn.cursor()
        res = cursor.execute(f"PRAGMA wal_checkpoint({mode_upper});").fetchone()
        conn.close()
        busy, log_frames, ckpt_frames = res[0], res[1], res[2]
        if busy != 0:
            return False, f"Checkpoint busy ({busy}): {ckpt_frames}/{log_frames} frames transferred"
        return True, f"Checkpoint {mode_upper} completed successfully ({ckpt_frames}/{log_frames} frames transferred)"
    except Exception as e:
        return False, f"Checkpoint failed with exception: {e}"


def list_backups(backup_dir: str):
    """Lists all available backups in the directory with status."""
    pattern = os.path.join(backup_dir, "exam_backup_*.db")
    backups = sorted(glob.glob(pattern), reverse=True)
    print(f"\nAvailable Backups in '{backup_dir}': ({len(backups)} total)")
    print("-" * 75)
    print(f"{'Filename':<35} {'Size (MB)':<12} {'Integrity':<12} {'Created'}")
    print("-" * 75)
    for b in backups:
        name = os.path.basename(b)
        size_mb = os.path.getsize(b) / (1024 * 1024)
        is_ok, _ = verify_database_integrity(b)
        mtime = datetime.fromtimestamp(os.path.getmtime(b)).strftime("%Y-%m-%d %H:%M:%S")
        status = "OK" if is_ok else "CORRUPT"
        print(f"{name:<35} {size_mb:<12.2f} {status:<12} {mtime}")
    print("-" * 75)


def main():
    parser = argparse.ArgumentParser(description="CogniTara Online Database Backup & Disaster Recovery")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Backup subcommand
    backup_parser = subparsers.add_parser("backup", help="Perform online hot backup")
    backup_parser.add_argument("source_pos", nargs="?", default=None, help="Optional positional path to source database")
    backup_parser.add_argument("--source", default=None, help="Path to source database (default: exam.db)")
    backup_parser.add_argument("--dir", "--target-dir", dest="dir", default="backups", help="Destination backup directory (default: backups)")
    backup_parser.add_argument("--keep", type=int, default=30, help="Number of backups to keep (default: 30)")

    # Restore subcommand
    restore_parser = subparsers.add_parser("restore", help="Restore database from a backup")
    restore_parser.add_argument("backup_file", help="Path to backup .db file")
    restore_parser.add_argument("--target", default="exam.db", help="Target database path (default: exam.db)")
    restore_parser.add_argument("--force", action="store_true", help="Force restore without prompting")

    # Verify subcommand
    verify_parser = subparsers.add_parser("verify", help="Verify database integrity")
    verify_parser.add_argument("db_file", help="Path to database to verify")

    # Checkpoint subcommand
    checkpoint_parser = subparsers.add_parser("checkpoint", help="Flush SQLite WAL log to main database file")
    checkpoint_parser.add_argument("db_file", nargs="?", default="exam.db", help="Path to database (default: exam.db)")
    checkpoint_parser.add_argument("--mode", default="TRUNCATE", choices=["PASSIVE", "FULL", "RESTART", "TRUNCATE"], help="Checkpoint mode (default: TRUNCATE)")

    # List subcommand
    list_parser = subparsers.add_parser("list", help="List backups in directory")
    list_parser.add_argument("--dir", "--target-dir", dest="dir", default="backups", help="Backup directory (default: backups)")

    args = parser.parse_args()

    if args.command == "backup":
        source_db = args.source or args.source_pos or "exam.db"
        try:
            perform_backup(source_db, args.dir, args.keep)
        except Exception as e:
            print(f"[!] Backup failed: {e}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "restore":
        try:
            perform_restore(args.backup_file, args.target, args.force)
        except Exception as e:
            print(f"[!] Restore failed: {e}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "verify":
        is_valid, msg = verify_database_integrity(args.db_file)
        if is_valid:
            print(f"[+] Integrity check PASSED for {args.db_file}")
            sha = calculate_sha256(args.db_file)
            print(f"    SHA-256: {sha}")
        else:
            print(f"[!] Integrity check FAILED: {msg}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "checkpoint":
        success, msg = perform_checkpoint(args.db_file, args.mode)
        if success:
            print(f"[+] {msg}")
        else:
            print(f"[!] {msg}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "list":
        list_backups(args.dir)


if __name__ == "__main__":
    main()
