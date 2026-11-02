from cognitara.database.connection import get_db_connection

def get_scores(student_id):
    conn = get_db_connection()
    scores = conn.execute(
        "SELECT scores.exam_id, exams.name AS exam_name "
        "FROM scores JOIN exams ON scores.exam_id = exams.id "
        "WHERE scores.student_id = ?", (student_id,)
    ).fetchall()
    conn.close()
    return scores

def get_score_details(student_id, exam_id):
    conn = get_db_connection()
    score = conn.execute(
        "SELECT score, total FROM scores WHERE student_id=? AND exam_id=?",
        (student_id, exam_id)
    ).fetchone()
    conn.close()
    return score

def get_student_average(student_id):
    """Calculate average score for a student across all completed exams"""
    conn = get_db_connection()
    scores = conn.execute("""
        SELECT score, total FROM scores 
        WHERE student_id=? AND status='completed' 
        AND total IS NOT NULL AND total > 0
    """, (student_id,)).fetchall()
    conn.close()
    
    if not scores:
        return 0
    
    total_percentage = 0
    for score in scores:
        if score['total'] and score['total'] > 0:
            total_percentage += (score['score'] / score['total'] * 100)
    
    return round(total_percentage / len(scores), 1)

def get_class_average(exam_id, class_name):
    """Calculate class average for a specific exam"""
    conn = get_db_connection()
    scores = conn.execute("""
        SELECT s.score, s.total FROM scores s
        JOIN students st ON s.student_id = st.id
        WHERE s.exam_id=? AND st.class=? AND s.status='completed' 
        AND s.total IS NOT NULL AND s.total > 0
    """, (exam_id, class_name)).fetchall()
    conn.close()
    
    if not scores:
        return 0
    
    total_percentage = 0
    count = 0
    for score in scores:
        if score['total'] and score['total'] > 0:
            total_percentage += (score['score'] / score['total'] * 100)
            count += 1
    
    if count == 0:
        return 0
    
    return round(total_percentage / count, 1)

def get_highest_score_in_class(class_name):
    conn = get_db_connection()
    result = conn.execute("""
        SELECT s.score, s.total, st.username, st.full_name, e.name as exam_name
        FROM scores s
        JOIN students st ON s.student_id = st.id
        JOIN exams e ON s.exam_id = e.id
        WHERE st.class=? AND s.status='completed' AND s.total IS NOT NULL AND s.total > 0
        ORDER BY CAST(s.score AS FLOAT) / CAST(s.total AS FLOAT) DESC
        LIMIT 1
    """, (class_name,)).fetchone()
    conn.close()
    
    if result and result['total'] and result['total'] > 0:
        percentage = (result['score'] / result['total'] * 100)
        display_name = result['full_name'] if result['full_name'] else result['username']
        return {'percentage': round(percentage, 1), 'student': display_name, 'exam': result['exam_name']}
    return {'percentage': 0, 'student': 'None', 'exam': 'None'}

def get_total_passed_exams(class_name):
    """Get total number of passed exams in the class"""
    conn = get_db_connection()
    scores = conn.execute("""
        SELECT s.score, s.total FROM scores s
        JOIN students st ON s.student_id = st.id
        WHERE st.class=? AND s.status='completed' AND s.total IS NOT NULL AND s.total > 0
    """, (class_name,)).fetchall()
    conn.close()
    
    if not scores:
        return 0
    
    passed = 0
    for score in scores:
        if score['total'] and score['total'] > 0:
            percentage = (score['score'] / score['total'] * 100)
            if percentage >= 50:
                passed += 1
    return passed

def get_highest_average_in_class(class_name):
    """Get the student with highest average score in the class"""
    conn = get_db_connection()
    students = conn.execute(
        "SELECT id, username FROM students WHERE class=?", 
        (class_name,)
    ).fetchall()
    
    if not students:
        conn.close()
        return {'percentage': 0, 'student': 'None', 'average': 0}
    
    highest_avg = 0
    highest_student = "None"
    
    for student in students:
        scores = conn.execute("""
            SELECT score, total FROM scores 
            WHERE student_id=? AND status='completed' 
            AND total IS NOT NULL AND total > 0
        """, (student['id'],)).fetchall()
        
        if scores:
            total_percentage = 0
            for score in scores:
                total_percentage += (score['score'] / score['total'] * 100)
            student_avg = total_percentage / len(scores)
            
            if student_avg > highest_avg:
                highest_avg = student_avg
                highest_student = student['username']
    
    conn.close()
    return {
        'percentage': round(highest_avg, 1),
        'student': highest_student,
        'average': round(highest_avg, 1)
    }
