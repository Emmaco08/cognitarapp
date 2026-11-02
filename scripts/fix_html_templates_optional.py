with open('templates/add_student.html', 'r', encoding='utf-8') as f:
    student_html = f.read()

# Make photo optional in html
student_html = student_html.replace(
    '<input type="file" name="photo" id="photo" accept="image/*" onchange="previewImage(this)" required>',
    '<input type="file" name="photo" id="photo" accept="image/*" onchange="previewImage(this)">'
)
student_html = student_html.replace(
    '<label><i class="fas fa-camera"></i> Profile Photo</label>',
    '<label><i class="fas fa-camera"></i> Profile Photo (Optional)</label>'
)
student_html = student_html.replace(
    '<label><i class="fas fa-envelope"></i> Email</label>',
    '<label><i class="fas fa-envelope"></i> Email Address (Optional)</label>'
)
student_html = student_html.replace('let imageValid = false;', 'let imageValid = true;')

with open('templates/add_student.html', 'w', encoding='utf-8', newline='') as f:
    f.write(student_html)
print("Updated add_student.html!")

with open('templates/add_teacher.html', 'r', encoding='utf-8') as f:
    teacher_html = f.read()

teacher_html = teacher_html.replace(
    '<input type="file" name="photo" id="photo" accept="image/*" required onchange="previewImage(this)">',
    '<input type="file" name="photo" id="photo" accept="image/*" onchange="previewImage(this)">'
)
teacher_html = teacher_html.replace(
    '<label><i class="fas fa-camera"></i> Profile Photo</label>',
    '<label><i class="fas fa-camera"></i> Profile Photo (Optional)</label>'
)
teacher_html = teacher_html.replace('let imageValid = false;', 'let imageValid = true;')

# Add optional email input field if not present
if 'name="email"' not in teacher_html:
    email_block = """                <!-- Email (Optional) -->
                <div class="form-group">
                    <label><i class="fas fa-envelope"></i> Email Address (Optional)</label>
                    <div class="input-group-custom">
                        <i class="fas fa-envelope input-icon"></i>
                        <input type="email" name="email" class="form-control-custom" placeholder="teacher@school.edu">
                    </div>
                </div>
"""
    teacher_html = teacher_html.replace('<!-- Class Teacher Assignment -->', email_block + '                <!-- Class Teacher Assignment -->')

with open('templates/add_teacher.html', 'w', encoding='utf-8', newline='') as f:
    f.write(teacher_html)
print("Updated add_teacher.html!")
