"""
Модуль для работы с публичными ключами пользователей.
Сервер НЕ шифрует и НЕ расшифровывает сообщения — это делает клиент.
Сервер только хранит публичные ключи и раздаёт их.

Схема:
1. Клиент генерирует пару ключей (public/private) через Web Crypto API (RSA-OAEP).
2. Публичный ключ отправляется на сервер (POST /keys/upload).
3. При отправке сообщения клиент шифрует текст публичным ключом получателя.
4. Сервер хранит зашифрованный текст (encryptedText).
5. Получатель расшифровывает своим приватным ключом (который никогда не покидает браузер).
"""
from datetime import datetime, timezone
import base64
import json


def validate_public_key(public_key: str) -> bool:
    """
    Валидация публичного ключа в формате JWK (JSON Web Key).
    JWK — это JSON-объект с полями kty, n, e для RSA.
    """
    if not public_key or not isinstance(public_key, str):
        return False

    if len(public_key) < 32 or len(public_key) > 8192:
        return False

    try:
        # Пробуем распарсить как JSON (JWK)
        data = json.loads(public_key)
    except (json.JSONDecodeError, TypeError):
        # Если не JSON — допускаем base64 (для обратной совместимости)
        try:
            base64.b64decode(public_key, validate=True)
            return True
        except Exception:
            return False

    # Проверка обязательных полей JWK для RSA
    if data.get("kty") != "RSA":
        return False
    if not data.get("n") or not data.get("e"):
        return False

    return True


def make_key_document(user_id: str, public_key: str) -> dict:
    """Создаёт документ для коллекции keys."""
    now = datetime.now(timezone.utc)
    return {
        "userId": user_id,
        "publicKey": public_key,
        "createdAt": now,
        "updatedAt": now,
    }