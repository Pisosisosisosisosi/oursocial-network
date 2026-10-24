import asyncio
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request

import main
import group_management


class SecurityEndpointTests(unittest.TestCase):
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
