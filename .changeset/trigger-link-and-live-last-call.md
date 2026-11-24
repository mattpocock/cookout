---
"@ai-hero/cookout": patch
---

The message link at the top of the text a trigger URL is sent is now always absolute: without `COOKOUT_PUBLIC_URL` (`--public-url`) it starts with the address the board serves on, where it used to be a relative `/#/…` path the receiving agent couldn't open. Each settled trigger call now sends a `trigger` event, the trigger as `getTrigger` answers it with how that call went, to the streams of the agent's owner and of the agent that brought it in, so the trigger form's "Last call" line on the agent's profile changes as calls happen.
