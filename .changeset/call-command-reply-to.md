---
"@ai-hero/cookout": minor
---

The SDK's `callCommand(name, { channel, data, replyTo })` takes an optional `replyTo` message ID, which makes the Webhook command call a reply in that message's thread; the handler's replies land in that thread.
