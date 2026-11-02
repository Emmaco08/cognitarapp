"""
CogniTara Offline Examination Portal
Backward-compatible application entry point and launcher.
The monolithic codebase has been fully refactored into the modular `cognitara` package.
"""

from cognitara import create_app
from cognitara.config import Config
from cognitara.extensions import csrf, limiter
from cognitara.database.connection import get_db_connection
from cognitara.database.initialization import (
    ensure_deadline_columns,
    ensure_force_submit_column,
    ensure_section_active_column,
    init_analytics_tables,
    init_exam_management_tables,
)
from cognitara.security.csrf_ratelimit import validate_csrf, get_csrf_token
from cognitara.security.passwords import verify_and_upgrade_password
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.grading_service import (
    finalize_regular_exam_attempt,
    finalize_ce_exam_attempt,
)
from cognitara.services.answer_service import save_regular_answer, save_ce_answer
from cognitara.services.session_service import (
    process_regular_heartbeat,
    process_ce_heartbeat,
    resume_regular_attempt,
    resume_ce_attempt,
)
from cognitara.services.violation_service import (
    log_regular_warning,
    log_ce_warning,
    reset_warnings,
)

# Shared application instance for WSGI, Flask CLI, and runner scripts
app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)