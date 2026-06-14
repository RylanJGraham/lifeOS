import os
import logging
from datetime import datetime
from supabase import create_client

def get_supabase_client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)

class SupabaseLogger:
    @staticmethod
    def log(level: str, service: str, message: str, details: dict = None):
        """
        Logs a message to the Supabase system_logs table for frontend observability.
        Levels: INFO, WARNING, ERROR, CRITICAL
        """
        try:
            db = get_supabase_client()
            if not db:
                return # Fail silently if not configured
                
            payload = {
                "level": level.upper(),
                "service": service,
                "message": message,
                "details": details or {}
            }
            db.table("system_logs").insert(payload).execute()
        except Exception as e:
            # Fallback to standard logging if DB insert fails
            logging.error(f"Failed to write to system_logs: {e}")

    @classmethod
    def info(cls, service: str, message: str, details: dict = None):
        cls.log("INFO", service, message, details)
        
    @classmethod
    def warning(cls, service: str, message: str, details: dict = None):
        cls.log("WARNING", service, message, details)
        
    @classmethod
    def error(cls, service: str, message: str, details: dict = None):
        cls.log("ERROR", service, message, details)
        
    @classmethod
    def critical(cls, service: str, message: str, details: dict = None):
        cls.log("CRITICAL", service, message, details)
