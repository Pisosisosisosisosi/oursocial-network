import unittest
from unittest.mock import Mock, patch

import main


class UnreadSummaryTests(unittest.TestCase):
    def test_unread_counts_exclude_deleted_and_expired_messages(self):
        user_id = "507f1f77bcf86cd799439011"
        group_id = main.ObjectId("507f1f77bcf86cd799439013")
        messages = Mock()
        groups = Mock()
        groups.find.return_value = [{"_id": group_id}]
        channels = Mock()
        channels.find.return_value = []
        users = Mock()
        users.find_one.return_value = {}

        with (
            patch("main.messages_collection", return_value=messages),
            patch("main.groups_collection", return_value=groups),
            patch("main.channels_collection", return_value=channels),
            patch("main.channel_posts_collection"),
            patch("main.users_collection", return_value=users),
        ):
            result = main.unread_summary({"userId": user_id})

        self.assertEqual(result, {"chats": 0, "groups": 0, "channels": 0})
        self.assertEqual(messages.count_documents.call_count, 2)
        personal_filter, group_filter = [
            call.args[0] for call in messages.count_documents.call_args_list
        ]
        for query in (personal_filter, group_filter):
            self.assertEqual(query["deletedForAll"], {"$ne": True})
            expiry_clauses = query["$or"]
            self.assertEqual(expiry_clauses[0], {"expiresAt": {"$exists": False}})
            self.assertIn("$gt", expiry_clauses[1]["expiresAt"])
        self.assertEqual(group_filter["groupId"], {"$in": [str(group_id)]})


if __name__ == "__main__":
    unittest.main()
