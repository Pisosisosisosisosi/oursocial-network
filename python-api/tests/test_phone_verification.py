import unittest
from unittest.mock import patch

from fastapi import HTTPException

import phone_verification


class PhoneVerificationTests(unittest.TestCase):
    def test_normalizes_common_e164_separators(self):
        self.assertEqual(phone_verification.normalize_phone("+1 (202) 555-0123"), "+12025550123")

    def test_rejects_non_e164_phone(self):
        with self.assertRaises(HTTPException) as error:
            phone_verification.normalize_phone("202-555-0123")
        self.assertEqual(error.exception.status_code, 422)

    def test_missing_sms_provider_configuration_fails_closed(self):
        with patch.dict("os.environ", {
            "TWILIO_ACCOUNT_SID": "",
            "TWILIO_AUTH_TOKEN": "",
            "TWILIO_VERIFY_SERVICE_SID": "",
        }, clear=False):
            with self.assertRaises(HTTPException) as error:
                phone_verification._twilio_request("send", {"To": "+12025550123", "Channel": "sms"})
        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("не настроено", error.exception.detail.lower())


if __name__ == "__main__":
    unittest.main()
