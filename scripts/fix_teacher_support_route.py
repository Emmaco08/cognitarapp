with open('cognitara/routes/teacher.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """    conn.close()
    
    return render_template("teacher_technical_support.html", active_attempts=active_attempts)"""

new_code = """    attempts_list = [dict(a) for a in active_attempts]
    total_active = len(attempts_list)
    total_running = len([a for a in attempts_list if not a.get("is_paused")])
    total_paused = len([a for a in attempts_list if a.get("is_paused")])
    total_requests = len([a for a in attempts_list if a.get("resume_requested")])
    conn.close()
    
    return render_template(
        "teacher_technical_support.html",
        active_attempts=attempts_list,
        total_active=total_active,
        total_running=total_running,
        total_paused=total_paused,
        total_requests=total_requests
    )"""

if old_code.replace('\n', '\r\n') in content:
    content = content.replace(old_code.replace('\n', '\r\n'), new_code.replace('\n', '\r\n'))
elif old_code in content:
    content = content.replace(old_code, new_code)

with open('cognitara/routes/teacher.py', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print("Updated teacher_technical_support route successfully!")
