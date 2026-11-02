import os
import sys
import re

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import app

client = app.test_client()
with client.session_transaction() as sess:
    sess['admin_id'] = 1
    sess['role'] = 'Admin'
    sess['username'] = 'Administrator'

r = client.get('/admin/school-settings')
token_match = re.search(r'name="csrf-token" content="([^"]+)"', r.data.decode())
token = token_match.group(1) if token_match else None
print('Found CSRF token:', token is not None)

res_school = client.post('/admin/school-settings/update', json={
    'school_name': 'CogniTara High School',
    'academic_session': '2026/2027',
    'current_term': 'First Term',
    'max_warnings': 5,
    'anti_cheating_profile': 'medium'
}, headers={'X-CSRFToken': token})
print('School settings update:', res_school.status_code, res_school.get_json())

res_ce = client.post('/admin/ce-settings/update', json={
    'portal_title': 'Entrance Examination Portal',
    'institution_name': 'CogniTara Academy',
    'admission_session': '2026/2027',
    'admission_batch': 'Batch A',
    'default_passing_score': 50,
    'direct_submit': 0
}, headers={'X-CSRFToken': token})
print('CE settings update:', res_ce.status_code, res_ce.get_json())
