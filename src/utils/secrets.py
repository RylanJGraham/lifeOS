"""Encrypt secrets (e.g. published-calendar links) before they go in the database.

Fernet (AES-128-CBC + HMAC-SHA256). The key lives only in the server's .env
(CALENDAR_ENCRYPTION_KEY), never in Supabase, so a leaked database/password
alone does not reveal the secrets. Fails CLOSED: with no key configured nothing
is stored in plaintext.

Generate a key:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
Losing the key makes stored values unreadable (re-add them); rotating = re-add.
"""
import os

from cryptography.fernet import Fernet, InvalidToken

PREFIX = "enc:v1:"


class SecretsNotConfigured(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = os.getenv("CALENDAR_ENCRYPTION_KEY", "").strip()
    if not key:
        raise SecretsNotConfigured("CALENDAR_ENCRYPTION_KEY is not set on the server, so links cannot be stored safely.")
    try:
        return Fernet(key.encode())
    except Exception:
        raise SecretsNotConfigured("CALENDAR_ENCRYPTION_KEY is not a valid Fernet key.")


def encrypt_secret(plain: str) -> str:
    return PREFIX + _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(stored: str) -> str:
    """Decrypt a stored value. Values without the prefix are legacy plaintext."""
    if not stored.startswith(PREFIX):
        return stored
    try:
        return _fernet().decrypt(stored[len(PREFIX):].encode()).decode()
    except InvalidToken:
        raise SecretsNotConfigured("Stored link can't be decrypted (the encryption key changed) — remove and re-add the calendar.")
