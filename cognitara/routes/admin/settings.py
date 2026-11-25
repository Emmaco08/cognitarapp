import os
import sqlite3
import json
import logging
from flask import Blueprint, render_template, request, session, redirect, jsonify, url_for
from werkzeug.utils import secure_filename

from cognitara.database.connection import get_db_connection
from cognitara.security.csrf_ratelimit import get_csrf_token
from cognitara.security.permissions import require_admin
from cognitara.utils.helpers import log_action, get_utc_now
from cognitara.services.grading_service import GradingSchemeValidator

logger = logging.getLogger("cognitara.routes.admin.settings")
admin_settings_bp = Blueprint('admin_settings', __name__)

@admin_settings_bp.route("/admin/school-settings", methods=["GET"])
def admin_school_settings():
    """School Settings Management Dashboard"""
    if "admin_id" not in session:
        return redirect("/")

    conn = get_db_connection()
    school_set = conn.execute("SELECT * FROM school_settings WHERE id=1").fetchone()
    if not school_set:
        conn.execute("""
            INSERT OR IGNORE INTO school_settings (id, school_name, academic_session, current_term)
            VALUES (1, 'CogniTara High School', '2026/2027', 'First Term')
        """)
        conn.commit()
        school_set = conn.execute("SELECT * FROM school_settings WHERE id=1").fetchone()

    classes = conn.execute("SELECT * FROM classes ORDER BY display_order ASC, name ASC").fetchall()
    schemes = conn.execute("SELECT * FROM grading_schemes ORDER BY is_default DESC, id ASC").fetchall()
    
    # Load rules for each scheme
    schemes_data = []
    for s in schemes:
        rules = conn.execute("""
            SELECT * FROM grading_scheme_rules WHERE scheme_id=? ORDER BY min_percentage ASC
        """, (s["id"],)).fetchall()
        schemes_data.append({
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "scheme_type": s["scheme_type"],
            "is_default": bool(s["is_default"]),
            "rules": [dict(r) for r in rules]
        })

    # Load exams for results release management
    exams = conn.execute("""
        SELECT e.id, e.name, e.class, e.subject_tag, e.results_released, e.result_release_policy,
               COUNT(s.id) as total_completed
        FROM exams e
        LEFT JOIN scores s ON e.id = s.exam_id AND s.status = 'completed'
        GROUP BY e.id
        ORDER BY e.class ASC, e.name ASC
    """).fetchall()

    sessions = conn.execute("SELECT * FROM academic_sessions ORDER BY is_current DESC, id DESC").fetchall()

    conn.close()

    return render_template(
        "admin_school_settings.html",
        school_settings=dict(school_set) if school_set else {},
        classes=[dict(c) for c in classes],
        schemes=schemes_data,
        exams=[dict(e) for e in exams],
        academic_sessions=[dict(sess) for sess in sessions]
    )

@admin_settings_bp.route("/admin/school-settings/update", methods=["POST"])
def admin_update_school_settings():
    """Update primary school settings and academic calendar"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or request.form

    school_name = (data.get("school_name") or "CogniTara High School").strip()
    school_motto = (data.get("school_motto") or "").strip()
    school_address = (data.get("school_address") or "").strip()
    school_phone = (data.get("school_phone") or "").strip()
    school_email = (data.get("school_email") or "").strip()
    academic_session = (data.get("academic_session") or "2026/2027").strip()
    current_term = (data.get("current_term") or "First Term").strip()
    default_result_visibility = (data.get("default_result_visibility") or "immediate").strip()
    allow_teacher_release = 1 if str(data.get("allow_teacher_release", "0")).lower() in ("1", "true", "on") else 0
    allow_student_review = 1 if str(data.get("allow_student_review", "1")).lower() in ("1", "true", "on") else 0
    active_scheme_id = data.get("active_grading_scheme_id")
    anti_cheating_profile = (data.get("anti_cheating_profile") or "medium").strip()
    try:
        max_warnings = max(1, int(data.get("max_warnings", 5)))
    except (ValueError, TypeError):
        max_warnings = 5

    try:
        active_scheme_id = int(active_scheme_id) if active_scheme_id else None
    except (ValueError, TypeError):
        active_scheme_id = None

    conn = get_db_connection()
    if active_scheme_id is None:
        cur_row = conn.execute("SELECT active_grading_scheme_id FROM school_settings WHERE id=1").fetchone()
        if cur_row:
            active_scheme_id = cur_row["active_grading_scheme_id"]

    conn.execute("""
        UPDATE school_settings SET
            school_name=?, school_motto=?, school_address=?, school_phone=?, school_email=?,
            academic_session=?, current_term=?, default_result_visibility=?,
            allow_teacher_release=?, allow_student_review=?, active_grading_scheme_id=?,
            anti_cheating_profile=?, max_warnings=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
    """, (
        school_name, school_motto, school_address, school_phone, school_email,
        academic_session, current_term, default_result_visibility,
        allow_teacher_release, allow_student_review, active_scheme_id,
        anti_cheating_profile, max_warnings
    ))

    # Also keep academic_sessions table in sync
    conn.execute("UPDATE academic_sessions SET is_current=0")
    conn.execute("""
        INSERT INTO academic_sessions (name, is_current) VALUES (?, 1)
        ON CONFLICT(name) DO UPDATE SET is_current=1
    """, (academic_session,))

    log_action("Admin", session.get("username", "admin"), "Updated school settings and academic calendar", conn=conn)
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "success": True,
        "message": "School settings saved successfully."
    }

@admin_settings_bp.route("/admin/school-settings/classes/preset", methods=["POST"])
def admin_apply_class_preset():
    """Apply standardized class naming preset (NERDC, British, American)"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    preset = data.get("preset", "nerdc").lower()

    conn = get_db_connection()

    if preset == "nerdc":
        classes_data = [
            ("Primary 1", 10, "Primary"), ("Primary 2", 20, "Primary"), ("Primary 3", 30, "Primary"),
            ("Primary 4", 40, "Primary"), ("Primary 5", 50, "Primary"), ("Primary 6", 60, "Primary"),
            ("JSS 1", 70, "Junior Secondary"), ("JSS 2", 80, "Junior Secondary"), ("JSS 3", 90, "Junior Secondary"),
            ("SSS 1", 100, "Senior Secondary"), ("SSS 2", 110, "Senior Secondary"), ("SSS 3", 120, "Senior Secondary")
        ]
    elif preset == "british":
        classes_data = [
            (f"Year {i}", i * 10, "Primary" if i <= 6 else "Secondary" if i <= 11 else "Sixth Form")
            for i in range(1, 14)
        ]
    else: # American K-12
        classes_data = [
            (f"Grade {i}", i * 10, "Elementary" if i <= 5 else "Middle School" if i <= 8 else "High School")
            for i in range(1, 13)
        ]

    for c_name, order_idx, category in classes_data:
        conn.execute("""
            INSERT INTO classes (name, display_order, level_category, active)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(name) DO UPDATE SET display_order=?, level_category=?, active=1
        """, (c_name, order_idx, category, order_idx, category))

    log_action("Admin", session.get("username", "admin"), f"Applied {preset.upper()} class preset", conn=conn)
    conn.commit()

    all_classes = conn.execute("SELECT * FROM classes WHERE active=1 ORDER BY display_order ASC").fetchall()
    conn.close()

    return {
        "ok": True,
        "success": True,
        "message": f"Successfully applied {preset.upper()} class naming convention.",
        "classes": [dict(c) for c in all_classes]
    }

@admin_settings_bp.route("/admin/school-settings/classes/add", methods=["POST"])
def admin_add_class():
    """Add a custom class"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or request.form
    name = (data.get("name") or "").strip()
    level_category = (data.get("level_category") or "Secondary").strip()
    try:
        display_order = int(data.get("display_order", 100))
    except (ValueError, TypeError):
        display_order = 100

    if not name:
        return {"ok": False, "error": "Class name is required"}, 400

    conn = get_db_connection()
    try:
        conn.execute("""
            INSERT INTO classes (name, display_order, level_category, active)
            VALUES (?, ?, ?, 1)
        """, (name, display_order, level_category))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return {"ok": False, "error": f"Class '{name}' already exists."}, 400

    conn.close()
    return {"ok": True, "success": True, "message": f"Class '{name}' added successfully."}

@admin_settings_bp.route("/admin/school-settings/classes/<int:class_id>/delete", methods=["POST"])
def admin_delete_class(class_id):
    """Delete or deactivate class"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    conn = get_db_connection()
    cls_row = conn.execute("SELECT name FROM classes WHERE id=?", (class_id,)).fetchone()
    if not cls_row:
        conn.close()
        return {"ok": False, "error": "Class not found"}, 404

    class_name = cls_row["name"]

    # Safety check: does any student or exam currently reference this class?
    st_count = conn.execute("SELECT COUNT(*) FROM students WHERE class=?", (class_name,)).fetchone()[0]
    ex_count = conn.execute("SELECT COUNT(*) FROM exams WHERE class=?", (class_name,)).fetchone()[0]

    if st_count > 0 or ex_count > 0:
        # Soft deactivate instead of hard delete
        conn.execute("UPDATE classes SET active=0 WHERE id=?", (class_id,))
        conn.commit()
        conn.close()
        return {
            "ok": True,
            "success": True,
            "message": f"Class '{class_name}' is referenced by {st_count} students / {ex_count} exams. It has been deactivated."
        }

    conn.execute("DELETE FROM classes WHERE id=?", (class_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "success": True, "message": f"Class '{class_name}' removed."}

@admin_settings_bp.route("/admin/school-settings/grading/save", methods=["POST"])
def admin_save_grading_scheme():
    """Save or update grading scheme with contiguous [0, 100] validation"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    scheme_id = data.get("scheme_id")
    scheme_name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    scheme_type = (data.get("scheme_type") or "school").strip()
    rules = data.get("rules", [])

    if not scheme_name:
        return {"ok": False, "error": "Scheme name is required."}, 400

    # Mathematical Contiguity Validation
    is_valid, val_msg = GradingSchemeValidator.validate_rules(rules)
    if not is_valid:
        return {"ok": False, "error": val_msg}, 400

    conn = get_db_connection()
    try:
        if scheme_id:
            conn.execute("""
                UPDATE grading_schemes SET name=?, description=?, scheme_type=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            """, (scheme_name, description, scheme_type, scheme_id))
            conn.execute("DELETE FROM grading_scheme_rules WHERE scheme_id=?", (scheme_id,))
        else:
            conn.execute("""
                INSERT INTO grading_schemes (name, description, scheme_type, is_default)
                VALUES (?, ?, ?, 0)
            """, (scheme_name, description, scheme_type))
            scheme_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        sorted_rules = sorted(rules, key=lambda x: float(x["min_percentage"]))
        for idx, r in enumerate(sorted_rules):
            conn.execute("""
                INSERT INTO grading_scheme_rules 
                (scheme_id, grade_label, min_percentage, max_percentage, grade_point, remark, badge_color, display_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                scheme_id,
                r.get("grade_label", "").strip(),
                float(r.get("min_percentage", 0)),
                float(r.get("max_percentage", 100)),
                float(r.get("grade_point", 0.0)),
                r.get("remark", "").strip(),
                r.get("badge_color", "#10b981"),
                idx + 1
            ))

        if scheme_type == "school":
            conn.execute("UPDATE school_settings SET active_grading_scheme_id=? WHERE id=1", (scheme_id,))
        else:
            conn.execute("UPDATE ce_settings SET active_ce_grading_scheme_id=? WHERE id=1", (scheme_id,))

        log_action("Admin", session.get("username", "admin"), f"Saved and activated grading scheme '{scheme_name}'", conn=conn)
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        logger.error(f"Error saving grading scheme: {e}")
        return {"ok": False, "error": str(e)}, 500

    conn.close()
    return {
        "ok": True,
        "success": True,
        "scheme_id": scheme_id,
        "message": f"Grading scheme '{scheme_name}' validated, saved, and activated."
    }

@admin_settings_bp.route("/admin/school-settings/grading/set-active", methods=["POST"])
def admin_set_active_grading_scheme():
    """Set the system-wide active grading scheme for school or CE"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    scheme_id = data.get("scheme_id")
    scheme_type = data.get("scheme_type", "school")

    if not scheme_id:
        return {"ok": False, "error": "Scheme ID required"}, 400

    conn = get_db_connection()
    if scheme_type == "school":
        conn.execute("UPDATE school_settings SET active_grading_scheme_id=? WHERE id=1", (scheme_id,))
    else:
        conn.execute("UPDATE ce_settings SET active_ce_grading_scheme_id=? WHERE id=1", (scheme_id,))

    conn.commit()
    conn.close()

    return {"ok": True, "success": True, "message": f"Active {scheme_type} grading scheme updated."}

@admin_settings_bp.route("/admin/school-settings/release-results", methods=["POST"])
def admin_batch_release_results():
    """Batch release or withhold results for specific exams or class"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    exam_ids = data.get("exam_ids", [])
    action = data.get("action", "release") # 'release' or 'withhold'
    released_val = 1 if action == "release" else 0
    policy_val = "immediate" if released_val == 1 else "withheld"

    conn = get_db_connection()
    if exam_ids:
        placeholders = ",".join("?" * len(exam_ids))
        conn.execute(f"UPDATE exams SET results_released=?, result_release_policy=? WHERE id IN ({placeholders})", [released_val, policy_val] + exam_ids)
        conn.execute(f"UPDATE scores SET results_released=? WHERE exam_id IN ({placeholders})", [released_val] + exam_ids)
    elif data.get("release_all"):
        conn.execute("UPDATE exams SET results_released=?, result_release_policy=?", (released_val, policy_val))
        conn.execute("UPDATE scores SET results_released=?", (released_val,))

    log_action("Admin", session.get("username", "admin"), f"{action.capitalize()}d results for {len(exam_ids)} exams", conn=conn)
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "success": True,
        "message": f"Results successfully {'released' if released_val == 1 else 'withheld'}."
    }

# ==========================================
# COMMON ENTRANCE (CE) SETTINGS
# ==========================================

@admin_settings_bp.route("/admin/ce-settings", methods=["GET"])
def admin_ce_settings():
    """Common Entrance Settings Dashboard"""
    if "admin_id" not in session:
        return redirect("/")

    conn = get_db_connection()
    ce_set = conn.execute("SELECT * FROM ce_settings WHERE id=1").fetchone()
    if not ce_set:
        conn.execute("""
            INSERT OR IGNORE INTO ce_settings (id, portal_title, institution_name, admission_session)
            VALUES (1, 'Entrance Examination Portal', 'CogniTara Academy', '2026/2027')
        """)
        conn.commit()
        ce_set = conn.execute("SELECT * FROM ce_settings WHERE id=1").fetchone()

    ce_exams = conn.execute("SELECT * FROM ce_exams ORDER BY id DESC").fetchall()
    conn.close()

    return render_template(
        "admin_ce_settings.html",
        ce_settings=dict(ce_set) if ce_set else {},
        ce_exams=[dict(e) for e in ce_exams]
    )

@admin_settings_bp.route("/admin/ce-settings/update", methods=["POST"])
def admin_update_ce_settings():
    """Update Common Entrance admissions settings (Zero Crosstalk with School Settings)"""
    if "admin_id" not in session:
        return {"ok": False, "error": "Unauthorized"}, 401

    data = request.get_json(silent=True) or request.form

    portal_title = (data.get("portal_title") or "Entrance Examination Portal").strip()
    institution_name = (data.get("institution_name") or "CogniTara Academy").strip()
    admission_session = (data.get("admission_session") or "2026/2027").strip()
    admission_batch = (data.get("admission_batch") or "Batch A").strip()
    registration_open = 1 if str(data.get("registration_open", "1")).lower() in ("1", "true", "on") else 0
    result_visibility = (data.get("result_visibility") or "hidden").strip()
    direct_submit = 1 if str(data.get("direct_submit", "0")).lower() in ("1", "true", "on") else 0
    try:
        default_passing_score = int(data.get("default_passing_score", 50))
    except (ValueError, TypeError):
        default_passing_score = 50

    pending_msg = (data.get("pending_message") or "Your examination has been completed and is currently under administrative review.").strip()
    approved_msg = (data.get("approved_message") or "Congratulations! Your application has been approved for admission.").strip()
    rejected_msg = (data.get("rejected_message") or "We regret to inform you that your application was unsuccessful for this session.").strip()
    anti_cheating_profile = (data.get("anti_cheating_profile") or "medium").strip()

    conn = get_db_connection()
    conn.execute("""
        UPDATE ce_settings SET
            portal_title=?, institution_name=?, admission_session=?, admission_batch=?,
            registration_open=?, direct_submit=?, result_visibility=?, default_passing_score=?,
            pending_message=?, approved_message=?, rejected_message=?,
            anti_cheating_profile=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
    """, (
        portal_title, institution_name, admission_session, admission_batch,
        registration_open, direct_submit, result_visibility, default_passing_score,
        pending_msg, approved_msg, rejected_msg,
        anti_cheating_profile
    ))

    log_action("Admin", session.get("username", "admin"), "Updated Common Entrance settings", conn=conn)
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "success": True,
        "message": "Common Entrance settings saved successfully."
    }


def _resolve_active_db_path_for_admin() -> str:
    from flask import current_app
    from cognitara.config import Config
    db_name = current_app.config.get("DATABASE_NAME") or os.environ.get("COGNITARA_DB_NAME") or Config.DATABASE_NAME
    if os.path.isabs(db_name):
        return os.path.abspath(db_name)
    return os.path.abspath(os.path.join(Config.ROOT_DIR, db_name))


def _resolve_backup_dir_for_admin() -> str:
    from flask import current_app
    from cognitara.config import Config
    env_dir = current_app.config.get("BACKUP_DIR") or os.environ.get("COGNITARA_BACKUP_DIR")
    if env_dir:
        os.makedirs(env_dir, exist_ok=True)
        return os.path.abspath(env_dir)
    fallback = os.path.join(Config.ROOT_DIR, "backups")
    os.makedirs(fallback, exist_ok=True)
    return os.path.abspath(fallback)


@admin_settings_bp.route("/admin/school-settings/inspect-legacy-db", methods=["POST"])
def admin_inspect_legacy_db():
    """Inspect an uploaded former CogniTara exam.db file without altering the active database."""
    if "admin_id" not in session:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    uploaded = request.files.get("db_file")
    if not uploaded or not uploaded.filename:
        return jsonify({"ok": False, "error": "missing_file", "message": "Please select an exam.db file to inspect."}), 400

    ext = os.path.splitext(uploaded.filename)[1].lower()
    if ext not in (".db", ".sqlite", ".sqlite3"):
        return jsonify({"ok": False, "error": "invalid_extension", "message": "Please choose a valid SQLite database file (.db, .sqlite, or .sqlite3)."}), 400

    import tempfile
    from cognitara.services.legacy_db_import import inspect_legacy_database

    with tempfile.TemporaryDirectory(prefix="ct_admin_inspect_") as tmpdir:
        safe_name = secure_filename(uploaded.filename) or "legacy_exam.db"
        tmp_path = os.path.join(tmpdir, safe_name)
        uploaded.save(tmp_path)
        res = inspect_legacy_database(tmp_path)
        res.pop("file_path", None)
        res["file_name"] = uploaded.filename

    return jsonify(res), (200 if res.get("ok") else 400)


@admin_settings_bp.route("/admin/school-settings/import-legacy-db", methods=["POST"])
def admin_import_legacy_db():
    """Atomically import & upgrade an uploaded former CogniTara exam.db into the active school server."""
    if "admin_id" not in session:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    uploaded = request.files.get("db_file")
    if not uploaded or not uploaded.filename:
        return jsonify({"ok": False, "error": "missing_file", "message": "Please select an exam.db file to import."}), 400

    ext = os.path.splitext(uploaded.filename)[1].lower()
    if ext not in (".db", ".sqlite", ".sqlite3"):
        return jsonify({"ok": False, "error": "invalid_extension", "message": "Please choose a valid SQLite database file (.db, .sqlite, or .sqlite3)."}), 400

    preserve_admin = str(request.form.get("preserve_current_admin", "true")).lower() in ("1", "true", "yes", "on")

    import tempfile
    from cognitara.services.legacy_db_import import import_legacy_database

    active_db = _resolve_active_db_path_for_admin()
    backup_dir = _resolve_backup_dir_for_admin()

    with tempfile.TemporaryDirectory(prefix="ct_admin_import_") as tmpdir:
        safe_name = secure_filename(uploaded.filename) or "legacy_exam.db"
        tmp_path = os.path.join(tmpdir, safe_name)
        uploaded.save(tmp_path)
        res = import_legacy_database(
            source_path=tmp_path,
            active_db_path=active_db,
            backup_dir=backup_dir,
            preserve_current_admin=preserve_admin,
            allow_during_active_exam=False,
        )

    if not res.get("ok"):
        status_code = 409 if res.get("error") == "active_exams_in_progress" else 400
        return jsonify(res), status_code

    # Keep the currently signed-in admin's session admin_id aligned with the imported DB
    try:
        conn = get_db_connection()
        try:
            cur_uname = session.get("username", "")
            row = conn.execute(
                "SELECT id, username FROM admin WHERE LOWER(username) = LOWER(?) LIMIT 1",
                (cur_uname,),
            ).fetchone()
            if row:
                session["admin_id"] = row["id"]
                session["username"] = row["username"]
            log_action(
                "Admin",
                session.get("username", "admin"),
                f"Imported legacy database '{uploaded.filename}' (safety backup: {res.get('safety_snapshot')})",
                conn=conn,
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Post-legacy-import session sync note: %s", exc)

    return jsonify(res), 200


@admin_settings_bp.route("/admin/school-settings/db-health", methods=["GET"])
def admin_db_health():
    """Return live SQLite database size, WAL status, integrity check, and table counts."""
    if "admin_id" not in session:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    db_path = _resolve_active_db_path_for_admin()
    size_bytes = os.path.getsize(db_path) if os.path.isfile(db_path) else 0
    conn = get_db_connection()
    try:
        jmode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        ic = conn.execute("PRAGMA quick_check").fetchone()[0]
        table_cnt = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()[0]
        idx_cnt = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='index'").fetchone()[0]
        counts = {}
        for tbl in ("students", "teachers", "exams", "questions", "scores", "exam_question_responses"):
            try:
                counts[tbl] = int(conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0] or 0)
            except Exception:
                counts[tbl] = 0
    finally:
        conn.close()

    return jsonify({
        "ok": True,
        "size_bytes": size_bytes,
        "journal_mode": str(jmode),
        "integrity": str(ic),
        "table_count": int(table_cnt),
        "index_count": int(idx_cnt),
        "counts": counts,
    }), 200


@admin_settings_bp.route("/admin/school-settings/db-optimize", methods=["POST"])
def admin_db_optimize():
    """Run safe online SQLite WAL checkpoint, ANALYZE, PRAGMA optimize, and integrity check."""
    if "admin_id" not in session:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    db_path = _resolve_active_db_path_for_admin()
    before_bytes = os.path.getsize(db_path) if os.path.isfile(db_path) else 0
    conn = get_db_connection()
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("ANALYZE")
        conn.execute("PRAGMA optimize")
        ic = conn.execute("PRAGMA integrity_check").fetchone()[0]
        log_action("Admin", session.get("username", "admin"), f"Optimized database (integrity: {ic})", conn=conn)
        conn.commit()
    finally:
        conn.close()
    after_bytes = os.path.getsize(db_path) if os.path.isfile(db_path) else 0

    return jsonify({
        "ok": True,
        "integrity": str(ic),
        "before_bytes": before_bytes,
        "after_bytes": after_bytes,
        "message": f"Database optimized and verified ({ic}). Query planner statistics refreshed.",
    }), 200


