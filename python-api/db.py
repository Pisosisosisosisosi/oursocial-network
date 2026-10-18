import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

_client = None
_db = None

def connect_db():
    global _client, _db
    if _db is not None:
        return _db

    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/oursocial")
    _client = MongoClient(uri)
    _db = _client.get_database()
    return _db

def get_db():
    if _db is None:
        return connect_db()
    return _db

def users_collection():
    return get_db()["users"]

def keys_collection():
    return get_db()["keys"]

def messages_collection():
    return get_db()["messages"]

def groups_collection():
    return get_db()["groups"]

def channels_collection():
    return get_db()["channels"]

def channel_posts_collection():
    return get_db()["channel_posts"]