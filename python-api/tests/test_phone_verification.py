import unittest
from unittest.mock import patch

from fastapi import HTTPException

import phone_verification


class PhoneVerificationTests(unittest.TestCase):
    def setUp(self):
        with phone_verification._rate_lock:
            phone_verification._rate_attempts.clear()

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

    def test_send_rate_limit_is_enforced_per_phone(self):
        for attempt in range(phone_verification.SEND_LIMIT_PER_PHONE):
            phone_verification._enforce_rate_limit("send", "+12025550123", f"192.0.2.{attempt + 1}", now=100.0 + attempt)
        with self.assertRaises(HTTPException) as error:
            phone_verification._enforce_rate_limit(
                "send", "+12025550123", "192.0.2.99", now=104.0
            )
        self.assertEqual(error.exception.status_code, 429)
        self.assertIn("Retry-After", error.exception.headers)

    def test_verify_rate_limit_is_enforced_per_ip(self):
        for attempt in range(phone_verification.VERIFY_LIMIT_PER_IP):
            phone = f"+1202555{attempt:04d}"
            phone_verification._enforce_rate_limit("verify", phone, "192.0.2.10", now=200.0 + attempt)
        with self.assertRaises(HTTPException) as error:
            phone_verification._enforce_rate_limit(
                "verify", "+12025550123", "192.0.2.10", now=250.0
            )
        self.assertEqual(error.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
