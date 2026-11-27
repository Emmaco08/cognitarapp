import hmac
from werkzeug.security import generate_password_hash, check_password_hash

_ALLOWED_AUTH_TABLES = frozenset({
    ("admin", "id"),
    ("teachers", "id"),
    ("students", "id"),
    ("pending_registrations", "id"),
    ("ce_students", "id"),
})

_HASH_PREFIXES = ("scrypt:", "pbkdf2:", "argon2:")


def verify_and_upgrade_password(conn, table_name, id_col, user_id, stored_pwd, input_pwd):
    """
    Verifies input password against stored password hash.
    If stored password is legacy plain text (not already hashed), verifies in
    constant time and automatically upgrades it to a secure Werkzeug hash.
    """
    if not stored_pwd or input_pwd is None:
        return False
    stored_str = str(stored_pwd)
    input_str = str(input_pwd)
    if stored_str.startswith(_HASH_PREFIXES):
        try:
            return check_password_hash(stored_str, input_str)
        except Exception:
            return False
    # Legacy unhashed row only - constant-time comparison + immediate upgrade
    if hmac.compare_digest(stored_str, input_str):
        if (table_name, id_col) in _ALLOWED_AUTH_TABLES:
            try:
                new_hash = generate_password_hash(input_str)
                conn.execute(
                    f"UPDATE {table_name} SET password = ? WHERE {id_col} = ?",
                    (new_hash, user_id),
                )
                conn.commit()
            except Exception:
                pass
        return True
    return False

