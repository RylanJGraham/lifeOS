"""Timeout wrapper for Supabase postgrest execute() calls.

Supabase-py can block indefinitely on some queries. This helper wraps any
`.execute()` call with a signal-based timeout on Unix and a threaded timeout on
Windows. On Windows the signal approach is unavailable, so we use a future in a
dedicated thread pool.
"""
import os
import sys
import logging
from functools import wraps
from typing import Callable, Any

logger = logging.getLogger("supabase_timeout")

DEFAULT_TIMEOUT = float(os.getenv("SUPABASE_QUERY_TIMEOUT", "15"))


class SupabaseTimeoutError(TimeoutError):
    pass


def _run_with_timeout(fn: Callable, timeout: float, *args, **kwargs):
    """Run fn(*args, **kwargs) with the given timeout in seconds."""
    # Unix: use signal
    if sys.platform != "win32" and hasattr(os, "fork"):
        import signal

        def handler(signum, frame):
            raise SupabaseTimeoutError(f"Supabase query timed out after {timeout}s")

        old_handler = signal.signal(signal.SIGALRM, handler)
        old_timeout = signal.alarm(int(timeout))
        try:
            return fn(*args, **kwargs)
        finally:
            signal.alarm(old_timeout or 0)
            signal.signal(signal.SIGALRM, old_handler)
    else:
        # Windows fallback: run in a thread pool
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(fn, *args, **kwargs)
            try:
                return future.result(timeout=timeout)
            except FutureTimeout:
                logger.warning(f"Supabase query timed out after {timeout}s")
                raise SupabaseTimeoutError(f"Supabase query timed out after {timeout}s")


def execute_with_timeout(query_builder, timeout: float = DEFAULT_TIMEOUT):
    """Call `.execute()` on a Supabase query builder with a timeout.

    Usage:
        from utils.supabase_timeout import execute_with_timeout
        res = execute_with_timeout(supabase.table("meals").select("*").limit(10))
    """
    return _run_with_timeout(query_builder.execute, timeout)


def timed_execute(timeout: float = DEFAULT_TIMEOUT):
    """Decorator that wraps a function so its returned Supabase query builder
    is executed with a timeout. Useful for internal helper functions that build
    and execute queries.
    """
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            result = fn(*args, **kwargs)
            if result is None:
                return None
            return execute_with_timeout(result, timeout=timeout)
        return wrapper
    return decorator
