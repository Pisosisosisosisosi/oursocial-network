# Skyline Android integration bridge

This directory is the first integration layer for adapting the Telegram Android client to Skyline's existing API. It is **not yet a complete Android application or a modified Telegram APK**.

## Current Skyline connection details

- API origin used by the web client: `https://oursocial-python.onrender.com`
- Login: `POST /auth/login` with `{ "email": "...", "password": "..." }`; response contains `token` and `user`.
- Current-user profile: `GET /auth/me` with `Authorization: Bearer <token>`.
- User search: `GET /users/search?q=<query>`.
- Realtime: Socket.IO at the same origin, authenticated with `auth: { token }` (not Telegram's MTProto protocol).
- Backend stack: FastAPI/Python API, MongoDB and Socket.IO. The separate Node service is not the web client's primary API origin.

## Java bridge

`SkylineApiClient.java` uses Android's built-in `HttpURLConnection` and `org.json` to avoid introducing a new HTTP dependency prematurely. All network methods are blocking: call them from an executor/background thread, never the Android UI thread. Store the token in Android's secure storage in production; do not persist it in plain preferences.

The generic `request` method is intentionally a transport foundation, not a promise that every Telegram feature maps to a Skyline endpoint. Each screen/action must be mapped to the matching Skyline endpoint and response model.

## Integration sequence

1. Fork `DrKLO/Telegram` into a separately maintained Skyline Android repository. Keep the GPL-2.0 license and required notices; use Skyline branding and icons, not Telegram's name/logo.
2. Replace Telegram account onboarding and session handling with Skyline login/registration and JWT session storage.
3. Replace Telegram's MTProto data sources for dialogs, messages, contacts, groups and channels with Skyline REST calls and Socket.IO events. Do not point the Telegram MTProto client at Skyline; it speaks a different protocol.
4. Map media upload/download, voice recording, message edits/deletes, replies, reactions, read receipts, group/channel permissions and calls one by one. Features without matching Skyline API support must be implemented server-side before being exposed in Android.
5. Port the existing client-side encryption carefully. Skyline currently uses browser Web Crypto formats; Android must implement compatible formats and key handling, with interoperability tests before enabling encrypted messaging.
6. Configure the app ID, Firebase configuration, signing keys and API origin for Skyline. Never ship upstream dummy signing or Firebase credentials.
7. Build and test on an Android emulator and physical device, including account login, message delivery, reconnects, attachments and encrypted-message interoperability.

## Known gaps before this can be called complete

- The Telegram Android source has not yet been forked or patched by this bridge.
- Socket.IO Java client dependency and event mapping are not added here.
- No complete Android screen flow, registration/email verification, chat list, messaging, group/channel UI, calls, push notifications or end-to-end encryption integration is implemented yet.
- The web repo's CI does not compile this Java file as an Android module. A real Android Gradle project and device/emulator build are required before claiming an APK is buildable.
