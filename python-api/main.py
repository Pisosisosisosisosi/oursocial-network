from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId
from datetime import datetime, timezone

from db import users_collection, keys_collection, connect_db
from auth import (
    hash_password, verify_password, create_token,
    get_current_user,
)
from crypto import validate_public_key, make_key_document

app = FastAPI(title="Our Social Network API")

# Явно указываем домены для CORS (звездочка не работает с credentials)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://pipipipipi.3utilities.com",  # Ваш точный домен (4 буквы i)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Модели ----------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    username: str = Field(min_length=2, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UploadKeyRequest(BaseModel):
    publicKey: str


class ExchangeRequest(BaseModel):
    targetUserId: str


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
        "passwordHash": hash_password(payload.password),
        "avatarUrl": "",
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
            "avatarUrl": user.get("avatarUrl", ""),
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
        "avatarUrl": user.get("avatarUrl", ""),
        "createdAt": user.get("createdAt"),
    }


# ---------- Users ----------

@app.get("/users/search")
def search_users(q: str, current=Depends(get_current_user)):
    users = users_collection()
    results = users.find(
        {"username": {"$regex": q, "$options": "i"}},
        {"email": 0, "passwordHash": 0},
    ).limit(20)

    return [
        {
            "id": str(u["_id"]),
            "username": u["username"],
            "avatarUrl": u.get("avatarUrl", ""),
        }
        for u in results
    ]


@app.get("/users/{user_id}")
def get_user(user_id: str):
    users = users_collection()
    try:
        user = users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "avatarUrl": user.get("avatarUrl", ""),
        "lastSeen": user.get("lastSeen"),
    }


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
    doc = keys.findOne({"userId": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"userId": doc["userId"], "publicKey": doc["publicKey"]}