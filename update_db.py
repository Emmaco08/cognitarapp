import sqlite3

conn = sqlite3.connect("exam.db")
cursor = conn.cursor()

# Check how many logs exist first
cursor.execute("SELECT COUNT(*) FROM audit_logs")
count = cursor.fetchone()[0]
print(f"Found {count} audit log(s)")

# Delete all audit logs
cursor.execute("DELETE FROM audit_logs")
conn.commit()

# Verify deletion
cursor.execute("SELECT COUNT(*) FROM audit_logs")
remaining = cursor.fetchone()[0]
print(f"Deleted successfully! Remaining: {remaining} log(s)")

conn.close()