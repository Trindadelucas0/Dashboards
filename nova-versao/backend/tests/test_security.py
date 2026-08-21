from app.security import hash_password, verify_password


def test_password_roundtrip():
    hashed = hash_password("1234")
    assert hashed.startswith("pbkdf2$")
    assert verify_password("1234", hashed)
    assert not verify_password("9999", hashed)


def test_legacy_empty_secret_still_verifies():
    import hashlib

    salt = hashlib.sha256(b"").digest()[:16]
    dk = hashlib.pbkdf2_hmac("sha256", b"1234", salt, 200_000).hex()
    assert verify_password("1234", dk)
