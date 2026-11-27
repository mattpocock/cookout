---
"@ai-hero/cookout": patch
---

Redeeming a login link now raises a Login alert too, like approving a Login request or pasting a token: "New login from a login link: Firefox on macOS, 203.0.113.7, 10:42", with Revoke while the session lives. Its `login` has `via: "login link"`; a session from anything else has no `via`.
