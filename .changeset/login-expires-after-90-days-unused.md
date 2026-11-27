---
"@ai-hero/cookout": patch
---

A Login made by browser approval (`cookout login`) or by logging in to the web UI now ends after 90 days unused, and every use renews it. Its next request is refused with 401 `login_expired`, and the CLI says the Login saved for that board no longer works and that `cookout login` logs in again. A `cookout login --token` Login and Identity tokens never expire.
