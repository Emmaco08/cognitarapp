# save as fix_db.py and run once
import sqlite3

def fix_database():
    conn = sqlite3.connect("exam.db")
    cursor = conn.cursor()
    
    # Get existing columns in exams table
    cursor.execute("PRAGMA table_info(exams)")
    columns = [col[1] for col in cursor.fetchall()]
    
    # Add missing columns
    if 'created_at' not in columns:
        cursor.execute("ALTER TABLE exams ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        print("Added created_at column")
    
    if 'subject_tag' not in columns:
        cursor.execute("ALTER TABLE exams ADD COLUMN subject_tag TEXT DEFAULT 'General'")
        print("Added subject_tag column")
    
    if 'specialisation_tag' not in columns:
        cursor.execute("ALTER TABLE exams ADD COLUMN specialisation_tag TEXT DEFAULT 'General'")
        print("Added specialisation_tag column")
    
    # Check teachers table
    cursor.execute("PRAGMA table_info(teachers)")
    teacher_columns = [col[1] for col in cursor.fetchall()]
    
    if 'class_teacher_of' not in teacher_columns:
        cursor.execute("ALTER TABLE teachers ADD COLUMN class_teacher_of TEXT DEFAULT ''")
        print("Added class_teacher_of column")
    
    # Check students table
    cursor.execute("PRAGMA table_info(students)")
    student_columns = [col[1] for col in cursor.fetchall()]
    
    if 'specialisation' not in student_columns:
        cursor.execute("ALTER TABLE students ADD COLUMN specialisation TEXT DEFAULT 'General'")
        print("Added specialisation column")
    
    # Create teacher_class_assignments if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teacher_class_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            specialisation TEXT NOT NULL DEFAULT 'General',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        )
    """)
    print("Created/verified teacher_class_assignments table")
    
    conn.commit()
    conn.close()
    print("Database fix complete!")

if __name__ == "__main__":
    fix_database()