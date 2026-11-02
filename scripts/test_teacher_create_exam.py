import os
import sys
import re

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import app
from cognitara.database.connection import get_db_connection

conn = get_db_connection()
teacher = conn.execute("SELECT id, username FROM teachers LIMIT 1").fetchone()
teacher_id = teacher["id"]
conn.execute("INSERT OR IGNORE INTO teacher_class_assignments (teacher_id, class_name, specialisation) VALUES (?, 'JSS 1', 'General')", (teacher_id,))
conn.commit()
conn.close()

client = app.test_client()
with client.session_transaction() as sess:
    sess['teacher_id'] = teacher_id
    sess['role'] = 'Teacher'
    sess['username'] = teacher["username"]

r = client.get('/teacher/create_exam')
token_match = re.search(r'name="csrf-token" content="([^"]+)"', r.data.decode())
token = token_match.group(1) if token_match else None

res = client.post('/teacher/create_exam', data={
    'csrf_token': token,
    'name': 'Mid-Term Mathematics Test',
    'target_class': 'JSS 1',
    'specialisation_tag': 'General',
    'subject_tag': 'Mathematics',
    'duration': '45',
    'calculator_type': 'scientific',
    'active': '1'
}, headers={'X-CSRFToken': token})

print('Create exam status code:', res.status_code)
print('Response JSON:', res.get_json())
