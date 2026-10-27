# Telegram-inspired Skyline implementation plan

## Product direction

Skyline will adopt a familiar Telegram-like interaction model across the web client and native Android client while remaining a distinct product with its own name, backend, user accounts, API and release process. This plan is not a claim of official Telegram affiliation.

Telegram client source is published under open-source licenses (the Android client is GPL-2.0); any direct reuse must retain applicable copyright/license notices, comply with the license, and be reviewed before distribution. Do not copy Telegram branding/assets or imply that Skyline is an official Telegram client. Reuse of a client UI/codebase does not provide Telegram's backend, phone-verification infrastructure, MTProto service, or access to Telegram accounts.

## Account registration requirements

A new Skyline account must have:
- A verified phone number in normalized E.164 form.
- A verified email address, normalized to lowercase.
- A unique username.
- A password or a separately designed passwordless authentication flow.
- Explicit consent to the privacy policy and terms.

Registration must be rejected if the normalized phone number, normalized email, or username already belongs to an account. The database must enforce uniqueness as well as the API checking before insert, so concurrent requests cannot create duplicates. Phone and email verification tokens must be single-use, expire, be stored hashed where appropriate, and be rate-limited. Never return verification codes in API responses or logs.

### Phone verification provider

Phone verification requires an SMS provider and configured secrets. The API should use a provider adapter and environment variables; secrets must not be committed to the repository. Until an SMS provider is configured and live delivery is tested, phone registration must be labelled incomplete rather than pretending that a code was sent. Email verification already exists and should be preserved.

Before enabling unique indexes on existing user data, audit and normalize current accounts, detect duplicates, and prepare a migration plan. Existing accounts with no phone number must not be silently assigned a fabricated number. Decide whether they must add and verify a number at next login or may remain legacy accounts during a migration window.

## Shared web/Android architecture

- Keep the existing Skyline API and database as the source of truth for Skyline accounts, chats, groups and channels.
- Define API contracts and error responses once; use them in both clients.
- Web and Android remain independent clients of the same service; do not turn the website into an APK or fork the Android UI into a web page.
- Do not claim feature parity until each feature is tested on both clients with two real accounts.
- Preserve current auth/session compatibility during migration and avoid breaking existing accounts.
- Keep encryption changes separate from UI changes. E2EE requires cross-client test vectors, key recovery/device management, and explicit security review before it is advertised as interoperable.

## Implementation phases

1. **Identity foundation:** inspect existing auth flows, add phone normalization and duplicate detection, implement SMS-provider adapter and phone OTP, keep email OTP, add unique indexes only after duplicate-data audit, then add web registration UI and Android registration UI. Test duplicate email/phone/username, expired/reused codes, rate limits, concurrent registration, and legacy accounts.
2. **Telegram-like visual system:** document a Skyline design system inspired by Telegram's interaction patterns (spacing, typography, chat list, message bubbles, context menus, settings navigation). Use original Skyline assets and branding. Apply it consistently to web and Android.
3. **Messaging parity:** replies, edits, deletion, forwarding, reactions, pinning, drafts, scheduled messages, saved messages, search, read states and chat actions. Each feature needs API tests and cross-client checks.
4. **Media and voice:** upload/download, image/video/document previews, voice recording/playback/cancel, progress and retry behavior, size/type limits and access controls.
5. **Groups/channels:** owner/admin/member roles, permission checks enforced by the API, invite links, public/private visibility, channel posts/comments, polls and moderation.
6. **Calls and notifications:** audio/video calling, incoming-call lifecycle, push notifications and Android background behavior; do not simulate calls with UI-only controls.
7. **Account and privacy:** active sessions, privacy settings, blocked users, notification controls, chat folders/archive and localization.
8. **Release readiness:** web build/tests, Android CI/APK, real-device tests, two-account integration tests, accessibility, security review, release signing and migration/rollback notes.

## Definition of done

- No credentials, SMS codes or verification tokens are exposed in client logs or API responses.
- Duplicate identity values are rejected at API and database levels.
- Registration, login and session restoration work in both clients against the same backend.
- New features have automated tests and cross-client acceptance checks.
- GitHub Actions results are reported honestly; a successful compile is not treated as proof of live-server functionality.
- Changes are submitted in a reviewable pull request and are not automatically merged into `main`.
