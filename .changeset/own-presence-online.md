---
"@ai-hero/cookout": patch
---

A person with the web UI open now shows as Online in their own sidebar. An all-channels stream starts listening for presence changes before it holds its live connection, so it now also sends the `presence` event for its own caller coming online.
