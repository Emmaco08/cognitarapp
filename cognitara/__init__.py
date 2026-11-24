import os
import sys
from flask import Flask, url_for
from flask_wtf.csrf import generate_csrf, CSRFError

from cognitara.config import Config
from cognitara.extensions import csrf, limiter
from cognitara.security.csrf_ratelimit import (
    inject_csrf_from_body, handle_csrf_error, ratelimit_handler
)
from cognitara.utils.helpers import sanitize_html, to_nigeria_time
from cognitara.database.connection import get_db_connection
from cognitara.routes import ALL_BLUEPRINTS

def create_app(config_class=Config):
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        asset_root = os.path.abspath(sys._MEIPASS)
    else:
        asset_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    template_dir = os.path.join(asset_root, "templates")
    static_dir = os.path.join(asset_root, "static")

    app = Flask(
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

    @app.errorhandler(413)
    def handle_large_payload(error):
        from flask import request
        if request.is_json or request.path.startswith('/api/'):
            return {"error": "Payload too large", "message": "Uploaded content exceeds 16MB limit."}, 413
        return "Uploaded content exceeds maximum allowed size (16MB).", 413

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

    # Serve user-uploaded logos/photos from writable UPLOAD_FOLDER when frozen
    if getattr(sys, "frozen", False):
        from flask import send_from_directory

        @app.route("/uploads/images/<path:filename>")
        def serve_uploaded_image(filename):
            upload_dir = app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER
            if upload_dir and os.path.isfile(os.path.join(upload_dir, filename)):
                return send_from_directory(upload_dir, filename)
            return send_from_directory(os.path.join(static_dir, "images"), filename)

    @app.route("/health")
    def health_check():
        return {"status": "ok", "service": "CogniTara Offline Examination Portal"}, 200

    # Register all modular blueprints
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)

    # Safe startup non-destructive schema bootstrap & validation
    try:
        from cognitara.database.bootstrap import ensure_core_database_initialized
        db_target = os.environ.get("COGNITARA_DB_NAME") or app.config.get("DATABASE_NAME") or Config.DATABASE_NAME
        if not os.path.isabs(db_target):
            db_target = os.path.abspath(os.path.join(Config.ROOT_DIR, db_target))
        ensure_core_database_initialized(
            db_target,
            upload_folder=app.config.get("UPLOAD_FOLDER") or Config.UPLOAD_FOLDER,
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
