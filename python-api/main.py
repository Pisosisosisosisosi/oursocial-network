from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId
from datetime import datetime, timezone
import re

from db import users_collection, keys_collection, connect_db
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
    receiverId: str
    text: str


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
        "createdAt": user.get("createdAt"),
    }


# ---------- Users ----------

@app.get("/users/search")
def search_users(q: str = "", current=Depends(get_current_user)):
    query = re.escape(q.strip())
    users = users_collection()
    results = users.find(
        {"username": {"$regex": query, "$options": "i"}},
        {"email": 0, "passwordHash": 0},
    ).sort("username", 1).limit(20)

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
        {"contacts": 1},
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

    return [
        {
            "id": contact["userId"],
            "nickname": contact["nickname"],
            "username": profile_by_id[contact["userId"]]["username"],
            "displayName": profile_by_id[contact["userId"]].get(
                "displayName", profile_by_id[contact["userId"]]["username"]
            ),
            "avatarUrl": profile_by_id[contact["userId"]].get("avatarUrl", ""),
            "bio": profile_by_id[contact["userId"]].get("bio", ""),
            "statusText": profile_by_id[contact["userId"]].get("statusText", ""),
        }
        for contact in contacts
        if contact.get("userId") in profile_by_id
    ]


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

@app.post("/messages")
def send_message(payload: MessageRequest, current=Depends(get_current_user)):
    messages = messages_collection()
    
    doc = {
        "senderId": current["userId"],
        "receiverId": payload.receiverId,
        "text": payload.text,
        "createdAt": datetime.now(timezone.utc),
        "read": False
    }
    messages.insert_one(doc)
    return {"status": "ok"}


@app.get("/messages/{user_id}")
def get_messages(user_id: str, current=Depends(get_current_user)):
    messages = messages_collection()
    my_id = current["userId"]

    # Opening a conversation marks messages received by the current user as read.
    messages.update_many(
        {
            "senderId": user_id,
            "receiverId": my_id,
            "read": False,
        },
        {"$set": {"read": True}},
    )

    # Ищем переписку между мной и другим пользователем
    chat = list(messages.find({
        "$or": [
            {"senderId": my_id, "receiverId": user_id},
            {"senderId": user_id, "receiverId": my_id}
        ]
    }).sort("createdAt", 1))

    return [
        {
            "id": str(m["_id"]),
            "senderId": m["senderId"],
            "receiverId": m["receiverId"],
            "text": m["text"],
            "createdAt": m["createdAt"].isoformat(),
            "read": m.get("read", False)
        }
        for m in chat
    ]


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