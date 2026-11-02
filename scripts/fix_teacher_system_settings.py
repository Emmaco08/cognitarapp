with open('cognitara/routes/teacher.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_str = """    school_setting_row = conn.execute("SELECT setting_value FROM system_settings WHERE setting_key='max_violations'").fetchone()
    if not school_setting_row:
        school_setting_row = conn.execute("SELECT setting_value FROM system_settings WHERE setting_key='max_warnings'").fetchone()
    max_warnings = int(school_setting_row["setting_value"]) if school_setting_row and str(school_setting_row["setting_value"]).isdigit() else 5"""

good_str = """    try:
        school_setting_row = conn.execute("SELECT max_warnings FROM school_settings WHERE id=1").fetchone()
        max_warnings = int(school_setting_row["max_warnings"]) if school_setting_row and school_setting_row["max_warnings"] else 5
    except Exception:
        max_warnings = 5"""

# Handle both CRLF and LF
if bad_str in content:
    content = content.replace(bad_str, good_str)
elif bad_str.replace('\n', '\r\n') in content:
    content = content.replace(bad_str.replace('\n', '\r\n'), good_str.replace('\n', '\r\n'))

with open('cognitara/routes/teacher.py', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print("Updated teacher.py successfully!")
