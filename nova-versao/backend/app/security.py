from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from app.config import get_settings

COOKIE_NAME = "nv_session"
_PBKDF2_ROUNDS = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2${salt.hex()}${dk.hex()}"


def _legacy_hash(password: str, secret: str) -> str:
    salt = hashlib.sha256((secret or "").encode()).digest()[:16]
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return dk.hex()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    if password_hash.startswith("pbkdf2$"):
        parts = password_hash.split("$")
        if len(parts) != 3:
            return False
        try:
            salt = bytes.fromhex(parts[1])
        except ValueError:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
        return hmac.compare_digest(dk.hex(), parts[2])
    current = _legacy_hash(password, get_settings().session_secret)
    if hmac.compare_digest(current, password_hash):
        return True
    for secret in ("", "change-me"):
        if hmac.compare_digest(_legacy_hash(password, secret), password_hash):
            return True
    return False


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="nv-session")


def make_session_token(user_id: int, username: str) -> str:
    return _serializer().dumps({"uid": user_id, "u": username, "t": datetime.utcnow().isoformat()})


def read_session_token(token: str, max_age: int = 60 * 60 * 12) -> dict | None:
    try:
        return _serializer().loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def constant_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
