import re

# 1. Update cognitara/routes/admin/users.py
with open('cognitara/routes/admin/users.py', 'r', encoding='utf-8') as f:
    users_code = f.read()

# Edit student log_action
old_edit_student = """            conn.commit()
            return redirect("/admin")
        
        return render_template("edit_student.html", student=student_dict)"""

new_edit_student = """            log_action("Admin", session.get("username", "admin"), f"Updated student '{username}'", conn=conn)
            conn.commit()
            return redirect("/admin")
        
        return render_template("edit_student.html", student=student_dict)"""

if old_edit_student in users_code:
    users_code = users_code.replace(old_edit_student, new_edit_student)
elif old_edit_student.replace('\n', '\r\n') in users_code:
    users_code = users_code.replace(old_edit_student.replace('\n', '\r\n'), new_edit_student.replace('\n', '\r\n'))

# Add student optional email & photo + log_action
old_add_student = """        # 🚨 ADD THIS LINE to get specialisation from the form
        specialisation = request.form.get("specialisation", "General") 
        
        file = request.files['photo']
        
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM students WHERE username = ?", (username,)).fetchone()
        
        if existing:
            conn.close()
            return render_template("add_student.html", error="Username already exists!")
        
        safe_user = secure_filename(username) or "new_student"
        filename = f"student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
        save_path = os.path.join("static/images", filename)
        success = compress_image(file, save_path, 50)
        
        # 🚨 UPDATE THE SQL to insert the specialisation
        conn.execute(\"\"\"INSERT INTO students (full_name, username, password, class, specialisation, photo, status, approved_at) 
                       VALUES (?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)\"\"\",
                     (full_name, username, password, class_name, specialisation, filename))
        conn.commit()"""

new_add_student = """        specialisation = request.form.get("specialisation", "General")
        email = request.form.get("email", "").strip()
        
        file = request.files.get('photo')
        
        conn = get_db_connection()
        existing = conn.execute("SELECT id FROM students WHERE username = ?", (username,)).fetchone()
        
        if existing:
            conn.close()
            return render_template("add_student.html", error="Username already exists!")
        
        filename = "default.png"
        if file and file.filename != "":
            safe_user = secure_filename(username) or "new_student"
            cand_name = f"student_{safe_user}_{int(datetime.now().timestamp())}.jpg"
            save_path = os.path.join("static/images", cand_name)
            if compress_image(file, save_path, 50):
                filename = cand_name
        
        conn.execute(\"\"\"INSERT INTO students (full_name, username, password, class, specialisation, email, photo, status, approved_at) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)\"\"\",
                     (full_name, username, password, class_name, specialisation, email, filename))
        log_action("Admin", session.get("username", "admin"), f"Created student '{username}' ({class_name})", conn=conn)
        conn.commit()"""

if old_add_student in users_code:
    users_code = users_code.replace(old_add_student, new_add_student)
elif old_add_student.replace('\n', '\r\n') in users_code:
    users_code = users_code.replace(old_add_student.replace('\n', '\r\n'), new_add_student.replace('\n', '\r\n'))

# Add teacher optional email & photo + log_action
old_add_teacher = """        file = request.files['photo']
        
        conn = get_db_connection()
        
        existing = conn.execute("SELECT id FROM teachers WHERE username = ?", (username,)).fetchone()
        if existing:
            conn.close()
            return render_template("add_teacher.html", error="Username already exists!")
        
        safe_user = secure_filename(username) or "new_teacher"
        filename = f"teacher_{safe_user}_{int(datetime.now().timestamp())}.jpg"
        save_path = os.path.join("static/images", filename)
        
        success = compress_image(file, save_path, 50)
        if not success:
            conn.close()
            return render_template("add_teacher.html", error="Photo could not be saved. Please try another image.")
        
        # Insert teacher with primary class (for backward compatibility)
        primary_class = class_names[0] if class_names else ""
        primary_specialisation = specialisations[0] if specialisations else "General"
        
        cursor = conn.cursor()
        cursor.execute(\"\"\"
            INSERT INTO teachers (username, password, class, photo, class_teacher_of) 
            VALUES (?, ?, ?, ?, ?)
        \"\"\", (username, password, primary_class, filename, class_teacher_of))"""

new_add_teacher = """        email = request.form.get("email", "").strip()
        file = request.files.get('photo')
        
        conn = get_db_connection()
        
        existing = conn.execute("SELECT id FROM teachers WHERE username = ?", (username,)).fetchone()
        if existing:
            conn.close()
            return render_template("add_teacher.html", error="Username already exists!")
        
        filename = "default.png"
        if file and file.filename != "":
            safe_user = secure_filename(username) or "new_teacher"
            cand_name = f"teacher_{safe_user}_{int(datetime.now().timestamp())}.jpg"
            save_path = os.path.join("static/images", cand_name)
            if compress_image(file, save_path, 50):
                filename = cand_name
        
        # Insert teacher with primary class (for backward compatibility)
        primary_class = class_names[0] if class_names else ""
        primary_specialisation = specialisations[0] if specialisations else "General"
        
        cursor = conn.cursor()
        try:
            cursor.execute(\"\"\"
                INSERT INTO teachers (username, password, class, photo, class_teacher_of, email) 
                VALUES (?, ?, ?, ?, ?, ?)
            \"\"\", (username, password, primary_class, filename, class_teacher_of, email))
        except sqlite3.OperationalError:
            cursor.execute(\"\"\"
                INSERT INTO teachers (username, password, class, photo, class_teacher_of) 
                VALUES (?, ?, ?, ?, ?)
            \"\"\", (username, password, primary_class, filename, class_teacher_of))"""

if old_add_teacher in users_code:
    users_code = users_code.replace(old_add_teacher, new_add_teacher)
elif old_add_teacher.replace('\n', '\r\n') in users_code:
    users_code = users_code.replace(old_add_teacher.replace('\n', '\r\n'), new_add_teacher.replace('\n', '\r\n'))

# Add teacher log_action right before conn.commit() in add_teacher
teacher_commit_old = """        conn.commit()
        conn.close()
        return redirect("/admin")
    
    return render_template("add_teacher.html", error=None)"""

teacher_commit_new = """        log_action("Admin", session.get("username", "admin"), f"Created teacher '{username}'", conn=conn)
        conn.commit()
        conn.close()
        return redirect("/admin")
    
    return render_template("add_teacher.html", error=None)"""

if teacher_commit_old in users_code:
    users_code = users_code.replace(teacher_commit_old, teacher_commit_new)
elif teacher_commit_old.replace('\n', '\r\n') in users_code:
    users_code = users_code.replace(teacher_commit_old.replace('\n', '\r\n'), teacher_commit_new.replace('\n', '\r\n'))

with open('cognitara/routes/admin/users.py', 'w', encoding='utf-8', newline='') as f:
    f.write(users_code)

print("Updated cognitara/routes/admin/users.py successfully!")
