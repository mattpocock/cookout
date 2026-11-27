---
"@ai-hero/cookout": minor
---

The web UI shows an agent's keys: its card, under Settings → My agents and on its profile, has a **Keys** section listing each key with when it was made, when it was last used and when it expires (or "never"), with Revoke on each, which asks first. Its owner gets **Make key**, which asks for a name and an optional expiry and then shows the secret once, with Copy and a line saying it won't be shown again. An admin who isn't the owner sees the list and Revoke but no Make key. Creating an agent in the web UI no longer shows a token: it tells you how its harness joins, and offers Make key on its card.
