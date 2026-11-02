import sqlite3
import os

DB_NAME = "exam.db"
UPLOAD_FOLDER = "static/images"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

conn = sqlite3.connect(DB_NAME)
c = conn.cursor()

# Admin table
c.execute("""
CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
""")

# Students table
c.execute("""
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    class TEXT,
    photo TEXT
)
""")

# Teachers table
c.execute("""
CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    class TEXT,
    photo TEXT
)
""")


# Exams table
c.execute("""
CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    class TEXT,
    duration INTEGER DEFAULT 30,
    active INTEGER DEFAULT 0
)
""")
# Add teacher_id column safely
try:
    c.execute("ALTER TABLE exams ADD COLUMN teacher_id INTEGER")
except:
    pass
try:
    c.execute("ALTER TABLE exam_sections ADD COLUMN active INTEGER DEFAULT 1")
except:
    pass
# Questions table
c.execute("""
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    question TEXT,
    option1 TEXT,
    option2 TEXT,
    option3 TEXT,
    option4 TEXT,
    answer TEXT,
    FOREIGN KEY(exam_id) REFERENCES exams(id)
)
""")
try:
    c.execute("ALTER TABLE questions ADD COLUMN image TEXT")
except:
    pass

#audit
c.execute("""
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_role TEXT,        
    username TEXT,         
    action TEXT,           
    timestamp DATETIME DEFAULT 
    CURRENT_TIMESTAMP
)
""")

try:
    c.execute("ALTER TABLE scores ADD COLUMN status TEXT DEFAULT 'in_progress'")
except:
    pass
# Scores table
c.execute("""
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    exam_id INTEGER,
    score INTEGER,
    total INTEGER,
    submitted INTEGER DEFAULT 1,
    FOREIGN KEY(student_id) REFERENCES students(id),
    FOREIGN KEY(exam_id) REFERENCES exams(id)
)
""")

try:
    c.execute("ALTER TABLE scores ADD COLUMN start_time DATETIME")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'pending'")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN registered_at DATETIME DEFAULT CURRENT_TIMESTAMP")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN approved_at DATETIME")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN email TEXT")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN full_name TEXT")
except:
    pass

c.execute("""
CREATE TABLE IF NOT EXISTS warning_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    student_name TEXT,
    exam_id INTEGER,
    exam_name TEXT,
    warning_message TEXT,
    warning_count INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES students(id),
    FOREIGN KEY(exam_id) REFERENCES exams(id)
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS pending_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    full_name TEXT,
    email TEXT,
    class TEXT,
    photo TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending'
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    target_class TEXT NOT NULL,  -- e.g., 'Grade 7'
    duration INTEGER DEFAULT 60,  -- minutes
    passing_score INTEGER DEFAULT 50,  -- percentage
    total_questions_to_show INTEGER DEFAULT 100,
    active INTEGER DEFAULT 0,  -- 0=Inactive, 1=Active
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    section_name TEXT NOT NULL,
    section_order INTEGER DEFAULT 0,
    questions_to_show INTEGER DEFAULT 0,  -- 0 = show all from this section
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_question_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    section_id INTEGER,
    group_name TEXT,  -- e.g., 'Reading Passage 1'
    group_type TEXT DEFAULT 'normal',  -- 'normal', 'comprehension', 'sequence'
    group_content TEXT,  -- For comprehension: the passage text
    group_image TEXT,    -- Optional image
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE,
    FOREIGN KEY(section_id) REFERENCES ce_sections(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    section_id INTEGER,
    group_id INTEGER,  -- Optional: part of a group
    question TEXT NOT NULL,
    option1 TEXT,
    option2 TEXT,
    option3 TEXT,
    option4 TEXT,
    answer TEXT NOT NULL,
    explanation TEXT,
    image TEXT,
    mandatory INTEGER DEFAULT 0,  -- 0=Random, 1=Must appear for all
    points INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE,
    FOREIGN KEY(section_id) REFERENCES ce_sections(id) ON DELETE CASCADE,
    FOREIGN KEY(group_id) REFERENCES ce_question_groups(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id)
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    exam_id INTEGER,
    score INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    percentage REAL DEFAULT 0,
    passed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    answers TEXT,  -- JSON stored answers
    started_at DATETIME,
    completed_at DATETIME,
    reviewed_at DATETIME,
    reviewed_by TEXT,
    admin_notes TEXT,
    FOREIGN KEY(student_id) REFERENCES ce_students(id) ON DELETE CASCADE,
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS exam_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    questions_to_show INTEGER DEFAULT 0,
    randomize INTEGER DEFAULT 1,
    section_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS exam_question_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    section_id INTEGER NOT NULL,
    group_name TEXT NOT NULL,
    group_type TEXT DEFAULT 'normal',
    group_content TEXT,
    group_image TEXT,
    instruction_text TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES exam_sections(id) ON DELETE CASCADE
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_attempt_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER,
    question_id INTEGER,
    user_answer TEXT,
    is_correct INTEGER DEFAULT 0,
    FOREIGN KEY(attempt_id) REFERENCES ce_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY(question_id) REFERENCES ce_questions(id)
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS ce_warning_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    exam_id INTEGER,
    warning_message TEXT,
    warning_count INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES ce_students(id),
    FOREIGN KEY(exam_id) REFERENCES ce_exams(id)
)
""")
c.execute("""
CREATE TABLE IF NOT EXISTS exam_question_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    exam_id INTEGER NOT NULL,
    section_id INTEGER,
    user_answer TEXT,
    is_correct INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES scores(id),
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id)
)
""")
c.execute("CREATE INDEX IF NOT EXISTS idx_eqr_attempt ON exam_question_responses(attempt_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_eqr_exam ON exam_question_responses(exam_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_eqr_student ON exam_question_responses(student_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_eqr_section ON exam_question_responses(section_id)")
c.execute("""
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    specialisation TEXT NOT NULL DEFAULT 'General',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
)
""")
c.execute("CREATE INDEX IF NOT EXISTS idx_teacher_assignments ON teacher_class_assignments(teacher_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_exam_tags ON exams(subject_tag, specialisation_tag)")
c.execute("CREATE INDEX IF NOT EXISTS idx_student_specialisation ON students(specialisation)")
c.execute("""
INSERT INTO teacher_class_assignments (teacher_id, class_name, specialisation)
SELECT id, class, 'General' 
FROM teachers 
WHERE class IS NOT NULL AND class != ''
AND NOT EXISTS (SELECT 1 FROM teacher_class_assignments WHERE teacher_id = teachers.id)
""")
c.execute("""
UPDATE teachers
SET teaching_classes = (
    SELECT GROUP_CONCAT(DISTINCT class_name) 
    FROM teacher_class_assignments 
    WHERE teacher_id = teachers.id
)
""")
try:
    c.execute("ALTER TABLE scores ADD COLUMN end_time DATETIME")
except:
    pass
try:
    c.execute("ALTER TABLE questions ADD COLUMN section_id INTEGER")
except:
    pass
try:
    c.execute("ALTER TABLE questions ADD COLUMN group_id INTEGER")
except:
    pass
try:
    c.execute("ALTER TABLE ce_sections ADD COLUMN active INTEGER DEFAULT 1")
except:
    pass
try:
    c.execute("ALTER TABLE questions ADD COLUMN display_order INTEGER DEFAULT 0")
except:
    pass
try:
    c.execute("ALTER TABLE questions ADD COLUMN mandatory INTEGER DEFAULT 0")
except:
    pass
# Sample admin and student
c.execute("INSERT OR IGNORE INTO admin (username, password) VALUES (?, ?)", ("teacher1", "teach123"))
c.execute("INSERT OR IGNORE INTO students (username, password, class, photo) VALUES (?, ?, ?, ?)", 
          ("student1", "pass123", "Grade 1", "default.png"))
c.execute("""INSERT OR IGNORE INTO teachers (username, password, class, photo)VALUES (?, ?, ?, ?)""", ("teacher1", "teach123", "Grade 1", "default.png"))
c.execute("UPDATE admin SET username=?,password=? WHERE id=?",("Administrator","python0877",1))
c.execute("UPDATE scores SET total = 0 WHERE total IS NULL")

#c.execute("ALTER TABLE ce_sections ADD COLUMN randomize INTEGER DEFAULT 1")
#c.execute("ALTER TABLE ce_sections ADD COLUMN instruction_text TEXT")
#c.execute("ALTER TABLE ce_question_groups ADD COLUMN instruction_text TEXT")


#c.execute("ALTER TABLE ce_attempt_questions ADD COLUMN time_spent INTEGER DEFAULT 0")
#c.execute("ALTER TABLE ce_attempt_questions ADD COLUMN started_at DATETIME")
#c.execute("ALTER TABLE ce_attempt_questions ADD COLUMN completed_at DATETIME")
c.execute("CREATE INDEX IF NOT EXISTS idx_ce_attempts_exam_status ON ce_attempts(exam_id, status)")
c.execute("CREATE INDEX IF NOT EXISTS idx_ce_attempt_questions_attempt ON ce_attempt_questions(attempt_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_ce_attempts_student_exam ON ce_attempts(student_id, exam_id)")
c.execute("DELETE FROM ce_attempt_questions WHERE attempt_id NOT IN (SELECT id FROM ce_attempts)")
c.execute("DELETE FROM ce_attempts WHERE student_id NOT IN (SELECT id FROM ce_students)")
c.execute("DELETE FROM ce_attempts WHERE exam_id NOT IN (SELECT id FROM ce_exams)")
c.execute("DELETE FROM ce_students WHERE exam_id NOT IN (SELECT id FROM ce_exams)")
c.execute("CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_questions_group ON questions(group_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_exam_sections_exam ON exam_sections(exam_id)")
c.execute("CREATE INDEX IF NOT EXISTS idx_exam_groups_section ON exam_question_groups(section_id)")
# Add these to your database initialization section
try:
    c.execute("ALTER TABLE ce_sections ADD COLUMN randomize INTEGER DEFAULT 1")
except:
    pass

try:
    c.execute("ALTER TABLE ce_attempt_questions ADD COLUMN shuffled_options TEXT")
except:
    pass
# Add calculator_type column to ce_exams table
try:
    c.execute("ALTER TABLE ce_exams ADD COLUMN calculator_type TEXT DEFAULT 'none'")
except:
    pass

# Add pause status to ce_attempts table
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN is_paused INTEGER DEFAULT 0")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN paused_at DATETIME")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN paused_by TEXT")
except:
    pass
# Add missing columns to ce_exams
try:
    c.execute("ALTER TABLE ce_exams ADD COLUMN max_warnings INTEGER DEFAULT 5")
except:
    pass

try:
    c.execute("ALTER TABLE ce_exams ADD COLUMN calculator_type TEXT DEFAULT 'none'")
except:
    pass

# Add columns to ce_attempts for auto-save and pause
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN current_progress TEXT")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN warnings_count INTEGER DEFAULT 0")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN remaining_time INTEGER DEFAULT 0")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN is_paused INTEGER DEFAULT 0")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN paused_at DATETIME")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN paused_by TEXT")
    c.execute("ALTER TABLE ce_attempts ADD COLUMN auto_submitted INTEGER DEFAULT 0")
except:
    pass

# Add column to ce_attempt_questions for shuffled options if not exists
try:
    c.execute("ALTER TABLE ce_attempt_questions ADD COLUMN shuffled_options TEXT")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN last_heartbeat TIMESTAMP")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN resume_requested INTEGER DEFAULT 0")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN is_paused INTEGER DEFAULT 0")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN current_progress TEXT")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN remaining_time INTEGER DEFAULT 0")
except:
    pass
try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN warnings_count INTEGER DEFAULT 0")
except:
    pass

try:
    c.execute("ALTER TABLE ce_attempts ADD COLUMN force_submit INTEGER DEFAULT 0")
except:
    pass
try:
    c.execute("ALTER TABLE students ADD COLUMN specialisation TEXT DEFAULT 'General'")
except:
    pass
try:
    c.execute("ALTER TABLE teachers ADD COLUMN teaching_classes TEXT DEFAULT ''")
except:
    pass
try:
    c.execute("ALTER TABLE teachers ADD COLUMN specialisations TEXT DEFAULT ''")
except:
    pass
try:
    c.execute("ALTER TABLE teachers ADD COLUMN class_teacher_of TEXT DEFAULT ''")
except:
    pass
try:
    c.execute("ALTER TABLE exams ADD COLUMN subject_tag TEXT DEFAULT 'General'")
except:
    pass
try:
    c.execute("ALTER TABLE exams ADD COLUMN specialisation_tag TEXT DEFAULT 'General'")
except:
    pass
try:
    c.execute("ALTER TABLE exams ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
except:
    pass
try:
    c.execute("ALTER TABLE pending_registrations ADD COLUMN specialisation TEXT DEFAULT 'General'")
except:
    pass
conn.commit()
conn.close()
print("Database initialized!")