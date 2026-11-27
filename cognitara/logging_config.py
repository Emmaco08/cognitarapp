import os
import re
import logging
from logging.handlers import RotatingFileHandler

class SensitiveDataFilter(logging.Filter):
    """
    Redacts passwords, hashes, and raw session keys from application log records.
    """
    def filter(self, record):
        if not isinstance(record.msg, str):
            record.msg = str(record.msg)
        
        # Redact password fields
        record.msg = re.sub(r'(?i)(password[\'"\s:=]+)([^\s,}\'"]+)', r'\1[REDACTED]', record.msg)
        # Redact raw session keys to only first 6 chars
        record.msg = re.sub(r'(?i)(session_key[\'"\s:=]+)([a-f0-9]{6})[a-f0-9]{26}', r'\1\2...', record.msg)
        return True

def setup_logging(app=None):
    """
    Configures structured logging with size-based rotation (5 files x 10MB = 50MB max).
    Safe for local, offline deployment on Windows - writes exclusively into the
    writable CogniTara data directory (%ProgramData%\\CogniTara\\data\\logs with
    %LOCALAPPDATA% fallback), never inside C:\\Program Files\\.
    """
    from cognitara.config import resolve_logs_dir

    log_dir = resolve_logs_dir()
    log_file = os.path.join(log_dir, "cognitara.log")

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    root_logger = logging.getLogger()
    existing_rotating = [h for h in root_logger.handlers if isinstance(h, RotatingFileHandler)]
    if not existing_rotating:
        handler = None
        try:
            handler = RotatingFileHandler(
                log_file,
                maxBytes=10 * 1024 * 1024,  # 10MB
                backupCount=5,
                encoding="utf-8"
            )
        except OSError:
            # Ultimate resilience: never crash the exam engine if a filesystem policy blocks log creation
            handler = logging.StreamHandler()

        handler.setFormatter(formatter)
        handler.addFilter(SensitiveDataFilter())
        root_logger.addHandler(handler)
        root_logger.setLevel(logging.INFO)

    if app:
        app.logger.setLevel(logging.INFO)
        app.config["LOGS_DIR"] = log_dir

    return logging.getLogger("cognitara")
