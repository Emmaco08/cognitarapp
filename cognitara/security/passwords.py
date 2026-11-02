from werkzeug.security import generate_password_hash, check_password_hash

def verify_and_upgrade_password(conn, table_name, id_col, user_id, stored_pwd, input_pwd):
    """
    Verifies input password against stored password hash.
    If stored password is plain text, automatically upgrades it to a secure hash.
    """
    if not stored_pwd:
        return False
    if check_password_hash(stored_pwd, input_pwd):
        return True
    if stored_pwd == input_pwd:
        try:
            new_hash = generate_password_hash(input_pwd)
            conn.execute(f"UPDATE {table_name} SET password = ? WHERE {id_col} = ?", (new_hash, user_id))
            conn.commit()
        except Exception:
            pass
        return True
    return False
