import asyncio
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request

import main
import group_management
import realtime
import auth


class SecurityEndpointTests(unittest.TestCase):
    def test_scheduled_message_requires_exactly_one_destination(self):
        payload = main.ScheduledMessageRequest(
            receiverId="507f1f77bcf86cd799439012",
            groupId="507f1f77bcf86cd799439013",
            text="skyline-e2e:v3:test",
            sendAt="2099-01-01T12:00:00+00:00",
        )
        with patch("main.scheduled_messages_collection") as scheduled:
            with self.assertRaises(HTTPException) as raised:
                main.create_scheduled_message(payload, {"userId": "507f1f77bcf86cd799439011"})
        self.assertEqual(raised.exception.status_code, 400)
        scheduled.return_value.insert_one.assert_not_called()

    def test_scheduled_message_respects_user_blocks(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        payload = main.ScheduledMessageRequest(
            receiverId=target_id,
            text="skyline-e2e:v3:test",
            sendAt="2099-01-01T12:00:00+00:00",
        )
        with (
            patch("main.users_collection") as users,
            patch("main.users_blocked_either_way", return_value=True),
            patch("main.scheduled_messages_collection") as scheduled,
        ):
            users.return_value.find_one.return_value = {"_id": main.ObjectId(target_id)}
            with self.assertRaises(HTTPException) as raised:
                main.create_scheduled_message(payload, {"userId": user_id})
        self.assertEqual(raised.exception.status_code, 403)
        scheduled.return_value.insert_one.assert_not_called()

    def test_scheduled_message_rejects_timezone_naive_datetime(self):
        payload = main.ScheduledMessageRequest(
            receiverId="507f1f77bcf86cd799439012",
            text="skyline-e2e:v3:test",
            sendAt="2099-01-01T12:00:00",
        )
        with (
            patch("main.users_collection") as users,
            patch("main.users_blocked_either_way", return_value=False),
        ):
            users.return_value.find_one.return_value = {"_id": main.ObjectId("507f1f77bcf86cd799439012")}
            with self.assertRaises(HTTPException) as raised:
                main.create_scheduled_message(payload, {"userId": "507f1f77bcf86cd799439011"})
        self.assertEqual(raised.exception.status_code, 422)

    def test_gift_rejects_invalid_recipient_id(self):
        payload = main.GiftSendRequest(
            giftId="507f1f77bcf86cd799439013",
            targetUserId="not-an-object-id",
        )
        with patch("main.gifts_collection") as gifts:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.send_gift(payload, {"userId": "507f1f77bcf86cd799439011"}))
        self.assertEqual(raised.exception.status_code, 400)
        gifts.return_value.find_one.assert_not_called()

    def test_gift_respects_block_relationships(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        payload = main.GiftSendRequest(
            giftId="507f1f77bcf86cd799439013",
            targetUserId=target_id,
        )
        with (
            patch("main.users_collection") as users,
            patch("main.users_blocked_either_way", return_value=True),
            patch("main.gifts_collection") as gifts,
        ):
            users.return_value.find_one.return_value = {"_id": main.ObjectId(target_id)}
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.send_gift(payload, {"userId": user_id}))
        self.assertEqual(raised.exception.status_code, 403)
        gifts.return_value.find_one.assert_not_called()

    def test_event_rejects_invalid_participant_ids(self):
        payload = main.EventCreateRequest(
            title="Meeting",
            eventDate="2099-01-01T12:00:00Z",
            participants=["not-an-object-id"],
        )
        with patch("main.events_collection") as events:
            with self.assertRaises(HTTPException) as raised:
                main.create_event(payload, {"userId": "507f1f77bcf86cd799439011"})
        self.assertEqual(raised.exception.status_code, 400)
        events.return_value.insert_one.assert_not_called()

    def test_event_normalizes_datetime_and_deduplicates_participants(self):
        user_id = "507f1f77bcf86cd799439011"
        participant_id = "507f1f77bcf86cd799439012"
        payload = main.EventCreateRequest(
            title="Meeting",
            eventDate="2099-01-01T12:00:00",
            participants=[participant_id, participant_id, user_id],
        )
        with (
            patch("main.users_collection") as users,
            patch("main.events_collection") as events,
        ):
            users.return_value.count_documents.return_value = 1
            users.return_value.find_one.return_value = {"contacts": [{"userId": participant_id}]}
            events.return_value.insert_one.return_value.inserted_id = main.ObjectId("507f1f77bcf86cd799439013")
            result = main.create_event(payload, {"userId": user_id})
        self.assertEqual(result["status"], "ok")
        saved = events.return_value.insert_one.call_args.args[0]
        self.assertEqual(saved["participants"], [user_id, participant_id])
        self.assertEqual(saved["eventDate"].utcoffset(), main.timedelta(0))

    def test_event_rejects_non_contact_participant(self):
        user_id = "507f1f77bcf86cd799439011"
        participant_id = "507f1f77bcf86cd799439012"
        payload = main.EventCreateRequest(
            title="Meeting",
            eventDate="2099-01-01T12:00:00Z",
            participants=[participant_id],
        )
        with (
            patch("main.users_collection") as users,
            patch("main.events_collection") as events,
        ):
            users.return_value.count_documents.return_value = 1
            users.return_value.find_one.return_value = {"contacts": []}
            with self.assertRaises(HTTPException) as raised:
                main.create_event(payload, {"userId": user_id})
        self.assertEqual(raised.exception.status_code, 403)
        events.return_value.insert_one.assert_not_called()

    def test_friend_request_cannot_be_accepted_when_either_user_blocked(self):
        request_id = "507f1f77bcf86cd799439013"
        user_id = "507f1f77bcf86cd799439011"
        sender_id = "507f1f77bcf86cd799439012"
        request = {"_id": main.ObjectId(request_id), "fromUserId": sender_id, "toUserId": user_id, "status": "pending"}
        payload = main.FriendRequestActionRequest(accept=True)
        with (
            patch("main.friend_requests_collection") as requests,
            patch("main.users_blocked_either_way", return_value=True),
            patch("main.users_collection") as users,
        ):
            requests.return_value.find_one.return_value = request
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.respond_to_friend_request(request_id, payload, {"userId": user_id}))
        self.assertEqual(raised.exception.status_code, 403)
        requests.return_value.update_one.assert_not_called()
        users.return_value.update_one.assert_not_called()

    def test_friend_request_already_processed_cannot_be_replayed(self):
        request_id = "507f1f77bcf86cd799439013"
        user_id = "507f1f77bcf86cd799439011"
        sender_id = "507f1f77bcf86cd799439012"
        request = {"_id": main.ObjectId(request_id), "fromUserId": sender_id, "toUserId": user_id, "status": "accepted"}
        payload = main.FriendRequestActionRequest(accept=True)
        with (
            patch("main.friend_requests_collection") as requests,
            patch("main.users_blocked_either_way", return_value=False),
            patch("main.users_collection") as users,
        ):
            requests.return_value.find_one.return_value = request
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.respond_to_friend_request(request_id, payload, {"userId": user_id}))
        self.assertEqual(raised.exception.status_code, 409)
        requests.return_value.update_one.assert_not_called()
        users.return_value.update_one.assert_not_called()

    def test_story_view_rejects_expired_or_missing_story(self):
        with patch("main.stories_collection") as stories:
            stories.return_value.update_one.return_value.matched_count = 0
            with self.assertRaises(HTTPException) as raised:
                main.view_story("507f1f77bcf86cd799439011", {"userId": "507f1f77bcf86cd799439012"})
        self.assertEqual(raised.exception.status_code, 404)

    def test_report_rejects_missing_target(self):
        payload = main.ReportRequest(
            targetType="user",
            targetId="507f1f77bcf86cd799439013",
            reason="Test report",
        )
        with (
            patch("main.users_collection") as users,
            patch("main.reports_collection") as reports,
        ):
            users.return_value.find_one.return_value = None
            with self.assertRaises(HTTPException) as raised:
                main.create_report(payload, {"userId": "507f1f77bcf86cd799439011"})
        self.assertEqual(raised.exception.status_code, 404)
        reports.return_value.insert_one.assert_not_called()

    def test_api_auth_rejects_token_with_malformed_user_id(self):
        with (
            patch("auth.decode_token", return_value={"userId": "not-an-object-id"}),
            patch("auth.users_collection") as users,
        ):
            with self.assertRaises(HTTPException) as raised:
                auth.get_current_user("Bearer valid-looking-token")

        self.assertEqual(raised.exception.status_code, 401)
        users.return_value.find_one.assert_not_called()

    def test_api_auth_rejects_deleted_user(self):
        with (
            patch("auth.decode_token", return_value={"userId": "507f1f77bcf86cd799439011"}),
            patch("auth.users_collection") as users,
        ):
            users.return_value.find_one.return_value = None
            with self.assertRaises(HTTPException) as raised:
                auth.get_current_user("Bearer valid-looking-token")

        self.assertEqual(raised.exception.status_code, 401)

    def test_socket_rejects_token_with_malformed_user_id(self):
        with (
            patch("realtime.decode_token", return_value={"userId": "not-an-object-id"}),
            patch("realtime.users_collection") as users,
        ):
            accepted = asyncio.run(
                realtime.connect("test-invalid-sid", {}, {"token": "valid-looking-token"})
            )

        self.assertFalse(accepted)
        users.return_value.find_one.assert_not_called()
        self.assertNotIn("test-invalid-sid", realtime.sid_users)

    def test_socket_rejects_token_for_deleted_user(self):
        with (
            patch("realtime.decode_token", return_value={"userId": "507f1f77bcf86cd799439011"}),
            patch("realtime.users_collection") as users,
        ):
            users.return_value.find_one.return_value = None
            accepted = asyncio.run(
                realtime.connect("test-deleted-sid", {}, {"token": "valid-looking-token"})
            )

        self.assertFalse(accepted)
        self.assertNotIn("test-deleted-sid", realtime.sid_users)

    def test_removed_group_member_cannot_access_own_old_group_message(self):
        user_id = "507f1f77bcf86cd799439011"
        group_id = "507f1f77bcf86cd799439012"
        message = {
            "_id": main.ObjectId("507f1f77bcf86cd799439013"),
            "senderId": user_id,
            "receiverId": "",
            "groupId": group_id,
            "createdAt": main.datetime.now(main.timezone.utc),
        }
        with (
            patch("main.messages_collection") as messages,
            patch("main.groups_collection") as groups,
        ):
            messages.return_value.find_one.return_value = message
            groups.return_value.find_one.return_value = None
            with self.assertRaises(HTTPException) as raised:
                main.find_message_for_user(str(message["_id"]), user_id)

        self.assertEqual(raised.exception.status_code, 404)

    def test_removed_group_member_cannot_delete_group_message_for_all(self):
        user_id = "507f1f77bcf86cd799439011"
        group_id = "507f1f77bcf86cd799439012"
        message = {
            "_id": main.ObjectId("507f1f77bcf86cd799439013"),
            "senderId": user_id,
            "receiverId": "",
            "groupId": group_id,
            "createdAt": main.datetime.now(main.timezone.utc),
        }
        with (
            patch("main.messages_collection") as messages,
            patch("main.groups_collection") as groups,
        ):
            messages.return_value.find_one.return_value = message
            groups.return_value.find_one.return_value = None
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.delete_message_for_all(str(message["_id"]), {"userId": user_id}))

        self.assertEqual(raised.exception.status_code, 404)
        messages.return_value.update_one.assert_not_called()

    def test_current_group_member_can_access_group_message(self):
        user_id = "507f1f77bcf86cd799439011"
        group_id = "507f1f77bcf86cd799439012"
        message = {
            "_id": main.ObjectId("507f1f77bcf86cd799439013"),
            "senderId": user_id,
            "receiverId": "",
            "groupId": group_id,
            "createdAt": main.datetime.now(main.timezone.utc),
        }
        joined_at = message["createdAt"] - main.timedelta(seconds=1)
        with (
            patch("main.messages_collection") as messages,
            patch("main.groups_collection") as groups,
        ):
            messages.return_value.find_one.return_value = message
            groups.return_value.find_one.return_value = {
                "members": [{"userId": user_id, "joinedAt": joined_at}]
            }
            found = main.find_message_for_user(str(message["_id"]), user_id)

        self.assertEqual(found, message)

    def test_unimplemented_security_controls_fail_instead_of_claiming_success(self):
        current = {"userId": "507f1f77bcf86cd799439011"}
        cases = [
            (main.toggle_two_factor, (main.TwoFactorRequest(enable=True, code="123456"), current)),
            (main.list_user_sessions, (current,)),
            (main.set_app_pin_code, (main.PinCodeRequest(pin="1234", enable=True), current)),
            (main.request_auto_delete_account, (main.AutoDeleteAccountRequest(months=12), current)),
        ]
        for handler, args in cases:
            with self.subTest(handler=handler.__name__), self.assertRaises(HTTPException) as raised:
                handler(*args)
            self.assertEqual(raised.exception.status_code, 501)

    def test_blocked_user_cannot_send_direct_message(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        with patch("main.users_blocked_either_way", return_value=True):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.send_message(
                        main.MessageRequest(receiverId=target_id, text="skyline-e2e:v3:test"),
                        {"userId": user_id},
                    )
                )
        self.assertEqual(raised.exception.status_code, 403)

    def test_blocked_user_cannot_send_friend_request(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        with patch("main.users_blocked_either_way", return_value=True):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.send_friend_request(
                        main.FriendRequestRequest(targetUserId=target_id),
                        {"userId": user_id},
                    )
                )
        self.assertEqual(raised.exception.status_code, 403)

    def test_blocked_user_cannot_forward_to_direct_chat(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        original = {
            "_id": main.ObjectId("507f1f77bcf86cd799439013"),
            "senderId": user_id,
            "receiverId": "507f1f77bcf86cd799439014",
            "createdAt": main.datetime.now(main.timezone.utc),
        }
        with (
            patch("main.find_message_for_user", return_value=original),
            patch("main.users_blocked_either_way", return_value=True),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.forward_message(
                        str(original["_id"]),
                        main.MessageForwardRequest(targetUserId=target_id, text="skyline-e2e:v3:test"),
                        {"userId": user_id},
                    )
                )
        self.assertEqual(raised.exception.status_code, 403)

    def test_blocked_user_cannot_reply_in_direct_chat(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        original = {
            "_id": main.ObjectId("507f1f77bcf86cd799439013"),
            "senderId": target_id,
            "receiverId": user_id,
            "createdAt": main.datetime.now(main.timezone.utc),
        }
        with (
            patch("main.find_message_for_user", return_value=original),
            patch("main.users_blocked_either_way", return_value=True),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.reply_to_message(
                        str(original["_id"]),
                        main.MessageReplyRequest(text="skyline-e2e:v3:test"),
                        {"userId": user_id},
                    )
                )
        self.assertEqual(raised.exception.status_code, 403)

    def test_non_admin_cannot_add_group_members(self):
        user_id = "507f1f77bcf86cd799439011"
        owner_id = "507f1f77bcf86cd799439012"
        group_id = "507f1f77bcf86cd799439013"
        target_id = "507f1f77bcf86cd799439014"
        group = {
            "_id": main.ObjectId(group_id),
            "createdBy": owner_id,
            "members": [{"userId": user_id, "role": "member"}],
        }

        with (
            patch("main.get_group_for_member", return_value=group),
            patch("main.groups_collection") as groups,
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    main.add_group_members(
                        group_id,
                        main.AddGroupMembersRequest(memberIds=[target_id]),
                        {"userId": user_id},
                    )
                )

        self.assertEqual(raised.exception.status_code, 403)
        groups.assert_not_called()

    def test_group_settings_reject_if_admin_permission_changes_during_update(self):
        user_id = "507f1f77bcf86cd799439011"
        group_id = "507f1f77bcf86cd799439013"
        group = {
            "_id": main.ObjectId(group_id),
            "createdBy": "507f1f77bcf86cd799439012",
            "members": [
                {"userId": user_id, "role": "admin"},
                {"userId": "507f1f77bcf86cd799439014", "role": "owner"},
            ],
        }
        with (
            patch("group_management._group_for_member", return_value=group),
            patch("group_management.groups_collection") as groups,
        ):
            groups.return_value.update_one.return_value.matched_count = 0
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    group_management.update_group_settings(
                        group_id,
                        group_management.GroupSettingsRequest(title="Updated group"),
                        {"userId": user_id},
                    )
                )

        self.assertEqual(raised.exception.status_code, 409)

    def test_ownership_transfer_reports_stale_owner_instead_of_success(self):
        user_id = "507f1f77bcf86cd799439011"
        target_id = "507f1f77bcf86cd799439012"
        group_id = "507f1f77bcf86cd799439013"
        legacy_group = {
            "_id": main.ObjectId(group_id),
            "members": [
                {"userId": user_id, "role": "owner"},
                {"userId": target_id, "role": "member"},
            ],
        }

        with (
            patch("group_management._group_for_member", return_value=legacy_group),
            patch("group_management.groups_collection") as groups,
        ):
            groups.return_value.update_one.return_value.matched_count = 0
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(
                    group_management.transfer_group_ownership(
                        group_id,
                        group_management.TransferOwnershipRequest(userId=target_id),
                        {"userId": user_id},
                    )
                )

        self.assertEqual(raised.exception.status_code, 409)

    def test_group_avatar_validation_accepts_supported_data_uri(self):
        settings = group_management.GroupSettingsRequest(
            avatarUrl="data:image/png;base64,AAAA"
        )
        self.assertEqual(settings.avatarUrl, "data:image/png;base64,AAAA")

    def test_group_avatar_validation_rejects_unsupported_data_uri(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            group_management.GroupSettingsRequest(avatarUrl="javascript:alert(1)")

    def test_login_records_bounded_device_metadata_in_history(self):
        user = {
            "_id": main.ObjectId("507f1f77bcf86cd799439011"),
            "email": "person@example.com",
            "username": "person",
            "passwordHash": "hashed",
        }
        users = Mock()
        users.find_one.return_value = user
        history = Mock()
        request = Request({
            "type": "http",
            "method": "POST",
            "path": "/auth/login",
            "headers": [(b"user-agent", b"test-client")],
            "client": ("192.0.2.10", 1234),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        })
        with (
            patch("main.users_collection", return_value=users),
            patch("main.login_history_collection", return_value=history),
            patch("main.verify_password", return_value=True),
            patch("main.create_token", return_value="token"),
            patch("main.serialize_premium", return_value={}),
        ):
            result = main.login(main.LoginRequest(email="person@example.com", password="secret"), request)

        self.assertEqual(result["token"], "token")
        record = history.insert_one.call_args.args[0]
        self.assertEqual(record["userId"], str(user["_id"]))
        self.assertEqual(record["ipAddress"], "192.0.2.10")
        self.assertEqual(record["userAgent"], "test-client")
        self.assertIn("loginAt", record)


if __name__ == "__main__":
    unittest.main()
