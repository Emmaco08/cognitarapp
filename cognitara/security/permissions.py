from functools import wraps
from flask import session, redirect, url_for, request

def is_admin():
    return session.get("role") == "Admin" or "admin_id" in session

def is_teacher():
    return session.get("role") == "Teacher" or "teacher_id" in session

def is_student():
    return session.get("role") == "Student" or "student_id" in session

def is_ce_student():
    return "ce_student_id" in session

def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin():
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"error": "Unauthorized", "message": "Admin privileges required"}, 401
            return redirect("/")
        return f(*args, **kwargs)
    return decorated_function

def require_teacher(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_teacher() and not is_admin():
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"error": "Unauthorized", "message": "Teacher privileges required"}, 401
            return redirect("/")
        return f(*args, **kwargs)
    return decorated_function

def require_student(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_student():
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"error": "Unauthorized", "message": "Student login required"}, 401
            return redirect("/")
        return f(*args, **kwargs)
    return decorated_function

def require_ce_student(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_ce_student():
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return {"error": "Unauthorized", "message": "Common Entrance student login required"}, 401
            return redirect("/ce_login")
        return f(*args, **kwargs)
    return decorated_function
