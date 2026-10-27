"""Phone verification endpoints for Skyline.

SMS delivery is deliberately fail-closed: without a configured supported provider,
the API returns 503 and never claims that a code was sent.
"""
from __future__ import annotations

import hashlib
import os
import re
import secrets
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from pymongo import ReturnDocument

from db import get_db, users_collection

router = APIRouter(prefix="/auth/phone", tags=["phone-verification"])
PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")
CODE_TTL_SECONDS = 600
TOKEN_TTL_SECONDS = 600
MAX_FAILED_ATTEMPTS = 5


def normalize_phone(value: str) -> str:
    phone = re.sub(r"[\s().-]", "", value)
    if not PHONE_RE.fullmatch(phone):
        raise HTTPException(
            status_code=422,
            detail="Введите номер в международном формате, например +12025550123.",
        )
    return phone


class SendPhoneCodeRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=24)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return normalize_phone(value)


class VerifyPhoneCodeRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=24)
    code: str = Field(pattern=r"^\d{4,8}$")

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

    from urllib.error import HTTPError, URLError
    import base64
    url = (
        f"https://verify.twilio.com/v2/Services/{service_sid}/"
        f"VerificationChecks" if path == "check" else
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
            import json
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Do not relay provider responses: they can disclose operational details.
        raise HTTPException(status_code=400 if path == "check" else 502,
                            detail="Не удалось подтвердить номер. Проверьте данные и попробуйте снова.") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(status_code=503,
                            detail="SMS-провайдер временно недоступен. Попробуйте позже.") from exc


def _phone_hash(phone: str) -> str:
    return hashlib.sha256(phone.encode("utf-8")).hexdigest()


@router.post("/send-code")
def send_phone_code(payload: SendPhoneCodeRequest):
    phone = payload.phone
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
def verify_phone_code(payload: VerifyPhoneCodeRequest):
    phone = payload.phone
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
