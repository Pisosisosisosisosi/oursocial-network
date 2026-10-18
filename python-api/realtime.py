from collections import defaultdict
from typing import Any

import socketio
from fastapi import HTTPException

from auth import decode_token


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

online_users: dict[str, set[str]] = defaultdict(set)
sid_users: dict[str, str] = {}


@sio.event
async def connect(sid: str, environ: dict[str, Any], auth_data: dict[str, Any] | None = None) -> bool:
    token = auth_data.get("token") if isinstance(auth_data, dict) else None
    if not token:
        authorization = environ.get("HTTP_AUTHORIZATION", "")
        if authorization.lower().startswith("bearer "):
            token = authorization.split(" ", 1)[1]
    if not isinstance(token, str) or not token:
        return False

    try:
        payload = decode_token(token)
        user_id = str(payload["userId"])
        username = str(payload.get("username", "Пользователь"))
    except (HTTPException, KeyError, TypeError):
        return False

    sid_users[sid] = user_id
    await sio.save_session(sid, {"user_id": user_id, "username": username})
    await sio.enter_room(sid, f"user:{user_id}")
    was_offline = not online_users[user_id]
    online_users[user_id].add(sid)

    await sio.emit(
        "presence_snapshot",
        {"userIds": sorted(online_users.keys())},
        to=sid,
    )
    if was_offline:
        await sio.emit(
            "user_online",
            {"userId": user_id, "username": username},
            skip_sid=sid,
        )
    return True


@sio.on("get_presence")
async def get_presence(sid: str) -> None:
    await sio.emit(
        "presence_snapshot",
        {"userIds": sorted(online_users.keys())},
        to=sid,
    )


@sio.on("typing")
async def typing(sid: str, data: dict[str, Any] | None = None) -> None:
    user_id = sid_users.get(sid)
    if user_id is None or not isinstance(data, dict):
        return

    recipient_id = data.get("recipientId")
    is_typing = data.get("isTyping")
    if (
        not isinstance(recipient_id, str)
        or not recipient_id
        or recipient_id == user_id
        or not isinstance(is_typing, bool)
    ):
        return

    session = await sio.get_session(sid)
    await sio.emit(
        "user_typing",
        {
            "userId": user_id,
            "username": session.get("username", "Пользователь"),
            "isTyping": is_typing,
        },
        to=f"user:{recipient_id}",
    )


@sio.event
async def disconnect(sid: str, _reason: str | None = None) -> None:
    del _reason
    user_id = sid_users.pop(sid, None)
    if user_id is None:
        return

    sessions = online_users.get(user_id)
    if sessions is None:
        return
    sessions.discard(sid)
    if not sessions:
        online_users.pop(user_id, None)
        await sio.emit("user_offline", {"userId": user_id})
