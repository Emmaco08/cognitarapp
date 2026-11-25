from flask import request, render_template, current_app
from flask_wtf.csrf import generate_csrf, validate_csrf as _wtf_val
import json

def get_csrf_token():
    return generate_csrf()

def validate_csrf(token=None):
    try:
        if current_app and current_app.config.get("WTF_CSRF_ENABLED") is False:
            return True
        if not token:
            token = request.form.get('csrf_token') or request.headers.get('X-CSRFToken') or request.headers.get('X-CSRF-Token')
            if not token and request.is_json:
                token = (request.get_json(silent=True) or {}).get('csrf_token')
        if not token:
            return False
        _wtf_val(token)
        return True
    except Exception:
        return False

def inject_csrf_from_body():
    """
    Pre-extract CSRF token from JSON body or raw text (sendBeacon) into environ for Flask-WTF.
    """
    if "HTTP_X_CSRFTOKEN" not in request.environ and "HTTP_X_CSRF_TOKEN" not in request.environ:
        token = None
        if request.is_json:
            json_data = request.get_json(silent=True) or {}
            token = json_data.get("csrf_token")
        else:
            c_type = request.content_type or ""
            if "text/plain" in c_type or "application/json" in c_type:
                try:
                    raw_data = json.loads(request.get_data(as_text=True))
                    if isinstance(raw_data, dict):
                        token = raw_data.get("csrf_token")
                except Exception:
                    pass
        if token:
            request.environ["HTTP_X_CSRFTOKEN"] = str(token)

def handle_csrf_error(e):
    from flask import session, redirect, url_for
    if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {
            "error": "CSRF validation failed",
            "reason": getattr(e, 'description', 'Invalid token'),
            "message": "Your security token expired. Please refresh the page and try again."
        }, 400
    # Never display the login screen to an already authenticated user — keep them in their portal
    if "admin_id" in session or "teacher_id" in session or "student_id" in session or "ce_student_id" in session:
        ref = request.referrer
        if ref and request.host in ref and ref != request.url:
            return redirect(ref)
        if "admin_id" in session:
            return redirect("/admin")
        if "teacher_id" in session:
            return redirect("/teacher")
        if "student_id" in session:
            return redirect("/dashboard")
        if "ce_student_id" in session:
            return redirect("/ce_dashboard")
    if request.path.startswith("/ce_login"):
        return render_template("ce_login.html", error="Security verification failed (token invalid or expired). Please try again."), 400
    return render_template("login.html", error="Security verification failed (token invalid or expired). Please try again."), 400

def ratelimit_handler(e):
    limit_desc = str(e.description) if hasattr(e, 'description') else "Too many requests"
    msg = "Too many failed login attempts. Please wait a minute before trying again."
    if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return {"error": "Rate limit exceeded", "message": msg, "detail": limit_desc}, 429
    if request.path.startswith("/ce_login"):
        return render_template("ce_login.html", error=msg), 429
    return render_template("login.html", error=msg), 429
