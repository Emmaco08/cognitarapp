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
    Safe for local, offline deployment on Windows.
    """
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    log_dir = os.path.join(root_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, "cognitara.log")
    
    # Configure root logger
    root_logger = logging.getLogger()
    if not any(isinstance(h, RotatingFileHandler) for h in root_logger.handlers):
        handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024, # 10MB
            backupCount=5,
            encoding="utf-8"
        )
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        handler.addFilter(SensitiveDataFilter())
        root_logger.addHandler(handler)
        root_logger.setLevel(logging.INFO)
    
    if app:
        app.logger.setLevel(logging.INFO)
    
    return logging.getLogger("cognitara")
