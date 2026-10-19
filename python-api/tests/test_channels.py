import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch

from bson import ObjectId
from fastapi import HTTPException

import channels


OWNER_ID = "507f1f77bcf86cd799439011"
SUBSCRIBER_ID = "507f1f77bcf86cd799439012"
CHANNEL_ID = ObjectId("507f1f77bcf86cd799439013")
POST_ID = ObjectId("507f1f77bcf86cd799439014")


def make_channel(visibility: str = "public") -> dict:
    now = datetime.now(timezone.utc)
    return {
        "_id": CHANNEL_ID,
        "title": "Skyline новости",
        "description": "Новости проекта",
        "visibility": visibility,
        "ownerId": OWNER_ID,
        "members": [
            {"userId": OWNER_ID, "role": "owner", "joinedAt": now},
            {"userId": SUBSCRIBER_ID, "role": "subscriber", "joinedAt": now},
        ],
        "createdAt": now,
        "updatedAt": now,
    }


class ChannelTests(unittest.IsolatedAsyncioTestCase):
    def test_private_channel_is_hidden_from_non_members(self) -> None:
        with self.assertRaises(HTTPException) as error:
            channels.require_read_access(make_channel("private"), "507f1f77bcf86cd799439015")
        self.assertEqual(error.exception.status_code, 404)

    def test_only_owner_can_manage_channel(self) -> None:
        with self.assertRaises(HTTPException) as error:
            channels.require_owner(make_channel(), SUBSCRIBER_ID)
        self.assertEqual(error.exception.status_code, 403)

    async def test_create_private_channel_returns_invite(self) -> None:
        collection = Mock()
        collection.insert_one.return_value.inserted_id = CHANNEL_ID
        users = Mock()
        users.find_one.return_value = {"username": "owner", "displayName": "Owner"}

        with (
            patch("channels.channels_collection", return_value=collection),
            patch("channels.users_collection", return_value=users),
            patch("channels.notify_members", new_callable=AsyncMock),
        ):
            response = await channels.create_channel(
                channels.CreateChannelRequest(
                    title="  Private room  ",
                    description=" Updates ",
                    visibility="private",
                ),
                {"userId": OWNER_ID},
            )

        self.assertEqual(response["title"], "Private room")
        self.assertEqual(response["description"], "Updates")
        self.assertEqual(response["visibility"], "private")
        self.assertTrue(response["isOwner"])
        self.assertTrue(response["inviteCode"])

    async def test_subscribers_cannot_publish_posts(self) -> None:
        with patch("channels.channel_by_id", return_value=make_channel()):
            with self.assertRaises(HTTPException) as error:
                await channels.create_channel_post(
                    str(CHANNEL_ID),
                    channels.ChannelPostRequest(text="Subscriber post"),
                    {"userId": SUBSCRIBER_ID},
                )
        self.assertEqual(error.exception.status_code, 403)

    async def test_owner_post_is_saved_and_broadcast(self) -> None:
        channel = make_channel()
        posts = Mock()
        posts.insert_one.return_value.inserted_id = POST_ID
        channels_collection = Mock()

        with (
            patch("channels.channel_by_id", return_value=channel),
            patch("channels.channel_posts_collection", return_value=posts),
            patch("channels.channels_collection", return_value=channels_collection),
            patch("channels.notify_members", new_callable=AsyncMock) as notify,
        ):
            response = await channels.create_channel_post(
                str(CHANNEL_ID),
                channels.ChannelPostRequest(text="  New post  "),
                {"userId": OWNER_ID},
            )

        self.assertEqual(response["id"], str(POST_ID))
        self.assertEqual(response["text"], "New post")
        self.assertEqual(response["reactions"], [])
        notify.assert_awaited_once()
        self.assertEqual(notify.await_args.args[1]["action"], "post_created")

    async def test_subscriber_can_toggle_a_reaction(self) -> None:
        post = {
            "_id": POST_ID,
            "channelId": str(CHANNEL_ID),
            "senderId": OWNER_ID,
            "text": "Announcement",
            "reactions": [],
            "pinned": False,
            "createdAt": datetime.now(timezone.utc),
        }
        posts = Mock()
        posts.find_one.return_value = post

        with (
            patch("channels.channel_by_id", return_value=make_channel()),
            patch("channels.channel_posts_collection", return_value=posts),
            patch("channels.notify_members", new_callable=AsyncMock),
        ):
            added = await channels.toggle_channel_post_reaction(
                str(CHANNEL_ID),
                str(POST_ID),
                channels.ChannelReactionRequest(emoji="❤️"),
                {"userId": SUBSCRIBER_ID},
            )
            removed = await channels.toggle_channel_post_reaction(
                str(CHANNEL_ID),
                str(POST_ID),
                channels.ChannelReactionRequest(emoji="❤️"),
                {"userId": SUBSCRIBER_ID},
            )

        self.assertEqual(added["reactions"], [{"userId": SUBSCRIBER_ID, "emoji": "❤️"}])
        self.assertEqual(removed["reactions"], [])

    def test_avatar_rejects_active_content_data_urls(self) -> None:
        with self.assertRaises(ValueError):
            channels.UpdateChannelRequest(avatarUrl="data:image/svg+xml,<svg></svg>")


if __name__ == "__main__":
    unittest.main()
