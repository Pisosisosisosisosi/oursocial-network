"""Phone verification endpoints for Skyline.

SMS delivery is deliberately fail-closed: without a configured provider, the API
returns 503 and never claims that a code was sent. Process-local rate limits are
defence in depth; production deployments with multiple workers should also enable
provider-side limits or a shared/distributed limiter.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from db import get_db, users_collection

router = APIRouter(prefix="/auth/phone", tags=["phone-verification"])
PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
CODE_TTL_SECONDS = 600
TOKEN_TTL_SECONDS = 600

SEND_LIMIT_PER_PHONE = 3
SEND_LIMIT_PER_IP = 10
SEND_WINDOW_SECONDS = 600.0
VERIFY_LIMIT_PER_PHONE = 10
VERIFY_LIMIT_PER_IP = 30
VERIFY_WINDOW_SECONDS = 600.0
_rate_lock = Lock()
_rate_attempts: dict[str, Deque[float]] = defaultdict(deque)


def normalize_phone(value: str) -> str:
    phone = re.sub(r"[\s().-]", "", value)
    if not PHONE_RE.fullmatch(phone):
        raise HTTPException(
            status_code=422,
            detail="Введите номер в международном формате, например +12025550123.",
        )
    return phone


def _enforce_rate_limit(action: str, phone: str, client_ip: str, now: float | None = None) -> None:
    """Limit SMS sends and code checks per phone and client IP."""
    current = __import__("time").monotonic() if now is None else now
    phone_key = hashlib.sha256(phone.encode("utf-8")).hexdigest()
    keys = (f"{action}:phone:{phone_key}", f"{action}:ip:{client_ip or 'unknown'}")
    limits = (
        (SEND_LIMIT_PER_PHONE, SEND_LIMIT_PER_IP, SEND_WINDOW_SECONDS)
        if action == "send" else
        (VERIFY_LIMIT_PER_PHONE, VERIFY_LIMIT_PER_IP, VERIFY_WINDOW_SECONDS)
    )
    with _rate_lock:
        # First check both buckets so a rejected request doesn't consume the other bucket.
        for key, limit in zip(keys, limits[:2]):
            entries = _rate_attempts[key]
            while entries and current - entries[0] >= limits[2]:
                entries.popleft()
            if len(entries) >= limit:
                retry_after = max(1, int(limits[2] - (current - entries[0])) + 1)
                raise HTTPException(
                    status_code=429,
                    detail="Слишком много попыток. Подождите и попробуйте снова.",
                    headers={"Retry-After": str(retry_after)},
                )
        for key in keys:
            _rate_attempts[key].append(current)
        if len(_rate_attempts) > 20_000:
            stale = [key for key, entries in _rate_attempts.items()
                     if not entries or current - entries[-1] >= SEND_WINDOW_SECONDS]
            for key in stale:
                _rate_attempts.pop(key, None)


class SendPhoneCodeRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=24)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return normalize_phone(value)


class VerifyPhoneCodeRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=24)
    code: str = Field(pattern=r"^\\d{4,8}$")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return normalize_phone(value)


def _twilio_request(path: str, fields: dict[str, str]) -> dict:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()
    if not (account_sid and auth_token and service_sid):
        raise HTTPException(
            status_code=503,
            detail="Подтверждение по SMS пока не настроено. Администратор должен подключить SMS-провайдера.",
        )

    url = (
        f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationChecks"
        if path == "check" else
        f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"
    )
    payload = urllib.parse.urlencode(fields).encode("utf-8")
    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Do not relay provider responses: they can disclose operational details.
        raise HTTPException(
            status_code=400 if path == "check" else 502,
            detail="Не удалось подтвердить номер. Проверьте данные и попробуйте снова.",
        ) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="SMS-провайдер временно недоступен. Попробуйте позже.",
        ) from exc


@router.post("/send-code")
def send_phone_code(payload: SendPhoneCodeRequest, request: Request):
    phone = payload.phone
    client_ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit("send", phone, client_ip)

    # Generic response for already-registered numbers reduces account enumeration.
    # The actual uniqueness check is repeated during final registration.
    if users_collection().find_one({"phone": phone}, {"_id": 1}):
        return {"status": "ok", "message": "Если номер можно использовать, инструкция будет отправлена."}

    result = _twilio_request("send", {"To": phone, "Channel": "sms"})
    if result.get("status") not in {"pending", "approved"}:
        raise HTTPException(status_code=502, detail="SMS-провайдер не подтвердил отправку сообщения.")
    return {
        "status": "ok",
        "expiresInSeconds": CODE_TTL_SECONDS,
        "message": "Если номер можно использовать, инструкция будет отправлена.",
    }


@router.post("/verify-code")
def verify_phone_code(payload: VerifyPhoneCodeRequest, request: Request):
    phone = payload.phone
    client_ip = request.client.host if request.client else "unknown"
    _enforce_rate_limit("verify", phone, client_ip)
    result = _twilio_request("check", {"To": phone, "Code": payload.code})
    if result.get("status") != "approved" or result.get("valid") is False:
        raise HTTPException(status_code=400, detail="Неверный или просроченный код подтверждения.")

    token = secrets.token_urlsafe(40)
    now = datetime.now(timezone.utc)
    collection = get_db()["verified_phone_tokens"]
    # Remove stale tokens for this number and store only a hash of the one-time token.
    collection.delete_many({"phone": phone})
    collection.insert_one({
        "phone": phone,
        "tokenHash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
        "createdAt": now,
        "expiresAt": now + timedelta(seconds=TOKEN_TTL_SECONDS),
    })
    return {"status": "ok", "phoneVerificationToken": token, "expiresInSeconds": TOKEN_TTL_SECONDS}
