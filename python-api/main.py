from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from typing import Literal
import base64
import binascii
import html
import json
import os
import re
import time
from collections import defaultdict, deque
from threading import Lock

from db import users_collection, keys_collection, connect_db, groups_collection
# Импортируем новую функцию для сообщений (ее нужно будет добавить в db.py)
from db import messages_collection 
from auth import (
    hash_password, verify_password, create_token,
    get_current_user,
)
from crypto import validate_public_key, make_key_document
from realtime import sio
import socketio as socketio_server

app = FastAPI(title="Our Social Network API")
MESSAGE_RATE_LIMIT = 5
MESSAGE_RATE_WINDOW_SECONDS = 1.0
message_send_timestamps: dict[str, deque[float]] = defaultdict(deque)
message_rate_lock = Lock()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем всем (потом можно сузить до твоего сайта)
    allow_credentials=False, # Важно: если origins=["*"], credentials должно быть False
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Модели ----------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UploadKeyRequest(BaseModel):
    publicKey: str


class ExchangeRequest(BaseModel):
    targetUserId: str


class UpdateProfileRequest(BaseModel):
    displayName: str = Field(min_length=2, max_length=32)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    avatarUrl: str = Field(default="", max_length=1_400_000)
    bio: str = Field(default="", max_length=300)
    statusText: str = Field(default="", max_length=80)
    showLastSeen: bool = True


class ContactRequest(BaseModel):
    userId: str = Field(min_length=1, max_length=64)
    nickname: str = Field(min_length=1, max_length=40)


# НОВАЯ МОДЕЛЬ ДЛЯ СООБЩЕНИЙ
class MessageRequest(BaseModel):
    receiverId: str = Field(min_length=1, max_length=64)
    text: str = Field(default="", max_length=4000)
    type: Literal["text", "image", "file"] = "text"
    fileName: str = Field(default="", max_length=200)
    contentType: str = Field(default="", max_length=100)
    fileData: str = Field(default="", max_length=2_800_000)


class ReactionRequest(BaseModel):
    emoji: Literal["❤️", "👍", "😂"]


class PinRequest(BaseModel):
    pinned: bool


class EditMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class CreateGroupRequest(BaseModel):
    title: str = Field(min_length=2, max_length=64)
    memberIds: list[str] = Field(default_factory=list, max_length=99)


class AddGroupMembersRequest(BaseModel):
    memberIds: list[str] = Field(min_length=1, max_length=100)


class PrivacyRequest(BaseModel):
    hideOnlineStatus: bool
    hideReadReceipts: bool


# ---------- Startup ----------

@app.on_event("startup")
def startup():
    connect_db()
    print("DEBUG startup: MongoDB connected (python-api)")


# ---------- Health ----------

@app.get("/")
def root():
    return {"status": "ok", "service": "python-api"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------- Auth ----------

@app.post("/auth/register")
def register(payload: RegisterRequest):
    users = users_collection()

    if users.find_one({"email": payload.email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    if users.find_one({"username": payload.username}):
        raise HTTPException(status_code=409, detail="Username already taken")

    doc = {
        "email": payload.email,
        "username": payload.username,
        "displayName": payload.username,
        "passwordHash": hash_password(payload.password),
        "avatarUrl": "",
        "bio": "",
        "statusText": "",
        "showLastSeen": True,
        "hideOnlineStatus": False,
        "hideReadReceipts": False,
        "contacts": [],
        "createdAt": datetime.now(timezone.utc),
        "lastSeen": datetime.now(timezone.utc),
    }
    result = users.insert_one(doc)
    user_id = str(result.inserted_id)

    token = create_token(user_id, payload.email, payload.username)

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": payload.email,
            "username": payload.username,
            "displayName": payload.username,
        },
    }


@app.post("/auth/login")
def login(payload: LoginRequest):
    users = users_collection()
    user = users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(payload.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = str(user["_id"])
    token = create_token(user_id, user["email"], user["username"])

    users.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastSeen": datetime.now(timezone.utc)}},
    )

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user["email"],
            "username": user["username"],
            "displayName": user.get("displayName", user["username"]),
            "avatarUrl": user.get("avatarUrl", ""),
            "bio": user.get("bio", ""),
            "statusText": user.get("statusText", ""),
            "showLastSeen": user.get("showLastSeen", True),
            "hideOnlineStatus": user.get("hideOnlineStatus", False),
            "hideReadReceipts": user.get("hideReadReceipts", False),
        },
    }


@app.get("/auth/me")
def me(current=Depends(get_current_user)):
    users = users_collection()
    try:
        user = users.find_one({"_id": ObjectId(current["userId"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "username": user["username"],
        "displayName": user.get("displayName", user["username"]),
        "avatarUrl": user.get("avatarUrl", ""),
        "bio": user.get("bio", ""),
        "statusText": user.get("statusText", ""),
        "showLastSeen": user.get("showLastSeen", True),
        "hideOnlineStatus": user.get("hideOnlineStatus", False),
        "hideReadReceipts": user.get("hideReadReceipts", False),
        "createdAt": user.get("createdAt"),
    }


@app.patch("/users/me/privacy")
async def update_privacy(payload: PrivacyRequest, current=Depends(get_current_user)):
    users = users_collection()
    result = users.update_one(
        {"_id": ObjectId(current["userId"])},
        {"$set": {
            "hideOnlineStatus": payload.hideOnlineStatus,
            "hideReadReceipts": payload.hideReadReceipts,
        }},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="User not found")

    from realtime import set_user_online_hidden
    await set_user_online_hidden(current["userId"], payload.hideOnlineStatus)
    return {"status": "ok"}


# ---------- Users ----------

@app.get("/users/search")
def search_users(q: str = "", current=Depends(get_current_user)):
    username = q.strip()
    if not username.startswith("@") or len(username) < 4:
        return []

    username = username[1:]
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        return []

    users = users_collection()
    results = users.find(
        {"username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}},
        {"email": 0, "passwordHash": 0},
    ).limit(20)

    return [
        {
            "id": str(u["_id"]),
            "username": u["username"],
            "displayName": u.get("displayName", u["username"]),
            "avatarUrl": u.get("avatarUrl", ""),
            "bio": u.get("bio", ""),
            "statusText": u.get("statusText", ""),
        }
        for u in results
    ]


@app.patch("/users/me/profile")
def update_profile(payload: UpdateProfileRequest, current=Depends(get_current_user)):
    users = users_collection()
    user_id = current["userId"]
    
    existing_user = users.find_one({"username": payload.username})
    if existing_user and str(existing_user["_id"]) != user_id:
        raise HTTPException(status_code=409, detail="Username already taken")

    users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "displayName": payload.displayName,
            "username": payload.username,
            "avatarUrl": payload.avatarUrl,
            "bio": payload.bio,
            "statusText": payload.statusText,
            "showLastSeen": payload.showLastSeen,
        }}
    )
    
    return {"status": "ok", "message": "Profile updated"}


@app.get("/contacts")
def get_contacts(current=Depends(get_current_user)):
    users = users_collection()
    owner = users.find_one(
        {"_id": ObjectId(current["userId"])},
        {"contacts": 1, "hiddenChats": 1},
    )
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")

    contacts = owner.get("contacts", [])
    contact_ids = []
    for contact in contacts:
        try:
            contact_ids.append(ObjectId(contact["userId"]))
        except (KeyError, TypeError, ValueError):
            continue

    if not contact_ids:
        return []

    profile_by_id = {
        str(user["_id"]): user
        for user in users.find(
            {"_id": {"$in": contact_ids}},
            {"email": 0, "passwordHash": 0, "contacts": 0},
        )
    }

    hidden_chats = {
        entry.get("userId"): entry.get("hiddenAt")
        for entry in owner.get("hiddenChats", [])
        if isinstance(entry, dict) and isinstance(entry.get("userId"), str)
    }
    current_id = current["userId"]
    result = []
    for contact in contacts:
        contact_id = contact.get("userId")
        if contact_id not in profile_by_id:
            continue
        hidden_at = hidden_chats.get(contact_id)
        latest_message = None
        if hidden_at:
            latest_message = messages_collection().find_one(
                {
                    "$or": [
                        {"senderId": current_id, "receiverId": contact_id},
                        {"senderId": contact_id, "receiverId": current_id},
                    ]
                },
                {"createdAt": 1},
                sort=[("createdAt", -1), ("_id", -1)],
            )
        profile = profile_by_id[contact_id]
        result.append({
            "id": contact_id,
            "nickname": contact["nickname"],
            "username": profile["username"],
            "displayName": profile.get("displayName", profile["username"]),
            "avatarUrl": profile.get("avatarUrl", ""),
            "bio": profile.get("bio", ""),
            "statusText": profile.get("statusText", ""),
            "chatHidden": bool(hidden_at and (
                not latest_message or latest_message["createdAt"] <= hidden_at
            )),
        })

    return result


@app.put("/contacts")
def add_or_update_contact(payload: ContactRequest, current=Depends(get_current_user)):
    if not ObjectId.is_valid(payload.userId):
        raise HTTPException(status_code=400, detail="Invalid user id")

    owner_id = ObjectId(current["userId"])
    target_id = ObjectId(payload.userId)
    if owner_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot add yourself to contacts")

    users = users_collection()
    target = users.find_one({"_id": target_id}, {"_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    owner = users.find_one({"_id": owner_id}, {"_id": 1})
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")

    contact = {"userId": payload.userId, "nickname": payload.nickname.strip()}
    updated = users.update_one(
        {"_id": owner_id, "contacts.userId": payload.userId},
        {"$set": {"contacts.$.nickname": contact["nickname"]}},
    )
    if not updated.matched_count:
        users.update_one({"_id": owner_id}, {"$push": {"contacts": contact}})

    return {"status": "ok", "contact": contact}


@app.delete("/contacts/{user_id}")
def remove_contact(user_id: str, current=Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    users = users_collection()
    result = users.update_one(
        {"_id": ObjectId(current["userId"])},
        {"$pull": {"contacts": {"userId": user_id}}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok"}


@app.delete("/chats/{user_id}")
def delete_chat(user_id: str, current=Depends(get_current_user)):
    if not ObjectId.is_valid(user_id) or user_id == current["userId"]:
        raise HTTPException(status_code=400, detail="Invalid chat user id")

    users = users_collection()
    owner_id = ObjectId(current["userId"])
    owner = users.find_one({"_id": owner_id}, {"hiddenChats": 1})
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")

    hidden_at = datetime.now(timezone.utc)
    updated = users.update_one(
        {"_id": owner_id, "hiddenChats.userId": user_id},
        {"$set": {"hiddenChats.$.hiddenAt": hidden_at}},
    )
    if not updated.matched_count:
        users.update_one(
            {"_id": owner_id},
            {"$push": {"hiddenChats": {"userId": user_id, "hiddenAt": hidden_at}}},
        )
    return {"status": "ok"}


@app.get("/users/{user_id}")
def get_user(user_id: str, current=Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")

    users = users_collection()
    user = users.find_one(
        {"_id": ObjectId(user_id)},
        {"email": 0, "passwordHash": 0, "contacts": 0},
    )

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = {
        "id": str(user["_id"]),
        "username": user["username"],
        "displayName": user.get("displayName", user["username"]),
        "avatarUrl": user.get("avatarUrl", ""),
        "bio": user.get("bio", ""),
        "statusText": user.get("statusText", ""),
    }
    if str(user["_id"]) == current["userId"] or user.get("showLastSeen", True):
        profile["lastSeen"] = user.get("lastSeen")
    return profile


# ---------- Messages (НОВЫЙ РАЗДЕЛ) ----------

MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/csv", "application/zip",
}


def serialize_message(message):
    return {
        "id": str(message["_id"]),
        "senderId": message["senderId"],
        "receiverId": message["receiverId"],
        "text": message.get("text", ""),
        "type": message.get("type", "text"),
        "fileName": message.get("fileName", ""),
        "contentType": message.get("contentType", ""),
        "fileData": message.get("fileData", ""),
        "reactions": message.get("reactions", []),
        "pinned": message.get("pinned", False),
        "pinnedAt": message.get("pinnedAt").isoformat() if message.get("pinnedAt") else None,
        "createdAt": message["createdAt"].isoformat(),
        "read": message.get("read", False),
        "groupId": message.get("groupId"),
        "edited": message.get("edited", False),
    }


def serialize_message_update(message):
    serialized = serialize_message(message)
    serialized.pop("fileData", None)
    return serialized


def find_message_for_user(message_id: str, user_id: str):
    if not ObjectId.is_valid(message_id):
        raise HTTPException(status_code=400, detail="Invalid message id")
    message = messages_collection().find_one({"_id": ObjectId(message_id)})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if user_id in (message.get("senderId"), message.get("receiverId")):
        other_id = message["receiverId"] if message["senderId"] == user_id else message["senderId"]
        owner = users_collection().find_one({"_id": ObjectId(user_id)}, {"hiddenChats": 1}) or {}
        hidden_entry = next(
            (
                entry for entry in owner.get("hiddenChats", [])
                if isinstance(entry, dict) and entry.get("userId") == other_id
            ),
            None,
        )
        if hidden_entry and message["createdAt"] <= hidden_entry["hiddenAt"]:
            raise HTTPException(status_code=404, detail="Message not found")
    else:
        group_id = message.get("groupId")
        if not group_id or not ObjectId.is_valid(group_id):
            raise HTTPException(status_code=404, detail="Message not found")
        group = groups_collection().find_one(
            {"_id": ObjectId(group_id), "members.userId": user_id},
            {"members.$": 1},
        )
        membership = (group or {}).get("members", [])
        if not membership or message["createdAt"] < membership[0]["joinedAt"]:
            raise HTTPException(status_code=404, detail="Message not found")
    return message


def get_group_for_member(group_id: str, user_id: str):
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group id")
    group = groups_collection().find_one(
        {"_id": ObjectId(group_id), "members.userId": user_id}
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def group_message_recipients(group_id: str) -> list[str]:
    group = groups_collection().find_one({"_id": ObjectId(group_id)}, {"members.userId": 1})
    return [member["userId"] for member in (group or {}).get("members", []) if member.get("userId")]


def enforce_message_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    with message_rate_lock:
        timestamps = message_send_timestamps[user_id]
        while timestamps and now - timestamps[0] >= MESSAGE_RATE_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= MESSAGE_RATE_LIMIT:
            retry_after = MESSAGE_RATE_WINDOW_SECONDS - (now - timestamps[0])
            raise HTTPException(
                status_code=429,
                detail="Too many messages. Please wait before sending again.",
                headers={"Retry-After": f"{retry_after:.2f}"},
            )
        timestamps.append(now)


@app.post("/messages")
async def send_message(payload: MessageRequest, current=Depends(get_current_user)):
    if not ObjectId.is_valid(payload.receiverId):
        raise HTTPException(status_code=400, detail="Invalid receiver id")
    if payload.receiverId == current["userId"]:
        raise HTTPException(status_code=400, detail="Cannot send a message to yourself")

    file_name = ""
    content_type = ""
    file_data = ""
    if payload.type == "text":
        if not payload.text.strip():
            raise HTTPException(status_code=400, detail="Message text cannot be empty")
    else:
        if payload.contentType not in ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(status_code=415, detail="Unsupported attachment type")
        match = re.fullmatch(
            r"data:([\w.+-]+/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})",
            payload.fileData,
        )
        if not match or match.group(1) != payload.contentType:
            raise HTTPException(status_code=400, detail="Invalid attachment data")
        try:
            decoded = base64.b64decode(match.group(2), validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=400, detail="Invalid attachment encoding")
        if not decoded or len(decoded) > MAX_ATTACHMENT_SIZE:
            raise HTTPException(status_code=413, detail="Attachment must be no larger than 2 MB")
        is_image = payload.contentType.startswith("image/")
        if (payload.type == "image") != is_image:
            raise HTTPException(status_code=400, detail="Attachment type does not match its content")
        file_name = os.path.basename(payload.fileName.strip().replace("\\", "/"))
        if not file_name or file_name in {".", ".."}:
            raise HTTPException(status_code=400, detail="Attachment filename is required")
        content_type = payload.contentType
        file_data = payload.fileData

    enforce_message_rate_limit(current["userId"])

    messages = messages_collection()
    doc = {
        "senderId": current["userId"],
        "receiverId": payload.receiverId,
        "text": payload.text,
        "type": payload.type,
        "fileName": file_name,
        "contentType": content_type,
        "fileData": file_data,
        "reactions": [],
        "pinned": False,
        "createdAt": datetime.now(timezone.utc),
        "read": False,
    }
    result = messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    await sio.emit(
        "message_changed",
        {
            "messageId": str(result.inserted_id),
            "senderId": current["userId"],
            "receiverId": payload.receiverId,
            "action": "created",
        },
        to=f"user:{payload.receiverId}",
    )
    await sio.emit(
        "message_changed",
        {
            "messageId": str(result.inserted_id),
            "senderId": current["userId"],
            "receiverId": payload.receiverId,
            "action": "created",
        },
        to=f"user:{current['userId']}",
    )
    return serialize_message(doc)


@app.get("/messages/{user_id}")
async def get_messages(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    before: str | None = None,
    current=Depends(get_current_user),
):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user id")
    messages = messages_collection()
    my_id = current["userId"]

    participant_filter = {
        "$or": [
            {"senderId": my_id, "receiverId": user_id},
            {"senderId": user_id, "receiverId": my_id},
        ]
    }
    owner = users_collection().find_one(
        {"_id": ObjectId(my_id)},
        {"hiddenChats": 1, "hideReadReceipts": 1},
    ) or {}
    hidden_entry = next(
        (
            entry for entry in owner.get("hiddenChats", [])
            if isinstance(entry, dict) and entry.get("userId") == user_id
        ),
        None,
    )
    hidden_filter = {"createdAt": {"$gt": hidden_entry["hiddenAt"]}} if hidden_entry else None
    if not before:
        read_filter = {"senderId": user_id, "receiverId": my_id, "read": False}
        if hidden_filter:
            read_filter["createdAt"] = hidden_filter["createdAt"]
        if not owner.get("hideReadReceipts", False):
            newest_unread = messages.find_one(
                read_filter,
                {"_id": 1},
                sort=[("createdAt", -1), ("_id", -1)],
            )
            marked_read = messages.update_many(
                read_filter,
                {"$set": {"read": True}},
            )
            if marked_read.modified_count and newest_unread:
                read_message = messages.find_one({"_id": newest_unread["_id"]})
                await sio.emit(
                    "message_changed",
                    {
                        "messageId": str(newest_unread["_id"]),
                        "action": "read",
                        "senderId": user_id,
                        "receiverId": my_id,
                        "message": serialize_message_update(read_message) if read_message else None,
                    },
                    to=f"user:{user_id}",
                )
        page_filter = {"$and": [participant_filter, hidden_filter]} if hidden_filter else participant_filter
    else:
        if not ObjectId.is_valid(before):
            raise HTTPException(status_code=400, detail="Invalid message cursor")
        cursor_message = messages.find_one(
            {
                "$and": [
                    {"_id": ObjectId(before)},
                    participant_filter,
                    *([hidden_filter] if hidden_filter else []),
                ]
            },
            {"createdAt": 1},
        )
        if not cursor_message:
            raise HTTPException(status_code=400, detail="Message cursor not found in this chat")
        cursor_filter = {
            "$or": [
                {"createdAt": {"$lt": cursor_message["createdAt"]}},
                {
                    "createdAt": cursor_message["createdAt"],
                    "_id": {"$lt": cursor_message["_id"]},
                },
            ]
        }
        page_filter = {"$and": [participant_filter, cursor_filter, *([hidden_filter] if hidden_filter else [])]}

    chat = list(
        messages.find(page_filter)
        .sort([("createdAt", -1), ("_id", -1)])
        .limit(limit)
    )
    chat.reverse()
    return [serialize_message(message) for message in chat]


@app.delete("/messages/{user_id}")
async def delete_message(user_id: str, current=Depends(get_current_user)):
    message = find_message_for_user(user_id, current["userId"])
    if message["senderId"] != current["userId"]:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    messages_collection().delete_one({"_id": message["_id"], "senderId": current["userId"]})
    event = {
        "messageId": user_id,
        "action": "deleted",
        "groupId": message.get("groupId"),
        "senderId": message["senderId"],
        "receiverId": message["receiverId"],
    }
    recipients = group_message_recipients(message["groupId"]) if message.get("groupId") else [
        message["receiverId"], message["senderId"]
    ]
    for recipient_id in set(recipients):
        await sio.emit("message_changed", event, to=f"user:{recipient_id}")
    return {"status": "ok"}


@app.post("/messages/{message_id}/reactions")
async def toggle_reaction(
    message_id: str,
    payload: ReactionRequest,
    current=Depends(get_current_user),
):
    message = find_message_for_user(message_id, current["userId"])
    reaction = {"userId": current["userId"], "emoji": payload.emoji}
    messages = messages_collection()
    if reaction in message.get("reactions", []):
        messages.update_one({"_id": message["_id"]}, {"$pull": {"reactions": reaction}})
    else:
        messages.update_one({"_id": message["_id"]}, {"$addToSet": {"reactions": reaction}})

    updated_message = messages.find_one({"_id": message["_id"]})
    event = {
        "messageId": message_id,
        "action": "reaction",
        "groupId": message.get("groupId"),
        "senderId": message["senderId"],
        "receiverId": message["receiverId"],
        "message": serialize_message_update(updated_message) if updated_message else None,
    }
    recipients = group_message_recipients(message["groupId"]) if message.get("groupId") else [
        message["receiverId"], message["senderId"]
    ]
    for recipient_id in set(recipients):
        await sio.emit("message_changed", event, to=f"user:{recipient_id}")
    return {"status": "ok"}


@app.post("/messages/{message_id}/pin")
async def set_message_pin(
    message_id: str,
    payload: PinRequest,
    current=Depends(get_current_user),
):
    message = find_message_for_user(message_id, current["userId"])
    update: dict[str, dict[str, object]] = {"$set": {"pinned": payload.pinned}}
    if payload.pinned:
        update["$set"].update({
            "pinnedAt": datetime.now(timezone.utc),
            "pinnedBy": current["userId"],
        })
    else:
        update["$unset"] = {"pinnedAt": "", "pinnedBy": ""}

    update_result = messages_collection().update_one({"_id": message["_id"]}, update)
    if update_result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Message not found")

    updated_message = find_message_for_user(message_id, current["userId"])
    if updated_message.get("pinned", False) != payload.pinned:
        raise HTTPException(status_code=500, detail="Message pin was not persisted")

    event = {
        "messageId": message_id,
        "action": "pin",
        "groupId": message.get("groupId"),
        "senderId": message["senderId"],
        "receiverId": message["receiverId"],
        "message": serialize_message_update(updated_message),
    }
    recipients = group_message_recipients(message["groupId"]) if message.get("groupId") else [
        message["receiverId"], message["senderId"]
    ]
    for recipient_id in set(recipients):
        await sio.emit("message_changed", event, to=f"user:{recipient_id}")
    return {"status": "ok", "pinned": updated_message["pinned"]}


@app.patch("/messages/{message_id}")
async def edit_message(
    message_id: str,
    payload: EditMessageRequest,
    current=Depends(get_current_user),
):
    message = find_message_for_user(message_id, current["userId"])
    if message["senderId"] != current["userId"]:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    if message.get("type", "text") != "text":
        raise HTTPException(status_code=400, detail="Only text messages can be edited")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    messages_collection().update_one(
        {"_id": message["_id"], "senderId": current["userId"]},
        {"$set": {"text": text, "edited": True, "updatedAt": datetime.now(timezone.utc)}},
    )
    updated_message = messages_collection().find_one({"_id": message["_id"]})
    event = {
        "messageId": message_id,
        "action": "edited",
        "groupId": message.get("groupId"),
        "senderId": message["senderId"],
        "receiverId": message["receiverId"],
        "message": serialize_message_update(updated_message),
    }
    recipients = group_message_recipients(message["groupId"]) if message.get("groupId") else [
        message["receiverId"], message["senderId"]
    ]
    for recipient_id in set(recipients):
        await sio.emit("message_changed", event, to=f"user:{recipient_id}")
    return serialize_message(updated_message)


@app.get("/groups")
def list_groups(current=Depends(get_current_user)):
    user_id = current["userId"]
    groups = list(groups_collection().find({"members.userId": user_id}).sort("updatedAt", -1))
    user_ids = {
        member["userId"]
        for group in groups
        for member in group.get("members", [])
    }
    profile_by_id = {
        str(user["_id"]): user
        for user in users_collection().find(
            {"_id": {"$in": [ObjectId(value) for value in user_ids if ObjectId.is_valid(value)]}},
            {"username": 1, "displayName": 1, "avatarUrl": 1},
        )
    }
    return [
        {
            "id": str(group["_id"]),
            "title": group["title"],
            "createdAt": group["createdAt"].isoformat(),
            "memberCount": len(group.get("members", [])),
            "members": [
                {
                    "userId": member["userId"],
                    "username": profile_by_id.get(member["userId"], {}).get("username", ""),
                    "displayName": profile_by_id.get(member["userId"], {}).get("displayName", ""),
                    "avatarUrl": profile_by_id.get(member["userId"], {}).get("avatarUrl", ""),
                    "joinedAt": member["joinedAt"].isoformat(),
                }
                for member in group.get("members", [])
            ],
        }
        for group in groups
    ]


@app.post("/groups")
async def create_group(payload: CreateGroupRequest, current=Depends(get_current_user)):
    member_ids = list(dict.fromkeys([current["userId"], *payload.memberIds]))
    if len(member_ids) < 2:
        raise HTTPException(status_code=422, detail="A shared group must have at least one other member")
    if len(member_ids) > 100:
        raise HTTPException(status_code=422, detail="A group can have up to 100 members")
    if any(not ObjectId.is_valid(value) for value in member_ids):
        raise HTTPException(status_code=400, detail="Invalid member id")
    user_docs = list(users_collection().find(
        {"_id": {"$in": [ObjectId(value) for value in member_ids]}},
        {"_id": 1},
    ))
    if len(user_docs) != len(member_ids):
        raise HTTPException(status_code=404, detail="One or more users were not found")

    now = datetime.now(timezone.utc)
    group = {
        "title": payload.title.strip(),
        "createdBy": current["userId"],
        "createdAt": now,
        "updatedAt": now,
        "members": [
            {"userId": member_id, "joinedAt": now, "role": "owner" if member_id == current["userId"] else "member"}
            for member_id in member_ids
        ],
    }
    if len(group["title"]) < 2:
        raise HTTPException(status_code=422, detail="Group name must contain at least 2 characters")
    result = groups_collection().insert_one(group)
    group["_id"] = result.inserted_id
    for member_id in member_ids:
        await sio.emit(
            "group_changed",
            {"groupId": str(result.inserted_id), "action": "created"},
            to=f"user:{member_id}",
        )
    return {"id": str(result.inserted_id), "title": group["title"], "memberCount": len(member_ids)}


@app.post("/groups/{group_id}/members")
async def add_group_members(
    group_id: str,
    payload: AddGroupMembersRequest,
    current=Depends(get_current_user),
):
    group = get_group_for_member(group_id, current["userId"])
    member_ids = list(dict.fromkeys(payload.memberIds))
    if any(not ObjectId.is_valid(value) for value in member_ids):
        raise HTTPException(status_code=400, detail="Invalid member id")
    existing_ids = {member["userId"] for member in group.get("members", [])}
    new_ids = [value for value in member_ids if value not in existing_ids]
    if len(existing_ids) + len(new_ids) > 100:
        raise HTTPException(status_code=422, detail="A group can have up to 100 members")
    if not new_ids:
        return {"status": "ok", "added": []}
    user_docs = list(users_collection().find(
        {"_id": {"$in": [ObjectId(value) for value in new_ids]}},
        {"_id": 1},
    ))
    if len(user_docs) != len(new_ids):
        raise HTTPException(status_code=404, detail="One or more users were not found")

    now = datetime.now(timezone.utc)
    joined_at = now + timedelta(milliseconds=1)
    new_members = [{"userId": value, "joinedAt": joined_at, "role": "member"} for value in new_ids]
    groups_collection().update_one(
        {"_id": group["_id"]},
        {"$push": {"members": {"$each": new_members}}, "$set": {"updatedAt": now}},
    )
    for member_id in [*existing_ids, *new_ids]:
        await sio.emit(
            "group_changed",
            {"groupId": group_id, "action": "members"},
            to=f"user:{member_id}",
        )
    return {"status": "ok", "added": new_ids}


@app.get("/groups/{group_id}/export")
def export_group(
    group_id: str,
    format: Literal["json", "html"] = Query(default="json"),
    current=Depends(get_current_user),
):
    group = get_group_for_member(group_id, current["userId"])
    member = next(item for item in group["members"] if item["userId"] == current["userId"])
    messages = [
        serialize_message(message)
        for message in messages_collection().find(
            {"groupId": group_id, "createdAt": {"$gte": member["joinedAt"]}}
        ).sort([("createdAt", 1), ("_id", 1)])
    ]
    file_name = f"pulse-group-{group_id}"
    if format == "json":
        return Response(
            content=json.dumps(messages, ensure_ascii=False),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{file_name}.json"'},
        )
    rows = "".join(
        "<article><time>" + html.escape(message["createdAt"]) + "</time>"
        + "<b>" + html.escape(message["senderId"]) + "</b>"
        + "<p>" + html.escape(message["text"] or message["fileName"] or "Вложение") + "</p></article>"
        for message in messages
    )
    document = (
        "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><title>Экспорт группы Pulse</title>"
        "<style>body{font:15px system-ui;max-width:760px;margin:32px auto;padding:0 16px;background:#0b1020;color:#e2e8f0}"
        "article{padding:14px;margin:10px 0;border:1px solid #334155;border-radius:14px}time{color:#94a3b8;font-size:12px;margin-right:12px}"
        "p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>" + html.escape(group["title"]) + "</h1>" + rows + "</html>"
    )
    return Response(
        content=document,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{file_name}.html"'},
    )


@app.get("/groups/{group_id}/messages")
def get_group_messages(
    group_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    before: str | None = None,
    current=Depends(get_current_user),
):
    group = get_group_for_member(group_id, current["userId"])
    member = next(member for member in group["members"] if member["userId"] == current["userId"])
    query: dict = {"groupId": group_id, "createdAt": {"$gte": member["joinedAt"]}}
    if before:
        if not ObjectId.is_valid(before):
            raise HTTPException(status_code=400, detail="Invalid message cursor")
        cursor = messages_collection().find_one(
            {"_id": ObjectId(before), "groupId": group_id, "createdAt": {"$gte": member["joinedAt"]}},
            {"createdAt": 1},
        )
        if not cursor:
            raise HTTPException(status_code=400, detail="Message cursor not found in this group")
        query["$or"] = [
            {"createdAt": {"$lt": cursor["createdAt"], "$gte": member["joinedAt"]}},
            {"createdAt": cursor["createdAt"], "_id": {"$lt": cursor["_id"]}},
        ]
    page = list(messages_collection().find(query).sort([("createdAt", -1), ("_id", -1)]).limit(limit))
    page.reverse()
    return [serialize_message(message) for message in page]


@app.get("/messages/{user_id}/export")
def export_messages(
    user_id: str,
    format: Literal["json", "html"] = Query(default="json"),
    current=Depends(get_current_user),
):
    if not ObjectId.is_valid(user_id) or user_id == current["userId"]:
        raise HTTPException(status_code=400, detail="Invalid chat user id")
    owner = users_collection().find_one(
        {"_id": ObjectId(current["userId"])},
        {"hiddenChats": 1},
    ) or {}
    hidden_entry = next(
        (
            entry for entry in owner.get("hiddenChats", [])
            if isinstance(entry, dict) and entry.get("userId") == user_id
        ),
        None,
    )
    query: dict = {
        "$or": [
            {"senderId": current["userId"], "receiverId": user_id},
            {"senderId": user_id, "receiverId": current["userId"]},
        ]
    }
    if hidden_entry:
        query = {"$and": [query, {"createdAt": {"$gt": hidden_entry["hiddenAt"]}}]}
    messages = [
        serialize_message(message)
        for message in messages_collection().find(query).sort([("createdAt", 1), ("_id", 1)])
    ]
    if format == "json":
        return Response(
            content=json.dumps(messages, ensure_ascii=False),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="pulse-chat-{user_id}.json"'},
        )

    rows = "".join(
        "<article><time>" + html.escape(message["createdAt"]) + "</time>"
        + "<b>" + html.escape("Вы" if message["senderId"] == current["userId"] else "Собеседник") + "</b>"
        + "<p>" + html.escape(message["text"] or message["fileName"] or "Вложение") + "</p></article>"
        for message in messages
    )
    document = (
        "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><title>Экспорт Pulse</title>"
        "<style>body{font:15px system-ui;max-width:760px;margin:32px auto;padding:0 16px;background:#0b1020;color:#e2e8f0}"
        "article{padding:14px;margin:10px 0;border:1px solid #334155;border-radius:14px}time{color:#94a3b8;font-size:12px;margin-right:12px}"
        "p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>История чата Pulse</h1>" + rows + "</html>"
    )
    return Response(
        content=document,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="pulse-chat-{user_id}.html"'},
    )


@app.post("/groups/{group_id}/messages")
async def send_group_message(
    group_id: str,
    payload: EditMessageRequest,
    current=Depends(get_current_user),
):
    group = get_group_for_member(group_id, current["userId"])
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text cannot be empty")
    enforce_message_rate_limit(current["userId"])
    now = datetime.now(timezone.utc)
    doc = {
        "groupId": group_id,
        "senderId": current["userId"],
        "receiverId": "",
        "text": text,
        "type": "text",
        "reactions": [],
        "pinned": False,
        "createdAt": now,
        "read": False,
    }
    result = messages_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    groups_collection().update_one({"_id": group["_id"]}, {"$set": {"updatedAt": now}})
    event = {
        "messageId": str(result.inserted_id),
        "groupId": group_id,
        "senderId": current["userId"],
        "action": "created",
    }
    for member in group.get("members", []):
        await sio.emit("message_changed", event, to=f"user:{member['userId']}")

    usernames = {match for match in re.findall(r"(?<![\w])@([A-Za-z0-9_.-]{3,32})", text)}
    if usernames:
        mentioned = users_collection().find(
            {"$or": [
                {"username": {"$regex": f"^{re.escape(username)}$", "$options": "i"}}
                for username in usernames
            ]},
            {"_id": 1, "username": 1},
        )
        member_ids = {member["userId"] for member in group.get("members", [])}
        for user in mentioned:
            mentioned_id = str(user["_id"])
            if mentioned_id in member_ids and mentioned_id != current["userId"]:
                await sio.emit(
                    "group_mention",
                    {
                        "groupId": group_id,
                        "groupTitle": group["title"],
                        "senderId": current["userId"],
                        "senderUsername": current.get("username", "Пользователь"),
                        "username": user["username"],
                        "message": text,
                    },
                    to=f"user:{mentioned_id}",
                )
    return serialize_message(doc)


# ---------- Encryption keys ----------

@app.post("/keys/upload")
def upload_key(payload: UploadKeyRequest, current=Depends(get_current_user)):
    if not validate_public_key(payload.publicKey):
        raise HTTPException(status_code=400, detail="Invalid public key")

    keys = keys_collection()
    user_id = current["userId"]

    keys.update_one(
        {"userId": user_id},
        {"$set": make_key_document(user_id, payload.publicKey)},
        upsert=True,
    )
    return {"status": "ok"}


@app.get("/keys/me")
def get_my_key(current=Depends(get_current_user)):
    keys = keys_collection()
    user_id = current["userId"]

    doc = keys.find_one({"userId": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found for userId=" + str(user_id))
    return {
        "userId": doc["userId"],
        "publicKey": doc["publicKey"],
        "createdAt": doc.get("createdAt"),
    }


@app.post("/keys/exchange")
def exchange_keys(payload: ExchangeRequest, current=Depends(get_current_user)):
    target_user_id = payload.targetUserId
    if not target_user_id:
        raise HTTPException(status_code=400, detail="targetUserId required")
    if target_user_id == current["userId"]:
        raise HTTPException(status_code=400, detail="Cannot exchange with yourself")

    keys = keys_collection()

    my_key = keys.find_one({"userId": current["userId"]})
    if not my_key:
        raise HTTPException(status_code=404, detail="Your key not found. Upload it first.")

    target_key = keys.find_one({"userId": target_user_id})
    if not target_key:
        raise HTTPException(status_code=404, detail="Target user has no public key")

    return {
        "myKey": my_key["publicKey"],
        "targetKey": target_key["publicKey"],
    }


@app.get("/keys/{user_id}")
def get_key(user_id: str, current=Depends(get_current_user)):
    keys = keys_collection()
    doc = keys.find_one({"userId": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"userId": doc["userId"], "publicKey": doc["publicKey"]}


# Serve Socket.IO alongside FastAPI so both share the same host and JWT secret.
socket_app = socketio_server.ASGIApp(sio, other_asgi_app=app)