import re
import secrets
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from db import channel_posts_collection, channels_collection, users_collection
from auth import get_current_user
from realtime import sio


router = APIRouter(prefix="/channels", tags=["channels"])


class CreateChannelRequest(BaseModel):
    title: str = Field(min_length=2, max_length=64)
    description: str = Field(default="", max_length=500)
    visibility: Literal["public", "private"] = "public"


class UpdateChannelRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=500)
    avatarUrl: str | None = Field(default=None, max_length=1_400_000)
    visibility: Literal["public", "private"] | None = None

    @field_validator("avatarUrl")
    @classmethod
    def validate_avatar_url(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if value.startswith("https://"):
            return value
        if not re.fullmatch(
            r"data:image/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*",
            value,
        ):
            raise ValueError("Avatar must be an HTTPS image URL or a supported base64 image")
        return value


class ChannelPostRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class ChannelReactionRequest(BaseModel):
    emoji: Literal["❤️", "👍", "😂"]


def channel_by_id(channel_id: str):
    if not ObjectId.is_valid(channel_id):
        raise HTTPException(status_code=400, detail="Invalid channel id")
    channel = channels_collection().find_one({"_id": ObjectId(channel_id)})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


def get_member(channel: dict, user_id: str):
    return next(
        (member for member in channel.get("members", []) if member.get("userId") == user_id),
        None,
    )


def require_owner(channel: dict, user_id: str):
    if channel.get("ownerId") != user_id:
        raise HTTPException(status_code=403, detail="Only the channel owner can do this")


def require_read_access(channel: dict, user_id: str):
    if channel.get("visibility") == "private" and not get_member(channel, user_id):
        raise HTTPException(status_code=404, detail="Channel not found")


def serialize_channel(channel: dict, user_id: str) -> dict:
    owner_id = channel["ownerId"]
    owner = None
    if ObjectId.is_valid(owner_id):
        owner = users_collection().find_one(
            {"_id": ObjectId(owner_id)},
            {"username": 1, "displayName": 1, "avatarUrl": 1},
        )
    return {
        "id": str(channel["_id"]),
        "title": channel["title"],
        "description": channel.get("description", ""),
        "visibility": channel["visibility"],
        "avatarUrl": channel.get("avatarUrl", ""),
        "ownerId": owner_id,
        "ownerUsername": (owner or {}).get("username", ""),
        "ownerName": (owner or {}).get("displayName", ""),
        "memberCount": len(channel.get("members", [])),
        "isSubscribed": get_member(channel, user_id) is not None,
        "isOwner": owner_id == user_id,
        "createdAt": channel["createdAt"].isoformat(),
        "updatedAt": channel["updatedAt"].isoformat(),
    }


def serialize_post(post: dict) -> dict:
    return {
        "id": str(post["_id"]),
        "channelId": post["channelId"],
        "senderId": post["senderId"],
        "text": post["text"],
        "reactions": post.get("reactions", []),
        "pinned": post.get("pinned", False),
        "pinnedAt": post.get("pinnedAt").isoformat() if post.get("pinnedAt") else None,
        "createdAt": post["createdAt"].isoformat(),
    }


async def notify_members(channel: dict, event: dict):
    for member in channel.get("members", []):
        await sio.emit("channel_changed", event, to=f"user:{member['userId']}")


@router.get("")
def list_channels(current=Depends(get_current_user)):
    user_id = current["userId"]
    channels = list(channels_collection().find({
        "$or": [
            {"visibility": "public"},
            {"members.userId": user_id},
        ]
    }).sort("updatedAt", -1).limit(100))
    return [serialize_channel(channel, user_id) for channel in channels]


@router.post("")
async def create_channel(payload: CreateChannelRequest, current=Depends(get_current_user)):
    title = payload.title.strip()
    if len(title) < 2:
        raise HTTPException(status_code=422, detail="Channel name must contain at least 2 characters")
    now = datetime.now(timezone.utc)
    channel = {
        "title": title,
        "description": payload.description.strip(),
        "visibility": payload.visibility,
        "avatarUrl": "",
        "ownerId": current["userId"],
        "members": [{"userId": current["userId"], "role": "owner", "joinedAt": now}],
        "createdAt": now,
        "updatedAt": now,
    }
    if payload.visibility == "private":
        channel["inviteCode"] = secrets.token_urlsafe(18)
    result = channels_collection().insert_one(channel)
    channel["_id"] = result.inserted_id
    await notify_members(channel, {"action": "created", "channelId": str(result.inserted_id)})
    response = serialize_channel(channel, current["userId"])
    if channel.get("inviteCode"):
        response["inviteCode"] = channel["inviteCode"]
    return response


@router.get("/invites/{invite_code}")
def preview_channel_invite(invite_code: str):
    channel = channels_collection().find_one({"inviteCode": invite_code})
    if not channel:
        raise HTTPException(status_code=404, detail="Invite link is invalid or expired")
    owner = users_collection().find_one(
        {"_id": ObjectId(channel["ownerId"])},
        {"username": 1, "displayName": 1},
    ) if ObjectId.is_valid(channel["ownerId"]) else None
    return {
        "id": str(channel["_id"]),
        "title": channel["title"],
        "description": channel.get("description", ""),
        "avatarUrl": channel.get("avatarUrl", ""),
        "memberCount": len(channel.get("members", [])),
        "ownerName": (owner or {}).get("displayName") or (owner or {}).get("username", ""),
    }


@router.get("/{channel_id}/invite")
def get_channel_invite(channel_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    if channel["visibility"] != "private":
        raise HTTPException(status_code=400, detail="Only private channels use invite links")
    if not channel.get("inviteCode"):
        channel["inviteCode"] = secrets.token_urlsafe(18)
        channels_collection().update_one(
            {"_id": channel["_id"]},
            {"$set": {"inviteCode": channel["inviteCode"]}},
        )
    return {"inviteCode": channel["inviteCode"]}


@router.post("/invites/{invite_code}/join")
async def join_channel_by_invite(invite_code: str, current=Depends(get_current_user)):
    channel = channels_collection().find_one({"inviteCode": invite_code})
    if not channel:
        raise HTTPException(status_code=404, detail="Invite link is invalid or expired")
    user_id = current["userId"]
    if not get_member(channel, user_id):
        now = datetime.now(timezone.utc)
        channels_collection().update_one(
            {"_id": channel["_id"], "members.userId": {"$ne": user_id}},
            {"$push": {"members": {"userId": user_id, "role": "subscriber", "joinedAt": now}},
             "$set": {"updatedAt": now}},
        )
        channel["members"].append({"userId": user_id, "role": "subscriber", "joinedAt": now})
        await notify_members(channel, {"action": "member_joined", "channelId": str(channel["_id"])})
    return serialize_channel(channel, user_id)


@router.get("/{channel_id}")
def get_channel(channel_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    require_read_access(channel, current["userId"])
    return serialize_channel(channel, current["userId"])


@router.patch("/{channel_id}")
async def update_channel(
    channel_id: str,
    payload: UpdateChannelRequest,
    current=Depends(get_current_user),
):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        if len(updates["title"]) < 2:
            raise HTTPException(status_code=422, detail="Channel name must contain at least 2 characters")
    if "description" in updates:
        updates["description"] = updates["description"].strip()
    if updates.get("visibility") == "private" and not channel.get("inviteCode"):
        updates["inviteCode"] = secrets.token_urlsafe(18)
    if updates.get("visibility") == "public":
        updates["inviteCode"] = None
    updates["updatedAt"] = datetime.now(timezone.utc)
    channels_collection().update_one({"_id": channel["_id"]}, {"$set": updates})
    channel.update(updates)
    await notify_members(channel, {"action": "updated", "channelId": channel_id})
    return serialize_channel(channel, current["userId"])


@router.delete("/{channel_id}")
async def delete_channel(channel_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    channels_collection().delete_one({"_id": channel["_id"]})
    channel_posts_collection().delete_many({"channelId": channel_id})
    await notify_members(channel, {"action": "deleted", "channelId": channel_id})
    return {"status": "deleted"}


@router.post("/{channel_id}/subscription")
async def subscribe_channel(
    channel_id: str,
    current=Depends(get_current_user),
):
    channel = channel_by_id(channel_id)
    if channel["visibility"] != "public":
        raise HTTPException(status_code=403, detail="Private channels require an invite link")
    user_id = current["userId"]
    if not get_member(channel, user_id):
        now = datetime.now(timezone.utc)
        channels_collection().update_one(
            {"_id": channel["_id"], "members.userId": {"$ne": user_id}},
            {"$push": {"members": {"userId": user_id, "role": "subscriber", "joinedAt": now}},
             "$set": {"updatedAt": now}},
        )
        channel["members"].append({"userId": user_id, "role": "subscriber", "joinedAt": now})
        await notify_members(channel, {"action": "member_joined", "channelId": channel_id})
    return serialize_channel(channel, user_id)


@router.delete("/{channel_id}/subscription")
async def unsubscribe_channel(channel_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    user_id = current["userId"]
    if channel["ownerId"] == user_id:
        raise HTTPException(status_code=400, detail="The channel owner cannot unsubscribe")
    if get_member(channel, user_id):
        channels_collection().update_one(
            {"_id": channel["_id"]},
            {"$pull": {"members": {"userId": user_id}}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
        )
        await notify_members(
            {**channel, "members": [member for member in channel["members"] if member["userId"] != user_id]},
            {"action": "member_left", "channelId": channel_id},
        )
    return {"status": "unsubscribed"}


@router.get("/{channel_id}/posts")
def get_channel_posts(
    channel_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    current=Depends(get_current_user),
):
    channel = channel_by_id(channel_id)
    require_read_access(channel, current["userId"])
    users_collection().update_one(
        {"_id": ObjectId(current["userId"])},
        {"$set": {f"channelReads.{channel_id}": datetime.now(timezone.utc)}},
    )
    posts = channel_posts_collection().find({"channelId": channel_id}).sort(
        [("pinned", -1), ("createdAt", -1), ("_id", -1)]
    ).limit(limit)
    return [serialize_post(post) for post in posts]


@router.post("/{channel_id}/posts")
async def create_channel_post(
    channel_id: str,
    payload: ChannelPostRequest,
    current=Depends(get_current_user),
):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Post cannot be empty")
    now = datetime.now(timezone.utc)
    post = {
        "channelId": channel_id,
        "senderId": current["userId"],
        "text": text,
        "reactions": [],
        "pinned": False,
        "createdAt": now,
    }
    result = channel_posts_collection().insert_one(post)
    post["_id"] = result.inserted_id
    channels_collection().update_one({"_id": channel["_id"]}, {"$set": {"updatedAt": now}})
    await notify_members(
        channel,
        {"action": "post_created", "channelId": channel_id, "post": serialize_post(post)},
    )
    return serialize_post(post)


def find_channel_post(channel_id: str, post_id: str):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=400, detail="Invalid post id")
    post = channel_posts_collection().find_one(
        {"_id": ObjectId(post_id), "channelId": channel_id}
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.delete("/{channel_id}/posts/{post_id}")
async def delete_channel_post(channel_id: str, post_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    post = find_channel_post(channel_id, post_id)
    channel_posts_collection().delete_one({"_id": post["_id"]})
    await notify_members(channel, {"action": "post_deleted", "channelId": channel_id, "postId": post_id})
    return {"status": "deleted"}


@router.post("/{channel_id}/posts/{post_id}/pin")
async def set_channel_post_pin(channel_id: str, post_id: str, current=Depends(get_current_user)):
    channel = channel_by_id(channel_id)
    require_owner(channel, current["userId"])
    post = find_channel_post(channel_id, post_id)
    pinned = not post.get("pinned", False)
    pinned_at = datetime.now(timezone.utc) if pinned else None
    channel_posts_collection().update_one(
        {"_id": post["_id"]},
        {"$set": {"pinned": pinned, "pinnedAt": pinned_at}},
    )
    post.update({"pinned": pinned, "pinnedAt": pinned_at})
    serialized = serialize_post(post)
    await notify_members(
        channel,
        {"action": "post_updated", "channelId": channel_id, "post": serialized},
    )
    return serialized


@router.post("/{channel_id}/posts/{post_id}/reactions")
async def toggle_channel_post_reaction(
    channel_id: str,
    post_id: str,
    payload: ChannelReactionRequest,
    current=Depends(get_current_user),
):
    channel = channel_by_id(channel_id)
    require_read_access(channel, current["userId"])
    if not get_member(channel, current["userId"]):
        raise HTTPException(status_code=403, detail="Subscribe to react to channel posts")
    post = find_channel_post(channel_id, post_id)
    reactions = list(post.get("reactions", []))
    existing = next(
        (reaction for reaction in reactions if reaction["userId"] == current["userId"]),
        None,
    )
    if existing and existing["emoji"] == payload.emoji:
        reactions = [reaction for reaction in reactions if reaction["userId"] != current["userId"]]
    else:
        reactions = [reaction for reaction in reactions if reaction["userId"] != current["userId"]]
        reactions.append({"userId": current["userId"], "emoji": payload.emoji})
    channel_posts_collection().update_one(
        {"_id": post["_id"]},
        {"$set": {"reactions": reactions}},
    )
    post["reactions"] = reactions
    serialized = serialize_post(post)
    await notify_members(
        channel,
        {"action": "post_updated", "channelId": channel_id, "post": serialized},
    )
    return serialized
