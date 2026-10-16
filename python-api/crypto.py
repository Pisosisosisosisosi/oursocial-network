from datetime import datetime, timezone


def validate_public_key(public_key: str) -> bool:
    if not public_key or not isinstance(public_key, str):
        return False
    if len(public_key) < 32 or len(public_key) > 4096:
        return False
    return True


def make_key_document(user_id: str, public_key: str) -> dict:
    return {
        "userId": user_id,
        "publicKey": public_key,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }