# Skyline Android integration prototype

This folder now contains a **minimal standalone Android app prototype** and the first Skyline API bridge. It is not yet the full Telegram Android client: Telegram's screens and MTProto data layer have not been ported/replaced.

## Included in this PR

- Gradle Android application module (app).
- Launcher activity with a basic Skyline sign-in screen.
- HTTP bridge for POST /auth/login, GET /auth/me, and GET /users/search?q=...
- Bearer JWT authorization and HTTP error details.
- Android Internet permission and a GitHub Actions build workflow.
- Socket.IO Java adapter with JWT auth, reconnection, chat join/leave, typing, and generic event listeners/emits.

## Build locally

Install Android Studio and Android SDK 35, then open the android-integration/ directory as a Gradle project. Run the assembleDebug task or use:

    gradle -p android-integration assembleDebug

The first build requires network access to resolve Gradle and Android Gradle Plugin dependencies. The APK, if the build succeeds, is generated under android-integration/app/build/outputs/apk/debug/.

## Current Skyline API assumptions

- API origin: https://oursocial-python.onrender.com (the same default origin configured in the web frontend).
- Login: POST /auth/login with an email and password; response contains token and user.
- Current-user profile: GET /auth/me with Authorization: Bearer token.
- User search: GET /users/search?q=query.
- Realtime: Socket.IO at the configured API origin, authenticated with auth: { token }. A Java adapter is included; it still needs to be wired into chat screens and verified against a running server.

## Next integration stages

1. Replace the prototype login flow with Skyline registration, email verification, session restore and secure token storage.
2. Add Socket.IO Java integration and map Skyline's actual event names and payloads.
3. Replace Telegram's MTProto dialog/message/contact/group/channel data sources with Skyline REST and Socket.IO. Telegram's MTProto protocol is not compatible with Skyline's API.
4. Implement chat list and messaging UI, then media uploads, voice messages, replies, edits/deletes, reactions, read receipts, groups/channels, notifications and calls according to server support.
5. Verify compatible cryptographic formats before enabling end-to-end encryption; do not claim E2EE parity until interoperability tests pass.
6. Create Skyline-specific Firebase configuration, application signing and release settings before publishing.

## Security and limitations

- The prototype keeps the token in memory only; it does not persist it. Production session storage must use Android Keystore-backed encrypted storage.
- API calls are blocking and are run on a background executor, not the UI thread.
- This is not yet a modified Telegram APK, and it has not been device-tested in this environment.
- The upstream Telegram Android repository is GPL-2.0. If we distribute a derivative build, preserve required notices and comply with source publication obligations. Do not use Telegram branding in a way that implies this is an official Telegram app.
