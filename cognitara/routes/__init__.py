from cognitara.routes.home import home_bp
from cognitara.routes.auth import auth_bp
from cognitara.routes.student import student_bp
from cognitara.routes.examinations.regular import exam_regular_bp
from cognitara.routes.examinations.common_entrance import exam_ce_bp
from cognitara.routes.teacher import teacher_bp
from cognitara.routes.admin.dashboard import admin_dashboard_bp
from cognitara.routes.admin.users import admin_users_bp
from cognitara.routes.admin.support import admin_support_bp
from cognitara.routes.admin.exams import admin_exams_bp
from cognitara.routes.admin.results import admin_results_bp
from cognitara.routes.admin.common_entrance import admin_ce_bp
from cognitara.routes.admin.settings import admin_settings_bp

ALL_BLUEPRINTS = [
    home_bp,
    auth_bp,
    student_bp,
    exam_regular_bp,
    exam_ce_bp,
    teacher_bp,
    admin_dashboard_bp,
    admin_users_bp,
    admin_support_bp,
    admin_exams_bp,
    admin_results_bp,
    admin_ce_bp,
    admin_settings_bp,
]
