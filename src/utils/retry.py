"""Generic retry/backoff helpers for external API calls."""
import time
import logging
import random
from functools import wraps
from typing import Callable, Type, Tuple, Any

logger = logging.getLogger("retry")


def with_retry(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Callable[[Exception, int], None] | None = None,
):
    """Decorator that retries a function with exponential backoff + jitter.

    Args:
        max_retries: number of retry attempts after the first failure
        base_delay: initial delay in seconds
        max_delay: cap on delay between retries
        exceptions: tuple of exception classes to catch
        on_retry: optional callback(exception, attempt_number)
    """
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.3)
                    sleep_for = delay + jitter
                    logger.warning(f"{fn.__name__} failed (attempt {attempt + 1}/{max_retries + 1}): {e}; retrying in {sleep_for:.1f}s")
                    if on_retry:
                        on_retry(e, attempt + 1)
                    time.sleep(sleep_for)
            # Unreachable, but keeps type checkers happy
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def retry_call(fn: Callable[..., Any], *args, max_retries: int = 3, base_delay: float = 1.0, **kwargs):
    """Convenience function for inline retries."""
    return with_retry(max_retries=max_retries, base_delay=base_delay)(fn)(*args, **kwargs)
