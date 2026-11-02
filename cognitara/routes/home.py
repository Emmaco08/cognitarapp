import os
import sqlite3
import random
import secrets
import math
import re
import json
import io
import csv
from datetime import datetime, timedelta, timezone
from flask import Blueprint, render_template, request, redirect, session, url_for, send_file, Response, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from cognitara.database.connection import get_db_connection
from cognitara.security.csrf_ratelimit import validate_csrf, get_csrf_token
from cognitara.security.passwords import verify_and_upgrade_password
from cognitara.security.permissions import (
    is_admin, is_teacher, is_student, require_admin, require_teacher, require_student
)
from cognitara.utils.helpers import (
    SafeMathEvaluator, sanitize_html, get_utc_now, log_action, compress_image
)
from cognitara.services.timing_service import calculate_authoritative_remaining_time
from cognitara.services.grading_service import (
    finalize_regular_exam_attempt, finalize_ce_exam_attempt
)
from cognitara.services.answer_service import save_regular_answer, save_ce_answer
from cognitara.services.session_service import (
    process_regular_heartbeat, process_ce_heartbeat, resume_regular_attempt, resume_ce_attempt
)
from cognitara.services.violation_service import (
    log_regular_warning, log_ce_warning, reset_warnings
)
from cognitara.database.repositories.results import (
    get_scores, get_score_details, get_student_average, get_class_average,
    get_highest_score_in_class, get_total_passed_exams, get_highest_average_in_class
)
from cognitara.extensions import limiter
from flask_limiter.util import get_remote_address
home_bp = Blueprint('home', __name__)

@home_bp.route('/avatar', endpoint='avatar')
def avatar():
    """Generates local lightweight SVG avatars offline, replacing ui-avatars.com."""
    import re
    name = request.args.get('name', 'User')
    parts = [p for p in name.split() if p]
    if len(parts) >= 2:
        initials = (parts[0][0] + parts[1][0]).upper()
    elif parts:
        initials = parts[0][:2].upper()
    else:
        initials = "U"
    initials = re.sub(r'[^A-Z0-9]', '', initials) or 'U'
    
    hex_re = re.compile(r'^[0-9a-fA-F]{3,8}$')
    bg = request.args.get('background', '1a56db').replace('#', '').strip()
    color = request.args.get('color', 'ffffff').replace('#', '').strip()
    if not hex_re.match(bg):
        bg = '1a56db'
    if not hex_re.match(color):
        color = 'ffffff'
        
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <rect width="128" height="128" rx="64" fill="#{bg}"/>
        <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="700" fill="#{color}" dominant-baseline="middle" text-anchor="middle">{initials}</text>
    </svg>'''
    return Response(svg, mimetype='image/svg+xml')


@home_bp.route("/")
def start():
    return render_template("start.html")


@home_bp.route("/api/calculate", methods=["POST"])
def api_calculate():
    data = request.get_json(silent=True) or {}
    expression = data.get("expression", "")
    angle_unit = data.get("angle_unit", "deg")
    if not expression:
        return {"success": True, "result": "0"}
    try:
        result = SafeMathEvaluator.evaluate(expression, angle_unit=angle_unit)
        if isinstance(result, float):
            if result.is_integer():
                result = int(result)
            else:
                result = round(result, 10)
                result_str = str(result).rstrip('0').rstrip('.')
                result = float(result_str) if '.' in result_str else int(result_str)
        return {"success": True, "result": str(result)}
    except ZeroDivisionError:
        return {"success": False, "error": "Division by zero", "result": "Error"}
    except (ValueError, SyntaxError, OverflowError) as e:
        return {"success": False, "error": str(e), "result": "Error"}
    except Exception as e:
        return {"success": False, "error": "Calculation error", "result": "Error"}


@home_bp.route("/api/stats")
def api_stats():
    """API endpoint to get real statistics for the start page"""
    conn = get_db_connection()
    
    # Get total number of approved students
    students_count = conn.execute(
        "SELECT COUNT(*) as count FROM students WHERE status='approved'"
    ).fetchone()["count"]
    
    # Get total number of exams
    exams_count = conn.execute(
        "SELECT COUNT(*) as count FROM exams"
    ).fetchone()["count"]
    
    conn.close()
    
    return {
        "students": students_count,
        "exams": exams_count
    }


