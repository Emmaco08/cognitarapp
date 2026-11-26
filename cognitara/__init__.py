import os
import sys
from flask import Flask, send_from_directory, url_for
from flask_wtf.csrf import generate_csrf, CSRFError

from cognitara.config import Config, resolve_data_dir, resolve_upload_dir
from cognitara.extensions import csrf, limiter
from cognitara.security.csrf_ratelimit import (
    inject_csrf_from_body, handle_csrf_error, ratelimit_handler
)
from cognitara.utils.helpers import sanitize_html, to_nigeria_time
from cognitara.database.connection import get_db_connection
from cognitara.routes import ALL_BLUEPRINTS


class CogniTaraFlask(Flask):
    """Serves uploaded images from writable UPLOAD_FOLDER first when /static/images/* is requested."""

    def send_static_file(self, filename):
        norm = str(filename or "").replace("\\", "/")
        if norm.startswith("images/"):
            rel = norm[len("images/"):]
            upload_dir = self.config.get("UPLOAD_FOLDER") or resolve_upload_dir()
            if upload_dir and rel and "/" not in rel and ".." not in rel:
                candidate = os.path.join(upload_dir, rel)
                if os.path.isfile(candidate):
                    return send_from_directory(upload_dir, rel)
        return super().send_static_file(filename)


def create_app(config_class=Config):
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        asset_root = os.path.abspath(sys._MEIPASS)
    else:
        asset_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    template_dir = os.path.join(asset_root, "templates")
    static_dir = os.path.join(asset_root, "static")

    app = CogniTaraFlask(
        "cognitara",
        template_folder=template_dir,
        static_folder=static_dir
    )

    if isinstance(config_class, dict):
        app.config.update(config_class)
        app.secret_key = config_class.get("SECRET_KEY", "default-secret")
    else:
        app.config.from_object(config_class)
        app.secret_key = getattr(config_class, "SECRET_KEY", "default-secret")

    if not app.config.get("UPLOAD_FOLDER") or os.environ.get("COGNITARA_DATA_DIR") or getattr(sys, "frozen", False):
        if not (isinstance(config_class, dict) and config_class.get("UPLOAD_FOLDER")):
            app.config["UPLOAD_FOLDER"] = resolve_upload_dir()
            app.config["ROOT_DIR"] = resolve_data_dir()
    
    # Jinja globals & filters
    from cognitara.database.repositories.results import (
        get_scores, get_score_details, get_student_average, get_class_average,
        get_highest_score_in_class, get_total_passed_exams, get_highest_average_in_class
    )
    app.jinja_env.globals['csrf_token'] = generate_csrf
    app.jinja_env.globals.update(
        get_scores=get_scores,
        get_score_details=get_score_details,
        get_student_average=get_student_average,
        get_class_average=get_class_average,
        get_highest_score_in_class=get_highest_score_in_class,
        get_total_passed_exams=get_total_passed_exams,
        get_highest_average_in_class=get_highest_average_in_class,
        wat_time=to_nigeria_time
    )
    app.jinja_env.filters['sanitize'] = sanitize_html
    app.jinja_env.filters['wat_time'] = to_nigeria_time

    # Security middleware & request pre-processors
    app.before_request(inject_csrf_from_body)
    from cognitara.security.license_guard import (
        enforce_license_before_request,
        get_license_guard,
        should_enforce_license,
    )
    app.before_request(enforce_license_before_request)

    # Initialize extensions
    csrf.init_app(app)
    limiter.init_app(app)

    # Initialize structured logging
    from cognitara.logging_config import setup_logging
    setup_logging(app)

    # Error handlers
    app.register_error_handler(CSRFError, handle_csrf_error)
    app.register_error_handler(429, ratelimit_handler)

    # Resilient session interface: skips static/upload requests (zero Set-Cookie spam on assets)
    # and tolerates minor negative NTP/Windows clock skew while strictly preserving HMAC verification.
    from flask.sessions import SecureCookieSessionInterface
    from itsdangerous import BadSignature, SignatureExpired
    import time as _time

    class _ResilientSessionInterface(SecureCookieSessionInterface):
        @staticmethod
        def _is_asset_path(path):
            return bool(path) and (
                path.startswith("/static/")
                or path.startswith("/uploads/")
                or path == "/favicon.ico"
            )

        def open_session(self, app_obj, req):
            if self._is_asset_path(req.path):
                return self.session_class()
            s = self.get_signing_serializer(app_obj)
            if s is None:
                return None
            val = req.cookies.get(self.get_cookie_name(app_obj))
            if not val:
                return self.session_class()
            max_age = int(app_obj.permanent_session_lifetime.total_seconds())
            try:
                data = s.loads(val, max_age=max_age)
                return self.session_class(data)
            except SignatureExpired:
                try:
                    data, ts = s.loads(val, max_age=None, return_timestamp=True)
                    age = _time.time() - ts.timestamp()
                    if -600 <= age <= max_age:
                        return self.session_class(data)
                except BadSignature:
                    pass
                return self.session_class()
            except BadSignature:
                return self.session_class()

        def should_set_cookie(self, app_obj, sess):
            from flask import request as _req
            if self._is_asset_path(_req.path):
                return False
            return bool(sess.modified)

        def save_session(self, app_obj, sess, response):
            from flask import request as _req
            if self._is_asset_path(_req.path):
                return
            return super().save_session(app_obj, sess, response)

    app.session_interface = _ResilientSessionInterface()

    def _has_avatar_file(filename):
        if not filename:
            return False
        norm = str(filename).strip().replace("\\", "/")
        if not norm or norm in ("default.png", "None", "null") or "/" in norm or ".." in norm or norm.startswith("."):
            return False
        upload_dir = app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER
        if upload_dir and os.path.isfile(os.path.join(upload_dir, norm)):
            return True
        if os.path.isfile(os.path.join(static_dir, "images", norm)):
            return True
        return False

    app.jinja_env.globals["has_avatar_file"] = _has_avatar_file

    @app.before_request
    def keep_authenticated_session_alive():
        from flask import request, session as _sess
        if request.path.startswith("/static/") or request.path.startswith("/uploads/") or request.path == "/favicon.ico":
            return
        if any(k in _sess for k in ("admin_id", "teacher_id", "student_id", "ce_student_id")):
            if not _sess.permanent:
                _sess.permanent = True
            now_ts = int(_time.time())
            last_refresh = int(_sess.get("_refreshed_at") or 0)
            if now_ts - last_refresh >= 43200:
                _sess["_refreshed_at"] = now_ts

    @app.errorhandler(413)
    def handle_large_payload(error):
        from flask import request
        if request.is_json or request.path.startswith('/api/'):
            return {"error": "Payload too large", "message": "Uploaded content exceeds the server limit."}, 413
        return "Uploaded content exceeds the configured server upload limit.", 413

    @app.errorhandler(500)
    def handle_server_error(error):
        from flask import request
        app.logger.error(f"Internal server error: {error}")
        if request.is_json or request.path.startswith('/api/'):
            return {"error": "Internal server error", "message": "An unexpected server error occurred."}, 500
        return "An internal server error occurred.", 500

    # 100% Backward compatibility for un-prefixed url_for('endpoint') calls
    def handle_build_error(error, endpoint, values):
        for rule in app.url_map.iter_rules():
            if rule.endpoint.endswith('.' + endpoint) or rule.endpoint == endpoint:
                return url_for(rule.endpoint, **values)
        raise error

    app.url_build_error_handlers.append(handle_build_error)

    @app.context_processor
    def inject_school_branding():
        branding = {
            "school_name": "CogniTara School",
            "school_motto": "Knowledge, Discipline, Excellence",
            "school_address": "",
            "school_phone": "",
            "school_email": "",
            "academic_session": "2026/2027",
            "current_term": "First Term",
            "school_logo": None,
            "school_logo_url": None,
            "initials": "CT",
            "anti_cheating_profile": "medium",
            "max_warnings": 5,
            "default_result_visibility": "immediate",
        }
        ce_branding = {
            "portal_title": "Entrance Examination Portal",
            "institution_name": "CogniTara Academy",
            "admission_session": "2026/2027",
            "admission_batch": "Batch A",
            "registration_open": 1,
            "direct_submit": 0,
            "result_visibility": "hidden",
            "default_passing_score": 50,
            "anti_cheating_profile": "medium",
            "pending_message": "Your examination has been completed and is currently under administrative review.",
            "approved_message": "Congratulations! Your application has been approved for admission.",
            "rejected_message": "We regret to inform you that your application was unsuccessful for this session.",
        }
        school_classes = []
        admin_nav_counts = {"exams_count": 0, "ce_exams_count": 0, "pending_count": 0}
        is_class_teacher = False
        teacher_form_class = ""
        try:
            from flask import session as _sess
            conn = get_db_connection()
            try:
                row = conn.execute("SELECT * FROM school_settings WHERE id = 1").fetchone()
                if row:
                    rdict = dict(row)
                    if rdict.get("school_name"):
                        branding["school_name"] = rdict["school_name"]
                    if rdict.get("school_motto") is not None:
                        branding["school_motto"] = rdict["school_motto"]
                    if rdict.get("school_address") is not None:
                        branding["school_address"] = rdict["school_address"]
                    if rdict.get("school_phone") is not None:
                        branding["school_phone"] = rdict["school_phone"]
                    if rdict.get("school_email") is not None:
                        branding["school_email"] = rdict["school_email"]
                    if rdict.get("academic_session"):
                        branding["academic_session"] = rdict["academic_session"]
                    if rdict.get("current_term"):
                        branding["current_term"] = rdict["current_term"]
                    if rdict.get("anti_cheating_profile"):
                        branding["anti_cheating_profile"] = rdict["anti_cheating_profile"]
                    if rdict.get("max_warnings"):
                        try:
                            branding["max_warnings"] = max(1, int(rdict["max_warnings"]))
                        except (TypeError, ValueError):
                            pass
                    if rdict.get("default_result_visibility"):
                        branding["default_result_visibility"] = rdict["default_result_visibility"]
                    if rdict.get("school_logo"):
                        raw_logo = str(rdict["school_logo"]).strip().replace("\\", "/")
                        logo_name = os.path.basename(raw_logo)
                        if logo_name and logo_name not in ("None", "null", "default.png", "default_logo.png"):
                            upload_dir = app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER
                            upload_path = os.path.join(upload_dir, logo_name) if upload_dir else ""
                            static_path = os.path.join(static_dir, "images", logo_name)
                            found_path = upload_path if (upload_path and os.path.isfile(upload_path)) else (static_path if os.path.isfile(static_path) else None)
                            if found_path:
                                branding["school_logo"] = logo_name
                                try:
                                    ver = int(os.path.getmtime(found_path))
                                except OSError:
                                    ver = 1
                                branding["school_logo_url"] = f"/uploads/images/{logo_name}?v={ver}"
                try:
                    ce_row = conn.execute("SELECT * FROM ce_settings WHERE id = 1").fetchone()
                    if ce_row:
                        for k, v in dict(ce_row).items():
                            if v is not None:
                                ce_branding[k] = v
                except Exception:
                    pass
                try:
                    cls_rows = conn.execute(
                        "SELECT id, name, level_category, display_order FROM classes WHERE active = 1 ORDER BY display_order ASC, name ASC"
                    ).fetchall()
                    school_class_rows = [dict(c) for c in cls_rows]
                    school_classes = [str(c["name"]).strip() for c in cls_rows if c["name"] and str(c["name"]).strip()]
                except Exception:
                    school_class_rows = []
                    school_classes = []
                if "admin_id" in _sess:
                    try:
                        admin_nav_counts["exams_count"] = int(conn.execute("SELECT COUNT(*) FROM exams").fetchone()[0] or 0)
                        admin_nav_counts["ce_exams_count"] = int(conn.execute("SELECT COUNT(*) FROM ce_exams").fetchone()[0] or 0)
                        admin_nav_counts["pending_count"] = int(
                            conn.execute("SELECT COUNT(*) FROM pending_registrations WHERE status='pending'").fetchone()[0] or 0
                        )
                    except Exception:
                        pass
                if "teacher_id" in _sess:
                    try:
                        t_row = conn.execute(
                            "SELECT COALESCE(class_teacher_of, '') AS class_teacher_of FROM teachers WHERE id = ?",
                            (_sess["teacher_id"],),
                        ).fetchone()
                        if t_row and str(t_row["class_teacher_of"] or "").strip():
                            is_class_teacher = True
                            teacher_form_class = str(t_row["class_teacher_of"]).strip()
                    except Exception:
                        pass
            finally:
                conn.close()
        except Exception:
            school_class_rows = []
        if not school_classes:
            school_classes = [f"Grade {i}" for i in range(1, 13)]
            school_class_rows = [{"id": i, "name": f"Grade {i}", "level_category": "General", "display_order": i * 10} for i in range(1, 13)]
        parts = [w[0].upper() for w in str(branding["school_name"]).split() if w]
        branding["initials"] = "".join(parts[:2]) or "CT"
        return {
            "school_branding": branding,
            "ce_branding": ce_branding,
            "school_classes": school_classes,
            "school_class_rows": school_class_rows,
            "admin_nav_counts": admin_nav_counts,
            "is_class_teacher": is_class_teacher,
            "teacher_form_class": teacher_form_class,
        }

    # Serve user-uploaded logos/photos from writable UPLOAD_FOLDER (path-traversal hardened)
    @app.route("/uploads/images/<path:filename>")
    def serve_uploaded_image(filename):
        from flask import abort
        norm = str(filename or "").replace("\\", "/")
        if not norm or "/" in norm or ".." in norm or norm.startswith("."):
            abort(404)
        upload_dir = app.config.get("UPLOAD_FOLDER") or resolve_upload_dir()
        if upload_dir and os.path.isfile(os.path.join(upload_dir, norm)):
            return send_from_directory(upload_dir, norm)
        return send_from_directory(os.path.join(static_dir, "images"), norm)

    @app.after_request
    def apply_security_headers(response):
        from flask import request
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if not request.path.startswith("/static/") and not request.path.startswith("/uploads/"):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            response.headers.setdefault("Pragma", "no-cache")
        return response

    @app.route("/health")
    def health_check():
        return {"status": "ok", "service": "CogniTara Offline Examination Portal"}, 200

    # Register all modular blueprints
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)

    # Safe startup non-destructive schema bootstrap & validation
    try:
        from cognitara.database.bootstrap import ensure_core_database_initialized
        root_dir = app.config.get("ROOT_DIR") or resolve_data_dir()
        db_target = os.environ.get("COGNITARA_DB_NAME") or app.config.get("DATABASE_NAME") or os.path.join(root_dir, "exam.db")
        if not os.path.isabs(db_target):
            db_target = os.path.abspath(os.path.join(root_dir, db_target))
        ensure_core_database_initialized(
            db_target,
            upload_folder=app.config.get("UPLOAD_FOLDER") or resolve_upload_dir(),
            seed_sample_users=False,
        )
    except Exception as e:
        app.logger.warning(f"Startup database initialization note: {e}")

    # Start 60-second monotonic license watchdog when enforcement is active
    try:
        guard = get_license_guard()
        app.extensions["license_guard"] = guard
        if should_enforce_license(app):
            guard.evaluate(advance_monotonic=False)
            if os.environ.get("COGNITARA_VAULT_READONLY_WATCHDOG", "").strip() != "1":
                guard.start_watchdog()
    except Exception as e:
        app.logger.warning(f"License watchdog startup note: {e}")

    return app
