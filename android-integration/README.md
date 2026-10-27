# Skyline Android integration prototype

This directory contains a **standalone native Android prototype** for Skyline. It is a separate Android client that talks to the existing Skyline API; it is not a modified Telegram APK, and Telegram's UI or MTProto protocol has not been transplanted.

## Included now

- Native Skyline sign-in screen and personal chat list/history.
- REST API bridge for login, contacts, message history, public-key lookup/registration, and sending encrypted text messages.
- Socket.IO client authenticated with the Skyline JWT and a `message_changed` listener to refresh the active conversation or chat list.
- Initial Skyline v4 E2EE implementation: P-256 ECDH, HKDF-SHA256, AES-GCM, and an Android Keystore AES key used to encrypt the locally stored PKCS#8 private key.
- A key-safety check at login: if the server already has a different public key for the account, the app does not overwrite it and disables encrypted sending. This avoids silently breaking access to existing encrypted conversations.
- GitHub Actions build with a downloadable debug APK artifact.

## Download a test APK

1. Open [Android prototype build runs](https://github.com/Pisosisosisosisosi/oursocial-network/actions/workflows/android-build.yml).
2. Open the latest successful run for branch `feat/android-skyline-api-bridge`.
3. Under **Artifacts**, download `skyline-android-debug-apk`.
4. Extract the ZIP and install the included APK on an Android device. Android may ask you to allow installation from the browser/file manager used to open it.

The debug artifact is temporary and expires after 14 days. It is for testing, not a signed production release.

## Build locally

Install Android Studio and Android SDK 35, then open `android-integration/` as a Gradle project. You can also run:

    gradle -p android-integration assembleDebug

The APK is generated at:

    android-integration/app/build/outputs/apk/debug/app-debug.apk

## API and crypto notes

- Default API origin: `https://oursocial-python.onrender.com`.
- Login: `POST /auth/login` with email/password; response contains `token` and `user`.
- Contacts: `GET /contacts`; personal history: `GET /messages/{user_id}?limit=50`.
- Key registration/lookup: `POST /keys/upload`, `GET /keys/me`, and `GET /keys/{user_id}`.
- Sending text: `POST /messages` with `receiverId`, `text` (encrypted envelope), and `type: "text"`.
- v4 envelopes are shaped to match the web implementation's `skyline-e2e:v4:` format. The implementation has been compiled but still needs cross-client test vectors and live testing with real accounts/devices before it can be treated as interoperable.
- A single server public key is associated with each account. Android currently generates a device-local key and does not yet import/restore the web client's private key. Therefore, an account that already has a different registered key will sign in but cannot send E2EE messages from Android until a safe key migration/recovery workflow exists.
- Old v2/v3 encrypted message formats are not decrypted by this prototype.

## Known limitations

- No registration/email verification or persisted login session yet.
- No safe cross-device private-key recovery/sync.
- No group/channel UI, attachments, voice messages, message editing/deletion/reactions, calls, or push notifications.
- No real-device or live-server integration test has been performed in this environment. CI confirms compilation and APK packaging only; it does not prove that authentication, live API responses, realtime events, or cross-client cryptography work end to end.
- Before a public release, add automated API/crypto interoperability tests, test on physical devices, configure application signing and release build variants, and review GPL-2.0 obligations if distributing any derivative of Telegram code. Do not imply that Skyline is an official Telegram app.
