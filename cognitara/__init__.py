import os
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
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    template_dir = os.path.join(project_root, "templates")
    static_dir = os.path.join(project_root, "static")

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

    @app.route("/health")
    def health_check():
        return {"status": "ok", "service": "CogniTara Offline Examination Portal"}, 200

    # Register all modular blueprints
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)

    # Safe startup non-destructive schema validation & table initialization
    try:
        from cognitara.database.initialization import init_analytics_tables, init_exam_management_tables
        conn = get_db_connection()
        init_analytics_tables(conn)
        init_exam_management_tables(conn)
        conn.close()
    except Exception as e:
        app.logger.warning(f"Startup database initialization note: {e}")

    return app
