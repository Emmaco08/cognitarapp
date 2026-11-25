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

    @app.before_request
    def keep_authenticated_session_alive():
        from flask import session as _sess
        if any(k in _sess for k in ("admin_id", "teacher_id", "student_id", "ce_student_id")):
            _sess.permanent = True

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
            "academic_session": "2026/2027",
            "current_term": "First Term",
            "school_logo": None,
            "initials": "CT",
        }
        try:
            conn = get_db_connection()
            try:
                row = conn.execute(
                    "SELECT school_name, school_motto, academic_session, current_term, school_logo "
                    "FROM school_settings WHERE id = 1"
                ).fetchone()
                if row:
                    if row["school_name"]:
                        branding["school_name"] = row["school_name"]
                    if row["school_motto"]:
                        branding["school_motto"] = row["school_motto"]
                    if row["academic_session"]:
                        branding["academic_session"] = row["academic_session"]
                    if row["current_term"]:
                        branding["current_term"] = row["current_term"]
                    if row["school_logo"]:
                        logo_name = str(row["school_logo"]).strip()
                        upload_dir = app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER
                        has_upload = bool(upload_dir and os.path.isfile(os.path.join(upload_dir, logo_name)))
                        has_static = os.path.isfile(os.path.join(static_dir, "images", logo_name))
                        if has_upload or has_static:
                            branding["school_logo"] = logo_name
            finally:
                conn.close()
        except Exception:
            pass
        parts = [w[0].upper() for w in str(branding["school_name"]).split() if w]
        branding["initials"] = "".join(parts[:2]) or "CT"
        return {"school_branding": branding}

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
