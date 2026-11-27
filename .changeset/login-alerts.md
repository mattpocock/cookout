---
"@ai-hero/cookout": patch
---

Every new session of yours, from approving a CLI Login request or pasting a token on the web, now puts a Login alert in your Inbox: "New login: Firefox on macOS, 203.0.113.7, 10:42" or "New login: cookout CLI on <hostname>, …". It travels with offline alerts in `inbox().alerts`, `inboxHistory().alerts`, `ackAll()` and the `offline-alert` stream event, and is read and cleared like one. The SDK's new `InboxAlert` type is `OfflineAlert | LoginAlert`; a `LoginAlert` has `login` in place of `agent`, with the session's public ID, kind, where, client IP and whether it has `ended`. While the session lives, the web UI's alert has Revoke, which calls `revokeSession(id)`; once it has ended, the alert says so. `cookout inbox` prints them too.
