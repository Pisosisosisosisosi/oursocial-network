import unittest
from datetime import date, timedelta
from unittest.mock import Mock, patch

from bson import ObjectId
from pydantic import ValidationError

import main


USER_ID = "507f1f77bcf86cd799439011"


class ProfileTests(unittest.TestCase):
    def test_profile_accepts_optional_birth_date(self) -> None:
        profile = main.UpdateProfileRequest(
            displayName="Test User",
            username="test_user",
            dateOfBirth="1995-04-23",
        )

        self.assertEqual(profile.dateOfBirth, date(1995, 4, 23))

    def test_profile_rejects_birth_date_in_the_future(self) -> None:
        with self.assertRaises(ValidationError):
            main.UpdateProfileRequest(
                displayName="Test User",
                username="test_user",
                dateOfBirth=(date.today() + timedelta(days=1)).isoformat(),
            )

    def test_profile_update_stores_birth_date_as_iso_date(self) -> None:
        users = Mock()
        users.find_one.return_value = None
        users.update_one.return_value.matched_count = 1
        payload = main.UpdateProfileRequest(
            displayName="Test User",
            username="test_user",
            dateOfBirth="1995-04-23",
        )

        with patch("main.users_collection", return_value=users):
            response = main.update_profile(payload, {"userId": USER_ID})

        self.assertEqual(response["status"], "ok")
        update = users.update_one.call_args.args[1]["$set"]
        self.assertEqual(update["dateOfBirth"], "1995-04-23")
        self.assertEqual(users.update_one.call_args.args[0]["_id"], ObjectId(USER_ID))


if __name__ == "__main__":
    unittest.main()
